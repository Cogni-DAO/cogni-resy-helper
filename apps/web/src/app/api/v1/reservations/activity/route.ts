// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

import { NextResponse } from "next/server";

import { getSessionUser } from "@/app/_lib/auth/session";
import { getContainer } from "@/bootstrap/container";
import { wrapRouteHandlerWithLogging } from "@/bootstrap/http";
import { reservationActivityListOperation } from "@/contracts/reservations.activity.v1.contract";
import { listActivity } from "@/features/reservations/services/watch-manager";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = wrapRouteHandlerWithLogging(
  {
    routeId: "reservations.activity.list",
    auth: { mode: "required", getSessionUser },
  },
  async (_ctx, request, sessionUser) => {
    if (!sessionUser) {
      throw new Error("sessionUser required");
    }

    const url = new URL(request.url);
    const input = reservationActivityListOperation.input.parse({
      watchId: url.searchParams.get("watchId") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });

    const container = getContainer();
    const events = await listActivity(sessionUser.id, input.watchId, {
      store: container.reservationStore,
      provider: container.reservationProvider,
    });

    return NextResponse.json(
      reservationActivityListOperation.output.parse({
        events: events.slice(0, input.limit ?? events.length).map((event) => ({
          id: event.id,
          userId: event.userId,
          watchRequestId: event.watchRequestId,
          connectionId: event.connectionId,
          alertReceiptId: event.alertReceiptId,
          source: event.source,
          eventType: event.eventType,
          dedupeKey: event.dedupeKey,
          payloadJson: event.payloadJson,
          createdAt: event.createdAt.toISOString(),
        })),
      })
    );
  }
);
