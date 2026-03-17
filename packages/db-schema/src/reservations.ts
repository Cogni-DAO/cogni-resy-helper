// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/db-schema/reservations`
 * Purpose: Schema for the reservation assistant MVP.
 * Scope: Defines canonical watches, connection/session state, alert dedupe metadata, activity events, and claim attempts; Does not contain queries or business logic.
 * Invariants:
 * - WATCH_INTENT_CANONICAL: watch_requests is the source of truth for user intent windows
 * - ENCRYPTED_SESSION_STATE: secrets and browser state are stored as ciphertext only
 * - EMAIL_EVENT_DEDUP: reservation_alert_receipts dedupes Gmail deliveries and logical alerts
 * - ONE_ACTIVE_CLAIM_PER_WATCH: booking_attempts enforces at most one queued/running attempt per watch
 * - AUDIT_LOG_APPEND_ONLY: watch_events is append-only activity history
 * Side-effects: none
 * Links: task.0166, docs/spec/reservation-assistant-v1.md
 * @public
 */

import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./refs";

export const RESERVATION_CONNECTION_TYPES = ["gmail", "resy"] as const;
export type ReservationConnectionType =
  (typeof RESERVATION_CONNECTION_TYPES)[number];

export const RESERVATION_CONNECTION_STATUSES = [
  "disconnected",
  "pending",
  "connected",
  "expired",
  "reconnect_required",
  "error",
] as const;
export type ReservationConnectionStatus =
  (typeof RESERVATION_CONNECTION_STATUSES)[number];

export const GMAIL_WATCH_STATUSES = [
  "inactive",
  "active",
  "expired",
  "error",
] as const;
export type GmailWatchStatus = (typeof GMAIL_WATCH_STATUSES)[number];

export const GMAIL_RENEWAL_STATUSES = [
  "healthy",
  "due",
  "expired",
  "reconnect_required",
] as const;
export type GmailRenewalStatus = (typeof GMAIL_RENEWAL_STATUSES)[number];

export const WATCH_REQUEST_STATUSES = [
  "active",
  "paused",
  "fulfilled",
  "cancelled",
  "expired",
  "reconnect_required",
] as const;
export type WatchRequestStatus = (typeof WATCH_REQUEST_STATUSES)[number];

export const WATCH_EVENT_TYPES = [
  "gmail_connected",
  "gmail_watch_renewed",
  "gmail_watch_expired",
  "resy_connected",
  "watch_created",
  "watch_updated",
  "watch_paused",
  "watch_cancelled",
  "alert_received",
  "alert_deduped",
  "alert_matched",
  "alert_ignored",
  "claim_started",
  "claim_succeeded",
  "claim_failed",
  "reconnect_required",
] as const;
export type WatchEventType = (typeof WATCH_EVENT_TYPES)[number];

export const WATCH_EVENT_SOURCES = [
  "system",
  "gmail",
  "resy",
  "executor",
] as const;
export type WatchEventSource = (typeof WATCH_EVENT_SOURCES)[number];

export const BOOKING_ATTEMPT_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "reconnect_required",
  "skipped",
] as const;
export type BookingAttemptStatus = (typeof BOOKING_ATTEMPT_STATUSES)[number];

export const RESERVATION_PLATFORMS = ["resy"] as const;
export type ReservationPlatform = (typeof RESERVATION_PLATFORMS)[number];

export const reservationConnections = pgTable(
  "reservation_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    connectionType: text("connection_type", {
      enum: RESERVATION_CONNECTION_TYPES,
    }).notNull(),
    status: text("status", { enum: RESERVATION_CONNECTION_STATUSES })
      .notNull()
      .default("disconnected"),
    provider: text("provider").notNull(),
    providerAccountEmail: text("provider_account_email"),
    providerSubject: text("provider_subject"),
    accessTokenCiphertext: text("access_token_ciphertext"),
    refreshTokenCiphertext: text("refresh_token_ciphertext"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    sessionStateCiphertext: text("session_state_ciphertext"),
    sessionStatus: text("session_status", {
      enum: RESERVATION_CONNECTION_STATUSES,
    }),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    expiresHintAt: timestamp("expires_hint_at", { withTimezone: true }),
    historyCursor: text("history_cursor"),
    watchStatus: text("watch_status", { enum: GMAIL_WATCH_STATUSES })
      .notNull()
      .default("inactive"),
    watchExpiryAt: timestamp("watch_expiry_at", { withTimezone: true }),
    renewalStatus: text("renewal_status", { enum: GMAIL_RENEWAL_STATUSES })
      .notNull()
      .default("healthy"),
    metadataJson: jsonb("metadata_json")
      .$type<Record<string, unknown> | null>()
      .default(null),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userConnectionUnique: uniqueIndex(
      "reservation_connections_user_type_unique"
    ).on(table.userId, table.connectionType),
    userIdx: index("reservation_connections_user_idx").on(table.userId),
    statusIdx: index("reservation_connections_status_idx").on(table.status),
    watchExpiryIdx: index("reservation_connections_watch_expiry_idx").on(
      table.watchExpiryAt
    ),
  })
).enableRLS();

