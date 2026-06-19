import { describe, it, expect, afterAll } from "vitest"
import { prisma } from "../prisma"

describe("data layer smoke test", () => {
  let userId: string
  let groupId: string
  let eventId: string

  // Tests in this suite are sequentially dependent: each test uses IDs
  // set by prior tests. Vitest runs them in declaration order by default.
  // Do NOT reorder or mark them concurrent.

  afterAll(async () => {
    // Delete in cascade-safe order:
    //   event delete cascades → venues, rsvps
    //   group delete cascades → memberships
    //   user  delete cascades → contactMethods
    if (eventId) await prisma.event.delete({ where: { id: eventId } })
    if (groupId) await prisma.group.delete({ where: { id: groupId } })
    if (userId) await prisma.user.delete({ where: { id: userId } })
    await prisma.$disconnect()
  })

  it("creates a connected graph and reads relationships back", async () => {
    const user = await prisma.user.create({
      data: {
        name: "[TEST] Smoke User",
        contactMethods: {
          create: {
            type: "EMAIL",
            value: `smoke-${Date.now()}@test.invalid`,
            isPreferred: true,
          },
        },
      },
      include: { contactMethods: true },
    })
    userId = user.id

    expect(user.contactMethods).toHaveLength(1)
    expect(user.contactMethods[0].type).toBe("EMAIL")

    const group = await prisma.group.create({
      data: {
        name: "[TEST] Smoke Group",
        founderId: userId,
        memberships: { create: { userId } },
      },
      include: { memberships: true },
    })
    groupId = group.id

    expect(group.founderId).toBe(userId)
    expect(group.memberships).toHaveLength(1)
    expect(group.memberships[0].userId).toBe(userId)

    const event = await prisma.event.create({
      data: {
        groupId,
        title: "[TEST] Smoke Event",
        startsAt: new Date("2026-07-01T08:00:00Z"),
        venues: {
          create: { name: "[TEST] Smoke Venue", displayLabel: "Smoke" },
        },
      },
      include: { venues: true },
    })
    eventId = event.id
    const venueId = event.venues[0].id

    const rsvp = await prisma.rsvp.create({
      data: { eventId, userId, status: "IN", venueId },
    })

    expect(event.venues).toHaveLength(1)
    expect(rsvp.status).toBe("IN")
    expect(rsvp.venueId).toBe(venueId)
  })

  it("rejects a duplicate RSVP for the same user and event", async () => {
    // P2002 is Prisma's error code for unique constraint violations.
    await expect(
      prisma.rsvp.create({ data: { eventId, userId, status: "OUT" } })
    ).rejects.toMatchObject({ code: "P2002" })
  })

  it("rejects a duplicate membership for the same user and group", async () => {
    await expect(
      prisma.membership.create({ data: { userId, groupId } })
    ).rejects.toMatchObject({ code: "P2002" })
  })
})
