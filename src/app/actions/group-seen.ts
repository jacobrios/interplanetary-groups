"use server"

// Records that the caller opened this group, fired once from the group home
// on mount.
//
// Returns nothing, deliberately. There is no user-visible outcome and no
// recovery a member could take, so a result would only invite a caller to
// branch on something that should never change what is on screen. The cost of
// a missed write is one digest that says slightly more than it needed to,
// which is the safe direction.
//
// A failure is swallowed in TWO places, and the split matters because the
// try/catch below is only half of it. This catch covers what happens inside
// the server function: the session lookup and the database write. It cannot
// cover the trip, because the trip is not running inside it. A dropped
// connection, a 500, or a stale action id after a deploy rejects the promise
// the CLIENT is holding, and React surfaces a rejected async transition to the
// nearest error boundary. The caller's own .catch() in
// src/app/groups/[id]/SeenMarker.tsx is what covers that half. Only the two
// together make "a failure never changes what is on screen" true; the
// server-side catch alone does not, and this comment said it did until the
// final review of the digest plumbing slice caught it.
//
// No revalidatePath, for the same reason the email-ask writes have none:
// nothing on the page depends on this value.

import { getCurrentUser } from "@/lib/auth/current-user"
import { markGroupSeen } from "@/lib/groups/seen"

export async function markGroupSeenAction(groupId: string): Promise<void> {
  try {
    const user = await getCurrentUser()
    if (!user) return
    await markGroupSeen({ userId: user.id, groupId, now: new Date() })
  } catch (err) {
    console.error("[group-seen] recording a read position failed", err)
  }
}
