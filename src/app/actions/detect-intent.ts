// src/app/actions/detect-intent.ts
"use server"

import { revalidatePath } from "next/cache"
import { MessageAuthor, ProposalKind } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth/current-user"
import { findUpcomingEvents } from "@/lib/events/upcoming-list"
import { formatEventDate, formatTime } from "@/lib/events/format"
import { createGauge } from "@/lib/gauges/create"
import { findLiveGauges } from "@/lib/gauges/read"
import { createMessage } from "@/lib/messages/create"
import { moveEventTime } from "@/lib/events/move"
import { createChangeProposal, createGroupProposal } from "@/lib/proposals/create"
import { findLiveProposals } from "@/lib/proposals/read"
import { detectIntentClaim, normalizeIntent } from "@/lib/orbit/spark"
import { planChange, type ChangeTarget } from "@/lib/orbit/change-plan"
import { buildConversationWindow, WINDOW_MESSAGES, type WindowMessage } from "@/lib/orbit/window"
import {
  buildGaugeMessage,
  buildUrgencyClause,
  chooseProposedDate,
  CLOSE_BEFORE_START_HOURS,
  resolveSparkTime,
  sparkStartInstant,
} from "@/lib/orbit/spark-copy"

export type DetectIntentResult = {
  status: "gauged" | "changed" | "asked" | "replied" | "quiet"
}

/**
 * Server action: read one member message and act on what it is. A fresh idea
 * opens a gauge (unchanged from the spark slice); a clear time-change request
 * moves the plan; a probable one gets Orbit's question with one-tap chips; a
 * clearly understood request this slice cannot act on gets an honest reply;
 * everything else stays silent.
 *
 * Called by the group home AFTER the send has settled, in its own transition.
 * The chat input is never waiting on this.
 *
 * Every failure path is soft, exactly as the spark slice established: Orbit
 * staying quiet costs nothing visible; Orbit interjecting wrongly teaches
 * people to tune it out.
 */
