// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@core/reservations/parser`
 * Purpose: Parse official Resy Notify email content into a canonical alert.
 * Scope: Pure string parsing only.
 * Side-effects: none
 * @public
 */

import type { ReservationAlert } from "./model";
import { normalizeRestaurantName } from "./rules";

export interface ParseResyNotifyEmailInput {
  subject: string;
  textBody: string;
  htmlBody?: string | null;
  sourceMessageId?: string | null;
}

const SLOT_PATTERN =
  /\b(?:on\s+)?([A-Z][a-z]+ \d{1,2}, \d{4}|\d{4}-\d{2}-\d{2})\s+at\s+(\d{1,2}:\d{2}\s*[AP]M)\b/;
const PARTY_SIZE_PATTERN = /\b(?:party of|for)\s+(\d{1,2})\b/i;
const RESTAURANT_PATTERN =
  /\b(?:at|from)\s+([A-Za-z0-9'&.\- ]+?)(?:\s+(?:for|on)\b|[.!])/;
const RESY_LINK_PATTERN = /https:\/\/(?:www\.)?resy\.com\/[^\s)>"]+/i;

function parseMeridiemTime(value: string) {
  const match = value
    .trim()
    .match(/^(?<hours>\d{1,2}):(?<minutes>\d{2})\s*(?<meridiem>[AP]M)$/i);

  if (!match?.groups) {
    return null;
  }

  const hoursText = match.groups.hours;
  const minutesText = match.groups.minutes;
  const meridiemText = match.groups.meridiem;

  if (!hoursText || !minutesText || !meridiemText) {
    return null;
  }

  const hours = Number.parseInt(hoursText, 10);
  const minutes = Number.parseInt(minutesText, 10);
  const meridiem = meridiemText.toUpperCase();

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 1 ||
    hours > 12 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  const normalizedHours = meridiem === "PM" ? (hours % 12) + 12 : hours % 12;

  return {
    hours: normalizedHours,
    minutes,
  };
}

function toIsoDate(dateText: string, timeText: string): Date | null {
  let candidate: Date;

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
    const parsedTime = parseMeridiemTime(timeText);
    if (!parsedTime) {
      return null;
    }

    candidate = new Date(
      `${dateText}T${String(parsedTime.hours).padStart(2, "0")}:${String(
        parsedTime.minutes
      ).padStart(2, "0")}:00`
    );
  } else {
    candidate = new Date(`${dateText} ${timeText}`);
  }

  return Number.isNaN(candidate.getTime()) ? null : candidate;
}

export function parseResyNotifyEmail(
  input: ParseResyNotifyEmailInput
): ReservationAlert | null {
  const combined = [input.subject, input.textBody, input.htmlBody ?? ""]
    .filter(Boolean)
    .join("\n");

  const slotMatch = combined.match(SLOT_PATTERN);
  const partySizeMatch = combined.match(PARTY_SIZE_PATTERN);
  const restaurantMatch = combined.match(RESTAURANT_PATTERN);
  const bookingUrl = combined.match(RESY_LINK_PATTERN)?.[0] ?? null;

  if (!slotMatch || !partySizeMatch || !restaurantMatch) {
    return null;
  }

  const slotDate = slotMatch[1];
  const slotTime = slotMatch[2];
  const restaurant = restaurantMatch[1]?.trim();
  const partySizeText = partySizeMatch[1];

  if (!slotDate || !slotTime || !restaurant || !partySizeText) {
    return null;
  }

  const slotAt = toIsoDate(slotDate, slotTime.replace(/\s+/g, " "));
  if (!slotAt) {
    return null;
  }

  const partySize = Number.parseInt(partySizeText, 10);

  if (!restaurant || Number.isNaN(partySize)) {
    return null;
  }

  return {
    restaurant,
    normalizedRestaurant: normalizeRestaurantName(restaurant),
    partySize,
    slotAt,
    bookingUrl,
    subject: input.subject,
    sourceMessageId: input.sourceMessageId ?? null,
    rawText: combined,
  };
}
