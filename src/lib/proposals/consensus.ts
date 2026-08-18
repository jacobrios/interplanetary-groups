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

// `oneMoreClearsIt` lived here until 17 Aug 2026 (event-copy pass). Its only
// caller was the proposal tally's countdown clause, and the tally was deleted
// whole, so it went with it rather than sitting here reading as live code. Git
// has it if the time-change endgame ever wants a countdown back; what it did
// was answer "is one more yes from anyone guaranteed to clear the bar", which
// is not the same question as hasConsensus and would need writing again with
// care.
