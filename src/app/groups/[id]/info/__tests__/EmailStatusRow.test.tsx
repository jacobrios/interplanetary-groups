// @vitest-environment jsdom
//
// EmailStatusRow is the permanent way in that task 5's second ask promises:
// "Just tap [group name] at the top of the screen whenever you're ready."
// Unlike EmailAskNote it never goes away and nothing about tapping it counts
// against anything. It reuses EmailAttachFlow for the actual mechanics; this
// file covers the two collapsed states, the expand-to-flow transitions, and
// the one rule that matters most here: the address itself is never printed,
// even to its own owner.

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, fireEvent } from "@testing-library/react"
import EmailStatusRow from "../EmailStatusRow"
import type { AttachRequestResult, ConfirmAttachResult } from "@/lib/auth/email"

const requestMock = vi.fn<(email: string) => Promise<{ result: AttachRequestResult }>>(async () => ({
  result: "ok",
}))
const confirmMock = vi.fn<(email: string, code: string) => Promise<{ result: ConfirmAttachResult }>>(
  async () => ({ result: "ok" })
)

vi.mock("@/app/actions/email-ask", () => ({
  requestEmailAttachAction: (email: string) => requestMock(email),
  confirmEmailAttachAction: (email: string, code: string) => confirmMock(email, code),
}))

afterEach(() => {
  cleanup()
  requestMock.mockClear()
  confirmMock.mockClear()
  requestMock.mockImplementation(async () => ({ result: "ok" }))
  confirmMock.mockImplementation(async () => ({ result: "ok" }))
})

describe("EmailStatusRow, collapsed states", () => {
  it("offers to add an email when none is attached", () => {
    render(<EmailStatusRow hasVerifiedEmail={false} />)
    expect(screen.getByRole("button", { name: "Add your email" })).toBeDefined()
    expect(screen.queryByText(/Email reminders are on/)).toBeNull()
  })

  it("says reminders are on, with a way to change it, when one is attached", () => {
    render(<EmailStatusRow hasVerifiedEmail={true} />)
    expect(screen.getByText(/Email reminders are on/)).toBeDefined()
    expect(screen.getByRole("button", { name: "Change email" })).toBeDefined()
    expect(screen.queryByRole("button", { name: "Add your email" })).toBeNull()
  })

  it("never prints a stored address in either collapsed state", () => {
    const { container: off } = render(<EmailStatusRow hasVerifiedEmail={false} />)
    expect(off.textContent).not.toMatch(/@/)
    cleanup()
    const { container: on } = render(<EmailStatusRow hasVerifiedEmail={true} />)
    expect(on.textContent).not.toMatch(/@/)
  })

  // Fix round 1: the info page's wrapper is a flex column with no
  // alignItems, which defaults to stretch, and this repo has no button
  // reset. Without alignSelf: "flex-start" (which ManageMembers and
  // ResetInviteLink already set on this same page, for this same reason) a
  // bare <button> stretches to the column's full width and the user-agent
  // stylesheet centers its text. This is the state every member is in today,
  // since nobody has an email attached yet.
  it("keeps the add link from stretching full width and centering, like its peers on this page", () => {
    render(<EmailStatusRow hasVerifiedEmail={false} />)
    const link = screen.getByRole("button", { name: "Add your email" })
    expect(link.style.alignSelf).toBe("flex-start")
  })
})

