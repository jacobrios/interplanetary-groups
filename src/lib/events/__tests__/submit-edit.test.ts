// Integration tests for submitEventEdit: hits the real dev-test DB.
// Cleanup order (FK constraints): ProposalVote -> ChangeProposal -> Message
// -> Event (Venue and Rsvp cascade with their Event) -> Membership -> Group
// -> User. Modelled on proposals.test.ts and edit-details.test.ts.

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import { EventStatus, MessageAuthor, ProposalKind, ProposalVoteAnswer } from "@prisma/client"
import { submitEventEdit } from "../submit-edit"
import { createGroupProposal } from "@/lib/proposals/create"

let userId: string | null = null
let otherUserId: string | null = null
let groupId: string | null = null
let eventId: string | null = null
let extraUserIds: string[] = []

// Chicago (America/Chicago, UTC-5 in June) so the timezone conversion in the
// group's own zone is actually exercised rather than degenerating to UTC.
const TZ = "America/Chicago"
const RHYTHM = [
  { activity: "tennis", title: "Tennis", cadence: "weekly", daysOfWeek: [6], timeLocal: "09:00" },
]
// Sat 2099-06-13 09:00 America/Chicago == 14:00 UTC.
const START = new Date("2099-06-13T14:00:00Z")
const NOW = new Date("2099-06-10T12:00:00Z")

async function cleanup() {
  if (groupId) {
    const proposals = await prisma.changeProposal
      .findMany({ where: { groupId }, select: { id: true } })
      .catch(() => [] as { id: string }[])
    if (proposals.length) {
      await prisma.proposalVote
        .deleteMany({ where: { proposalId: { in: proposals.map((p) => p.id) } } })
        .catch(() => {})
    }
    await prisma.changeProposal.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.rsvp.deleteMany({ where: { event: { groupId } } }).catch(() => {})
    await prisma.message.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.event.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.membership.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.group.delete({ where: { id: groupId } }).catch(() => {})
    groupId = null
  }
  for (const id of [userId, otherUserId, ...extraUserIds]) {
    if (id) await prisma.user.delete({ where: { id } }).catch(() => {})
  }
  userId = null
  otherUserId = null
  extraUserIds = []
  eventId = null
}

afterEach(async () => {
  await cleanup()
  await prisma.$disconnect()
})

beforeEach(async () => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  const user = await prisma.user.create({
    data: { name: "[TEST] Casey", supabaseAuthId: `test-submit-edit-${suffix}` },
  })
  userId = user.id
  const other = await prisma.user.create({
    data: { name: "[TEST] Riley", supabaseAuthId: `test-submit-edit2-${suffix}` },
  })
  otherUserId = other.id
  const group = await prisma.group.create({
    data: {
      name: "[TEST] Submit Edit Group",
      founderId: user.id,
      timeZone: TZ,
      recurringActivities: RHYTHM as never,
      memberships: { create: [{ userId: user.id }, { userId: other.id }] },
    },
  })
  groupId = group.id
  const event = await prisma.event.create({
    data: {
      groupId: group.id,
      title: "Tennis",
      activityLabel: "tennis",
      startsAt: START,
      scheduledKey: `${group.id}:${START.toISOString()}`,
    },
  })
  eventId = event.id
})

const actor = () => ({ id: userId!, name: "[TEST] Casey" })

// What the form showed when it was opened: the event exactly as the fixture
// stores it. A test that simulates a stale form passes a different one.
const ORIG = { title: "Tennis", place: "", dateLocal: "2099-06-13", timeLocal: "09:00" }

