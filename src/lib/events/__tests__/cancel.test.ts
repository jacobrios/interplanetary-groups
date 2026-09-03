// Integration tests for cancelEvent / restoreEvent: hits the real dev-test DB.
// Cleanup order (FK constraints): Message → ChangeProposal → Event (Rsvps
// cascade) → Membership → Group → User.

import { describe, it, expect, afterEach, beforeEach } from "vitest"
import { prisma } from "@/lib/prisma"
import {
  EventStatus,
  MessageAuthor,
  ProposalAnswer,
  ProposalKind,
  RsvpStatus,
} from "@prisma/client"
import { cancelEvent, restoreEvent } from "../cancel"

let userId: string | null = null
let secondUserId: string | null = null
let groupId: string | null = null
let eventId: string | null = null

const START = new Date("2099-06-14T18:00:00Z")
const NOW = new Date("2099-06-10T12:00:00Z")

async function cleanup() {
  if (groupId) {
    await prisma.changeProposal.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.message.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.event.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.membership.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.group.delete({ where: { id: groupId } }).catch(() => {})
    groupId = null
  }
  for (const id of [userId, secondUserId]) {
    if (id) await prisma.user.delete({ where: { id } }).catch(() => {})
  }
  userId = null
  secondUserId = null
  eventId = null
}

afterEach(async () => {
  await cleanup()
  await prisma.$disconnect()
})

beforeEach(async () => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  const user = await prisma.user.create({
    data: { name: "[TEST] Canceller", supabaseAuthId: `test-cancel-${suffix}` },
  })
  userId = user.id
  const second = await prisma.user.create({
    data: { name: "[TEST] Other", supabaseAuthId: `test-cancel2-${suffix}` },
  })
  secondUserId = second.id
  const group = await prisma.group.create({
    data: {
      name: "[TEST] Cancel Group",
      founderId: user.id,
      timeZone: "UTC",
      recurringActivities: [] as never,
      memberships: { create: [{ userId: user.id }, { userId: second.id }] },
    },
  })
  groupId = group.id
  const event = await prisma.event.create({
    data: { groupId: group.id, title: "Tennis", activityLabel: "tennis", startsAt: START },
  })
  eventId = event.id
  await prisma.rsvp.createMany({
    data: [
      { eventId: event.id, userId: user.id, status: RsvpStatus.IN },
      { eventId: event.id, userId: second.id, status: RsvpStatus.OUT },
    ],
  })
})

/**
 * ChangeProposal.sourceMessageId and orbitMessageId are real, required FKs
 * (see prisma/schema.prisma), not the free-form strings the task brief's
 * fixture sketch implied. Every test that creates a GROUP proposal needs two
 * real Message rows first, mirroring the helper in
 * src/lib/proposals/__tests__/endgame.test.ts.
 */
async function createGroupProposal() {
  const source = await prisma.message.create({
    data: {
      groupId: groupId!,
      authorType: MessageAuthor.MEMBER,
      authorId: userId!,
      body: "can we move it to 8pm?",
    },
  })
  const orbitMsg = await prisma.message.create({
    data: {
      groupId: groupId!,
      authorType: MessageAuthor.ORBIT,
      authorId: null,
      body: "Sam wants tennis at 8pm instead of 6pm. Move it?",
    },
  })
  return prisma.changeProposal.create({
    data: {
      groupId: groupId!,
      eventId: eventId!,
      askerUserId: userId!,
      sourceMessageId: source.id,
      orbitMessageId: orbitMsg.id,
      kind: ProposalKind.GROUP,
      priorStartsAt: START,
      proposedStartsAt: new Date("2099-06-14T20:00:00Z"),
    },
  })
}

