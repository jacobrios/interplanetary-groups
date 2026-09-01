// scripts/measure-group-home.ts
//
// Measures what one render of the group home actually costs, and how that cost
// grows with the length of the conversation. This is the "before" instrument
// for the message-send-latency slice; it exists so a performance claim in that
// slice has a method attached to it rather than a feeling.
//
// WHAT IT MEASURES, and this is the honest boundary of it: the DATABASE half of
// a group-home render. It replays, in order, the exact query sequence
// src/app/groups/[id]/page.tsx runs, using the same helper functions the page
// imports, so the shape of the work is the page's own rather than a
// reconstruction. It deliberately does NOT measure:
//   - supabase.auth.getUser(), which is a real HTTP round trip the page makes
//     twice per send (once in the action, once in the re-render) and which this
//     script has no session to make. Counted, never timed.
//   - React server rendering, serialisation, network transfer to the phone, and
//     client hydration. Those are real and they are the browser's half.
// So every number here is a FLOOR on the server cost, not the whole of it.
//
// WHERE IT WRITES: whichever database .env points at, and it refuses to run
// unless all three env sources agree on the dev-test project ref, the same
// guard qa-sweep.ts uses. It creates one throwaway group, grows its message
// count between passes, and deletes the group at the end (--keep to leave it).
//
// Deliberately outside the test suite, like the eval benches and the qa-stage
// scripts: it writes real rows to a shared database and its output is a
// measurement, not a pass/fail. Not named *.test.ts, which is what keeps Vitest
// from collecting it.
//
// Usage: npx tsx --env-file=.env scripts/measure-group-home.ts [--keep]

import { MessageAuthor, RsvpStatus } from "@prisma/client"

import { prisma } from "../src/lib/prisma"
import { findUpcomingEvents } from "../src/lib/events/upcoming-list"
import { deriveRoster } from "../src/lib/events/roster"
import { findLiveGauges } from "../src/lib/gauges/read"
import { findLiveProposals } from "../src/lib/proposals/read"
import { loadEmailAskInputs } from "../src/lib/auth/email-ask"
import { CARD_REGION_CAP } from "../src/lib/cards/region"

import { judge, EXPECTED_DEV_TEST_REF } from "./db-which"

/** The same ref db:which checks against (CLAUDE.md, "Two databases, never crossed"). */


function requireDevTest(): void {
  const verdict = judge(process.env, EXPECTED_DEV_TEST_REF)
  if (verdict.ok) return
  console.error(`STOP: this checkout is NOT confirmed to be dev-test.`)
  for (const p of verdict.problems) console.error(`  - ${p}`)
  console.error(`Run npm run db:which and resolve it before running this script.`)
  process.exit(1)
}

/** Message counts to measure at. 6 is the owner's own measured group. */
const MESSAGE_COUNTS = [6, 50, 200, 500]

/** Passes per count. The first is discarded as a warm-up; the rest are reported. */
const PASSES = 6

interface StepTiming {
  label: string
  ms: number
}

interface PassResult {
  steps: StepTiming[]
  totalMs: number
  payloadBytes: number
  messageRows: number
}

async function time<T>(label: string, fn: () => Promise<T>): Promise<[T, StepTiming]> {
  const t0 = performance.now()
  const value = await fn()
  return [value, { label, ms: performance.now() - t0 }]
}

/**
 * One render of the group home's data layer, in the page's own order.
 *
 * Kept structurally parallel to page.tsx on purpose: the sequential awaits are
 * sequential here too, because that is the thing being measured. Turning them
 * into a Promise.all here would measure a page we do not have.
 */
async function renderOnce(groupId: string, viewerId: string): Promise<PassResult> {
  const steps: StepTiming[] = []
  const t0 = performance.now()

  const [group, s1] = await time("group + memberships + users", () =>
    prisma.group.findUnique({
      where: { id: groupId },
      include: { memberships: { include: { user: true }, orderBy: { joinedAt: "asc" } } },
    })
  )
  steps.push(s1)
  if (!group) throw new Error("measurement group vanished")

  const [viewer, s2] = await time("viewer row (getCurrentUser's prisma half)", () =>
    prisma.user.findUnique({ where: { id: viewerId } })
  )
  steps.push(s2)
  if (!viewer) throw new Error("measurement viewer vanished")

  // Started, not awaited — same as the page.
  const emailAskInputs = loadEmailAskInputs({ userId: viewer.id, groupId: group.id }).catch(
    () => ({ latestContributionAt: null, hasVerifiedEmail: false })
  )

  const [upcomingEvents, s3] = await time("upcoming events", () =>
    findUpcomingEvents(group.id, new Date(), CARD_REGION_CAP)
  )
  steps.push(s3)

  const allMembers = group.memberships.map((m) => m.user)
  const [, s4] = await time("rsvps per card (N+1, parallel)", () =>
    Promise.all(
      upcomingEvents.map(async (event) => {
        const rsvps = await prisma.rsvp.findMany({ where: { eventId: event.id } })
        return deriveRoster(allMembers, rsvps, viewer.id)
      })
    )
  )
  steps.push(s4)

  const [rawMessages, s5] = await time("ALL messages + author (the unbounded one)", () =>
    prisma.message.findMany({
      where: { groupId: group.id },
      orderBy: { createdAt: "asc" },
      include: { author: true },
    })
  )
  steps.push(s5)

  const [, s6] = await time("live gauges", () => findLiveGauges(group.id, new Date()))
  steps.push(s6)

  const [, s7] = await time("live proposals", () => findLiveProposals(group.id, new Date()))
  steps.push(s7)

  const [, s8] = await time("await email-ask inputs", () => emailAskInputs)
  steps.push(s8)

  // The prop the page actually ships to the browser, built the page's way.
  const messages = rawMessages.map((msg) => ({
    id: msg.id,
    authorType: msg.authorType,
    authorId: msg.authorId,
    authorName: msg.author?.name ?? null,
    body: msg.body,
    createdAt: msg.createdAt,
  }))

  return {
    steps,
    totalMs: performance.now() - t0,
    payloadBytes: Buffer.byteLength(JSON.stringify(messages), "utf8"),
    messageRows: rawMessages.length,
  }
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

async function seedGroup() {
  const founder = await prisma.user.create({ data: { name: "[PERF] Founder" } })
  const group = await prisma.group.create({
    data: {
      name: "[PERF] Latency Measurement",
      founderId: founder.id,
      timeZone: "America/New_York",
      memberships: { create: { userId: founder.id } },
    },
  })

  const others = await Promise.all(
    ["[PERF] Casey", "[PERF] Rae", "[PERF] Sam"].map((name) =>
      prisma.user.create({
        data: { name, memberships: { create: { groupId: group.id } } },
      })
    )
  )
  const members = [founder, ...others]

  // One upcoming event with a venue and a partial roster, so the card region
  // has real work to do rather than short-circuiting on an empty list.
  const starts = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000)
  const event = await prisma.event.create({
    data: {
      groupId: group.id,
      title: "Climbing",
      activityLabel: "climbing",
      startsAt: starts,
      venues: { create: { name: "[PERF] The Gym", address: "1 Test St" } },
    },
  })
  await prisma.rsvp.createMany({
    data: [
      { eventId: event.id, userId: members[0].id, status: RsvpStatus.IN },
      { eventId: event.id, userId: members[1].id, status: RsvpStatus.IN },
      { eventId: event.id, userId: members[2].id, status: RsvpStatus.OUT },
    ],
  })

  return { group, founder, members }
}

