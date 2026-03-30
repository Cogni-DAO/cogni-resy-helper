// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/gmail/gmail.adapter`
 * Purpose: Gmail OAuth, watch registration, and message fetch adapter.
 * Scope: Official Google OAuth/Gmail REST integration only.
 * Side-effects: IO
 * @public
 */

import { Buffer } from "node:buffer";
import {
  decryptSecret,
  encryptSecret,
} from "@/adapters/server/reservations/session-crypto";
import type {
  GmailConnectResult,
  GmailIntegrationPort,
  GmailMessagePayload,
  GmailWatchRenewalResult,
} from "@/ports";
import { serverEnv } from "@/shared/env/server-env";

const GOOGLE_AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const GMAIL_BASE_URL = "https://gmail.googleapis.com/gmail/v1";

function getGoogleClientConfig(): { clientId: string; clientSecret: string } {
  const env = serverEnv();
  const clientId = env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth is not configured.");
  }

  return { clientId, clientSecret };
}

function getPubSubTopicName(): string {
  const topic = serverEnv().GMAIL_PUBSUB_TOPIC;
  if (!topic) {
    throw new Error(
      "GMAIL_PUBSUB_TOPIC is required for Gmail watch registration."
    );
  }
  return topic;
}

async function fetchJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as T;
}

function decodeBody(value?: string): string {
  if (!value) {
    return "";
  }

  return Buffer.from(
    value.replaceAll("-", "+").replaceAll("_", "/"),
    "base64"
  ).toString("utf8");
}

function collectBody(parts?: Array<Record<string, unknown>>): {
  textBody: string;
  htmlBody: string | null;
} {
  let textBody = "";
  let htmlBody: string | null = null;

  for (const part of parts ?? []) {
    const mimeType = String(part.mimeType ?? "");
    const body = part.body as { data?: string } | undefined;
    if (mimeType === "text/plain") {
      textBody += decodeBody(body?.data);
    } else if (mimeType === "text/html") {
      htmlBody = (htmlBody ?? "") + decodeBody(body?.data);
    }

    const nested = part.parts as Array<Record<string, unknown>> | undefined;
    if (nested?.length) {
      const child = collectBody(nested);
      textBody += child.textBody;
      htmlBody = htmlBody ?? child.htmlBody;
    }
  }

  return { textBody, htmlBody };
}

async function registerWatch(
  accessToken: string
): Promise<GmailWatchRenewalResult & { historyCursor: string }> {
  const response = await fetchJson<{ historyId: string; expiration?: string }>(
    `${GMAIL_BASE_URL}/users/me/watch`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        labelIds: ["INBOX"],
        topicName: getPubSubTopicName(),
      }),
    }
  );

  return {
    historyCursor: response.historyId,
    watchExpiryAt: response.expiration
      ? new Date(Number(response.expiration))
      : null,
    watchStatus: "active",
    renewalStatus: "healthy",
  };
}

