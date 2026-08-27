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
            email_taken: "That email is already saved to someone here. Try a different one.",
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

describe("EmailAttachFlow, compact", () => {
  it("puts the way out on the field's own row, and gives it a 44px target", () => {
    render(<EmailAttachFlow {...baseProps({ compact: true })} />)
    const cancel = screen.getByRole("button", { name: "Never mind" })

    expect(cancel.closest("form")).not.toBeNull()
    expect(cancel.style.minHeight).toBe("44px")
  })

  it("leaves the way out on its own row by default, which is what the info page renders", () => {
    render(<EmailAttachFlow {...baseProps()} />)
    const cancel = screen.getByRole("button", { name: "Never mind" })

    expect(cancel.closest("form")).toBeNull()
    expect(cancel.style.minHeight).toBe("")
  })

  it("tightens the leading only when asked to", () => {
    const { unmount } = render(<EmailAttachFlow {...baseProps({ compact: true })} />)
    expect(screen.getByText(PROMPT).style.lineHeight).toBe("var(--leading-tight)")
    unmount()

    render(<EmailAttachFlow {...baseProps()} />)
    expect(screen.getByText(PROMPT).style.lineHeight).toBe("var(--leading-normal)")
  })

  it("still carries the resend and the way out together on the code step", async () => {
    render(<EmailAttachFlow {...baseProps({ compact: true })} />)
    await reachCodeStep()

    expect(screen.getByText("You can ask for a new code in 60 seconds.")).toBeDefined()
    expect(screen.getByRole("button", { name: "Never mind" })).toBeDefined()
  })
})
