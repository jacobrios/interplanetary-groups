// @vitest-environment jsdom
//
// EmailStatusRow is the permanent way in that task 5's second ask promises:
// "Just tap [group name] at the top of the screen whenever you're ready."
// Unlike EmailAskNote it never goes away and nothing about tapping it counts
// against anything. It reuses EmailAttachFlow for the actual mechanics; this
// file covers the two collapsed states, the expand-to-flow transitions, and
// ~~the one rule that matters most here: the address itself is never printed,
// even to its own owner.~~
//
// Rewritten 27 August 2026, after the owner ran the product on his phone. The
// row printed no address and still offered "Change email", so a member holding
// more than one address could not tell which one he was replacing. The rule was
// amended (CLAUDE.md, data model: never shown to the group or to any other
// member, always shown to its owner), and this row is the one surface it names.
// What this file now covers instead: the owner's own address IS printed here,
// and only here, and only when there is one.
//
// The three findings this row was rebuilt around, all his:
//   1. "Email reminders are on" was a false affordance. It reads like a
//      setting that can be switched off. There is no switch.
//   2. The eyebrow above said EMAIL REMINDERS and the sentence under it said
//      "Email reminders" again.
//   3. The row was easy to miss entirely.
// The shape that answers all three is the eyebrow (on the page), then the
// address on its own line, then the control.

import { readFileSync } from "node:fs"
import path from "node:path"
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
  it("offers to add an email when none is attached, with no address line", () => {
    const { container } = render(<EmailStatusRow emailAddress={null} />)
    expect(screen.getByRole("button", { name: "Add your email" })).toBeDefined()
    // Nothing to show, so nothing is shown: no empty line, no placeholder.
    expect(container.textContent).not.toMatch(/@/)
  })

  it("shows the owner their own address, with a way to change it", () => {
    render(<EmailStatusRow emailAddress="sam@example.com" />)
    expect(screen.getByText("sam@example.com")).toBeDefined()
    expect(screen.getByRole("button", { name: "Change email" })).toBeDefined()
    expect(screen.queryByRole("button", { name: "Add your email" })).toBeNull()
  })

  it("no longer claims reminders are a setting, since there is no switch", () => {
    // The owner's first finding. "Email reminders are on." read as a state
    // that could be turned off, and nothing on this page or anywhere else can
    // turn it off. The address is the fact; there is no status sentence.
    render(<EmailStatusRow emailAddress="sam@example.com" />)
    expect(screen.queryByText(/reminders are on/i)).toBeNull()
    expect(screen.queryByText(/Email reminders/i)).toBeNull()
  })

  it("puts the address on a line of its own, above the control", () => {
    // The owner's call, and it is about width rather than taste: addresses
    // run long, the control sits under a 28rem column, and the two on one
    // line was already cramped before an address was in it. Asserted on the
    // DOM rather than on CSS, because "its own line" here means its own
    // element in a column, which is what survives a style refactor.
    render(<EmailStatusRow emailAddress="sam@example.com" />)
    const address = screen.getByText("sam@example.com")
    const control = screen.getByRole("button", { name: "Change email" })

    expect(address.contains(control)).toBe(false)
    expect(control.contains(address)).toBe(false)
    expect(address.parentElement).toBe(control.parentElement)
    expect(address.parentElement!.style.flexDirection).toBe("column")
  })

  // Superseded 3 Sept 2026, owner's phone QA: "Add your email" used to be a
  // quiet text link that had to be kept from stretching (the assertion this
  // replaced). It is a full-width outlined pill now, on the owner's explicit
  // request, because it is the state every member without an attached
  // address is in today, and that is the population most exposed to coming
  // back as a duplicate person after a lost session. Full width is the
  // point this time, so the assertion checks for it directly rather than
  // guarding against it. minHeight is 46px, matched to LeaveGroupButton's own
  // "Leave group" pill on this same page rather than to CancelControls on the
  // event screen (corrected same day, second pass of the owner's QA); it
  // remains a floor, never a fixed height, per CLAUDE.md's layout-grows rule.
  it("renders the add control as a full-width pill, easy to find on a phone", () => {
    render(<EmailStatusRow emailAddress={null} />)
    const control = screen.getByRole("button", { name: "Add your email" })
    expect(control.style.width).toBe("100%")
    expect(control.style.minHeight).toBe("46px")
  })
})

