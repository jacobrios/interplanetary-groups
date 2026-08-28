// @vitest-environment jsdom
//
// The action is mocked: what is under test is that the marker fires it exactly
// once per mount with the group it was given, not what the action does, which
// has its own database tests next door.

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"

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

afterEach(() => {
  cleanup()
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
})
