// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/api/v1/reservations/connections/resy/start`
 * Purpose: Start a Steel browser session for Resy authentication.
 * Scope: Route handler only — delegates to connection-manager service. Does not contain business logic.
 * Side-effects: IO (via delegated service)
 * @public
 */

import { NextResponse } from "next/server";

import { getSessionUser } from "@/app/_lib/auth/session";
import { getContainer } from "@/bootstrap/container";
import { wrapRouteHandlerWithLogging } from "@/bootstrap/http";
import { resyStartOperation } from "@/contracts/reservations.connections.v1.contract";
import {
  SessionLeaseHeldError,
  startResyConnection,
} from "@/features/reservations/services/connection-manager";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = wrapRouteHandlerWithLogging(
  {
    routeId: "reservations.connections.resy.start",
    auth: { mode: "required", getSessionUser },
  },
  async (_ctx, _request, sessionUser) => {
    if (!sessionUser) {
      throw new Error("sessionUser required");
    }

    const container = getContainer();
    try {
      const result = await startResyConnection(sessionUser.id, {
        store: container.reservationStore,
        gmail: container.reservationGmail,
        provider: container.reservationProvider,
        steel: container.steelSession,
      });

      return NextResponse.json(resyStartOperation.output.parse(result));
    } catch (error) {
      if (error instanceof SessionLeaseHeldError) {
        return NextResponse.json(
          { error: "A browser session is already active for this connection." },
          { status: 409 }
        );
      }
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Failed to start Resy browser session.",
        },
        { status: 502 }
      );
    }
  }
);
