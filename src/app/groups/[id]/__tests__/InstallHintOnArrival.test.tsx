// @vitest-environment jsdom
//
// The one-time install sheet on the group home. UA and matchMedia are stubbed
// (as in the platform tests) so the real detection hook runs.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor, act } from "@testing-library/react"

import InstallHintOnArrival from "../InstallHintOnArrival"

const FLAG = "orbit.installHintShown"
const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36"

function stub(ua: string, standalone = false) {
  vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(ua)
  vi.stubGlobal("matchMedia", () => ({ matches: standalone }))
  Object.defineProperty(window.navigator, "standalone", { value: undefined, configurable: true })
}

const HEADING = "Use Orbit like an app?"

describe("InstallHintOnArrival", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("opens once for a non-founder on iPhone Safari and writes the flag at once", async () => {
    stub(IPHONE_SAFARI)
    render(<InstallHintOnArrival emailAskOffered={false} viewerIsFounder={false} />)
    expect(await screen.findByRole("dialog", { name: HEADING })).toBeTruthy()
    expect(screen.getByText("Put it on your home screen. It opens full screen, one tap away.")).toBeTruthy()
    expect(window.localStorage.getItem(FLAG)).not.toBeNull()
    screen.getByRole("button", { name: "Not now" }).click()
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })

  it("does not open when the flag is already set", async () => {
    stub(IPHONE_SAFARI)
    window.localStorage.setItem(FLAG, "1")
    render(<InstallHintOnArrival emailAskOffered={false} viewerIsFounder={false} />)
    await act(async () => {})
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("does not open when the email ask is offered, and leaves the flag unset", async () => {
    stub(IPHONE_SAFARI)
    render(<InstallHintOnArrival emailAskOffered={true} viewerIsFounder={false} />)
    await act(async () => {})
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(window.localStorage.getItem(FLAG)).toBeNull()
  })

  it("does not open for the founder", async () => {
    stub(IPHONE_SAFARI)
    render(<InstallHintOnArrival emailAskOffered={false} viewerIsFounder={true} />)
    await act(async () => {})
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("does not open in the installed app", async () => {
    stub(IPHONE_SAFARI, true)
    render(<InstallHintOnArrival emailAskOffered={false} viewerIsFounder={false} />)
    await act(async () => {})
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("does not open on Android", async () => {
    stub(ANDROID_CHROME)
    render(<InstallHintOnArrival emailAskOffered={false} viewerIsFounder={false} />)
    await act(async () => {})
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("does not open when reading storage throws", async () => {
    stub(IPHONE_SAFARI)
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked")
    })
    render(<InstallHintOnArrival emailAskOffered={false} viewerIsFounder={false} />)
    await act(async () => {})
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("does not open when writing storage throws", async () => {
    stub(IPHONE_SAFARI)
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked")
    })
    render(<InstallHintOnArrival emailAskOffered={false} viewerIsFounder={false} />)
    await act(async () => {})
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("holds its decision across re-renders: an open sheet stays open when the ask flips on", async () => {
    stub(IPHONE_SAFARI)
    const { rerender } = render(<InstallHintOnArrival emailAskOffered={false} viewerIsFounder={false} />)
    await screen.findByRole("dialog")
    rerender(<InstallHintOnArrival emailAskOffered={true} viewerIsFounder={false} />)
    expect(screen.getByRole("dialog")).toBeTruthy()
  })

  it("holds its decision across re-renders: a closed sheet does not reopen, and a skipped visit does not open later", async () => {
    stub(IPHONE_SAFARI)
    const { rerender, unmount } = render(<InstallHintOnArrival emailAskOffered={false} viewerIsFounder={false} />)
    await screen.findByRole("dialog")
    screen.getByRole("button", { name: "Not now" }).click()
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    window.localStorage.clear() // even with the flag gone, this mount already decided
    rerender(<InstallHintOnArrival emailAskOffered={false} viewerIsFounder={false} />)
    await act(async () => {})
    expect(screen.queryByRole("dialog")).toBeNull()
    unmount()

    const second = render(<InstallHintOnArrival emailAskOffered={true} viewerIsFounder={false} />)
    await act(async () => {})
    second.rerender(<InstallHintOnArrival emailAskOffered={false} viewerIsFounder={false} />)
    await act(async () => {})
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})
