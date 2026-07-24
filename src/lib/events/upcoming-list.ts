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
 * Only rows carrying a scheduledKey count: that key is written exclusively by
 * reconcile.ts, so it is what distinguishes a scheduled event from a sparked
 * one without a separate source column.
 */
export async function hasUpcomingScheduledEvent(
  groupId: string,
  now: Date
): Promise<boolean> {
  const existing = await prisma.event.findFirst({
    where: { groupId, startsAt: { gte: now }, scheduledKey: { not: null } },
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
    orderBy: { startsAt: "asc" },
    take: limit,
    include: { venues: true },
  })
}
