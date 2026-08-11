// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import Step1Describe from "../Step1Describe"
import { UNAVAILABLE_COPY } from "@/lib/orbit/unavailable-copy"

vi.mock("next/link", () => ({
  default: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))

function renderWithState(extractState: Parameters<typeof Step1Describe>[0]["extractState"]) {
  render(
    <Step1Describe
      founderName="Taylor"
      onFounderNameChange={() => {}}
      description="we climb sundays"
      onDescriptionChange={() => {}}
      formAction={() => {}}
      isExtracting={false}
      extractState={extractState}
    />
  )
}

describe("Step1Describe unavailable states", () => {
  it("shows the credits copy when the balance is dry", () => {
    renderWithState({ status: "unavailable", reason: "credits" })
    expect(screen.getByText(UNAVAILABLE_COPY.credits)).toBeTruthy()
  })

  it("shows the trouble copy for an outage", () => {
    renderWithState({ status: "unavailable", reason: "trouble" })
    expect(screen.getByText(UNAVAILABLE_COPY.trouble)).toBeTruthy()
  })
})
