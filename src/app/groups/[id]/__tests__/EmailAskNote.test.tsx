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
const FOUNDER_EXTRA = "It also means you won't lose the group you started."
const SECOND_ASK =
  "You're still a temporary member. Without your email, you can't log back in if something happens. If now is not a good time, no worries. Just tap Climbing Crew at the top of the screen whenever you're ready. I won't bother you like this again."

const NOW = new Date("2026-08-26T18:00:00Z")
const YESTERDAY = new Date("2026-08-25T18:00:00Z")
const NINE_DAYS_AGO = new Date("2026-08-17T18:00:00Z")

/** A member who has contributed and has never answered an offer: first ask. */
function firstAskProps(overrides: Record<string, unknown> = {}) {
  return {
    groupId: "g-1",
    groupName: "Climbing Crew",
    viewerIsFounder: false,
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

describe("EmailAskNote, the copy", () => {
  it("asks the first time in the settled words, with no founder sentence for a member", () => {
    render(<EmailAskNote {...firstAskProps()} />)

    expect(screen.getByText(FIRST_ASK)).toBeDefined()
    expect(screen.queryByText(/won't lose the group you started/)).toBeNull()
    expect(screen.getByRole("button", { name: "Save" })).toBeDefined()
    expect(screen.getByRole("button", { name: "Not now" })).toBeDefined()
  })

  it("adds the founder's one extra sentence for the founder", () => {
    render(<EmailAskNote {...firstAskProps({ viewerIsFounder: true })} />)
    expect(screen.getByText(`${FIRST_ASK} ${FOUNDER_EXTRA}`)).toBeDefined()
  })

  it("asks the second time in the settled words, naming the group on screen", () => {
    render(<EmailAskNote {...secondAskProps()} />)

    expect(screen.getByText(SECOND_ASK)).toBeDefined()
    expect(screen.getByRole("button", { name: "No thanks" })).toBeDefined()
    expect(screen.queryByRole("button", { name: "Not now" })).toBeNull()
  })

  it("says no em dash anywhere in what Orbit says here", () => {
    render(<EmailAskNote {...secondAskProps({ viewerIsFounder: true })} />)
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

describe("EmailAskNote, the way out", () => {
  it("counts a dismissal and takes the note off the screen", async () => {
    const { container } = render(<EmailAskNote {...firstAskProps()} />)

    fireEvent.click(screen.getByRole("button", { name: "Not now" }))

    await waitFor(() => expect(dismissMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(container.innerHTML).toBe(""))
  })

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
