// scripts/qa-stage-deletion.ts
//
// Stages the "ready for other people's data" deletion QA walkthrough: enough
// state for the owner to exercise npm run person:delete end to end without
// inventing anything himself. This is not one of the slice's numbered tasks;
// it exists because his PR handoff procedure requires QA to arrive ready to
// run, state seeded, nothing for him to invent.
//
// Four groups, all prefixed "[QA] Deletion", covering three scenarios:
//
//   1. THE PLAIN DELETABLE MEMBER. Skyler Voss is a real member of
//      "[QA] Deletion Demo": they've written two chat messages, RSVP'd IN to
//      a confirmed event (answered a plan), voted IN on an open idea gauge
//      (voted on something), and have a "Skyler Voss joined" line in that
//      group's feed. Deleting them should show messages surviving as "Former
//      member," the RSVP and vote gone, and the join line offered for
//      removal as "definitely them."
//
//   2. THE BLOCKED FOUNDER. Robin Ortiz founded "[QA] Deletion Founder Trap"
//      and Devon Marsh is still in it. npm run person:delete refuses this one
//      outright and prints the handover instructions plus both ids —
//      docs/runbooks/person-deletion.md section 6, which the owner has never
//      seen render.
//
//   3. THE NAME-MATCH-ONLY CANDIDATE. A second, different person also named
//      "Skyler Voss" is a member of "[QA] Deletion Name Match," a group the
//      first Skyler Voss was never in. Looking up the first Skyler Voss finds
//      this stranger's join line too — same body text, "Skyler Voss joined"
//      — with nothing else tying the two together, so it surfaces as the
//      doubtful "name-match-only" class. This is deliberately the same
//      lookup as case 1, not a separate person to delete: seeing all three
//      evidence classes on ONE screen, for ONE deletion, is the point. A
//      fourth group, "[QA] Deletion Former Group," rounds the trio out: the
//      first Skyler Voss joined it, posted once, then left (their Membership
//      row deleted, same as a real "Leave group" tap), so its join line
//      surfaces as "probably them" — a real trace with no current membership
//      behind it. Without that fourth group only two of the three evidence
//      classes would ever appear.
//
// WHY THE SAME NAME ON PURPOSE. deletion-plan.ts's join-announcement search
// is product-wide by body text match (owner's ruling, 1 Sept 2026, recorded
// in that file), which is exactly what makes a same-named stranger's join
// line show up as a candidate for someone else's deletion. Reusing the name
// is the only way to stage that on purpose instead of hoping for a
// coincidence.
//
// This script seeds up to the confirmation prompt and stops. It never
// deletes anyone. Cases 1 and 3 are left for the owner to actually run
// through by hand — that is the whole QA exercise. Case 2 is safe to run
// ahead of time because a blocked plan prints and exits without asking for
// any confirmation; the printout below shows what that run actually produced.
//
// WHERE IT WRITES: whichever database `.env` points at. Run `npm run
// db:which` first, every time; this script refuses to run itself unless all
// three env sources agree on the dev-test project ref (see requireDevTest
// below), the same ref db:which checks against.
//
// Idempotent, same shape as qa-stage-email.ts and qa-stage-digest.ts: every
// fake user this script creates carries a supabaseAuthId under
// FAKE_AUTH_PREFIX, and every run starts by deleting any of its own groups
// left over from a prior run (which cascades away their memberships, events,
// messages, gauges and votes) and then sweeping any stray fake users that
// leaves behind. Safe to re-run even after the owner has actually completed
// case 1 or case 2 by hand; a group already deleted by person:delete is
// simply absent from the cleanup pass rather than an error.
//
// This is QA tooling, deliberately outside the test suite: it writes real
// rows to a shared database and is meant to be run by hand before a manual
// walkthrough. Not named *.test.ts, which is what keeps Vitest from
// collecting it.
//
// Usage: npm run qa:stage-deletion

