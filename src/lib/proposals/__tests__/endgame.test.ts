// src/lib/proposals/__tests__/endgame.test.ts
//
// Integration tests for runProposalEndgame — hits the real dev DB.
//
// EVERY call here is scoped with { groupId }. Do not remove that, and do not
// add an unscoped `runProposalEndgame(NOW)` back.
//
// The dev-test database is shared, and an unscoped sweep does not just read
// it: it posts a real Orbit closure message, and writes a real answer +
// answeredAt, onto every open group proposal in every group that has one.
// This file only cleans up rows in its own fixture groups. Those leak
// permanently, and because every fixture date here is in 2099, the leaked
// closures would sit there looking exactly like real Orbit activity to anyone
// who queries the group later. reconcile.test.ts and endgame.test.ts (the
// gauge sweep) both paid for this lesson already; see their headers.
//
// Cleanup order (FK constraints):
//   ProposalVote (proposalId — cascades from ChangeProposal, deleted
//     explicitly anyway, proving the order rather than trusting the cascade)
//   → ChangeProposal (groupId) → Message (groupId) → Event (groupId)
//   → Membership (groupId) → Group (founderId) → User

import { describe, it, expect, afterEach, beforeEach } from "vitest"
import { prisma } from "@/lib/prisma"
import { MessageAuthor, ProposalAnswer, ProposalKind } from "@prisma/client"
import { runProposalEndgame } from "../endgame"

// Fixtures in UTC so wall time and instant read the same in assertions.
const NOW = new Date("2099-06-10T12:00:00Z")
const FUTURE_START = new Date("2099-06-14T08:00:00Z") // after NOW
const FUTURE_PROPOSED = new Date("2099-06-14T18:00:00Z") // after NOW
const PAST_PROPOSED = new Date("2099-06-09T18:00:00Z") // before NOW
const PAST_START = new Date("2099-06-09T08:00:00Z") // before NOW

let userIds: string[] = []
let groupId: string | null = null

async function cleanup() {
  if (groupId) {
    const proposals = await prisma.changeProposal
      .findMany({ where: { groupId }, select: { id: true } })
      .catch(() => [] as { id: string }[])
    if (proposals.length) {
      await prisma.proposalVote
        .deleteMany({ where: { proposalId: { in: proposals.map((p) => p.id) } } })
        .catch(() => {})
    }
    await prisma.changeProposal.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.message.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.event.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.membership.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.group.delete({ where: { id: groupId } }).catch(() => {})
    groupId = null
  }
  for (const id of userIds) {
    await prisma.user.delete({ where: { id } }).catch(() => {})
  }
  userIds = []
}

afterEach(async () => {
  await cleanup()
  await prisma.$disconnect()
})

beforeEach(async () => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  const user = await prisma.user.create({
    data: { name: "[TEST] Prop Endgame", supabaseAuthId: `test-prop-endgame-${suffix}` },
  })
  userIds.push(user.id)
  const group = await prisma.group.create({
    data: {
      name: "[TEST] Prop Endgame Group",
      founderId: user.id,
      timeZone: "UTC",
      memberships: { create: [{ userId: user.id }] },
    },
  })
  groupId = group.id
})

/**
 * A proposal built directly (not through createGroupProposal), so every
 * timestamp — the event's start, the proposal's prior and proposed times —
 * is explicit and under the test's control, the same reasoning as the gauge
 * endgame's makeGauge builder.
 */
async function makeProposal(opts: {
  eventStartsAt: Date
  priorStartsAt: Date
  proposedStartsAt: Date
  kind?: ProposalKind
  answer?: ProposalAnswer
}) {
  const event = await prisma.event.create({
    data: {
      groupId: groupId!,
      title: "Climbing",
      activityLabel: "climbing",
      startsAt: opts.eventStartsAt,
    },
  })
  const source = await prisma.message.create({
    data: {
      groupId: groupId!,
      authorType: MessageAuthor.MEMBER,
      authorId: userIds[0],
      body: "can we move climbing?",
    },
  })
  const orbitMsg = await prisma.message.create({
    data: {
      groupId: groupId!,
      authorType: MessageAuthor.ORBIT,
      authorId: null,
      body: "Sam wants climbing at 6pm instead of 8am. Works for you?",
    },
  })
  const proposal = await prisma.changeProposal.create({
    data: {
      groupId: groupId!,
      eventId: event.id,
      askerUserId: userIds[0],
      sourceMessageId: source.id,
      orbitMessageId: orbitMsg.id,
      proposedStartsAt: opts.proposedStartsAt,
      priorStartsAt: opts.priorStartsAt,
      kind: opts.kind ?? ProposalKind.GROUP,
      ...(opts.answer ? { answer: opts.answer, answeredAt: NOW } : {}),
    },
  })
  return { proposal, event }
}

/** Orbit messages in the fixture group carrying the lapse copy. */
async function closureMessages() {
  return prisma.message.findMany({
    where: {
      groupId: groupId!,
      authorType: MessageAuthor.ORBIT,
      body: { contains: "didn't come together" },
    },
  })
}

