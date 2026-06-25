// src/lib/messages/__tests__/create.test.ts
//
// Integration tests — hits the real dev database.
// Tests the createMessage lib function that backs the chat feed write path.
import { describe, it, expect, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { MessageAuthor } from "@prisma/client"
import { createMessage } from "../create"

describe("createMessage", () => {
  // Track created IDs for cleanup
  let userId: string
  let groupId: string
  const messageIds: string[] = []

  afterAll(async () => {
    for (const id of messageIds) {
      await prisma.message.delete({ where: { id } }).catch(() => {})
    }
    if (groupId) await prisma.group.delete({ where: { id: groupId } }).catch(() => {})
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {})
    await prisma.$disconnect()
  })

  it("creates a MEMBER message with the correct author and body", async () => {
    // Arrange: a user and group
    const user = await prisma.user.create({
      data: {
        name: "[TEST] Message User",
        supabaseAuthId: `test-msg-member-${Date.now()}`,
      },
    })
    userId = user.id

    const group = await prisma.group.create({
      data: {
        name: "[TEST] Message Group",
        founderId: user.id,
        memberships: { create: { userId: user.id } },
      },
    })
    groupId = group.id

    // Act
    const msg = await createMessage({
      groupId: group.id,
      authorType: MessageAuthor.MEMBER,
      authorId: user.id,
      body: "Hello from a member!",
    })
    messageIds.push(msg.id)

    // Assert
    expect(msg.body).toBe("Hello from a member!")
    expect(msg.authorType).toBe(MessageAuthor.MEMBER)
    expect(msg.authorId).toBe(user.id)
    expect(msg.groupId).toBe(group.id)
    expect(msg.id).toBeTruthy()
    expect(msg.createdAt).toBeInstanceOf(Date)
  })

  it("creates an ORBIT message with null authorId", async () => {
    // Orbit messages have authorType ORBIT and authorId null
    const msg = await createMessage({
      groupId,
      authorType: MessageAuthor.ORBIT,
      authorId: null,
      body: "Welcome to the group!",
    })
    messageIds.push(msg.id)

    expect(msg.authorType).toBe(MessageAuthor.ORBIT)
    expect(msg.authorId).toBeNull()
    expect(msg.body).toBe("Welcome to the group!")
  })

  it("persists the message — a subsequent read returns it", async () => {
    const msg = await createMessage({
      groupId,
      authorType: MessageAuthor.MEMBER,
      authorId: userId,
      body: "Persisted check",
    })
    messageIds.push(msg.id)

    const found = await prisma.message.findUnique({ where: { id: msg.id } })
    expect(found).not.toBeNull()
    expect(found!.body).toBe("Persisted check")
  })

  it("rejects an empty body", async () => {
    await expect(
      createMessage({
        groupId,
        authorType: MessageAuthor.MEMBER,
        authorId: userId,
        body: "   ",
      })
    ).rejects.toThrow("EMPTY_BODY")
  })
})