import { prisma } from "../src/lib/prisma"
import { createEvent } from "../src/lib/events/create"
import { createGauge } from "../src/lib/gauges/create"
import { buildGaugeMessage } from "../src/lib/orbit/spark-copy"
import { zonedWallTimeToUtc, getLocalParts } from "../src/lib/orbit/occurrence"
import { formatMonthDay, formatWeekdayShort } from "../src/lib/events/format"
import { judge } from "./db-which"
import { MessageAuthor, GaugeAnswer, RsvpStatus } from "@prisma/client"

const TZ = "America/Denver"

/** The same ref db:which checks against (CLAUDE.md, "Two databases, never crossed"). */
const EXPECTED_DEV_TEST_REF = "pxbewardwvoyqqcvogel"

const DEMO_GROUP_NAME = "[QA] Deletion Demo"
const FORMER_GROUP_NAME = "[QA] Deletion Former Group"
const NAME_MATCH_GROUP_NAME = "[QA] Deletion Name Match"
const FOUNDER_TRAP_GROUP_NAME = "[QA] Deletion Founder Trap"
const GROUP_NAMES = [DEMO_GROUP_NAME, FORMER_GROUP_NAME, NAME_MATCH_GROUP_NAME, FOUNDER_TRAP_GROUP_NAME]

/** Every fake user this script creates carries this prefix, so cleanup can find them. */
const FAKE_AUTH_PREFIX = "qa-deletion-"

/** Shared on purpose by two different people. See the header comment. */
const TARGET_NAME = "Skyler Voss"
const FOUNDER_NAME = "Robin Ortiz"

/**
 * Refuses to run unless the checkout points at dev-test, on all three env
 * sources. This script writes real rows to a shared database and has no way
 * to know which project `.env` points at other than asking, so it asks
 * before doing anything else.
 */
function requireDevTest(): void {
  const verdict = judge(process.env, EXPECTED_DEV_TEST_REF)
  if (verdict.ok) return
  console.error(`STOP: this checkout is NOT confirmed to be dev-test.`)
  for (const p of verdict.problems) console.error(`  - ${p}`)
  console.error(`Run npm run db:which and resolve it before running this script.`)
  process.exit(1)
}

/**
 * Deletes this script's own groups from a prior run (cascading away their
 * memberships, events, messages, gauges and votes) and sweeps any stray fake
 * users that leaves behind. Same shape as qa-stage-email.ts's
 * replacePriorRuns, minus the "real viewer" complication that script has to
 * handle: nothing here is ever attached to the owner's own session, so a
 * plain sweep is the whole story.
 */
async function cleanupPriorRuns(): Promise<number> {
  const priorGroups = await prisma.group.findMany({ where: { name: { in: GROUP_NAMES } } })
  for (const g of priorGroups) {
    await prisma.group.delete({ where: { id: g.id } })
  }
  await prisma.user.deleteMany({ where: { supabaseAuthId: { startsWith: FAKE_AUTH_PREFIX } } })
  return priorGroups.length
}

