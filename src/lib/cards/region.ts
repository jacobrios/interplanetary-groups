// src/lib/cards/region.ts
// The card region's brain: what shows, in what order, wearing which label.
// Pure on purpose, like lib/pending/derive.ts: page.tsx feeds it rows it
// already fetched; nothing here queries or stores.

/** Combined cap, confirmed and pending together (spec decision 5: the
 *  owner's answer to cap collisions, chosen over a slot-guarantee rule). */
export const CARD_REGION_CAP = 5

export type NeedLabelValue = { text: string; needsViewer: boolean }

/** The dense-face ladder (spec decision 6): the label names the card's
 *  highest outstanding need, the viewer's own before anyone else's, and is
 *  absent when the card needs nothing. A confirmed card's only outstanding
 *  need is now the viewer's RSVP: the open-proposal branch that used to sit
 *  here left with the card's footer notice (card-region-height slice, task
 *  6) — the vote itself still exists, it just doesn't advertise from here
 *  anymore. */
export function eventNeedLabel(viewerRsvp: "IN" | "OUT" | null): NeedLabelValue | null {
  if (viewerRsvp === null) return { text: "Needs your RSVP", needsViewer: true }
  return null
}

/** What the event surfaces show for a plan that has been called off. The
 *  label is not a need, so it never renders teal: teal in that slot means
 *  "this needs you". Shared by the detail screen and the home card so the
 *  two can never disagree about the word. */
export const CANCELLED_LABEL: NeedLabelValue = { text: "Called off", needsViewer: false }

/** The card's label ladder, now with a status rung above it. A called-off
 *  plan needs nothing from anybody, so no need label can outrank it. */
export function eventCardLabel(
  isCancelled: boolean,
  viewerRsvp: "IN" | "OUT" | null
): NeedLabelValue | null {
  if (isCancelled) return CANCELLED_LABEL
  return eventNeedLabel(viewerRsvp)
}

export function ideaNeedLabel(
  viewerAnswer: "IN" | "OUT" | "NOT_THAT_DAY" | null
): NeedLabelValue | null {
  if (viewerAnswer === null) return { text: "Needs your vote", needsViewer: true }
  if (viewerAnswer === "IN") return { text: "Needs other votes", needsViewer: false }
  // A declined viewer's card is dropped before it ever gets here.
  return null
}

export type RegionEntry<E, I> =
  | { kind: "event"; sortMs: number; data: E }
  | { kind: "idea"; sortMs: number; item: I }

/** One list, pure date order, kinds mingled; a same-instant tie goes to the
 *  confirmed plan. Overflow past the cap simply is not shown in the region;
 *  chat still carries every item. */
export function composeCardRegion<E, I>(
  events: { sortMs: number; data: E }[],
  ideas: { sortMs: number; item: I }[],
  cap: number = CARD_REGION_CAP
): RegionEntry<E, I>[] {
  const entries: RegionEntry<E, I>[] = [
    ...events.map((e) => ({ kind: "event" as const, sortMs: e.sortMs, data: e.data })),
    ...ideas.map((i) => ({ kind: "idea" as const, sortMs: i.sortMs, item: i.item })),
  ]
  entries.sort((a, b) => {
    if (a.sortMs !== b.sortMs) return a.sortMs - b.sortMs
    if (a.kind === b.kind) return 0
    return a.kind === "event" ? -1 : 1
  })
  return entries.slice(0, cap)
}
