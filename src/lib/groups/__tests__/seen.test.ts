// src/lib/groups/__tests__/seen.test.ts
//
// markGroupSeen's three behaviors: it records the timestamp for a member, it
// refuses a non-member and writes nothing, and a later visit overwrites the
// earlier one.

import { describe, it, expect, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { markGroupSeen } from "../seen"

const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
const userIds: string[] = []
const groupIds: string[] = []

afterAll(async () => {
  for (const id of groupIds) {
    await prisma.membership.deleteMany({ where: { groupId: id } }).catch(() => {})
    await prisma.group.delete({ where: { id } }).catch(() => {})
  }
  for (const id of userIds) {
    await prisma.user.delete({ where: { id } }).catch(() => {})
  }
  await prisma.$disconnect()
})

async function makeUser(label: string) {
  const user = await prisma.user.create({
    data: { name: `[TEST] ${label}`, supabaseAuthId: `test-seen-${label}-${stamp}` },
  })
  userIds.push(user.id)
  return user
}

async function makeGroup(label: string, founderId: string, memberIds: string[]) {
  const group = await prisma.group.create({
    data: {
      name: `[TEST] ${label}`,
      founderId,
      memberships: { create: memberIds.map((userId) => ({ userId })) },
    },
  })
  groupIds.push(group.id)
  return group
}

describe("markGroupSeen", () => {
  it("records the timestamp for a member", async () => {
    const user = await makeUser("member")
    const group = await makeGroup("seen", user.id, [user.id])
    const now = new Date("2026-08-28T19:00:00Z")

    const ok = await markGroupSeen({ userId: user.id, groupId: group.id, now })

    expect(ok).toBe(true)
    const membership = await prisma.membership.findUnique({
      where: { userId_groupId: { userId: user.id, groupId: group.id } },
    })
    expect(membership?.lastSeenAt?.toISOString()).toBe(now.toISOString())
  })

  it("refuses a non-member and writes nothing", async () => {
    const founder = await makeUser("founder")
    const stranger = await makeUser("stranger")
    const group = await makeGroup("closed", founder.id, [founder.id])

    const ok = await markGroupSeen({
      userId: stranger.id,
      groupId: group.id,
      now: new Date(),
    })

    expect(ok).toBe(false)
    const rows = await prisma.membership.findMany({ where: { groupId: group.id } })
    expect(rows).toHaveLength(1)
    expect(rows[0].lastSeenAt).toBeNull()
  })

  it("overwrites on a later visit", async () => {
    const user = await makeUser("returner")
    const group = await makeGroup("returned", user.id, [user.id])
    const first = new Date("2026-08-28T10:00:00Z")
    const second = new Date("2026-08-28T20:00:00Z")

    await markGroupSeen({ userId: user.id, groupId: group.id, now: first })
    await markGroupSeen({ userId: user.id, groupId: group.id, now: second })

    const membership = await prisma.membership.findUnique({
      where: { userId_groupId: { userId: user.id, groupId: group.id } },
    })
    expect(membership?.lastSeenAt?.toISOString()).toBe(second.toISOString())
  })
})
