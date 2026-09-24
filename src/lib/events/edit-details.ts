// src/lib/events/edit-details.ts
//
// Correcting an existing plan's title and place. This is the write path the
// parked group-details-editing slice reuses (docs/superpowers/specs
// /2026-09-02-founder-fixes-group-details-design.md queues it as "engineering
// grounds, not product ones": that slice and this one write the same fields
// onto an existing event), so nothing card-specific belongs here. It never
// touches an RSVP row, startsAt, scheduledKey or gaugeId: a title or place
// correction is not a time change, and none of those four describe what got
// corrected.
//
// updatedAt is always bumped, even on a place-only edit that writes no other
// Event column, because it is the calendar file's SEQUENCE
// (lib/events/ics.ts): a member who already added this plan to their own
// calendar needs their app to see a newer version of the same file, and
// SEQUENCE is read from this column.
//
// A place change updates the existing Venue row in place rather than
// deleting and recreating it. Venue.rsvps is a real relation
// (Rsvp.venueId), and a delete-then-create would null every RSVP's venueId
// for a venue nobody actually stopped attending; the place just has a new
// name. Composing this module's own copy is the caller's job (announce),
// exactly like cancel.ts and move.ts: the wording lives in one place
// (lib/orbit/edit-copy.ts) and this file stays about state.
//
// The stale guard is the same shape cancel.ts and move.ts use: the first
// read is a fast path, not the guard, because at READ COMMITTED two
// concurrent editors can both pass it. The conditional updateMany,
// matching on the row's own updatedAt, is the real guard. updatedAt is set
// explicitly in that write rather than left to Prisma's @updatedAt,
// because a place-only edit otherwise writes no other column on Event and
// @updatedAt only fires when a write actually touches the row.

import { prisma } from "@/lib/prisma"
import { EventStatus, MessageAuthor, type Prisma } from "@prisma/client"
import { VENUE_NAME_MAX } from "@/lib/orbit/rhythm"
import type { DetailChange } from "@/lib/orbit/edit-copy"
import { EDIT_TITLE_MAX } from "./edit-fields"

// Re-exported so server-side callers and tests can keep importing it from
// here; client code must import it from ./edit-fields instead.
export { EDIT_TITLE_MAX }

export type EditDetailsResult =
  | { status: "edited"; change: DetailChange }
  | {
      status: "skipped"
      reason:
        | "no_event"
        | "cancelled"
        | "already_started"
        | "noop"
        | "stale"
        | "invalid_title"
        | "invalid_place"
    }

export type ApplyDetailChangeResult =
  | { status: "applied"; change: DetailChange; currentTitle: string; groupId: string }
  | {
      status: "skipped"
      reason:
        | "no_event"
        | "cancelled"
        | "already_started"
        | "noop"
        | "stale"
        | "invalid_title"
        | "invalid_place"
    }

interface ApplyDetailChangeInput {
  eventId: string
  /** Raw form value. */
  title: string
  /** Raw form value; empty (after trim) clears the place. */
  place: string
  now: Date
}

interface EditDetailsInput {
  eventId: string
  /** Raw form value. */
  title: string
  /** Raw form value; empty (after trim) clears the place. */
  place: string
  now: Date
  /** Composes Orbit's line from what actually changed; this module writes no copy. */
  announce: (change: DetailChange, currentTitle: string) => string
}

/**
 * Everything `editEventDetails` does from input validation through the
 * venue write, minus the message: the write path Task 7's group-details
 * save reuses so it can compose its own single Orbit announcement (or none,
 * when the founder is alone and the plan itself moves instead) rather than
 * inheriting this module's one-line copy. Validation is pure and cheap, so
 * it runs inside the transaction here too, same as `editEventDetails`.
 */
export async function applyDetailChangeInTx(
  tx: Prisma.TransactionClient,
  { eventId, title, place, now }: ApplyDetailChangeInput
): Promise<ApplyDetailChangeResult> {
  const trimmedTitle = title.trim()
  if (trimmedTitle.length === 0 || trimmedTitle.length > EDIT_TITLE_MAX) {
    return { status: "skipped", reason: "invalid_title" } as const
  }
  const trimmedPlace = place.trim()
  if (trimmedPlace.length > VENUE_NAME_MAX) {
    return { status: "skipped", reason: "invalid_place" } as const
  }

  const event = await tx.event.findUnique({
    where: { id: eventId },
    include: { venues: { orderBy: { id: "asc" }, take: 1 } },
  })
  if (!event) return { status: "skipped", reason: "no_event" } as const
  if (event.status === EventStatus.CANCELLED) {
    return { status: "skipped", reason: "cancelled" } as const
  }
  if (event.startsAt.getTime() <= now.getTime()) {
    return { status: "skipped", reason: "already_started" } as const
  }

  const venue = event.venues[0] ?? null
  const currentPlace = venue ? (venue.displayLabel ?? venue.name) : null
  const newPlace = trimmedPlace.length > 0 ? trimmedPlace : null

  const change: DetailChange = {}
  if (trimmedTitle !== event.title) {
    change.title = { from: event.title, to: trimmedTitle }
  }
  if (newPlace !== currentPlace) {
    change.place = { from: currentPlace, to: newPlace }
  }
  if (!change.title && !change.place) {
    return { status: "skipped", reason: "noop" } as const
  }

  const currentTitle = event.title

  const updated = await tx.event.updateMany({
    where: { id: eventId, status: EventStatus.SCHEDULED, updatedAt: event.updatedAt },
    data: {
      ...(change.title ? { title: trimmedTitle, activityLabel: trimmedTitle } : {}),
      updatedAt: new Date(),
    },
  })
  if (updated.count === 0) return { status: "skipped", reason: "stale" } as const

  if (change.place) {
    if (newPlace === null) {
      // venue is non-null here: currentPlace can only be non-null when a
      // venue exists, and newPlace !== currentPlace with newPlace === null
      // means currentPlace was non-null.
      await tx.venue.delete({ where: { id: venue!.id } })
    } else if (venue) {
      await tx.venue.update({
        where: { id: venue.id },
        data: { name: newPlace, displayLabel: null, address: null, url: null },
      })
    } else {
      await tx.venue.create({ data: { eventId, name: newPlace } })
    }
  }

  return { status: "applied", change, currentTitle, groupId: event.groupId } as const
}

export async function editEventDetails({
  eventId,
  title,
  place,
  now,
  announce,
}: EditDetailsInput): Promise<EditDetailsResult> {
  return prisma.$transaction(async (tx) => {
    const result = await applyDetailChangeInTx(tx, { eventId, title, place, now })
    if (result.status !== "applied") return result

    await tx.message.create({
      data: {
        groupId: result.groupId,
        authorType: MessageAuthor.ORBIT,
        authorId: null,
        body: announce(result.change, result.currentTitle),
      },
    })

    return { status: "edited", change: result.change } as const
  })
}
