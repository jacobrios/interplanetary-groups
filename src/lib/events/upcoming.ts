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
 * "Upcoming" means startsAt is at or after `now`; past events are excluded.
 *
 * `now` is a required argument, not a default, for the same reason `timeZone`
 * is required in events/format.ts: a caller that can silently fall back to a
 * hidden default is a caller that can silently be wrong. This function used to
 * read `new Date()` itself, which made it the only date-sensitive function in
 * the codebase whose tests could not control the clock. One of those tests
 * hardcoded a date a month out, passed for a month because of the calendar, and
 * turned red on its own (build-notes §11, spark part two follow-up). Every
 * sibling here takes the instant it should compare against; now this one does
 * too, so that class of test cannot come back.
 */
export async function findSoonestUpcomingEvent(
  groupId: string,
  now: Date
): Promise<UpcomingEvent | null> {
  return prisma.event.findFirst({
    where: {
      groupId,
      startsAt: { gte: now },
    },
    orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }],
    include: { venues: true },
  })
}
