// @vitest-environment jsdom
//
// The only part of the email slice most members will ever see, so the copy is
// asserted verbatim rather than by pattern: the owner settled it over four
// rounds and overruled two objections, and a test that matched loosely would
// let it drift back.
//
// The eligibility gate is tested here rather than at page level because this
// repo can test a component and cannot test a server-rendered screen. That is
// why the component takes the raw inputs and calls shouldOfferEmail itself
// instead of being handed a yes or no.

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react"
import EmailAskNote from "../EmailAskNote"
import type { AttachRequestResult, ConfirmAttachResult } from "@/lib/auth/email"

// Typed to the seam's real result unions, so a test that stubs an outcome the
// seam cannot return stops being a test of anything.
const dismissMock = vi.fn<() => Promise<{ ok: boolean }>>(async () => ({ ok: true }))
const requestMock = vi.fn<(email: string) => Promise<{ result: AttachRequestResult }>>(async () => ({
  result: "ok",
}))
const confirmMock = vi.fn<(email: string, code: string) => Promise<{ result: ConfirmAttachResult }>>(
  async () => ({ result: "ok" })
)

vi.mock("@/app/actions/email-ask", () => ({
  dismissEmailOfferAction: () => dismissMock(),
  requestEmailAttachAction: (email: string) => requestMock(email),
  confirmEmailAttachAction: (email: string, code: string) => confirmMock(email, code),
}))

const FIRST_ASK =
  "I haven't asked for a way to remember you. Add your email so you can log back in if necessary. This way you don't lose access to this group."
const SECOND_ASK =
  "You're still a temporary member. Without your email, you can't log back in if something happens. If now is not a good time, no worries. Just tap Climbing Crew at the top of the screen whenever you're ready. I won't bother you like this again."

const NOW = new Date("2026-08-26T18:00:00Z")
const YESTERDAY = new Date("2026-08-25T18:00:00Z")
const NINE_DAYS_AGO = new Date("2026-08-17T18:00:00Z")

/** A member who has contributed and has never answered an offer: first ask. */
function firstAskProps(overrides: Record<string, unknown> = {}) {
  return {
    groupName: "Climbing Crew",
    askState: { emailAskCount: 0, emailAskedAt: null },
    latestContributionAt: YESTERDAY,
    hasVerifiedEmail: false,
    now: NOW,
    ...overrides,
  }
}

/** Answered once, nine days ago, and has been active since: second ask. */
function secondAskProps(overrides: Record<string, unknown> = {}) {
  return firstAskProps({
    askState: { emailAskCount: 1, emailAskedAt: NINE_DAYS_AGO },
    latestContributionAt: YESTERDAY,
    ...overrides,
  })
}

afterEach(() => {
  cleanup()
  dismissMock.mockClear()
  requestMock.mockClear()
  confirmMock.mockClear()
  requestMock.mockImplementation(async () => ({ result: "ok" }))
  confirmMock.mockImplementation(async () => ({ result: "ok" }))
})

describe("EmailAskNote, who never sees it", () => {
  it("stays off the screen for a member who has not contributed yet", () => {
    const { container } = render(<EmailAskNote {...firstAskProps({ latestContributionAt: null })} />)
    expect(container.innerHTML).toBe("")
  })

  it("stays off the screen once a verified email exists", () => {
    const { container } = render(<EmailAskNote {...firstAskProps({ hasVerifiedEmail: true })} />)
    expect(container.innerHTML).toBe("")
  })

  it("stays off the screen after two answered asks", () => {
    const { container } = render(
      <EmailAskNote
        {...firstAskProps({ askState: { emailAskCount: 2, emailAskedAt: NINE_DAYS_AGO } })}
      />
    )
    expect(container.innerHTML).toBe("")
  })
})

describe("EmailAskNote, showing writes nothing", () => {
  it("calls no action at all on a bare render, in either ask", () => {
    // The strongest rule in this element, and the one most at risk of being
    // "restored" wrongly: the counter counts DECLINES, not appearances. An
    // earlier draft of the brief said the opposite, so this is pinned rather
    // than left to the success path's incidental assertion. If anyone adds a
    // mark-as-shown write, this reddens.
    render(<EmailAskNote {...firstAskProps()} />)
    cleanup()
    render(<EmailAskNote {...secondAskProps()} />)

    expect(dismissMock).not.toHaveBeenCalled()
    expect(requestMock).not.toHaveBeenCalled()
    expect(confirmMock).not.toHaveBeenCalled()
  })
})

