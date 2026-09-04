// scripts/qa-stage-retry.ts
//
// Stages the wrong-day-retry QA walkthrough in one group, so every retry state
// exists at once instead of waiting for two real evenings to arrive. It creates
// a fresh group ("Riverside Runners") with four seeded members and three
// gauges, all on yesterday's local day so all three are already closed, then
// runs the REAL sweep (scoped to that group only) twice against controlled
// clocks: once just after yesterday's close time, which turns the two
// day-blocked gauges into asks and closes the below-bar one with its ordinary
// goodbye, and once at 8:30pm group-local tonight, which is the evening after
// the failed day and therefore the guess moment. Nothing is faked; the staging
// is the clock.
//
// The darts-style live cases (a real message going through real detection) are
// already covered by scripts/qa-stage-endgame.ts. This one stages only the
// retry states.
//
// What it leaves behind, ready to click:
//   - beers: asked, unanswered, then guessed. A live guess gauge with chips
//     proposing the same weekday one week after the day that failed.
//   - breakfast: asked, then answered by a member naming a day, so the sweep
//     reports "answered" and no guess is posted. The member's revival gauge is
//     live with the namer seeded in.
//   - yoga: one yes and one can't-that-day, below the would-have-cleared bar,
//     so it gets the ordinary goodbye. The boundary, in the same feed.
//
// SECOND MODE, for the promotion half of the walkthrough:
//
//   npx tsx --env-file=.env scripts/qa-stage-retry.ts --arm-guess <gaugeId>
//
// A guess gauge is born with nobody seeded (Orbit named the day, and Orbit is
// never a vote), which is the point of looking at it fresh first. Arming adds
// two seeded-member IN votes to it so the browser visitor's own tap is the
// third yes and creates the event through the real action. Run it only after
// the fresh state has been looked at.
//
// WHERE IT WRITES: whichever database `.env` points at. Run `npm run db:which`
// first, every time; this script has no idea which project it is talking to and
// will happily write to production if that is what `.env` says.
//
// This is QA tooling, deliberately outside the test suite: it writes real rows
// to a shared database and is meant to be run by hand before a browser
// walkthrough. Same precedent as scripts/qa-stage-endgame.ts and
// scripts/eval-detect.ts. It is not named *.test.ts, which is what keeps Vitest
// from collecting it.
//
// Usage: npx tsx --env-file=.env scripts/qa-stage-retry.ts
//
// Each run creates a NEW group with fresh users and a fresh invite token, so
// running it twice leaves two groups behind rather than updating the first.
// Delete the old one if you do not want it in the way.

import { prisma } from "../src/lib/prisma"
import { createGauge } from "../src/lib/gauges/create"
import { runGaugeEndgame } from "../src/lib/orbit/endgame"
import { zonedWallTimeToUtc, getLocalParts } from "../src/lib/orbit/occurrence"
import { buildGaugeMessage, chooseProposedDate } from "../src/lib/orbit/spark-copy"
import { MessageAuthor, GaugeAnswer } from "@prisma/client"

const TZ = "America/Chicago"

/** Adds two member IN votes to an existing guess gauge. See the header. */
async function armGuess(gaugeId: string) {
  const gauge = await prisma.gauge.findUnique({
    where: { id: gaugeId },
    include: { group: { include: { memberships: { include: { user: true } } } }, votes: true },
  })
  if (!gauge) throw new Error(`no gauge ${gaugeId}`)

  const alreadyVoted = new Set(gauge.votes.map((v) => v.userId))
  const armers = gauge.group.memberships
    .map((m) => m.user)
    .filter((u) => !alreadyVoted.has(u.id))
    .slice(0, 2)
  if (armers.length < 2) throw new Error("fewer than two members left to arm with")

  for (const user of armers) {
    await prisma.gaugeVote.create({
      data: { gaugeId, userId: user.id, answer: GaugeAnswer.IN },
    })
  }

  console.log(
    JSON.stringify(
      {
        armed: gaugeId,
        activity: gauge.activity,
        votesAdded: armers.map((u) => u.name),
        homeUrl: `http://localhost:3000/groups/${gauge.groupId}`,
        note: "the next IN tap through the UI is the third yes and creates the event",
      },
      null,
      2
    )
  )
}

