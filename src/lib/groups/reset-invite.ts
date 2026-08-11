import { randomUUID } from "crypto"
import { prisma } from "@/lib/prisma"

interface ResetInviteInput {
  supabaseAuthId: string // the caller's session; must resolve to the founder
  groupId: string
}

/**
 * Issues a fresh invite token, killing the old link everywhere it has been
 * shared (spec decision 9: remove-then-reset is the keep-them-out path).
 *
 * The schema's @default(cuid()) only fires at row creation, so rotation
 * generates its own value. randomUUID() is used rather than a cuid: the only
 * property the token needs is unguessable uniqueness, and the join route
 * treats it as an opaque string (an old-format token simply stops matching,
 * which is exactly the designed behavior of a reset).
 *
 * The group's own id never changes (settled at data-foundation: identity and
 * invitation are separate fields precisely so this rotation is possible).
 */
export async function resetInviteToken({
  supabaseAuthId,
  groupId,
}: ResetInviteInput): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const caller = await tx.user.findUnique({ where: { supabaseAuthId } })
    if (!caller) throw new Error("NO_USER")

    const group = await tx.group.findUnique({ where: { id: groupId } })
    if (!group) throw new Error("GROUP_NOT_FOUND")
    if (group.founderId !== caller.id) throw new Error("NOT_FOUNDER")

    const newToken = randomUUID()
    await tx.group.update({ where: { id: groupId }, data: { inviteToken: newToken } })
    return newToken
  })
}
