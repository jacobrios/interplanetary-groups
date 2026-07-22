// src/lib/groups/provision.ts
import { prisma } from "@/lib/prisma"
import type { Group, Prisma, User } from "@prisma/client"
import type { StoredRhythm } from "@/lib/orbit/rhythm"

interface ProvisionInput {
  supabaseAuthId: string
  founderName: string
  groupName: string
  /** Founder's onboarding free text; stored for future gap-ask/RAG slices. */
  description?: string | null
  /** Validated rhythm array (parseStoredRhythms shape); [0] is the schedulable primary. */
  recurringActivities?: StoredRhythm[] | null
  /**
   * Validated IANA timezone (normalizeTimeZone output). Omitted → the schema's
   * "UTC" default applies. The caller is responsible for normalization; this
   * function trusts the value it is handed.
   */
  timeZone?: string
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
  description,
  recurringActivities,
  timeZone,
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
        description: description ?? null,
        // undefined omits the field, leaving the schema's "UTC" default.
        timeZone: timeZone ?? undefined,
        // Json? column: undefined omits the field entirely (stays NULL);
        // the validated array is cast for Prisma's JSON input type.
        recurringActivities: recurringActivities
          ? (recurringActivities as unknown as Prisma.InputJsonValue)
          : undefined,
        memberships: { create: { userId: user.id } },
      },
    })

    return { user, group }
  })
}
