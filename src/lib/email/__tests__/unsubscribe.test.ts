// src/lib/email/__tests__/unsubscribe.test.ts
//
// The one door out of the digest. The load-bearing test here is the one
// naming isVerified: unsubscribing must never touch it, because login codes
// are transactional and leave through a different subdomain than digests do.

import { describe, it, expect, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { ensureUnsubscribeToken, unsubscribeByToken } from "../unsubscribe"

const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
const userIds: string[] = []

afterAll(async () => {
  for (const id of userIds) {
    await prisma.contactMethod.deleteMany({ where: { userId: id } }).catch(() => {})
    await prisma.user.delete({ where: { id } }).catch(() => {})
  }
  await prisma.$disconnect()
})

async function makeUser(label: string) {
  const user = await prisma.user.create({
    data: { name: `[TEST] ${label}`, supabaseAuthId: `test-unsubscribe-${label}-${stamp}` },
  })
  userIds.push(user.id)
  return user
}

describe("ensureUnsubscribeToken", () => {
  it("generates a token once and returns the same one afterwards", async () => {
    const user = await makeUser("tokened")

    const first = await ensureUnsubscribeToken(user.id)
    const second = await ensureUnsubscribeToken(user.id)

    expect(first).toHaveLength(36)
    expect(second).toBe(first)
  })

  it("gives two people different tokens", async () => {
    const a = await makeUser("a")
    const b = await makeUser("b")
    expect(await ensureUnsubscribeToken(a.id)).not.toBe(await ensureUnsubscribeToken(b.id))
  })
})

describe("unsubscribeByToken", () => {
  it("records the opt-out", async () => {
    const user = await makeUser("leaver")
    const token = await ensureUnsubscribeToken(user.id)
    const now = new Date("2026-08-28T19:00:00Z")

    await unsubscribeByToken(token, now)

    const after = await prisma.user.findUnique({ where: { id: user.id } })
    expect(after?.digestOptOutAt?.toISOString()).toBe(now.toISOString())
  })

  it("LEAVES THE ADDRESS VERIFIED, so login codes still work", async () => {
    const user = await makeUser("still-signs-in")
    await prisma.contactMethod.create({
      data: { userId: user.id, type: "EMAIL", value: `t-${stamp}@example.com`, isVerified: true },
    })
    const token = await ensureUnsubscribeToken(user.id)

    await unsubscribeByToken(token, new Date())

    const method = await prisma.contactMethod.findFirst({ where: { userId: user.id } })
    expect(method?.isVerified).toBe(true)
  })

  it("is idempotent: a second click keeps the first timestamp", async () => {
    const user = await makeUser("double-clicker")
    const token = await ensureUnsubscribeToken(user.id)
    const first = new Date("2026-08-28T19:00:00Z")

    await unsubscribeByToken(token, first)
    await unsubscribeByToken(token, new Date("2026-08-29T19:00:00Z"))

    const after = await prisma.user.findUnique({ where: { id: user.id } })
    expect(after?.digestOptOutAt?.toISOString()).toBe(first.toISOString())
  })

  it("does nothing and throws nothing for an unknown token", async () => {
    await expect(unsubscribeByToken("not-a-real-token", new Date())).resolves.toBeUndefined()
  })
})
