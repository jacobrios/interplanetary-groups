import { describe, it, expect, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { removeMember } from "../remove-member"

describe("removeMember", () => {
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
    const founderAuthId = `test-remove-founder-${stamp}`
    const memberAuthId = `test-remove-member-${stamp}`
    const founder = await prisma.user.create({
      data: { name: "[TEST] Remove Founder", supabaseAuthId: founderAuthId },
    })
    const member = await prisma.user.create({
      data: { name: "[TEST] Remove Member", supabaseAuthId: memberAuthId },
    })
    const group = await prisma.group.create({
      data: {
        name: "[TEST] Remove Group",
        founderId: founder.id,
        memberships: { create: [{ userId: founder.id }, { userId: member.id }] },
      },
    })
    groupIds.push(group.id)
    userIds.push(founder.id, member.id)
    return { founder, member, group, founderAuthId, memberAuthId }
  }

  it("lets the founder remove a member, deleting exactly that membership", async () => {
    const { founder, member, group, founderAuthId } = await makeGroup()

    await removeMember({
      supabaseAuthId: founderAuthId,
      groupId: group.id,
      targetUserId: member.id,
    })

    const gone = await prisma.membership.findUnique({
      where: { userId_groupId: { userId: member.id, groupId: group.id } },
    })
    expect(gone).toBeNull()

    // Founder membership untouched; removed user's User row survives
    const founderRow = await prisma.membership.findUnique({
      where: { userId_groupId: { userId: founder.id, groupId: group.id } },
    })
    expect(founderRow).not.toBeNull()
    expect(await prisma.user.findUnique({ where: { id: member.id } })).not.toBeNull()
  })

  it("rejects a non-founder caller", async () => {
    const { member, group } = await makeGroup()
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const secondAuthId = `test-remove-second-${stamp}`
    const second = await prisma.user.create({
      data: { name: "[TEST] Remove Second", supabaseAuthId: secondAuthId },
    })
    userIds.push(second.id)
    await prisma.membership.create({ data: { userId: second.id, groupId: group.id } })

    await expect(
      removeMember({
        supabaseAuthId: secondAuthId,
        groupId: group.id,
        targetUserId: member.id,
      })
    ).rejects.toThrow("NOT_FOUNDER")

    // Target untouched
    const still = await prisma.membership.findUnique({
      where: { userId_groupId: { userId: member.id, groupId: group.id } },
    })
    expect(still).not.toBeNull()
  })

  it("rejects removing the founder", async () => {
    const { founder, group, founderAuthId } = await makeGroup()
    await expect(
      removeMember({
        supabaseAuthId: founderAuthId,
        groupId: group.id,
        targetUserId: founder.id,
      })
    ).rejects.toThrow("CANNOT_REMOVE_FOUNDER")
  })

  it("rejects a target who is not a member", async () => {
    const { founder, group, founderAuthId } = await makeGroup()
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const outsider = await prisma.user.create({
      data: { name: "[TEST] Remove Outsider", supabaseAuthId: `test-remove-outsider-${stamp}` },
    })
    userIds.push(outsider.id)
    await expect(
      removeMember({
        supabaseAuthId: founderAuthId,
        groupId: group.id,
        targetUserId: outsider.id,
      })
    ).rejects.toThrow("TARGET_NOT_MEMBER")
  })
})
