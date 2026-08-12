"use client"

import { useRef, useState } from "react"

// One swipe per card; the active dot is derived from scroll position, so it
// can never disagree with what is actually snapped. Dots are chrome, not a
// control surface (handoff item 02): swipe is the interaction.
export function snappedIndex(scrollLeft: number, cardWidth: number, gap: number): number {
  // Guard on cardWidth alone, not cardWidth + gap: a zero-width card (before
  // layout has run, e.g. jsdom or the first paint) must snap safely to 0
  // even though the gap by itself is a positive, nonzero step.
  if (cardWidth <= 0) return 0
  const step = cardWidth + gap
  return Math.round(scrollLeft / step)
}

// Single source of truth for the rail's card gap, so the inline style below
// and the scroll-math constant used by handleScroll can never drift apart
// (fix-wave 1 Finding 7b: the two used to be independently hardcoded, one in
// rem and the other in a bare px literal, which only agreed at the default
// root font size).
const RAIL_GAP_REM = 0.625

export function CarouselRail({ cardCount, children }: { cardCount: number; children: React.ReactNode }) {
  const [active, setActive] = useState(0)
  const railRef = useRef<HTMLDivElement>(null)
  const peek = cardCount > 1
  // Rem honors the device text setting, so the gap's actual pixel size can
  // change at enlarged text. Read it back off the DOM (the value the browser
  // actually resolved RAIL_GAP_REM to) rather than re-deriving it from a
  // root-font-size assumption, so scroll math matches layout even if root
  // font size or the constant itself ever changes.
  const gapPx = () => {
    const rail = railRef.current
    const computed = rail ? parseFloat(getComputedStyle(rail).columnGap) : NaN
    return Number.isFinite(computed) ? computed : RAIL_GAP_REM * 16
  }

  const handleScroll = () => {
    const rail = railRef.current
    if (!rail) return
    const card = rail.firstElementChild as HTMLElement | null
    const width = card ? card.offsetWidth : 0
    const index = Math.min(cardCount - 1, Math.max(0, snappedIndex(rail.scrollLeft, width, gapPx())))
    setActive(index)
  }

  // Clamp rather than trust the last scroll-derived value: if a card drops
  // out from under the viewer while they're on the last card, `active` can
  // point past the new last index until the next scroll event, which would
  // render no dot as active at all.
  const activeIndex = Math.min(active, Math.max(0, cardCount - 1))

  return (
    <div>
      <div
        ref={railRef}
        onScroll={peek ? handleScroll : undefined}
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
      {peek ? (
        <div
          aria-hidden="true"
          style={{ display: "flex", justifyContent: "center", gap: 6, paddingTop: 11 }}
        >
          {Array.from({ length: cardCount }, (_, i) => (
            <i
              key={i}
              data-dot
              style={{
                width: i === activeIndex ? 17 : 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: i === activeIndex ? "var(--text-primary)" : "var(--hairline)",
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
