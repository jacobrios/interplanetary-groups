// src/lib/orbit/edit-copy.ts
//
// What Orbit says when a member edits a plan's title or place. Deterministic
// string composition, no model call, same as every other stored Orbit line
// in this slice.
//
// This is the product's SECOND family of stored Orbit lines that name a
// member (after cancel-copy.ts), for the same reason: there is no vote on a
// place or title edit, so naming the editor is the only check there is. Same
// deletion debt as buildCancelAnnouncement and buildRestoreAnnouncement:
// person-deletion nulls authorId on a person's own messages and cannot reach
// a name sitting inside Orbit's prose, so a deleted person's name survives
// in this one line too.
//
// This uses the plan's own titles rather than activityLabel, because a
// rename is precisely a title, and the title is what members see on the
// card. whenPhrase is imported from change-copy.ts so date phrasing here can
// never drift from the date phrasing in a time change or a cancellation.

import { whenPhrase } from "./change-copy"

export interface DetailChange {
  title?: { from: string; to: string }
  place?: { from: string | null; to: string | null }
}

export const EDIT_REVERT_LINE = "Anyone can change it back on the plan's page."

/**
 * The feed line the moment a member edits a plan's title, its place, or
 * both. The subject title is the plan's *previous* title when it was
 * renamed (change.title.from), because that is the title the group still
 * recognizes at the moment the announcement is read; otherwise it is
 * currentTitle, since nothing about the title changed.
 *
 * Place-added alone gets no revert line: nothing was lost, so there is
 * nothing to offer to restore. Every other shape, a change, a clearing, or
 * any rename, ends with EDIT_REVERT_LINE, because a rename or a lost detail
 * is exactly the kind of thing a member might want undone.
 *
 * Throws on an empty DetailChange: that is a caller bug (nothing changed,
 * so there is nothing for Orbit to say), never a line that should reach the
 * feed.
 */
export function buildEditAnnouncement(
  actorName: string,
  currentTitle: string,
  change: DetailChange,
  startsAt: Date,
  timeZone: string,
  now: Date
): string {
  if (!change.title && !change.place) {
    throw new Error("buildEditAnnouncement requires at least one of title or place to change")
  }

  const subjectTitle = change.title ? change.title.from : currentTitle
  const when = whenPhrase(startsAt, timeZone, now)

  const titleClause = change.title
    ? `${actorName} renamed ${subjectTitle} ${when} to ${change.title.to}`
    : null

  let placeClause: string | null = null
  let needsRevert = Boolean(change.title)

  if (change.place) {
    const { from, to } = change.place
    if (from !== null && to !== null) {
      placeClause = titleClause
        ? `changed the spot from ${from} to ${to}`
        : `${actorName} changed the spot for ${subjectTitle} ${when}, from ${from} to ${to}`
      needsRevert = true
    } else if (from === null && to !== null) {
      placeClause = titleClause
        ? `set the spot: ${to}`
        : `${actorName} set the spot for ${subjectTitle} ${when}: ${to}`
      // Place added alone: nothing was lost, so no revert line.
    } else {
      placeClause = titleClause
        ? `removed the spot (it was ${from})`
        : `${actorName} removed the spot for ${subjectTitle} ${when} (it was ${from})`
      needsRevert = true
    }
  }

  const body = titleClause && placeClause
    ? `${titleClause}, and ${placeClause}.`
    : titleClause
      ? `${titleClause}.`
      : `${placeClause}.`

  return needsRevert ? `${body} ${EDIT_REVERT_LINE}` : body
}
