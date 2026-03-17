// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@contracts/reservations.connections.v1.contract`
 * Purpose: Contracts for Gmail and Resy connection flows.
 * Scope: Wire-format schemas only.
 * Side-effects: none
 * @internal
 */

import { z } from "zod";

const BaseConnectionSchema = z.object({
  id: z.string().uuid().nullable(),
  status: z.enum([
    "disconnected",
    "pending",
    "connected",
    "expired",
    "reconnect_required",
    "error",
  ]),
  provider: z.string(),
  providerAccountEmail: z.string().email().nullable(),
  providerSubject: z.string().nullable(),
  tokenExpiresAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime().nullable(),
});

export const GmailConnectionSchema = BaseConnectionSchema.extend({
  kind: z.literal("gmail"),
  watchStatus: z.enum(["inactive", "active", "expired", "error"]),
  watchExpiryAt: z.string().datetime().nullable(),
  renewalStatus: z.enum(["healthy", "due", "expired", "reconnect_required"]),
  historyCursor: z.string().nullable(),
});

export const ResyConnectionSchema = BaseConnectionSchema.extend({
  kind: z.literal("resy"),
  sessionStatus: z
    .enum([
      "disconnected",
      "pending",
      "connected",
      "expired",
      "reconnect_required",
      "error",
    ])
    .nullable(),
  lastVerifiedAt: z.string().datetime().nullable(),
  expiresHintAt: z.string().datetime().nullable(),
});

export const ConnectionsOutputSchema = z.object({
  gmail: GmailConnectionSchema,
  resy: ResyConnectionSchema,
});

export const reservationsConnectionsReadOperation = {
  id: "reservations.connections.read.v1",
  summary: "Read reservation connection state",
  description: "Returns current Gmail and Resy connection state for the user.",
  input: z.object({}),
  output: ConnectionsOutputSchema,
} as const;

export const gmailConnectStartOperation = {
  id: "reservations.connections.gmail.start.v1",
  summary: "Start Gmail connection",
  description: "Returns the Google OAuth authorization URL for Gmail access.",
  input: z.object({}),
  output: z.object({
    authorizationUrl: z.string().url(),
  }),
} as const;

export const gmailRenewOperation = {
  id: "reservations.connections.gmail.renew.v1",
  summary: "Renew Gmail watch",
  description: "Renews the Gmail watch registration for the connected account.",
  input: z.object({}),
  output: GmailConnectionSchema,
} as const;

export const resyCaptureOperation = {
  id: "reservations.connections.resy.capture.v1",
  summary: "Capture Resy session",
  description:
    "Launches a short-lived controlled browser flow to capture Resy session state.",
  input: z.object({
    startUrl: z.string().url().optional(),
  }),
  output: ResyConnectionSchema,
} as const;

export type ConnectionsOutput = z.infer<typeof ConnectionsOutputSchema>;
