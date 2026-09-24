// @vitest-environment jsdom
//
// Final-review fix (group-details-editing slice, finding 1): every prior
// test of "Change day or time" drove Step2Playback directly through a small
// stateful harness that reproduced handleRhythmChange's wiring by hand
// (Step2PlaybackDayTime.test.tsx). That harness never actually called the
// real OnboardingWizard.handleRhythmChange, so nobody had exercised its
// title re-derivation, and the real handleConfirm's own untrimmed activity
// went unnoticed: "padel " (trailing space) reached createGroupAction as
// is, only to be trimmed by the founder's first group-info save afterward,
// which diffDetails then reported as a rename the founder never made.
//
// This test drives the real component end to end: submit Step 1, land on
// the real playback step, open the real "Change day or time" editor, type
// a trailing space into Activity, confirm, and read what actually reaches
// createGroupAction.
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, fireEvent } from "@testing-library/react"
import type { StoredRhythm } from "@/lib/orbit/rhythm"

const RHYTHMS: StoredRhythm[] = [
  {
    activity: "padel",
    title: "Padel",
    cadence: "weekly",
    daysOfWeek: [1, 3],
    timeLocal: "08:00",
    venueName: "The club",
  },
]

// Action modules are mocked wholesale (the JoinForm.test.tsx precedent),
// never partially executed: extract.ts and merge.ts reach the Anthropic SDK
// and env-gated model calls this test must never touch.
const extractMock = vi.fn(async () => ({
  status: "ready" as const,
  profile: { groupName: "Padel Crew", rhythms: RHYTHMS },
}))
vi.mock("@/app/actions/extract-group", () => ({
  extractGroupAction: (prev: unknown, formData: unknown) => extractMock(prev, formData),
}))

vi.mock("@/app/actions/merge-gap", () => ({
  mergeGapAction: vi.fn(),
}))

const createMock = vi.fn(async () => ({ groupId: "grp_1", inviteToken: "tok_1" }))
vi.mock("@/app/actions/create-group", () => ({
  createGroupAction: (input: unknown) => createMock(input),
}))

import OnboardingWizard from "../OnboardingWizard"

afterEach(() => {
  cleanup()
  extractMock.mockClear()
  createMock.mockClear()
})

describe("OnboardingWizard, the real handler, not a harness copy", () => {
  it("trims a trailing space typed into an activity before it reaches createGroupAction, and its title matches the trimmed value", async () => {
    render(<OnboardingWizard knownName="Jacob" />)

    fireEvent.change(screen.getByLabelText("About your group"), {
      target: { value: "We play padel twice a week." },
    })
    fireEvent.click(screen.getByRole("button", { name: "Continue" }))
    await vi.waitFor(() => expect(extractMock).toHaveBeenCalledTimes(1))

    // Now on the real playback step. Open the real "Change day or time"
    // editor and type the trailing space directly into the real
    // handleRhythmChange's Activity field.
    await vi.waitFor(() =>
      expect(screen.getByRole("button", { name: "Change day or time" })).toBeTruthy()
    )
    fireEvent.click(screen.getByRole("button", { name: "Change day or time" }))
    fireEvent.change(screen.getByLabelText("Activity"), { target: { value: "padel " } })

    fireEvent.click(screen.getByRole("button", { name: /looks right, set up invites/i }))
    await vi.waitFor(() => expect(createMock).toHaveBeenCalledTimes(1))

    const input = createMock.mock.calls[0][0] as {
      rhythms: { activity: string; title: string }[]
    }
    expect(input.rhythms[0].activity).toBe("padel")
    expect(input.rhythms[0].title).toBe("Padel")
  })
})
