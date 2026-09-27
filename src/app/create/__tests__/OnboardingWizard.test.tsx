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
  // Reset, not just cleared: the thread tests below queue per-round
  // implementations, and a leftover Once from a failed test must not leak.
  mergeGapMock.mockReset()
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

// Task 3 (gap-ask-thread slice): the gap step keeps the whole conversation
// on screen. The wizard owns the thread; each Orbit line is composed once,
// when it arrives, and stored, so an earlier line can never re-render with a
// later round's wording. These drive the real wizard, with extraction landing
// incomplete on a time gap and mergeGapMock controlling each round.
describe("OnboardingWizard, the gap-ask thread", () => {
  const TIME_GAP = {
    missing: "time" as const,
    question: "What time do you usually play padel?",
    groupName: "Padel Crew",
    rhythms: [{ ...RHYTHMS[0], timeLocal: null }],
    candidateTimeLocal: null,
  }
  const ROUND_0 = "Here's what I got, but what time do you usually play padel?"
  const SPOT_QUESTION = "Where do you usually meet for padel?"

  // A fresh object per call: useActionState routes a result once per
  // reference, so a second extraction must be a different object to count
  // as a new one (the back-to-step-1 test depends on this).
  function incompleteExtract(): ExtractGroupState {
    return { status: "incomplete", gap: { ...TIME_GAP } }
  }

  function deferred<T>() {
    let resolve!: (v: T) => void
    const promise = new Promise<T>((r) => {
      resolve = r
    })
    return { promise, resolve }
  }

  async function landOnGap() {
    extractMock.mockResolvedValueOnce(incompleteExtract())
    render(<OnboardingWizard knownName="Jacob" />)
    fireEvent.change(screen.getByLabelText("About your group"), {
      target: { value: "We play padel twice a week." },
    })
    fireEvent.click(screen.getByRole("button", { name: "Continue" }))
    await vi.waitFor(() => expect(screen.getByLabelText(/message orbit/i)).toBeTruthy())
  }

  function send(text: string) {
    fireEvent.change(screen.getByLabelText(/message orbit/i), { target: { value: text } })
    fireEvent.click(screen.getByRole("button", { name: "Send answer" }))
  }

  function box(): HTMLTextAreaElement {
    return screen.getByLabelText(/message orbit/i) as HTMLTextAreaElement
  }

  function isBefore(a: HTMLElement, b: HTMLElement): boolean {
    return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
  }

  it("lands on the gap with exactly one Orbit bubble carrying the round-0 line", async () => {
    await landOnGap()
    expect(screen.getAllByText(ROUND_0)).toHaveLength(1)
    expect(screen.queryByText(/Thanks\. One more thing/)).toBeNull()
  })

  it("shows the answer as a bubble the moment it is sent, before the merge resolves, and empties the box", async () => {
    await landOnGap()
    const pending = deferred<unknown>()
    mergeGapMock.mockImplementationOnce(() => pending.promise)

    // Resolved in finally, pass or fail: React 19 entangles every transition
    // with a still-pending async action, so a merge left hanging here would
    // freeze the next test's extraction and fail it for an unrelated reason
    // (seen while this test was red).
    try {
      send("we start at 7")

      await vi.waitFor(() => expect(screen.getByText("we start at 7")).toBeTruthy())
      expect(box().value).toBe("")
      expect(mergeGapMock).toHaveBeenCalledTimes(1)
      // The answer still reaches the merge even though the box was cleared.
      expect((mergeGapMock.mock.calls[0][0] as { answer: string }).answer).toBe("we start at 7")
    } finally {
      pending.resolve({ status: "error" })
    }
  })

  it("keeps both Orbit lines and the answer on screen, in order, after a round that moved something", async () => {
    await landOnGap()
    mergeGapMock.mockResolvedValueOnce({
      status: "incomplete",
      round: 1,
      progressed: true,
      gap: { ...TIME_GAP, missing: "spot", question: SPOT_QUESTION },
    })

    send("we start at 7")

    const second = await vi.waitFor(() => screen.getByText(`Thanks. One more thing: ${SPOT_QUESTION}`))
    const first = screen.getByText(ROUND_0)
    const answer = screen.getByText("we start at 7")
    expect(isBefore(first, answer)).toBe(true)
    expect(isBefore(answer, second)).toBe(true)
  })

  it("appends only the guess line, with no question, after a stalled round on a spot gap", async () => {
    await landOnGap()
    mergeGapMock.mockResolvedValueOnce({
      status: "incomplete",
      round: 1,
      progressed: false,
      gap: { ...TIME_GAP, missing: "spot", question: SPOT_QUESTION },
    })

    send("idk")

    await vi.waitFor(() =>
      expect(screen.getByText("No problem. A best guess at a spot is fine for now.")).toBeTruthy()
    )
    expect(screen.queryByText(new RegExp(SPOT_QUESTION))).toBeNull()
  })

  it("rolls the answer back into the box and shows the error line when the merge fails", async () => {
    await landOnGap()
    mergeGapMock.mockResolvedValueOnce({ status: "error" })

    send("we start at 7")

    await vi.waitFor(() =>
      expect(
        screen.getByText("Hmm, that didn't go through. Give it another try in a moment.")
      ).toBeTruthy()
    )
    expect(box().value).toBe("we start at 7")
    // Only the box holds it now: no bubble carries the rolled-back answer.
    expect(screen.queryAllByText("we start at 7").filter((el) => el.tagName !== "TEXTAREA")).toHaveLength(0)
  })

  it("starts a fresh on-screen conversation after going back to step 1 and continuing again", async () => {
    await landOnGap()
    mergeGapMock.mockResolvedValueOnce({
      status: "incomplete",
      round: 1,
      progressed: true,
      gap: { ...TIME_GAP, missing: "spot", question: SPOT_QUESTION },
    })
    send("we start at 7")
    await vi.waitFor(() =>
      expect(screen.getByText(`Thanks. One more thing: ${SPOT_QUESTION}`)).toBeTruthy()
    )

    fireEvent.click(screen.getByRole("button", { name: "Back" }))
    extractMock.mockResolvedValueOnce(incompleteExtract())
    fireEvent.click(screen.getByRole("button", { name: "Continue" }))
    await vi.waitFor(() => expect(extractMock).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(screen.getByLabelText(/message orbit/i)).toBeTruthy())

    expect(screen.getAllByText(ROUND_0)).toHaveLength(1)
    expect(screen.queryByText("we start at 7")).toBeNull()
    expect(screen.queryByText(/Thanks\. One more thing/)).toBeNull()
  })
  // Task 4 carry-in A: while a merge is in flight the header back arrow is
  // hidden, the same rule the playback step applies during creation. With
  // it live, a founder could go back mid-merge and the stale result would
  // still land: a "ready" moved them from step 1 to the playback they had
  // just left, an "incomplete" appended to a conversation about to reset.
  it("hides the header back arrow while a merge is in flight, and brings it back after", async () => {
    await landOnGap()
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy()
    const pending = deferred<unknown>()
    mergeGapMock.mockImplementationOnce(() => pending.promise)
    try {
      send("we start at 7")
      await vi.waitFor(() => expect(screen.getByText("we start at 7")).toBeTruthy())
      expect(screen.queryByRole("button", { name: "Back" })).toBeNull()
    } finally {
      pending.resolve({ status: "error" })
    }
    await vi.waitFor(() => expect(screen.getByRole("button", { name: "Back" })).toBeTruthy())
  })
})
