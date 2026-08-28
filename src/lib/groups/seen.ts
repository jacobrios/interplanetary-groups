// src/lib/groups/seen.ts
//
// When a member last opened a group. Written on every group-home render,
// read by nothing yet: the digest slice is what consumes it.
//
// The membership check is form (c) from src/lib/auth/membership.ts's list, a
// plain scoped update with no transaction of its own. There is no write-time
// atomicity need here: the worst a race can do is write two timestamps a
// millisecond apart, and the later one is as true as the earlier one.
//
// Scoping the update by the compound key rather than checking first is what
// makes the non-member refusal free: an update that matches no row writes
// nothing, so a stranger cannot record a read position on a group they are
// not in, and cannot learn from the result whether the group exists.

import { prisma } from "@/lib/prisma"

interface MarkGroupSeenInput {
  userId: string
  groupId: string
  now: Date
}

/** True when a membership row was updated; false when the caller is not a member. */
export async function markGroupSeen({
  userId,
  groupId,
  now,
}: MarkGroupSeenInput): Promise<boolean> {
  const { count } = await prisma.membership.updateMany({
    where: { userId, groupId },
    data: { lastSeenAt: now },
  })
  return count > 0
}
