// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@ports/reservation.port`
 * Purpose: Ports for the reservation assistant feature.
 * Scope: Interfaces only.
 * Side-effects: none
 * @public
 */

import type {
  BookingAttempt,
  BookingAttemptStatus,
  ReservationAlertReceipt,
  ReservationConnection,
  WatchEvent,
  WatchEventSource,
  WatchEventType,
  WatchRequest,
  WatchRequestStatus,
} from "@/core";

export type {
  BookingAttempt,
  BookingAttemptStatus,
  ReservationAlertReceipt,
  ReservationConnection,
  ReservationConnectionStatus,
  WatchEvent,
  WatchEventSource,
  WatchEventType,
  WatchRequest,
  WatchRequestStatus,
} from "@/core";

export class WatchRequestNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Watch request not found: ${id}`);
    this.name = "WatchRequestNotFoundError";
  }
}

export class WatchRequestAccessDeniedError extends Error {
  constructor(public readonly id: string) {
    super(`Watch request does not belong to the current user: ${id}`);
    this.name = "WatchRequestAccessDeniedError";
  }
}

export interface CreateWatchRequestParams {
  userId: string;
  restaurant: string;
  restaurantSlug?: string | undefined;
  partySize: number;
  dateStart: Date;
  dateEnd: Date;
  timeStart: string;
  timeEnd: string;
  idealTime?: string | undefined;
  hardConstraints?: Record<string, unknown> | undefined;
  softConstraints?: Record<string, unknown> | undefined;
  autoClaim: boolean;
  notifySetupUrl?: string | undefined;
}

export interface UpsertReservationConnectionParams {
  userId: string;
  connectionType: "gmail" | "resy";
  status:
    | "disconnected"
    | "pending"
    | "connected"
    | "expired"
    | "reconnect_required"
    | "error";
  provider: string;
  providerAccountEmail?: string | null | undefined;
  providerSubject?: string | null | undefined;
  accessTokenCiphertext?: string | null | undefined;
  refreshTokenCiphertext?: string | null | undefined;
  tokenExpiresAt?: Date | null | undefined;
  sessionStateCiphertext?: string | null | undefined;
  sessionStatus?:
    | "disconnected"
    | "pending"
    | "connected"
    | "expired"
    | "reconnect_required"
    | "error"
    | null
    | undefined;
  lastVerifiedAt?: Date | null | undefined;
  expiresHintAt?: Date | null | undefined;
  historyCursor?: string | null | undefined;
  watchStatus?: "inactive" | "active" | "expired" | "error" | undefined;
  watchExpiryAt?: Date | null | undefined;
  renewalStatus?:
    | "healthy"
    | "due"
    | "expired"
    | "reconnect_required"
    | undefined;
  metadataJson?: Record<string, unknown> | null | undefined;
}

export interface AppendReservationEventParams {
  userId: string;
  watchRequestId?: string | null | undefined;
  connectionId?: string | null | undefined;
  alertReceiptId?: string | null | undefined;
  source: WatchEventSource;
  eventType: WatchEventType;
  dedupeKey?: string | null | undefined;
  payloadJson?: Record<string, unknown> | null | undefined;
}

export interface RecordAlertReceiptParams {
  userId: string;
  connectionId?: string | null | undefined;
  gmailMessageId?: string | null | undefined;
  gmailThreadId?: string | null | undefined;
  gmailHistoryId?: string | null | undefined;
  gmailDedupKey: string;
  logicalAlertKey: string;
  restaurant: string;
  partySize: number;
  slotAt: Date;
  bookingUrl?: string | null | undefined;
  payloadJson?: Record<string, unknown> | null | undefined;
}

export interface CreateClaimAttemptParams {
  watchRequestId: string;
  alertReceiptId: string;
  dedupeKey: string;
}

export interface ReservationStorePort {
  listConnections(userId: string): Promise<ReservationConnection[]>;
  getConnectionByType(
    userId: string,
    connectionType: "gmail" | "resy"
  ): Promise<ReservationConnection | null>;
  getGmailConnectionByEmail(
    providerAccountEmail: string
  ): Promise<ReservationConnection | null>;
  upsertConnection(
    params: UpsertReservationConnectionParams
  ): Promise<ReservationConnection>;

  createWatchRequest(params: CreateWatchRequestParams): Promise<WatchRequest>;
  getWatchRequest(id: string): Promise<WatchRequest | null>;
  listWatchRequests(userId: string): Promise<WatchRequest[]>;
  listActiveWatchRequests(userId: string): Promise<WatchRequest[]>;
  updateWatchRequestStatus(
    userId: string,
    id: string,
    status: WatchRequestStatus
  ): Promise<WatchRequest>;
  touchWatchLastMatchedAt(id: string, matchedAt: Date): Promise<void>;

  appendEvent(params: AppendReservationEventParams): Promise<WatchEvent>;
  listEvents(userId: string, watchId?: string): Promise<WatchEvent[]>;

  recordAlertReceipt(params: RecordAlertReceiptParams): Promise<{
    created: boolean;
    receipt: ReservationAlertReceipt;
  }>;
  attachAlertToWatch(
    alertReceiptId: string,
    watchRequestId: string
  ): Promise<void>;

  createClaimAttempt(
    params: CreateClaimAttemptParams
  ): Promise<BookingAttempt | null>;
  updateBookingAttemptStatus(
    id: string,
    status: BookingAttemptStatus,
    resultJson?: Record<string, unknown> | null | undefined
  ): Promise<BookingAttempt>;
  listBookingAttempts(watchRequestId: string): Promise<BookingAttempt[]>;
}

export interface GmailMessagePayload {
  id: string;
  threadId: string | null;
  historyId: string | null;
  from: string | null;
  subject: string;
  textBody: string;
  htmlBody: string | null;
}

export interface GmailConnectResult {
  providerAccountEmail: string;
  providerSubject: string;
  accessTokenCiphertext: string;
  refreshTokenCiphertext: string | null;
  tokenExpiresAt: Date | null;
  historyCursor: string;
  watchExpiryAt: Date | null;
  watchStatus: "active" | "inactive" | "expired" | "error";
  renewalStatus: "healthy" | "due" | "expired" | "reconnect_required";
}

export interface GmailWatchRenewalResult {
  historyCursor: string;
  watchExpiryAt: Date | null;
  watchStatus: "active" | "inactive" | "expired" | "error";
  renewalStatus: "healthy" | "due" | "expired" | "reconnect_required";
}

export interface GmailPushEvent {
  providerAccountEmail: string;
  historyId: string;
}

export interface GmailIntegrationPort {
  createAuthorizationUrl(params: {
    userId: string;
    redirectUri: string;
  }): string;
  exchangeAuthorizationCode(params: {
    code: string;
    redirectUri: string;
  }): Promise<GmailConnectResult>;
  renewWatch(params: {
    refreshTokenCiphertext: string;
  }): Promise<GmailWatchRenewalResult>;
  fetchResyNotifyMessages(params: {
    accessTokenCiphertext: string;
    refreshTokenCiphertext?: string | null | undefined;
    historyCursor: string;
  }): Promise<{
    nextHistoryCursor: string;
    messages: GmailMessagePayload[];
  }>;
}

export interface AlertSetupResult {
  setupUrl: string;
}

export interface BookingAssistParams {
  watch: WatchRequest;
  alert: ReservationAlertReceipt;
  sessionStateCiphertext: string;
}

export interface BookingAssistResult {
  success: boolean;
  reconnectRequired?: boolean | undefined;
  confirmationCode?: string | undefined;
  error?: string | undefined;
  details?: Record<string, unknown> | undefined;
}

export interface SessionCaptureResult {
  providerAccountEmail?: string | null | undefined;
  sessionStateCiphertext: string;
  sessionStatus: "connected" | "expired" | "reconnect_required" | "error";
  lastVerifiedAt: Date | null;
  expiresHintAt: Date | null;
}

export interface ReservationProviderPort {
  readonly platformId: "resy";
  buildNotifySetup(watch: WatchRequest): AlertSetupResult;
  captureSession(params?: {
    startUrl?: string | undefined;
  }): Promise<SessionCaptureResult>;
  attemptBooking(params: BookingAssistParams): Promise<BookingAssistResult>;
}
