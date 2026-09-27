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
import { render, screen, fireEvent, act } from "@testing-library/react"
import StepGapAsk, { type GapTurn } from "../StepGapAsk"
import type { GapPayload } from "@/app/actions/extract-group"
import type { StoredRhythm } from "@/lib/orbit/rhythm"
import { gapBubbleLine, GAP_HINT_EXAMPLES } from "@/lib/orbit/gap"

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

// The wizard composes each Orbit line once and hands the step the thread;
// the default here is the one round-0 line the step opens with.
const thread: GapTurn[] = [
  { from: "orbit", text: gapBubbleLine(gap.question, 0, false, gap.missing) },
]

interface RenderOverrides {
  answer?: string
  onAnswerChange?: (v: string) => void
  onSubmit?: () => void
  isMerging?: boolean
  thread?: GapTurn[]
}

function renderStepGapAsk(overrides: RenderOverrides = {}) {
  const onAnswerChange = overrides.onAnswerChange ?? vi.fn()
  const onSubmit = overrides.onSubmit ?? vi.fn()
  const utils = render(
    <StepGapAsk
      founderName="Riley"
      gap={gap}
      thread={overrides.thread ?? thread}
      answer={overrides.answer ?? ""}
      onAnswerChange={onAnswerChange}
      onSubmit={onSubmit}
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
      thread={overrides.thread ?? thread}
      answer={overrides.answer ?? ""}
      onAnswerChange={overrides.onAnswerChange}
      onSubmit={overrides.onSubmit}
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
        thread={thread}
        answer=""
        onAnswerChange={() => {}}
        onSubmit={() => {}}
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
        thread={thread}
        answer=""
        onAnswerChange={() => {}}
        onSubmit={() => {}}
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
        thread={thread}
        answer=""
        onAnswerChange={() => {}}
        onSubmit={() => {}}
        isMerging={false}
        mergeError={null}
      />
    )

    expect(screen.getByText(/the tap room/i)).toBeTruthy()
  })
})

// Task 10 (onboarding-step2-cleanup slice): the header back arrow does what
// this link used to do, so the link is redundant and gone.
describe("StepGapAsk — no edit-description link (the header back arrow covers it)", () => {
  it("has no Edit my description link (decision 6: the header back arrow does the same)", () => {
    renderStepGapAsk()
    expect(screen.queryByRole("button", { name: "Edit my description" })).toBeNull()
  })

  it("renders a spot gap: the whole schedule, the lime where? marker, and the spot hint", () => {
    const spotGap: GapPayload = {
      ...gap,
      missing: "spot",
      question: "Where do you usually meet for tennis?",
      rhythms: [{ ...rhythm, timeLocal: "09:00" }],
    }
    render(
      <StepGapAsk
        founderName="Riley"
        gap={spotGap}
        thread={[{ from: "orbit", text: gapBubbleLine(spotGap.question, 0, false, spotGap.missing) }]}
        answer=""
        onAnswerChange={() => {}}
        onSubmit={() => {}}
        isMerging={false}
        mergeError={null}
      />
    )

    expect(screen.getByText("where?")).toBeTruthy()
    expect(screen.getByText(/Sat at 9am/)).toBeTruthy()
    expect(
      screen.getByText("Here's what I got, but where do you usually meet for tennis?")
    ).toBeTruthy()
    expect(screen.getByText("e.g. “Movement Gowanus” · “Sam’s place”")).toBeTruthy()
  })
})