async function main() {
  const armTarget = process.argv.indexOf("--arm-guess")
  if (armTarget !== -1) {
    const id = process.argv[armTarget + 1]
    if (!id) throw new Error("--arm-guess needs a gauge id")
    await armGuess(id)
    await prisma.$disconnect()
    return
  }

  const now = new Date()
  const p = getLocalParts(now, TZ)
  // Every staged gauge sits on yesterday's local day, which is what makes all
  // three already closed at the first sweep's clock and makes tonight the
  // evening after the failed day, which is the guess moment.
  const yesterdayMidnight = zonedWallTimeToUtc(p.year, p.month, p.day - 1, 0, 0, TZ)
  const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000)

  const stamp = Date.now()
  const founder = await prisma.user.create({ data: { name: "Priya", supabaseAuthId: `qa-retry-founder-${stamp}` } })
  const maya = await prisma.user.create({ data: { name: "Maya", supabaseAuthId: `qa-retry-maya-${stamp}` } })
  const jesse = await prisma.user.create({ data: { name: "Jesse", supabaseAuthId: `qa-retry-jesse-${stamp}` } })
  const sam = await prisma.user.create({ data: { name: "Sam", supabaseAuthId: `qa-retry-sam-${stamp}` } })
  const group = await prisma.group.create({
    data: {
      name: "Riverside Runners",
      founderId: founder.id,
      timeZone: TZ,
      inviteToken: `qa-retry-${stamp}`,
      memberships: { create: [founder.id, maya.id, jesse.id, sam.id].map((userId) => ({ userId })) },
    },
  })

  async function memberMsg(userId: string, body: string, createdAt: Date) {
    return prisma.message.create({
      data: { groupId: group.id, authorType: MessageAuthor.MEMBER, authorId: userId, body, createdAt },
    })
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
    await prisma.message.update({
      where: { id: r.gauge.orbitMessageId },
      data: { createdAt: new Date(opts.createdAt.getTime() + 1000) },
    })
    for (const [userId, answer] of opts.votes) {
      await prisma.gaugeVote.create({ data: { gaugeId: r.gauge.id, userId, answer } })
    }
    return r.gauge.id
  }

  // A: would have cleared, nobody answers the ask. This is the one that earns
  // the guess. 2 IN + 1 NOT_THAT_DAY = three people who want it.
  const beers = await stageGauge({
    activity: "beers", proposedDate: yesterdayMidnight, proposedTime: "19:00", createdAt: daysAgo(4),
    floatBody: "we should finally grab beers sometime", floater: maya.id,
    votes: [[maya.id, GaugeAnswer.IN], [jesse.id, GaugeAnswer.IN], [sam.id, GaugeAnswer.NOT_THAT_DAY]],
  })
  // B: would have cleared, and a member answers the ask with a day. The guess
  // is cancelled by the fresh same-activity gauge their answer opens.
  const breakfast = await stageGauge({
    activity: "breakfast", proposedDate: yesterdayMidnight, proposedTime: "09:00", createdAt: daysAgo(4),
    floatBody: "we should do breakfast sometime", floater: jesse.id,
    votes: [[jesse.id, GaugeAnswer.IN], [founder.id, GaugeAnswer.IN], [maya.id, GaugeAnswer.NOT_THAT_DAY]],
  })
  // C: below the would-have-cleared bar (two answers, not three), so it gets
  // the ordinary goodbye rather than the ask. The boundary, in the same feed.
  const yoga = await stageGauge({
    activity: "yoga", proposedDate: yesterdayMidnight, proposedTime: "09:00", createdAt: daysAgo(4),
    floatBody: "morning yoga anyone?", floater: maya.id,
    votes: [[maya.id, GaugeAnswer.IN], [sam.id, GaugeAnswer.NOT_THAT_DAY]],
  })

  // Sweep 1, just after yesterday's latest close time (beers closed at 5pm,
  // the two 9am ideas at 7am): beers and breakfast get the ask, yoga the
  // goodbye.
  const closeClock = zonedWallTimeToUtc(p.year, p.month, p.day - 1, 17, 5, TZ)
  const sweep1 = await runGaugeEndgame(closeClock, { groupId: group.id })

  // Somebody answers the breakfast ask by naming a day, and their answer rides
  // the ordinary spark path: a fresh gauge on that day with them seeded in.
  // Staged directly rather than through model detection, because the bench
  // (evals/detect) is what covers whether the model hears it, and it currently
  // says the model does not.
  const answerMsg = await memberMsg(sam.id, "sunday works for me", new Date())
  const sundayDate = chooseProposedDate(0, "morning", TZ, new Date(), null)
  const revival = await createGauge({
    groupId: group.id,
    sourceMessageId: answerMsg.id,
    activity: "breakfast",
    proposedDate: sundayDate,
    proposedTime: "09:00",
    body: buildGaugeMessage("breakfast", sundayDate, TZ, new Date(), null),
    initiatorUserId: sam.id,
  })
  if (revival.status !== "created") throw new Error("revival gauge failed to stage")

  // Sweep 2, 8:30pm group-local tonight: the evening after the failed day.
  // beers guesses, breakfast reports answered, yoga is already closed out.
  const eve = zonedWallTimeToUtc(p.year, p.month, p.day, 20, 30, TZ)
  const sweep2 = await runGaugeEndgame(eve, { groupId: group.id })

  const guess = await prisma.gauge.findUnique({
    where: { retryGuessOfGaugeId: beers },
    select: { id: true, proposedDate: true, proposedTime: true },
  })

  console.log(JSON.stringify({
    groupId: group.id,
    inviteUrl: `http://localhost:3000/join/${group.inviteToken}`,
    homeUrl: `http://localhost:3000/groups/${group.id}`,
    failedDayLocal: getLocalParts(yesterdayMidnight, TZ),
    gauges: { beers, breakfast, yoga, revival: revival.gauge.id },
    guessGauge: guess,
    sweep1, sweep2,
  }, null, 2))
  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
