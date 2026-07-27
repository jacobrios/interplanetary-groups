// src/lib/events/__tests__/upcoming.test.ts
//
// Integration tests — hits the real dev database.
// Tests the findSoonestUpcomingEvent query that backs the home-screen card.
//
// Every test injects NOW rather than letting the query read the real clock, so
// these dates mean the same thing in 2026 and in 2036.
import { describe, it, expect, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { findSoonestUpcomingEvent } from "../upcoming"

describe("findSoonestUpcomingEvent", () => {
  // A fixed reference instant: 24 July 2026. "Soon" is the day after, "far" is
  // 2030, and the past-event test sits in 2020.
  const NOW = new Date("2026-07-24T12:00:00Z")

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

    // Fixed instants, readable at a glance, because the test now controls the
    // clock it is judged against. The previous version had to express "the
    // future" relative to Date.now(), since the query read the real clock
    // itself; before that it hardcoded 2026-07-25, passed for a month on the
    // strength of the calendar, and turned red on its own. Passing NOW in is
    // what makes both of those impossible.
    const far = await prisma.event.create({
      data: {
        groupId: group.id,
        title: "[TEST] Far Event",
        startsAt: new Date("2030-01-15T10:00:00Z"),
      },
    })
    eventIds.push(far.id)

    const soon = await prisma.event.create({
      data: {
        groupId: group.id,
        title: "[TEST] Soon Event",
        startsAt: new Date("2026-07-25T10:00:00Z"),
      },
    })
    eventIds.push(soon.id)

    // Act
    const result = await findSoonestUpcomingEvent(group.id, NOW)

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
    const result = await findSoonestUpcomingEvent(emptyGroup.id, NOW)
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

    const result = await findSoonestUpcomingEvent(pastGroup.id, NOW)

    // Cleanup
    await prisma.event.delete({ where: { id: pastEvent.id } }).catch(() => {})
    await prisma.group.delete({ where: { id: pastGroup.id } }).catch(() => {})
    await prisma.user.delete({ where: { id: pastUser.id } }).catch(() => {})

    expect(result).toBeNull()
  })
})
