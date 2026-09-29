// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import InstallHintAsk from "../InstallHintAsk"

function setup() {
  const onShowMe = vi.fn()
  const onClose = vi.fn()
  render(<InstallHintAsk onShowMe={onShowMe} onClose={onClose} />)
  return { onShowMe, onClose }
}

describe("InstallHintAsk", () => {
  it("is a labelled modal dialog carrying the small-sheet copy", () => {
    setup()
    const dialog = screen.getByRole("dialog")
    expect(dialog.getAttribute("aria-modal")).toBe("true")
    const id = dialog.getAttribute("aria-labelledby")!
    expect(document.getElementById(id)?.textContent).toBe("Use Orbit like an app?")
    expect(screen.getByText("Add it as an icon to your home screen.")).toBeTruthy()
  })

  it("has two equal-weight outlined buttons, neither teal", () => {
    setup()
    const show = screen.getByRole("button", { name: "Show me" })
    const no = screen.getByRole("button", { name: "Not now" })
    for (const b of [show, no]) {
      expect(b.getAttribute("style")).toMatch(/flex: 1 1 0px/)
      expect(b.style.minHeight).toBe("48px")
      expect(b.style.borderRadius).toBe("26px")
      expect(b.style.border).toBe("1.6px solid var(--hairline)")
      expect(b.style.backgroundColor).toBe("transparent")
      expect(b.style.fontWeight).toBe("700")
    }
    expect(show.style.color).toBe(no.style.color)
    expect(show.style.color).not.toMatch(/action|teal/)
  })

  it("lets the button row wrap, each button keeping a minimum width, so they stack at large text", () => {
    setup()
    const show = screen.getByRole("button", { name: "Show me" })
    const no = screen.getByRole("button", { name: "Not now" })
    expect((show.parentElement as HTMLElement).style.flexWrap).toBe("wrap")
    expect(no.parentElement).toBe(show.parentElement)
    for (const b of [show, no]) expect(b.style.minWidth).toBe("140px")
  })

  it("Show me calls onShowMe only", () => {
    const { onShowMe, onClose } = setup()
    fireEvent.click(screen.getByRole("button", { name: "Show me" }))
    expect(onShowMe).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it("Not now swaps to the closing note in the same single dialog without closing", () => {
    const { onShowMe, onClose } = setup()
    fireEvent.click(screen.getByRole("button", { name: "Not now" }))
    expect(onClose).not.toHaveBeenCalled()
    expect(onShowMe).not.toHaveBeenCalled()
    expect(screen.getAllByRole("dialog")).toHaveLength(1)
    const dialog = screen.getByRole("dialog")
    const id = dialog.getAttribute("aria-labelledby")!
    expect(document.getElementById(id)?.textContent).toBe(
      "No problem. Find the steps anytime:",
    )
    expect(screen.queryByText("Use Orbit like an app?")).toBeNull()
    expect(screen.queryByRole("button", { name: "Show me" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Not now" })).toBeNull()
    expect(screen.getByText("Tap the group's name at the top of the screen")).toBeTruthy()
    expect(screen.getByText("Look under \u201COn your phone\u201D")).toBeTruthy()
  })

  it("the closing note has two 24px numbered circles and a full-width outlined Got it", () => {
    setup()
    fireEvent.click(screen.getByRole("button", { name: "Not now" }))
    const one = screen.getByText("1")
    const two = screen.getByText("2")
    for (const c of [one, two]) {
      expect(c.style.width).toBe("24px")
      expect(c.style.height).toBe("24px")
      expect(c.style.fontWeight).toBe("700")
      expect(c.style.backgroundColor).toBe("var(--surface-raised)")
      expect(c.style.border).toBe("1px solid var(--hairline)")
    }
    const got = screen.getByRole("button", { name: "Got it" })
    expect(got.style.width).toBe("100%")
    expect(got.style.minHeight).toBe("48px")
    expect(got.style.borderRadius).toBe("26px")
    expect(got.style.border).toBe("1.6px solid var(--hairline)")
    expect(got.style.backgroundColor).toBe("transparent")
    expect(got.style.color).not.toMatch(/action|teal/)
  })

  it("moves focus to the dialog when the note appears, and the trap still holds", () => {
    setup()
    const no = screen.getByRole("button", { name: "Not now" })
    no.focus()
    fireEvent.click(no)
    expect(document.activeElement).toBe(screen.getByRole("dialog"))
    const got = screen.getByRole("button", { name: "Got it" })
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true })
    expect(document.activeElement).toBe(got)
    fireEvent.keyDown(document, { key: "Tab" })
    expect(document.activeElement).toBe(got)
  })

  it("Got it closes", () => {
    const { onClose } = setup()
    fireEvent.click(screen.getByRole("button", { name: "Not now" }))
    fireEvent.click(screen.getByRole("button", { name: "Got it" }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("Escape and the scrim close from the note state too", () => {
    const { onClose } = setup()
    fireEvent.click(screen.getByRole("button", { name: "Not now" }))
    fireEvent.keyDown(document, { key: "Escape" })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole("dialog").parentElement!)
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it("closes on Escape and the scrim from the ask state without showing the note, not on a tap inside, and the scrim is lighter", () => {
    const { onClose } = setup()
    fireEvent.keyDown(document, { key: "Escape" })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole("dialog"))
    expect(onClose).toHaveBeenCalledTimes(1)
    const scrim = screen.getByRole("dialog").parentElement!
    expect(scrim.style.backgroundColor.replace(/\s/g, "")).toBe("rgba(8,9,13,0.45)")
    fireEvent.click(scrim)
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(screen.queryByText("No problem. Find the steps anytime:")).toBeNull()
  })

  it("moves focus in, locks scroll, restores both on unmount", () => {
    const opener = document.createElement("button")
    document.body.appendChild(opener)
    opener.focus()
    document.body.style.overflow = "scroll"
    const { unmount } = render(<InstallHintAsk onShowMe={() => {}} onClose={() => {}} />)
    expect(document.activeElement).toBe(screen.getByRole("dialog"))
    expect(document.body.style.overflow).toBe("hidden")
    unmount()
    expect(document.activeElement).toBe(opener)
    expect(document.body.style.overflow).toBe("scroll")
    document.body.style.overflow = ""
    opener.remove()
  })

  it("traps Tab between its two buttons", () => {
    setup()
    const show = screen.getByRole("button", { name: "Show me" })
    const no = screen.getByRole("button", { name: "Not now" })
    no.focus()
    fireEvent.keyDown(document, { key: "Tab" })
    expect(document.activeElement).toBe(show)
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true })
    expect(document.activeElement).toBe(no)
  })
})
