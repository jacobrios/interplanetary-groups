// src/app/api/unsubscribe/[token]/__tests__/route.test.ts
//
// Integration test, real dev-test database (repo idiom, no mocks on the
// write path): this is the endpoint List-Unsubscribe now points at, and the
// one Gmail's one-click POST will actually hit, so the thing worth proving
// is the real write landing, not a mocked call shape.

import { describe, it, expect, afterAll } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { ensureUnsubscribeToken } from "@/lib/email/unsubscribe"
import { POST, GET } from "../route"

const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
const userIds: string[] = []

afterAll(async () => {
  for (const id of userIds) {
    await prisma.contactMethod.deleteMany({ where: { userId: id } }).catch(() => {})
    await prisma.user.delete({ where: { id } }).catch(() => {})
  }
  await prisma.$disconnect()
})

async function makeUserWithToken(label: string) {
  const user = await prisma.user.create({
    data: { name: `[TEST] ${label}`, supabaseAuthId: `test-unsub-route-${label}-${stamp}` },
  })
  userIds.push(user.id)
  const token = await ensureUnsubscribeToken(user.id)
  return { user, token }
}

function postTo(token: string) {
  return POST(new NextRequest(`http://localhost:3000/api/unsubscribe/${token}`, { method: "POST" }), {
    params: Promise.resolve({ token }),
  })
}

function getTo(token: string) {
  return GET(new NextRequest(`http://localhost:3000/api/unsubscribe/${token}`), {
    params: Promise.resolve({ token }),
  })
}

describe("POST /api/unsubscribe/[token]", () => {
  it("writes the opt-out and returns 200 with an empty body", async () => {
    const { user, token } = await makeUserWithToken("clicker")

    const response = await postTo(token)

    expect(response.status).toBe(200)
    expect(await response.text()).toBe("")
    const after = await prisma.user.findUnique({ where: { id: user.id } })
    expect(after?.digestOptOutAt).not.toBeNull()
  })

  // The security property this route exists to hold up: a stranger holding a
  // guessed token must not be able to tell a real token from a fake one by
  // the response, so an unknown token gets the identical 200/empty answer.
  it("returns 200 and writes nothing for a token nobody has", async () => {
    const response = await postTo("no-such-token-anyone-holds")

    expect(response.status).toBe(200)
    expect(await response.text()).toBe("")
  })

  it("does not overwrite the first opt-out timestamp on a second click", async () => {
    const { user, token } = await makeUserWithToken("double-clicker")

    await postTo(token)
    const firstRow = await prisma.user.findUnique({ where: { id: user.id } })
    const firstStamp = firstRow?.digestOptOutAt?.toISOString()

    await postTo(token)
    const secondRow = await prisma.user.findUnique({ where: { id: user.id } })

    expect(secondRow?.digestOptOutAt?.toISOString()).toBe(firstStamp)
  })

  // The load-bearing pin this route's own test file must not weaken:
  // unsubscribing goes through the same unsubscribeByToken the lib-level
  // suite already proves never touches ContactMethod.isVerified, and this
  // route calls nothing else. Re-asserted here, at the boundary an actual
  // mail client hits, rather than trusted by inference from the other file.
  it("leaves the address verified, so login codes still work", async () => {
    const { user, token } = await makeUserWithToken("still-signs-in")
    await prisma.contactMethod.create({
      data: { userId: user.id, type: "EMAIL", value: `t-${stamp}@example.com`, isVerified: true },
    })

    await postTo(token)

    const method = await prisma.contactMethod.findFirst({ where: { userId: user.id } })
    expect(method?.isVerified).toBe(true)
  })
})

describe("GET /api/unsubscribe/[token]", () => {
  it("redirects to the real unsubscribe page with the same token", async () => {
    const response = await getTo("tok_whatever")

    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe("http://localhost:3000/unsubscribe/tok_whatever")
  })
})
