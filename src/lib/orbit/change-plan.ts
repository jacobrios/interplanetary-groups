// src/lib/orbit/change-plan.ts
//
// The pure decision at the heart of the change-request flow: given a
// normalized change claim and the plan it targets, what does Orbit do?
// Deterministic and fully unit-tested; the server action just carries the
// answer out (move, ask, propose, reply, or nothing).

import type { NormalizedChange } from "./spark"
import { consensusFloor } from "@/lib/proposals/consensus"
import {
  buildAlreadyAtReply,
  buildCantDoReply,
  buildChangeAnnouncement,
  buildChangeQuestion,
  buildGroupProposalQuestion,
  buildWhichPlanQuestion,
  buildWhichTimeQuestion,
  changeStartInstant,
  NO_PLANS_ALL_CALLED_OFF_REPLY,
  NO_PLANS_REPLY,
  PAST_TIME_REPLY,
  resolveChangeTime,
} from "./change-copy"

export interface ChangeTarget {
  id: string
  /** What Orbit calls the plan in copy: activityLabel, or the lowercased title. */
  label: string
  startsAt: Date
}

export type ChangePlan =
  | { action: "quiet" }
  | { action: "reply"; body: string }
  | { action: "move"; newStartsAt: Date; announcement: string }
  | { action: "ask"; proposedStartsAt: Date; question: string }
  | { action: "propose"; proposedStartsAt: Date; question: string }

export function planChange(
  change: NormalizedChange,
  target: ChangeTarget | null,
  candidates: ChangeTarget[],
  askerName: string,
  memberCount: number,
  timeZone: string,
  now: Date,
  hasCalledOffPlans: boolean
): ChangePlan {
  // Rung 0: nothing to move outranks what kind of change was asked for. A
  // group with no live candidates gets the honest no-plans reply whatever
  // fields were requested, day-change included (the owner-QA "Thursday"
  // failure: a day decline was firing before this rung ever asked whether
  // there was a plan to decline about). Two replies for two different
  // truths: a blank calendar and a calendar that is all called off, since
  // the second carries an action the first doesn't.
  if (candidates.length === 0) {
    return {
      action: "reply",
      body: hasCalledOffPlans ? NO_PLANS_ALL_CALLED_OFF_REPLY : NO_PLANS_REPLY,
    }
  }

  // Rung 1: anything beyond the time declines, target or no target, clear or
  // probable. The decline never needed the target (the owner-QA "it" failure),
  // and the model's conservative tiebreak is the false-positive guard. Rung 0
  // has already ruled out an empty calendar, so there is always at least one
  // real plan for this decline to be about.
  if (change.requestedFields.some((f) => f !== "time")) {
    return {
      action: "reply",
      body: buildCantDoReply(change.requestedFields, target?.startsAt ?? null, timeZone),
    }
  }

  // A lone plan is its own answer: the model declining to number the only
  // candidate is not a real ambiguity.
  const resolved = target ?? (candidates.length === 1 ? candidates[0] : null)

  // Rung 2: a time request with no resolvable target gets a which-plan
  // question. Candidates are non-empty here, per rung 0.
  if (!resolved) {
    return { action: "reply", body: buildWhichPlanQuestion(candidates.map((c) => c.label)) }
  }

  // Rung 3: a target but no concrete time asks which time. Part one stayed
  // quiet here as concrete-first; the amended guardrail overrides that for a
  // direct ask, and the question is still concrete about everything it knows.
  if (change.requestedTime === null) {
    return { action: "reply", body: buildWhichTimeQuestion(resolved.label) }
  }

  const { timeLocal, disclosure } = resolveChangeTime({
    requestedTime: change.requestedTime,
    requestedTimeAmbiguous: change.requestedTimeAmbiguous,
    eventStartsAt: resolved.startsAt,
    timeZone,
  })
  const newStartsAt = changeStartInstant(resolved.startsAt, timeLocal, timeZone)

  // Rung 4: honest replies for the past and for the time it already has.
  if (newStartsAt.getTime() <= now.getTime()) {
    return { action: "reply", body: PAST_TIME_REPLY }
  }
  if (newStartsAt.getTime() === resolved.startsAt.getTime()) {
    return { action: "reply", body: buildAlreadyAtReply(resolved.label, resolved.startsAt, timeZone, now) }
  }

  // Rung 5: probable but complete verifies with the asker, part one unchanged.
  if (!change.intentClear) {
    return {
      action: "ask",
      proposedStartsAt: newStartsAt,
      question: buildChangeQuestion(resolved.label, newStartsAt, timeZone, now),
    }
  }

  // Rung 6: clear and complete. A group of one is part one's immediate move
  // surviving as the degenerate case; everyone else gets the group proposal.
  if (consensusFloor(memberCount) === 1) {
    return {
      action: "move",
      newStartsAt,
      announcement: buildChangeAnnouncement(
        resolved.label, newStartsAt, resolved.startsAt, timeZone, now, disclosure
      ),
    }
  }
  return {
    action: "propose",
    proposedStartsAt: newStartsAt,
    question: buildGroupProposalQuestion(
      askerName, resolved.label, newStartsAt, resolved.startsAt, timeZone, now, disclosure
    ),
  }
}
