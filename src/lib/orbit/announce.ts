// src/lib/orbit/announce.ts
//
// Generates deterministic, structured-extract-then-format feed copy from
// an event and rhythm (per CLAUDE.md §7 and build-notes §7).
//
// The announcement is generated from the just-created event and rhythm,
// so it can never contradict the card. Copy is soft, warm, plain voice.

import type { GroupRhythm } from "./rhythm"
import { formatTime } from "@/lib/events/format"

/**
 * Builds an announcement string for a newly created event.
 *
 * Template: "Next up: {activity} {weekday} at {time}. RSVP up top."
 *
 * - activity: from rhythm.activity (used as-is; rhythm parser stores it in the desired case)
 * - weekday: 3-letter abbreviation of event.startsAt in UTC
 * - time: formatTime(event.startsAt), e.g. "8am", "2:30pm"
 *
 * Example output: "Next up: climbing Sun at 8am. RSVP up top."
 */
export function buildAnnouncement(
  event: { startsAt: Date },
  rhythm: { activity: string }
): string {
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "UTC",
  }).format(event.startsAt)

  const time = formatTime(event.startsAt)
  const activity = rhythm.activity

  return `Next up: ${activity} ${weekday} at ${time}. RSVP up top.`
}
