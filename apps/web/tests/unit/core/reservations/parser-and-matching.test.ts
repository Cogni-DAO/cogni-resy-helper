// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

import { describe, expect, it } from "vitest";

import {
  buildLogicalAlertKey,
  matchesWatch,
  parseResyNotifyEmail,
} from "@/core/reservations/public";

describe("core/reservations parser and matching", () => {
  it("parses a Resy notify email into a canonical alert", () => {
    const parsed = parseResyNotifyEmail({
      subject: "A table opened at Le Coucou for 2 on 2026-03-20 at 7:00 PM",
      textBody:
        "Good news. A table opened at Le Coucou for 2 on 2026-03-20 at 7:00 PM. Book now: https://resy.com/example",
      sourceMessageId: "gmail-message-1",
    });

    expect(parsed).not.toBeNull();
    if (!parsed) {
      throw new Error("Expected parsed alert");
    }
    expect(parsed?.restaurant).toBe("Le Coucou");
    expect(parsed?.partySize).toBe(2);
    expect(parsed?.bookingUrl).toBe("https://resy.com/example");
    expect(buildLogicalAlertKey(parsed)).toContain("le coucou");
  });

  it("matches an alert that falls within the watch window", () => {
    const parsed = parseResyNotifyEmail({
      subject: "A table opened at Le Coucou for 2 on 2026-03-20 at 7:00 PM",
      textBody:
        "Good news. A table opened at Le Coucou for 2 on 2026-03-20 at 7:00 PM.",
    });

    expect(parsed).not.toBeNull();
    if (!parsed) {
      throw new Error("Expected parsed alert");
    }
    expect(
      matchesWatch(
        {
          restaurant: "Le Coucou",
          restaurantSlug: "le-coucou",
          partySize: 2,
          dateStart: new Date("2026-03-20T00:00:00.000Z"),
          dateEnd: new Date("2026-03-21T23:59:59.000Z"),
          timeStart: "18:00",
          timeEnd: "21:00",
          status: "active",
        },
        parsed
      )
    ).toBe(true);
  });

  it("rejects alerts outside the configured time window", () => {
    const parsed = parseResyNotifyEmail({
      subject: "A table opened at Le Coucou for 2 on 2026-03-20 at 10:30 PM",
      textBody:
        "Good news. A table opened at Le Coucou for 2 on 2026-03-20 at 10:30 PM.",
    });

    expect(parsed).not.toBeNull();
    if (!parsed) {
      throw new Error("Expected parsed alert");
    }
    expect(
      matchesWatch(
        {
          restaurant: "Le Coucou",
          restaurantSlug: "le-coucou",
          partySize: 2,
          dateStart: new Date("2026-03-20T00:00:00.000Z"),
          dateEnd: new Date("2026-03-21T23:59:59.000Z"),
          timeStart: "18:00",
          timeEnd: "21:00",
          status: "active",
        },
        parsed
      )
    ).toBe(false);
  });
});
