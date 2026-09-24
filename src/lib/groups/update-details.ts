// src/lib/groups/update-details.ts
//
// The founder-gated save for a group-details edit: the group's name and each
// activity's name, days, time and spot. When the first activity changed and
// a plan made from it is coming up, the form already asked "Update that one
// too, or leave it?" and this function carries the answer out:
//
//   - a spot or activity-name change is applied to the plan directly, since
//     neither is a time change and RSVPs survive both;
//   - a day or time change moves the plan directly only when the founder is
//     alone in the group (nobody else's yes is at stake), and otherwise opens
//     the same group vote any member's time change opens.
//
// The group hears about it in at most ONE Orbit message: the announcement,
// or, when a vote opens, the vote's own question (which carries the chips).
//
// The founder check is re-done here rather than trusted from the action,
// the reset-invite.ts precedent.

import { prisma } from "@/lib/prisma"
import { EventStatus, MessageAuthor, type Event, type Prisma } from "@prisma/client"
import { parseRhythm, parseStoredRhythms, type GroupRhythm } from "@/lib/orbit/rhythm"
import { computeNextOccurrence } from "@/lib/orbit/occurrence"
import { startOfLocalDay } from "@/lib/orbit/spark-copy"
import { buildDetailsAnnouncement, type PlanOutcome } from "@/lib/orbit/details-copy"
import { applyDetailChangeInTx } from "@/lib/events/edit-details"
import { moveEventCoreInTx } from "@/lib/events/move"
import { createGroupProposal } from "@/lib/proposals/create"
import { createMessage } from "@/lib/messages/create"
import {
  DETAILS_GENERIC,
  diffDetails,
  firstRhythmChanged,
  validateDetailsEdit,
} from "./details-edit"
import type { RhythmEdit } from "./rhythm-edit"

export type Db = Prisma.TransactionClient | typeof prisma

export const DETAILS_STALE = "Someone just changed the next plan. Take another look."

/**
 * The next plan the hourly job made from the rhythm: not floated, not called
 * off, not started. Floated plans (gaugeId set) are never "this week's plan".
 */
export async function findNextRhythmPlan(
  db: Db,
  groupId: string,
  now: Date
): Promise<Event | null> {
  return db.event.findFirst({
    where: { groupId, gaugeId: null, status: EventStatus.SCHEDULED, startsAt: { gt: now } },
    orderBy: { startsAt: "asc" },
  })
}

/**
 * Where the next plan goes when the rhythm's days or time change: searched
 * from the start of the plan's OWN local day, so a time change stays on the
 * plan's day and a day change lands in the days following it. Searching from
 * `now` instead would pull a plan that is not the rhythm's very next
 * occurrence (say, a week out) a week earlier. Minus 1ms so an occurrence
 * exactly at local midnight still counts. When that lands at or before `now`
 * (the plan is today and the new time has already passed), the next
 * occurrence after now instead. Shared by the direct move and the vote.
 */
export function proposedStartForPlan(
  rhythm: GroupRhythm,
  timeZone: string,
  planStartsAt: Date,
  now: Date
): Date {
  const dayStart = new Date(startOfLocalDay(planStartsAt, timeZone).getTime() - 1)
  const onPlanDay = computeNextOccurrence(rhythm, timeZone, dayStart)
  if (onPlanDay.getTime() > now.getTime()) return onPlanDay
  return computeNextOccurrence(rhythm, timeZone, now)
}

export interface UpdateGroupDetailsInput {
  supabaseAuthId: string
  groupId: string
  name: string
  rhythms: RhythmEdit[]
  planChoice: "update" | "leave" | null
  /** What the form's question was about, startsAt as ISO. */
  openedPlan: { eventId: string; startsAt: string } | null
  now: Date
}

export type UpdateGroupDetailsResult = { status: "ok" } | { status: "error"; message: string }

/**
 * Thrown, never returned, when the plan turns out stale after writes inside
 * the transaction have begun: only a throw rolls those writes back.
 */
