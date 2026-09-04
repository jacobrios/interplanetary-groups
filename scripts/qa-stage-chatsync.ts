// scripts/qa-stage-chatsync.ts
//
// Stages, and then drives, the two-person case that the chat-sync slice exists
// for: one member sitting on the group home while ANOTHER member talks.
//
// Two modes, and the second is the whole point. A staging script that only sets
// up a group cannot demonstrate this bug, because the bug is about what a page
// does after it has loaded. So this script can also speak as somebody else,
// from a laptop, while the page under test sits untouched on a phone. That
// removes the second device from the QA loop: before this, proving the fix
// needed two humans or two browsers in the same room, which is exactly why the
// bug survived to production in the first place.
//
//   npx tsx --env-file=.env scripts/qa-stage-chatsync.ts
//       Creates a fresh group and prints the invite link to open.
//
//   npx tsx --env-file=.env scripts/qa-stage-chatsync.ts --say "hello"
//       Posts that line into the most recently staged group AS ANOTHER MEMBER.
//       Run it while the group home is open and untouched in a browser.
//
// WHAT TO WATCH: with the page open and NOT touched, run --say. Before this
// slice nothing appears, ever, until a reload. After it, the line appears
// within about ten seconds. That is the entire test, and it is one nobody in
// this project had ever run.
//
// WHERE IT WRITES: whichever database .env points at, and it refuses to run
// unless all three env sources agree on the dev-test project ref, the same
// guard qa-sweep.ts and qa-stage-latency.ts use.
//
// QA tooling, deliberately outside the test suite (same precedent as the other
// qa-stage-* scripts). Not named *.test.ts, which is what keeps Vitest from
// collecting it.

import { MessageAuthor } from "@prisma/client"

import { prisma } from "../src/lib/prisma"
import { judge, EXPECTED_DEV_TEST_REF } from "./db-which"

const GROUP_NAME = "[QA] Chat Sync"

function requireDevTest(): void {
  const verdict = judge(process.env, EXPECTED_DEV_TEST_REF)
  if (verdict.ok) return
  console.error(`STOP: this checkout is NOT confirmed to be dev-test.`)
  for (const p of verdict.problems) console.error(`  - ${p}`)
  console.error(`Run npm run db:which and resolve it before running this script.`)
  process.exit(1)
}

/** Speak as a member who is NOT the viewer, into the most recent staged group. */
async function say(body: string): Promise<void> {
  const group = await prisma.group.findFirst({
    where: { name: GROUP_NAME },
    orderBy: { createdAt: "desc" },
    include: { memberships: { include: { user: true }, orderBy: { joinedAt: "asc" } } },
  })
  if (!group) {
    console.error(`No "${GROUP_NAME}" group found. Run this script with no arguments first.`)
    process.exit(1)
  }

  // The SECOND member, never the first. The first is the founder, who is the
  // identity the browser under test is signed in as; a message from them would
  // arrive through their own send path and prove nothing about this slice.
  const speaker = group.memberships[1]?.user
  if (!speaker) {
    console.error(`Group "${group.name}" has no second member to speak as.`)
    process.exit(1)
  }

  await prisma.message.create({
    data: {
      groupId: group.id,
      authorType: MessageAuthor.MEMBER,
      authorId: speaker.id,
      body,
    },
  })

  console.log(`${speaker.name} said: "${body}"`)
  console.log(`In: ${group.name} (${group.id})`)
  console.log(``)
  console.log(`Now watch the open page. Do NOT touch it, tap it, or scroll.`)
}

async function stage(): Promise<void> {
  const founder = await prisma.user.create({ data: { name: "You" } })
  const group = await prisma.group.create({
    data: {
      name: GROUP_NAME,
      founderId: founder.id,
      timeZone: "America/New_York",
      memberships: { create: { userId: founder.id } },
    },
  })

  // One other member, who is who --say speaks as. Named so the QA report reads
  // unambiguously: a line from Robin is a line the viewer did not write.
  await prisma.user.create({
    data: { name: "Robin", memberships: { create: { groupId: group.id } } },
  })

  await prisma.message.create({
    data: {
      groupId: group.id,
      authorType: MessageAuthor.ORBIT,
      body: "Welcome. Say something and I'll keep track of who's in.",
    },
  })

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
  console.log(`Group:  ${group.name}`)
  console.log(`Open:   ${base}/join/${group.inviteToken}`)
  console.log(``)
  console.log(`Then, with that page open and untouched:`)
  console.log(`  npx tsx --env-file=.env scripts/qa-stage-chatsync.ts --say "hello"`)
}

async function main(): Promise<void> {
  requireDevTest()
  const flag = process.argv.indexOf("--say")
  if (flag !== -1) {
    const body = process.argv[flag + 1]
    if (!body) {
      console.error(`--say needs something to say, in quotes.`)
      process.exit(1)
    }
    await say(body)
    return
  }
  await stage()
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
