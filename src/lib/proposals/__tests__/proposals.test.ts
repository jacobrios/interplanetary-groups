import { describe, it, expect, afterEach, beforeEach } from "vitest"
import { prisma } from "@/lib/prisma"
import {
  EventStatus,
  MessageAuthor,
  ProposalAnswer,
  ProposalVoteAnswer,
} from "@prisma/client"
import { createChangeProposal, createGroupProposal } from "../create"
import { findLiveProposals } from "../read"

let userId: string | null = null
let otherUserId: string | null = null
let groupId: string | null = null
let eventId: string | null = null
let otherEventId: string | null = null
let sourceMessageId: string | null = null

const EVENT_START = new Date("2099-06-14T08:00:00Z")
const OTHER_EVENT_START = new Date("2099-06-20T20:00:00Z")
const PROPOSED = new Date("2099-06-14T18:00:00Z")
const NOW = new Date("2099-06-10T12:00:00Z")

async function cleanup() {
  if (groupId) {
    // Votes cascade from ChangeProposal at the DB level, but clean them up
    // explicitly first: proving the cleanup order deletes everything rather
    // than trusting the cascade silently, per the task-6 brief.
    const proposals = await prisma.changeProposal
      .findMany({ where: { groupId }, select: { id: true } })
      .catch(() => [] as { id: string }[])
    if (proposals.length) {
      await prisma.proposalVote
        .deleteMany({ where: { proposalId: { in: proposals.map((p) => p.id) } } })
        .catch(() => {})
    }
    await prisma.changeProposal.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.rsvp.deleteMany({ where: { event: { groupId } } }).catch(() => {})
    await prisma.message.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.event.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.membership.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.group.delete({ where: { id: groupId } }).catch(() => {})
    groupId = null
  }
  if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {})
  userId = null
  if (otherUserId) await prisma.user.delete({ where: { id: otherUserId } }).catch(() => {})
  otherUserId = null
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
  const other = await prisma.user.create({
    data: { name: "[TEST] Other Asker", supabaseAuthId: `test-prop-other-${suffix}` },
  })
  otherUserId = other.id
  const group = await prisma.group.create({
    data: {
      name: "[TEST] Proposal Group",
      founderId: user.id,
      timeZone: "UTC",
      recurringActivities: [] as never,
      memberships: {
        create: [{ userId: user.id }, { userId: other.id }],
      },
    },
  })
  groupId = group.id
  const event = await prisma.event.create({
    data: { groupId: group.id, title: "Climbing", activityLabel: "climbing", startsAt: EVENT_START },
  })
  eventId = event.id
  const otherEvent = await prisma.event.create({
    data: { groupId: group.id, title: "Beers", activityLabel: "beers", startsAt: OTHER_EVENT_START },
  })
  otherEventId = otherEvent.id
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

/**
 * The createGroupProposal fixture builder. Defaults to the same asker, event,
 * and source message as `input()`. Each flag swaps in a different fixture so
 * a test can independently vary the axes the supersede rule cares about
 * (event, asker) without colliding on the (sourceMessageId, kind) unique,
 * which is why a differing axis is always paired with otherSourceMessage
 * unless the test wants the collision.
 */
