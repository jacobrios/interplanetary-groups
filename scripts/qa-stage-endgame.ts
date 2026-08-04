// scripts/qa-stage-endgame.ts
//
// Stages the gauge-endgame QA walkthrough in one group, so every endgame state
// exists at once instead of waiting for real evenings to arrive. It creates a
// fresh group ("Westside Climbers") with three seeded members and four gauges,
// then runs the REAL sweep (scoped to that group only) twice against controlled
// clocks: once at the real now, which closes one gauge with its goodbye note and
// one in silence, and once at 8:30pm group-local tonight, which bumps the two
// gauges whose day is tomorrow. Nothing is faked; the staging is the clock.
//
// What it leaves behind, ready to click:
//   - beers tomorrow, two yeses, bumped: tap a chip as a third person to watch
//     the bump's own chip create the event.
//   - mini golf tomorrow, no yeses, bumped: the "in case this got buried" copy.
//   - breakfast today, one yes, closed with its note.
//   - yoga today, no yeses, closed in silence, no residue.
//
// WHERE IT WRITES: whichever database `.env` points at. Run `npm run db:which`
// first, every time; this script has no idea which project it is talking to and
// will happily write to production if that is what `.env` says.
//
// This is QA tooling, deliberately outside the test suite: it writes real rows
// to a shared database and is meant to be run by hand before a browser
// walkthrough. Same precedent as scripts/eval-detect.ts. It is not named
// *.test.ts, which is what keeps Vitest from collecting it.
//
// Usage: npx tsx --env-file=.env scripts/qa-stage-endgame.ts
//
// Each run creates a NEW group with fresh users and a fresh invite token, so
// running it twice leaves two groups behind rather than updating the first.
// Delete the old one if you do not want it in the way.

import { prisma } from "../src/lib/prisma"
import { createGauge } from "../src/lib/gauges/create"
import { runGaugeEndgame } from "../src/lib/orbit/endgame"
import { zonedWallTimeToUtc, getLocalParts } from "../src/lib/orbit/occurrence"
import { buildGaugeMessage } from "../src/lib/orbit/spark-copy"
import { MessageAuthor, GaugeAnswer } from "@prisma/client"

const TZ = "America/Chicago"

async function main() {
  const now = new Date()
  const p = getLocalParts(now, TZ)
  const todayMidnight = zonedWallTimeToUtc(p.year, p.month, p.day, 0, 0, TZ)
  const tomorrowMidnight = zonedWallTimeToUtc(p.year, p.month, p.day + 1, 0, 0, TZ)
  const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000)

  const founder = await prisma.user.create({ data: { name: "Priya", supabaseAuthId: `qa-endgame-founder-${Date.now()}` } })
  const maya = await prisma.user.create({ data: { name: "Maya", supabaseAuthId: `qa-endgame-maya-${Date.now()}` } })
  const jesse = await prisma.user.create({ data: { name: "Jesse", supabaseAuthId: `qa-endgame-jesse-${Date.now()}` } })
  const group = await prisma.group.create({
    data: {
      name: "Westside Climbers",
      founderId: founder.id,
      timeZone: TZ,
      inviteToken: `qa-endgame-${Date.now()}`,
      memberships: { create: [founder.id, maya.id, jesse.id].map((userId) => ({ userId })) },
    },
  })

  async function memberMsg(userId: string, body: string, createdAt: Date) {
    return prisma.message.create({ data: { groupId: group.id, authorType: MessageAuthor.MEMBER, authorId: userId, body, createdAt } })
  }

  async function stageGauge(opts: {
    activity: string
    proposedDate: Date
    proposedTime: string
    createdAt: Date
    floatBody: string
    floater: string
    votes: Array<[string, GaugeAnswer]>
  }) {
    const src = await memberMsg(opts.floater, opts.floatBody, opts.createdAt)
    const body = buildGaugeMessage(opts.activity, opts.proposedDate, TZ, opts.createdAt, null)
    const r = await createGauge({
      groupId: group.id,
      sourceMessageId: src.id,
      activity: opts.activity,
      proposedDate: opts.proposedDate,
      proposedTime: opts.proposedTime,
      body,
    })
    if (r.status !== "created") throw new Error(`stage failed: ${opts.activity}`)
    await prisma.gauge.update({ where: { id: r.gauge.id }, data: { createdAt: opts.createdAt } })
    await prisma.message.update({ where: { id: r.gauge.orbitMessageId }, data: { createdAt: new Date(opts.createdAt.getTime() + 1000) } })
    for (const [userId, answer] of opts.votes) {
      await prisma.gaugeVote.create({ data: { gaugeId: r.gauge.id, userId, answer } })
    }
    return r.gauge.id
  }

  // A: near-miss bump, two IN. The third yes will come from a live chip tap on the bump.
  const beers = await stageGauge({
    activity: "beers", proposedDate: tomorrowMidnight, proposedTime: "19:00", createdAt: daysAgo(2),
    floatBody: "we should finally grab beers sometime", floater: maya.id,
    votes: [[maya.id, GaugeAnswer.IN], [jesse.id, GaugeAnswer.IN]],
  })
  // B: ignored-idea bump, zero votes.
  const minigolf = await stageGauge({
    activity: "mini golf", proposedDate: tomorrowMidnight, proposedTime: "19:00", createdAt: daysAgo(2),
    floatBody: "anyone want to play mini golf?", floater: jesse.id,
    votes: [],
  })
  // C: closes with a note (one yes, close time already past).
  const breakfast = await stageGauge({
    activity: "breakfast", proposedDate: todayMidnight, proposedTime: "09:00", createdAt: daysAgo(3),
    floatBody: "we should do breakfast sometime", floater: jesse.id,
    votes: [[jesse.id, GaugeAnswer.IN]],
  })
  // D: zero-yes silent death (close time already past, no votes).
  const yoga = await stageGauge({
    activity: "yoga", proposedDate: todayMidnight, proposedTime: "09:00", createdAt: daysAgo(3),
    floatBody: "morning yoga anyone?", floater: maya.id,
    votes: [],
  })
  // A later member message so the two eve gauges are buried (not-newest guard).
  await memberMsg(jesse.id, "how was everyone's weekend?", new Date(now.getTime() - 60 * 60 * 1000))

  // Sweep 1, real now: closes C (note) and D (silently); A and B are not_the_eve yet.
  const sweep1 = await runGaugeEndgame(now, { groupId: group.id })
  // Sweep 2, controlled clock at 8:30pm tonight group-local: bumps A and B.
  const eve = zonedWallTimeToUtc(p.year, p.month, p.day, 20, 30, TZ)
  const sweep2 = await runGaugeEndgame(eve, { groupId: group.id })

  console.log(JSON.stringify({
    groupId: group.id,
    inviteUrl: `http://localhost:3000/join/${group.inviteToken}`,
    homeUrl: `http://localhost:3000/groups/${group.id}`,
    gauges: { beers, minigolf, breakfast, yoga },
    sweep1, sweep2,
  }, null, 2))
  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
