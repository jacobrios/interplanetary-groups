// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { OrbitMark } from "@/components/OrbitMark"

afterEach(cleanup)

describe("OrbitMark", () => {
  it("renders an accessible image labeled Orbit by default", () => {
    render(<OrbitMark size={28} />)
    expect(screen.getByLabelText("Orbit")).toBeDefined()
  })

  it("is decorative when label is null", () => {
    const { container } = render(<OrbitMark size={20} label={null} />)
    expect(screen.queryByRole("img")).toBeNull()
    const slot = container.firstElementChild as HTMLElement
    expect(slot.getAttribute("aria-hidden")).toBe("true")
  })

  it("renders two marks without colliding SVG defs ids", () => {
    const { container } = render(<><OrbitMark size={28} /><OrbitMark size={28} /></>)
    const ids = Array.from(container.querySelectorAll("radialGradient")).map((g) => g.id)
    expect(ids.length).toBe(2)
    expect(new Set(ids).size).toBe(2)
  })
})
