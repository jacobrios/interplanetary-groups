"use server"

// The three writes behind Orbit's ask for an email on the group home.
//
// Two of them are thin wrappers over src/lib/auth/email.ts, which is the one
// place the app talks to Supabase about email and the only place a raw service
// reply is ever read. Nothing here branches on anything but the normalized
// results that seam returns, so the wrappers stay wrappers: they resolve the
// session, refuse when there is nobody signed in, and hand the answer back
// unchanged.
//
// No revalidatePath anywhere in this file, deliberately. A dismissal takes the
// note off the screen in the component's own state and the stored count keeps
// it off on the next render, and a confirmation needs to stay readable for a
// moment rather than being swept away by a re-render the instant it appears.
// Neither one changes anything else on the page.

import { getCurrentUser } from "@/lib/auth/current-user"
import { recordEmailOfferDismissed } from "@/lib/auth/email-ask"
import {
  requestEmailAttach,
  confirmEmailAttach,
  type AttachRequestResult,
  type ConfirmAttachResult,
} from "@/lib/auth/email"

/**
 * The member declined. This is the only call that advances the counter, so it
 * is also the only thing standing between "asked twice" and "asked forever".
 *
 * `ok` is false when the write did not land, and the caller still takes the
 * note off the screen: the member said no, and refusing to go away because a
 * database write failed would be the worst possible reading of that. The cost
 * is that the offer can come back on a later render, which is a repeat rather
 * than a betrayal.
 *
 * getCurrentUser() is inside this try, not before it (supabase-auth-soft-fail
 * fix round): it can now throw AuthUnavailableError, and all three actions in
 * this file run inside a `useTransition` from a modal the member may be
 * mid-typing into (EmailAskNote.tsx, EmailAttachFlow.tsx). A transition
 * callback that throws lands on error.tsx and discards the sheet along with
 * whatever the member had typed, which for a bare "Not now" tap is a strictly
 * worse outcome than the write-failed case right above, not merely as bad. An
 * auth blip must cost the same nothing here that a failed write already does.
 */
export async function dismissEmailOfferAction(): Promise<{ ok: boolean }> {
  try {
    const user = await getCurrentUser()
    if (!user) return { ok: false }

    await recordEmailOfferDismissed({ userId: user.id, now: new Date() })
    return { ok: true }
  } catch (err) {
    console.error("[email-ask] recording a dismissal failed", err)
    return { ok: false }
  }
}

/**
 * Step one: ask Supabase to send this member a code.
 *
 * getCurrentUser() runs inside the try for the reason given on
 * dismissEmailOfferAction above: this also runs inside the attach flow's
 * modal transition. `service_error` is the honest reading of a thrown
 * AuthUnavailableError, and it is exactly what this action already returned
 * for a null user before this fix, so no new result variant was needed.
 */
export async function requestEmailAttachAction(
  email: string
): Promise<{ result: AttachRequestResult }> {
  try {
    const user = await getCurrentUser()
    if (!user) return { result: "service_error" }

    return await requestEmailAttach(email)
  } catch (err) {
    console.error("[email-ask] requesting an attach code failed", err)
    return { result: "service_error" }
  }
}

/** Step two: confirm the code, which attaches the address and writes our copy. */
export async function confirmEmailAttachAction(
  email: string,
  code: string
): Promise<{ result: ConfirmAttachResult }> {
  try {
    const user = await getCurrentUser()
    if (!user) return { result: "service_error" }

    return await confirmEmailAttach(email, code)
  } catch (err) {
    console.error("[email-ask] confirming an attach code failed", err)
    return { result: "service_error" }
  }
}
