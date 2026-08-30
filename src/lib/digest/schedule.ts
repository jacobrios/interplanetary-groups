// src/lib/digest/schedule.ts
//
// Who gets a digest today. Two independent questions, both pure, following
// lib/digest/needs-you.ts and lib/digest/you-missed.ts before them: rows and
// a clock in, a decision out. Nothing here queries Prisma or writes
// anything, so a digest job and any future second consumer can never
// disagree about who was mailed.
//
// (1) isNeedsYouGateOpen answers a GROUP-level question, once per group per
//     day: did anything happen today that justifies mailing the group at
//     all? It has no notion of a particular member.
// (2) isDigestEligibleToday answers a PER-MEMBER question: may *this*
//     member be sent anything today, independent of whether there is
//     anything to say?
//
// What the gate controls (spec decision, stated here because getting this
// backwards builds a different product): the gate governs the "needs you"
// block ONLY. When the gate is closed, the caller must pass an empty
// needs-you list, even though outstanding items may exist — a member who
// has not RSVP'd is not itself news. When the gate is open, the caller
// carries EVERYTHING currently outstanding for that member, not just the
// item that opened the gate, because a partial list would be a worse email
// once we are mailing them anyway. The "you missed" block is not gated by
// this module at all: it stands on its own (lib/digest/you-missed.ts), so a
// member who missed real chat still hears about it on a day neither rule
// fired. The caller sends an email when either block ends up non-empty.

import { getLocalParts } from "@/lib/orbit/occurrence"

/** How many group-local days before an event or an idea's proposed day
 *  rule two fires. Fires only on the exact day, not "within"; see the
 *  module comment on why this design mirrors gauge endgame's exact-day
 *  checks rather than a range. */
const DAYS_BEFORE_REMINDER = 3

export interface IdeaForSchedule {
  /** When this idea (Gauge) was created — a member floated it. */
  createdAt: Date
  /** The group-local midnight of the day it proposes. */
  proposedDate: Date
}

export interface TimeChangeAskForSchedule {
  /** When this time-change ask (ChangeProposal) was created. Rule two does
   *  not apply to a time-change ask on its own: the plan it is asking to
   *  move already carries its own date via the event it targets. */
  createdAt: Date
}

export interface EventForSchedule {
  createdAt: Date
  startsAt: Date
  /** Null for an event reconcile.ts scheduled on its own; set for a
   *  sparked event (created by a member's third yes). Identified the same
   *  way lib/events/upcoming-list.ts's hasUpcomingScheduledEvent does: by
   *  the ABSENCE of a gaugeId, never by the presence of scheduledKey. See
   *  that function's comment for why the negative form is the only one
   *  that is also correct about rows written before scheduledKey existed;
   *  this module reuses that same test rather than inventing a third way
   *  of asking the same question. */
  gaugeId: string | null
}

export interface NeedsYouGateInput {
  now: Date
  timeZone: string
  ideas: IdeaForSchedule[]
  timeChangeAsks: TimeChangeAskForSchedule[]
  events: EventForSchedule[]
}

/** Local calendar day as a whole-number day count, for date-only diffing.
 *  Mirrors the private helper of the same name in lib/orbit/endgame.ts
 *  (not exported from there, so it is not reused directly); both compute
 *  the identical thing from the identical getLocalParts output, on purpose,
 *  so this module asks "what day is it there" exactly one way. */
function localDayNumber(date: Date, timeZone: string): number {
  const parts = getLocalParts(date, timeZone)
  return Date.UTC(parts.year, parts.month - 1, parts.day) / (24 * 60 * 60 * 1000)
}

/** Rule one: fires when `createdAt` falls on the same group-local calendar
 *  day as `now` — "the day a person created it." */
function createdToday(createdAt: Date, now: Date, timeZone: string): boolean {
  return localDayNumber(createdAt, timeZone) === localDayNumber(now, timeZone)
}

/** Rule two: fires when `when` is exactly DAYS_BEFORE_REMINDER group-local
 *  days after `now` — "three days before it happens." Exact match, not a
 *  window: firing on every day inside the window would mail the same
 *  upcoming plan repeatedly, which is the noise this product exists to not
 *  produce. */
function exactlyDaysBefore(when: Date, now: Date, timeZone: string): boolean {
  return localDayNumber(when, timeZone) - localDayNumber(now, timeZone) === DAYS_BEFORE_REMINDER
}

/**
 * Whether the "needs you" block may carry anything today, for this group.
 * True when either send rule fires for anything in the group:
 *
 * Rule one, "the day a person created it": an idea or a time-change ask
 * created today, or a SPARKED event created today (decision 6 — a sparked
 * event is a person's third yes, which is a thing a person did). Never a
 * recurring event reconcile.ts created on its own; that exclusion is what
 * keeps the cron's own hourly housekeeping from mailing the group about a
 * plan nobody asked about.
 *
 * Rule two, "three days before it happens": any event's start (both kinds,
 * recurring and sparked alike — a recurring RSVP reminder is exactly the
 * behavior this rule exists to produce) or any idea's proposed day, landing
 * exactly three group-local days from today.
 */
export function isNeedsYouGateOpen(input: NeedsYouGateInput): boolean {
  const { now, timeZone } = input

  const ruleOne =
    input.ideas.some((idea) => createdToday(idea.createdAt, now, timeZone)) ||
    input.timeChangeAsks.some((ask) => createdToday(ask.createdAt, now, timeZone)) ||
    input.events.some((event) => event.gaugeId !== null && createdToday(event.createdAt, now, timeZone))

  const ruleTwo =
    input.events.some((event) => exactlyDaysBefore(event.startsAt, now, timeZone)) ||
    input.ideas.some((idea) => exactlyDaysBefore(idea.proposedDate, now, timeZone))

  return ruleOne || ruleTwo
}

export interface DigestEligibilityInput {
  now: Date
  timeZone: string
  /** Membership.lastDigestSentAt: null means never sent. */
  lastDigestSentAt: Date | null
  /** User.digestOptOutAt: non-null means never, checked here so no caller
   *  can forget it. */
  digestOptOutAt: Date | null
}

/**
 * Whether this member may be sent a digest today at all, independent of
 * whether either send rule fired or either block has content. Two guards:
 *
 * Opt-out is absolute: `digestOptOutAt` non-null refuses regardless of
 * anything else.
 *
 * The once-a-day guard refuses when `lastDigestSentAt` already falls
 * inside the current group-local day — the same day-number comparison rule
 * one and two use, not a rolling 24-hour window, because a 24-hour window
 * would drift the send time later every day (decision 5: a duplicate email
 * is worse than a missed one, so this is the one guard allowed to cost a
 * stored column).
 */
export function isDigestEligibleToday(input: DigestEligibilityInput): boolean {
  if (input.digestOptOutAt !== null) return false
  if (input.lastDigestSentAt === null) return true
  return localDayNumber(input.lastDigestSentAt, input.timeZone) !== localDayNumber(input.now, input.timeZone)
}
