// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { OrbitBubble } from "@/components/OrbitBubble"

afterEach(cleanup)

describe("OrbitBubble", () => {
  it("renders the Orbit avatar and the children inside the bubble", () => {
    render(<OrbitBubble><p>hello group</p></OrbitBubble>)
    expect(screen.getByLabelText("Orbit")).toBeDefined()
    expect(screen.getByText("hello group")).toBeDefined()
  })
})
