// scripts/qa-stage-groupdetails.ts
//
// Stages the group-details-editing QA walkthrough: a fresh group ("[QA]
// Group Details") with a fake founder (Jordan) and two fake members (Casey,
// Rae), a real weekly rhythm (tennis), and that rhythm's next occurrence,
// created the way reconcile.ts creates it, so the group looks the way a real
// founder's group would look the first time they open group info's new
// "Edit group details" control.
//
// Modelled closely on scripts/qa-stage-editcard.ts: same requireDevTest
// guard, same [QA]-prefixed seeded group/users, the same reconcile-shaped
// occurrence creation, and the same JSON printout.
//
// Two modes:
//
//   1. (default)  Creates the group described above and prints its ids and
//      links. The owner joins through the invite link as themselves (a
//      brand-new member, not the founder) so they can drive the editing UI
//      as a real signed-in person rather than one of the seeded fakes.
//
//   2. --claim    Finds the most recently created "[QA] Group Details" group,
//      finds the most recently joined member who is NOT one of that group's
//      three seeded fakes (i.e. the owner, having just joined through the
//      invite link), and makes them the founder. Only the founder sees "Edit
//      group details" on group info, so claiming the seat is what makes the
//      walkthrough possible. Fails loudly, with a non-zero exit, if nobody
//      has joined yet.
//
// WHERE IT WRITES: whichever database `.env` points at. Run `npm run
// db:which` first, every time; this script refuses to run itself unless all
// three env sources agree on the dev-test project ref (see requireDevTest
// below), the same ref db:which checks against.
//
// This is QA tooling, deliberately outside the test suite: it writes real
// rows to a shared database and is meant to be run by hand before a browser
// walkthrough. No model calls anywhere in this script. Not named *.test.ts,
// which is what keeps Vitest from collecting it.
//
// Usage:
//   npx tsx --env-file=.env scripts/qa-stage-groupdetails.ts
//   npx tsx --env-file=.env scripts/qa-stage-groupdetails.ts --claim
//
// Each default-mode run creates a NEW group with fresh users and a fresh
// invite token, so running it twice leaves two groups behind rather than
// updating the first. --claim always targets the most recently created one.

import { prisma } from "../src/lib/prisma"
import { createEvent } from "../src/lib/events/create"
import { zonedWallTimeToUtc, getLocalParts, computeNextOccurrence } from "../src/lib/orbit/occurrence"
import { buildAnnouncement } from "../src/lib/orbit/announce"
import { judge } from "./db-which"
import { MessageAuthor, RsvpStatus, Prisma } from "@prisma/client"
import type { GroupRhythm, StoredRhythm } from "../src/lib/orbit/rhythm"

const TZ = "America/New_York"

/** The same ref db:which checks against (CLAUDE.md, "Two databases, never crossed"). */
const EXPECTED_DEV_TEST_REF = "pxbewardwvoyqqcvogel"

const GROUP_NAME = "[QA] Group Details"

/**
 * Prefix shared by every seeded user's supabaseAuthId in this script. Used by
 * --claim to tell a seeded fake apart from the real member who just joined
 * through the invite link: nobody else in this database gets this prefix.
 */
const SEEDED_PREFIX = "qa-groupdetails-"

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

