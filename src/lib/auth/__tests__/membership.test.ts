import { describe, it, expect, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { isGroupMember } from "../membership"

describe("isGroupMember", () => {
  const groupIds: string[] = []
  const userIds: string[] = []

  afterAll(async () => {
    for (const id of groupIds) {
      await prisma.group.delete({ where: { id } }).catch(() => {})
    }
    for (const id of userIds) {
      await prisma.user.delete({ where: { id } }).catch(() => {})
    }
    await prisma.$disconnect()
  })

  it("is true for a member and false for everyone else", async () => {
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const founder = await prisma.user.create({
      data: { name: "[TEST] Membership Founder", supabaseAuthId: `test-mem-f-${stamp}` },
    })
    const outsider = await prisma.user.create({
      data: { name: "[TEST] Membership Outsider", supabaseAuthId: `test-mem-o-${stamp}` },
    })
    const group = await prisma.group.create({
      data: {
        name: "[TEST] Membership Group",
        founderId: founder.id,
        memberships: { create: [{ userId: founder.id }] },
      },
    })
    groupIds.push(group.id)
    userIds.push(founder.id, outsider.id)

    expect(await isGroupMember(founder.id, group.id)).toBe(true)
    expect(await isGroupMember(outsider.id, group.id)).toBe(false)
    expect(await isGroupMember("no-such-user", group.id)).toBe(false)
    expect(await isGroupMember(founder.id, "no-such-group")).toBe(false)
  })
})
