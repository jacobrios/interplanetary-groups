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

  it("Show me calls onShowMe only; Not now calls onClose only", () => {
    const { onShowMe, onClose } = setup()
    fireEvent.click(screen.getByRole("button", { name: "Show me" }))
    expect(onShowMe).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Not now" }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("closes on Escape and the scrim, not on a tap inside, and the scrim is lighter", () => {
    const { onClose } = setup()
    fireEvent.keyDown(document, { key: "Escape" })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole("dialog"))
    expect(onClose).toHaveBeenCalledTimes(1)
    const scrim = screen.getByRole("dialog").parentElement!
    expect(scrim.style.backgroundColor.replace(/\s/g, "")).toBe("rgba(8,9,13,0.45)")
    fireEvent.click(scrim)
    expect(onClose).toHaveBeenCalledTimes(2)
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
