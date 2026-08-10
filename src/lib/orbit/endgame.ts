// src/lib/orbit/endgame.ts
//
// The other end of a gauge's life: one bump the evening before its proposed
// day if it's still short of the bar, and one closing note if it never got
// there. Creation, votes, and promotion all live elsewhere; this is the sweep
// that lets an idea that stalled below three yeses die politely instead of
// lingering as a stale card forever.
//
// Called unscoped by the hourly cron sweep in production, exactly like
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
  buildRetryAskMessage,
  buildRetryGuessMessage,
  buildSuggestedRetryMessage,
  buildUrgencyClause,
  chooseRetryGuessDate,
  chooseSuggestedRetryDate,
  sparkStartInstant,
  BUMP_LOCAL_HOUR,
  CLOSE_BEFORE_START_HOURS,
  EVENING_TIME,
  SPARK_THRESHOLD,
} from "./spark-copy"
import { getLocalParts } from "./occurrence"
import { countIn, countNotThatDay, isRetryEligible } from "@/lib/gauges/threshold"
import { createGauge, createRetryGuessGauge } from "@/lib/gauges/create"

export type EndgameResult =
  | { gaugeId: string; action: "bumped" }
  | { gaugeId: string; action: "closed_with_note" }
  | { gaugeId: string; action: "asked" } // the day-blocked retry ask replaced the goodbye (Task 6)
  | { gaugeId: string; action: "guessed" } // the one retry guess, posted the evening after the ask (Task 7)
  | { gaugeId: string; action: "revived" } // the member-suggested revival replaced the ask (day-comment slice)
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
        // Lost the ask race (Task 6). No longer produced by the routing
        // branch below (Task 7 replaced that direct return with
        // handleGuess(...)), but handleAsk's own catch block still produces
        // it on a lost race — the concurrent-ask test asserts exactly that —
        // so this union member stays, with one of its two former sources gone.
        | "already_asked"
        // Asked, but not yet the guess moment (Task 7): still the failed day,
        // or the evening after but before BUMP_LOCAL_HOUR.
        | "awaiting_answer"
        // A same-activity gauge opened after the ask (Task 7): the group
        // moved on to a fresh proposal on their own, so the guess is moot.
        | "answered"
        // The one guess already exists for this original gauge (Task 7).
        | "already_guessed"
        // The suggested revival already exists for this naming message
        // (day-comment slice): the sourceMessageId unique constraint fired.
        | "already_revived"
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
  retryAskMessage: { select: { createdAt: true } },
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

  const timeZone = gauge.group.timeZone
  if (isGaugeLive(gauge, timeZone, now)) {
    return handleBump(gauge, timeZone, now)
  }

  // Closed from here down.
  if (gauge.retryAskMessageId) {
    return handleGuess(gauge, timeZone, now)
  }
  // Moved from ahead of the liveness check to here: behavior is identical
  // for every gauge the old order served. A closure-marked gauge is never
  // live, so it always reached this point either way. And re-entering
  // handleClose on an already-closed gauge is a no-op regardless of vote
  // count: at zero yeses it stays the existing silent no-op (no marker was
  // ever written, so there is nothing to re-check); at one or more yeses it
  // re-runs handleClose's transaction, whose conditional update
  // (`closureMessageId: null`) matches zero rows against the already-set
  // marker, so it throws AlreadyClosedInTx and rolls the new message back
  // out with no committed effect — this check catches that gauge first in
  // both orderings, so it never actually reaches that transaction to prove
  // it. The new order is what lets an asked gauge keep flowing to the guess
  // phase instead of being caught by this check first.
  if (gauge.closureMessageId) {
    return { gaugeId: gauge.id, action: "skipped", reason: "already_closed_out" }
  }
  // Retry eligibility runs BEFORE the closure outcomes (wrong-day-retry
  // decision 2), so a day-blocked gauge gets a second chance instead of the
  // goodbye, and instead of the zero-yes silence. Which second chance depends
  // on whether a member already named a better day mid-gauge (day-comment
  // slice, decision 4): a remembered day means revive now, on ANY gauge kind
  // including Orbit's own guess, because a member naming a day mid-gauge is
  // the human resetting the clock (day-comment decision 6). No remembered day
  // keeps the old flow: the ask for an ordinary gauge, the plain close for a
  // guess gauge, which never earns its own ask or guess (wrong-day-retry
  // decision 7). The guess check moved here from the top of the closed
  // section, which is what lets a guess gauge with a suggestion reach the
  // revival; a guess gauge never carries retryAskMessageId, so nothing else
  // about its routing changed.
  if (isRetryEligible(memberFilteredVotes(gauge))) {
    if (hasSuggestion(gauge)) return handleRevive(gauge, timeZone, now)
    if (gauge.retryGuessOfGaugeId) return handleClose(gauge)
    return handleAsk(gauge, timeZone)
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

/** Signals a lost retry-ask race; rolls the transaction back, never escapes this module. */
class AlreadyAskedInTx extends Error {}

/**
 * A day-blocked gauge's close: the retry ask replaces the goodbye. wantCount
 * is IN plus NOT_THAT_DAY, member-filtered, the same tally isRetryEligible
 * itself checked, so the sentence and the eligibility test can never
 * disagree about who counted.
 */
async function handleAsk(gauge: CandidateGauge, timeZone: string): Promise<EndgameResult> {
  const memberVotes = memberFilteredVotes(gauge)
  const wantCount = countIn(memberVotes) + countNotThatDay(memberVotes)
  const body = buildRetryAskMessage(gauge.activity, gauge.proposedDate, timeZone, wantCount)

  try {
    await prisma.$transaction(async (tx) => {
      // Create-then-conditionally-attach, exactly the bump path's guard
      // above (see its comment for why a read-then-branch-then-write re-read
      // does not actually close this race).
      const message = await tx.message.create({
        data: { groupId: gauge.groupId, authorType: MessageAuthor.ORBIT, authorId: null, body },
      })
      const updated = await tx.gauge.updateMany({
        where: { id: gauge.id, retryAskMessageId: null },
        data: { retryAskMessageId: message.id },
      })
      if (updated.count === 0) throw new AlreadyAskedInTx()
    })
  } catch (err) {
    if (err instanceof AlreadyAskedInTx) {
      return { gaugeId: gauge.id, action: "skipped", reason: "already_asked" }
    }
    throw err
  }

  return { gaugeId: gauge.id, action: "asked" }
}

/**
 * The one guess: fires the evening after the ask, on the failed gauge's own
 * clock. Anchored to the FAILED DAY, not the ask's send time (see the
 * dayDiff comment below), and cancelled the instant the group moves on to a
 * fresh same-activity proposal on their own.
 */
async function handleGuess(gauge: CandidateGauge, timeZone: string, now: Date): Promise<EndgameResult> {
  const existing = await prisma.gauge.findUnique({
    where: { retryGuessOfGaugeId: gauge.id },
    select: { id: true },
  })
  if (existing) return { gaugeId: gauge.id, action: "skipped", reason: "already_guessed" }

  // A broken retryAskMessage pointer degrades to waiting rather than
  // throwing: this path is only reached once retryAskMessageId is set, so
  // askCreatedAt should always be present, but a missing include or a
  // corrupted row should never crash the sweep over one gauge.
  const askCreatedAt = gauge.retryAskMessage?.createdAt
  if (!askCreatedAt) return { gaugeId: gauge.id, action: "skipped", reason: "awaiting_answer" }

  // "Answered" is activity-exact and deliberately literal-minded: a pivot to a
  // different activity does not cancel the guess, because the people who voted
  // voted for THIS activity (spec decision 6; recorded as a watch-item). An
  // Orbit guess is not the group answering, so guess gauges are excluded here
  // too: otherwise one guess gauge could suppress a second, unrelated guess
  // for the same activity, and a concurrent sweep could see its own sibling
  // guess and report "answered" instead of "already_guessed".
  const answered = await prisma.gauge.findFirst({
    where: {
      groupId: gauge.groupId,
      id: { not: gauge.id },
      activity: { equals: gauge.activity, mode: "insensitive" },
      createdAt: { gt: askCreatedAt },
      retryGuessOfGaugeId: null,
    },
    select: { id: true },
  })
  if (answered) return { gaugeId: gauge.id, action: "skipped", reason: "answered" }

  // The guess evening is anchored to the FAILED DAY, not the ask's send time:
  // the ask lands on the failed day whenever the sweep is healthy, and
  // anchoring here means a delayed ask can never push the guess past the
  // candidate window into silent death. Under a long outage the ask-to-guess
  // gap compresses; accepted, and the window ages the gauge out regardless.
  const nowParts = getLocalParts(now, timeZone)
  const dayDiff = localDayNumber(nowParts) - localDayNumber(getLocalParts(gauge.proposedDate, timeZone))
  if (dayDiff < 1 || (dayDiff === 1 && nowParts.hour < BUMP_LOCAL_HOUR)) {
    return { gaugeId: gauge.id, action: "skipped", reason: "awaiting_answer" }
  }

  const guessDate = chooseRetryGuessDate(gauge.proposedDate, timeZone)
  const res = await createRetryGuessGauge({
    groupId: gauge.groupId,
    originGaugeId: gauge.id,
    activity: gauge.activity,
    proposedDate: guessDate,
    proposedTime: gauge.proposedTime ?? EVENING_TIME,
    body: buildRetryGuessMessage(gauge.activity, guessDate, timeZone),
  })
  if (res.status === "skipped") return { gaugeId: gauge.id, action: "skipped", reason: "already_guessed" }
  return { gaugeId: gauge.id, action: "guessed" }
}

/**
 * All four suggestion fields present. A partially nulled row (the namer's
 * account or the naming message deleted, both SetNull relations) reads as no
 * suggestion at all, degrading to the ask rather than reviving on a day with
 * nobody attached to it.
 */
function hasSuggestion(gauge: CandidateGauge): gauge is CandidateGauge & {
  suggestedDayOfWeek: number
  suggestedByUserId: string
  suggestedMessageId: string
} {
  return (
    gauge.suggestedDayOfWeek !== null &&
    gauge.suggestedByUserId !== null &&
    gauge.suggestedMessageId !== null
  )
}

/**
 * A day-blocked close where a member already named a better day mid-gauge:
 * the revival replaces the ask (day-comment slice, decision 4). Orbit does not
 * ask a question a member already answered.
 *
 * It is a full-rights member gauge anchored to the naming message, so
 * createGauge's existing sourceMessageId unique constraint is the
 * cannot-revive-twice guard rather than a new mechanism, and the namer is
 * seeded IN because they named the day (decision 5). The time is the one the
 * comment stated if it stated one, otherwise the original gauge's own stored
 * time, carried and never re-derived.
 */
async function handleRevive(
  gauge: CandidateGauge & {
    suggestedDayOfWeek: number
    suggestedByUserId: string
    suggestedMessageId: string
  },
  timeZone: string,
  now: Date
): Promise<EndgameResult> {
  const revivalDate = chooseSuggestedRetryDate(gauge.proposedDate, gauge.suggestedDayOfWeek, timeZone)
  const timeLocal = gauge.suggestedTime ?? gauge.proposedTime ?? EVENING_TIME
  const start = sparkStartInstant(revivalDate, timeLocal, timeZone)
  // A sweep delayed past the named day must not open a gauge for a start
  // already gone. What it falls back to depends on whose move it was, the same
  // loop cap that granted the revival in the first place. A member's whole
  // contribution here is one specific day: on an ordinary gauge the generic ask
  // is still honest, because Orbit had an ask coming to it anyway. On one of
  // Orbit's own guess gauges it is not, because once that day has passed there
  // is no member-named revival left to carry full rights, and the ask would buy
  // Orbit two further moves (the ask, then a same-weekday-next-week guess) off
  // one human comment it could not honor. So this is not a special case bolted
  // on: a suggestion that can no longer be honored leaves a guess gauge exactly
  // where it stands with no suggestion at all, which is the plain terminal
  // close (wrong-day-retry decision 7, a guess gauge never earns its own ask or
  // guess; and anti-clutter, one fewer Orbit message on a dying idea).
  if (start.getTime() <= now.getTime()) {
    return gauge.retryGuessOfGaugeId ? handleClose(gauge) : handleAsk(gauge, timeZone)
  }
  const bornLate =
    now.getTime() >= start.getTime() - CLOSE_BEFORE_START_HOURS * 60 * 60 * 1000

  const res = await createGauge({
    groupId: gauge.groupId,
    sourceMessageId: gauge.suggestedMessageId,
    activity: gauge.activity,
    proposedDate: revivalDate,
    proposedTime: timeLocal,
    body:
      buildSuggestedRetryMessage(gauge.activity, gauge.proposedDate, revivalDate, timeZone) +
      (bornLate ? buildUrgencyClause(timeLocal) : ""),
    initiatorUserId: gauge.suggestedByUserId,
  })
  if (res.status !== "created") {
    return { gaugeId: gauge.id, action: "skipped", reason: "already_revived" }
  }
  return { gaugeId: gauge.id, action: "revived" }
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
