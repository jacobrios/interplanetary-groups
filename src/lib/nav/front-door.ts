// src/lib/nav/front-door.ts
//
// Where "/" sends a visitor. The one piece of real branching logic in the
// app-wide navigation slice, kept out of the page component so it can be
// tested without a database or a browser.
//
// The several-groups case is a placeholder, not a designed behavior: the
// multi-group home is a fast-follow (build-notes §8) and this function is
// the seat being held for it. Until then the most recently joined group is
// the least surprising guess, since it is the group the person most likely
// arrived for.

export interface FrontDoorMembership {
  groupId: string
  joinedAt: Date
}

export type FrontDoorDestination =
  | { kind: "front-door" }
  | { kind: "group"; groupId: string }

export function resolveFrontDoor(
  memberships: readonly FrontDoorMembership[]
): FrontDoorDestination {
  if (memberships.length === 0) return { kind: "front-door" }

  // Copy before sorting: callers pass query results they may still use.
  // Ties break on groupId so the destination is stable across query orders,
  // which matters because Prisma makes no ordering promise without orderBy.
  const [mostRecent] = [...memberships].sort((a, b) => {
    const byRecency = b.joinedAt.getTime() - a.joinedAt.getTime()
    if (byRecency !== 0) return byRecency
    return a.groupId.localeCompare(b.groupId)
  })

  return { kind: "group", groupId: mostRecent.groupId }
}
