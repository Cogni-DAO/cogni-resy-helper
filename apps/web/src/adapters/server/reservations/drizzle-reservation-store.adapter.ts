// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/reservations/drizzle-reservation-store`
 * Purpose: Drizzle-backed persistence for the reservation assistant.
 * Scope: Database reads and writes only.
 * Side-effects: IO
 * @public
 */

import type {
  BookingAttemptStatus,
  ReservationConnectionStatus,
  WatchRequestStatus,
} from "@cogni/db-schema/reservations";
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";

import type { Database } from "@/adapters/server/db/client";
import type {
  AppendReservationEventParams,
  BookingAttempt,
  CreateClaimAttemptParams,
  CreateWatchRequestParams,
  RecordAlertReceiptParams,
  ReservationAlertReceipt,
  ReservationConnection,
  ReservationStorePort,
  UpsertReservationConnectionParams,
  WatchEvent,
  WatchRequest,
} from "@/ports";
import {
  bookingAttempts,
  reservationAlertReceipts,
  reservationConnections,
  watchEvents,
  watchRequests,
} from "@/shared/db/schema";

type ReservationConnectionRow = typeof reservationConnections.$inferSelect;
type WatchRequestRow = typeof watchRequests.$inferSelect;
type WatchEventRow = typeof watchEvents.$inferSelect;
type ReservationAlertReceiptRow = typeof reservationAlertReceipts.$inferSelect;
type BookingAttemptRow = typeof bookingAttempts.$inferSelect;

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

