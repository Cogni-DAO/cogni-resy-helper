// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

import type {
  GmailIntegrationPort,
  ReservationProviderPort,
  ReservationStorePort,
} from "@/ports";

export interface ReservationConnectionManagerDeps {
  store: ReservationStorePort;
  gmail: GmailIntegrationPort;
  provider: ReservationProviderPort;
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

export async function captureResyConnection(
  userId: string,
  startUrl: string | undefined,
  deps: ReservationConnectionManagerDeps
) {
  const result = await deps.provider.captureSession({ startUrl });
  if (!result.sessionStateCiphertext) {
    throw new Error(
      "Resy session capture did not produce authenticated state."
    );
  }

  const connection = await deps.store.upsertConnection({
    userId,
    connectionType: "resy",
    status: "connected",
    provider: "resy",
    providerAccountEmail: result.providerAccountEmail ?? null,
    sessionStateCiphertext: result.sessionStateCiphertext,
    sessionStatus: result.sessionStatus,
    lastVerifiedAt: result.lastVerifiedAt,
    expiresHintAt: result.expiresHintAt,
  });

  await deps.store.appendEvent({
    userId,
    connectionId: connection.id,
    source: "resy",
    eventType: "resy_connected",
  });

  return connection;
}
