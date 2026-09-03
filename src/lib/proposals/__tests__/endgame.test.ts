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

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import { EventStatus, MessageAuthor, ProposalAnswer, ProposalKind } from "@prisma/client"
import type { Prisma } from "@prisma/client"
import { runProposalEndgame } from "../endgame"
import { findLiveProposals } from "../read"

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
  vi.restoreAllMocks()
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
      body: "Sam wants climbing at 6pm instead of 8am. Move it?",
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

  it("supersedes silently when the plan was called off, instead of lapsing into a feed that already says it is off", async () => {
    // The narrow race the cancel slice leaves open: a GROUP proposal opened in
    // the same moment the plan was called off. findLiveProposals hides it, so
    // nobody can answer it, and a lapse here would post "Climbing is staying
    // at 8am" under Orbit's own "climbing is called off".
    const { proposal, event } = await makeProposal({
      eventStartsAt: FUTURE_START,
      priorStartsAt: FUTURE_START,
      // Past, so the clock alone would send this down the lapse path.
      proposedStartsAt: PAST_PROPOSED,
    })
    await prisma.event.update({
      where: { id: event.id },
      data: { status: EventStatus.CANCELLED, cancelledAt: NOW },
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

  // ---------------------------------------------------------------------------
  // The equality edge. The sweep's boundary and the read layer's liveness rule
  // meet at exactly now === min(proposedStartsAt, event.startsAt): read.ts uses
  // `gt: now`, so at that instant the chips are already gone, and the sweep's
  // `boundary > now` skip no longer holds, so it lapses at that same instant.
  // Every other fixture in this file sits strictly on one side of the boundary,
  // so these two tests are what would catch a future > / >= off-by-one in
  // either file. Each one pins BOTH sides of the mirror: findLiveProposals is
  // asserted (before the sweep writes anything) to show the proposal live one
  // millisecond before the instant and gone at it.
  // ---------------------------------------------------------------------------

  it("lapses at the exact instant the proposed time arrives, and the read layer agrees", async () => {
    // now === proposedStartsAt, event start still ahead.
    const { proposal } = await makeProposal({
      eventStartsAt: FUTURE_START,
      priorStartsAt: FUTURE_START,
      proposedStartsAt: NOW,
    })

    // The mirror, pinned before the sweep writes an answer: live 1ms before
    // the instant, gone at it. (After the sweep, answer: null would hide the
    // row from the read layer for the wrong reason.)
    const justBefore = new Date(NOW.getTime() - 1)
    expect(await findLiveProposals(groupId!, justBefore)).toHaveLength(1)
    expect(await findLiveProposals(groupId!, NOW)).toHaveLength(0)

    const results = await runProposalEndgame(NOW, { groupId: groupId! })
    expect(results).toEqual([{ proposalId: proposal.id, action: "lapsed" }])

    const after = await prisma.changeProposal.findUnique({ where: { id: proposal.id } })
    expect(after?.answer).toBe(ProposalAnswer.LAPSED)
    expect(await closureMessages()).toHaveLength(1)
  })

  it("lapses at the exact instant the event starts, and the read layer agrees", async () => {
    // now === event.startsAt, proposed time still ahead: the other arm of
    // min(proposedStartsAt, event.startsAt).
    const { proposal } = await makeProposal({
      eventStartsAt: NOW,
      priorStartsAt: NOW,
      proposedStartsAt: FUTURE_PROPOSED,
    })

    const justBefore = new Date(NOW.getTime() - 1)
    expect(await findLiveProposals(groupId!, justBefore)).toHaveLength(1)
    expect(await findLiveProposals(groupId!, NOW)).toHaveLength(0)

    const results = await runProposalEndgame(NOW, { groupId: groupId! })
    expect(results).toEqual([{ proposalId: proposal.id, action: "lapsed" }])

    const after = await prisma.changeProposal.findUnique({ where: { id: proposal.id } })
    expect(after?.answer).toBe(ProposalAnswer.LAPSED)
    expect(await closureMessages()).toHaveLength(1)
  })

  // ---------------------------------------------------------------------------
  // The lost race: "already_answered". Reachable only under concurrency (the
  // serial second-sweep test above never gets past the answer: null candidate
  // filter), so these two tests manufacture the race. The first mirrors the
  // gauge sweep's concurrent-ask test (two overlapping sweeps via Promise.all);
  // the second makes the race deterministic by intercepting $transaction, so
  // the delicate path — AlreadyAnsweredInTx thrown inside the transaction,
  // rolling the orphaned Orbit message back out — is exercised on every run,
  // not only when the scheduler cooperates.
  // ---------------------------------------------------------------------------

  it("a race between two overlapping sweeps lapses once, not twice", async () => {
    const { proposal } = await makeProposal({
      eventStartsAt: FUTURE_START,
      priorStartsAt: FUTURE_START,
      proposedStartsAt: PAST_PROPOSED,
    })

    // Promise.all dispatches both candidate reads before either close commits,
    // same technique as the gauge endgame's concurrent-ask test: both sweeps
    // see the unanswered row, one close wins the row, the loser's conditional
    // UPDATE matches zero rows inside its transaction and rolls back.
    const [a, b] = await Promise.all([
      runProposalEndgame(NOW, { groupId: groupId! }),
      runProposalEndgame(NOW, { groupId: groupId! }),
    ])
    const resultA = a.find((r) => r.proposalId === proposal.id)
    const resultB = b.find((r) => r.proposalId === proposal.id)
    const winner = [resultA, resultB].find((r) => r?.action === "lapsed")
    const loser = [resultA, resultB].find((r) => r?.action === "skipped")

    expect(winner).toEqual({ proposalId: proposal.id, action: "lapsed" })
    expect(loser).toEqual({
      proposalId: proposal.id,
      action: "skipped",
      reason: "already_answered",
    })

    const after = await prisma.changeProposal.findUnique({ where: { id: proposal.id } })
    expect(after?.answer).toBe(ProposalAnswer.LAPSED)
    // Exactly one closure message: the loser's orphaned message rolled back.
    expect(await closureMessages()).toHaveLength(1)
  })

  it("a close that loses the race to a confirming vote backs off: the vote's answer stands, the message rolls back", async () => {
    const { proposal } = await makeProposal({
      eventStartsAt: FUTURE_START,
      priorStartsAt: FUTURE_START,
      proposedStartsAt: PAST_PROPOSED,
    })
    const confirmedAt = new Date("2099-06-10T11:59:00Z")

    // Deterministic race: the sweep's candidate read has already seen
    // answer: null; the moment it opens its close transaction, a confirming
    // vote commits first. The spy restores itself on first use so only this
    // one transaction is intercepted.
    const transactionHost = prisma as unknown as {
      $transaction: (fn: (tx: Prisma.TransactionClient) => Promise<void>) => Promise<void>
    }
    const realTransaction = transactionHost.$transaction.bind(prisma)
    const txSpy = vi.spyOn(transactionHost, "$transaction").mockImplementation(async (fn) => {
      txSpy.mockRestore()
      await prisma.changeProposal.updateMany({
        where: { id: proposal.id },
        data: { answer: ProposalAnswer.CONFIRMED, answeredAt: confirmedAt },
      })
      return realTransaction(fn)
    })

    const results = await runProposalEndgame(NOW, { groupId: groupId! })
    expect(results).toEqual([
      { proposalId: proposal.id, action: "skipped", reason: "already_answered" },
    ])

    // The winning side's answer stands, untouched by the losing close.
    const after = await prisma.changeProposal.findUnique({ where: { id: proposal.id } })
    expect(after?.answer).toBe(ProposalAnswer.CONFIRMED)
    expect(after?.answeredAt).toEqual(confirmedAt)
    // And no orphaned Orbit closure message survived the rollback.
    expect(await closureMessages()).toHaveLength(0)
  })
})
