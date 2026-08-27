// src/lib/auth/email.ts
//
// The one place the app talks to Supabase about email. Every function here
// returns a normalized discriminated result and never a raw Supabase response,
// so no user-facing branch anywhere reads service output directly. This is the
// same claim-to-fact discipline orbit/normalize.ts enforces for the model, and
// this file is deliberately its sibling: a service reply is a claim about what
// happened, and the product decides what that claim means exactly once, here.
//
// Everything in the mapping below was measured against the real Supabase
// project by the task 1 spike (scripts/spike-email-auth.ts; findings recorded
// in docs/superpowers/specs/2026-08-25-email-sign-in-design.md), with the two
// inferred cases flagged inline. Do not "correct" any of it from the docs: the
// docs and the measurement disagree in at least three places.
//
// One rule this file exists to honour: every service_error branch logs the
// underlying error before returning its friendly reason. The production deploy
// cost two hours because create-group.ts:73 threw Supabase's error away, and
// this seam carries more failure modes than that one did.
//
// What is never logged: the address itself. It is the member's, given to Orbit
// rather than to the group, and a server log is not a place it needs to be.

import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"

export type AttachRequestResult =
  | "ok"
  | "invalid_email"
  | "email_taken"
  | "rate_limited"
  | "service_error"

export type ConfirmAttachResult = "ok" | "bad_code" | "service_error"

export type SignInRequestResult =
  | "ok"
  | "invalid_email"
  | "unknown_email"
  | "rate_limited"
  | "service_error"

export type ConfirmSignInResult =
  | { result: "ok"; userId: string }
  | { result: "bad_code" | "no_user" | "service_error" }

/**
 * Why "bad_code" and not the separate "wrong_code" / "expired" the plan
 * originally named: the spike measured both cases returning the identical
 * `otp_expired` / 403 / "Token has expired or is invalid". Supabase does not
 * tell us which happened, so the product cannot honestly say which happened,
 * and copy that picked one would be a lie the code cannot back up. One result,
 * one message, covering both. (Design doc, task 1 findings, finding 1.)
 */
const BAD_CODE = { result: "bad_code" } as const

/** The duck-typed shape of a Supabase auth failure: `code`, `status`, `message`. */
interface ServiceFailure {
  code?: string
  status?: number
  message?: string
}

function asFailure(error: unknown): ServiceFailure {
  const e = (error ?? {}) as ServiceFailure
  return { code: e.code, status: e.status, message: e.message }
}

/**
 * Logged for every service_error, and only for service_error: the classified
 * outcomes are product states rather than incidents, and logging those would
 * bury the real ones. `where` names the call site so a log line is actionable
 * without a stack trace.
 */
function logServiceFailure(where: string, error: unknown) {
  const { code, status, message } = asFailure(error)
  console.error(`[email-auth] ${where} failed:`, {
    code,
    status,
    message: message ?? (error instanceof Error ? error.message : String(error)),
  })
}

/**
 * Deliberately a shape check and nothing more. Its whole job is to keep an
 * obvious typo from spending one of the member's rate-limited sends; deciding
 * whether an address is genuinely deliverable is Supabase's job on the way out
 * and the inbox's job on the way in, and a stricter regex here would only
 * reject real addresses nobody anticipated.
 */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

/** Supabase lowercases the address it stores; matching it keeps our copy identical. */
function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

const TAKEN_CODES = new Set(["email_exists", "identity_already_exists", "user_already_exists"])
const INVALID_EMAIL_CODES = new Set(["email_address_invalid", "validation_failed"])
const RATE_LIMIT_CODES = new Set(["over_email_send_rate_limit", "over_request_rate_limit"])

/**
 * Rate limiting is built against configuration that was READ, not exercised:
 * the spike never hit a limit, so this branch is designed-for rather than
 * proven. The status check is the belt to the code's braces, because a limit
 * raised by custom SMTP could surface under a code this list does not know.
 */
