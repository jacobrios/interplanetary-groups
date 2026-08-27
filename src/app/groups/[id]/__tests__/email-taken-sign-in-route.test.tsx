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

// The stand-in has to pass everything through, not just href. It used to take
// href and children alone, which silently dropped the style prop, so the anchor
// this file rendered was not the anchor the product renders and no assertion
// about its treatment could have been true. Found by writing one.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: React.ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
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

    // Shortened 27 Aug 2026 after the owner's phone pass, and the deletion is
    // the point rather than a trim. The sentence used to carry the instruction
    // ("sign in with it instead of adding another") AND the control below it
    // said the same thing, so the control read as an echo of the prose rather
    // than as the thing to tap: "I missed the sign-in with that email link and
    // didn't click it." The error states the fact; the control carries the
    // instruction. Hardcoded literal, per this branch's standing trap.
    expect(screen.getByText("That email is already on an account.")).toBeDefined()
    expect(screen.queryByText(/instead of adding another/)).toBeNull()
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

    expect(screen.getByText("That email is already on an account.")).toBeDefined()
    expect(screen.queryByText(/instead of adding another/)).toBeNull()
    expect(screen.queryByText(/Try a different one/)).toBeNull()
  })

  it("carries the same real route into sign-in", async () => {
    render(<EmailStatusRow hasVerifiedEmail={false} />)
    fireEvent.click(screen.getByRole("button", { name: "Add your email" }))
    await typeATakenAddress()

    expect(screen.getByRole("link", { name: SIGN_IN_LABEL }).getAttribute("href")).toBe("/signin")
  })
})

describe("the route reads as the offered next step, not as a footnote", () => {
  // The second finding from the owner's phone pass, and it is the failure this
  // whole slice exists to prevent: the person most likely to be here is the one
  // who attached an email, lost their session, and came back as a second copy
  // of themselves. A route they walk past is the same as no route.
  //
  // It used to be a 15px grey underlined link sitting under a long red error,
  // in the same register as "Not now", which is the register of things you skip.
  // It is a bordered control now. Colour is not doing any of the work: the
  // border, the 17px weight-600 label and the 48px target are what carry it,
  // and they carry it with hue switched off.

  it("is a bordered control with a real tap target, not a quiet text link", async () => {
    render(
      <EmailAttachFlow promptMessage="What's your email?" cancelLabel="Not now" onCancel={vi.fn()} />
    )
    await typeATakenAddress()
    const route = screen.getByRole("link", { name: SIGN_IN_LABEL })

    expect(route.style.border).not.toBe("")
    expect(route.style.minHeight).toBe("48px")
    expect(route.style.fontSize).toBe("var(--type-body)")
    expect(route.style.fontWeight).toBe("600")
    // Underline is what made it read as an aside next to the exit; the border
    // is doing that job now, and two treatments would be one too many.
    expect(route.style.textDecoration).not.toBe("underline")
  })

  it("is not teal and not lime, because Save owns teal and Orbit owns lime", async () => {
    render(
      <EmailAttachFlow promptMessage="What's your email?" cancelLabel="Not now" onCancel={vi.fn()} />
    )
    await typeATakenAddress()
    const route = screen.getByRole("link", { name: SIGN_IN_LABEL })

    const style = route.getAttribute("style") ?? ""
    expect(style).not.toMatch(/var\(--action\)/)
    expect(style).not.toMatch(/var\(--lime\)/)
  })

  it("carries the same treatment on the group info page's row", async () => {
    render(<EmailStatusRow hasVerifiedEmail={false} />)
    fireEvent.click(screen.getByRole("button", { name: "Add your email" }))
    await typeATakenAddress()
    const route = screen.getByRole("link", { name: SIGN_IN_LABEL })

    expect(route.style.border).not.toBe("")
    expect(route.style.minHeight).toBe("48px")
  })
})
