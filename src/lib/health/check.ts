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
import { describeError } from "@/lib/errors/describe-error"
import { createClient } from "@/lib/supabase/server"
import { classifyAuthReply, AuthUnavailableError } from "@/lib/auth/availability"

// describeError itself now lives in src/lib/errors/describe-error.ts (moved
// there 15 Sept 2026, supabase-auth-soft-fail slice, task 1) because
// src/lib/auth/availability.ts needed the same "safe, size-bounded string
// from a thrown value" boundary, and importing this file into auth would
// have pulled the whole probe list's dependencies (events, gauges,
// proposals, email-ask) backwards into a hot auth path just to format an
// error. Re-exported below so this file's own two existing callers (the
// cron route further down and this file's test suite) are unaffected by
// the move.
export { describeError }

export type HealthStep =
  | "user_row"
  | "membership_row"
  | "group_home_data"
  | "supabase_auth"
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

/**
 * The one thing the supabase_auth probe touches on a Supabase client.
 * Narrower than the real SupabaseClient type on purpose: it is written as
 * `Parameters<typeof classifyAuthReply>[0]` rather than importing AuthError
 * and the Supabase User type directly, so this stays in lockstep with
 * whatever classifyAuthReply actually accepts instead of a hand-copied
 * duplicate that can drift from it. This narrowness is also what lets
 * scripts/qa-health.ts (task 4, --break-auth) hand the probe a client
 * pointed at a closed port without constructing a real SupabaseClient.
 */
type SupabaseClientLike = {
  auth: {
    getUser: (jwt?: string) => Promise<Parameters<typeof classifyAuthReply>[0]>
  }
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
 * test for these must mock Prisma (or, for supabase_auth, mock the Supabase
 * client), and mocking either one removes the only thing being checked:
 * whether the real query, or the real auth request, still reaches the real
 * service. The message-send-latency slice already paid for this lesson,
 * where a component test passed against mocked server actions while the
 * browser disagreed, and the test was deleted rather than kept. The evidence
 * for the Prisma probes is scripts/qa-health.ts, run against a real
 * database; the evidence for supabase_auth is the same script's
 * --break-auth flag (task 4), run against the real Supabase project.
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
 *
 *                NONE OF THIS COVERS supabase_auth. That probe never touches
 *                `client` at all, and `--break`'s broken-database run never
 *                reaches it: runHealthCheck stops at the first failure, so
 *                `--break` fails at user_row and supabase_auth never runs.
 *                The only route to supabase_auth's own failure path is
 *                `--break-auth` (task 4) run against a HEALTHY database,
 *                where user_row, membership_row and group_home_data all
 *                PASS and execution reaches this probe last, which is then
 *                the one made to fail. See the `makeSupabase` parameter
 *                below for that probe's own injection seam.
 *
 * @param makeSupabase  A factory, not a client instance, and that shape is
 *                deliberate: src/lib/supabase/server.ts's real createClient()
 *                is async and reads request cookies via next/headers, so it
 *                cannot be produced once and reused the way `client` is.
 *                Keeping realProbes(now) callable with no third argument
 *                everywhere it already is (this file's own default, the cron
 *                route, scripts/qa-health.ts's healthy path) is why the
 *                default is the real factory rather than something already
 *                invoked. scripts/qa-health.ts --break-auth (task 4) passes a
 *                factory that resolves to a client aimed at a closed port.
 */
export function realProbes(
  now: Date,
  client: PrismaClient = prisma,
  makeSupabase: () => Promise<SupabaseClientLike> = createClient
): Probe[] {
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
    {
      name: "supabase_auth",
      run: () => probeSupabaseAuth(makeSupabase),
    },
  ]
}

/** A JWT-shaped string, never issued by anything real. */
const THROWAWAY_JWT = "orbit-health-probe.not-a-real-session.unsigned"

/**
 * Prove that Supabase's auth server itself is up and answering, which
 * nothing else in this file, or anywhere else the cron touches, checks.
 *
 * THIS IS THE WHOLE REASON FOR THE JWT ARGUMENT, so read this before
 * "simplifying" it to a bare `getUser()`. The cron has no request, so it has
 * no cookies, so a bare `supabase.auth.getUser()` here would run in exactly
 * the cookie-less context a real cron invocation has. Verified directly
 * against @supabase/auth-js 2.108.2's GoTrueClient.js: with no session,
 * `_getUser` finds no `data.session?.access_token`, and its `_useSession`
 * branch returns `{ data: { user: null }, error: new AuthSessionMissingError() }`
 * BEFORE calling `_request` at all. No network call happens. That probe
 * would read green with Supabase's auth server completely unreachable,
 * which is precisely the four-day-outage shape this whole file exists to
 * catch, one layer over. Passing ANY truthy jwt string takes `_getUser`'s
 * other branch, which calls `_request` unconditionally, so the probe always
 * makes a real request over the network.
 *
 * The token is deliberately fake and unsigned, and that is fine: a rejected
 * token still proves the service answered. classifyAuthReply reads that
 * rejection as "signed-out" (a 401/403 AuthApiError, the same bucket as an
 * expired or forged cookie), not "unavailable" (a network failure or a 5xx,
 * per isAuthRetryableFetchError). Only "unavailable" fails this probe;
 * "signed-in" (which a throwaway token will never produce) would pass too,
 * for the same reason.
 */
async function probeSupabaseAuth(
  makeSupabase: () => Promise<SupabaseClientLike>
): Promise<void> {
  const supabase = await makeSupabase()
  const reply = await supabase.auth.getUser(THROWAWAY_JWT)
  const outcome = classifyAuthReply(reply)

  if (outcome.kind === "unavailable") {
    throw new AuthUnavailableError(outcome.detail)
  }
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
