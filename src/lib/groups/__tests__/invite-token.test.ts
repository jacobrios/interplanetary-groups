// src/lib/groups/__tests__/invite-token.test.ts
//
// The invite link is the whole credential to a group, so the token behind it
// must be cryptographically random, and it must be the SAME shape whether it
// came from group creation or from the founder tapping "Reset link". The two
// paths disagreed until 23 Aug 2026 (pre-launch audit, finding 3): creation
// used cuid() and reset used randomUUID().
//
// Integration test — hits the real dev database (repo idiom).
import { describe, it, expect, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { provisionFounderGroup } from "../provision"
import { resetInviteToken } from "../reset-invite"

// RFC 4122 version 4: 8-4-4-4-12 hex, with the version nibble pinned to 4 and
// the variant nibble to 8/9/a/b. A cuid ("c" + 24 lowercase alphanumerics)
// cannot match this, which is what makes the assertion able to fail.
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe("invite token generation", () => {
  const userIds: string[] = []
  const groupIds: string[] = []

  afterAll(async () => {
    for (const id of groupIds) {
      await prisma.group.delete({ where: { id } }).catch(() => {})
    }
    for (const id of userIds) {
      await prisma.user.delete({ where: { id } }).catch(() => {})
    }
    await prisma.$disconnect()
  })

  async function makeGroup(tag: string) {
    const { user, group } = await provisionFounderGroup({
      supabaseAuthId: `test-invite-${tag}-${Date.now()}-${Math.random()}`,
      founderName: "[TEST] Token Founder",
      groupName: "[TEST] Token Group",
    })
    userIds.push(user.id)
    groupIds.push(group.id)
    return group
  }

  it("mints a cryptographically random token at group creation", async () => {
    const group = await makeGroup("create")
    expect(group.inviteToken).toMatch(UUID_V4)
  })

  it("mints the same shape at creation as the reset path does", async () => {
    const group = await makeGroup("reset")
    const founder = await prisma.user.findUnique({ where: { id: group.founderId } })
    const rotated = await resetInviteToken({
      supabaseAuthId: founder!.supabaseAuthId!,
      groupId: group.id,
    })

    expect(rotated).toMatch(UUID_V4)
    expect(rotated).not.toBe(group.inviteToken)
  })

  it("does not repeat a token across two groups created back to back", async () => {
    const a = await makeGroup("uniq-a")
    const b = await makeGroup("uniq-b")
    expect(a.inviteToken).not.toBe(b.inviteToken)
  })
})