async function stageDefault(): Promise<void> {
  const now = new Date()
  const p = getLocalParts(now, TZ)
  const stamp = Date.now()

  const jordan = await prisma.user.create({ data: { name: "Jordan", supabaseAuthId: `${SEEDED_PREFIX}founder-${stamp}` } })
  const casey = await prisma.user.create({ data: { name: "Casey", supabaseAuthId: `${SEEDED_PREFIX}casey-${stamp}` } })
  const rae = await prisma.user.create({ data: { name: "Rae", supabaseAuthId: `${SEEDED_PREFIX}rae-${stamp}` } })

  // The real StoredRhythm shape onboarding would have written, so the
  // group's recurringActivities column parses the same way a real founder's
  // does (parseRhythm accepts it).
  const storedRhythm: StoredRhythm = {
    activity: "tennis",
    title: "Tennis",
    cadence: "weekly",
    daysOfWeek: [6], // Saturday
    timeLocal: "09:00",
    durationMinutes: null,
    venueName: "Court 3",
  }

  const group = await prisma.group.create({
    data: {
      name: GROUP_NAME,
      founderId: jordan.id,
      timeZone: TZ,
      inviteToken: `qa-groupdetails-${stamp}`,
      // Json? column: the validated array is cast for Prisma's JSON input
      // type, same pattern as groups/provision.ts.
      recurringActivities: [storedRhythm] as unknown as Prisma.InputJsonValue,
      memberships: { create: [jordan.id, casey.id, rae.id].map((userId) => ({ userId })) },
    },
  })

  async function memberMsg(userId: string, body: string) {
    return prisma.message.create({
      data: { groupId: group.id, authorType: MessageAuthor.MEMBER, authorId: userId, body },
    })
  }
  async function orbitMsg(body: string) {
    return prisma.message.create({
      data: { groupId: group.id, authorType: MessageAuthor.ORBIT, authorId: null, body },
    })
  }

  await memberMsg(jordan.id, "who's around this week")
  await memberMsg(casey.id, "count me in for whatever")

  // ── The rhythm's next occurrence, created the same way reconcile.ts
  // creates it: computeNextOccurrence against `now`, title/activityLabel
  // from the rhythm, the scheduledKey reconcile uses, and the rhythm's
  // venue snapshotted onto the event. Casey and Rae are IN. ────────────────
  const rhythmForOccurrence: GroupRhythm = {
    activity: storedRhythm.activity,
    title: storedRhythm.title,
    daysOfWeek: storedRhythm.daysOfWeek!,
    timeLocal: storedRhythm.timeLocal!,
    cadence: "weekly",
    venueName: storedRhythm.venueName,
  }
  const startsAt = computeNextOccurrence(rhythmForOccurrence, TZ, now)
  const tennisEvent = await createEvent({
    groupId: group.id,
    title: rhythmForOccurrence.title,
    startsAt,
    activityLabel: rhythmForOccurrence.activity,
    scheduledKey: `${group.id}:${startsAt.toISOString()}`,
    venue: { name: rhythmForOccurrence.venueName! },
  })
  await prisma.rsvp.create({ data: { eventId: tennisEvent.id, userId: casey.id, status: RsvpStatus.IN } })
  await prisma.rsvp.create({ data: { eventId: tennisEvent.id, userId: rae.id, status: RsvpStatus.IN } })

  await orbitMsg(buildAnnouncement(tennisEvent, rhythmForOccurrence, TZ))
  await memberMsg(rae.id, "court's booked, see everyone there")

  console.log(
    JSON.stringify(
      {
        groupId: group.id,
        groupName: group.name,
        inviteUrl: `/join/${group.inviteToken}`,
        infoPath: `/groups/${group.id}/info`,
        homePath: `/groups/${group.id}`,
        seededSummary:
          "Seeding artifact, not product behavior: Jordan (founder), Casey, and Rae are fake QA members " +
          "created fresh by this script, not real people who used the product. Join through inviteUrl as " +
          "yourself, then run this script again with --claim to take over the founder seat so you can see " +
          "\"Edit group details\" on group info.",
        next: [
          "Prefix inviteUrl with your LAN host (not localhost, so it works from a phone too), e.g. http://192.168.1.23:3000/join/<token>.",
          "Join through that link as a brand-new member.",
          "Run: npm run qa:stage-groupdetails -- --claim",
          "Reload group info: you are now the founder and \"Edit group details\" is visible.",
        ],
      },
      null,
      2
    )
  )
}

async function stageClaim(): Promise<void> {
  const group = await prisma.group.findFirst({
    where: { name: GROUP_NAME },
    orderBy: { createdAt: "desc" },
  })
  if (!group) {
    console.error(`No "${GROUP_NAME}" group found. Run this script with no flags first to create one.`)
    process.exit(1)
  }

  const candidate = await prisma.membership.findFirst({
    where: {
      groupId: group.id,
      user: { supabaseAuthId: { not: { startsWith: SEEDED_PREFIX } } },
    },
    orderBy: { joinedAt: "desc" },
    include: { user: { select: { id: true, name: true } } },
  })
  if (!candidate) {
    console.error(`Join through the invite link first.`)
    console.error(`No member of "${group.name}" (${group.id}) other than the three seeded fakes has joined yet.`)
    process.exit(1)
  }

  await prisma.group.update({ where: { id: group.id }, data: { founderId: candidate.userId } })

  console.log(
    JSON.stringify(
      {
        groupId: group.id,
        groupName: group.name,
        newFounderUserId: candidate.userId,
        newFounderName: candidate.user.name,
        infoPath: `/groups/${group.id}/info`,
        homePath: `/groups/${group.id}`,
        summary: `${candidate.user.name} now holds the founder seat on "${group.name}". Reload group info to see "Edit group details".`,
      },
      null,
      2
    )
  )
}

async function main() {
  requireDevTest()
  const claim = process.argv.includes("--claim")
  if (claim) {
    await stageClaim()
  } else {
    await stageDefault()
  }
  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
