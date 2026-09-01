// src/lib/nav/front-door.ts
//
// Where "/" sends a visitor. The one piece of real branching logic in the
// app-wide navigation slice, kept out of the page component so it can be
// tested without a database or a browser.
//
// A member of exactly one group lands there directly: there is nothing to
// choose between. A member of more than one used to be sent to a guessed
// group (most recently joined, as a placeholder for the missing multi-group
// home); the guess is gone now that the home has a real destination, the
// group list, so several memberships resolve there instead of to any one
// of them. Whatever orders that list (Task 2) owns the tie-break-by-groupId
// discipline this function used to need for its own guess; it does not
// live here because this function no longer picks a group at all.

export interface FrontDoorMembership {
  groupId: string
  // Unused by resolveFrontDoor itself now; kept on the shape because Task 2's
  // list-ordering function needs it and callers already have it on hand.
  joinedAt: Date
}

export type FrontDoorDestination =
  | { kind: "front-door" }
  | { kind: "group"; groupId: string }
  | { kind: "groups" }

export function resolveFrontDoor(
  memberships: readonly FrontDoorMembership[]
): FrontDoorDestination {
  if (memberships.length === 0) return { kind: "front-door" }
  if (memberships.length === 1) return { kind: "group", groupId: memberships[0].groupId }
  return { kind: "groups" }
}
