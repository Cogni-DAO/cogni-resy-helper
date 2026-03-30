// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@core/reservations/rules`
 * Purpose: Pure reservation domain rules.
 * Scope: Watch validation, matching, dedupe helpers, and status transitions.
 * Side-effects: none
 * @public
 */

import type { WatchRequestStatus } from "@cogni/db-schema/reservations";

import type { ReservationAlert, WatchRequest } from "./model";

export class InvalidDateRangeError extends Error {
  constructor() {
    super("dateStart must be before or equal to dateEnd");
    this.name = "InvalidDateRangeError";
  }
}

export class InvalidPartySizeError extends Error {
  constructor(value: number) {
    super(`partySize must be a positive integer, got: ${value}`);
    this.name = "InvalidPartySizeError";
  }
}

export class InvalidTimeWindowError extends Error {
  constructor() {
    super("timeStart must be before or equal to timeEnd");
    this.name = "InvalidTimeWindowError";
  }
}

export class InvalidStatusTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Invalid watch status transition: ${from} -> ${to}`);
    this.name = "InvalidStatusTransitionError";
  }
}

const VALID_TRANSITIONS: Record<string, WatchRequestStatus[]> = {
  active: ["paused", "fulfilled", "cancelled", "expired", "reconnect_required"],
  paused: ["active", "cancelled", "reconnect_required"],
  fulfilled: [],
  cancelled: [],
  expired: [],
  reconnect_required: ["active", "paused", "cancelled"],
};

export function isValidStatusTransition(
  from: WatchRequestStatus,
  to: WatchRequestStatus
): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertValidDateRange(start: Date, end: Date): void {
  if (start > end) {
    throw new InvalidDateRangeError();
  }
}

export function assertValidPartySize(size: number): void {
  if (!Number.isInteger(size) || size < 1) {
    throw new InvalidPartySizeError(size);
  }
}

export function timeStringToMinutes(value: string): number {
  const [hours = 0, minutes = 0] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function assertValidTimeWindow(start: string, end: string): void {
  if (timeStringToMinutes(start) > timeStringToMinutes(end)) {
    throw new InvalidTimeWindowError();
  }
}

export function normalizeRestaurantName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, " ");
}

export function buildLogicalAlertKey(alert: ReservationAlert): string {
  return [
    alert.normalizedRestaurant,
    alert.partySize,
    alert.slotAt.toISOString(),
    alert.bookingUrl ?? "",
  ].join("|");
}

export function isWatchable(status: WatchRequestStatus): boolean {
  return status === "active";
}

export function matchesWatch(
  watch: Pick<
    WatchRequest,
    | "restaurant"
    | "restaurantSlug"
    | "partySize"
    | "dateStart"
    | "dateEnd"
    | "timeStart"
    | "timeEnd"
    | "status"
  >,
  alert: ReservationAlert
): boolean {
  if (watch.status !== "active") {
    return false;
  }

  if (watch.partySize !== alert.partySize) {
    return false;
  }

  const watchRestaurant = normalizeRestaurantName(watch.restaurant);
  const watchSlug = watch.restaurantSlug
    ? normalizeRestaurantName(watch.restaurantSlug)
    : null;

  if (
    alert.normalizedRestaurant !== watchRestaurant &&
    alert.normalizedRestaurant !== watchSlug
  ) {
    return false;
  }

  if (alert.slotAt < watch.dateStart || alert.slotAt > watch.dateEnd) {
    return false;
  }

  const slotMinutes = alert.slotAt.getHours() * 60 + alert.slotAt.getMinutes();
  return (
    slotMinutes >= timeStringToMinutes(watch.timeStart) &&
    slotMinutes <= timeStringToMinutes(watch.timeEnd)
  );
}
