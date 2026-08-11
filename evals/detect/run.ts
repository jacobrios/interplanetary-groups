// evals/detect/run.ts
//
// Runs recognition cases against the real model. Builds exactly the context
// src/app/actions/detect-intent.ts builds, then grades the outcome a member
// would experience: the classification, and then the reply ladder's action on
// top of it. Never touches the database, so it is safe to run repeatedly.

import { formatEventDate, formatTime } from "../../src/lib/events/format"
import { planChange, type ChangeTarget } from "../../src/lib/orbit/change-plan"
import { getLocalParts } from "../../src/lib/orbit/occurrence"
import { detectIntentClaim, normalizeIntent } from "../../src/lib/orbit/spark"
import {
  buildLiveGaugeLine,
  buildOpenAskLine,
  chooseProposedDate,
  startOfLocalDay,
} from "../../src/lib/orbit/spark-copy"
import {
  buildConversationWindow,
  WINDOW_MESSAGES,
  type WindowMessage,
} from "../../src/lib/orbit/window"
import type { Bucket, EvalCase } from "./cases"

/** One zone for every case, so a case never depends on where it is run. */
const TIME_ZONE = "America/Los_Angeles"

export interface CaseResult {
  id: string
  bucket: Bucket
  description: string
  runs: number
  passes: number
  /** One line per failing run, for the scoreboard. */
  failures: string[]
}

/** What actually happened on one run, flattened for comparison and printing. */
type Outcome =
  | { kind: "none" }
  | { kind: "spark"; statedDayOfWeek: number | null }
  | { kind: "answer"; dayOfWeek: number | null }
  | { kind: "change"; action: string; text: string }
  | { kind: "dayComment"; dayOfWeek: number | null }

function describe(o: Outcome): string {
  if (o.kind === "change") return `change / ${o.action}: ${o.text}`
  if (o.kind === "dayComment") return `dayComment / day ${o.dayOfWeek}`
  return o.kind
}

/** The most recent group-local midnight strictly before now that falls on `dow`. */
function mostRecentPastOccurrence(dow: number, now: Date): Date {
  const today = startOfLocalDay(now, TIME_ZONE)
  for (let back = 1; back <= 7; back++) {
    const local = startOfLocalDay(new Date(today.getTime() - back * 86_400_000), TIME_ZONE)
    const p = getLocalParts(local, TIME_ZONE)
    const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()
    if (weekday === dow) return local
  }
  return today
}

async function runOnce(c: EvalCase, now: Date): Promise<Outcome> {
  const plans = c.calendar.map((p) => ({
    ...p,
    startsAt: new Date(now.getTime() + p.minutesFromNow * 60_000),
  }))

  const upcomingLines = plans.map(
    (p, i) => `${i + 1}. ${p.title}, ${formatEventDate(p.startsAt, null, TIME_ZONE)}`
  )

  // Same cap the action applies: the newest 19 prior messages plus the trigger.
  // Without this, a deliberately long case would test a window the product
  // never actually sends.
  const prior = c.history.slice(-(WINDOW_MESSAGES - 1))
  const windowMessages: WindowMessage[] = [
    ...prior.map((h) => ({
      authorName: h.author === "Orbit" ? null : h.author,
      isOrbit: h.author === "Orbit",
      body: h.body,
      createdAt: new Date(now.getTime() - h.minutesAgo * 60_000),
    })),
    { authorName: c.trigger.author, isOrbit: false, body: c.trigger.body, createdAt: now },
  ]
  const conversationBlock = buildConversationWindow(windowMessages, TIME_ZONE, now)

  const openProposalLines = c.liveProposal
    ? [
        `A question is already out to the group: move ${plans[c.liveProposal.planIndex].label} to ${formatTime(
          new Date(now.getTime() + c.liveProposal.proposedMinutesFromNow * 60_000),
          TIME_ZONE
        )} (asked by ${c.liveProposal.asker}).`,
      ]
    : []

  const openAskLine = c.openAsk
    ? buildOpenAskLine(c.openAsk.activity, mostRecentPastOccurrence(c.openAsk.failedDayOfWeek, now), TIME_ZONE)
    : null

  // The next occurrence of the fixture's weekday from the shared now-anchor,
  // exactly what a real live gauge's own proposedDate would read as.
  const liveGaugeLines = c.liveGauge
    ? [
        buildLiveGaugeLine(
          c.liveGauge.activity,
          chooseProposedDate(c.liveGauge.proposedDayOfWeek, null, TIME_ZONE, now),
          TIME_ZONE
        ),
      ]
    : []

  const claim = await detectIntentClaim(c.trigger.body, {
    upcomingLines,
    conversationBlock,
    openProposalLines,
    openAskLine,
    liveGaugeLines,
  })
  const intent = normalizeIntent(claim, plans.length, c.openAsk !== undefined, c.liveGauge !== undefined)

  if (intent.kind === "none") return { kind: "none" }
  if (intent.kind === "spark") return { kind: "spark", statedDayOfWeek: intent.spark.statedDayOfWeek }
  if (intent.kind === "answer") return { kind: "answer", dayOfWeek: intent.answer.dayOfWeek }
  if (intent.kind === "dayComment") {
    return { kind: "dayComment", dayOfWeek: intent.dayComment.dayOfWeek }
  }

  const candidates: ChangeTarget[] = plans.map((p) => ({
    id: p.title,
    label: p.label,
    startsAt: p.startsAt,
  }))
  const target =
    intent.change.targetEventIndex !== null ? candidates[intent.change.targetEventIndex] : null
  const plan = planChange(
    intent.change,
    target,
    candidates,
    c.trigger.author,
    c.memberCount,
    TIME_ZONE,
    now
  )

  const text =
    plan.action === "reply"
      ? plan.body
      : plan.action === "move"
        ? plan.announcement
        : plan.action === "quiet"
          ? ""
          : plan.question
  return { kind: "change", action: plan.action, text }
}

