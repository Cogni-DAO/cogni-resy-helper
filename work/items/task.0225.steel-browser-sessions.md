---
id: task.0225
type: task
title: "Steel browser sessions — tenant-authenticated browser automation for reservation booking"
status: needs_implement
priority: 0
rank: 1
estimate: 3
summary: Replace local Chromium launch with self-hosted Steel browser sessions for Resy auth capture and booking execution, wired through a shared capability package.
outcome: Users authenticate Resy via a remote Steel debug browser; the agent replays that session via CDP for booking attempts; no local browser binary required at runtime.
spec_refs: reservation-assistant-v1
assignees: derekg1729
credit:
project:
branch: feat/steel-browser-sessions
pr:
reviewer:
revision: 1
blocked_by:
deploy_verified: false
created: 2026-03-29
updated: 2026-03-29
labels: [reservations, browser, steel, infra]
external_refs:
---

# Steel Browser Sessions

## Context

The reservation assistant (task.0166) launches **local Chromium** via `playwright` for session capture and booking execution. This breaks in Docker (no display server), requires ~400MB Playwright binaries in the container image, and can't work for remote deployments.

Steel.dev replaces local Chromium with a self-hosted Docker browser that persists browser profiles via `userDataDir` on a named volume, exposes a `debugUrl` for user authentication, and exposes a `websocketUrl` (CDP endpoint) for Playwright to connect remotely.

### Research Findings

| Question | Answer |
|----------|--------|
| Steel concurrency (OSS) | Single active session. MVP single-user is fine. |
| Steel auth model | Network isolation only. No API key for self-hosted. |
| Why not Playwright MCP? | CDP endpoint fixed at server startup — can't switch per-session. |
| Why not Steel MCP server? | Puppeteer-based, less mature. Direct Playwright-over-CDP is simpler. |
| Steel Docker image | `ghcr.io/steel-dev/steel-browser` — ports 3000 (API) + 9223 (CDP). |

### Architecture

```text
User Auth Flow:
  POST .../resy/start
    → feature service: startResyConnection(userId, deps)
      → atomic lease: UPDATE ... WHERE lease IS NULL OR expired RETURNING *
      → Steel: POST /v1/sessions (userDataDir=connectionId, persist=true)
      → Return { connectionId, debugUrl }
    → User opens debugUrl, logs into resy.com
    → User clicks "Done"
  POST .../resy/capture
    → feature service: captureResyConnection(userId, deps)
      → Steel: release session → profile persisted to volume
      → Clear lease, update connection: status=connected

Agent Booking Flow (Temporal activity):
  1. Resolve connection → connectionId = profile key
  2. Atomic lease acquisition (same SQL pattern)
  3. Steel: create session (same userDataDir, persist=true)
  4. Playwright: chromium.connectOverCDP(websocketUrl)
  5. Navigate Resy booking flow
  6. Steel: release session, clear lease
  7. Record result
```

## Requirements

### Functional

- R1: `POST .../resy/start` creates a Steel session and returns `{ connectionId, debugUrl }`.
- R2: `POST .../resy/capture` releases the Steel session, verifies Resy auth, and updates the connection to `status: connected`.
- R3: `ResyProviderAdapter.attemptBooking()` connects to a Steel-managed browser via CDP instead of launching local Chromium. Accepts a `profileKey` (connection ID) instead of `sessionStateCiphertext`.
- R4: Lease acquisition is **atomic at the DB level**: `UPDATE reservation_connections SET session_lease_until = now() + interval '15 min' WHERE (session_lease_until IS NULL OR session_lease_until < now()) AND id = $1 RETURNING *`. If no row returned → 409.
- R5: Stale leases are safe — Steel auto-releases timed-out sessions, and the persisted `userDataDir` remains valid on the volume.
- R6: Expired Resy auth → `reconnectRequired: true` → connection moves to `reconnect_required`.
- R7: Steel API failures surface as typed domain errors, not raw 500s. `SteelUnavailableError` → 503; `SteelSessionError` → 502.

### Non-Functional

- R8: Steel runs as shared Docker service on internal `cogni-edge` network. No external exposure.
- R9: No Playwright binary in app container — only `playwright` npm package for CDP client.
- R10: `pnpm check:fast` passes.

### Spec Invariants (reservation-assistant-v1)

| Invariant | How |
|-----------|-----|
| NO_STANDING_BROWSER | Steel sessions created on-demand, released immediately after use. |
| SHORT_LIVED_EXECUTOR | 15-minute lease + Steel timeout. Released after booking attempt. |
| ENCRYPTED_SESSION_STATE | Profile lives in Docker volume. Connection row stores only the connection ID as profile key. `session_state_ciphertext` column deprecated (nullable, unused for new flows). |
| REAUTH_IS_EXPLICIT | Failed auth → `reconnect_required` → user re-authenticates via new debug session. |
| ONE_ACTIVE_CLAIM_PER_WATCH | Atomic lease prevents concurrent sessions for the same connection. |

## Allowed Changes

### New Files — Shared Package

