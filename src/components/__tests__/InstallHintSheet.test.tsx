// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import InstallHintSheet from "../InstallHintSheet"

function setup(browser: "safari" | "chrome") {
  const onClose = vi.fn()
  render(
    <InstallHintSheet
      browser={browser}
      buttonLabel="Not now"
      onClose={onClose}
    />
  )
  return onClose
}

describe("InstallHintSheet", () => {
  it("shows the Safari steps and pictures", () => {
    setup("safari")
    expect(screen.getByText("Share").tagName).toBe("STRONG")
    expect(screen.getByText(/at the bottom/)).toBeTruthy()
    expect(screen.getByText("View More")).toBeTruthy()
    expect(screen.getByText("Add to Home Screen")).toBeTruthy()
    const srcs = screen.getAllByRole("img").map((i) => i.getAttribute("src"))
    expect(srcs).toEqual([
      "/install-hint/safari-share.png",
      "/install-hint/safari-view-more.png",
      "/install-hint/add-to-home-screen.png",
    ])
    screen.getAllByRole("img").forEach((i) => expect(i.getAttribute("alt")).toBeTruthy())
  })

  it("shows the Chrome steps and pictures", () => {
    setup("chrome")
    expect(screen.getByText(/in the address bar/)).toBeTruthy()
    const srcs = screen.getAllByRole("img").map((i) => i.getAttribute("src"))
    expect(srcs).toEqual([
      "/install-hint/chrome-share.png",
      "/install-hint/chrome-view-more.png",
      "/install-hint/add-to-home-screen.png",
    ])
  })

  it("is a labelled modal dialog", () => {
    setup("safari")
    const dialog = screen.getByRole("dialog")
    expect(dialog.getAttribute("aria-modal")).toBe("true")
    const id = dialog.getAttribute("aria-labelledby")!
    expect(document.getElementById(id)?.textContent).toBe("Follow the 3 steps below to add its icon.")
  })

  it("has the one lead line and neither the old heading nor subline", () => {
    setup("safari")
    const lead = screen.getByText("Follow the 3 steps below to add its icon.")
    expect(lead.tagName).toBe("H2")
    expect(lead.style.fontSize).toBe("1.125rem")
    expect(lead.style.fontWeight).toBe("700")
    expect(screen.queryByText("Use Orbit like an app?")).toBeNull()
    expect(screen.queryByText("Three taps.")).toBeNull()
  })

  it("frames each picture, and rules off the button area", () => {
    setup("safari")
    for (const img of screen.getAllByRole("img")) {
      const picture = img.parentElement!
      expect(picture.style.border).toBe("1px solid var(--hairline)")
      expect(picture.style.borderRadius).toBe("10px")
      const frame = picture.parentElement!
      expect(frame.style.marginLeft).toBe("36px")
      expect(frame.style.marginTop).toBe("8px")
      expect(frame.style.padding).toBe("8px")
      expect(frame.style.backgroundColor).toBe("var(--surface-base)")
      expect(frame.style.borderRadius).toBe("14px")
    }
    const area = screen.getByRole("button", { name: "Not now" }).parentElement!
    expect(area.style.borderTop).toBe("1px solid var(--hairline)")
    expect(area.style.marginTop).toBe("4px")
    expect(area.style.paddingTop).toBe("20px")
  })

  it("closes on the button, Escape and the scrim, but not on a tap inside", () => {
    const onClose = setup("safari")
    fireEvent.click(screen.getByRole("button", { name: "Not now" }))
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(document, { key: "Escape" })
    expect(onClose).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByRole("dialog"))
    expect(onClose).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByRole("dialog").parentElement!)
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it("moves focus in on open, locks scroll, and restores both on unmount", () => {
    const opener = document.createElement("button")
    document.body.appendChild(opener)
    opener.focus()
    document.body.style.overflow = "scroll"
    const { unmount } = render(
      <InstallHintSheet browser="safari" buttonLabel="Not now" onClose={() => {}} />
    )
    expect(document.activeElement).toBe(screen.getByRole("dialog"))
    expect(document.body.style.overflow).toBe("hidden")
    unmount()
    expect(document.activeElement).toBe(opener)
    expect(document.body.style.overflow).toBe("scroll")
    document.body.style.overflow = ""
    opener.remove()
  })

  it("traps Tab on the only button", () => {
    setup("safari")
    const button = screen.getByRole("button", { name: "Not now" })
    button.focus()
    fireEvent.keyDown(document, { key: "Tab" })
    expect(document.activeElement).toBe(button)
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true })
    expect(document.activeElement).toBe(button)
  })
})
