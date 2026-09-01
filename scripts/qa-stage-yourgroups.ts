// scripts/qa-stage-yourgroups.ts
//
// Stages the "your groups" QA walkthrough (second-group-entry-point slice,
// Task 7). Build-notes records that the several-groups front door has NEVER
// been seen in a browser: no dev-test user has ever belonged to more than
// one group, so /groups and its ordering rule (orderGroupsByRecentlyOpened)
// have only ever been proven by unit tests. This script is what makes it
// reachable.
//
// FIVE groups, and why five: enough that the list actually reads as a list
// on screen rather than a two-item toy case, without being so many the
// operator can't eyeball the whole thing in one screenshot. They exercise
// three distinct pieces of the ordering rule at once, each spread far
// enough apart that a broken sort would visibly disagree with the printout:
//
//   1. [QA] Climbing Crew                         — opened moments ago (real)
//   2. [QA] Tuesday Trivia                         — opened ~3 hours ago
//   3. [QA] Sunday Brunch                          — opened ~3 days ago
//   4. [QA] Neighborhood Photography Collective    — never opened, joined ~5 days ago
//   5. [QA] Wednesday Board Games                  — never opened, joined ~10 days ago
//
// (1)-(3) prove "most recently opened first". (4) and (5) prove "never
// opened sorts after every opened group, regardless of how recently
// joined" (group-order.ts's own comment: opening is a stronger recency
// signal than merely being a member). (4) vs (5) additionally prove the
// null tie-break, joinedAt descending: a single never-opened group could
// not show that a second one landing after it is genuine sort behavior
// rather than incidental row order.
//
// Group 4's name is the long three-word case, deliberate rather than
// decorative: CLAUDE.md records that an entire design correction shipped
// because the design boards only ever used short two-word names while real
// group names are model-generated with a three-word cap, and this is the
// first dev-test row that lets that wrap-not-clip behavior be seen on
// /groups rather than assumed from reading YourGroupsScreen.tsx.
//
// THE VIEWER PROBLEM, same story as qa-stage-polish.ts and qa-stage-email.ts:
// a script cannot forge a Supabase session (no service-role key, no
// dev-login backdoor, both deliberately absent). So the browser tester
// becomes the viewer by really joining group 1 through its invite link — a
// real anonymous session, a real second membership — which is also why
// group 1's own lastSeenAt is never written by this script: joining
// redirects straight to that group's home, and SeenMarker fires for real on
// mount. Once joined, --seed-viewer finds that real person (the newest
// membership on group 1, by joinedAt) and attaches them directly to groups
// 2-5 with the spread above, the same way qa-stage-polish.ts's --seed-viewer
// attaches a vote and a message to an already-joined viewer.
//
// Modes:
//   1. (default)              creates the five groups and prints the invite
//                              link plus next steps.
//   2. --seed-viewer <id>      run AFTER joining group 1 through its invite
//                              link. Attaches the viewer to groups 2-5.
//   3. --verify <id>           reads back the viewer's current group list
//                              through the real orderGroupsByRecentlyOpened
//                              function (not a hand-rederived copy of it) and
//                              prints what /groups should show right now.
//                              Safe to re-run after the browser pass opens
//                              one of the fixture groups for real, to confirm
//                              its lastSeenAt bump moved it up the list.
//
// ADDITIVE ONLY: every mode only creates rows (users, groups, memberships).
// Nothing here deletes, truncates, or touches a row it did not create,
// because a second session is running concurrently against this same
// dev-test database on unrelated work.
//
// WHERE IT WRITES: whichever database `.env` points at. Run `npm run
// db:which` first, every time; this script also refuses to run itself
// unless all three env sources agree on the dev-test project ref (see
// requireDevTest below), the same ref db:which checks against.
//
// This is QA tooling, deliberately outside the test suite: it writes real
// rows to a shared database and is meant to be run by hand before a browser
// walkthrough. Not named *.test.ts, which is what keeps Vitest from
// collecting it.

