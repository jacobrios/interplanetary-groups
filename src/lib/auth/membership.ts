// The one answer to "is this person a member of this group?", resolved four
// ways in the product, all of them reading the same compound key
// (userId, groupId), so no surface invents its own slightly different
// answer:
//   (a) this plain helper, awaited directly: the calendar route,
//       proposal-vote.ts and proposal-answer.ts use it as a same-request
//       check, and gauge-vote.ts uses it too as an early refusal so a
//       non-member learns nothing about a gauge's state before being turned
//       away.
//   (b) tx.membership.findUnique inside a transaction: setRsvp and castVote
//       use this form because their membership check has to be atomic with
//       the write itself, the guarantee a plain await before the transaction
//       cannot give.
//   (c) a plain prisma.membership.findUnique with no transaction of its own,
//       used by createMessage, which has no write-time atomicity need this
//       check has to share.
//   (d) group.memberships.some(...) over rows already loaded in the same
//       request: the three screen walls and detect-intent use this because
//       the page or action already pulled the membership list for other
//       reasons, so a second query would be redundant.
// A new gate should pick the form that matches its situation rather than
// inventing a fifth.

import { prisma } from "@/lib/prisma"

export async function isGroupMember(userId: string, groupId: string): Promise<boolean> {
  const membership = await prisma.membership.findUnique({
    where: { userId_groupId: { userId, groupId } },
    select: { id: true },
  })
  return membership !== null
}
