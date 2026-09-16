// src/lib/errors/describe-error.ts
//
// A neutral home for describeError, moved out of src/lib/health/check.ts on
// 15 Sept 2026 (the supabase-auth-soft-fail slice, task 1) the moment a
// second caller needed it. src/lib/auth/availability.ts classifies a
// Supabase auth reply and needs the same "turn a thrown value into a safe
// log string" behaviour health/check.ts already had, and importing
// health/check.ts from auth would have read backwards: that file also pulls
// in findUpcomingEvents, findLiveGauges, findLiveProposals and
// loadEmailAskInputs to build its probe list, none of which describeError
// has anything to do with, and none of which a hot path like
// getCurrentUser() should depend on just to format an error. health/check.ts
// re-exports describeError so its own two existing callers
// (src/app/api/cron/orbit/route.ts and its own test file) are untouched.
//
// Nothing here writes and nothing here is specific to health probes or to
// Supabase: it is a general-purpose "make a thrown value safe and short
// enough to log" boundary, usable by any caller that needs to turn `unknown`
// into a string without leaking a row's contents into a log line.

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
 * Turn a thrown value into a short, size-bounded string safe to put in a log
 * line: Better Stack for a health probe's failure, or console.error for a
 * classified Supabase auth failure. Either caller gets the same guarantee.
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
