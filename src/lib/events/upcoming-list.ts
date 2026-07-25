// src/lib/events/upcoming-list.ts
//
// Upcoming-event queries that know the difference between the two creation
// paths.
//
// findSoonestUpcomingEvent (upcoming.ts) answers "what is next for this
// group", which is a display question and correctly blind to origin. The cron
// needs a different question: "has the standing rhythm already been scheduled",
// and a sparked event is not an answer to it. Conflating the two makes a spark
// silently delay the group's recurring event (build-notes §11, spark part two).

import { prisma } from "@/lib/prisma"
import type { UpcomingEvent } from "./upcoming"

export type { UpcomingEvent }

/**
 * Whether Orbit's schedule has already put a future occurrence on the board.
 *
 * Keyed on the ABSENCE of a gaugeId, not the presence of a scheduledKey. Both
 * would answer "is this a sparked event" for rows written from this slice on,
 * but only the negative form is also right about rows written before it: every
 * event that existed before spark part two came from reconcile.ts, and none of
 * them carry a scheduledKey. Asking for a scheduledKey would have made every
 * pre-existing occurrence invisible to this guard on the very first run after
 * the migration, and the constraint that used to catch the resulting duplicate
 * was dropped in that same migration. That is a duplicate event and a duplicate
 * announcement in every group with a standing rhythm, which is why this is the
 * negative test and why it needs no backfill.
 *
 * scheduledKey remains the cron's idempotency key on write; it is just not the
 * right question to ask on read.
 */
export async function hasUpcomingScheduledEvent(
  groupId: string,
  now: Date
): Promise<boolean> {
  const existing = await prisma.event.findFirst({
    where: { groupId, startsAt: { gte: now }, gaugeId: null },
    select: { id: true },
  })
  return existing !== null
}

/**
 * The group's upcoming events, soonest first: the home screen's card list.
 * Deliberately origin-blind, because the group does not care which path
 * created a plan it is attending.
 */
export async function findUpcomingEvents(
  groupId: string,
  now: Date,
  limit: number
): Promise<UpcomingEvent[]> {
  return prisma.event.findMany({
    where: { groupId, startsAt: { gte: now } },
    // createdAt breaks the tie this slice deliberately made possible: with a 7pm
    // default and any evening rhythm two events can share an instant, and
    // without a second key which card sits first is unspecified and can move
    // between renders with nobody having done anything.
    orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }],
    take: limit,
    include: { venues: true },
  })
}
