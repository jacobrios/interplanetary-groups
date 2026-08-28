"use server"

// Records that the caller opened this group, fired once from the group home
// on mount.
//
// Returns nothing, deliberately. There is no user-visible outcome and no
// recovery a member could take, so a result would only invite a caller to
// branch on something that should never change what is on screen. A failure
// is logged and swallowed: the cost of a missed write is one digest that says
// slightly more than it needed to, which is the safe direction.
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
