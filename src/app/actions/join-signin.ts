"use server"

// The two writes behind "I've been here before" on the invite screen.
//
// This is the seam where the slice's whole bug gets closed. Until now an
// invite link tapped without a session unconditionally manufactured a brand
// new person, so a member who cleared their cookies or moved from phone to
// laptop rejoined as a second member and every count quietly stopped being
// true. These two calls are what lets somebody say "that was me" before any
// account is created.
//
// Both are thin over src/lib/auth/email.ts, which is the one place the app
// talks to Supabase about email and the only place a raw service reply is ever
// read. Nothing here branches on anything but that seam's normalized results.
// The one decision this file genuinely owns is what happens to the session on
// the no_user branch, and it is documented where it is made.

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { joinGroupByInvite } from "@/lib/groups/join"
import {
  requestSignInCode,
  confirmSignInCode,
  type SignInRequestResult,
} from "@/lib/auth/email"

/**
 * Everything that can go wrong after a code is submitted. `bad_code`,
 * `no_user` and `service_error` come straight from the auth seam; `join_failed`
 * is ours, and it is a genuinely different thing to say: the person IS signed
 * back in as themselves, and only getting them into this group failed.
 */
export type ConfirmJoinSignInResult = "bad_code" | "no_user" | "service_error" | "join_failed"

/**
 * Step one: ask Supabase to send a code to somebody the product already knows.
 *
 * Deliberately has no session guard, unlike requestEmailAttachAction, and it
 * cannot have one: the whole point is that the caller has no session and cannot
 * get one any other way. The cost, carried knowingly and recorded for task 8
 * which owns the same problem on /signin: this is an unauthenticated endpoint
 * that triggers outbound mail, and its only ceiling is Supabase's own rate
 * limit, which the task 1 spike never exercised.
 */
export async function requestJoinSignInCodeAction(
  email: string
): Promise<{ result: SignInRequestResult }> {
  return requestSignInCode(email)
}

/**
 * Step two: confirm the code, then put the person into this group as the
 * identity they already had.
 *
 * Redirects on success and therefore returns only on failure. redirect() throws
 * NEXT_REDIRECT internally, so it is called outside and after every try/catch,
 * the same rule join-group.ts already follows.
 */
export async function confirmJoinSignInAction(
  email: string,
  code: string,
  inviteToken: string
): Promise<{ result: ConfirmJoinSignInResult }> {
  const outcome = await confirmSignInCode(email, code)

  if (outcome.result !== "ok") {
    // The caller decision task 4 flagged and refused to make for us. By the
    // time no_user comes back, verifyOtp has already written a live session
    // cookie for an identity no User row points at, and the seam leaves it
    // alone on purpose.
    //
    // We sign it back out, and the reason is specific to this screen rather
    // than a general preference. This flow is only ever offered to a visitor
    // getCurrentUser() already returned nothing for, so signing out here can
    // never destroy a session the app could resolve to a person: there is
    // nothing to lose. What there is to gain is that the app stops holding a
    // cookie its own reads describe as signed out, which is the split-brain
    // state where a later bug has no honest explanation. Concretely, the
    // person's next move is the "I'm new here" door, and joinGroupAction skips
    // signInAnonymously whenever a session exists, so leaving the orphan cookie
    // would weld a brand new member onto the one identity we already could not
    // account for.
    if (outcome.result === "no_user") {
      try {
        const supabase = await createClient()
        await supabase.auth.signOut()
      } catch (err) {
        // Reported rather than swallowed, but it does not change what the
        // person is told: either way we could not sign them in, and the
        // message for that is already the honest one.
        console.error("[join-signin] signing the unresolvable session out failed:", err)
      }
    }
    return { result: outcome.result }
  }

  // joinGroupByInvite works in Supabase identities, and the seam hands back the
  // app's own user id, so this reads the pointer between them. A second round
  // trip, taken deliberately: the alternative is reading the session Supabase
  // just wrote, which the seam warns is not reliably visible to a second client
  // inside the same request, and the alternative to THAT is a second join path
  // written from scratch. Reusing the existing one is worth one indexed read.
  const person = await prisma.user
    .findUnique({ where: { id: outcome.userId }, select: { supabaseAuthId: true } })
    .catch(() => null)

  const supabaseAuthId = person?.supabaseAuthId
  if (!supabaseAuthId) {
    // Unreachable by construction: the seam found this row BY its
    // supabaseAuthId a moment ago. Logged rather than shrugged at, because if
    // it ever fires, auth and the app's data have come apart.
    console.error(
      `[join-signin] signed-in user ${outcome.userId} has no supabase auth id`
    )
    return { result: "service_error" }
  }

  let groupId: string
  try {
    // The existing join path, reused rather than reimplemented. It re-resolves
    // the token inside its own transaction, reuses the User row instead of
    // creating a second one, and skips duplicates, which is what makes this
    // one call cover both cases the brief names: somebody already in this
    // group is simply routed into it, and somebody who is not is joined and
    // announced.
    //
    // The empty name is never read. joinGroupByInvite only uses it when it has
    // to create a User, and a User provably exists here, since confirmSignInCode
    // returning ok is exactly the statement that it found one. Passing a name
    // would be worse than passing none: this person already has a name, and
    // signing in is not an occasion to change it.
    const result = await joinGroupByInvite({ supabaseAuthId, memberName: "", inviteToken })
    groupId = result.group.id
  } catch (err) {
    console.error("[join-signin] joining after sign-in failed:", err)
    return { result: "join_failed" }
  }

  redirect(`/groups/${groupId}`)
}
