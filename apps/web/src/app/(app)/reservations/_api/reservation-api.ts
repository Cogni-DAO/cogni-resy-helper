// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

"use client";

import type { z } from "zod";

import type { reservationActivityListOperation } from "@/contracts/reservations.activity.v1.contract";
import type {
  gmailConnectStartOperation,
  gmailRenewOperation,
  reservationsConnectionsReadOperation,
  resyCaptureOperation,
} from "@/contracts/reservations.connections.v1.contract";
import type {
  WatchCreateInput,
  WatchStatusUpdateInput,
  watchCreateOperation,
  watchListOperation,
} from "@/contracts/reservations.watch.v1.contract";

type ConnectionsResponse = z.infer<
  typeof reservationsConnectionsReadOperation.output
>;
type GmailStartResponse = z.infer<typeof gmailConnectStartOperation.output>;
type GmailRenewResponse = z.infer<typeof gmailRenewOperation.output>;
type ResyCaptureResponse = z.infer<typeof resyCaptureOperation.output>;
type WatchResponse = z.infer<typeof watchCreateOperation.output>;
type WatchListResponse = z.infer<typeof watchListOperation.output>;
type ActivityResponse = z.infer<typeof reservationActivityListOperation.output>;

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    credentials: "same-origin",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({
      error: `HTTP ${response.status}`,
    }));
    throw new Error(body.error || `HTTP ${response.status}`);
  }
  return response.json();
}

export function fetchConnections(): Promise<ConnectionsResponse> {
  return apiFetch("/api/v1/reservations/connections");
}

export function startGmailConnection(): Promise<GmailStartResponse> {
  return apiFetch("/api/v1/reservations/connections/gmail/start", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function renewGmailWatch(): Promise<GmailRenewResponse> {
  return apiFetch("/api/v1/reservations/connections/gmail/renew", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function captureResyConnection(
  startUrl?: string
): Promise<ResyCaptureResponse> {
  return apiFetch("/api/v1/reservations/connections/resy/capture", {
    method: "POST",
    body: JSON.stringify(startUrl ? { startUrl } : {}),
  });
}

export function fetchWatches(): Promise<WatchListResponse> {
  return apiFetch("/api/v1/reservations/watches");
}

export function createWatch(input: WatchCreateInput): Promise<WatchResponse> {
  return apiFetch("/api/v1/reservations/watches", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateWatchStatus(
  watchId: string,
  input: WatchStatusUpdateInput
): Promise<WatchResponse> {
  return apiFetch(`/api/v1/reservations/watches/${watchId}/status`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function fetchActivity(watchId?: string): Promise<ActivityResponse> {
  const url = watchId
    ? `/api/v1/reservations/activity?watchId=${encodeURIComponent(watchId)}`
    : "/api/v1/reservations/activity?limit=50";
  return apiFetch(url);
}
