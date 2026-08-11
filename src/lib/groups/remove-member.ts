import { prisma } from "@/lib/prisma"

interface RemoveMemberInput {
  supabaseAuthId: string // the caller's session; must resolve to the founder
  groupId: string
  targetUserId: string
}

/**
 * The founder removes a member: one membership-row delete (spec decision 7,
 * same self-healing shape as leaveGroup). The caller is re-resolved from the
 * session and checked against founderId server-side; client identity is
 * never trusted (spec decision 6).
 *
 * Removal is not a lock (spec decision 8): the removed member's history
 * stays, and until the access-control slice they can still view the group.
 * Remove-then-reset is the designed keep-them-out path (spec decision 9).
 */
export async function removeMember({
  supabaseAuthId,
  groupId,
  targetUserId,
}: RemoveMemberInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const caller = await tx.user.findUnique({ where: { supabaseAuthId } })
    if (!caller) throw new Error("NO_USER")

    const group = await tx.group.findUnique({ where: { id: groupId } })
    if (!group) throw new Error("GROUP_NOT_FOUND")

    if (group.founderId !== caller.id) throw new Error("NOT_FOUNDER")
    if (targetUserId === group.founderId) throw new Error("CANNOT_REMOVE_FOUNDER")

    const membership = await tx.membership.findUnique({
      where: { userId_groupId: { userId: targetUserId, groupId } },
    })
    if (!membership) throw new Error("TARGET_NOT_MEMBER")

    await tx.membership.delete({ where: { id: membership.id } })
  })
}
