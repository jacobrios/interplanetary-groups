// evals/detect/run.ts
//
// Runs recognition cases against the real model. Builds exactly the context
// src/app/actions/detect-intent.ts builds, then grades the outcome a member
// would experience: the classification, and then the reply ladder's action on
// top of it. Never touches the database, so it is safe to run repeatedly.

import { formatEventDate, formatTime } from "../../src/lib/events/format"
import { planChange, type ChangeTarget } from "../../src/lib/orbit/change-plan"
import { detectIntentClaim, normalizeIntent } from "../../src/lib/orbit/spark"
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
  | { kind: "change"; action: string; text: string }

function describe(o: Outcome): string {
  return o.kind === "change" ? `change / ${o.action}: ${o.text}` : o.kind
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

  const claim = await detectIntentClaim(c.trigger.body, {
    upcomingLines,
    conversationBlock,
    openProposalLines,
    openAskLine: null,
  })
  const intent = normalizeIntent(claim, plans.length, false)

  if (intent.kind === "none") return { kind: "none" }
  if (intent.kind === "spark") return { kind: "spark", statedDayOfWeek: intent.spark.statedDayOfWeek }
  // The answer arm is wired up in a later task (hasOpenAsk is hardcoded false
  // above, so this branch cannot fire yet); minimal stopgap to keep the
  // compiler narrowing intent.kind to "change" below.
  if (intent.kind === "answer") return { kind: "none" }

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
  if (e.kind !== o.kind) return `expected ${e.kind}, got ${describe(o)}`
  if (
    e.kind === "spark" &&
    o.kind === "spark" &&
    e.statedDayOfWeek !== undefined &&
    e.statedDayOfWeek !== o.statedDayOfWeek
  ) {
    return `expected spark on day ${e.statedDayOfWeek}, got ${o.statedDayOfWeek}`
  }
  if (e.kind !== "change" || o.kind !== "change") return null
  if (e.action && e.action !== o.action) {
    return `expected change / ${e.action}, got ${describe(o)}`
  }
  if (e.replyContains && !o.text.includes(e.replyContains)) {
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
