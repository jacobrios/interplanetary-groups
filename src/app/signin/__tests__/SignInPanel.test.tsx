// @vitest-environment jsdom
//
// The /signin panel: the way back in for somebody who no longer has an invite
// link to hand, and the destination the "that email is already on an account"
// message points at. Both server actions are mocked, so what is under test is
// the panel's own state machine and the copy a person reads at each stop.
//
// The success path deliberately has no assertion here, because there is no
// success state to see: confirmSignInAction redirects, so the panel's job ends
// the moment it hands the code over. What happens after that is the server
// action's, and signin.test.ts covers it.

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, fireEvent } from "@testing-library/react"
import SignInPanel from "../SignInPanel"
import { DEFAULT_BAD_CODE_MESSAGE } from "@/lib/auth/email-code-flow"
import type { SignInRequestResult } from "@/lib/auth/email"
import type { ConfirmSignInActionResult } from "@/app/actions/signin"

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

const requestMock = vi.fn<(email: string) => Promise<{ result: SignInRequestResult }>>(async () => ({
  result: "ok",
}))
const confirmMock = vi.fn<
  (email: string, code: string) => Promise<{ result: ConfirmSignInActionResult }>
>(async () => ({ result: "bad_code" }))

vi.mock("@/app/actions/signin", () => ({
  requestSignInCodeAction: (email: string) => requestMock(email),
  confirmSignInAction: (email: string, code: string) => confirmMock(email, code),
}))

afterEach(() => {
  cleanup()
  requestMock.mockClear()
  confirmMock.mockClear()
  requestMock.mockImplementation(async () => ({ result: "ok" }))
  confirmMock.mockImplementation(async () => ({ result: "bad_code" }))
})

async function reachCodeStep(address = "sam@example.com") {
  fireEvent.change(screen.getByLabelText("Your email address"), { target: { value: address } })
  fireEvent.click(screen.getByRole("button", { name: "Send me a code" }))
  await screen.findByLabelText("The code from your email")
}

