// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/reservations/services/connection-manager`
 * Purpose: Orchestrates Gmail and Resy connection lifecycle for the reservation assistant.
 * Scope: Feature-level orchestration via ports. Does not contain DB queries, HTTP calls, or browser logic.
 * Side-effects: none (delegates I/O to injected ports)
 * @public
 */

import type { SteelSessionPort } from "@cogni/steel-browser";
import { SteelUnavailableError } from "@cogni/steel-browser";

import type {
  GmailIntegrationPort,
  ReservationProviderPort,
  ReservationStorePort,
} from "@/ports";

const STEEL_SESSION_LEASE_MINUTES = 15;

export interface ReservationConnectionManagerDeps {
  store: ReservationStorePort;
  gmail: GmailIntegrationPort;
  provider: ReservationProviderPort;
  steel: SteelSessionPort | undefined;
}

export async function listConnections(
  userId: string,
  deps: ReservationConnectionManagerDeps
) {
  const rows = await deps.store.listConnections(userId);
  return {
    gmail: rows.find((row) => row.connectionType === "gmail") ?? null,
    resy: rows.find((row) => row.connectionType === "resy") ?? null,
  };
}

export function startGmailConnection(
  userId: string,
  redirectUri: string,
  deps: ReservationConnectionManagerDeps
) {
  return deps.gmail.createAuthorizationUrl({ userId, redirectUri });
}

export async function completeGmailConnection(
  userId: string,
  code: string,
  redirectUri: string,
  deps: ReservationConnectionManagerDeps
) {
  const result = await deps.gmail.exchangeAuthorizationCode({
    code,
    redirectUri,
  });
  const connection = await deps.store.upsertConnection({
    userId,
    connectionType: "gmail",
    status: "connected",
    provider: "gmail",
    providerAccountEmail: result.providerAccountEmail,
    providerSubject: result.providerSubject,
    accessTokenCiphertext: result.accessTokenCiphertext,
    refreshTokenCiphertext: result.refreshTokenCiphertext,
    tokenExpiresAt: result.tokenExpiresAt,
    historyCursor: result.historyCursor,
    watchStatus: result.watchStatus,
    watchExpiryAt: result.watchExpiryAt,
    renewalStatus: result.renewalStatus,
  });

  await deps.store.appendEvent({
    userId,
    connectionId: connection.id,
    source: "gmail",
    eventType: "gmail_connected",
    payloadJson: {
      providerAccountEmail: connection.providerAccountEmail,
      watchExpiryAt: connection.watchExpiryAt?.toISOString() ?? null,
    },
  });

  return connection;
}

export async function renewGmailWatch(
  userId: string,
  deps: ReservationConnectionManagerDeps
) {
  const connection = await deps.store.getConnectionByType(userId, "gmail");
  if (!connection?.refreshTokenCiphertext) {
    throw new Error("Gmail is not connected.");
  }

  const renewal = await deps.gmail.renewWatch({
    refreshTokenCiphertext: connection.refreshTokenCiphertext,
  });

  const updated = await deps.store.upsertConnection({
    userId,
    connectionType: "gmail",
    status: "connected",
    provider: "gmail",
    providerAccountEmail: connection.providerAccountEmail,
    providerSubject: connection.providerSubject,
    accessTokenCiphertext: connection.accessTokenCiphertext,
    refreshTokenCiphertext: connection.refreshTokenCiphertext,
    tokenExpiresAt: connection.tokenExpiresAt,
    historyCursor: renewal.historyCursor,
    watchStatus: renewal.watchStatus,
    watchExpiryAt: renewal.watchExpiryAt,
    renewalStatus: renewal.renewalStatus,
  });

  await deps.store.appendEvent({
    userId,
    connectionId: updated.id,
    source: "gmail",
    eventType: "gmail_watch_renewed",
    payloadJson: {
      watchExpiryAt: updated.watchExpiryAt?.toISOString() ?? null,
    },
  });

  return updated;
}

/**
 * Start a Resy authentication session via Steel browser.
 * Creates or reuses a Resy connection, acquires an atomic lease,
 * and returns a debug URL for the user to log in.
 */
export async function startResyConnection(
  userId: string,
  deps: ReservationConnectionManagerDeps
): Promise<{ connectionId: string; debugUrl: string }> {
  if (!deps.steel) {
    throw new Error(
      "Steel browser service is not configured (STEEL_API_URL not set)."
    );
  }

  // Ensure a Resy connection row exists
  let connection = await deps.store.getConnectionByType(userId, "resy");
  if (!connection) {
    connection = await deps.store.upsertConnection({
      userId,
      connectionType: "resy",
      status: "pending",
      provider: "resy",
    });
  }

  // Atomic lease acquisition — returns null if lease is already held
  const leased = await deps.store.acquireSessionLease(
    connection.id,
    STEEL_SESSION_LEASE_MINUTES
  );
  if (!leased) {
    throw new SessionLeaseHeldError(connection.id);
  }

  // Create Steel session — profile key = connection UUID
  try {
    const session = await deps.steel.createSession({
      profileKey: connection.id,
      timeout: STEEL_SESSION_LEASE_MINUTES,
    });

    // Store Steel session ID in metadata for release
    await deps.store.upsertConnection({
      userId,
      connectionType: "resy",
      status: "pending",
      provider: "resy",
      metadataJson: {
        ...connection.metadataJson,
        steelSessionId: session.sessionId,
      },
    });

    return {
      connectionId: connection.id,
      debugUrl: session.debugUrl,
    };
  } catch (err) {
    // Roll back lease on Steel failure
    await deps.store.clearSessionLease(connection.id).catch(() => {});
    throw err;
  }
}

/**
 * Finalize Resy connection after user completes authentication in the Steel debug browser.
 * Releases the Steel session and updates connection status.
 */
export async function captureResyConnection(
  userId: string,
  deps: ReservationConnectionManagerDeps
) {
  const connection = await deps.store.getConnectionByType(userId, "resy");
  if (!connection) {
    throw new Error("No Resy connection found for user.");
  }

  // Release Steel session if one is active
  const steelSessionId = (
    connection.metadataJson as Record<string, unknown> | null
  )?.steelSessionId as string | undefined;
  if (steelSessionId && deps.steel) {
    try {
      await deps.steel.releaseSession(steelSessionId);
    } catch (err) {
      // Non-fatal — Steel may have already timed out
      if (!(err instanceof SteelUnavailableError)) throw err;
    }
  }

  // Clear the lease
  await deps.store.clearSessionLease(connection.id);

  // Update connection status
  const updated = await deps.store.upsertConnection({
    userId,
    connectionType: "resy",
    status: "connected",
    provider: "resy",
    providerAccountEmail: connection.providerAccountEmail ?? null,
    sessionStatus: "connected",
    lastVerifiedAt: new Date(),
    metadataJson: {
      ...connection.metadataJson,
      steelSessionId: undefined,
    },
  });

  await deps.store.appendEvent({
    userId,
    connectionId: updated.id,
    source: "resy",
    eventType: "resy_connected",
  });

  return updated;
}

/** Thrown when a Steel session lease is already held for a connection. */
export class SessionLeaseHeldError extends Error {
  override readonly name = "SessionLeaseHeldError" as const;
  constructor(public readonly connectionId: string) {
    super(`Session lease already held for connection ${connectionId}`);
  }
}
