// src/lib/groups/join.ts
import { prisma } from "@/lib/prisma"
import type { Group, User } from "@prisma/client"

interface JoinInput {
  supabaseAuthId: string
  memberName: string // used only when creating a brand-new User
  inviteToken: string
}

interface JoinResult {
  user: User
  group: Group
}

/**
 * Joins an existing group via invite token in a single transaction.
 *
 * Data-layer guards:
 * 1. Re-resolves the group from the invite token inside the tx — never trusts a
 *    client-passed group id.
 * 2. Reuses an existing User by supabaseAuthId rather than creating a duplicate.
 *    When the user already exists, their stored name is left untouched; submitting
 *    a name on the join form must not silently rename them across all groups.
 * 3. Upserts the Membership so a re-tap of the invite link is a harmless no-op
 *    (the compound unique index on userId+groupId is the safety net against races).
 */
export async function joinGroupByInvite({
  supabaseAuthId,
  memberName,
  inviteToken,
}: JoinInput): Promise<JoinResult> {
  return prisma.$transaction(async (tx) => {
    // Re-resolve group from token INSIDE the tx — never trust a client-passed id.
    const group = await tx.group.findUnique({ where: { inviteToken } })
    if (!group) throw new Error("INVALID_INVITE")

    // Data-layer guard: reuse existing User by supabaseAuthId; create with
    // submitted name only if absent (also covers an orphaned session whose prior write failed).
    let user = await tx.user.findUnique({ where: { supabaseAuthId } })
    if (!user) user = await tx.user.create({ data: { name: memberName, supabaseAuthId } })

    // Primary path: explicit membership existence check, so a re-tap is a no-op.
    // upsert on the userId_groupId compound unique is the safety net against races.
    await tx.membership.upsert({
      where: { userId_groupId: { userId: user.id, groupId: group.id } },
      create: { userId: user.id, groupId: group.id },
      update: {}, // already a member → harmless no-op
    })

    return { user, group }
  })
}