describe("SignInPanel, the email step", () => {
  it("asks for the email and offers a quiet way back out", () => {
    render(<SignInPanel />)
    expect(screen.getByLabelText("Your email address")).toBeDefined()
    expect(screen.getByRole("button", { name: "Send me a code" })).toBeDefined()
    expect(screen.getByRole("link", { name: "Never mind, take me back" })).toBeDefined()
  })

  it("hands the trimmed address to the sign-in action and moves to the code step", async () => {
    render(<SignInPanel />)
    fireEvent.change(screen.getByLabelText("Your email address"), {
      target: { value: "  Sam@Example.com  " },
    })
    fireEvent.click(screen.getByRole("button", { name: "Send me a code" }))

    await screen.findByLabelText("The code from your email")
    expect(requestMock).toHaveBeenCalledWith("Sam@Example.com")
    expect(
      screen.getByText("I sent a code to Sam@Example.com. Enter it here and I'll get you in.")
    ).toBeDefined()
  })

  // The honest answer the slice settled on: a person whose typo would
  // otherwise leave them waiting forever for mail that is never coming.
  it("says plainly when there is no account with that address", async () => {
    requestMock.mockImplementation(async () => ({ result: "unknown_email" }))
    render(<SignInPanel />)
    fireEvent.change(screen.getByLabelText("Your email address"), {
      target: { value: "nobody@example.com" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Send me a code" }))

    expect(
      await screen.findByText(
        "I don't have an account with that email. Give it another look, or open the invite link your group sent you."
      )
    ).toBeDefined()
    // Stays on the email step: the thing to fix is the address.
    expect(screen.getByLabelText("Your email address")).toBeDefined()
  })

  it("carries the seam's other refusals through in Orbit's voice", async () => {
    for (const [result, expected] of [
      ["invalid_email", "That address doesn't look right. Mind checking it?"],
      ["rate_limited", "That was quick. You can ask for a new code once a minute."],
      ["service_error", "Something went wrong on my end. Give it another try in a bit."],
    ] as const) {
      requestMock.mockImplementation(async () => ({ result }))
      render(<SignInPanel />)
      fireEvent.change(screen.getByLabelText("Your email address"), {
        target: { value: "sam@example.com" },
      })
      fireEvent.click(screen.getByRole("button", { name: "Send me a code" }))
      expect(await screen.findByText(expected)).toBeDefined()
      cleanup()
    }
  })

  it("clears the complaint as soon as they start fixing it", async () => {
    requestMock.mockImplementation(async () => ({ result: "unknown_email" }))
    render(<SignInPanel />)
    const field = screen.getByLabelText("Your email address")
    fireEvent.change(field, { target: { value: "nobody@example.com" } })
    fireEvent.click(screen.getByRole("button", { name: "Send me a code" }))
    await screen.findByText(/I don't have an account with that email/)

    fireEvent.change(field, { target: { value: "nobody@example.co" } })
    expect(screen.queryByText(/I don't have an account with that email/)).toBeNull()
  })

  it("does not send anything when the field is empty", () => {
    render(<SignInPanel />)
    fireEvent.click(screen.getByRole("button", { name: "Send me a code" }))
    expect(requestMock).not.toHaveBeenCalled()
  })
})

describe("SignInPanel, the code step", () => {
  it("sends the address and the code to the confirm action", async () => {
    render(<SignInPanel />)
    await reachCodeStep()
    fireEvent.change(screen.getByLabelText("The code from your email"), {
      target: { value: " 12345678 " },
    })
    fireEvent.click(screen.getByRole("button", { name: "Sign me in" }))

    await vi.waitFor(() =>
      expect(confirmMock).toHaveBeenCalledWith("sam@example.com", "12345678")
    )
  })

  // Measured, not assumed: the service sends eight digits and the plan said
  // six. Nothing on this input may assume a length.
  it("puts no length rule on the code at all", async () => {
    render(<SignInPanel />)
    await reachCodeStep()
    const field = screen.getByLabelText("The code from your email") as HTMLInputElement
    expect(field.maxLength).toBe(-1)

    fireEvent.change(field, { target: { value: "1234567890" } })
    fireEvent.click(screen.getByRole("button", { name: "Sign me in" }))
    await vi.waitFor(() =>
      expect(confirmMock).toHaveBeenCalledWith("sam@example.com", "1234567890")
    )
  })

  // Supabase returns the identical error for a wrong code and an expired one,
  // so one sentence has to cover both. Shared rather than retyped, so a fresh
  // copy cannot drift into claiming expiry.
  it("never claims a code expired, because it cannot know that", async () => {
    confirmMock.mockImplementation(async () => ({ result: "bad_code" }))
    render(<SignInPanel />)
    await reachCodeStep()
    fireEvent.change(screen.getByLabelText("The code from your email"), {
      target: { value: "00000000" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Sign me in" }))

    expect(await screen.findByText(DEFAULT_BAD_CODE_MESSAGE)).toBeDefined()
  })

  it("has something honest to say when the code is right and the account is not there", async () => {
    confirmMock.mockImplementation(async () => ({ result: "no_user" }))
    render(<SignInPanel />)
    await reachCodeStep()
    fireEvent.change(screen.getByLabelText("The code from your email"), {
      target: { value: "12345678" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Sign me in" }))

    expect(
      await screen.findByText(
        "I couldn't find your account. Open the invite link your group sent you and I'll get you set up."
      )
    ).toBeDefined()
  })

  it("names the wait instead of letting them walk into the rate limit", async () => {
    render(<SignInPanel />)
    await reachCodeStep()
    expect(screen.getByText("You can ask for a new code in 60 seconds.")).toBeDefined()
    expect(screen.queryByRole("button", { name: "Send a new code" })).toBeNull()
  })

  it("keeps the way back out available halfway through", async () => {
    render(<SignInPanel />)
    await reachCodeStep()
    expect(screen.getByRole("link", { name: "Never mind, take me back" })).toBeDefined()
  })
})

describe("SignInPanel, the rules the whole slice shares", () => {
  // iOS Safari and iOS Chrome zoom the whole viewport when a focused input
  // computes under 16px. This slice already shipped that bug once.
  it("keeps both fields at body size so a tap cannot zoom the page", async () => {
    render(<SignInPanel />)
    expect((screen.getByLabelText("Your email address") as HTMLInputElement).style.fontSize).toBe(
      "var(--type-body)"
    )
    await reachCodeStep()
    expect(
      (screen.getByLabelText("The code from your email") as HTMLInputElement).style.fontSize
    ).toBe("var(--type-body)")
  })

  // type="text", not type="email": the browser's own validation refuses to
  // fire submit at all for an address it dislikes, which puts a second opinion
  // in a second voice in front of the member and never reaches the seam that
  // actually decides.
  it("lets the auth seam be the only judge of an address", () => {
    render(<SignInPanel />)
    const field = screen.getByLabelText("Your email address") as HTMLInputElement
    expect(field.type).toBe("text")
    expect(field.inputMode).toBe("email")
  })
})