function isRateLimited(f: ServiceFailure): boolean {
  return (f.code !== undefined && RATE_LIMIT_CODES.has(f.code)) || f.status === 429
}

/**
 * Step one of attaching an email to the identity a member already has.
 *
 * Measured, not assumed: on an anonymous user this leaves `email` empty and
 * `is_anonymous` true and parks the address in `new_email` until the code is
 * confirmed. The identity is upgraded in place, never replaced, which is the
 * premise the whole anonymous-first arrangement rests on.
 */
export async function requestEmailAttach(email: string): Promise<{ result: AttachRequestResult }> {
  const address = normalizeEmail(email)
  if (!looksLikeEmail(address)) return { result: "invalid_email" }

  try {
    const supabase = await createClient()
    const { error } = await supabase.auth.updateUser({ email: address })
    if (!error) return { result: "ok" }

    const f = asFailure(error)
    // Inferred rather than measured: the spike attached a fresh address, so it
    // never saw a collision. These are Supabase's documented codes for an
    // address already living on another identity. If this ever proves wrong
    // the symptom is a service_error where a "that email is already in use"
    // belonged, which is a degraded message rather than a wrong one.
    if (f.code !== undefined && TAKEN_CODES.has(f.code)) return { result: "email_taken" }
    if (f.code !== undefined && INVALID_EMAIL_CODES.has(f.code)) return { result: "invalid_email" }
    if (isRateLimited(f)) return { result: "rate_limited" }

    logServiceFailure("requestEmailAttach", error)
    return { result: "service_error" }
  } catch (err) {
    logServiceFailure("requestEmailAttach", err)
    return { result: "service_error" }
  }
}

/**
 * Step two: confirm the code, and write the app's own copy of the address in
 * the same call, so an email attached in Supabase can never exist without the
 * app knowing about it.
 *
 * The type is `email_change`, not `email`. This was the single most likely
 * place for the plan to be wrong, so the spike tried four candidates against
 * the real service rather than reading the docs: `email_change` succeeded and
 * `email`, `signup` and `magiclink` all failed. Note the asymmetry with
 * confirmSignInCode below, which genuinely does need `email`. Both are correct
 * and the inconsistency is Supabase's, not ours.
 */
export async function confirmEmailAttach(
  email: string,
  code: string
): Promise<{ result: ConfirmAttachResult }> {
  const address = normalizeEmail(email)
  const token = code.trim()
  // The only length rule here, on purpose. The plan said six digits, the
  // service actually sends eight, and a hardcoded length would have been a bug
  // written from the documentation. Empty is the one thing we can reject
  // without asking, since it cannot be a code whatever Supabase changes.
  if (token === "") return BAD_CODE

  try {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.verifyOtp({
      email: address,
      token,
      type: "email_change",
    })

    if (error) {
      if (asFailure(error).code === "otp_expired") return BAD_CODE
      logServiceFailure("confirmEmailAttach", error)
      return { result: "service_error" }
    }

    const authId = data?.user?.id
    if (!authId) {
      logServiceFailure("confirmEmailAttach", { message: "verifyOtp returned no user and no error" })
      return { result: "service_error" }
    }

    // The identity is resolved from what verifyOtp just returned rather than
    // from getCurrentUser(), because the session cookie this call writes is not
    // guaranteed to be readable by a second client inside the same request.
    // The id is unchanged by the attach anyway, so this is the same person.
    const user = await prisma.user.findUnique({ where: { supabaseAuthId: authId } })
    if (!user) {
      // Should be unreachable: only a signed-in member is offered the attach.
      // If it happens, auth and the app's data have come apart, which is worth
      // a log rather than a silent shrug.
      logServiceFailure("confirmEmailAttach", {
        message: `no app user for verified identity ${authId}`,
      })
      return { result: "service_error" }
    }

    // Replace rather than accumulate, one rule covering both awkward cases:
    // the same person attaching twice, and the same person attaching a second
    // address. Supabase holds exactly one email per identity and it is the
    // store of record, so the app's copy holding two would be a copy of
    // something that does not exist. It also matters that a mistyped address
    // leaves: re-running this flow is the entire recovery path this slice
    // gives a member (editing is out of scope), and the digest slice will read
    // these rows to decide where to send mail. A stale verified row would be a
    // message going to an inbox nobody reads.
    await prisma.$transaction(async (tx) => {
      await tx.contactMethod.deleteMany({ where: { userId: user.id, type: "EMAIL" } })
      await tx.contactMethod.create({
        data: {
          userId: user.id,
          type: "EMAIL",
          value: address,
          isVerified: true,
          isPreferred: true,
        },
      })
    })

    return { result: "ok" }
  } catch (err) {
    logServiceFailure("confirmEmailAttach", err)
    return { result: "service_error" }
  }
}

