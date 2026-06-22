// src/lib/groups/provision.ts
import { prisma } from "@/lib/prisma"
import type { Group, User } from "@prisma/client"

interface ProvisionInput {
  supabaseAuthId: string
  founderName: string
  groupName: string
}

interface ProvisionResult {
  user: User
  group: Group
}

/**
 * Provisions a founder and their group in a single transaction.
 *
 * Data-layer guard: if a User with this supabaseAuthId already exists, it is
 * reused as the founder rather than creating a duplicate. This prevents ghost
 * accounts when the browser already has a session (build-notes §3).
 *
 * The founder is automatically added as a member (Membership record) because
 * the roster is built from memberships — the founder is also a member.
 */
export async function provisionFounderGroup({
  supabaseAuthId,
  founderName,
  groupName,
}: ProvisionInput): Promise<ProvisionResult> {
  return prisma.$transaction(async (tx) => {
    // Reuse the existing User if one already exists for this Supabase auth ID.
    // This is the data-layer guard against duplicate User rows when a session
    // is already present (the auth-layer guard lives in the server action).
    let user = await tx.user.findUnique({ where: { supabaseAuthId } })

    if (!user) {
      user = await tx.user.create({
        data: { name: founderName, supabaseAuthId },
      })
    }

    const group = await tx.group.create({
      data: {
        name: groupName,
        founderId: user.id,
        memberships: { create: { userId: user.id } },
      },
    })

    return { user, group }
  })
}
