// src/lib/events/format.ts
//
// Shared date/time formatting helpers for event display.
//
// These are extracted from the inline helpers in src/app/events/[id]/page.tsx
// so that the event-detail page and the compact home-screen card share a
// single source of truth.  The logic is unchanged from the original.
//
// All times are formatted as UTC — timezone-aware display is a deferred
// fast-follow (requires storing an event timezone and reading the viewer's
// locale; see §11 tech debt).

/**
 * Formats an event's start (and optional end) as a compact display string.
 *
 * Uses three-letter weekday abbreviations per CLAUDE.md §copy.
 * Uses "to" between times — no em/en dashes.
 *
 * Examples:
 *   "Sun, Jul 19 · 5pm"
 *   "Sun, Jul 19 · 5pm to 8pm"
 */
export function formatEventDate(startsAt: Date, endsAt: Date | null): string {
  const utc = { timeZone: "UTC" } as const

  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", ...utc }).format(startsAt)
  const month = new Intl.DateTimeFormat("en-US", { month: "short", ...utc }).format(startsAt)
  const day = new Intl.DateTimeFormat("en-US", { day: "numeric", ...utc }).format(startsAt)

  const startTime = formatTime(startsAt)

  if (!endsAt) {
    return `${weekday}, ${month} ${day} · ${startTime}`
  }

  const endTime = formatTime(endsAt)
  // "to" per CLAUDE.md copy rules: no em or en dashes in user-facing copy.
  return `${weekday}, ${month} ${day} · ${startTime} to ${endTime}`
}

/**
 * Formats a UTC time as "10am", "2:30pm", etc.
 * Minutes are omitted when the time is on the hour.
 */
export function formatTime(date: Date): string {
  const h = date.getUTCHours()
  const m = date.getUTCMinutes()
  const ampm = h < 12 ? "am" : "pm"
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2, "0")}${ampm}`
}
