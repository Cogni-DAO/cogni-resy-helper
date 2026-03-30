// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/steel-browser`
 * Purpose: Steel browser capability package — port, domain errors, and types for browser session management.
 * Scope: Exports port interface and domain errors. Does not export REST adapter (use subpath `@cogni/steel-browser/adapters/rest`).
 * Invariants: NO_SRC_IMPORTS, NO_SERVICE_IMPORTS, PURE_LIBRARY.
 * Side-effects: none
 * Links: docs/spec/reservation-assistant-v1.md
 * @public
 */

export {
  SteelSessionError,
  SteelUnavailableError,
} from "./domain/errors.js";
export type {
  SteelSessionOptions,
  SteelSessionPort,
  SteelSessionResult,
} from "./port/steel-session.port.js";
