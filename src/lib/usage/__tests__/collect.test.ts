// src/lib/usage/__tests__/collect.test.ts
//
// collectUsage against the real dev-test database, following
// src/lib/digest/__tests__/run.test.ts's fixture idiom: "[TEST] " names, a
// per-file stamp, ids collected and torn down children before parents.
//
// Every test scopes collectUsage to the groups it built (opts.groupIds), so
// real rows sitting in dev-test never touch an assertion. Every timestamp an
// assertion depends on is set explicitly; `now` is pinned. Nothing reads the
// real clock.

import { afterAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import {
  EventStatus,
  GaugeAnswer,
  MessageAuthor,
  ProposalAnswer,
  ProposalKind,
  ProposalVoteAnswer,
  RsvpStatus,
} from "@prisma/client"
import { collectUsage } from "../collect"

const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
const userIds: string[] = []
const groupIds: string[] = []

afterAll(async () => {
  for (const id of groupIds) {
    await prisma.gaugeVote.deleteMany({ where: { gauge: { groupId: id } } }).catch(() => {})
    await prisma.gauge.deleteMany({ where: { groupId: id } }).catch(() => {})
    await prisma.proposalVote.deleteMany({ where: { proposal: { groupId: id } } }).catch(() => {})
    await prisma.changeProposal.deleteMany({ where: { groupId: id } }).catch(() => {})
    await prisma.rsvp.deleteMany({ where: { event: { groupId: id } } }).catch(() => {})
    await prisma.event.deleteMany({ where: { groupId: id } }).catch(() => {})
    await prisma.message.deleteMany({ where: { groupId: id } }).catch(() => {})
    await prisma.membership.deleteMany({ where: { groupId: id } }).catch(() => {})
    await prisma.group.delete({ where: { id } }).catch(() => {})
  }
  for (const id of userIds) {
    await prisma.user.delete({ where: { id } }).catch(() => {})
  }
  await prisma.$disconnect()
})

let counter = 0
function uid(label: string) {
  counter += 1
  return `${label}-${stamp}-${counter}`
}

const NOW = new Date("2026-09-28T13:00:00.000Z")
const IN = new Date("2026-09-25T12:00:00.000Z") // inside the window (starts 2026-09-21T13:00Z)
const OUT = new Date("2026-09-10T12:00:00.000Z") // before the window
const LONG_AGO = new Date("2026-01-01T00:00:00.000Z")

async function makeUser(label: string) {
  const user = await prisma.user.create({
    data: { name: `[TEST] ${label}`, supabaseAuthId: `test-usage-${uid(label)}` },
  })
  userIds.push(user.id)
  return user
}

type MemberSpec = { userId: string; joinedAt?: Date; lastSeenAt?: Date | null }

async function makeGroup(
  label: string,
  founderId: string,
  members: MemberSpec[],
  createdAt: Date = LONG_AGO
) {
  const group = await prisma.group.create({
    data: {
      name: `[TEST] ${label} ${stamp}`,
      founderId,
      createdAt,
      memberships: {
        create: members.map((m) => ({
          userId: m.userId,
          joinedAt: m.joinedAt ?? LONG_AGO,
          lastSeenAt: m.lastSeenAt ?? null,
        })),
      },
    },
  })
  groupIds.push(group.id)
  return group
}

function memberMsg(groupId: string, authorId: string, createdAt: Date) {
  return prisma.message.create({
    data: { groupId, authorType: MessageAuthor.MEMBER, authorId, body: "hi", createdAt },
  })
}
function orbitMsg(groupId: string, createdAt: Date) {
  return prisma.message.create({
    data: { groupId, authorType: MessageAuthor.ORBIT, authorId: null, body: "orbit", createdAt },
  })
}
function makeEvent(groupId: string, extra: { createdAt?: Date; gaugeId?: string; cancelledAt?: Date } = {}) {
  return prisma.event.create({
    data: {
      groupId,
      title: "[TEST] Event",
      startsAt: new Date("2026-10-05T00:00:00.000Z"),
      createdAt: extra.createdAt ?? LONG_AGO,
      gaugeId: extra.gaugeId,
      ...(extra.cancelledAt ? { status: EventStatus.CANCELLED, cancelledAt: extra.cancelledAt } : {}),
    },
  })
}
/** memberSource false makes an Orbit retry guess (no source message). */
async function makeGauge(groupId: string, authorId: string, createdAt: Date, memberSource = true) {
  const source = memberSource ? await memberMsg(groupId, authorId, createdAt) : null
  const orbit = await orbitMsg(groupId, createdAt)
  return prisma.gauge.create({
    data: {
      groupId,
      sourceMessageId: source?.id ?? null,
      orbitMessageId: orbit.id,
      activity: "beers",
      proposedDate: new Date("2026-10-03T00:00:00.000Z"),
      createdAt,
    },
  })
}
async function makeProposal(
  groupId: string,
  eventId: string,
  askerUserId: string,
  createdAt: Date,
  extra: { kind?: ProposalKind; answer?: ProposalAnswer; answeredAt?: Date } = {}
) {
  const orbit = await orbitMsg(groupId, createdAt)
  return prisma.changeProposal.create({
    data: {
      groupId,
      eventId,
      askerUserId,
      orbitMessageId: orbit.id,
      proposedStartsAt: new Date("2026-10-05T01:00:00.000Z"),
      priorStartsAt: new Date("2026-10-05T00:00:00.000Z"),
      kind: extra.kind ?? ProposalKind.GROUP,
      answer: extra.answer,
      answeredAt: extra.answeredAt,
      createdAt,
    },
  })
}

async function usageOf(excludeUserIds: string[], ...groups: { id: string }[]) {
  return collectUsage(NOW, { excludeUserIds, groupIds: groups.map((g) => g.id) })
}

describe("collectUsage", () => {
  it("counts people: current members all time, joiners this week", async () => {
    const a = await makeUser("a")
    const b = await makeUser("b")
    const c = await makeUser("c")
    const g = await makeGroup("people", a.id, [
      { userId: a.id },
      { userId: b.id, joinedAt: OUT },
      { userId: c.id, joinedAt: IN },
    ])
    const r = await usageOf([], g)
    expect(r.overall.people).toEqual({ week: 1, allTime: 3 })
  })

  it("counts openedActive by lastSeenAt in the window, week only", async () => {
    const a = await makeUser("a")
    const b = await makeUser("b")
    const c = await makeUser("c")
    const g = await makeGroup("opened", a.id, [
      { userId: a.id, lastSeenAt: IN },
      { userId: b.id, lastSeenAt: OUT },
      { userId: c.id },
    ])
    const r = await usageOf([], g)
    expect(r.overall.openedActive).toBe(1)
  })

  it("counts didSomethingActive across messages, RSVPs, gauge votes and proposal votes, in window only", async () => {
    const [a, b, c, d, e] = await Promise.all(["a", "b", "c", "d", "e"].map(makeUser))
    const g = await makeGroup("did", a.id, [a, b, c, d, e].map((u) => ({ userId: u.id })))
    await memberMsg(g.id, a.id, IN)
    const ev = await makeEvent(g.id)
    await prisma.rsvp.create({ data: { eventId: ev.id, userId: b.id, status: RsvpStatus.IN, respondedAt: IN } })
    const gauge = await makeGauge(g.id, a.id, OUT)
    await prisma.gaugeVote.create({ data: { gaugeId: gauge.id, userId: c.id, answer: GaugeAnswer.IN, updatedAt: IN } })
    const prop = await makeProposal(g.id, ev.id, a.id, OUT)
    await prisma.proposalVote.create({
      data: { proposalId: prop.id, userId: d.id, answer: ProposalVoteAnswer.YES, updatedAt: IN },
    })
    // e acts only outside the window
    await memberMsg(g.id, e.id, OUT)
    const r = await usageOf([], g)
    expect(r.overall.didSomethingActive).toBe(4)
  })

  it("counts member messages, week and all time, and ignores Orbit", async () => {
    const a = await makeUser("a")
    const g = await makeGroup("msgs", a.id, [{ userId: a.id }])
    await memberMsg(g.id, a.id, IN)
    await memberMsg(g.id, a.id, OUT)
    await orbitMsg(g.id, IN)
    const r = await usageOf([], g)
    expect(r.overall.memberMessages).toEqual({ week: 1, allTime: 2 })
  })

  it("counts ideas floated and skips Orbit's retry guesses", async () => {
    const a = await makeUser("a")
    const g = await makeGroup("floated", a.id, [{ userId: a.id }])
    await makeGauge(g.id, a.id, IN)
    await makeGauge(g.id, a.id, OUT)
    await makeGauge(g.id, a.id, IN, false)
    const r = await usageOf([], g)
    expect(r.overall.ideasFloated).toEqual({ week: 1, allTime: 2 })
  })

  it("counts ideas that became plans, week by the event's createdAt", async () => {
    const a = await makeUser("a")
    const g = await makeGroup("plans", a.id, [{ userId: a.id }])
    const g1 = await makeGauge(g.id, a.id, OUT)
    await makeEvent(g.id, { gaugeId: g1.id, createdAt: IN }) // gauge old, plan this week
    const g2 = await makeGauge(g.id, a.id, OUT)
    await makeEvent(g.id, { gaugeId: g2.id, createdAt: OUT })
    await makeGauge(g.id, a.id, IN) // floated, never became a plan
    const g4 = await makeGauge(g.id, a.id, OUT, false) // Orbit guess with an event: not a member idea
    await makeEvent(g.id, { gaugeId: g4.id, createdAt: IN })
    const r = await usageOf([], g)
    expect(r.overall.ideasBecamePlans).toEqual({ week: 1, allTime: 2 })
  })

  it("counts RSVPs by respondedAt", async () => {
    const a = await makeUser("a")
    const b = await makeUser("b")
    const g = await makeGroup("rsvps", a.id, [{ userId: a.id }, { userId: b.id }])
    const ev = await makeEvent(g.id)
    await prisma.rsvp.create({ data: { eventId: ev.id, userId: a.id, status: RsvpStatus.IN, respondedAt: IN } })
    await prisma.rsvp.create({ data: { eventId: ev.id, userId: b.id, status: RsvpStatus.OUT, respondedAt: OUT } })
    const r = await usageOf([], g)
    expect(r.overall.rsvps).toEqual({ week: 1, allTime: 2 })
  })

  it("counts time changes proposed (GROUP only) and passed (CONFIRMED, week by answeredAt)", async () => {
    const a = await makeUser("a")
    const g = await makeGroup("changes", a.id, [{ userId: a.id }])
    const ev = await makeEvent(g.id)
    await makeProposal(g.id, ev.id, a.id, IN, { answer: ProposalAnswer.CONFIRMED, answeredAt: IN })
    // proposed long ago, passed this week: passed counts this week, proposed does not
    await makeProposal(g.id, ev.id, a.id, OUT, { answer: ProposalAnswer.CONFIRMED, answeredAt: IN })
    await makeProposal(g.id, ev.id, a.id, OUT, { answer: ProposalAnswer.CONFIRMED, answeredAt: OUT })
    await makeProposal(g.id, ev.id, a.id, IN, { answer: ProposalAnswer.DECLINED, answeredAt: IN })
    await makeProposal(g.id, ev.id, a.id, IN, { kind: ProposalKind.VERIFY })
    const r = await usageOf([], g)
    expect(r.overall.timeChangesProposed).toEqual({ week: 2, allTime: 4 })
    expect(r.overall.timeChangesPassed).toEqual({ week: 2, allTime: 3 })
  })

  it("counts plans called off, week by cancelledAt, and ignores scheduled events", async () => {
    const a = await makeUser("a")
    const g = await makeGroup("off", a.id, [{ userId: a.id }])
    await makeEvent(g.id, { cancelledAt: IN })
    await makeEvent(g.id, { cancelledAt: OUT })
    await makeEvent(g.id)
    const r = await usageOf([], g)
    expect(r.overall.callsOff).toEqual({ week: 1, allTime: 2 })
  })

  it("counts groups, week by createdAt", async () => {
    const a = await makeUser("a")
    const g1 = await makeGroup("new", a.id, [{ userId: a.id }], IN)
    const g2 = await makeGroup("old", a.id, [{ userId: a.id }], OUT)
    const r = await usageOf([], g1, g2)
    expect(r.groups).toEqual({ week: 1, allTime: 2 })
  })

  it("counts a person in two groups once overall and once in each group", async () => {
    const a = await makeUser("a")
    const b = await makeUser("b")
    const g1 = await makeGroup("multi1", a.id, [{ userId: a.id }, { userId: b.id, lastSeenAt: IN }])
    const g2 = await makeGroup("multi2", b.id, [{ userId: b.id, lastSeenAt: IN }])
    await memberMsg(g1.id, b.id, IN)
    await memberMsg(g2.id, b.id, IN)
    const r = await usageOf([], g1, g2)
    expect(r.overall.people.allTime).toBe(2)
    expect(r.overall.openedActive).toBe(1)
    expect(r.overall.didSomethingActive).toBe(1)
    expect(r.overall.memberMessages.allTime).toBe(2)
    for (const pg of r.perGroup) {
      expect(pg.metrics.didSomethingActive).toBe(1)
      expect(pg.metrics.openedActive).toBe(1)
    }
  })

  it("counts a person new overall only when their first join anywhere is in the window", async () => {
    const a = await makeUser("a")
    const b = await makeUser("b")
    // b was in g1 before the window and joins g2 inside it: not new overall,
    // but new to g2.
    const g1 = await makeGroup("earliest1", a.id, [{ userId: a.id }, { userId: b.id, joinedAt: OUT }])
    const g2 = await makeGroup("earliest2", a.id, [{ userId: a.id }, { userId: b.id, joinedAt: IN }])
    const r = await usageOf([], g1, g2)
    expect(r.overall.people).toEqual({ week: 0, allTime: 2 })
    const second = r.perGroup.find((pg) => pg.id === g2.id)!
    expect(second.metrics.people.week).toBe(1)
  })

  it("excludes a group the excluded user founded and one they merely joined, and counts both", async () => {
    const owner = await makeUser("owner")
    const other = await makeUser("other")
    const founded = await makeGroup("founded", owner.id, [{ userId: owner.id }])
    const joined = await makeGroup("joined", other.id, [{ userId: other.id }, { userId: owner.id }])
    const kept = await makeGroup("kept", other.id, [{ userId: other.id }])
    await memberMsg(founded.id, owner.id, IN)
    const r = await usageOf([owner.id], founded, joined, kept)
    expect(r.excludedGroupCount).toBe(2)
    expect(r.groups.allTime).toBe(1)
    expect(r.perGroup.map((p) => p.id)).toEqual([kept.id])
    expect(r.overall.memberMessages.allTime).toBe(0)
  })

  it("orders perGroup by didSomethingActive, then all-time messages, then name", async () => {
    const a = await makeUser("a")
    const b = await makeUser("b")
    // busy: 2 active people
    const busy = await makeGroup("zz-busy", a.id, [{ userId: a.id }, { userId: b.id }])
    await memberMsg(busy.id, a.id, IN)
    await memberMsg(busy.id, b.id, IN)
    // chatty: 1 active person, more all-time messages
    const chatty = await makeGroup("chatty", a.id, [{ userId: a.id }])
    await memberMsg(chatty.id, a.id, IN)
    await memberMsg(chatty.id, a.id, OUT)
    // tie-a and tie-b: 1 active person, 1 message each -> by name
    const tieB = await makeGroup("tie-b", a.id, [{ userId: a.id }])
    await memberMsg(tieB.id, a.id, IN)
    const tieA = await makeGroup("tie-a", a.id, [{ userId: a.id }])
    await memberMsg(tieA.id, a.id, IN)
    const r = await usageOf([], tieB, busy, tieA, chatty)
    expect(r.perGroup.map((p) => p.id)).toEqual([busy.id, chatty.id, tieA.id, tieB.id])
  })

  it("reports generatedAt and a windowStart seven days back", async () => {
    const a = await makeUser("a")
    const g = await makeGroup("meta", a.id, [{ userId: a.id }])
    const r = await usageOf([], g)
    expect(r.generatedAt).toEqual(NOW)
    expect(r.windowStart).toEqual(new Date("2026-09-21T13:00:00.000Z"))
  })
})
