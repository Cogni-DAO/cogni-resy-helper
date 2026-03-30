// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/steel-browser/tsup.config`
 * Purpose: Build configuration for steel-browser package.
 * Scope: Build tooling only; does not contain runtime code.
 * Invariants: Output must be ESM with type declarations.
 * Side-effects: IO
 * @internal
 */

import { defineConfig } from "tsup";

// biome-ignore lint/style/noDefaultExport: tsup requires default export
export default defineConfig({
  entry: ["src/index.ts", "src/adapters/rest/index.ts"],
  format: ["esm"],
  dts: false, // tsc -b emits per-file declarations; tsup handles JS only
  clean: false, // preserve .d.ts files from tsc -b (incremental builds)
  sourcemap: true,
  platform: "neutral",
});