describe("submitEventEdit", () => {
  it("fixture sanity: START is Sat 09:00 America/Chicago", () => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      weekday: "short",
      hour: "numeric",
      hour12: false,
    }).formatToParts(START)
    expect(parts.find((p) => p.type === "weekday")?.value).toBe("Sat")
    expect(parts.find((p) => p.type === "hour")?.value).toBe("09")
  })

  it("place-only save: edits, does not propose, and posts one message naming the actor", async () => {
    const result = await submitEventEdit({
      eventId: eventId!,
      actor: actor(),
      title: "Tennis",
      place: "Court 5",
      dateLocal: "2099-06-13",
      timeLocal: "09:00",
      now: NOW,
      original: ORIG,
    })
    expect(result).toEqual({ status: "ok", edited: true, proposed: false })

    const event = await prisma.event.findUnique({ where: { id: eventId! } })
    expect(event?.startsAt.getTime()).toBe(START.getTime())

    const proposals = await prisma.changeProposal.findMany({ where: { eventId: eventId! } })
    expect(proposals).toHaveLength(0)

    const messages = await prisma.message.findMany({ where: { groupId: groupId! } })
    expect(messages).toHaveLength(1)
    expect(messages[0].authorType).toBe(MessageAuthor.ORBIT)
    expect(messages[0].body).toContain("[TEST] Casey")
  })

  it("time-only save: does not edit, opens a group proposal with the actor's YES vote, and leaves startsAt unchanged", async () => {
    // Same-day move, ahead of "now" and well before the next regular slot
    // (the following Saturday).
    const result = await submitEventEdit({
      eventId: eventId!,
      actor: actor(),
      title: "Tennis",
      place: "",
      dateLocal: "2099-06-13",
      timeLocal: "10:00",
      now: NOW,
      original: ORIG,
    })
    expect(result).toEqual({ status: "ok", edited: false, proposed: true })

    const event = await prisma.event.findUnique({ where: { id: eventId! } })
    expect(event?.startsAt.getTime()).toBe(START.getTime())

    const proposals = await prisma.changeProposal.findMany({ where: { eventId: eventId! } })
    expect(proposals).toHaveLength(1)
    expect(proposals[0].sourceMessageId).toBeNull()
    expect(proposals[0].kind).toBe(ProposalKind.GROUP)
    // 2099-06-13 10:00 America/Chicago == 15:00 UTC.
    expect(proposals[0].proposedStartsAt.toISOString()).toBe("2099-06-13T15:00:00.000Z")

    const votes = await prisma.proposalVote.findMany({ where: { proposalId: proposals[0].id } })
    expect(votes).toHaveLength(1)
    expect(votes[0].userId).toBe(userId!)
    expect(votes[0].answer).toBe(ProposalVoteAnswer.YES)
  })

  it("both: posts the edit announcement before the vote question, and the question uses the new title", async () => {
    const result = await submitEventEdit({
      eventId: eventId!,
      actor: actor(),
      title: "Doubles",
      place: "",
      dateLocal: "2099-06-13",
      timeLocal: "10:00",
      now: NOW,
      original: ORIG,
    })
    expect(result).toEqual({ status: "ok", edited: true, proposed: true })

    const event = await prisma.event.findUnique({ where: { id: eventId! } })
    expect(event?.title).toBe("Doubles")

    const messages = await prisma.message.findMany({
      where: { groupId: groupId! },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    })
    expect(messages).toHaveLength(2)
    expect(messages[0].authorType).toBe(MessageAuthor.ORBIT)
    expect(messages[0].body).toContain("renamed")
    expect(messages[1].body).toContain("Doubles")
    expect(messages[1].body.toLowerCase()).not.toContain("tennis")
  })

  it("refuses a non-member and writes nothing", async () => {
    const strangerId = "cnonexistentstrangerid00000000"
    const strangerResult = await submitEventEdit({
      eventId: eventId!,
      actor: { id: strangerId, name: "Stranger" },
      title: "Doubles",
      place: "Court 5",
      dateLocal: "2099-06-13",
      timeLocal: "10:00",
      now: NOW,
      original: ORIG,
    })
    expect(strangerResult).toEqual({
      status: "error",
      message: "Only members can change this group's plans.",
    })

    const event = await prisma.event.findUnique({ where: { id: eventId! } })
    expect(event?.title).toBe("Tennis")
    const messages = await prisma.message.findMany({ where: { groupId: groupId! } })
    expect(messages).toHaveLength(0)
    const proposals = await prisma.changeProposal.findMany({ where: { eventId: eventId! } })
    expect(proposals).toHaveLength(0)
  })

  it("refuses a cancelled plan and writes nothing", async () => {
    await prisma.event.update({
      where: { id: eventId! },
      data: { status: EventStatus.CANCELLED, cancelledAt: NOW },
    })

    const result = await submitEventEdit({
      eventId: eventId!,
      actor: actor(),
      title: "Doubles",
      place: "Court 5",
      dateLocal: "2099-06-13",
      timeLocal: "10:00",
      now: NOW,
      original: ORIG,
    })
    expect(result).toEqual({
      status: "error",
      message: "Put this plan back on before changing it.",
    })

    const event = await prisma.event.findUnique({ where: { id: eventId! } })
    expect(event?.title).toBe("Tennis")
    const messages = await prisma.message.findMany({ where: { groupId: groupId! } })
    expect(messages).toHaveLength(0)
  })

  it("refuses a day landing on the rhythm's next regular slot; neither the title change nor a proposal is written", async () => {
    // NEXT_SAT: 2099-06-20 09:00 America/Chicago == 14:00 UTC, exactly the
    // rhythm's next regular occurrence after START.
    const result = await submitEventEdit({
      eventId: eventId!,
      actor: actor(),
      title: "Doubles",
      place: "",
      dateLocal: "2099-06-20",
      timeLocal: "09:00",
      now: NOW,
      original: ORIG,
    })
    expect(result).toEqual({
      status: "error",
      message: "That runs into the next regular Tennis on Sat at 9am. Pick a time before then.",
    })

    const event = await prisma.event.findUnique({ where: { id: eventId! } })
    expect(event?.title).toBe("Tennis")
    expect(event?.startsAt.getTime()).toBe(START.getTime())
    const messages = await prisma.message.findMany({ where: { groupId: groupId! } })
    expect(messages).toHaveLength(0)
    const proposals = await prisma.changeProposal.findMany({ where: { eventId: eventId! } })
    expect(proposals).toHaveLength(0)
  })

  it("reports nothing changed when title, place, day and time are all unchanged", async () => {
    const result = await submitEventEdit({
      eventId: eventId!,
      actor: actor(),
      title: "Tennis",
      place: "",
      dateLocal: "2099-06-13",
      timeLocal: "09:00",
      now: NOW,
      original: ORIG,
    })
    expect(result).toEqual({ status: "error", message: "Nothing changed." })

    const messages = await prisma.message.findMany({ where: { groupId: groupId! } })
    expect(messages).toHaveLength(0)
  })

  it("submitted twice with the same new time leaves exactly one live proposal", async () => {
    const first = await submitEventEdit({
      eventId: eventId!,
      actor: actor(),
      title: "Tennis",
      place: "",
      dateLocal: "2099-06-13",
      timeLocal: "10:00",
      now: NOW,
      original: ORIG,
    })
    expect(first).toEqual({ status: "ok", edited: false, proposed: true })

    const second = await submitEventEdit({
      eventId: eventId!,
      actor: actor(),
      title: "Tennis",
      place: "",
      dateLocal: "2099-06-13",
      timeLocal: "10:00",
      now: NOW,
      original: ORIG,
    })
    expect(second).toEqual({ status: "ok", edited: false, proposed: true })

    const proposals = await prisma.changeProposal.findMany({
      where: { eventId: eventId!, answer: null },
    })
    expect(proposals).toHaveLength(1)
  })

  it("tells the truth about a partial save when editEventDetails commits but the proposal then finds the plan stale", async () => {
    // There is no seam in submitEventEdit for injecting a mid-flight race
    // (it runs straight through to completion once called), so the least
    // invasive way to force this exact interleaving is to intercept
    // submitEventEdit's own FIRST read of the event and, as a side effect of
    // resolving it, simulate a concurrent actor moving the event's time
    // underneath it: submitEventEdit's in-memory `event.startsAt` (used for
    // checkEditedStart and as createGroupProposal's `priorStartsAt`) still
    // holds the pre-race value, while editEventDetails re-reads the row
    // fresh inside its own transaction (unaffected by this mock, since it
    // reads through `tx.event`, a different Prisma delegate) and so still
    // succeeds. createGroupProposal then re-reads startsAt inside ITS
    // transaction and finds it no longer matches `priorStartsAt`, exactly
    // the interleaving the review finding describes: details saved, vote
    // never opened.
    const RACED_STARTS_AT = new Date(START.getTime() + 60 * 60 * 1000)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const originalFindUnique = (prisma.event.findUnique as any).bind(prisma.event)
    let calls = 0
    // Cast to `any`: Prisma's findUnique overloads return its fluent
    // `Prisma__EventClient` rather than a plain Promise, which a
    // hand-written mock implementation can't satisfy structurally. The
    // runtime behavior (await the real call through, then race) is what
    // this test actually exercises.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spy = (vi.spyOn(prisma.event, "findUnique") as any).mockImplementation(
      async (args: any) => {
        calls++
        const result = await originalFindUnique(args)
        if (calls === 1) {
          await prisma.event.update({
            where: { id: eventId! },
            data: { startsAt: RACED_STARTS_AT },
          })
        }
        return result
      }
    )

    try {
      const result = await submitEventEdit({
        eventId: eventId!,
        actor: actor(),
        title: "Doubles",
        place: "",
        dateLocal: "2099-06-13",
        timeLocal: "10:00",
        now: NOW,
        original: ORIG,
      })
      expect(result).toEqual({
        status: "error",
        message:
          "Your other changes are saved, but someone just changed the time, so the group wasn't asked. Take another look.",
        edited: true,
      })
    } finally {
      spy.mockRestore()
    }

    const event = await prisma.event.findUnique({ where: { id: eventId! } })
    expect(event?.title).toBe("Doubles")
    expect(event?.startsAt.getTime()).toBe(RACED_STARTS_AT.getTime())

    const proposals = await prisma.changeProposal.findMany({ where: { eventId: eventId! } })
    expect(proposals).toHaveLength(0)
  })
})

