// src/lib/proposals/create.ts
//
// Writes one round of Orbit asking about a probable change request: Orbit's
// question message and the proposal that hangs off it, in ONE transaction
// (the createGauge precedent: chips must never render under nothing, and a
// question the product cannot answer must never be asked).

import { prisma } from "@/lib/prisma"
import { MessageAuthor } from "@prisma/client"
import type { ChangeProposal } from "@prisma/client"

export interface CreateChangeProposalInput {
  groupId: string
  eventId: string
  askerUserId: string
  /** The MEMBER message being clarified. Also the idempotency key. */
  sourceMessageId: string
  proposedStartsAt: Date
  /** The event's start as the asker was shown it: the staleness baseline. */
  priorStartsAt: Date
  /** Orbit's composed question. Copy lives in orbit/change-copy.ts, not here. */
  body: string
}

export type CreateChangeProposalResult =
  | { status: "created"; proposal: ChangeProposal }
  | { status: "skipped"; reason: "already_asked" }

export async function createChangeProposal({
  groupId,
  eventId,
  askerUserId,
  sourceMessageId,
  proposedStartsAt,
  priorStartsAt,
  body,
}: CreateChangeProposalInput): Promise<CreateChangeProposalResult> {
  try {
    const proposal = await prisma.$transaction(async (tx) => {
      const orbitMessage = await tx.message.create({
        data: { groupId, authorType: MessageAuthor.ORBIT, authorId: null, body },
      })
      return tx.changeProposal.create({
        data: {
          groupId,
          eventId,
          askerUserId,
          sourceMessageId,
          orbitMessageId: orbitMessage.id,
          proposedStartsAt,
          priorStartsAt,
        },
      })
    })
    return { status: "created", proposal }
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      return { status: "skipped", reason: "already_asked" }
    }
    throw err
  }
}
