// src/lib/events/__tests__/create.test.ts
//
// Integration tests — hits the real dev database.
// Tests the createEvent helper that atomically creates an Event (and optional Venue).
import { describe, it, expect, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { createEvent } from "../create"

describe("createEvent", () => {
  // IDs tracked for cleanup. Delete order must respect FK constraints:
  //   Venue cascades from Event; RSVPs cascade from Event.
  //   Group.founderId is Restrict — group must be deleted before user.
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

  // Shared test fixtures — created once for all tests in this suite.
  // Using beforeAll would require hoisting let declarations; instead we
  // create lazily in the first test and reuse via closure.
  async function ensureGroup(): Promise<{ userId: string; groupId: string }> {
    if (userId && groupId) return { userId, groupId }

    const user = await prisma.user.create({
      data: {
        name: "[TEST] Create Event User",
        supabaseAuthId: `test-create-event-${Date.now()}`,
      },
    })
    userId = user.id

    const group = await prisma.group.create({
      data: {
        name: "[TEST] Create Event Group",
        founderId: user.id,
        timeZone: "America/Los_Angeles",
        memberships: { create: { userId: user.id } },
      },
    })
    groupId = group.id

    return { userId, groupId }
  }

  it("creates an event without a venue and returns the Event row with correct fields", async () => {
    const { groupId: gid } = await ensureGroup()

    const event = await createEvent({
      groupId: gid,
      title: "[TEST] No-Venue Event",
      startsAt: new Date("2027-03-15T10:00:00Z"),
      activityLabel: "Morning Hike",
    })

    eventIds.push(event.id)

    // Verify returned Event fields
    expect(event.groupId).toBe(gid)
    expect(event.title).toBe("[TEST] No-Venue Event")
    expect(event.startsAt).toEqual(new Date("2027-03-15T10:00:00Z"))
    expect(event.activityLabel).toBe("Morning Hike")
    expect(event.id).toBeTruthy()

    // Verify no Venue row was created for this event
    const venueCount = await prisma.venue.count({ where: { eventId: event.id } })
    expect(venueCount).toBe(0)
  })

  it("creates an event with a venue and persists both rows with correct fields", async () => {
    const { groupId: gid } = await ensureGroup()

    const event = await createEvent({
      groupId: gid,
      title: "[TEST] Venue Event",
      startsAt: new Date("2027-04-20T14:00:00Z"),
      venue: {
        name: "Stoney Point Park",
        displayLabel: "Stoney Point",
        address: "7900 Topanga Canyon Blvd, Chatsworth, CA",
        url: "https://maps.example.com/stoney-point",
      },
    })

    eventIds.push(event.id)

    // Verify the returned Event
    expect(event.groupId).toBe(gid)
    expect(event.title).toBe("[TEST] Venue Event")
    expect(event.startsAt).toEqual(new Date("2027-04-20T14:00:00Z"))
    expect(event.id).toBeTruthy()

    // Verify the Venue row exists and is linked to the Event
    const venue = await prisma.venue.findFirst({ where: { eventId: event.id } })
    expect(venue).not.toBeNull()
    expect(venue!.eventId).toBe(event.id)
    expect(venue!.name).toBe("Stoney Point Park")
    expect(venue!.displayLabel).toBe("Stoney Point")
    expect(venue!.address).toBe("7900 Topanga Canyon Blvd, Chatsworth, CA")
    expect(venue!.url).toBe("https://maps.example.com/stoney-point")
  })

  it("creates an event with venue: null (scheduled events — no venue)", async () => {
    const { groupId: gid } = await ensureGroup()

    const event = await createEvent({
      groupId: gid,
      title: "[TEST] Scheduled No-Venue Event",
      startsAt: new Date("2027-05-10T08:00:00Z"),
      venue: null,
    })

    eventIds.push(event.id)

    expect(event.groupId).toBe(gid)
    expect(event.title).toBe("[TEST] Scheduled No-Venue Event")

    const venueCount = await prisma.venue.count({ where: { eventId: event.id } })
    expect(venueCount).toBe(0)
  })
})
