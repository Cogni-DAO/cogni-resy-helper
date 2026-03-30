// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/reservations/resy-provider`
 * Purpose: Official Resy browser automation adapter for session verification and claim attempts.
 * Scope: Uses Playwright over CDP to Steel-managed browsers. Does not launch local Chromium.
 * Invariants: NO_STANDING_BROWSER — sessions created on-demand and released in finally blocks. SHORT_LIVED_EXECUTOR — 15 minute max.
 * Side-effects: IO (Steel REST API, Playwright CDP)
 * @public
 */

import type { SteelSessionPort } from "@cogni/steel-browser";
import { SteelUnavailableError } from "@cogni/steel-browser";
import { chromium, type Page } from "@playwright/test";

import type {
  AlertSetupResult,
  BookingAssistParams,
  BookingAssistResult,
  ReservationProviderPort,
  SessionCaptureResult,
  WatchRequest,
} from "@/ports";

async function isAuthenticatedResyPage(page: Page): Promise<boolean> {
  const content = await page.content();
  if (/(log out|sign out|my resy|account|profile)/i.test(content)) {
    return true;
  }
  // Check for auth-related cookies via CDP
  const client = await page.context().newCDPSession(page);
  const { cookies } = await client.send("Network.getCookies", {
    urls: ["https://resy.com"],
  });
  return cookies.some((c: { name: string }) =>
    /(auth|session|token|user)/i.test(c.name)
  );
}

export class ResyProviderAdapter implements ReservationProviderPort {
  readonly platformId = "resy" as const;

  constructor(private readonly steel?: SteelSessionPort) {}

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

  async captureSession(_params?: {
    startUrl?: string | undefined;
  }): Promise<SessionCaptureResult> {
    // With Steel, captureSession is a no-op — the actual auth happens in the
    // Steel debug browser via startResyConnection/captureResyConnection in
    // connection-manager.ts. This method exists for port compatibility.
    return {
      profileKey: undefined,
      sessionStateCiphertext: undefined,
      sessionStatus: "connected",
      lastVerifiedAt: new Date(),
      expiresHintAt: null,
    };
  }

  async attemptBooking(
    params: BookingAssistParams
  ): Promise<BookingAssistResult> {
    if (!this.steel) {
      return {
        success: false,
        error: "Steel browser service is not configured.",
      };
    }

    if (!params.profileKey) {
      return {
        success: false,
        error: "No profile key provided for booking attempt.",
      };
    }

    const session = await this.steel.createSession({
      profileKey: params.profileKey,
      timeout: 15,
    });

    let browser:
      | Awaited<ReturnType<typeof chromium.connectOverCDP>>
      | undefined;
    try {
      browser = await chromium.connectOverCDP(session.websocketUrl);
      const context = browser.contexts()[0] ?? (await browser.newContext());
      const page = await context.newPage();

      const targetUrl =
        params.alert.bookingUrl ?? this.buildNotifySetup(params.watch).setupUrl;

      await page.goto(targetUrl, { waitUntil: "domcontentloaded" });

      if (!(await isAuthenticatedResyPage(page))) {
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
      if (error instanceof SteelUnavailableError) {
        return {
          success: false,
          error: "Browser service unavailable.",
        };
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
      await this.steel.releaseSession(session.sessionId).catch(() => {});
    }
  }
}