```
packages/steel-browser/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── AGENTS.md
├── src/
│   ├── index.ts                          # barrel: port + domain errors
│   ├── port/
│   │   └── steel-session.port.ts         # SteelSessionPort interface
│   ├── domain/
│   │   └── errors.ts                     # SteelUnavailableError, SteelSessionError
│   └── adapters/
│       └── rest/
│           ├── index.ts                  # subpath barrel
│           └── steel-rest-client.adapter.ts  # fetch wrapper (~60 lines)
├── tests/
│   └── steel-rest-client.test.ts
```

### New Files — App

- `apps/web/src/app/api/v1/reservations/connections/resy/start/route.ts` — new route
- `apps/web/src/contracts/reservations.connections.v1.contract.ts` — add `resyStartOperation`

### Modified Files

- `infra/compose/runtime/docker-compose.dev.yml` — add `steel-browser` service
- `apps/web/src/shared/env/server-env.ts` — add optional `STEEL_API_URL`
- `apps/web/src/bootstrap/container.ts` — wire `SteelSessionPort` from `@cogni/steel-browser/adapters/rest`
- `apps/web/src/ports/reservation.port.ts` — update `ReservationProviderPort`: `captureSession` and `attemptBooking` accept `profileKey` instead of `sessionStateCiphertext`
- `apps/web/src/adapters/server/reservations/resy-provider.adapter.ts` — Steel CDP instead of `chromium.launch()`; inject `SteelSessionPort` via constructor
- `apps/web/src/features/reservations/services/connection-manager.ts` — add `startResyConnection()`, update `captureResyConnection()`; add `SteelSessionPort` to deps
- `apps/web/src/app/api/v1/reservations/connections/resy/capture/route.ts` — wire updated service
- `packages/db-schema/src/reservations.ts` — add `session_lease_until` column
- Migration: `0029_steel_session_lease.sql`
- `pnpm-workspace.yaml` — add `packages/steel-browser`

### Out of Scope

- MCP integration (general browsing agent is a separate task)
- Multi-user concurrency (multiple Steel containers)
- Steel Cloud / API key auth
- Removing `session_state_ciphertext` column (deprecate only — migration is deferred)
- Frontend UI changes beyond debug URL redirect
- Gmail connection changes

## Plan

- [ ] **1. Shared package: `packages/steel-browser`**
  Create capability package following `operator-wallet` pattern:
  - `src/port/steel-session.port.ts` — `SteelSessionPort` interface:
    ```typescript
    interface SteelSessionResult {
      sessionId: string;
      debugUrl: string;
      websocketUrl: string;
    }
    interface SteelSessionPort {
      createSession(opts: { profileKey: string; timeout?: number }): Promise<SteelSessionResult>;
      releaseSession(sessionId: string): Promise<void>;
    }
    ```
  - `src/domain/errors.ts` — `SteelUnavailableError` (connection refused / timeout), `SteelSessionError` (API returned error)
  - `src/adapters/rest/steel-rest-client.adapter.ts` — thin fetch wrapper around Steel `POST /v1/sessions` and `DELETE /v1/sessions/{id}`. Constructor takes `{ baseUrl: string }`. No env reads.
  - `package.json` exports: `"."` (port + errors), `"./adapters/rest"` (adapter)
  - Add to `pnpm-workspace.yaml`, verify `pnpm packages:build`

- [ ] **2. Docker Compose: Steel service**
  Add `steel-browser` to `docker-compose.dev.yml`:
  - Image: `ghcr.io/steel-dev/steel-browser`
  - Profile: `steel` (opt-in for dev)
  - Volume: `steel-profiles` named volume
  - Network: `cogni-edge`
  - Healthcheck: `curl -f http://localhost:3000/v1/health`
  - Ports 3000 + 9223 internal only (no host binding)

- [ ] **3. DB: lease column + env**
  - Add `sessionLeaseUntil` (timestamptz, nullable) to `reservation_connections` in `packages/db-schema/src/reservations.ts`
  - Generate migration `0029_steel_session_lease.sql`
  - Add `STEEL_API_URL` to `server-env.ts` (optional, default undefined)
  - Verify: `pnpm packages:build`

- [ ] **4. Port contract update**
  Update `ReservationProviderPort` in `apps/web/src/ports/reservation.port.ts`:
  - `captureSession()` → returns `SessionCaptureResult` with `profileKey: string` instead of `sessionStateCiphertext`
  - `attemptBooking(params)` → `BookingAssistParams` takes `profileKey: string` instead of `sessionStateCiphertext`
  - Keep `sessionStateCiphertext` fields as optional/deprecated for backward compat during transition
  Add `resyStartOperation` Zod contract: input `{}`, output `{ connectionId: string, debugUrl: string }`

- [ ] **5. Feature service: Steel orchestration**
  In `connection-manager.ts`:
  - Add `SteelSessionPort` to `ReservationConnectionManagerDeps`
  - New `startResyConnection(userId, deps)`:
    1. Atomic lease: `UPDATE ... WHERE (lease IS NULL OR lease < now()) RETURNING *`
    2. `deps.steel.createSession({ profileKey: connectionId })`
    3. Return `{ connectionId, debugUrl }`
    4. On Steel error: clear lease, throw typed error
  - Update `captureResyConnection(userId, deps)`:
    1. `deps.steel.releaseSession(sessionId)` (sessionId from metadata)
    2. Clear `session_lease_until`
    3. Update connection status
    4. Record event

