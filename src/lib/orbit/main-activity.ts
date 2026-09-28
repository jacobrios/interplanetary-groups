// src/lib/orbit/main-activity.ts
//
// Splits a founder's rhythms into the one that gets stored and the names of
// the rest, which are never stored: onboarding only schedules the main
// weekly activity, and everything else the founder mentioned is explained to
// them as something to float in chat instead of being stored as a rhythm
// (see formatOtherActivitiesNote in playback.ts).

import type { StoredRhythm } from "./rhythm"

/**
 * Splits a founder's rhythms into the one that gets stored (the main weekly
 * activity, position zero) and the names of the rest, which are never
 * stored: onboarding only schedules the main rhythm, and everything else the
 * founder mentioned is explained to them as something to float in chat
 * instead (see formatOtherActivitiesNote in playback.ts).
 *
 * Other-activity names are trimmed, empties dropped, deduplicated
 * case-insensitively (first spelling wins), and any name matching the main
 * activity (case-insensitively) is dropped too, since restating the main
 * activity back as an "other" would be confusing rather than informative.
 * Order is preserved otherwise.
 */
export function splitMainActivity(
  rhythms: StoredRhythm[]
): { rhythms: StoredRhythm[]; otherActivities: string[] } {
  if (rhythms.length === 0) return { rhythms: [], otherActivities: [] }

  const main = rhythms[0]
  const mainKey = main.activity.trim().toLowerCase()

  const seen = new Set<string>()
  const otherActivities: string[] = []
  for (const r of rhythms.slice(1)) {
    const name = r.activity.trim()
    if (name.length === 0) continue
    const key = name.toLowerCase()
    if (key === mainKey || seen.has(key)) continue
    seen.add(key)
    otherActivities.push(name)
  }

  return { rhythms: [main], otherActivities }
}
