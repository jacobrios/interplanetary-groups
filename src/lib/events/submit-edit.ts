// src/lib/events/submit-edit.ts
//
// One Save button, two write paths, and the order between them is the whole
// point: everything is validated before anything is written, so a refused
// day never leaves a half-saved title or place behind.
//
//   1. Load the event and refuse (writing nothing) for a missing plan, a
//      non-member, a called-off plan, or a plan that already started.
//   2. Work out what the editor actually changed, by comparing each field
//      with the value the form was OPENED with (`original`), never with what
//      is stored now. The event page does not live-refresh and the back
//      gesture serves a cached copy, so a form can be minutes old: comparing
//      against the stored row would read every change somebody else made
//      meanwhile as this editor asking to undo it (an old time opening a
//      "move it back" vote, an old place silently reverting a new one).
//   3. For every field the editor changed, the stored value must still be
//      the one they were looking at; if it moved, refuse the whole save
//      before writing anything. Fields they did not touch are passed to
//      editEventDetails as the stored value, so it sees no change on them.
//   4. Only if the day or time changed, run checkEditedStart. A refused day
//      returns here, before editEventDetails is ever called.
//   5. editEventDetails fixes the title and place directly. There is no
//      contested aspect to a rename or a spot change (unlike a time,
//      nobody's plans depend on the old name), so this is a plain write,
//      not a vote; its own announcement is the only check there is.
//   6. If the day or time changed, the group decides: an open vote already
//      asking about that exact time gets the editor's yes (and moves the
//      plan if that yes clears the bar, exactly as a chip tap would);
//      otherwise a new vote opens (createGroupProposal). A time change
//      touches everyone's attendance, so it is never the editor's call
//      alone. The vote question uses the event's title as it now stands
//      (after step 5), read with a fresh query, since a save that renames
//      and moves in the same tap should ask about the new name.

import { prisma } from "@/lib/prisma"
import { EventStatus, ProposalKind, ProposalVoteAnswer } from "@prisma/client"
import { isGroupMember } from "@/lib/auth/membership"
import { zonedWallTimeToUtc } from "@/lib/orbit/occurrence"
import { TIME_LOCAL_RE } from "@/lib/orbit/rhythm"
import { buildGroupProposalQuestion } from "@/lib/orbit/change-copy"
import { buildEditAnnouncement } from "@/lib/orbit/edit-copy"
import { createGroupProposal } from "@/lib/proposals/create"
import { promoteProposalMove } from "@/lib/proposals/promote"
import { checkEditedStart } from "./edit-limits"
import { editEventDetails } from "./edit-details"
import { formatMonthDay, formatWeekdayShort } from "./format"

const DATE_LOCAL_RE = /^\d{4}-\d{2}-\d{2}$/

export type SubmitEventEditResult =
  | { status: "ok"; edited: boolean; proposed: boolean }
  // `edited` is set only when the title or place WAS saved before a later
  // step failed, so the caller knows the page is out of date regardless.
  | { status: "error"; message: string; edited?: true }

const STALE_MESSAGE = "Someone else just changed this plan, take another look."

/** The four editable values exactly as the form showed them when opened. */
export interface EditFormOriginal {
  title: string
  place: string
  dateLocal: string
  timeLocal: string
}

function normalizePlace(place: string): string | null {
  const trimmed = place.trim()
  return trimmed.length > 0 ? trimmed : null
}

