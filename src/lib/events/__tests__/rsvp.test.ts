// src/lib/events/__tests__/rsvp.test.ts
import { describe, it, expect, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { RsvpStatus } from "@prisma/client"
import { setRsvp } from "../rsvp"

describe("setRsvp", () => {
  // IDs tracked for cleanup. Delete order must respect FK constraints:
  //   rsvps cascade-delete from event; delete event first, then group, then user.
  //   Group.founderId is Restrict — group must be deleted before user.
  let userId: string
  let groupId: string
  let eventId: string

  afterAll(async () => {
    if (eventId) await prisma.event.delete({ where: { id: eventId } }).catch(() => {})
    if (groupId) await prisma.group.delete({ where: { id: groupId } }).catch(() => {})
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {})
    await prisma.$disconnect()
  })

  it("creates an IN rsvp row for a known user and event", async () => {
    const authId = `test-rsvp-auth-${Date.now()}`

    // Arrange: a user, a group, and an event
    const user = await prisma.user.create({
      data: { name: "[TEST] RSVP User", supabaseAuthId: authId },
    })
    userId = user.id

    const group = await prisma.group.create({
      data: {
        name: "[TEST] RSVP Group",
        founderId: user.id,
        memberships: { create: { userId: user.id } },
      },
    })
    groupId = group.id

    const event = await prisma.event.create({
      data: {
        groupId: group.id,
        title: "[TEST] RSVP Event",
        startsAt: new Date("2026-08-01T10:00:00Z"),
      },
    })
    eventId = event.id

    // Act
    const { rsvp } = await setRsvp({ supabaseAuthId: authId, eventId: event.id, status: RsvpStatus.IN })

    // Assert
    expect(rsvp.status).toBe(RsvpStatus.IN)
    expect(rsvp.eventId).toBe(event.id)
    expect(rsvp.userId).toBe(user.id)
  })

  it("updates the existing row when called again with OUT — one row, status flips", async () => {
    // authId / eventId already set by the preceding test
    const authId = `test-rsvp-auth-${userId ? "" : Date.now()}`
    // Derive the auth id from the user we already created (the user was just created above)
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user?.supabaseAuthId) throw new Error("Preceding test did not create user")

    // Act: change to OUT
    const { rsvp } = await setRsvp({
      supabaseAuthId: user.supabaseAuthId,
      eventId,
      status: RsvpStatus.OUT,
    })

    // Assert status flipped
    expect(rsvp.status).toBe(RsvpStatus.OUT)

    // Assert still exactly one row — upsert, not insert
    const count = await prisma.rsvp.count({ where: { eventId, userId } })
    expect(count).toBe(1)
  })

  it("rejects with NO_USER when the supabaseAuthId is unknown", async () => {
    await expect(
      setRsvp({
        supabaseAuthId: "nonexistent-auth-id",
        eventId,
        status: RsvpStatus.IN,
      })
    ).rejects.toThrow("NO_USER")
  })
})
