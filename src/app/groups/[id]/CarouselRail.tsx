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

export function CarouselRail({ cardCount, children }: { cardCount: number; children: React.ReactNode }) {
  const [active, setActive] = useState(0)
  const railRef = useRef<HTMLDivElement>(null)
  const peek = cardCount > 1

  const handleScroll = () => {
    const rail = railRef.current
    if (!rail) return
    const card = rail.firstElementChild as HTMLElement | null
    const width = card ? card.offsetWidth : 0
    const index = Math.min(cardCount - 1, Math.max(0, snappedIndex(rail.scrollLeft, width, 10)))
    setActive(index)
  }

  return (
    <div>
      <div
        ref={railRef}
        onScroll={peek ? handleScroll : undefined}
        className={peek ? "scrollbar-hidden" : undefined}
        style={{
          display: "flex",
          gap: "0.625rem",
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
                width: i === active ? 17 : 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: i === active ? "var(--text-primary)" : "var(--hairline)",
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