async function baseInput(
  opts: { otherSourceMessage?: boolean; otherAsker?: boolean; otherEvent?: boolean } = {}
) {
  const asker = opts.otherAsker ? otherUserId! : userId!
  let sourceMsgId = sourceMessageId!
  if (opts.otherSourceMessage) {
    const msg = await prisma.message.create({
      data: { groupId: groupId!, authorType: MessageAuthor.MEMBER, authorId: asker, body: "9?" },
    })
    sourceMsgId = msg.id
  }
  return {
    groupId: groupId!,
    eventId: opts.otherEvent ? otherEventId! : eventId!,
    askerUserId: asker,
    sourceMessageId: sourceMsgId,
    proposedStartsAt: opts.otherEvent ? new Date("2099-06-20T21:00:00Z") : PROPOSED,
    priorStartsAt: opts.otherEvent ? OTHER_EVENT_START : EVENT_START,
    body: "Sounds like you want this moved. Sound good to everyone?",
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

describe("createGroupProposal", () => {
  it("creates message, GROUP proposal, and the asker's seeded YES in one shape", async () => {
    const r = await createGroupProposal(await baseInput())
    expect(r.status).toBe("created")
    if (r.status !== "created") throw new Error("expected created")
    const votes = await prisma.proposalVote.findMany({ where: { proposalId: r.proposal.id } })
    expect(votes).toHaveLength(1)
    expect(votes[0]).toMatchObject({ userId: userId, answer: "YES" })
    const orbitMsg = await prisma.message.findUnique({ where: { id: r.proposal.orbitMessageId } })
    expect(orbitMsg).toMatchObject({ authorType: MessageAuthor.ORBIT, authorId: null })
  })

  it("double-fire on the same source message skips (compound key, kind GROUP)", async () => {
    const first = await createGroupProposal(await baseInput())
    if (first.status !== "created") throw new Error("expected created")
    const second = await createGroupProposal(await baseInput())
    expect(second).toEqual({ status: "skipped", reason: "already_asked" })
    // The second call's transaction supersedes the first proposal via
    // updateMany BEFORE it collides on the compound unique. If the rollback
    // silently failed, the first proposal would be stuck at SUPERSEDED with
    // this test none the wiser, so assert the rollback actually happened.
    const firstAfter = await prisma.changeProposal.findUnique({ where: { id: first.proposal.id } })
    expect(firstAfter?.answer).toBeNull()
    // And the failed second call must not have left an orphan Orbit message
    // behind (the createChangeProposal double-fire test above pins the same
    // thing for the VERIFY path).
    expect(await prisma.message.count({ where: { groupId: groupId!, authorType: "ORBIT" } })).toBe(1)
  })

  it("a VERIFY and a GROUP row can share a source message (the handoff)", async () => {
    const priorVerify = await createChangeProposal(input())
    if (priorVerify.status !== "created") throw new Error("expected created")
    const r = await createGroupProposal({ ...(await baseInput()), resolveVerifyProposalId: priorVerify.proposal.id })
    expect(r.status).toBe("created")
    const verify = await prisma.changeProposal.findUnique({ where: { id: priorVerify.proposal.id } })
    expect(verify?.answer).toBe("CONFIRMED")
  })

  it("newest wins per event: a live GROUP proposal on the event is stamped SUPERSEDED", async () => {
    const first = await createGroupProposal(await baseInput())
    if (first.status !== "created") throw new Error("expected created")
    const second = await createGroupProposal(await baseInput({ otherSourceMessage: true, otherAsker: true }))
    const old = await prisma.changeProposal.findUnique({ where: { id: first.proposal.id } })
    expect(old?.answer).toBe("SUPERSEDED")
    expect(second.status).toBe("created")
  })

  it("newest wins per asker: the asker's live proposal on ANOTHER event is superseded too", async () => {
    const onClimbing = await createGroupProposal(await baseInput())
    if (onClimbing.status !== "created") throw new Error("expected created")
    const onBeers = await createGroupProposal(await baseInput({ otherEvent: true, otherSourceMessage: true }))
    const old = await prisma.changeProposal.findUnique({ where: { id: onClimbing.proposal.id } })
    expect(old?.answer).toBe("SUPERSEDED")
    expect(onBeers.status).toBe("created")
  })

  it("someone else's live proposal on a DIFFERENT event is left alone", async () => {
    const first = await createGroupProposal(await baseInput())
    if (first.status !== "created") throw new Error("expected created")
    const second = await createGroupProposal(
      await baseInput({ otherAsker: true, otherEvent: true, otherSourceMessage: true })
    )
    const old = await prisma.changeProposal.findUnique({ where: { id: first.proposal.id } })
    expect(old?.answer).toBeNull()
    expect(second.status).toBe("created")
  })

  it("aborts, whole transaction included, when the event moved underneath a stale confirm", async () => {
    // The verify-confirm handoff race: the asker was shown priorStartsAt, but
    // the plan actually moved before their confirm reached createGroupProposal
    // (simulated here by moving the event by hand). Defense in depth for the
    // guard proposal-answer.ts adds at the action layer: this must never post
    // a group question stating a wrong fact, no matter what called it.
    await prisma.event.update({
      where: { id: eventId! },
      data: { startsAt: new Date("2099-06-14T09:00:00Z") },
    })

    // A live proposal of the asker's, on another event, stands in for "the
    // supersede sweep must roll back too": if the transaction only aborted
    // the create but let the sweep's updateMany stand, this would come back
    // SUPERSEDED even though nothing new was actually asked.
    const otherSource = await prisma.message.create({
      data: { groupId: groupId!, authorType: MessageAuthor.MEMBER, authorId: userId!, body: "beers 9?" },
    })
    const askersOtherLive = await createChangeProposal({
      ...input(),
      eventId: otherEventId!,
      priorStartsAt: OTHER_EVENT_START,
      sourceMessageId: otherSource.id,
    })
    if (askersOtherLive.status !== "created") throw new Error("expected created")

    const countBefore = await prisma.changeProposal.count({ where: { groupId: groupId! } })
    const orbitBefore = await prisma.message.count({ where: { groupId: groupId!, authorType: "ORBIT" } })

    const result = await createGroupProposal(await baseInput())
    expect(result).toEqual({ status: "skipped", reason: "stale" })

    expect(await prisma.changeProposal.count({ where: { groupId: groupId! } })).toBe(countBefore)
    expect(await prisma.message.count({ where: { groupId: groupId!, authorType: "ORBIT" } })).toBe(orbitBefore)

    const otherLiveAfter = await prisma.changeProposal.findUnique({
      where: { id: askersOtherLive.proposal.id },
    })
    expect(otherLiveAfter?.answer).toBeNull() // supersede rolled back
  })

  it("refuses to open a time-change vote on a plan that has been called off", async () => {
    await prisma.event.update({
      where: { id: eventId! },
      data: { status: EventStatus.CANCELLED, cancelledAt: new Date() },
    })

    // A called-off plan hits the same in-tx guard as a stale priorStartsAt:
    // the internal StaleEventInTx throw is caught by this function's own
    // catch block and surfaces as the same "skipped"/"stale" shape the
    // mismatched-timestamp case above already asserts, not as a rejection.
    const result = await createGroupProposal(await baseInput())
    expect(result).toEqual({ status: "skipped", reason: "stale" })

    const proposals = await prisma.changeProposal.findMany({ where: { eventId: eventId! } })
    expect(proposals).toHaveLength(0)
  })

  it("opens a GROUP proposal with no source message", async () => {
    const result = await createGroupProposal({
      groupId: groupId!,
      eventId: eventId!,
      askerUserId: userId!,
      sourceMessageId: null,
      proposedStartsAt: PROPOSED,
      priorStartsAt: EVENT_START,
      body: "[TEST] ask",
    })
    expect(result.status).toBe("created")
    if (result.status !== "created") return
    expect(result.proposal.sourceMessageId).toBeNull()
    const votes = await prisma.proposalVote.findMany({ where: { proposalId: result.proposal.id } })
    expect(votes.map((v) => v.userId)).toEqual([userId])
  })

  it("a double-submitted card ask with no source message opens once", async () => {
    const cardInput = {
      groupId: groupId!,
      eventId: eventId!,
      askerUserId: userId!,
      sourceMessageId: null,
      proposedStartsAt: PROPOSED,
      priorStartsAt: EVENT_START,
      body: "[TEST] ask",
    }
    const first = await createGroupProposal(cardInput)
    const second = await createGroupProposal(cardInput)
    expect(first.status).toBe("created")
    expect(second).toEqual({ status: "skipped", reason: "already_asked" })
    expect(await prisma.changeProposal.count({ where: { eventId: eventId!, answer: null } })).toBe(1)
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

  it("a SUPERSEDED proposal is not live", async () => {
    const first = await createGroupProposal(await baseInput())
    if (first.status !== "created") throw new Error("expected created")
    await createGroupProposal(await baseInput({ otherSourceMessage: true, otherAsker: true }))
    const live = await findLiveProposals(groupId!, NOW)
    expect(live.map((p) => p.id)).not.toContain(first.proposal.id)
  })

  it("does not report a live vote on a plan that has been called off", async () => {
    const r = await createGroupProposal(await baseInput())
    if (r.status !== "created") throw new Error("expected created")
    await prisma.event.update({
      where: { id: eventId! },
      data: { status: EventStatus.CANCELLED, cancelledAt: new Date() },
    })

    // Belt and braces beside the supersede inside cancelEvent: a proposal
    // opened in the same second as a cancellation must not keep asking the
    // group to move a game that is off.
    const live = await findLiveProposals(groupId!, NOW)
    expect(live).toHaveLength(0)
  })

  it("returned rows carry votes (with user), asker, and event.rsvps", async () => {
    const r = await createGroupProposal(await baseInput())
    if (r.status !== "created") throw new Error("expected created")
    await prisma.rsvp.create({ data: { eventId: eventId!, userId: userId!, status: "IN" } })

    const live = await findLiveProposals(groupId!, NOW)
    expect(live).toHaveLength(1)
    expect(live[0].votes).toHaveLength(1)
    expect(live[0].votes[0]).toMatchObject({ userId: userId, answer: ProposalVoteAnswer.YES })
    expect(live[0].votes[0].user).toMatchObject({ id: userId })
    expect(live[0].asker).toMatchObject({ id: userId })
    expect(live[0].event.rsvps).toHaveLength(1)
    expect(live[0].event.rsvps[0]).toMatchObject({ userId: userId, status: "IN" })
  })
})
