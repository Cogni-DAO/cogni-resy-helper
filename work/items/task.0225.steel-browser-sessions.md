---
id: task.0225
type: task
title: "Steel browser sessions — tenant-authenticated browser automation for reservation booking"
status: needs_implement
priority: 0
rank: 1
estimate: 3
summary: Replace local Chromium launch with self-hosted Steel browser sessions for Resy auth capture and booking execution.
outcome: Users authenticate Resy via a remote Steel debug browser; the agent replays that session via CDP for booking attempts; no local browser binary required at runtime.
spec_refs: reservation-assistant-v1
assignees: derekg1729
credit:
project:
branch: feat/steel-browser-sessions
pr:
reviewer:
revision: 0
blocked_by:
deploy_verified: false
created: 2026-03-29
updated: 2026-03-29
labels: [reservations, browser, steel, infra]
external_refs:
---

# Steel Browser Sessions

## Context

The reservation assistant (task.0166) launches **local Chromium** via `playwright` for session capture and booking execution. This breaks in Docker (no display server), requires Playwright binaries in the container image, and can't work for remote deployments.

Steel.dev replaces local Chromium with a self-hosted Docker browser that persists browser profiles via `userDataDir` on a named volume, exposes a `debugUrl` for user authentication, and exposes a `websocketUrl` (CDP endpoint) for Playwright to connect remotely.

### Research Findings

| Question | Answer |
|----------|--------|
| Steel concurrency (OSS) | Single active session. MVP single-user is fine. |
| Steel auth model | Network isolation only. No API key for self-hosted. |
| Why not Playwright MCP? | CDP endpoint fixed at server startup — can't switch per-session. Our booking flow is a structured activity, not a general agent. |
| Why not Steel MCP server? | Puppeteer-based, less mature. Direct Playwright-over-CDP is simpler. |
| Steel Docker image | `ghcr.io/steel-dev/steel-browser` — ports 3000 (API) + 9223 (CDP). |

### Architecture

```text
User Auth Flow:
  POST .../resy/start
    → Steel: POST /v1/sessions (userDataDir=connectionId, persist=true)
    → Return { connectionId, debugUrl }
    → User opens debugUrl, logs into resy.com
    → User clicks "Done"
  POST .../resy/capture
    → Steel: release session → profile persisted to volume
    → Connection row: status=connected

Agent Booking Flow (Temporal activity):
  1. Resolve connection → connectionId = profile key
  2. Steel: create session (same userDataDir, persist=true)
  3. Playwright: chromium.connectOverCDP(websocketUrl)
  4. Navigate Resy booking flow
  5. Steel: release session
  6. Record result
```

## Requirements

### Functional

- R1: `POST .../resy/start` creates a Steel session and returns `{ connectionId, debugUrl }`.
- R2: `POST .../resy/capture` releases the Steel session, verifies Resy auth cookies exist in the profile, and updates the connection to `status: connected`.
- R3: `ResyProviderAdapter.attemptBooking()` connects to Steel-managed browser via CDP instead of launching local Chromium.
- R4: Lease-based concurrency: `session_lease_until` timestamp on the reservation connection prevents double-use. Steel timeout and lease both 15 minutes.
- R5: Stale leases are safe — Steel auto-releases timed-out sessions, persisted `userDataDir` remains valid.
- R6: Expired Resy auth → `reconnectRequired: true` → connection moves to `reconnect_required`.

### Non-Functional

- R7: Steel runs as shared Docker service on internal `cogni-edge` network. No external exposure.
- R8: No Playwright binary in app container — only `playwright` npm package for CDP client.
- R9: `pnpm check:fast` passes.

### Spec Invariants (reservation-assistant-v1)

| Invariant | How |
|-----------|-----|
| NO_STANDING_BROWSER | Steel sessions created on-demand, released immediately after use. |
| SHORT_LIVED_EXECUTOR | 15-minute lease + Steel timeout. Released after booking attempt. |
| ENCRYPTED_SESSION_STATE | Profile lives in Docker volume (not DB). Connection row stores only connection ID as profile key. |
| REAUTH_IS_EXPLICIT | Failed auth → `reconnect_required` → user re-authenticates via new debug session. |
| ONE_ACTIVE_CLAIM_PER_WATCH | Lease prevents concurrent sessions for the same connection. |

## Allowed Changes

### New Files

