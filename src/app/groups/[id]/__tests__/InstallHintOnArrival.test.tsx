// @vitest-environment jsdom
//
// The one-time install sheet on the group home. UA and matchMedia are stubbed
// (as in the platform tests) so the real detection hook runs.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor, act } from "@testing-library/react"
import EmailAskNote from "../EmailAskNote"

import InstallHintOnArrival from "../InstallHintOnArrival"
import type { EmailAskNoteProps } from "../EmailAskNote"
import { EMAIL_ASK_SHOWN_COOKIE, markEmailAskShown } from "@/lib/auth/email-ask-cooldown"

const NOW = new Date("2026-08-26T18:00:00Z")
// Real-shaped inputs, as page.tsx builds them for every signed-in viewer. DUE
// means shouldOfferEmail says "first"; NOT_DUE has no contribution yet.
const ASK_DUE: EmailAskNoteProps = {
  groupName: "Climbing Crew",
  askState: { emailAskCount: 0, emailAskedAt: null },
  latestContributionAt: new Date("2026-08-25T18:00:00Z"),
  hasVerifiedEmail: false,
  lastShownAt: null,
  now: NOW,
}
const ASK_NOT_DUE: EmailAskNoteProps = { ...ASK_DUE, latestContributionAt: null }

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
    document.cookie = `${EMAIL_ASK_SHOWN_COOKIE}=; path=/; max-age=0`
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("opens once for a non-founder on iPhone Safari and writes the flag at once", async () => {
    stub(IPHONE_SAFARI)
    render(<InstallHintOnArrival emailAsk={ASK_NOT_DUE} viewerIsFounder={false} />)
    expect(await screen.findByRole("dialog", { name: HEADING })).toBeTruthy()
    expect(screen.getByText("Put it on your home screen. It opens full screen, one tap away.")).toBeTruthy()
    expect(window.localStorage.getItem(FLAG)).not.toBeNull()
    screen.getByRole("button", { name: "Not now" }).click()
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })

  it("does not open when the flag is already set", async () => {
    stub(IPHONE_SAFARI)
    window.localStorage.setItem(FLAG, "1")
    render(<InstallHintOnArrival emailAsk={ASK_NOT_DUE} viewerIsFounder={false} />)
    await act(async () => {})
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("does not open when the email ask is due, and leaves the flag unset", async () => {
    stub(IPHONE_SAFARI)
    render(<InstallHintOnArrival emailAsk={ASK_DUE} viewerIsFounder={false} />)
    await act(async () => {})
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(window.localStorage.getItem(FLAG)).toBeNull()
  })

  it("opens when the email ask is present but not due (no contribution yet)", async () => {
    stub(IPHONE_SAFARI)
    render(<InstallHintOnArrival emailAsk={ASK_NOT_DUE} viewerIsFounder={false} />)
    expect(await screen.findByRole("dialog", { name: HEADING })).toBeTruthy()
  })

  it("opens when the email ask is due but the snooze cookie says the sheet will not open", async () => {
    stub(IPHONE_SAFARI)
    markEmailAskShown(new Date())
    render(<InstallHintOnArrival emailAsk={ASK_DUE} viewerIsFounder={false} />)
    expect(await screen.findByRole("dialog", { name: HEADING })).toBeTruthy()
  })

  it("agrees with EmailAskNote: for the same inputs exactly one of the two sheets is up", async () => {
    stub(IPHONE_SAFARI)
    // Due ask, fresh cookie: the email sheet stays closed, the hint opens.
    markEmailAskShown(new Date())
    const a = render(
      <>
        <EmailAskNote {...ASK_DUE} />
        <InstallHintOnArrival emailAsk={ASK_DUE} viewerIsFounder={false} />
      </>
    )
    await screen.findByRole("dialog", { name: HEADING })
    expect(screen.getAllByRole("dialog")).toHaveLength(1)
    a.unmount()
    // Due ask, no cookie: the email sheet opens, the hint stays away.
    document.cookie = `${EMAIL_ASK_SHOWN_COOKIE}=; path=/; max-age=0`
    window.localStorage.clear()
    render(
      <>
        <EmailAskNote {...ASK_DUE} />
        <InstallHintOnArrival emailAsk={ASK_DUE} viewerIsFounder={false} />
      </>
    )
    await act(async () => {})
    expect(screen.getAllByRole("dialog")).toHaveLength(1)
    expect(screen.queryByRole("dialog", { name: HEADING })).toBeNull()
  })

  it("opens when there is no viewer to ask (emailAsk null)", async () => {
    stub(IPHONE_SAFARI)
    render(<InstallHintOnArrival emailAsk={null} viewerIsFounder={false} />)
    expect(await screen.findByRole("dialog", { name: HEADING })).toBeTruthy()
  })

  it("does not open for the founder", async () => {
    stub(IPHONE_SAFARI)
    render(<InstallHintOnArrival emailAsk={ASK_NOT_DUE} viewerIsFounder={true} />)
    await act(async () => {})
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("does not open in the installed app", async () => {
    stub(IPHONE_SAFARI, true)
    render(<InstallHintOnArrival emailAsk={ASK_NOT_DUE} viewerIsFounder={false} />)
    await act(async () => {})
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("does not open on Android", async () => {
    stub(ANDROID_CHROME)
    render(<InstallHintOnArrival emailAsk={ASK_NOT_DUE} viewerIsFounder={false} />)
    await act(async () => {})
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("does not open when reading storage throws", async () => {
    stub(IPHONE_SAFARI)
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked")
    })
    render(<InstallHintOnArrival emailAsk={ASK_NOT_DUE} viewerIsFounder={false} />)
    await act(async () => {})
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("does not open when writing storage throws", async () => {
    stub(IPHONE_SAFARI)
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked")
    })
    render(<InstallHintOnArrival emailAsk={ASK_NOT_DUE} viewerIsFounder={false} />)
    await act(async () => {})
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("holds its decision across re-renders: an open sheet stays open when the ask flips on", async () => {
    stub(IPHONE_SAFARI)
    const { rerender } = render(<InstallHintOnArrival emailAsk={ASK_NOT_DUE} viewerIsFounder={false} />)
    await screen.findByRole("dialog")
    rerender(<InstallHintOnArrival emailAsk={ASK_DUE} viewerIsFounder={false} />)
    expect(screen.getByRole("dialog")).toBeTruthy()
  })

  it("holds its decision across re-renders: a closed sheet does not reopen, and a skipped visit does not open later", async () => {
    stub(IPHONE_SAFARI)
    const { rerender, unmount } = render(<InstallHintOnArrival emailAsk={ASK_NOT_DUE} viewerIsFounder={false} />)
    await screen.findByRole("dialog")
    screen.getByRole("button", { name: "Not now" }).click()
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    window.localStorage.clear() // even with the flag gone, this mount already decided
    rerender(<InstallHintOnArrival emailAsk={ASK_NOT_DUE} viewerIsFounder={false} />)
    await act(async () => {})
    expect(screen.queryByRole("dialog")).toBeNull()
    unmount()

    const second = render(<InstallHintOnArrival emailAsk={ASK_DUE} viewerIsFounder={false} />)
    await act(async () => {})
    second.rerender(<InstallHintOnArrival emailAsk={ASK_NOT_DUE} viewerIsFounder={false} />)
    await act(async () => {})
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})
