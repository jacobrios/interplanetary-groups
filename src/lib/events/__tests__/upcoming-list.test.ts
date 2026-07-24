// src/lib/events/__tests__/upcoming-list.test.ts
//
// The cron guard must count only the events Orbit's schedule created. A
// sparked event sitting in the future is not evidence that the standing
// rhythm has been scheduled, and treating it as such delays the group's
// actual recurring event by days.

import { describe, it, expect, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
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

afterAll(async () => {
  if (groupId) {
    await prisma.event.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.group.delete({ where: { id: groupId } }).catch(() => {})
  }
  if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {})
  await prisma.$disconnect()
})

describe("hasUpcomingScheduledEvent", () => {
  it("is false when the only upcoming event was sparked", async () => {
    await ensureGroup()
    await prisma.event.deleteMany({ where: { groupId } })

    // A sparked event has no scheduledKey. Before this function existed, the
    // cron's any-upcoming-event guard saw this row and skipped the group,
    // silently withholding the standing rhythm's next occurrence.
    await prisma.event.create({
      data: { groupId, title: "Beers", startsAt: new Date("2026-07-31T19:00:00Z") },
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
})

describe("findUpcomingEvents", () => {
  it("returns upcoming events soonest first, with venues, whatever created them", async () => {
    await ensureGroup()
    await prisma.event.deleteMany({ where: { groupId } })

    await prisma.event.create({
      data: { groupId, title: "Beers", startsAt: new Date("2026-07-31T19:00:00Z") },
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
