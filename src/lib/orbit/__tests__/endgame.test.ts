// src/lib/orbit/__tests__/endgame.test.ts
//
// Integration tests for runGaugeEndgame — hits the real dev DB.
//
// EVERY call here is scoped with { groupId }. Do not remove that, and do not
// add an unscoped `runGaugeEndgame(NOW)` back.
//
// The dev-test database is shared, and an unscoped sweep does not just read
// it: it posts a real Orbit bump or closure message, and writes a real
// bumpMessageId/closureMessageId, into every open gauge in every group that
// has one. This file only cleans up rows in its own fixture groups. Those
// leak permanently, and because every fixture date here is in 2099, the
// leaked closures and bumps would sit there looking exactly like real Orbit
// activity to anyone who queries the group later.
//
// reconcile.test.ts paid for this lesson once already: a phantom card on a
// QA group's home screen, traced back to a leaked unscoped sweep, cost a
// database query to prove it was junk and not a product bug. Do not reproduce
// that here.
//
// Cleanup order (FK constraints):
//   Event (gaugeId, SetNull on Gauge — delete explicitly, it does not cascade)
//   → Message (groupId; deleting a Gauge's source/orbit message cascades the
//     Gauge itself, which cascades its GaugeVote rows)
//   → Membership (groupId) → Group (founderId) → User

import { describe, it, expect, afterEach } from "vitest"
import { prisma } from "@/lib/prisma"
import { MessageAuthor, GaugeAnswer } from "@prisma/client"
import { runGaugeEndgame } from "../endgame"
import { buildBumpMessage, buildClosureMessage, buildRetryAskMessage } from "../spark-copy"
import { zonedWallTimeToUtc } from "../occurrence"

// ---------------------------------------------------------------------------
// Fixture state, reset per test
// ---------------------------------------------------------------------------

let userIds: string[] = []
let groupId: string | null = null
let secondGroupId: string | null = null
let secondUserIds: string[] = []
const eventIds: string[] = []

async function cleanup() {
  for (const id of eventIds) {
    await prisma.event.delete({ where: { id } }).catch(() => {})
  }
  eventIds.length = 0

  for (const gid of [groupId, secondGroupId]) {
    if (!gid) continue
    // Deleting a Gauge's source/orbit Message cascades the Gauge row itself
    // (Gauge.sourceMessage / .orbitMessage are onDelete: Cascade), which in
    // turn cascades any GaugeVote rows. One deleteMany covers all of it.
    await prisma.message.deleteMany({ where: { groupId: gid } }).catch(() => {})
    await prisma.membership.deleteMany({ where: { groupId: gid } }).catch(() => {})
    await prisma.group.delete({ where: { id: gid } }).catch(() => {})
  }
  groupId = null
  secondGroupId = null

  for (const id of [...userIds, ...secondUserIds]) {
    await prisma.user.delete({ where: { id } }).catch(() => {})
  }
  userIds = []
  secondUserIds = []
}

afterEach(async () => {
  await cleanup()
  await prisma.$disconnect()
})

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

async function setupGroup(
  memberCount: number,
  second = false,
  timeZone = "UTC"
): Promise<{ groupId: string; members: string[] }> {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  const ids: string[] = []
  for (let i = 0; i < memberCount; i++) {
    const u = await prisma.user.create({
      data: {
        name: `[TEST] Endgame${second ? " B" : ""} ${i}`,
        supabaseAuthId: `test-endgame${second ? "-b" : ""}-${i}-${suffix}`,
      },
    })
    ids.push(u.id)
  }
  const group = await prisma.group.create({
    data: {
      name: `[TEST] Endgame${second ? " B" : ""} Group`,
      founderId: ids[0],
      timeZone,
      memberships: { create: ids.map((userId) => ({ userId })) },
    },
  })
  if (second) {
    secondGroupId = group.id
    secondUserIds = ids
  } else {
    groupId = group.id
    userIds = ids
  }
  return { groupId: group.id, members: ids }
}

/**
 * A gauge built directly (not through createGauge), so every timestamp is
 * explicit and under the test's control: createdAt for the born_today guard,
 * and the source/orbit message createdAt values for the still_newest guard.
 * Real defaults (`now()`, the actual 2026 wall clock) would sort *before*
 * every 2099-dated fixture instant here, which would silently break any
 * "newest message in the group" comparison — so nothing in this file relies
 * on a message's default createdAt.
 */
async function makeGauge(
  gid: string,
  founderId: string,
  opts: { activity: string; proposedDate: Date; proposedTime?: string | null; createdAt: Date }
) {
  const source = await prisma.message.create({
    data: {
      groupId: gid,
      authorType: MessageAuthor.MEMBER,
      authorId: founderId,
      body: `we should ${opts.activity}`,
      createdAt: opts.createdAt,
    },
  })
  const orbitMsg = await prisma.message.create({
    data: {
      groupId: gid,
      authorType: MessageAuthor.ORBIT,
      authorId: null,
      body: `Anyone in for ${opts.activity}?`,
      createdAt: new Date(opts.createdAt.getTime() + 1000),
    },
  })
  const gauge = await prisma.gauge.create({
    data: {
      groupId: gid,
      sourceMessageId: source.id,
      orbitMessageId: orbitMsg.id,
      activity: opts.activity,
      proposedDate: opts.proposedDate,
      proposedTime: opts.proposedTime === undefined ? "19:00" : opts.proposedTime,
      createdAt: opts.createdAt,
    },
  })
  return gauge
}

async function postLaterMessage(gid: string, authorId: string, after: Date) {
  return prisma.message.create({
    data: {
      groupId: gid,
      authorType: MessageAuthor.MEMBER,
      authorId,
      body: "anyone around?",
      createdAt: new Date(after.getTime() + 60_000),
    },
  })
}

