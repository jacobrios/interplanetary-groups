// scripts/qa-stage-polish.ts
//
// Stages the visual-polish QA walkthrough: one fresh group ("[QA] Visual
// Polish") whose home exercises every visual change from the "foundations
// plus the group home" slice at once, so a five-minute browser pass sees
// them all on one screen without hunting. It creates a founder (Maya) and
// two seeded members (Theo, Priya), three members total, and stages:
//
//   - THREE upcoming events ("Saturday Climb", "Trivia Night", "Sunday Trail
//     Run"), each with a venue, soonest first, nobody's RSVP set. This is
//     what puts the carousel into its multi-card peek-and-dots chrome
//     (CarouselRail.tsx) instead of the single-card layout, and leaves every
//     card's "I'm in" live and its counts line reading a pending count.
//   - Chat messages spanning THREE distinct calendar days IN THE GROUP'S OWN
//     TIMEZONE (America/Chicago, set explicitly below): a couple two days
//     ago, a couple yesterday, several today. Day dividers render off
//     groupMessagesByDay (src/lib/messages/day-groups.ts), which buckets by
//     the group's timezone and labels "Today" / "Yesterday" / a weekday+date
//     for anything older — so the two-days-ago messages are what proves the
//     third label renders, not just the two newer ones. The timestamps below
//     are built with zonedWallTimeToUtc off the group-local calendar day
//     (today's local y/m/d minus 2 or minus 1), not a flat 24h/48h
//     subtraction, so they land on the right side of a Chicago midnight even
//     when this script happens to run close to one.
//   - One open idea gauge from a member (Theo floats "game night", no day or
//     time stated, so it inherits the evening fallback), with a second
//     member's (Priya's) IN vote seeded as a direct row so its tally line
//     reads a name rather than staying empty.
//   - One open GROUP time-change proposal (Priya asks to push Trivia Night an
//     hour later), whose asker vote auto-seeds inside createGroupProposal.
//
// Both the gauge and the proposal are pending items with nobody's vote from
// the eventual viewer, so together they're what the pending strip needs to
// render a band at all (src/lib/pending/derive.ts, pendingStripWillRender).
//
// THE VIEWER PROBLEM, and why this script has a second mode: same story as
// scripts/qa-stage-pending.ts. A script cannot forge a Supabase session
// (signInAnonymously mints a UUID Supabase controls, and this project has no
// service-role key and no dev-login backdoor — both deliberately absent; see
// CLAUDE.md "Two databases, never crossed" and Supabase-is-auth-only). So the
// browser tester becomes the viewer by actually joining through the invite
// link (a real anonymous session, a real 4th membership). Once joined, this
// script's second mode attaches their state to whichever membership joined
// last:
//
//   npx tsx --env-file=.env scripts/qa-stage-polish.ts --seed-viewer <groupId>
//
// which seeds a standing IN vote on the gauge (so the panel's quieter
// "You're in on" group renders, alongside the still-open proposal in the
// "waiting on you" group) and one chat message from the viewer today (so the
// viewer's own right-aligned bubble renders with its bottom-right notch,
// completing all three chat voices: Orbit's soft muted fill from the gauge
// and proposal messages, a member's outlined bubble, and the viewer's
// strongest-fill self bubble). Order matters: join first, then run
// --seed-viewer, then load the group home. Running --seed-viewer before
// anyone has joined fails loudly (fewer than four members) rather than
// silently seeding the wrong person.
//
// WHERE IT WRITES: whichever database `.env` points at. Run `npm run
// db:which` first, every time; this script refuses to run itself unless all
// three env sources agree on the dev-test project ref (see requireDevTest
// below), the same ref db:which checks against.
//
// This is QA tooling, deliberately outside the test suite: it writes real
// rows to a shared database and is meant to be run by hand before a browser
// walkthrough. Same precedent as scripts/qa-stage-pending.ts and
// scripts/qa-stage-daycomment.ts. It is not named *.test.ts, which is what
// keeps Vitest from collecting it.
//
// Usage: npx tsx --env-file=.env scripts/qa-stage-polish.ts
//
// Each run creates a NEW group with fresh users and a fresh invite token, so
// running it twice leaves two groups behind rather than updating the first.
// Delete the old one if you do not want it in the way.

import { prisma } from "../src/lib/prisma"
import { createGauge } from "../src/lib/gauges/create"
import { createGroupProposal } from "../src/lib/proposals/create"
import { createEvent } from "../src/lib/events/create"
import { zonedWallTimeToUtc, getLocalParts } from "../src/lib/orbit/occurrence"
import { buildGaugeMessage, chooseProposedDate } from "../src/lib/orbit/spark-copy"
import { buildGroupProposalQuestion } from "../src/lib/orbit/change-copy"
import { judge } from "./db-which"
import { MessageAuthor, GaugeAnswer } from "@prisma/client"

const TZ = "America/Chicago"

/** The gauge's activity: how --seed-viewer finds it again. */
const GAUGE_ACTIVITY = "game night"

