// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import FeedSeam from "../FeedSeam"

afterEach(cleanup)

describe("FeedSeam", () => {
  it("renders what it wraps", () => {
    render(
      <FeedSeam>
        <p>the conversation</p>
      </FeedSeam>
    )
    expect(screen.getByText("the conversation")).toBeDefined()
  })

  it("draws the hairline where the feed begins", () => {
    const { container } = render(<FeedSeam><p>x</p></FeedSeam>)
    const seam = container.firstElementChild as HTMLElement
    expect(seam.style.borderTop).toBe("1px solid var(--hairline)")
  })

  it("never intercepts a tap", () => {
    // The failure this exists to stop: the scrim is an overlay sitting on top
    // of the feed's first 18px, which is exactly where the topmost gauge chip
    // sits after a scroll. An overlay that takes pointer events makes that
    // chip untappable, and nothing about the screen would look wrong.
    const { container } = render(<FeedSeam><p>x</p></FeedSeam>)
    const scrim = container.querySelector("[data-seam-scrim]") as HTMLElement
    expect(scrim).not.toBeNull()
    expect(scrim.style.pointerEvents).toBe("none")
  })

  it("pins the scrim to the top edge rather than letting it scroll", () => {
    // Absolute positioning inside a scrolling element would scroll away with
    // the content. The scrim is therefore a sibling of the scroll region, not
    // a child of it, positioned against this component's own box.
    const { container } = render(<FeedSeam><p>x</p></FeedSeam>)
    const seam = container.firstElementChild as HTMLElement
    const scrim = container.querySelector("[data-seam-scrim]") as HTMLElement
    expect(seam.style.position).toBe("relative")
    expect(scrim.style.position).toBe("absolute")
    expect(scrim.style.top).toBe("0px")
  })
})
