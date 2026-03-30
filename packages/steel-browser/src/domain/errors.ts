// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/steel-browser/domain/errors`
 * Purpose: Typed domain errors for Steel browser session failures.
 * Scope: Error classes only. Does not contain retry logic or HTTP status mapping.
 * Invariants: PURE_LIBRARY — no I/O.
 * Side-effects: none
 * @public
 */

/** Steel REST API is unreachable (connection refused, DNS failure, timeout). */
export class SteelUnavailableError extends Error {
  override readonly name = "SteelUnavailableError" as const;
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
  }
}

/** Steel REST API returned an error response (non-2xx). */
export class SteelSessionError extends Error {
  override readonly name = "SteelSessionError" as const;
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly cause?: unknown
  ) {
    super(message);
  }
}