async function main() {
  requireDevTest()
  const groupsCleaned = await cleanupPriorRuns()

  const stamp = Date.now()
  const now = new Date()
  const p = getLocalParts(now, TZ)

  async function makeUser(role: string, name: string) {
    return prisma.user.create({ data: { name, supabaseAuthId: `${FAKE_AUTH_PREFIX}${role}-${stamp}` } })
  }

  async function memberMsg(groupId: string, userId: string, body: string) {
    return prisma.message.create({
      data: { groupId, authorType: MessageAuthor.MEMBER, authorId: userId, body },
    })
  }

  async function joinLine(groupId: string, name: string) {
    return prisma.message.create({
      data: { groupId, authorType: MessageAuthor.SYSTEM, authorId: null, body: `${name} joined` },
    })
  }

  // ── Case 1: the plain deletable member ────────────────────────────────────
  const nora = await makeUser("nora", "Nora Higgins")
  const skyler = await makeUser("skyler", TARGET_NAME)
  const theo = await makeUser("theo", "Theo Park")

  const demoGroup = await prisma.group.create({
    data: {
      name: DEMO_GROUP_NAME,
      founderId: nora.id,
      timeZone: TZ,
      inviteToken: `qa-deletion-demo-${stamp}`,
      memberships: { create: [nora.id, skyler.id, theo.id].map((userId) => ({ userId })) },
    },
  })

  await joinLine(demoGroup.id, TARGET_NAME)
  await memberMsg(demoGroup.id, nora.id, "welcome, glad you're both here")
  await memberMsg(demoGroup.id, skyler.id, "hey everyone, excited to be part of this")
  await memberMsg(demoGroup.id, skyler.id, "who's up for a hike this weekend?")

  const hikeStart = zonedWallTimeToUtc(p.year, p.month, p.day + 5, 9, 0, TZ)
  const hike = await createEvent({
    groupId: demoGroup.id,
    title: "Group Hike",
    startsAt: hikeStart,
    activityLabel: "hike",
    venue: { name: "Cedar Ridge Trailhead" },
  })
  await prisma.rsvp.create({ data: { eventId: hike.id, userId: skyler.id, status: RsvpStatus.IN } })
  await prisma.rsvp.create({ data: { eventId: hike.id, userId: theo.id, status: RsvpStatus.IN } })

  const beersDate = zonedWallTimeToUtc(p.year, p.month, p.day + 2, 0, 0, TZ)
  const beersSrc = await memberMsg(demoGroup.id, theo.id, "should we grab beers after the hike?")
  const beersBody = buildGaugeMessage("beers", beersDate, TZ, now, null)
  const beersGauge = await createGauge({
    groupId: demoGroup.id,
    sourceMessageId: beersSrc.id,
    activity: "beers",
    proposedDate: beersDate,
    proposedTime: "19:00",
    body: beersBody,
    initiatorUserId: theo.id,
  })
  if (beersGauge.status !== "created") throw new Error("staging the beers gauge did not create it")
  await prisma.gaugeVote.create({
    data: { gaugeId: beersGauge.gauge.id, userId: skyler.id, answer: GaugeAnswer.IN },
  })

  // ── Case 3, part one: a "left-with-trace" join line ───────────────────────
  // Skyler really joins, posts once, then leaves (their Membership row
  // deleted, same as a real "Leave group" tap). The join line and the message
  // both survive that; only the membership goes.
  const micah = await makeUser("micah", "Micah Reyes")
  const formerGroup = await prisma.group.create({
    data: {
      name: FORMER_GROUP_NAME,
      founderId: micah.id,
      timeZone: TZ,
      inviteToken: `qa-deletion-former-${stamp}`,
      memberships: { create: [{ userId: micah.id }, { userId: skyler.id }] },
    },
  })
  await joinLine(formerGroup.id, TARGET_NAME)
  await memberMsg(formerGroup.id, skyler.id, "just poking around, might not be my thing")
  await prisma.membership.delete({ where: { userId_groupId: { userId: skyler.id, groupId: formerGroup.id } } })

  // ── Case 3, part two: the name-match-only stranger ────────────────────────
  // A second, different User row, same name, real member of a group the
  // first Skyler Voss has never set foot in.
  const rowan = await makeUser("rowan", "Rowan Blake")
  const strangerSkyler = await makeUser("skyler-stranger", TARGET_NAME)
  const nameMatchGroup = await prisma.group.create({
    data: {
      name: NAME_MATCH_GROUP_NAME,
      founderId: rowan.id,
      timeZone: TZ,
      inviteToken: `qa-deletion-namematch-${stamp}`,
      memberships: { create: [{ userId: rowan.id }, { userId: strangerSkyler.id }] },
    },
  })
  await joinLine(nameMatchGroup.id, TARGET_NAME)
  await memberMsg(nameMatchGroup.id, strangerSkyler.id, "hi all, glad to be here")

  // ── Case 2: the blocked founder ────────────────────────────────────────────
  const robin = await makeUser("robin", FOUNDER_NAME)
  const devon = await makeUser("devon", "Devon Marsh")
  const founderTrapGroup = await prisma.group.create({
    data: {
      name: FOUNDER_TRAP_GROUP_NAME,
      founderId: robin.id,
      timeZone: TZ,
      inviteToken: `qa-deletion-foundertrap-${stamp}`,
      memberships: { create: [{ userId: robin.id }, { userId: devon.id }] },
    },
  })
  await memberMsg(founderTrapGroup.id, robin.id, "started this group for us to plan game nights")
  await memberMsg(founderTrapGroup.id, devon.id, "excited to be here")

  // ── The printout. This is what the owner reads; everything he needs to run
  // the walkthrough comes from here, never from Prisma Studio. ──────────────
  const lines: string[] = []
  lines.push(
    groupsCleaned > 0
      ? `Cleared ${groupsCleaned} group(s) left over from a previous run of this script, then seeded fresh.`
      : `Seeded fresh (nothing left over from a previous run).`
  )
  lines.push("")
  lines.push("All the names below are fake QA fixtures this script just created, not real people:")
  lines.push("")
  lines.push(`  "${DEMO_GROUP_NAME}"`)
  lines.push(`    founder Nora Higgins, members Skyler Voss and Theo Park`)
  lines.push(`  "${FORMER_GROUP_NAME}"`)
  lines.push(`    founder Micah Reyes; Skyler Voss joined, posted once, then left`)
  lines.push(`  "${NAME_MATCH_GROUP_NAME}"`)
  lines.push(`    founder Rowan Blake, member Skyler Voss (a DIFFERENT person who just shares the name)`)
  lines.push(`  "${FOUNDER_TRAP_GROUP_NAME}"`)
  lines.push(`    founder Robin Ortiz, member Devon Marsh`)
  lines.push("")
  lines.push("=" .repeat(78))
  lines.push("CASE 1 + 3: the plain deletable member, and the doubtful name match")
  lines.push("=".repeat(78))
  lines.push("")
  lines.push(
    `Skyler Voss, in "${DEMO_GROUP_NAME}", has written 2 chat messages, RSVP'd IN to the ` +
      `Group Hike (${formatWeekdayShort(hikeStart, TZ)} ${formatMonthDay(hikeStart, TZ)}), voted IN on the open ` +
      `"beers?" idea, and has a join line in that group's feed.`
  )
  lines.push("")
  lines.push("Run:")
  lines.push(`  npm run person:delete -- --name "${TARGET_NAME}" --group "${DEMO_GROUP_NAME}"`)
  lines.push("")
  lines.push("Expect:")
  lines.push(
    "  - The plan: 1 group membership, 1 RSVP, and 1 idea vote go with them; 3 chat messages stay behind, relabeled \"Former member.\""
  )
  lines.push("  - Three \"joined\" line prompts, one per evidence class, in this order:")
  lines.push(`      1. "${DEMO_GROUP_NAME}": "definitely them." They're still a member there. Default: yes.`)
  lines.push(
    `      2. "${FORMER_GROUP_NAME}": "probably them." No longer a member, but they left a message behind. Default: yes.`
  )
  lines.push(
    `      3. "${NAME_MATCH_GROUP_NAME}": "doubtful, could be a different person." Default: no. THIS is the one` +
      " to look at closely: a genuinely different Skyler Voss is the real member there, and answering yes would" +
      " delete an innocent person's join line."
  )
  lines.push(
    "  - Stop at the \"type the name to confirm\" prompt without typing it. This fixture is left for you to" +
      " actually delete when you're ready; don't complete it while just looking."
  )
  lines.push("")
  lines.push("=".repeat(78))
  lines.push("CASE 2: the blocked founder")
  lines.push("=".repeat(78))
  lines.push("")
  lines.push(`Robin Ortiz founded "${FOUNDER_TRAP_GROUP_NAME}" and Devon Marsh is still in it.`)
  lines.push("")
  lines.push("Run:")
  lines.push(`  npm run person:delete -- --name "${FOUNDER_NAME}" --group "${FOUNDER_TRAP_GROUP_NAME}"`)
  lines.push("")
  lines.push("Expect:")
  lines.push(
    "  \"This person cannot be deleted yet,\" naming Devon Marsh, the group id, and Devon's user id, followed" +
      " by the handover steps in docs/runbooks/person-deletion.md, section 6. Safe to run as many times as you" +
      " like: it only reads, never writes. Already run once while staging this; see the QA report for the" +
      " real output it produced."
  )
  lines.push("")
  lines.push("Re-run this script any time to reset all four groups back to this starting state.")

  console.log(lines.join("\n"))
}

main()
  .catch(async (err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
