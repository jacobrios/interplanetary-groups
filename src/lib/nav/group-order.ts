// src/lib/nav/group-order.ts
//
// The order groups appear in on the group list: most recently opened first.
// front-door.ts used to guess a single group by most-recently-joined as a
// stand-in for the missing list; now that the list is real, this is where
// that ordering discipline lives instead, generalized to a real recency
// signal (lastSeenAt) with joinedAt only as its fallback and tie-break.

export interface GroupListMembership {
  groupId: string
  joinedAt: Date
  // Null means never opened. Those groups sort after every opened group
  // regardless of how recently they were joined; opening something is a
  // stronger recency signal than merely being a member of it.
  lastSeenAt: Date | null
}

// Generic so callers (Task 4's Prisma query) can pass rows carrying a group
// name or anything else without this function stripping it back off.
export function orderGroupsByRecentlyOpened<T extends GroupListMembership>(
  memberships: readonly T[]
): T[] {
  return [...memberships].sort((a, b) => {
    if (a.lastSeenAt === null && b.lastSeenAt !== null) return 1
    if (a.lastSeenAt !== null && b.lastSeenAt === null) return -1
    if (a.lastSeenAt !== null && b.lastSeenAt !== null) {
      const bySeen = b.lastSeenAt.getTime() - a.lastSeenAt.getTime()
      if (bySeen !== 0) return bySeen
    }

    const byJoined = b.joinedAt.getTime() - a.joinedAt.getTime()
    if (byJoined !== 0) return byJoined

    // Prisma makes no ordering promise without an explicit orderBy; without
    // this last, purely arbitrary tie-break the same data could render in a
    // different order on different requests.
    return a.groupId.localeCompare(b.groupId)
  })
}
