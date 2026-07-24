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
import {
  buildGaugeMessage,
  chooseProposedDate,
  detectSparkClaim,
  normalizeSpark,
} from "@/lib/orbit/spark"

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
 * revalidatePath fires only when a gauge was actually created. Ordinary
 * chatter is the common case, and re-rendering the group on every message
 * would make Orbit expensive to have around.
 */
export async function detectSparkAction(messageId: string): Promise<DetectSparkResult> {
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

    const upcoming = await findSoonestUpcomingEvent(group.id)
    const upcomingEvent = upcoming
      ? `${upcoming.title}, ${formatEventDate(upcoming.startsAt, upcoming.endsAt, group.timeZone)}`
      : null

    const claim = await detectSparkClaim(message.body, { upcomingEvent })
    const spark = normalizeSpark(claim)
    if (!spark.spark) return { status: "quiet" }

    // Never open a second gauge for something the group is already being asked
    // about. This costs a model call to discover, which is the price of
    // knowing what the activity is before we can compare it.
    const live = await findLiveGauges(group.id, now)
    const already = live.some(
      (g) => g.activity.toLowerCase() === spark.activity.toLowerCase()
    )
    if (already) return { status: "quiet" }

    const proposedDate = chooseProposedDate(spark.statedDayOfWeek, group.timeZone, now)

    const result = await createGauge({
      groupId: group.id,
      sourceMessageId: message.id,
      activity: spark.activity,
      proposedDate,
      body: buildGaugeMessage(spark.activity, proposedDate, group.timeZone, now),
      // Counted only when they named the day: their message already is that
      // yes. When Orbit picked the day, they vote like anyone else.
      initiatorUserId: spark.statedDayOfWeek !== null ? user.id : null,
    })

    if (result.status !== "created") return { status: "quiet" }

    revalidatePath(`/groups/${group.id}`)
    return { status: "gauged" }
  } catch {
    // Soft by design: the member's message stands, and nothing is said.
    return { status: "quiet" }
  }
}