// Adds members beyond the fixture's two, so a vote can be shaped either side
// of the consensus bar. Cleaned up with the rest in afterEach.
async function addMembers(names: string[]): Promise<string[]> {
  const ids: string[] = []
  for (const name of names) {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const u = await prisma.user.create({
      data: { name: `[TEST] ${name}`, supabaseAuthId: `test-submit-edit-x-${suffix}` },
    })
    extraUserIds.push(u.id)
    await prisma.membership.create({ data: { userId: u.id, groupId: groupId! } })
    ids.push(u.id)
  }
  return ids
}

describe("submitEventEdit, a form opened before someone else changed the plan", () => {
  it("a stale form that only renames does not undo a place someone else set meanwhile", async () => {
    // The form was opened with no place; someone else then set one.
    await prisma.venue.create({ data: { eventId: eventId!, name: "Court 9" } })

    const result = await submitEventEdit({
      eventId: eventId!,
      actor: actor(),
      title: "Doubles",
      place: "",
      dateLocal: "2099-06-13",
      timeLocal: "09:00",
      now: NOW,
      original: ORIG,
    })
    expect(result).toEqual({ status: "ok", edited: true, proposed: false })

    const venues = await prisma.venue.findMany({ where: { eventId: eventId! } })
    expect(venues.map((v) => v.name)).toEqual(["Court 9"])
    const event = await prisma.event.findUnique({ where: { id: eventId! } })
    expect(event?.title).toBe("Doubles")
  })

  it("a stale form still showing the old time, saved with a title fix, opens no vote to move it back", async () => {
    // The group moved the plan to 10:00 after this form was opened at 09:00.
    const MOVED = new Date(START.getTime() + 60 * 60 * 1000)
    await prisma.event.update({ where: { id: eventId! }, data: { startsAt: MOVED } })

    const result = await submitEventEdit({
      eventId: eventId!,
      actor: actor(),
      title: "Doubles",
      place: "",
      dateLocal: "2099-06-13",
      timeLocal: "09:00",
      now: NOW,
      original: ORIG,
    })
    expect(result).toEqual({ status: "ok", edited: true, proposed: false })

    const proposals = await prisma.changeProposal.findMany({ where: { eventId: eventId! } })
    expect(proposals).toHaveLength(0)
    const event = await prisma.event.findUnique({ where: { id: eventId! } })
    expect(event?.startsAt.getTime()).toBe(MOVED.getTime())
    expect(event?.title).toBe("Doubles")
  })

  it("refuses a title change when the stored title moved since the form opened, writing nothing", async () => {
    await prisma.event.update({ where: { id: eventId! }, data: { title: "Badminton" } })

    const result = await submitEventEdit({
      eventId: eventId!,
      actor: actor(),
      title: "Doubles",
      place: "Court 5",
      dateLocal: "2099-06-13",
      timeLocal: "09:00",
      now: NOW,
      original: ORIG,
    })
    expect(result).toEqual({
      status: "error",
      message: "Someone else just changed this plan, take another look.",
    })

    const event = await prisma.event.findUnique({ where: { id: eventId! } })
    expect(event?.title).toBe("Badminton")
    const venues = await prisma.venue.findMany({ where: { eventId: eventId! } })
    expect(venues).toHaveLength(0)
    const messages = await prisma.message.findMany({ where: { groupId: groupId! } })
    expect(messages).toHaveLength(0)
  })

  it("refuses a place change when the stored place moved since the form opened, writing nothing", async () => {
    await prisma.venue.create({ data: { eventId: eventId!, name: "Court 9" } })

    const result = await submitEventEdit({
      eventId: eventId!,
      actor: actor(),
      title: "Tennis",
      place: "Court 5",
      dateLocal: "2099-06-13",
      timeLocal: "09:00",
      now: NOW,
      original: ORIG,
    })
    expect(result).toEqual({
      status: "error",
      message: "Someone else just changed this plan, take another look.",
    })

    const venues = await prisma.venue.findMany({ where: { eventId: eventId! } })
    expect(venues.map((v) => v.name)).toEqual(["Court 9"])
    const messages = await prisma.message.findMany({ where: { groupId: groupId! } })
    expect(messages).toHaveLength(0)
  })

  it("refuses a time change when the stored time moved since the form opened, writing nothing", async () => {
    const MOVED = new Date(START.getTime() + 60 * 60 * 1000)
    await prisma.event.update({ where: { id: eventId! }, data: { startsAt: MOVED } })

    const result = await submitEventEdit({
      eventId: eventId!,
      actor: actor(),
      title: "Doubles",
      place: "",
      dateLocal: "2099-06-13",
      timeLocal: "11:00",
      now: NOW,
      original: ORIG,
    })
    expect(result).toEqual({
      status: "error",
      message: "Someone else just changed this plan, take another look.",
    })

    const event = await prisma.event.findUnique({ where: { id: eventId! } })
    expect(event?.title).toBe("Tennis")
    expect(event?.startsAt.getTime()).toBe(MOVED.getTime())
    const proposals = await prisma.changeProposal.findMany({ where: { eventId: eventId! } })
    expect(proposals).toHaveLength(0)
    const messages = await prisma.message.findMany({ where: { groupId: groupId! } })
    expect(messages).toHaveLength(0)
  })
})

