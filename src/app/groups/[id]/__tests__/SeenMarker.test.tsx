// @vitest-environment jsdom
//
// The action is mocked: what is under test is that the marker fires it exactly
// once per mount with the group it was given, not what the action does, which
// has its own database tests next door.

import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"

// vi.mock factories are hoisted above the file's own top-level statements, so
// a plain `const markGroupSeenAction = vi.fn(...)` referenced directly inside
// the factory below throws "Cannot access before initialization": the
// factory runs (as part of resolving SeenMarker's own import graph) before
// this file's const has initialized. vi.hoisted lifts the declaration itself
// above that point, which is the documented fix for this exact ordering.
const { markGroupSeenAction } = vi.hoisted(() => ({
  markGroupSeenAction: vi.fn(() => Promise.resolve()),
}))
vi.mock("@/app/actions/group-seen", () => ({ markGroupSeenAction }))

import SeenMarker from "../SeenMarker"

// The flush is not tidiness, it closes a real teardown race. This file settles
// transitions outside act(), and React answers a commit that carries passive
// effects by queueing a deferred flush through its scheduler, which in Node is
// a setImmediate. That callback's first statement reads `window.event`. If
// vitest disposes the jsdom environment before it runs, the callback fires
// against a torn-down global and the run reddens with
// "ReferenceError: window is not defined", attributed to whichever file
// happened to be running at the time rather than to this one. Draining the
// queue inside act() after each unmount leaves nothing pending at teardown.
//
// Worth knowing before copying or deleting this: the race is NOT specific to
// this file, and it is older than it. Three test files this branch never
// touched (RsvpControls, ProposalChips, GroupProposalChips) carry the same
// pattern and reproduce the same error, so a global flush in a vitest setup
// file is the real fix; this local one only keeps this file from adding to it.
afterEach(async () => {
  cleanup()
  await act(async () => {
    await new Promise((resolve) => setImmediate(resolve))
  })
  markGroupSeenAction.mockClear()
})

describe("SeenMarker", () => {
  it("records the read position once, for the group it is given", async () => {
    render(<SeenMarker groupId="grp_1" viewerId="usr_1" />)
    expect(markGroupSeenAction).toHaveBeenCalledTimes(1)
    expect(markGroupSeenAction).toHaveBeenCalledWith("grp_1")
  })

  it("stays silent when nobody is signed in", () => {
    render(<SeenMarker groupId="grp_1" viewerId={null} />)
    expect(markGroupSeenAction).not.toHaveBeenCalled()
  })

  it("renders nothing", () => {
    const { container } = render(<SeenMarker groupId="grp_1" viewerId="usr_1" />)
    expect(container.firstChild).toBeNull()
  })

  it("fires again when the same instance is handed a different group", () => {
    const { rerender } = render(<SeenMarker groupId="grp_1" viewerId="usr_1" />)
    expect(markGroupSeenAction).toHaveBeenCalledTimes(1)
    expect(markGroupSeenAction).toHaveBeenCalledWith("grp_1")

    rerender(<SeenMarker groupId="grp_2" viewerId="usr_1" />)
    expect(markGroupSeenAction).toHaveBeenCalledTimes(2)
    expect(markGroupSeenAction).toHaveBeenLastCalledWith("grp_2")
  })

  // The action's own try/catch covers what happens inside the server
  // function. It cannot cover the trip: a dropped connection, a 500, or a
  // stale action id after a deploy while the tab was open all reject the
  // promise the client is holding. A rejected async transition surfaces to
  // the nearest error boundary, which for this component is the group home's
  // own src/app/error.tsx, so an unrecorded read position would replace the
  // product's main screen with "Something broke on our end."
  it("swallows a failed trip rather than letting it reach an error boundary", async () => {
    // React reports an unhandled transition failure by rethrowing it out of
    // band, so it can arrive as either kind of process-level event depending
    // on the path. Both are watched, because catching only one would make
    // this test green for the wrong reason.
    const escaped: unknown[] = []
    const record = (reason: unknown) => escaped.push(reason)
    process.on("unhandledRejection", record)
    process.on("uncaughtException", record)

    markGroupSeenAction.mockRejectedValueOnce(new Error("Failed to fetch"))
    const { container } = render(<SeenMarker groupId="grp_1" viewerId="usr_1" />)

    // Two macrotask turns: enough for the transition's promise to settle and
    // for an escaped failure to be reported if nothing caught it.
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    process.off("unhandledRejection", record)
    process.off("uncaughtException", record)
    expect(escaped).toEqual([])
    expect(container.firstChild).toBeNull()
  })
})