export async function detectIntentAction(messageId: string): Promise<DetectIntentResult> {
  let outcome: DetectIntentResult["status"] = "quiet"
  let touchedGroupId: string | null = null
  let touchedEventId: string | null = null

  try {
    const user = await getCurrentUser()
    if (!user) return { status: "quiet" }

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: { author: true, group: { include: { memberships: true } } },
    })

    // Orbit reads what members say, never its own messages. Detection is also
    // only ever triggered by the person who sent the message.
    if (!message) return { status: "quiet" }
    if (message.authorType !== MessageAuthor.MEMBER) return { status: "quiet" }
    if (message.authorId !== user.id) return { status: "quiet" }

    const group = message.group
    const now = new Date()

    // The model sees every plan the group sees (the carousel's three), each
    // numbered so a change request can say which one it means. One fetch, and
    // the same array resolves the model's answer, so the numbering can never
    // drift between what was shown and what is acted on.
    const events = await findUpcomingEvents(group.id, now, 3)
    const upcomingLines = events.map(
      (e, i) =>
        `${i + 1}. ${e.title}, ${formatEventDate(e.startsAt, e.endsAt, group.timeZone)}`
    )

    // The conversational window: the 19 messages before the trigger plus the
    // trigger itself, oldest first. Fetched separately from the trigger so the
    // trigger is always the marked last entry even under created-at ties.
    const prior = await prisma.message.findMany({
      where: { groupId: group.id, id: { not: message.id }, createdAt: { lte: message.createdAt } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: WINDOW_MESSAGES - 1,
      include: { author: true },
    })
    const toWindowMessage = (m: (typeof prior)[number]): WindowMessage => ({
      authorName: m.author?.name ?? null,
      isOrbit: m.authorType === MessageAuthor.ORBIT,
      body: m.body,
      createdAt: m.createdAt,
    })
    const conversationBlock = buildConversationWindow(
      [...prior.reverse().map(toWindowMessage), toWindowMessage(message)],
      group.timeZone,
      now
    )

    const liveProposals = await findLiveProposals(group.id, now)
    const openProposalLines = liveProposals
      .filter((p) => p.kind === ProposalKind.GROUP)
      .map((p) => {
        const label = p.event.activityLabel ?? p.event.title.toLowerCase()
        return `A question is already out to the group: move ${label} to ${formatTime(p.proposedStartsAt, group.timeZone)} (asked by ${p.asker.name}).`
      })

    const claim = await detectIntentClaim(message.body, {
      upcomingLines,
      conversationBlock,
      openProposalLines,
    })
    const intent = normalizeIntent(claim, events.length)

    if (intent.kind === "none") return { status: "quiet" }

    if (intent.kind === "spark") {
      const spark = intent.spark

      // Never open a second gauge for something the group is already being
      // asked about, or already has on the calendar (spark slice, unchanged).
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
      const { timeLocal, disclosure } = resolveSparkTime({
        statedTime: spark.statedTime,
        timeAmbiguous: spark.timeAmbiguous,
        partOfDay: spark.partOfDay,
      })
      const start = sparkStartInstant(proposedDate, timeLocal, group.timeZone)
      if (start <= now) {
        return { status: "quiet" }
      }

      // A gauge born inside its own close window (a same-evening rally) gets
      // one extra urgency sentence, since it would otherwise close the moment
      // it opens.
      const bornLate = now.getTime() >= start.getTime() - CLOSE_BEFORE_START_HOURS * 60 * 60 * 1000

      const result = await createGauge({
        groupId: group.id,
        sourceMessageId: message.id,
        activity: spark.activity,
        proposedDate,
        proposedTime: timeLocal,
        body:
          buildGaugeMessage(spark.activity, proposedDate, group.timeZone, now, disclosure) +
          (bornLate ? buildUrgencyClause(timeLocal) : ""),
        initiatorUserId: spark.statedDayOfWeek !== null ? user.id : null,
      })
      if (result.status !== "created") return { status: "quiet" }

      outcome = "gauged"
      touchedGroupId = group.id
    } else {
      // A change request. The pure planner decides; this action only carries
      // the answer out.
      const candidates: ChangeTarget[] = events.map((e) => ({
        id: e.id,
        label: e.activityLabel ?? e.title.toLowerCase(),
        startsAt: e.startsAt,
      }))
      const target =
        intent.change.targetEventIndex !== null
          ? candidates[intent.change.targetEventIndex]
          : null

      const plan = planChange(
        intent.change,
        target,
        candidates,
        user.name,
        group.memberships.length,
        group.timeZone,
        now
      )

      if (plan.action === "quiet") return { status: "quiet" }

      // A lone candidate is its own answer even when the model declined to
      // number it (planChange's rung 2 note); the orchestrator resolves the
      // same way so the row it writes points at the plan the plan actually
      // targeted. planChange only ever returns move/ask/propose when this is
      // non-null, so the assertions below on resolvedTarget are safe.
      const resolvedTarget = target ?? (candidates.length === 1 ? candidates[0] : null)

      if (plan.action === "reply") {
        await createMessage({
          groupId: group.id,
          authorType: MessageAuthor.ORBIT,
          authorId: null,
          body: plan.body,
        })
        outcome = "replied"
        touchedGroupId = group.id
      } else if (plan.action === "move") {
        const moved = await moveEventTime({
          eventId: resolvedTarget!.id,
          expectedStartsAt: resolvedTarget!.startsAt,
          newStartsAt: plan.newStartsAt,
          requesterUserId: user.id,
          announcementBody: plan.announcement,
        })
        if (moved.status !== "moved") return { status: "quiet" }
        outcome = "changed"
        touchedGroupId = group.id
        touchedEventId = resolvedTarget!.id
      } else if (plan.action === "propose") {
        const created = await createGroupProposal({
          groupId: group.id,
          eventId: resolvedTarget!.id,
          askerUserId: user.id,
          sourceMessageId: message.id,
          proposedStartsAt: plan.proposedStartsAt,
          priorStartsAt: resolvedTarget!.startsAt,
          body: plan.question,
        })
        if (created.status !== "created") return { status: "quiet" }
        outcome = "asked"
        touchedGroupId = group.id
      } else {
        const created = await createChangeProposal({
          groupId: group.id,
          eventId: resolvedTarget!.id,
          askerUserId: user.id,
          sourceMessageId: message.id,
          proposedStartsAt: plan.proposedStartsAt,
          priorStartsAt: resolvedTarget!.startsAt,
          body: plan.question,
        })
        if (created.status !== "created") return { status: "quiet" }
        outcome = "asked"
        touchedGroupId = group.id
      }
    }
  } catch (err) {
    // Soft by design: the member's message stands, and nothing is said.
    console.error("[detect-intent] detection failed", err)
    return { status: "quiet" }
  }

  // CRITICAL: revalidatePath must be called outside and after try/catch.
  // Only fires when something visible actually happened.
  revalidatePath(`/groups/${touchedGroupId}`)
  if (touchedEventId) revalidatePath(`/events/${touchedEventId}`)
  return { status: outcome }
}
