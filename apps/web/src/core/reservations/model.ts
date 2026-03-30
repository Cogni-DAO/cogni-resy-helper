// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@core/reservations/model`
 * Purpose: Reservation assistant domain types.
 * Scope: Pure data types for watches, connections, alerts, activity events, and claim attempts.
 * Side-effects: none
 * @public
 */

export type {
  BookingAttemptStatus,
  GmailRenewalStatus,
  GmailWatchStatus,
  ReservationConnectionStatus,
  ReservationConnectionType,
  ReservationPlatform,
  WatchEventSource,
  WatchEventType,
  WatchRequestStatus,
} from "@cogni/db-schema/reservations";

export interface WatchRequest {
  id: string;
  userId: string;
  platform: "resy";
  restaurant: string;
  restaurantSlug: string | null;
  partySize: number;
  dateStart: Date;
  dateEnd: Date;
  timeStart: string;
  timeEnd: string;
  idealTime: string | null;
  hardConstraints: Record<string, unknown>;
  softConstraints: Record<string, unknown>;
  autoClaim: boolean;
  notifySetupUrl: string | null;
  status: string;
  lastMatchedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReservationConnection {
  id: string;
  userId: string;
  connectionType: "gmail" | "resy";
  status: string;
  provider: string;
  providerAccountEmail: string | null;
  providerSubject: string | null;
  accessTokenCiphertext: string | null;
  refreshTokenCiphertext: string | null;
  tokenExpiresAt: Date | null;
  sessionStateCiphertext: string | null;
  sessionLeaseUntil: Date | null;
  sessionStatus: string | null;
  lastVerifiedAt: Date | null;
  expiresHintAt: Date | null;
  historyCursor: string | null;
  watchStatus: string;
  watchExpiryAt: Date | null;
  renewalStatus: string;
  metadataJson: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReservationAlertReceipt {
  id: string;
  userId: string;
  connectionId: string | null;
  provider: "resy";
  gmailMessageId: string | null;
  gmailThreadId: string | null;
  gmailHistoryId: string | null;
  gmailDedupKey: string;
  logicalAlertKey: string;
  restaurant: string;
  partySize: number;
  slotAt: Date;
  bookingUrl: string | null;
  matchedWatchRequestId: string | null;
  payloadJson: Record<string, unknown> | null;
  createdAt: Date;
}

export interface WatchEvent {
  id: string;
  userId: string;
  watchRequestId: string | null;
  connectionId: string | null;
  alertReceiptId: string | null;
  source: string;
  eventType: string;
  dedupeKey: string | null;
  payloadJson: Record<string, unknown> | null;
  createdAt: Date;
}

export interface BookingAttempt {
  id: string;
  watchRequestId: string;
  alertReceiptId: string;
  dedupeKey: string;
  status: string;
  resultJson: Record<string, unknown> | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReservationAlert {
  restaurant: string;
  normalizedRestaurant: string;
  partySize: number;
  slotAt: Date;
  bookingUrl: string | null;
  subject: string;
  sourceMessageId: string | null;
  rawText: string;
}
