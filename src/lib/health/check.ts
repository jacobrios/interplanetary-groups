// src/lib/health/check.ts
//
// The product's answer to a question it could not answer for four days in
// August 2026: is the app actually working for a signed-in member?
//
// The shape of that outage is what this file is built around. A logged-out
// visitor saw a healthy site the entire time, because getCurrentUser()
// (src/lib/auth/current-user.ts:20) returns early before its database call
// when there is no session. A member reached that call on every page, where
// an unselected `User` read named a column two missing migrations had never
// created. So an uptime ping would have read green for four days.
//
// Nothing here writes. Every probe is a read, deliberately, so this is safe
// to run against a database somebody else is testing against.

import { PrismaClient } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { findUpcomingEvents } from "@/lib/events/upcoming-list"
import { findLiveGauges } from "@/lib/gauges/read"
import { findLiveProposals } from "@/lib/proposals/read"
import { loadEmailAskInputs } from "@/lib/auth/email-ask"
import { CARD_REGION_CAP } from "@/lib/cards/region"

export type HealthStep =
  | "user_row"
  | "membership_row"
  | "group_home_data"
  /** Produced by the cron route when the sweeps themselves throw, never by a
   *  probe. One vocabulary for both, so the heartbeat body reads the same way
   *  whatever failed. */
  | "orbit_sweeps"

export type HealthVerdict =
  | { ok: true; ranSteps: HealthStep[]; skipped: HealthStep[] }
  | { ok: false; failedStep: HealthStep; detail: string }

export interface Probe {
  name: HealthStep
  /** Resolves when healthy. Resolves to "skip" when there is nothing to check. */
  run: () => Promise<void | "skip">
}

const DETAIL_MAX = 500

/** Marks where the middle of an over-long detail was cut out. */
const ELISION = " [...] "

/**
 * The error's own short code, when it has one that is safe to send.
 *
 * Prisma sets `code` on its known-request errors (`P2022` for a missing
 * column, the outage of 28-31 August 2026; `P1001` for a server it cannot
 * reach). It is the single most diagnostic thing in the whole error and it
 * is structurally incapable of carrying a row value, which is why it clears
 * the privacy boundary below.
 *
 * The thrown value is `unknown`, so this narrows rather than casting: a
 * numeric `code` (Node's older system errors) is not a code for our purposes.
 */
function errorCode(err: unknown): string | null {
  if (typeof err !== "object" || err === null) return null
  const code = (err as { code?: unknown }).code
  return typeof code === "string" && code.length > 0 ? code : null
}

/**
 * Turn a thrown value into the string that gets sent to Better Stack.
 *
 * This is a privacy boundary, not a formatting helper. It carries the error's
 * class, its code, and its message, and nothing else: never a query result,
 * never a row. It is not an absolute guarantee, and the caveat is the same
 * one src/lib/email/send.ts already carries for Resend: a Prisma
 * unique-constraint error can echo an offending value into its own message.
 * Our code never puts a value into this string itself; the residual risk
 * lives entirely in the database driver's own error text.
 */
export function describeError(err: unknown): string {
  const name = err instanceof Error ? err.constructor.name : typeof err
  const code = errorCode(err)
  const head = code === null ? name : `${name} [${code}]`
  let message: string
  try {
    message = err instanceof Error ? err.message : String(err)
  } catch {
    // A value with no prototype or toString/valueOf/Symbol.toPrimitive throws
    // during String(). Callers treat this function as total, and a monitor
    // that throws while describing a failure reports the outage as silence.
    message = "(a value that could not be converted to text)"
  }
  return truncateBothEnds(`${head}: ${message}`)
}

