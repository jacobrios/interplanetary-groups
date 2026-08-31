// src/lib/email/unsubscribe.ts
//
// One door: it stops digests and touches nothing else.
//
// The rule this file exists to hold up, and the one way it could quietly break
// the slice that shipped last week: unsubscribing NEVER touches
// ContactMethod.isVerified. Login codes are transactional, they leave through
// the `account.` subdomain, and somebody who stops wanting digests must still
// be able to sign in as themselves. The opt-out lives on User for that reason:
// it is a decision about a person, readable without loading their address.
//
// Per person, not per group. Digests are sent per group, but one click stops
// all of them, because that is what somebody means when they click it, and a
// per-group choice would be the declined preference model by the back door.

import { randomUUID } from "crypto"
import { prisma } from "@/lib/prisma"

/**
 * The token in this person's unsubscribe link, generated on first need.
 *
 * Why this is not the obvious read-then-`update` shape: two digests composing
 * for the same person at the same moment can both see no token and both
 * decide to mint one. A plain `update` has no opinion about who else is
 * writing, so the second call would silently clobber the first, and whichever
 * token was already embedded in a sent email would belong to nobody, forever,
 * with nothing anywhere reporting it. Instead the write is an `updateMany`
 * scoped to `unsubscribeToken: null`: Postgres re-checks that condition after
 * taking the row lock, so a loser's write matches zero rows instead of
 * overwriting the winner's. The unique constraint on `unsubscribeToken` is
 * what makes a two-winner outcome impossible at the database level, which is
 * why the read-back below is the authority on what to return, never the
 * value this call happened to generate.
 */
export async function ensureUnsubscribeToken(userId: string): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { unsubscribeToken: true },
  })
  if (existing?.unsubscribeToken) return existing.unsubscribeToken

  const token = randomUUID()
  await prisma.user.updateMany({
    where: { id: userId, unsubscribeToken: null },
    data: { unsubscribeToken: token },
  })

  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { unsubscribeToken: true },
  })
  if (!row?.unsubscribeToken) {
    console.error(`[unsubscribe-token] user ${userId} has no token immediately after write`)
    throw new Error("ensureUnsubscribeToken: token missing after write")
  }
  return row.unsubscribeToken
}

/**
 * Records the opt-out. Silent for an unknown token, and silent for somebody
 * who already opted out: the scoped updateMany writes nothing in both cases,
 * which is also why a second click cannot overwrite the first timestamp. The
 * page shows the same confirmation either way, so a stranger holding a
 * guessed token learns nothing from the difference.
 */
export async function unsubscribeByToken(token: string, now: Date): Promise<void> {
  await prisma.user.updateMany({
    where: { unsubscribeToken: token, digestOptOutAt: null },
    data: { digestOptOutAt: now },
  })
}