/** The same ref db:which checks against (CLAUDE.md, "Two databases, never crossed"). */
const EXPECTED_DEV_TEST_REF = "pxbewardwvoyqqcvogel"

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
 * Second mode: attaches the just-joined viewer's standing-yes vote to the
 * gauge, and posts one chat message from them today. Reads the group's
 * memberships ordered by joinedAt and takes the last one, the 4th member, who
 * exists only because a real browser joined through the invite link since
 * the main run.
 */
async function seedViewer(groupId: string) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: { memberships: { include: { user: true }, orderBy: { joinedAt: "asc" } } },
  })
  if (!group) throw new Error(`no group ${groupId}`)

  if (group.memberships.length < 4) {
    throw new Error(
      `group ${groupId} has only ${group.memberships.length} member(s). ` +
        `Join through the invite link first (that becomes the 4th member and the viewer), then re-run --seed-viewer.`
    )
  }
  const viewer = group.memberships[group.memberships.length - 1].user

  const gauge = await prisma.gauge.findFirst({
    where: { groupId, activity: GAUGE_ACTIVITY },
    orderBy: { createdAt: "desc" },
  })
  if (!gauge) {
    throw new Error(`group ${groupId} has no "${GAUGE_ACTIVITY}" gauge to seed`)
  }

  const already = await prisma.gaugeVote.findFirst({
    where: { gaugeId: gauge.id, userId: viewer.id },
  })
  if (!already) {
    await prisma.gaugeVote.create({
      data: { gaugeId: gauge.id, userId: viewer.id, answer: GaugeAnswer.IN },
    })
  }

  const existingViewerMsg = await prisma.message.findFirst({
    where: { groupId, authorType: MessageAuthor.MEMBER, authorId: viewer.id },
  })
  if (!existingViewerMsg) {
    await prisma.message.create({
      data: {
        groupId,
        authorType: MessageAuthor.MEMBER,
        authorId: viewer.id,
        body: "hey everyone, glad to be here",
      },
    })
  }

  console.log(
    JSON.stringify(
      {
        seededViewer: viewer.name,
        viewerUserId: viewer.id,
        alreadyVoted: !!already,
        alreadyPosted: !!existingViewerMsg,
        gaugeId: gauge.id,
        homeUrl: `http://localhost:3000/groups/${group.id}`,
        next: [
          "Reload the group home.",
          "The pending strip should read \"1 waiting on you · 1 you're in on\" (the trivia time-change proposal waiting, the game night gauge as your standing yes).",
          "Your own message should render as the right-aligned, strongest-fill bubble with a bottom-right notch.",
        ],
      },
      null,
      2
    )
  )
}

