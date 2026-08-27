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
 */
export async function dismissEmailOfferAction(): Promise<{ ok: boolean }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false }

  try {
    await recordEmailOfferDismissed({ userId: user.id, now: new Date() })
    return { ok: true }
  } catch (err) {
    console.error("[email-ask] recording a dismissal failed", err)
    return { ok: false }
  }
}

/** Step one: ask Supabase to send this member a code. */
export async function requestEmailAttachAction(
  email: string
): Promise<{ result: AttachRequestResult }> {
  const user = await getCurrentUser()
  if (!user) return { result: "service_error" }

  return requestEmailAttach(email)
}

/** Step two: confirm the code, which attaches the address and writes our copy. */
export async function confirmEmailAttachAction(
  email: string,
  code: string
): Promise<{ result: ConfirmAttachResult }> {
  const user = await getCurrentUser()
  if (!user) return { result: "service_error" }

  return confirmEmailAttach(email, code)
}
