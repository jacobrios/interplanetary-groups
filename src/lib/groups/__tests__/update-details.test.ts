// Integration tests for updateGroupDetails: hits the real dev-test DB.
// Cleanup order (FK constraints): ProposalVote -> ChangeProposal -> Message
// -> Event (Venue and Rsvp cascade with their Event) -> Membership -> Group
// -> User. Fixture and cleanup shape copied from
// src/lib/events/__tests__/submit-edit.test.ts.
//
// Every test asserts the ORBIT message count explicitly (0 or 1), because
// "at most one Orbit message per save" is the slice's promise.

import { describe, it, expect, afterEach, beforeEach } from "vitest"
import { prisma } from "@/lib/prisma"
import {
  EventStatus,
  MessageAuthor,
  ProposalKind,
  ProposalVoteAnswer,
  RsvpStatus,
} from "@prisma/client"
import { updateGroupDetails, DETAILS_STALE, type UpdateGroupDetailsInput } from "../update-details"
import { DETAILS_UNSCHEDULABLE } from "../details-edit"
import type { RhythmEdit } from "../rhythm-edit"
import { createGroupProposal } from "@/lib/proposals/create"

let caseyId: string | null = null
let caseyAuth = ""
let rileyId: string | null = null
let rileyAuth = ""
let groupId: string | null = null
let eventId: string | null = null
let extraGroupIds: string[] = []
let extraUserIds: string[] = []

// Chicago (UTC-5 in June) so the group's own zone is actually exercised.
const TZ = "America/Chicago"
const GROUP_NAME = "[TEST] Update Details Group"
const RHYTHM = [
  {
    activity: "tennis",
    title: "Tennis",
    cadence: "weekly",
    daysOfWeek: [6],
    timeLocal: "09:00",
    venueName: "Court 3",
  },
]
// Sat 2099-06-13 09:00 America/Chicago == 14:00 UTC.
const START = new Date("2099-06-13T14:00:00Z")
// Wed 2099-06-10.
const NOW = new Date("2099-06-10T12:00:00Z")
// Sun 2099-06-14 08:00 America/Chicago == 13:00 UTC: the next Sun 08:00 after NOW.
const SUNDAY_8 = new Date("2099-06-14T13:00:00Z")

const EDIT_SAME: RhythmEdit = {
  activity: "tennis",
  daysOfWeek: [6],
  timeLocal: "09:00",
  venueName: "Court 3",
}

async function cleanupGroup(id: string) {
  const proposals = await prisma.changeProposal
    .findMany({ where: { groupId: id }, select: { id: true } })
    .catch(() => [] as { id: string }[])
  if (proposals.length) {
    await prisma.proposalVote
      .deleteMany({ where: { proposalId: { in: proposals.map((p) => p.id) } } })
      .catch(() => {})
  }
  await prisma.changeProposal.deleteMany({ where: { groupId: id } }).catch(() => {})
  await prisma.rsvp.deleteMany({ where: { event: { groupId: id } } }).catch(() => {})
  await prisma.message.deleteMany({ where: { groupId: id } }).catch(() => {})
  await prisma.event.deleteMany({ where: { groupId: id } }).catch(() => {})
  await prisma.gauge.deleteMany({ where: { groupId: id } }).catch(() => {})
  await prisma.membership.deleteMany({ where: { groupId: id } }).catch(() => {})
  await prisma.group.delete({ where: { id } }).catch(() => {})
}

async function cleanup() {
  for (const id of [groupId, ...extraGroupIds]) {
    if (id) await cleanupGroup(id)
  }
  for (const id of [caseyId, rileyId, ...extraUserIds]) {
    if (id) await prisma.user.delete({ where: { id } }).catch(() => {})
  }
  groupId = null
  eventId = null
  caseyId = null
  rileyId = null
  extraGroupIds = []
  extraUserIds = []
}

afterEach(async () => {
  await cleanup()
  await prisma.$disconnect()
})

