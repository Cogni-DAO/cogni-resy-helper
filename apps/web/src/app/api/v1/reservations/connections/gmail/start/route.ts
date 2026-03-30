// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

import { NextResponse } from "next/server";

import { getSessionUser } from "@/app/_lib/auth/session";
import { getContainer } from "@/bootstrap/container";
import { wrapRouteHandlerWithLogging } from "@/bootstrap/http";
import { gmailConnectStartOperation } from "@/contracts/reservations.connections.v1.contract";
import { startGmailConnection } from "@/features/reservations/services/connection-manager";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = wrapRouteHandlerWithLogging(
  {
    routeId: "reservations.connections.gmail.start",
    auth: { mode: "required", getSessionUser },
  },
  async (_ctx, request, sessionUser) => {
    if (!sessionUser) {
      throw new Error("sessionUser required");
    }

    const redirectUri = new URL(
      "/api/v1/reservations/connections/gmail/callback",
      request.url
    ).toString();

    const container = getContainer();
    try {
      const authorizationUrl = startGmailConnection(
        sessionUser.id,
        redirectUri,
        {
          store: container.reservationStore,
          gmail: container.reservationGmail,
          provider: container.reservationProvider,
          steel: container.steelSession,
        }
      );

      return NextResponse.json(
        gmailConnectStartOperation.output.parse({ authorizationUrl })
      );
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Failed to start Gmail connection.",
        },
        { status: 400 }
      );
    }
  }
);
