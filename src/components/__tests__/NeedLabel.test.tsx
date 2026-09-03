// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { NeedLabel, CancelledLabel } from "../NeedLabel"

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
  it("renders as a bare, unwrapped span: the caller owns the row it sits in", () => {
    const { container } = render(
      <NeedLabel value={{ text: "Needs your vote", needsViewer: true }} />
    )
    const root = container.firstElementChild as HTMLElement
    expect(root.tagName).toBe("SPAN")
    expect(root.style.color).toBe("var(--action)")
  })
})

// CancelledLabel is a sibling export, not a NeedLabel variant: these guard
// that it renders bright regardless of the value's needsViewer flag, and
// that NeedLabel's own needsViewer-conditioned color above is untouched by
// its existence (owner's phone QA, 3 Sept 2026).
describe("CancelledLabel", () => {
  it("renders nothing when given no value", () => {
    const { container } = render(<CancelledLabel value={null} />)
    expect(container.innerHTML).toBe("")
  })

  it("renders the called-off status in bright text-primary, not the grey NeedLabel would give a false needsViewer", () => {
    render(<CancelledLabel value={{ text: "Called off", needsViewer: false }} />)
    const el = screen.getByText("Called off")
    expect(el.style.color).toBe("var(--text-primary)")
    expect(el.style.textTransform).toBe("uppercase")
  })

  it("matches NeedLabel's geometry exactly, size and weight, only the color differs", () => {
    render(<CancelledLabel value={{ text: "Called off", needsViewer: false }} />)
    const el = screen.getByText("Called off")
    expect(el.style.fontSize).toBe("var(--type-eyebrow)")
    expect(el.style.fontWeight).toBe("700")
    expect(el.style.letterSpacing).toBe("0.14em")
  })
})
