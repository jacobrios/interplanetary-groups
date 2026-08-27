// @vitest-environment jsdom
//
// EmailAttachFlow is the two-state "type an email, then type the code"
// mechanism lifted out of EmailAskNote (task 5) so task 6's permanent row on
// the group info page can run through the same request/confirm/error handling
// rather than a second copy that could drift from it. EmailAskNote.test.tsx
// already covers the mechanism end to end through its own settled copy; this
// file exists to prove the extraction itself: the default (Orbit-voiced)
// messages still work untouched, and a caller with no Orbit presence on
// screen can override the two lines that read as Orbit speaking in the first
// person, without touching the mechanism underneath.

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, fireEvent } from "@testing-library/react"
import EmailAttachFlow, { DEFAULT_DONE_MESSAGE } from "../EmailAttachFlow"
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

const PROMPT = "Add an email so you can sign back in as yourself."

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    promptMessage: PROMPT,
    cancelLabel: "Never mind",
    onCancel: vi.fn(),
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
  requestMock.mockClear()
  confirmMock.mockClear()
  requestMock.mockImplementation(async () => ({ result: "ok" }))
  confirmMock.mockImplementation(async () => ({ result: "ok" }))
})

async function reachCodeStep(address = "sam@example.com") {
  fireEvent.change(screen.getByLabelText("Your email address"), { target: { value: address } })
  fireEvent.click(screen.getByRole("button", { name: "Save" }))
  await screen.findByLabelText("The code from your email")
}