async function main() {
  requireDevTest()

  const seedAt = process.argv.indexOf("--seed-viewer")
  if (seedAt !== -1) {
    const id = process.argv[seedAt + 1]
    if (!id) throw new Error("--seed-viewer needs a group id")
    await seedViewer(id)
    await prisma.$disconnect()
    return
  }

  const now = new Date()
  const p = getLocalParts(now, TZ)
  const stamp = Date.now()

  const maya = await prisma.user.create({ data: { name: "Maya", supabaseAuthId: `qa-polish-founder-${stamp}` } })
  const theo = await prisma.user.create({ data: { name: "Theo", supabaseAuthId: `qa-polish-theo-${stamp}` } })
  const priya = await prisma.user.create({ data: { name: "Priya", supabaseAuthId: `qa-polish-priya-${stamp}` } })
  const group = await prisma.group.create({
    data: {
      name: "[QA] Visual Polish",
      founderId: maya.id,
      timeZone: TZ,
      inviteToken: `qa-polish-${stamp}`,
      memberships: { create: [maya.id, theo.id, priya.id].map((userId) => ({ userId })) },
    },
  })

  async function memberMsg(userId: string, body: string, createdAt?: Date) {
    return prisma.message.create({
      data: {
        groupId: group.id,
        authorType: MessageAuthor.MEMBER,
        authorId: userId,
        body,
        ...(createdAt ? { createdAt } : {}),
      },
    })
  }

  // ── Three upcoming events, soonest first, each with a venue and nobody's
  // RSVP set: the multi-card carousel's peek-and-dots chrome needs at least
  // two cards, and three is the display cap. ────────────────────────────────
  const climb = await createEvent({
    groupId: group.id,
    title: "Saturday Climb",
    startsAt: zonedWallTimeToUtc(p.year, p.month, p.day + 2, 10, 0, TZ),
    activityLabel: "climbing",
    venue: { name: "Vertical Peak Gym", address: "1200 Elm St" },
  })
  const trivia = await createEvent({
    groupId: group.id,
    title: "Trivia Night",
    startsAt: zonedWallTimeToUtc(p.year, p.month, p.day + 4, 19, 0, TZ),
    activityLabel: "trivia",
    venue: { name: "The Hoppy Place", address: "88 Congress Ave" },
  })
  const trailRun = await createEvent({
    groupId: group.id,
    title: "Sunday Trail Run",
    startsAt: zonedWallTimeToUtc(p.year, p.month, p.day + 9, 8, 0, TZ),
    activityLabel: "running",
    venue: { name: "Riverside Trailhead", address: "400 River Rd" },
  })

  // ── Chat spanning three distinct group-local calendar days ───────────────
  // Built off today's local y/m/d minus 2 or minus 1 (not a flat 48h/24h
  // subtraction), so each instant genuinely falls on that Chicago calendar
  // day even if this script runs shortly after a Chicago midnight, when a
  // flat subtraction could straddle the boundary and land on the wrong side.
  const twoDaysAgoA = zonedWallTimeToUtc(p.year, p.month, p.day - 2, 18, 30, TZ)
  const twoDaysAgoB = zonedWallTimeToUtc(p.year, p.month, p.day - 2, 18, 35, TZ)
  const yesterdayA = zonedWallTimeToUtc(p.year, p.month, p.day - 1, 12, 5, TZ)
  const yesterdayB = zonedWallTimeToUtc(p.year, p.month, p.day - 1, 12, 10, TZ)

  // Two days ago: a couple of casual member messages. This is the day whose
  // divider proves the weekday+date label (the third label groupMessagesByDay
  // renders, beyond "Today" and "Yesterday").
  await memberMsg(theo.id, "good session today, my forearms are toast", twoDaysAgoA)
  await memberMsg(priya.id, "same, worth it though", twoDaysAgoB)

  // Yesterday: a couple more, still plain chat.
  await memberMsg(priya.id, "don't forget I'm bringing snacks saturday, any allergies I should know about?", yesterdayA)
  await memberMsg(maya.id, "nah we're all good, thanks priya", yesterdayB)

  // Today: one plain member message, then the gauge and the proposal below
  // (each a member ask plus an Orbit reply), all landing on "Today" with no
  // explicit createdAt, so they read in real insertion order.
  await memberMsg(maya.id, "morning! can't wait for this weekend")

  // ── The open idea gauge: Theo floats game night with no day or time
  // stated, so it inherits the evening fallback (Friday, 7pm per the
  // documented default). Priya's IN vote is seeded as a direct row, not via
  // initiatorUserId, because Orbit picked the day here, not Theo (the
  // groupinfo-script precedent) — this is what gives the tally line a name
  // instead of staying empty. ────────────────────────────────────────────
  const gaugeSrc = await memberMsg(theo.id, "we should do a game night sometime, been way too long")
  const gaugeDate = chooseProposedDate(null, null, TZ, now)
  const gaugeBody = buildGaugeMessage(GAUGE_ACTIVITY, gaugeDate, TZ, now, null)
  const gauge = await createGauge({
    groupId: group.id,
    sourceMessageId: gaugeSrc.id,
    activity: GAUGE_ACTIVITY,
    proposedDate: gaugeDate,
    proposedTime: "19:00",
    body: gaugeBody,
  })
  if (gauge.status !== "created") throw new Error("staging the game night gauge did not create it")
  await prisma.gaugeVote.create({
    data: { gaugeId: gauge.gauge.id, userId: priya.id, answer: GaugeAnswer.IN },
  })

  // ── The open group time-change proposal: Priya asks to push Trivia Night
  // an hour later. Her message auto-seeds her own YES vote inside
  // createGroupProposal. ──────────────────────────────────────────────────
  const proposalStart = new Date(trivia.startsAt.getTime() + 60 * 60 * 1000)
  const proposalSrc = await memberMsg(priya.id, "can we push trivia to 8 instead of 7? running late most days this week")
  const proposalBody = buildGroupProposalQuestion(priya.name, "trivia", proposalStart, trivia.startsAt, TZ, now, null)
  const proposal = await createGroupProposal({
    groupId: group.id,
    eventId: trivia.id,
    askerUserId: priya.id,
    sourceMessageId: proposalSrc.id,
    proposedStartsAt: proposalStart,
    priorStartsAt: trivia.startsAt,
    body: proposalBody,
  })
  if (proposal.status !== "created") throw new Error("staging the trivia proposal did not create it")

  console.log(
    JSON.stringify(
      {
        groupId: group.id,
        inviteUrl: `http://localhost:3000/join/${group.inviteToken}`,
        homeUrl: `http://localhost:3000/groups/${group.id}`,
        staged: {
          members: [maya.name, theo.name, priya.name],
          events: [
            { id: climb.id, title: climb.title, startsAt: climb.startsAt },
            { id: trivia.id, title: trivia.title, startsAt: trivia.startsAt },
            { id: trailRun.id, title: trailRun.title, startsAt: trailRun.startsAt },
          ],
          chatDays: ["two days ago (2 msgs)", "yesterday (2 msgs)", "today (5 msgs, including the gauge and proposal pair)"],
          gauge: { id: gauge.gauge.id, activity: GAUGE_ACTIVITY, inVoter: priya.name },
          proposal: { id: proposal.proposal.id, asker: priya.name, event: trivia.title },
        },
        next: [
          "Join through inviteUrl as a new member. That real session is the viewer and becomes the 4th member.",
          `Run: npx tsx --env-file=.env scripts/qa-stage-polish.ts --seed-viewer ${group.id}`,
          "Load homeUrl and run the five-minute visual QA pass.",
        ],
      },
      null,
      2
    )
  )
  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
