// src/lib/events/__tests__/upcoming-list.test.ts
//
// The cron guard must count only the events Orbit's schedule created. A
// sparked event sitting in the future is not evidence that the standing
// rhythm has been scheduled, and treating it as such delays the group's
// actual recurring event by days.

import { describe, it, expect, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { EventStatus, MessageAuthor } from "@prisma/client"
import { findUpcomingEvents, hasUpcomingScheduledEvent } from "../upcoming-list"

const AUTH_ID = `test-upcoming-list-${Date.now()}`
let userId: string
let groupId: string

const NOW = new Date("2026-07-24T12:00:00Z")

async function ensureGroup() {
  if (groupId) return
  const user = await prisma.user.create({
    data: { name: "[TEST] Upcoming List", supabaseAuthId: AUTH_ID },
  })
  userId = user.id
  const group = await prisma.group.create({
    data: { name: "[TEST] Upcoming List Group", founderId: user.id, timeZone: "UTC" },
  })
  groupId = group.id
}

/**
 * A real gauge, so a sparked event fixture can carry the gaugeId a real one
 * always has. The guard keys off that field's absence, so a fixture without it
 * is not a sparked event at all and would prove nothing.
 */
async function makeGaugeId(activity: string): Promise<string> {
  await ensureGroup()
  const src = await prisma.message.create({
    data: { groupId, authorType: MessageAuthor.MEMBER, authorId: userId, body: `we should ${activity}` },
  })
  const orbit = await prisma.message.create({
    data: { groupId, authorType: MessageAuthor.ORBIT, authorId: null, body: `Anyone in for ${activity}?` },
  })
  const gauge = await prisma.gauge.create({
    data: {
      groupId,
      sourceMessageId: src.id,
      orbitMessageId: orbit.id,
      activity,
      proposedDate: new Date("2026-07-31T00:00:00Z"),
      proposedTime: "19:00",
    },
  })
  return gauge.id
}

afterAll(async () => {
  if (groupId) {
    await prisma.event.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.message.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.group.delete({ where: { id: groupId } }).catch(() => {})
  }
  if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {})
  await prisma.$disconnect()
})

describe("hasUpcomingScheduledEvent", () => {
  it("is false when the only upcoming event was sparked", async () => {
    await ensureGroup()
    await prisma.event.deleteMany({ where: { groupId } })

    // A sparked event carries a gaugeId. Before this function existed, the
    // cron's any-upcoming-event guard saw this row and skipped the group,
    // silently withholding the standing rhythm's next occurrence.
    await prisma.event.create({
      data: {
        groupId,
        title: "Beers",
        startsAt: new Date("2026-07-31T19:00:00Z"),
        gaugeId: await makeGaugeId("beers"),
      },
    })

    expect(await hasUpcomingScheduledEvent(groupId, NOW)).toBe(false)
  })

  it("is true when the standing rhythm's occurrence is already there", async () => {
    await ensureGroup()
    await prisma.event.deleteMany({ where: { groupId } })
    await prisma.event.create({
      data: {
        groupId,
        title: "Climbing Sunday",
        startsAt: new Date("2026-07-26T15:00:00Z"),
        scheduledKey: `${groupId}:2026-07-26T15:00:00.000Z`,
      },
    })

    expect(await hasUpcomingScheduledEvent(groupId, NOW)).toBe(true)
  })

  it("counts an event written before this slice, which has neither key", async () => {
    // The regression that keying on scheduledKey would have caused: every
    // occurrence created before the migration has no scheduledKey, and treating
    // those as "not scheduled" would duplicate them on the first cron run.
    await ensureGroup()
    await prisma.event.deleteMany({ where: { groupId } })
    await prisma.event.create({
      data: { groupId, title: "Legacy Climbing Sunday", startsAt: new Date("2026-07-26T15:00:00Z") },
    })

    expect(await hasUpcomingScheduledEvent(groupId, NOW)).toBe(true)
  })

  it("ignores a scheduled event that has already happened", async () => {
    await ensureGroup()
    await prisma.event.deleteMany({ where: { groupId } })
    await prisma.event.create({
      data: {
        groupId,
        title: "Climbing Sunday",
        startsAt: new Date("2026-07-19T15:00:00Z"),
        scheduledKey: `${groupId}:2026-07-19T15:00:00.000Z`,
      },
    })

    expect(await hasUpcomingScheduledEvent(groupId, NOW)).toBe(false)
  })

  it("still sees a cancelled scheduled event, which is what makes it the tombstone", async () => {
    // Deliberately NOT filtered by status. If this guard ever learned about
    // CANCELLED, reconcile would see nothing upcoming, computeNextOccurrence
    // would return the same slot, and the hourly cron would recreate the
    // plan the group just called off, with a fresh announcement. The retained
    // row IS the record that this slot is spoken for.
    await ensureGroup()
    await prisma.event.deleteMany({ where: { groupId } })
    const event = await prisma.event.create({
      data: {
        groupId,
        title: "Climbing Sunday",
        startsAt: new Date("2026-07-26T15:00:00Z"),
        scheduledKey: `${groupId}:2026-07-26T15:00:00.000Z`,
      },
    })
    await prisma.event.update({
      where: { id: event.id },
      data: { status: EventStatus.CANCELLED, cancelledAt: new Date() },
    })

    expect(await hasUpcomingScheduledEvent(groupId, NOW)).toBe(true)
  })
})

describe("findUpcomingEvents", () => {
  it("returns upcoming events soonest first, with venues, whatever created them", async () => {
    await ensureGroup()
    await prisma.event.deleteMany({ where: { groupId } })

    await prisma.event.create({
      data: {
        groupId,
        title: "Beers",
        startsAt: new Date("2026-07-31T19:00:00Z"),
        gaugeId: await makeGaugeId("list beers"),
      },
    })
    await prisma.event.create({
      data: {
        groupId,
        title: "Climbing Sunday",
        startsAt: new Date("2026-07-26T15:00:00Z"),
        scheduledKey: `${groupId}:2026-07-26T15:00:00.000Z`,
      },
    })
    await prisma.event.create({
      data: { groupId, title: "Old thing", startsAt: new Date("2026-07-01T15:00:00Z") },
    })

    const events = await findUpcomingEvents(groupId, NOW, 5)
    expect(events.map((e) => e.title)).toEqual(["Climbing Sunday", "Beers"])
    expect(events[0].venues).toEqual([])
  })

  it("respects the limit", async () => {
    await ensureGroup()
    const events = await findUpcomingEvents(groupId, NOW, 1)
    expect(events).toHaveLength(1)
  })
})
