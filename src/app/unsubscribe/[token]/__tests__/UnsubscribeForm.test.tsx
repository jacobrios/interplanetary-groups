// @vitest-environment jsdom
//
// vi.mock factories are hoisted above the file's own top-level statements, so
// a plain `const unsubscribeAction = vi.fn(...)` referenced directly inside
// the factory below throws "Cannot access before initialization": the
// factory runs (as part of resolving UnsubscribeForm's own import graph)
// before this file's const has initialized. vi.hoisted lifts the declaration
// itself above that point, which is the documented fix for this exact
// ordering (see SeenMarker.test.tsx).

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react"

const { unsubscribeAction } = vi.hoisted(() => ({
  unsubscribeAction: vi.fn(() => Promise.resolve()),
}))
vi.mock("@/app/actions/unsubscribe", () => ({ unsubscribeAction }))

import UnsubscribeForm from "../UnsubscribeForm"

afterEach(() => {
  cleanup()
  unsubscribeAction.mockClear()
})

describe("UnsubscribeForm", () => {
  it("writes nothing until the button is pressed", () => {
    render(<UnsubscribeForm token="tok_1" />)
    expect(unsubscribeAction).not.toHaveBeenCalled()
  })

  it("records the opt-out and confirms it", async () => {
    render(<UnsubscribeForm token="tok_1" />)
    fireEvent.click(screen.getByRole("button", { name: "Stop sending me these" }))

    await waitFor(() => expect(unsubscribeAction).toHaveBeenCalledWith("tok_1"))
    // The rendered copy uses a curly apostrophe (&rsquo;), so the match
    // deliberately avoids one rather than quietly failing on it.
    expect(await screen.findByText(/unsubscribed\. Orbit/)).toBeTruthy()
  })

  it("says that sign-in codes keep working", async () => {
    render(<UnsubscribeForm token="tok_1" />)
    fireEvent.click(screen.getByRole("button", { name: "Stop sending me these" }))
    expect(await screen.findByText(/sign-in codes still work/)).toBeTruthy()
  })

  it("uses no dashes in its copy, per the product voice rule", () => {
    const { container } = render(<UnsubscribeForm token="tok_1" />)
    expect(container.textContent).not.toMatch(/[—–]/)
  })
})
