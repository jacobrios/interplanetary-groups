//
// The consensus bar for moving a plan's time, pure and derived from rows every
// time (the RSVP derived-counts rule; nothing here is ever stored).
//
// The bar is two conditions checked together:
//   floor:      at least three yeses, or the whole group when it is smaller.
//   comparison: more yeses than the incumbent side has people.
//
// The incumbent side is everyone in on the current time plus everyone who
// tapped keep, minus everyone who said yes to the new time: a yes from someone
// who was in is that person switching sides, which is what makes the bar
// reachable in every group (the spec's small-group resolution). Someone with
// no RSVP and no tap counts for neither side: silence is pending, not a vote.

import { SPARK_THRESHOLD } from "@/lib/orbit/spark-copy"

/** The seed's "one number the product already uses": the spark threshold. */
export const CONSENSUS_THRESHOLD = SPARK_THRESHOLD

export interface ConsensusInput {
  /** Distinct user ids with a live YES vote (member-filtered by the caller). */
  yesVoterIds: string[]
  /** Distinct user ids with a live KEEP vote (member-filtered by the caller). */
  keepVoterIds: string[]
  /** Distinct user ids with an IN RSVP on the event's current time. */
  currentInUserIds: string[]
  memberCount: number
}

export function consensusFloor(memberCount: number): number {
  return Math.max(1, Math.min(CONSENSUS_THRESHOLD, memberCount))
}

export function incumbentCount({
  yesVoterIds,
  keepVoterIds,
  currentInUserIds,
}: ConsensusInput): number {
  const yes = new Set(yesVoterIds)
  const incumbent = new Set([...currentInUserIds, ...keepVoterIds])
  return [...incumbent].filter((id) => !yes.has(id)).length
}

export function hasConsensus(i: ConsensusInput): boolean {
  const yes = new Set(i.yesVoterIds).size
  return yes >= consensusFloor(i.memberCount) && yes > incumbentCount(i)
}

/**
 * True when one more yes, from anyone at all, is guaranteed to clear the bar:
 * the countdown clause must never promise what an unlucky voter cannot
 * deliver. A yes from an incumbent clears more easily (it shrinks their side),
 * so checking the non-incumbent case covers everyone.
 */
export function oneMoreClearsIt(i: ConsensusInput): boolean {
  if (hasConsensus(i)) return false
  const yes = new Set(i.yesVoterIds).size
  return yes + 1 >= consensusFloor(i.memberCount) && yes + 1 > incumbentCount(i)
}
