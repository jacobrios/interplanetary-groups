// @vitest-environment jsdom
//
// The "I've been here before" panel on the invite screen: the second path a
// session-less visitor can take instead of being made into a brand new person
// for the second time. Both server actions are mocked, so what is under test
// is the panel's own state machine and the copy a member reads at each stop.
//
// The success path deliberately has no assertion here, because there is no
// success state to see: confirmJoinSignInAction redirects, so the panel's job
// ends the moment it hands the code over. What happens after that is the
// server action's, and join-signin.test.ts covers it.

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, fireEvent } from "@testing-library/react"
import JoinSignIn from "../JoinSignIn"
import { DEFAULT_BAD_CODE_MESSAGE } from "@/app/groups/[id]/EmailAttachFlow"
import type { SignInRequestResult } from "@/lib/auth/email"
import type { ConfirmJoinSignInResult } from "@/app/actions/join-signin"

const requestMock = vi.fn<(email: string) => Promise<{ result: SignInRequestResult }>>(async () => ({
  result: "ok",
}))
const confirmMock = vi.fn<
  (
    email: string,
    code: string,
    token: string
  ) => Promise<{ result: ConfirmJoinSignInResult } | undefined>
>(async () => ({ result: "bad_code" }))

vi.mock("@/app/actions/join-signin", () => ({
  requestJoinSignInCodeAction: (email: string) => requestMock(email),
  confirmJoinSignInAction: (email: string, code: string, token: string) =>
    confirmMock(email, code, token),
}))

afterEach(() => {
  cleanup()
  requestMock.mockClear()
  confirmMock.mockClear()
  requestMock.mockImplementation(async () => ({ result: "ok" }))
  confirmMock.mockImplementation(async () => ({ result: "bad_code" }))
})

function renderPanel(onCancel = vi.fn()) {
  render(<JoinSignIn inviteToken="tok" onCancel={onCancel} />)
  return onCancel
}

async function reachCodeStep(address = "sam@example.com") {
  fireEvent.change(screen.getByLabelText("Your email address"), { target: { value: address } })
  fireEvent.click(screen.getByRole("button", { name: "Send me a code" }))
  await screen.findByLabelText("The code from your email")
}