function grade(c: EvalCase, o: Outcome): string | null {
  const e = c.expected

  // Deterministic mapping first, ahead of anything the not-yet-written
  // planner (Task 6) would do: a day comment naming the gauge's own day
  // carries no new information, so it grades as the member-visible outcome
  // "none", mirroring production's same-day discard. Written now so the
  // runner does not have to be revisited once normalizeIntent gains the
  // dayComment kind in Task 5.
  const sameDayDiscard =
    o.kind === "dayComment" && o.dayOfWeek === (c.liveGauge?.proposedDayOfWeek ?? null)
  const graded: Outcome = sameDayDiscard ? { kind: "none" } : o

  if (e.kind !== graded.kind) return `expected ${e.kind}, got ${describe(o)}`
  if (
    e.kind === "spark" &&
    graded.kind === "spark" &&
    e.statedDayOfWeek !== undefined &&
    e.statedDayOfWeek !== graded.statedDayOfWeek
  ) {
    return `expected spark on day ${e.statedDayOfWeek}, got ${graded.statedDayOfWeek}`
  }
  if (
    e.kind === "answer" &&
    graded.kind === "answer" &&
    e.dayOfWeek !== undefined &&
    e.dayOfWeek !== graded.dayOfWeek
  ) {
    return `expected answer naming day ${e.dayOfWeek}, got ${graded.dayOfWeek}`
  }
  if (
    e.kind === "dayComment" &&
    graded.kind === "dayComment" &&
    e.dayOfWeek !== undefined &&
    e.dayOfWeek !== graded.dayOfWeek
  ) {
    return `expected dayComment naming day ${e.dayOfWeek}, got ${graded.dayOfWeek}`
  }
  if (e.kind !== "change" || graded.kind !== "change") return null
  if (e.action && e.action !== graded.action) {
    return `expected change / ${e.action}, got ${describe(o)}`
  }
  if (e.replyContains && !graded.text.includes(e.replyContains)) {
    return `expected reply containing "${e.replyContains}", got ${describe(o)}`
  }
  return null
}

export async function runCase(c: EvalCase, runs: number, now: Date): Promise<CaseResult> {
  const failures: string[] = []
  let passes = 0
  for (let i = 0; i < runs; i++) {
    try {
      const problem = grade(c, await runOnce(c, now))
      if (problem === null) passes++
      else failures.push(problem)
    } catch (err) {
      // A thrown call is a failure, never a skipped run. Swallowing it here
      // would be the same mistake this slice exists to fix.
      failures.push(`threw: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return { id: c.id, bucket: c.bucket, description: c.description, runs, passes, failures }
}
