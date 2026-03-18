// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

import { describe, expect, it, vi } from "vitest";

import { ingestGmailPushEvent } from "@/features/reservations/services/gmail-alert-ingestion";

function makeWatch() {
  return {
    id: "watch-1",
    userId: "user-1",
    platform: "resy" as const,
    restaurant: "Le Coucou",
    restaurantSlug: "le-coucou",
    partySize: 2,
    dateStart: new Date("2026-03-20T00:00:00.000Z"),
    dateEnd: new Date("2026-03-21T23:59:59.000Z"),
    timeStart: "18:00",
    timeEnd: "21:00",
    idealTime: "19:00",
    hardConstraints: {},
    softConstraints: {},
    autoClaim: true,
    notifySetupUrl: "https://resy.com/cities/ny/le-coucou",
    status: "active",
    lastMatchedAt: null,
    createdAt: new Date("2026-03-17T00:00:00.000Z"),
    updatedAt: new Date("2026-03-17T00:00:00.000Z"),
  };
}

describe("features/reservations/gmail-alert-ingestion", () => {
  it("creates a claim attempt for a new matching alert", async () => {
    const attemptBooking = vi.fn().mockResolvedValue({
      success: true,
      confirmationCode: "ABC123",
    });

    const store = {
      getGmailConnectionByEmail: vi.fn().mockResolvedValue({
        id: "gmail-1",
        userId: "user-1",
        connectionType: "gmail",
        status: "connected",
        provider: "gmail",
        providerAccountEmail: "friend@example.com",
        providerSubject: "google-subject",
        accessTokenCiphertext: "token",
        refreshTokenCiphertext: "refresh",
        tokenExpiresAt: null,
        sessionStateCiphertext: null,
        sessionStatus: null,
        lastVerifiedAt: null,
        expiresHintAt: null,
        historyCursor: "123",
        watchStatus: "active",
        watchExpiryAt: null,
        renewalStatus: "healthy",
        metadataJson: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      upsertConnection: vi.fn(),
      listActiveWatchRequests: vi.fn().mockResolvedValue([makeWatch()]),
      recordAlertReceipt: vi.fn().mockResolvedValue({
        created: true,
        receipt: {
          id: "alert-1",
          userId: "user-1",
          connectionId: "gmail-1",
          provider: "resy",
          gmailMessageId: "msg-1",
          gmailThreadId: "thread-1",
          gmailHistoryId: "456",
          gmailDedupKey: "msg-1",
          logicalAlertKey: "logical-1",
          restaurant: "Le Coucou",
          partySize: 2,
          slotAt: new Date("2026-03-20T19:00:00.000Z"),
          bookingUrl: "https://resy.com/example",
          matchedWatchRequestId: null,
          payloadJson: null,
          createdAt: new Date(),
        },
      }),
      appendEvent: vi.fn(),
      attachAlertToWatch: vi.fn(),
      touchWatchLastMatchedAt: vi.fn(),
      getConnectionByType: vi.fn().mockResolvedValue({
        id: "resy-1",
        userId: "user-1",
        connectionType: "resy",
        status: "connected",
        provider: "resy",
        providerAccountEmail: null,
        providerSubject: null,
        accessTokenCiphertext: null,
        refreshTokenCiphertext: null,
        tokenExpiresAt: null,
        sessionStateCiphertext: "session",
        sessionStatus: "connected",
        lastVerifiedAt: new Date(),
        expiresHintAt: null,
        historyCursor: null,
        watchStatus: "inactive",
        watchExpiryAt: null,
        renewalStatus: "healthy",
        metadataJson: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      createClaimAttempt: vi.fn().mockResolvedValue({
        id: "claim-1",
        watchRequestId: "watch-1",
        alertReceiptId: "alert-1",
        dedupeKey: "watch-1:logical-1",
        status: "queued",
        resultJson: null,
        startedAt: null,
        finishedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      updateBookingAttemptStatus: vi.fn(),
      updateWatchRequestStatus: vi.fn(),
    };

    const gmail = {
      fetchResyNotifyMessages: vi.fn().mockResolvedValue({
        nextHistoryCursor: "789",
        messages: [
          {
            id: "msg-1",
            threadId: "thread-1",
            historyId: "456",
            from: "notify@resy.com",
            subject:
              "A table opened at Le Coucou for 2 on 2026-03-20 at 7:00 PM",
            textBody:
              "Good news. A table opened at Le Coucou for 2 on 2026-03-20 at 7:00 PM. Book now: https://resy.com/example",
            htmlBody: null,
          },
        ],
      }),
    };

    await ingestGmailPushEvent(
      {
        providerAccountEmail: "friend@example.com",
        historyId: "456",
      },
      {
        store: store as never,
        gmail: gmail as never,
        provider: { attemptBooking } as never,
      }
    );

    expect(store.createClaimAttempt).toHaveBeenCalledTimes(1);
    expect(attemptBooking).toHaveBeenCalledTimes(1);
    expect(store.updateWatchRequestStatus).toHaveBeenCalledWith(
      "user-1",
      "watch-1",
      "fulfilled"
    );
  });

  it("skips provider execution for duplicate alerts", async () => {
    const attemptBooking = vi.fn();
    const store = {
      getGmailConnectionByEmail: vi.fn().mockResolvedValue({
        id: "gmail-1",
        userId: "user-1",
        connectionType: "gmail",
        status: "connected",
        provider: "gmail",
        providerAccountEmail: "friend@example.com",
        providerSubject: "google-subject",
        accessTokenCiphertext: "token",
        refreshTokenCiphertext: "refresh",
        tokenExpiresAt: null,
        sessionStateCiphertext: null,
        sessionStatus: null,
        lastVerifiedAt: null,
        expiresHintAt: null,
        historyCursor: "123",
        watchStatus: "active",
        watchExpiryAt: null,
        renewalStatus: "healthy",
        metadataJson: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      upsertConnection: vi.fn(),
      listActiveWatchRequests: vi.fn().mockResolvedValue([makeWatch()]),
      recordAlertReceipt: vi.fn().mockResolvedValue({
        created: false,
        receipt: {
          id: "alert-1",
          userId: "user-1",
          connectionId: "gmail-1",
          provider: "resy",
          gmailMessageId: "msg-1",
          gmailThreadId: "thread-1",
          gmailHistoryId: "456",
          gmailDedupKey: "msg-1",
          logicalAlertKey: "logical-1",
          restaurant: "Le Coucou",
          partySize: 2,
          slotAt: new Date("2026-03-20T19:00:00.000Z"),
          bookingUrl: "https://resy.com/example",
          matchedWatchRequestId: null,
          payloadJson: null,
          createdAt: new Date(),
        },
      }),
      appendEvent: vi.fn(),
    };

    const gmail = {
      fetchResyNotifyMessages: vi.fn().mockResolvedValue({
        nextHistoryCursor: "789",
        messages: [
          {
            id: "msg-1",
            threadId: "thread-1",
            historyId: "456",
            from: "notify@resy.com",
            subject:
              "A table opened at Le Coucou for 2 on 2026-03-20 at 7:00 PM",
            textBody:
              "Good news. A table opened at Le Coucou for 2 on 2026-03-20 at 7:00 PM.",
            htmlBody: null,
          },
        ],
      }),
    };

    await ingestGmailPushEvent(
      {
        providerAccountEmail: "friend@example.com",
        historyId: "456",
      },
      {
        store: store as never,
        gmail: gmail as never,
        provider: { attemptBooking } as never,
      }
    );

    expect(attemptBooking).not.toHaveBeenCalled();
  });
});
