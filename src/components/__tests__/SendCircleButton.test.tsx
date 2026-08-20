// @vitest-environment jsdom
//
// The send circle is shared by the group chat composer and the onboarding
// gap-ask input, so the contract under test is the one both surfaces rely on:
// the two colour states, the pressability, and the accessible name each
// caller passes. Size is asserted too, because 40px is the design value
// (walkthrough.css .s2r-send / .gh-send) and the gap-ask copy had drifted to
// 36px before the extraction.

import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import SendCircleButton from "../SendCircleButton"

afterEach(cleanup)

describe("SendCircleButton", () => {
  it("rests grey and unpressable when there is nothing to send", () => {
    render(<SendCircleButton active={false} disabled label="Send message" />)
    const btn = screen.getByRole("button", { name: "Send message" }) as HTMLButtonElement

    expect(btn.disabled).toBe(true)
    expect(btn.style.backgroundColor).toBe("var(--surface-raised)")
    expect(btn.style.color).toBe("var(--text-faint)")
    expect(btn.style.border).toBe("1px solid var(--hairline)")
    expect(btn.style.cursor).toBe("default")
  })

  it("goes teal and pressable once there is text", () => {
    render(<SendCircleButton active disabled={false} label="Send message" />)
    const btn = screen.getByRole("button", { name: "Send message" }) as HTMLButtonElement

    expect(btn.disabled).toBe(false)
    expect(btn.style.backgroundColor).toBe("var(--action)")
    expect(btn.style.color).toBe("var(--action-ink)")
    expect(btn.style.border).toBe("1px solid var(--action)")
    expect(btn.style.cursor).toBe("pointer")
  })

  it("draws at the design's 40px in both states, so the circle never resizes", () => {
    const { rerender } = render(
      <SendCircleButton active={false} disabled label="Send message" />
    )
    const resting = screen.getByRole("button", { name: "Send message" })
    expect(resting.style.width).toBe("40px")
    expect(resting.style.height).toBe("40px")

    rerender(<SendCircleButton active disabled={false} label="Send message" />)
    const activeBtn = screen.getByRole("button", { name: "Send message" })
    expect(activeBtn.style.width).toBe("40px")
    expect(activeBtn.style.height).toBe("40px")
  })

  it("carries the caller's own accessible name", () => {
    render(<SendCircleButton active disabled={false} label="Send answer" />)
    expect(screen.getByRole("button", { name: "Send answer" })).toBeDefined()
    expect(screen.queryByRole("button", { name: "Send message" })).toBeNull()
  })

  it("submits the form it sits in", () => {
    render(
      <form>
        <SendCircleButton active disabled={false} label="Send message" />
      </form>
    )
    const btn = screen.getByRole("button", { name: "Send message" }) as HTMLButtonElement
    expect(btn.type).toBe("submit")
  })
})