describe("runProposalEndgame", () => {
  it("lapses a proposal whose proposed time has passed: LAPSED + one message with the exact copy", async () => {
    // Proposed time passed first; the event itself is still ahead.
    const { proposal } = await makeProposal({
      eventStartsAt: FUTURE_START,
      priorStartsAt: FUTURE_START,
      proposedStartsAt: PAST_PROPOSED,
    })

    const results = await runProposalEndgame(NOW, { groupId: groupId! })
    expect(results).toEqual([{ proposalId: proposal.id, action: "lapsed" }])

    const after = await prisma.changeProposal.findUnique({ where: { id: proposal.id } })
    expect(after?.answer).toBe(ProposalAnswer.LAPSED)
    expect(after?.answeredAt).not.toBeNull()

    const messages = await closureMessages()
    expect(messages).toHaveLength(1)
    // priorStartsAt is 8am UTC, the group zone is UTC, label caps to "Climbing".
    expect(messages[0].body).toBe(
      "The time change didn't come together. Climbing is staying at 8am."
    )
    expect(messages[0].authorId).toBeNull()
  })

  it("lapses a proposal whose event has started, even with the proposed time still ahead", async () => {
    // The other ordering of min(proposedStartsAt, event.startsAt): the event
    // start passes first. A vote to move a plan that already began is dead.
    const { proposal } = await makeProposal({
      eventStartsAt: PAST_START,
      priorStartsAt: PAST_START,
      proposedStartsAt: FUTURE_PROPOSED,
    })

    const results = await runProposalEndgame(NOW, { groupId: groupId! })
    expect(results).toEqual([{ proposalId: proposal.id, action: "lapsed" }])

    const after = await prisma.changeProposal.findUnique({ where: { id: proposal.id } })
    expect(after?.answer).toBe(ProposalAnswer.LAPSED)
    expect(await closureMessages()).toHaveLength(1)
  })

  it("supersedes a moot proposal silently: the plan moved some other way", async () => {
    // priorStartsAt no longer matches the event's startsAt; the question was
    // silently retired by the read layer already, and the sweep only adds the
    // bookkeeping row. No message.
    const { proposal } = await makeProposal({
      eventStartsAt: new Date("2099-06-14T09:00:00Z"), // moved to 9am
      priorStartsAt: FUTURE_START, // asker was shown 8am
      proposedStartsAt: FUTURE_PROPOSED,
    })

    const results = await runProposalEndgame(NOW, { groupId: groupId! })
    expect(results).toEqual([{ proposalId: proposal.id, action: "superseded" }])

    const after = await prisma.changeProposal.findUnique({ where: { id: proposal.id } })
    expect(after?.answer).toBe(ProposalAnswer.SUPERSEDED)
    expect(after?.answeredAt).not.toBeNull()
    expect(await closureMessages()).toHaveLength(0)
  })

  it("leaves a live proposal untouched", async () => {
    const { proposal } = await makeProposal({
      eventStartsAt: FUTURE_START,
      priorStartsAt: FUTURE_START,
      proposedStartsAt: FUTURE_PROPOSED,
    })

    const results = await runProposalEndgame(NOW, { groupId: groupId! })
    expect(results).toEqual([
      { proposalId: proposal.id, action: "skipped", reason: "still_live" },
    ])

    const after = await prisma.changeProposal.findUnique({ where: { id: proposal.id } })
    expect(after?.answer).toBeNull()
    expect(after?.answeredAt).toBeNull()
    expect(await closureMessages()).toHaveLength(0)
  })

  it("leaves an already-CONFIRMED proposal untouched", async () => {
    const { proposal } = await makeProposal({
      eventStartsAt: FUTURE_START,
      priorStartsAt: FUTURE_START,
      proposedStartsAt: PAST_PROPOSED,
      answer: ProposalAnswer.CONFIRMED,
    })

    const results = await runProposalEndgame(NOW, { groupId: groupId! })
    expect(results).toEqual([])

    const after = await prisma.changeProposal.findUnique({ where: { id: proposal.id } })
    expect(after?.answer).toBe(ProposalAnswer.CONFIRMED)
    expect(await closureMessages()).toHaveLength(0)
  })

  it("leaves VERIFY proposals untouched, however stale", async () => {
    const { proposal } = await makeProposal({
      eventStartsAt: PAST_START,
      priorStartsAt: PAST_START,
      proposedStartsAt: PAST_PROPOSED,
      kind: ProposalKind.VERIFY,
    })

    const results = await runProposalEndgame(NOW, { groupId: groupId! })
    expect(results).toEqual([])

    const after = await prisma.changeProposal.findUnique({ where: { id: proposal.id } })
    expect(after?.answer).toBeNull()
    expect(await closureMessages()).toHaveLength(0)
  })

  it("a second sweep run writes nothing and posts nothing: the answer write is the guard", async () => {
    const { proposal } = await makeProposal({
      eventStartsAt: FUTURE_START,
      priorStartsAt: FUTURE_START,
      proposedStartsAt: PAST_PROPOSED,
    })

    const first = await runProposalEndgame(NOW, { groupId: groupId! })
    expect(first).toEqual([{ proposalId: proposal.id, action: "lapsed" }])
    const answeredAt = (
      await prisma.changeProposal.findUnique({ where: { id: proposal.id } })
    )?.answeredAt

    const second = await runProposalEndgame(NOW, { groupId: groupId! })
    expect(second).toEqual([])

    const after = await prisma.changeProposal.findUnique({ where: { id: proposal.id } })
    expect(after?.answer).toBe(ProposalAnswer.LAPSED)
    expect(after?.answeredAt).toEqual(answeredAt)
    expect(await closureMessages()).toHaveLength(1)
  })
})