describe("EmailStatusRow, adding an email", () => {
  it("expands to the attach flow and can be backed out of without saving", () => {
    render(<EmailStatusRow emailAddress={null} />)
    fireEvent.click(screen.getByRole("button", { name: "Add your email" }))

    expect(screen.getByLabelText("Your email address")).toBeDefined()
    fireEvent.click(screen.getByRole("button", { name: "Never mind" }))

    expect(screen.getByRole("button", { name: "Add your email" })).toBeDefined()
    expect(requestMock).not.toHaveBeenCalled()
  })

  it("shows a neutral, non-Orbit line when a code is sent, not the default first-person one", async () => {
    render(<EmailStatusRow emailAddress={null} />)
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
  // flow's own done message never gets a chance to paint; ~~"Email reminders
  // are on."~~ the address itself appearing on the row is what confirms the
  // save now (amended 27 Aug 2026), and it is a better confirmation than the
  // sentence it replaced, because it names WHICH address was saved.
  it("collapses back to its quiet, permanent state once the address is saved", async () => {
    render(<EmailStatusRow emailAddress={null} />)
    fireEvent.click(screen.getByRole("button", { name: "Add your email" }))

    fireEvent.change(screen.getByLabelText("Your email address"), {
      target: { value: "sam@example.com" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    const code = await screen.findByLabelText("The code from your email")
    fireEvent.change(code, { target: { value: "12345678" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    // The address they just saved, now standing where "Add your email" was.
    expect(await screen.findByText("sam@example.com")).toBeDefined()
    expect(screen.getByRole("button", { name: "Change email" })).toBeDefined()
    expect(screen.queryByLabelText("The code from your email")).toBeNull()
    expect(screen.queryByRole("button", { name: "Add your email" })).toBeNull()
  })
})

describe("EmailStatusRow, changing an email", () => {
  it("expands from the attached state with a change prompt, not the add prompt", () => {
    render(<EmailStatusRow emailAddress="sam@example.com" />)
    fireEvent.click(screen.getByRole("button", { name: "Change email" }))

    expect(screen.getByText("Enter the new address you'd like to use.")).toBeDefined()
    expect(screen.queryByText(/sign back in as yourself/)).toBeNull()
  })

  it("drops the old address off the screen the moment the flow opens", async () => {
    // The old address is shown on the collapsed row, and it stops being shown
    // the instant the member starts replacing it. Two reasons, and only the
    // second is cosmetic: nothing prefills the field, which is the change a
    // future "be helpful" edit would make and the guard file watches for; and
    // an old address sitting next to a field asking for a new one is the same
    // ambiguity this row was rebuilt to remove, pointed the other way.
    render(<EmailStatusRow emailAddress="sam@example.com" />)
    fireEvent.click(screen.getByRole("button", { name: "Change email" }))
    expect(screen.queryByText("sam@example.com")).toBeNull()

    fireEvent.change(screen.getByLabelText("Your email address"), {
      target: { value: "new@example.com" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await screen.findByLabelText("The code from your email")
    // Only the address just typed this session appears from here on.
    expect(screen.getByText(/new@example\.com/)).toBeDefined()
    expect(screen.queryByText("sam@example.com")).toBeNull()
  })

  it("collapses back showing the NEW address, not the one it replaced", async () => {
    // The row cannot refetch until the next full page load, so the address it
    // shows after a change comes from the member's own keystrokes rather than
    // from storage. Showing the old one here would be worse than showing
    // nothing: it would say the change had not taken when it had.
    render(<EmailStatusRow emailAddress="sam@example.com" />)
    fireEvent.click(screen.getByRole("button", { name: "Change email" }))

    fireEvent.change(screen.getByLabelText("Your email address"), {
      target: { value: "new@example.com" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    const code = await screen.findByLabelText("The code from your email")
    fireEvent.change(code, { target: { value: "12345678" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(await screen.findByText("new@example.com")).toBeDefined()
    expect(screen.queryByText("sam@example.com")).toBeNull()
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
    render(<EmailStatusRow emailAddress={null} />)
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
  it("holds for the verified collapsed state and the expanded flow", async () => {
    const { unmount } = render(<EmailStatusRow emailAddress="sam@example.com" />)
    expect(document.body.textContent).not.toMatch(/[\u2013\u2014]/)
    fireEvent.click(screen.getByRole("button", { name: "Change email" }))
    expect(document.body.textContent).not.toMatch(/[\u2013\u2014]/)
    unmount()
  })
})

describe("the eyebrow this row lives under, which is on the page rather than in it", () => {
  // The owner's second finding: the eyebrow read EMAIL REMINDERS and the
  // sentence directly under it opened "Email reminders", saying the same thing
  // twice in two lines. It is asserted here rather than in a page test because
  // this repo cannot render a server page, and it is asserted at all because
  // the row's remaining copy is meaningless without it: with the status
  // sentence gone, the eyebrow is the ONLY thing on screen that says what the
  // address is for. Deleting it would leave a bare address under nothing.
  const page = readFileSync(
    path.resolve(__dirname, "../page.tsx"),
    "utf8"
  )

  it("names both jobs the address does, and does not repeat itself", () => {
    // The negative assertion runs FIRST, so that a run against a source with
    // the old eyebrow reddens on the duplication rather than on the missing
    // new wording. That ordering is what let this replacement be proved by
    // running it rather than by reading it.
    // ~~expect(page).not.toContain(">Email reminders<")~~ VACUOUS, and caught
    // by review in fix round 1 rather than by running: the old eyebrow sat on
    // a JSX line of its own, so that exact string never appeared in the source
    // before this change either, and the assertion could not have failed. It
    // is replaced by the shape the old source actually had, which is a line
    // whose entire content is the old eyebrow. Verified against the pre-change
    // file at d285ad5, where page.tsx:270 is exactly that line, so this
    // assertion would have failed then and passes now.
    //
    // Worth naming rather than quietly fixing: this file's header already
    // records two assertions in its history that could not fail, and this was
    // the third. The pattern is always the same, a negative assertion written
    // against a string nobody ever wrote.
    expect(page).not.toMatch(/^\s*Email reminders\s*$/m)
    expect(page).toContain("Email for sign-in and reminders")
  })
})
