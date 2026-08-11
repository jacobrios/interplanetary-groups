// @vitest-environment jsdom
//
// The contract: the founder's card is calm by default (dot-separated names,
// identical to what everyone sees) plus one quiet "Manage members" link;
// manage mode lists rows; the founder's own row has no remove; removing
// takes a confirm; the confirm carries the target's id; Done exits.

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react"
import ManageMembers from "../ManageMembers"

const removeMock = vi.fn(async (..._args: unknown[]): Promise<{ errors?: { general?: string } }> => ({}))
vi.mock("@/app/actions/remove-member", () => ({
  removeMemberAction: (...args: unknown[]) => removeMock(...args),
}))

afterEach(() => {
  cleanup()
  removeMock.mockClear()
  removeMock.mockImplementation(async () => ({}))
})

const MEMBERS = [
  { id: "u-founder", name: "Nina" },
  { id: "u-theo", name: "Theo" },
  { id: "u-ravi", name: "Ravi" },
]

function renderCard() {
  return render(
    <ManageMembers groupId="g-1" founderId="u-founder" members={MEMBERS} />
  )
}

describe("ManageMembers", () => {
  it("renders dot-separated names and a quiet manage link by default", () => {
    renderCard()
    expect(screen.getByText(/Nina/)).toBeDefined()
    expect(screen.getByText(/Theo/)).toBeDefined()
    expect(screen.getByRole("button", { name: "Manage members" })).toBeDefined()
    // No remove affordances in the calm state
    expect(screen.queryByRole("button", { name: /Remove/ })).toBeNull()
  })

  it("lists rows in manage mode, with no remove on the founder's own row", () => {
    renderCard()
    fireEvent.click(screen.getByRole("button", { name: "Manage members" }))

    // Two removable members, one founder without a remove control
    expect(screen.getAllByRole("button", { name: "Remove" })).toHaveLength(2)
    expect(screen.getByRole("button", { name: "Done" })).toBeDefined()
  })

  it("requires a confirm and passes the target's id to the action", async () => {
    renderCard()
    fireEvent.click(screen.getByRole("button", { name: "Manage members" }))
    // First Remove belongs to Theo (members render in given order, founder first)
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0])

    // Confirm copy appears; nothing has been called yet
    expect(screen.getByText("Remove Theo from the group?")).toBeDefined()
    expect(screen.getByText("They can rejoin with the invite link.")).toBeDefined()
    expect(removeMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Yes, remove" }))
    await waitFor(() => expect(removeMock).toHaveBeenCalledTimes(1))
    const formData = removeMock.mock.calls[0][1] as FormData
    expect(formData.get("groupId")).toBe("g-1")
    expect(formData.get("targetUserId")).toBe("u-theo")
  })

  it("backs out of a remove on Never mind", () => {
    renderCard()
    fireEvent.click(screen.getByRole("button", { name: "Manage members" }))
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0])
    fireEvent.click(screen.getByRole("button", { name: "Never mind" }))

    expect(removeMock).not.toHaveBeenCalled()
    expect(screen.queryByText("Remove Theo from the group?")).toBeNull()
  })

  it("returns to the calm state on Done", () => {
    renderCard()
    fireEvent.click(screen.getByRole("button", { name: "Manage members" }))
    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    expect(screen.getByRole("button", { name: "Manage members" })).toBeDefined()
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull()
  })

  it("surfaces the action's error copy", async () => {
    removeMock.mockImplementation(async () => ({
      errors: { general: "Only the founder can remove members." },
    }))
    renderCard()
    fireEvent.click(screen.getByRole("button", { name: "Manage members" }))
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0])
    fireEvent.click(screen.getByRole("button", { name: "Yes, remove" }))

    expect(await screen.findByText("Only the founder can remove members.")).toBeDefined()
  })
})
