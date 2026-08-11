import { describe, it, expect, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { resetInviteToken } from "../reset-invite"

describe("resetInviteToken", () => {
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

  async function makeGroup() {
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const founder = await prisma.user.create({
      data: { name: "[TEST] Reset Founder", supabaseAuthId: `test-reset-founder-${stamp}` },
    })
    const group = await prisma.group.create({
      data: {
        name: "[TEST] Reset Group",
        founderId: founder.id,
        memberships: { create: [{ userId: founder.id }] },
      },
    })
    groupIds.push(group.id)
    userIds.push(founder.id)
    return { founder, group }
  }

  it("rotates the token: old value gone, new value resolves, group id unchanged", async () => {
    const { founder, group } = await makeGroup()
    const oldToken = group.inviteToken

    const newToken = await resetInviteToken({
      supabaseAuthId: founder.supabaseAuthId,
      groupId: group.id,
    })

    expect(newToken).not.toBe(oldToken)
    expect(newToken.length).toBeGreaterThan(10)

    // The old token no longer resolves to any group
    expect(await prisma.group.findUnique({ where: { inviteToken: oldToken } })).toBeNull()

    // The new token resolves to the same group
    const byNew = await prisma.group.findUnique({ where: { inviteToken: newToken } })
    expect(byNew?.id).toBe(group.id)
  })

  it("rejects a non-founder", async () => {
    const { group } = await makeGroup()
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const member = await prisma.user.create({
      data: { name: "[TEST] Reset Member", supabaseAuthId: `test-reset-member-${stamp}` },
    })
    userIds.push(member.id)
    await prisma.membership.create({ data: { userId: member.id, groupId: group.id } })

    const before = group.inviteToken
    await expect(
      resetInviteToken({ supabaseAuthId: member.supabaseAuthId, groupId: group.id })
    ).rejects.toThrow("NOT_FOUNDER")

    // Token untouched
    const after = await prisma.group.findUnique({ where: { id: group.id } })
    expect(after?.inviteToken).toBe(before)
  })

  it("rejects an unknown group", async () => {
    const { founder } = await makeGroup()
    await expect(
      resetInviteToken({ supabaseAuthId: founder.supabaseAuthId, groupId: "no-such-group" })
    ).rejects.toThrow("GROUP_NOT_FOUND")
  })
})
