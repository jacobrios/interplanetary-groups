// @vitest-environment jsdom
//
// The contract: leaving takes two deliberate taps. The first tap must never
// call the action; the confirm is warm ("You can always rejoin"); Never mind
// backs out; the confirm tap calls the action with the right groupId; an
// action error is surfaced.

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react"
import LeaveGroupButton from "../LeaveGroupButton"

const leaveMock = vi.fn(async (..._args: unknown[]): Promise<{ errors?: { general?: string } }> => ({}))
vi.mock("@/app/actions/leave-group", () => ({
  leaveGroupAction: (...args: unknown[]) => leaveMock(...args),
}))

afterEach(() => {
  cleanup()
  leaveMock.mockClear()
  leaveMock.mockImplementation(async () => ({}))
})

describe("LeaveGroupButton", () => {
  it("does not call the action on the first tap; it asks first", () => {
    render(<LeaveGroupButton groupId="g1" groupName="Climbing Crew" />)
    fireEvent.click(screen.getByRole("button", { name: "Leave group" }))

    expect(leaveMock).not.toHaveBeenCalled()
    expect(screen.getByText("Leave Climbing Crew?")).toBeDefined()
    expect(screen.getByText("You can always rejoin with the invite link.")).toBeDefined()
  })

  it("backs out on Never mind without calling the action", () => {
    render(<LeaveGroupButton groupId="g1" groupName="Climbing Crew" />)
    fireEvent.click(screen.getByRole("button", { name: "Leave group" }))
    fireEvent.click(screen.getByRole("button", { name: "Never mind" }))

    expect(leaveMock).not.toHaveBeenCalled()
    expect(screen.queryByText("Leave Climbing Crew?")).toBeNull()
    expect(screen.getByRole("button", { name: "Leave group" })).toBeDefined()
  })

  it("calls the action with the groupId on confirm", async () => {
    render(<LeaveGroupButton groupId="g-42" groupName="Climbing Crew" />)
    fireEvent.click(screen.getByRole("button", { name: "Leave group" }))
    // Inside the confirm, the destructive button repeats the label
    fireEvent.click(screen.getByRole("button", { name: "Leave group" }))

    await waitFor(() => expect(leaveMock).toHaveBeenCalledTimes(1))
    const formData = leaveMock.mock.calls[0][1] as FormData
    expect(formData.get("groupId")).toBe("g-42")
  })

  it("surfaces the action's error copy", async () => {
    leaveMock.mockImplementation(async () => ({
      errors: { general: "You're not a member of this group." },
    }))
    render(<LeaveGroupButton groupId="g1" groupName="Climbing Crew" />)
    fireEvent.click(screen.getByRole("button", { name: "Leave group" }))
    fireEvent.click(screen.getByRole("button", { name: "Leave group" }))

    expect(await screen.findByText("You're not a member of this group.")).toBeDefined()
  })
})
