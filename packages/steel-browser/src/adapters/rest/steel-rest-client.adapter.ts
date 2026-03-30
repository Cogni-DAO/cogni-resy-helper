// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/steel-browser/adapters/rest`
 * Purpose: REST client adapter for the self-hosted Steel.dev browser API.
 * Scope: Thin fetch wrapper over Steel POST /v1/sessions and DELETE /v1/sessions/:id. Does not read env or manage lifecycle.
 * Invariants: No env reads — baseUrl injected via constructor. No process lifecycle.
 * Side-effects: IO (HTTP requests to Steel API)
 * Links: docs/spec/reservation-assistant-v1.md
 * @public
 */

import {
  SteelSessionError,
  SteelUnavailableError,
} from "../../domain/errors.js";
import type {
  SteelSessionOptions,
  SteelSessionPort,
  SteelSessionResult,
} from "../../port/steel-session.port.js";

const DEFAULT_TIMEOUT_MINUTES = 15;

interface SteelCreateSessionResponse {
  id: string;
  debugUrl: string;
  debuggerFullscreenUrl?: string;
  wsUrl?: string;
  websocketUrl?: string;
  sessionViewerUrl?: string;
  status: string;
}

export class SteelRestClientAdapter implements SteelSessionPort {
  private readonly baseUrl: string;

  constructor(config: { baseUrl: string }) {
    // Strip trailing slash for consistent URL construction
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
  }

  async createSession(opts: SteelSessionOptions): Promise<SteelSessionResult> {
    const timeout = (opts.timeout ?? DEFAULT_TIMEOUT_MINUTES) * 60 * 1000;
    const body = {
      sessionId: opts.profileKey,
      userDataDir: opts.profileKey,
      isSelenium: false,
      timeout,
    };

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/v1/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new SteelUnavailableError(
        `Steel API unreachable at ${this.baseUrl}: ${err instanceof Error ? err.message : String(err)}`,
        err
      );
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new SteelSessionError(
        `Steel session creation failed (${res.status}): ${text}`,
        res.status
      );
    }

    const data = (await res.json()) as SteelCreateSessionResponse;
    const websocketUrl = data.websocketUrl ?? data.wsUrl;
    if (!websocketUrl) {
      throw new SteelSessionError(
        "Steel session response missing websocketUrl",
        200
      );
    }

    return {
      sessionId: data.id,
      debugUrl: data.debugUrl,
      websocketUrl,
    };
  }

  async releaseSession(sessionId: string): Promise<void> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/v1/sessions/${sessionId}`, {
        method: "DELETE",
      });
    } catch (err) {
      throw new SteelUnavailableError(
        `Steel API unreachable at ${this.baseUrl}: ${err instanceof Error ? err.message : String(err)}`,
        err
      );
    }

    // 404 is acceptable — session may have already timed out
    if (!res.ok && res.status !== 404) {
      const text = await res.text().catch(() => "");
      throw new SteelSessionError(
        `Steel session release failed (${res.status}): ${text}`,
        res.status
      );
    }
  }
}
