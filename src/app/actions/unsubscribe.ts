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

import { unsubscribeByToken } from "@/lib/email/unsubscribe"

export async function unsubscribeAction(token: string): Promise<void> {
  try {
    await unsubscribeByToken(token, new Date())
  } catch (err) {
    console.error("[unsubscribe] recording an opt-out failed", err)
  }
}
