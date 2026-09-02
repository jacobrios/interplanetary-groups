// scripts/_probe-signin-client.ts
//
// A script-only stand-in for src/lib/supabase/server.ts's createClient(),
// used by exactly one caller: scripts/probe-signin-rate.ts. Not a general
// pattern, and not meant to be imported anywhere under src/.
//
// WHY THIS EXISTS. Task 9a needs to drive the real requestSignInCode and
// confirmSignInCode functions in src/lib/auth/email.ts, not a hand-rolled
// verifyOtp call, so the probe measures exactly what the product does. Both
// functions call createClient() from src/lib/supabase/server.ts, which reads
// next/headers' cookies(). That function throws ("called outside a request
// scope") the instant it runs anywhere that is not an actual Next.js request,
// and a bare script is never one. Confirmed by hand before writing this file:
// a plain script importing next/headers and calling cookies() fails with
// exactly that error.
//
// This file is the same call, `createServerClient` from `@supabase/ssr`,
// with the same env lookup (`getSupabaseEnv`), and only the cookie transport
// swapped: an in-memory Map instead of the Next.js request's cookie jar.
// Nothing about auth classification, error handling, or the Supabase call
// itself is reimplemented; that all still lives in email.ts, untouched.
//
// A fresh in-memory jar is correct for what this probe does. Every call the
// probe makes (signInWithOtp, verifyOtp) is address-scoped and needs no
// pre-existing session; the cookie jar exists only so `createServerClient`
// has somewhere to persist whatever token a call returns, in case a later
// call in the same run wants to read it back.
import { createServerClient } from "@supabase/ssr"
import { getSupabaseEnv } from "../src/lib/supabase/env"

const jar = new Map<string, string>()

export async function createClient() {
  const { url, publishableKey } = getSupabaseEnv()
  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return [...jar.entries()].map(([name, value]) => ({ name, value }))
      },
      setAll(cookiesToSet: { name: string; value: string }[]) {
        for (const { name, value } of cookiesToSet) jar.set(name, value)
      },
    },
  })
}
