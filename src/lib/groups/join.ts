// src/lib/groups/join.ts
import { prisma } from "@/lib/prisma"
import { MessageAuthor } from "@prisma/client"
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
 * Thrown when a brand-new joiner's submitted name collides, case- and
 * whitespace-insensitively, with a name already on the group's roster.
 * `existingName` carries the stored member's name verbatim (original casing
 * and whitespace), because that is what the roster shows and what the
 * collision copy must reference.
 */
export class DuplicateNameError extends Error {
  public readonly existingName: string

  constructor(existingName: string) {
    super("DUPLICATE_NAME")
    this.name = "DuplicateNameError"
    this.existingName = existingName
  }
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
 * 3. Rejects a brand-new joiner whose submitted name collides (trimmed,
 *    case-insensitive) with a name already on this group's roster. This sits
 *    only on the User-creation branch, deliberately, for two reasons: it is
 *    the one moment a name enters the product at all (the existing-User
 *    branch never uses memberName — see guard 2), and gating the
 *    existing-User branch too would block `confirmJoinSignInAction`, which
 *    calls this function with `memberName: ""` to let someone who already
 *    has this exact name sign back in as themselves. The product has no way
 *    for a person to change their stored name, so a collision here is
 *    someone else's problem to solve by signing in, not this person's to be
 *    blocked on. The throw happens before any write, inside the interactive
 *    transaction, so it rolls the whole transaction back with nothing to
 *    compensate for.
 * 4. Uses createMany(skipDuplicates) to atomically map to ON CONFLICT DO NOTHING,
 *    so a re-tap of the invite link is a harmless no-op (the compound unique index
 *    on userId+groupId is the safety net against races, and count tells us whether
 *    this was a first join or a re-tap).
 * 5. Announces a first join to the group feed with a SYSTEM message containing the
 *    user's stored name. A re-tap announces nothing.
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
    if (!user) {
      // Duplicate-name guard, User-creation branch only (see guard 3 above):
      // a brand-new joiner cannot take a name already on this group's
      // roster. Scoped select, indexed by groupId.
      const members = await tx.membership.findMany({
        where: { groupId: group.id },
        select: { user: { select: { name: true } } },
      })
      const collision = members.find(
        (m) => m.user.name.trim().toLowerCase() === memberName.trim().toLowerCase()
      )
      if (collision) throw new DuplicateNameError(collision.user.name)

      user = await tx.user.create({ data: { name: memberName, supabaseAuthId } })
    }

    // First join vs re-tap, decided atomically: createMany(skipDuplicates)
    // maps to ON CONFLICT DO NOTHING, so a duplicate never aborts the
    // transaction (a plain create would poison it) and count tells us
    // which case this was without a second read.
    const { count } = await tx.membership.createMany({
      data: [{ userId: user.id, groupId: group.id }],
      skipDuplicates: true,
    })

    // The group sees the person the link produced (spec, joining arc): the
    // announcement rides the same transaction as the membership, so neither
    // can exist without the other, and a re-tap (count 0) announces nothing.
    // Body is composed deterministically from the stored name; authorId stays
    // null because SYSTEM is nobody, the same reasoning that keeps Orbit out
    // of rosters.
    if (count === 1) {
      await tx.message.create({
        data: {
          groupId: group.id,
          authorType: MessageAuthor.SYSTEM,
          authorId: null,
          body: `${user.name} joined`,
        },
      })
    }

    return { user, group }
  })
}
