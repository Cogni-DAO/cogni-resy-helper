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

    const input = watchCreateOperation.input.parse(body);
    if (!sessionUser) {
      throw new Error("sessionUser required");
    }

    const container = getContainer();
    const watch = await createWatch(sessionUser.id, input, {
      store: container.reservationStore,
      provider: container.reservationProvider,
    });

    return NextResponse.json(toWireFormat(watch), { status: 201 });
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
