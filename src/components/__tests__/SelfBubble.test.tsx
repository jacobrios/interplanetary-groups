// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { SelfBubble } from "../SelfBubble"

afterEach(cleanup)

describe("SelfBubble", () => {
  it("renders its children", () => {
    render(
      <SelfBubble>
        <p>See you Monday</p>
      </SelfBubble>
    )
    expect(screen.getByText("See you Monday")).toBeDefined()
  })

  it("carries the viewer's own fill and the self-bubble radius, never teal or lime", () => {
    render(
      <SelfBubble>
        <p>See you Monday</p>
      </SelfBubble>
    )
    const bubble = screen.getByText("See you Monday").parentElement as HTMLElement
    expect(bubble.style.backgroundColor).toBe("var(--surface-self)")
    expect(bubble.style.borderRadius).toBe("16px 16px 5px 16px")
    expect(bubble.style.border).toBe("1px solid var(--hairline)")
    expect(bubble.style.backgroundColor).not.toContain("--action")
    expect(bubble.style.backgroundColor).not.toContain("--lime")
  })
})
