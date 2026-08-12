// src/lib/proposals/tally.ts
//
// The single computation behind a group time-change proposal's chips: the
// same yes/keep/currently-in reckoning that produces the chip labels and the
// tally line. Before this extraction, the group home's live feed
// composition (page.tsx) and the card region's per-viewer bands
// (lib/pending/derive.ts) each recomputed this independently from the same
// rows and agreed only by coincidence of being written the same way. If a
// later change touched how the tally reads and only one copy got updated,
// the same proposal would show one tally in the chat feed and a different
// one on its event card's detail screen, to the same person, at the same
// moment. This is the fix: one function, both callers.

import type { ProposalVoteAnswer } from "@prisma/client"
import type { LiveProposal } from "./read"
import { buildProposalTallyLine, proposalChipLabels } from "@/lib/orbit/change-copy"
import { oneMoreClearsIt } from "./consensus"

export interface GroupProposalTally {
  labels: { yes: string; keep: string }
  /** Composed server-side; empty string until someone has voted. */
  tallyLine: string
  viewerAnswer: ProposalVoteAnswer | null
}

/**
 * Everything a GROUP-kind proposal's chips need, computed once from the live
 * rows: chip labels, the tally line (names for yes, count for keep, a
 * countdown when one more vote clears the consensus bar), and the viewer's
 * own answer.
 *
 * The viewer's answer is read from the unfiltered vote rows, not the
 * member-filtered set (the gauge precedent): the viewer's own chip must
 * reflect what they actually chose, member or not.
 */
export function deriveGroupProposalTally(input: {
  proposal: LiveProposal
  viewerId: string | null
  memberIds: Set<string>
  memberCount: number
  timeZone: string
}): GroupProposalTally {
  const { proposal: p, viewerId, memberIds, memberCount, timeZone } = input

  const memberVotes = p.votes.filter((v) => memberIds.has(v.userId))
  const yesVoters = memberVotes.filter((v) => v.answer === "YES")
  const consensusInput = {
    yesVoterIds: yesVoters.map((v) => v.userId),
    keepVoterIds: memberVotes.filter((v) => v.answer === "KEEP").map((v) => v.userId),
    currentInUserIds: p.event.rsvps
      .filter((r) => r.status === "IN" && memberIds.has(r.userId))
      .map((r) => r.userId),
    memberCount,
  }

  return {
    labels: proposalChipLabels(p.proposedStartsAt, p.priorStartsAt, timeZone),
    tallyLine: buildProposalTallyLine(
      yesVoters.map((v) => v.user.name),
      consensusInput.keepVoterIds.length,
      oneMoreClearsIt(consensusInput)
    ),
    viewerAnswer: p.votes.find((v) => v.userId === viewerId)?.answer ?? null,
  }
}
