// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

import { NextResponse } from "next/server";

import { getSessionUser } from "@/app/_lib/auth/session";
import { getContainer } from "@/bootstrap/container";
import { wrapRouteHandlerWithLogging } from "@/bootstrap/http";
import { watchStatusUpdateOperation } from "@/contracts/reservations.watch.v1.contract";
import {
  isWatchManagerInputError,
  updateWatchStatus,
} from "@/features/reservations/services/watch-manager";
import {
  WatchRequestAccessDeniedError,
  WatchRequestNotFoundError,
} from "@/ports";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function toWireFormat(watch: Awaited<ReturnType<typeof updateWatchStatus>>) {
  return {
    id: watch.id,
    userId: watch.userId,
    platform: watch.platform,
    restaurant: watch.restaurant,
    restaurantSlug: watch.restaurantSlug,
    partySize: watch.partySize,
    dateStart: watch.dateStart.toISOString(),
    dateEnd: watch.dateEnd.toISOString(),
    timeStart: watch.timeStart,
    timeEnd: watch.timeEnd,
    idealTime: watch.idealTime,
    hardConstraints: watch.hardConstraints,
    softConstraints: watch.softConstraints,
    autoClaim: watch.autoClaim,
    notifySetupUrl: watch.notifySetupUrl,
    status: watch.status,
    lastMatchedAt: watch.lastMatchedAt?.toISOString() ?? null,
    createdAt: watch.createdAt.toISOString(),
    updatedAt: watch.updatedAt.toISOString(),
  };
}

export const PATCH = wrapRouteHandlerWithLogging<{
  params: Promise<{ id: string }>;
}>(
  {
    routeId: "reservations.watches.update-status",
    auth: { mode: "required", getSessionUser },
  },
  async (_ctx, request, sessionUser, context) => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = watchStatusUpdateOperation.input.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid watch status payload" },
        { status: 400 }
      );
    }
    if (!sessionUser) {
      throw new Error("sessionUser required");
    }

    if (!context) {
      throw new Error("context required");
    }

    const { id } = await context.params;
    const container = getContainer();
    try {
      const watch = await updateWatchStatus(
        sessionUser.id,
        id,
        parsed.data.status,
        {
          store: container.reservationStore,
          provider: container.reservationProvider,
        }
      );

      return NextResponse.json(toWireFormat(watch));
    } catch (error) {
      if (error instanceof WatchRequestNotFoundError) {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }

      if (error instanceof WatchRequestAccessDeniedError) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }

      if (isWatchManagerInputError(error)) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      throw error;
    }
  }
);