import { prisma } from "../src/lib/prisma"
import { orderGroupsByRecentlyOpened } from "../src/lib/nav/group-order"
import { judge } from "./db-which"

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

const JOIN_GROUP_NAME = "[QA] Climbing Crew"

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

/**
 * The four fixture groups the viewer is attached to directly (never through
 * a real invite tap). Name is the join key --seed-viewer uses to find each
 * one again in a fresh process, since the two modes run as separate `tsx`
 * invocations with no shared memory.
 */
const OTHER_GROUP_SPECS: ReadonlyArray<{
  name: string
  joinedAgoMs: number
  lastSeenAgoMs: number | null // null = never opened
}> = [
  { name: "[QA] Tuesday Trivia", joinedAgoMs: 6 * HOUR, lastSeenAgoMs: 3 * HOUR },
  { name: "[QA] Sunday Brunch", joinedAgoMs: 4 * DAY, lastSeenAgoMs: 3 * DAY },
  {
    name: "[QA] Neighborhood Photography Collective",
    joinedAgoMs: 5 * DAY,
    lastSeenAgoMs: null,
  },
  { name: "[QA] Wednesday Board Games", joinedAgoMs: 10 * DAY, lastSeenAgoMs: null },
]

async function stage() {
  const stamp = Date.now()

  // One host founds all five groups. The viewer never founds anything here;
  // they only ever join, which is the case this slice's entry point exists
  // for (a member reaching a second group, not a founder managing one).
  const host = await prisma.user.create({
    data: { name: "Priya", supabaseAuthId: `qa-yourgroups-host-${stamp}` },
  })

  const joinGroup = await prisma.group.create({
    data: {
      name: JOIN_GROUP_NAME,
      founderId: host.id,
      memberships: { create: [{ userId: host.id }] },
    },
  })

  for (const spec of OTHER_GROUP_SPECS) {
    await prisma.group.create({
      data: {
        name: spec.name,
        founderId: host.id,
        memberships: { create: [{ userId: host.id }] },
      },
    })
  }

  console.log(`Staged ${1 + OTHER_GROUP_SPECS.length} groups, all founded by ${host.name}.`)
  console.log(``)
  console.log(`Next:`)
  console.log(`  1. In the browser, open the invite link below and join as a new member.`)
  console.log(`     That real session is the viewer; joining redirects straight into the`)
  console.log(`     group home, which is what sets this group's own lastSeenAt for real.`)
  console.log(``)
  console.log(`     http://localhost:3000/join/${joinGroup.inviteToken}`)
  console.log(``)
  console.log(`  2. Attach that viewer to the other four groups:`)
  console.log(``)
  console.log(`     npx tsx --env-file=.env scripts/qa-stage-yourgroups.ts --seed-viewer ${joinGroup.id}`)
  console.log(``)
  console.log(`  3. Visit the list: http://localhost:3000/groups`)
  console.log(``)
  console.log(`joinGroupId: ${joinGroup.id}`)
}

/**
 * Finds the real viewer (the newest membership on the join group, by
 * joinedAt) and attaches them to the four fixture groups with the spread of
 * joinedAt/lastSeenAt values documented at the top of this file. Idempotent:
 * a group the viewer is already attached to is left untouched rather than
 * re-seeded, so running this twice after one join is harmless.
 */
