// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { TailedOrbitBubble } from "@/components/TailedOrbitBubble"

afterEach(cleanup)

describe("TailedOrbitBubble", () => {
  it("renders its children inside the bubble", () => {
    render(
      <TailedOrbitBubble>
        <p>hello group</p>
      </TailedOrbitBubble>
    )
    expect(screen.getByText("hello group")).toBeDefined()
  })

  it("does not render an Orbit avatar, the whole point of the tailed variant", () => {
    render(
      <TailedOrbitBubble>
        <p>hello group</p>
      </TailedOrbitBubble>
    )
    expect(screen.queryByRole("img")).toBeNull()
    expect(screen.queryByLabelText("Orbit")).toBeNull()
  })
})
