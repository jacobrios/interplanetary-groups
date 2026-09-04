// src/lib/groups/seen.ts
//
// When a member last opened a group. Written once per mount by
// SeenMarker.tsx (guarded there by a lastFiredGroupId ref so a given groupId
// fires exactly once), read by nothing yet: the digest slice is what
// consumes it. Not written on every render: LiveRefresh.tsx now re-renders
// the group home roughly six times a minute via router.refresh(), but that
// refetches the RSC payload into the same mounted client tree rather than
// remounting SeenMarker, so its once-per-groupId guard still holds and this
// stays a single write per visit.
//
// The membership check here is not one of the four forms listed in
// src/lib/auth/membership.ts: it folds the (userId, groupId) predicate
// straight into updateMany's where clause instead of checking membership
// first and branching, so the database itself is the gate rather than a
// findUnique this code reads and then acts on. That makes it a fifth form,
// which membership.ts's header says a new gate should avoid unless nothing
// existing fits. Nothing existing does: forms (a), (b), and (d) all check
// first and write second, which is two round trips (or a transaction) this
// write does not need, and (c) is that same read-then-branch shape with no
// transaction, just as vulnerable to a wasted round trip for the common case
// of a stranger. Folding the predicate into the write itself keeps this to
// one round trip, makes the non-member refusal free (an update matching no
// row writes nothing), and leaks nothing about whether the group exists,
// since a stranger and a member-of-a-different-group get the identical
// zero-rows-updated result. There is no write-time atomicity need beyond
// that: the worst a race can do is write two timestamps a millisecond apart,
// and the later one is as true as the earlier one.

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
