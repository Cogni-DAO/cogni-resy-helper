// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

import { NextResponse } from "next/server";

import { getSessionUser } from "@/app/_lib/auth/session";
import { getContainer } from "@/bootstrap/container";
import { wrapRouteHandlerWithLogging } from "@/bootstrap/http";
import {
  watchCreateOperation,
  watchListOperation,
} from "@/contracts/reservations.watch.v1.contract";
import {
  createWatch,
  isWatchManagerInputError,
  listWatches,
} from "@/features/reservations/services/watch-manager";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function toWireFormat(watch: Awaited<ReturnType<typeof createWatch>>) {
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

export const POST = wrapRouteHandlerWithLogging(
  {
    routeId: "reservations.watches.create",
    auth: { mode: "required", getSessionUser },
  },
  async (_ctx, request, sessionUser) => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = watchCreateOperation.input.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid watch payload" },
        { status: 400 }
      );
    }
    if (!sessionUser) {
      throw new Error("sessionUser required");
    }

    const container = getContainer();
    try {
      const watch = await createWatch(sessionUser.id, parsed.data, {
        store: container.reservationStore,
        provider: container.reservationProvider,
      });

      return NextResponse.json(toWireFormat(watch), { status: 201 });
    } catch (error) {
      if (isWatchManagerInputError(error)) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : "Invalid watch" },
          { status: 400 }
        );
      }

      throw error;
    }
  }
);

export const GET = wrapRouteHandlerWithLogging(
  {
    routeId: "reservations.watches.list",
    auth: { mode: "required", getSessionUser },
  },
  async (_ctx, _request, sessionUser) => {
    if (!sessionUser) {
      throw new Error("sessionUser required");
    }

    const container = getContainer();
    const watches = await listWatches(sessionUser.id, {
      store: container.reservationStore,
      provider: container.reservationProvider,
    });

    return NextResponse.json(
      watchListOperation.output.parse({
        watches: watches.map(toWireFormat),
      })
    );
  }
);
