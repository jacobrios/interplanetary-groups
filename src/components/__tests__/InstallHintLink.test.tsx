// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { renderToString } from "react-dom/server"
import InstallHintLink from "../InstallHintLink"

const SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36"

function device(ua: string, standalone = false) {
  vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(ua)
  vi.stubGlobal("matchMedia", () => ({ matches: standalone }))
  Object.defineProperty(window.navigator, "standalone", {
    value: false,
    configurable: true,
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("InstallHintLink", () => {
  it("renders nothing before mount, eyebrow included", () => {
    device(SAFARI)
    expect(renderToString(<InstallHintLink eyebrow="On your phone" />)).toBe("")
  })

  it("shows the link on iPhone Safari and opens the Safari sheet", () => {
    device(SAFARI)
    render(<InstallHintLink />)
    fireEvent.click(screen.getByRole("button", { name: "Use Orbit like an app" }))
    expect(screen.getByRole("dialog")).toBeTruthy()
    expect(screen.getByText("Put Orbit on your home screen")).toBeTruthy()
    expect(screen.getByText("It opens like an app, full screen, one tap away.")).toBeTruthy()
    expect(screen.getByText(/at the bottom/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Got it" }))
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("is quiet: underlined, secondary text, 44px tap target, no border", () => {
    device(SAFARI)
    render(<InstallHintLink />)
    const b = screen.getByRole("button", { name: "Use Orbit like an app" })
    expect(b.style.minHeight).toBe("44px")
    expect(b.style.textDecoration).toBe("underline")
    expect(b.style.color).toBe("var(--text-secondary)")
    expect(b.style.fontSize).toBe("var(--type-meta)")
  })

  it("renders nothing in the installed app", () => {
    device(SAFARI, true)
    const { container } = render(<InstallHintLink eyebrow="On your phone" />)
    expect(container.innerHTML).toBe("")
  })

  it("renders nothing on Android, and takes its eyebrow with it", () => {
    device(ANDROID)
    const { container } = render(<InstallHintLink eyebrow="On your phone" />)
    expect(container.innerHTML).toBe("")
    expect(screen.queryByText("On your phone")).toBeNull()
  })

  it("shows the eyebrow above the link when it renders", () => {
    device(SAFARI)
    render(<InstallHintLink eyebrow="On your phone" />)
    const eyebrow = screen.getByText("On your phone")
    const link = screen.getByRole("button", { name: "Use Orbit like an app" })
    expect(
      eyebrow.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })
})
