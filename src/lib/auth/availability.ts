// src/lib/auth/availability.ts
//
// The claim-to-fact boundary for a Supabase auth reply, the same species as
// src/lib/auth/email.ts (CLAUDE.md already calls that file the stronger of
// the project's two claim-to-fact boundaries). getUser()'s raw
// { data, error } pair is a claim about what Supabase's auth server just
// said, not yet a fact about the member: today's code
// (src/lib/auth/current-user.ts) reads only `data.user` and drops `error`
// entirely, so a network blip or a Supabase outage looks EXACTLY like "this
// visitor has no session," and a signed-in member is logged out silently.
// classifyAuthReply is where that raw reply becomes one of three named
// outcomes. It has exactly two consumers today, current-user.ts (task 2) and
// the health probe (task 3), so a future caller has somewhere to go instead
// of repeating the current-user.ts mistake by reaching past this module into
// the raw reply. That is a claim about this module's two callers, not about
// the raw reply's readers generally: twelve other call sites still read a
// raw getUser() reply directly; `grep -rn "auth\.getUser(" src` finds them,
// eleven in src/app/actions plus src/lib/supabase/proxy-session.ts, and this
// slice's own non-goals list them as real and deliberately unmigrated. That
// is NOT the twelve-item list in check.ts's "NO `select`" comment, which is
// a different set entirely (unselected whole-User Prisma reads); both happen
// to number twelve, so a reader sent there would find a list of the right
// length full of the wrong files.
//
// Why a separate module rather than a helper inside current-user.ts: the
// health probe (task 3 of this slice) needs to classify a getUser() reply
// exactly the same way the product does, and a probe that disagrees with the
// product about what "down" means is worse than no probe at all. Both
// current-user.ts (task 2) and the health probe import this module rather
// than each growing their own reading of the same reply.
//
// describeError is imported from src/lib/errors/describe-error.ts, not from
// src/lib/health/check.ts (which re-exports it and originated it): pulling
// the health module into auth would have dragged this file's dependency
// graph through health/check.ts's own imports (findUpcomingEvents,
// findLiveGauges, findLiveProposals, loadEmailAskInputs) merely to format an
// error string, which reads backwards for a module every signed-in request
// goes through. describeError was moved to that neutral module as part of
// this task rather than duplicated; see that file's header for the full
// reasoning.

import {
  isAuthRetryableFetchError,
  type AuthError,
  type User as SupabaseUser,
} from "@supabase/auth-js"
import { describeError } from "@/lib/errors/describe-error"

export type AuthOutcome =
  | { kind: "signed-in"; user: SupabaseUser }
  | { kind: "signed-out" }
  | { kind: "unavailable"; detail: string }

/**
 * Thrown by callers (task 2) when classifyAuthReply reads a reply as
 * "unavailable" and the caller's contract is to throw rather than return.
 * Named so a future reader, and the Vercel log drain, can both recognise it
 * by name rather than by matching a string.
 */
export class AuthUnavailableError extends Error {
  constructor(detail: string) {
    super(`Supabase auth is unavailable: ${detail}`)
    this.name = "AuthUnavailableError"
  }
}

/**
 * Classify a raw getUser() reply into exactly one of three outcomes.
 *
 * Order matters and is the whole point:
 *
 * 1. A present `data.user` is signed-in, whatever `error` says. supabase-js
 *    never sets both on the same reply, but reading `user` first means a
 *    future change to that guarantee still fails toward the safer outcome.
 * 2. isAuthRetryableFetchError(reply.error) is unavailable: a network
 *    failure or a 5xx from Supabase's own server, per auth-js's
 *    AuthRetryableFetchError. Imported from @supabase/auth-js rather than
 *    reimplemented against `error.name`, because the library owns that
 *    string and a hand-rolled check would silently stop matching the moment
 *    auth-js renames or restructures its own error class.
 * 3. Everything else is signed-out, unchanged from today's behaviour: no
 *    session (AuthSessionMissingError), a rejected credential
 *    (AuthApiError 401/403), or no error and no user at all.
 */
export function classifyAuthReply(reply: {
  data: { user: SupabaseUser | null }
  error: AuthError | null
}): AuthOutcome {
  if (reply.data.user) {
    return { kind: "signed-in", user: reply.data.user }
  }

  if (isAuthRetryableFetchError(reply.error)) {
    return { kind: "unavailable", detail: describeError(reply.error) }
  }

  return { kind: "signed-out" }
}
