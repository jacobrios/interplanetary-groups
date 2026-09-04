// scripts/qa-stage-pending.ts
//
// Stages the pending-surface QA walkthrough. It creates a fresh group
// ("Sunset Boulderers") with a founder and two seeded members (three total),
// then stages every piece the strip needs to prove itself:
//
//   - one upcoming event ("Climb") with nobody's RSVP set, so the
//     card shows and the viewer's own RSVP is absent by construction
//   - one open gauge from a member ("bouldering at the new east side gym",
//     next Saturday 10:00), the floater's message auto-seeding their own IN
//     vote (the gauge-initiator precedent), and no viewer vote
//   - one open GROUP proposal on the event (prior = the event's own start,
//     proposed = one hour later), the asker's message auto-seeding their own
//     YES vote
//   - one open gauge with NO votes yet ("yoga recovery session", Sunday
//     morning): the standing-yes candidate. It stays empty until the viewer
//     exists to answer it; see SECOND MODE below.
//
// THE VIEWER PROBLEM, and why this script has a second mode: the pending
// strip is inherently viewer-personal (a "you're in on" row needs a real vote
// from a real session), and there is no way from a script to forge a real
// Supabase session: signInAnonymously mints a UUID Supabase controls, and
// this project has no service-role key and no dev-login backdoor (both
// deliberately absent; see CLAUDE.md "Two databases, never crossed" and the
// stack-realities section on Supabase being auth-only). So the viewer cannot
// be pre-seeded as a fourth fake member the way the other three are.
//
// The fix: the browser tester becomes the viewer by actually joining through
// the invite link (a real anonymous session, a real 4th membership; "four
// members" in the brief is 3 seeded + this real join). Once joined, this
// script's second mode attaches their standing-yes vote to the gauge staged
// above, using whichever membership joined last:
//
//   npx tsx --env-file=.env scripts/qa-stage-pending.ts --seed-viewer <groupId>
//
// Order matters: join first, then run --seed-viewer, then load the group
// home. Running --seed-viewer before joining fails loudly (fewer than four
// members) rather than silently seeding the wrong person.
//
// WHERE IT WRITES: whichever database `.env` points at. Run `npm run db:which`
// first, every time; this script has no idea which project it is talking to and
// will happily write to production if that is what `.env` says.
//
// This is QA tooling, deliberately outside the test suite: it writes real rows
// to a shared database and is meant to be run by hand before a browser
// walkthrough. Same precedent as scripts/qa-stage-answer.ts and
// scripts/eval-detect.ts. It is not named *.test.ts, which is what keeps Vitest
// from collecting it.
//
// Usage: npx tsx --env-file=.env scripts/qa-stage-pending.ts
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
import { MessageAuthor, GaugeAnswer } from "@prisma/client"

const TZ = "America/Chicago"

/** The standing-yes gauge's activity: how --seed-viewer finds it again. */
const STANDING_ACTIVITY = "yoga recovery session"

