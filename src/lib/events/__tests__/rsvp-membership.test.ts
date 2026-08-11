import { describe, it, expect, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { RsvpStatus } from "@prisma/client"
import { setRsvp } from "../rsvp"

describe("setRsvp membership gate", () => {
  const groupIds: string[] = []
  const userIds: string[] = []

  afterAll(async () => {
    for (const id of groupIds) {
      await prisma.event.deleteMany({ where: { groupId: id } }).catch(() => {})
      await prisma.group.delete({ where: { id } }).catch(() => {})
    }
    for (const id of userIds) {
      await prisma.user.delete({ where: { id } }).catch(() => {})
    }
    await prisma.$disconnect()
  })

  it("refuses a non-member's RSVP and leaves no row behind", async () => {
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const founderAuthId = `test-rsvpm-f-${stamp}`
    const founder = await prisma.user.create({
      data: { name: "[TEST] Rsvp Founder", supabaseAuthId: founderAuthId },
    })
    const outsiderAuthId = `test-rsvpm-o-${stamp}`
    const outsider = await prisma.user.create({
      data: { name: "[TEST] Rsvp Outsider", supabaseAuthId: outsiderAuthId },
    })
    const group = await prisma.group.create({
      data: {
        name: "[TEST] Rsvp Group",
        founderId: founder.id,
        memberships: { create: [{ userId: founder.id }] },
      },
    })
    groupIds.push(group.id)
    userIds.push(founder.id, outsider.id)
    const event = await prisma.event.create({
      data: { groupId: group.id, title: "[TEST] Climb", startsAt: new Date("2099-06-10T12:00:00Z") },
    })

    await expect(
      setRsvp({ supabaseAuthId: outsiderAuthId, eventId: event.id, status: RsvpStatus.IN })
    ).rejects.toThrow("NOT_A_MEMBER")
    const rows = await prisma.rsvp.count({ where: { eventId: event.id } })
    expect(rows).toBe(0)

    // A member's RSVP still writes.
    const { rsvp } = await setRsvp({
      supabaseAuthId: founderAuthId,
      eventId: event.id,
      status: RsvpStatus.IN,
    })
    expect(rsvp.status).toBe(RsvpStatus.IN)
  })
})