beforeEach(async () => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  caseyAuth = `test-update-details-${suffix}`
  rileyAuth = `test-update-details2-${suffix}`
  const casey = await prisma.user.create({
    data: { name: "[TEST] Casey", supabaseAuthId: caseyAuth },
  })
  caseyId = casey.id
  const riley = await prisma.user.create({
    data: { name: "[TEST] Riley", supabaseAuthId: rileyAuth },
  })
  rileyId = riley.id
  const group = await prisma.group.create({
    data: {
      name: GROUP_NAME,
      founderId: casey.id,
      timeZone: TZ,
      recurringActivities: RHYTHM as never,
      memberships: { create: [{ userId: casey.id }, { userId: riley.id }] },
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
      venues: { create: { name: "Court 3" } },
      rsvps: {
        create: [
          { userId: casey.id, status: RsvpStatus.IN },
          { userId: riley.id, status: RsvpStatus.IN },
        ],
      },
    },
  })
  eventId = event.id
})

function input(over: Partial<UpdateGroupDetailsInput> = {}): UpdateGroupDetailsInput {
  return {
    supabaseAuthId: caseyAuth,
    groupId: groupId!,
    name: GROUP_NAME,
    rhythms: [EDIT_SAME],
    planChoice: null,
    openedPlan: null,
    now: NOW,
    ...over,
  }
}

const OPENED = () => ({ eventId: eventId!, startsAt: START.toISOString() })

async function orbitMessages() {
  return prisma.message.findMany({
    where: { groupId: groupId!, authorType: MessageAuthor.ORBIT },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  })
}

async function storedGroup() {
  return prisma.group.findUniqueOrThrow({ where: { id: groupId! } })
}

async function removeRiley() {
  await prisma.membership.deleteMany({ where: { groupId: groupId!, userId: rileyId! } })
}

