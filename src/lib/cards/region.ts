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
 *  absent when the card needs nothing. */
export function eventNeedLabel(
  viewerRsvp: "IN" | "OUT" | null,
  openProposal: { viewerAnswer: "YES" | "KEEP" | null } | null
): NeedLabelValue | null {
  if (viewerRsvp === null) return { text: "Needs your RSVP", needsViewer: true }
  if (openProposal) {
    if (openProposal.viewerAnswer === null) return { text: "Needs your vote", needsViewer: true }
    return { text: "Needs other votes", needsViewer: false }
  }
  return null
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
