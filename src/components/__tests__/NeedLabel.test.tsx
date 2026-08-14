// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { NeedLabel } from "../NeedLabel"

afterEach(cleanup)

describe("NeedLabel", () => {
  it("renders nothing for a settled card", () => {
    const { container } = render(<NeedLabel value={null} />)
    expect(container.innerHTML).toBe("")
  })
  it("renders a needs-you label in the action teal", () => {
    render(<NeedLabel value={{ text: "Needs your RSVP", needsViewer: true }} />)
    const el = screen.getByText("Needs your RSVP")
    expect(el.style.color).toBe("var(--action)")
    expect(el.style.textTransform).toBe("uppercase")
  })
  it("renders an others-move label in quiet grey", () => {
    render(<NeedLabel value={{ text: "Needs other votes", needsViewer: false }} />)
    expect(screen.getByText("Needs other votes").style.color).toBe("var(--text-secondary)")
  })
  it("renders nothing for a settled card in inline mode too", () => {
    const { container } = render(<NeedLabel value={null} inline />)
    expect(container.innerHTML).toBe("")
  })
  it("inline mode skips the row wrapper: the text is the root node, unwrapped and unpadded", () => {
    const { container } = render(
      <NeedLabel value={{ text: "Needs your vote", needsViewer: true }} inline />
    )
    const root = container.firstElementChild as HTMLElement
    expect(root.tagName).toBe("SPAN")
    expect(root.style.color).toBe("var(--action)")
  })
})