/**
 * Trim to DETAIL_MAX by removing the MIDDLE, never the tail.
 *
 * WHY BOTH ENDS, and this is the whole point rather than a refinement. A
 * Prisma error opens with a code frame: the class name, an "Invalid
 * `client.user.findFirst()` invocation in" line, an absolute file path, a
 * blank line, and several lines of THIS FILE'S OWN COMMENTS quoted back at
 * us. On the real --break output that preamble was 459 of the first 500
 * characters. The diagnosis, the sentence naming the missing column or the
 * unreachable host, is at the very END. Keeping the head therefore keeps our
 * own source comments and throws away the only sentence the owner needs at
 * 3am, and it did: the cause survived by about nine characters purely
 * because the comments above happened to be that length. A longer production
 * path, a minified chunk, or anybody editing those comments would have
 * pushed it off the end with nothing anywhere saying so.
 *
 * The result still lands at exactly DETAIL_MAX when it has to trim, so the
 * budget this function exists to enforce is unchanged.
 */
function truncateBothEnds(s: string): string {
  if (s.length <= DETAIL_MAX) return s
  const keep = DETAIL_MAX - ELISION.length
  const headLen = Math.ceil(keep / 2)
  const tailLen = keep - headLen
  return s.slice(0, headLen) + ELISION + s.slice(s.length - tailLen)
}

/**
 * Run probes in order, stopping at the first failure.
 *
 * Order is load-bearing: user_row is the cheapest and the most diagnostic, so
 * a schema break names itself instead of surfacing three probes later as a
 * confusing group-data failure.
 *
 * This function never throws. A monitoring tool that can crash is worse than
 * no monitoring tool, because its silence reads as health.
 *
 * @param now  The reference instant, passed explicitly so callers own the
 *             clock, matching runDailyDigest and reconcileScheduledEvents.
 */
export async function runHealthCheck(
  now: Date,
  probes: Probe[] = realProbes(now)
): Promise<HealthVerdict> {
  const ranSteps: HealthStep[] = []
  const skipped: HealthStep[] = []

  for (const probe of probes) {
    try {
      const outcome = await probe.run()
      if (outcome === "skip") skipped.push(probe.name)
      else ranSteps.push(probe.name)
    } catch (err) {
      return { ok: false, failedStep: probe.name, detail: describeError(err) }
    }
  }

  return { ok: true, ranSteps, skipped }
}

/**
 * The probes, in the order they run.
 *
 * DELIBERATELY UNTESTED, and this is a decision rather than an omission. A
 * test for these must mock Prisma, and mocking Prisma removes the only thing
 * being checked: whether the real query still matches the real database.
 * The message-send-latency slice already paid for this lesson, where a
 * component test passed against mocked server actions while the browser
 * disagreed, and the test was deleted rather than kept. The evidence for
 * this function is scripts/qa-health.ts, run against a real database.
 *
 * @param client  Injectable so scripts/qa-health.ts --break can point the
 *                probes at an unreachable database and prove the failure
 *                path without damaging a real one.
 *
 *                THE INJECTION IS PARTIAL, and that is a limit rather than a
 *                bug only because of where --break stops. Probes 1 and 2 and
 *                the direct client.* calls inside probeGroupHomeData honour
 *                it; findUpcomingEvents, findLiveGauges, findLiveProposals
 *                and loadEmailAskInputs each reach for the module singleton
 *                in src/lib/prisma.ts and cannot be redirected. It works
 *                today because --break fails at the first probe and never
 *                reaches them. A future --break variant that skips ahead to
 *                group_home_data would quietly test the real database.
 */