describe("updateGroupDetails", () => {
  it("1. refuses a non-founder member and writes nothing", async () => {
    await expect(
      updateGroupDetails(input({ supabaseAuthId: rileyAuth, name: "Hijacked" }))
    ).rejects.toThrow("NOT_FOUNDER")

    const group = await storedGroup()
    expect(group.name).toBe(GROUP_NAME)
    expect(group.recurringActivities).toEqual(RHYTHM)
    expect(await orbitMessages()).toHaveLength(0)
  })

  it("2. refuses the founder of a different group", async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const other = await prisma.user.create({
      data: { name: "[TEST] Morgan", supabaseAuthId: `test-update-details3-${suffix}` },
    })
    extraUserIds.push(other.id)
    const otherGroup = await prisma.group.create({
      data: {
        name: "[TEST] Morgan's Group",
        founderId: other.id,
        timeZone: TZ,
        recurringActivities: RHYTHM as never,
        memberships: { create: [{ userId: other.id }] },
      },
    })
    extraGroupIds.push(otherGroup.id)

    await expect(
      updateGroupDetails(input({ supabaseAuthId: other.supabaseAuthId!, name: "Hijacked" }))
    ).rejects.toThrow("NOT_FOUNDER")

    expect((await storedGroup()).name).toBe(GROUP_NAME)
    expect(await orbitMessages()).toHaveLength(0)
  })

  it("3. an invalid edit (no days) returns the unschedulable error and leaves the column alone", async () => {
    const result = await updateGroupDetails(
      input({ rhythms: [{ ...EDIT_SAME, daysOfWeek: [] }], planChoice: "update", openedPlan: OPENED() })
    )
    expect(result).toEqual({ status: "error", message: DETAILS_UNSCHEDULABLE })
    expect((await storedGroup()).recurringActivities).toEqual(RHYTHM)
    expect(await orbitMessages()).toHaveLength(0)
  })

  it("4. writes the validated shape, never the raw payload", async () => {
    // Riley out, so there is no announcement to muddy the assertion; the
    // spot changes, so the plan question applies and is answered "leave".
    await removeRiley()
    const result = await updateGroupDetails(
      input({
        name: "  Racket Club  ",
        rhythms: [
          {
            activity: "  tennis  ",
            daysOfWeek: [6, 6],
            timeLocal: "09:00",
            venueName: "  Court 5  ",
            // Smuggled fields a hostile client might add.
            ...({ cadence: "monthly", title: "HACKED" } as object),
          } as RhythmEdit,
        ],
        planChoice: "leave",
        openedPlan: OPENED(),
      })
    )
    expect(result).toEqual({ status: "ok" })

    const group = await storedGroup()
    expect(group.name).toBe("Racket Club")
    expect(group.recurringActivities).toEqual([
      {
        activity: "tennis",
        title: "Tennis",
        cadence: "weekly",
        daysOfWeek: [6],
        timeLocal: "09:00",
        venueName: "Court 5",
      },
    ])
    expect(await orbitMessages()).toHaveLength(0)
  })

  it("5. a rename alone writes the name and posts nothing", async () => {
    const result = await updateGroupDetails(input({ name: "Racket Club" }))
    expect(result).toEqual({ status: "ok" })
    expect((await storedGroup()).name).toBe("Racket Club")
    expect(await orbitMessages()).toHaveLength(0)
  })

  it("6. founder alone, spot change, leave: rhythm updated, plan untouched, nothing posted", async () => {
    await removeRiley()
    const result = await updateGroupDetails(
      input({
        rhythms: [{ ...EDIT_SAME, venueName: "Court 5" }],
        planChoice: "leave",
        openedPlan: OPENED(),
      })
    )
    expect(result).toEqual({ status: "ok" })

    const rhythms = (await storedGroup()).recurringActivities as { venueName: string }[]
    expect(rhythms[0].venueName).toBe("Court 5")
    const venues = await prisma.venue.findMany({ where: { eventId: eventId! } })
    expect(venues.map((v) => v.name)).toEqual(["Court 3"])
    expect(await orbitMessages()).toHaveLength(0)
  })

  it("7. others present, spot change, update: the plan's place moves, RSVPs stay, one message", async () => {
    const result = await updateGroupDetails(
      input({
        rhythms: [{ ...EDIT_SAME, venueName: "Court 5" }],
        planChoice: "update",
        openedPlan: OPENED(),
      })
    )
    expect(result).toEqual({ status: "ok" })

    const venues = await prisma.venue.findMany({ where: { eventId: eventId! } })
    expect(venues.map((v) => v.name)).toEqual(["Court 5"])
    const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId! } })
    expect(event.title).toBe("Tennis")
    expect(event.startsAt.getTime()).toBe(START.getTime())

    const rsvps = await prisma.rsvp.findMany({ where: { eventId: eventId! } })
    expect(rsvps).toHaveLength(2)
    expect(rsvps.every((r) => r.status === RsvpStatus.IN)).toBe(true)

    const messages = await orbitMessages()
    expect(messages).toHaveLength(1)
    expect(messages[0].authorId).toBeNull()
    expect(messages[0].body.startsWith("[TEST] Casey changed the spot for tennis to Court 5.")).toBe(
      true
    )
    expect(messages[0].body).toContain("is updated too.")
  })

  it("8. others present, time change, update: opens a group vote carrying the one message", async () => {
    const result = await updateGroupDetails(
      input({
        rhythms: [{ ...EDIT_SAME, daysOfWeek: [0], timeLocal: "08:00" }],
        planChoice: "update",
        openedPlan: OPENED(),
      })
    )
    expect(result).toEqual({ status: "ok" })

    const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId! } })
    expect(event.startsAt.getTime()).toBe(START.getTime())

    const proposals = await prisma.changeProposal.findMany({ where: { eventId: eventId! } })
    expect(proposals).toHaveLength(1)
    expect(proposals[0].kind).toBe(ProposalKind.GROUP)
    expect(proposals[0].answer).toBeNull()
    expect(proposals[0].sourceMessageId).toBeNull()
    expect(proposals[0].askerUserId).toBe(caseyId)
    expect(proposals[0].proposedStartsAt.getTime()).toBe(SUNDAY_8.getTime())
    expect(proposals[0].priorStartsAt.getTime()).toBe(START.getTime())

    const votes = await prisma.proposalVote.findMany({ where: { proposalId: proposals[0].id } })
    expect(votes).toEqual([
      expect.objectContaining({ userId: caseyId, answer: ProposalVoteAnswer.YES }),
    ])

    const messages = await orbitMessages()
    expect(messages).toHaveLength(1)
    expect(messages[0].id).toBe(proposals[0].orbitMessageId)
    expect(messages[0].body).toContain("Move the plan")
  })

  it("9. founder alone, time change, update: the plan moves directly, founder IN, nothing posted", async () => {
    await removeRiley()
    const result = await updateGroupDetails(
      input({
        rhythms: [{ ...EDIT_SAME, daysOfWeek: [0], timeLocal: "08:00" }],
        planChoice: "update",
        openedPlan: OPENED(),
      })
    )
    expect(result).toEqual({ status: "ok" })

    const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId! } })
    expect(event.startsAt.getTime()).toBe(SUNDAY_8.getTime())
    expect(event.previousStartsAt?.getTime()).toBe(START.getTime())

    const rsvps = await prisma.rsvp.findMany({ where: { eventId: eventId! } })
    expect(rsvps).toEqual([expect.objectContaining({ userId: caseyId, status: RsvpStatus.IN })])

    expect(await prisma.changeProposal.findMany({ where: { eventId: eventId! } })).toHaveLength(0)
    expect(await orbitMessages()).toHaveLength(0)
  })

  it("10. leave with a schedule change: plan untouched, one message saying so", async () => {
    const result = await updateGroupDetails(
      input({
        rhythms: [{ ...EDIT_SAME, daysOfWeek: [0], timeLocal: "08:00" }],
        planChoice: "leave",
        openedPlan: OPENED(),
      })
    )
    expect(result).toEqual({ status: "ok" })

    const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId! } })
    expect(event.startsAt.getTime()).toBe(START.getTime())
    expect(await prisma.changeProposal.findMany({ where: { eventId: eventId! } })).toHaveLength(0)

    const messages = await orbitMessages()
    expect(messages).toHaveLength(1)
    expect(messages[0].body.endsWith("stays as it was.")).toBe(true)
  })

  it("11. stale: the question was about a different start, so nothing is written", async () => {
    const result = await updateGroupDetails(
      input({
        name: "Racket Club",
        rhythms: [{ ...EDIT_SAME, venueName: "Court 5" }],
        planChoice: "update",
        openedPlan: { eventId: eventId!, startsAt: "2099-06-13T15:00:00.000Z" },
      })
    )
    expect(result).toEqual({ status: "error", message: DETAILS_STALE })

    const group = await storedGroup()
    expect(group.name).toBe(GROUP_NAME)
    expect(group.recurringActivities).toEqual(RHYTHM)
    const venues = await prisma.venue.findMany({ where: { eventId: eventId! } })
    expect(venues.map((v) => v.name)).toEqual(["Court 3"])
    expect(await orbitMessages()).toHaveLength(0)
  })

  it("12. stale: no answer to the plan question while a plan exists", async () => {
    const result = await updateGroupDetails(
      input({ rhythms: [{ ...EDIT_SAME, venueName: "Court 5" }], planChoice: null, openedPlan: null })
    )
    expect(result).toEqual({ status: "error", message: DETAILS_STALE })
    expect((await storedGroup()).recurringActivities).toEqual(RHYTHM)
    expect(await orbitMessages()).toHaveLength(0)
  })

  it("13. a plan that has already started is not the next plan", async () => {
    await prisma.event.update({
      where: { id: eventId! },
      data: { startsAt: new Date(NOW.getTime() - 60 * 60 * 1000) },
    })
    const result = await updateGroupDetails(
      input({ rhythms: [{ ...EDIT_SAME, venueName: "Court 5" }], planChoice: null, openedPlan: null })
    )
    expect(result).toEqual({ status: "ok" })

    const rhythms = (await storedGroup()).recurringActivities as { venueName: string }[]
    expect(rhythms[0].venueName).toBe("Court 5")
    const venues = await prisma.venue.findMany({ where: { eventId: eventId! } })
    expect(venues.map((v) => v.name)).toEqual(["Court 3"])

    const messages = await orbitMessages()
    expect(messages).toHaveLength(1)
    expect(messages[0].body).toBe("[TEST] Casey changed the spot for tennis to Court 5.")
  })

  it("14. a called-off plan is not the next plan either", async () => {
    await prisma.event.update({
      where: { id: eventId! },
      data: { status: EventStatus.CANCELLED, cancelledAt: NOW },
    })
    const result = await updateGroupDetails(
      input({ rhythms: [{ ...EDIT_SAME, venueName: "Court 5" }], planChoice: null, openedPlan: null })
    )
    expect(result).toEqual({ status: "ok" })

    const venues = await prisma.venue.findMany({ where: { eventId: eventId! } })
    expect(venues.map((v) => v.name)).toEqual(["Court 3"])
    const messages = await orbitMessages()
    expect(messages).toHaveLength(1)
    expect(messages[0].body).toBe("[TEST] Casey changed the spot for tennis to Court 5.")
  })

  it("a floated plan (gaugeId set) is never this week's plan", async () => {
    // Covered by findNextRhythmPlan's gaugeId filter; exercised through the
    // rhythm plan being cancelled and a floated plan being the only upcoming one.
    await prisma.event.update({
      where: { id: eventId! },
      data: { status: EventStatus.CANCELLED, cancelledAt: NOW },
    })
    // The gauge's message is a MEMBER line so the ORBIT count below stays
    // about what the save wrote.
    const seed = await prisma.message.create({
      data: { groupId: groupId!, authorType: MessageAuthor.MEMBER, authorId: caseyId!, body: "tennis?" },
    })
    const gauge = await prisma.gauge.create({
      data: {
        groupId: groupId!,
        orbitMessageId: seed.id,
        activity: "tennis",
        proposedDate: START,
      },
    })
    await prisma.event.create({
      data: { groupId: groupId!, title: "Tennis", startsAt: START, gaugeId: gauge.id },
    })
    const result = await updateGroupDetails(
      input({ rhythms: [{ ...EDIT_SAME, venueName: "Court 5" }], planChoice: null, openedPlan: null })
    )
    expect(result).toEqual({ status: "ok" })
    expect(await orbitMessages()).toHaveLength(1)
  })
  it("update with a spot change leaves a member's rename of that one plan alone", async () => {
    await prisma.event.update({ where: { id: eventId! }, data: { title: "Doubles" } })
    const result = await updateGroupDetails(
      input({
        rhythms: [{ ...EDIT_SAME, venueName: "Court 5" }],
        planChoice: "update",
        openedPlan: OPENED(),
      })
    )
    expect(result).toEqual({ status: "ok" })
    const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId! } })
    expect(event.title).toBe("Doubles")
    const venues = await prisma.venue.findMany({ where: { eventId: eventId! } })
    expect(venues.map((v) => v.name)).toEqual(["Court 5"])
    expect(await orbitMessages()).toHaveLength(1)
  })

  it("a vote that cannot open still tells the group, in exactly one message", async () => {
    // The same ask is already open, so createGroupProposal skips it.
    const existing = await createGroupProposal({
      groupId: groupId!,
      eventId: eventId!,
      askerUserId: caseyId!,
      sourceMessageId: null,
      proposedStartsAt: SUNDAY_8,
      priorStartsAt: START,
      body: "Earlier ask",
    })
    expect(existing.status).toBe("created")

    const result = await updateGroupDetails(
      input({
        rhythms: [{ ...EDIT_SAME, daysOfWeek: [0], timeLocal: "08:00" }],
        planChoice: "update",
        openedPlan: OPENED(),
      })
    )
    expect(result).toEqual({ status: "ok" })

    expect(await prisma.changeProposal.findMany({ where: { eventId: eventId! } })).toHaveLength(1)
    const messages = await orbitMessages()
    // The pre-existing ask's message plus exactly one from this save.
    expect(messages).toHaveLength(2)
    expect(messages[1].body.startsWith("[TEST] Casey changed tennis to")).toBe(true)
    expect(messages[1].body.endsWith("stays as it was.")).toBe(true)
  })
})
