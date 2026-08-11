// scripts/qa-stage-groupinfo.ts
//
// Fleshes out a browser-created group for the group-info walkthrough.
//
// Usage:
//   1. In the browser: create a group through real onboarding ("[QA] Group
//      Info", two rhythms, one with a venue). The browser session is the
//      founder, which is the only way a founder-view walkthrough can exist.
//   2. npm run db:which   (always, before any script that writes)
//   3. npx tsx --env-file=.env scripts/qa-stage-groupinfo.ts --flesh <groupId>
//
// What --flesh adds to the group:
//   - Three seeded members (Theo, Ravi, Elle) with fake auth ids.
//   - One LIVE gauge ("beers", two days out at 19:00) with a seeded IN vote
//     from Theo, so removing Theo in the walkthrough visibly drops the tally
//     from the group home (the self-heal the spec's decision 7 claims).
//
// WHERE IT WRITES: whichever database .env points at; requireDevTest refuses
// to run unless all three env sources agree on the dev-test ref, same as
// qa-stage-daycomment.ts (the enforced precedent).
//
// This is QA tooling, deliberately outside the test suite: it writes real
// rows to a shared database. Not named *.test.ts, which is what keeps
// Vitest from collecting it.
//
// Adjustments made from the task brief's draft, after reading the real
// exports (createGauge in src/lib/gauges/create.ts, gaugeClosesAt and
// buildGaugeMessage in src/lib/orbit/spark-copy.ts, zonedWallTimeToUtc and
// getLocalParts in src/lib/orbit/occurrence.ts):
//   - createGauge takes { groupId, sourceMessageId, activity, proposedDate,
//     proposedTime, body, initiatorUserId? } and creates Orbit's message
//     itself inside its own transaction. There is no orbitMessageId,
//     activityLabel, startsAtUtc, seedVoterIds, or closesAt input; Gauge has
//     no stored closesAt column at all (isGaugeLive/gaugeClosesAt compute it
//     from proposedDate/proposedTime/createdAt on every read).
//   - A source Message (the MEMBER "beers" idea) is created first and its id
//     passed as sourceMessageId, matching qa-stage-daycomment.ts's pattern.
//   - Theo's seeded IN vote is written as a direct gaugeVote row after
//     createGauge, not through initiatorUserId: that field specifically means
//     "this member named the proposed day themselves," which is not the claim
//     this script makes (Orbit picked the day here, same as the daycomment
//     precedent's seeding of Ravi's IN vote as a direct row).
//   - proposedDate is a group-local midnight Date, built via
//     getLocalParts + zonedWallTimeToUtc(year, month, day, 0, 0, timeZone),
//     not a UTC start instant; proposedTime is the separate "19:00" string.
//   - gaugeClosesAt's real signature is (proposedDate, proposedTime,
//     createdAt, timeZone), used here only to print an informational close
//     time, never stored.

import { prisma } from "../src/lib/prisma"
import { createGauge } from "../src/lib/gauges/create"
import { getLocalParts, zonedWallTimeToUtc } from "../src/lib/orbit/occurrence"
import { buildGaugeMessage, gaugeClosesAt } from "../src/lib/orbit/spark-copy"
import { judge } from "./db-which"
import { MessageAuthor, GaugeAnswer } from "@prisma/client"

/** The same ref db:which checks against (CLAUDE.md, "Two databases, never crossed"). */
const EXPECTED_DEV_TEST_REF = "pxbewardwvoyqqcvogel"

function requireDevTest(): void {
  const verdict = judge(process.env, EXPECTED_DEV_TEST_REF)
  if (verdict.ok) return
  console.error(`STOP: this checkout is NOT confirmed to be dev-test.`)
  for (const p of verdict.problems) console.error(`  - ${p}`)
  console.error(`Run npm run db:which and resolve it before running this script.`)
  process.exit(1)
}

async function flesh(groupId: string) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: { memberships: true },
  })
  if (!group) throw new Error(`No group with id ${groupId}`)

  const stamp = Date.now()
  const theo = await prisma.user.create({
    data: { name: "Theo", supabaseAuthId: `qa-groupinfo-theo-${stamp}` },
  })
  const ravi = await prisma.user.create({
    data: { name: "Ravi", supabaseAuthId: `qa-groupinfo-ravi-${stamp}` },
  })
  const elle = await prisma.user.create({
    data: { name: "Elle", supabaseAuthId: `qa-groupinfo-elle-${stamp}` },
  })
  await prisma.membership.createMany({
    data: [theo.id, ravi.id, elle.id].map((userId) => ({ userId, groupId })),
  })

  // A live gauge with Theo's seeded yes: removing Theo should visibly drop
  // the tally on the group home (decision 7's self-heal, observed for real).
  const now = new Date()
  const local = getLocalParts(now, group.timeZone)
  const proposedDate = zonedWallTimeToUtc(local.year, local.month, local.day + 2, 0, 0, group.timeZone)
  const proposedTime = "19:00"

  const source = await prisma.message.create({
    data: {
      groupId,
      authorType: MessageAuthor.MEMBER,
      authorId: theo.id,
      body: "beers this week?",
    },
  })

  const body = buildGaugeMessage("beers", proposedDate, group.timeZone, now, null)
  const created = await createGauge({
    groupId,
    sourceMessageId: source.id,
    activity: "beers",
    proposedDate,
    proposedTime,
    body,
  })
  if (created.status !== "created") {
    throw new Error(`staging the live gauge did not create it: ${created.reason}`)
  }

  // Theo's seeded IN vote, as a direct row rather than createGauge's
  // initiatorUserId (which means "this member named the day," not the claim
  // made here: Orbit picked the day, Theo is just an early yes).
  await prisma.gaugeVote.create({
    data: { gaugeId: created.gauge.id, userId: theo.id, answer: GaugeAnswer.IN },
  })

  const closesAt = gaugeClosesAt(proposedDate, proposedTime, created.gauge.createdAt, group.timeZone)

  console.log(`Fleshed group ${group.name} (${groupId}):`)
  console.log(`  members added: Theo, Ravi, Elle`)
  console.log(`  live gauge: beers, ${proposedDate.toISOString().slice(0, 10)} 19:00 ${group.timeZone}, Theo seeded IN`)
  console.log(`  gauge id: ${created.gauge.id}`)
  console.log(`  closes at: ${closesAt.toISOString()}`)
  console.log(`Links:`)
  console.log(`  group home:  http://localhost:3000/groups/${groupId}`)
  console.log(`  group info:  http://localhost:3000/groups/${groupId}/info`)
  console.log(`  invite link: http://localhost:3000/join/${group.inviteToken}`)
}

async function main() {
  requireDevTest()

  const fleshAt = process.argv.indexOf("--flesh")
  if (fleshAt === -1) {
    console.error("Usage: npx tsx --env-file=.env scripts/qa-stage-groupinfo.ts --flesh <groupId>")
    process.exit(1)
  }
  const id = process.argv[fleshAt + 1]
  if (!id) throw new Error("--flesh needs a group id")
  await flesh(id)
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