- [ ] **6. ResyProviderAdapter: CDP connection**
  - Add `SteelSessionPort` as constructor dependency (injected from container)
  - `attemptBooking()`:
    1. `steel.createSession({ profileKey: params.profileKey })`
    2. `chromium.connectOverCDP(result.websocketUrl)`
    3. Navigate + attempt booking (existing page logic unchanged)
    4. `steel.releaseSession(result.sessionId)` in finally block
    5. On `SteelUnavailableError` → return `{ success: false, error: "Browser service unavailable" }`
  - `captureSession()` → update to return `profileKey` instead of `sessionStateCiphertext`

- [ ] **7. Route wiring**
  - Create `POST .../resy/start` route: validate with `resyStartOperation`, delegate to `startResyConnection()`, return `{ connectionId, debugUrl }`
  - Update `POST .../resy/capture` route: delegate to updated `captureResyConnection()`
  - Wire `SteelSessionPort` from container into both routes' deps

- [ ] **8. Container wiring**
  In `bootstrap/container.ts`:
  - Import `SteelRestClientAdapter` from `@cogni/steel-browser/adapters/rest`
  - Wire: `steelSession: serverEnv.STEEL_API_URL ? new SteelRestClientAdapter({ baseUrl: serverEnv.STEEL_API_URL }) : undefined`
  - Add to `Container` interface: `steelSession: SteelSessionPort | undefined`

- [ ] **9. Tests**
  - `packages/steel-browser/tests/steel-rest-client.test.ts`: mock fetch, test create/release/error → typed errors
  - `apps/web/tests/unit/features/reservations/connection-manager.test.ts`: update for lease logic — verify atomic acquire, 409 on held lease, cleared on release, Steel error → lease rollback
  - Verify: `pnpm test` passes

- [ ] **10. Smoke test**
  - `docker compose --profile steel up -d steel-browser`
  - Verify: `curl http://localhost:3000/v1/health`
  - Manual: create → debugUrl opens → release → verify
  - `pnpm check:fast` passes

## Validation

**Static checks:**

```bash
pnpm packages:build   # steel-browser + db-schema build
pnpm check:fast       # typecheck + lint + unit tests
```

**Expected:** All pass.

**Steel service:**

```bash
docker compose --profile steel up -d steel-browser
curl -s http://localhost:3000/v1/health | jq .
```

**Expected:** Health OK.

**Manual E2E:**

1. Start dev stack + Steel: `pnpm dev:stack` + `docker compose --profile steel up -d`
2. Connect Resy → verify debugUrl opens live browser
3. Log into resy.com → click Done → status shows Connected
4. Trigger booking attempt → verify logs show `connectOverCDP`

## Review Checklist

- [ ] **Work Item:** `task.0225` linked in PR body
- [ ] **Spec:** reservation-assistant-v1 invariants upheld
- [ ] **Package:** `@cogni/steel-browser` follows capability package shape (NO_SRC_IMPORTS, PURE_LIBRARY)
- [ ] **Contracts:** `resyStartOperation` Zod contract exists and is validated in route
- [ ] **Tests:** Steel client tests, lease logic tests, updated connection-manager tests
- [ ] **Infra:** Steel service starts cleanly with healthcheck
- [ ] **Reviewer:** assigned and approved

## Design Decisions

**Why a shared package?** Both the web app (user auth flow) and Temporal workers (agent booking) need Steel access. Per BOUNDARY_PLACEMENT: if >1 runtime uses a capability, it lives in `packages/`. The `@cogni/steel-browser` package exports the port + errors from `"."` and the REST adapter from `"./adapters/rest"`. Runtime wiring (env reads, lifecycle) stays in `bootstrap/container.ts`.

**Why atomic lease instead of application-level check?** A `SELECT` then `UPDATE` is a TOCTOU race. Two requests can both see an expired lease, both create Steel sessions (the second fails at Steel since OSS is single-session), and both try to set the lease. Atomic `UPDATE ... WHERE ... RETURNING *` eliminates this at the DB level.

**Why typed domain errors?** Steel is an external system boundary. Raw fetch failures become `SteelUnavailableError` (503 to user) or `SteelSessionError` (502 to user). The feature service catches these to roll back the lease. Routes map them to HTTP status codes.

**Why deprecate `session_state_ciphertext` instead of removing?** The column migration is a separate concern. Existing data may reference it. For this PR: mark it unused, stop writing to it, accept `profileKey` in the port interface. Column removal is a follow-up.

**Why not Playwright MCP?** CDP endpoint fixed at startup — can't switch per-user session. Our booking flow is a structured Temporal activity, not a general-purpose browsing agent.

**Multi-user future?** Run N Steel containers behind round-robin allocator. Lease still prevents double-booking. Separate task.

## PR / Links

-

## Attribution

- Research: upstream spike.0230, MCP client MVP branch
- Original reservation MVP: task.0166
