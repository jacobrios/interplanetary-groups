// src/lib/groups/timezone.ts
//
// Timezone validation and labelling. The founder's zone is inferred silently
// from their browser at onboarding, which makes it a client-asserted value —
// treated the same way as model output (CLAUDE.md guardrail): validated and
// normalized before it drives anything or is stored. An unrecognized or absent
// zone falls back to "UTC" so a founder is never blocked from creating a group.
//
// Both functions are pure, synchronous, and client-safe (Intl only, no Node
// or Prisma), so the wizard can label the zone before confirm and the server
// action can re-validate the same claim.

const IANA_MAX_LENGTH = 100 // generous ceiling; real IANA ids are well under this

/**
 * Validate a client-asserted timezone. Returns the zone unchanged when it is a
 * string Intl recognizes (including legacy aliases browsers still report, e.g.
 * "Asia/Calcutta"); everything else — non-strings, empty/over-long strings, and
 * unrecognized ids — degrades to "UTC" rather than throwing.
 */
export function normalizeTimeZone(input: unknown): string {
  if (typeof input !== "string") return "UTC"
  if (input.length === 0 || input.length > IANA_MAX_LENGTH) return "UTC"

  try {
    // Constructing a formatter throws (RangeError) on an unrecognized zone.
    new Intl.DateTimeFormat("en-US", { timeZone: input })
    return input
  } catch {
    return "UTC"
  }
}

/**
 * Derive a human-readable, non-seasonal label for the reference line on the
 * onboarding playback card (e.g. "Central Time", not the seasonal "Central
 * Daylight Time"). Uses Intl's "longGeneric" name.
 *
 * Not every zone has a generic name: UTC and Etc/* zones resolve to a bare GMT
 * offset ("GMT+00:00"), and some zones resolve to nothing usable. In those
 * cases we fall back to the raw IANA string, which is sane and never wrong.
 * Deterministic — no lookup table, no model.
 */
export function formatTimeZoneLabel(timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "longGeneric",
    }).formatToParts(new Date(0))

    const label = parts.find((p) => p.type === "timeZoneName")?.value

    // Reject the GMT-offset form (UTC, Etc/*, and any zone without a generic
    // name) — the raw IANA id reads better than "Times in GMT-05:00".
    if (!label || label.startsWith("GMT")) return timeZone

    return label
  } catch {
    return timeZone
  }
}
