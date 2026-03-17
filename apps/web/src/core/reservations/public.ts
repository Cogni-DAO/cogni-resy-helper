// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@core/reservations/public`
 * Purpose: Public entry point for reservation domain logic.
 * Scope: Re-exports only.
 * Side-effects: none
 * @public
 */

export type {
  BookingAttempt,
  BookingAttemptStatus,
  GmailRenewalStatus,
  GmailWatchStatus,
  ReservationAlert,
  ReservationAlertReceipt,
  ReservationConnection,
  ReservationConnectionStatus,
  ReservationConnectionType,
  ReservationPlatform,
  WatchEvent,
  WatchEventSource,
  WatchEventType,
  WatchRequest,
  WatchRequestStatus,
} from "./model";
export type { ParseResyNotifyEmailInput } from "./parser";
export { parseResyNotifyEmail } from "./parser";
export {
  assertValidDateRange,
  assertValidPartySize,
  assertValidTimeWindow,
  buildLogicalAlertKey,
  InvalidDateRangeError,
  InvalidPartySizeError,
  InvalidStatusTransitionError,
  InvalidTimeWindowError,
  isValidStatusTransition,
  isWatchable,
  matchesWatch,
  normalizeRestaurantName,
  timeStringToMinutes,
} from "./rules";
