import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import type { User } from "@prisma/client"
import { classifyAuthReply, AuthUnavailableError } from "@/lib/auth/availability"

/**
 * Returns the Prisma User row for the currently authenticated Supabase user,
 * or null if there is no active session or no matching User row. Throws
 * AuthUnavailableError if the auth server itself could not be reached, which
 * is a different thing from "signed out" and must not be read as one; see
 * src/lib/auth/availability.ts for the classification this reads.
 *
 * Always calls getUser() (not getSession()) — getUser() validates the session
 * against the Supabase auth server, so it cannot be spoofed by a forged cookie.
 *
 * Two things worth stating rather than re-deriving, both verified directly
 * against @supabase/auth-js 2.108.2's GoTrueClient.js:
 *
 * - A visitor with no session cookie never touches the network: `_getUser`
 *   short-circuits to AuthSessionMissingError before any `_request` when
 *   there is no `data.session?.access_token`. So during a Supabase outage a
 *   stranger sees a normal site, and only people who actually have a session
 *   see the thrown error, which is the correct population.
 * - The session is not destroyed by a network failure: `_getUser`'s catch
 *   calls `_removeSession()` only when `isAuthSessionMissingError(error)` is
 *   true, never for a retryable fetch error. Middleware likewise writes
 *   cookies only when Supabase hands it refreshed ones. So "try again"
 *   genuinely works once Supabase is back, with no re-login, which is what
 *   makes the thrown-error screen honest rather than a dead end.
 */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createClient()
  const reply = await supabase.auth.getUser()
  const outcome = classifyAuthReply(reply)

  if (outcome.kind === "signed-out") return null

  if (outcome.kind === "unavailable") {
    console.error("[auth] the auth service did not answer", outcome.detail)
    throw new AuthUnavailableError(outcome.detail)
  }

  return prisma.user.findUnique({
    where: { supabaseAuthId: outcome.user.id },
  })
}
