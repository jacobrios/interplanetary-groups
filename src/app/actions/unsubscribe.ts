"use server"

// The write behind the unsubscribe page's button.
//
// It is a POST and not a link click, deliberately: mail clients and security
// scanners prefetch links, so a GET that mutated would unsubscribe people who
// never clicked. The page renders on GET and writes only here.
//
// No session is required and none is checked. The token IS the authorisation,
// which is the only thing that can work: the person clicking arrives from
// their mail app, frequently on a device holding no session at all, and that
// is exactly the population this door exists for.

// It returns a result rather than nothing, and that is the opposite call from
// its sibling src/app/actions/group-seen.ts, on purpose. There, no pixel
// depends on the write, so a result would only invite a caller to branch on
// something that must not change the screen. Here the screen's entire job is
// to tell somebody their opt-out landed, and a screen may never assert an
// outcome it does not have: if the pool is exhausted or the free-tier database
// has paused, a swallowed failure shows "You're unsubscribed" over a
// digestOptOutAt that is still null. That member keeps getting mail they
// believe they stopped, and reaches for the spam button, which is precisely
// what the `updates.` subdomain split exists to prevent.
//
// This is the same discipline as src/lib/auth/email.ts and src/lib/email/
// send.ts: every service reply is normalized into a fixed result set here, and
// no screen reads the underlying shape.

import { unsubscribeByToken } from "@/lib/email/unsubscribe"

export type UnsubscribeResult = "ok" | "service_error"

export async function unsubscribeAction(token: string): Promise<UnsubscribeResult> {
  try {
    await unsubscribeByToken(token, new Date())
    return "ok"
  } catch (err) {
    // Logged before returning, for the reason send.ts names: the production
    // deploy cost two hours because create-group.ts threw its error away.
    console.error("[unsubscribe] recording an opt-out failed", err)
    return "service_error"
  }
}