function mapConnection(row: ReservationConnectionRow): ReservationConnection {
  return {
    id: row.id,
    userId: row.userId,
    connectionType: row.connectionType,
    status: row.status,
    provider: row.provider,
    providerAccountEmail: row.providerAccountEmail,
    providerSubject: row.providerSubject,
    accessTokenCiphertext: row.accessTokenCiphertext,
    refreshTokenCiphertext: row.refreshTokenCiphertext,
    tokenExpiresAt: row.tokenExpiresAt,
    sessionStateCiphertext: row.sessionStateCiphertext,
    sessionLeaseUntil: row.sessionLeaseUntil,
    sessionStatus: row.sessionStatus,
    lastVerifiedAt: row.lastVerifiedAt,
    expiresHintAt: row.expiresHintAt,
    historyCursor: row.historyCursor,
    watchStatus: row.watchStatus,
    watchExpiryAt: row.watchExpiryAt,
    renewalStatus: row.renewalStatus,
    metadataJson: row.metadataJson,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapWatchRequest(row: WatchRequestRow): WatchRequest {
  return {
    id: row.id,
    userId: row.userId,
    platform: row.platform,
    restaurant: row.restaurant,
    restaurantSlug: row.restaurantSlug,
    partySize: row.partySize,
    dateStart: row.dateStart,
    dateEnd: row.dateEnd,
    timeStart: row.timeStart,
    timeEnd: row.timeEnd,
    idealTime: row.idealTime,
    hardConstraints: row.hardConstraints,
    softConstraints: row.softConstraints,
    autoClaim: row.autoClaim,
    notifySetupUrl: row.notifySetupUrl,
    status: row.status,
    lastMatchedAt: row.lastMatchedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapWatchEvent(row: WatchEventRow): WatchEvent {
  return {
    id: row.id,
    userId: row.userId,
    watchRequestId: row.watchRequestId,
    connectionId: row.connectionId,
    alertReceiptId: row.alertReceiptId,
    source: row.source,
    eventType: row.eventType,
    dedupeKey: row.dedupeKey,
    payloadJson: row.payloadJson,
    createdAt: row.createdAt,
  };
}

function mapAlertReceipt(
  row: ReservationAlertReceiptRow
): ReservationAlertReceipt {
  return {
    id: row.id,
    userId: row.userId,
    connectionId: row.connectionId,
    provider: row.provider,
    gmailMessageId: row.gmailMessageId,
    gmailThreadId: row.gmailThreadId,
    gmailHistoryId: row.gmailHistoryId,
    gmailDedupKey: row.gmailDedupKey,
    logicalAlertKey: row.logicalAlertKey,
    restaurant: row.restaurant,
    partySize: row.partySize,
    slotAt: row.slotAt,
    bookingUrl: row.bookingUrl,
    matchedWatchRequestId: row.matchedWatchRequestId,
    payloadJson: row.payloadJson,
    createdAt: row.createdAt,
  };
}

function mapBookingAttempt(row: BookingAttemptRow): BookingAttempt {
  return {
    id: row.id,
    watchRequestId: row.watchRequestId,
    alertReceiptId: row.alertReceiptId,
    dedupeKey: row.dedupeKey,
    status: row.status,
    resultJson: row.resultJson,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function requireRow<T>(row: T | undefined, operation: string): T {
  if (!row) {
    throw new Error(
      `Reservation store operation returned no rows: ${operation}`
    );
  }

  return row;
}

export class DrizzleReservationStoreAdapter implements ReservationStorePort {
  constructor(private readonly db: Database) {}

  async listConnections(userId: string): Promise<ReservationConnection[]> {
    const rows = await this.db
      .select()
      .from(reservationConnections)
      .where(eq(reservationConnections.userId, userId))
      .orderBy(reservationConnections.connectionType);

    return rows.map(mapConnection);
  }

  async getConnectionByType(
    userId: string,
    connectionType: "gmail" | "resy"
  ): Promise<ReservationConnection | null> {
    const rows = await this.db
      .select()
      .from(reservationConnections)
      .where(
        and(
          eq(reservationConnections.userId, userId),
          eq(reservationConnections.connectionType, connectionType)
        )
      )
      .limit(1);

    return rows[0] ? mapConnection(rows[0]) : null;
  }

  async getGmailConnectionByEmail(
    providerAccountEmail: string
  ): Promise<ReservationConnection | null> {
    const rows = await this.db
      .select()
      .from(reservationConnections)
      .where(
        and(
          eq(reservationConnections.connectionType, "gmail"),
          eq(reservationConnections.providerAccountEmail, providerAccountEmail)
        )
      )
      .limit(1);

    return rows[0] ? mapConnection(rows[0]) : null;
  }

  async upsertConnection(
    params: UpsertReservationConnectionParams
  ): Promise<ReservationConnection> {
    const [row] = await this.db
      .insert(reservationConnections)
      .values({
        userId: params.userId,
        connectionType: params.connectionType,
        status: params.status as ReservationConnectionStatus,
        provider: params.provider,
        providerAccountEmail: params.providerAccountEmail ?? null,
        providerSubject: params.providerSubject ?? null,
        accessTokenCiphertext: params.accessTokenCiphertext ?? null,
        refreshTokenCiphertext: params.refreshTokenCiphertext ?? null,
        tokenExpiresAt: params.tokenExpiresAt ?? null,
        sessionStateCiphertext: params.sessionStateCiphertext ?? null,
        sessionStatus:
          (params.sessionStatus as ReservationConnectionStatus | null) ?? null,
        lastVerifiedAt: params.lastVerifiedAt ?? null,
        expiresHintAt: params.expiresHintAt ?? null,
        historyCursor: params.historyCursor ?? null,
        watchStatus: params.watchStatus ?? "inactive",
        watchExpiryAt: params.watchExpiryAt ?? null,
        renewalStatus: params.renewalStatus ?? "healthy",
        metadataJson: params.metadataJson ?? null,
      })
      .onConflictDoUpdate({
        target: [
          reservationConnections.userId,
          reservationConnections.connectionType,
        ],
        set: {
          status: params.status as ReservationConnectionStatus,
          provider: params.provider,
          providerAccountEmail: params.providerAccountEmail ?? null,
          providerSubject: params.providerSubject ?? null,
          accessTokenCiphertext: params.accessTokenCiphertext ?? null,
          refreshTokenCiphertext: params.refreshTokenCiphertext ?? null,
          tokenExpiresAt: params.tokenExpiresAt ?? null,
          sessionStateCiphertext: params.sessionStateCiphertext ?? null,
          sessionStatus:
            (params.sessionStatus as ReservationConnectionStatus | null) ??
            null,
          lastVerifiedAt: params.lastVerifiedAt ?? null,
          expiresHintAt: params.expiresHintAt ?? null,
          historyCursor: params.historyCursor ?? null,
          watchStatus: params.watchStatus ?? "inactive",
          watchExpiryAt: params.watchExpiryAt ?? null,
          renewalStatus: params.renewalStatus ?? "healthy",
          metadataJson: params.metadataJson ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();

    return mapConnection(requireRow(row, "upsertConnection"));
  }

  async acquireSessionLease(
    connectionId: string,
    durationMinutes: number
  ): Promise<ReservationConnection | null> {
    const leaseUntil = sql`now() + make_interval(mins => ${durationMinutes})`;
    const [row] = await this.db
      .update(reservationConnections)
      .set({
        sessionLeaseUntil: leaseUntil,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(reservationConnections.id, connectionId),
          or(
            isNull(reservationConnections.sessionLeaseUntil),
            lt(reservationConnections.sessionLeaseUntil, sql`now()`)
          )
        )
      )
      .returning();
    return row ? mapConnection(row) : null;
  }

  async clearSessionLease(connectionId: string): Promise<void> {
    await this.db
      .update(reservationConnections)
      .set({
        sessionLeaseUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(reservationConnections.id, connectionId));
  }

  async createWatchRequest(
    params: CreateWatchRequestParams
  ): Promise<WatchRequest> {
    const [row] = await this.db
      .insert(watchRequests)
      .values({
        userId: params.userId,
        platform: "resy",
        restaurant: params.restaurant,
        restaurantSlug: params.restaurantSlug ?? null,
        partySize: params.partySize,
        dateStart: params.dateStart,
        dateEnd: params.dateEnd,
        timeStart: params.timeStart,
        timeEnd: params.timeEnd,
        idealTime: params.idealTime ?? null,
        hardConstraints: params.hardConstraints ?? {},
        softConstraints: params.softConstraints ?? {},
        autoClaim: params.autoClaim,
        notifySetupUrl: params.notifySetupUrl ?? null,
      })
      .returning();

    return mapWatchRequest(requireRow(row, "createWatchRequest"));
  }

  async getWatchRequest(id: string): Promise<WatchRequest | null> {
    const rows = await this.db
      .select()
      .from(watchRequests)
      .where(eq(watchRequests.id, id))
      .limit(1);

    return rows[0] ? mapWatchRequest(rows[0]) : null;
  }

  async listWatchRequests(userId: string): Promise<WatchRequest[]> {
    const rows = await this.db
      .select()
      .from(watchRequests)
      .where(eq(watchRequests.userId, userId))
      .orderBy(desc(watchRequests.createdAt));

    return rows.map(mapWatchRequest);
  }

  async listActiveWatchRequests(userId: string): Promise<WatchRequest[]> {
    const rows = await this.db
      .select()
      .from(watchRequests)
      .where(
        and(
          eq(watchRequests.userId, userId),
          eq(watchRequests.status, "active")
        )
      )
      .orderBy(desc(watchRequests.createdAt));

    return rows.map(mapWatchRequest);
  }

  async updateWatchRequestStatus(
    userId: string,
    id: string,
    status: WatchRequestStatus
  ): Promise<WatchRequest> {
    const [row] = await this.db
      .update(watchRequests)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(watchRequests.userId, userId), eq(watchRequests.id, id)))
      .returning();

    return mapWatchRequest(requireRow(row, "updateWatchRequestStatus"));
  }

  async touchWatchLastMatchedAt(id: string, matchedAt: Date): Promise<void> {
    await this.db
      .update(watchRequests)
      .set({ lastMatchedAt: matchedAt, updatedAt: new Date() })
      .where(eq(watchRequests.id, id));
  }

  async appendEvent(params: AppendReservationEventParams): Promise<WatchEvent> {
    const [row] = await this.db
      .insert(watchEvents)
      .values({
        userId: params.userId,
        watchRequestId: params.watchRequestId ?? null,
        connectionId: params.connectionId ?? null,
        alertReceiptId: params.alertReceiptId ?? null,
        source: params.source,
        eventType: params.eventType,
        dedupeKey: params.dedupeKey ?? null,
        payloadJson: params.payloadJson ?? null,
      })
      .returning();

    return mapWatchEvent(requireRow(row, "appendEvent"));
  }

  async listEvents(userId: string, watchId?: string): Promise<WatchEvent[]> {
    const rows = watchId
      ? await this.db
          .select()
          .from(watchEvents)
          .where(
            and(
              eq(watchEvents.userId, userId),
              eq(watchEvents.watchRequestId, watchId)
            )
          )
          .orderBy(desc(watchEvents.createdAt))
      : await this.db
          .select()
          .from(watchEvents)
          .where(eq(watchEvents.userId, userId))
          .orderBy(desc(watchEvents.createdAt));

    return rows.map(mapWatchEvent);
  }

  async recordAlertReceipt(params: RecordAlertReceiptParams): Promise<{
    created: boolean;
    receipt: ReservationAlertReceipt;
  }> {
    try {
      const [row] = await this.db
        .insert(reservationAlertReceipts)
        .values({
          userId: params.userId,
          connectionId: params.connectionId ?? null,
          gmailMessageId: params.gmailMessageId ?? null,
          gmailThreadId: params.gmailThreadId ?? null,
          gmailHistoryId: params.gmailHistoryId ?? null,
          gmailDedupKey: params.gmailDedupKey,
          logicalAlertKey: params.logicalAlertKey,
          restaurant: params.restaurant,
          partySize: params.partySize,
          slotAt: params.slotAt,
          bookingUrl: params.bookingUrl ?? null,
          payloadJson: params.payloadJson ?? null,
        })
        .returning();

      return {
        created: true,
        receipt: mapAlertReceipt(requireRow(row, "recordAlertReceipt.insert")),
      };
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }

      const rows = await this.db
        .select()
        .from(reservationAlertReceipts)
        .where(
          and(
            eq(reservationAlertReceipts.userId, params.userId),
            or(
              eq(
                reservationAlertReceipts.logicalAlertKey,
                params.logicalAlertKey
              ),
              eq(reservationAlertReceipts.gmailDedupKey, params.gmailDedupKey),
              params.gmailMessageId
                ? eq(
                    reservationAlertReceipts.gmailMessageId,
                    params.gmailMessageId
                  )
                : undefined
            )
          )
        )
        .limit(1);

      return {
        created: false,
        receipt: mapAlertReceipt(
          requireRow(rows[0], "recordAlertReceipt.selectExisting")
        ),
      };
    }
  }

  async attachAlertToWatch(
    alertReceiptId: string,
    watchRequestId: string
  ): Promise<void> {
    await this.db
      .update(reservationAlertReceipts)
      .set({ matchedWatchRequestId: watchRequestId })
      .where(eq(reservationAlertReceipts.id, alertReceiptId));
  }

  async createClaimAttempt(
    params: CreateClaimAttemptParams
  ): Promise<BookingAttempt | null> {
    try {
      const [row] = await this.db
        .insert(bookingAttempts)
        .values({
          watchRequestId: params.watchRequestId,
          alertReceiptId: params.alertReceiptId,
          dedupeKey: params.dedupeKey,
        })
        .returning();

      return mapBookingAttempt(requireRow(row, "createClaimAttempt"));
    } catch (error) {
      if (isUniqueViolation(error)) {
        return null;
      }
      throw error;
    }
  }

  async updateBookingAttemptStatus(
    id: string,
    status: BookingAttemptStatus,
    resultJson?: Record<string, unknown> | null | undefined
  ): Promise<BookingAttempt> {
    const now = new Date();
    const [row] = await this.db
      .update(bookingAttempts)
      .set({
        status,
        resultJson: resultJson ?? null,
        startedAt: status === "running" ? now : undefined,
        finishedAt:
          status === "succeeded" ||
          status === "failed" ||
          status === "reconnect_required" ||
          status === "skipped"
            ? now
            : undefined,
        updatedAt: now,
      })
      .where(eq(bookingAttempts.id, id))
      .returning();

    return mapBookingAttempt(requireRow(row, "updateBookingAttemptStatus"));
  }

  async listBookingAttempts(watchRequestId: string): Promise<BookingAttempt[]> {
    const rows = await this.db
      .select()
      .from(bookingAttempts)
      .where(eq(bookingAttempts.watchRequestId, watchRequestId))
      .orderBy(desc(bookingAttempts.createdAt));

    return rows.map(mapBookingAttempt);
  }
}
