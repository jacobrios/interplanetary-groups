// src/lib/email/__tests__/unsubscribe.test.ts
//
// The one door out of the digest. The load-bearing test here is the one
// naming isVerified: unsubscribing must never touch it, because login codes
// are transactional and leave through a different subdomain than digests do.

import { describe, it, expect, afterAll, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import { ensureUnsubscribeToken, unsubscribeByToken, resubscribeByToken } from "../unsubscribe"

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

  it("returns the same token to two concurrent callers, and the row agrees", async () => {
    const user = await makeUser("racer")

    // Two digests composing for the same person at once can both see no
    // token and both try to mint one. A plain Promise.all does not reliably
    // interleave, so this forces it: every prisma.user.findUnique call is
    // held open until a second caller has also reached its own findUnique,
    // which guarantees both callers observe a null token before either one
    // writes. Without this barrier the race is possible but not certain, and
    // an uncertain race is not evidence.
    type FindUniqueFn = typeof prisma.user.findUnique
    const originalFindUnique: FindUniqueFn = prisma.user.findUnique.bind(prisma.user)
    let entered = 0
    let releaseBoth: () => void
    const bothEntered = new Promise<void>((resolve) => {
      releaseBoth = resolve
    })
    // Prisma's findUnique returns Prisma__UserClient, a thenable that also
    // carries relation-navigation methods (.contactMethods(), etc.) this test
    // never calls; every caller below only ever `await`s the result, and
    // `await` unwraps any thenable transparently at runtime. A plain async
    // function honours that contract but cannot be typed as the literal
    // Prisma__UserClient return type (it has no navigation methods to offer),
    // so this cast is the genuine "the type system can't express this, the
    // runtime contract is honoured" case rather than a way to skip checking.
    const spy = vi.spyOn(prisma.user, "findUnique")
    spy.mockImplementation(
      (async (...args: Parameters<FindUniqueFn>) => {
        entered += 1
        if (entered >= 2) releaseBoth()
        await bothEntered
        return originalFindUnique(...args)
      }) as unknown as FindUniqueFn
    )

    try {
      const [first, second] = await Promise.all([
        ensureUnsubscribeToken(user.id),
        ensureUnsubscribeToken(user.id),
      ])

      expect(first).toBe(second)

      const row = await prisma.user.findUnique({ where: { id: user.id } })
      expect(row?.unsubscribeToken).toBe(first)
    } finally {
      spy.mockRestore()
    }
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

describe("resubscribeByToken", () => {
  it("clears the opt-out, the way back in", async () => {
    const user = await makeUser("returning")
    const token = await ensureUnsubscribeToken(user.id)
    await unsubscribeByToken(token, new Date())

    await resubscribeByToken(token)

    const after = await prisma.user.findUnique({ where: { id: user.id } })
    expect(after?.digestOptOutAt).toBeNull()
  })

  it("LEAVES THE ADDRESS VERIFIED, so login codes still work", async () => {
    const user = await makeUser("resub-still-signs-in")
    await prisma.contactMethod.create({
      data: { userId: user.id, type: "EMAIL", value: `t-${stamp}@example.com`, isVerified: true },
    })
    const token = await ensureUnsubscribeToken(user.id)
    await unsubscribeByToken(token, new Date())

    await resubscribeByToken(token)

    const method = await prisma.contactMethod.findFirst({ where: { userId: user.id } })
    expect(method?.isVerified).toBe(true)
  })

  it("does nothing and throws nothing for an unknown token", async () => {
    await expect(resubscribeByToken("not-a-real-token")).resolves.toBeUndefined()
  })

  it("does nothing and throws nothing for someone already subscribed", async () => {
    const user = await makeUser("never-left")
    const token = await ensureUnsubscribeToken(user.id)

    await expect(resubscribeByToken(token)).resolves.toBeUndefined()

    const after = await prisma.user.findUnique({ where: { id: user.id } })
    expect(after?.digestOptOutAt).toBeNull()
  })

  // The round trip the task exists to prove: opting out, opting back in, and
  // opting out again must record a genuinely new timestamp rather than the
  // second unsubscribeByToken silently no-opping because digestOptOutAt was
  // never actually cleared back to null.
  it("lets a second opt-out land its own timestamp after a resubscribe", async () => {
    const user = await makeUser("round-tripper")
    const token = await ensureUnsubscribeToken(user.id)

    const first = new Date("2026-09-01T19:00:00Z")
    await unsubscribeByToken(token, first)

    await resubscribeByToken(token)
    const middle = await prisma.user.findUnique({ where: { id: user.id } })
    expect(middle?.digestOptOutAt).toBeNull()

    const second = new Date("2026-09-02T19:00:00Z")
    await unsubscribeByToken(token, second)

    const after = await prisma.user.findUnique({ where: { id: user.id } })
    expect(after?.digestOptOutAt?.toISOString()).toBe(second.toISOString())
  })
})
