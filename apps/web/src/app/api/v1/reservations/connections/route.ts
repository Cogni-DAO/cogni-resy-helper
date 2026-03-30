// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

import { NextResponse } from "next/server";

import { getSessionUser } from "@/app/_lib/auth/session";
import { getContainer } from "@/bootstrap/container";
import { wrapRouteHandlerWithLogging } from "@/bootstrap/http";
import { reservationsConnectionsReadOperation } from "@/contracts/reservations.connections.v1.contract";
import { listConnections } from "@/features/reservations/services/connection-manager";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function toNullableIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

export const GET = wrapRouteHandlerWithLogging(
  {
    routeId: "reservations.connections.read",
    auth: { mode: "required", getSessionUser },
  },
  async (_ctx, _request, sessionUser) => {
    if (!sessionUser) {
      throw new Error("sessionUser required");
    }

    const container = getContainer();
    const connections = await listConnections(sessionUser.id, {
      store: container.reservationStore,
      gmail: container.reservationGmail,
      provider: container.reservationProvider,
      steel: container.steelSession,
    });

    return NextResponse.json(
      reservationsConnectionsReadOperation.output.parse({
        gmail: {
          kind: "gmail",
          id: connections.gmail?.id ?? null,
          status: connections.gmail?.status ?? "disconnected",
          provider: "gmail",
          providerAccountEmail: connections.gmail?.providerAccountEmail ?? null,
          providerSubject: connections.gmail?.providerSubject ?? null,
          tokenExpiresAt: toNullableIso(connections.gmail?.tokenExpiresAt),
          createdAt: toNullableIso(connections.gmail?.createdAt),
          updatedAt: toNullableIso(connections.gmail?.updatedAt),
          watchStatus: connections.gmail?.watchStatus ?? "inactive",
          watchExpiryAt: toNullableIso(connections.gmail?.watchExpiryAt),
          renewalStatus: connections.gmail?.renewalStatus ?? "healthy",
          historyCursor: connections.gmail?.historyCursor ?? null,
        },
        resy: {
          kind: "resy",
          id: connections.resy?.id ?? null,
          status: connections.resy?.status ?? "disconnected",
          provider: "resy",
          providerAccountEmail: connections.resy?.providerAccountEmail ?? null,
          providerSubject: connections.resy?.providerSubject ?? null,
          tokenExpiresAt: toNullableIso(connections.resy?.tokenExpiresAt),
          createdAt: toNullableIso(connections.resy?.createdAt),
          updatedAt: toNullableIso(connections.resy?.updatedAt),
          sessionStatus: connections.resy?.sessionStatus ?? null,
          lastVerifiedAt: toNullableIso(connections.resy?.lastVerifiedAt),
          expiresHintAt: toNullableIso(connections.resy?.expiresHintAt),
        },
      })
    );
  }
);