class StalePlanInTx extends Error {}

type TxResult =
  | { kind: "done"; result: UpdateGroupDetailsResult }
  | {
      kind: "vote"
      groupId: string
      eventId: string
      askerUserId: string
      proposedStartsAt: Date
      priorStartsAt: Date
      body: string
      /**
       * Said instead when the vote cannot open, so the group still hears
       * about the change. Stale (the plan moved in the gap): the plan
       * sentence says what happened to the plan. Already asked (the same
       * vote is open): no plan sentence at all, since "stays as it was"
       * would be false while that vote is live.
       */
      staleBody: string | null
      alreadyAskedBody: string | null
    }

export async function updateGroupDetails(
  input: UpdateGroupDetailsInput
): Promise<UpdateGroupDetailsResult> {
  const { supabaseAuthId, groupId, planChoice, openedPlan, now } = input

  let txResult: TxResult
  try {
    txResult = await prisma.$transaction(async (tx): Promise<TxResult> => {
      const caller = await tx.user.findUnique({ where: { supabaseAuthId } })
      if (!caller) throw new Error("NO_USER")

      const group = await tx.group.findUnique({ where: { id: groupId } })
      if (!group) throw new Error("GROUP_NOT_FOUND")
      if (group.founderId !== caller.id) throw new Error("NOT_FOUNDER")

      const stored = parseStoredRhythms(group.recurringActivities)
      if (stored === null) {
        return { kind: "done", result: { status: "error", message: DETAILS_GENERIC } }
      }
      const v = validateDetailsEdit(stored, { name: input.name, rhythms: input.rhythms })
      if (!v.ok) return { kind: "done", result: { status: "error", message: v.error } }

      const diff = diffDetails(stored, v.rhythms, group.name, v.name)
      if (!diff.nameChanged && diff.rhythms.length === 0) {
        return { kind: "done", result: { status: "ok" } }
      }

      const first = firstRhythmChanged(diff)
      const plan = first ? await findNextRhythmPlan(tx, groupId, now) : null

      // The founder's answer only counts for the exact plan the question
      // named. Checked before any write, so a stale form writes nothing.
      if (
        plan &&
        (planChoice === null ||
          openedPlan?.eventId !== plan.id ||
          openedPlan.startsAt !== plan.startsAt.toISOString())
      ) {
        return { kind: "done", result: { status: "error", message: DETAILS_STALE } }
      }

      const memberCount = await tx.membership.count({ where: { groupId } })

      // The validated shape, never the raw payload.
      await tx.group.update({
        where: { id: groupId },
        data: {
          name: v.name,
          recurringActivities: v.rhythms as unknown as Prisma.InputJsonValue,
        },
      })

      let detailsUpdated = false
      let proposed: Date | null = null

      if (plan && first && planChoice === "update") {
        const primary = v.rhythms[0]

        if (first.activity || first.spot) {
          // Only the fields the founder changed travel to the plan: a spot
          // change must not also undo a member's rename of this one plan,
          // and a rename must not undo a member's fix to its place. An
          // omitted field is left as stored and not validated, so an
          // over-long stored title never blocks a spot-only save.
          const applied = await applyDetailChangeInTx(tx, {
            eventId: plan.id,
            ...(first.activity ? { title: primary.title } : {}),
            ...(first.spot ? { place: primary.venueName ?? "" } : {}),
            now,
          })
          if (applied.status === "applied") {
            detailsUpdated = true
          } else if (applied.reason === "invalid_title" || applied.reason === "invalid_place") {
            // Not somebody changing the plan under us: a value this save
            // produced failed the plan's own caps. Thrown plain so the
            // action logs it and shows the generic message, never the
            // stale one. Unreachable today: only supplied fields are
            // validated, and both are already capped by validateDetailsEdit
            // at the same limits.
            throw new Error(`DETAILS_PLAN_WRITE_${applied.reason.toUpperCase()}`)
          } else if (applied.reason !== "noop") {
            // no_event / cancelled / already_started / stale: the plan
            // changed after it was read in this same transaction.
            throw new StalePlanInTx()
          }
        }

        if (first.schedule) {
          // validateDetailsEdit guarantees the primary rhythm is schedulable.
          const next = proposedStartForPlan(
            parseRhythm(v.rhythms)!,
            group.timeZone,
            plan.startsAt,
            now
          )
          if (next.getTime() !== plan.startsAt.getTime()) {
            if (memberCount === 1) {
              // Founder alone: nobody else's yes is at stake, so the plan
              // moves outright, the founder marked in like any other asker,
              // and nothing is posted (there is nobody to tell).
              const moved = await moveEventCoreInTx(tx, {
                eventId: plan.id,
                expectedStartsAt: plan.startsAt,
                newStartsAt: next,
                seedInUserIds: [caller.id],
                announcementBody: null,
              })
              if (moved.status !== "moved") throw new StalePlanInTx()
            } else {
              proposed = next
            }
          }
        }
      }

      const outcome: PlanOutcome = !plan
        ? { kind: "none" }
        : planChoice === "leave"
          ? { kind: "left", startsAt: plan.startsAt }
          : proposed
            ? {
                kind: "vote",
                startsAt: plan.startsAt,
                proposedStartsAt: proposed,
                detailsUpdated,
              }
            : detailsUpdated
              ? { kind: "updated", startsAt: plan.startsAt }
              : // A schedule-only edit whose new occurrence lands on the
                // plan's own startsAt (or a spot/activity write that came
                // back "noop") never touched the plan, so saying "is
                // updated too" would be untrue.
                { kind: "none" }

      const compose = (planOutcome: PlanOutcome) =>
        buildDetailsAnnouncement({
          founderName: caller.name,
          before: stored,
          after: v.rhythms,
          diff,
          memberCount,
          plan: planOutcome,
          timeZone: group.timeZone,
          now,
        })

      const body = compose(outcome)

      if (outcome.kind === "vote" && plan && body !== null) {
        return {
          kind: "vote",
          groupId,
          eventId: plan.id,
          askerUserId: caller.id,
          proposedStartsAt: outcome.proposedStartsAt,
          priorStartsAt: plan.startsAt,
          body,
          staleBody: compose(
            detailsUpdated
              ? { kind: "updated", startsAt: plan.startsAt }
              : { kind: "left", startsAt: plan.startsAt }
          ),
          alreadyAskedBody: compose({ kind: "none" }),
        }
      }

      if (body !== null) {
        await tx.message.create({
          data: { groupId, authorType: MessageAuthor.ORBIT, authorId: null, body },
        })
      }
      return { kind: "done", result: { status: "ok" } }
    })
  } catch (err) {
    if (err instanceof StalePlanInTx) return { status: "error", message: DETAILS_STALE }
    throw err
  }

  if (txResult.kind === "done") return txResult.result

  // Outside the transaction on purpose: createGroupProposal owns its own
  // transaction and takes the event's row lock itself, and it writes the
  // ONE Orbit message (the vote question, carrying the chips). The group
  // details above are already saved whatever happens here.
  const created = await createGroupProposal({
    groupId: txResult.groupId,
    eventId: txResult.eventId,
    askerUserId: txResult.askerUserId,
    sourceMessageId: null,
    proposedStartsAt: txResult.proposedStartsAt,
    priorStartsAt: txResult.priorStartsAt,
    body: txResult.body,
  })
  if (created.status === "skipped") {
    // The vote could not open, so the group still hears about the change.
    const fallback =
      created.reason === "already_asked" ? txResult.alreadyAskedBody : txResult.staleBody
    if (fallback !== null) {
      await createMessage({
        groupId: txResult.groupId,
        authorType: MessageAuthor.ORBIT,
        authorId: null,
        body: fallback,
      })
    }
  }
  return { status: "ok" }
}
