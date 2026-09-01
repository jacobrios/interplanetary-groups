// @vitest-environment jsdom
//
// The send interaction's client contract, which is the whole of slice one.
//
// What these tests exist to hold, and why they are worth their weight: the
// comment block in GroupHome.tsx said Orbit's read "never reaches ChatInput's
// disabled" and called that "the whole architecture of this slice." It was not
// true. `startDetection` was called from inside `startTransition`'s async
// callback, so React scoped the two together and the outer transition stayed
// pending until Orbit's request finished. Measured on a local production build
// (build-notes §11): the member's own message appeared in 6-19ms at 0.65
// opacity and only turned solid at 5034-6484ms, exactly when Orbit finished.
//
// So the architecture claim now has a test under it rather than a comment.
//
// Both server actions are mocked, in the style of RsvpControls.test.tsx.
// detectIntentAction is a DEFERRED promise the test resolves by hand, which is
// what turns "the send is done but Orbit is not" into an observable state
// instead of a race.

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

/** The real message the server would hand back after revalidation. */
function confirmed(body: string): FeedMessage {
  return {
    id: "m1",
    authorType: MessageAuthor.MEMBER,
    authorId: "u1",
    authorName: "Alex",
    body,
    createdAt: new Date("2026-08-31T12:00:00Z"),
  }
}

/**
 * The rendered opacity of EVERY bubble carrying `text`, in document order.
 * 0.65 is MessageFeed's "not sent yet"; 1 is confirmed. Reading the style the
 * feed actually applies, rather than the isPending flag, keeps this a test of
 * what a member sees.
 *
 * It returns a list rather than one number because the count is half the bug.
 * While the send's transition is still open, useOptimistic layers its
 * optimistic entry on top of the base list, so once revalidation has delivered
 * the real row the member sees their own message TWICE: the confirmed copy at
 * full strength and the optimistic one greyed out beneath it. Asserting a
 * single solid bubble catches both the greying and the duplicate.
 */
function bubbleOpacities(text: string): number[] {
  return screen.getAllByText(text).map((leaf) => {
    let node: HTMLElement | null = leaf as HTMLElement
    let lowest = 1
    while (node) {
      const raw = node.style?.opacity
      if (raw) lowest = Math.min(lowest, Number(raw))
      node = node.parentElement
    }
    return lowest
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

  it("lets the member's message go solid as soon as the send lands, without waiting for Orbit", async () => {
    // The un-entanglement itself. Orbit is left thinking for the whole test;
    // the send has already returned. A member must not be looking at their own
    // message greyed out while that is true.
    const orbit = deferred<DetectIntentResult>()
    detectMock.mockImplementation(() => orbit.promise)

    const view = renderHome([])
    await send("is this sent yet")

    // Revalidation delivering the real row is what the server does next; the
    // suite cannot run that round trip, so the prop update stands in for it.
    await act(async () => {
      view.rerender(
        <GroupHome
          groupId="g1"
          initialMessages={[confirmed("is this sent yet")]}
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
    })

    // Orbit is still working. The member must be looking at exactly one copy
    // of their message, reading as sent.
    expect(detectMock).toHaveBeenCalled()
    expect(bubbleOpacities("is this sent yet")).toEqual([1])

    await act(async () => {
      orbit.resolve({ status: "quiet" })
    })
  })

  it("releases the optimistic entry the moment the send lands, with no revalidation needed", async () => {
    // The sharpest form of the un-entanglement, and the shape that found the
    // real root cause. initialMessages stays empty and nothing is rerendered,
    // so the ONLY thing that can put a bubble on screen is the optimistic
    // entry. If the send's transition has settled, useOptimistic has reverted
    // to that empty base and the bubble is gone.
    //
    // Before the fix this read 1 while Orbit was still working and dropped to
    // 0 the instant Orbit finished, which is what proved the two were joined.
    const orbit = deferred<DetectIntentResult>()
    detectMock.mockImplementation(() => orbit.promise)

    renderHome([])
    await send("probe")

    expect(detectMock).toHaveBeenCalled()
    expect(screen.queryAllByText("probe")).toHaveLength(0)

    await act(async () => {
      orbit.resolve({ status: "quiet" })
    })
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
