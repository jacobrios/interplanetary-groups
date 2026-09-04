// @vitest-environment jsdom
//
// The invite screen. Most of this file is a regression harness rather than a
// test of anything new: joining is the product's activation point and the one
// path that must not get worse, so the ordinary "I'm new here" render is
// pinned field by field before the second path is exercised at all.
//
// What is new here is only the door: the entry link, who is offered it, and
// that opening it replaces the join controls rather than sitting beside them.
// The panel behind the door is JoinSignIn's own test file.

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, fireEvent } from "@testing-library/react"
import JoinForm from "../JoinForm"
import type { JoinGroupState } from "@/app/actions/join-group"
import type { SignInRequestResult } from "@/lib/auth/email"

const joinMock = vi.fn<(prev: unknown, formData: unknown) => Promise<JoinGroupState>>(
  async () => ({})
)

vi.mock("@/app/actions/join-group", () => ({
  joinGroupAction: (prev: unknown, formData: unknown) => joinMock(prev, formData),
}))

const requestMock = vi.fn<(email: string) => Promise<{ result: SignInRequestResult }>>(async () => ({
  result: "ok",
}))

vi.mock("@/app/actions/join-signin", () => ({
  requestJoinSignInCodeAction: (email: string) => requestMock(email),
  confirmJoinSignInAction: async () => ({ result: "bad_code" as const }),
}))

afterEach(() => {
  cleanup()
  joinMock.mockClear()
  requestMock.mockClear()
})

const RHYTHMS = [{ label: "CLIMBING", value: "Mon & Wed @ 8am · The Cliffs" }]

function renderForm(overrides: Record<string, unknown> = {}) {
  render(
    <JoinForm
      groupName="Tuesday Climbers"
      inviteToken="tok-123"
      currentName={null}
      memberCount={4}
      rhythmRows={RHYTHMS}
      {...overrides}
    />
  )
}

describe("JoinForm, the ordinary join, which must not get worse", () => {
  it("still shows what they are joining before they join it", () => {
    renderForm()
    expect(screen.getByText("You're invited")).toBeDefined()
    expect(screen.getByRole("heading", { name: "Tuesday Climbers" })).toBeDefined()
    expect(screen.getByText("4 members")).toBeDefined()
    expect(screen.getByText("CLIMBING")).toBeDefined()
    expect(screen.getByText("Mon & Wed @ 8am · The Cliffs")).toBeDefined()
  })

  it("still asks a new visitor for a name and nothing else", () => {
    renderForm()
    const name = screen.getByLabelText("Your name") as HTMLInputElement
    expect(name.getAttribute("name")).toBe("memberName")
    expect(name.getAttribute("placeholder")).toBe("What should the crew call you?")
    expect(screen.getByRole("button", { name: /Join Tuesday Climbers/ })).toBeDefined()
    // Reworded 2 September 2026: "no password" was false, since there is no
    // password YET, and this screen's one reassuring sentence must not be
    // more generous than the software.
    expect(
      screen.getByText("No app to download. You'll land right in the group.")
    ).toBeDefined()
    // The second path is a door, not a second form: nothing of it is on screen
    // until somebody opens it.
    expect(screen.queryByLabelText("Your email address")).toBeNull()
  })

  it("still carries the invite token and the session flag the action reads", () => {
    const { container } = render(
      <JoinForm
        groupName="Tuesday Climbers"
        inviteToken="tok-123"
        currentName={null}
        memberCount={4}
        rhythmRows={RHYTHMS}
      />
    )
    const token = container.querySelector('input[name="inviteToken"]') as HTMLInputElement
    const hasSession = container.querySelector('input[name="hasSession"]') as HTMLInputElement
    expect(token.value).toBe("tok-123")
    expect(hasSession.value).toBe("")
  })

  it("still submits to the join action", async () => {
    renderForm()
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Sam" } })
    fireEvent.click(screen.getByRole("button", { name: /Join Tuesday Climbers/ }))
    await vi.waitFor(() => expect(joinMock).toHaveBeenCalledTimes(1))
  })

  it("still greets a returning session by name and marks the flag", () => {
    const { container } = render(
      <JoinForm
        groupName="Tuesday Climbers"
        inviteToken="tok-123"
        currentName="Jordan"
        memberCount={4}
        rhythmRows={RHYTHMS}
      />
    )
    expect(screen.getByText("Jordan")).toBeDefined()
    expect(screen.queryByLabelText("Your name")).toBeNull()
    const hasSession = container.querySelector('input[name="hasSession"]') as HTMLInputElement
    expect(hasSession.value).toBe("1")
  })
})

