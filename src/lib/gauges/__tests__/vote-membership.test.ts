// src/lib/gauges/__tests__/vote-membership.test.ts
//
// A gauge vote is a real stake in the group's plan: the third IN creates the
// event. Before this guard, an outsider's IN genuinely counted toward that
// bar and could be the tap that created an event for a group they were never
// in. This proves castVote refuses them, and a member's own vote still lands.

import { describe, it, expect, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { GaugeAnswer, MessageAuthor } from "@prisma/client"
import { createGauge } from "../create"
import { castVote } from "../vote"

const founderAuthId = `test-vote-membership-founder-${Date.now()}`
const outsiderAuthId = `test-vote-membership-outsider-${Date.now()}`

let founderId: string
let outsiderId: string
let groupId: string

/** A live gauge, sparked by a MEMBER message from the founder. */
async function gaugeWith(activity: string): Promise<string> {
  const msg = await prisma.message.create({
    data: { groupId, authorType: MessageAuthor.MEMBER, authorId: founderId, body: `we should ${activity}` },
  })
  const r = await createGauge({
    groupId,
    sourceMessageId: msg.id,
    activity,
    proposedDate: new Date("2099-06-12T00:00:00Z"),
    proposedTime: "19:00",
    body: `Love it. Anyone in for ${activity} this Friday? If three of you are in, I'll set it up.`,
  })
  if (r.status !== "created") throw new Error("fixture failed")
  return r.gauge.id
}

afterAll(async () => {
  await prisma.gaugeVote.deleteMany({ where: { gauge: { groupId } } }).catch(() => {})
  await prisma.gauge.deleteMany({ where: { groupId } }).catch(() => {})
  await prisma.message.deleteMany({ where: { groupId } }).catch(() => {})
  await prisma.membership.deleteMany({ where: { groupId } }).catch(() => {})
  if (groupId) await prisma.group.delete({ where: { id: groupId } }).catch(() => {})
  for (const id of [founderId, outsiderId]) {
    if (id) await prisma.user.delete({ where: { id } }).catch(() => {})
  }
  await prisma.$disconnect()
})

describe("castVote, membership gate", () => {
  it("refuses an outsider's vote and still records a member's", async () => {
    const founder = await prisma.user.create({
      data: { name: "[TEST] Vote Membership Founder", supabaseAuthId: founderAuthId },
    })
    founderId = founder.id
    const outsider = await prisma.user.create({
      data: { name: "[TEST] Vote Membership Outsider", supabaseAuthId: outsiderAuthId },
    })
    outsiderId = outsider.id
    const group = await prisma.group.create({
      data: {
        name: "[TEST] Vote Membership Group",
        founderId: founder.id,
        timeZone: "UTC",
        memberships: { create: { userId: founder.id } },
      },
    })
    groupId = group.id

    const gaugeId = await gaugeWith("beers")

    await expect(
      castVote({ supabaseAuthId: outsiderAuthId, gaugeId, answer: GaugeAnswer.IN })
    ).rejects.toThrow("NOT_A_MEMBER")
    const votes = await prisma.gaugeVote.count({ where: { gaugeId } })
    expect(votes).toBe(0)

    // and a member's vote still writes
    const { vote } = await castVote({ supabaseAuthId: founderAuthId, gaugeId, answer: GaugeAnswer.IN })
    expect(vote.answer).toBe(GaugeAnswer.IN)
  })

  it("throws NO_GAUGE for a gauge that does not exist", async () => {
    await expect(
      castVote({ supabaseAuthId: founderAuthId, gaugeId: "no-such-gauge-id", answer: GaugeAnswer.IN })
    ).rejects.toThrow("NO_GAUGE")
  })
})
