// The one answer to "is this person a member of this group?". Every gate in
// the product (screen walls, write refusals, the calendar route) reads this
// helper or the same compound-key lookup inside a transaction, so no surface
// can invent its own slightly different answer.

import { prisma } from "@/lib/prisma"

export async function isGroupMember(userId: string, groupId: string): Promise<boolean> {
  const membership = await prisma.membership.findUnique({
    where: { userId_groupId: { userId, groupId } },
    select: { id: true },
  })
  return membership !== null
}
