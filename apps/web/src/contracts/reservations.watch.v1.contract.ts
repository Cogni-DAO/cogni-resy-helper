// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@contracts/reservations.watch.v1.contract`
 * Purpose: Contracts for reservation watch CRUD.
 * Scope: Wire-format schemas only.
 * Side-effects: none
 * @internal
 */

import { z } from "zod";

const JsonRecordSchema = z.record(z.string(), z.unknown());

export const WatchResponseSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  platform: z.literal("resy"),
  restaurant: z.string().min(1),
  restaurantSlug: z.string().nullable(),
  partySize: z.number().int().positive(),
  dateStart: z.string().datetime(),
  dateEnd: z.string().datetime(),
  timeStart: z.string().regex(/^\d{2}:\d{2}$/),
  timeEnd: z.string().regex(/^\d{2}:\d{2}$/),
  idealTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable(),
  hardConstraints: JsonRecordSchema,
  softConstraints: JsonRecordSchema,
  autoClaim: z.boolean(),
  notifySetupUrl: z.string().url().nullable(),
  status: z.enum([
    "active",
    "paused",
    "fulfilled",
    "cancelled",
    "expired",
    "reconnect_required",
  ]),
  lastMatchedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const WatchCreateInputSchema = z.object({
  restaurant: z.string().min(1),
  restaurantSlug: z.string().min(1).optional(),
  partySize: z.number().int().positive(),
  dateStart: z.string().datetime(),
  dateEnd: z.string().datetime(),
  timeStart: z.string().regex(/^\d{2}:\d{2}$/),
  timeEnd: z.string().regex(/^\d{2}:\d{2}$/),
  idealTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  hardConstraints: JsonRecordSchema.optional(),
  softConstraints: JsonRecordSchema.optional(),
  autoClaim: z.boolean(),
});

export const watchCreateOperation = {
  id: "reservations.watch.create.v1",
  summary: "Create a reservation watch",
  description: "Creates a canonical watch window for Resy Notify matching.",
  input: WatchCreateInputSchema,
  output: WatchResponseSchema,
} as const;

export const WatchListOutputSchema = z.object({
  watches: z.array(WatchResponseSchema),
});

export const watchListOperation = {
  id: "reservations.watch.list.v1",
  summary: "List reservation watches",
  description: "Returns all watches for the current user.",
  input: z.object({}),
  output: WatchListOutputSchema,
} as const;

export const WatchStatusUpdateInputSchema = z.object({
  status: z.enum(["active", "paused", "cancelled"]),
});

export const watchStatusUpdateOperation = {
  id: "reservations.watch.update-status.v1",
  summary: "Update reservation watch status",
  description: "Activates, pauses, or cancels a reservation watch.",
  input: WatchStatusUpdateInputSchema,
  output: WatchResponseSchema,
} as const;

export type WatchCreateInput = z.infer<typeof WatchCreateInputSchema>;
export type WatchRequestResponse = z.infer<typeof WatchResponseSchema>;
export type WatchListOutput = z.infer<typeof WatchListOutputSchema>;
export type WatchStatusUpdateInput = z.infer<
  typeof WatchStatusUpdateInputSchema
>;
