// src/lib/gauges/__tests__/promote.test.ts
//
// The moment the product exists for: three yeses become a real event, and the
// people who already said yes are already on it.

import { describe, it, expect, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { GaugeAnswer, MessageAuthor } from "@prisma/client"
import { createGauge, createRetryGuessGauge } from "../create"
import { promoteGaugeToEvent } from "../promote"
import { sparkStartInstant } from "@/lib/orbit/spark-copy"

const AUTH = [0, 1, 2, 3].map((n) => `test-promote-${n}-${Date.now()}`)
const userIds: string[] = []
let groupId: string

const NOW = new Date("2026-07-22T12:00:00Z")          // Wednesday
const FRIDAY = new Date("2026-07-24T00:00:00Z")        // group-local midnight

async function ensureGroup(recurringActivities?: unknown) {
  if (groupId) return
  for (const [i, authId] of AUTH.entries()) {
    const u = await prisma.user.create({
      data: { name: `[TEST] Promote ${i}`, supabaseAuthId: authId },
    })
    userIds.push(u.id)
  }
  const group = await prisma.group.create({
    data: {
      name: "[TEST] Promote Group",
      founderId: userIds[0],
      timeZone: "UTC",
      recurringActivities: (recurringActivities ?? null) as never,
      memberships: { create: userIds.map((userId) => ({ userId })) },
    },
  })
  groupId = group.id
}

/** A fresh gauge with the given answers already on it. */
async function gaugeWith(
  activity: string,
  answers: GaugeAnswer[],
  proposedTime = "19:00"
): Promise<string> {
  await ensureGroup()
  const msg = await prisma.message.create({
    data: { groupId, authorType: MessageAuthor.MEMBER, authorId: userIds[0], body: `we should ${activity}` },
  })
  const r = await createGauge({
    groupId,
    sourceMessageId: msg.id,
    activity,
    proposedDate: FRIDAY,
    proposedTime,
    body: `Love it. Anyone in for ${activity} this Friday? If three of you are in, I'll set it up.`,
  })
  if (r.status !== "created") throw new Error("fixture failed")
  for (const [i, answer] of answers.entries()) {
    await prisma.gaugeVote.create({
      data: { gaugeId: r.gauge.id, userId: userIds[i], answer },
    })
  }
  return r.gauge.id
}

afterAll(async () => {
  if (groupId) {
    await prisma.event.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.message.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.membership.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.group.delete({ where: { id: groupId } }).catch(() => {})
  }
  for (const id of userIds) {
    await prisma.user.delete({ where: { id } }).catch(() => {})
  }
  await prisma.$disconnect()
})

describe("promoteGaugeToEvent", () => {
  it("creates nothing below the bar", async () => {
    const gaugeId = await gaugeWith("bowling", ["IN", "IN"])
    expect(await promoteGaugeToEvent(gaugeId, NOW)).toEqual({
      status: "skipped",
      reason: "below_threshold",
    })
    expect(await prisma.event.count({ where: { gaugeId } })).toBe(0)
  })

  it("does not let a different-day answer reach the bar", async () => {
    const gaugeId = await gaugeWith("darts", ["IN", "IN", "NOT_THAT_DAY"])
    expect((await promoteGaugeToEvent(gaugeId, NOW)).status).toBe("skipped")
  })

  it("creates the event at the third yes, at the stored day and time", async () => {
    const gaugeId = await gaugeWith("beers", ["IN", "IN", "IN"], "20:00")

    const result = await promoteGaugeToEvent(gaugeId, NOW)
    expect(result.status).toBe("created")

    const event = await prisma.event.findFirst({ where: { gaugeId } })
    expect(event).not.toBeNull()
    expect(event!.startsAt.toISOString()).toBe("2026-07-24T20:00:00.000Z")
    expect(event!.endsAt).toBeNull()   // nothing knows how long beers lasts
    expect(event!.title).toBe("Beers")
    expect(event!.activityLabel).toBe("beers")
    expect(event!.scheduledKey).toBeNull()  // the cron must not see this as its own
  })

  it("title-cases every word of a multi-word activity, not just the first letter", async () => {
    const gaugeId = await gaugeWith("board games", ["IN", "IN", "IN"])

    const result = await promoteGaugeToEvent(gaugeId, NOW)
    expect(result.status).toBe("created")

    const event = await prisma.event.findFirst({ where: { gaugeId } })
    expect(event!.title).toBe("Board Games")
  })

  it("seeds the gauge answers as RSVPs, so nobody is asked twice", async () => {
    const gaugeId = await gaugeWith("tacos", ["IN", "IN", "IN", "OUT"])
    await promoteGaugeToEvent(gaugeId, NOW)

    const event = await prisma.event.findFirst({ where: { gaugeId } })
    const rsvps = await prisma.rsvp.findMany({ where: { eventId: event!.id } })

    expect(rsvps).toHaveLength(4)
    expect(rsvps.filter((r) => r.status === "IN")).toHaveLength(3)
    expect(rsvps.filter((r) => r.status === "OUT")).toHaveLength(1)
  })

  it("seeds a can't-that-day answer as out, because it is out for this day", async () => {
    const gaugeId = await gaugeWith("karaoke", ["IN", "IN", "IN", "NOT_THAT_DAY"])
    await promoteGaugeToEvent(gaugeId, NOW)

    const event = await prisma.event.findFirst({ where: { gaugeId } })
    const seeded = await prisma.rsvp.findFirst({
      where: { eventId: event!.id, userId: userIds[3] },
    })
    expect(seeded!.status).toBe("OUT")
  })

  it("announces the event in the feed, naming the time out loud", async () => {
    const gaugeId = await gaugeWith("pool", ["IN", "IN", "IN"])
    await promoteGaugeToEvent(gaugeId, NOW)

    const messages = await prisma.message.findMany({
      where: { groupId, authorType: MessageAuthor.ORBIT },
      orderBy: { createdAt: "desc" },
      take: 1,
    })
    expect(messages[0].body).toContain("pool is on for Fri at 7pm")
    expect(messages[0].authorId).toBeNull()
  })

  it("creates one event however many times the third yes fires", async () => {
    const gaugeId = await gaugeWith("chess", ["IN", "IN", "IN"])

    const [a, b] = await Promise.all([
      promoteGaugeToEvent(gaugeId, NOW),
      promoteGaugeToEvent(gaugeId, NOW),
    ])

    const created = [a, b].filter((r) => r.status === "created")
    expect(created).toHaveLength(1)
    expect(await prisma.event.count({ where: { gaugeId } })).toBe(1)
  })

  it("creates nothing once the proposed start has already passed", async () => {
    // A gauge stays live until the end of its day, so the third yes can land
    // at 9pm on a 7pm proposal. A card announcing the past is noise.
    const gaugeId = await gaugeWith("bingo", ["IN", "IN", "IN"])
    const late = new Date("2026-07-24T21:00:00Z")

    expect(await promoteGaugeToEvent(gaugeId, late)).toEqual({
      status: "skipped",
      reason: "start_passed",
    })
    expect(await prisma.event.count({ where: { gaugeId } })).toBe(0)
  })

  it("leaves no orphan announcement when the event cannot be written", async () => {
    const gaugeId = await gaugeWith("squash", ["IN", "IN", "IN"])
    const before = await prisma.message.count({ where: { groupId, authorType: MessageAuthor.ORBIT } })

    // Force the write to fail after the transaction has begun: an event
    // already occupies this gauge's unique link.
    await prisma.event.create({
      data: { groupId, title: "Squatter", startsAt: new Date("2026-08-09T19:00:00Z"), gaugeId },
    })

    const result = await promoteGaugeToEvent(gaugeId, NOW)
    expect(result).toEqual({ status: "skipped", reason: "already_created" })
    expect(
      await prisma.message.count({ where: { groupId, authorType: MessageAuthor.ORBIT } })
    ).toBe(before)
  })

  it("reports a gauge that is gone rather than throwing", async () => {
    expect(await promoteGaugeToEvent("no-such-gauge-id", NOW)).toEqual({
      status: "skipped",
      reason: "no_gauge",
    })
  })

  it("does not count a non-member's yes toward the bar", async () => {
    const gaugeId = await gaugeWith("kayaking", [GaugeAnswer.IN, GaugeAnswer.IN])
    const outsider = await prisma.user.create({
      data: { name: "[TEST] Promote Outsider", supabaseAuthId: `test-promote-out-${Date.now()}` },
    })
    userIds.push(outsider.id) // registered for afterAll cleanup only; not a member
    await prisma.gaugeVote.create({
      data: { gaugeId, userId: outsider.id, answer: GaugeAnswer.IN },
    })

    const result = await promoteGaugeToEvent(gaugeId, NOW)
    expect(result).toEqual({ status: "skipped", reason: "below_threshold" })
  })

  it("seeds RSVPs for members only when a stray non-member vote exists", async () => {
    const gaugeId = await gaugeWith("bowling", [GaugeAnswer.IN, GaugeAnswer.IN, GaugeAnswer.IN])
    const outsider = await prisma.user.create({
      data: { name: "[TEST] Promote Outsider 2", supabaseAuthId: `test-promote-out2-${Date.now()}` },
    })
    userIds.push(outsider.id)
    await prisma.gaugeVote.create({
      data: { gaugeId, userId: outsider.id, answer: GaugeAnswer.IN },
    })

    const result = await promoteGaugeToEvent(gaugeId, NOW)
    expect(result.status).toBe("created")
    if (result.status !== "created") return
    const rsvps = await prisma.rsvp.findMany({ where: { eventId: result.eventId } })
    expect(rsvps).toHaveLength(3)
    expect(rsvps.some((r) => r.userId === outsider.id)).toBe(false)
  })
})

describe("promoteGaugeToEvent, venue inheritance", () => {
  it("pencils in the group's standing spot for that activity", async () => {
    // The payoff the venue-capture slice was sequenced ahead of spark for:
    // "beers at Lucky Lab" told us where this group drinks.
    const user = await prisma.user.create({
      data: { name: "[TEST] Venue Inherit", supabaseAuthId: `test-venue-inherit-${Date.now()}` },
    })
    const group = await prisma.group.create({
      data: {
        name: "[TEST] Venue Inherit Group",
        founderId: user.id,
        timeZone: "UTC",
        recurringActivities: [
          { activity: "climbing", title: "Climbing Sunday", cadence: "weekly", daysOfWeek: [0], timeLocal: "08:00", venueName: "Summit Gym" },
          { activity: "beers", title: "Beers", cadence: null, daysOfWeek: null, timeLocal: null, venueName: "Lucky Lab" },
        ] as never,
        memberships: { create: { userId: user.id } },
      },
    })

    // Declared out here so the finally can always reach them: cleanup that
    // lives in the try only runs when the assertions pass, which is exactly
    // when cleanup matters least. Two failing runs during the share-readiness
    // slice left four orphaned users behind in dev-test that way.
    const extras: { id: string }[] = []

    try {
      const msg = await prisma.message.create({
        data: { groupId: group.id, authorType: MessageAuthor.MEMBER, authorId: user.id, body: "beers?" },
      })
      const r = await createGauge({
        groupId: group.id,
        sourceMessageId: msg.id,
        activity: "Beers",   // different case on purpose
        proposedDate: FRIDAY,
        proposedTime: "19:00",
        body: "Love it. Anyone in for beers this Friday? If three of you are in, I'll set it up.",
      })
      if (r.status !== "created") throw new Error("fixture failed")

      // Three yeses from one fixture user is impossible, so vote rows are
      // written directly with distinct ids.
      extras.push(
        ...(await Promise.all(
          [1, 2].map((n) =>
            prisma.user.create({
              data: { name: `[TEST] Venue Extra ${n}`, supabaseAuthId: `test-venue-extra-${n}-${Date.now()}` },
            })
          )
        ))
      )
      await prisma.membership.createMany({
        data: extras.map((u) => ({ groupId: group.id, userId: u.id })),
      })
      for (const u of [user, ...extras]) {
        await prisma.gaugeVote.create({
          data: { gaugeId: r.gauge.id, userId: u.id, answer: GaugeAnswer.IN },
        })
      }

      await promoteGaugeToEvent(r.gauge.id, NOW)

      const event = await prisma.event.findFirst({
        where: { gaugeId: r.gauge.id },
        include: { venues: true },
      })
      expect(event!.venues[0]?.name).toBe("Lucky Lab")

      await prisma.event.deleteMany({ where: { groupId: group.id } })
    } finally {
      await prisma.event.deleteMany({ where: { groupId: group.id } }).catch(() => {})
      await prisma.message.deleteMany({ where: { groupId: group.id } }).catch(() => {})
      await prisma.membership.deleteMany({ where: { groupId: group.id } }).catch(() => {})
      await prisma.group.delete({ where: { id: group.id } }).catch(() => {})
      await prisma.user.delete({ where: { id: user.id } }).catch(() => {})
      for (const u of extras) await prisma.user.delete({ where: { id: u.id } }).catch(() => {})
    }
  })

  it("creates the event with no venue when nothing matches", async () => {
    const gaugeId = await gaugeWith("laser tag", ["IN", "IN", "IN"])
    await promoteGaugeToEvent(gaugeId, NOW)

    const event = await prisma.event.findFirst({
      where: { gaugeId },
      include: { venues: true },
    })
    // Venue never gates anything: a miss is an event without a penciled-in
    // spot, never a failure to create.
    expect(event!.venues).toEqual([])
  })
})

describe("promoteGaugeToEvent, retry guess time carry", () => {
  const GUESS_DATE = new Date("2026-07-31T00:00:00Z") // a Friday, 9 days after NOW

  it("carries the original idea's time through a retry guess into promotion", async () => {
    // fixture: an original-style gauge, then Orbit's retry guess on it
    const src = await prisma.message.create({
      data: {
        groupId,
        authorType: MessageAuthor.MEMBER,
        authorId: userIds[0],
        body: "we should grab beers",
      },
    })
    const original = await createGauge({
      groupId,
      sourceMessageId: src.id,
      activity: "beers",
      proposedDate: FRIDAY,
      proposedTime: "20:00",
      body: "Love it. Anyone in for beers this Friday? If three of you are in, I'll set it up.",
    })
    if (original.status !== "created") throw new Error("fixture failed")

    const guess = await createRetryGuessGauge({
      groupId,
      originGaugeId: original.gauge.id,
      activity: "beers",
      proposedDate: GUESS_DATE,
      proposedTime: "20:00",
      body: "No takers on a new day yet, so how about beers next Friday?",
    })
    if (guess.status !== "created") throw new Error("fixture failed")
    const guessGauge = guess.gauge

    // add three IN votes via the file's existing vote helper
    for (const userId of userIds.slice(0, 3)) {
      await prisma.gaugeVote.create({
        data: { gaugeId: guessGauge.id, userId, answer: GaugeAnswer.IN },
      })
    }

    const result = await promoteGaugeToEvent(guessGauge.id, NOW)
    expect(result.status).toBe("created")
    if (result.status !== "created") return
    const event = await prisma.event.findUnique({ where: { id: result.eventId } })
    // sparkStartInstant(proposedDate, "20:00", zone): the original idea's 8pm
    // survived the retry without promote.ts changing at all.
    expect(event?.startsAt).toEqual(sparkStartInstant(GUESS_DATE, "20:00", "UTC"))
  })
})