describe("EmailAttachFlow, the email step", () => {
  it("shows the caller's prompt message and its own cancel label", () => {
    render(<EmailAttachFlow {...baseProps()} />)
    expect(screen.getByText(PROMPT)).toBeDefined()
    expect(screen.getByRole("button", { name: "Never mind" })).toBeDefined()
  })

  it("calls onCancel and nothing else when the way out is tapped", () => {
    const onCancel = vi.fn()
    render(<EmailAttachFlow {...baseProps({ onCancel })} />)
    fireEvent.click(screen.getByRole("button", { name: "Never mind" }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(requestMock).not.toHaveBeenCalled()
    expect(confirmMock).not.toHaveBeenCalled()
  })

  it("sends the typed address and moves to the code step", async () => {
    render(<EmailAttachFlow {...baseProps()} />)
    await reachCodeStep("sam@example.com")
    expect(requestMock.mock.calls[0][0]).toBe("sam@example.com")
  })

  it("surfaces the mapped error and stays on the email step", async () => {
    requestMock.mockImplementation(async () => ({ result: "invalid_email" }))
    render(<EmailAttachFlow {...baseProps()} />)
    fireEvent.change(screen.getByLabelText("Your email address"), {
      target: { value: "not-an-address" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(
      await screen.findByText("That address doesn't look right. Mind checking it?")
    ).toBeDefined()
    expect(screen.getByLabelText("Your email address")).toBeDefined()
  })
})

describe("EmailAttachFlow, default messages (task 5's settled copy, untouched)", () => {
  it("says 'I sent a code to <address>' on the code step by default", async () => {
    render(<EmailAttachFlow {...baseProps()} />)
    await reachCodeStep("sam@example.com")
    expect(
      screen.getByText("I sent a code to sam@example.com. Enter it here and you're set.")
    ).toBeDefined()
  })

  it("shows the settled thank-you line and fires onAttached exactly once", async () => {
    const onAttached = vi.fn()
    render(<EmailAttachFlow {...baseProps({ onAttached })} />)
    await reachCodeStep()
    fireEvent.change(screen.getByLabelText("The code from your email"), {
      target: { value: "12345678" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(await screen.findByText(DEFAULT_DONE_MESSAGE)).toBeDefined()
    expect(onAttached).toHaveBeenCalledTimes(1)
    // Done: the cancel and resend controls are gone, matching EmailAskNote's
    // own behavior of retiring the form once the address is saved.
    expect(screen.queryByRole("button", { name: "Never mind" })).toBeNull()
  })

  it("covers a wrong code and an expired one with one honest message", async () => {
    confirmMock.mockImplementation(async () => ({ result: "bad_code" }))
    render(<EmailAttachFlow {...baseProps()} />)
    await reachCodeStep()
    fireEvent.change(screen.getByLabelText("The code from your email"), {
      target: { value: "12345678" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(
      await screen.findByText(
        "That code didn't work. It might be typed wrong, or it might have expired. Ask for a new code and try again."
      )
    ).toBeDefined()
  })
})

describe("EmailAttachFlow, overriding the Orbit-voiced lines", () => {
  it("uses a supplied codeSentMessage instead of the default first-person line", async () => {
    const codeSentMessage = vi.fn((address: string) => `A code was sent to ${address}. Enter it below.`)
    render(<EmailAttachFlow {...baseProps({ codeSentMessage })} />)
    await reachCodeStep("sam@example.com")

    expect(screen.getByText("A code was sent to sam@example.com. Enter it below.")).toBeDefined()
    expect(screen.queryByText(/^I sent a code/)).toBeNull()
    expect(codeSentMessage).toHaveBeenCalledWith("sam@example.com")
  })

  it("uses a supplied doneMessage instead of the default thank-you line", async () => {
    render(
      <EmailAttachFlow
        {...baseProps({ doneMessage: "Saved. This email can be used to sign back in any time." })}
      />
    )
    await reachCodeStep()
    fireEvent.change(screen.getByLabelText("The code from your email"), {
      target: { value: "12345678" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(
      await screen.findByText("Saved. This email can be used to sign back in any time.")
    ).toBeDefined()
    expect(screen.queryByText(DEFAULT_DONE_MESSAGE)).toBeNull()
  })

  // Fix round 1: codeSentMessage and doneMessage were overridable but the
  // five error strings were not, even though two of them ("on my end", "Mind
  // checking it?") read as Orbit speaking just as much as the two lines
  // above. A caller with no Orbit presence on screen needs a way to replace
  // all of it, not just the happy path.
  it("uses a supplied requestErrorMessages map instead of the default error copy", async () => {
    requestMock.mockImplementation(async () => ({ result: "invalid_email" }))
    render(
      <EmailAttachFlow
        {...baseProps({
          requestErrorMessages: {
            invalid_email: "That address doesn't look right. Check it and try again.",
            email_taken:
              "That email is already on an account. If it's yours, sign in with it instead of adding another.",
            rate_limited: "That was quick. Wait a minute before asking for another code.",
            service_error: "Something went wrong. Give it another try in a bit.",
          },
        })}
      />
    )
    fireEvent.change(screen.getByLabelText("Your email address"), {
      target: { value: "not-an-address" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(
      await screen.findByText("That address doesn't look right. Check it and try again.")
    ).toBeDefined()
    expect(screen.queryByText("That address doesn't look right. Mind checking it?")).toBeNull()
  })

  it("uses a supplied badCodeMessage instead of the default bad-code copy", async () => {
    confirmMock.mockImplementation(async () => ({ result: "bad_code" }))
    render(
      <EmailAttachFlow
        {...baseProps({ badCodeMessage: "That code isn't right. Ask for a new one and try again." })}
      />
    )
    await reachCodeStep()
    fireEvent.change(screen.getByLabelText("The code from your email"), {
      target: { value: "12345678" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(
      await screen.findByText("That code isn't right. Ask for a new one and try again.")
    ).toBeDefined()
  })

  // Final fix wave: the confirm step's two failures moved from a ternary to a
  // map keyed off Exclude<ConfirmAttachResult, "ok">, so that a variant added
  // to that union later is a compile error here rather than both attach
  // surfaces silently saying the wrong thing. This is the half of that branch
  // nothing asserted: a service failure at the CONFIRM step has always taken
  // the caller's own service_error wording, not the default, and the map has
  // to keep doing that. The bad-code half is covered directly above.
  it("takes the caller's service_error wording when the confirm step fails, not the default", async () => {
    confirmMock.mockImplementation(async () => ({ result: "service_error" }))
    render(
      <EmailAttachFlow
        {...baseProps({
          requestErrorMessages: {
            invalid_email: "That address doesn't look right. Check it and try again.",
            email_taken:
              "That email is already on an account. If it's yours, sign in with it instead of adding another.",
            rate_limited: "That was quick. Wait a minute before asking for another code.",
            service_error: "Something went wrong. Give it another try in a bit.",
          },
        })}
      />
    )
    await reachCodeStep()
    fireEvent.change(screen.getByLabelText("The code from your email"), {
      target: { value: "12345678" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(
      await screen.findByText("Something went wrong. Give it another try in a bit.")
    ).toBeDefined()
    expect(screen.queryByText(/on my end/)).toBeNull()
  })
})

describe("EmailAttachFlow, no em dash in anything it renders", () => {
  it("holds for the default copy and an overridden one", async () => {
    render(
      <EmailAttachFlow
        {...baseProps({ codeSentMessage: (a: string) => `A code was sent to ${a}. Enter it below.` })}
      />
    )
    await reachCodeStep()
    // Written as escapes rather than the characters themselves, so a grep for
    // a stray dash in this repo cannot trip over the test that forbids them.
    expect(document.body.textContent).not.toMatch(/[\u2013\u2014]/)
  })
})

// ── Added 27 Aug 2026, task 5 fix round 1 ──────────────────────────────────
// Three changes landed on this shared component after task 6 extracted it. Two
// apply to both surfaces and one is opt-in for the caller under vertical
// pressure. Nothing above this line was edited.

describe("EmailAttachFlow, the field itself", () => {
  it("keeps the input at or above 16px so iOS does not zoom the page", () => {
    // Not a style preference: iOS Safari and iOS Chrome zoom the whole page
    // when a focused input computes under 16px, and nothing in layout.tsx
    // suppresses it. --type-meta is 15px, --type-body is 17px.
    render(<EmailAttachFlow {...baseProps()} />)
    const field = screen.getByLabelText("Your email address") as HTMLInputElement
    expect(field.style.fontSize).toBe("var(--type-body)")
  })

  it("clears the complaint as soon as the member starts fixing it", async () => {
    requestMock.mockImplementation(async () => ({ result: "invalid_email" }))
    render(<EmailAttachFlow {...baseProps()} />)

    const field = screen.getByLabelText("Your email address")
    fireEvent.change(field, { target: { value: "sam@@example" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    const complaint = await screen.findByText("That address doesn't look right. Mind checking it?")
    expect(complaint).toBeDefined()

    fireEvent.change(field, { target: { value: "sam@example.com" } })
    expect(
      screen.queryByText("That address doesn't look right. Mind checking it?")
    ).toBeNull()
  })
})

describe("EmailAttachFlow, the promise about the address", () => {
  // It lives here rather than in the sheet because it is about the address and
  // is equally true on both surfaces, so the group info page's row gets it too.
  // Asserted as a hardcoded literal, never as an imported constant: two tests
  // on this branch already compare a constant against itself and cannot catch
  // a copy change.

  it("shows the settled promise on the email step, centred, on the inline surface too", () => {
    render(<EmailAttachFlow {...baseProps()} />)
    const assure = screen.getByText("For sign-in and reminders. Never shared or sold.")

    expect(assure.style.textAlign).toBe("center")
    expect(assure.style.fontSize).toBe("var(--type-meta)")
  })

  it("drops it once the address is given, because by then the promise is retrospective", async () => {
    render(<EmailAttachFlow {...baseProps()} />)
    await reachCodeStep()

    expect(screen.queryByText("For sign-in and reminders. Never shared or sold.")).toBeNull()
  })
})

describe("EmailAttachFlow, the sheet variant", () => {
  // Replaces the `compact` variant, which existed only for the inline note the
  // sheet retired. The pressure it answered (a pinned element sharing a fixed
  // region with the chat feed) does not exist inside a sheet.

  it("stacks the field, Save and the way out, at the drawn sizes", () => {
    render(<EmailAttachFlow {...baseProps({ variant: "sheet" })} />)
    const save = screen.getByRole("button", { name: "Save" })
    const exit = screen.getByRole("button", { name: "Never mind" })

    expect(save.style.minHeight).toBe("52px")
    expect(save.style.width).toBe("100%")
    // 17px and weight 600, not a 15px link: it has to be legible as the way
    // out to an eighty-year-old, which is why the rejected frame's X is gone.
    expect(exit.style.fontSize).toBe("var(--type-body)")
    expect(exit.style.fontWeight).toBe("600")
    expect(exit.style.minHeight).toBe("48px")
  })

  it("leaves the way out on its own row inline, which is what the info page renders", () => {
    render(<EmailAttachFlow {...baseProps()} />)
    const cancel = screen.getByRole("button", { name: "Never mind" })

    expect(cancel.closest("form")).toBeNull()
    expect(cancel.style.minHeight).toBe("")
  })

  it("centers the inline way out, so both surfaces put it in the same place", () => {
    // The owner's finding, 27 Aug 2026: the sheet's exit is centred under
    // Save and the info page's was left-justified, so the same control sat in
    // two different places depending on how you got to it. Centring happens on
    // the row that holds it rather than on the button, which is what keeps the
    // sheet untouched: the sheet draws its own column and never renders this
    // row. The resend line rides along, which is correct, since the sheet
    // centres that too.
    render(<EmailAttachFlow {...baseProps()} />)
    const row = screen.getByRole("button", { name: "Never mind" }).parentElement!

    expect(row.style.justifyContent).toBe("center")
    expect(row.style.flexDirection).toBe("")
  })

  it("leaves the sheet's own way out exactly where it was, full width in a column", () => {
    // The other half of the change above. If centring had been done on the
    // shared button instead of on the inline row, this is what would have
    // moved: the sheet's exit is already centred inside a full-width button,
    // stacked in a column under Save, and it must stay that way.
    render(<EmailAttachFlow {...baseProps({ variant: "sheet" })} />)
    const exit = screen.getByRole("button", { name: "Never mind" })
    const column = exit.parentElement!

    expect(exit.style.width).toBe("100%")
    expect(exit.style.justifyContent).toBe("center")
    expect(column.style.flexDirection).toBe("column")
    expect(column.style.justifyContent).toBe("")
  })

  it("still carries the resend and the way out together on the code step", async () => {
    render(<EmailAttachFlow {...baseProps({ variant: "sheet" })} />)
    await reachCodeStep()

    expect(screen.getByText("You can ask for a new code in 60 seconds.")).toBeDefined()
    expect(screen.getByRole("button", { name: "Never mind" })).toBeDefined()
  })

  it("hands the sheet a worded way out of the done step, which inline must not gain", async () => {
    // Asymmetric on purpose. The sheet is a modal with a scroll lock and a
    // scrim, so a done step with no control traps the member; the group info
    // page's row sits on an ordinary scrolling page with the rest of the page
    // right there, and its done state is correct as it stands.
    const onDone = vi.fn()
    render(<EmailAttachFlow {...baseProps({ variant: "sheet", onDone })} />)
    await reachCodeStep()
    fireEvent.change(screen.getByLabelText("The code from your email"), {
      target: { value: "12345678" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await screen.findByText(DEFAULT_DONE_MESSAGE)

    fireEvent.click(screen.getByRole("button", { name: "Back to the group" }))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it("leaves the inline done step exactly as it shipped, with no terminal control", async () => {
    render(<EmailAttachFlow {...baseProps({ onDone: vi.fn() })} />)
    await reachCodeStep()
    fireEvent.change(screen.getByLabelText("The code from your email"), {
      target: { value: "12345678" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await screen.findByText(DEFAULT_DONE_MESSAGE)

    expect(screen.queryByRole("button", { name: "Back to the group" })).toBeNull()
  })

  it("lets the caller wrap Orbit's line in its own box, at every step", async () => {
    // The sheet needs the message inside Orbit's labeled note (mark, eyebrow,
    // copy) while the flow keeps owning which message it is. The slot is how
    // both stay true, including once the message changes to the code line.
    render(
      <EmailAttachFlow
        {...baseProps({
          variant: "sheet",
          messageSlot: (message: string) => <div data-testid="slot">{message}</div>,
        })}
      />
    )
    expect(screen.getByTestId("slot").textContent).toBe(PROMPT)

    await reachCodeStep("sam@example.com")
    expect(screen.getByTestId("slot").textContent).toBe(
      "I sent a code to sam@example.com. Enter it here and you're set."
    )
  })
})
