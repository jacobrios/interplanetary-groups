// src/lib/proposals/read.ts
//
// Reads the change questions a group is currently being asked. Liveness is
// derived, never stored, like gauges: a proposal is live while it is
// unanswered, its event has not started, and the event still starts where the
// asker was shown it. A move by any other path silently retires the question
// (its message stays as history with no chips, no residue), and the
// priorStartsAt comparison is what makes a confirm on a stale question
// impossible to render in the first place.

import { prisma } from "@/lib/prisma"
import { EventStatus } from "@prisma/client"
import type { ChangeProposal, Event, ProposalVote, Rsvp, User } from "@prisma/client"

export type LiveProposal = ChangeProposal & {
  event: Event & { rsvps: Rsvp[] }
  votes: (ProposalVote & { user: User })[]
  asker: User
}

export async function findLiveProposals(
  groupId: string,
  now: Date
): Promise<LiveProposal[]> {
  const candidates = await prisma.changeProposal.findMany({
    where: {
      groupId,
      answer: null,
      event: {
        startsAt: { gt: now },
        // Belt and braces beside the supersede inside cancelEvent: a
        // proposal opened in the same second as a cancellation would
        // otherwise keep asking the group to move a game that is off.
        status: EventStatus.SCHEDULED,
      },
      // A proposal whose proposed time has itself passed is no longer
      // answerable: confirming it would move the plan into the past, so its
      // chips stop rendering here rather than depending on the action guard.
      proposedStartsAt: { gt: now },
    },
    include: {
      event: { include: { rsvps: true } },
      votes: { include: { user: true } },
      asker: true,
    },
    orderBy: { createdAt: "asc" },
  })

  return candidates.filter(
    (p) => p.priorStartsAt.getTime() === p.event.startsAt.getTime()
  )
}
