"use client"

// The horizontal rail the event cards sit on: one swipe per card, snapped.
//
// It carried a row of dots under the cards until 17 Aug 2026, tracking the
// snapped index off scroll position so the marker could never disagree with
// what was actually showing. They are gone, by the owner's call, and the
// reasoning is worth keeping: the next card already peeks past the right
// edge, which says "there is more" without spending a row, so the dots were
// restating a signal the layout already gave. On this screen a row is the
// scarce thing (the card-region-height slice measured why). Deleting them
// also took the component's only piece of state, its scroll listener, and
// the snappedIndex helper: nothing else needed to know which card was up.

// Single source of truth for the rail's card gap (fix-wave 1 Finding 7b:
// this used to be hardcoded twice, once in rem and once as a bare px
// literal, which only agreed at the default root font size). One copy now,
// but kept named rather than inlined so a second reader can never reappear
// without noticing this note.
const RAIL_GAP_REM = 0.625

export function CarouselRail({ cardCount, children }: { cardCount: number; children: React.ReactNode }) {
  const peek = cardCount > 1

  return (
    <div
      className={peek ? "scrollbar-hidden" : undefined}
      style={{
        display: "flex",
        gap: `${RAIL_GAP_REM}rem`,
        overflowX: peek ? "auto" : "visible",
        scrollSnapType: peek ? "x mandatory" : undefined,
        scrollPaddingLeft: peek ? 16 : undefined,
        padding: peek ? "0 16px" : undefined,
        scrollbarWidth: peek ? "none" : undefined,
      }}
    >
      {children}
    </div>
  )
}
