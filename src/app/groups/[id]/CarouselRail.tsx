// The horizontal rail the event cards sit on: one swipe per card, snapped.
//
// A SERVER component, as of 17 Aug 2026, which it had not been since it was
// split out of EventCarousel. The split existed because the dot row tracked
// the snapped card off scroll position, and that needed the client; with the
// dots gone this holds no state, no handler and no hook, so "use client" was
// shipping a styled div to the browser to hydrate it into the same styled
// div. It stays a separate file rather than folding back into EventCarousel,
// because the rail's own rules (snap, hidden scrollbar, peek padding, the
// gap constant) are the thing that must not drift.
//
// It also carried a row of dots under the cards until 17 Aug 2026, tracking the
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

// `peek` rather than a card count: the count itself is nobody's business
// here any more (it fed the dot row's `Array.from`), and a caller passing a
// number that this file immediately reduces to one boolean is a second
// derivation of a fact EventCarousel already holds.
export function CarouselRail({ peek, children }: { peek: boolean; children: React.ReactNode }) {

  return (
    <div
      className={peek ? "scrollbar-hidden" : undefined}
      style={{
        display: "flex",
        gap: `${RAIL_GAP_REM}rem`,
        overflowX: peek ? "auto" : "visible",
        // Double-tap fix, 2 Sept 2026. Setting overflow-x alone made this a
        // scroll container on BOTH axes: CSS blockifies the other axis when
        // one is not `visible`, so overflow-y computed to `auto` here with
        // nobody having written it. A two-axis scroll container whose
        // touch-action is `auto` must hold a touch to work out whether it is
        // a horizontal pan, a vertical pan or a tap, and that is the
        // configuration iOS Safari is known to spend a first touch on.
        // Declaring pan-x says the rail only ever pans horizontally, so a
        // stationary touch has nothing to disambiguate. It forbids vertical
        // panning OF THE RAIL, which is already impossible (scrollHeight ===
        // clientHeight, measured); the page still scrolls, because that
        // gesture belongs to the feed below.
        //
        // Honest about its own status: this was never observed eating a tap.
        // It is reasoned from the computed styles, the pane is Chromium, and
        // the only instrument that could confirm it is a real iPhone. It is
        // here because it is free, layout-neutral and well motivated, not
        // because it is proven.
        touchAction: peek ? "pan-x" : undefined,
        // The second axis stated rather than left to a blockification rule
        // nobody wrote down. Changes nothing on screen: the rail does not
        // overflow vertically, and `auto` was already clipping the same way.
        overflowY: peek ? "hidden" : undefined,
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
