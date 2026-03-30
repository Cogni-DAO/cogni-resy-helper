// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

import { NextResponse } from "next/server";

import { getSessionUser } from "@/app/_lib/auth/session";
import { getContainer } from "@/bootstrap/container";
import { wrapRouteHandlerWithLogging } from "@/bootstrap/http";
import { gmailRenewOperation } from "@/contracts/reservations.connections.v1.contract";
import { renewGmailWatch } from "@/features/reservations/services/connection-manager";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = wrapRouteHandlerWithLogging(
  {
    routeId: "reservations.connections.gmail.renew",
    auth: { mode: "required", getSessionUser },
  },
  async (_ctx, _request, sessionUser) => {
    if (!sessionUser) {
      throw new Error("sessionUser required");
    }

    const container = getContainer();
    try {
      const connection = await renewGmailWatch(sessionUser.id, {
        store: container.reservationStore,
        gmail: container.reservationGmail,
        provider: container.reservationProvider,
      });

      return NextResponse.json(
        gmailRenewOperation.output.parse({
          kind: "gmail",
          id: connection.id,
          status: connection.status,
          provider: connection.provider,
          providerAccountEmail: connection.providerAccountEmail,
          providerSubject: connection.providerSubject,
          tokenExpiresAt: connection.tokenExpiresAt?.toISOString() ?? null,
          createdAt: connection.createdAt.toISOString(),
          updatedAt: connection.updatedAt.toISOString(),
          watchStatus: connection.watchStatus,
          watchExpiryAt: connection.watchExpiryAt?.toISOString() ?? null,
          renewalStatus: connection.renewalStatus,
          historyCursor: connection.historyCursor,
        })
      );
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Failed to renew Gmail watch.",
        },
        { status: 400 }
      );
    }
  }
);
