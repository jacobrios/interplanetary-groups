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
import {
  isGaugeLive,
  buildBumpMessage,
  buildClosureMessage,
  BUMP_LOCAL_HOUR,
  SPARK_THRESHOLD,
} from "./spark-copy"
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
        // Deliberate extension beyond the brief's original union (code
        // review, 2026-08-04): a gauge can hold 3+ member-filtered IN votes
        // with no linked event — a promotion attempt that committed the
        // votes but rolled back the event creation. That gauge's problem is
        // a missed promotion, not a missing bump, so it gets its own reason
        // rather than silently reusing "still_newest" or another guard.
        | "already_at_bar"
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

  // Defensive, not expected in the normal flow: a gauge is promoted the
  // instant its third member IN vote lands, so a live, non-promoted gauge
  // should never hold 3+. It can, though, if a promotion attempt committed
  // the votes but rolled back the event (a transiently failed
  // promoteGaugeToEvent call) — and buildBumpMessage renders broken copy at
  // 3+ names, so this has to be caught before composing the body, not after.
  const memberVotes = memberFilteredVotes(gauge)
  if (countIn(memberVotes) >= SPARK_THRESHOLD) {
    return { gaugeId: gauge.id, action: "skipped", reason: "already_at_bar" }
  }

  const body = buildBumpMessage(gauge.activity, inVoterNames(gauge))

  try {
    await prisma.$transaction(async (tx) => {
      // Create first, then conditionally attach. The obvious-looking
      // alternative — re-read bumpMessageId inside the tx, branch in
      // application code, then write — does NOT close the race: under READ
      // COMMITTED, two overlapping sweeps can both re-read the marker as
      // null, both create their own (different) message, and both plain
      // updates then succeed, because neither's WHERE clause depends on the
      // marker. The unique constraint on bumpMessageId never fires either,
      // since the two racers are writing two different message ids into two
      // different rows' worth of intent — nothing about a unique column stops
      // two message rows from existing.
      //
      // The actual guard is the UPDATE's WHERE clause: `bumpMessageId: null`
      // is checked against the row's state AT UPDATE TIME (after acquiring
      // its row lock, once any earlier transaction holding that lock has
      // committed), not at an earlier read. The loser's updateMany blocks on
      // the winner's row lock, then reevaluates the WHERE against the
      // winner's now-committed write, matches zero rows, and throws to roll
      // its own orphaned message back out.
      const message = await tx.message.create({
        data: { groupId: gauge.groupId, authorType: MessageAuthor.ORBIT, authorId: null, body },
      })
      const updated = await tx.gauge.updateMany({
        where: { id: gauge.id, bumpMessageId: null },
        data: { bumpMessageId: message.id },
      })
      if (updated.count === 0) throw new AlreadyBumpedInTx()
    })
  } catch (err) {
    if (err instanceof AlreadyBumpedInTx) {
      return { gaugeId: gauge.id, action: "skipped", reason: "already_bumped" }
    }
    throw err
  }

  return { gaugeId: gauge.id, action: "bumped" }
}

/** Signals a lost bump race; rolls the transaction back, never escapes this module. */
class AlreadyBumpedInTx extends Error {}

/** Signals a lost closure race; rolls the transaction back, never escapes this module. */
class AlreadyClosedInTx extends Error {}

async function handleClose(gauge: CandidateGauge): Promise<EndgameResult> {
  const memberVotes = memberFilteredVotes(gauge)

  if (countIn(memberVotes) < 1) {
    // No marker written: the coarse proposedDate window ages this gauge out
    // of every future sweep on its own once `now` moves past it, so there is
    // nothing to remember. Silence is the settled behavior, not a shortcut.
    return { gaugeId: gauge.id, action: "skipped", reason: "closed_silently" }
  }

  const body = buildClosureMessage(gauge.activity)

  try {
    await prisma.$transaction(async (tx) => {
      // Same create-then-conditionally-attach guard as the bump path above,
      // and the same reason a read-then-branch-then-write re-read does not
      // actually close the race: the WHERE clause on the update, not an
      // earlier read, is what makes the loser's write match zero rows once
      // the winner has committed.
      const message = await tx.message.create({
        data: { groupId: gauge.groupId, authorType: MessageAuthor.ORBIT, authorId: null, body },
      })
      const updated = await tx.gauge.updateMany({
        where: { id: gauge.id, closureMessageId: null },
        data: { closureMessageId: message.id },
      })
      if (updated.count === 0) throw new AlreadyClosedInTx()
    })
  } catch (err) {
    if (err instanceof AlreadyClosedInTx) {
      return { gaugeId: gauge.id, action: "skipped", reason: "already_closed_out" }
    }
    throw err
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
 * Feeds buildBumpMessage directly. Only ever called after the
 * already_at_bar guard above, so this always resolves to 0-2 names — never
 * the 3+ that renders broken copy.
 */
function inVoterNames(gauge: CandidateGauge): string[] {
  const nameById = new Map(gauge.group.memberships.map((m) => [m.userId, m.user.name]))
  return memberFilteredVotes(gauge)
    .filter((v) => v.answer === "IN")
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((v) => nameById.get(v.userId))
    .filter((name): name is string => Boolean(name))
}
