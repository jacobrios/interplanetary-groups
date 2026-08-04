// src/lib/orbit/endgame.ts
//
// The other end of a gauge's life: one bump the evening before its proposed
// day if it's still short of the bar, and one closing note if it never got
// there. Creation, votes, and promotion all live elsewhere; this is the sweep
// that lets an idea that stalled below three yeses die politely instead of
// lingering as a stale card forever.
//
// Called unscoped by the daily cron sweep in production, exactly like
// reconcile.ts's reconcileScheduledEvents — every group, every open gauge —
// and that is correct there. In a TEST, unscoped means posting a real Orbit
// bump or closure message into every open gauge, in every group, in the
// shared dev-test database, permanently. Every test call in
// __tests__/endgame.test.ts MUST pass { groupId }; see
// src/lib/orbit/__tests__/reconcile.test.ts for the story of what an
// unscoped test sweep actually costs.
//
// Candidate gauges are found by a coarse proposedDate window around `now`
// (the same trick findLiveGauges uses in read.ts). Whether a candidate is
// actually promoted, already closed, still live, or eligible to bump is then
// decided gauge-by-gauge in handleOne/handleBump/handleClose below, rather
// than filtered out of the initial query — "promoted" and "already_closed_out"
// are both real, reachable EndgameResult values, and a where-clause that
// excluded them at the database level would make them unreachable from here.

import { prisma } from "@/lib/prisma"
import { MessageAuthor, Prisma } from "@prisma/client"
import { isGaugeLive, buildBumpMessage, buildClosureMessage, BUMP_LOCAL_HOUR } from "./spark-copy"
import { getLocalParts } from "./occurrence"
import { countIn } from "@/lib/gauges/threshold"

export type EndgameResult =
  | { gaugeId: string; action: "bumped" }
  | { gaugeId: string; action: "closed_with_note" }
  | {
      gaugeId: string
      action: "skipped"
      reason:
        | "still_open"
        | "already_bumped"
        | "born_today"
        | "still_newest"
        | "not_the_eve"
        | "already_closed_out"
        | "closed_silently"
        | "promoted"
    }

/**
 * How far the coarse database filter reaches on either side of `now`. Two
 * days each way, the same margin findLiveGauges uses: wide enough that it can
 * never exclude a gauge the precise checks below would have treated as still
 * relevant (a bump can only fire the single evening before, a close only
 * shortly after), narrow enough to keep the candidate set small.
 */
const WINDOW_MS = 2 * 24 * 60 * 60 * 1000

const gaugeInclude = {
  votes: true,
  event: { select: { id: true } },
  group: { include: { memberships: { include: { user: true } } } },
} satisfies Prisma.GaugeInclude

type CandidateGauge = Prisma.GaugeGetPayload<{ include: typeof gaugeInclude }>

/**
 * Sweep every candidate gauge for its endgame: bump the ones a day out and
 * still short of the bar, close the ones whose window has passed.
 *
 * Gauges are processed sequentially (not Promise.all), matching
 * reconcileScheduledEvents' structure. Never throws per-gauge: a failure is
 * caught, logged, and the sweep continues with the next gauge.
 *
 * @param now  The reference instant. Passed explicitly so callers (cron
 *             handler, tests) control the clock without mocking Date.now().
 * @param opts.groupId  Optional scope: sweep only this group. Tests MUST
 *             always pass this — see the file-header warning above.
 */
export async function runGaugeEndgame(
  now: Date,
  opts?: { groupId?: string }
): Promise<EndgameResult[]> {
  const gauges = await prisma.gauge.findMany({
    where: {
      ...(opts?.groupId ? { groupId: opts.groupId } : {}),
      proposedDate: {
        gte: new Date(now.getTime() - WINDOW_MS),
        lte: new Date(now.getTime() + WINDOW_MS),
      },
    },
    include: gaugeInclude,
    orderBy: { createdAt: "asc" },
  })

  const results: EndgameResult[] = []
  for (const gauge of gauges) {
    try {
      results.push(await handleOne(gauge, now))
    } catch (err) {
      console.error("[orbit-endgame] gauge failed:", gauge.id, err)
    }
  }
  return results
}

async function handleOne(gauge: CandidateGauge, now: Date): Promise<EndgameResult> {
  // A promoted gauge already became a real event; nothing here should ever
  // touch it again. Checked ahead of everything else, including liveness,
  // because a gauge can be promoted (three yeses) at almost any point in its
  // life, live or not.
  if (gauge.event) {
    return { gaugeId: gauge.id, action: "skipped", reason: "promoted" }
  }
  // Already fully closed: the closure note was posted on a previous sweep.
  if (gauge.closureMessageId) {
    return { gaugeId: gauge.id, action: "skipped", reason: "already_closed_out" }
  }

  const timeZone = gauge.group.timeZone
  if (isGaugeLive(gauge, timeZone, now)) {
    return handleBump(gauge, timeZone, now)
  }
  return handleClose(gauge)
}

