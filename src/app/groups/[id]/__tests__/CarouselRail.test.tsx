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
      <CarouselRail cardCount={3}>
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
      <CarouselRail cardCount={3}>
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
      <CarouselRail cardCount={1}>
        <div>a</div>
      </CarouselRail>
    )
    const rail = container.firstElementChild as HTMLElement
    expect(rail.style.overflowX).toBe("visible")
    expect(rail.style.scrollSnapType).toBe("")
  })
})
