// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

import { Buffer } from "node:buffer";

import { NextResponse } from "next/server";

import { getContainer } from "@/bootstrap/container";
import { wrapRouteHandlerWithLogging } from "@/bootstrap/http";
import { ingestGmailPushEvent } from "@/features/reservations/services/gmail-alert-ingestion";
import { serverEnv } from "@/shared/env/server-env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = wrapRouteHandlerWithLogging(
  {
    routeId: "reservations.connections.gmail.push",
    auth: { mode: "none" },
  },
  async (_ctx, request) => {
    const internalToken = serverEnv().INTERNAL_OPS_TOKEN;
    if (
      internalToken &&
      request.headers.get("authorization") !== `Bearer ${internalToken}`
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as { message?: { data?: string } };
    if (!body.message?.data) {
      return NextResponse.json({ ok: true, processed: 0 });
    }

    const payload = JSON.parse(
      Buffer.from(body.message.data, "base64").toString("utf8")
    ) as {
      emailAddress: string;
      historyId: string;
    };

    const container = getContainer();
    const result = await ingestGmailPushEvent(
      {
        providerAccountEmail: payload.emailAddress,
        historyId: payload.historyId,
      },
      {
        store: container.reservationStore,
        gmail: container.reservationGmail,
        provider: container.reservationProvider,
      }
    );

    return NextResponse.json({ ok: true, processed: result.processed });
  }
);
