// src/lib/proposals/create.ts
//
// Writes one round of Orbit asking about a probable change request: Orbit's
// question message and the proposal that hangs off it, in ONE transaction
// (the createGauge precedent: chips must never render under nothing, and a
// question the product cannot answer must never be asked).

import { prisma } from "@/lib/prisma"
import { MessageAuthor, ProposalAnswer, ProposalKind, ProposalVoteAnswer } from "@prisma/client"
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

export interface CreateGroupProposalInput {
  groupId: string
  eventId: string
  askerUserId: string
  /** The member message that asked; compound-unique with kind GROUP. */
  sourceMessageId: string
  proposedStartsAt: Date
  priorStartsAt: Date
  /** buildGroupProposalQuestion output; copy stays in change-copy.ts. */
  body: string
  /** Verify-confirm handoff: stamp this VERIFY proposal CONFIRMED in the same tx. */
  resolveVerifyProposalId?: string
}

export type CreateGroupProposalResult =
  | { status: "created"; proposal: ChangeProposal }
  | { status: "skipped"; reason: "already_asked" }

export async function createGroupProposal({
  groupId,
  eventId,
  askerUserId,
  sourceMessageId,
  proposedStartsAt,
  priorStartsAt,
  body,
  resolveVerifyProposalId,
}: CreateGroupProposalInput): Promise<CreateGroupProposalResult> {
  const now = new Date()
  try {
    const proposal = await prisma.$transaction(async (tx) => {
      // Newest wins, per event and per asker: a live GROUP proposal on this
      // event (the conversation moved past its number) and any live proposal
      // of this asker's (a correction retracts the mistake it corrects) are
      // both retired before the new one opens. The verify being confirmed, if
      // any, is excluded here because it gets CONFIRMED below, not SUPERSEDED.
      await tx.changeProposal.updateMany({
        where: {
          answer: null,
          id: { not: resolveVerifyProposalId ?? "" },
          OR: [{ kind: ProposalKind.GROUP, eventId }, { askerUserId }],
        },
        data: { answer: ProposalAnswer.SUPERSEDED, answeredAt: now },
      })

      const orbitMessage = await tx.message.create({
        data: { groupId, authorType: MessageAuthor.ORBIT, authorId: null, body },
      })
      const created = await tx.changeProposal.create({
        data: {
          groupId,
          eventId,
          askerUserId,
          sourceMessageId,
          orbitMessageId: orbitMessage.id,
          proposedStartsAt,
          priorStartsAt,
          kind: ProposalKind.GROUP,
        },
      })
      // The asker's message is their yes, seeded in the same transaction, the
      // gauge-initiator precedent.
      await tx.proposalVote.create({
        data: { proposalId: created.id, userId: askerUserId, answer: ProposalVoteAnswer.YES },
      })
      if (resolveVerifyProposalId) {
        await tx.changeProposal.update({
          where: { id: resolveVerifyProposalId },
          data: { answer: ProposalAnswer.CONFIRMED, answeredAt: now },
        })
      }
      return created
    })
    return { status: "created", proposal }
  } catch (err) {
    // The compound (sourceMessageId, kind) unique: a double-fired detection
    // collides here and the whole transaction, supersedes included, rolls back.
    if ((err as { code?: string }).code === "P2002") {
      return { status: "skipped", reason: "already_asked" }
    }
    throw err
  }
}
