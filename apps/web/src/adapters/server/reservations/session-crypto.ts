// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/reservations/session-crypto`
 * Purpose: Encrypt and decrypt stored reservation secrets.
 * Scope: Server-side crypto helpers only.
 * Side-effects: none
 * @internal
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import type { Page } from "@playwright/test";

import { serverEnv } from "@/shared/env/server-env";

function getKey() {
  return createHash("sha256").update(serverEnv().AUTH_SECRET).digest();
}

export function encryptSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return JSON.stringify({
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  });
}

export function decryptSecret(value: string): string {
  const parsed = JSON.parse(value) as {
    iv: string;
    tag: string;
    ciphertext: string;
  };
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(parsed.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(parsed.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export async function isReconnectRequiredPage(page: Page): Promise<boolean> {
  const url = page.url();
  if (url.includes("/login")) {
    return true;
  }

  const content = await page.content();
  return /sign in|log in|session expired/i.test(content);
}
