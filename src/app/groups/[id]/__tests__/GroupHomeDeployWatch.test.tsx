// @vitest-environment jsdom
//
// The wiring between GroupHome and DeployWatch, which DeployWatch's own test
// file cannot see: that the booted deployment id actually reaches it, that
// "the member is busy" is bound to the real composer and the real send
// counter, and that the trim in that binding does what it says.
//
// This is a deliberately separate file from DeployWatch.test.tsx because the
// two prove different things, and it exists at all because untested wiring is
// this repo's most repeated failure: a component can be perfect and still be
// handed a prop nobody ever connected.
//
// WHAT IT STILL CANNOT SEE, said plainly rather than learned later: the
// reload itself. No test here can produce two builds with different
// deployment ids, and jsdom cannot navigate. window.location.reload is a spy
// standing in for the browser, and whether our own fetch is genuinely
// unpinned by Vercel is provable only in production, against a real redeploy.
//
// The action and router mocks mirror GroupHomeDraft.test.tsx: GroupHome
// mounts SeenMarker and LiveRefresh, and neither can reach a real app-router
// tree from here.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

import GroupHome from "../GroupHome"
import { DEPLOYMENT_CHECK_INTERVAL_MS } from "../DeployWatch"
import type { SendMessageState } from "@/app/actions/send-message"
import type { DetectIntentResult } from "@/app/actions/detect-intent"

const sendMock = vi.fn(async (): Promise<SendMessageState> => ({ messageId: "m1" }))
const detectMock = vi.fn(async (): Promise<DetectIntentResult> => ({ status: "quiet" }))
const seenMock = vi.fn(async () => undefined)

vi.mock("@/app/actions/send-message", () => ({
  sendMessageAction: (...args: unknown[]) => sendMock(...(args as [])),
}))
vi.mock("@/app/actions/detect-intent", () => ({
  detectIntentAction: (...args: unknown[]) => detectMock(...(args as [])),
}))
vi.mock("@/app/actions/group-seen", () => ({
  markGroupSeenAction: (...args: unknown[]) => seenMock(...(args as [])),
}))
// GroupHome renders EmailAskNote, which reaches for these the moment a member
// touches the sheet. Nothing here taps them; they exist so the real sheet can
// be mounted rather than stubbed.
vi.mock("@/app/actions/email-ask", () => ({
  dismissEmailOfferAction: async () => ({ ok: true }),
  requestEmailAttachAction: async () => ({ result: "ok" }),
  confirmEmailAttachAction: async () => ({ result: "ok" }),
}))
const refreshMock = vi.fn()
const routerMock = { refresh: refreshMock }
vi.mock("next/navigation", () => ({ useRouter: () => routerMock }))

const reload = vi.fn()
let originalLocation: PropertyDescriptor | undefined

/** A member who has contributed and has never been asked: the sheet shows. */
const OPEN_SHEET = {
  groupName: "Climbing Crew",
  askState: { emailAskCount: 0, emailAskedAt: null },
  latestContributionAt: new Date("2026-08-25T18:00:00Z"),
  hasVerifiedEmail: false,
  lastShownAt: null,
  now: new Date("2026-08-26T18:00:00Z"),
}

function home(
  bootedDeploymentId: string | null,
  emailAsk: typeof OPEN_SHEET | null = null
) {
  return (
    <GroupHome
      groupId="g1"
      initialMessages={[]}
      viewerId="u1"
      viewerName="Alex"
      timeZone="America/New_York"
      gauges={[]}
      proposals={[]}
      groupProposals={[]}
      viewerIsMember
      emailAsk={emailAsk}
      bootedDeploymentId={bootedDeploymentId}
    />
  )
}

function composer() {
  return screen.getByPlaceholderText("Send a message…") as HTMLTextAreaElement
}

/** Advances one check interval and lets the fetch chain settle. */
async function passAnInterval() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(DEPLOYMENT_CHECK_INTERVAL_MS)
  })
}

/** Forces an immediate check without waiting a whole interval. */
async function returnToTheTab() {
  await act(async () => {
    window.dispatchEvent(new Event("focus"))
    await vi.advanceTimersByTimeAsync(0)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  // jsdom implements no layout; MessageFeed scrolls to the bottom on mount.
  Element.prototype.scrollIntoView = vi.fn()
  sendMock.mockImplementation(async () => ({ messageId: "m1" }))
  detectMock.mockImplementation(async () => ({ status: "quiet" }))
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ id: "dpl_new" }) }))
  )
  originalLocation = Object.getOwnPropertyDescriptor(window, "location")
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: { href: "http://localhost:3000/groups/g1", reload },
  })
})