describe("submitEventEdit, saving the same time a live vote already asks about", () => {
  // 2099-06-13 10:00 America/Chicago == 15:00 UTC.
  const TEN = new Date("2099-06-13T15:00:00Z")

  async function openVoteWithTwoYeses(): Promise<{ proposalId: string; samId: string }> {
    const [samId] = await addMembers(["Sam"])
    const opened = await createGroupProposal({
      groupId: groupId!,
      eventId: eventId!,
      askerUserId: otherUserId!,
      sourceMessageId: null,
      proposedStartsAt: TEN,
      priorStartsAt: START,
      body: "[TEST] Riley wants to move tennis to 10am. Move it?",
    })
    if (opened.status !== "created") throw new Error("fixture: vote did not open")
    await prisma.proposalVote.create({
      data: { proposalId: opened.proposal.id, userId: samId, answer: ProposalVoteAnswer.YES },
    })
    return { proposalId: opened.proposal.id, samId }
  }

  it("joins the open vote as a yes instead of replacing it, and posts nothing new", async () => {
    const { proposalId } = await openVoteWithTwoYeses()
    // Three people keeping the old time, so three yeses do not clear the bar
    // and the vote stays open to be counted.
    const keepers = await addMembers(["Kai", "Lee", "Max"])
    await prisma.proposalVote.createMany({
      data: keepers.map((userId) => ({ proposalId, userId, answer: ProposalVoteAnswer.KEEP })),
    })
    const messagesBefore = await prisma.message.count({ where: { groupId: groupId! } })

    const result = await submitEventEdit({
      eventId: eventId!,
      actor: actor(),
      title: "Tennis",
      place: "",
      dateLocal: "2099-06-13",
      timeLocal: "10:00",
      now: NOW,
      original: ORIG,
    })
    expect(result).toEqual({ status: "ok", edited: false, proposed: true })

    const live = await prisma.changeProposal.findMany({
      where: { eventId: eventId!, answer: null },
    })
    expect(live.map((p) => p.id)).toEqual([proposalId])
    const yeses = await prisma.proposalVote.findMany({
      where: { proposalId, answer: ProposalVoteAnswer.YES },
    })
    expect(yeses).toHaveLength(3)
    expect(yeses.map((v) => v.userId)).toContain(userId!)
    expect(await prisma.message.count({ where: { groupId: groupId! } })).toBe(messagesBefore)
  })

  it("moves the plan when the editor's yes is the one that clears the bar, as a chip tap would", async () => {
    const { proposalId } = await openVoteWithTwoYeses()

    const result = await submitEventEdit({
      eventId: eventId!,
      actor: actor(),
      title: "Tennis",
      place: "",
      dateLocal: "2099-06-13",
      timeLocal: "10:00",
      now: NOW,
      original: ORIG,
    })
    expect(result).toEqual({ status: "ok", edited: false, proposed: true })

    const event = await prisma.event.findUnique({ where: { id: eventId! } })
    expect(event?.startsAt.getTime()).toBe(TEN.getTime())
    const proposal = await prisma.changeProposal.findUnique({ where: { id: proposalId } })
    expect(proposal?.answer).not.toBeNull()
    const proposals = await prisma.changeProposal.findMany({ where: { eventId: eventId! } })
    expect(proposals).toHaveLength(1)
  })
})
