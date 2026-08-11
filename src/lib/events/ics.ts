// Composes the one-way calendar snapshot (build-notes §6): one VEVENT,
// deterministic, no model call. Timestamps are written as UTC Z-times so
// every calendar client does its own zone conversion and daylight-saving
// math never enters this codebase. The member's calendar showing their
// local time is the spec'd behavior, not drift from the group-time rule,
// which governs the app's shared surfaces only.

export interface IcsEventInput {
  id: string
  title: string
  startsAt: Date
  endsAt: Date | null
  venue: { label: string | null; name: string; address: string | null } | null
  eventUrl: string
}

const ONE_HOUR_MS = 60 * 60 * 1000
const CRLF = "\r\n"

// RFC 5545 §3.3.11: backslash, semicolon, comma, and literal newlines are
// escaped in text values.
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n")
}

// RFC 5545 §3.1: physical lines are capped at 75 octets; the remainder
// continues on the next line after a single space. Measured in UTF-8 bytes,
// split only at codepoint boundaries.
function foldLine(line: string): string {
  const encoder = new TextEncoder()
  if (encoder.encode(line).length <= 75) return line
  const segments: string[] = []
  let current = ""
  let currentBytes = 0
  for (const ch of line) {
    const chBytes = encoder.encode(ch).length
    const limit = segments.length === 0 ? 75 : 74 // continuations lose one octet to the space
    if (currentBytes + chBytes > limit) {
      segments.push(current)
      current = ch
      currentBytes = chBytes
    } else {
      current += ch
      currentBytes += chBytes
    }
  }
  if (current) segments.push(current)
  return segments.map((seg, i) => (i === 0 ? seg : " " + seg)).join(CRLF)
}

function formatUtc(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  )
}

export function composeEventIcs(event: IcsEventInput, now: Date): string {
  const end = event.endsAt ?? new Date(event.startsAt.getTime() + ONE_HOUR_MS)
  const location = event.venue
    ? [event.venue.label ?? event.venue.name, event.venue.address]
        .filter((part): part is string => Boolean(part))
        .join(", ")
    : null

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Interplanetary Groups//Orbit//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.id}@interplanetary-groups`,
    `DTSTAMP:${formatUtc(now)}`,
    `DTSTART:${formatUtc(event.startsAt)}`,
    `DTEND:${formatUtc(end)}`,
    `SUMMARY:${escapeText(event.title)}`,
    ...(location ? [`LOCATION:${escapeText(location)}`] : []),
    `DESCRIPTION:${escapeText(`Details and RSVPs: ${event.eventUrl}`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
  return lines.map(foldLine).join(CRLF) + CRLF
}
