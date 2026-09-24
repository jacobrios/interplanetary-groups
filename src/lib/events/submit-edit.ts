// src/lib/events/submit-edit.ts
//
// One Save button, two write paths, and the order between them is the whole
// point: everything is validated before anything is written, so a refused
// day never leaves a half-saved title or place behind.
//
//   1. Load the event and refuse (writing nothing) for a missing plan, a
//      non-member, a called-off plan, or a plan that already started.
//   2. Parse the submitted local day and time and, only if the day or time
//      actually moved, run checkEditedStart. A refused day returns here,
//      before editEventDetails is ever called.
//   3. editEventDetails fixes the title and place directly. There is no
//      contested aspect to a rename or a spot change (unlike a time,
//      nobody's plans depend on the old name), so this is a plain write,
//      not a vote; its own announcement is the only check there is.
//   4. If the day or time changed, open a group vote (createGroupProposal)
//      instead of moving the plan outright: a time change touches
//      everyone's attendance, so it is the group's call, never the editor's
//      alone. The vote question uses the event's title as it now stands
//      (after step 3), read with a fresh query, since a save that renames
//      and moves in the same tap should ask about the new name.

import { prisma } from "@/lib/prisma"
import { EventStatus } from "@prisma/client"
import { isGroupMember } from "@/lib/auth/membership"
import { zonedWallTimeToUtc } from "@/lib/orbit/occurrence"
import { TIME_LOCAL_RE } from "@/lib/orbit/rhythm"
import { buildGroupProposalQuestion } from "@/lib/orbit/change-copy"
import { buildEditAnnouncement } from "@/lib/orbit/edit-copy"
import { createGroupProposal } from "@/lib/proposals/create"
import { checkEditedStart } from "./edit-limits"
import { editEventDetails } from "./edit-details"
import { formatTime, formatWeekdayShort } from "./format"

const DATE_LOCAL_RE = /^\d{4}-\d{2}-\d{2}$/

export type SubmitEventEditResult =
  | { status: "ok"; edited: boolean; proposed: boolean }
  | { status: "error"; message: string }

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
}): Promise<SubmitEventEditResult> {
  const { eventId, actor, title, place, dateLocal, timeLocal, now } = input

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { group: { select: { id: true, timeZone: true, recurringActivities: true } } },
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

  if (!DATE_LOCAL_RE.test(dateLocal) || !TIME_LOCAL_RE.test(timeLocal)) {
    return { status: "error", message: "Pick a day and a time." }
  }

  const timeZone = event.group.timeZone
  const [year, month, day] = dateLocal.split("-").map(Number)
  const [hour, minute] = timeLocal.split(":").map(Number)
  const proposedStartsAt = zonedWallTimeToUtc(year, month, day, hour, minute, timeZone)

  const dayTimeChanged = proposedStartsAt.getTime() !== event.startsAt.getTime()

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
        message: `That runs into the next regular ${event.title} on ${formatWeekdayShort(nextOccurrence, timeZone)} at ${formatTime(nextOccurrence, timeZone)}. Pick a time before then.`,
      }
    }
  }

  const detailsResult = await editEventDetails({
    eventId,
    title,
    place,
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
        return {
          status: "error",
          message: "Someone else just changed this plan, take another look.",
        }
      case "no_event":
        return { status: "error", message: "That plan is gone." }
      case "cancelled":
        return { status: "error", message: "Put this plan back on before changing it." }
      case "already_started":
        return { status: "error", message: "This one has already started." }
      case "noop":
        // A day/time-only save touches neither title nor place, so
        // editEventDetails legitimately sees nothing to write. That is
        // only an error when nothing at all changed; the day/time branch
        // below still runs.
        if (!dayTimeChanged) {
          return { status: "error", message: "Nothing changed." }
        }
        break
    }
  }

  const edited = detailsResult.status === "edited"

  if (!dayTimeChanged) {
    return { status: "ok", edited, proposed: false }
  }

  // Re-read: the title may have just changed in step 3, and the proposal's
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
    priorStartsAt: event.startsAt,
    body: buildGroupProposalQuestion(
      actor.name,
      label,
      proposedStartsAt,
      event.startsAt,
      timeZone,
      now,
      null
    ),
  })

  if (proposalResult.status === "skipped" && proposalResult.reason === "stale") {
    // editEventDetails already committed (title and/or place, announced in
    // the feed) by the time this staleness is discovered: the plain "take
    // another look" message would read as if the whole save failed, when in
    // fact only the vote never opened. Tell the truth about both halves.
    return {
      status: "error",
      message: edited
        ? "Your other changes are saved, but someone just changed the time, so the group wasn't asked. Take another look."
        : "Someone else just changed this plan, take another look.",
    }
  }
  // "already_asked" (a double-tapped Save with the same new time) counts as ok.

  return { status: "ok", edited, proposed: true }
}