async function voteIn(gaugeId: string, userId: string) {
  await prisma.gaugeVote.create({ data: { gaugeId, userId, answer: GaugeAnswer.IN } })
}

async function voteNotThatDay(gaugeId: string, userId: string) {
  await prisma.gaugeVote.create({ data: { gaugeId, userId, answer: GaugeAnswer.NOT_THAT_DAY } })
}

async function orbitMessageCount(gid: string): Promise<number> {
  return prisma.message.count({ where: { groupId: gid, authorType: MessageAuthor.ORBIT } })
}

/**
 * Stages an asked gauge: 3 members, 2 IN + 1 NOT_THAT_DAY (day-blocked but
 * would have cleared the bar), swept once at CLOSE_TIME so it gets the ask
 * instead of the goodbye. Every wrong-day-retry guess scenario below starts
 * from this same asked state (PROPOSED = Fri 2099-06-12, UTC group).
 */
async function stageAskedGauge(gid: string, members: string[]) {
  const gauge = await makeGauge(gid, members[0], {
    activity: "beers",
    proposedDate: PROPOSED,
    createdAt: CREATED_2D_BEFORE,
  })
  await voteIn(gauge.id, members[0])
  await voteIn(gauge.id, members[1])
  await voteNotThatDay(gauge.id, members[2])

  const asked = await runGaugeEndgame(CLOSE_TIME, { groupId: gid })
  expect(asked.find((r) => r.gaugeId === gauge.id)).toEqual({ gaugeId: gauge.id, action: "asked" })

  return gauge
}

/** The createdAt of an asked gauge's retry-ask message, for staging "answered" fixtures after it. */
async function retryAskCreatedAt(gaugeId: string): Promise<Date> {
  const g = await prisma.gauge.findUniqueOrThrow({
    where: { id: gaugeId },
    include: { retryAskMessage: true },
  })
  return g.retryAskMessage!.createdAt
}

// ---------------------------------------------------------------------------
// Fixture instants
//
// PROPOSED is Friday 2099-06-12, group-local midnight, in a UTC-timezone
// group — so every "local" claim below reads directly off the UTC clock.
// ---------------------------------------------------------------------------

const PROPOSED = new Date("2099-06-12T00:00:00Z")
const CREATED_2D_BEFORE = new Date("2099-06-10T09:00:00Z") // Wednesday
const CREATED_SAME_DAY_AS_EVE = new Date("2099-06-11T09:00:00Z") // Thursday the 11th is the eve
const EVE_8PM = new Date("2099-06-11T20:00:00Z") // the eve, exactly at BUMP_LOCAL_HOUR
const EVE_9PM = new Date("2099-06-11T21:00:00Z")
const EVE_3PM = new Date("2099-06-11T15:00:00Z") // the eve, before BUMP_LOCAL_HOUR
const DAY_OF_8PM = new Date("2099-06-12T20:00:00Z") // the proposed day itself, not its eve
const CLOSE_TIME = new Date("2099-06-12T17:01:00Z") // 1 minute past a 19:00 gauge's close (start - 2h)
const CLOSE_TIME_2 = new Date("2099-06-12T17:02:00Z")
const STILL_OPEN_NOW = new Date("2099-06-10T10:00:00Z") // two full days before the proposed day

