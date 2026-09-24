// src/lib/groups/details-edit.ts
//
// Validate and diff a founder's group-details edit. Pure functions only: no
// database, no side effects. The single source of truth for what a valid
// edit is and what changed, called by the server save (Task 7), the
// group-info editor (Task 8), and onboarding step 2 (Task 9).

import {
  cleanShortText,
  cleanVenueName,
  parseRhythm,
  titleCaseActivity,
  TIME_LOCAL_RE,
  type StoredRhythm,
} from "@/lib/orbit/rhythm"
import { EDIT_TITLE_MAX } from "@/lib/events/edit-fields"
import type { RhythmEdit } from "./rhythm-edit"

export type { RhythmEdit }

// Matches normalize.ts's NAME_MAX for model-suggested names.
export const GROUP_NAME_MAX = 50

export const DETAILS_UNSCHEDULABLE = "I need at least one day and a time to keep your schedule going."
export const DETAILS_NO_NAME = "Your group needs a name."
export const DETAILS_NO_ACTIVITY = "Each activity needs a name."
export const DETAILS_GENERIC = "Couldn't save that, try again."

export function detailsNoSpot(activity: string): string {
  return `Add where you meet for ${activity}.`
}

/** The editable shape of one stored rhythm, for seeding a form. */
export function toRhythmEdit(r: StoredRhythm): RhythmEdit {
  return {
    activity: r.activity,
    daysOfWeek: r.daysOfWeek,
    timeLocal: r.timeLocal,
    venueName: r.venueName ?? null,
  }
}

export type DetailsValidation =
  | { ok: true; name: string; rhythms: StoredRhythm[] }
  | { ok: false; error: string }

/** Keep integers 0-6, dedupe, sort; empty (or non-array) -> null. */
function cleanDays(days: number[] | null): number[] | null {
  if (!Array.isArray(days)) return null
  const set = new Set(days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))
  if (set.size === 0) return null
  return Array.from(set).sort((a, b) => a - b)
}

function cleanTime(t: string | null): string | null {
  return typeof t === "string" && TIME_LOCAL_RE.test(t) ? t : null
}

export function validateDetailsEdit(
  stored: StoredRhythm[],
  input: { name: string; rhythms: RhythmEdit[] }
): DetailsValidation {
  // Adding or removing activities is a non-goal.
  if (input.rhythms.length !== stored.length) return { ok: false, error: DETAILS_GENERIC }

  const name = cleanShortText(input.name, GROUP_NAME_MAX)
  if (name === null) return { ok: false, error: DETAILS_NO_NAME }

  const rhythms: StoredRhythm[] = []
  for (let i = 0; i < input.rhythms.length; i++) {
    const r = input.rhythms[i]
    const s = stored[i]

    const activity = cleanShortText(r.activity, EDIT_TITLE_MAX)
    if (activity === null) return { ok: false, error: DETAILS_NO_ACTIVITY }

    const built: StoredRhythm = {
      activity,
      title: titleCaseActivity(activity),
      // cadence and durationMinutes are never taken from the edit; they
      // ride along with the stored rhythm they belong to.
      cadence: s.cadence,
      daysOfWeek: cleanDays(r.daysOfWeek),
      timeLocal: cleanTime(r.timeLocal),
      venueName: cleanVenueName(r.venueName),
      ...(s.durationMinutes !== undefined ? { durationMinutes: s.durationMinutes } : {}),
    }
    rhythms.push(built)
  }

  // The primary rhythm (index 0) must stay schedulable and keep its spot;
  // every later rhythm is free to go loose or spotless (venue never gates).
  const primary = rhythms[0]
  if (parseRhythm([primary]) === null) return { ok: false, error: DETAILS_UNSCHEDULABLE }
  if (primary.venueName === null) return { ok: false, error: detailsNoSpot(primary.activity) }

  return { ok: true, name, rhythms }
}

export interface RhythmDiff {
  index: number
  activity: { from: string; to: string } | null
  schedule: boolean // days or time differ
  spot: { from: string | null; to: string | null } | null
}

export interface DetailsDiff {
  nameChanged: boolean
  rhythms: RhythmDiff[] // only changed rhythms listed
}

function sameDays(a: number[] | null, b: number[] | null): boolean {
  const as = [...(a ?? [])].sort((x, y) => x - y)
  const bs = [...(b ?? [])].sort((x, y) => x - y)
  return as.length === bs.length && as.every((v, idx) => v === bs[idx])
}

export function diffDetails(
  before: StoredRhythm[],
  after: StoredRhythm[],
  beforeName: string,
  afterName: string
): DetailsDiff {
  const nameChanged = beforeName !== afterName
  const rhythms: RhythmDiff[] = []

  const len = Math.max(before.length, after.length)
  for (let i = 0; i < len; i++) {
    const b = before[i]
    const a = after[i]
    if (!b || !a) continue

    const activityChanged = b.activity !== a.activity
    const scheduleChanged = !sameDays(b.daysOfWeek, a.daysOfWeek) || b.timeLocal !== a.timeLocal
    const bVenue = b.venueName ?? null
    const aVenue = a.venueName ?? null
    const spotChanged = bVenue !== aVenue

    if (!activityChanged && !scheduleChanged && !spotChanged) continue

    rhythms.push({
      index: i,
      activity: activityChanged ? { from: b.activity, to: a.activity } : null,
      schedule: scheduleChanged,
      spot: spotChanged ? { from: bVenue, to: aVenue } : null,
    })
  }

  return { nameChanged, rhythms }
}

/** The index-0 entry of a diff, or null when the primary rhythm didn't change. */
export function firstRhythmChanged(diff: DetailsDiff): RhythmDiff | null {
  return diff.rhythms.find((r) => r.index === 0) ?? null
}
