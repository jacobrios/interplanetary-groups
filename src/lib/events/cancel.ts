// src/lib/events/cancel.ts
//
// Calling off one occurrence, and putting it back.
//
// Modelled directly on move.ts, and the contrast with it is the whole design.
// A move deletes every RSVP, because the plan changed and an 8am yes
// displayed against a 6pm plan misrepresents who is coming. A cancel does
// not change the plan, it removes it; if it comes back it is the identical
// plan at the identical time, and the people who said they were coming still
// mean it. So THIS MODULE NEVER TOUCHES AN RSVP ROW, and that is what makes
// "anyone can undo it" safe rather than merely permitted (spec section 5).
//
// The row is never deleted either. hasUpcomingScheduledEvent has no status
// filter, so a delete would free both that guard and the unique
// scheduledKey, and the hourly cron would recreate the cancelled plan within
// the hour with a fresh announcement. The cancelled row is its own
// tombstone; reconcile needs no change at all.
//
// This module composes no copy. The caller passes announcementBody in,
// exactly as moveEventTime takes it, so the wording lives in one place
// (lib/orbit/cancel-copy.ts) and this file stays about state.

import { prisma } from "@/lib/prisma"
import {
  EventStatus,
  MessageAuthor,
  ProposalAnswer,
  ProposalKind,
} from "@prisma/client"

export type CancelEventResult =
  | { status: "cancelled" }
  | {
      status: "skipped"
      reason: "no_event" | "already_cancelled" | "already_started" | "stale"
    }

export type RestoreEventResult =
  | { status: "restored" }
  | { status: "skipped"; reason: "no_event" | "not_cancelled" | "stale" }

interface CancelInput {
  eventId: string
  /** Composed by the caller (lib/orbit/cancel-copy), in the group's timezone. */
  announcementBody: string
  now: Date
}

/**
 * Call off one occurrence. Everything lands in one transaction for the same
 * reason move.ts gives: half of this visible mid-write would be Orbit
 * announcing a cancellation against a card that still offers an RSVP.
 */
export async function cancelEvent({
  eventId,
  announcementBody,
  now,
}: CancelInput): Promise<CancelEventResult> {
  return prisma.$transaction(async (tx) => {
    const event = await tx.event.findUnique({ where: { id: eventId } })
    if (!event) return { status: "skipped", reason: "no_event" } as const
    if (event.status === EventStatus.CANCELLED) {
      return { status: "skipped", reason: "already_cancelled" } as const
    }
    // Cancelling a game that already happened means nothing, and the detail
    // page is reachable by URL for a past event.
    if (event.startsAt.getTime() <= now.getTime()) {
      return { status: "skipped", reason: "already_started" } as const
    }

    // The pre-read above is a fast path, not the guard: at READ COMMITTED two
    // concurrent callers can both pass it. This conditional write is the real
    // guard, the same shape move.ts uses. A count of 0 means the other caller
    // won, so this one reports stale rather than writing a second
    // announcement for a cancellation that already happened.
    const updated = await tx.event.updateMany({
      where: { id: eventId, status: EventStatus.SCHEDULED },
      data: { status: EventStatus.CANCELLED, cancelledAt: now },
    })
    if (updated.count === 0) return { status: "skipped", reason: "stale" } as const

    // A live vote to move this plan is moot the moment the plan is off, and
    // leaving it open would keep asking the group to move a game that is not
    // happening. SUPERSEDED with nothing posted is the rule already settled
    // in the time-change-ending slice for a vote made moot because the plan
    // changed some other way. Conditional on answer:null so a concurrent
    // resolution is never overwritten.
    await tx.changeProposal.updateMany({
      where: { eventId, kind: ProposalKind.GROUP, answer: null },
      data: { answer: ProposalAnswer.SUPERSEDED, answeredAt: now },
    })

    await tx.message.create({
      data: {
        groupId: event.groupId,
        authorType: MessageAuthor.ORBIT,
        authorId: null,
        body: announcementBody,
      },
    })

    return { status: "cancelled" } as const
  })
}

/**
 * Put a called-off occurrence back. The mirror of cancelEvent, with one
 * deliberate asymmetry: it does NOT revive the vote the cancel superseded.
 * That vote is dead, and reopening a question nobody is currently asking is
 * worse than silence. Anyone who still wants the time moved can ask again.
 */
export async function restoreEvent({
  eventId,
  announcementBody,
  now,
}: CancelInput): Promise<RestoreEventResult> {
  return prisma.$transaction(async (tx) => {
    const event = await tx.event.findUnique({ where: { id: eventId } })
    if (!event) return { status: "skipped", reason: "no_event" } as const
    if (event.status !== EventStatus.CANCELLED) {
      return { status: "skipped", reason: "not_cancelled" } as const
    }

    const updated = await tx.event.updateMany({
      where: { id: eventId, status: EventStatus.CANCELLED },
      data: { status: EventStatus.SCHEDULED, cancelledAt: null },
    })
    if (updated.count === 0) return { status: "skipped", reason: "stale" } as const

    await tx.message.create({
      data: {
        groupId: event.groupId,
        authorType: MessageAuthor.ORBIT,
        authorId: null,
        body: announcementBody,
      },
    })

    return { status: "restored" } as const
  })
}
