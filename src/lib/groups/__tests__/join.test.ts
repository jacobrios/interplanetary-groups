import { describe, it, expect, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { MessageAuthor } from "@prisma/client"
import { joinGroupByInvite, DuplicateNameError } from "../join"

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

  it("announces a first join with exactly one SYSTEM message in the feed", async () => {
    const founderAuthId = `test-founder-announce-${Date.now()}`
    const founder = await prisma.user.create({
      data: { name: "[TEST] Founder Announce", supabaseAuthId: founderAuthId },
    })
    const group = await prisma.group.create({
      data: { name: "[TEST] Group Announce", founderId: founder.id },
    })
    groupIds.push(group.id)
    userIds.push(founder.id)

    const { user } = await joinGroupByInvite({
      supabaseAuthId: `test-joiner-announce-${Date.now()}`,
      memberName: "[TEST] Jesse",
      inviteToken: group.inviteToken,
    })
    userIds.push(user.id)

    const announcements = await prisma.message.findMany({
      where: { groupId: group.id, authorType: MessageAuthor.SYSTEM },
    })
    expect(announcements).toHaveLength(1)
    expect(announcements[0].body).toBe("[TEST] Jesse joined")
    expect(announcements[0].authorId).toBeNull()
  })

  it("does not announce a re-tap of the invite link", async () => {
    const founderAuthId = `test-founder-retap-${Date.now()}`
    const founder = await prisma.user.create({
      data: { name: "[TEST] Founder Retap", supabaseAuthId: founderAuthId },
    })
    const group = await prisma.group.create({
      data: { name: "[TEST] Group Retap", founderId: founder.id },
    })
    groupIds.push(group.id)
    userIds.push(founder.id)

    const joinerAuthId = `test-joiner-retap-${Date.now()}`
    const { user } = await joinGroupByInvite({
      supabaseAuthId: joinerAuthId,
      memberName: "[TEST] Retap Member",
      inviteToken: group.inviteToken,
    })
    userIds.push(user.id)
    await joinGroupByInvite({
      supabaseAuthId: joinerAuthId,
      memberName: "[TEST] Retap Member",
      inviteToken: group.inviteToken,
    })

    const announcements = await prisma.message.findMany({
      where: { groupId: group.id, authorType: MessageAuthor.SYSTEM },
    })
    expect(announcements).toHaveLength(1)
  })

  it("announces an existing user by their stored name, never the submitted name", async () => {
    const existingAuthId = `test-existing-announce-${Date.now()}`
    const existingUser = await prisma.user.create({
      data: { name: "[TEST] Stored Name", supabaseAuthId: existingAuthId },
    })
    userIds.push(existingUser.id)

    const founderAuthId = `test-founder-stored-${Date.now()}`
    const founder = await prisma.user.create({
      data: { name: "[TEST] Founder Stored", supabaseAuthId: founderAuthId },
    })
    const group = await prisma.group.create({
      data: { name: "[TEST] Group Stored", founderId: founder.id },
    })
    groupIds.push(group.id)
    userIds.push(founder.id)

    await joinGroupByInvite({
      supabaseAuthId: existingAuthId,
      memberName: "[TEST] Submitted Name",
      inviteToken: group.inviteToken,
    })

    const announcements = await prisma.message.findMany({
      where: { groupId: group.id, authorType: MessageAuthor.SYSTEM },
    })
    expect(announcements).toHaveLength(1)
    expect(announcements[0].body).toBe("[TEST] Stored Name joined")
  })

  it("rejects a brand-new joiner whose name exactly matches an existing member's stored name, and rolls back", async () => {
    const founderAuthId = `test-founder-dup-exact-${Date.now()}`
    const founder = await prisma.user.create({
      data: { name: "[TEST] Founder Dup Exact", supabaseAuthId: founderAuthId },
    })
    const group = await prisma.group.create({
      data: { name: "[TEST] Group Dup Exact", founderId: founder.id },
    })
    groupIds.push(group.id)
    userIds.push(founder.id)

    // A member already on the roster, seeded directly via Membership so
    // this test is about the check rather than about join mechanics.
    const existingMemberAuthId = `test-member-dup-exact-${Date.now()}`
    const existingMember = await prisma.user.create({
      data: { name: "[TEST] Mike", supabaseAuthId: existingMemberAuthId },
    })
    userIds.push(existingMember.id)
    await prisma.membership.create({
      data: { userId: existingMember.id, groupId: group.id },
    })

    const joinerAuthId = `test-joiner-dup-exact-${Date.now()}`

    let caught: unknown
    try {
      await joinGroupByInvite({
        supabaseAuthId: joinerAuthId,
        memberName: "[TEST] Mike",
        inviteToken: group.inviteToken,
      })
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(DuplicateNameError)
    expect((caught as DuplicateNameError).existingName).toBe("[TEST] Mike")

    // Rollback proof, not an assumption: no User row for the rejected
    // joiner, the group's membership count is unchanged (the seeded
    // existing member only), and no SYSTEM message was written.
    const user = await prisma.user.findUnique({ where: { supabaseAuthId: joinerAuthId } })
    expect(user).toBeNull()

    const memberships = await prisma.membership.findMany({ where: { groupId: group.id } })
    expect(memberships).toHaveLength(1)

    const announcements = await prisma.message.findMany({
      where: { groupId: group.id, authorType: MessageAuthor.SYSTEM },
    })
    expect(announcements).toHaveLength(0)
  })

  it("rejects on a trimmed, case-insensitive match and carries the stored casing, not the submitted casing", async () => {
    const founderAuthId = `test-founder-dup-case-${Date.now()}`
    const founder = await prisma.user.create({
      data: { name: "[TEST] Founder Dup Case", supabaseAuthId: founderAuthId },
    })
    const group = await prisma.group.create({
      data: { name: "[TEST] Group Dup Case", founderId: founder.id },
    })
    groupIds.push(group.id)
    userIds.push(founder.id)

    const existingMemberAuthId = `test-member-dup-case-${Date.now()}`
    const existingMember = await prisma.user.create({
      data: { name: "[TEST] Mike", supabaseAuthId: existingMemberAuthId },
    })
    userIds.push(existingMember.id)
    await prisma.membership.create({
      data: { userId: existingMember.id, groupId: group.id },
    })

    const joinerAuthId = `test-joiner-dup-case-${Date.now()}`

    let caught: unknown
    try {
      await joinGroupByInvite({
        supabaseAuthId: joinerAuthId,
        memberName: "  [test] mike  ",
        inviteToken: group.inviteToken,
      })
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(DuplicateNameError)
    // The stored casing ("[TEST] Mike"), not the submitted casing/whitespace.
    expect((caught as DuplicateNameError).existingName).toBe("[TEST] Mike")

    const user = await prisma.user.findUnique({ where: { supabaseAuthId: joinerAuthId } })
    expect(user).toBeNull()
  })

  it("lets a non-colliding name join normally alongside an existing member", async () => {
    const founderAuthId = `test-founder-dup-ok-${Date.now()}`
    const founder = await prisma.user.create({
      data: { name: "[TEST] Founder Dup Ok", supabaseAuthId: founderAuthId },
    })
    const group = await prisma.group.create({
      data: { name: "[TEST] Group Dup Ok", founderId: founder.id },
    })
    groupIds.push(group.id)
    userIds.push(founder.id)

    const existingMemberAuthId = `test-member-dup-ok-${Date.now()}`
    const existingMember = await prisma.user.create({
      data: { name: "[TEST] Mike", supabaseAuthId: existingMemberAuthId },
    })
    userIds.push(existingMember.id)
    await prisma.membership.create({
      data: { userId: existingMember.id, groupId: group.id },
    })

    const joinerAuthId = `test-joiner-dup-ok-${Date.now()}`
    const { user } = await joinGroupByInvite({
      supabaseAuthId: joinerAuthId,
      memberName: "[TEST] Priya",
      inviteToken: group.inviteToken,
    })
    userIds.push(user.id)

    expect(user.name).toBe("[TEST] Priya")

    const membership = await prisma.membership.findUnique({
      where: { userId_groupId: { userId: user.id, groupId: group.id } },
    })
    expect(membership).not.toBeNull()

    const announcements = await prisma.message.findMany({
      where: { groupId: group.id, authorType: MessageAuthor.SYSTEM },
    })
    expect(announcements).toHaveLength(1)
    expect(announcements[0].body).toBe("[TEST] Priya joined")
  })

  it("does not block an existing User whose stored name matches a member of the target group (the sign-in path)", async () => {
    const founderAuthId = `test-founder-dup-signin-${Date.now()}`
    const founder = await prisma.user.create({
      data: { name: "[TEST] Founder Dup Signin", supabaseAuthId: founderAuthId },
    })
    const group = await prisma.group.create({
      data: { name: "[TEST] Group Dup Signin", founderId: founder.id },
    })
    groupIds.push(group.id)
    userIds.push(founder.id)

    // A member already in the group, sharing the exact stored name that
    // the signing-in user also carries.
    const memberAuthId = `test-member-dup-signin-${Date.now()}`
    const member = await prisma.user.create({
      data: { name: "[TEST] Mike", supabaseAuthId: memberAuthId },
    })
    userIds.push(member.id)
    await prisma.membership.create({ data: { userId: member.id, groupId: group.id } })

    // The existing User signing back in: same stored name, not yet a
    // member of this particular group. Mirrors confirmJoinSignInAction,
    // which calls joinGroupByInvite with memberName: "" on an existing
    // User. The duplicate-name guard must never reach this branch.
    const existingAuthId = `test-existing-dup-signin-${Date.now()}`
    const existingUser = await prisma.user.create({
      data: { name: "[TEST] Mike", supabaseAuthId: existingAuthId },
    })
    userIds.push(existingUser.id)

    const { user } = await joinGroupByInvite({
      supabaseAuthId: existingAuthId,
      memberName: "",
      inviteToken: group.inviteToken,
    })

    expect(user.id).toBe(existingUser.id)
    expect(user.name).toBe("[TEST] Mike")

    const membership = await prisma.membership.findUnique({
      where: { userId_groupId: { userId: user.id, groupId: group.id } },
    })
    expect(membership).not.toBeNull()
  })

  // Every other collision test above seeds the founder with no Membership
  // row, so none of them would notice if provisionFounderGroup ever stopped
  // giving the founder one (src/lib/groups/provision.ts:69,
  // `memberships: { create: { userId: user.id } }`). But "somebody joins
  // and shares the founder's name" is the commonest real collision there
  // is, so this test seeds the founder the way provisionFounderGroup
  // actually does — via the same nested-create shape, not a separate
  // Membership.create call — and checks the collision fires against them
  // specifically.
  it("rejects a brand-new joiner whose name collides with the founder, who has a Membership row like any other member", async () => {
    const founderAuthId = `test-founder-dup-founder-${Date.now()}`
    const founder = await prisma.user.create({
      data: { name: "[TEST] Founder Priya", supabaseAuthId: founderAuthId },
    })
    userIds.push(founder.id)
    const group = await prisma.group.create({
      data: {
        name: "[TEST] Group Dup Founder",
        founderId: founder.id,
        memberships: { create: { userId: founder.id } },
      },
    })
    groupIds.push(group.id)

    const joinerAuthId = `test-joiner-dup-founder-${Date.now()}`

    let caught: unknown
    try {
      await joinGroupByInvite({
        supabaseAuthId: joinerAuthId,
        memberName: "[TEST] Founder Priya",
        inviteToken: group.inviteToken,
      })
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(DuplicateNameError)
    expect((caught as DuplicateNameError).existingName).toBe("[TEST] Founder Priya")

    const user = await prisma.user.findUnique({ where: { supabaseAuthId: joinerAuthId } })
    expect(user).toBeNull()

    const memberships = await prisma.membership.findMany({ where: { groupId: group.id } })
    expect(memberships).toHaveLength(1)
  })
})
