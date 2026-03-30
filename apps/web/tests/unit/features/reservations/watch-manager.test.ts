// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

import { describe, expect, it, vi } from "vitest";

import {
  createWatch,
  updateWatchStatus,
} from "@/features/reservations/services/watch-manager";
import { WatchRequestAccessDeniedError } from "@/ports";

describe("features/reservations/watch-manager", () => {
  it("normalizes date-only watch ranges to inclusive UTC day boundaries", async () => {
    const createdAt = new Date("2026-03-18T12:00:00.000Z");
    const store = {
      createWatchRequest: vi.fn().mockResolvedValue({
        id: "watch-1",
        userId: "user-1",
        platform: "resy",
        restaurant: "Le Coucou",
        restaurantSlug: null,
        partySize: 2,
        dateStart: new Date("2026-03-20T00:00:00.000Z"),
        dateEnd: new Date("2026-03-20T23:59:59.999Z"),
        timeStart: "18:00",
        timeEnd: "21:00",
        idealTime: null,
        hardConstraints: {},
        softConstraints: {},
        autoClaim: true,
        notifySetupUrl: "https://resy.com/cities/ny/le-coucou",
        status: "active",
        lastMatchedAt: null,
        createdAt,
        updatedAt: createdAt,
      }),
      appendEvent: vi.fn(),
    };

    await createWatch(
      "user-1",
      {
        restaurant: "Le Coucou",
        partySize: 2,
        dateStart: "2026-03-20",
        dateEnd: "2026-03-20",
        timeStart: "18:00",
        timeEnd: "21:00",
        autoClaim: true,
      },
      {
        store: store as never,
        provider: {
          buildNotifySetup: vi.fn().mockReturnValue({
            setupUrl: "https://resy.com/cities/ny/le-coucou",
          }),
        } as never,
      }
    );

    expect(store.createWatchRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        dateStart: new Date("2026-03-20T00:00:00.000Z"),
        dateEnd: new Date("2026-03-20T23:59:59.999Z"),
      })
    );
  });

  it("rejects watch status changes for another user's watch", async () => {
    const store = {
      getWatchRequest: vi.fn().mockResolvedValue({
        id: "watch-1",
        userId: "user-2",
        status: "active",
      }),
    };

    await expect(
      updateWatchStatus("user-1", "watch-1", "paused", {
        store: store as never,
        provider: {} as never,
      })
    ).rejects.toBeInstanceOf(WatchRequestAccessDeniedError);
  });

  it("passes the current user id into the status update store call", async () => {
    const updatedAt = new Date("2026-03-18T12:00:00.000Z");
    const store = {
      getWatchRequest: vi.fn().mockResolvedValue({
        id: "watch-1",
        userId: "user-1",
        status: "active",
      }),
      updateWatchRequestStatus: vi.fn().mockResolvedValue({
        id: "watch-1",
        userId: "user-1",
        platform: "resy",
        restaurant: "Le Coucou",
        restaurantSlug: null,
        partySize: 2,
        dateStart: new Date("2026-03-20T00:00:00.000Z"),
        dateEnd: new Date("2026-03-20T23:59:59.999Z"),
        timeStart: "18:00",
        timeEnd: "21:00",
        idealTime: null,
        hardConstraints: {},
        softConstraints: {},
        autoClaim: true,
        notifySetupUrl: null,
        status: "paused",
        lastMatchedAt: null,
        createdAt: updatedAt,
        updatedAt,
      }),
      appendEvent: vi.fn(),
    };

    await updateWatchStatus("user-1", "watch-1", "paused", {
      store: store as never,
      provider: {} as never,
    });

    expect(store.updateWatchRequestStatus).toHaveBeenCalledWith(
      "user-1",
      "watch-1",
      "paused"
    );
  });
});
