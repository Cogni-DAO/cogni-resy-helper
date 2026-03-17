// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

import {
  buildLogicalAlertKey,
  matchesWatch,
  parseResyNotifyEmail,
} from "@/core";
import type {
  GmailIntegrationPort,
  GmailPushEvent,
  ReservationProviderPort,
  ReservationStorePort,
} from "@/ports";

export interface GmailAlertIngestionDeps {
  store: ReservationStorePort;
  gmail: GmailIntegrationPort;
  provider: ReservationProviderPort;
}

export async function ingestGmailPushEvent(
  push: GmailPushEvent,
  deps: GmailAlertIngestionDeps
) {
  const connection = await deps.store.getGmailConnectionByEmail(
    push.providerAccountEmail
  );
  if (!connection) {
    return { processed: 0 };
  }

  if (!connection.accessTokenCiphertext || !connection.historyCursor) {
    await deps.store.upsertConnection({
      userId: connection.userId,
      connectionType: "gmail",
      status: "reconnect_required",
      provider: "gmail",
      providerAccountEmail: connection.providerAccountEmail,
      providerSubject: connection.providerSubject,
      watchStatus: "error",
      renewalStatus: "reconnect_required",
    });
    await deps.store.appendEvent({
      userId: connection.userId,
      connectionId: connection.id,
      source: "gmail",
      eventType: "reconnect_required",
      payloadJson: { reason: "gmail_credentials_missing" },
    });
    return { processed: 0 };
  }

  const fetched = await deps.gmail.fetchResyNotifyMessages({
    accessTokenCiphertext: connection.accessTokenCiphertext,
    refreshTokenCiphertext: connection.refreshTokenCiphertext,
    historyCursor: connection.historyCursor,
  });

  await deps.store.upsertConnection({
    userId: connection.userId,
    connectionType: "gmail",
    status: "connected",
    provider: "gmail",
    providerAccountEmail: connection.providerAccountEmail,
    providerSubject: connection.providerSubject,
    accessTokenCiphertext: connection.accessTokenCiphertext,
    refreshTokenCiphertext: connection.refreshTokenCiphertext,
    tokenExpiresAt: connection.tokenExpiresAt,
    historyCursor: fetched.nextHistoryCursor,
    watchStatus: connection.watchStatus as
      | "inactive"
      | "active"
      | "expired"
      | "error",
    watchExpiryAt: connection.watchExpiryAt,
    renewalStatus: connection.renewalStatus as
      | "healthy"
      | "due"
      | "expired"
      | "reconnect_required",
  });

  let processed = 0;
  const watches = await deps.store.listActiveWatchRequests(connection.userId);

  for (const message of fetched.messages) {
    if (!message.from?.toLowerCase().includes("resy")) {
      continue;
    }

    const parsed = parseResyNotifyEmail({
      subject: message.subject,
      textBody: message.textBody,
      htmlBody: message.htmlBody,
      sourceMessageId: message.id,
    });

    if (!parsed) {
      continue;
    }

    const logicalAlertKey = buildLogicalAlertKey(parsed);
    const receiptResult = await deps.store.recordAlertReceipt({
      userId: connection.userId,
      connectionId: connection.id,
      gmailMessageId: message.id,
      gmailThreadId: message.threadId,
      gmailHistoryId: push.historyId,
      gmailDedupKey: message.id,
      logicalAlertKey,
      restaurant: parsed.restaurant,
      partySize: parsed.partySize,
      slotAt: parsed.slotAt,
      bookingUrl: parsed.bookingUrl,
      payloadJson: {
        from: message.from,
        subject: parsed.subject,
      },
    });

    await deps.store.appendEvent({
      userId: connection.userId,
      connectionId: connection.id,
      alertReceiptId: receiptResult.receipt.id,
      source: "gmail",
      eventType: receiptResult.created ? "alert_received" : "alert_deduped",
      dedupeKey: logicalAlertKey,
      payloadJson: {
        restaurant: parsed.restaurant,
        slotAt: parsed.slotAt.toISOString(),
      },
    });

    if (!receiptResult.created) {
      continue;
    }

    const matchedWatch = watches.find((watch) => matchesWatch(watch, parsed));
    if (!matchedWatch) {
      await deps.store.appendEvent({
        userId: connection.userId,
        alertReceiptId: receiptResult.receipt.id,
        source: "system",
        eventType: "alert_ignored",
        dedupeKey: logicalAlertKey,
      });
      processed += 1;
      continue;
    }

    await deps.store.attachAlertToWatch(
      receiptResult.receipt.id,
      matchedWatch.id
    );
    await deps.store.touchWatchLastMatchedAt(matchedWatch.id, parsed.slotAt);
    await deps.store.appendEvent({
      userId: connection.userId,
      watchRequestId: matchedWatch.id,
      alertReceiptId: receiptResult.receipt.id,
      source: "system",
      eventType: "alert_matched",
      dedupeKey: logicalAlertKey,
    });

    if (!matchedWatch.autoClaim) {
      processed += 1;
      continue;
    }

    const resyConnection = await deps.store.getConnectionByType(
      connection.userId,
      "resy"
    );

    if (!resyConnection?.sessionStateCiphertext) {
      await deps.store.updateWatchRequestStatus(
        matchedWatch.id,
        "reconnect_required"
      );
      await deps.store.appendEvent({
        userId: connection.userId,
        watchRequestId: matchedWatch.id,
        source: "system",
        eventType: "reconnect_required",
        payloadJson: { reason: "resy_session_missing" },
      });
      processed += 1;
      continue;
    }

    const claimAttempt = await deps.store.createClaimAttempt({
      watchRequestId: matchedWatch.id,
      alertReceiptId: receiptResult.receipt.id,
      dedupeKey: `${matchedWatch.id}:${logicalAlertKey}`,
    });

    if (!claimAttempt) {
      processed += 1;
      continue;
    }

    await deps.store.updateBookingAttemptStatus(claimAttempt.id, "running");
    await deps.store.appendEvent({
      userId: connection.userId,
      watchRequestId: matchedWatch.id,
      alertReceiptId: receiptResult.receipt.id,
      source: "executor",
      eventType: "claim_started",
      dedupeKey: claimAttempt.dedupeKey,
    });

    const booking = await deps.provider.attemptBooking({
      watch: matchedWatch,
      alert: receiptResult.receipt,
      sessionStateCiphertext: resyConnection.sessionStateCiphertext,
    });

    if (booking.success) {
      await deps.store.updateBookingAttemptStatus(
        claimAttempt.id,
        "succeeded",
        {
          confirmationCode: booking.confirmationCode ?? null,
          ...booking.details,
        }
      );
      await deps.store.updateWatchRequestStatus(matchedWatch.id, "fulfilled");
      await deps.store.appendEvent({
        userId: connection.userId,
        watchRequestId: matchedWatch.id,
        alertReceiptId: receiptResult.receipt.id,
        source: "executor",
        eventType: "claim_succeeded",
        dedupeKey: claimAttempt.dedupeKey,
        payloadJson: {
          confirmationCode: booking.confirmationCode ?? null,
        },
      });
    } else {
      const failedStatus = booking.reconnectRequired
        ? "reconnect_required"
        : "failed";
      await deps.store.updateBookingAttemptStatus(
        claimAttempt.id,
        failedStatus,
        {
          error: booking.error ?? null,
          ...booking.details,
        }
      );
      if (booking.reconnectRequired) {
        await deps.store.upsertConnection({
          userId: connection.userId,
          connectionType: "resy",
          status: "reconnect_required",
          provider: "resy",
          providerAccountEmail: resyConnection.providerAccountEmail,
          providerSubject: resyConnection.providerSubject,
          sessionStatus: "reconnect_required",
        });
        await deps.store.updateWatchRequestStatus(
          matchedWatch.id,
          "reconnect_required"
        );
      }
      await deps.store.appendEvent({
        userId: connection.userId,
        watchRequestId: matchedWatch.id,
        alertReceiptId: receiptResult.receipt.id,
        source: "executor",
        eventType: booking.reconnectRequired
          ? "reconnect_required"
          : "claim_failed",
        dedupeKey: claimAttempt.dedupeKey,
        payloadJson: {
          error: booking.error ?? null,
        },
      });
    }

    processed += 1;
  }

  return { processed };
}
