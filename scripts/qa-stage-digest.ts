// scripts/qa-stage-digest.ts
//
// Stages a group whose digest for one named member turns on BOTH blocks at
// once: "needs you" (an event awaiting an RSVP, an idea awaiting a vote, and
// an open group time-change vote, three different kinds so the mixed list
// reads honestly) and "you missed" (five real chat messages since that
// member last showed up, one of them long enough to exercise the 100-char
// quote truncation in src/lib/digest/compose.ts).
//
// WHY THIS SCRIPT EXISTS: a survey of dev-test found "you missed" already
// renders for real members, but the "needs you" gate (src/lib/digest/
// schedule.ts's isNeedsYouGateOpen) is closed in every existing group, so the
// more interesting half of the email has never been seen. This script does
// not fake the gate: it opens it the honest way, by creating a real
// ChangeProposal today (rule one, "the day a person created it" — see
// schedule.ts). Once open, the gate carries EVERYTHING outstanding for the
// member, which is what lets the RSVP and the idea vote ride along too.
//
// THE FOUR PEOPLE, and why one of them does nothing. Ari (founder), Sam and
// Jordan (active: they RSVP, float the idea, ask for the time change, and
// carry the chat) all exist only to give Riley something to miss and
// something to owe. Riley is the whole point: no RSVP, no vote anywhere, no
// message ever. Riley is who you pass to `npm run digest:test` as the
// member — a real person, unlike qa-stage-email.ts's viewer problem, this
// script needs no browser session at all, because digest:test can send
// ANY member's digest to any address; it does not need to reach the member's
// own inbox to prove out what the email would say.
//
// WHERE IT WRITES: whichever database `.env` points at. Run `npm run
// db:which` first, every time; this script refuses to run itself unless all
// three env sources agree on the dev-test project ref (see requireDevTest
// below), the same ref db:which checks against.
//
// This is QA tooling, deliberately outside the test suite: it writes real
// rows to a shared database and is meant to be run by hand before proving a
// digest send with `npm run digest:test`. Same precedent as
// scripts/qa-stage-cardstate.ts, which this script's event/proposal/gauge
// trio is deliberately modeled on line for line. It is not named *.test.ts,
// which is what keeps Vitest from collecting it.
//
// RE-RUNNABLE: unlike qa-stage-cardstate.ts and qa-stage-endgame.ts (each run
// leaves a fresh duplicate group behind), this script follows
// qa-stage-email.ts's newer precedent and replaces its own prior run: it
// deletes any earlier "[QA] Digest Both Blocks" group (which cascades to its
// memberships, event, venue, RSVPs, messages, gauge, and change proposal) and
// any leftover fake users before creating a fresh copy. A second run leaves
// exactly one group in the state described above, not two.
//
// Usage: npm run qa:stage-digest

import { prisma } from "../src/lib/prisma"
import { createEvent } from "../src/lib/events/create"
import { createGauge } from "../src/lib/gauges/create"
import { createGroupProposal } from "../src/lib/proposals/create"
import { zonedWallTimeToUtc, getLocalParts } from "../src/lib/orbit/occurrence"
import { buildGaugeMessage } from "../src/lib/orbit/spark-copy"
import { buildGroupProposalQuestion } from "../src/lib/orbit/change-copy"
import { formatMonthDay, formatWeekdayShort } from "../src/lib/events/format"
import { judge } from "./db-which"
import { MessageAuthor, GaugeAnswer, ProposalVoteAnswer, RsvpStatus } from "@prisma/client"

const TZ = "America/Denver"
const BASE_URL = "http://localhost:3000"

const GROUP_NAME = "[QA] Digest Both Blocks"

/** Every fake user this script creates carries this prefix, so cleanup can find them. */
const FAKE_AUTH_PREFIX = "qa-digest-"

/** The same ref db:which checks against (CLAUDE.md, "Two databases, never crossed"). */
const EXPECTED_DEV_TEST_REF = "pxbewardwvoyqqcvogel"

const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000

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
 * Deletes the previous run's group and fake members, so a second run
 * replaces the first instead of leaving a duplicate behind. Deleting the
 * Group cascades to its memberships, events (and their venues and RSVPs),
 * messages, gauges, and change proposals — the same cascade
 * qa-stage-email.ts's replacePriorRuns relies on and documents. The fake
 * users themselves are not owned by the Group, so they are swept separately.
 */
