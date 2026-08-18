// scripts/qa-stage-cardstate.ts
//
// Stages the card-state-grammar QA walkthrough: one fresh group ("[QA] Card
// State Grammar") the owner can join fresh through the invite link, seeded so
// every state this slice changed is visible the moment they arrive.
//
// Unlike qa-stage-pending.ts and qa-stage-polish.ts, this script has NO
// --seed-viewer second mode and needs none: the whole point of this
// walkthrough is that the owner's own account starts with nothing answered,
// so their first look at the group home shows the unanswered states
// (teal "NEEDS YOUR RSVP" and teal "NEEDS YOUR VOTE") rather than a settled
// screen. Everything is seeded from the OTHER seeded members' perspective.
//
// What this script seeds, all from a founder (Jordan) plus three members
// (Casey, Rae, Sam):
//
//   1. A confirmed event ("Trivia Night") 5 days out, 7pm, with a venue.
//      Jordan and Casey are already IN, Rae is already OUT, Sam has not
//      answered — so the card's counts line has both an In and an Out to
//      show, and a TBD count too. The owner's own RSVP is absent by
//      construction (they don't exist yet when this runs), so their card
//      renders "Needs your RSVP" the moment they join.
//   2. An OPEN group time-change proposal on that event: Casey asks to push
//      it from 7pm to 8pm (her message auto-seeds her own YES vote inside
//      createGroupProposal), and Rae explicitly votes to keep 7pm. That's
//      what puts the vote on the event's detail screen, between the details
//      card and "Add to calendar". (It also put a "Time change proposed"
//      notice on the card's footer until the card-region-height slice
//      removed it, and a tally line under the chips until the event-copy
//      pass deleted that.)
//   3. An open idea gauge ("beers") proposed 3 days out at 7pm — earlier
//      than the confirmed Trivia Night — with two IN votes (Sam, the
//      floater, seeded via initiatorUserId; Jordan, seeded as a direct
//      second vote). Two is short of the three-vote promotion bar, so it
//      stays a maybe: it should render as a flatter "Beers?" idea card
//      sitting AHEAD of Trivia Night in the rail, since its date is
//      earlier.
//   4. Chat history spanning the gauge's and the proposal's own member-ask +
//      Orbit-reply pairs, plus a few plain messages, so the feed reads as a
//      real conversation rather than four rows in a vacuum.
//
// WHERE IT WRITES: whichever database `.env` points at. Run `npm run
// db:which` first, every time; this script refuses to run itself unless all
// three env sources agree on the dev-test project ref (see requireDevTest
// below), the same ref db:which checks against.
//
// This is QA tooling, deliberately outside the test suite: it writes real
// rows to a shared database and is meant to be run by hand before a browser
// walkthrough. Same precedent as scripts/qa-stage-pending.ts and
// scripts/qa-stage-polish.ts. It is not named *.test.ts, which is what keeps
// Vitest from collecting it.
//
// Usage: npx tsx --env-file=.env scripts/qa-stage-cardstate.ts
//
// Each run creates a NEW group with fresh users and a fresh invite token, so
// running it twice leaves two groups behind rather than updating the first.
// Delete the old one if you do not want it in the way.

import { prisma } from "../src/lib/prisma"
import { createGauge } from "../src/lib/gauges/create"
import { createGroupProposal } from "../src/lib/proposals/create"
import { createEvent } from "../src/lib/events/create"
import { zonedWallTimeToUtc, getLocalParts } from "../src/lib/orbit/occurrence"
import { buildGaugeMessage } from "../src/lib/orbit/spark-copy"
import { buildGroupProposalQuestion } from "../src/lib/orbit/change-copy"
import { formatMonthDay, formatWeekdayShort } from "../src/lib/events/format"
import { judge } from "./db-which"
import { MessageAuthor, GaugeAnswer, ProposalVoteAnswer, RsvpStatus } from "@prisma/client"

const TZ = "America/Denver"

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

