import { describe, it, expect, afterEach, beforeEach } from "vitest"
import { prisma } from "@/lib/prisma"
import { MessageAuthor, ProposalAnswer } from "@prisma/client"
import { createChangeProposal } from "../create"
import { findLiveProposals } from "../read"

let userId: string | null = null
let groupId: string | null = null
let eventId: string | null = null
let sourceMessageId: string | null = null

const EVENT_START = new Date("2099-06-14T08:00:00Z")
const PROPOSED = new Date("2099-06-14T18:00:00Z")
const NOW = new Date("2099-06-10T12:00:00Z")

async function cleanup() {
  if (groupId) {
    await prisma.changeProposal.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.message.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.event.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.membership.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.group.delete({ where: { id: groupId } }).catch(() => {})
    groupId = null
  }
  if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {})
  userId = null
}

afterEach(async () => {
  await cleanup()
  await prisma.$disconnect()
})

beforeEach(async () => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  const user = await prisma.user.create({
    data: { name: "[TEST] Asker", supabaseAuthId: `test-prop-${suffix}` },
  })
  userId = user.id
  const group = await prisma.group.create({
    data: {
      name: "[TEST] Proposal Group",
      founderId: user.id,
      timeZone: "UTC",
      recurringActivities: [] as never,
      memberships: { create: { userId: user.id } },
    },
  })
  groupId = group.id
  const event = await prisma.event.create({
    data: { groupId: group.id, title: "Climbing", activityLabel: "climbing", startsAt: EVENT_START },
  })
  eventId = event.id
  const source = await prisma.message.create({
    data: { groupId: group.id, authorType: MessageAuthor.MEMBER, authorId: user.id, body: "9?" },
  })
  sourceMessageId = source.id
})

function input() {
  return {
    groupId: groupId!,
    eventId: eventId!,
    askerUserId: userId!,
    sourceMessageId: sourceMessageId!,
    proposedStartsAt: PROPOSED,
    priorStartsAt: EVENT_START,
    body: "Sounds like you want climbing this Sun moved to 6pm. Want me to make the change?",
  }
}

describe("createChangeProposal", () => {
  it("creates the proposal and Orbit's question in one transaction", async () => {
    const result = await createChangeProposal(input())
    if (result.status !== "created") throw new Error("expected created")
    const orbit = await prisma.message.findUnique({
      where: { id: result.proposal.orbitMessageId },
    })
    expect(orbit).toMatchObject({ authorType: MessageAuthor.ORBIT, authorId: null })
    expect(orbit?.body).toContain("Want me to make the change?")
  })

  it("a double-fired detection collides on the source message and skips", async () => {
    await createChangeProposal(input())
    const second = await createChangeProposal(input())
    expect(second).toEqual({ status: "skipped", reason: "already_asked" })
    expect(await prisma.message.count({ where: { groupId: groupId!, authorType: "ORBIT" } })).toBe(1)
  })
})

describe("findLiveProposals", () => {
  it("returns an unanswered, unstale, upcoming proposal", async () => {
    await createChangeProposal(input())
    const live = await findLiveProposals(groupId!, NOW)
    expect(live).toHaveLength(1)
    expect(live[0].askerUserId).toBe(userId)
  })

  it("an answered proposal is not live", async () => {
    const r = await createChangeProposal(input())
    if (r.status !== "created") throw new Error("expected created")
    await prisma.changeProposal.update({
      where: { id: r.proposal.id },
      data: { answer: ProposalAnswer.DECLINED, answeredAt: new Date() },
    })
    expect(await findLiveProposals(groupId!, NOW)).toHaveLength(0)
  })

  it("a proposal goes stale when the event's time changed underneath it", async () => {
    await createChangeProposal(input())
    await prisma.event.update({
      where: { id: eventId! },
      data: { startsAt: new Date("2099-06-14T10:00:00Z") },
    })
    expect(await findLiveProposals(groupId!, NOW)).toHaveLength(0)
  })

  it("a proposal dies when its event has started", async () => {
    await createChangeProposal(input())
    const afterStart = new Date("2099-06-14T09:00:00Z")
    expect(await findLiveProposals(groupId!, afterStart)).toHaveLength(0)
  })

  it("a proposal whose proposed time has already passed is not live", async () => {
    // The event itself is still upcoming (08:00 > 06:00 "now"), but the time
    // this proposal asked to move to (05:00) is behind "now": confirming it
    // would move the plan into the past, so it must stop being answerable.
    await createChangeProposal({
      ...input(),
      proposedStartsAt: new Date("2099-06-14T05:00:00Z"),
    })
    const now = new Date("2099-06-14T06:00:00Z")
    expect(await findLiveProposals(groupId!, now)).toHaveLength(0)
  })
})
