import { describe, it, expect, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { joinGroupByInvite } from "../join"

describe("joinGroupByInvite", () => {
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

  it("creates a new User and Membership when the supabaseAuthId has no existing User", async () => {
    // Seed: create a group to join (with its own founder user)
    const founderAuthId = `test-founder-new-user-${Date.now()}`
    const founder = await prisma.user.create({
      data: { name: "[TEST] Founder New User", supabaseAuthId: founderAuthId },
    })
    const group = await prisma.group.create({
      data: { name: "[TEST] Group New User", founderId: founder.id },
    })
    groupIds.push(group.id)
    userIds.push(founder.id)

    const joinerAuthId = `test-joiner-new-${Date.now()}`

    const { user, group: returnedGroup } = await joinGroupByInvite({
      supabaseAuthId: joinerAuthId,
      memberName: "[TEST] New Member",
      inviteToken: group.inviteToken,
    })
    userIds.push(user.id)

    // User row created with submitted name and authId
    expect(user.name).toBe("[TEST] New Member")
    expect(user.supabaseAuthId).toBe(joinerAuthId)

    // Returns the correct group
    expect(returnedGroup.id).toBe(group.id)

    // Membership exists for this (userId, groupId)
    const membership = await prisma.membership.findUnique({
      where: { userId_groupId: { userId: user.id, groupId: group.id } },
    })
    expect(membership).not.toBeNull()
  })

  it("reuses an existing User and does NOT overwrite their name when joining with a new name", async () => {
    // Seed: create a pre-existing user (e.g. the founder of another group)
    const existingAuthId = `test-existing-user-${Date.now()}`
    const existingUser = await prisma.user.create({
      data: { name: "[TEST] Original Name", supabaseAuthId: existingAuthId },
    })
    userIds.push(existingUser.id)

    // Seed: create a separate group (with its own founder) to join
    const founderAuthId = `test-founder-existing-${Date.now()}`
    const founder = await prisma.user.create({
      data: { name: "[TEST] Founder Existing", supabaseAuthId: founderAuthId },
    })
    const group = await prisma.group.create({
      data: { name: "[TEST] Group Existing User", founderId: founder.id },
    })
    groupIds.push(group.id)
    userIds.push(founder.id)

    const { user, group: returnedGroup } = await joinGroupByInvite({
      supabaseAuthId: existingAuthId,
      memberName: "[TEST] Should Not Overwrite",
      inviteToken: group.inviteToken,
    })

    // Same user ID reused — no duplicate created
    expect(user.id).toBe(existingUser.id)

    // Name is NOT overwritten with the submitted memberName
    expect(user.name).toBe("[TEST] Original Name")

    // Confirm only one User row exists for this authId
    const users = await prisma.user.findMany({ where: { supabaseAuthId: existingAuthId } })
    expect(users).toHaveLength(1)

    // Membership created for this user
    const membership = await prisma.membership.findUnique({
      where: { userId_groupId: { userId: user.id, groupId: group.id } },
    })
    expect(membership).not.toBeNull()

    // Returns the correct group
    expect(returnedGroup.id).toBe(group.id)
  })

  it("is idempotent — a second call for the same (userId, groupId) does not throw and leaves exactly one Membership", async () => {
    // Seed: group with founder
    const founderAuthId = `test-founder-idempotent-${Date.now()}`
    const founder = await prisma.user.create({
      data: { name: "[TEST] Founder Idempotent", supabaseAuthId: founderAuthId },
    })
    const group = await prisma.group.create({
      data: { name: "[TEST] Group Idempotent", founderId: founder.id },
    })
    groupIds.push(group.id)
    userIds.push(founder.id)

    const joinerAuthId = `test-joiner-idempotent-${Date.now()}`

    // First join
    const { user } = await joinGroupByInvite({
      supabaseAuthId: joinerAuthId,
      memberName: "[TEST] Idempotent Member",
      inviteToken: group.inviteToken,
    })
    userIds.push(user.id)

    // Second join — must not throw
    await expect(
      joinGroupByInvite({
        supabaseAuthId: joinerAuthId,
        memberName: "[TEST] Idempotent Member",
        inviteToken: group.inviteToken,
      })
    ).resolves.not.toThrow()

    // Still exactly one Membership row
    const memberships = await prisma.membership.findMany({
      where: { userId: user.id, groupId: group.id },
    })
    expect(memberships).toHaveLength(1)
  })

  it("throws INVALID_INVITE when the inviteToken does not exist and creates no User or Membership", async () => {
    const badAuthId = `test-invalid-token-${Date.now()}`

    await expect(
      joinGroupByInvite({
        supabaseAuthId: badAuthId,
        memberName: "[TEST] Ghost Member",
        inviteToken: "nonexistent-token-that-will-never-match",
      })
    ).rejects.toThrow("INVALID_INVITE")

    // No User row was created
    const user = await prisma.user.findUnique({ where: { supabaseAuthId: badAuthId } })
    expect(user).toBeNull()
  })
})
