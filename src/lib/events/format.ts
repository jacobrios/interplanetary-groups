// src/lib/events/format.ts
//
// Shared date/time formatting helpers for event display.
//
// These are extracted from the inline helpers in src/app/events/[id]/page.tsx
// so that the event-detail page and the compact home-screen card share a
// single source of truth.
//
// All times render in the GROUP's timezone (the required `timeZone` argument),
// never viewer-local: an event's day and hour are a fact about the group, and
// Orbit's stored announcement is a single shared string that cannot be
// per-viewer, so the card must agree with it (see build-notes §11, the
// timezone-capture slice). The argument is required — not defaulted — so no
// call site can silently fall back to UTC and reintroduce the old bug.

import { getLocalParts } from "@/lib/orbit/occurrence"

/**
 * Formats an event's start (and optional end) as a compact display string,
 * rendered in `timeZone` (an IANA zone, e.g. "America/Chicago").
 *
 * Uses three-letter weekday abbreviations per CLAUDE.md §copy.
 * Uses "to" between times — no em/en dashes.
 *
 * Examples (timeZone "UTC"):
 *   "Sun, Jul 19 · 5pm"
 *   "Sun, Jul 19 · 5pm to 8pm"
 */
export function formatEventDate(
  startsAt: Date,
  endsAt: Date | null,
  timeZone: string
): string {
  const zone = { timeZone } as const

  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", ...zone }).format(startsAt)
  const month = new Intl.DateTimeFormat("en-US", { month: "short", ...zone }).format(startsAt)
  const day = new Intl.DateTimeFormat("en-US", { day: "numeric", ...zone }).format(startsAt)

  const startTime = formatTime(startsAt, timeZone)

  if (!endsAt) {
    return `${weekday}, ${month} ${day} · ${startTime}`
  }

  const endTime = formatTime(endsAt, timeZone)
  // "to" per CLAUDE.md copy rules: no em or en dashes in user-facing copy.
  return `${weekday}, ${month} ${day} · ${startTime} to ${endTime}`
}

/**
 * Formats an instant's wall-clock time in `timeZone` as "10am", "2:30pm", etc.
 * Minutes are omitted when the time is on the hour.
 *
 * Wall-clock parts come from the shared getLocalParts (occurrence.ts) so there
 * is one implementation of "what time is it there," not two.
 */
export function formatTime(date: Date, timeZone: string): string {
  const { hour, minute } = getLocalParts(date, timeZone)
  const h = hour % 24 // some ICU builds report midnight as 24; normalize to 0
  const ampm = h < 12 ? "am" : "pm"
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return minute === 0 ? `${h12}${ampm}` : `${h12}:${String(minute).padStart(2, "0")}${ampm}`
}
