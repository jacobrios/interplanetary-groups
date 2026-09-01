// @vitest-environment jsdom
//
// The send interaction's client contract, which is the whole of slice one.
//
// An earlier version of this header explained the slice's latency bug as a
// transition-scope problem, because that is what the implementer believed at the
// time. It was wrong, and it is not restated here even as history, because a
// wrong mechanism written confidently at the top of a test file is exactly how
// this component acquired the false comment that hid the bug for weeks. The
// correct mechanism lives in GroupHome.tsx's own block and in build-notes §11.
//
// Both server actions are mocked, in the style of RsvpControls.test.tsx.
// detectIntentAction is a DEFERRED promise the test resolves by hand, which is
// what turns "the send is done but Orbit is not" into an observable state
// instead of a race.
//
// WHAT THIS FILE CANNOT SEE, AND WHY THAT IS WRITTEN HERE RATHER THAN LEARNED
// AGAIN THE HARD WAY. These mocks are plain async functions. A real server
// action is not: Next dispatches it inside a router-level transition, and
// useOptimistic holds its optimistic entry until every such transition settles.
// That is the actual reason a member's own message stayed greyed for the length
// of Orbit's model call, and NO test in this environment can reproduce it.
//
// This was not theoretical. An earlier version of this file carried a test
// asserting the optimistic entry was released as soon as the send landed. It
// passed, while the browser showed the message still greying for six seconds.
// It was deleted rather than kept, because a green test that cannot see the bug
// is worse than no test at all.
//
// So: the timing claims in this slice are held by browser measurement against a
// local production build (build-notes §11), never by this file. What lives here
// are the contracts that do survive mocking: the input is never disabled, Orbit
// is still called with the right id, the Orbit-down note still reaches the
// sender, a second send is accepted, and two sends never collide on a key.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, fireEvent, waitFor, act } from "@testing-library/react"
import { MessageAuthor } from "@prisma/client"

import GroupHome from "../GroupHome"
import type { FeedMessage } from "../MessageFeed"
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

/** A promise the test resolves when it chooses, standing in for Orbit thinking. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function renderHome(messages: FeedMessage[] = []) {
  return render(
    <GroupHome
      groupId="g1"
      initialMessages={messages}
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

function input() {
  return screen.getByPlaceholderText("Send a message…") as HTMLInputElement
}

async function send(text: string) {
  const field = input()
  fireEvent.change(field, { target: { value: text } })
  await act(async () => {
    fireEvent.submit(field.closest("form")!)
  })
}

beforeEach(() => {
  // jsdom implements no layout, so it has no scrollIntoView, and MessageFeed
  // calls it on every message change to keep the feed pinned to the bottom.
  // Stubbed rather than worked around: without it these tests fail on a
  // missing browser API instead of on the behavior under test.
  Element.prototype.scrollIntoView = vi.fn()
  sendMock.mockImplementation(async () => ({ messageId: "m1" }))
  detectMock.mockImplementation(async () => ({ status: "quiet" }))
})

afterEach(() => {
  cleanup()
  sendMock.mockReset()
  detectMock.mockReset()
  seenMock.mockReset()
})

describe("GroupHome: the send interaction", () => {
  it("never disables the chat input, so the keyboard is never taken away mid-send", async () => {
    // The owner's call, 31 Aug 2026: the message is already on screen and the
    // field is already cleared, so disabling only blocks the member. On iOS,
    // disabling a focused field also dismisses the keyboard and re-enabling
    // does not bring it back, which is the felt bug this removes by
    // construction rather than by hoping.
    const orbit = deferred<DetectIntentResult>()
    detectMock.mockImplementation(() => orbit.promise)

    renderHome()
    await send("hello")

    expect(input().disabled).toBe(false)

    await act(async () => {
      orbit.resolve({ status: "quiet" })
    })
    expect(input().disabled).toBe(false)
  })

  it("still hands the message to Orbit, with the id the send returned", async () => {
    // Guards against "fixed it by deleting the feature". Un-entangling Orbit
    // must not become not-calling Orbit.
    renderHome()
    await send("beers thursday?")

    await waitFor(() => expect(detectMock).toHaveBeenCalledTimes(1))
    expect(detectMock).toHaveBeenCalledWith("m1")
  })

  it("still tells the sender when Orbit could not read their message", async () => {
    // The one thing the sender is told besides their own message, and the
    // thing a careless un-entangling would quietly drop.
    detectMock.mockImplementation(async () => ({ status: "unavailable", reason: "credits" }))

    renderHome()
    await send("anyone up for climbing")

    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy())
  })

  it("keeps two same-millisecond sends distinct, so neither is swallowed by a key collision", async () => {
    // Reachable only because this slice stopped disabling the input. The
    // optimistic entry was keyed on Date.now() alone, so two sends inside one
    // millisecond produced two React children with the same key and one of the
    // messages was dropped from the feed. Fast typing plus a coarse clock is
    // not exotic; the clock is frozen here to make it deterministic rather
    // than to make it possible.
    // Asserted on React's own duplicate-key warning rather than on a missing
    // bubble, because today both bubbles do still render: React warns that the
    // behavior "is unsupported and could change in a future version" and
    // renders them anyway. Waiting for the version where it silently omits one
    // is not a plan, and the warning is the only signal available now.
    const frozen = vi.spyOn(Date, "now").mockReturnValue(1_756_600_000_000)
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    const first = deferred<SendMessageState>()
    sendMock.mockImplementation(() => first.promise)

    renderHome([])
    await send("one")
    await send("two")

    expect(screen.queryAllByText("one")).toHaveLength(1)
    expect(screen.queryAllByText("two")).toHaveLength(1)

    const duplicateKeyWarnings = consoleError.mock.calls
      .map((args) => String(args[0]))
      .filter((line) => line.includes("same key"))
    expect(duplicateKeyWarnings).toEqual([])

    consoleError.mockRestore()
    frozen.mockRestore()
    await act(async () => {
      first.resolve({ messageId: "m1" })
    })
  })

  it("accepts a second message while the first is still in flight", async () => {
    // The behavior the owner chose when he said never disable the input: a
    // member who thinks of something else does not have to wait their turn.
    const first = deferred<SendMessageState>()
    sendMock.mockImplementationOnce(() => first.promise)

    renderHome()
    await send("first one")
    await send("second one")

    expect(sendMock).toHaveBeenCalledTimes(2)

    await act(async () => {
      first.resolve({ messageId: "m1" })
    })
  })
})
