import { prisma } from "@/lib/prisma"

interface LeaveInput {
  supabaseAuthId: string
  groupId: string
}

/**
 * A member leaves a group: one membership-row delete, nothing else touched.
 *
 * The product self-heals around the delete (spec decision 7): every tally,
 * roster, and consensus bar already filters to current members, and the
 * departed member's history (messages, RSVPs) stays visible on purpose.
 *
 * The founder cannot leave (spec decision 3): a founder-less group would
 * strand the founder powers, and a real exit story (transfer or dissolve)
 * is its own future slice. The UI never shows the founder a Leave button;
 * this guard is the server-side backstop.
 *
 * Runs in a transaction so the guards and the delete read one consistent
 * snapshot; the caller (the action) maps thrown codes to user copy.
 */
export async function leaveGroup({ supabaseAuthId, groupId }: LeaveInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { supabaseAuthId } })
    if (!user) throw new Error("NO_USER")

    const group = await tx.group.findUnique({ where: { id: groupId } })
    if (!group) throw new Error("GROUP_NOT_FOUND")

    if (group.founderId === user.id) throw new Error("FOUNDER_CANNOT_LEAVE")

    const membership = await tx.membership.findUnique({
      where: { userId_groupId: { userId: user.id, groupId } },
    })
    if (!membership) throw new Error("NOT_A_MEMBER")

    await tx.membership.delete({ where: { id: membership.id } })
  })
}
