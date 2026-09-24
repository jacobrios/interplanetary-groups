// Integration tests for submitEventEdit: hits the real dev-test DB.
// Cleanup order (FK constraints): ProposalVote -> ChangeProposal -> Message
// -> Event (Venue and Rsvp cascade with their Event) -> Membership -> Group
// -> User. Modelled on proposals.test.ts and edit-details.test.ts.

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import { EventStatus, MessageAuthor, ProposalKind, ProposalVoteAnswer } from "@prisma/client"
import { submitEventEdit } from "../submit-edit"

let userId: string | null = null
let otherUserId: string | null = null
let groupId: string | null = null
let eventId: string | null = null

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
  for (const id of [userId, otherUserId]) {
    if (id) await prisma.user.delete({ where: { id } }).catch(() => {})
  }
  userId = null
  otherUserId = null
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
      })
      expect(result).toEqual({
        status: "error",
        message:
          "Your other changes are saved, but someone just changed the time, so the group wasn't asked. Take another look.",
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