async function replacePriorRun(): Promise<number> {
  const prior = await prisma.group.findMany({ where: { name: GROUP_NAME } })
  for (const g of prior) {
    await prisma.group.delete({ where: { id: g.id } })
  }
  await prisma.user.deleteMany({ where: { supabaseAuthId: { startsWith: FAKE_AUTH_PREFIX } } })
  return prior.length
}

async function main() {
  requireDevTest()

  const replacedGroups = await replacePriorRun()

  const now = new Date()
  const p = getLocalParts(now, TZ)
  const stamp = Date.now()

  const ari = await prisma.user.create({ data: { name: "Ari", supabaseAuthId: `${FAKE_AUTH_PREFIX}ari-${stamp}` } })
  const sam = await prisma.user.create({ data: { name: "Sam", supabaseAuthId: `${FAKE_AUTH_PREFIX}sam-${stamp}` } })
  const jordan = await prisma.user.create({ data: { name: "Jordan", supabaseAuthId: `${FAKE_AUTH_PREFIX}jordan-${stamp}` } })
  // Riley never RSVPs, never votes, never posts. Riley is the member you pass
  // to `npm run digest:test` — everything below is built to leave Riley
  // owing an RSVP, an idea vote, and a time-change vote, plus five missed
  // messages.
  const riley = await prisma.user.create({ data: { name: "Riley", supabaseAuthId: `${FAKE_AUTH_PREFIX}riley-${stamp}` } })

  // Riley's membership is backdated two days, well before any chat message
  // below, so deriveYouMissed's read position (the later of lastSeenAt and
  // lastDigestSentAt, falling back to joinedAt — both are null here) sits
  // safely before every message this script writes, rather than depending on
  // millisecond-level ordering against the group's own creation instant.
  const rileyJoinedAt = new Date(now.getTime() - 2 * DAY_MS)

  const group = await prisma.group.create({
    data: {
      name: GROUP_NAME,
      founderId: ari.id,
      timeZone: TZ,
      inviteToken: `${FAKE_AUTH_PREFIX}${stamp}`,
      memberships: {
        create: [
          { userId: ari.id },
          { userId: sam.id },
          { userId: jordan.id },
          { userId: riley.id, joinedAt: rileyJoinedAt },
        ],
      },
    },
  })

  async function memberMsg(userId: string, body: string, createdAt: Date) {
    return prisma.message.create({
      data: { groupId: group.id, authorType: MessageAuthor.MEMBER, authorId: userId, body, createdAt },
    })
  }

  // ── Five chat messages, all after Riley's read position, so "you missed"
  // reports a real count of 5 with the newest three quoted. The last one is
  // deliberately long, to exercise compose.ts's 100-char truncation. ────────
  await memberMsg(
    sam.id,
    "did everyone see the invite for trivia night this week? we should also figure out food",
    new Date(now.getTime() - 30 * HOUR_MS)
  )
  await memberMsg(
    jordan.id,
    "I'm bringing snacks again, don't worry about it",
    new Date(now.getTime() - 26 * HOUR_MS)
  )
  const ideaSrc = await memberMsg(
    sam.id,
    "also just floated grabbing beers after, if people are into it",
    new Date(now.getTime() - 20 * HOUR_MS)
  )
  const proposalSrc = await memberMsg(
    jordan.id,
    "can we push trivia to 8 instead of 7? running late again this week",
    new Date(now.getTime() - 10 * HOUR_MS)
  )
  const longMessage =
    "quick update before this week: I talked to The Hoppy Place about splitting the tab differently since last " +
    "time got confusing for everyone, and also wanted to check whether we're keeping the usual slot or moving it, " +
    "so let me know what works when you get a chance"
  await memberMsg(sam.id, longMessage, new Date(now.getTime() - 2 * HOUR_MS))

  // ── The confirmed event: Trivia Night, 5 days out, 7pm, with a venue.
  // Sam and Jordan RSVP IN; Riley leaves no row, which is what earns Riley's
  // digest a "Needs your RSVP" item. ───────────────────────────────────────
  const eventStart = zonedWallTimeToUtc(p.year, p.month, p.day + 5, 19, 0, TZ)
  const event = await createEvent({
    groupId: group.id,
    title: "Trivia Night",
    startsAt: eventStart,
    activityLabel: "trivia",
    venue: { name: "The Hoppy Place", address: "88 Congress Ave" },
  })
  await prisma.rsvp.create({ data: { eventId: event.id, userId: sam.id, status: RsvpStatus.IN } })
  await prisma.rsvp.create({ data: { eventId: event.id, userId: jordan.id, status: RsvpStatus.IN } })

  // ── The open group time-change proposal: Jordan asks to push Trivia Night
  // to 8pm. His message auto-seeds his own YES vote inside
  // createGroupProposal; Sam explicitly votes to keep 7pm. This ChangeProposal
  // is what opens the needs-you gate (rule one: created today), which is what
  // lets the RSVP and idea-vote items below ride along in the same email.
  // Riley casts no vote, which earns Riley's digest a "Needs your vote" item
  // for the time change too. ───────────────────────────────────────────────
  const proposalStart = new Date(eventStart.getTime() + HOUR_MS)
  const proposalBody = buildGroupProposalQuestion(jordan.name, "trivia", proposalStart, eventStart, TZ, now, null)
  const proposal = await createGroupProposal({
    groupId: group.id,
    eventId: event.id,
    askerUserId: jordan.id,
    sourceMessageId: proposalSrc.id,
    proposedStartsAt: proposalStart,
    priorStartsAt: eventStart,
    body: proposalBody,
  })
  if (proposal.status !== "created") throw new Error("staging the trivia proposal did not create it")
  await prisma.proposalVote.create({
    data: { proposalId: proposal.proposal.id, userId: sam.id, answer: ProposalVoteAnswer.KEEP },
  })

  // ── The open idea gauge: Sam floats beers 3 days out at 7pm. Sam's own
  // message auto-seeds his IN vote (initiatorUserId); Jordan casts a second
  // explicit IN vote. Two is short of the three-vote promotion bar, so it
  // stays open. Riley casts no vote, which earns Riley's digest a "Needs your
  // vote" item for the idea too. ───────────────────────────────────────────
  const ideaDate = zonedWallTimeToUtc(p.year, p.month, p.day + 3, 0, 0, TZ)
  const ideaBody = buildGaugeMessage("beers", ideaDate, TZ, now, null)
  const idea = await createGauge({
    groupId: group.id,
    sourceMessageId: ideaSrc.id,
    activity: "beers",
    proposedDate: ideaDate,
    proposedTime: "19:00",
    body: ideaBody,
    initiatorUserId: sam.id,
  })
  if (idea.status !== "created") throw new Error("staging the beers gauge did not create it")
  await prisma.gaugeVote.create({
    data: { gaugeId: idea.gauge.id, userId: jordan.id, answer: GaugeAnswer.IN },
  })

  console.log(
    JSON.stringify(
      {
        replacedPriorRun: {
          groupsDeleted: replacedGroups,
          note: "Any earlier [QA] Digest Both Blocks group and its fake members were deleted before this run.",
        },
        groupId: group.id,
        groupName: group.name,
        inviteUrl: `${BASE_URL}/join/${group.inviteToken}`,
        homeUrl: `${BASE_URL}/groups/${group.id}`,
        eventUrl: `${BASE_URL}/events/${event.id}`,
        digestTargetMember: {
          name: riley.name,
          note: "This is who you pass to digest:test. Riley has no RSVP, no vote, and no message anywhere in this group.",
        },
        seededSummary:
          "Seeding artifact, not product behavior: Ari/Sam/Jordan/Riley are fake QA members created fresh by this " +
          "script, not real people who used the product. " +
          `Trivia Night (${formatWeekdayShort(eventStart, TZ)} ${formatMonthDay(eventStart, TZ)}, 7pm, The Hoppy Place) ` +
          "is confirmed with Sam & Jordan IN, Riley TBD (Riley's own 'Needs your RSVP' item). " +
          "An open group vote asks to move it to 8pm (Jordan yes, Sam keep, Riley unanswered: Riley's 'Needs your vote' item). " +
          `A "beers?" idea gauge is open for ${formatWeekdayShort(ideaDate, TZ)} ${formatMonthDay(ideaDate, TZ)} 7pm with 2 of the ` +
          "3 votes needed (Sam, Jordan), Riley unanswered (Riley's second 'Needs your vote' item). " +
          "Five chat messages from Sam and Jordan, spanning 30 hours ago to 2 hours ago, are all after Riley's " +
          "(backdated) read position, so You-missed reports a count of 5 with the newest 3 quoted; the newest " +
          "one runs well past the 100-char quote limit to exercise truncation.",
        verify: `npm run digest:test -- you@example.com "${group.name}" Riley`,
        verifyNote:
          "Use a NOT-allowlisted <to> address (anything not on EMAIL_DEV_ALLOWLIST) so the send is suppressed and " +
          "nothing is actually mailed; the script still prints the composed subject and body before it tries to send.",
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
