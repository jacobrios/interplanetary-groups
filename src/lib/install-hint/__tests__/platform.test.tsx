// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { installHintBrowser, useInstallHintBrowser } from "../platform"

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0.6613.98 Mobile/15E148 Safari/604.1"
const IPHONE_FIREFOX =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/130.0 Mobile/15E148 Safari/605.1.15"
const IPAD_SAFARI =
  "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36"
const DESKTOP_CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
const IPHONE_EDGE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/128.0 Version/18.0 Mobile/15E148 Safari/605.1.15"
const IPHONE_GOOGLE_APP =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/300.0 Mobile/15E148 Safari/604.1"

describe("installHintBrowser", () => {
  it("names iPhone Safari and iPhone Chrome", () => {
    expect(installHintBrowser(IPHONE_SAFARI, false)).toBe("safari")
    expect(installHintBrowser(IPHONE_CHROME, false)).toBe("chrome")
  })
  it("is null inside the installed app", () => {
    expect(installHintBrowser(IPHONE_SAFARI, true)).toBeNull()
    expect(installHintBrowser(IPHONE_CHROME, true)).toBeNull()
  })
  it("is null for everything else", () => {
    for (const ua of [IPHONE_FIREFOX, IPAD_SAFARI, ANDROID_CHROME, DESKTOP_CHROME, IPHONE_EDGE, IPHONE_GOOGLE_APP, ""]) {
      expect(installHintBrowser(ua, false)).toBeNull()
    }
  })
})

describe("useInstallHintBrowser", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  function stub(ua: string, standaloneMatch: boolean, navStandalone?: boolean) {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(ua)
    vi.stubGlobal("matchMedia", () => ({ matches: standaloneMatch }))
    Object.defineProperty(window.navigator, "standalone", { value: navStandalone, configurable: true })
  }

  it("returns null on the first render, then the answer after mount", async () => {
    stub(IPHONE_SAFARI, false)
    const seen: Array<string | null> = []
    const { result } = renderHook(() => {
      const b = useInstallHintBrowser()
      seen.push(b)
      return b
    })
    expect(seen[0]).toBeNull()
    await waitFor(() => expect(result.current).toBe("safari"))
  })

  it("stays null when display-mode is standalone", async () => {
    stub(IPHONE_SAFARI, true)
    const { result } = renderHook(() => useInstallHintBrowser())
    await new Promise((r) => setTimeout(r, 0))
    expect(result.current).toBeNull()
  })

  it("stays null when navigator.standalone is true", async () => {
    stub(IPHONE_CHROME, false, true)
    const { result } = renderHook(() => useInstallHintBrowser())
    await new Promise((r) => setTimeout(r, 0))
    expect(result.current).toBeNull()
  })
})