afterEach(() => {
  cleanup()
  // The sheet writes a cooldown cookie the moment it shows, and jsdom keeps
  // one document.cookie for the whole file, so leaving it behind would
  // suppress the sheet in any later test that wanted it.
  document.cookie = "ipg_email_ask_shown=; max-age=0; path=/"
  if (originalLocation) Object.defineProperty(window, "location", originalLocation)
  reload.mockClear()
  sendMock.mockReset()
  detectMock.mockReset()
  seenMock.mockReset()
  refreshMock.mockClear()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("GroupHome hands DeployWatch what it needs", () => {
  it("reloads an idle tab onto a newer build, which proves the id is threaded at all", async () => {
    render(home("dpl_old"))

    await passAnInterval()

    expect(reload).toHaveBeenCalledTimes(1)
  })

  it("checks nothing when the page had no deployment id to hand down", async () => {
    render(home(null))

    await passAnInterval()

    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })

  it("waits while the member has typed something, and goes once the box is empty again", async () => {
    render(home("dpl_old"))

    fireEvent.change(composer(), { target: { value: "half a thought" } })
    await passAnInterval()
    expect(reload).not.toHaveBeenCalled()

    fireEvent.change(composer(), { target: { value: "" } })
    await passAnInterval()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  // The trim is a real transformation in that binding, not decoration: a
  // stray space is not a member mid-message, and the draft survives a reload
  // regardless, so treating whitespace as busy would leave a tab stale
  // forever over one accidental keystroke.
  it("does not count whitespace alone as a member being busy", async () => {
    render(home("dpl_old"))

    fireEvent.change(composer(), { target: { value: "   " } })
    await passAnInterval()

    expect(reload).toHaveBeenCalledTimes(1)
  })

  // The other half of "busy", bound to the send counter rather than the
  // composer. A send that never answers is used because it is the only way to
  // hold the counter above zero for long enough to observe; the counter is
  // bounded by GroupHome's own SEND_DEADLINE_MS, which is what releases it
  // in the second half of this test.
  it("waits while a send is still unanswered, and goes once that send has been given up on", async () => {
    sendMock.mockImplementation(() => new Promise<SendMessageState>(() => {}))
    render(home("dpl_old"))

    fireEvent.change(composer(), { target: { value: "hello" } })
    await act(async () => {
      fireEvent.submit(composer().closest("form")!)
    })
    // The composer is cleared at dispatch, so the only thing that can be
    // holding the reload back here is the send counter.
    expect(composer().value).toBe("")

    // Well inside the send deadline: the send is still outstanding.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })
    await returnToTheTab()
    expect(reload).not.toHaveBeenCalled()

    // Past the deadline: the member has been told it failed, so there is
    // nothing left to protect and the reload is allowed through.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000)
    })
    await returnToTheTab()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  // ── The expensive one, and the reason "busy" is no longer the composer ───
  //
  // The scenario, verbatim from the review that found it: a member opens the
  // email sheet, submits their address, switches to their mail app to get the
  // one-time code, and comes back. Returning to the tab is EXACTLY when this
  // component checks (the focus handler). The chat composer is empty and no
  // send is in flight, so before this fix the tab reloaded and took the sheet,
  // its step and the typed address with it, leaving a member holding a code
  // with nowhere to type it — in the sign-in flow an entire earlier slice
  // exists for.
  //
  // The real EmailAskNote is mounted rather than a stand-in div, which is the
  // point of putting this test here: DeployWatch's own file proves it honours
  // the selector, and this one proves the product's actual sheet is something
  // that selector matches.
  it("does not reload a tab return that lands on an open email sheet", async () => {
    document.cookie = "ipg_email_ask_shown=; max-age=0; path=/"
    render(home("dpl_old", OPEN_SHEET))

    expect(screen.getByRole("dialog")).toBeTruthy()

    await returnToTheTab()
    await passAnInterval()

    expect(reload).not.toHaveBeenCalled()
  })
})
