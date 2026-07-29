// src/lib/proposals/__tests__/promote.test.ts
//
// The consensus promote: three-plus yeses, more yeses than the incumbent
// side, move a plan's time and seed the winners in. Real DB, modeled on
// src/lib/gauges/__tests__/promote.test.ts.

import { describe, it, expect, afterEach } from "vitest"
import { prisma } from "@/lib/prisma"
import { MessageAuthor, ProposalAnswer, ProposalVoteAnswer, RsvpStatus } from "@prisma/client"
import { createGroupProposal } from "../create"
import { promoteProposalMove } from "../promote"

const NOW = new Date("2099-06-10T12:00:00Z")
const OLD_START = new Date("2099-06-14T08:00:00Z")
const NEW_START = new Date("2099-06-14T18:00:00Z")
// A third, distinct instant: stands in for "some other route already moved
// this plan," never the value this test's own proposal asks for.
const DECOY_START = new Date("2099-06-15T09:00:00Z")

interface Fixture {
  groupId: string
  eventId: string
  memberIds: string[]
  sourceMessageId: string
}

/** N `[TEST]` members, a group, and an event at OLD_START with the given members seeded IN. */
async function makeFixture(memberCount: number, inIndices: number[]): Promise<Fixture> {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  const memberIds: string[] = []
  for (let i = 0; i < memberCount; i++) {
    const u = await prisma.user.create({
      data: { name: `[TEST] Consensus Promote ${i}`, supabaseAuthId: `test-consensus-promote-${i}-${suffix}` },
    })
    memberIds.push(u.id)
  }
  const group = await prisma.group.create({
    data: {
      name: "[TEST] Consensus Promote Group",
      founderId: memberIds[0],
      timeZone: "UTC",
      recurringActivities: [] as never,
      memberships: { create: memberIds.map((userId) => ({ userId })) },
    },
  })
  const event = await prisma.event.create({
    data: { groupId: group.id, title: "Climbing", activityLabel: "climbing", startsAt: OLD_START },
  })
  if (inIndices.length > 0) {
    await prisma.rsvp.createMany({
      data: inIndices.map((i) => ({ eventId: event.id, userId: memberIds[i], status: RsvpStatus.IN })),
    })
  }
  const source = await prisma.message.create({
    data: { groupId: group.id, authorType: MessageAuthor.MEMBER, authorId: memberIds[0], body: "can we do 6pm instead?" },
  })
  return { groupId: group.id, eventId: event.id, memberIds, sourceMessageId: source.id }
}

/** Creates a live GROUP proposal (asker's YES seeded by createGroupProposal itself). */
async function makeProposal(fx: Fixture, askerIndex = 0) {
  const r = await createGroupProposal({
    groupId: fx.groupId,
    eventId: fx.eventId,
    askerUserId: fx.memberIds[askerIndex],
    sourceMessageId: fx.sourceMessageId,
    proposedStartsAt: NEW_START,
    priorStartsAt: OLD_START,
    body: "Sounds like you want this moved. Sound good to everyone?",
  })
  if (r.status !== "created") throw new Error("fixture failed: proposal not created")
  return r.proposal
}

async function vote(proposalId: string, userId: string, answer: ProposalVoteAnswer) {
  await prisma.proposalVote.create({ data: { proposalId, userId, answer } })
}

async function cleanupFixture(fx: Fixture, extraUserIds: string[] = []) {
  const proposals = await prisma.changeProposal
    .findMany({ where: { groupId: fx.groupId }, select: { id: true } })
    .catch(() => [] as { id: string }[])
  if (proposals.length) {
    await prisma.proposalVote
      .deleteMany({ where: { proposalId: { in: proposals.map((p) => p.id) } } })
      .catch(() => {})
  }
  await prisma.changeProposal.deleteMany({ where: { groupId: fx.groupId } }).catch(() => {})
  await prisma.rsvp.deleteMany({ where: { event: { groupId: fx.groupId } } }).catch(() => {})
  await prisma.message.deleteMany({ where: { groupId: fx.groupId } }).catch(() => {})
  await prisma.event.deleteMany({ where: { groupId: fx.groupId } }).catch(() => {})
  await prisma.membership.deleteMany({ where: { groupId: fx.groupId } }).catch(() => {})
  await prisma.group.delete({ where: { id: fx.groupId } }).catch(() => {})
  for (const id of [...fx.memberIds, ...extraUserIds]) {
    await prisma.user.delete({ where: { id } }).catch(() => {})
  }
}

afterEach(async () => {
  await prisma.$disconnect()
})

