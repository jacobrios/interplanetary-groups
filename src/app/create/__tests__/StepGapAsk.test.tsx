// @vitest-environment jsdom
//
// The composer wraps rather than scrolling sideways (spec:
// docs/superpowers/specs/2026-09-04-chat-input-wrap-design.md), reported
// from production with a screenshot showing "also, you need to know where
// we c" cut off mid-word by a single-line <input>. StepGapAsk had no
// dedicated test file before this fix.
//
// Same honest scope note as ChatInput.test.tsx: jsdom has no layout engine,
// so visible wrapping and the exact resting-height pixel numbers were
// proven in a real browser (in this task's report), not here. These tests
// hold to what jsdom can actually tell us — element type, whether Enter
// reaches onSubmit, and whether this file's own auto-grow function sets the
// style properties it's supposed to.
//
// One more limit, caught in code review and worth stating precisely rather
// than glossing over: jsdom implements no implicit submit-on-Enter for ANY
// form control, not even a plain <input type="text">. So "pressing Enter
// does not submit" below would pass unchanged against the pre-fix <input>
// code too — in isolation it cannot tell you a real browser's implicit
// submission was ever a risk here. What it DOES prove, on its own, is
// narrower and still real: nothing in this file's own event wiring calls
// onSubmit on Enter, which is exactly what an earlier draft of this fix
// added by mistake (see the mutation evidence in this task's report). The
// actual requirement — Enter never submits, in a real browser — is covered
// by this test TOGETHER WITH "renders a textarea rather than a single-line
// input" above it: a real <textarea> never implicitly submits on Enter,
// full stop, so element-type plus no-explicit-handler is jointly
// conclusive even though neither alone is. Nothing was added to chase this
// in isolation, because there is nothing in jsdom to assert against that a
// real browser would answer differently.
//
// Overrides mid-task: the spec called for Enter-submits/Shift+Enter-inserts;
// the owner overruled that (Enter never submits — consistency with the group
// chat composer beats a marginal convenience here, his call, stated in the
// requirement change). The Enter test below asserts the current, corrected
// behaviour.
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import StepGapAsk from "../StepGapAsk"
import type { GapPayload } from "@/app/actions/extract-group"
import type { StoredRhythm } from "@/lib/orbit/rhythm"

const rhythm: StoredRhythm = {
  activity: "tennis",
  title: "Tennis",
  cadence: "weekly",
  daysOfWeek: [6],
  timeLocal: null,
  venueName: null,
}

const gap: GapPayload = {
  missing: "time",
  question: "What time do you usually play on Saturdays?",
  groupName: "Tennis Club",
  rhythms: [rhythm],
  candidateTimeLocal: null,
}

interface RenderOverrides {
  answer?: string
  onAnswerChange?: (v: string) => void
  onSubmit?: () => void
  isMerging?: boolean
}

function renderStepGapAsk(overrides: RenderOverrides = {}) {
  const onAnswerChange = overrides.onAnswerChange ?? vi.fn()
  const onSubmit = overrides.onSubmit ?? vi.fn()
  const utils = render(
    <StepGapAsk
      founderName="Riley"
      gap={gap}
      round={1}
      stalled={false}
      answer={overrides.answer ?? ""}
      onAnswerChange={onAnswerChange}
      onSubmit={onSubmit}
      onEditDescription={() => {}}
      isMerging={overrides.isMerging ?? false}
      mergeError={null}
    />
  )
  return { ...utils, onAnswerChange, onSubmit }
}

function rerenderWith(
  rerender: (ui: React.ReactElement) => void,
  overrides: RenderOverrides & { onAnswerChange: (v: string) => void; onSubmit: () => void }
) {
  rerender(
    <StepGapAsk
      founderName="Riley"
      gap={gap}
      round={1}
      stalled={false}
      answer={overrides.answer ?? ""}
      onAnswerChange={overrides.onAnswerChange}
      onSubmit={overrides.onSubmit}
      onEditDescription={() => {}}
      isMerging={overrides.isMerging ?? false}
      mergeError={null}
    />
  )
}

function textarea(): HTMLTextAreaElement {
  return screen.getByLabelText(/message orbit/i) as HTMLTextAreaElement
}

// Same reasoning as ChatInput.test.tsx's copy of this helper: read the
// border the way the production autoGrow function does, rather than assume
// jsdom reports any particular number for this element's real 1px border
// (the real border is what caught the 1.5px-short bug in the browser; jsdom
// resolves border-width differently again, which is exactly why this reads
// it live instead of hardcoding either browser's number).
function expectedHeight(el: HTMLTextAreaElement, scrollHeight: number): string {
  const cs = getComputedStyle(el)
  const border = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth)
  return `${scrollHeight + border}px`
}