async function seedViewer(joinGroupId: string) {
  const joinGroup = await prisma.group.findUnique({
    where: { id: joinGroupId },
    include: { memberships: { include: { user: true }, orderBy: { joinedAt: "asc" } } },
  })
  if (!joinGroup) throw new Error(`no group ${joinGroupId}`)
  if (joinGroup.name !== JOIN_GROUP_NAME) {
    throw new Error(
      `group ${joinGroupId} is "${joinGroup.name}", not "${JOIN_GROUP_NAME}". ` +
        `--seed-viewer wants the id this script's default run printed as joinGroupId.`
    )
  }
  if (joinGroup.memberships.length < 2) {
    throw new Error(
      `group ${joinGroupId} has only ${joinGroup.memberships.length} member(s) (just the ` +
        `founder). Join through the invite link first — that becomes the viewer — then re-run --seed-viewer.`
    )
  }
  const viewer = joinGroup.memberships[joinGroup.memberships.length - 1].user

  const others = await prisma.group.findMany({
    where: { founderId: joinGroup.founderId, id: { not: joinGroupId } },
  })
  if (others.length !== OTHER_GROUP_SPECS.length) {
    throw new Error(
      `expected ${OTHER_GROUP_SPECS.length} other groups founded by ${joinGroup.founderId}, found ${others.length}.`
    )
  }
  const byName = new Map(others.map((g) => [g.name, g]))

  const now = new Date()
  const attached: string[] = []
  const skipped: string[] = []

  for (const spec of OTHER_GROUP_SPECS) {
    const group = byName.get(spec.name)
    if (!group) throw new Error(`fixture group "${spec.name}" not found among this host's groups`)

    const existing = await prisma.membership.findFirst({
      where: { userId: viewer.id, groupId: group.id },
    })
    if (existing) {
      skipped.push(spec.name)
      continue
    }

    await prisma.membership.create({
      data: {
        userId: viewer.id,
        groupId: group.id,
        joinedAt: new Date(now.getTime() - spec.joinedAgoMs),
        lastSeenAt: spec.lastSeenAgoMs === null ? null : new Date(now.getTime() - spec.lastSeenAgoMs),
      },
    })
    attached.push(spec.name)
  }

  console.log(`Viewer: ${viewer.name} (userId ${viewer.id})`)
  if (attached.length > 0) console.log(`Attached to: ${attached.join(", ")}`)
  if (skipped.length > 0) console.log(`Already attached (left alone): ${skipped.join(", ")}`)
  console.log(``)
  await printExpectedOrder(viewer.id)
}

/**
 * Reads the viewer's current memberships and sorts them with the same
 * orderGroupsByRecentlyOpened function src/app/groups/page.tsx calls, so
 * this printout can never drift from what the real screen does — it is
 * calling the production ordering code, not restating its rule.
 */
async function printExpectedOrder(viewerId: string) {
  const memberships = await prisma.membership.findMany({
    where: { userId: viewerId },
    select: {
      groupId: true,
      joinedAt: true,
      lastSeenAt: true,
      group: { select: { id: true, name: true } },
    },
  })

  const ordered = orderGroupsByRecentlyOpened(memberships)

  console.log(`Expected order on http://localhost:3000/groups (top to bottom):`)
  ordered.forEach((m, i) => {
    const seen = m.lastSeenAt ? m.lastSeenAt.toISOString() : "never opened"
    console.log(`  ${i + 1}. ${m.group.name}  —  lastSeenAt: ${seen}`)
  })
}

/** Reads back the current state without writing anything, for a re-check mid-walkthrough. */
async function verify(joinGroupId: string) {
  const joinGroup = await prisma.group.findUnique({
    where: { id: joinGroupId },
    include: { memberships: { include: { user: true }, orderBy: { joinedAt: "asc" } } },
  })
  if (!joinGroup) throw new Error(`no group ${joinGroupId}`)
  if (joinGroup.memberships.length < 2) {
    throw new Error(`group ${joinGroupId} has only ${joinGroup.memberships.length} member(s); nobody has joined yet.`)
  }
  const viewer = joinGroup.memberships[joinGroup.memberships.length - 1].user
  console.log(`Viewer: ${viewer.name} (userId ${viewer.id})`)
  console.log(``)
  await printExpectedOrder(viewer.id)
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

  const verifyAt = process.argv.indexOf("--verify")
  if (verifyAt !== -1) {
    const id = process.argv[verifyAt + 1]
    if (!id) throw new Error("--verify needs a group id")
    await verify(id)
    await prisma.$disconnect()
    return
  }

  await stage()
  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
