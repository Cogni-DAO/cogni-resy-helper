// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/steel-browser/port`
 * Purpose: Port interface for Steel browser session lifecycle.
 * Scope: Defines the session create/release contract. Does not handle env, credentials, or HTTP transport.
 * Invariants: PURE_LIBRARY — no I/O, no env reads, no side effects.
 * Side-effects: none (interface definition only)
 * Links: docs/spec/reservation-assistant-v1.md
 * @public
 */

/** Result of creating a Steel browser session. */
export interface SteelSessionResult {
  /** Steel-assigned session identifier. */
  sessionId: string;
  /** URL for live browser debugging (user-facing auth flow). */
  debugUrl: string;
  /** WebSocket CDP endpoint for Playwright connectOverCDP. */
  websocketUrl: string;
}

/** Options for creating a Steel browser session. */
export interface SteelSessionOptions {
  /** Profile key — used as Steel's userDataDir to persist browser state. Typically the connection UUID. */
  profileKey: string;
  /** Session timeout in minutes. Default: 15. */
  timeout?: number;
}

/**
 * Port for managing Steel browser sessions.
 *
 * Consumers create sessions on-demand and release them immediately after use.
 * Steel persists the browser profile (cookies, localStorage) to a Docker volume
 * keyed by profileKey, enabling session replay across create/release cycles.
 */
export interface SteelSessionPort {
  /** Create a new Steel browser session with a persisted profile. */
  createSession(opts: SteelSessionOptions): Promise<SteelSessionResult>;
  /** Release an active Steel session. The persisted profile remains on the volume. */
  releaseSession(sessionId: string): Promise<void>;
}
