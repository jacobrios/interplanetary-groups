// @vitest-environment jsdom
//
// Onboarding-nav slice (2026-09-04): a returning founder's name is already
// known, so Step 1 must show it as fact rather than invite an edit the write
// path silently discards (spec: docs/superpowers/specs/2026-09-04-onboarding-nav-design.md).
// These tests cover the three things that spec calls out as tested-in-vitest:
// the read-only render for a known founder, the editable render for a new
// one, and the Continue gate in both cases, plus the exit link's destination.
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import Step1Describe from "../Step1Describe"
import type { ExtractGroupState } from "@/app/actions/extract-group"

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

const idleState: ExtractGroupState = { status: "idle" }

function renderStep1(overrides: Partial<Parameters<typeof Step1Describe>[0]> = {}) {
  render(
    <Step1Describe
      founderName=""
      onFounderNameChange={() => {}}
      knownName={null}
      description=""
      onDescriptionChange={() => {}}
      formAction={() => {}}
      isExtracting={false}
      extractState={idleState}
      {...overrides}
    />
  )
}

function continueButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: /continue/i }) as HTMLButtonElement
}

describe("Step1Describe — known vs. unknown founder name", () => {
  it("renders an editable name input for a first-time founder (knownName null)", () => {
    renderStep1({ knownName: null, founderName: "" })

    const input = screen.getByLabelText(/your name/i) as HTMLInputElement
    expect(input.tagName).toBe("INPUT")
    expect(input.disabled).toBe(false)
  })

  it("renders the known name as text, associated with the Your name label, not an input", () => {
    renderStep1({ knownName: "Jacob", founderName: "Jacob" })

    // The name must be on screen as plain fact...
    expect(screen.getByText("Jacob")).toBeTruthy()
    // ...programmatically associated with the "Your name" label via
    // aria-labelledby, so a screen reader announces "Your name, Jacob" on
    // this path exactly as it does on the editable one (code review finding,
    // 2026-09-04: the first cut of this component gave the label
    // `htmlFor={undefined}` here and nothing else picked up the
    // association, leaving a returning founder's screen reader with a bare
    // label and a bare string). getByLabelText throws if no element is
    // associated with a "Your name" label, so this line alone is the
    // regression guard; the tagName check below only adds "and it isn't an
    // input" on top of "and it exists".
    const labelledValue = screen.getByLabelText(/your name/i)
    expect(labelledValue.textContent).toBe("Jacob")
    // ...and it must not be an editable form control a founder could type
    // into to override it.
    expect(labelledValue.tagName).not.toBe("INPUT")
  })

  it("does not render a disabled input for a known name (a disabled input invites hunting for how to enable it)", () => {
    renderStep1({ knownName: "Jacob", founderName: "Jacob" })

    // The only textbox left on the screen should be the description
    // textarea — no <input> at all for the name field, disabled or not.
    const textboxes = screen.getAllByRole("textbox")
    expect(textboxes).toHaveLength(1)
    expect((textboxes[0] as HTMLTextAreaElement).tagName).toBe("TEXTAREA")
  })

  it("gates Continue on name AND description for a first-time founder", () => {
    const { rerender } = render(
      <Step1Describe
        founderName=""
        onFounderNameChange={() => {}}
        knownName={null}
        description=""
        onDescriptionChange={() => {}}
        formAction={() => {}}
        isExtracting={false}
        extractState={idleState}
      />
    )
    expect(continueButton().disabled).toBe(true)

    // Name alone: still disabled.
    rerender(
      <Step1Describe
        founderName="Taylor"
        onFounderNameChange={() => {}}
        knownName={null}
        description=""
        onDescriptionChange={() => {}}
        formAction={() => {}}
        isExtracting={false}
        extractState={idleState}
      />
    )
    expect(continueButton().disabled).toBe(true)

    // Description alone (name still empty): still disabled — this is the
    // first-time-founder gate this slice must leave untouched.
    rerender(
      <Step1Describe
        founderName=""
        onFounderNameChange={() => {}}
        knownName={null}
        description="we climb sundays"
        onDescriptionChange={() => {}}
        formAction={() => {}}
        isExtracting={false}
        extractState={idleState}
      />
    )
    expect(continueButton().disabled).toBe(true)

    // Both name and description: enabled.
    rerender(
      <Step1Describe
        founderName="Taylor"
        onFounderNameChange={() => {}}
        knownName={null}
        description="we climb sundays"
        onDescriptionChange={() => {}}
        formAction={() => {}}
        isExtracting={false}
        extractState={idleState}
      />
    )
    expect(continueButton().disabled).toBe(false)
  })

  it("gates Continue on description alone when the founder's name is already known", () => {
    const { rerender } = render(
      <Step1Describe
        founderName="Jacob"
        onFounderNameChange={() => {}}
        knownName="Jacob"
        description=""
        onDescriptionChange={() => {}}
        formAction={() => {}}
        isExtracting={false}
        extractState={idleState}
      />
    )
    // No description yet: still disabled, even though the name is known.
    expect(continueButton().disabled).toBe(true)

    rerender(
      <Step1Describe
        founderName="Jacob"
        onFounderNameChange={() => {}}
        knownName="Jacob"
        description="we climb sundays"
        onDescriptionChange={() => {}}
        formAction={() => {}}
        isExtracting={false}
        extractState={idleState}
      />
    )
    // Description alone is enough now — the name is a known fact, not a gate.
    expect(continueButton().disabled).toBe(false)
  })

  it("does not require founderName to be non-empty when knownName is set (isolates the OR from the name-gate)", () => {
    // In production founderName is always seeded from knownName by the
    // wizard, so the two are never actually out of sync — but that
    // coupling lives one file up. Testing the component with founderName
    // empty and knownName set pins Step1Describe's OWN gating logic
    // (knownName !== null bypasses the name half of the gate) rather than
    // riding on the wizard's invariant to make the assertion pass by
    // coincidence.
    render(
      <Step1Describe
        founderName=""
        onFounderNameChange={() => {}}
        knownName="Jacob"
        description="we climb sundays"
        onDescriptionChange={() => {}}
        formAction={() => {}}
        isExtracting={false}
        extractState={idleState}
      />
    )
    expect(continueButton().disabled).toBe(false)
  })
})

describe("Step1Describe — exit link", () => {
  it("points the exit at /groups, the fixed parent, not the guessing front door", () => {
    renderStep1()
    const exit = screen.getByRole("link", { name: /never mind, take me back/i })
    expect(exit.getAttribute("href")).toBe("/groups")
  })
})

describe("Step1Describe — description placeholder", () => {
  it("does not suggest a monthly rhythm, which the product can't schedule", () => {
    renderStep1()
    const textarea = screen.getByPlaceholderText(
      "e.g. A few of us climb at Summit Gym on Sunday mornings at 8."
    )
    expect(textarea.tagName).toBe("TEXTAREA")
  })
})
