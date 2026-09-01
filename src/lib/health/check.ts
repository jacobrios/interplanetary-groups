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

/**
 * Turn a thrown value into the string that gets sent to Better Stack.
 *
 * This is a privacy boundary, not a formatting helper. It carries the error's
 * class and message and nothing else: never a query result, never a row. It
 * is not an absolute guarantee, and the caveat is the same one
 * src/lib/email/send.ts already carries for Resend: a Prisma
 * unique-constraint error can echo an offending value into its own message.
 * Our code never puts a value into this string itself; the residual risk
 * lives entirely in the database driver's own error text.
 */
export function describeError(err: unknown): string {
  const name = err instanceof Error ? err.constructor.name : typeof err
  const message = err instanceof Error ? err.message : String(err)
  return `${name}: ${message}`.slice(0, DETAIL_MAX)
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
  probes: Probe[]
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
