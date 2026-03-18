// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

import {
  assertValidDateRange,
  assertValidPartySize,
  assertValidTimeWindow,
  InvalidDateRangeError,
  InvalidPartySizeError,
  InvalidStatusTransitionError,
  InvalidTimeWindowError,
  isValidStatusTransition,
  type WatchRequestStatus,
} from "@/core";
import {
  type ReservationProviderPort,
  type ReservationStorePort,
  WatchRequestAccessDeniedError,
  WatchRequestNotFoundError,
} from "@/ports";

export interface WatchManagerDeps {
  store: ReservationStorePort;
  provider: ReservationProviderPort;
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function normalizeWatchBoundary(
  value: string,
  boundary: "start" | "end"
): Date {
  if (DATE_ONLY_PATTERN.test(value)) {
    return new Date(
      `${value}T${boundary === "start" ? "00:00:00.000" : "23:59:59.999"}Z`
    );
  }

  return new Date(value);
}

export async function createWatch(
  userId: string,
  input: {
    restaurant: string;
    restaurantSlug?: string | undefined;
    partySize: number;
    dateStart: string;
    dateEnd: string;
    timeStart: string;
    timeEnd: string;
    idealTime?: string | undefined;
    hardConstraints?: Record<string, unknown> | undefined;
    softConstraints?: Record<string, unknown> | undefined;
    autoClaim: boolean;
  },
  deps: WatchManagerDeps
) {
  const dateStart = normalizeWatchBoundary(input.dateStart, "start");
  const dateEnd = normalizeWatchBoundary(input.dateEnd, "end");

  if (Number.isNaN(dateStart.getTime()) || Number.isNaN(dateEnd.getTime())) {
    throw new InvalidDateRangeError();
  }

  assertValidDateRange(dateStart, dateEnd);
  assertValidPartySize(input.partySize);
  assertValidTimeWindow(input.timeStart, input.timeEnd);

  const notifySetup = deps.provider.buildNotifySetup({
    id: "",
    userId,
    platform: "resy",
    restaurant: input.restaurant,
    restaurantSlug: input.restaurantSlug ?? null,
    partySize: input.partySize,
    dateStart,
    dateEnd,
    timeStart: input.timeStart,
    timeEnd: input.timeEnd,
    idealTime: input.idealTime ?? null,
    hardConstraints: input.hardConstraints ?? {},
    softConstraints: input.softConstraints ?? {},
    autoClaim: input.autoClaim,
    notifySetupUrl: null,
    status: "active",
    lastMatchedAt: null,
    createdAt: dateStart,
    updatedAt: dateStart,
  });

  const watch = await deps.store.createWatchRequest({
    userId,
    restaurant: input.restaurant,
    restaurantSlug: input.restaurantSlug,
    partySize: input.partySize,
    dateStart,
    dateEnd,
    timeStart: input.timeStart,
    timeEnd: input.timeEnd,
    idealTime: input.idealTime,
    hardConstraints: input.hardConstraints,
    softConstraints: input.softConstraints,
    autoClaim: input.autoClaim,
    notifySetupUrl: notifySetup.setupUrl,
  });

  await deps.store.appendEvent({
    userId,
    watchRequestId: watch.id,
    source: "system",
    eventType: "watch_created",
    payloadJson: {
      restaurant: watch.restaurant,
      autoClaim: watch.autoClaim,
      notifySetupUrl: watch.notifySetupUrl,
    },
  });

  return watch;
}

export async function updateWatchStatus(
  userId: string,
  watchId: string,
  newStatus: WatchRequestStatus,
  deps: WatchManagerDeps
) {
  const watch = await deps.store.getWatchRequest(watchId);
  if (!watch) {
    throw new WatchRequestNotFoundError(watchId);
  }

  if (watch.userId !== userId) {
    throw new WatchRequestAccessDeniedError(watchId);
  }

  if (!isValidStatusTransition(watch.status as WatchRequestStatus, newStatus)) {
    throw new InvalidStatusTransitionError(watch.status, newStatus);
  }

  const updated = await deps.store.updateWatchRequestStatus(
    userId,
    watchId,
    newStatus
  );
  await deps.store.appendEvent({
    userId,
    watchRequestId: watchId,
    source: "system",
    eventType:
      newStatus === "paused"
        ? "watch_paused"
        : newStatus === "cancelled"
          ? "watch_cancelled"
          : "watch_updated",
    payloadJson: { status: newStatus },
  });

  return updated;
}

export function listWatches(userId: string, deps: WatchManagerDeps) {
  return deps.store.listWatchRequests(userId);
}

export function listActivity(
  userId: string,
  watchId: string | undefined,
  deps: WatchManagerDeps
) {
  return deps.store.listEvents(userId, watchId);
}

export function isWatchManagerInputError(
  error: unknown
): error is
  | InvalidDateRangeError
  | InvalidPartySizeError
  | InvalidTimeWindowError
  | InvalidStatusTransitionError
  | WatchRequestNotFoundError
  | WatchRequestAccessDeniedError {
  return (
    error instanceof InvalidDateRangeError ||
    error instanceof InvalidPartySizeError ||
    error instanceof InvalidTimeWindowError ||
    error instanceof InvalidStatusTransitionError ||
    error instanceof WatchRequestNotFoundError ||
    error instanceof WatchRequestAccessDeniedError
  );
}
