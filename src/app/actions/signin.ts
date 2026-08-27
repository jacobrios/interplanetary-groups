"use server"

// The two writes behind /signin: the way back in for somebody who does not
// have an invite link to hand.
//
// The invite screen's own sign-in panel (join-signin.ts) covers the person who
// still has the link. This covers everyone else: the member who cleared their
// cookies, moved from phone to laptop, or simply never kept the link, and who
// would otherwise be made into a second copy of themselves the next time they
// got in. It is also where the "that email is already on an account" message
// on the attach flow points, so the sentence has a door behind it.
//
// Both calls are thin over src/lib/auth/email.ts, which is the one place the
// app talks to Supabase about email and the only place a raw service reply is
// ever read. Nothing here branches on anything but that seam's normalized
// results.

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import {
  requestSignInCode,
  confirmSignInCode,
  type SignInRequestResult,
} from "@/lib/auth/email"

/**
 * Everything that can go wrong after a code is submitted. All three come
 * straight from the auth seam; unlike the invite screen's version there is no
 * `join_failed`, because this route joins nothing. It signs a person in and
 * lets the front door work out where they belong.
 */
export type ConfirmSignInActionResult = "bad_code" | "no_user" | "service_error"

/**
 * One place for both ways the sign-out can fail, because the sentence they
 * both earn is the same one and it is not a small sentence: the session cookie
 * for an identity nothing in the app can resolve is still in this browser, and
 * the next thing this person does will be done as that identity.
 */
function logSignOutFailure(cause: unknown) {
  console.error(
    "[signin] could not sign out an unresolvable session, so the orphan cookie is still live:",
    cause
  )
}

/**
 * Step one: ask Supabase to send a code to somebody the product already knows.
 *
 * Deliberately has no session guard, and cannot have one: the usual caller has
 * no session and cannot get one any other way. The cost, carried knowingly and
 * unchanged from the invite screen's copy of this problem: this is an
 * unauthenticated endpoint that triggers outbound mail, and its only ceiling is
 * Supabase's own rate limit, which the task 1 spike read but never exercised.
 * Recorded as debt in the task 8 report rather than answered with a throttle
 * invented here.
 */
export async function requestSignInCodeAction(
  email: string
): Promise<{ result: SignInRequestResult }> {
  const outcome = await requestSignInCode(email)

  // The one classified outcome this file logs, against the auth seam's own
  // rule that a classified result is a product state rather than an incident
  // (email.ts, logServiceFailure). That rule is right everywhere else and
  // wrong here, for a reason specific to this endpoint: it is unauthenticated
  // and uncapped, so Supabase's rate limit is the entire abuse ceiling, and a
  // script burning the mail allowance would take sign-in down for everybody
  // and leave no trace anywhere that anything had happened. warn rather than
  // error, because one member tapping resend too fast reaches this too and
  // that is not an incident; what makes it useful is the shape in the log
  // rather than any single line.
  if (outcome.result === "rate_limited") {
    console.warn(
      "[signin] a sign-in code was refused by the mail rate limit; if this is not isolated, sign-in is down for everybody"
    )
  }

  return outcome
}

/**
 * Step two: confirm the code, then hand the person to the front door.
 *
 * Redirects on success and therefore returns only on failure. redirect()
 * throws NEXT_REDIRECT internally, so it is called outside and after every
 * try/catch, the same rule join-group.ts and join-signin.ts already follow.
 *
 * Where they land, and why "/" rather than a group: this route knows nothing
 * about which group anyone came for, and a person may belong to several. The
 * front door already resolves that question (src/lib/nav/front-door.ts) and is
 * the seat being held for the multi-group home, so sending them there means
 * this file never has to be revisited when that lands. Somebody who belongs to
 * no group at all sees the pitch, which is honest: they are signed in, and
 * there is nothing else to show them.
 *
 * Succeeding while somebody was already signed in as a different person is a
 * real case rather than an edge one, and it is deliberately allowed: it is the
 * exact path a member takes from "that email is already on an account", where
 * the session they are holding is the duplicate and the identity they are
 * signing into is themselves. verifyOtp replaces the session cookie, so they
 * come out as the original. The duplicate's own membership and rows are left
 * alone; merging two identities is not this slice's, and nothing here makes it
 * harder later.
 */
export async function confirmSignInAction(
  email: string,
  code: string
): Promise<{ result: ConfirmSignInActionResult }> {
  const outcome = await confirmSignInCode(email, code)

  if (outcome.result !== "ok") {
    // The caller decision the auth seam refuses to make for us. By the time
    // no_user comes back, verifyOtp has already written a live session cookie
    // for an identity no User row points at, and the seam leaves it alone on
    // purpose.
    //
    // We sign it back out, which is the same answer the invite screen reached,
    // but only half of its reasoning survives here and it is worth saying which
    // half. That screen could argue nothing was at stake, because it only ever
    // renders for a visitor the app already resolved to nobody. This route is
    // public and a signed-in person can reach it, so a real session may indeed
    // be gone. It is gone either way: verifyOtp overwrote the cookie before we
    // were given the outcome, and nothing here can put the old one back. So the
    // question is only what to leave behind, and an orphan is strictly worse
    // than a clean signed-out state: getCurrentUser() reads it as nobody while
    // joinGroupAction reads it as a session and skips signInAnonymously, which
    // would weld the next join onto the one identity we already could not
    // account for. That is the split-brain state where a later bug has no
    // honest explanation.
    if (outcome.result === "no_user") {
      try {
        const supabase = await createClient()
        // Both ways this can fail are handled, because they are not the same
        // way. signOut REPORTS a service failure in its return value rather
        // than throwing it: on a non-404/401/403 API error, and on a network
        // failure, GoTrueClient returns { error } before it ever clears the
        // session. So a try/catch on its own would let the failure that
        // matters most pass in silence, leaving the orphan cookie live and
        // unmentioned, which is precisely the state the block above argues is
        // strictly worse than anything else on offer. The catch still earns
        // its place: createClient() itself can throw.
        const { error } = await supabase.auth.signOut()
        if (error) logSignOutFailure(error)
      } catch (err) {
        logSignOutFailure(err)
      }
    }
    return { result: outcome.result }
  }

  redirect("/")
}