export const watchRequests = pgTable(
  "watch_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: text("platform", { enum: RESERVATION_PLATFORMS })
      .notNull()
      .default("resy"),
    restaurant: text("restaurant").notNull(),
    restaurantSlug: text("restaurant_slug"),
    partySize: integer("party_size").notNull(),
    dateStart: timestamp("date_start", { withTimezone: true }).notNull(),
    dateEnd: timestamp("date_end", { withTimezone: true }).notNull(),
    timeStart: text("time_start").notNull(),
    timeEnd: text("time_end").notNull(),
    idealTime: text("ideal_time"),
    hardConstraints: jsonb("hard_constraints")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    softConstraints: jsonb("soft_constraints")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    autoClaim: boolean("auto_claim").notNull().default(false),
    notifySetupUrl: text("notify_setup_url"),
    status: text("status", { enum: WATCH_REQUEST_STATUSES })
      .notNull()
      .default("active"),
    lastMatchedAt: timestamp("last_matched_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdx: index("watch_requests_user_idx").on(table.userId),
    statusIdx: index("watch_requests_status_idx").on(table.status),
    userStatusIdx: index("watch_requests_user_status_idx").on(
      table.userId,
      table.status
    ),
  })
).enableRLS();

export const reservationAlertReceipts = pgTable(
  "reservation_alert_receipts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id").references(
      () => reservationConnections.id,
      { onDelete: "set null" }
    ),
    provider: text("provider", { enum: RESERVATION_PLATFORMS })
      .notNull()
      .default("resy"),
    gmailMessageId: text("gmail_message_id"),
    gmailThreadId: text("gmail_thread_id"),
    gmailHistoryId: text("gmail_history_id"),
    gmailDedupKey: text("gmail_dedup_key").notNull(),
    logicalAlertKey: text("logical_alert_key").notNull(),
    restaurant: text("restaurant").notNull(),
    partySize: integer("party_size").notNull(),
    slotAt: timestamp("slot_at", { withTimezone: true }).notNull(),
    bookingUrl: text("booking_url"),
    matchedWatchRequestId: uuid("matched_watch_request_id").references(
      () => watchRequests.id,
      { onDelete: "set null" }
    ),
    payloadJson: jsonb("payload_json")
      .$type<Record<string, unknown> | null>()
      .default(null),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    gmailDedupUnique: uniqueIndex(
      "reservation_alert_receipts_gmail_dedup_unique"
    ).on(table.gmailDedupKey),
    logicalAlertUnique: uniqueIndex(
      "reservation_alert_receipts_logical_alert_unique"
    ).on(table.logicalAlertKey),
    gmailMessageUnique: uniqueIndex(
      "reservation_alert_receipts_gmail_message_unique"
    )
      .on(table.gmailMessageId)
      .where(sql`${table.gmailMessageId} is not null`),
    userCreatedIdx: index("reservation_alert_receipts_user_created_idx").on(
      table.userId,
      table.createdAt
    ),
  })
).enableRLS();

export const watchEvents = pgTable(
  "watch_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    watchRequestId: uuid("watch_request_id").references(
      () => watchRequests.id,
      {
        onDelete: "set null",
      }
    ),
    connectionId: uuid("connection_id").references(
      () => reservationConnections.id,
      { onDelete: "set null" }
    ),
    alertReceiptId: uuid("alert_receipt_id").references(
      () => reservationAlertReceipts.id,
      { onDelete: "set null" }
    ),
    source: text("source", { enum: WATCH_EVENT_SOURCES }).notNull(),
    eventType: text("event_type", { enum: WATCH_EVENT_TYPES }).notNull(),
    dedupeKey: text("dedupe_key"),
    payloadJson: jsonb("payload_json")
      .$type<Record<string, unknown> | null>()
      .default(null),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userCreatedIdx: index("watch_events_user_created_idx").on(
      table.userId,
      table.createdAt
    ),
    watchRequestIdx: index("watch_events_watch_request_idx").on(
      table.watchRequestId
    ),
    eventTypeIdx: index("watch_events_event_type_idx").on(table.eventType),
  })
).enableRLS();

export const bookingAttempts = pgTable(
  "booking_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    watchRequestId: uuid("watch_request_id")
      .notNull()
      .references(() => watchRequests.id, { onDelete: "cascade" }),
    alertReceiptId: uuid("alert_receipt_id")
      .notNull()
      .references(() => reservationAlertReceipts.id, { onDelete: "cascade" }),
    dedupeKey: text("dedupe_key").notNull(),
    status: text("status", { enum: BOOKING_ATTEMPT_STATUSES })
      .notNull()
      .default("queued"),
    resultJson: jsonb("result_json")
      .$type<Record<string, unknown> | null>()
      .default(null),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    dedupeUnique: uniqueIndex("booking_attempts_dedupe_unique").on(
      table.dedupeKey
    ),
    watchActiveUnique: uniqueIndex("booking_attempts_watch_active_unique")
      .on(table.watchRequestId)
      .where(sql`${table.status} in ('queued', 'running')`),
    watchRequestIdx: index("booking_attempts_watch_request_idx").on(
      table.watchRequestId
    ),
    statusIdx: index("booking_attempts_status_idx").on(table.status),
  })
).enableRLS();
