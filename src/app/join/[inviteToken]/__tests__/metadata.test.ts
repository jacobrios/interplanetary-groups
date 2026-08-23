// src/app/join/[inviteToken]/__tests__/metadata.test.ts
//
// The invite link is the product's entire distribution mechanism, so what it
// looks like in a group text is a product surface. The group's name is in the
// title deliberately (owner's call, 23 Aug 2026): the preview's job is to make
// the recipient trust it enough to tap, and the link is the credential anyway
// — the join screen already shows the group to anyone holding it.
//
// Integration test — hits the real dev database (repo idiom).
import { describe, it, expect, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { generateMetadata } from "../page"

describe("join route metadata", () => {
  const userIds: string[] = []
  const groupIds: string[] = []

  afterAll(async () => {
    for (const id of groupIds) await prisma.group.delete({ where: { id } }).catch(() => {})
    for (const id of userIds) await prisma.user.delete({ where: { id } }).catch(() => {})
    await prisma.$disconnect()
  })

  async function fixture() {
    const founder = await prisma.user.create({
      data: { name: "[TEST] Meta Founder", supabaseAuthId: `test-meta-${Date.now()}-${Math.random()}` },
    })
    userIds.push(founder.id)
    const group = await prisma.group.create({
      data: {
        name: "[TEST] Sunday Climbers",
        founderId: founder.id,
        memberships: { create: [{ userId: founder.id }] },
      },
    })
    groupIds.push(group.id)
    return group
  }

  it("names the group in the title when the token resolves", async () => {
    const group = await fixture()
    const meta = await generateMetadata({
      params: Promise.resolve({ inviteToken: group.inviteToken }),
    })
    expect(meta.title).toContain(group.name)
    expect(meta.openGraph?.title).toContain(group.name)
  })

  it("falls back to the product title for a token that resolves to nothing", async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ inviteToken: "not-a-real-token" }),
    })
    expect(meta.title).toBe("Interplanetary Groups")
  })

  it("says nothing that distinguishes a dead token from a live one", async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ inviteToken: "not-a-real-token" }),
    })
    const blob = JSON.stringify(meta).toLowerCase()
    for (const leak of ["invalid", "expired", "not found", "no longer", "wrong"]) {
      expect(blob).not.toContain(leak)
    }
  })
})
