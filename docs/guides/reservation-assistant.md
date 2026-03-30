---
id: reservation-assistant-guide
type: guide
title: Reservation Assistant — Local Demo Guide
status: draft
trust: draft
summary: Setup and operational notes for the single-user Gmail-triggered Resy auto-claim demo.
read_when: Connecting Gmail, capturing Resy session state, or validating the reservation assistant loop locally.
owner: claude
created: 2026-03-16
updated: 2026-03-18
---

# Reservation Assistant — Local Demo Guide

> Work item: task.0166 | Branch: claude/reservation-assistant-mvp-Sy4le

## What ships in v1

The MVP is a single-user, Resy-only loop:

1. Connect Gmail with Google OAuth
2. Register a Gmail watch for low-latency push ingestion
3. Capture a Resy browser session through a short-lived Playwright flow
4. Create an app-owned watch window with `auto_claim`
5. Ingest official Resy Notify emails from Gmail push
6. De-dupe the alert, match it against the watch, and run one short-lived claim attempt
7. Append every important transition to the reservation activity log

## Required Environment

These settings must exist in the local environment before the Gmail flow will work:

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GMAIL_PUBSUB_TOPIC`
- `INTERNAL_OPS_TOKEN`

The current implementation uses the existing auth/env setup for Google OAuth credentials and expects `GMAIL_PUBSUB_TOPIC` to point at the Pub/Sub topic that Gmail should publish watch notifications into.

## Local Setup

```bash
pnpm dev:stack
pnpm db:migrate
pnpm dev
```

Open [http://localhost:3000/reservations](http://localhost:3000/reservations) after signing in.

## Gmail Push Setup

The app registers Gmail `users.watch` against the topic in `GMAIL_PUBSUB_TOPIC`.

You still need a Pub/Sub push subscription that forwards topic deliveries to:

```text
POST /api/v1/reservations/connections/gmail/push
Authorization: Bearer $INTERNAL_OPS_TOKEN
```

The push endpoint expects the standard Pub/Sub envelope where `message.data` is base64 JSON containing:

```json
{
  "emailAddress": "friend@example.com",
  "historyId": "123456"
}
```

## Resy Session Capture

The Resy connect button launches a short-lived Playwright browser on the machine running the app.

- Complete the official Resy login flow in that browser window
- The app stores encrypted Playwright storage state
- Browsers are never kept standing after the capture completes

## Watch Behavior

Each watch is app-owned and canonical:

- `restaurant`
- `partySize`
- `dateStart` / `dateEnd` as inclusive UTC day bounds when created from date-only UI inputs
- `timeStart` / `timeEnd`
- `idealTime`
- `autoClaim`

Provider alerts are only signals. Matching is done against the app watch window, not exact provider slots stored elsewhere.

## Activity Events

The activity log records:

- Gmail connect / watch renewal
- Resy connect
- Alert received / de-duped / matched / ignored
- Claim started / succeeded / failed
- Reconnect-required transitions

The reservations page also surfaces these terminal states with an in-page notice and, when the browser allows it, a browser notification while the page is open.

## Operational Notes

- The Gmail push endpoint is protected by `INTERNAL_OPS_TOKEN` so the Pub/Sub subscription should send that bearer token.
- Resy session expiry moves future claim attempts into reconnect-required behavior instead of silently retrying.
- Claim concurrency is limited to one active claim attempt per watch.
- Alert de-dupe is enforced per user across both Gmail-delivery keys and logical alert keys.
- The Playwright claim path only navigates official Resy pages and uses saved authenticated session state.
