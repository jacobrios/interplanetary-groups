// src/lib/groups/initials.ts
//
// The group emblem's initials, derived deterministically from the group name
// at render time. Never stored, never model-generated (spec decision 11):
// regenerating a stored value is the drift failure the "carry, don't
// regenerate" guardrail exists for, and this value is cheap enough to derive
// that storing it would only create a second copy to fall out of sync.

/**
 * First letters of the first two words, uppercased ("Climbing Crew" -> "CC").
 * A one-word name uses its first two letters ("badminton" -> "BA"); a
 * one-character name is just that character uppercased.
 */
export function groupInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase()
  }
  const only = words[0] ?? ""
  return only.slice(0, 2).toUpperCase()
}
