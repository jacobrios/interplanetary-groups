// src/lib/auth/__tests__/email-ask.test.ts
//
// The two database halves of the email ask: what the group home reads before
// it decides whether to offer, and the one write that advances the counter.
//
// The scoping claim is the load-bearing one here. Contribution is counted
// inside the group whose home is being rendered, so a member who is active in
// one group is not asked on the strength of that while sitting in another.

import { describe, it, expect, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { MessageAuthor, GaugeAnswer } from "@prisma/client"
import { loadEmailAskInputs, recordEmailOfferDismissed, hasVerifiedEmail } from "../email-ask"

const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
const userIds: string[] = []
const groupIds: string[] = []

afterAll(async () => {
  for (const id of groupIds) {
    await prisma.gaugeVote.deleteMany({ where: { gauge: { groupId: id } } }).catch(() => {})
    await prisma.gauge.deleteMany({ where: { groupId: id } }).catch(() => {})
    await prisma.rsvp.deleteMany({ where: { event: { groupId: id } } }).catch(() => {})
    await prisma.event.deleteMany({ where: { groupId: id } }).catch(() => {})
    await prisma.message.deleteMany({ where: { groupId: id } }).catch(() => {})
    await prisma.membership.deleteMany({ where: { groupId: id } }).catch(() => {})
    await prisma.group.delete({ where: { id } }).catch(() => {})
  }
  for (const id of userIds) {
    await prisma.contactMethod.deleteMany({ where: { userId: id } }).catch(() => {})
    await prisma.user.delete({ where: { id } }).catch(() => {})
  }
  await prisma.$disconnect()
})

async function makeUser(label: string) {
  const user = await prisma.user.create({
    data: { name: `[TEST] ${label}`, supabaseAuthId: `test-email-ask-${label}-${stamp}` },
  })
  userIds.push(user.id)
  return user
}

async function makeGroup(label: string, founderId: string, memberIds: string[]) {
  const group = await prisma.group.create({
    data: {
      name: `[TEST] ${label}`,
      founderId,
      memberships: { create: memberIds.map((userId) => ({ userId })) },
    },
  })
  groupIds.push(group.id)
  return group
}

describe("loadEmailAskInputs", () => {
  it("finds nothing for a member who has not done anything in this group yet", async () => {
    const member = await makeUser("Quiet")
    const group = await makeGroup("Quiet Group", member.id, [member.id])

    const inputs = await loadEmailAskInputs({ userId: member.id, groupId: group.id })

    expect(inputs.latestContributionAt).toBeNull()
    expect(inputs.hasVerifiedEmail).toBe(false)
  })

  it("counts a message, an RSVP and a gauge vote, and returns the latest of the three", async () => {
    const member = await makeUser("Active")
    const group = await makeGroup("Active Group", member.id, [member.id])

    // Deliberately backdated so the first assertion cannot pass by accident:
    // whatever the later rows land on, this one must not be the answer once
    // they exist.
    const message = await prisma.message.create({
      data: {
        groupId: group.id,
        authorType: MessageAuthor.MEMBER,
        authorId: member.id,
        body: "we should climb",
        createdAt: new Date("2020-01-01T00:00:00Z"),
      },
    })

    const afterMessage = await loadEmailAskInputs({ userId: member.id, groupId: group.id })
    expect(afterMessage.latestContributionAt?.getTime()).toBe(message.createdAt.getTime())

    const event = await prisma.event.create({
      data: { groupId: group.id, title: "[TEST] Climb", startsAt: new Date("2099-06-10T12:00:00Z") },
    })
    const rsvp = await prisma.rsvp.create({
      // OUT on purpose: saying no to Thursday is not saying no to reminders.
      data: { eventId: event.id, userId: member.id, status: "OUT" },
    })

    const afterRsvp = await loadEmailAskInputs({ userId: member.id, groupId: group.id })
    expect(afterRsvp.latestContributionAt?.getTime()).toBe(rsvp.respondedAt.getTime())

    const orbitMessage = await prisma.message.create({
      data: { groupId: group.id, authorType: MessageAuthor.ORBIT, body: "Climbing Tuesday?" },
    })
    const gauge = await prisma.gauge.create({
      data: {
        groupId: group.id,
        orbitMessageId: orbitMessage.id,
        activity: "climbing",
        proposedDate: new Date("2099-06-09T00:00:00Z"),
        proposedTime: "19:00",
      },
    })
    const vote = await prisma.gaugeVote.create({
      data: { gaugeId: gauge.id, userId: member.id, answer: GaugeAnswer.IN },
    })

    const afterVote = await loadEmailAskInputs({ userId: member.id, groupId: group.id })
    const latest = Math.max(
      message.createdAt.getTime(),
      rsvp.respondedAt.getTime(),
      vote.updatedAt.getTime()
    )
    expect(afterVote.latestContributionAt?.getTime()).toBe(latest)
  })

  it("ignores what the member did in a different group", async () => {
    const member = await makeUser("Crossover")
    const elsewhere = await makeGroup("Elsewhere", member.id, [member.id])
    const here = await makeGroup("Here", member.id, [member.id])

    await prisma.message.create({
      data: {
        groupId: elsewhere.id,
        authorType: MessageAuthor.MEMBER,
        authorId: member.id,
        body: "beers?",
      },
    })

    const inputs = await loadEmailAskInputs({ userId: member.id, groupId: here.id })
    expect(inputs.latestContributionAt).toBeNull()

    // ...and the same read against the group the message was actually in does
    // find it, so the null above is scoping rather than a broken query.
    const there = await loadEmailAskInputs({ userId: member.id, groupId: elsewhere.id })
    expect(there.latestContributionAt).not.toBeNull()
  })

  it("reports a verified email and does not count an unverified one", async () => {
    const member = await makeUser("Emailed")
    const group = await makeGroup("Emailed Group", member.id, [member.id])

    await prisma.contactMethod.create({
      data: {
        userId: member.id,
        type: "EMAIL",
        value: `unverified-${stamp}@example.com`,
        isVerified: false,
      },
    })
    const unverified = await loadEmailAskInputs({ userId: member.id, groupId: group.id })
    expect(unverified.hasVerifiedEmail).toBe(false)

    await prisma.contactMethod.create({
      data: {
        userId: member.id,
        type: "EMAIL",
        value: `verified-${stamp}@example.com`,
        isVerified: true,
      },
    })
    const verified = await loadEmailAskInputs({ userId: member.id, groupId: group.id })
    expect(verified.hasVerifiedEmail).toBe(true)
  })
})

describe("hasVerifiedEmail", () => {
  it("is false for a member with no email on file, and does not need a group", async () => {
    const member = await makeUser("Groupless")
    expect(await hasVerifiedEmail(member.id)).toBe(false)
  })

  it("is false for an unverified address and true once one is verified, the same rule loadEmailAskInputs applies", async () => {
    const member = await makeUser("SharedCheck")

    await prisma.contactMethod.create({
      data: {
        userId: member.id,
        type: "EMAIL",
        value: `shared-unverified-${stamp}@example.com`,
        isVerified: false,
      },
    })
    expect(await hasVerifiedEmail(member.id)).toBe(false)

    await prisma.contactMethod.create({
      data: {
        userId: member.id,
        type: "EMAIL",
        value: `shared-verified-${stamp}@example.com`,
        isVerified: true,
      },
    })
    expect(await hasVerifiedEmail(member.id)).toBe(true)
  })
})

describe("recordEmailOfferDismissed", () => {
  it("advances the count and stamps the moment, once per dismissal", async () => {
    const member = await makeUser("Dismisser")
    expect(member.emailAskCount).toBe(0)
    expect(member.emailAskedAt).toBeNull()

    const first = new Date("2026-08-26T17:00:00Z")
    await recordEmailOfferDismissed({ userId: member.id, now: first })

    const afterFirst = await prisma.user.findUniqueOrThrow({ where: { id: member.id } })
    expect(afterFirst.emailAskCount).toBe(1)
    expect(afterFirst.emailAskedAt?.getTime()).toBe(first.getTime())

    const second = new Date("2026-09-05T17:00:00Z")
    await recordEmailOfferDismissed({ userId: member.id, now: second })

    const afterSecond = await prisma.user.findUniqueOrThrow({ where: { id: member.id } })
    expect(afterSecond.emailAskCount).toBe(2)
    expect(afterSecond.emailAskedAt?.getTime()).toBe(second.getTime())
  })
})
