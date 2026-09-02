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
import { EventStatus, MessageAuthor, ProposalAnswer, RsvpStatus, type Prisma } from "@prisma/client"

export type MoveEventResult =
  | { status: "moved" }
  | { status: "skipped"; reason: "no_event" | "stale" | "noop" | "cancelled" }

/**
 * Thrown, never returned, when the resolveProposalId stamp's conditional
 * write finds the row already answered. A caller with its own open
 * transaction (promote.ts) needs this to propagate as a throw so its whole
 * transaction rolls back; moveEventTime catches it at its own boundary and
 * reports the same "stale" skip its other guards already use.
 */
export class ProposalAlreadyResolvedInTx extends Error {}

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

export interface MoveCoreInput {
  eventId: string
  expectedStartsAt: Date
  newStartsAt: Date
  /** Everyone seeded IN on the moved plan. Part one passes [requesterUserId]. */
  seedInUserIds: string[]
  announcementBody: string
  resolveProposalId?: string
}

/**
 * The move's transaction body, shared by the unilateral part-one path
 * (`moveEventTime`, one seeded yes) and the consensus promote (many seeded
 * yeses, the proposal's YES voters). Everything but the RSVP seeding is
 * unchanged from part one: the pre-read guard, the conditional-updateMany
 * stale guard (race-proof at READ COMMITTED), previousStartsAt, the
 * announcement write, and the optional proposal stamp.
 */
export async function moveEventCoreInTx(
  tx: Prisma.TransactionClient,
  {
    eventId,
    expectedStartsAt,
    newStartsAt,
    seedInUserIds,
    announcementBody,
    resolveProposalId,
  }: MoveCoreInput
): Promise<MoveEventResult> {
  const event = await tx.event.findUnique({ where: { id: eventId } })
  if (!event) return { status: "skipped", reason: "no_event" } as const
  // A called-off plan is not a plan to move. Reachable from a stale tab
  // holding a live time-change chip.
  if (event.status === EventStatus.CANCELLED) {
    return { status: "skipped", reason: "cancelled" } as const
  }
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
  if (seedInUserIds.length > 0) {
    await tx.rsvp.createMany({
      data: seedInUserIds.map((userId) => ({ eventId, userId, status: RsvpStatus.IN })),
      skipDuplicates: true,
    })
  }

  await tx.message.create({
    data: {
      groupId: event.groupId,
      authorType: MessageAuthor.ORBIT,
      authorId: null,
      body: announcementBody,
    },
  })

  if (resolveProposalId) {
    // Conditional, the same race-proof shape as the event's own stale guard
    // above: only stamps CONFIRMED if the row is still answer-null. Without
    // this, a supersede (or any other resolution) committed between this
    // transaction's pre-checks and this write would be silently overwritten,
    // since a plain `update` never looks at the row's current state. A miss
    // here throws rather than returns, because by this point the event has
    // already moved within this same transaction: only a throw rolls that
    // back too, which a normal return would not.
    const stamped = await tx.changeProposal.updateMany({
      where: { id: resolveProposalId, answer: null },
      data: { answer: ProposalAnswer.CONFIRMED, answeredAt: new Date() },
    })
    if (stamped.count === 0) throw new ProposalAlreadyResolvedInTx()
  }

  return { status: "moved" } as const
}

export async function moveEventTime({
  eventId,
  expectedStartsAt,
  newStartsAt,
  requesterUserId,
  announcementBody,
  resolveProposalId,
}: MoveEventInput): Promise<MoveEventResult> {
  try {
    return await prisma.$transaction((tx) =>
      moveEventCoreInTx(tx, {
        eventId,
        expectedStartsAt,
        newStartsAt,
        seedInUserIds: [requesterUserId],
        announcementBody,
        resolveProposalId,
      })
    )
  } catch (err) {
    if (err instanceof ProposalAlreadyResolvedInTx) {
      return { status: "skipped", reason: "stale" } as const
    }
    throw err
  }
}