export async function submitEventEdit(input: {
  eventId: string
  actor: { id: string; name: string }
  title: string
  place: string
  /** "YYYY-MM-DD" in the group's timezone. */
  dateLocal: string
  /** "HH:mm", 24h, in the group's timezone. */
  timeLocal: string
  now: Date
  /** What the form was opened with; the baseline for "what changed". */
  original: EditFormOriginal
}): Promise<SubmitEventEditResult> {
  const { eventId, actor, title, place, dateLocal, timeLocal, now, original } = input

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      group: { select: { id: true, timeZone: true, recurringActivities: true } },
      // Same "first venue" editEventDetails reads and the page displays.
      venues: { orderBy: { id: "asc" }, take: 1 },
    },
  })
  if (!event) return { status: "error", message: "That plan is gone." }

  if (!(await isGroupMember(actor.id, event.group.id))) {
    return { status: "error", message: "Only members can change this group's plans." }
  }
  if (event.status === EventStatus.CANCELLED) {
    return { status: "error", message: "Put this plan back on before changing it." }
  }
  if (event.startsAt.getTime() <= now.getTime()) {
    return { status: "error", message: "This one has already started." }
  }

  if (
    !DATE_LOCAL_RE.test(dateLocal) ||
    !TIME_LOCAL_RE.test(timeLocal) ||
    !DATE_LOCAL_RE.test(original.dateLocal) ||
    !TIME_LOCAL_RE.test(original.timeLocal)
  ) {
    return { status: "error", message: "Pick a day and a time." }
  }

  const timeZone = event.group.timeZone
  const toUtc = (d: string, t: string) => {
    const [year, month, day] = d.split("-").map(Number)
    const [hour, minute] = t.split(":").map(Number)
    return zonedWallTimeToUtc(year, month, day, hour, minute, timeZone)
  }
  const proposedStartsAt = toUtc(dateLocal, timeLocal)
  // The start the editor was looking at: the vote's staleness baseline.
  const originalStartsAt = toUtc(original.dateLocal, original.timeLocal)

  const venue = event.venues[0] ?? null
  const storedPlace = venue ? (venue.displayLabel ?? venue.name) : null

  const titleChanged = title.trim() !== original.title.trim()
  const placeChanged = normalizePlace(place) !== normalizePlace(original.place)
  const dayTimeChanged = proposedStartsAt.getTime() !== originalStartsAt.getTime()

  if (
    (titleChanged && event.title !== original.title.trim()) ||
    (placeChanged && storedPlace !== normalizePlace(original.place)) ||
    (dayTimeChanged && event.startsAt.getTime() !== originalStartsAt.getTime())
  ) {
    return { status: "error", message: STALE_MESSAGE }
  }

  if (!titleChanged && !placeChanged && !dayTimeChanged) {
    return { status: "error", message: "Nothing changed." }
  }

  if (dayTimeChanged) {
    const check = checkEditedStart({
      event: {
        startsAt: event.startsAt,
        gaugeId: event.gaugeId,
        scheduledKey: event.scheduledKey,
      },
      recurringActivities: event.group.recurringActivities,
      timeZone,
      proposedStartsAt,
      now,
    })
    if (!check.ok) {
      if (check.reason === "past") {
        return { status: "error", message: "That time has already passed." }
      }
      const { nextOccurrence } = check
      return {
        status: "error",
        // Names the date, not just the weekday (owner's phone QA, 24 Sept
        // 2026): "Sat" alone never said WHICH Saturday was in the way.
        message: `That runs into the next ${event.title}, on ${formatWeekdayShort(nextOccurrence, timeZone)}, ${formatMonthDay(nextOccurrence, timeZone)}. Pick an earlier day.`,
      }
    }
  }

  let edited = false
  if (titleChanged || placeChanged) {
    const detailsResult = await editEventDetails({
      eventId,
      // An untouched field goes through as the stored value, so
      // editEventDetails sees no change on it: a stale form's old value
      // must never overwrite somebody else's newer one.
      title: titleChanged ? title : event.title,
      place: placeChanged ? place : (storedPlace ?? ""),
      now,
      announce: (change, currentTitle) =>
        buildEditAnnouncement(actor.name, currentTitle, change, event.startsAt, timeZone, now),
    })

    if (detailsResult.status === "skipped") {
      switch (detailsResult.reason) {
        case "invalid_title":
          return { status: "error", message: "Give the plan a name, up to 50 characters." }
        case "invalid_place":
          return { status: "error", message: "Keep the place under 80 characters." }
        case "stale":
          return { status: "error", message: STALE_MESSAGE }
        case "no_event":
          return { status: "error", message: "That plan is gone." }
        case "cancelled":
          return { status: "error", message: "Put this plan back on before changing it." }
        case "already_started":
          return { status: "error", message: "This one has already started." }
        case "noop":
          // The typed value differs from what the form opened with but
          // matches what is stored (say, only whitespace changed, or somebody
          // else already made the same fix). Nothing to write; only an error
          // when there is no day/time change to carry on with.
          if (!dayTimeChanged) {
            return { status: "error", message: "Nothing changed." }
          }
          break
      }
    }
    edited = detailsResult.status === "edited"
  }

  if (!dayTimeChanged) {
    return { status: "ok", edited, proposed: false }
  }

  // Agreeing with a vote that is already open joins it. Opening a second
  // one would supersede it and throw away every yes it has collected.
  const openSameTime = await prisma.changeProposal.findFirst({
    where: {
      eventId,
      kind: ProposalKind.GROUP,
      answer: null,
      proposedStartsAt,
      priorStartsAt: originalStartsAt,
    },
    select: { id: true },
  })
  if (openSameTime) {
    await prisma.proposalVote.upsert({
      where: { proposalId_userId: { proposalId: openSameTime.id, userId: actor.id } },
      create: { proposalId: openSameTime.id, userId: actor.id, answer: ProposalVoteAnswer.YES },
      update: { answer: ProposalVoteAnswer.YES },
    })
    // The chip-vote path (actions/proposal-vote.ts): a yes that clears the
    // bar moves the plan. Best-effort for the same reason: the yes already
    // saved, and a failed or lost-race promote must never eat it.
    try {
      await promoteProposalMove(openSameTime.id, now)
    } catch (err) {
      console.error("[submit-edit] promote failed", err)
    }
    return { status: "ok", edited, proposed: true }
  }

  // Re-read: the title may have just changed in step 5, and the proposal's
  // question must ask about the plan under its current name.
  const fresh = await prisma.event.findUnique({ where: { id: eventId } })
  if (!fresh) return { status: "error", message: "That plan is gone." }
  const label = fresh.activityLabel ?? fresh.title.toLowerCase()

  const proposalResult = await createGroupProposal({
    groupId: event.group.id,
    eventId,
    askerUserId: actor.id,
    sourceMessageId: null,
    proposedStartsAt,
    priorStartsAt: originalStartsAt,
    body: buildGroupProposalQuestion(
      actor.name,
      label,
      proposedStartsAt,
      originalStartsAt,
      timeZone,
      now,
      null
    ),
  })

  if (proposalResult.status === "created") {
    // A vote can clear its bar the moment it opens (a group of one: the
    // bar is the whole group). Without this nothing ever moves it, because
    // promotion only runs on a chip tap (group-details slice, 24 Sept 2026).
    try {
      await promoteProposalMove(proposalResult.proposal.id, now)
    } catch (err) {
      console.error("[submit-edit] promote-at-birth failed", err)
    }
  }

  if (proposalResult.status === "skipped" && proposalResult.reason === "stale") {
    // editEventDetails already committed (title and/or place, announced in
    // the feed) by the time this staleness is discovered: the plain "take
    // another look" message would read as if the whole save failed, when in
    // fact only the vote never opened. Tell the truth about both halves.
    return edited
      ? {
          status: "error",
          message:
            "Your other changes are saved, but someone just changed the time, so the group wasn't asked. Take another look.",
          edited: true,
        }
      : { status: "error", message: STALE_MESSAGE }
  }
  // "already_asked" (a double-tapped Save racing its own twin past the join
  // check above) counts as ok.

  return { status: "ok", edited, proposed: true }
}