// The wrong-day retry: PROPOSED failed (Friday), the ask lands the same day,
// and the one guess fires the evening after — Saturday 2099-06-13, 8pm.
const NEXT_EVE_8PM = new Date("2099-06-13T20:00:00Z") // the evening after the failed day, at BUMP_LOCAL_HOUR
const NEXT_EVE_3PM = new Date("2099-06-13T15:00:00Z") // same evening, before BUMP_LOCAL_HOUR

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runGaugeEndgame", () => {
  it("bumps a below-bar gauge on the eve, with chips-ready message and marker set", async () => {
    const { groupId: gid, members } = await setupGroup(2)
    const gauge = await makeGauge(gid, members[0], {
      activity: "beers",
      proposedDate: PROPOSED,
      createdAt: CREATED_2D_BEFORE,
    })
    await voteIn(gauge.id, members[0])
    // Break the still_newest guard: a member message after the gauge's own
    // orbit message, but still well before the eve sweep.
    await postLaterMessage(gid, members[1], new Date(CREATED_2D_BEFORE.getTime() + 3600_000))

    const before = await orbitMessageCount(gid)
    const results = await runGaugeEndgame(EVE_8PM, { groupId: gid })

    expect(results.find((r) => r.gaugeId === gauge.id)).toEqual({ gaugeId: gauge.id, action: "bumped" })
    expect(await orbitMessageCount(gid)).toBe(before + 1)

    const refreshed = await prisma.gauge.findUniqueOrThrow({ where: { id: gauge.id } })
    expect(refreshed.bumpMessageId).not.toBeNull()
    const bumpMsg = await prisma.message.findUniqueOrThrow({ where: { id: refreshed.bumpMessageId! } })
    expect(bumpMsg.body).toBe(buildBumpMessage("beers", ["[TEST] Endgame 0"]))
    expect(bumpMsg.authorType).toBe(MessageAuthor.ORBIT)
    expect(bumpMsg.authorId).toBeNull()
  })

  it("never bumps twice", async () => {
    const { groupId: gid, members } = await setupGroup(2)
    const gauge = await makeGauge(gid, members[0], {
      activity: "beers",
      proposedDate: PROPOSED,
      createdAt: CREATED_2D_BEFORE,
    })
    await voteIn(gauge.id, members[0])
    await postLaterMessage(gid, members[1], new Date(CREATED_2D_BEFORE.getTime() + 3600_000))

    const first = await runGaugeEndgame(EVE_8PM, { groupId: gid })
    expect(first.find((r) => r.gaugeId === gauge.id)?.action).toBe("bumped")

    const before = await orbitMessageCount(gid)
    const second = await runGaugeEndgame(EVE_9PM, { groupId: gid })
    expect(second.find((r) => r.gaugeId === gauge.id)).toEqual({
      gaugeId: gauge.id,
      action: "skipped",
      reason: "already_bumped",
    })
    expect(await orbitMessageCount(gid)).toBe(before)
  })

  it("does not bump a gauge created that same local day", async () => {
    const { groupId: gid, members } = await setupGroup(1)
    const gauge = await makeGauge(gid, members[0], {
      activity: "beers",
      proposedDate: PROPOSED,
      createdAt: CREATED_SAME_DAY_AS_EVE,
    })

    const results = await runGaugeEndgame(EVE_8PM, { groupId: gid })
    expect(results.find((r) => r.gaugeId === gauge.id)).toEqual({
      gaugeId: gauge.id,
      action: "skipped",
      reason: "born_today",
    })
    const refreshed = await prisma.gauge.findUniqueOrThrow({ where: { id: gauge.id } })
    expect(refreshed.bumpMessageId).toBeNull()
  })

  it("does not bump when the gauge is still the newest message", async () => {
    const { groupId: gid, members } = await setupGroup(1)
    const gauge = await makeGauge(gid, members[0], {
      activity: "beers",
      proposedDate: PROPOSED,
      createdAt: CREATED_2D_BEFORE,
    })
    // No message posted after the gauge's own orbit message: it stays newest.

    const results = await runGaugeEndgame(EVE_8PM, { groupId: gid })
    expect(results.find((r) => r.gaugeId === gauge.id)).toEqual({
      gaugeId: gauge.id,
      action: "skipped",
      reason: "still_newest",
    })
    const refreshed = await prisma.gauge.findUniqueOrThrow({ where: { id: gauge.id } })
    expect(refreshed.bumpMessageId).toBeNull()
  })

  it("does not bump outside the eve evening", async () => {
    const { groupId: gid, members } = await setupGroup(1)
    // A late proposedTime (11pm, closing at 9pm) so the gauge is still live
    // at "day-of, 8pm" — otherwise that instant falls after the default
    // 19:00 gauge's own close (17:00) and the test would exercise the close
    // branch instead of the bump branch's not_the_eve guard.
    const gauge = await makeGauge(gid, members[0], {
      activity: "beers",
      proposedDate: PROPOSED,
      proposedTime: "23:00",
      createdAt: CREATED_2D_BEFORE,
    })

    const tooEarly = await runGaugeEndgame(EVE_3PM, { groupId: gid })
    expect(tooEarly.find((r) => r.gaugeId === gauge.id)).toEqual({
      gaugeId: gauge.id,
      action: "skipped",
      reason: "not_the_eve",
    })

    const dayOf = await runGaugeEndgame(DAY_OF_8PM, { groupId: gid })
    expect(dayOf.find((r) => r.gaugeId === gauge.id)).toEqual({
      gaugeId: gauge.id,
      action: "skipped",
      reason: "not_the_eve",
    })

    const refreshed = await prisma.gauge.findUniqueOrThrow({ where: { id: gauge.id } })
    expect(refreshed.bumpMessageId).toBeNull()
  })

  it("still open two days out: nothing to do yet", async () => {
    const { groupId: gid, members } = await setupGroup(1)
    const gauge = await makeGauge(gid, members[0], {
      activity: "beers",
      proposedDate: PROPOSED,
      createdAt: new Date(STILL_OPEN_NOW.getTime() - 24 * 60 * 60 * 1000),
    })

    const results = await runGaugeEndgame(STILL_OPEN_NOW, { groupId: gid })
    expect(results.find((r) => r.gaugeId === gauge.id)).toEqual({
      gaugeId: gauge.id,
      action: "skipped",
      reason: "still_open",
    })
  })

  it("does not bump a gauge already at the three-vote bar (a promotion that never landed)", async () => {
    // Simulates a promoteGaugeToEvent call that committed the third vote but
    // rolled back the event: the gauge is live, has no event, but already
    // holds 3 member IN votes. buildBumpMessage renders broken copy at 3+
    // names, so this must be caught before the sweep composes a bump body.
    const { groupId: gid, members } = await setupGroup(3)
    const gauge = await makeGauge(gid, members[0], {
      activity: "beers",
      proposedDate: PROPOSED,
      createdAt: CREATED_2D_BEFORE,
    })
    await voteIn(gauge.id, members[0])
    await voteIn(gauge.id, members[1])
    await voteIn(gauge.id, members[2])
    await postLaterMessage(gid, members[1], new Date(CREATED_2D_BEFORE.getTime() + 3600_000))

    const before = await orbitMessageCount(gid)
    const results = await runGaugeEndgame(EVE_8PM, { groupId: gid })
    expect(results.find((r) => r.gaugeId === gauge.id)).toEqual({
      gaugeId: gauge.id,
      action: "skipped",
      reason: "already_at_bar",
    })
    expect(await orbitMessageCount(gid)).toBe(before)

    const refreshed = await prisma.gauge.findUniqueOrThrow({ where: { id: gauge.id } })
    expect(refreshed.bumpMessageId).toBeNull()
  })

  it("a race between two overlapping sweeps produces exactly one bump, not two", async () => {
    // The scenario code review flagged: a read-then-branch-then-write re-read
    // inside the transaction does not close this race (both racers see the
    // marker as null and both writes succeed, since neither's update is
    // conditioned on the marker). The fix conditions the update itself on
    // `bumpMessageId: null`, so the loser's update matches zero rows once the
    // winner has committed and it rolls its own message back out.
    const { groupId: gid, members } = await setupGroup(2)
    const gauge = await makeGauge(gid, members[0], {
      activity: "beers",
      proposedDate: PROPOSED,
      createdAt: CREATED_2D_BEFORE,
    })
    await voteIn(gauge.id, members[0])
    await postLaterMessage(gid, members[1], new Date(CREATED_2D_BEFORE.getTime() + 3600_000))

    const before = await orbitMessageCount(gid)
    const [a, b] = await Promise.all([
      runGaugeEndgame(EVE_8PM, { groupId: gid }),
      runGaugeEndgame(EVE_8PM, { groupId: gid }),
    ])
    const resultA = a.find((r) => r.gaugeId === gauge.id)
    const resultB = b.find((r) => r.gaugeId === gauge.id)
    const winner = [resultA, resultB].find((r) => r?.action === "bumped")
    const loser = [resultA, resultB].find((r) => r?.action === "skipped")

    expect(winner).toEqual({ gaugeId: gauge.id, action: "bumped" })
    expect(loser).toEqual({ gaugeId: gauge.id, action: "skipped", reason: "already_bumped" })
    expect(await orbitMessageCount(gid)).toBe(before + 1)

    const refreshed = await prisma.gauge.findUniqueOrThrow({ where: { id: gauge.id } })
    expect(refreshed.bumpMessageId).not.toBeNull()
  })

  it("a race between two overlapping sweeps produces exactly one closure note, not two", async () => {
    const { groupId: gid, members } = await setupGroup(1)
    const gauge = await makeGauge(gid, members[0], {
      activity: "beers",
      proposedDate: PROPOSED,
      createdAt: CREATED_2D_BEFORE,
    })
    await voteIn(gauge.id, members[0])

    const before = await orbitMessageCount(gid)
    const [a, b] = await Promise.all([
      runGaugeEndgame(CLOSE_TIME, { groupId: gid }),
      runGaugeEndgame(CLOSE_TIME, { groupId: gid }),
    ])
    const resultA = a.find((r) => r.gaugeId === gauge.id)
    const resultB = b.find((r) => r.gaugeId === gauge.id)
    const winner = [resultA, resultB].find((r) => r?.action === "closed_with_note")
    const loser = [resultA, resultB].find((r) => r?.action === "skipped")

    expect(winner).toEqual({ gaugeId: gauge.id, action: "closed_with_note" })
    expect(loser).toEqual({ gaugeId: gauge.id, action: "skipped", reason: "already_closed_out" })
    expect(await orbitMessageCount(gid)).toBe(before + 1)

    const refreshed = await prisma.gauge.findUniqueOrThrow({ where: { id: gauge.id } })
    expect(refreshed.closureMessageId).not.toBeNull()
  })

  it("closes with a note when someone was in", async () => {
    const { groupId: gid, members } = await setupGroup(1)
    const gauge = await makeGauge(gid, members[0], {
      activity: "beers",
      proposedDate: PROPOSED,
      createdAt: CREATED_2D_BEFORE,
    })
    await voteIn(gauge.id, members[0])

    const before = await orbitMessageCount(gid)
    const results = await runGaugeEndgame(CLOSE_TIME, { groupId: gid })
    expect(results.find((r) => r.gaugeId === gauge.id)).toEqual({ gaugeId: gauge.id, action: "closed_with_note" })
    expect(await orbitMessageCount(gid)).toBe(before + 1)

    const refreshed = await prisma.gauge.findUniqueOrThrow({ where: { id: gauge.id } })
    expect(refreshed.closureMessageId).not.toBeNull()
    const closureMsg = await prisma.message.findUniqueOrThrow({ where: { id: refreshed.closureMessageId! } })
    expect(closureMsg.body).toBe(buildClosureMessage("beers"))

    const afterFirstClose = await orbitMessageCount(gid)
    const second = await runGaugeEndgame(CLOSE_TIME_2, { groupId: gid })
    expect(second.find((r) => r.gaugeId === gauge.id)).toEqual({
      gaugeId: gauge.id,
      action: "skipped",
      reason: "already_closed_out",
    })
    expect(await orbitMessageCount(gid)).toBe(afterFirstClose)
  })

  it("closes silently at zero yeses", async () => {
    const { groupId: gid, members } = await setupGroup(1)
    const gauge = await makeGauge(gid, members[0], {
      activity: "beers",
      proposedDate: PROPOSED,
      createdAt: CREATED_2D_BEFORE,
    })
    // No votes at all.

    const before = await orbitMessageCount(gid)
    const results = await runGaugeEndgame(CLOSE_TIME, { groupId: gid })
    expect(results.find((r) => r.gaugeId === gauge.id)).toEqual({
      gaugeId: gauge.id,
      action: "skipped",
      reason: "closed_silently",
    })
    expect(await orbitMessageCount(gid)).toBe(before)

    const refreshed = await prisma.gauge.findUniqueOrThrow({ where: { id: gauge.id } })
    expect(refreshed.closureMessageId).toBeNull()
  })

  it("zero-vote close after an unanswered bump: the bump is the only new message", async () => {
    const { groupId: gid, members } = await setupGroup(2)
    const gauge = await makeGauge(gid, members[0], {
      activity: "beers",
      proposedDate: PROPOSED,
      createdAt: CREATED_2D_BEFORE,
    })
    await postLaterMessage(gid, members[1], new Date(CREATED_2D_BEFORE.getTime() + 3600_000))
    // No votes at all, before or after the bump.

    const baseline = await orbitMessageCount(gid)

    const bumpResults = await runGaugeEndgame(EVE_8PM, { groupId: gid })
    expect(bumpResults.find((r) => r.gaugeId === gauge.id)?.action).toBe("bumped")

    const closeResults = await runGaugeEndgame(CLOSE_TIME, { groupId: gid })
    expect(closeResults.find((r) => r.gaugeId === gauge.id)).toEqual({
      gaugeId: gauge.id,
      action: "skipped",
      reason: "closed_silently",
    })

    // Exactly one new ORBIT message across both sweeps: the bump. The close
    // sweep, finding zero yeses even after the bump, wrote nothing.
    expect(await orbitMessageCount(gid)).toBe(baseline + 1)
    const refreshed = await prisma.gauge.findUniqueOrThrow({ where: { id: gauge.id } })
    expect(refreshed.bumpMessageId).not.toBeNull()
    expect(refreshed.closureMessageId).toBeNull()
  })

  it("a promoted gauge is left alone", async () => {
    const { groupId: gid, members } = await setupGroup(1)
    const gauge = await makeGauge(gid, members[0], {
      activity: "beers",
      proposedDate: PROPOSED,
      createdAt: CREATED_2D_BEFORE,
    })
    const event = await prisma.event.create({
      data: {
        groupId: gid,
        title: "[TEST] Promoted Beers",
        startsAt: new Date("2099-06-12T19:00:00Z"),
        gaugeId: gauge.id,
      },
    })
    eventIds.push(event.id)

    const before = await orbitMessageCount(gid)
    const results = await runGaugeEndgame(CLOSE_TIME, { groupId: gid })
    expect(results.find((r) => r.gaugeId === gauge.id)).toEqual({
      gaugeId: gauge.id,
      action: "skipped",
      reason: "promoted",
    })
    expect(await orbitMessageCount(gid)).toBe(before)

    const refreshed = await prisma.gauge.findUniqueOrThrow({ where: { id: gauge.id } })
    expect(refreshed.bumpMessageId).toBeNull()
    expect(refreshed.closureMessageId).toBeNull()
  })

  it("scoping: only touches the given group", async () => {
    const { groupId: gid, members } = await setupGroup(1)
    const { groupId: otherGid, members: otherMembers } = await setupGroup(1, true)

    // A gauge in the SCOPED group: not eligible for anything at this instant
    // (still two days out), just present so the scoped sweep has something to
    // process.
    await makeGauge(gid, members[0], {
      activity: "chess",
      proposedDate: new Date(PROPOSED.getTime() + 2 * 24 * 60 * 60 * 1000),
      createdAt: STILL_OPEN_NOW,
    })

    // A gauge in the OTHER group, fully eligible to bump right now.
    const otherGauge = await makeGauge(otherGid, otherMembers[0], {
      activity: "beers",
      proposedDate: PROPOSED,
      createdAt: CREATED_2D_BEFORE,
    })
    await voteIn(otherGauge.id, otherMembers[0])
    await postLaterMessage(otherGid, otherMembers[0], new Date(CREATED_2D_BEFORE.getTime() + 3600_000))

    const before = await orbitMessageCount(otherGid)
    const results = await runGaugeEndgame(EVE_8PM, { groupId: gid })

    // No result at all for the other group's gauge — the scoped query never
    // fetched it.
    expect(results.find((r) => r.gaugeId === otherGauge.id)).toBeUndefined()
    expect(await orbitMessageCount(otherGid)).toBe(before)
    const refreshed = await prisma.gauge.findUniqueOrThrow({ where: { id: otherGauge.id } })
    expect(refreshed.bumpMessageId).toBeNull()
  })

  it("a day-blocked eligible close gets the ask, not the goodbye", async () => {
    const { groupId: gid, members } = await setupGroup(3)
    const gauge = await makeGauge(gid, members[0], {
      activity: "beers",
      proposedDate: PROPOSED,
      createdAt: CREATED_2D_BEFORE,
    })
    await voteIn(gauge.id, members[0])
    await voteIn(gauge.id, members[1])
    await voteNotThatDay(gauge.id, members[2])

    const before = await orbitMessageCount(gid)
    const results = await runGaugeEndgame(CLOSE_TIME, { groupId: gid })
    expect(results.find((r) => r.gaugeId === gauge.id)).toEqual({ gaugeId: gauge.id, action: "asked" })
    expect(await orbitMessageCount(gid)).toBe(before + 1)

    const refreshed = await prisma.gauge.findUniqueOrThrow({ where: { id: gauge.id } })
    expect(refreshed.retryAskMessageId).not.toBeNull()
    expect(refreshed.closureMessageId).toBeNull()
    const askMsg = await prisma.message.findUniqueOrThrow({ where: { id: refreshed.retryAskMessageId! } })
    expect(askMsg.body).toBe(buildRetryAskMessage("beers", PROPOSED, "UTC", 3))
    expect(askMsg.body).toBe("Beers didn't happen for Friday, but three of you want it. What day works better?")
    expect(askMsg.authorType).toBe(MessageAuthor.ORBIT)
    expect(askMsg.authorId).toBeNull()
  })

  it("zero-yes but day-blocked gets the ask, not silence", async () => {
    const { groupId: gid, members } = await setupGroup(3)
    const gauge = await makeGauge(gid, members[0], {
      activity: "beers",
      proposedDate: PROPOSED,
      createdAt: CREATED_2D_BEFORE,
    })
    await voteNotThatDay(gauge.id, members[0])
    await voteNotThatDay(gauge.id, members[1])
    await voteNotThatDay(gauge.id, members[2])

    const results = await runGaugeEndgame(CLOSE_TIME, { groupId: gid })
    expect(results.find((r) => r.gaugeId === gauge.id)).toEqual({ gaugeId: gauge.id, action: "asked" })

    const refreshed = await prisma.gauge.findUniqueOrThrow({ where: { id: gauge.id } })
    expect(refreshed.retryAskMessageId).not.toBeNull()
    expect(refreshed.closureMessageId).toBeNull()
  })

  it("two in, nobody blocked by the day: ordinary goodbye", async () => {
    const { groupId: gid, members } = await setupGroup(2)
    const gauge = await makeGauge(gid, members[0], {
      activity: "beers",
      proposedDate: PROPOSED,
      createdAt: CREATED_2D_BEFORE,
    })
    await voteIn(gauge.id, members[0])
    await voteIn(gauge.id, members[1])

    const results = await runGaugeEndgame(CLOSE_TIME, { groupId: gid })
    expect(results.find((r) => r.gaugeId === gauge.id)).toEqual({ gaugeId: gauge.id, action: "closed_with_note" })

    const refreshed = await prisma.gauge.findUniqueOrThrow({ where: { id: gauge.id } })
    expect(refreshed.retryAskMessageId).toBeNull()
    expect(refreshed.closureMessageId).not.toBeNull()
  })

  it("below the bar with a can't-day still gets the ordinary close, with or without an IN", async () => {
    const { groupId: gid, members } = await setupGroup(2)
    const withNote = await makeGauge(gid, members[0], {
      activity: "beers",
      proposedDate: PROPOSED,
      createdAt: CREATED_2D_BEFORE,
    })
    await voteIn(withNote.id, members[0])
    await voteNotThatDay(withNote.id, members[1])

    const silent = await makeGauge(gid, members[0], {
      activity: "hiking",
      proposedDate: PROPOSED,
      createdAt: CREATED_2D_BEFORE,
    })
    await voteNotThatDay(silent.id, members[1])

    const results = await runGaugeEndgame(CLOSE_TIME, { groupId: gid })
    expect(results.find((r) => r.gaugeId === withNote.id)).toEqual({
      gaugeId: withNote.id,
      action: "closed_with_note",
    })
    expect(results.find((r) => r.gaugeId === silent.id)).toEqual({
      gaugeId: silent.id,
      action: "skipped",
      reason: "closed_silently",
    })

    const refreshedNote = await prisma.gauge.findUniqueOrThrow({ where: { id: withNote.id } })
    expect(refreshedNote.retryAskMessageId).toBeNull()
    const refreshedSilent = await prisma.gauge.findUniqueOrThrow({ where: { id: silent.id } })
    expect(refreshedSilent.retryAskMessageId).toBeNull()
    expect(refreshedSilent.closureMessageId).toBeNull()
  })

  it("counts are member-filtered: a departed NOT_THAT_DAY voter cannot make a gauge eligible", async () => {
    const { groupId: gid, members } = await setupGroup(3)
    const gauge = await makeGauge(gid, members[0], {
      activity: "beers",
      proposedDate: PROPOSED,
      createdAt: CREATED_2D_BEFORE,
    })
    await voteIn(gauge.id, members[0])
    await voteNotThatDay(gauge.id, members[1])
    await voteNotThatDay(gauge.id, members[2])
    // members[2] leaves the group: their NOT_THAT_DAY vote no longer counts,
    // so 1 IN + 1 (member-filtered) NOT_THAT_DAY is short of eligibility.
    await prisma.membership.deleteMany({ where: { groupId: gid, userId: members[2] } })

    const results = await runGaugeEndgame(CLOSE_TIME, { groupId: gid })
    expect(results.find((r) => r.gaugeId === gauge.id)).toEqual({ gaugeId: gauge.id, action: "closed_with_note" })

    const refreshed = await prisma.gauge.findUniqueOrThrow({ where: { id: gauge.id } })
    expect(refreshed.retryAskMessageId).toBeNull()
    expect(refreshed.closureMessageId).not.toBeNull()
  })

  it("the ask never posts twice", async () => {
    const { groupId: gid, members } = await setupGroup(3)
    const gauge = await makeGauge(gid, members[0], {
      activity: "beers",
      proposedDate: PROPOSED,
      createdAt: CREATED_2D_BEFORE,
    })
    await voteIn(gauge.id, members[0])
    await voteIn(gauge.id, members[1])
    await voteNotThatDay(gauge.id, members[2])

    const first = await runGaugeEndgame(CLOSE_TIME, { groupId: gid })
    expect(first.find((r) => r.gaugeId === gauge.id)?.action).toBe("asked")

    const before = await orbitMessageCount(gid)
    const second = await runGaugeEndgame(CLOSE_TIME_2, { groupId: gid })
    // CLOSE_TIME_2 is still the failed day itself: the asked gauge now routes
    // into the guess phase (Task 7), which reports "awaiting_answer" until
    // the evening after. "already_asked" remains reachable only from
    // handleAsk's own lost-race catch (the concurrent-ask test below).
    expect(second.find((r) => r.gaugeId === gauge.id)).toEqual({
      gaugeId: gauge.id,
      action: "skipped",
      reason: "awaiting_answer",
    })
    expect(await orbitMessageCount(gid)).toBe(before)
  })

  it("a race between two overlapping sweeps produces exactly one ask, not two", async () => {
    const { groupId: gid, members } = await setupGroup(3)
    const gauge = await makeGauge(gid, members[0], {
      activity: "beers",
      proposedDate: PROPOSED,
      createdAt: CREATED_2D_BEFORE,
    })
    await voteIn(gauge.id, members[0])
    await voteIn(gauge.id, members[1])
    await voteNotThatDay(gauge.id, members[2])

    const before = await orbitMessageCount(gid)
    const [a, b] = await Promise.all([
      runGaugeEndgame(CLOSE_TIME, { groupId: gid }),
      runGaugeEndgame(CLOSE_TIME, { groupId: gid }),
    ])
    const resultA = a.find((r) => r.gaugeId === gauge.id)
    const resultB = b.find((r) => r.gaugeId === gauge.id)
    const winner = [resultA, resultB].find((r) => r?.action === "asked")
    const loser = [resultA, resultB].find((r) => r?.action === "skipped")

    expect(winner).toEqual({ gaugeId: gauge.id, action: "asked" })
    expect(loser).toEqual({ gaugeId: gauge.id, action: "skipped", reason: "already_asked" })
    expect(await orbitMessageCount(gid)).toBe(before + 1)

    const refreshed = await prisma.gauge.findUniqueOrThrow({ where: { id: gauge.id } })
    expect(refreshed.retryAskMessageId).not.toBeNull()
  })

  // -------------------------------------------------------------------------
  // The sweep learns to guess, once (Task 7)
  // -------------------------------------------------------------------------

  it("the guess fires the next evening, with a new gauge row and its own Orbit message", async () => {
    const { groupId: gid, members } = await setupGroup(3)
    const gauge = await stageAskedGauge(gid, members)

    const before = await orbitMessageCount(gid)
    const results = await runGaugeEndgame(NEXT_EVE_8PM, { groupId: gid })
    expect(results.find((r) => r.gaugeId === gauge.id)).toEqual({ gaugeId: gauge.id, action: "guessed" })
    expect(await orbitMessageCount(gid)).toBe(before + 1)

    const guessGauge = await prisma.gauge.findFirstOrThrow({ where: { retryGuessOfGaugeId: gauge.id } })
    expect(guessGauge.retryGuessOfGaugeId).toBe(gauge.id)
    expect(guessGauge.sourceMessageId).toBeNull()
    expect(guessGauge.proposedDate.toISOString()).toBe("2099-06-19T00:00:00.000Z") // same weekday, one week later
    expect(guessGauge.proposedTime).toBe(gauge.proposedTime) // copied from the original, never re-derived

    const voteCount = await prisma.gaugeVote.count({ where: { gaugeId: guessGauge.id } })
    expect(voteCount).toBe(0)

    const guessMsg = await prisma.message.findUniqueOrThrow({ where: { id: guessGauge.orbitMessageId } })
    expect(guessMsg.body).toBe("No takers on a new day yet, so how about beers next Friday?")
    expect(guessMsg.authorType).toBe(MessageAuthor.ORBIT)
    expect(guessMsg.authorId).toBeNull()
  })

  it("does not guess before the evening after, or while still the failed day", async () => {
    const { groupId: gid, members } = await setupGroup(3)
    const gauge = await stageAskedGauge(gid, members)

    const tooEarly = await runGaugeEndgame(NEXT_EVE_3PM, { groupId: gid })
    expect(tooEarly.find((r) => r.gaugeId === gauge.id)).toEqual({
      gaugeId: gauge.id,
      action: "skipped",
      reason: "awaiting_answer",
    })

    const stillFailedDay = await runGaugeEndgame(CLOSE_TIME_2, { groupId: gid })
    expect(stillFailedDay.find((r) => r.gaugeId === gauge.id)).toEqual({
      gaugeId: gauge.id,
      action: "skipped",
      reason: "awaiting_answer",
    })

    const guessExists = await prisma.gauge.findFirst({ where: { retryGuessOfGaugeId: gauge.id } })
    expect(guessExists).toBeNull()
  })

  it("a member answer for the same activity cancels the guess", async () => {
    const { groupId: gid, members } = await setupGroup(3)
    const gauge = await stageAskedGauge(gid, members)
    const askCreatedAt = await retryAskCreatedAt(gauge.id)

    // A same-activity gauge opened after the ask.
    await makeGauge(gid, members[0], {
      activity: "beers",
      proposedDate: new Date(PROPOSED.getTime() + 14 * 24 * 60 * 60 * 1000),
      createdAt: new Date(askCreatedAt.getTime() + 60_000),
    })

    const results = await runGaugeEndgame(NEXT_EVE_8PM, { groupId: gid })
    expect(results.find((r) => r.gaugeId === gauge.id)).toEqual({
      gaugeId: gauge.id,
      action: "skipped",
      reason: "answered",
    })

    const guessExists = await prisma.gauge.findFirst({ where: { retryGuessOfGaugeId: gauge.id } })
    expect(guessExists).toBeNull()
  })

  it("a different activity opened after the ask does not cancel the guess (spec decision 6)", async () => {
    const { groupId: gid, members } = await setupGroup(3)
    const gauge = await stageAskedGauge(gid, members)
    const askCreatedAt = await retryAskCreatedAt(gauge.id)

    await makeGauge(gid, members[0], {
      activity: "bowling",
      proposedDate: new Date(PROPOSED.getTime() + 14 * 24 * 60 * 60 * 1000),
      createdAt: new Date(askCreatedAt.getTime() + 60_000),
    })

    const results = await runGaugeEndgame(NEXT_EVE_8PM, { groupId: gid })
    expect(results.find((r) => r.gaugeId === gauge.id)).toEqual({ gaugeId: gauge.id, action: "guessed" })
  })

  it("never guesses twice", async () => {
    const { groupId: gid, members } = await setupGroup(3)
    const gauge = await stageAskedGauge(gid, members)

    const first = await runGaugeEndgame(NEXT_EVE_8PM, { groupId: gid })
    expect(first.find((r) => r.gaugeId === gauge.id)?.action).toBe("guessed")

    const before = await orbitMessageCount(gid)
    const second = await runGaugeEndgame(new Date(NEXT_EVE_8PM.getTime() + 60 * 60 * 1000), { groupId: gid })
    expect(second.find((r) => r.gaugeId === gauge.id)).toEqual({
      gaugeId: gauge.id,
      action: "skipped",
      reason: "already_guessed",
    })
    expect(await orbitMessageCount(gid)).toBe(before)

    const guesses = await prisma.gauge.findMany({ where: { retryGuessOfGaugeId: gauge.id } })
    expect(guesses).toHaveLength(1)
  })

  it("a race between two overlapping sweeps produces exactly one guess, not two", async () => {
    const { groupId: gid, members } = await setupGroup(3)
    const gauge = await stageAskedGauge(gid, members)

    const [a, b] = await Promise.all([
      runGaugeEndgame(NEXT_EVE_8PM, { groupId: gid }),
      runGaugeEndgame(NEXT_EVE_8PM, { groupId: gid }),
    ])
    const resultA = a.find((r) => r.gaugeId === gauge.id)
    const resultB = b.find((r) => r.gaugeId === gauge.id)
    const winner = [resultA, resultB].find((r) => r?.action === "guessed")
    const loser = [resultA, resultB].find((r) => r?.action === "skipped")

    // Either the pre-check or the lost P2002 race can produce the loser's
    // reason; both read as "already_guessed", so only the reason is asserted.
    expect(winner).toEqual({ gaugeId: gauge.id, action: "guessed" })
    expect(loser).toEqual({ gaugeId: gauge.id, action: "skipped", reason: "already_guessed" })

    const guesses = await prisma.gauge.findMany({ where: { retryGuessOfGaugeId: gauge.id } })
    expect(guesses).toHaveLength(1)
  })

  it("the guess gauge lives the ordinary life and never earns its own ask, with a note when someone was in", async () => {
    const { groupId: gid, members } = await setupGroup(3)
    const gauge = await stageAskedGauge(gid, members)

    const guessResults = await runGaugeEndgame(NEXT_EVE_8PM, { groupId: gid })
    expect(guessResults.find((r) => r.gaugeId === gauge.id)?.action).toBe("guessed")

    const guessGauge = await prisma.gauge.findFirstOrThrow({ where: { retryGuessOfGaugeId: gauge.id } })
    // Would-have-cleared shape: 2 IN + 1 NOT_THAT_DAY. A retry guess gauge
    // never earns its own ask (spec decision 7) — this proves it gets the
    // ordinary close instead, even though the same vote shape on an ordinary
    // gauge would trigger handleAsk.
    await voteIn(guessGauge.id, members[0])
    await voteIn(guessGauge.id, members[1])
    await voteNotThatDay(guessGauge.id, members[2])

    const before = await orbitMessageCount(gid)
    // 1 minute past the guess gauge's own close: proposedDate 2099-06-19,
    // proposedTime copied as "19:00", close = start - 2h = 17:00.
    const results = await runGaugeEndgame(new Date("2099-06-19T17:01:00Z"), { groupId: gid })
    expect(results.find((r) => r.gaugeId === guessGauge.id)).toEqual({
      gaugeId: guessGauge.id,
      action: "closed_with_note",
    })
    expect(await orbitMessageCount(gid)).toBe(before + 1)

    const refreshed = await prisma.gauge.findUniqueOrThrow({ where: { id: guessGauge.id } })
    expect(refreshed.retryAskMessageId).toBeNull()
    expect(refreshed.closureMessageId).not.toBeNull()
  })

  it("a zero-vote guess gauge closes silently, never earns its own ask", async () => {
    const { groupId: gid, members } = await setupGroup(3)
    const gauge = await stageAskedGauge(gid, members)

    const guessResults = await runGaugeEndgame(NEXT_EVE_8PM, { groupId: gid })
    expect(guessResults.find((r) => r.gaugeId === gauge.id)?.action).toBe("guessed")

    const guessGauge = await prisma.gauge.findFirstOrThrow({ where: { retryGuessOfGaugeId: gauge.id } })
    // No votes at all on the guess gauge.

    const before = await orbitMessageCount(gid)
    const results = await runGaugeEndgame(new Date("2099-06-19T17:01:00Z"), { groupId: gid })
    expect(results.find((r) => r.gaugeId === guessGauge.id)).toEqual({
      gaugeId: guessGauge.id,
      action: "skipped",
      reason: "closed_silently",
    })
    expect(await orbitMessageCount(gid)).toBe(before)

    const refreshed = await prisma.gauge.findUniqueOrThrow({ where: { id: guessGauge.id } })
    expect(refreshed.retryAskMessageId).toBeNull()
    expect(refreshed.closureMessageId).toBeNull()
  })

  it("computes the guess evening and guess date correctly in a non-UTC group (America/Chicago)", async () => {
    const { groupId: gid, members } = await setupGroup(3, true, "America/Chicago")

    const chicagoProposed = zonedWallTimeToUtc(2099, 6, 12, 0, 0, "America/Chicago") // Friday, Chicago-local midnight
    const gauge = await makeGauge(gid, members[0], {
      activity: "beers",
      proposedDate: chicagoProposed,
      createdAt: new Date(chicagoProposed.getTime() - 2 * 24 * 60 * 60 * 1000),
    })
    await voteIn(gauge.id, members[0])
    await voteIn(gauge.id, members[1])
    await voteNotThatDay(gauge.id, members[2])

    // 1 minute past the gauge's close (19:00 Chicago start minus 2h = 17:00 Chicago).
    const chicagoCloseTime = zonedWallTimeToUtc(2099, 6, 12, 17, 1, "America/Chicago")
    const asked = await runGaugeEndgame(chicagoCloseTime, { groupId: gid })
    expect(asked.find((r) => r.gaugeId === gauge.id)).toEqual({ gaugeId: gauge.id, action: "asked" })

    // The evening after, Chicago-local 8pm on the Saturday.
    const chicagoNextEve8pm = zonedWallTimeToUtc(2099, 6, 13, 20, 0, "America/Chicago")
    const results = await runGaugeEndgame(chicagoNextEve8pm, { groupId: gid })
    expect(results.find((r) => r.gaugeId === gauge.id)).toEqual({ gaugeId: gauge.id, action: "guessed" })

    const guessGauge = await prisma.gauge.findFirstOrThrow({ where: { retryGuessOfGaugeId: gauge.id } })
    const expectedGuessDate = zonedWallTimeToUtc(2099, 6, 19, 0, 0, "America/Chicago") // same weekday, one week later, Chicago midnight
    expect(guessGauge.proposedDate.toISOString()).toBe(expectedGuessDate.toISOString())
  })
})