/**
 * Step one of signing back in as somebody the product already knows.
 *
 * `shouldCreateUser: false` is load-bearing rather than defensive: without it
 * an unrecognised address silently mints a brand new identity, which is the
 * exact duplicate-member bug this whole slice exists to close.
 */
export async function requestSignInCode(email: string): Promise<{ result: SignInRequestResult }> {
  const address = normalizeEmail(email)
  if (!looksLikeEmail(address)) return { result: "invalid_email" }

  try {
    const supabase = await createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: { shouldCreateUser: false },
    })
    if (!error) return { result: "ok" }

    const f = asFailure(error)
    // Measured: an unknown address comes back as `otp_disabled` / 422,
    // "Signups not allowed for otp". The caveat, accepted knowingly rather
    // than missed: that is also what Supabase returns if OTP sign-in were
    // switched off for the whole project, so this code alone cannot separate
    // "no such account" from "the project is misconfigured". The second is a
    // setup error caught once during deployment rather than a condition a
    // member can reach at runtime, so it is not worth a vaguer message for
    // everyone else. If sign-in ever appears broken for EVERY address, this
    // comment is the first place to look.
    if (f.code === "otp_disabled" || f.code === "user_not_found") {
      return { result: "unknown_email" }
    }
    if (f.code !== undefined && INVALID_EMAIL_CODES.has(f.code)) return { result: "invalid_email" }
    if (isRateLimited(f)) return { result: "rate_limited" }

    logServiceFailure("requestSignInCode", error)
    return { result: "service_error" }
  } catch (err) {
    logServiceFailure("requestSignInCode", err)
    return { result: "service_error" }
  }
}

/**
 * Step two of signing back in, and the one line the slice exists for: this
 * returns the ORIGINAL identity, so the person comes back as themselves rather
 * than as a second member whose arrival quietly breaks every count.
 *
 * `no_user` is a real outcome and not a service failure: the code was right and
 * Supabase knows the identity, but no app row points at it. That is what an
 * identity created outside the product's own join paths looks like, and the
 * caller has something honest to say about it.
 */
export async function confirmSignInCode(email: string, code: string): Promise<ConfirmSignInResult> {
  const address = normalizeEmail(email)
  const token = code.trim()
  if (token === "") return BAD_CODE

  try {
    const supabase = await createClient()
    // `email` here, against `email_change` in confirmEmailAttach above. Both
    // were measured; do not make them agree.
    const { data, error } = await supabase.auth.verifyOtp({
      email: address,
      token,
      type: "email",
    })

    if (error) {
      if (asFailure(error).code === "otp_expired") return BAD_CODE
      logServiceFailure("confirmSignInCode", error)
      return { result: "service_error" }
    }

    const authId = data?.user?.id
    if (!authId) {
      logServiceFailure("confirmSignInCode", { message: "verifyOtp returned no user and no error" })
      return { result: "service_error" }
    }

    const user = await prisma.user.findUnique({ where: { supabaseAuthId: authId } })
    if (!user) return { result: "no_user" }

    return { result: "ok", userId: user.id }
  } catch (err) {
    logServiceFailure("confirmSignInCode", err)
    return { result: "service_error" }
  }
}
