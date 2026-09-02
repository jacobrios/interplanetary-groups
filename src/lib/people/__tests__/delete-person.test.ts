// src/lib/people/__tests__/delete-person.test.ts
//
// deletePerson is the only place in src/ that writes for this feature: it
// takes a "ready" DeletionPlan (built, read-only, by buildDeletionPlan) and
// actually removes the rows. Every assertion below is checked against a
// fresh read of the database after the fact, never against the plan's own
// numbers, because that re-read is the entire point of the receipt (task
// brief: "Re-reading counts after the fact rather than trusting the plan is
// the point").

import { describe, it, expect, afterEach } from "vitest"
import { prisma } from "@/lib/prisma"
import { MessageAuthor } from "@prisma/client"
import { buildDeletionPlan } from "../deletion-plan"
import { deletePerson } from "../delete-person"

const groupIds: string[] = []
const userIds: string[] = []

function stamp() {
  return `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
}

async function makeUser(name: string) {
  const user = await prisma.user.create({
    data: { name, supabaseAuthId: `test-delete-person-${stamp()}` },
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
  // Same cleanup shape as deletion-plan.test.ts: whatever deletePerson
  // already removed is simply not found (caught and ignored), so this stays
  // correct whether a given test's rows survived or not.
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

describe("deletePerson", () => {
  it("refuses a blocked plan", async () => {
    const founder = await makeUser("[TEST] DEL Founder Blocked")
    const other = await makeUser("[TEST] DEL Other")
    await makeGroup("[TEST] DEL Blocked Group", founder.id, [other.id])

    const plan = await buildDeletionPlan(founder.id)
    expect(plan.kind).toBe("blocked")

    await expect(deletePerson(plan, [])).rejects.toThrow(/blocked/i)

    // Nothing touched: the founder and the group are both still there.
    const stillThere = await prisma.user.findUnique({ where: { id: founder.id } })
    expect(stillThere).not.toBeNull()
  })

  it("deletes a solo-founded group before the user, so the founder-only cascade actually succeeds", async () => {
    const founder = await makeUser("[TEST] DEL Founder Solo")
    const group = await makeGroup("[TEST] DEL Solo Group", founder.id)

    const plan = await buildDeletionPlan(founder.id)
    expect(plan.kind).toBe("ready")
    if (plan.kind !== "ready") throw new Error("expected ready")

    const receipt = await deletePerson(plan, [])

    expect(receipt.userDeleted).toBe(true)
    expect(receipt.groupsDeleted).toEqual([{ groupId: group.id, groupName: group.name }])

    const userGone = await prisma.user.findUnique({ where: { id: founder.id } })
    expect(userGone).toBeNull()
    const groupGone = await prisma.group.findUnique({ where: { id: group.id } })
    expect(groupGone).toBeNull()
  })

  it("cascades memberships, rsvps, gaugeVotes, proposalVotes and changeProposalsAsked, and the receipt's removals reflect the real post-delete counts, not the plan's", async () => {
    const founder = await makeUser("[TEST] DEL Founder Cascade")
    const target = await makeUser("[TEST] DEL Cascade Target")
    const group = await makeGroup("[TEST] DEL Cascade Group", founder.id, [target.id])

    const event = await prisma.event.create({
      data: { groupId: group.id, title: "Climbing", startsAt: new Date("2099-01-01T18:00:00Z") },
    })
    await prisma.rsvp.create({ data: { eventId: event.id, userId: target.id, status: "IN" } })

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
    await prisma.gaugeVote.create({ data: { gaugeId: gauge.id, userId: target.id, answer: "IN" } })

    const proposalSource = await prisma.message.create({
      data: { groupId: group.id, authorType: MessageAuthor.MEMBER, authorId: founder.id, body: "move to 7?" },
    })
    const proposalOrbit = await prisma.message.create({
      data: { groupId: group.id, authorType: MessageAuthor.ORBIT, authorId: null, body: "Move to 7pm?" },
    })
    const proposal = await prisma.changeProposal.create({
      data: {
        groupId: group.id,
        eventId: event.id,
        askerUserId: founder.id,
        sourceMessageId: proposalSource.id,
        orbitMessageId: proposalOrbit.id,
        proposedStartsAt: new Date("2099-01-01T19:00:00Z"),
        priorStartsAt: new Date("2099-01-01T18:00:00Z"),
      },
    })
    await prisma.proposalVote.create({ data: { proposalId: proposal.id, userId: target.id, answer: "YES" } })

    const askedSource = await prisma.message.create({
      data: { groupId: group.id, authorType: MessageAuthor.MEMBER, authorId: target.id, body: "move to 8?" },
    })
    const askedOrbit = await prisma.message.create({
      data: { groupId: group.id, authorType: MessageAuthor.ORBIT, authorId: null, body: "Move to 8pm?" },
    })
    await prisma.changeProposal.create({
      data: {
        groupId: group.id,
        eventId: event.id,
        askerUserId: target.id,
        sourceMessageId: askedSource.id,
        orbitMessageId: askedOrbit.id,
        proposedStartsAt: new Date("2099-01-01T20:00:00Z"),
        priorStartsAt: new Date("2099-01-01T18:00:00Z"),
      },
    })

    const plan = await buildDeletionPlan(target.id)
    expect(plan.kind).toBe("ready")
    if (plan.kind !== "ready") throw new Error("expected ready")

    // Tamper the plan's own predicted removals with wrong numbers, so a
    // receipt that merely echoed plan.removals would be caught red-handed.
    // deletePerson must compute its own fresh counts instead.
    const tamperedPlan = { ...plan, removals: { memberships: 999, rsvps: 999, gaugeVotes: 999, proposalVotes: 999, changeProposalsAsked: 999 } }

    const receipt = await deletePerson(tamperedPlan, [])

    expect(receipt.removals).toEqual({
      memberships: 1,
      rsvps: 1,
      gaugeVotes: 1,
      proposalVotes: 1,
      changeProposalsAsked: 1,
    })

    const membershipsLeft = await prisma.membership.count({ where: { userId: target.id } })
    const rsvpsLeft = await prisma.rsvp.count({ where: { userId: target.id } })
    const gaugeVotesLeft = await prisma.gaugeVote.count({ where: { userId: target.id } })
    const proposalVotesLeft = await prisma.proposalVote.count({ where: { userId: target.id } })
    const changeProposalsLeft = await prisma.changeProposal.count({ where: { askerUserId: target.id } })
    expect(membershipsLeft).toBe(0)
    expect(rsvpsLeft).toBe(0)
    expect(gaugeVotesLeft).toBe(0)
    expect(proposalVotesLeft).toBe(0)
    expect(changeProposalsLeft).toBe(0)
  })

  it("leaves the person's own chat messages and suggested gauges behind, pointer nulled (SetNull), and touches nobody else's rows", async () => {
    const founder = await makeUser("[TEST] DEL Founder Survivals")
    const target = await makeUser("[TEST] DEL Survivals Target")
    const other = await makeUser("[TEST] DEL Survivals Other")
    const group = await makeGroup("[TEST] DEL Survivals Group", founder.id, [target.id, other.id])

    const message = await prisma.message.create({
      data: { groupId: group.id, authorType: MessageAuthor.MEMBER, authorId: target.id, body: "climbing this weekend?" },
    })
    const orbitGaugeMessage = await prisma.message.create({
      data: { groupId: group.id, authorType: MessageAuthor.ORBIT, authorId: null, body: "In for climbing?" },
    })
    const gauge = await prisma.gauge.create({
      data: {
        groupId: group.id,
        sourceMessageId: message.id,
        orbitMessageId: orbitGaugeMessage.id,
        activity: "climbing",
        proposedDate: new Date("2099-01-03T00:00:00Z"),
        suggestedByUserId: target.id,
      },
    })
    const otherRsvp = await prisma.event.create({
      data: { groupId: group.id, title: "Climbing", startsAt: new Date("2099-01-03T18:00:00Z") },
    })
    await prisma.rsvp.create({ data: { eventId: otherRsvp.id, userId: other.id, status: "IN" } })

    const plan = await buildDeletionPlan(target.id)
    expect(plan.kind).toBe("ready")
    if (plan.kind !== "ready") throw new Error("expected ready")

    await deletePerson(plan, [])

    const messageStillThere = await prisma.message.findUnique({ where: { id: message.id } })
    expect(messageStillThere?.authorId).toBeNull()
    const gaugeStillThere = await prisma.gauge.findUnique({ where: { id: gauge.id } })
    expect(gaugeStillThere?.suggestedByUserId).toBeNull()

    // Untouched: the other member's own membership and RSVP survive.
    const otherMembership = await prisma.membership.findUnique({
      where: { userId_groupId: { userId: other.id, groupId: group.id } },
    })
    expect(otherMembership).not.toBeNull()
    const otherRsvpRow = await prisma.rsvp.findUnique({
      where: { eventId_userId: { eventId: otherRsvp.id, userId: other.id } },
    })
    expect(otherRsvpRow).not.toBeNull()
  })

  it("deletes exactly the join-announcement message ids it is given, leaving an unconfirmed candidate alone", async () => {
    const founder = await makeUser("[TEST] DEL Founder JoinMsgs")
    const target = await makeUser("[TEST] DEL JoinMsgs Target")
    const otherGroup = await makeGroup("[TEST] DEL JoinMsgs Other Group", founder.id)
    const targetGroup = await makeGroup("[TEST] DEL JoinMsgs Target Group", founder.id, [target.id])

    // A confirmed match: target's own join line in the group they're actually in.
    const confirmedJoin = await prisma.message.create({
      data: { groupId: targetGroup.id, authorType: MessageAuthor.SYSTEM, authorId: null, body: `${target.name} joined` },
    })
    // A same-body line in an unrelated group, left as name-match-only and
    // deliberately NOT included in the confirmed ids below.
    const unconfirmedJoin = await prisma.message.create({
      data: { groupId: otherGroup.id, authorType: MessageAuthor.SYSTEM, authorId: null, body: `${target.name} joined` },
    })

    const plan = await buildDeletionPlan(target.id)
    expect(plan.kind).toBe("ready")
    if (plan.kind !== "ready") throw new Error("expected ready")
    expect(plan.joinAnnouncementCandidates.map((c) => c.messageId).sort()).toEqual(
      [confirmedJoin.id, unconfirmedJoin.id].sort()
    )

    const receipt = await deletePerson(plan, [confirmedJoin.id])

    expect(receipt.joinAnnouncementMessagesDeleted).toBe(1)
    const confirmedGone = await prisma.message.findUnique({ where: { id: confirmedJoin.id } })
    expect(confirmedGone).toBeNull()
    const unconfirmedStillThere = await prisma.message.findUnique({ where: { id: unconfirmedJoin.id } })
    expect(unconfirmedStillThere).not.toBeNull()
  })

  it("refuses a message id that is not one of this plan's own joinAnnouncementCandidates", async () => {
    const founder = await makeUser("[TEST] DEL Founder Guard")
    const target = await makeUser("[TEST] DEL Guard Target")
    await makeGroup("[TEST] DEL Guard Group", founder.id, [target.id])

    // A message that exists but was never surfaced as a candidate for this
    // person at all (an ordinary chat message, not even a join line).
    const groupForStray = await makeGroup("[TEST] DEL Guard Stray Group", founder.id)
    const strayMessage = await prisma.message.create({
      data: { groupId: groupForStray.id, authorType: MessageAuthor.MEMBER, authorId: founder.id, body: "unrelated" },
    })

    const plan = await buildDeletionPlan(target.id)
    expect(plan.kind).toBe("ready")
    if (plan.kind !== "ready") throw new Error("expected ready")

    await expect(deletePerson(plan, [strayMessage.id])).rejects.toThrow(/candidate/i)

    // Refused before anything was written: the person is still there.
    const stillThere = await prisma.user.findUnique({ where: { id: target.id } })
    expect(stillThere).not.toBeNull()
    const strayStillThere = await prisma.message.findUnique({ where: { id: strayMessage.id } })
    expect(strayStillThere).not.toBeNull()
  })

  it("refuses to delete a solo-founded group that gained a member after the plan was built, and rolls back cleanly", async () => {
    const founder = await makeUser("[TEST] DEL Founder StaleSolo")
    const group = await makeGroup("[TEST] DEL StaleSolo Group", founder.id)

    // Solo at plan time: the plan legitimately lists this group for deletion.
    const plan = await buildDeletionPlan(founder.id)
    expect(plan.kind).toBe("ready")
    if (plan.kind !== "ready") throw new Error("expected ready")
    expect(plan.groupsToDelete).toEqual([{ groupId: group.id, groupName: group.name }])

    // The window the finding describes: somebody joins through the still-live
    // invite link between the plan being built and the operator confirming.
    const latecomer = await makeUser("[TEST] DEL StaleSolo Latecomer")
    await prisma.membership.create({ data: { userId: latecomer.id, groupId: group.id } })
    const latecomerMessage = await prisma.message.create({
      data: { groupId: group.id, authorType: MessageAuthor.MEMBER, authorId: latecomer.id, body: "hey, just joined!" },
    })

    await expect(deletePerson(plan, [])).rejects.toThrow(/joined since|StaleSolo Group/i)

    // The whole transaction rolled back: nothing was destroyed.
    const groupStillThere = await prisma.group.findUnique({ where: { id: group.id } })
    expect(groupStillThere).not.toBeNull()
    const founderStillThere = await prisma.user.findUnique({ where: { id: founder.id } })
    expect(founderStillThere).not.toBeNull()
    const latecomerMembershipStillThere = await prisma.membership.findUnique({
      where: { userId_groupId: { userId: latecomer.id, groupId: group.id } },
    })
    expect(latecomerMembershipStillThere).not.toBeNull()
    const latecomerMessageStillThere = await prisma.message.findUnique({ where: { id: latecomerMessage.id } })
    expect(latecomerMessageStillThere).not.toBeNull()
  })
})