describe("EmailAskNote, the copy", () => {
  it("asks the first time in the settled words, one string for everyone", () => {
    render(<EmailAskNote {...firstAskProps()} />)

    expect(screen.getByText(FIRST_ASK)).toBeDefined()
    expect(screen.getByRole("button", { name: "Save" })).toBeDefined()
    expect(screen.getByRole("button", { name: "Not now" })).toBeDefined()
  })

  it("has no founder variant left, on either ask", () => {
    // The owner deleted it 27 Aug 2026: a founder knows it is their group, and
    // the clause gestured at a bigger stake (managing members, resetting the
    // link) without naming it. There is no viewerIsFounder prop any more, so
    // the only way this sentence could come back is somebody writing it in.
    // Asserted per render rather than after a cleanup, and that ordering is
    // the whole test. Written the other way round first, it read as covering
    // both asks and actually only saw the second one: cleanup wipes the body
    // before the assertion, so a founder sentence on the FIRST ask sailed
    // through. Found by mutation, by putting the sentence back and watching
    // this stay green.
    render(<EmailAskNote {...firstAskProps()} />)
    expect(document.body.textContent).not.toContain("group you started")
    cleanup()

    render(<EmailAskNote {...secondAskProps()} />)
    expect(document.body.textContent).not.toContain("group you started")
  })

  it("asks the second time in the settled words, naming the group on screen", () => {
    render(<EmailAskNote {...secondAskProps()} />)

    expect(screen.getByText(SECOND_ASK)).toBeDefined()
    expect(screen.getByRole("button", { name: "No thanks" })).toBeDefined()
    expect(screen.queryByRole("button", { name: "Not now" })).toBeNull()
  })

  it("says no em dash anywhere in what Orbit says here", () => {
    render(<EmailAskNote {...secondAskProps()} />)
    // Written as escapes rather than the characters themselves, so a grep for
    // a stray dash in this repo cannot trip over the test that forbids them.
    expect(document.body.textContent).not.toMatch(/[\u2013\u2014]/)
  })
})

