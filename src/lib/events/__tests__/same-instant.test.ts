// src/lib/events/__tests__/same-instant.test.ts
//
// The constraint this slice removed: a group could not hold two events at the
// same start instant. With a 7pm default and any evening rhythm, a sparked
// event colliding with the standing one is ordinary, not exotic.

import { describe, it, expect, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"

const AUTH_ID = `test-same-instant-${Date.now()}`
let userId: string
let groupId: string

afterAll(async () => {
  if (groupId) {
    await prisma.event.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.membership.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.group.delete({ where: { id: groupId } }).catch(() => {})
  }
  if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {})
  await prisma.$disconnect()
})

describe("two events at the same instant", () => {
  it("is allowed, because a spark may land on the standing event's slot", async () => {
    const user = await prisma.user.create({
      data: { name: "[TEST] Same Instant", supabaseAuthId: AUTH_ID },
    })
    userId = user.id
    const group = await prisma.group.create({
      data: { name: "[TEST] Same Instant Group", founderId: user.id, timeZone: "UTC" },
    })
    groupId = group.id

    const startsAt = new Date("2026-08-07T19:00:00Z")
    await prisma.event.create({ data: { groupId, title: "Climbing Friday", startsAt } })
    await prisma.event.create({ data: { groupId, title: "Beers", startsAt } })

    expect(await prisma.event.count({ where: { groupId, startsAt } })).toBe(2)
  })
})
