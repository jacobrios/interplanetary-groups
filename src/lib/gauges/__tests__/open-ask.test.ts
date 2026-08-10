// src/lib/gauges/__tests__/open-ask.test.ts
//
// Integration tests for findOpenRetryAsk — hits the real dev-test DB.
//
// Each test gets its own isolated group so "no asked gauge" and "newest
// wins" can assert on an exact, uncontaminated set of gauges. NOW is a fixed
// anchor rather than the real clock so cutoff-adjacent cases (the 48h safety
// cap) are deterministic.
//
// Cleanup order (FK constraints), per group:
//   Message (groupId) — cascades Gauge (via orbitMessageId) and GaugeVote —
//   → Membership (groupId) → Group. One shared founder User cleans up last.

import { describe, it, expect, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { MessageAuthor } from "@prisma/client"
import { findOpenRetryAsk } from "../open-ask"

const NOW = new Date("2026-08-05T18:00:00Z")
const AUTH_ID = `test-open-ask-${Date.now()}`

let userId: string
const groupIds: string[] = []

async function ensureUser() {
  if (userId) return
  const user = await prisma.user.create({
    data: { name: "[TEST] Open-Ask Jesse", supabaseAuthId: AUTH_ID },
  })
  userId = user.id
}

async function makeGroup(name: string): Promise<string> {
  await ensureUser()
  const group = await prisma.group.create({
    data: {
      name: `[TEST] Open Ask ${name}`,
      founderId: userId,
      timeZone: "UTC",
      memberships: { create: { userId } },
    },
  })
  groupIds.push(group.id)
  return group.id
}

/** A gauge that failed and got Orbit's close-and-ask attached. */
async function makeAskedGauge(opts: {
  groupId: string
  activity: string
  proposedDate: Date
  proposedTime?: string | null
  askCreatedAt: Date
}) {
  const sourceMsg = await prisma.message.create({
    data: {
      groupId: opts.groupId,
      authorType: MessageAuthor.MEMBER,
      authorId: userId,
      body: `we should ${opts.activity}`,
    },
  })
  const orbitMsg = await prisma.message.create({
    data: {
      groupId: opts.groupId,
      authorType: MessageAuthor.ORBIT,
      body: `Love it. Anyone in for ${opts.activity}?`,
    },
  })
  const gauge = await prisma.gauge.create({
    data: {
      groupId: opts.groupId,
      sourceMessageId: sourceMsg.id,
      orbitMessageId: orbitMsg.id,
      activity: opts.activity,
      proposedDate: opts.proposedDate,
      proposedTime: opts.proposedTime ?? "19:00",
    },
  })
  const askMsg = await prisma.message.create({
    data: {
      groupId: opts.groupId,
      authorType: MessageAuthor.ORBIT,
      body: `${opts.activity} didn't happen for that day, but a few of you want it. What day works better?`,
      createdAt: opts.askCreatedAt,
    },
  })
  return prisma.gauge.update({
    where: { id: gauge.id },
    data: { retryAskMessageId: askMsg.id },
  })
}

/**
 * A second gauge for the same (or a different) activity, created after the
 * ask. Its own createdAt — not its message's — is what findOpenRetryAsk
 * compares against the ask's createdAt, so it is set explicitly.
 */
async function makeAnsweringGauge(opts: {
  groupId: string
  activity: string
  createdAt: Date
  isGuess?: boolean
  originGaugeId?: string
}) {
  const orbitMsg = await prisma.message.create({
    data: {
      groupId: opts.groupId,
      authorType: MessageAuthor.ORBIT,
      body: `Anyone in for ${opts.activity}?`,
    },
  })
  const sourceMsg = opts.isGuess
    ? null
    : await prisma.message.create({
        data: {
          groupId: opts.groupId,
          authorType: MessageAuthor.MEMBER,
          authorId: userId,
          body: `${opts.activity} works for me`,
        },
      })
  return prisma.gauge.create({
    data: {
      groupId: opts.groupId,
      sourceMessageId: sourceMsg?.id ?? null,
      orbitMessageId: orbitMsg.id,
      activity: opts.activity,
      proposedDate: new Date("2026-08-08T00:00:00Z"),
      proposedTime: "19:00",
      createdAt: opts.createdAt,
      retryGuessOfGaugeId: opts.originGaugeId ?? null,
    },
  })
}

afterAll(async () => {
  for (const groupId of groupIds) {
    await prisma.message.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.membership.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.group.delete({ where: { id: groupId } }).catch(() => {})
  }
  if (userId) {
    await prisma.user.delete({ where: { id: userId } }).catch(() => {})
  }
  await prisma.$disconnect()
})

describe("findOpenRetryAsk", () => {
  it("returns null for a group with no asked gauge", async () => {
    const groupId = await makeGroup("None")

    const result = await findOpenRetryAsk(groupId, NOW)

    expect(result).toBeNull()
  })

  it("finds an asked gauge nothing has answered", async () => {
    const groupId = await makeGroup("Beers")
    const askCreatedAt = new Date(NOW.getTime() - 3 * 60 * 60 * 1000) // 3h ago
    const proposedDate = new Date("2026-08-04T00:00:00Z") // yesterday
    const gauge = await makeAskedGauge({
      groupId,
      activity: "beers",
      proposedDate,
      proposedTime: "19:00",
      askCreatedAt,
    })

    const result = await findOpenRetryAsk(groupId, NOW)

    expect(result).not.toBeNull()
    expect(result?.gaugeId).toBe(gauge.id)
    expect(result?.activity).toBe("beers")
    expect(result?.proposedDate.toISOString()).toBe(proposedDate.toISOString())
    expect(result?.proposedTime).toBe("19:00")
    expect(result?.askCreatedAt.toISOString()).toBe(askCreatedAt.toISOString())
  })

  it("a member-opened same-activity gauge after the ask closes the window", async () => {
    const groupId = await makeGroup("Bowling")
    const askCreatedAt = new Date(NOW.getTime() - 5 * 60 * 60 * 1000)
    await makeAskedGauge({
      groupId,
      activity: "bowling",
      proposedDate: new Date("2026-08-04T00:00:00Z"),
      askCreatedAt,
    })
    await makeAnsweringGauge({
      groupId,
      activity: "bowling",
      createdAt: new Date(askCreatedAt.getTime() + 60 * 60 * 1000), // 1h after the ask
    })

    const result = await findOpenRetryAsk(groupId, NOW)

    expect(result).toBeNull()
  })

  it("Orbit's own guess gauge closes the window too", async () => {
    // DELIBERATELY wider than handleGuess's answered-test, which excludes
    // guess gauges for its own race reasons: once the guess is posted, a day
    // reply is a comment on a live gauge (queued seam), not an answer to the
    // ask.
    const groupId = await makeGroup("Trivia")
    const askCreatedAt = new Date(NOW.getTime() - 5 * 60 * 60 * 1000)
    const asked = await makeAskedGauge({
      groupId,
      activity: "trivia",
      proposedDate: new Date("2026-08-04T00:00:00Z"),
      askCreatedAt,
    })
    await makeAnsweringGauge({
      groupId,
      activity: "trivia",
      createdAt: new Date(askCreatedAt.getTime() + 60 * 60 * 1000),
      isGuess: true,
      originGaugeId: asked.id,
    })

    const result = await findOpenRetryAsk(groupId, NOW)

    expect(result).toBeNull()
  })

  it("a different-activity gauge does not close the window", async () => {
    const groupId = await makeGroup("Hiking")
    const askCreatedAt = new Date(NOW.getTime() - 5 * 60 * 60 * 1000)
    const asked = await makeAskedGauge({
      groupId,
      activity: "hiking",
      proposedDate: new Date("2026-08-04T00:00:00Z"),
      askCreatedAt,
    })
    await makeAnsweringGauge({
      groupId,
      activity: "bowling",
      createdAt: new Date(askCreatedAt.getTime() + 60 * 60 * 1000),
    })

    const result = await findOpenRetryAsk(groupId, NOW)

    expect(result?.gaugeId).toBe(asked.id)
  })

  it("case-insensitive activity match", async () => {
    const groupId = await makeGroup("Kickball")
    const askCreatedAt = new Date(NOW.getTime() - 5 * 60 * 60 * 1000)
    await makeAskedGauge({
      groupId,
      activity: "kickball",
      proposedDate: new Date("2026-08-04T00:00:00Z"),
      askCreatedAt,
    })
    await makeAnsweringGauge({
      groupId,
      activity: "Kickball",
      createdAt: new Date(askCreatedAt.getTime() + 60 * 60 * 1000),
    })

    const result = await findOpenRetryAsk(groupId, NOW)

    expect(result).toBeNull()
  })

  it("an ask older than the safety cap is not open", async () => {
    const groupId = await makeGroup("Chess")
    const askCreatedAt = new Date(NOW.getTime() - 49 * 60 * 60 * 1000) // past the 48h cap
    await makeAskedGauge({
      groupId,
      activity: "chess",
      proposedDate: new Date("2026-08-03T00:00:00Z"),
      askCreatedAt,
    })

    const result = await findOpenRetryAsk(groupId, NOW)

    expect(result).toBeNull()
  })

  it("with two open asks, the newest wins", async () => {
    const groupId = await makeGroup("Newest")
    const olderAsk = new Date(NOW.getTime() - 10 * 60 * 60 * 1000)
    const newerAsk = new Date(NOW.getTime() - 2 * 60 * 60 * 1000)
    await makeAskedGauge({
      groupId,
      activity: "yoga",
      proposedDate: new Date("2026-08-04T00:00:00Z"),
      askCreatedAt: olderAsk,
    })
    const newer = await makeAskedGauge({
      groupId,
      activity: "darts",
      proposedDate: new Date("2026-08-04T00:00:00Z"),
      askCreatedAt: newerAsk,
    })

    const result = await findOpenRetryAsk(groupId, NOW)

    expect(result?.gaugeId).toBe(newer.id)
    expect(result?.activity).toBe("darts")
  })
})
