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

/** The token in this person's unsubscribe link, generated on first need. */
export async function ensureUnsubscribeToken(userId: string): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { unsubscribeToken: true },
  })
  if (existing?.unsubscribeToken) return existing.unsubscribeToken

  const token = randomUUID()
  await prisma.user.update({ where: { id: userId }, data: { unsubscribeToken: token } })
  return token
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
