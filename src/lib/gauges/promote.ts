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
import { parseStoredRhythms } from "@/lib/orbit/rhythm"
import { buildSparkAnnouncement, sparkStartInstant } from "@/lib/orbit/spark-copy"
import { countIn, hasReachedThreshold } from "./threshold"

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
  const startsAt = sparkStartInstant(gauge.proposedDate, gauge.proposedTime, zone)

  // A gauge stays live until the end of its day, so the third yes can arrive
  // after the proposed start. A card and an announcement for something that
  // already began is noise about the past; the gauge just expires.
  if (startsAt.getTime() <= now.getTime()) {
    return { status: "skipped", reason: "start_passed" }
  }

  const venueName = inheritedVenue(gauge.group.recurringActivities, gauge.activity)

  try {
    const eventId = await prisma.$transaction(async (tx) => {
      // Re-read the votes inside the transaction rather than seeding from the
      // snapshot above. Two people can tap the third yes in the same second:
      // the unique gaugeId stops the second EVENT, but the loser's vote row can
      // land after the winner's read, and seeding the stale snapshot would leave
      // that person with a yes on the gauge and no RSVP on the event, asked
      // again for an answer they already gave. Re-reading also refuses to
      // create an event for a gauge that dropped back below the bar between the
      // read and the write.
      const votes = await tx.gaugeVote.findMany({
        where: { gaugeId: gauge.id },
        select: { userId: true, answer: true },
      })
      if (!hasReachedThreshold(votes)) throw new BelowThresholdInTx()

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
        data: votes.map((v) => ({
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
          body: buildSparkAnnouncement(gauge.activity, startsAt, zone, countIn(votes), now),
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
    // The in-transaction re-check found the gauge back below the bar. Rolling
    // back by throwing is how the event, the RSVPs and the announcement all
    // un-happen together.
    if (err instanceof BelowThresholdInTx) {
      return { status: "skipped", reason: "below_threshold" }
    }
    throw err
  }
}

/** Signals a rollback of the creation transaction; never escapes this module. */
class BelowThresholdInTx extends Error {}

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
