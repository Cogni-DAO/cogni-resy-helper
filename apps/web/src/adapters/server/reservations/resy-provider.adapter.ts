// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/reservations/resy-provider`
 * Purpose: Official Resy browser automation adapter for session capture and claim attempts.
 * Scope: Uses Playwright against official Resy pages only.
 * Side-effects: IO
 * @public
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium, type Page } from "@playwright/test";

import type {
  AlertSetupResult,
  BookingAssistParams,
  BookingAssistResult,
  ReservationProviderPort,
  SessionCaptureResult,
  WatchRequest,
} from "@/ports";
import {
  decryptSecret,
  encryptSecret,
  isReconnectRequiredPage,
} from "./session-crypto";

type PlaywrightStorageState = {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: "Strict" | "Lax" | "None";
  }>;
  origins: Array<{
    origin: string;
    localStorage: Array<{
      name: string;
      value: string;
    }>;
  }>;
};

async function isAuthenticatedResySession(
  page: Page,
  storageState: PlaywrightStorageState
): Promise<boolean> {
  if (await isReconnectRequiredPage(page)) {
    return false;
  }

  const content = await page.content();
  if (/(log out|sign out|my resy|account|profile)/i.test(content)) {
    return true;
  }

  return storageState.cookies.some(
    (cookie) =>
      cookie.domain.includes("resy.com") &&
      /(auth|session|token|user)/i.test(cookie.name)
  );
}

export class ResyProviderAdapter implements ReservationProviderPort {
  readonly platformId = "resy" as const;

  buildNotifySetup(watch: WatchRequest): AlertSetupResult {
    const slug =
      watch.restaurantSlug ??
      watch.restaurant
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, "-")
        .replaceAll(/^-+|-+$/g, "");

    return {
      setupUrl: `https://resy.com/cities/ny/${slug}?date=${watch.dateStart.toISOString().slice(0, 10)}&seats=${watch.partySize}`,
    };
  }

  async captureSession(params?: {
    startUrl?: string | undefined;
  }): Promise<SessionCaptureResult> {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await page.goto(params?.startUrl ?? "https://resy.com", {
        waitUntil: "domcontentloaded",
      });

      const deadline = Date.now() + 5 * 60_000;

      while (Date.now() < deadline) {
        const storageState =
          (await context.storageState()) as PlaywrightStorageState;
        if (await isAuthenticatedResySession(page, storageState)) {
          const encrypted = encryptSecret(JSON.stringify(storageState));
          return {
            sessionStateCiphertext: encrypted,
            sessionStatus: "connected",
            lastVerifiedAt: new Date(),
            expiresHintAt: null,
          };
        }
        await page.waitForTimeout(1000);
      }

      return {
        sessionStateCiphertext: "",
        sessionStatus: "error",
        lastVerifiedAt: null,
        expiresHintAt: null,
      };
    } finally {
      await context.close();
      await browser.close();
    }
  }

  async attemptBooking(
    params: BookingAssistParams
  ): Promise<BookingAssistResult> {
    const stateJson = decryptSecret(params.sessionStateCiphertext);
    const state = JSON.parse(stateJson) as PlaywrightStorageState;

    const userDataDir = await mkdtemp(join(tmpdir(), "resy-claim-"));
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ storageState: state });

    try {
      const page = await context.newPage();
      const targetUrl =
        params.alert.bookingUrl ?? this.buildNotifySetup(params.watch).setupUrl;

      await page.goto(targetUrl, { waitUntil: "domcontentloaded" });

      if (!(await isAuthenticatedResySession(page, state))) {
        return {
          success: false,
          reconnectRequired: true,
          error: "Resy session expired or requires re-authentication.",
        };
      }

      const claimButton = page.getByRole("button", {
        name: /book|reserve|confirm/i,
      });

      if ((await claimButton.count()) === 0) {
        return {
          success: false,
          error: "No book/confirm action was available on the Resy page.",
        };
      }

      await claimButton.first().click();
      await page
        .waitForLoadState("networkidle", { timeout: 15_000 })
        .catch(() => undefined);

      const content = await page.content();
      const confirmationMatch = content.match(
        /confirmation(?: code)?[:\s]+([A-Z0-9-]{4,})/i
      );

      return {
        success: true,
        confirmationCode: confirmationMatch?.[1],
        details: {
          bookedUrl: page.url(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      await context.close();
      await browser.close();
      await rm(userDataDir, { recursive: true, force: true });
    }
  }
}
