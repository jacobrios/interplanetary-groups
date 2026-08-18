// scripts/qa-stage-endgame-proposal.ts
//
// Stages the time-change-ending walkthrough: one fresh group ("[QA] Time
// Change Ending") the owner joins through the invite link, holding two
// events, each with an open GROUP time-change vote, positioned so one sweep
// shows both endings at once:
//
//   1. "Trivia Night", 6 days out, vote OPEN and still answerable. This is
//      the live control: it must survive the sweep untouched, with its chips
//      still working, so "the sweep closed everything" cannot be mistaken for
//      "the sweep works".
//   2. "Board Games", whose proposed time has already passed (the event
//      itself is still in the future, which is the ordering that matters:
//      the vote died before the plan did). This is the one that LAPSES, and
//      the one Orbit speaks about. Note before sweeping: its TIME CHANGE
//      block is already gone from the event screen, because liveness is
//      derived and the chips stop at the boundary. That is precisely the
//      gap this slice closes: the vote was already over and silent.
//
// Orbit names the activity label, not the event title, so the closing line
// reads "Board games is staying at 2pm" while the card says "Board Games".
// That is the established label idiom (activityLabel ?? title.toLowerCase()),
// the same one the gauge closure uses, not a capitalisation bug.
//
// The owner runs the sweep by hand (the route, or `npm run qa:sweep`) rather
// than waiting an hour for the cron.
//
// WHERE IT WRITES: whichever database `.env` points at. Run `npm run db:which`
// first, every time; this script refuses unless all three env sources agree
// on the dev-test ref, same as the other qa-stage scripts.
//
// QA tooling, deliberately outside the test suite: it writes real rows to a
// shared database and is meant to be run by hand. Not named *.test.ts, which
// is what keeps Vitest from collecting it.
//
// Usage: npx tsx --env-file=.env scripts/qa-stage-endgame-proposal.ts

import { prisma } from "../src/lib/prisma"
import { createEvent } from "../src/lib/events/create"
import { createGroupProposal } from "../src/lib/proposals/create"
import { buildGroupProposalQuestion } from "../src/lib/orbit/change-copy"
import { judge } from "./db-which"
import { MessageAuthor, ProposalVoteAnswer, RsvpStatus } from "@prisma/client"

const TZ = "America/Chicago"

/** The same ref db:which checks against (CLAUDE.md, "Two databases, never crossed"). */
const EXPECTED_DEV_TEST_REF = "pxbewardwvoyqqcvogel"

