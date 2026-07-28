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
import type { ChangeProposal, Event } from "@prisma/client"

export type LiveProposal = ChangeProposal & { event: Event }

export async function findLiveProposals(
  groupId: string,
  now: Date
): Promise<LiveProposal[]> {
  const candidates = await prisma.changeProposal.findMany({
    where: {
      groupId,
      answer: null,
      event: { startsAt: { gt: now } },
    },
    include: { event: true },
    orderBy: { createdAt: "asc" },
  })

  return candidates.filter(
    (p) => p.priorStartsAt.getTime() === p.event.startsAt.getTime()
  )
}
