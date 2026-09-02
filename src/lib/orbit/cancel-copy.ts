// src/lib/orbit/cancel-copy.ts
//
// What Orbit says when somebody calls off one occurrence, and when somebody
// puts it back. Deterministic string composition, no model call: this whole
// slice deliberately adds no model behavior (spec section 9).
//
// These are the product's FIRST stored Orbit message bodies that name a
// member. Every other Orbit line that names people (buildTallyLine) is
// rendered live from vote rows at page render, never stored. That is a real
// consequence and it is registered as debt in the spec: person-deletion
// nulls authorId on a person's own messages and cannot reach a name sitting
// inside Orbit's prose, so a deleted person's name survives in this one line.
//
// Why this announcement names anyone at all, when buildChangeAnnouncement
// and buildConsensusAnnouncement are both impersonal: a time change goes
// through a group vote, so it is nobody's individual call. A cancellation
// has no vote and no permission gate (decisions 1 and 2), which means the
// social check is the only check there is, and an anonymous cancellation in
// a 16-20 person group leaves nobody to ask why. Settled with the owner,
// 2 September 2026.
//
// whenPhrase and cap are imported rather than copied so the date phrasing
// here can never drift from the date phrasing in a time change.

import { whenPhrase } from "./change-copy"

/**
 * The feed line the moment a plan is called off. Two sentences, and the
 * second earns its place: it is the only place in the product where the
 * group ever learns that anyone can undo this.
 */
export function buildCancelAnnouncement(
  actorName: string,
  label: string,
  startsAt: Date,
  timeZone: string,
  now: Date
): string {
  return `${actorName} called off ${label} ${whenPhrase(startsAt, timeZone, now)}. If that's not right, anyone can put it back on the plan's page.`
}

/**
 * The feed line when a plan comes back. The second sentence answers the
 * question a member will actually have, and it is answerable only because a
 * cancel does not touch a single RSVP row (spec section 5).
 */
export function buildRestoreAnnouncement(
  actorName: string,
  label: string,
  startsAt: Date,
  timeZone: string,
  now: Date
): string {
  return `${actorName} put ${label} ${whenPhrase(startsAt, timeZone, now)} back on. Everyone's RSVPs are the same as before.`
}
