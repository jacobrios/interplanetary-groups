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
import { parseRhythm, parseStoredRhythms } from "@/lib/orbit/rhythm"
import { computeNextOccurrence } from "@/lib/orbit/occurrence"
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
      /** Said instead when the vote cannot open: the group still hears about the change. */
      fallbackBody: string | null
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
          // and a rename must not undo a member's fix to its place.
          let place: string
          if (first.spot) {
            place = primary.venueName ?? ""
          } else {
            const venue = await tx.venue.findFirst({
              where: { eventId: plan.id },
              orderBy: { id: "asc" },
            })
            place = venue ? (venue.displayLabel ?? venue.name) : ""
          }
          const applied = await applyDetailChangeInTx(tx, {
            eventId: plan.id,
            title: first.activity ? primary.title : plan.title,
            place,
            now,
          })
          if (applied.status === "applied") detailsUpdated = true
          else if (applied.reason !== "noop") throw new StalePlanInTx()
        }

        if (first.schedule) {
          // validateDetailsEdit guarantees the primary rhythm is schedulable.
          const next = computeNextOccurrence(parseRhythm(v.rhythms)!, group.timeZone, now)
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
            : { kind: "updated", startsAt: plan.startsAt }

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
          fallbackBody: compose(
            detailsUpdated
              ? { kind: "updated", startsAt: plan.startsAt }
              : { kind: "left", startsAt: plan.startsAt }
          ),
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
  if (created.status === "skipped" && txResult.fallbackBody !== null) {
    // The vote could not open (the plan moved in the gap, or the same ask is
    // already open), so the group still hears about the schedule change.
    await createMessage({
      groupId: txResult.groupId,
      authorType: MessageAuthor.ORBIT,
      authorId: null,
      body: txResult.fallbackBody,
    })
  }
  return { status: "ok" }
}
