// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { CarouselRail, snappedIndex } from "@/app/groups/[id]/CarouselRail"

afterEach(cleanup)

describe("snappedIndex", () => {
  it("maps scroll positions to the nearest snapped card", () => {
    // 342px card + 10px gap on a 390px screen (handoff geometry)
    expect(snappedIndex(0, 342, 10)).toBe(0)
    expect(snappedIndex(352, 342, 10)).toBe(1)
    expect(snappedIndex(340, 342, 10)).toBe(1) // nearly there rounds forward
    expect(snappedIndex(170, 342, 10)).toBe(0) // under halfway rounds back
    expect(snappedIndex(704, 342, 10)).toBe(2)
  })

  it("is safe at zero width", () => {
    expect(snappedIndex(120, 0, 10)).toBe(0)
  })
})

describe("CarouselRail", () => {
  it("renders one dot per card with the first active", () => {
    const { container } = render(
      <CarouselRail cardCount={3}>
        <div>a</div>
        <div>b</div>
        <div>c</div>
      </CarouselRail>
    )
    const dots = container.querySelectorAll("[data-dot]")
    expect(dots.length).toBe(3)
    expect((dots[0] as HTMLElement).style.width).toBe("17px")
    expect((dots[1] as HTMLElement).style.width).toBe("6px")
  })

  it("renders no dots for a single card", () => {
    const { container } = render(
      <CarouselRail cardCount={1}>
        <div>a</div>
      </CarouselRail>
    )
    expect(container.querySelectorAll("[data-dot]").length).toBe(0)
  })
})
