// src/lib/orbit/details-copy.ts
//
// Orbit's one message for a founder's group-details edit. Pure composition
// only: no database, no side effects. Consumes Task 3's DetailsDiff and
// composes exactly one clause per changed field, in a fixed order, then
// appends at most one sentence about a plan the edit may have touched.
//
// Structured-extract-then-format, like every other Orbit copy module: the
// diff supplies the facts, this file composes the sentence deterministically.
// No em/en dashes, three-letter weekdays, group timezone throughout.

import { formatWeekdayShort, formatTime, formatMonthDay } from "@/lib/events/format"
import { whenPhrase } from "./change-copy"
import { formatRhythmRow } from "./playback"
import type { StoredRhythm } from "./rhythm"
import type { DetailsDiff } from "@/lib/groups/details-edit"

export type PlanOutcome =
  | { kind: "none" } // no plan, or the first activity did not change
  | { kind: "left"; startsAt: Date }
  | { kind: "updated"; startsAt: Date } // spot/name applied, no time change
  | { kind: "vote"; startsAt: Date; proposedStartsAt: Date; detailsUpdated: boolean }

const WEEKDAY_START_RE = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\b/

function lowerFirst(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toLowerCase() + s.slice(1)
}

/**
 * One clause per changed field on one rhythm, in the fixed order rename,
 * schedule, spot. `A` (the activity name used in the schedule/spot clauses)
 * is the rhythm's post-edit activity, so a rename shows up in the words that
 * follow it too ("renamed tennis to padel, changed padel to...").
 */
function rhythmClauses(after: StoredRhythm[], diff: DetailsDiff): string[] {
  const clauses: string[] = []

  for (const rd of diff.rhythms) {
    const afterRhythm = after[rd.index]
    const activity = afterRhythm.activity

    if (rd.activity) {
      clauses.push(`renamed ${rd.activity.from} to ${rd.activity.to}`)
    }

    if (rd.schedule) {
      const sched = formatRhythmRow(afterRhythm).value
      const clause = WEEKDAY_START_RE.test(sched) ? sched : lowerFirst(sched)
      clauses.push(`changed ${activity} to ${clause}`)
    }

    if (rd.spot) {
      clauses.push(
        rd.spot.to === null
          ? `removed the spot for ${activity}`
          : `changed the spot for ${activity} to ${rd.spot.to}`
      )
    }
  }

  return clauses
}

/** One clause as is; two joined with ", and "; three or more with ", " and a final ", and ". */
function joinClauses(clauses: string[]): string {
  if (clauses.length === 1) return clauses[0]
  if (clauses.length === 2) return `${clauses[0]}, and ${clauses[1]}`
  return `${clauses.slice(0, -1).join(", ")}, and ${clauses[clauses.length - 1]}`
}

/** The sentence about the next plan, appended with a space, or null when there is none to say. */
function planSentence(plan: PlanOutcome, timeZone: string, now: Date): string | null {
  if (plan.kind === "none") return null

  const w = whenPhrase(plan.startsAt, timeZone, now)
  switch (plan.kind) {
    case "left":
      return `The plan ${w} stays as it was.`
    case "updated":
      return `The plan ${w} is updated too.`
    case "vote": {
      const day = formatWeekdayShort(plan.proposedStartsAt, timeZone)
      const time = formatTime(plan.proposedStartsAt, timeZone)
      return plan.detailsUpdated
        ? `The plan ${w} is updated too. Move it to ${day} ${time} as well?`
        : `Move the plan ${w} to ${day} ${time} too?`
    }
  }
}

/**
 * Orbit's one message for a founder's group-details edit, or null when there
 * is nothing worth saying: the founder is alone in the group (nobody to tell),
 * or the diff touched only the group's name (no rhythm changed).
 */
export function buildDetailsAnnouncement(input: {
  founderName: string
  after: StoredRhythm[] // validated, post-edit
  before: StoredRhythm[]
  diff: DetailsDiff
  memberCount: number
  plan: PlanOutcome
  timeZone: string
  now: Date
}): string | null {
  if (input.memberCount <= 1) return null
  if (input.diff.rhythms.length === 0) return null

  const clauses = rhythmClauses(input.after, input.diff)
  const sentence = `${input.founderName} ${joinClauses(clauses)}.`
  const plan = planSentence(input.plan, input.timeZone, input.now)
  return plan ? `${sentence} ${plan}` : sentence
}

/** `Your next plan is ${formatWeekdayShort}, ${formatMonthDay}. Update that one too, or leave it?` */
export function buildPlanQuestion(startsAt: Date, timeZone: string): string {
  return `Your next plan is ${formatWeekdayShort(startsAt, timeZone)}, ${formatMonthDay(startsAt, timeZone)}. Update that one too, or leave it?`
}