- `apps/web/src/adapters/server/steel/steel-client.adapter.ts` — Thin REST client (~60 lines)
- `apps/web/src/ports/steel.port.ts` — Port interface for Steel session lifecycle
- `apps/web/tests/unit/adapters/server/steel/steel-client.test.ts` — Unit tests

### Modified Files

- `infra/compose/runtime/docker-compose.dev.yml` — Add `steel-browser` service
- `apps/web/src/shared/env/server-env.ts` — Add optional `STEEL_API_URL`
- `apps/web/src/adapters/server/reservations/resy-provider.adapter.ts` — Steel CDP instead of `chromium.launch()`
- `apps/web/src/app/api/v1/reservations/connections/resy/start/route.ts` — Wire Steel session creation
- `apps/web/src/app/api/v1/reservations/connections/resy/capture/route.ts` — Wire Steel release + verify
- `apps/web/src/bootstrap/container.ts` — Wire `SteelSessionPort`
- `packages/db-schema/src/reservations.ts` — Add `session_lease_until` column
- Migration: `0029_steel_session_lease.sql`

### Out of Scope

- MCP integration (general browsing agent is a separate task)
- Multi-user concurrency (multiple Steel containers)
- Steel Cloud / API key auth
- Frontend UI changes beyond debug URL redirect
- Gmail connection changes

## Plan

- [ ] **1. Docker Compose: Steel service**
  Add `steel-browser` to `docker-compose.dev.yml`. Image `ghcr.io/steel-dev/steel-browser`, profile `steel`, volume `steel-profiles`, network `cogni-edge`. Ports 3000 + 9223 internal only.

- [ ] **2. DB: lease column**
  Add `sessionLeaseUntil` (timestamptz, nullable) to `reservation_connections` in `packages/db-schema/src/reservations.ts`. Generate migration. Verify `pnpm packages:build`.

- [ ] **3. Port + adapter: Steel client**
  `SteelSessionPort` interface: `createSession({ profileKey, timeout? }) → { sessionId, debugUrl, websocketUrl }`, `releaseSession(sessionId) → void`. Implement as fetch wrapper. Add `STEEL_API_URL` to server-env (optional). Wire into container (undefined when not set).

- [ ] **4. Resy routes: Steel integration**
  `POST .../resy/start`: check lease (409 if active) → create Steel session → set lease → return debugUrl. `POST .../resy/capture`: release session → clear lease → update status → record event.

- [ ] **5. ResyProviderAdapter: CDP connection**
  Replace `chromium.launch()` with `steelClient.createSession()` + `chromium.connectOverCDP(websocketUrl)`. Keep auth detection logic. Release session in finally block.

- [ ] **6. Tests**
  Steel client: mock fetch, verify create/release/error paths. Lease logic: verify 409 when active, cleared on release. `pnpm test` passes.

- [ ] **7. Smoke test**
  `docker compose --profile steel up -d` → verify health → manual create/release flow → `pnpm check:fast` passes.

## Validation

**Static checks:**

```bash
pnpm packages:build
pnpm check:fast
```

**Expected:** All pass.

**Steel service:**

```bash
docker compose --profile steel up -d steel-browser
curl -s http://localhost:3000/v1/health | jq .
```

**Expected:** Health OK.

**Manual E2E:**

1. Start dev stack + Steel
2. Connect Resy → verify debugUrl opens live browser
3. Log into resy.com → click Done → status shows Connected
4. Trigger booking attempt → verify logs show `connectOverCDP`

## Review Checklist

- [ ] **Work Item:** `task.0225` linked in PR body
- [ ] **Spec:** reservation-assistant-v1 invariants upheld
- [ ] **Tests:** Steel client unit tests, lease logic tests
- [ ] **Infra:** Steel service starts cleanly
- [ ] **Reviewer:** assigned and approved

## Design Decisions

**Why Steel over raw Playwright?** Local `chromium.launch()` doesn't work in Docker, requires ~400MB binaries, can't do remote debug for user auth. Steel: Docker-native lifecycle, persisted profiles, debug URLs, CDP endpoints.

**Why not Playwright MCP?** CDP endpoint fixed at startup — can't switch per-user session. Direct Playwright-over-CDP in the activity is simpler.

**Why lease instead of lock?** Self-healing: if app crashes, Steel auto-releases after timeout, lease expires naturally. No distributed lock needed.

**Multi-user future?** Run N Steel containers behind round-robin allocator. Lease still prevents double-booking. Separate task.

## PR / Links

-

## Attribution

- Research: upstream spike.0230, MCP client MVP branch
- Original reservation MVP: task.0166
