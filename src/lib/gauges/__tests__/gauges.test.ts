// src/lib/gauges/__tests__/gauges.test.ts
//
// Integration tests for the gauge data layer — hits the real dev-test DB.
//
// Cleanup order (FK constraints):
//   GaugeVote (cascades from Gauge) → Gauge (cascades from Message) →
//   Message (groupId) → Membership (groupId) → Group (founderId) → User

import { describe, it, expect, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { MessageAuthor } from "@prisma/client"
import { createGauge } from "../create"
import { castVote } from "../vote"
import { findLiveGauges } from "../read"

const AUTH_ID = `test-gauges-${Date.now()}`
const AUTH_ID_2 = `test-gauges-2-${Date.now()}`

let userId: string
let userId2: string
let groupId: string
const messageIds: string[] = []

async function ensureGroup() {
  if (groupId) return
  const user = await prisma.user.create({
    data: { name: "[TEST] Gauge Jesse", supabaseAuthId: AUTH_ID },
  })
  userId = user.id
  const user2 = await prisma.user.create({
    data: { name: "[TEST] Gauge Maya", supabaseAuthId: AUTH_ID_2 },
  })
  userId2 = user2.id
  const group = await prisma.group.create({
    data: {
      name: "[TEST] Gauge Group",
      founderId: user.id,
      timeZone: "UTC",
      memberships: { create: [{ userId: user.id }, { userId: user2.id }] },
    },
  })
  groupId = group.id
}

/** A member message to spark off, tracked for cleanup. */
async function sourceMessage(body: string): Promise<string> {
  await ensureGroup()
  const m = await prisma.message.create({
    data: { groupId, authorType: MessageAuthor.MEMBER, authorId: userId, body },
  })
  messageIds.push(m.id)
  return m.id
}

afterAll(async () => {
  // Deleting the source message cascades its Gauge, which cascades its votes.
  // Orbit's message is deleted through the group sweep below.
  for (const id of messageIds) {
    await prisma.message.delete({ where: { id } }).catch(() => {})
  }
  if (groupId) {
    await prisma.message.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.membership.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.group.delete({ where: { id: groupId } }).catch(() => {})
  }
  for (const id of [userId, userId2]) {
    if (id) await prisma.user.delete({ where: { id } }).catch(() => {})
  }
  await prisma.$disconnect()
})

describe("createGauge", () => {
  it("writes Orbit's message and the gauge together", async () => {
    const src = await sourceMessage("we should finally grab beers")

    const result = await createGauge({
      groupId,
      sourceMessageId: src,
      activity: "beers",
      proposedDate: new Date("2026-07-24T00:00:00Z"),
      proposedTime: "19:00",
      body: "Love it. Anyone in for beers this Friday?",
    })

    expect(result.status).toBe("created")
    if (result.status !== "created") return

    const orbit = await prisma.message.findUnique({
      where: { id: result.gauge.orbitMessageId },
    })
    expect(orbit?.authorType).toBe(MessageAuthor.ORBIT)
    expect(orbit?.authorId).toBeNull()
    expect(orbit?.body).toBe("Love it. Anyone in for beers this Friday?")
    expect(result.gauge.activity).toBe("beers")
  })

  it("stores the time the event will start at", async () => {
    const src = await sourceMessage("beers Friday at 8pm")

    const result = await createGauge({
      groupId,
      sourceMessageId: src,
      activity: "beers",
      proposedDate: new Date("2026-07-24T00:00:00Z"),
      proposedTime: "20:00",
      body: "Love it. Anyone in for beers this Friday? If three of you are in, I'll set it up.",
    })
    if (result.status !== "created") throw new Error("fixture failed")

    expect(result.gauge.proposedTime).toBe("20:00")
  })

  it("skips a second gauge for the same message instead of erroring", async () => {
    const src = await sourceMessage("anyone up for tacos")

    const first = await createGauge({
      groupId,
      sourceMessageId: src,
      activity: "tacos",
      proposedDate: new Date("2026-07-24T00:00:00Z"),
      proposedTime: "19:00",
      body: "Love it. Anyone in for tacos this Friday?",
    })
    expect(first.status).toBe("created")

    const second = await createGauge({
      groupId,
      sourceMessageId: src,
      activity: "tacos",
      proposedDate: new Date("2026-07-24T00:00:00Z"),
      proposedTime: "19:00",
      body: "Love it. Anyone in for tacos this Friday?",
    })
    expect(second).toEqual({ status: "skipped", reason: "already_gauged" })

    const gauges = await prisma.gauge.findMany({ where: { sourceMessageId: src } })
    expect(gauges).toHaveLength(1)
  })

  it("leaves no orphan Orbit message when the gauge cannot be written", async () => {
    // The whole point of the transaction: a gauge can never exist without its
    // message, and a message never sits in the feed without its gauge.
    //
    // The source message id below does not exist, so Orbit's message writes
    // fine and the gauge's foreign key is what fails. Without the transaction
    // the message would survive and the feed would carry a question nothing
    // could answer.
    await ensureGroup()
    const orbitBefore = await prisma.message.count({
      where: { groupId, authorType: MessageAuthor.ORBIT },
    })

    await expect(
      createGauge({
        groupId,
        sourceMessageId: "no-such-message-id",
        activity: "beers",
        proposedDate: new Date("2026-07-24T00:00:00Z"),
        proposedTime: "19:00",
        body: "Love it. Anyone in for beers this Friday?",
      })
    ).rejects.toThrow()

    expect(
      await prisma.message.count({ where: { groupId, authorType: MessageAuthor.ORBIT } })
    ).toBe(orbitBefore)
  })
})

describe("castVote", () => {
  async function liveGauge(activity: string) {
    const src = await sourceMessage(`we should ${activity}`)
    const result = await createGauge({
      groupId,
      sourceMessageId: src,
      activity,
      proposedDate: new Date("2026-07-24T00:00:00Z"),
      proposedTime: "19:00",
      body: `Love it. Anyone in for ${activity} this Friday?`,
    })
    if (result.status !== "created") throw new Error("fixture failed")
    return result.gauge.id
  }

  it("records one answer per person", async () => {
    const gaugeId = await liveGauge("bowling")

    await castVote({ supabaseAuthId: AUTH_ID, gaugeId, answer: "IN" })
    await castVote({ supabaseAuthId: AUTH_ID_2, gaugeId, answer: "NOT_THAT_DAY" })

    const votes = await prisma.gaugeVote.findMany({ where: { gaugeId } })
    expect(votes).toHaveLength(2)
  })

  it("changes an answer rather than adding a second one", async () => {
    const gaugeId = await liveGauge("karaoke")

    await castVote({ supabaseAuthId: AUTH_ID, gaugeId, answer: "IN" })
    await castVote({ supabaseAuthId: AUTH_ID, gaugeId, answer: "OUT" })

    const votes = await prisma.gaugeVote.findMany({ where: { gaugeId } })
    expect(votes).toHaveLength(1)
    expect(votes[0].answer).toBe("OUT")
  })

  it("refuses a vote from a session with no user behind it", async () => {
    const gaugeId = await liveGauge("mini golf")
    await expect(
      castVote({ supabaseAuthId: "no-such-auth-id", gaugeId, answer: "IN" })
    ).rejects.toThrow("NO_USER")
  })
})

describe("findLiveGauges", () => {
  it("returns only gauges whose day has not passed, with their votes and voters", async () => {
    await ensureGroup()

    // A fresh group so this test sees only its own rows.
    const isolated = await prisma.group.create({
      data: {
        name: "[TEST] Gauge Live Group",
        founderId: userId,
        timeZone: "UTC",
        memberships: { create: { userId } },
      },
    })

    try {
      const make = async (activity: string, proposedDate: string) => {
        const m = await prisma.message.create({
          data: {
            groupId: isolated.id,
            authorType: MessageAuthor.MEMBER,
            authorId: userId,
            body: `we should ${activity}`,
          },
        })
        const r = await createGauge({
          groupId: isolated.id,
          sourceMessageId: m.id,
          activity,
          proposedDate: new Date(proposedDate),
          proposedTime: "19:00",
          body: `Love it. Anyone in for ${activity}?`,
        })
        if (r.status !== "created") throw new Error("fixture failed")
        return r.gauge.id
      }

      const upcoming = await make("beers", "2026-07-24T00:00:00Z")
      await make("brunch", "2026-07-23T00:00:00Z") // yesterday, day already over
      await make("hiking", "2026-07-20T00:00:00Z") // long past

      await castVote({ supabaseAuthId: AUTH_ID, gaugeId: upcoming, answer: "IN" })

      const live = await findLiveGauges(isolated.id, new Date("2026-07-24T18:00:00Z"))

      expect(live.map((g) => g.activity)).toEqual(["beers"])
      expect(live[0].votes).toHaveLength(1)
      expect(live[0].votes[0].user.name).toBe("[TEST] Gauge Jesse")
    } finally {
      await prisma.message.deleteMany({ where: { groupId: isolated.id } }).catch(() => {})
      await prisma.membership.deleteMany({ where: { groupId: isolated.id } }).catch(() => {})
      await prisma.group.delete({ where: { id: isolated.id } }).catch(() => {})
    }
  })
})

describe("createGauge and the person who floated the idea", () => {
  it("counts them when they named the day themselves", async () => {
    // Their message already is a yes to that day; asking them to tap a chip
    // confirming the day they just proposed is asking twice.
    const src = await sourceMessage("beers on Friday?")

    const result = await createGauge({
      groupId,
      sourceMessageId: src,
      activity: "beers",
      proposedDate: new Date("2026-07-24T00:00:00Z"),
      proposedTime: "19:00",
      body: "Love it. Anyone in for beers this Friday?",
      initiatorUserId: userId,
    })
    if (result.status !== "created") throw new Error("fixture failed")

    const votes = await prisma.gaugeVote.findMany({ where: { gaugeId: result.gauge.id } })
    expect(votes).toHaveLength(1)
    expect(votes[0].userId).toBe(userId)
    expect(votes[0].answer).toBe("IN")
  })

  it("starts at zero when Orbit picked the day", async () => {
    // Floating an idea is not a yes to a day Orbit chose afterward.
    const src = await sourceMessage("we should grab dinner sometime")

    const result = await createGauge({
      groupId,
      sourceMessageId: src,
      activity: "dinner",
      proposedDate: new Date("2026-07-24T00:00:00Z"),
      proposedTime: "19:00",
      body: "Love it. Anyone in for dinner this Friday?",
    })
    if (result.status !== "created") throw new Error("fixture failed")

    expect(await prisma.gaugeVote.count({ where: { gaugeId: result.gauge.id } })).toBe(0)
  })
})
