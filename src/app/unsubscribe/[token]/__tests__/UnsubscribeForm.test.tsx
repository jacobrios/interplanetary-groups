// @vitest-environment jsdom
//
// vi.mock factories are hoisted above the file's own top-level statements, so
// a plain `const unsubscribeAction = vi.fn(...)` referenced directly inside
// the factory below throws "Cannot access before initialization": the
// factory runs (as part of resolving UnsubscribeForm's own import graph)
// before this file's const has initialized. vi.hoisted lifts the declaration
// itself above that point, which is the documented fix for this exact
// ordering (see SeenMarker.test.tsx).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react"

const { unsubscribeAction, resubscribeAction } = vi.hoisted(() => ({
  unsubscribeAction: vi.fn<(token: string) => Promise<"ok" | "service_error">>(),
  resubscribeAction: vi.fn<(token: string) => Promise<"ok" | "service_error">>(),
}))
vi.mock("@/app/actions/unsubscribe", () => ({ unsubscribeAction, resubscribeAction }))

import UnsubscribeForm from "../UnsubscribeForm"

beforeEach(() => {
  unsubscribeAction.mockResolvedValue("ok")
  resubscribeAction.mockResolvedValue("ok")
})

// Why the flush: this file settles transitions outside act(), and React answers
// a commit carrying passive effects by queueing a deferred flush through its
// scheduler (a setImmediate in Node) whose first statement reads `window.event`.
// If vitest disposes the jsdom environment first, the run reddens with
// "ReferenceError: window is not defined", blamed on whichever file was running
// rather than this one. Draining the queue inside act() leaves nothing pending.
// Fuller note, including the three pre-existing files with the same pattern, is
// in src/app/groups/[id]/__tests__/SeenMarker.test.tsx. As of 2 Sept 2026
// vitest.setup.ts does this for every jsdom file, so this local copy is
// redundant rather than wrong, and was left in place.
afterEach(async () => {
  cleanup()
  await act(async () => {
    await new Promise((resolve) => setImmediate(resolve))
  })
  unsubscribeAction.mockReset()
  resubscribeAction.mockReset()
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

  // The whole reason the action returns a result. A member told "you're
  // unsubscribed" over a write that never landed keeps getting mail they
  // believe they stopped, and the only thing left to reach for is the spam
  // button, which is what the `updates.` subdomain split exists to prevent.
  describe("when the write does not land", () => {
    it("says so instead of confirming, and does not claim the opt-out", async () => {
      unsubscribeAction.mockResolvedValue("service_error")
      render(<UnsubscribeForm token="tok_1" />)
      fireEvent.click(screen.getByRole("button", { name: "Stop sending me these" }))

      expect(await screen.findByText(/nothing has changed yet/)).toBeTruthy()
      expect(screen.queryByText(/unsubscribed\. Orbit/)).toBeNull()
    })

    it("leaves the button usable so the tap can be repeated", async () => {
      unsubscribeAction.mockResolvedValue("service_error")
      render(<UnsubscribeForm token="tok_1" />)
      const button = screen.getByRole("button", { name: "Stop sending me these" })
      fireEvent.click(button)
      await screen.findByText(/nothing has changed yet/)

      expect((button as HTMLButtonElement).disabled).toBe(false)

      // The retry succeeds, and the failure line goes with it.
      unsubscribeAction.mockResolvedValue("ok")
      fireEvent.click(button)
      expect(await screen.findByText(/unsubscribed\. Orbit/)).toBeTruthy()
      expect(unsubscribeAction).toHaveBeenCalledTimes(2)
    })

    // A rejected async transition surfaces to the nearest error boundary, so
    // without the caller's own catch a dropped connection would replace this
    // page with the error screen rather than a line the member can act on.
    it("treats a failed trip as a failure, not as an error boundary", async () => {
      const escaped: unknown[] = []
      const record = (reason: unknown) => escaped.push(reason)
      process.on("unhandledRejection", record)
      process.on("uncaughtException", record)

      unsubscribeAction.mockRejectedValue(new Error("Failed to fetch"))
      render(<UnsubscribeForm token="tok_1" />)
      fireEvent.click(screen.getByRole("button", { name: "Stop sending me these" }))

      expect(await screen.findByText(/nothing has changed yet/)).toBeTruthy()
      await new Promise((resolve) => setTimeout(resolve, 0))

      process.off("unhandledRejection", record)
      process.off("uncaughtException", record)
      expect(escaped).toEqual([])
    })

    it("uses no dashes in its failure copy either", async () => {
      unsubscribeAction.mockResolvedValue("service_error")
      const { container } = render(<UnsubscribeForm token="tok_1" />)
      fireEvent.click(screen.getByRole("button", { name: "Stop sending me these" }))
      await screen.findByText(/nothing has changed yet/)

      expect(container.textContent).not.toMatch(/[—–]/)
    })
  })

  // The way back. Somebody who unsubscribed by accident, or whose forwarded
  // digest let another person do it for them, must not need the owner to
  // hand-edit the database.
  describe("the way back in, from the confirmation screen", () => {
    async function unsubscribeFirst() {
      render(<UnsubscribeForm token="tok_1" />)
      fireEvent.click(screen.getByRole("button", { name: "Stop sending me these" }))
      await screen.findByText(/unsubscribed\. Orbit/)
    }

    it("offers a way back on the confirmation screen", async () => {
      await unsubscribeFirst()

      expect(
        await screen.findByRole("button", { name: /Didn.t mean to\? Turn them back on/ })
      ).toBeTruthy()
    })

    it("calls resubscribeAction with the same token when tapped", async () => {
      await unsubscribeFirst()

      fireEvent.click(await screen.findByRole("button", { name: /Turn them back on/ }))

      await waitFor(() => expect(resubscribeAction).toHaveBeenCalledWith("tok_1"))
    })

    it("confirms it landed instead of leaving the unsubscribed copy standing", async () => {
      await unsubscribeFirst()

      fireEvent.click(await screen.findByRole("button", { name: /Turn them back on/ }))

      expect(await screen.findByText(/You.re back on\. Orbit/)).toBeTruthy()
      expect(screen.queryByText(/unsubscribed\. Orbit/)).toBeNull()
    })

    it("uses no dashes in the way-back copy or its confirmation", async () => {
      // A single render, captured once: the earlier version of this test
      // called the unsubscribeFirst() helper (which renders its own,
      // never-unmounted instance) and then rendered a second instance,
      // asserting against the second instance's container while clicking
      // the first instance's button (Testing Library resolves
      // getAllByRole across the whole, unswept document.body). The
      // container under test never actually reached the way-back or
      // confirmation copy, so an em dash in either string would have
      // passed silently. This version clicks and asserts against the same
      // container the whole way through.
      const { container } = render(<UnsubscribeForm token="tok_1" />)
      fireEvent.click(screen.getByRole("button", { name: "Stop sending me these" }))
      await screen.findByText(/unsubscribed\. Orbit/)
      expect(container.textContent).not.toMatch(/[—–]/)

      fireEvent.click(screen.getByRole("button", { name: /Turn them back on/ }))
      await screen.findByText(/You.re back on\. Orbit/)
      expect(container.textContent).not.toMatch(/[—–]/)
    })

    describe("when the resubscribe write does not land", () => {
      it("says so instead of confirming, and does not claim it landed", async () => {
        resubscribeAction.mockResolvedValue("service_error")
        await unsubscribeFirst()

        fireEvent.click(await screen.findByRole("button", { name: /Turn them back on/ }))

        expect(await screen.findByText(/nothing has changed yet/)).toBeTruthy()
        expect(screen.queryByText(/You.re back on\. Orbit/)).toBeNull()
      })

      it("leaves the control usable so the tap can be repeated", async () => {
        resubscribeAction.mockResolvedValue("service_error")
        await unsubscribeFirst()

        const control = await screen.findByRole("button", { name: /Turn them back on/ })
        fireEvent.click(control)
        await screen.findByText(/nothing has changed yet/)

        // resubPending (from useTransition) clears when the transition's own
        // promise settles; the error text commits from a separate
        // setResubFailed(true) call inside that same async handler. Those are
        // two distinct scheduled updates, usually landing in one commit but
        // never guaranteed to, so sampling `disabled` synchronously right
        // after awaiting the error text can land in the gap between the two
        // commits and read the button as still disabled. Poll instead of
        // sampling once.
        await waitFor(() => expect((control as HTMLButtonElement).disabled).toBe(false))

        resubscribeAction.mockResolvedValue("ok")
        fireEvent.click(control)
        expect(await screen.findByText(/You.re back on\. Orbit/)).toBeTruthy()
        expect(resubscribeAction).toHaveBeenCalledTimes(2)
      })
    })
  })
})
