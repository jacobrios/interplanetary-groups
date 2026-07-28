// src/lib/events/move.ts
//
// The first Event mutation in the product: a change request moving an event's
// start time.
//
// Everything lands in one transaction: the new start (with the old one
// remembered on previousStartsAt), the RSVP reset, the requester's seeded yes,
// Orbit's announcement, and, on the confirm path, the proposal's resolution.
// Half of this visible mid-write would be Orbit announcing a time the card
// does not show, or a card whose yeses belong to a different time. The
// promote.ts precedent, applied to a mutation.
//
// The RSVP reset is the product's first row deletion. A moved time is a new
// proposal, and an 8am yes displayed against a 6pm plan misrepresents who is
// coming, which is the exact failure the RSVP rules exist to prevent. The
// requester is the one exception: they named the time they asked for, so
// their message already is their yes (the gauge-initiator precedent).
//
// scheduledKey is deliberately never touched here: a move relocates the
// occurrence, it does not free the slot (see the schema comment and the
// reconcile test pinning the cron's side of this).

import { prisma } from "@/lib/prisma"
import { MessageAuthor, ProposalAnswer, RsvpStatus } from "@prisma/client"

export type MoveEventResult =
  | { status: "moved" }
  | { status: "skipped"; reason: "no_event" | "stale" | "noop" }

export interface MoveEventInput {
  eventId: string
  /**
   * The start the caller believes the event has. Re-checked inside the
   * transaction so a move can never fire from a state nobody was shown:
   * a concurrent change comes back as a stale skip, not a surprise.
   */
  expectedStartsAt: Date
  newStartsAt: Date
  requesterUserId: string
  /** Composed by the caller (change-copy), in the group's timezone. */
  announcementBody: string
  /** Confirm path only: resolve this proposal in the same transaction. */
  resolveProposalId?: string
}

export async function moveEventTime({
  eventId,
  expectedStartsAt,
  newStartsAt,
  requesterUserId,
  announcementBody,
  resolveProposalId,
}: MoveEventInput): Promise<MoveEventResult> {
  return prisma.$transaction(async (tx) => {
    const event = await tx.event.findUnique({ where: { id: eventId } })
    if (!event) return { status: "skipped", reason: "no_event" } as const
    if (event.startsAt.getTime() !== expectedStartsAt.getTime()) {
      return { status: "skipped", reason: "stale" } as const
    }
    if (event.startsAt.getTime() === newStartsAt.getTime()) {
      return { status: "skipped", reason: "noop" } as const
    }

    // The pre-read above is a fast path, not the guard: at READ COMMITTED two
    // concurrent calls can both pass it and both try to write. The real stale
    // guard is this conditional write, which only succeeds if startsAt still
    // matches what was just read; a concurrent mover would have already
    // changed it, so this one loses the race and reports stale honestly
    // instead of overwriting the other mover's result.
    const updated = await tx.event.updateMany({
      where: { id: eventId, startsAt: expectedStartsAt },
      data: { startsAt: newStartsAt, previousStartsAt: event.startsAt },
    })
    if (updated.count === 0) return { status: "skipped", reason: "stale" } as const

    await tx.rsvp.deleteMany({ where: { eventId } })
    await tx.rsvp.create({
      data: { eventId, userId: requesterUserId, status: RsvpStatus.IN },
    })

    await tx.message.create({
      data: {
        groupId: event.groupId,
        authorType: MessageAuthor.ORBIT,
        authorId: null,
        body: announcementBody,
      },
    })

    if (resolveProposalId) {
      await tx.changeProposal.update({
        where: { id: resolveProposalId },
        data: { answer: ProposalAnswer.CONFIRMED, answeredAt: new Date() },
      })
    }

    return { status: "moved" } as const
  })
}