/** Local calendar day as a whole-number day count, for date-only diffing. */
function localDayNumber(parts: { year: number; month: number; day: number }): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day) / (24 * 60 * 60 * 1000)
}

async function handleBump(gauge: CandidateGauge, timeZone: string, now: Date): Promise<EndgameResult> {
  if (gauge.bumpMessageId) {
    return { gaugeId: gauge.id, action: "skipped", reason: "already_bumped" }
  }

  const nowParts = getLocalParts(now, timeZone)
  const proposedParts = getLocalParts(gauge.proposedDate, timeZone)
  const dayDiff = localDayNumber(proposedParts) - localDayNumber(nowParts)

  // More than a day out: an ordinary open gauge, nothing to report about the
  // bump specifically.
  if (dayDiff > 1) {
    return { gaugeId: gauge.id, action: "skipped", reason: "still_open" }
  }
  // Either the calendar eve but before the bump hour, or already the
  // proposed day itself (the eve has passed without a bump firing) — both
  // read as "not the eligible moment," distinct from "still open."
  if (!(dayDiff === 1 && nowParts.hour >= BUMP_LOCAL_HOUR)) {
    return { gaugeId: gauge.id, action: "skipped", reason: "not_the_eve" }
  }

  const createdParts = getLocalParts(gauge.createdAt, timeZone)
  const bornToday =
    createdParts.year === nowParts.year &&
    createdParts.month === nowParts.month &&
    createdParts.day === nowParts.day
  if (bornToday) {
    return { gaugeId: gauge.id, action: "skipped", reason: "born_today" }
  }

  const newest = await prisma.message.findFirst({
    where: { groupId: gauge.groupId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  })
  if (newest?.id === gauge.orbitMessageId) {
    return { gaugeId: gauge.id, action: "skipped", reason: "still_newest" }
  }

  const body = buildBumpMessage(gauge.activity, inVoterNames(gauge))

  const bumped = await prisma.$transaction(async (tx) => {
    // Re-read inside the transaction and re-check the marker rather than
    // trusting the outer snapshot: two overlapping sweeps (or a retried cron
    // invocation) racing on the same gauge must produce exactly one bump
    // message, and the unique bumpMessageId column is what makes the loser
    // discover it lost before it writes anything.
    const fresh = await tx.gauge.findUnique({
      where: { id: gauge.id },
      select: { bumpMessageId: true },
    })
    if (!fresh || fresh.bumpMessageId !== null) return false

    const message = await tx.message.create({
      data: { groupId: gauge.groupId, authorType: MessageAuthor.ORBIT, authorId: null, body },
    })
    await tx.gauge.update({
      where: { id: gauge.id },
      data: { bumpMessageId: message.id },
    })
    return true
  })

  if (!bumped) {
    return { gaugeId: gauge.id, action: "skipped", reason: "already_bumped" }
  }
  return { gaugeId: gauge.id, action: "bumped" }
}

async function handleClose(gauge: CandidateGauge): Promise<EndgameResult> {
  const memberVotes = memberFilteredVotes(gauge)

  if (countIn(memberVotes) < 1) {
    // No marker written: the coarse proposedDate window ages this gauge out
    // of every future sweep on its own once `now` moves past it, so there is
    // nothing to remember. Silence is the settled behavior, not a shortcut.
    return { gaugeId: gauge.id, action: "skipped", reason: "closed_silently" }
  }

  const body = buildClosureMessage(gauge.activity)

  const closed = await prisma.$transaction(async (tx) => {
    // Same re-read-inside-the-transaction guard as the bump path above.
    const fresh = await tx.gauge.findUnique({
      where: { id: gauge.id },
      select: { closureMessageId: true },
    })
    if (!fresh || fresh.closureMessageId !== null) return false

    const message = await tx.message.create({
      data: { groupId: gauge.groupId, authorType: MessageAuthor.ORBIT, authorId: null, body },
    })
    await tx.gauge.update({
      where: { id: gauge.id },
      data: { closureMessageId: message.id },
    })
    return true
  })

  if (!closed) {
    return { gaugeId: gauge.id, action: "skipped", reason: "already_closed_out" }
  }
  return { gaugeId: gauge.id, action: "closed_with_note" }
}

/** This gauge's votes, filtered to userIds who are still current members. */
function memberFilteredVotes(gauge: CandidateGauge) {
  const memberIds = new Set(gauge.group.memberships.map((m) => m.userId))
  return gauge.votes.filter((v) => memberIds.has(v.userId))
}

/**
 * Display names of the IN voters, member-filtered, in the order they voted.
 * Feeds buildBumpMessage directly, which only ever sees a live (below-bar)
 * gauge's votes here — 0 or 1 name at the three-person threshold, never the
 * 3+ that renders broken copy.
 */
function inVoterNames(gauge: CandidateGauge): string[] {
  const nameById = new Map(gauge.group.memberships.map((m) => [m.userId, m.user.name]))
  return memberFilteredVotes(gauge)
    .filter((v) => v.answer === "IN")
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((v) => nameById.get(v.userId))
    .filter((name): name is string => Boolean(name))
}