describe("EmailStatusRow, adding an email", () => {
  it("expands to the attach flow and can be backed out of without saving", () => {
    render(<EmailStatusRow hasVerifiedEmail={false} />)
    fireEvent.click(screen.getByRole("button", { name: "Add your email" }))

    expect(screen.getByLabelText("Your email address")).toBeDefined()
    fireEvent.click(screen.getByRole("button", { name: "Never mind" }))

    expect(screen.getByRole("button", { name: "Add your email" })).toBeDefined()
    expect(requestMock).not.toHaveBeenCalled()
  })

  it("shows a neutral, non-Orbit line when a code is sent, not the default first-person one", async () => {
    render(<EmailStatusRow hasVerifiedEmail={false} />)
    fireEvent.click(screen.getByRole("button", { name: "Add your email" }))

    fireEvent.change(screen.getByLabelText("Your email address"), {
      target: { value: "sam@example.com" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await screen.findByLabelText("The code from your email")
    // The code-sent line still names the just-typed address (the member's own
    // input, not a stored value being displayed back), but it does not read
    // as Orbit speaking, since nothing on this page says Orbit is present.
    expect(screen.getByText("A code was sent to sam@example.com. Enter it below.")).toBeDefined()
    expect(screen.queryByText(/^I sent a code/)).toBeNull()
  })

  // Fix round 1: this test used to end by asserting the flow's own
  // "Saved..." line, which pinned a dead end. EmailAttachFlow hides its form
  // and cancel link once a save succeeds, with no control left to get back to
  // anything, and this row has no other way back short of navigating away and
  // returning. Since this row is permanent rather than a one-time ask, it
  // needs to stay usable right after it succeeds, so EmailStatusRow now
  // collapses itself back to the quiet attached state on the same signal
  // (onAttached) instead of leaving the box open on one sentence forever.
  // That collapse happens in the same render as the save succeeding, so the
  // flow's own done message never gets a chance to paint; "Email reminders
  // are on." is what confirms the save now; there is no separate visible
  // confirmation before it.
  it("collapses back to its quiet, permanent state once the address is saved", async () => {
    render(<EmailStatusRow hasVerifiedEmail={false} />)
    fireEvent.click(screen.getByRole("button", { name: "Add your email" }))

    fireEvent.change(screen.getByLabelText("Your email address"), {
      target: { value: "sam@example.com" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    const code = await screen.findByLabelText("The code from your email")
    fireEvent.change(code, { target: { value: "12345678" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(await screen.findByText(/Email reminders are on/)).toBeDefined()
    expect(screen.getByRole("button", { name: "Change email" })).toBeDefined()
    expect(screen.queryByLabelText("The code from your email")).toBeNull()
    expect(screen.queryByRole("button", { name: "Add your email" })).toBeNull()
  })
})

describe("EmailStatusRow, changing an email", () => {
  it("expands from the attached state with a change prompt, not the add prompt", () => {
    render(<EmailStatusRow hasVerifiedEmail={true} />)
    fireEvent.click(screen.getByRole("button", { name: "Change email" }))

    expect(screen.getByText("Enter the new address you'd like to use.")).toBeDefined()
    expect(screen.queryByText(/sign back in as yourself/)).toBeNull()
  })

  it("still never prints the previously stored address anywhere in the flow", async () => {
    render(<EmailStatusRow hasVerifiedEmail={true} />)
    fireEvent.click(screen.getByRole("button", { name: "Change email" }))

    fireEvent.change(screen.getByLabelText("Your email address"), {
      target: { value: "new@example.com" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await screen.findByLabelText("The code from your email")
    // Only the address just typed this session ever appears; the flow has no
    // way to read or render whatever was stored before.
    expect(screen.getByText(/new@example\.com/)).toBeDefined()
  })

  it("also collapses back to the attached state after a successful change", async () => {
    render(<EmailStatusRow hasVerifiedEmail={true} />)
    fireEvent.click(screen.getByRole("button", { name: "Change email" }))

    fireEvent.change(screen.getByLabelText("Your email address"), {
      target: { value: "new@example.com" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    const code = await screen.findByLabelText("The code from your email")
    fireEvent.change(code, { target: { value: "12345678" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(await screen.findByText(/Email reminders are on/)).toBeDefined()
    expect(screen.getByRole("button", { name: "Change email" })).toBeDefined()
  })
})

describe("EmailStatusRow, errors", () => {
  // Fix round 1: this used to assert EmailAttachFlow's default, Orbit-voiced
  // error copy ("Mind checking it?"), which contradicted the point of this
  // whole describe block and the row's own reasoning: nothing on this page
  // says Orbit is present, so an error here should read the same as the
  // success-path copy already does, not switch back to Orbit's voice the
  // moment something goes wrong.
  it("surfaces a rejected address in the row's own neutral voice, without leaving it stuck open on nothing", async () => {
    requestMock.mockImplementation(async () => ({ result: "invalid_email" }))
    render(<EmailStatusRow hasVerifiedEmail={false} />)
    fireEvent.click(screen.getByRole("button", { name: "Add your email" }))

    fireEvent.change(screen.getByLabelText("Your email address"), {
      target: { value: "not-an-address" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(
      await screen.findByText("That address doesn't look right. Check it and try again.")
    ).toBeDefined()
    expect(screen.queryByText("That address doesn't look right. Mind checking it?")).toBeNull()
  })
})

describe("EmailStatusRow, no em dash anywhere it renders", () => {
  it("holds across both collapsed states and the expanded flow", async () => {
    const { unmount } = render(<EmailStatusRow hasVerifiedEmail={true} />)
    expect(document.body.textContent).not.toMatch(/[\u2013\u2014]/)
    fireEvent.click(screen.getByRole("button", { name: "Change email" }))
    expect(document.body.textContent).not.toMatch(/[\u2013\u2014]/)
    unmount()
  })
})
