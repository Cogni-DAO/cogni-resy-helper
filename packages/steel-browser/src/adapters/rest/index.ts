// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/steel-browser/adapters/rest`
 * Purpose: Subpath export for the Steel REST client adapter.
 * Scope: Re-exports only. Does not contain runtime logic.
 * Invariants: Consumers use `@cogni/steel-browser/adapters/rest` to avoid pulling adapter code into non-Steel contexts.
 * Side-effects: none
 * Links: docs/spec/reservation-assistant-v1.md
 * @public
 */

export { SteelRestClientAdapter } from "./steel-rest-client.adapter.js";
