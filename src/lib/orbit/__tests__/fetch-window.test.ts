import { describe, it, expect, afterAll } from "vitest"
import { MessageAuthor } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { fetchPriorWindow } from "../fetch-window"

describe("fetchPriorWindow", () => {
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

  it("returns member and Orbit lines oldest first and excludes SYSTEM rows", async () => {
    const founder = await prisma.user.create({
      data: {
        name: "[TEST] Window Founder",
        supabaseAuthId: `test-window-${Date.now()}`,
      },
    })
    const group = await prisma.group.create({
      data: { name: "[TEST] Window Group", founderId: founder.id },
    })
    groupIds.push(group.id)
    userIds.push(founder.id)

    // Explicit createdAt values so ordering never rides on same-ms ties.
    const base = Date.now() - 60_000
    await prisma.message.create({
      data: {
        groupId: group.id,
        authorType: MessageAuthor.MEMBER,
        authorId: founder.id,
        body: "member line",
        createdAt: new Date(base),
      },
    })
    await prisma.message.create({
      data: {
        groupId: group.id,
        authorType: MessageAuthor.SYSTEM,
        authorId: null,
        body: "[TEST] Jesse joined",
        createdAt: new Date(base + 1000),
      },
    })
    await prisma.message.create({
      data: {
        groupId: group.id,
        authorType: MessageAuthor.ORBIT,
        authorId: null,
        body: "orbit line",
        createdAt: new Date(base + 2000),
      },
    })
    const trigger = await prisma.message.create({
      data: {
        groupId: group.id,
        authorType: MessageAuthor.MEMBER,
        authorId: founder.id,
        body: "trigger line",
        createdAt: new Date(base + 3000),
      },
    })

    const window = await fetchPriorWindow(group.id, trigger)

    expect(window.map((m) => m.body)).toEqual(["member line", "orbit line"])
    expect(window[0].authorName).toBe("[TEST] Window Founder")
    expect(window[1].isOrbit).toBe(true)
  })
})
