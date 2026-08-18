// src/lib/proposals/tally.ts
//
// The single composition behind a group time-change proposal's chips: the
// two labels and the viewer's own standing answer. The group home's live feed
// (page.tsx) and the event screen's band (lib/pending/derive.ts) both read it
// here rather than each deriving it, which is what keeps the same proposal
// from reading one way in chat and another way on the plan's own screen to
// the same person at the same moment.
//
// It also composed a tally line, from the yes/keep/currently-in reckoning,
// until the event-copy pass (17 Aug 2026) deleted that line from the product;
// the reasoning sits in change-copy.ts where the builder used to live. The
// member-filtered vote arithmetic went with it, which is why this module no
// longer needs to know who the members are or how many there are.

import type { ProposalVoteAnswer } from "@prisma/client"
import type { LiveProposal } from "./read"
import { proposalChipLabels } from "@/lib/orbit/change-copy"

export interface GroupProposalTally {
  labels: { yes: string; keep: string }
  viewerAnswer: ProposalVoteAnswer | null
}

/**
 * Everything a GROUP-kind proposal's chips need, composed once from the live
 * rows: the two chip labels and the viewer's own answer.
 *
 * The viewer's answer is read from the unfiltered vote rows, not a
 * member-filtered set (the gauge precedent): the viewer's own chip must
 * reflect what they actually chose, member or not.
 */
export function deriveGroupProposalTally(input: {
  proposal: LiveProposal
  viewerId: string | null
  timeZone: string
}): GroupProposalTally {
  const { proposal: p, viewerId, timeZone } = input

  return {
    labels: proposalChipLabels(p.proposedStartsAt, p.priorStartsAt, timeZone),
    viewerAnswer: p.votes.find((v) => v.userId === viewerId)?.answer ?? null,
  }
}
