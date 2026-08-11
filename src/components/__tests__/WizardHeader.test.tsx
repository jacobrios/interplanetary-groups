// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { WizardHeader } from "../WizardHeader"

describe("WizardHeader", () => {
  it("names Orbit and counts the step", () => {
    render(<WizardHeader step={1} />)
    expect(screen.getByText("Orbit")).toBeTruthy()
    expect(screen.getByText("Step 1 of 3")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull()
  })

  it("shows a back control only when a back path exists, and wires it", () => {
    const onBack = vi.fn()
    render(<WizardHeader step={2} onBack={onBack} />)
    screen.getByRole("button", { name: "Back" }).click()
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
