import { describe, it, expect, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { provisionFounderGroup } from "../provision"

describe("provisionFounderGroup", () => {
  // Track all created IDs for cleanup
  const groupIds: string[] = []
  const userIds: string[] = []

  afterAll(async () => {
    // Delete groups first (Group.founderId is Restrict — cannot delete user while they have founded groups)
    for (const id of groupIds) {
      await prisma.group.delete({ where: { id } }).catch(() => {})
    }
    for (const id of userIds) {
      await prisma.user.delete({ where: { id } }).catch(() => {})
    }
    await prisma.$disconnect()
  })

  it("creates a User, Group, and founder Membership and returns an invite token", async () => {
    const authId = `test-auth-${Date.now()}`

    const { user, group } = await provisionFounderGroup({
      supabaseAuthId: authId,
      founderName: "[TEST] Founder",
      groupName: "[TEST] Group Alpha",
    })

    groupIds.push(group.id)
    userIds.push(user.id)

    // User
    expect(user.supabaseAuthId).toBe(authId)
    expect(user.name).toBe("[TEST] Founder")

    // Group
    expect(group.name).toBe("[TEST] Group Alpha")
    expect(group.founderId).toBe(user.id)
    expect(group.inviteToken).toBeTruthy()

    // Founder Membership exists
    const membership = await prisma.membership.findUnique({
      where: { userId_groupId: { userId: user.id, groupId: group.id } },
    })
    expect(membership).not.toBeNull()
  })

  it("reuses the existing User when called a second time with the same supabaseAuthId", async () => {
    const authId = `test-auth-guard-${Date.now()}`

    // First provision
    const { user: user1, group: group1 } = await provisionFounderGroup({
      supabaseAuthId: authId,
      founderName: "[TEST] Founder Guard",
      groupName: "[TEST] Group Guard 1",
    })
    groupIds.push(group1.id)
    userIds.push(user1.id)

    // Second provision with the same authId (simulates browser already having a session)
    const { user: user2, group: group2 } = await provisionFounderGroup({
      supabaseAuthId: authId,
      founderName: "[TEST] Should Not Create New User",
      groupName: "[TEST] Group Guard 2",
    })
    groupIds.push(group2.id)
    // Do NOT push user2.id — it should be the same user

    // Same user ID reused — no duplicate created
    expect(user2.id).toBe(user1.id)

    // Confirm only one User row exists for this authId
    const users = await prisma.user.findMany({ where: { supabaseAuthId: authId } })
    expect(users).toHaveLength(1)

    // A second Group was created (each create-group call produces a new Group)
    expect(group2.id).not.toBe(group1.id)
  })
})
