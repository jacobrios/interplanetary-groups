// @vitest-environment jsdom
//
// The contract: a quiet link, a confirm naming the consequence (the old link
// stops working), the action called with the groupId only on confirm.

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react"
import ResetInviteLink from "../ResetInviteLink"

const resetMock = vi.fn(async (..._args: unknown[]): Promise<{ errors?: { general?: string } }> => ({}))
vi.mock("@/app/actions/reset-invite-link", () => ({
  resetInviteLinkAction: (...args: unknown[]) => resetMock(...args),
}))

afterEach(() => {
  cleanup()
  resetMock.mockClear()
  resetMock.mockImplementation(async () => ({}))
})

describe("ResetInviteLink", () => {
  it("asks before resetting, naming the consequence", () => {
    render(<ResetInviteLink groupId="g-1" />)
    fireEvent.click(screen.getByRole("button", { name: "Reset link" }))

    expect(resetMock).not.toHaveBeenCalled()
    expect(screen.getByText("Reset the invite link?")).toBeDefined()
    expect(
      screen.getByText("The old link will stop working everywhere it's been shared.")
    ).toBeDefined()
  })

  it("calls the action with the groupId on confirm", async () => {
    render(<ResetInviteLink groupId="g-9" />)
    fireEvent.click(screen.getByRole("button", { name: "Reset link" }))
    fireEvent.click(screen.getByRole("button", { name: "Yes, reset it" }))

    await waitFor(() => expect(resetMock).toHaveBeenCalledTimes(1))
    const formData = resetMock.mock.calls[0][1] as FormData
    expect(formData.get("groupId")).toBe("g-9")
  })

  it("backs out on Never mind", () => {
    render(<ResetInviteLink groupId="g-1" />)
    fireEvent.click(screen.getByRole("button", { name: "Reset link" }))
    fireEvent.click(screen.getByRole("button", { name: "Never mind" }))

    expect(resetMock).not.toHaveBeenCalled()
    expect(screen.queryByText("Reset the invite link?")).toBeNull()
  })
})
