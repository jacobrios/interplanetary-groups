// src/lib/orbit/day-comment-plan.ts
//
// The pure decision layer for a day comment on a live gauge, mirroring
// change-plan.ts: the server action supplies the live gauges and the
// normalized reading, this module decides everything, the action only
// carries the answer out. No DB, no Anthropic import.
//
// Spec: docs/superpowers/specs/2026-08-10-day-comment-live-gauge-design.md.

import type { GaugeAnswer } from "@prisma/client"
import type { NormalizedDayComment } from "./spark"
import {
  buildDayCommentReply,
  buildWhichGaugeQuestion,
  localWeekday,
  resolveAnswerTime,
} from "./spark-copy"

export interface DayCommentGauge {
  id: string
  activity: string
  proposedDate: Date
  proposedTime: string | null
  /** The commenter's current vote on this gauge, or null when they have none. */
  viewerAnswer: GaugeAnswer | null
}

export type DayCommentPlan =
  | { action: "quiet" }
  /** Several ideas gauging at once and the comment did not say which: ask (decision 9). */
  | { action: "which"; question: string }
  | {
      action: "record"
      gaugeId: string
      /** True when the commenter's explicit IN stands untouched (decision 2). */
      keepIn: boolean
      dayOfWeek: number
      /** Resolved "HH:mm" when the comment stated a time, else null. */
      suggestedTime: string | null
      reply: string
    }

export function planDayComment(
  dayComment: NormalizedDayComment,
  liveGauges: DayCommentGauge[],
  timeZone: string
): DayCommentPlan {
  // Coupling guard, same as the answer path: the reading only exists inside
  // a situation deterministic code confirmed.
  if (liveGauges.length === 0) return { action: "quiet" }

  let target: DayCommentGauge | null = null
  if (dayComment.activity !== null) {
    const key = dayComment.activity.toLowerCase()
    target = liveGauges.find((g) => g.activity.toLowerCase() === key) ?? null
    // A named activity matching no live gauge is a situation the model
    // invented; degrade toward silence rather than guess a target.
    if (!target) return { action: "quiet" }
  } else if (liveGauges.length === 1) {
    target = liveGauges[0]
  } else {
    return {
      action: "which",
      question: buildWhichGaugeQuestion(liveGauges.map((g) => g.activity)),
    }
  }

  // Decision 10: the named day must differ from the day being gauged. A
  // same-day comment is verbal attendance, which stays unbuilt.
  if (localWeekday(target.proposedDate, timeZone) === dayComment.dayOfWeek) {
    return { action: "quiet" }
  }

  const keepIn = target.viewerAnswer === "IN"
  // A stated time is resolved once, here, against the gauge's own stored
  // time (a bare clock number reads into the half of day the group already
  // picked; resolveAnswerTime's rule). Stored resolved, never re-derived.
  const suggestedTime =
    dayComment.time === null
      ? null
      : resolveAnswerTime({
          answerTime: dayComment.time,
          answerTimeAmbiguous: dayComment.timeAmbiguous,
          carriedTime: target.proposedTime,
        })

  return {
    action: "record",
    gaugeId: target.id,
    keepIn,
    dayOfWeek: dayComment.dayOfWeek,
    suggestedTime,
    reply: buildDayCommentReply(target.proposedDate, dayComment.dayOfWeek, keepIn, timeZone),
  }
}
