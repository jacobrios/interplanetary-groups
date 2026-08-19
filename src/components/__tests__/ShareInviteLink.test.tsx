// @vitest-environment jsdom
//
// The one contract under test: the same button shares where the browser can
// share and copies where it cannot (spec decision 10). navigator.share and
// navigator.clipboard do not exist in jsdom, which makes the fallback branch
// the natural default here and the share branch an explicit stub.

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react"
import ShareInviteLink from "../ShareInviteLink"

afterEach(() => {
  cleanup()
  // Remove any share/clipboard stubs a test installed
  delete (navigator as unknown as Record<string, unknown>).share
  delete (navigator as unknown as Record<string, unknown>).clipboard
  vi.restoreAllMocks()
})

describe("ShareInviteLink", () => {
  it("renders the teal share label", () => {
    render(<ShareInviteLink inviteToken="tok-1" groupName="Climbing Crew" />)
    expect(screen.getByRole("button", { name: "Share invite link" })).toBeDefined()
  })

  it("uses navigator.share with the full join URL when the browser has it", async () => {
    const share = vi.fn<(data?: ShareData) => Promise<void>>(async () => {})
    Object.defineProperty(navigator, "share", { value: share, configurable: true })

    render(<ShareInviteLink inviteToken="tok-2" groupName="Climbing Crew" />)
    fireEvent.click(screen.getByRole("button", { name: "Share invite link" }))

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1))
    const arg = share.mock.calls[0][0]
    expect(arg?.url).toContain("/join/tok-2")
  })

  it("falls back to clipboard copy with Copied! feedback when share is absent", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => {})
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    })

    render(<ShareInviteLink inviteToken="tok-3" groupName="Climbing Crew" />)
    fireEvent.click(screen.getByRole("button", { name: "Share invite link" }))

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(writeText.mock.calls[0][0]).toContain("/join/tok-3")
    expect(await screen.findByRole("button", { name: "Copied!" })).toBeDefined()
  })

  it("sizes the pill with a min-height and real vertical padding, never a fixed height", () => {
    // "Layout grows with content, never clips": this shipped as a fixed 46px
    // height with zero vertical padding, which spills the label out of the
    // pill at an enlarged device text size. The resting 46px is the design's
    // (.s3-sharebtn), so it stays, as a floor.
    render(<ShareInviteLink inviteToken="tok-4" groupName="Climbing Crew" />)
    const btn = screen.getByRole("button", { name: "Share invite link" })

    expect(btn.style.height).toBe("")
    expect(btn.style.minHeight).toBe("2.875rem")
    expect(btn.style.paddingTop).toBe("0.625rem")
    expect(btn.style.paddingBottom).toBe("0.625rem")
  })
})