// Task 3 (gap-ask-thread slice): the step renders the conversation the
// wizard keeps, founder turns in the viewer's own bubble, and Orbit's merge
// pause as the thread's last item rather than under the composer.
describe("StepGapAsk, the thread", () => {
  it("renders a founder turn in a --surface-self bubble, right-aligned", () => {
    renderStepGapAsk({
      thread: [...thread, { from: "founder", text: "we start at 7" }],
    })
    const text = screen.getByText("we start at 7")
    const bubble = text.closest("div") as HTMLElement
    expect(bubble.style.backgroundColor).toBe("var(--surface-self)")
    // SelfBubble's own wrapper sits inside the caller's alignment row.
    const row = bubble.parentElement?.parentElement as HTMLElement
    expect(row.style.justifyContent).toBe("flex-end")
  })

  it("renders every turn, in order", () => {
    renderStepGapAsk({
      thread: [
        ...thread,
        { from: "founder", text: "we start at 7" },
        { from: "orbit", text: "Thanks. One more thing: Where do you meet?" },
      ],
    })
    const first = screen.getByText(thread[0].text)
    const answer = screen.getByText("we start at 7")
    const second = screen.getByText("Thanks. One more thing: Where do you meet?")
    expect(first.compareDocumentPosition(answer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(answer.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("shows Orbit's merge pause only while merging, after the last turn, and keeps the hint line either way", () => {
    const { rerender, onAnswerChange, onSubmit } = renderStepGapAsk({
      thread: [...thread, { from: "founder", text: "we start at 7" }],
    })
    expect(screen.queryByText("One sec, I'm updating your schedule.")).toBeNull()
    expect(screen.getByText(/around 9am/)).toBeTruthy()

    rerender(
      <StepGapAsk
        founderName="Riley"
        gap={gap}
        thread={[...thread, { from: "founder", text: "we start at 7" }]}
        answer=""
        onAnswerChange={onAnswerChange}
        onSubmit={onSubmit}
        isMerging
        mergeError={null}
      />
    )
    const pause = screen.getByText("One sec, I'm updating your schedule.")
    const answer = screen.getByText("we start at 7")
    expect(answer.compareDocumentPosition(pause) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // The pause sits in the thread, above the composer, not below it.
    const composer = screen.getByLabelText(/message orbit/i)
    expect(pause.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText(/around 9am/)).toBeTruthy()
  })
})

// Task 4 (gap-ask-thread slice): the gap step is its own full-height screen,
// the card and the thread scrolling together above a pinned composer, and
// the view following the newest line. jsdom has no layout engine, so these
// hold to structure (what sits inside the scrolling region and what does
// not) and to the scroll call itself; how it looks and moves on a phone is
// the real-phone pass's to judge.
describe("StepGapAsk, the pinned composer", () => {
  function scrollRegion(container: HTMLElement): HTMLElement {
    const region = container.querySelector("[data-gap-scroll]")
    expect(region).not.toBeNull()
    return region as HTMLElement
  }

  it("keeps the card and the thread inside the scrolling region, and the composer outside it", () => {
    const { container } = renderStepGapAsk({
      thread: [...thread, { from: "founder", text: "we start at 7" }],
    })
    const region = scrollRegion(container)
    expect(region.contains(screen.getByText("Tennis Club"))).toBe(true)
    expect(region.contains(screen.getByText(thread[0].text))).toBe(true)
    expect(region.contains(screen.getByText("we start at 7"))).toBe(true)
    expect(region.contains(screen.getByLabelText(/message orbit/i))).toBe(false)
    expect(region.contains(screen.getByRole("button", { name: "Send answer" }))).toBe(false)
  })

  it("keeps the box open while the merge runs, so the phone keyboard stays up, and still refuses a second send", () => {
    // A disabled field dismisses the iOS keyboard, which is why the group
    // chat stopped disabling its input (message-send-latency slice one).
    // The double-send guard lives on the send button and the form instead.
    const { onSubmit, onAnswerChange } = renderStepGapAsk({ answer: "and Movement", isMerging: true })
    expect(textarea().disabled).toBe(false)
    fireEvent.change(textarea(), { target: { value: "and Movement!" } })
    expect(onAnswerChange).toHaveBeenCalledWith("and Movement!")
    const send = screen.getByRole("button", { name: "Send answer" }) as HTMLButtonElement
    expect(send.disabled).toBe(true)
    fireEvent.submit(textarea().closest("form")!)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("scrolls the newest line into view on arrival, and when the merge pause appears", () => {
    // jsdom has no scrollIntoView; install a spy for this test and put the
    // prototype back exactly as it was afterwards.
    const proto = Element.prototype as unknown as { scrollIntoView?: unknown }
    const had = Object.prototype.hasOwnProperty.call(proto, "scrollIntoView")
    const original = proto.scrollIntoView
    const spy = vi.fn()
    proto.scrollIntoView = spy
    try {
      const { rerender, onAnswerChange, onSubmit } = renderStepGapAsk()
      // First mount lands on the newest line too.
      expect(spy).toHaveBeenCalled()
      spy.mockClear()

      const withAnswer: GapTurn[] = [...thread, { from: "founder", text: "we start at 7" }]
      rerenderWith(rerender, { thread: withAnswer, onAnswerChange, onSubmit })
      expect(spy).toHaveBeenCalledWith({ block: "end" })
      spy.mockClear()

      rerenderWith(rerender, { thread: withAnswer, onAnswerChange, onSubmit, isMerging: true })
      expect(spy).toHaveBeenCalledWith({ block: "end" })
      spy.mockClear()

      // Re-rendering with nothing new (a keystroke in the box) does not
      // yank the view.
      rerenderWith(rerender, {
        thread: withAnswer,
        answer: "x",
        onAnswerChange,
        onSubmit,
        isMerging: true,
      })
      expect(spy).not.toHaveBeenCalled()
    } finally {
      if (had) proto.scrollIntoView = original
      else delete proto.scrollIntoView
    }
  })
})

// The first tap into the box (owner's iPhone Chrome pass, 27 Sept 2026):
// iOS's own focus scroll ignores Chrome's floating address bar, which sits
// just above the keyboard, so the composer and hint landed partly under it.
// After a send the thread's own scrollIntoView lifted everything clear, which
// is why later rounds looked right. The fix scrolls the pinned bottom into
// view once the keyboard has opened. These are structural checks only: jsdom
// has no keyboard, no visual viewport and no address bar, so whether the box
// actually clears Chrome's bar is judged on the owner's phone and nowhere
// else.
describe("StepGapAsk, lifting the composer clear of the keyboard on first focus", () => {
  function pinned(container: HTMLElement): HTMLElement {
    const el = container.querySelector("[data-gap-pinned]")
    expect(el).not.toBeNull()
    return el as HTMLElement
  }

  // Installs a scrollIntoView spy that records which element it was called
  // on (the thread's end sentinel also calls it on mount), and optionally a
  // visualViewport stub. Restores both exactly as they were.
  function withStubs(
    viewport: EventTarget | undefined,
    body: (spy: ReturnType<typeof vi.fn>) => void
  ) {
    const proto = Element.prototype as unknown as { scrollIntoView?: unknown }
    const hadScroll = Object.prototype.hasOwnProperty.call(proto, "scrollIntoView")
    const originalScroll = proto.scrollIntoView
    const spy = vi.fn()
    proto.scrollIntoView = spy
    const vvDescriptor = Object.getOwnPropertyDescriptor(window, "visualViewport")
    Object.defineProperty(window, "visualViewport", { value: viewport, configurable: true })
    vi.useFakeTimers()
    try {
      body(spy)
    } finally {
      vi.useRealTimers()
      if (vvDescriptor) Object.defineProperty(window, "visualViewport", vvDescriptor)
      else delete (window as unknown as { visualViewport?: unknown }).visualViewport
      if (hadScroll) proto.scrollIntoView = originalScroll
      else delete proto.scrollIntoView
    }
  }

  function callsOn(spy: ReturnType<typeof vi.fn>, el: Element) {
    return spy.mock.contexts
      .map((ctx, i) => ({ ctx, args: spy.mock.calls[i] }))
      .filter(({ ctx }) => ctx === el)
  }

  it("scrolls the pinned bottom into view once, when the keyboard resizes the visual viewport", () => {
    const viewport = new EventTarget()
    withStubs(viewport, (spy) => {
      const { container } = renderStepGapAsk()
      const bottom = pinned(container)
      expect(bottom.contains(textarea())).toBe(true)
      expect(bottom.textContent).toContain(GAP_HINT_EXAMPLES[gap.missing])

      fireEvent.focus(textarea())
      expect(callsOn(spy, bottom)).toHaveLength(0)
      act(() => {
        viewport.dispatchEvent(new Event("resize"))
      })
      const calls = callsOn(spy, bottom)
      expect(calls).toHaveLength(1)
      expect(calls[0].args).toEqual([{ block: "end" }])

      // Once per focus: the fallback timer and a second resize add nothing.
      act(() => {
        vi.advanceTimersByTime(1000)
        viewport.dispatchEvent(new Event("resize"))
      })
      expect(callsOn(spy, bottom)).toHaveLength(1)
    })
  })

  it("falls back to a timer when there is no visual viewport", () => {
    withStubs(undefined, (spy) => {
      const { container } = renderStepGapAsk()
      const bottom = pinned(container)
      fireEvent.focus(textarea())
      expect(callsOn(spy, bottom)).toHaveLength(0)
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      const calls = callsOn(spy, bottom)
      expect(calls).toHaveLength(1)
      expect(calls[0].args).toEqual([{ block: "end" }])
    })
  })

  it("does nothing if the box loses focus before the keyboard opens", () => {
    const viewport = new EventTarget()
    withStubs(viewport, (spy) => {
      const { container } = renderStepGapAsk()
      const bottom = pinned(container)
      fireEvent.focus(textarea())
      fireEvent.blur(textarea())
      act(() => {
        viewport.dispatchEvent(new Event("resize"))
        vi.advanceTimersByTime(1000)
      })
      expect(callsOn(spy, bottom)).toHaveLength(0)
    })
  })
})
