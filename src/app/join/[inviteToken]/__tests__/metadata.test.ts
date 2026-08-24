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

  // Round-1 review finding: Next merges `openGraph` and `twitter` as whole
  // objects per route segment, not field by field. The live-group branch's
  // `openGraph: { title, description }` therefore REPLACED the root layout's
  // openGraph object outright, image included, while the dead-token branch
  // (which set no openGraph key at all) kept the parent's image by
  // accident. That made a live and a dead link structurally
  // distinguishable by the presence of the image and the card type, which
  // is the exact leak the wording test above cannot see because it only
  // inspects strings. This test asserts on shape and on an actual image
  // being present, not merely on the two branches happening to agree.
  it("gives a live token the same Open Graph image and card shape as a dead one", async () => {
    const group = await fixture()
    const live = await generateMetadata({
      params: Promise.resolve({ inviteToken: group.inviteToken }),
    })
    const dead = await generateMetadata({
      params: Promise.resolve({ inviteToken: "not-a-real-token" }),
    })

    // Metadata['openGraph'] and ['twitter'] are typed as discriminated unions
    // (article/website/... and summary/summary_large_image/...) whose common
    // base type carries neither `type` nor `card`. The "in" guards below are
    // the same narrowing style already used for `images` just above; they
    // read the field when it is there and read as undefined otherwise,
    // rather than widening the assertions with a blanket `any` cast.
    const liveImages = live.openGraph && "images" in live.openGraph ? live.openGraph.images : undefined
    const deadImages = dead.openGraph && "images" in dead.openGraph ? dead.openGraph.images : undefined
    const liveOgType = live.openGraph && "type" in live.openGraph ? live.openGraph.type : undefined
    const deadOgType = dead.openGraph && "type" in dead.openGraph ? dead.openGraph.type : undefined
    const liveCard = live.twitter && "card" in live.twitter ? live.twitter.card : undefined
    const deadCard = dead.twitter && "card" in dead.twitter ? dead.twitter.card : undefined

    // An actual image, not just "the field exists and is empty".
    expect(liveImages).toBeTruthy()
    expect(Array.isArray(liveImages) ? liveImages.length > 0 : Boolean(liveImages)).toBe(true)

    expect(JSON.stringify(liveImages)).toBe(JSON.stringify(deadImages))
    expect(liveOgType).toBe("website")
    expect(liveOgType).toBe(deadOgType)
    expect(live.openGraph?.siteName).toBe(dead.openGraph?.siteName)
    expect(liveCard).toBe("summary_large_image")
    expect(liveCard).toBe(deadCard)
  })
})
