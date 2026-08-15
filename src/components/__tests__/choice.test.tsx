// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { ChoiceChip, ChipRow, TallyLine, ErrorLine, RsvpOption } from "../choice"

afterEach(cleanup)

describe("ChoiceChip", () => {
  it("renders the bare label unselected and the checkmark when selected", () => {
    render(
      <form>
        <ChoiceChip name="answer" value="IN" label="🍻 I'm in" selected={false} quiet={false} disabled={false} />
        <ChoiceChip name="answer" value="OUT" label="🙏 Next time" selected={true} quiet={true} disabled={false} />
      </form>
    )
    expect(screen.getByRole("button", { name: "🍻 I'm in" })).toBeDefined()
    expect(screen.getByRole("button", { name: "✓ 🙏 Next time" })).toBeDefined()
  })

  it("never uses the action color in any state", () => {
    render(
      <form>
        <ChoiceChip name="answer" value="IN" label="I'm in" selected={true} quiet={false} disabled={false} />
      </form>
    )
    const btn = screen.getByRole("button", { name: "✓ I'm in" })
    expect(btn.style.backgroundColor).toBe("var(--surface-self)")
    expect(btn.style.border).not.toContain("--action")
  })
})

describe("ChipRow", () => {
  it("applies the given margin and lays children out in a wrapping row", () => {
    render(
      <ChipRow margin="8px 0 0 37px">
        <span>one</span>
        <span>two</span>
      </ChipRow>
    )
    const row = screen.getByText("one").parentElement as HTMLElement
    expect(row.style.margin).toBe("8px 0px 0px 37px")
    expect(row.style.display).toBe("flex")
    expect(row.style.flexWrap).toBe("wrap")
    expect(screen.getByText("two")).toBeDefined()
  })
})

describe("TallyLine", () => {
  it("renders nothing for an empty line", () => {
    const { container } = render(<TallyLine line="" />)
    expect(container.innerHTML).toBe("")
  })
  it("renders the line when present", () => {
    render(<TallyLine line="Rowan is in so far · one more makes it happen" />)
    expect(screen.getByText("Rowan is in so far · one more makes it happen")).toBeDefined()
  })
})

describe("ErrorLine", () => {
  it("renders nothing for a null message", () => {
    const { container } = render(<ErrorLine msg={null} />)
    expect(container.innerHTML).toBe("")
  })
  it("renders the message when present", () => {
    render(<ErrorLine msg="The plan already changed, take a look up top." />)
    expect(screen.getByText("The plan already changed, take a look up top.")).toBeDefined()
  })
})

describe("RsvpOption", () => {
  it("ask state: transparent fill, action border, no checkmark", () => {
    render(
      <form>
        <RsvpOption value="IN" label="I'm in" state="ask" disabled={false} padding="0.375rem 0.75rem" radius="24px" />
      </form>
    )
    const btn = screen.getByRole("button", { name: "I'm in" })
    expect(btn.style.backgroundColor).toBe("transparent")
    expect(btn.style.border).toBe("1.5px solid var(--action)")
  })
  it("pick state: action fill, ink text, checkmark", () => {
    render(
      <form>
        <RsvpOption value="OUT" label="Can't make it" state="pick" disabled={false} padding="0.375rem 0.75rem" radius="24px" />
      </form>
    )
    const btn = screen.getByRole("button", { name: "✓ Can't make it" })
    expect(btn.style.backgroundColor).toBe("var(--action)")
    expect(btn.style.color).toBe("var(--action-ink)")
  })
  it("other state: hairline border, secondary text, no checkmark", () => {
    render(
      <form>
        <RsvpOption value="IN" label="I'm in" state="other" disabled={false} padding="0.375rem 0.75rem" radius="24px" />
      </form>
    )
    const btn = screen.getByRole("button", { name: "I'm in" })
    expect(btn.style.border).toBe("1.5px solid var(--hairline)")
    expect(btn.style.color).toBe("var(--text-secondary)")
  })

  // Card-region-height slice, task 5: the 44px tap-target floor is a prop
  // the caller opts into, not a default on RsvpOption itself. minHeight is
  // a floor, not a fixed height, so content taller than 44px is still free
  // to grow (the project's layout-never-clips rule).
  it("takes an explicit minHeight as a floor, never a fixed height", () => {
    render(
      <form>
        <RsvpOption
          value="IN"
          label="I'm in"
          state="ask"
          disabled={false}
          padding="0.375rem 0.75rem"
          radius="24px"
          minHeight="44px"
        />
      </form>
    )
    const btn = screen.getByRole("button", { name: "I'm in" })
    expect(btn.style.minHeight).toBe("44px")
    expect(btn.style.height).toBe("")
  })

  it("with no minHeight given, renders with no minHeight at all", () => {
    render(
      <form>
        <RsvpOption value="IN" label="I'm in" state="ask" disabled={false} padding="0.375rem 0.75rem" radius="24px" />
      </form>
    )
    const btn = screen.getByRole("button", { name: "I'm in" })
    expect(btn.style.minHeight).toBe("")
  })
})
