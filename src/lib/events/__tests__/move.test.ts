// Integration tests for moveEventTime — hits the real dev-test DB.
// Cleanup order (FK constraints): Message → ChangeProposal → Event (Rsvps
// cascade) → Membership → Group → User.

import { describe, it, expect, afterEach, beforeEach } from "vitest"
import { prisma } from "@/lib/prisma"
import { EventStatus, MessageAuthor, ProposalAnswer, RsvpStatus } from "@prisma/client"
import { moveEventTime } from "../move"

let userId: string | null = null
let secondUserId: string | null = null
let groupId: string | null = null
let eventId: string | null = null

const OLD_START = new Date("2099-06-14T08:00:00Z")
const NEW_START = new Date("2099-06-14T18:00:00Z")

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
    data: { name: "[TEST] Mover", supabaseAuthId: `test-move-${suffix}` },
  })
  userId = user.id
  const second = await prisma.user.create({
    data: { name: "[TEST] Other", supabaseAuthId: `test-move2-${suffix}` },
  })
  secondUserId = second.id
  const group = await prisma.group.create({
    data: {
      name: "[TEST] Move Group",
      founderId: user.id,
      timeZone: "UTC",
      recurringActivities: [] as never,
      memberships: { create: [{ userId: user.id }, { userId: second.id }] },
    },
  })
  groupId = group.id
  const event = await prisma.event.create({
    data: {
      groupId: group.id,
      title: "Climbing",
      activityLabel: "climbing",
      startsAt: OLD_START,
    },
  })
  eventId = event.id
  await prisma.rsvp.createMany({
    data: [
      { eventId: event.id, userId: user.id, status: RsvpStatus.IN },
      { eventId: event.id, userId: second.id, status: RsvpStatus.OUT },
    ],
  })
})

describe("moveEventTime", () => {
  it("moves, remembers, resets, seeds the requester, and announces, atomically", async () => {
    const result = await moveEventTime({
      eventId: eventId!,
      expectedStartsAt: OLD_START,
      newStartsAt: NEW_START,
      requesterUserId: userId!,
      announcementBody: "Done. Test announcement.",
    })
    expect(result).toEqual({ status: "moved" })

    const event = await prisma.event.findUnique({ where: { id: eventId! } })
    expect(event?.startsAt).toEqual(NEW_START)
    expect(event?.previousStartsAt).toEqual(OLD_START)
    expect(event?.scheduledKey).toBe(null) // untouched: this event never had one

    // Everyone reset to "haven't replied" except the requester, who is IN.
    const rsvps = await prisma.rsvp.findMany({ where: { eventId: eventId! } })
    expect(rsvps).toHaveLength(1)
    expect(rsvps[0]).toMatchObject({ userId: userId!, status: RsvpStatus.IN })

    const messages = await prisma.message.findMany({ where: { groupId: groupId! } })
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      authorType: MessageAuthor.ORBIT,
      authorId: null,
      body: "Done. Test announcement.",
    })
  })

  it("leaves a scheduled event's key alone", async () => {
    const key = `${groupId}:${OLD_START.toISOString()}`
    await prisma.event.update({ where: { id: eventId! }, data: { scheduledKey: key } })
    await moveEventTime({
      eventId: eventId!,
      expectedStartsAt: OLD_START,
      newStartsAt: NEW_START,
      requesterUserId: userId!,
      announcementBody: "x",
    })
    const event = await prisma.event.findUnique({ where: { id: eventId! } })
    expect(event?.scheduledKey).toBe(key)
  })

  it("refuses a stale expectation: never moves from a time the caller was not looking at", async () => {
    const result = await moveEventTime({
      eventId: eventId!,
      expectedStartsAt: new Date("2099-06-14T07:00:00Z"), // not the current start
      newStartsAt: NEW_START,
      requesterUserId: userId!,
      announcementBody: "x",
    })
    expect(result).toEqual({ status: "skipped", reason: "stale" })
    const rsvps = await prisma.rsvp.findMany({ where: { eventId: eventId! } })
    expect(rsvps).toHaveLength(2) // nothing was touched
  })

  it("no-ops on moving to the same instant, and reports a missing event", async () => {
    expect(
      await moveEventTime({
        eventId: eventId!,
        expectedStartsAt: OLD_START,
        newStartsAt: OLD_START,
        requesterUserId: userId!,
        announcementBody: "x",
      })
    ).toEqual({ status: "skipped", reason: "noop" })
    expect(
      await moveEventTime({
        eventId: "does-not-exist",
        expectedStartsAt: OLD_START,
        newStartsAt: NEW_START,
        requesterUserId: userId!,
        announcementBody: "x",
      })
    ).toEqual({ status: "skipped", reason: "no_event" })
  })

  it("resolves the proposal in the same transaction when asked to", async () => {
    const source = await prisma.message.create({
      data: { groupId: groupId!, authorType: MessageAuthor.MEMBER, authorId: userId!, body: "9?" },
    })
    const orbit = await prisma.message.create({
      data: { groupId: groupId!, authorType: MessageAuthor.ORBIT, authorId: null, body: "Move?" },
    })
    const proposal = await prisma.changeProposal.create({
      data: {
        groupId: groupId!,
        eventId: eventId!,
        askerUserId: userId!,
        sourceMessageId: source.id,
        orbitMessageId: orbit.id,
        proposedStartsAt: NEW_START,
        priorStartsAt: OLD_START,
      },
    })
    await moveEventTime({
      eventId: eventId!,
      expectedStartsAt: OLD_START,
      newStartsAt: NEW_START,
      requesterUserId: userId!,
      announcementBody: "x",
      resolveProposalId: proposal.id,
    })
    const resolved = await prisma.changeProposal.findUnique({ where: { id: proposal.id } })
    expect(resolved?.answer).toBe(ProposalAnswer.CONFIRMED)
    expect(resolved?.answeredAt).not.toBe(null)
  })

  it("refuses to move a plan that has been called off", async () => {
    await prisma.event.update({
      where: { id: eventId! },
      data: { status: EventStatus.CANCELLED, cancelledAt: new Date() },
    })

    const result = await moveEventTime({
      eventId: eventId!,
      expectedStartsAt: OLD_START,
      newStartsAt: NEW_START,
      requesterUserId: userId!,
      announcementBody: "Done. Test announcement.",
    })
    expect(result).toEqual({ status: "skipped", reason: "cancelled" })

    const event = await prisma.event.findUnique({ where: { id: eventId! } })
    expect(event?.startsAt).toEqual(OLD_START)
    const messages = await prisma.message.findMany({ where: { groupId: groupId! } })
    expect(messages).toHaveLength(0)
  })
})
