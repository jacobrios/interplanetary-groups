// src/lib/proposals/promote.ts
//
// The consensus promote, the gauges/promote.ts shape: cheap pre-checks outside
// the transaction, then everything re-read inside it, so a racing mind-change
// or RSVP can never move a plan the rows no longer support.

import { prisma } from "@/lib/prisma"
import { ProposalKind, ProposalVoteAnswer, RsvpStatus } from "@prisma/client"
import { hasConsensus } from "./consensus"
import { moveEventCoreInTx, ProposalAlreadyResolvedInTx } from "@/lib/events/move"
import { buildConsensusAnnouncement } from "@/lib/orbit/change-copy"

export type ProposalPromoteResult =
  | { status: "moved" }
  | { status: "skipped"; reason: "no_proposal" | "not_live" | "below_bar" | "stale" }

class BelowBarInTx extends Error {}
class StaleInTx extends Error {}

export async function promoteProposalMove(
  proposalId: string,
  now: Date
): Promise<ProposalPromoteResult> {
  const proposal = await prisma.changeProposal.findUnique({
    where: { id: proposalId },
    include: { event: true, group: true },
  })
  if (!proposal || proposal.kind !== ProposalKind.GROUP) {
    return { status: "skipped", reason: "no_proposal" }
  }
  if (
    proposal.answer !== null ||
    proposal.event.startsAt.getTime() <= now.getTime() ||
    proposal.proposedStartsAt.getTime() <= now.getTime() ||
    proposal.priorStartsAt.getTime() !== proposal.event.startsAt.getTime()
  ) {
    return { status: "skipped", reason: "not_live" }
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Everything the bar reads is re-read here: two people can tap in the
      // same second, RSVPs can land mid-vote, and the losing snapshot must
      // never decide a move (the gauge-promote precedent).
      const [votes, memberships, rsvps] = await Promise.all([
        tx.proposalVote.findMany({
          where: { proposalId },
          select: { userId: true, answer: true },
        }),
        tx.membership.findMany({
          where: { groupId: proposal.groupId },
          select: { userId: true },
        }),
        tx.rsvp.findMany({
          where: { eventId: proposal.eventId, status: RsvpStatus.IN },
          select: { userId: true },
        }),
      ])
      const memberIds = new Set(memberships.map((m) => m.userId))
      const memberVotes = votes.filter((v) => memberIds.has(v.userId))
      const yesVoterIds = memberVotes
        .filter((v) => v.answer === ProposalVoteAnswer.YES)
        .map((v) => v.userId)
      const input = {
        yesVoterIds,
        keepVoterIds: memberVotes
          .filter((v) => v.answer === ProposalVoteAnswer.KEEP)
          .map((v) => v.userId),
        currentInUserIds: rsvps.map((r) => r.userId).filter((id) => memberIds.has(id)),
        memberCount: memberIds.size,
      }
      if (!hasConsensus(input)) throw new BelowBarInTx()

      const label =
        proposal.event.activityLabel ?? proposal.event.title.toLowerCase()
      const moved = await moveEventCoreInTx(tx, {
        eventId: proposal.eventId,
        expectedStartsAt: proposal.priorStartsAt,
        newStartsAt: proposal.proposedStartsAt,
        // KEEP voters get no row, deliberately (spec: their tap compared two
        // times, it never answered attendance at the new one).
        seedInUserIds: yesVoterIds,
        announcementBody: buildConsensusAnnouncement(
          label, proposal.proposedStartsAt, proposal.priorStartsAt,
          proposal.group.timeZone, now
        ),
        resolveProposalId: proposal.id,
      })
      if (moved.status !== "moved") throw new StaleInTx()
    })
    return { status: "moved" }
  } catch (err) {
    if (err instanceof BelowBarInTx) return { status: "skipped", reason: "below_bar" }
    if (err instanceof StaleInTx) return { status: "skipped", reason: "stale" }
    // moveEventCoreInTx's own conditional stamp guard: the proposal was
    // resolved (typically SUPERSEDED by a racing createGroupProposal)
    // between this function's pre-check and the stamp write inside the
    // transaction. Same skip reason as StaleInTx; this is move.ts's guard
    // firing instead of promote's own re-read.
    if (err instanceof ProposalAlreadyResolvedInTx) return { status: "skipped", reason: "stale" }
    throw err
  }
}
