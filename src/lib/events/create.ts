// src/lib/events/create.ts
//
// Data-layer helper for atomically creating an Event (and optional Venue).
// This is the canonical event-creation path used by the Orbit reconciler and
// any future server action that creates a one-off event.

import { prisma } from "@/lib/prisma"
import type { Event, Prisma } from "@prisma/client"

export interface CreateEventInput {
  groupId: string
  title: string
  startsAt: Date
  endsAt?: Date | null
  activityLabel?: string | null
  /** Set only by the spark path: the gauge this event was created from. */
  gaugeId?: string | null
  /** Set only by reconcile.ts: "<groupId>:<ISO instant>". The scheduled path's idempotency key. */
  scheduledKey?: string | null
  venue?: {
    name: string
    displayLabel?: string | null
    address?: string | null
    url?: string | null
  } | null
}

/**
 * The event write itself, inside a caller-supplied transaction.
 *
 * Exists because promoteGaugeToEvent needs the event, its venue, the seeded
 * RSVPs and Orbit's announcement to land together or not at all, and Prisma
 * cannot nest interactive transactions. Keeping the write here rather than
 * copying it into promote.ts keeps one canonical event-creation path.
 */
export async function createEventInTx(
  tx: Prisma.TransactionClient,
  input: CreateEventInput
): Promise<Event> {
  const { groupId, title, startsAt, endsAt, activityLabel, venue, gaugeId, scheduledKey } = input

  const event = await tx.event.create({
    data: {
      groupId,
      title,
      startsAt,
      endsAt: endsAt ?? null,
      activityLabel: activityLabel ?? null,
      gaugeId: gaugeId ?? null,
      scheduledKey: scheduledKey ?? null,
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
}

/**
 * Creates an Event (and optionally a Venue) in a single atomic transaction.
 *
 * - If `venue` is provided (non-null), a Venue row is created and linked to
 *   the new Event via `eventId`.
 * - If `venue` is omitted or null, no Venue row is created.  Scheduled events
 *   (created by Orbit's reconciler) use this path — venue is determined later.
 * - Duplicate prevention is per creation path, not a blanket constraint on the
 *   instant: `gaugeId` is unique for sparked events, `scheduledKey` is unique
 *   for the cron's. The old @@unique([groupId, startsAt]) was dropped because
 *   two events legitimately may share an instant (build-notes §11, spark part
 *   two). Callers still check before calling; the keys catch the races.
 *
 * Returns the Event row.  The Venue (if created) can be fetched by the caller
 * via `prisma.venue.findFirst({ where: { eventId } })` when needed.
 */
export async function createEvent(input: CreateEventInput): Promise<Event> {
  return prisma.$transaction((tx) => createEventInTx(tx, input))
}