describe("EmailAskNote, saving an email", () => {
  it("sends the typed address and then asks for the code", async () => {
    render(<EmailAskNote {...firstAskProps()} />)

    fireEvent.change(screen.getByLabelText("Your email address"), {
      target: { value: "sam@example.com" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(requestMock).toHaveBeenCalledTimes(1))
    expect(requestMock.mock.calls[0][0]).toBe("sam@example.com")

    expect(
      await screen.findByText("I sent a code to sam@example.com. Enter it here and you're set.")
    ).toBeDefined()
    expect(screen.getByLabelText("The code from your email")).toBeDefined()
  })

  it("does not assume how long a code is", async () => {
    render(<EmailAskNote {...firstAskProps()} />)
    fireEvent.change(screen.getByLabelText("Your email address"), {
      target: { value: "sam@example.com" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    const code = (await screen.findByLabelText("The code from your email")) as HTMLInputElement
    // jsdom reports -1 for an unset maxLength. The service sends eight digits
    // today and sent six in the plan; nothing here should have to change if it
    // sends something else tomorrow.
    expect(code.maxLength).toBe(-1)

    fireEvent.change(code, { target: { value: "1234567890" } })
    expect(code.value).toBe("1234567890")
  })

  it("names the wait in plain words instead of letting the resend error", async () => {
    render(<EmailAskNote {...firstAskProps()} />)
    fireEvent.change(screen.getByLabelText("Your email address"), {
      target: { value: "sam@example.com" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(await screen.findByText("You can ask for a new code in 60 seconds.")).toBeDefined()
    expect(screen.queryByRole("button", { name: "Send a new code" })).toBeNull()
  })

  it("covers a wrong code and an expired one with one honest message", async () => {
    confirmMock.mockImplementation(async () => ({ result: "bad_code" }))
    render(<EmailAskNote {...firstAskProps()} />)

    fireEvent.change(screen.getByLabelText("Your email address"), {
      target: { value: "sam@example.com" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    const code = await screen.findByLabelText("The code from your email")
    fireEvent.change(code, { target: { value: "12345678" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(confirmMock).toHaveBeenCalledTimes(1))
    expect(confirmMock.mock.calls[0][1]).toBe("12345678")
    expect(
      await screen.findByText(
        "That code didn't work. It might be typed wrong, or it might have expired. Ask for a new code and try again."
      )
    ).toBeDefined()
  })

  it("says so plainly when the address is refused, and stays on the email step", async () => {
    requestMock.mockImplementation(async () => ({ result: "invalid_email" }))
    render(<EmailAskNote {...firstAskProps()} />)

    fireEvent.change(screen.getByLabelText("Your email address"), {
      target: { value: "sam@@example" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(
      await screen.findByText("That address doesn't look right. Mind checking it?")
    ).toBeDefined()
    expect(screen.getByLabelText("Your email address")).toBeDefined()
  })

  it("confirms once the code lands, and stops asking", async () => {
    render(<EmailAskNote {...firstAskProps()} />)
    fireEvent.change(screen.getByLabelText("Your email address"), {
      target: { value: "sam@example.com" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    const code = await screen.findByLabelText("The code from your email")
    fireEvent.change(code, { target: { value: "12345678" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(
      await screen.findByText("Thanks, that's saved. You can get back in with your email any time.")
    ).toBeDefined()
    expect(screen.queryByLabelText("The code from your email")).toBeNull()
    // Attaching answers the offer too, so nothing counts a dismissal here.
    expect(dismissMock).not.toHaveBeenCalled()
  })
})

// ─── The product's first modal ───────────────────────────────────────────────
//
// Nothing in this app had a scrim, a sheet or a dialog before this, so every
// assertion below is setting the precedent rather than following one. Read the
// component's header comment for the reasoning; these are the tests that hold
// it to each decision.

/** The sheet element itself, which is also the dialog. */
function sheet() {
  return screen.getByRole("dialog")
}

/** The scrim is the sheet's parent, and it is the only way to reach it: it is
 *  deliberately not a control, so it has no role a query could ask for. */
function scrim(): HTMLElement {
  return sheet().parentElement as HTMLElement
}

describe("EmailAskNote, the sheet shell", () => {
  it("is a dismissible modal dialog named by Orbit's own label", () => {
    render(<EmailAskNote {...firstAskProps()} />)
    const dialog = screen.getByRole("dialog", { name: /a note from orbit/i })

    // aria-modal, not alertdialog: an alertdialog announces an urgent
    // interruption that has to be answered, and this one can be walked away
    // from three different ways at no cost.
    expect(dialog.getAttribute("aria-modal")).toBe("true")
    expect(dialog.getAttribute("role")).toBe("dialog")
  })

  it("takes focus onto the sheet itself, not into the email field", () => {
    // Deliberate: focusing the input raises the phone keyboard over the ask
    // before it has been read, and this element is copy first.
    render(<EmailAskNote {...firstAskProps()} />)
    expect(document.activeElement).toBe(sheet())
    expect(document.activeElement).not.toBe(screen.getByLabelText("Your email address"))
  })

  it("keeps Tab inside the sheet, in both directions", () => {
    render(<EmailAskNote {...firstAskProps()} />)
    const field = screen.getByLabelText("Your email address")
    const exit = screen.getByRole("button", { name: "Not now" })

    // Save is disabled while the field is empty, so the cycle is field, exit.
    exit.focus()
    fireEvent.keyDown(document, { key: "Tab" })
    expect(document.activeElement).toBe(field)

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true })
    expect(document.activeElement).toBe(exit)
  })

  it("gives focus back to whatever had it, once the sheet is gone", async () => {
    const before = document.createElement("button")
    document.body.appendChild(before)
    before.focus()

    render(<EmailAskNote {...firstAskProps()} />)
    expect(document.activeElement).not.toBe(before)

    fireEvent.click(screen.getByRole("button", { name: "Not now" }))
    await waitFor(() => expect(document.activeElement).toBe(before))
    before.remove()
  })

  it("stops the page behind it scrolling, and gives back exactly what it took", async () => {
    // "scroll" rather than "", and that is the whole test. Written with an
    // empty starting value it passed just as happily against an implementation
    // that hardcodes "" on the way out, which is a different decision from
    // restoring what was there. A page that had set its own overflow gets it
    // back.
    document.body.style.overflow = "scroll"
    const { container } = render(<EmailAskNote {...firstAskProps()} />)
    expect(document.body.style.overflow).toBe("hidden")

    fireEvent.click(screen.getByRole("button", { name: "Not now" }))
    await waitFor(() => expect(container.innerHTML).toBe(""))
    expect(document.body.style.overflow).toBe("scroll")
    document.body.style.overflow = ""
  })

  it("grows with content instead of clipping, which is what keeps Save reachable", () => {
    // The 65% is a FLOOR. At an enlarged device text size the sheet grows to
    // the page and the pad scrolls inside it; a fixed height, or a pad that
    // did not scroll, would push Save off the bottom of the screen and there
    // is no other way to finish this flow.
    render(<EmailAskNote {...firstAskProps()} />)
    const dialog = sheet()

    expect(dialog.style.height).toBe("")
    expect(dialog.style.minHeight).toBe("65%")
    expect(dialog.style.maxHeight).toBe("100%")

    const pad = dialog.querySelector<HTMLElement>("div[style*=\"overflow-y\"]")
    expect(pad).not.toBeNull()
    expect(pad!.style.overflowY).toBe("auto")
    // minHeight 0 is what lets the pad shrink below its content and actually
    // scroll inside a flex column, rather than pushing the sheet taller.
    expect(pad!.style.minHeight).toBe("0px")
  })
})

describe("EmailAskNote, what each way out costs", () => {
  // The asymmetry is settled and it points one way on purpose: the silent
  // gesture is the cheap one, and somebody who read the ask and tapped the
  // worded exit has told us something worth spending an ask on. Inverted, it
  // would be a bug. Both halves are tested because only testing the expensive
  // one would let the cheap ones quietly become expensive.

  it("counts a dismissal and takes the sheet off the screen", async () => {
    const { container } = render(<EmailAskNote {...firstAskProps()} />)

    fireEvent.click(screen.getByRole("button", { name: "Not now" }))

    await waitFor(() => expect(dismissMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(container.innerHTML).toBe(""))
  })

  it("charges nothing for a tap on the scrim", async () => {
    const { container } = render(<EmailAskNote {...firstAskProps()} />)

    fireEvent.click(scrim())

    await waitFor(() => expect(container.innerHTML).toBe(""))
    expect(dismissMock).not.toHaveBeenCalled()
  })

  it("charges nothing for Escape, which is the desk keyboard's back gesture", async () => {
    const { container } = render(<EmailAskNote {...firstAskProps()} />)

    fireEvent.keyDown(document, { key: "Escape" })

    await waitFor(() => expect(container.innerHTML).toBe(""))
    expect(dismissMock).not.toHaveBeenCalled()
  })

  it("does not treat a tap on the sheet itself as a tap on the scrim", () => {
    render(<EmailAskNote {...firstAskProps()} />)

    fireEvent.click(sheet())

    expect(screen.getByRole("dialog")).toBeDefined()
    expect(dismissMock).not.toHaveBeenCalled()
  })
})

describe("EmailAskNote, once the address is saved", () => {
  // THE TRAP THIS CLOSES, found by rendering rather than by reading. The done
  // step hides the form, Save, the exit and the resend, and nothing unmounts
  // the sheet, so a member who succeeded was left inside a modal with a scroll
  // lock, a scrim eating taps, focus pinned to the sheet, and zero controls.
  // The only way out was the dimmed strip above the sheet: a gesture round 11
  // classified as a learned pattern rather than a legible one, on a step where
  // deleting the X had already left one worded exit as the whole argument.
  //
  // The inline row on the group info page must NOT gain this control, and
  // EmailAttachFlow.test.tsx holds it to that: no scrim, no lock, the page is
  // right there.

  async function reachDone() {
    fireEvent.change(screen.getByLabelText("Your email address"), {
      target: { value: "sam@example.com" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    const code = await screen.findByLabelText("The code from your email")
    fireEvent.change(code, { target: { value: "12345678" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await screen.findByText("Thanks, that's saved. You can get back in with your email any time.")
  }

  it("never leaves the sheet with no control on it", async () => {
    render(<EmailAskNote {...firstAskProps()} />)
    await reachDone()

    // Deliberately not a match on the label: the label is the coordinator's
    // choice and may be reworded. What must never be true again is zero.
    const controls = screen.getByRole("dialog").querySelectorAll("button, a[href]")
    expect(controls.length).toBeGreaterThan(0)
  })

  it("offers a worded way back to the group, and charges nothing for it", async () => {
    const { container } = render(<EmailAskNote {...firstAskProps()} />)
    await reachDone()

    const back = screen.getByRole("button", { name: "Back to the group" })
    expect(back.textContent).toMatch(/^[A-Za-z ]{4,}$/)

    fireEvent.click(back)
    await waitFor(() => expect(container.innerHTML).toBe(""))
    // Saving an address answers the offer by succeeding. Counting a decline
    // here would spend an ask on the one member who said yes.
    expect(dismissMock).not.toHaveBeenCalled()
  })

  it("does not flash the thank-you away before it can be read", async () => {
    // The tempting one-line fix is onAttached={() => setAnswered(true)}, which
    // closes the sheet the instant the code is confirmed. The member never
    // reads what happened. The control below is the fix instead: they leave
    // when they have read it.
    render(<EmailAskNote {...firstAskProps()} />)
    await reachDone()

    expect(screen.getByRole("dialog")).toBeDefined()
    expect(
      screen.getByText("Thanks, that's saved. You can get back in with your email any time.")
    ).toBeDefined()
  })
})

describe("EmailAskNote, the bottom of the sheet", () => {
  it("promises what happens to the address, in the settled words, centred", () => {
    // Hardcoded rather than imported, on purpose. Two tests on this branch
    // already compare a copy constant against itself and cannot catch a copy
    // change; a literal here is the only thing that can.
    render(<EmailAskNote {...firstAskProps()} />)
    const assure = screen.getByText("For sign-in and reminders. Never shared or sold.")

    // Centred and the length are one decision: the line measures 331px against
    // 352px of available width, and a centred line that wraps reads worse than
    // a left-aligned one. Lengthen the copy and this alignment stops being
    // right.
    expect(assure.style.textAlign).toBe("center")
    expect(assure.style.fontSize).toBe("var(--type-meta)")
  })

  it("drops the promise once the address is given, on the code step", async () => {
    render(<EmailAskNote {...firstAskProps()} />)
    fireEvent.change(screen.getByLabelText("Your email address"), {
      target: { value: "sam@example.com" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await screen.findByLabelText("The code from your email")
    expect(
      screen.queryByText("For sign-in and reminders. Never shared or sold.")
    ).toBeNull()
  })

  it("offers a word as the way out, never a glyph", () => {
    // The rejected frame put the only exit on an X. Orbit has to be readable
    // by a teenager and an eighty-year-old, and a symbol is not.
    render(<EmailAskNote {...firstAskProps()} />)
    const exit = screen.getByRole("button", { name: "Not now" })

    expect(exit.textContent).toMatch(/^[A-Za-z ]{4,}$/)
    expect(screen.queryByRole("button", { name: /close/i })).toBeNull()
    expect(exit.style.minHeight).toBe("48px")
  })

  it("puts teal on Save and on nothing else", () => {
    const { container } = render(<EmailAskNote {...firstAskProps()} />)
    fireEvent.change(screen.getByLabelText("Your email address"), {
      target: { value: "sam@example.com" },
    })

    // --action-ink is Save's own label colour and is a different token; the
    // pattern is anchored so it cannot match it.
    const teal = Array.from(container.querySelectorAll<HTMLElement>("[style]")).filter((el) =>
      /var\(--action\)/.test(el.getAttribute("style") ?? "")
    )
    expect(teal.map((el) => el.textContent)).toEqual(["Save"])
  })
})

describe("EmailAskNote, the way out", () => {

  it("keeps the way out available on the code step", async () => {
    render(<EmailAskNote {...firstAskProps()} />)
    fireEvent.change(screen.getByLabelText("Your email address"), {
      target: { value: "sam@example.com" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await screen.findByLabelText("The code from your email")
    expect(screen.getByRole("button", { name: "Not now" })).toBeDefined()
  })
})

describe("EmailAskNote, layout", () => {
  it("gives Save a min-height and real padding, never a fixed height", () => {
    // Layout grows with content, never clips: at an enlarged device text size
    // a fixed height spills the label out of the button.
    render(<EmailAskNote {...firstAskProps()} />)
    const save = screen.getByRole("button", { name: "Save" })

    expect(save.style.height).toBe("")
    expect(save.style.minHeight).not.toBe("")
    expect(save.style.padding).not.toBe("")
  })
})
