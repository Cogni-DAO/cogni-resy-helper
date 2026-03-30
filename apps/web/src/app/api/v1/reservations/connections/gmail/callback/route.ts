// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

import { NextResponse } from "next/server";

import { getSessionUser } from "@/app/_lib/auth/session";
import { getContainer } from "@/bootstrap/container";
import { wrapRouteHandlerWithLogging } from "@/bootstrap/http";
import { completeGmailConnection } from "@/features/reservations/services/connection-manager";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = wrapRouteHandlerWithLogging(
  {
    routeId: "reservations.connections.gmail.callback",
    auth: { mode: "required", getSessionUser },
  },
  async (_ctx, request, sessionUser) => {
    if (!sessionUser) {
      throw new Error("sessionUser required");
    }

    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || state !== sessionUser.id) {
      return NextResponse.json(
        { error: "Invalid Gmail callback." },
        { status: 400 }
      );
    }

    const redirectUri = new URL(
      "/api/v1/reservations/connections/gmail/callback",
      request.url
    ).toString();

    const container = getContainer();
    await completeGmailConnection(sessionUser.id, code, redirectUri, {
      store: container.reservationStore,
      gmail: container.reservationGmail,
      provider: container.reservationProvider,
    });

    return new NextResponse(
      `<html><body><script>window.opener?.location?.reload();window.close();</script><p>Gmail connected. You can close this window.</p></body></html>`,
      {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }
    );
  }
);
