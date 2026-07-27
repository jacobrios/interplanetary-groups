// src/lib/events/__tests__/upcoming.test.ts
//
// Integration tests — hits the real dev database.
// Tests the findSoonestUpcomingEvent query that backs the home-screen card.
import { describe, it, expect, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { findSoonestUpcomingEvent } from "../upcoming"

describe("findSoonestUpcomingEvent", () => {
  // Track created IDs for cleanup
  let userId: string
  let groupId: string
  const eventIds: string[] = []

  afterAll(async () => {
    for (const id of eventIds) {
      await prisma.event.delete({ where: { id } }).catch(() => {})
    }
    if (groupId) await prisma.group.delete({ where: { id: groupId } }).catch(() => {})
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {})
    await prisma.$disconnect()
  })

  it("returns the event with the soonest startsAt in the future", async () => {
    // Arrange: a group with two future events
    const user = await prisma.user.create({
      data: { name: "[TEST] Upcoming User", supabaseAuthId: `test-upcoming-${Date.now()}` },
    })
    userId = user.id

    const group = await prisma.group.create({
      data: {
        name: "[TEST] Upcoming Group",
        founderId: user.id,
        memberships: { create: { userId: user.id } },
      },
    })
    groupId = group.id

    // Both future dates are relative to the real clock, deliberately.
    //
    // findSoonestUpcomingEvent is the one date-sensitive function in this
    // codebase that reads `new Date()` internally rather than taking the time
    // as an argument, so a test of it cannot control the clock and must express
    // "in the future" the same way the query does. Hardcoded dates here are a
    // time bomb: the original "soon" was 2026-07-25, written on 25 June 2026,
    // and the test went red on 26 July 2026 when that date became the past. It
    // had been green for a month for no better reason than the calendar.
    const DAY_MS = 24 * 60 * 60 * 1000

    const far = await prisma.event.create({
      data: {
        groupId: group.id,
        title: "[TEST] Far Event",
        startsAt: new Date(Date.now() + 30 * DAY_MS),
      },
    })
    eventIds.push(far.id)

    const soon = await prisma.event.create({
      data: {
        groupId: group.id,
        title: "[TEST] Soon Event",
        startsAt: new Date(Date.now() + 1 * DAY_MS),
      },
    })
    eventIds.push(soon.id)

    // Act
    const result = await findSoonestUpcomingEvent(group.id)

    // Assert: should pick the soonest future event
    expect(result).not.toBeNull()
    expect(result!.id).toBe(soon.id)
  })

  it("returns null when the group has no upcoming events", async () => {
    // Use the same group but look for events in a far-future window it doesn't have
    // We'll create a new empty group for a clean test
    const emptyUser = await prisma.user.create({
      data: { name: "[TEST] Empty Group User", supabaseAuthId: `test-upcoming-empty-${Date.now()}` },
    })
    const emptyGroup = await prisma.group.create({
      data: { name: "[TEST] Empty Upcoming Group", founderId: emptyUser.id },
    })
    // Clean these up too
    const result = await findSoonestUpcomingEvent(emptyGroup.id)
    await prisma.group.delete({ where: { id: emptyGroup.id } }).catch(() => {})
    await prisma.user.delete({ where: { id: emptyUser.id } }).catch(() => {})

    expect(result).toBeNull()
  })

  it("excludes past events", async () => {
    // Create a group that only has past events
    const pastUser = await prisma.user.create({
      data: { name: "[TEST] Past Events User", supabaseAuthId: `test-upcoming-past-${Date.now()}` },
    })
    const pastGroup = await prisma.group.create({
      data: { name: "[TEST] Past Events Group", founderId: pastUser.id },
    })
    const pastEvent = await prisma.event.create({
      data: {
        groupId: pastGroup.id,
        title: "[TEST] Past Event",
        startsAt: new Date("2020-01-01T10:00:00Z"),
      },
    })

    const result = await findSoonestUpcomingEvent(pastGroup.id)

    // Cleanup
    await prisma.event.delete({ where: { id: pastEvent.id } }).catch(() => {})
    await prisma.group.delete({ where: { id: pastGroup.id } }).catch(() => {})
    await prisma.user.delete({ where: { id: pastUser.id } }).catch(() => {})

    expect(result).toBeNull()
  })
})
