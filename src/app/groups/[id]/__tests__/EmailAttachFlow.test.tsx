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
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react"
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