async function main() {
  requireDevTest()

  const now = new Date()
  const p = getLocalParts(now, TZ)
  const stamp = Date.now()

  const jordan = await prisma.user.create({ data: { name: "Jordan", supabaseAuthId: `qa-cardstate-founder-${stamp}` } })
  const casey = await prisma.user.create({ data: { name: "Casey", supabaseAuthId: `qa-cardstate-casey-${stamp}` } })
  const rae = await prisma.user.create({ data: { name: "Rae", supabaseAuthId: `qa-cardstate-rae-${stamp}` } })
  const sam = await prisma.user.create({ data: { name: "Sam", supabaseAuthId: `qa-cardstate-sam-${stamp}` } })
  const group = await prisma.group.create({
    data: {
      name: "[QA] Card State Grammar",
      founderId: jordan.id,
      timeZone: TZ,
      inviteToken: `qa-cardstate-${stamp}`,
      memberships: { create: [jordan.id, casey.id, rae.id, sam.id].map((userId) => ({ userId })) },
    },
  })

  async function memberMsg(userId: string, body: string) {
    return prisma.message.create({
      data: { groupId: group.id, authorType: MessageAuthor.MEMBER, authorId: userId, body },
    })
  }

  // ── A little plain chat first, so the feed isn't just the two Orbit
  // exchanges back to back. ─────────────────────────────────────────────────
  await memberMsg(jordan.id, "morning crew, big week ahead")
  await memberMsg(sam.id, "ready for it")

  // ── The confirmed event: Trivia Night, 5 days out, 7pm, with a venue. ─────
  const eventStart = zonedWallTimeToUtc(p.year, p.month, p.day + 5, 19, 0, TZ)
  const event = await createEvent({
    groupId: group.id,
    title: "Trivia Night",
    startsAt: eventStart,
    activityLabel: "trivia",
    venue: { name: "The Hoppy Place", address: "88 Congress Ave" },
  })

  // RSVPs: Jordan and Casey IN, Rae OUT, Sam left pending (no row) — the
  // counts line reads 2 In · 1 Out · 1 TBD before the owner even joins, and
  // the owner's own absent RSVP is what earns their card "Needs your RSVP".
  await prisma.rsvp.create({ data: { eventId: event.id, userId: jordan.id, status: RsvpStatus.IN } })
  await prisma.rsvp.create({ data: { eventId: event.id, userId: casey.id, status: RsvpStatus.IN } })
  await prisma.rsvp.create({ data: { eventId: event.id, userId: rae.id, status: RsvpStatus.OUT } })

  // ── The open group time-change proposal: Casey asks to push Trivia Night
  // to 8pm. Her message auto-seeds her own YES vote inside
  // createGroupProposal; Rae explicitly votes to keep 7pm. Both votes stay
  // seeded after the event-copy pass deleted the tally line they used to
  // feed: nothing renders them now, but they still make the proposal a real
  // contested vote rather than a lone tap, which is what the promotion
  // arithmetic reads. ──────────────────────────────────────────────────────
  const proposalStart = new Date(eventStart.getTime() + 60 * 60 * 1000)
  const proposalSrc = await memberMsg(casey.id, "can we push trivia to 8 instead of 7? running late that day")
  const proposalBody = buildGroupProposalQuestion(casey.name, "trivia", proposalStart, eventStart, TZ, now, null)
  const proposal = await createGroupProposal({
    groupId: group.id,
    eventId: event.id,
    askerUserId: casey.id,
    sourceMessageId: proposalSrc.id,
    proposedStartsAt: proposalStart,
    priorStartsAt: eventStart,
    body: proposalBody,
  })
  if (proposal.status !== "created") throw new Error("staging the trivia proposal did not create it")
  await prisma.proposalVote.create({
    data: { proposalId: proposal.proposal.id, userId: rae.id, answer: ProposalVoteAnswer.KEEP },
  })

  // ── The open idea gauge: Sam floats beers 3 days out at 7pm, EARLIER than
  // Trivia Night, so it should sit ahead of the confirmed event in the rail.
  // Sam's own message auto-seeds his IN vote (initiatorUserId); Jordan casts
  // a second explicit IN vote. Two is short of the three-vote promotion bar,
  // so it stays a maybe. ─────────────────────────────────────────────────────
  const ideaDate = zonedWallTimeToUtc(p.year, p.month, p.day + 3, 0, 0, TZ)
  const ideaSrc = await memberMsg(sam.id, "we should grab beers this week, been way too long")
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

  // ── One more plain message after both exchanges, so the feed's newest
  // entry isn't Orbit's own voice. ──────────────────────────────────────────
  await memberMsg(rae.id, "beers works for me most nights this week")

  console.log(
    JSON.stringify(
      {
        groupId: group.id,
        groupName: group.name,
        inviteUrl: `http://localhost:3000/join/${group.inviteToken}`,
        eventUrl: `http://localhost:3000/events/${event.id}`,
        homeUrl: `http://localhost:3000/groups/${group.id}`,
        seededSummary:
          "Seeding artifact, not product behavior: Jordan/Casey/Rae/Sam are fake QA members created fresh by this script, not real people who used the product. " +
          `Trivia Night (${formatWeekdayShort(eventStart, TZ)} ${formatMonthDay(eventStart, TZ)}, 7pm, The Hoppy Place) is confirmed with Jordan & Casey IN, Rae OUT, Sam TBD, ` +
          "and an open group vote to move it to 8pm (Casey yes, Rae keep). " +
          `A "beers?" idea gauge is open for ${formatWeekdayShort(ideaDate, TZ)} ${formatMonthDay(ideaDate, TZ)} 7pm (earlier than Trivia Night) with 2 of the 3 votes needed to become a real event (Sam, Jordan). ` +
          "The joining owner has no RSVP and no vote anywhere, by design.",
        next: [
          "Join through inviteUrl as a brand-new member (that real session becomes the 5th member and the viewer).",
          "Load homeUrl. The rail should show the beers idea card first (earlier date), then Trivia Night, with a teal \"Needs your RSVP\" on Trivia Night and a teal \"Needs your vote\" on the beers idea, both unanswered.",
          "Trivia Night's card should NOT mention the time change at all (the card-region-height slice removed that footer notice); the ask lives in chat.",
          "Open eventUrl directly to see the group vote (\"Move to 8pm\" / \"Keep 7pm\") sitting between the details card and \"Add to calendar\", with no tally line under the chips (event-copy pass).",
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