/** Grows the group's message count to `target`, alternating members and Orbit. */
async function growMessagesTo(
  groupId: string,
  members: { id: string }[],
  current: number,
  target: number
): Promise<number> {
  if (target <= current) return current
  const base = Date.now() - target * 60_000
  const rows = []
  for (let i = current; i < target; i++) {
    const isOrbit = i % 4 === 3
    rows.push({
      groupId,
      authorType: isOrbit ? MessageAuthor.ORBIT : MessageAuthor.MEMBER,
      authorId: isOrbit ? null : members[i % members.length].id,
      // Roughly the length of a real chat line; the payload figure is only
      // as honest as this is.
      body: `Message ${i + 1}: sounds good to me, I should be able to make that one.`,
      createdAt: new Date(base + i * 60_000),
    })
  }
  await prisma.message.createMany({ data: rows })
  return target
}

async function main() {
  requireDevTest()
  const keep = process.argv.includes("--keep")

  console.log("Measuring the group home's server-side data layer.")
  console.log("Database: dev-test. Timings are the database half only; see the header.\n")

  const { group, founder, members } = await seedGroup()
  let seeded = 0

  const table: string[] = []

  for (const count of MESSAGE_COUNTS) {
    seeded = await growMessagesTo(group.id, members, seeded, count)

    const passes: PassResult[] = []
    for (let p = 0; p < PASSES; p++) {
      passes.push(await renderOnce(group.id, founder.id))
    }
    const reported = passes.slice(1) // discard warm-up

    const totals = reported.map((r) => r.totalMs)
    const msgStep = reported.map(
      (r) => r.steps.find((s) => s.label.startsWith("ALL messages"))!.ms
    )
    const last = reported[reported.length - 1]

    console.log(`── ${last.messageRows} messages ────────────────────────────────`)
    for (const label of last.steps.map((s) => s.label)) {
      const xs = reported.map((r) => r.steps.find((s) => s.label === label)!.ms)
      console.log(`   ${median(xs).toFixed(1).padStart(7)} ms  ${label}`)
    }
    console.log(`   ${median(totals).toFixed(1).padStart(7)} ms  TOTAL (median of ${reported.length})`)
    console.log(`   ${(last.payloadBytes / 1024).toFixed(1).padStart(7)} KB  messages prop shipped to the phone\n`)

    table.push(
      `${String(last.messageRows).padStart(4)} | ${median(totals).toFixed(0).padStart(7)} | ${median(msgStep).toFixed(0).padStart(9)} | ${(last.payloadBytes / 1024).toFixed(1).padStart(8)}`
    )
  }

  console.log("Summary (median ms per render, one render):")
  console.log(" msgs |  total  | msg query | payload")
  console.log("------+---------+-----------+---------")
  for (const row of table) console.log(row)
  console.log("\nA send costs TWO of these renders: send-message.ts and detect-intent.ts")
  console.log("each call revalidatePath on the same group page.")

  if (keep) {
    console.log(`\nKept: group ${group.id}`)
  } else {
    await prisma.group.delete({ where: { id: group.id } })
    await prisma.user.deleteMany({ where: { id: { in: members.map((m) => m.id) } } })
    console.log("\nCleaned up the measurement group and its users.")
  }

  await prisma.$disconnect()
}

// Exit loudly rather than as an unhandled rejection.
// The measurement group and its users are deleted in main()'s happy path; this
// catch is what stops a mid-run failure (a flaky remote, or the script's own
// "measurement group vanished") leaving a [PERF] group and up to 500 messages
// behind in dev-test on every run, which the header above promises it does not.
main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})
