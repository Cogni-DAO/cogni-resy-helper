---
id: task.0166
type: task
title: Reservation Assistant V1 Demo
status: done
priority: 1
rank: 1
estimate: 4
summary: "Build a single-user reservation assistant demo that ingests official Resy Notify emails, de-dupes and matches them against a watch window, and auto-attempts booking through the user's saved Resy session."
outcome: "Single-user working demo: friend connects Gmail, connects Resy through a user-driven controlled browser login, creates a flexible watch window, system ingests and de-dupes Resy Notify emails, matches against intent window, auto-attempts claim with single-claim concurrency control, and immediately notifies him of success, failure, or reconnect-required state."
spec_refs: reservation-assistant-v1
assignees: claude
credit:
project:
branch: claude/reservation-assistant-mvp-Sy4le
pr:
reviewer:
revision: 1
blocked_by:
deploy_verified: false
created: 2026-03-16
updated: 2026-03-18
labels: [mvp, reservations]
external_refs:
---

# Reservation Assistant MVP

## Design

### Outcome

Deliver the smallest truthful demo that can actually help one friend get a hard reservation: connect Gmail, connect Resy, define a flexible watch window, ingest official Resy Notify emails, and immediately attempt the official booking flow using saved authenticated session state.

### Approach

**Solution**: Implement a narrow Resy-only demo loop:

- Gmail OAuth + Gmail watch/push so Resy Notify emails arrive with low latency
- User-driven Resy session capture in a controlled browser flow, with MFA/re-auth handled explicitly
- App-owned watch window model: restaurant, party size, date range, time range, ideal time, hard constraints, soft constraints, `auto_claim`
- Resy Notify email parser + matcher against active watches, with hard dedupe and idempotency
- Short-lived Playwright claim executor that uses saved auth state only when a matching alert arrives
- Activity log + immediate success/failure notification + reconnect flow when Gmail watch or Resy session expires

**Reuses**:

- `packages/db-schema` patterns (pgTable, enableRLS, timestamp conventions)
- Existing contract-first API route pattern
- Existing auth/session patterns
- Pino logging, shared observability

**Rejected**:

- **Scraping/polling approach**: Violates platform TOS; replaced by official Resy Notify email ingestion
- **Generic provider abstraction**: Premature for a one-friend demo; v1 is Resy only
- **Manual per-attempt approval**: Too slow for the product goal; replaced by watch-level `auto_claim`
- **Temporal-first orchestration**: Too much overhead before the Gmail-to-claim loop works end to end
- **Manual ingestion as primary flow**: Not the product; keep only as debug fallback if needed
- **OpenTable support in v1**: Scope creep before the first real provider works

### Invariants

<!-- CODE REVIEW CRITERIA -->

- [ ] NO_SCRAPING: Never scrape protected endpoints, bypass anti-bot, rotate accounts, or evade detection
- [ ] OFFICIAL_ALERTS_ONLY: Alerts come from official Resy Notify emails, not inventory polling
- [ ] WATCH_INTENT_CANONICAL: The app-owned watch window is the source of truth; provider alerts are signals only
- [ ] AUTO_CLAIM_IS_EXPLICIT: Auto-claim must be enabled at the watch level; no implicit booking
- [ ] NO_STANDING_BROWSER: Never keep a logged-in browser running indefinitely
- [ ] SHORT_LIVED_EXECUTOR: Every claim attempt launches a fresh browser and exits promptly
- [ ] ENCRYPTED_SESSION_STATE: Stored Resy auth state is encrypted at rest and never exposed to the browser app
- [ ] REAUTH_IS_EXPLICIT: Expired Resy auth or Gmail watch state produces a clear reconnect flow
- [ ] GMAIL_WATCH_RENEWAL_REQUIRED: Gmail watch renewals are first-class lifecycle work, not an implicit assumption
- [ ] EMAIL_EVENT_DEDUP: Duplicate Gmail push events or duplicate email deliveries collapse to one logical alert
- [ ] CLAIM_ATTEMPT_IDEMPOTENT: Retrying the same logical alert does not create duplicate claim attempts
- [ ] ONE_ACTIVE_CLAIM_PER_WATCH: At most one active claim attempt may exist per watch
- [ ] AUDIT_TRAIL: Every important transition is logged in the activity log with enough detail to debug the loop
- [ ] IMMEDIATE_USER_NOTIFICATION: Success, failure, reconnect-required, and Gmail-watch-expired states notify the user immediately
- [ ] NO_MULTI_ACCOUNT_ABUSE: One real user account only; no account farming, proxy rotation, evasion, or parallel claim spam
- [ ] CONTRACT_FIRST: All API shapes defined in contracts using Zod
- [ ] ARCHITECTURE_ALIGNMENT: Follows hexagonal layering (spec: architecture)
- [ ] SIMPLE_SOLUTION: Optimize for the working Gmail-to-claim loop, not reusable scaffolding

### Files

<!-- High-level scope -->

