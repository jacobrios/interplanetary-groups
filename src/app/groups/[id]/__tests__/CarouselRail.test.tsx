// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { CarouselRail } from "@/app/groups/[id]/CarouselRail"

afterEach(cleanup)

describe("CarouselRail", () => {
  // The dots were deleted 17 Aug 2026: the next card already peeks past the
  // right edge, which says "there is more" without spending a row, and a row
  // is the scarce thing on this screen. snappedIndex and the scroll listener
  // went with them, since tracking the snapped card was the only reason the
  // rail held state at all.
  it("renders no dot row under the cards", () => {
    const { container } = render(
      <CarouselRail peek>
        <div>a</div>
        <div>b</div>
        <div>c</div>
      </CarouselRail>
    )
    expect(container.querySelectorAll("[data-dot]").length).toBe(0)
    expect(container.textContent).toBe("abc")
  })

  it("still swipes: more than one card makes the rail a snapping scroller", () => {
    const { container } = render(
      <CarouselRail peek>
        <div>a</div>
        <div>b</div>
        <div>c</div>
      </CarouselRail>
    )
    const rail = container.firstElementChild as HTMLElement
    expect(rail.style.overflowX).toBe("auto")
    expect(rail.style.scrollSnapType).toBe("x mandatory")
    expect(rail.className).toContain("scrollbar-hidden")
  })

  it("a single card neither scrolls nor snaps", () => {
    const { container } = render(
      <CarouselRail peek={false}>
        <div>a</div>
      </CarouselRail>
    )
    const rail = container.firstElementChild as HTMLElement
    expect(rail.style.overflowX).toBe("visible")
    expect(rail.style.scrollSnapType).toBe("")
  })

  // Double-tap fix, 2 Sept 2026, cause 2 of three. Setting overflow-x alone
  // makes this a scroll container on BOTH axes: CSS blockifies the other axis
  // when one is not `visible`, so overflow-y computed to `auto` here even
  // though nobody wrote it. A two-axis scroll container with touch-action
  // `auto` has to hold a touch to work out whether it is a pan-x, a pan-y or a
  // tap, which is the configuration iOS Safari is known to spend a first touch
  // on. Declaring pan-x says the rail only ever pans horizontally, so a
  // stationary touch has nothing to disambiguate and can go straight through.
  // pinch-zoom rides along with it deliberately; see the assertion below.
  //
  // WHAT THIS DOES NOT PROVE, and it is most of the claim: that any of this
  // eats a tap. That is an iOS Safari touch behaviour, jsdom implements
  // neither scroll-snap nor touch, and the browser pane is Chromium, so the
  // only instrument is a real phone. The hypothesis was never observed, only
  // reasoned from the computed styles. This case holds the mitigation in
  // place; it does not hold that the mitigation was needed.
  it("claims the horizontal pan and pinch-zoom, so a tap is not held for disambiguation", () => {
    const { container } = render(
      <CarouselRail peek>
        <div>a</div>
        <div>b</div>
      </CarouselRail>
    )
    const rail = container.firstElementChild as HTMLElement
    // pan-x AND pinch-zoom, never pan-x alone: pan-x on its own excludes
    // pinch-zoom, which would refuse a two-finger zoom over the top third of
    // the group home. The mitigation this belongs to is unproven, so it must
    // not cost an accessibility affordance that works today. This assertion is
    // exact rather than a substring match on purpose, so "simplifying" it back
    // to "pan-x" reddens here.
    expect(rail.style.touchAction).toBe("pan-x pinch-zoom")
    // The second axis stated rather than inherited from a blockification rule
    // nobody wrote down. Layout-neutral: the rail does not overflow
    // vertically (scrollHeight === clientHeight, measured), so this changes
    // nothing about what is on screen.
    expect(rail.style.overflowY).toBe("hidden")
  })

  it("claims nothing when there is one card, because there is no scroller", () => {
    const { container } = render(
      <CarouselRail peek={false}>
        <div>a</div>
      </CarouselRail>
    )
    const rail = container.firstElementChild as HTMLElement
    expect(rail.style.touchAction).toBe("")
    expect(rail.style.overflowY).toBe("")
  })
})
