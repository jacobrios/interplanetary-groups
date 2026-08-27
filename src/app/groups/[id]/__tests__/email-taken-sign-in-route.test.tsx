// @vitest-environment jsdom
//
// One behaviour, checked on both surfaces that can reach it, which is the
// whole point of this file existing separately.
//
// Think about who actually types an address the product already knows: almost
// always a member who attached their email, lost their session, came back
// through the invite link as a second copy of themselves, and is now typing
// their own real address. The old copy told that person the address belonged
// to somebody else and invited them to use a different one, which cements the
// duplicate permanently and makes it signed-in-able. "Someone here" was also a
// claim the code cannot back up, since Supabase identities are project-global
// rather than per group.
//
// So the message now points at signing in, and because a sentence pointing at
// a door has to have a door to point at, the same branch renders a real route
// to /signin. It lives in EmailAttachFlow rather than in the copy, so both
// surfaces get it: the group home's flow, and the group info page's row, which
// overrides every word of the error copy but not the structure around it.

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, fireEvent } from "@testing-library/react"
import EmailAttachFlow, { DEFAULT_REQUEST_ERROR } from "../EmailAttachFlow"
import EmailStatusRow from "../info/EmailStatusRow"
import type { AttachRequestResult, ConfirmAttachResult } from "@/lib/auth/email"

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

const requestMock = vi.fn<(email: string) => Promise<{ result: AttachRequestResult }>>(async () => ({
  result: "email_taken",
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
  requestMock.mockImplementation(async () => ({ result: "email_taken" }))
})

const SIGN_IN_LABEL = "Sign in with that email"

async function typeATakenAddress() {
  fireEvent.change(screen.getByLabelText("Your email address"), {
    target: { value: "sam@example.com" },
  })
  fireEvent.click(screen.getByRole("button", { name: "Save" }))
  await screen.findByRole("link", { name: SIGN_IN_LABEL })
}

describe("an address the product already knows, on the group home's flow", () => {
  it("points the person at signing in instead of telling them to use another address", async () => {
    render(
      <EmailAttachFlow promptMessage="What's your email?" cancelLabel="Not now" onCancel={vi.fn()} />
    )
    await typeATakenAddress()

    expect(
      screen.getByText(
        "That email is already on an account. If it's yours, sign in with it instead of adding another."
      )
    ).toBeDefined()
    // The old copy, and the reason it was wrong: it sent the one person most
    // likely to be here down the path that makes their duplicate permanent.
    expect(screen.queryByText(/Try another one/)).toBeNull()
  })

  it("carries a real route into sign-in, so the sentence is not a promise it cannot keep", async () => {
    render(
      <EmailAttachFlow promptMessage="What's your email?" cancelLabel="Not now" onCancel={vi.fn()} />
    )
    await typeATakenAddress()

    expect(screen.getByRole("link", { name: SIGN_IN_LABEL }).getAttribute("href")).toBe("/signin")
  })

  it("offers that route only for an address that is already on an account", async () => {
    requestMock.mockImplementation(async () => ({ result: "invalid_email" }))
    render(
      <EmailAttachFlow promptMessage="What's your email?" cancelLabel="Not now" onCancel={vi.fn()} />
    )
    fireEvent.change(screen.getByLabelText("Your email address"), {
      target: { value: "not-an-address" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await screen.findByText(DEFAULT_REQUEST_ERROR.invalid_email)
    expect(screen.queryByRole("link", { name: SIGN_IN_LABEL })).toBeNull()
  })

  it("takes the route away again the moment they start retyping the address", async () => {
    render(
      <EmailAttachFlow promptMessage="What's your email?" cancelLabel="Not now" onCancel={vi.fn()} />
    )
    await typeATakenAddress()

    fireEvent.change(screen.getByLabelText("Your email address"), {
      target: { value: "sam2@example.com" },
    })
    expect(screen.queryByRole("link", { name: SIGN_IN_LABEL })).toBeNull()
  })
})

describe("the same address, on the group info page's permanent row", () => {
  // The surface the final review missed. Its error copy is a separately worded
  // copy of the same idea, so fixing only the flagged one would have left this
  // path dead-ending exactly the same population.
  it("says the same thing in this page's own neutral voice", async () => {
    render(<EmailStatusRow hasVerifiedEmail={false} />)
    fireEvent.click(screen.getByRole("button", { name: "Add your email" }))
    await typeATakenAddress()

    expect(
      screen.getByText(
        "That email is already on an account. If it's yours, sign in with it instead of adding another."
      )
    ).toBeDefined()
    expect(screen.queryByText(/Try a different one/)).toBeNull()
  })

  it("carries the same real route into sign-in", async () => {
    render(<EmailStatusRow hasVerifiedEmail={false} />)
    fireEvent.click(screen.getByRole("button", { name: "Add your email" }))
    await typeATakenAddress()

    expect(screen.getByRole("link", { name: SIGN_IN_LABEL }).getAttribute("href")).toBe("/signin")
  })
})