describe("cancelEvent", () => {
  it("sets the status, stamps cancelledAt, and announces once", async () => {
    const result = await cancelEvent({
      eventId: eventId!,
      announcementBody: "Sam called off tennis this Mon.",
      now: NOW,
    })
    expect(result).toEqual({ status: "cancelled" })

    const event = await prisma.event.findUnique({ where: { id: eventId! } })
    expect(event?.status).toBe(EventStatus.CANCELLED)
    expect(event?.cancelledAt).toEqual(NOW)

    const messages = await prisma.message.findMany({ where: { groupId: groupId! } })
    expect(messages).toHaveLength(1)
    expect(messages[0].authorType).toBe(MessageAuthor.ORBIT)
    expect(messages[0].authorId).toBeNull()
    expect(messages[0].body).toBe("Sam called off tennis this Mon.")
  })

  it("leaves every RSVP exactly as it was", async () => {
    const before = await prisma.rsvp.findMany({
      where: { eventId: eventId! },
      orderBy: { userId: "asc" },
    })

    await cancelEvent({ eventId: eventId!, announcementBody: "x", now: NOW })

    const after = await prisma.rsvp.findMany({
      where: { eventId: eventId! },
      orderBy: { userId: "asc" },
    })
    expect(after).toEqual(before)
  })

  it("supersedes a live group time-change vote, silently", async () => {
    const proposal = await createGroupProposal()

    const before = await prisma.message.findMany({ where: { groupId: groupId! } })

    await cancelEvent({ eventId: eventId!, announcementBody: "x", now: NOW })

    const after = await prisma.changeProposal.findUnique({ where: { id: proposal.id } })
    expect(after?.answer).toBe(ProposalAnswer.SUPERSEDED)
    expect(after?.answeredAt).not.toBeNull()

    // Silent: the cancellation announcement is the only message cancelEvent
    // writes. before.length accounts for the two fixture messages the
    // proposal itself required (its sourceMessage and orbitMessage).
    const messages = await prisma.message.findMany({ where: { groupId: groupId! } })
    expect(messages).toHaveLength(before.length + 1)
  })

  it("refuses a second cancel and writes no second message", async () => {
    await cancelEvent({ eventId: eventId!, announcementBody: "first", now: NOW })
    const again = await cancelEvent({ eventId: eventId!, announcementBody: "second", now: NOW })

    expect(again).toEqual({ status: "skipped", reason: "already_cancelled" })
    const messages = await prisma.message.findMany({ where: { groupId: groupId! } })
    expect(messages).toHaveLength(1)
  })

  it("refuses a plan whose start has already passed", async () => {
    const afterStart = new Date(START.getTime() + 60_000)
    const result = await cancelEvent({
      eventId: eventId!,
      announcementBody: "x",
      now: afterStart,
    })
    expect(result).toEqual({ status: "skipped", reason: "already_started" })

    const event = await prisma.event.findUnique({ where: { id: eventId! } })
    expect(event?.status).toBe(EventStatus.SCHEDULED)
  })

  it("refuses an event that does not exist", async () => {
    const result = await cancelEvent({
      eventId: "does-not-exist",
      announcementBody: "x",
      now: NOW,
    })
    expect(result).toEqual({ status: "skipped", reason: "no_event" })
  })
})

describe("restoreEvent", () => {
  it("clears the status and cancelledAt, and announces once", async () => {
    await cancelEvent({ eventId: eventId!, announcementBody: "off", now: NOW })
    const result = await restoreEvent({
      eventId: eventId!,
      announcementBody: "Jordan put tennis this Mon back on.",
      now: NOW,
    })
    expect(result).toEqual({ status: "restored" })

    const event = await prisma.event.findUnique({ where: { id: eventId! } })
    expect(event?.status).toBe(EventStatus.SCHEDULED)
    expect(event?.cancelledAt).toBeNull()

    const messages = await prisma.message.findMany({
      where: { groupId: groupId! },
      orderBy: { createdAt: "asc" },
    })
    expect(messages).toHaveLength(2)
    expect(messages[1].body).toBe("Jordan put tennis this Mon back on.")
  })

  it("returns every RSVP untouched across a cancel and a restore", async () => {
    const before = await prisma.rsvp.findMany({
      where: { eventId: eventId! },
      orderBy: { userId: "asc" },
    })

    await cancelEvent({ eventId: eventId!, announcementBody: "off", now: NOW })
    await restoreEvent({ eventId: eventId!, announcementBody: "on", now: NOW })

    const after = await prisma.rsvp.findMany({
      where: { eventId: eventId! },
      orderBy: { userId: "asc" },
    })
    expect(after).toEqual(before)
  })

  it("does not revive the vote the cancel superseded", async () => {
    const proposal = await createGroupProposal()

    await cancelEvent({ eventId: eventId!, announcementBody: "off", now: NOW })
    await restoreEvent({ eventId: eventId!, announcementBody: "on", now: NOW })

    const after = await prisma.changeProposal.findUnique({ where: { id: proposal.id } })
    expect(after?.answer).toBe(ProposalAnswer.SUPERSEDED)
  })

  it("refuses to put back a plan whose start has already passed", async () => {
    // The tennis-club shape: Tuesday is called off Tuesday morning, 7pm goes
    // by, the cron books next Tuesday, and somebody's stale tab still offers
    // "Put this back on". Restoring here would announce a game that never
    // happened and then hide it, since every upcoming query wants
    // startsAt >= now.
    await cancelEvent({ eventId: eventId!, announcementBody: "off", now: NOW })
    const afterStart = new Date(START.getTime() + 60_000)

    const result = await restoreEvent({
      eventId: eventId!,
      announcementBody: "Jordan put tennis this Mon back on.",
      now: afterStart,
    })
    expect(result).toEqual({ status: "skipped", reason: "already_started" })

    const event = await prisma.event.findUnique({ where: { id: eventId! } })
    expect(event?.status).toBe(EventStatus.CANCELLED)
    expect(event?.cancelledAt).toEqual(NOW)

    // The cancellation line only: nothing announced about a game in the past.
    const messages = await prisma.message.findMany({ where: { groupId: groupId! } })
    expect(messages).toHaveLength(1)
  })

  it("refuses an event that is not cancelled", async () => {
    const result = await restoreEvent({ eventId: eventId!, announcementBody: "x", now: NOW })
    expect(result).toEqual({ status: "skipped", reason: "not_cancelled" })

    const messages = await prisma.message.findMany({ where: { groupId: groupId! } })
    expect(messages).toHaveLength(0)
  })
})
