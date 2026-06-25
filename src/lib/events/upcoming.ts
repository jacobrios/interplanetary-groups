// src/lib/events/upcoming.ts
//
// Query helper for finding the soonest upcoming event for a group.
// Backed by the @@index([groupId, startsAt]) index added in the
// add_message_and_event_start_index migration.

import { prisma } from "@/lib/prisma"
import type { Event, Venue } from "@prisma/client"

export type UpcomingEvent = Event & {
  venues: Venue[]
}

/**
 * Returns the group's soonest upcoming event (startsAt >= now) with its
 * venue(s) included, or null if the group has no upcoming events.
 *
 * "Upcoming" means startsAt is in the future relative to the moment of
 * the call — past events are excluded.
 */
export async function findSoonestUpcomingEvent(
  groupId: string
): Promise<UpcomingEvent | null> {
  return prisma.event.findFirst({
    where: {
      groupId,
      startsAt: { gte: new Date() },
    },
    orderBy: { startsAt: "asc" },
    include: { venues: true },
  })
}