describe("StepGapAsk — composer wraps instead of scrolling sideways", () => {
  it("renders a textarea rather than a single-line input", () => {
    renderStepGapAsk()
    expect(textarea().tagName).toBe("TEXTAREA")
  })

  it("starts at exactly one row, so the resting state is unchanged", () => {
    renderStepGapAsk()
    expect(textarea().rows).toBe(1)
  })

  it("never disables resizing by drag", () => {
    renderStepGapAsk()
    expect(textarea().style.resize).toBe("none")
  })

  it("caps growth with a maxHeight and scrolls internally past it", () => {
    renderStepGapAsk()
    const el = textarea()
    expect(el.style.maxHeight).not.toBe("")
    expect(el.style.overflowY).toBe("auto")
  })

  // Vacuous alone against jsdom (see the file header): this guards against
  // an explicit Enter-submits handler being re-added, and only proves the
  // real requirement jointly with "renders a textarea" above, since a real
  // browser never implicitly submits a textarea on Enter regardless.
  it("pressing Enter does not submit — the send button is the only way to send", () => {
    const { onSubmit } = renderStepGapAsk({ answer: "around 9am" })
    fireEvent.keyDown(textarea(), { key: "Enter" })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("grows to fit content reported by scrollHeight as the answer prop changes", () => {
    const onAnswerChange = vi.fn()
    const onSubmit = vi.fn()
    const { rerender } = renderStepGapAsk({ answer: "", onAnswerChange, onSubmit })
    const el = textarea()

    Object.defineProperty(el, "scrollHeight", { value: 95, configurable: true })
    rerenderWith(rerender, { answer: "around 9am, but sometimes we push it to 9:30 if it's cold", onAnswerChange, onSubmit })

    expect(el.style.height).toBe(expectedHeight(el, 95))
  })

  it("shrinks back to resting height when the answer is cleared for a fresh merge round", () => {
    const onAnswerChange = vi.fn()
    const onSubmit = vi.fn()
    const { rerender } = renderStepGapAsk({ answer: "", onAnswerChange, onSubmit })
    const el = textarea()

    Object.defineProperty(el, "scrollHeight", { value: 95, configurable: true })
    rerenderWith(rerender, { answer: "a long answer that grew the box", onAnswerChange, onSubmit })
    expect(el.style.height).toBe(expectedHeight(el, 95))

    Object.defineProperty(el, "scrollHeight", { value: 42, configurable: true })
    rerenderWith(rerender, { answer: "", onAnswerChange, onSubmit })
    expect(el.style.height).toBe(expectedHeight(el, 42))
  })
})

// Task 9 (venue-on-playback slice, 4 Sept 2026): a venue extraction already
// captured used to vanish on this card, because PlaybackCard had no venue
// rendering at all and this file never read `venueName`. Read-only display
// is enough here — the founder edits it on Step 2 — so this is checked as
// plain text rather than the tappable control Step2Playback gets.
describe("StepGapAsk — shows a captured venue instead of silently dropping it", () => {
  it("shows the gapped (primary) rhythm's captured venue inline, next to its marker", () => {
    render(
      <StepGapAsk
        founderName="Riley"
        gap={{ ...gap, rhythms: [{ ...rhythm, venueName: "Riverside courts" }] }}
        round={1}
        stalled={false}
        answer=""
        onAnswerChange={() => {}}
        onSubmit={() => {}}
        onEditDescription={() => {}}
        isMerging={false}
        mergeError={null}
      />
    )

    expect(screen.getByText(/riverside courts/i)).toBeTruthy()
  })

  it("renders no stray separator when the gapped rhythm has no captured venue", () => {
    render(
      <StepGapAsk
        founderName="Riley"
        gap={gap}
        round={1}
        stalled={false}
        answer=""
        onAnswerChange={() => {}}
        onSubmit={() => {}}
        onEditDescription={() => {}}
        isMerging={false}
        mergeError={null}
      />
    )

    // Scoped to the gapped row's own value cell (found via its "TENNIS"
    // label), rather than a page-wide search: the hint line below the
    // composer ("e.g. "around 9am" · "we start at 7pm"") legitimately
    // contains a "·" of its own and is not what this guards.
    const label = screen.getByText("TENNIS")
    const valueCell = label.parentElement?.children[1] as HTMLElement
    expect(valueCell.textContent).not.toContain("·")
  })

  it("shows a secondary rhythm's captured venue inline too", () => {
    const secondary: StoredRhythm = {
      activity: "beers",
      title: "Beers",
      cadence: "monthly",
      daysOfWeek: null,
      timeLocal: null,
      venueName: "The Tap Room",
    }
    render(
      <StepGapAsk
        founderName="Riley"
        gap={{ ...gap, rhythms: [rhythm, secondary] }}
        round={1}
        stalled={false}
        answer=""
        onAnswerChange={() => {}}
        onSubmit={() => {}}
        onEditDescription={() => {}}
        isMerging={false}
        mergeError={null}
      />
    )

    expect(screen.getByText(/the tap room/i)).toBeTruthy()
  })
})