describe("JoinForm, the door for somebody who has been here before", () => {
  it("offers the second path to a visitor the product does not recognise", () => {
    renderForm()
    expect(screen.getByRole("button", { name: "I've been here before" })).toBeDefined()
  })

  // Somebody the product already resolved to a person has nothing to sign in
  // for: they are already themselves, and the name on the pill proves it.
  it("does not offer it to a session it already resolved to a person", () => {
    renderForm({ currentName: "Jordan" })
    expect(screen.queryByRole("button", { name: "I've been here before" })).toBeNull()
  })

  it("replaces the join controls rather than sitting beside them", () => {
    renderForm()
    fireEvent.click(screen.getByRole("button", { name: "I've been here before" }))

    expect(screen.getByLabelText("Your email address")).toBeDefined()
    expect(screen.queryByLabelText("Your name")).toBeNull()
    expect(screen.queryByRole("button", { name: /Join Tuesday Climbers/ })).toBeNull()
    // What they are joining stays on screen: the reason they tapped the link
    // does not stop being true because they took the other door.
    expect(screen.getByRole("heading", { name: "Tuesday Climbers" })).toBeDefined()
  })

  it("hands the invite token to the panel so signing in lands them here", async () => {
    renderForm()
    fireEvent.click(screen.getByRole("button", { name: "I've been here before" }))
    fireEvent.change(screen.getByLabelText("Your email address"), {
      target: { value: "sam@example.com" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Send me a code" }))
    await screen.findByLabelText("The code from your email")
    expect(requestMock).toHaveBeenCalledWith("sam@example.com")
  })

  it("gives the join form back to anyone who took the wrong door", () => {
    renderForm()
    fireEvent.click(screen.getByRole("button", { name: "I've been here before" }))
    fireEvent.click(screen.getByRole("button", { name: "I'm new here" }))

    expect(screen.getByLabelText("Your name")).toBeDefined()
    expect(screen.getByRole("button", { name: /Join Tuesday Climbers/ })).toBeDefined()
    expect(screen.queryByLabelText("Your email address")).toBeNull()
  })
})

// Task 3 of the duplicate-name-join-check slice: the collision copy and its
// inline "sign in" control replace task 2's typecheck-only placeholder.
// Errors are driven the same way the rest of this file drives them: the
// mocked action's next resolution, followed by a submit.
describe("JoinForm, the duplicate-name collision", () => {
  it("renders the owner's sentence verbatim with the stored name in it", async () => {
    joinMock.mockResolvedValueOnce({
      errors: { memberName: { kind: "duplicate", existingName: "Mike" } },
    })
    renderForm()
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Mike" } })
    fireEvent.click(screen.getByRole("button", { name: /Join Tuesday Climbers/ }))

    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toBe(
      "There's already a Mike in this group. If that's you, sign in instead. If not, add a last initial so people can tell you apart."
    )
  })

  it("opens the sign-in panel from its inline \"sign in\" control", async () => {
    joinMock.mockResolvedValueOnce({
      errors: { memberName: { kind: "duplicate", existingName: "Mike" } },
    })
    renderForm()
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Mike" } })
    fireEvent.click(screen.getByRole("button", { name: /Join Tuesday Climbers/ }))
    await screen.findByRole("alert")

    fireEvent.click(screen.getByRole("button", { name: "sign in" }))

    // Same assertion the existing second-door test makes: the join controls
    // are gone and JoinSignIn's own panel is present.
    expect(screen.queryByLabelText("Your name")).toBeNull()
    expect(screen.queryByRole("button", { name: /Join Tuesday Climbers/ })).toBeNull()
    expect(screen.getByLabelText("Your email address")).toBeDefined()
  })

  it("still renders the required-field message unchanged", async () => {
    joinMock.mockResolvedValueOnce({
      errors: { memberName: { kind: "required" } },
    })
    renderForm()
    fireEvent.click(screen.getByRole("button", { name: /Join Tuesday Climbers/ }))

    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toBe("Your name is required.")
  })

  it("marks the input invalid and ties it to the error paragraph's id, and marks neither when there is no error", async () => {
    renderForm()
    const name = screen.getByLabelText("Your name") as HTMLInputElement
    // No error yet: neither attribute is present at all.
    expect(name.hasAttribute("aria-invalid")).toBe(false)
    expect(name.hasAttribute("aria-describedby")).toBe(false)

    joinMock.mockResolvedValueOnce({
      errors: { memberName: { kind: "duplicate", existingName: "Mike" } },
    })
    fireEvent.change(name, { target: { value: "Mike" } })
    fireEvent.click(screen.getByRole("button", { name: /Join Tuesday Climbers/ }))

    const alert = await screen.findByRole("alert")
    expect(name.getAttribute("aria-invalid")).toBe("true")
    const describedBy = name.getAttribute("aria-describedby")
    expect(describedBy).toBeTruthy()
    // Resolves to the actual error paragraph's id, not merely present.
    expect(alert.id).toBe(describedBy)
  })
})
