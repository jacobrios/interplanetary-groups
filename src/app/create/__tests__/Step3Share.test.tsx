// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import Step3Share from "../Step3Share"

const push = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}))

describe("Step3Share", () => {
  it("shows the group, the real invite URL, the share button, and the way in", () => {
    render(
      <Step3Share groupId="g1" inviteToken="tok123" groupName="Climbing Crew" />
    )
    expect(screen.getByText("Climbing Crew")).toBeTruthy()
    // jsdom's origin is http://localhost:3000; the URL is built client-side.
    expect(screen.getByText(/\/join\/tok123$/)).toBeTruthy()
    expect(screen.getByRole("button", { name: "Share invite link" })).toBeTruthy()
    expect(screen.getByText("You can invite people now or anytime later")).toBeTruthy()

    screen.getByRole("button", { name: /Take me to my group/ }).click()
    expect(push).toHaveBeenCalledWith("/groups/g1")
  })
})
