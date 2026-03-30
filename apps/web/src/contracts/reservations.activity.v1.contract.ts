// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@contracts/reservations.activity.v1.contract`
 * Purpose: Contracts for reservation activity log responses.
 * Scope: Wire-format schemas only.
 * Side-effects: none
 * @internal
 */

import { z } from "zod";

export const ReservationActivityEventSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  watchRequestId: z.string().uuid().nullable(),
  connectionId: z.string().uuid().nullable(),
  alertReceiptId: z.string().uuid().nullable(),
  source: z.enum(["system", "gmail", "resy", "executor"]),
  eventType: z.enum([
    "gmail_connected",
    "gmail_watch_renewed",
    "gmail_watch_expired",
    "resy_connected",
    "watch_created",
    "watch_updated",
    "watch_paused",
    "watch_cancelled",
    "alert_received",
    "alert_deduped",
    "alert_matched",
    "alert_ignored",
    "claim_started",
    "claim_succeeded",
    "claim_failed",
    "reconnect_required",
  ]),
  dedupeKey: z.string().nullable(),
  payloadJson: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string().datetime(),
});

export const reservationActivityListOperation = {
  id: "reservations.activity.list.v1",
  summary: "List reservation activity events",
  description:
    "Returns the reservation assistant activity log for the current user.",
  input: z.object({
    watchId: z.string().uuid().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
  }),
  output: z.object({
    events: z.array(ReservationActivityEventSchema),
  }),
} as const;

export type ReservationActivityEventResponse = z.infer<
  typeof ReservationActivityEventSchema
>;
