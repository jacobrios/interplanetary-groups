// @vitest-environment jsdom
//
// The composer's half-typed draft survives a full page reload.
//
// WHY THIS BEHAVIOUR EXISTS, because a reader will otherwise read draft
// persistence as a nicety and delete it. Vercel supplies a deployment id
// automatically, so Next's version-skew check is live in production, and
// LiveRefresh's 10s poll is what reaches it: on a mismatch Next calls
// location.replace() from inside its own render, unprompted and
// uninterceptable. That is a real full page load and it takes every piece of
// React state with it, the member's typed message included. The reload cannot
// be deferred without pausing chat sync for as long as somebody has text in the
// box, so the slice's answer is to make the reload harmless instead.
//
// WHAT THIS FILE CANNOT SEE, said here rather than learned again the hard way.
// It cannot see the reload. No test in this repo can produce two builds with
// different deployment ids inside one vitest run, jsdom has no Next router, and
// mocking the router would strip out the very behaviour at issue — this
// codebase has already deleted one test that mocked away the thing it claimed
// to prove (message-send-latency slice one). The reload is proved by a local
// two-build run through the production path instead. What lives here is the
// half that survives jsdom: that the draft is parked, restored, scoped to its
// own group, cleared on send, and that a composer whose storage is unreachable
// is still a working composer.
//
// The mocks mirror GroupHome.test.tsx: both server actions and next/navigation
// are stubbed, because GroupHome mounts SeenMarker and LiveRefresh and neither
// can reach a real app-router tree from here.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, fireEvent, act } from "@testing-library/react"

import GroupHome from "../GroupHome"
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
const refreshMock = vi.fn()
const routerMock = { refresh: refreshMock }
vi.mock("next/navigation", () => ({ useRouter: () => routerMock }))

/** The key shape the component owns. Spelled out literally rather than
 * imported, so a change to the key has to be made twice and noticed once. */
const keyFor = (groupId: string) => `ipg:draft:${groupId}`

function renderHome(groupId: string) {
  return render(
    <GroupHome
      groupId={groupId}
      initialMessages={[]}
      viewerId="u1"
      viewerName="Alex"
      timeZone="America/New_York"
      gauges={[]}
      proposals={[]}
      groupProposals={[]}
      viewerIsMember
      emailAsk={null}
    />
  )
}

function composer() {
  return screen.getByPlaceholderText("Send a message…") as HTMLTextAreaElement
}

beforeEach(() => {
  // jsdom implements no layout, so MessageFeed's scroll-to-bottom call has
  // nothing to call. Stubbed so these tests fail on their own assertions
  // rather than on a missing browser API.
  Element.prototype.scrollIntoView = vi.fn()
  sendMock.mockImplementation(async () => ({ messageId: "m1" }))
  detectMock.mockImplementation(async () => ({ status: "quiet" }))
  window.sessionStorage.clear()
})

afterEach(() => {
  cleanup()
  sendMock.mockReset()
  detectMock.mockReset()
  seenMock.mockReset()
  refreshMock.mockClear()
  window.sessionStorage.clear()
})

describe("GroupHome: the composer draft survives a reload", () => {
  it("parks what the member types in session storage", async () => {
    renderHome("g1")

    fireEvent.change(composer(), { target: { value: "see you at 7?" } })

    expect(window.sessionStorage.getItem(keyFor("g1"))).toBe("see you at 7?")
  })

  it("puts a parked draft back in the composer on mount", async () => {
    // The whole point of the slice: this is what the member sees after the
    // page has reloaded underneath them.
    window.sessionStorage.setItem(keyFor("g1"), "half a thought about climbing")

    await act(async () => {
      renderHome("g1")
    })

    expect(composer().value).toBe("half a thought about climbing")
  })

  it("never carries a draft between two groups", async () => {
    // The test in this file most likely to pass for the wrong reason: an
    // implementation that restores NOTHING would satisfy the second half on
    // its own. So the first half proves restoration is genuinely working in
    // this exact setup, with the only difference between the two halves being
    // which group id is in the key.
    window.sessionStorage.setItem(keyFor("g1"), "meant for g1")

    await act(async () => {
      renderHome("g1")
    })
    expect(composer().value).toBe("meant for g1")

    cleanup()
    window.sessionStorage.clear()

    window.sessionStorage.setItem(keyFor("g2"), "meant for g2")

    await act(async () => {
      renderHome("g1")
    })
    expect(composer().value).toBe("")
  })

  it("clears the parked draft when a send is dispatched", async () => {
    // Without this a sent message reappears in the composer after the next
    // reload, which reads as a message that failed to send.
    renderHome("g1")

    const field = composer()
    fireEvent.change(field, { target: { value: "beers thursday?" } })
    expect(window.sessionStorage.getItem(keyFor("g1"))).toBe("beers thursday?")

    await act(async () => {
      fireEvent.submit(field.closest("form")!)
    })

    expect(window.sessionStorage.getItem(keyFor("g1"))).toBeNull()
  })

  it("leaves the composer working and empty when session storage throws", async () => {
    // Private windows and browsers set to block site data do not return null,
    // they THROW, and they throw on both the read and the write. A member in
    // one of those still gets a working composer; all they lose is the draft.
    //
    // Both accessors are exercised, and the assertions are shaped so that
    // removing either try/catch is red rather than merely noisy: getItem is
    // asserted to have been CALLED (so an implementation that never reads is
    // red too), and an uncaught-error listener catches anything a React event
    // handler throws — jsdom reports those as a window "error" event rather
    // than propagating them out of fireEvent, so without this listener the
    // write-path mutation would print and pass.
    const calls = { get: 0, set: 0 }
    const hostile: Pick<Storage, "getItem" | "setItem" | "removeItem"> = {
      getItem: () => {
        calls.get += 1
        throw new DOMException("blocked", "SecurityError")
      },
      setItem: () => {
        calls.set += 1
        throw new DOMException("blocked", "SecurityError")
      },
      removeItem: () => {
        throw new DOMException("blocked", "SecurityError")
      },
    }
    const original = Object.getOwnPropertyDescriptor(window, "sessionStorage")
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get: () => hostile as Storage,
    })

    const uncaught: unknown[] = []
    const onError = (event: ErrorEvent) => {
      uncaught.push(event.error ?? event.message)
      event.preventDefault()
    }
    window.addEventListener("error", onError)

    try {
      await act(async () => {
        renderHome("g1")
      })

      expect(calls.get).toBeGreaterThan(0)
      expect(composer().value).toBe("")

      fireEvent.change(composer(), { target: { value: "still typing" } })

      expect(calls.set).toBeGreaterThan(0)
      expect(composer().value).toBe("still typing")
      expect(uncaught).toEqual([])
    } finally {
      window.removeEventListener("error", onError)
      if (original) Object.defineProperty(window, "sessionStorage", original)
      else delete (window as unknown as { sessionStorage?: unknown }).sessionStorage
    }
  })
})