export function realProbes(now: Date, client: PrismaClient = prisma): Probe[] {
  return [
    {
      name: "user_row",
      run: async () => {
        // NO `select`, NO `include`. THIS IS LOAD-BEARING.
        //
        // Adding a select here silently disables the only check that would
        // have caught the four-day outage of 28-31 August 2026. The whole
        // point is that this query names every column on User, exactly as
        // getCurrentUser() does at src/lib/auth/current-user.ts:20 and as
        // EVERY OTHER UNSELECTED WHOLE-`User` READ IN THE CODEBASE does
        // independently. One probe covers all of them, because they are the
        // same query shape.
        //
        // Deliberately uncounted. An earlier version of this comment said
        // "four other call sites" and named rsvp.ts:43 in a list of
        // src/app/actions paths, which reads as src/app/actions/rsvp.ts, a
        // file with no user.find call at all; the real site is
        // src/lib/events/rsvp.ts:43. There were twelve others, not four, on
        // 1 September 2026 (current-user.ts:20; app/actions gauge-vote.ts:73,
        // proposal-vote.ts:62, proposal-answer.ts:51; lib auth/email.ts:258
        // and :393, groups/join.ts:45, provision.ts:49, leave.ts:25,
        // remove-member.ts:26, reset-invite.ts:27, gauges/vote.ts:40,
        // events/rsvp.ts:43). A number here goes stale the day somebody adds
        // a thirteenth, and nothing would say so, so the rule is stated
        // instead of counted. To re-derive the list:
        //   grep -rn 'user\.find' src --include='*.ts' --include='*.tsx'
        // then drop the ones taking a `select` (both reads in
        // lib/email/unsubscribe.ts do, so neither is covered by this probe).
        //
        // A null result is HEALTHY. The SQL still ran and still named every
        // column, which is what is being proven. An empty table is not
        // evidence of breakage, and a probe must never invent an alarm.
        await client.user.findFirst()
      },
    },
    {
      name: "membership_row",
      run: async () => {
        // Same rules, same reasoning: the other missing migration
        // (lastSeenAt, lastDigestSentAt) landed on this table.
        await client.membership.findFirst()
      },
    },
    {
      name: "group_home_data",
      run: () => probeGroupHomeData(now, client),
    },
  ]
}

/**
 * Exercise the group home's own database reads against the most recently
 * active group.
 *
 * Most recently active means the group holding the newest message. Chosen
 * over a pinned group id because it always exercises something real, needs
 * no configuration, and cannot break when a group is deleted.
 *
 * The library functions are CALLED, not copied. That is the point: if the
 * group home changes and this does not, the build breaks loudly rather than
 * this check going quietly stale.
 *
 * Pure functions the page also uses (deriveRoster, deriveIdeaItems,
 * composeCardRegion) are deliberately absent. They touch no database, so
 * they cannot break from schema drift, and the Vercel log drain watching for
 * real 500s is what covers them.
 */
async function probeGroupHomeData(
  now: Date,
  client: PrismaClient
): Promise<void | "skip"> {
  const newest = await client.message.findFirst({
    orderBy: { createdAt: "desc" },
    select: { groupId: true },
  })
  const groupId =
    newest?.groupId ?? (await client.group.findFirst({ select: { id: true } }))?.id

  // An empty database is not a broken one.
  if (!groupId) return "skip"

  const group = await client.group.findUnique({
    where: { id: groupId },
    include: { memberships: { include: { user: true }, orderBy: { joinedAt: "asc" } } },
  })
  if (!group) return "skip"

  const events = await findUpcomingEvents(group.id, now, CARD_REGION_CAP)
  if (events[0]) {
    await client.rsvp.findMany({ where: { eventId: events[0].id } })
  }

  // One deliberate divergence from the page, and it needs saying: the page's
  // message read is unbounded, this one takes 50. That unboundedness is
  // registered debt (message-send-latency slice two) and re-running it every
  // hour would compound a known problem. The column set and the author join
  // are identical, and columns are what this probe proves.
  await client.message.findMany({
    where: { groupId: group.id },
    orderBy: { createdAt: "asc" },
    include: { author: true },
    take: 50,
  })

  await findLiveGauges(group.id, now)
  await findLiveProposals(group.id, now)

  const firstMember = group.memberships[0]
  if (firstMember) {
    await loadEmailAskInputs({ userId: firstMember.userId, groupId: group.id })
  }
}