/**
 * Refuses to run unless the checkout points at dev-test, on all three env
 * sources. Uses the shared `judge` rather than a hand-rolled parse: an
 * earlier draft of this file checked DIRECT_URL alone, which is the wrong
 * variable to trust on its own, since the writes travel over DATABASE_URL.
 * A mixed .env would have sailed through it.
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
  const stamp = Date.now()

  const jordan = await prisma.user.create({ data: { name: "Jordan" } })
  const casey = await prisma.user.create({ data: { name: "Casey" } })
  const rae = await prisma.user.create({ data: { name: "Rae" } })

  const group = await prisma.group.create({
    data: {
      name: "[QA] Time Change Ending",
      founderId: jordan.id,
      timeZone: TZ,
      inviteToken: `qa-endgame-${stamp}`,
      memberships: {
        create: [{ userId: jordan.id }, { userId: casey.id }, { userId: rae.id }],
      },
    },
  })

  const memberMsg = (userId: string, body: string) =>
    prisma.message.create({
      data: { groupId: group.id, authorType: MessageAuthor.MEMBER, authorId: userId, body },
    })

  // ── 1. The live control: vote open, still answerable ────────────────────
  const liveStart = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000)
  const live = await createEvent({
    groupId: group.id,
    title: "Trivia Night",
    startsAt: liveStart,
    activityLabel: "trivia",
  })
  await prisma.rsvp.create({ data: { eventId: live.id, userId: jordan.id, status: RsvpStatus.IN } })
  const liveProposed = new Date(liveStart.getTime() + 60 * 60 * 1000)
  const liveSrc = await memberMsg(casey.id, "can we push trivia an hour later?")
  const liveProposal = await createGroupProposal({
    groupId: group.id,
    eventId: live.id,
    askerUserId: casey.id,
    sourceMessageId: liveSrc.id,
    proposedStartsAt: liveProposed,
    priorStartsAt: liveStart,
    body: buildGroupProposalQuestion(casey.name, "trivia", liveProposed, liveStart, TZ, now, null),
  })
  if (liveProposal.status !== "created") throw new Error("staging the live proposal did not create it")

  // ── 2. The one that lapses ──────────────────────────────────────────────
  // Its event is still in the future; its PROPOSED time is in the past. That
  // is the ordering worth showing: the vote ran out before the plan did, so
  // the sweep's boundary (min of the two) is doing the work, not the event
  // date. Rows are written directly rather than through createGroupProposal,
  // which validates against the clock and would refuse a past proposal.
  const deadStart = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
  const dead = await createEvent({
    groupId: group.id,
    title: "Board Games",
    startsAt: deadStart,
    activityLabel: "board games",
  })
  await prisma.rsvp.create({ data: { eventId: dead.id, userId: rae.id, status: RsvpStatus.IN } })
  const deadProposed = new Date(now.getTime() - 2 * 60 * 60 * 1000)
  const deadSrc = await memberMsg(rae.id, "any chance we move board games earlier?")
  const deadOrbitMsg = await prisma.message.create({
    data: {
      groupId: group.id,
      authorType: MessageAuthor.ORBIT,
      authorId: null,
      body: buildGroupProposalQuestion(rae.name, "board games", deadProposed, deadStart, TZ, now, null),
    },
  })
  const deadProposal = await prisma.changeProposal.create({
    data: {
      groupId: group.id,
      eventId: dead.id,
      askerUserId: rae.id,
      sourceMessageId: deadSrc.id,
      orbitMessageId: deadOrbitMsg.id,
      proposedStartsAt: deadProposed,
      priorStartsAt: deadStart,
      kind: "GROUP",
    },
  })
  await prisma.proposalVote.create({
    data: { proposalId: deadProposal.id, userId: rae.id, answer: ProposalVoteAnswer.YES },
  })

  const base = "http://localhost:3000"
  console.log(
    JSON.stringify(
      {
        groupName: group.name,
        inviteUrl: `${base}/join/${group.inviteToken}`,
        homeUrl: `${base}/groups/${group.id}`,
        liveEventUrl: `${base}/events/${live.id}`,
        lapsingEventUrl: `${base}/events/${dead.id}`,
        seededSummary:
          "Seeding artifact, not product behavior: Jordan/Casey/Rae are fake QA members created by this script. " +
          "Trivia Night (6 days out) has an OPEN, still-answerable vote to push it an hour: it must SURVIVE the sweep. " +
          "Board Games (3 days out) has a vote whose proposed time passed two hours ago: it must LAPSE, and it is the only one Orbit speaks about.",
        next: [
          "Join through inviteUrl (that real session becomes the 4th member and the viewer).",
          "Open lapsingEventUrl BEFORE sweeping. Its TIME CHANGE block is ALREADY GONE, and that is the bug this slice fixes rather than a staging error: the chips die at the boundary on their own, and until now nothing anywhere said so.",
          "Open liveEventUrl and vote on its still-open block. The quiet 'Vote counted' line should appear under the chips, for you alone.",
          "Run the sweep by hand: npm run qa:sweep",
          "Reload the group home. Orbit should have posted exactly ONE new line, about Board Games staying at its time. Nothing about Trivia Night.",
          "Reload liveEventUrl: its TIME CHANGE block is untouched, its chips still work, and your 'Vote counted' line is still there.",
          "Run npm run qa:sweep a second time: Orbit must say nothing new (idempotence).",
        ],
      },
      null,
      2
    )
  )
  await prisma.$disconnect()
}

main()
