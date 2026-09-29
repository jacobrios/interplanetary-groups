// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest"
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

  describe("install hint link", () => {
    const SAFARI =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
    afterEach(() => {
      vi.restoreAllMocks()
      vi.unstubAllGlobals()
    })

    it("sits centred below the invite hint on iPhone Safari", () => {
      vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(SAFARI)
      vi.stubGlobal("matchMedia", () => ({ matches: false }))
      render(<Step3Share groupId="g1" inviteToken="t" groupName="Crew" />)
      const hint = screen.getByText("You can invite people now or anytime later")
      const link = screen.getByRole("button", { name: "Use Orbit like an app" })
      expect(hint.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      const block = link.parentElement!
      expect(block.style.marginTop).toBe("1.25rem")
      expect(block.style.alignItems).toBe("center")
    })

    it("is absent where the how-to does not apply", () => {
      // jsdom's default user agent is not an iPhone.
      vi.stubGlobal("matchMedia", () => ({ matches: false }))
      render(<Step3Share groupId="g1" inviteToken="t" groupName="Crew" />)
      expect(screen.queryByRole("button", { name: "Use Orbit like an app" })).toBeNull()
    })
  })
})
