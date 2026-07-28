// src/lib/orbit/change-plan.ts
//
// The pure decision at the heart of the change-request flow: given a
// normalized change claim and the plan it targets, what does Orbit do?
// Deterministic and fully unit-tested; the server action just carries the
// answer out (move, ask, reply, or nothing).

import type { NormalizedChange } from "./spark"
import {
  buildCantDoReply,
  buildChangeAnnouncement,
  buildChangeQuestion,
  changeStartInstant,
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

export function planChange(
  change: NormalizedChange,
  target: ChangeTarget | null,
  timeZone: string,
  now: Date
): ChangePlan {
  // No confident target and no best guess either: nothing to act on or ask about.
  if (!target) return { action: "quiet" }

  // Anything beyond the time is out of this slice. An honest decline, but only
  // for a plainly asked request: "I can't do that yet" aimed at something that
  // maybe was not a request would be Orbit interjecting on chatter. A compound
  // request declines whole rather than acting on half of it.
  if (change.requestedFields.some((f) => f !== "time")) {
    return change.intentClear
      ? { action: "reply", body: buildCantDoReply(change.requestedFields, target.startsAt, timeZone) }
      : { action: "quiet" }
  }

  // A time request with no concrete time ("can we do it later?") gives Orbit
  // nothing concrete to propose. Concrete-first cuts both ways: stay quiet.
  if (change.requestedTime === null) return { action: "quiet" }

  const { timeLocal, disclosure } = resolveChangeTime({
    requestedTime: change.requestedTime,
    requestedTimeAmbiguous: change.requestedTimeAmbiguous,
    eventStartsAt: target.startsAt,
    timeZone,
  })
  const newStartsAt = changeStartInstant(target.startsAt, timeLocal, timeZone)

  // No plans about the past, same principle as promote's start_passed skip.
  if (newStartsAt.getTime() <= now.getTime()) {
    return change.intentClear ? { action: "reply", body: PAST_TIME_REPLY } : { action: "quiet" }
  }

  // The time it already has: nothing to do. This also makes an accidentally
  // repeated detection of the same message harmless.
  if (newStartsAt.getTime() === target.startsAt.getTime()) return { action: "quiet" }

  if (change.intentClear) {
    return {
      action: "move",
      newStartsAt,
      announcement: buildChangeAnnouncement(
        target.label, newStartsAt, target.startsAt, timeZone, now, disclosure
      ),
    }
  }

  return {
    action: "ask",
    proposedStartsAt: newStartsAt,
    question: buildChangeQuestion(target.label, newStartsAt, timeZone, now),
  }
}
