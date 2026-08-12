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

  // Pins the owner-approved wording itself (spec: Approved copy, 11 Aug
  // 2026), not just the reason-to-copy mapping. The tests above would still
  // pass if this literal text drifted, as long as the component and the
  // constant drifted together.
  it("matches the owner-approved wording exactly", () => {
    expect(UNAVAILABLE_COPY.credits).toBe(
      "I hit a wall: this prototype ran out of the model credits I run on, and they're being topped up. Your description is safe right here. Try again in a little while."
    )
    expect(UNAVAILABLE_COPY.trouble).toBe(
      "I'm having trouble thinking right now. It's not you, the service I run on is acting up. Give it a minute and try again."
    )
  })
})
