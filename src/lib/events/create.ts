// src/lib/events/create.ts
//
// Data-layer helper for atomically creating an Event (and optional Venue).
// This is the canonical event-creation path used by the Orbit reconciler and
// any future server action that creates a one-off event.

import { prisma } from "@/lib/prisma"
import type { Event } from "@prisma/client"

export interface CreateEventInput {
  groupId: string
  title: string
  startsAt: Date
  endsAt?: Date | null
  activityLabel?: string | null
  venue?: {
    name: string
    displayLabel?: string | null
    address?: string | null
    url?: string | null
  } | null
}

/**
 * Creates an Event (and optionally a Venue) in a single atomic transaction.
 *
 * - If `venue` is provided (non-null), a Venue row is created and linked to
 *   the new Event via `eventId`.
 * - If `venue` is omitted or null, no Venue row is created.  Scheduled events
 *   (created by Orbit's reconciler) use this path — venue is determined later.
 * - Duplicate prevention (@@unique[groupId, startsAt]) is enforced by the DB
 *   constraint, not this function.  The reconciler checks for duplicates before
 *   calling here.
 *
 * Returns the Event row.  The Venue (if created) can be fetched by the caller
 * via `prisma.venue.findFirst({ where: { eventId } })` when needed.
 */
export async function createEvent(input: CreateEventInput): Promise<Event> {
  const { groupId, title, startsAt, endsAt, activityLabel, venue } = input

  return prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        groupId,
        title,
        startsAt,
        endsAt: endsAt ?? null,
        activityLabel: activityLabel ?? null,
      },
    })

    if (venue) {
      await tx.venue.create({
        data: {
          eventId: event.id,
          name: venue.name,
          displayLabel: venue.displayLabel ?? null,
          address: venue.address ?? null,
          url: venue.url ?? null,
        },
      })
    }

    return event
  })
}
