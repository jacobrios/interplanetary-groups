import { describe, it, expect, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { leaveGroup } from "../leave"

describe("leaveGroup", () => {
  const groupIds: string[] = []
  const userIds: string[] = []

  afterAll(async () => {
    // Delete groups first (Group.founderId is Restrict)
    for (const id of groupIds) {
      await prisma.group.delete({ where: { id } }).catch(() => {})
    }
    for (const id of userIds) {
      await prisma.user.delete({ where: { id } }).catch(() => {})
    }
    await prisma.$disconnect()
  })

  async function makeGroupWithMember() {
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const founder = await prisma.user.create({
      data: { name: "[TEST] Leave Founder", supabaseAuthId: `test-leave-founder-${stamp}` },
    })
    const member = await prisma.user.create({
      data: { name: "[TEST] Leave Member", supabaseAuthId: `test-leave-member-${stamp}` },
    })
    const group = await prisma.group.create({
      data: {
        name: "[TEST] Leave Group",
        founderId: founder.id,
        memberships: { create: [{ userId: founder.id }, { userId: member.id }] },
      },
    })
    groupIds.push(group.id)
    userIds.push(founder.id, member.id)
    return { founder, member, group }
  }

  it("deletes exactly the caller's membership and nothing else", async () => {
    const { founder, member, group } = await makeGroupWithMember()

    await leaveGroup({ supabaseAuthId: member.supabaseAuthId, groupId: group.id })

    const gone = await prisma.membership.findUnique({
      where: { userId_groupId: { userId: member.id, groupId: group.id } },
    })
    expect(gone).toBeNull()

    // The founder's membership is untouched
    const founderRow = await prisma.membership.findUnique({
      where: { userId_groupId: { userId: founder.id, groupId: group.id } },
    })
    expect(founderRow).not.toBeNull()

    // The member's User row survives (leaving is not account deletion)
    const user = await prisma.user.findUnique({ where: { id: member.id } })
    expect(user).not.toBeNull()
  })

  it("leaves the member's history behind: an RSVP row survives the leave", async () => {
    const { member, group } = await makeGroupWithMember()
    const event = await prisma.event.create({
      data: { groupId: group.id, title: "[TEST] Climb", startsAt: new Date("2099-06-10T12:00:00Z") },
    })
    await prisma.rsvp.create({ data: { eventId: event.id, userId: member.id, status: "IN" } })

    await leaveGroup({ supabaseAuthId: member.supabaseAuthId, groupId: group.id })

    const rsvp = await prisma.rsvp.findUnique({
      where: { eventId_userId: { eventId: event.id, userId: member.id } },
    })
    expect(rsvp).not.toBeNull()
  })

  it("rejects the founder", async () => {
    const { founder, group } = await makeGroupWithMember()
    await expect(
      leaveGroup({ supabaseAuthId: founder.supabaseAuthId, groupId: group.id })
    ).rejects.toThrow("FOUNDER_CANNOT_LEAVE")
    const still = await prisma.membership.findUnique({
      where: { userId_groupId: { userId: founder.id, groupId: group.id } },
    })
    expect(still).not.toBeNull()
  })

  it("rejects a non-member", async () => {
    const { group } = await makeGroupWithMember()
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const outsider = await prisma.user.create({
      data: { name: "[TEST] Leave Outsider", supabaseAuthId: `test-leave-outsider-${stamp}` },
    })
    userIds.push(outsider.id)
    await expect(
      leaveGroup({ supabaseAuthId: outsider.supabaseAuthId, groupId: group.id })
    ).rejects.toThrow("NOT_A_MEMBER")
  })

  it("rejects an unknown session", async () => {
    const { group } = await makeGroupWithMember()
    await expect(
      leaveGroup({ supabaseAuthId: `test-leave-nobody-${Date.now()}`, groupId: group.id })
    ).rejects.toThrow("NO_USER")
  })

  it("rejects an unknown group", async () => {
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const user = await prisma.user.create({
      data: { name: "[TEST] Leave NoGroup", supabaseAuthId: `test-leave-nogroup-${stamp}` },
    })
    userIds.push(user.id)
    await expect(
      leaveGroup({ supabaseAuthId: user.supabaseAuthId, groupId: "no-such-group-id" })
    ).rejects.toThrow("GROUP_NOT_FOUND")
  })
})