async function refreshAccessToken(refreshTokenCiphertext: string): Promise<{
  accessTokenCiphertext: string;
  refreshTokenCiphertext: string;
  tokenExpiresAt: Date | null;
}> {
  const { clientId, clientSecret } = getGoogleClientConfig();
  const refreshToken = decryptSecret(refreshTokenCiphertext);

  const tokenResponse = await fetchJson<{
    access_token: string;
    expires_in?: number;
    refresh_token?: string;
  }>(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  return {
    accessTokenCiphertext: encryptSecret(tokenResponse.access_token),
    refreshTokenCiphertext: encryptSecret(
      tokenResponse.refresh_token ?? refreshToken
    ),
    tokenExpiresAt: tokenResponse.expires_in
      ? new Date(Date.now() + tokenResponse.expires_in * 1000)
      : null,
  };
}

export class GmailAdapter implements GmailIntegrationPort {
  createAuthorizationUrl(params: {
    userId: string;
    redirectUri: string;
  }): string {
    const { clientId } = getGoogleClientConfig();
    const url = new URL(GOOGLE_AUTH_BASE);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", params.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set(
      "scope",
      [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/gmail.readonly",
      ].join(" ")
    );
    url.searchParams.set("state", params.userId);
    return url.toString();
  }

  async exchangeAuthorizationCode(params: {
    code: string;
    redirectUri: string;
  }): Promise<GmailConnectResult> {
    const { clientId, clientSecret } = getGoogleClientConfig();
    const tokenResponse = await fetchJson<{
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      id_token?: string;
    }>(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: params.code,
        grant_type: "authorization_code",
        redirect_uri: params.redirectUri,
      }),
    });

    const userInfo = await fetchJson<{ email: string; sub: string }>(
      GOOGLE_USERINFO_URL,
      {
        headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
      }
    );

    const watch = await registerWatch(tokenResponse.access_token);

    return {
      providerAccountEmail: userInfo.email,
      providerSubject: userInfo.sub,
      accessTokenCiphertext: encryptSecret(tokenResponse.access_token),
      refreshTokenCiphertext: tokenResponse.refresh_token
        ? encryptSecret(tokenResponse.refresh_token)
        : null,
      tokenExpiresAt: tokenResponse.expires_in
        ? new Date(Date.now() + tokenResponse.expires_in * 1000)
        : null,
      historyCursor: watch.historyCursor,
      watchExpiryAt: watch.watchExpiryAt,
      watchStatus: watch.watchStatus,
      renewalStatus: watch.renewalStatus,
    };
  }

  async renewWatch(params: {
    refreshTokenCiphertext: string;
  }): Promise<GmailWatchRenewalResult> {
    const refreshed = await refreshAccessToken(params.refreshTokenCiphertext);
    const watch = await registerWatch(
      decryptSecret(refreshed.accessTokenCiphertext)
    );

    return {
      historyCursor: watch.historyCursor,
      watchExpiryAt: watch.watchExpiryAt,
      watchStatus: watch.watchStatus,
      renewalStatus: watch.renewalStatus,
    };
  }

  async fetchResyNotifyMessages(params: {
    accessTokenCiphertext: string;
    refreshTokenCiphertext?: string | null | undefined;
    historyCursor: string;
  }): Promise<{
    nextHistoryCursor: string;
    messages: GmailMessagePayload[];
  }> {
    let accessToken = decryptSecret(params.accessTokenCiphertext);

    const historyResponse = await fetch(
      `${GMAIL_BASE_URL}/users/me/history?startHistoryId=${params.historyCursor}&historyTypes=messageAdded`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (historyResponse.status === 401 && params.refreshTokenCiphertext) {
      const refreshed = await refreshAccessToken(params.refreshTokenCiphertext);
      accessToken = decryptSecret(refreshed.accessTokenCiphertext);
    }

    const history = await fetchJson<{
      historyId?: string;
      history?: Array<{
        messagesAdded?: Array<{ message?: { id?: string } }>;
      }>;
    }>(
      `${GMAIL_BASE_URL}/users/me/history?startHistoryId=${params.historyCursor}&historyTypes=messageAdded`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    const messageIds = new Set<string>();
    for (const item of history.history ?? []) {
      for (const added of item.messagesAdded ?? []) {
        if (added.message?.id) {
          messageIds.add(added.message.id);
        }
      }
    }

    const messages = await Promise.all(
      [...messageIds].map(async (messageId) => {
        const message = await fetchJson<{
          id: string;
          threadId?: string;
          historyId?: string;
          payload?: {
            headers?: Array<{ name?: string; value?: string }>;
            body?: { data?: string };
            parts?: Array<Record<string, unknown>>;
          };
        }>(`${GMAIL_BASE_URL}/users/me/messages/${messageId}?format=full`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        const headers = new Map(
          (message.payload?.headers ?? []).map((header) => [
            (header.name ?? "").toLowerCase(),
            header.value ?? "",
          ])
        );
        const partBodies = collectBody(message.payload?.parts);
        const topLevelBody = decodeBody(message.payload?.body?.data);

        return {
          id: message.id,
          threadId: message.threadId ?? null,
          historyId: message.historyId ?? null,
          from: headers.get("from") ?? null,
          subject: headers.get("subject") ?? "",
          textBody: partBodies.textBody || topLevelBody,
          htmlBody: partBodies.htmlBody,
        } satisfies GmailMessagePayload;
      })
    );

    return {
      nextHistoryCursor: history.historyId ?? params.historyCursor,
      messages,
    };
  }
}