- Create/modify: `packages/db-schema/src/reservations.ts` — watch windows, activity log, connection/session state, dedupe/idempotency metadata
- Modify: `packages/db-schema/src/index.ts` — re-export reservations schema
- Modify: `packages/db-schema/package.json` — add reservations export
- Create/modify: `apps/web/src/contracts/reservations.watch.v1.contract.ts` — canonical watch contracts
- Create: `apps/web/src/contracts/reservations.connections.v1.contract.ts` — Gmail/Resy connection setup contracts
- Create/modify: `apps/web/src/contracts/reservations.activity.v1.contract.ts` — activity log contract
- Create/modify: `apps/web/src/core/reservations/` — window matching rules and domain types
- Create/modify: `apps/web/src/features/reservations/services/` — watch management, Gmail ingestion orchestration, dedupe/concurrency control, auto-claim orchestration
- Create/modify: `apps/web/src/adapters/server/reservations/` — encrypted Resy session handling and Playwright executor
- Create: `apps/web/src/adapters/server/gmail/` — Gmail OAuth, watch registration, message fetch, parser helpers
- Modify: `apps/web/src/bootstrap/container.ts` — wire reservation adapters
- Create: `apps/web/src/app/api/v1/reservations/` — API routes
- Create/modify: `apps/web/src/app/(app)/reservations/` — four-screen product flow
- Modify: `docs/guides/reservation-assistant.md` — setup and operational guide for the real demo loop

## Requirements

- Gmail OAuth + Gmail watch/push ingestion for Resy Notify emails
- User-driven controlled-browser Resy login + encrypted saved Playwright session state
- Window-based watch model owned by the app
- Email parser + matcher from Resy Notify email to active watch
- Dedupe for Gmail events and logical alerts
- Idempotent claim attempts with one-active-claim-per-watch guard
- Playwright claim executor using short-lived browser runs only
- Immediate success/failure/reconnect-required notification
- Reconnect flow when Gmail watch or Resy session expires
- Gmail watch renewal handling when the Gmail subscription nears expiry
- Contract-first routes for connections, watch CRUD, and activity log
- Checked-in migration(s) for any reservation schema changes
- Tests for parser, matcher, contracts, and core watch/claim paths

## Allowed Changes

- `packages/db-schema/src/` — new schema file + barrel update
- `apps/web/src/contracts/` — new contract files
- `apps/web/src/core/reservations/` — new domain module
- `apps/web/src/features/reservations/` — new feature vertical
- `apps/web/src/adapters/server/gmail/` — Gmail integration for official alert ingestion
- `apps/web/src/adapters/server/reservations/` — new adapter directory
- `apps/web/src/bootstrap/container.ts` — DI wiring
- `apps/web/src/app/(app)/reservations/` — user-facing screens: Connections, Watches, Activity
- `apps/web/src/app/api/v1/reservations/` — API routes
- `docs/guides/` — dev instructions doc

## Plan

- [x] Design (this document)
- [x] Rewrite reservation schema around watch windows, activity log, and connection/session state
- [x] Add checked-in migration(s) for the reservation schema
- [x] Create core domain types + matching rules (`apps/web/src/core/reservations/`)
- [x] Create API contracts for connections, watch CRUD, and activity log
- [x] Create Gmail adapters and ingestion orchestration
- [x] Create Gmail watch renewal handling
- [x] Create Resy session capture + encrypted storageState handling + reconnect flow
- [x] Create Playwright auto-claim executor
- [x] Create dedupe/idempotency + one-active-claim-per-watch controls
- [x] Create feature services for watch management and alert-to-claim flow
- [x] Wire DI container (`apps/web/src/bootstrap/container.ts`)
- [x] Create API routes (`apps/web/src/app/api/v1/reservations/`)
- [x] Build the user flow in `apps/web/src/app/(app)/reservations/` with Connections, Watches, and Activity
- [x] Update guide and setup docs for the real loop
- [x] Validate with `pnpm check`

## Validation

**Command:**

```bash
pnpm check
```

**Expected:** Typecheck, lint, format, docs, and relevant tests pass.

## Review Checklist

- [ ] **Work Item:** `task.0166` linked in PR body
- [ ] **Spec:** all invariants upheld from `reservation-assistant-v1`
- [ ] **Tests:** parser, matcher, dedupe/idempotency, contracts, and claim path covered
- [ ] **Reviewer:** assigned and approved

## Review Feedback

### Revision 2 — Direction Change

1. **Wrong outcome**: CRUD API + provider abstraction + Temporal + Resy stub is scaffolding, not a functioning demo. The task must be rewritten around the real Gmail-to-claim loop.

2. **Wrong approval model**: Per-attempt approval is too slow for the product goal. Auto-claim must be explicit at watch creation time.

3. **Wrong abstraction level**: "Official notify integration path" is too vague. The product is explicitly Gmail-triggered Resy auto-claim using stored session state.

4. **Temporal too early**: Do not require workflow orchestration before Gmail ingestion and claim execution work end to end.

5. **Missing setup flow**: The task must explicitly define Connect Gmail, Connect Resy, Create Watch, and reconnect handling as first-class deliverables.

6. **Missing dedupe and idempotency**: Duplicate Gmail events, duplicate emails, and duplicate claim retries must be treated as first-class design constraints.

7. **Missing single-user abuse guardrails**: The demo must explicitly forbid account farming, proxy rotation, evasion, and parallel claim spam.

## PR / Links

-

## Attribution

- claude (design + implementation)
