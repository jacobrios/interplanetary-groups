// src/lib/people/__tests__/deletion-plan.test.ts
//
// The deletion plan engine is pure planning: it reads a person's real rows and
// decides what deleting them would do, without writing anything. Each test
// pins one rule from the task brief against real seeded rows so a future
// schema change that stops cascading (or starts cascading) something breaks
// a test here rather than silently changing what "delete this person" means.

import { describe, it, expect, afterEach } from "vitest"
import { prisma } from "@/lib/prisma"
import { MessageAuthor, ProposalVoteAnswer, RsvpStatus, GaugeAnswer, ProposalAnswer } from "@prisma/client"
import { buildDeletionPlan } from "../deletion-plan"

const groupIds: string[] = []
const userIds: string[] = []

function stamp() {
  return `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
}

async function makeUser(name: string) {
  const user = await prisma.user.create({
    data: { name, supabaseAuthId: `test-deletion-plan-${stamp()}` },
  })
  userIds.push(user.id)
  return user
}

async function makeGroup(name: string, founderId: string, memberIds: string[] = []) {
  const group = await prisma.group.create({
    data: {
      name,
      founderId,
      memberships: { create: [founderId, ...memberIds].map((userId) => ({ userId })) },
    },
  })
  groupIds.push(group.id)
  return group
}

afterEach(async () => {
  // Group delete cascades Membership, Event, Message, Gauge, ChangeProposal
  // (and their own children) at the DB level, so deleting groups first and
  // users second is enough; Group.founderId has no onDelete, so a founder
  // must never be deleted while their group still exists.
  while (groupIds.length) {
    const id = groupIds.pop()!
    await prisma.group.delete({ where: { id } }).catch(() => {})
  }
  while (userIds.length) {
    const id = userIds.pop()!
    await prisma.user.delete({ where: { id } }).catch(() => {})
  }
  await prisma.$disconnect()
})

describe("buildDeletionPlan", () => {
  it("blocks a founder whose group still has other members, naming the group and the others", async () => {
    const founder = await makeUser("[TEST] DP Founder Blocked")
    const other = await makeUser("[TEST] DP Other")
    const group = await makeGroup("[TEST] DP Blocked Group", founder.id, [other.id])

    const plan = await buildDeletionPlan(founder.id)

    expect(plan.kind).toBe("blocked")
    if (plan.kind !== "blocked") throw new Error("expected blocked")
    expect(plan.reason).toBe("founder-with-members")
    expect(plan.groups).toEqual([
      {
        groupId: group.id,
        groupName: group.name,
        otherMembers: [{ userId: other.id, name: other.name }],
      },
    ])
  })

  it("is ready when a founder is the only member, listing that group for deletion", async () => {
    const founder = await makeUser("[TEST] DP Founder Solo")
    const group = await makeGroup("[TEST] DP Solo Group", founder.id)

    const plan = await buildDeletionPlan(founder.id)

    expect(plan.kind).toBe("ready")
    if (plan.kind !== "ready") throw new Error("expected ready")
    expect(plan.groupsToDelete).toEqual([{ groupId: group.id, groupName: group.name }])
  })

  it("is ready with no group deletions for a plain member", async () => {
    const founder = await makeUser("[TEST] DP Founder Plain")
    const member = await makeUser("[TEST] DP Plain Member")
    await makeGroup("[TEST] DP Plain Group", founder.id, [member.id])

    const plan = await buildDeletionPlan(member.id)

    expect(plan.kind).toBe("ready")
    if (plan.kind !== "ready") throw new Error("expected ready")
    expect(plan.groupsToDelete).toEqual([])
  })

  it("names exactly what the cascade takes in removals", async () => {
    const founder = await makeUser("[TEST] DP Founder Removals")
    const target = await makeUser("[TEST] DP Removals Target")
    const other = await makeUser("[TEST] DP Removals Other")
    const group = await makeGroup("[TEST] DP Removals Group", founder.id, [target.id, other.id])

    await prisma.contactMethod.create({
      data: { userId: target.id, type: "EMAIL", value: "target@example.com" },
    })

    const event1 = await prisma.event.create({
      data: { groupId: group.id, title: "Climbing", startsAt: new Date("2099-01-01T18:00:00Z") },
    })
    const event2 = await prisma.event.create({
      data: { groupId: group.id, title: "Beers", startsAt: new Date("2099-01-02T18:00:00Z") },
    })
    await prisma.rsvp.create({ data: { eventId: event1.id, userId: target.id, status: RsvpStatus.IN } })
    await prisma.rsvp.create({ data: { eventId: event2.id, userId: target.id, status: RsvpStatus.IN } })

    const sourceMessage = await prisma.message.create({
      data: { groupId: group.id, authorType: MessageAuthor.MEMBER, authorId: target.id, body: "beers?" },
    })
    const orbitGaugeMessage = await prisma.message.create({
      data: { groupId: group.id, authorType: MessageAuthor.ORBIT, authorId: null, body: "In for beers?" },
    })
    const gauge = await prisma.gauge.create({
      data: {
        groupId: group.id,
        sourceMessageId: sourceMessage.id,
        orbitMessageId: orbitGaugeMessage.id,
        activity: "beers",
        proposedDate: new Date("2099-01-02T00:00:00Z"),
      },
    })
    await prisma.gaugeVote.create({ data: { gaugeId: gauge.id, userId: target.id, answer: GaugeAnswer.IN } })

    const proposalSourceMessage = await prisma.message.create({
      data: { groupId: group.id, authorType: MessageAuthor.MEMBER, authorId: other.id, body: "move to 7?" },
    })
    const proposalOrbitMessage = await prisma.message.create({
      data: { groupId: group.id, authorType: MessageAuthor.ORBIT, authorId: null, body: "Move to 7pm?" },
    })
    const proposal = await prisma.changeProposal.create({
      data: {
        groupId: group.id,
        eventId: event1.id,
        askerUserId: other.id,
        sourceMessageId: proposalSourceMessage.id,
        orbitMessageId: proposalOrbitMessage.id,
        proposedStartsAt: new Date("2099-01-01T19:00:00Z"),
        priorStartsAt: new Date("2099-01-01T18:00:00Z"),
      },
    })
    await prisma.proposalVote.create({
      data: { proposalId: proposal.id, userId: target.id, answer: ProposalVoteAnswer.YES },
    })

    // Target also asks a proposal of their own, so changeProposalsAsked counts it.
    const askedSourceMessage = await prisma.message.create({
      data: { groupId: group.id, authorType: MessageAuthor.MEMBER, authorId: target.id, body: "move to 8?" },
    })
    const askedOrbitMessage = await prisma.message.create({
      data: { groupId: group.id, authorType: MessageAuthor.ORBIT, authorId: null, body: "Move to 8pm?" },
    })
    await prisma.changeProposal.create({
      data: {
        groupId: group.id,
        eventId: event2.id,
        askerUserId: target.id,
        sourceMessageId: askedSourceMessage.id,
        orbitMessageId: askedOrbitMessage.id,
        proposedStartsAt: new Date("2099-01-02T20:00:00Z"),
        priorStartsAt: new Date("2099-01-02T18:00:00Z"),
      },
    })

    const plan = await buildDeletionPlan(target.id)

    expect(plan.kind).toBe("ready")
    if (plan.kind !== "ready") throw new Error("expected ready")
    expect(plan.removals).toEqual({
      memberships: 1,
      contactMethods: 1,
      rsvps: 2,
      gaugeVotes: 1,
      proposalVotes: 1,
      changeProposalsAsked: 1,
    })
  })

  it("names messages and suggested gauges as survivals, and touches nothing", async () => {
    const founder = await makeUser("[TEST] DP Founder Survivals")
    const target = await makeUser("[TEST] DP Survivals Target")
    const group = await makeGroup("[TEST] DP Survivals Group", founder.id, [target.id])

    const message1 = await prisma.message.create({
      data: { groupId: group.id, authorType: MessageAuthor.MEMBER, authorId: target.id, body: "climbing this weekend?" },
    })
    await prisma.message.create({
      data: { groupId: group.id, authorType: MessageAuthor.MEMBER, authorId: target.id, body: "who's in?" },
    })
    const orbitGaugeMessage = await prisma.message.create({
      data: { groupId: group.id, authorType: MessageAuthor.ORBIT, authorId: null, body: "In for climbing?" },
    })
    await prisma.gauge.create({
      data: {
        groupId: group.id,
        sourceMessageId: message1.id,
        orbitMessageId: orbitGaugeMessage.id,
        activity: "climbing",
        proposedDate: new Date("2099-01-03T00:00:00Z"),
        suggestedByUserId: target.id,
      },
    })

    const plan = await buildDeletionPlan(target.id)

    expect(plan.kind).toBe("ready")
    if (plan.kind !== "ready") throw new Error("expected ready")
    expect(plan.survivals).toEqual({ messages: 2, gaugesSuggested: 1 })

    // Planning performs no writes: the message is still exactly there.
    const stillThere = await prisma.message.findUnique({ where: { id: message1.id } })
    expect(stillThere).not.toBeNull()
  })

  it("warns about open ChangeProposals they asked, naming other voters, and skips closed ones", async () => {
    const founder = await makeUser("[TEST] DP Founder Warnings")
    const target = await makeUser("[TEST] DP Warnings Target")
    const voter1 = await makeUser("[TEST] DP Warnings Voter1")
    const voter2 = await makeUser("[TEST] DP Warnings Voter2")
    const group = await makeGroup("[TEST] DP Warnings Group", founder.id, [target.id, voter1.id, voter2.id])

    const event = await prisma.event.create({
      data: { groupId: group.id, title: "Climbing", startsAt: new Date("2099-02-01T18:00:00Z") },
    })

    // Open proposal: two other people voted.
    const openSource = await prisma.message.create({
      data: { groupId: group.id, authorType: MessageAuthor.MEMBER, authorId: target.id, body: "move to 7?" },
    })
    const openOrbit = await prisma.message.create({
      data: { groupId: group.id, authorType: MessageAuthor.ORBIT, authorId: null, body: "Move to 7pm?" },
    })
    const openProposal = await prisma.changeProposal.create({
      data: {
        groupId: group.id,
        eventId: event.id,
        askerUserId: target.id,
        sourceMessageId: openSource.id,
        orbitMessageId: openOrbit.id,
        proposedStartsAt: new Date("2099-02-01T19:00:00Z"),
        priorStartsAt: new Date("2099-02-01T18:00:00Z"),
      },
    })
    await prisma.proposalVote.create({
      data: { proposalId: openProposal.id, userId: target.id, answer: ProposalVoteAnswer.YES },
    })
    await prisma.proposalVote.create({
      data: { proposalId: openProposal.id, userId: voter1.id, answer: ProposalVoteAnswer.YES },
    })
    await prisma.proposalVote.create({
      data: { proposalId: openProposal.id, userId: voter2.id, answer: ProposalVoteAnswer.KEEP },
    })

    // Closed proposal: already answered, must produce no warning.
    const closedSource = await prisma.message.create({
      data: { groupId: group.id, authorType: MessageAuthor.MEMBER, authorId: target.id, body: "move to 9?" },
    })
    const closedOrbit = await prisma.message.create({
      data: { groupId: group.id, authorType: MessageAuthor.ORBIT, authorId: null, body: "Move to 9pm?" },
    })
    await prisma.changeProposal.create({
      data: {
        groupId: group.id,
        eventId: event.id,
        askerUserId: target.id,
        sourceMessageId: closedSource.id,
        orbitMessageId: closedOrbit.id,
        proposedStartsAt: new Date("2099-02-01T21:00:00Z"),
        priorStartsAt: new Date("2099-02-01T18:00:00Z"),
        answer: ProposalAnswer.CONFIRMED,
        answeredAt: new Date("2099-02-01T12:00:00Z"),
      },
    })

    const plan = await buildDeletionPlan(target.id)

    expect(plan.kind).toBe("ready")
    if (plan.kind !== "ready") throw new Error("expected ready")
    expect(plan.warnings).toEqual([
      {
        proposalId: openProposal.id,
        groupId: group.id,
        groupName: group.name,
        otherVoterCount: 2,
      },
    ])
  })

  it("lists every join-announcement candidate, including both when two members share a name", async () => {
    const founder = await makeUser("[TEST] DP Founder JoinCandidates")
    const jesse1 = await makeUser("Jesse")
    const jesse2 = await makeUser("Jesse")
    const group = await makeGroup("[TEST] DP JoinCandidates Group", founder.id, [jesse1.id, jesse2.id])

    const joinMessage1 = await prisma.message.create({
      data: { groupId: group.id, authorType: MessageAuthor.SYSTEM, authorId: null, body: "Jesse joined" },
    })
    const joinMessage2 = await prisma.message.create({
      data: { groupId: group.id, authorType: MessageAuthor.SYSTEM, authorId: null, body: "Jesse joined" },
    })

    const plan = await buildDeletionPlan(jesse1.id)

    expect(plan.kind).toBe("ready")
    if (plan.kind !== "ready") throw new Error("expected ready")
    const candidateIds = plan.joinAnnouncementCandidates.map((c) => c.messageId).sort()
    expect(candidateIds).toEqual([joinMessage1.id, joinMessage2.id].sort())
    expect(plan.joinAnnouncementCandidates.every((c) => c.groupId === group.id)).toBe(true)
  })

  it("reports supabaseAuthId for the operator, never acting on it", async () => {
    const founder = await makeUser("[TEST] DP Founder AuthId")

    const plan = await buildDeletionPlan(founder.id)

    expect(plan.kind).toBe("ready")
    if (plan.kind !== "ready") throw new Error("expected ready")
    expect(plan.supabaseAuthId).toBe(founder.supabaseAuthId)
  })
})
