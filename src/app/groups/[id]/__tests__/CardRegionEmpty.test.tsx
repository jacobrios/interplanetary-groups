// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import CardRegionEmpty from "../CardRegionEmpty"

afterEach(cleanup)

describe("CardRegionEmpty", () => {
  it("tells the member what to do instead of promising Orbit will handle it", () => {
    render(<CardRegionEmpty />)
    expect(screen.getByText("Nothing planned yet, float an idea in chat")).toBeDefined()
  })

  it("keeps the product-voice rule: no em dash", () => {
    // The design board drew this copy with an em dash. The rule stands, so the
    // dash became a comma. Pinned because copy gets retyped from boards.
    const { container } = render(<CardRegionEmpty />)
    expect(container.textContent).not.toMatch(/[—–]/)
  })

  it("keeps the sentence readable, not merely quiet", () => {
    // Pinned because the design board specified --text-faint here, which
    // measures ~3.8:1 against the page and is under the readability floor for
    // text this size. A future pass matching the board pixel for pixel would
    // reintroduce it silently.
    render(<CardRegionEmpty />)
    const line = screen.getByText("Nothing planned yet, float an idea in chat")
    expect(line.style.color).toBe("var(--text-secondary)")
  })

  it("is the quietest thing in the region: no fill, a dashed edge", () => {
    // It sits below both card kinds on the ladder. A dashed edge is the
    // roster's own "not yet" grammar, so this reads as an absence with a
    // border rather than as a card with nothing in it.
    const { container } = render(<CardRegionEmpty />)
    const box = container.firstElementChild as HTMLElement
    expect(box.style.border).toBe("1px dashed var(--hairline)")
    expect(box.style.backgroundColor).toBe("transparent")
  })
})
