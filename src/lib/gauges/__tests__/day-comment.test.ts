// src/lib/gauges/__tests__/day-comment.test.ts
//
// Integration tests for recordDayComment; hits the real dev-test DB.
// Cleanup order matches gauges.test.ts: deleting the source message cascades
// the gauge and its votes; then messages, memberships, group, users.

import { describe, it, expect, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { GaugeAnswer, MessageAuthor } from "@prisma/client"
import { createGauge } from "../create"
import { recordDayComment } from "../day-comment"

const AUTH_ID = `test-daycomment-${Date.now()}`
const AUTH_ID_2 = `test-daycomment-2-${Date.now()}`

let userId: string
let userId2: string
let groupId: string
const messageIds: string[] = []

async function ensureGroup() {
  if (groupId) return
  const user = await prisma.user.create({
    data: { name: "[TEST] DayComment Jesse", supabaseAuthId: AUTH_ID },
  })
  userId = user.id
  const user2 = await prisma.user.create({
    data: { name: "[TEST] DayComment Maya", supabaseAuthId: AUTH_ID_2 },
  })
  userId2 = user2.id
  const group = await prisma.group.create({
    data: {
      name: "[TEST] DayComment Group",
      founderId: user.id,
      timeZone: "UTC",
      memberships: { create: [{ userId: user.id }, { userId: user2.id }] },
    },
  })
  groupId = group.id
}

async function memberMessage(body: string, authorId: string): Promise<string> {
  await ensureGroup()
  const m = await prisma.message.create({
    data: { groupId, authorType: MessageAuthor.MEMBER, authorId, body },
  })
  messageIds.push(m.id)
  return m.id
}

async function liveGauge(): Promise<string> {
  const src = await memberMessage("beers saturday anyone?", userId)
  const res = await createGauge({
    groupId,
    sourceMessageId: src,
    activity: "beers",
    proposedDate: new Date("2099-08-15T00:00:00Z"),
    proposedTime: "20:00",
    body: "Love it. Anyone in for beers this Saturday?",
  })
  if (res.status !== "created") throw new Error("fixture gauge not created")
  return res.gauge.id
}

afterAll(async () => {
  for (const id of messageIds) {
    await prisma.message.delete({ where: { id } }).catch(() => {})
  }
  if (groupId) {
    await prisma.event.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.message.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.membership.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.group.delete({ where: { id: groupId } }).catch(() => {})
  }
  for (const id of [userId, userId2]) {
    if (id) await prisma.user.delete({ where: { id } }).catch(() => {})
  }
  await prisma.$disconnect()
})

describe("recordDayComment", () => {
  it("writes vote, suggestion, and reply in one transaction", async () => {
    const gaugeId = await liveGauge()
    const commentId = await memberMessage("Sunday works better", userId2)

    await recordDayComment({
      groupId,
      gaugeId,
      userId: userId2,
      messageId: commentId,
      dayOfWeek: 0,
      suggestedTime: null,
      keepIn: false,
      replyBody: "Got it, Saturday doesn't work for you. Sunday's noted in case this one doesn't come together.",
    })

    const gauge = await prisma.gauge.findUnique({
      where: { id: gaugeId },
      include: { votes: true },
    })
    expect(gauge?.suggestedDayOfWeek).toBe(0)
    expect(gauge?.suggestedTime).toBeNull()
    expect(gauge?.suggestedByUserId).toBe(userId2)
    expect(gauge?.suggestedMessageId).toBe(commentId)
    const vote = gauge?.votes.find((v) => v.userId === userId2)
    expect(vote?.answer).toBe(GaugeAnswer.NOT_THAT_DAY)

    const reply = await prisma.message.findFirst({
      where: { groupId, authorType: MessageAuthor.ORBIT, body: { contains: "Sunday's noted" } },
    })
    expect(reply).not.toBeNull()
  })

  it("keepIn leaves an explicit IN untouched while still recording the day", async () => {
    const gaugeId = await liveGauge()
    await prisma.gaugeVote.create({
      data: { gaugeId, userId: userId2, answer: GaugeAnswer.IN },
    })
    const commentId = await memberMessage("sunday would be even better", userId2)

    await recordDayComment({
      groupId,
      gaugeId,
      userId: userId2,
      messageId: commentId,
      dayOfWeek: 0,
      suggestedTime: null,
      keepIn: true,
      replyBody: "You're still in for Saturday, and Sunday's noted if it doesn't come together.",
    })

    const vote = await prisma.gaugeVote.findUnique({
      where: { gaugeId_userId: { gaugeId, userId: userId2 } },
    })
    expect(vote?.answer).toBe(GaugeAnswer.IN)
    const gauge = await prisma.gauge.findUnique({ where: { id: gaugeId } })
    expect(gauge?.suggestedDayOfWeek).toBe(0)
  })

  it("latest comment overwrites the whole suggestion group", async () => {
    const gaugeId = await liveGauge()
    const first = await memberMessage("Sunday works better", userId)
    await recordDayComment({
      groupId, gaugeId, userId, messageId: first,
      dayOfWeek: 0, suggestedTime: "18:00", keepIn: false,
      replyBody: "Got it, Saturday doesn't work for you. Sunday's noted in case this one doesn't come together.",
    })
    const second = await memberMessage("thursday actually", userId2)
    await recordDayComment({
      groupId, gaugeId, userId: userId2, messageId: second,
      dayOfWeek: 4, suggestedTime: null, keepIn: false,
      replyBody: "Got it, Saturday doesn't work for you. Thursday's noted in case this one doesn't come together.",
    })

    const gauge = await prisma.gauge.findUnique({ where: { id: gaugeId } })
    expect(gauge?.suggestedDayOfWeek).toBe(4)
    expect(gauge?.suggestedTime).toBeNull()
    expect(gauge?.suggestedByUserId).toBe(userId2)
    expect(gauge?.suggestedMessageId).toBe(second)
  })

  it("rolls back the vote and the suggestion when the reply write fails", async () => {
    // Proves the write is one real transaction rather than three sequential
    // writes that happen to succeed. A bad gaugeId would make the FIRST
    // statement (the vote upsert) fail on its own foreign key, which would
    // pass even without a transaction (nothing gets far enough to write
    // partially). Instead this forces the LAST statement, Orbit's reply, to
    // fail (an invalid groupId violates Message's foreign key) after the
    // vote and the gauge's suggestion fields would already have succeeded.
    // If those survive, the vote and the reply were never one transaction.
    const gaugeId = await liveGauge()
    const commentId = await memberMessage("Sunday works better", userId2)
    const orbitCountBefore = await prisma.message.count({
      where: { groupId, authorType: MessageAuthor.ORBIT },
    })

    await expect(
      recordDayComment({
        groupId: "no-such-group-id",
        gaugeId,
        userId: userId2,
        messageId: commentId,
        dayOfWeek: 0,
        suggestedTime: null,
        keepIn: false,
        replyBody: "This reply must never land: rollback probe.",
      })
    ).rejects.toThrow()

    const vote = await prisma.gaugeVote.findUnique({
      where: { gaugeId_userId: { gaugeId, userId: userId2 } },
    })
    expect(vote).toBeNull()

    const gauge = await prisma.gauge.findUnique({ where: { id: gaugeId } })
    expect(gauge?.suggestedDayOfWeek).toBeNull()
    expect(gauge?.suggestedByUserId).toBeNull()

    // The failing write used a bad groupId, so a leaked reply could only ever
    // land against the real groupId if some earlier step in the transaction
    // committed independently; count instead of body-matching so an
    // unrelated Orbit message from another test in this file (same group)
    // can never produce a false pass.
    expect(
      await prisma.message.count({ where: { groupId, authorType: MessageAuthor.ORBIT } })
    ).toBe(orbitCountBefore)
  })
})
