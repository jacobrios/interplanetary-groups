// src/lib/gauges/promote.ts
//
// Three yeses become a real event.
//
// Everything lands in one transaction: the event, the venue inherited from the
// group's own rhythm, the RSVPs seeded from the votes, and Orbit's
// announcement. A half-created spark is Orbit announcing an event that does
// not exist, or an event nobody was told about; createGauge set this precedent
// for its own message-plus-gauge pair.
//
// Idempotency is the unique Event.gaugeId, the same shape as createGauge's
// unique sourceMessageId: a double-fired third yes hits the constraint and
// comes back as a skip.

import { prisma } from "@/lib/prisma"
import { MessageAuthor, RsvpStatus } from "@prisma/client"

import { createEventInTx } from "@/lib/events/create"
import { getLocalParts, zonedWallTimeToUtc } from "@/lib/orbit/occurrence"
import { parseStoredRhythms } from "@/lib/orbit/rhythm"
import { buildSparkAnnouncement, EVENING_TIME } from "@/lib/orbit/spark-copy"
import { hasReachedThreshold } from "./threshold"

export type PromoteResult =
  | { status: "created"; eventId: string }
  | {
      status: "skipped"
      reason: "below_threshold" | "already_created" | "start_passed" | "no_gauge"
    }

/**
 * Create the event this gauge has earned, or explain why not.
 *
 * Safe to call after every vote: below the bar it is two queries and a no-op,
 * and above it the unique constraint makes a second call harmless.
 */
export async function promoteGaugeToEvent(
  gaugeId: string,
  now: Date
): Promise<PromoteResult> {
  const gauge = await prisma.gauge.findUnique({
    where: { id: gaugeId },
    include: {
      group: { select: { id: true, timeZone: true, recurringActivities: true } },
      votes: { select: { userId: true, answer: true } },
      event: { select: { id: true } },
    },
  })

  if (!gauge) return { status: "skipped", reason: "no_gauge" }
  if (gauge.event) return { status: "skipped", reason: "already_created" }
  if (!hasReachedThreshold(gauge.votes)) {
    return { status: "skipped", reason: "below_threshold" }
  }

  const zone = gauge.group.timeZone
  const startsAt = startInstant(gauge.proposedDate, gauge.proposedTime, zone)

  // A gauge stays live until the end of its day, so the third yes can arrive
  // after the proposed start. A card and an announcement for something that
  // already began is noise about the past; the gauge just expires.
  if (startsAt.getTime() <= now.getTime()) {
    return { status: "skipped", reason: "start_passed" }
  }

  const venueName = inheritedVenue(gauge.group.recurringActivities, gauge.activity)

  try {
    const eventId = await prisma.$transaction(async (tx) => {
      const event = await createEventInTx(tx, {
        groupId: gauge.group.id,
        title: titleFor(gauge.activity),
        startsAt,
        // No end: nothing in the product knows how long beers lasts, and the
        // field is optional for exactly this reason.
        endsAt: null,
        activityLabel: gauge.activity,
        gaugeId: gauge.id,
        venue: venueName ? { name: venueName } : null,
      })

      // Never ask twice: a gauge answer is an answer about attending this day,
      // so it carries through without a second tap. Both flavors of no seed
      // OUT, because "next time" and "can't that day" both mean not coming to
      // the event this creates.
      await tx.rsvp.createMany({
        data: gauge.votes.map((v) => ({
          eventId: event.id,
          userId: v.userId,
          status: v.answer === "IN" ? RsvpStatus.IN : RsvpStatus.OUT,
        })),
        skipDuplicates: true,
      })

      await tx.message.create({
        data: {
          groupId: gauge.group.id,
          authorType: MessageAuthor.ORBIT,
          authorId: null,
          body: buildSparkAnnouncement(gauge.activity, startsAt, zone),
        },
      })

      return event.id
    })

    return { status: "created", eventId }
  } catch (err) {
    // The unique Event.gaugeId: a concurrent third yes got there first.
    if ((err as { code?: string }).code === "P2002") {
      return { status: "skipped", reason: "already_created" }
    }
    throw err
  }
}

/** The proposed day's local midnight plus the stored time, as one instant. */
function startInstant(proposedDate: Date, proposedTime: string | null, zone: string): Date {
  const day = getLocalParts(proposedDate, zone)
  // Null only for gauges written before part two shipped; they fall to the
  // evening default rather than blocking a group that is ready to go.
  const [hour, minute] = (proposedTime ?? EVENING_TIME).split(":").map(Number)
  return zonedWallTimeToUtc(day.year, day.month, day.day, hour, minute, zone)
}

/** "beers" becomes "Beers": the card wants a title, not a fragment. */
function titleFor(activity: string): string {
  return activity.charAt(0).toUpperCase() + activity.slice(1)
}

/**
 * The group's standing spot for this activity, when it told us one.
 *
 * Matched on the activity word, case-insensitively. A miss ("grab drinks"
 * against a "beers" rhythm) yields no venue, which is correct: venue never
 * gates anything, and a wrong guess about where a group drinks is worse than
 * no guess.
 */
function inheritedVenue(recurringActivities: unknown, activity: string): string | null {
  const rhythms = parseStoredRhythms(recurringActivities)
  if (!rhythms) return null
  const match = rhythms.find(
    (r) => r.activity.toLowerCase() === activity.toLowerCase() && r.venueName
  )
  return match?.venueName ?? null
}
