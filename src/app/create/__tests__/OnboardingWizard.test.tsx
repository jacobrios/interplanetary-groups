// @vitest-environment jsdom
//
// Final-review fix (group-details-editing slice, finding 1): every prior
// test of step 2's editing drove Step2Playback through a harness that
// reproduced the wizard's wiring by hand, so nobody exercised the real
// OnboardingWizard handlers, and the real handleConfirm's untrimmed
// activity went unnoticed: "padel " (trailing space) reached
// createGroupAction as is, only to be trimmed by the founder's first
// group-info save afterward, which diffDetails then reported as a rename
// the founder never made.
//
// This test drives the real component end to end through the path step 2
// has as of the onboarding-step2-cleanup slice (Task 9): submit Step 1,
// land on the read-only playback, open "Edit details" (group info's own
// editor, in place), type a trailing space into Activity, tap Done,
// confirm, and read what actually reaches createGroupAction.
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, fireEvent } from "@testing-library/react"
import type { StoredRhythm } from "@/lib/orbit/rhythm"
import type { ExtractGroupState } from "@/app/actions/extract-group"
import { EXHAUSTED_COPY } from "@/lib/orbit/playback"

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
// and env-gated model calls this test must never touch. Typed as
// (..._args: unknown[]) rather than the real action signatures, matching
// EditEventDetails.test.tsx's mocks: the point of the mock is to observe
// what reaches it, not to re-type the server action.
const extractMock = vi.fn(
  async (..._args: unknown[]): Promise<ExtractGroupState> => ({
    status: "ready" as const,
    profile: { groupName: "Padel Crew", rhythms: RHYTHMS },
  })
)
vi.mock("@/app/actions/extract-group", () => ({
  extractGroupAction: (prev: unknown, formData: unknown) => extractMock(prev, formData),
}))

// Hoisted (Task 10, onboarding-step2-cleanup slice) so the exhausted-message
// test below can control what mergeGapAction resolves to per-test, the way
// extractMock already can; vi.mock's factory runs before this file's own
// top-level code, so a plain module-scope vi.fn() referenced from inside it
// would be a use-before-init.
const mergeGapMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/actions/merge-gap", () => ({
  mergeGapAction: mergeGapMock,
}))

const createMock = vi.fn(async (..._args: unknown[]) => ({
  groupId: "grp_1",
  inviteToken: "tok_1",
}))
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

    // Now on the real playback step. Open "Edit details" and type the
    // trailing space into the real editor's Activity field, then Done.
    await vi.waitFor(() =>
      expect(screen.getByRole("button", { name: "Edit details" })).toBeTruthy()
    )
    fireEvent.click(screen.getByRole("button", { name: "Edit details" }))
    fireEvent.change(screen.getByLabelText("Activity"), { target: { value: "padel " } })
    fireEvent.click(screen.getByRole("button", { name: "Done" }))

    fireEvent.click(screen.getByRole("button", { name: /looks right, set up invites/i }))
    await vi.waitFor(() => expect(createMock).toHaveBeenCalledTimes(1))

    const [payload] = createMock.mock.calls[0] as [
      { rhythms: { activity: string; title: string }[] },
    ]
    expect(payload.rhythms[0].activity).toBe("padel")
    expect(payload.rhythms[0].title).toBe("Padel")
  })

  it("carries a group renamed through Edit details into createGroupAction", async () => {
    render(<OnboardingWizard knownName="Jacob" />)

    fireEvent.change(screen.getByLabelText("About your group"), {
      target: { value: "We play padel twice a week." },
    })
    fireEvent.click(screen.getByRole("button", { name: "Continue" }))
    await vi.waitFor(() =>
      expect(screen.getByRole("button", { name: "Edit details" })).toBeTruthy()
    )
    fireEvent.click(screen.getByRole("button", { name: "Edit details" }))
    fireEvent.change(screen.getByLabelText("Group name"), { target: { value: "Court Crew" } })
    fireEvent.click(screen.getByRole("button", { name: "Done" }))

    fireEvent.click(screen.getByRole("button", { name: /looks right, set up invites/i }))
    await vi.waitFor(() => expect(createMock).toHaveBeenCalledTimes(1))

    const [payload] = createMock.mock.calls[0] as [{ groupName: string }]
    expect(payload.groupName).toBe("Court Crew")
  })
})

// Task 10 (onboarding-step2-cleanup slice): after three answers still leave
// a gap, Step 1's explainer used to say "day and time" no matter what was
// actually missing. This drives the real gap loop (extraction lands
// incomplete, one answer exhausts it) and checks the bubble names the real
// gap rather than the old one-size string.
describe("OnboardingWizard — exhausting the gap loop names what is still missing", () => {
  it("shows EXHAUSTED_COPY.spot, not the old single string, when the exhausted gap is a spot", async () => {
    extractMock.mockResolvedValueOnce({
      status: "incomplete",
      gap: {
        missing: "spot",
        question: "Where do you usually meet for padel?",
        groupName: "Padel Crew",
        rhythms: [{ ...RHYTHMS[0], venueName: null }],
        candidateTimeLocal: null,
      },
    })
    mergeGapMock.mockResolvedValueOnce({ status: "exhausted", missing: "spot" })

    render(<OnboardingWizard knownName="Jacob" />)

    fireEvent.change(screen.getByLabelText("About your group"), {
      target: { value: "We play padel twice a week." },
    })
    fireEvent.click(screen.getByRole("button", { name: "Continue" }))

    await vi.waitFor(() => expect(screen.getByLabelText(/message orbit/i)).toBeTruthy())

    fireEvent.change(screen.getByLabelText(/message orbit/i), { target: { value: "idk" } })
    fireEvent.click(screen.getByRole("button", { name: "Send answer" }))

    await vi.waitFor(() => expect(mergeGapMock).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(screen.getByText(EXHAUSTED_COPY.spot)).toBeTruthy())

    expect(screen.queryByText(/Add the day and time/)).toBeNull()
  })
})
