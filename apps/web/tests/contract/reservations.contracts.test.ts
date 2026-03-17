// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

import { describe, expect, it } from "vitest";

import { reservationActivityListOperation } from "@/contracts/reservations.activity.v1.contract";
import { reservationsConnectionsReadOperation } from "@/contracts/reservations.connections.v1.contract";
import {
  WatchCreateInputSchema,
  watchListOperation,
} from "@/contracts/reservations.watch.v1.contract";

describe("reservations.watch.v1 contract", () => {
  it("accepts a valid watch create payload", () => {
    expect(() =>
      WatchCreateInputSchema.parse({
        restaurant: "Le Coucou",
        restaurantSlug: "le-coucou",
        partySize: 2,
        dateStart: "2026-03-20T00:00:00.000Z",
        dateEnd: "2026-03-22T00:00:00.000Z",
        timeStart: "18:00",
        timeEnd: "21:00",
        idealTime: "19:00",
        autoClaim: true,
      })
    ).not.toThrow();
  });

  it("accepts watch list responses with reconnect-required status", () => {
    expect(() =>
      watchListOperation.output.parse({
        watches: [
          {
            id: "123e4567-e89b-12d3-a456-426614174000",
            userId: "user_123",
            platform: "resy",
            restaurant: "Le Coucou",
            restaurantSlug: "le-coucou",
            partySize: 2,
            dateStart: "2026-03-20T00:00:00.000Z",
            dateEnd: "2026-03-22T00:00:00.000Z",
            timeStart: "18:00",
            timeEnd: "21:00",
            idealTime: "19:00",
            hardConstraints: {},
            softConstraints: {},
            autoClaim: true,
            notifySetupUrl: "https://resy.com/cities/ny/le-coucou",
            status: "reconnect_required",
            lastMatchedAt: null,
            createdAt: "2026-03-17T00:00:00.000Z",
            updatedAt: "2026-03-17T00:00:00.000Z",
          },
        ],
      })
    ).not.toThrow();
  });
});

describe("reservations.connections.v1 contract", () => {
  it("accepts Gmail and Resy connection state", () => {
    expect(() =>
      reservationsConnectionsReadOperation.output.parse({
        gmail: {
          kind: "gmail",
          id: "123e4567-e89b-12d3-a456-426614174000",
          status: "connected",
          provider: "gmail",
          providerAccountEmail: "friend@example.com",
          providerSubject: "google-subject",
          tokenExpiresAt: null,
          createdAt: "2026-03-17T00:00:00.000Z",
          updatedAt: "2026-03-17T00:00:00.000Z",
          watchStatus: "active",
          watchExpiryAt: "2026-03-18T00:00:00.000Z",
          renewalStatus: "healthy",
          historyCursor: "12345",
        },
        resy: {
          kind: "resy",
          id: "223e4567-e89b-12d3-a456-426614174000",
          status: "connected",
          provider: "resy",
          providerAccountEmail: null,
          providerSubject: null,
          tokenExpiresAt: null,
          createdAt: "2026-03-17T00:00:00.000Z",
          updatedAt: "2026-03-17T00:00:00.000Z",
          sessionStatus: "connected",
          lastVerifiedAt: "2026-03-17T00:00:00.000Z",
          expiresHintAt: null,
        },
      })
    ).not.toThrow();
  });
});

describe("reservations.activity.v1 contract", () => {
  it("accepts alert and claim activity events", () => {
    expect(() =>
      reservationActivityListOperation.output.parse({
        events: [
          {
            id: "323e4567-e89b-12d3-a456-426614174000",
            userId: "user_123",
            watchRequestId: null,
            connectionId: "123e4567-e89b-12d3-a456-426614174000",
            alertReceiptId: null,
            source: "gmail",
            eventType: "alert_received",
            dedupeKey: "le-coucou|2|2026-03-20T19:00:00.000Z|",
            payloadJson: { restaurant: "Le Coucou" },
            createdAt: "2026-03-17T00:00:00.000Z",
          },
        ],
      })
    ).not.toThrow();
  });
});
