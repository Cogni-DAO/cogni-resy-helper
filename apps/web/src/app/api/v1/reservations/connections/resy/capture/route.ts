// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/api/v1/reservations/connections/resy/capture`
 * Purpose: Finalize Resy connection after user authenticates in Steel debug browser.
 * Scope: Route handler only — delegates to connection-manager service. Does not contain business logic.
 * Side-effects: IO (via delegated service)
 * @public
 */

import { NextResponse } from "next/server";

import { getSessionUser } from "@/app/_lib/auth/session";
import { getContainer } from "@/bootstrap/container";
import { wrapRouteHandlerWithLogging } from "@/bootstrap/http";
import { resyCaptureOperation } from "@/contracts/reservations.connections.v1.contract";
import { captureResyConnection } from "@/features/reservations/services/connection-manager";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = wrapRouteHandlerWithLogging(
  {
    routeId: "reservations.connections.resy.capture",
    auth: { mode: "required", getSessionUser },
  },
  async (_ctx, _request, sessionUser) => {
    if (!sessionUser) {
      throw new Error("sessionUser required");
    }

    const container = getContainer();
    try {
      const connection = await captureResyConnection(sessionUser.id, {
        store: container.reservationStore,
        gmail: container.reservationGmail,
        provider: container.reservationProvider,
        steel: container.steelSession,
      });

      return NextResponse.json(
        resyCaptureOperation.output.parse({
          kind: "resy",
          id: connection.id,
          status: connection.status,
          provider: connection.provider,
          providerAccountEmail: connection.providerAccountEmail,
          providerSubject: connection.providerSubject,
          tokenExpiresAt: connection.tokenExpiresAt?.toISOString() ?? null,
          createdAt: connection.createdAt.toISOString(),
          updatedAt: connection.updatedAt.toISOString(),
          sessionStatus: connection.sessionStatus,
          lastVerifiedAt: connection.lastVerifiedAt?.toISOString() ?? null,
          expiresHintAt: connection.expiresHintAt?.toISOString() ?? null,
        })
      );
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Failed to capture Resy session.",
        },
        { status: 400 }
      );
    }
  }
);