/**
 * Second mode: attaches the just-joined viewer's IN vote to the standing-yes
 * gauge. Reads the group's memberships ordered by joinedAt and takes the
 * last one, the 4th member, who exists only because a real browser joined
 * through the invite link since the main run.
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

  const standingGauge = await prisma.gauge.findFirst({
    where: { groupId, activity: STANDING_ACTIVITY },
    orderBy: { createdAt: "desc" },
  })
  if (!standingGauge) {
    throw new Error(`group ${groupId} has no "${STANDING_ACTIVITY}" gauge to seed`)
  }

  const already = await prisma.gaugeVote.findFirst({
    where: { gaugeId: standingGauge.id, userId: viewer.id },
  })
  if (!already) {
    await prisma.gaugeVote.create({
      data: { gaugeId: standingGauge.id, userId: viewer.id, answer: GaugeAnswer.IN },
    })
  }

  console.log(
    JSON.stringify(
      {
        seededViewer: viewer.name,
        viewerUserId: viewer.id,
        alreadyVoted: !!already,
        standingGaugeId: standingGauge.id,
        homeUrl: `http://localhost:3000/groups/${group.id}`,
        next: "Reload the group home. The strip should now read 2 waiting on you · 1 you're in on.",
      },
      null,
      2
    )
  )
}

async function main() {
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

  const founder = await prisma.user.create({ data: { name: "Nora", supabaseAuthId: `qa-pending-founder-${stamp}` } })
  const theo = await prisma.user.create({ data: { name: "Theo", supabaseAuthId: `qa-pending-theo-${stamp}` } })
  const ava = await prisma.user.create({ data: { name: "Ava", supabaseAuthId: `qa-pending-ava-${stamp}` } })
  const group = await prisma.group.create({
    data: {
      name: "Sunset Boulderers",
      founderId: founder.id,
      timeZone: TZ,
      inviteToken: `qa-pending-${stamp}`,
      memberships: { create: [founder.id, theo.id, ava.id].map((userId) => ({ userId })) },
    },
  })

  async function memberMsg(userId: string, body: string) {
    return prisma.message.create({
      data: { groupId: group.id, authorType: MessageAuthor.MEMBER, authorId: userId, body },
    })
  }

  // ── The event the group's already scheduled: nobody's RSVP is set, so a
  // freshly joined viewer's RSVP is absent by construction. ────────────────
  const eventStart = zonedWallTimeToUtc(p.year, p.month, p.day + 4, 19, 0, TZ)
  const event = await createEvent({
    groupId: group.id,
    title: "Climb",
    startsAt: eventStart,
    activityLabel: "climbing",
  })

  // ── The waiting gauge: a fresh idea from a member. Theo's own message is
  // his yes (gauge-initiator precedent), so createGauge seeds his IN vote in
  // the same transaction; nobody else votes, and the not-yet-existing viewer
  // obviously has not either. ─────────────────────────────────────────────
  const boulderSrc = await memberMsg(theo.id, "we should try bouldering at the new east side gym sometime")
  const boulderDate = chooseProposedDate(6 /* Saturday */, null, TZ, now, null)
  const boulderBody = buildGaugeMessage("bouldering at the new east side gym", boulderDate, TZ, now, null)
  const boulder = await createGauge({
    groupId: group.id,
    sourceMessageId: boulderSrc.id,
    activity: "bouldering at the new east side gym",
    proposedDate: boulderDate,
    proposedTime: "10:00",
    body: boulderBody,
    initiatorUserId: theo.id,
  })
  if (boulder.status !== "created") throw new Error("staging the bouldering gauge did not create it")

  // ── The waiting proposal: Ava asks to push the climb an hour later. Her
  // message auto-seeds her own YES vote inside createGroupProposal. ───────
  const proposalStart = new Date(eventStart.getTime() + 60 * 60 * 1000)
  const proposalSrc = await memberMsg(ava.id, "can we push the climb to 8 instead of 7?")
  const proposalBody = buildGroupProposalQuestion(
    ava.name,
    "climbing",
    proposalStart,
    eventStart,
    TZ,
    now,
    null
  )
  const proposal = await createGroupProposal({
    groupId: group.id,
    eventId: event.id,
    askerUserId: ava.id,
    sourceMessageId: proposalSrc.id,
    proposedStartsAt: proposalStart,
    priorStartsAt: eventStart,
    body: proposalBody,
  })
  if (proposal.status !== "created") throw new Error("staging the group proposal did not create it")

  // ── The standing-yes candidate: floated, nobody votes yet. Its only vote
  // is added later by --seed-viewer, once a real session exists to cast it.
  const standingSrc = await memberMsg(founder.id, "yoga recovery session sunday morning, anyone?")
  const standingDate = chooseProposedDate(0 /* Sunday */, "morning", TZ, now, null)
  const standingBody = buildGaugeMessage(STANDING_ACTIVITY, standingDate, TZ, now, null)
  const standing = await createGauge({
    groupId: group.id,
    sourceMessageId: standingSrc.id,
    activity: STANDING_ACTIVITY,
    proposedDate: standingDate,
    proposedTime: "09:00",
    body: standingBody,
  })
  if (standing.status !== "created") throw new Error("staging the standing-yes gauge did not create it")

  console.log(
    JSON.stringify(
      {
        groupId: group.id,
        inviteUrl: `http://localhost:3000/join/${group.inviteToken}`,
        homeUrl: `http://localhost:3000/groups/${group.id}`,
        staged: {
          event: { id: event.id, title: event.title, startsAt: event.startsAt },
          waitingGauge: { id: boulder.gauge.id, activity: "bouldering at the new east side gym", inVoter: theo.name },
          waitingProposal: { id: proposal.proposal.id, asker: ava.name, priorStartsAt: eventStart, proposedStartsAt: proposalStart },
          standingYesGauge: { id: standing.gauge.id, activity: STANDING_ACTIVITY, note: "no votes yet (see next)" },
        },
        next: [
          "Join through inviteUrl as a new member. That real session is the viewer and becomes the 4th member.",
          `Run: npx tsx --env-file=.env scripts/qa-stage-pending.ts --seed-viewer ${group.id}`,
          "Load homeUrl. The strip should read \"2 waiting on you · 1 you're in on\".",
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