describe("JoinSignIn, the email step", () => {
  it("asks for the email and offers a way back to joining as someone new", () => {
    renderPanel()
    expect(screen.getByLabelText("Your email address")).toBeDefined()
    expect(screen.getByRole("button", { name: "Send me a code" })).toBeDefined()
    expect(screen.getByRole("button", { name: "I'm new here" })).toBeDefined()
  })

  it("hands the trimmed address to the sign-in action and moves to the code step", async () => {
    renderPanel()
    fireEvent.change(screen.getByLabelText("Your email address"), {
      target: { value: "  Sam@Example.com  " },
    })
    fireEvent.click(screen.getByRole("button", { name: "Send me a code" }))

    await screen.findByLabelText("The code from your email")
    expect(requestMock).toHaveBeenCalledWith("Sam@Example.com")
    expect(screen.getByText("I sent a code to Sam@Example.com. Enter it here and I'll get you in."))
      .toBeDefined()
  })

  // The honest answer the slice settled on: a person whose typo would
  // otherwise leave them waiting forever for mail that is never coming.
  it("says plainly when there is no account with that address", async () => {
    requestMock.mockImplementation(async () => ({ result: "unknown_email" }))
    renderPanel()
    fireEvent.change(screen.getByLabelText("Your email address"), {
      target: { value: "nobody@example.com" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Send me a code" }))

    expect(
      await screen.findByText(
        "I don't have an account with that email. Check it, or head back and join as someone new."
      )
    ).toBeDefined()
    // Still on the email step, because the address is the thing to fix.
    expect(screen.getByLabelText("Your email address")).toBeDefined()
  })

  it("carries the seam's other refusals through in Orbit's voice", async () => {
    const cases = [
      ["invalid_email", "That address doesn't look right. Mind checking it?"],
      ["rate_limited", "That was quick. You can ask for a new code once a minute."],
      ["service_error", "Something went wrong on my end. Give it another try in a bit."],
    ] as const

    for (const [result, message] of cases) {
      requestMock.mockImplementation(async () => ({ result }))
      renderPanel()
      fireEvent.change(screen.getByLabelText("Your email address"), {
        target: { value: "sam@example.com" },
      })
      fireEvent.click(screen.getByRole("button", { name: "Send me a code" }))
      expect(await screen.findByText(message)).toBeDefined()
      cleanup()
    }
  })

  it("clears the complaint as soon as they start fixing it", async () => {
    requestMock.mockImplementation(async () => ({ result: "unknown_email" }))
    renderPanel()
    fireEvent.change(screen.getByLabelText("Your email address"), {
      target: { value: "nobody@example.com" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Send me a code" }))
    const complaint = await screen.findByText(
      "I don't have an account with that email. Check it, or head back and join as someone new."
    )
    expect(complaint).toBeDefined()

    fireEvent.change(screen.getByLabelText("Your email address"), {
      target: { value: "nobody@example.co" },
    })
    expect(
      screen.queryByText(
        "I don't have an account with that email. Check it, or head back and join as someone new."
      )
    ).toBeNull()
  })

  it("does not send anything when the field is empty", () => {
    renderPanel()
    fireEvent.click(screen.getByRole("button", { name: "Send me a code" }))
    expect(requestMock).not.toHaveBeenCalled()
  })

  it("gives the way back to whoever is holding it", () => {
    const onCancel = renderPanel()
    fireEvent.click(screen.getByRole("button", { name: "I'm new here" }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})

describe("JoinSignIn, the code step", () => {
  it("sends the address, the code and the invite token to the confirm action", async () => {
    renderPanel()
    await reachCodeStep()

    fireEvent.change(screen.getByLabelText("The code from your email"), {
      target: { value: " 12345678 " },
    })
    fireEvent.click(screen.getByRole("button", { name: "Sign me in" }))

    await screen.findByText(DEFAULT_BAD_CODE_MESSAGE)
    expect(confirmMock).toHaveBeenCalledWith("sam@example.com", "12345678", "tok")
  })

  // The service sends eight digits and the plan said six. Nothing here may
  // hold an opinion about the length: the auth seam's only rule is that an
  // empty string cannot be a code, and this input matches it.
  it("puts no length rule on the code at all", async () => {
    renderPanel()
    await reachCodeStep()
    const field = screen.getByLabelText("The code from your email") as HTMLInputElement

    expect(field.getAttribute("maxLength")).toBeNull()
    fireEvent.change(field, { target: { value: "1234567890" } })
    fireEvent.click(screen.getByRole("button", { name: "Sign me in" }))
    await screen.findByText(DEFAULT_BAD_CODE_MESSAGE)
    expect(confirmMock).toHaveBeenCalledWith("sam@example.com", "1234567890", "tok")
  })

  // One message covering both, because the service returns the identical error
  // for a wrong code and an expired one. Copy naming expiry alone would be a
  // lie the code cannot back up, so this asserts the shared sentence itself
  // rather than a second copy of it that could drift.
  it("never claims a code expired, because it cannot know that", async () => {
    renderPanel()
    await reachCodeStep()
    fireEvent.change(screen.getByLabelText("The code from your email"), {
      target: { value: "00000000" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Sign me in" }))

    const shown = await screen.findByText(DEFAULT_BAD_CODE_MESSAGE)
    expect(shown.textContent).toContain("It might be typed wrong, or it might have expired")
  })

  // The success path, and the only one with nothing to see: the action
  // redirects, and a redirecting server action resolves its promise with no
  // value at all for a direct client caller. Unguarded, destructuring that
  // throws a TypeError inside the transition, on the single path this whole
  // slice exists for. LeaveGroupButton is the only other client caller of a
  // redirecting action in this codebase and it guards the same way.
  it("does not fall over when the action redirects and hands back nothing", async () => {
    const unhandled: unknown[] = []
    const capture = (reason: unknown) => unhandled.push(reason)
    process.on("unhandledRejection", capture)
    try {
      confirmMock.mockImplementation(async () => undefined)
      renderPanel()
      await reachCodeStep()
      fireEvent.change(screen.getByLabelText("The code from your email"), {
        target: { value: "12345678" },
      })
      fireEvent.click(screen.getByRole("button", { name: "Sign me in" }))

      await vi.waitFor(() => expect(confirmMock).toHaveBeenCalledTimes(1))
      // Nothing is said and nothing changes, because nothing went wrong: the
      // redirect into the group is already in flight.
      await new Promise((r) => setTimeout(r, 0))
      expect(unhandled).toEqual([])
      expect(screen.queryByText(DEFAULT_BAD_CODE_MESSAGE)).toBeNull()
      expect(screen.getByLabelText("The code from your email")).toBeDefined()
    } finally {
      process.off("unhandledRejection", capture)
    }
  })

  it("has something honest to say when the code is right and the account is not there", async () => {
    confirmMock.mockImplementation(async () => ({ result: "no_user" }))
    renderPanel()
    await reachCodeStep()
    fireEvent.change(screen.getByLabelText("The code from your email"), {
      target: { value: "12345678" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Sign me in" }))

    expect(
      await screen.findByText(
        "I couldn't find your account. Head back and join as someone new and I'll get you set up."
      )
    ).toBeDefined()
  })

  it("says so when the sign-in worked and the join did not", async () => {
    confirmMock.mockImplementation(async () => ({ result: "join_failed" }))
    renderPanel()
    await reachCodeStep()
    fireEvent.change(screen.getByLabelText("The code from your email"), {
      target: { value: "12345678" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Sign me in" }))

    expect(
      await screen.findByText(
        "Something went wrong getting you into the group. Give it another try in a bit."
      )
    ).toBeDefined()
  })

  it("keeps the way out available halfway through", async () => {
    const onCancel = renderPanel()
    await reachCodeStep()
    fireEvent.click(screen.getByRole("button", { name: "I'm new here" }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it("names the wait instead of letting them walk into the rate limit", async () => {
    renderPanel()
    await reachCodeStep()
    expect(screen.getByText("You can ask for a new code in 60 seconds.")).toBeDefined()
    expect(screen.queryByRole("button", { name: "Send a new code" })).toBeNull()
  })
})

describe("JoinSignIn, the rules the design system does not let it break", () => {
  // iOS Safari and iOS Chrome zoom the whole viewport when a focused input
  // computes under 16px, and nothing in layout.tsx suppresses it. This slice
  // already shipped that bug once on the group home's field.
  it("keeps both fields at body size so a tap cannot zoom the page", async () => {
    renderPanel()
    const emailField = screen.getByLabelText("Your email address") as HTMLInputElement
    expect(emailField.style.fontSize).toBe("var(--type-body)")

    await reachCodeStep()
    const codeField = screen.getByLabelText("The code from your email") as HTMLInputElement
    expect(codeField.style.fontSize).toBe("var(--type-body)")
  })

  // type="email" was ruled out on the attach flow because the browser's own
  // validation refuses to fire submit for an address it dislikes, which puts a
  // second opinion in a second voice in front of the member and never reaches
  // the seam that actually decides. Same single arbiter here.
  it("lets the auth seam be the only judge of an address", () => {
    renderPanel()
    const emailField = screen.getByLabelText("Your email address") as HTMLInputElement
    expect(emailField.getAttribute("type")).toBe("text")
    expect(emailField.getAttribute("inputMode")).toBe("email")
  })
})
