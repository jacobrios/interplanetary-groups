// src/lib/messages/__tests__/create-membership.test.ts
import { describe, it, expect, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { MessageAuthor } from "@prisma/client"
import { createMessage } from "../create"

describe("createMessage membership gate", () => {
  const groupIds: string[] = []
  const userIds: string[] = []

  afterAll(async () => {
    for (const id of groupIds) {
      await prisma.message.deleteMany({ where: { groupId: id } }).catch(() => {})
      await prisma.group.delete({ where: { id } }).catch(() => {})
    }
    for (const id of userIds) {
      await prisma.user.delete({ where: { id } }).catch(() => {})
    }
    await prisma.$disconnect()
  })

  async function fixture() {
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const founder = await prisma.user.create({
      data: { name: "[TEST] Msg Founder", supabaseAuthId: `test-msg-f-${stamp}` },
    })
    const outsider = await prisma.user.create({
      data: { name: "[TEST] Msg Outsider", supabaseAuthId: `test-msg-o-${stamp}` },
    })
    const group = await prisma.group.create({
      data: {
        name: "[TEST] Msg Group",
        founderId: founder.id,
        memberships: { create: [{ userId: founder.id }] },
      },
    })
    groupIds.push(group.id)
    userIds.push(founder.id, outsider.id)
    return { founder, outsider, group }
  }

  it("refuses a MEMBER message from a non-member", async () => {
    const { outsider, group } = await fixture()
    await expect(
      createMessage({
        groupId: group.id,
        authorType: MessageAuthor.MEMBER,
        authorId: outsider.id,
        body: "hello from outside",
      })
    ).rejects.toThrow("NOT_A_MEMBER")
    const count = await prisma.message.count({ where: { groupId: group.id } })
    expect(count).toBe(0)
  })

  it("still writes a member's message and Orbit's own", async () => {
    const { founder, group } = await fixture()
    const memberMsg = await createMessage({
      groupId: group.id,
      authorType: MessageAuthor.MEMBER,
      authorId: founder.id,
      body: "hello from inside",
    })
    expect(memberMsg.id).toBeTruthy()
    const orbitMsg = await createMessage({
      groupId: group.id,
      authorType: MessageAuthor.ORBIT,
      authorId: null,
      body: "Orbit speaking",
    })
    expect(orbitMsg.id).toBeTruthy()
  })
})