describe("promoteProposalMove", () => {
  it("below the bar: no move, nothing written", async () => {
    // 5 members, 4 IN on current, only the asker's seeded YES.
    const fx = await makeFixture(5, [0, 1, 2, 3])
    try {
      const proposal = await makeProposal(fx)

      const r = await promoteProposalMove(proposal.id, NOW)
      expect(r).toEqual({ status: "skipped", reason: "below_bar" })

      const event = await prisma.event.findUnique({ where: { id: fx.eventId } })
      expect(event?.startsAt.getTime()).toBe(OLD_START.getTime())
      expect(event?.previousStartsAt).toBeNull()
      const rsvps = await prisma.rsvp.findMany({ where: { eventId: fx.eventId } })
      expect(rsvps).toHaveLength(4) // untouched
      const stamped = await prisma.changeProposal.findUnique({ where: { id: proposal.id } })
      expect(stamped?.answer).toBeNull()
    } finally {
      await cleanupFixture(fx)
    }
  })

  it("the bar clears: moved, YES voters seeded IN, KEEP voters get no row", async () => {
    // 5 members, 4 IN; YES from asker + two members (one of them was IN), KEEP from one.
    const fx = await makeFixture(5, [0, 1, 3, 4])
    try {
      const proposal = await makeProposal(fx) // asker (0) seeded YES
      await vote(proposal.id, fx.memberIds[1], ProposalVoteAnswer.YES) // was IN, switches side
      await vote(proposal.id, fx.memberIds[2], ProposalVoteAnswer.YES) // was not IN
      await vote(proposal.id, fx.memberIds[3], ProposalVoteAnswer.KEEP) // was IN, stays
      const yesVoterIds = [fx.memberIds[0], fx.memberIds[1], fx.memberIds[2]]

      const r = await promoteProposalMove(proposal.id, NOW)
      expect(r).toEqual({ status: "moved" })

      const event = await prisma.event.findUnique({ where: { id: fx.eventId } })
      expect(event?.startsAt.getTime()).toBe(NEW_START.getTime())
      expect(event?.previousStartsAt?.getTime()).toBe(OLD_START.getTime())

      const rsvps = await prisma.rsvp.findMany({ where: { eventId: fx.eventId } })
      expect(new Set(rsvps.map((r) => r.userId))).toEqual(new Set(yesVoterIds))
      expect(rsvps.every((r) => r.status === "IN")).toBe(true)

      const stamped = await prisma.changeProposal.findUnique({ where: { id: proposal.id } })
      expect(stamped?.answer).toBe("CONFIRMED")

      const announcement = await prisma.message.findFirst({
        where: { groupId: fx.groupId, authorType: "ORBIT" },
        orderBy: { createdAt: "desc" },
      })
      expect(announcement?.body).toContain("That settles it.")
    } finally {
      await cleanupFixture(fx)
    }
  })

  it("the seed's deadlock case moves: three members, all IN, all YES", async () => {
    // The small-group resolution consensus.ts documents: everyone in on the
    // current time, and everyone says yes to the new one. The incumbent side
    // shrinks to nothing as each yes switches sides, so the bar clears.
    const fx = await makeFixture(3, [0, 1, 2])
    try {
      const proposal = await makeProposal(fx) // asker (0) seeded YES
      await vote(proposal.id, fx.memberIds[1], ProposalVoteAnswer.YES)
      await vote(proposal.id, fx.memberIds[2], ProposalVoteAnswer.YES)

      const r = await promoteProposalMove(proposal.id, NOW)
      expect(r).toEqual({ status: "moved" })

      const event = await prisma.event.findUnique({ where: { id: fx.eventId } })
      expect(event?.startsAt.getTime()).toBe(NEW_START.getTime())
    } finally {
      await cleanupFixture(fx)
    }
  })

  it("a stale baseline skips instead of moving from a state nobody saw", async () => {
    // Consensus is easily met (3 members, all IN, all YES), but another mover
    // changes the event's start out from under this promote while it is
    // mid-flight: the pre-read this promote's own transaction re-checks
    // is the row a concurrent writer just changed, so it must lose the race
    // and report stale rather than overwrite that writer's result. The
    // conditional updateMany inside moveEventCoreInTx (move.ts's own
    // race guard, race-proof at READ COMMITTED) is what catches this: the
    // external move holds the row locked, so this promote's own write blocks
    // on it, then re-evaluates against the post-commit row and finds no
    // match.
    const fx = await makeFixture(3, [0, 1, 2])
    try {
      const proposal = await makeProposal(fx) // asker (0) seeded YES
      await vote(proposal.id, fx.memberIds[1], ProposalVoteAnswer.YES)
      await vote(proposal.id, fx.memberIds[2], ProposalVoteAnswer.YES)

      // The lock's presence is a precondition, not a race: resolve `locked`
      // the instant the external transaction's own update call returns (the
      // row lock is definitely held by then), and don't call promote until
      // that signal fires. This guarantees start ordering regardless of how
      // fast promote's own reads are relative to this update; only the
      // subsequent block-then-recheck (the external transaction still holds
      // the lock open below) depends on real timing, and that side favors
      // the guard: it just needs to still be held when promote's own
      // conditional write reaches it.
      let locked!: () => void
      const lockHeld = new Promise<void>((resolve) => { locked = resolve })
      const externalMove = prisma.$transaction(async (tx) => {
        await tx.event.update({
          where: { id: fx.eventId },
          data: { startsAt: DECOY_START, previousStartsAt: OLD_START },
        })
        locked()
        // Hold the row locked well past the time this test's promote call
        // needs to reach its own conditional write, so that write blocks on
        // this transaction's lock and re-checks against the committed change
        // once it releases, instead of racing to see the old row first.
        await new Promise((resolve) => setTimeout(resolve, 1500))
      })

      await lockHeld
      const [, r] = await Promise.all([externalMove, promoteProposalMove(proposal.id, NOW)])
      expect(r).toEqual({ status: "skipped", reason: "stale" })

      const event = await prisma.event.findUnique({ where: { id: fx.eventId } })
      expect(event?.startsAt.getTime()).toBe(DECOY_START.getTime()) // the external move's result stands
      const stamped = await prisma.changeProposal.findUnique({ where: { id: proposal.id } })
      expect(stamped?.answer).toBeNull() // this promote's transaction rolled back, nothing stamped
    } finally {
      await cleanupFixture(fx)
    }
  }, 10000)

  it("a supersede landing mid-transaction is not overwritten by CONFIRMED", async () => {
    // The whole-branch review's Fix 2: promote re-reads votes, memberships,
    // and RSVPs inside its transaction but, before this fix, never the
    // proposal row itself, so a supersede (another createGroupProposal
    // opening a newer proposal on this same event or asker) committed after
    // promote's outer pre-check but before its own stamp would have its
    // SUPERSEDED silently overwritten by CONFIRMED, and the event moved to a
    // retired time. The lock-held-as-precondition pattern from the "stale
    // baseline" test above, aimed at the changeProposal row instead of the
    // event row: the external transaction commits SUPERSEDED and holds the
    // row locked, so promote's own conditional stamp (moveEventCoreInTx's
    // `updateMany({ where: { answer: null } })`) blocks on it, then
    // re-evaluates against the committed SUPERSEDED row and finds no match.
    const fx = await makeFixture(3, [0, 1, 2])
    try {
      const proposal = await makeProposal(fx) // asker (0) seeded YES
      await vote(proposal.id, fx.memberIds[1], ProposalVoteAnswer.YES)
      await vote(proposal.id, fx.memberIds[2], ProposalVoteAnswer.YES)

      let locked!: () => void
      const lockHeld = new Promise<void>((resolve) => { locked = resolve })
      const externalSupersede = prisma.$transaction(async (tx) => {
        await tx.changeProposal.update({
          where: { id: proposal.id },
          data: { answer: ProposalAnswer.SUPERSEDED, answeredAt: NOW },
        })
        locked()
        // Held open well past the time promote's own conditional stamp needs
        // to reach this row, so that write blocks on this transaction's lock
        // and re-checks against the committed SUPERSEDED once it releases.
        await new Promise((resolve) => setTimeout(resolve, 1500))
      })

      // Only call promote once the external transaction's own update has
      // returned (the lock is definitely held by then), the same ordering
      // guarantee the stale-baseline test above relies on. Because that
      // update has not committed yet, promote's OUTER pre-check (a plain
      // read, not blocked by the lock) still sees answer: null and proceeds
      // into its own transaction, which is the exact window this fix closes.
      await lockHeld
      const [, r] = await Promise.all([externalSupersede, promoteProposalMove(proposal.id, NOW)])
      expect(r).toEqual({ status: "skipped", reason: "stale" })

      const stamped = await prisma.changeProposal.findUnique({ where: { id: proposal.id } })
      expect(stamped?.answer).toBe("SUPERSEDED") // never overwritten to CONFIRMED

      const event = await prisma.event.findUnique({ where: { id: fx.eventId } })
      expect(event?.startsAt.getTime()).toBe(OLD_START.getTime()) // the move rolled back too
      const rsvps = await prisma.rsvp.findMany({ where: { eventId: fx.eventId } })
      // All 3 members were seeded IN at fixture setup; the transaction's RSVP
      // reset (delete-then-reseed) rolled back along with the move, so the
      // original 3 rows still stand rather than being cleared or reseeded.
      expect(rsvps).toHaveLength(3)
    } finally {
      await cleanupFixture(fx)
    }
  }, 10000)

  it("non-member votes do not count toward the bar", async () => {
    // A YES from a user with no membership must not help clear the floor:
    // 3 members means a floor of 3, and only 2 member yeses are cast, but a
    // non-member's yes would make 3 raw votes if it were wrongly counted.
    const fx = await makeFixture(3, [0, 1, 2])
    const nonMember = await prisma.user.create({
      data: { name: "[TEST] Consensus Promote Non-Member", supabaseAuthId: `test-consensus-promote-nonmember-${Date.now()}` },
    })
    try {
      const proposal = await makeProposal(fx) // asker (0) seeded YES
      await vote(proposal.id, fx.memberIds[1], ProposalVoteAnswer.YES)
      await vote(proposal.id, nonMember.id, ProposalVoteAnswer.YES)

      const r = await promoteProposalMove(proposal.id, NOW)
      expect(r).toEqual({ status: "skipped", reason: "below_bar" })

      const event = await prisma.event.findUnique({ where: { id: fx.eventId } })
      expect(event?.startsAt.getTime()).toBe(OLD_START.getTime())
    } finally {
      await cleanupFixture(fx, [nonMember.id])
    }
  })
})
