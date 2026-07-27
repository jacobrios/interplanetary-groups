// src/app/actions/detect-spark.ts
"use server"

import { revalidatePath } from "next/cache"
import { MessageAuthor } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth/current-user"
import { findSoonestUpcomingEvent } from "@/lib/events/upcoming"
import { formatEventDate } from "@/lib/events/format"
import { createGauge } from "@/lib/gauges/create"
import { findLiveGauges } from "@/lib/gauges/read"
import { detectSparkClaim, normalizeSpark } from "@/lib/orbit/spark"
import {
  buildGaugeMessage,
  chooseProposedDate,
  resolveSparkTime,
  sparkStartInstant,
} from "@/lib/orbit/spark-copy"

export type DetectSparkResult = { status: "gauged" } | { status: "quiet" }

/**
 * Server action: read one member message and, if it floated an idea, post
 * Orbit's gauge.
 *
 * Called by the group home AFTER the send has settled, in its own transition.
 * The chat input is never waiting on this, which is the whole reason it is a
 * separate action rather than work bolted onto sendMessageAction.
 *
 * Every failure path is soft. A detection that errors, times out, or reads
 * uncertainly leaves the member's message exactly as it was, with nothing in
 * the feed. Orbit staying quiet costs nothing visible; Orbit interjecting
 * wrongly teaches people to tune it out.
 *
 */
export async function detectSparkAction(messageId: string): Promise<DetectSparkResult> {
  let gaugedGroupId: string | null = null

  try {
    const user = await getCurrentUser()
    if (!user) return { status: "quiet" }

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: { group: true },
    })

    // Orbit reads what members say, never its own messages. Detection is also
    // only ever triggered by the person who sent the message: it is fired from
    // their own send, and the narrower rule keeps a stray session from
    // spending model calls on somebody else's feed.
    if (!message) return { status: "quiet" }
    if (message.authorType !== MessageAuthor.MEMBER) return { status: "quiet" }
    if (message.authorId !== user.id) return { status: "quiet" }

    const group = message.group
    const now = new Date()

    const upcoming = await findSoonestUpcomingEvent(group.id, now)
    const upcomingEvent = upcoming
      ? `${upcoming.title}, ${formatEventDate(upcoming.startsAt, upcoming.endsAt, group.timeZone)}`
      : null

    const claim = await detectSparkClaim(message.body, { upcomingEvent })
    const spark = normalizeSpark(claim)
    if (!spark.spark) return { status: "quiet" }

    // Never open a second gauge for something the group is already being asked
    // about, or already has on the calendar. This costs a model call to
    // discover, which is the price of knowing what the activity is before we can
    // compare it.
    //
    // Two checks, because part two split them apart. findLiveGauges stops
    // returning a gauge once it has produced its event, which is right for the
    // chips but would leave a hole here: without the second check, "beers
    // Friday?" asked again the day after a beers event was created would open a
    // fresh gauge and eventually a duplicate event, which is now legal at the
    // database level. Asking about a plan the group already made is the clutter
    // this product exists to avoid.
    const activityKey = spark.activity.toLowerCase()
    const live = await findLiveGauges(group.id, now)
    if (live.some((g) => g.activity.toLowerCase() === activityKey)) {
      return { status: "quiet" }
    }
    const alreadyOnCalendar = await prisma.event.findFirst({
      where: {
        groupId: group.id,
        startsAt: { gte: now },
        activityLabel: { equals: spark.activity, mode: "insensitive" },
      },
      select: { id: true },
    })
    if (alreadyOnCalendar) return { status: "quiet" }

    const proposedDate = chooseProposedDate(
      spark.statedDayOfWeek,
      spark.partOfDay,
      group.timeZone,
      now
    )

    // One resolution, one place. The disclosure rides along with it: Orbit
    // says what it assumed only when it actually had to assume something.
    const { timeLocal, disclosure } = resolveSparkTime({
      statedTime: spark.statedTime,
      timeAmbiguous: spark.timeAmbiguous,
      partOfDay: spark.partOfDay,
    })

    // A stated day is taken at face value including today, so a message sent
    // after the resolved hour ("climb Saturday at 9?" posted Saturday at 11)
    // would open a gauge whose start has already gone. Part one could afford
    // that because its message promised nothing; part two's promises to set it
    // up, and promotion would refuse forever with nothing said. Better to stay
    // quiet than to make a promise that is already impossible.
    if (sparkStartInstant(proposedDate, timeLocal, group.timeZone) <= now) {
      return { status: "quiet" }
    }

    const result = await createGauge({
      groupId: group.id,
      sourceMessageId: message.id,
      activity: spark.activity,
      proposedDate,
      proposedTime: timeLocal,
      body: buildGaugeMessage(
        spark.activity,
        proposedDate,
        group.timeZone,
        now,
        disclosure
      ),
      // Counted only when they named the day: their message already is that
      // yes. When Orbit picked the day, they vote like anyone else.
      initiatorUserId: spark.statedDayOfWeek !== null ? user.id : null,
    })

    if (result.status !== "created") return { status: "quiet" }

    gaugedGroupId = group.id
  } catch (err) {
    // Soft by design: the member's message stands, and nothing is said.
    // Logged because a mute Orbit is otherwise indistinguishable from a quiet
    // one, and the failure modes here (a missing API key, a rejected schema)
    // would leave it silently mute for every message with no signal anywhere.
    console.error("[detect-spark] detection failed", err)
    return { status: "quiet" }
  }

  // CRITICAL: revalidatePath must be called outside and after try/catch.
  // In Next.js it uses a similar internal throw mechanism to redirect() and
  // would be swallowed if placed inside the catch block.
  //
  // Only fires when a gauge was actually created. Ordinary chatter is the
  // common case, and re-rendering the group on every message would make Orbit
  // expensive to have around.
  revalidatePath(`/groups/${gaugedGroupId}`)
  return { status: "gauged" }
}
