// @vitest-environment jsdom
//
// The composer wraps rather than scrolling sideways (spec:
// docs/superpowers/specs/2026-09-04-chat-input-wrap-design.md), reported
// from production with a screenshot showing "he line. It just keeps on
// going forever." scrolled off the edge of a single-line <input>. ChatInput
// had no dedicated test file before this fix; GroupHome.test.tsx exercises
// it indirectly (asserting the input is never disabled) but nothing covered
// the wrap behaviour itself.
//
// What jsdom genuinely can and can't tell us, stated up front so these
// reads honestly: jsdom has no layout engine, so it cannot show text
// visibly wrapping or measure a real resting-height pixel value — the spec's
// own "how this is verified" section puts both of those in the browser, not
// here, and that browser pass (plus the exact before/after height numbers)
// is in this task's report rather than in this file. What jsdom CAN tell us,
// and what these tests hold to: which DOM element got rendered (wrapping is
// not something CSS can add to an <input> — it requires the element itself
// to change, so checking tagName is checking the actual mechanism, not a
// cosmetic detail), whether a keyboard event reaches the onSubmit callback,
// and whether this component's own auto-grow function sets the style
// properties it's supposed to.
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
// the owner overruled that after the spec was written (Enter never submits,
// the send button is the only way to send, for consistency with the gap-ask
// composer's identical decision). The Enter test below asserts the current,
// corrected behaviour.
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import ChatInput from "../ChatInput"

interface RenderOverrides {
  value?: string
  onChange?: (value: string) => void
  onSubmit?: (formData: FormData) => void
  errorMsg?: string | null
}

function renderChatInput(overrides: RenderOverrides = {}) {
  const onChange = overrides.onChange ?? vi.fn()
  const onSubmit = overrides.onSubmit ?? vi.fn()
  const utils = render(
    <ChatInput
      groupId="g1"
      value={overrides.value ?? ""}
      onChange={onChange}
      onSubmit={onSubmit}
      errorMsg={overrides.errorMsg ?? null}
    />
  )
  return { ...utils, onChange, onSubmit }
}

function rerenderWith(
  rerender: (ui: React.ReactElement) => void,
  overrides: RenderOverrides & { onChange: (value: string) => void; onSubmit: (formData: FormData) => void }
) {
  rerender(
    <ChatInput
      groupId="g1"
      value={overrides.value ?? ""}
      onChange={overrides.onChange}
      onSubmit={overrides.onSubmit}
      errorMsg={overrides.errorMsg ?? null}
    />
  )
}

function textarea(): HTMLTextAreaElement {
  return screen.getByLabelText(/send a message/i) as HTMLTextAreaElement
}

// The autoGrow function adds back whatever this element's own border
// computes to, because scrollHeight excludes border on a border-box element
// while style.height does not (see ChatInput.tsx's own comment on autoGrow
// for the full story — a real browser measurement is what caught this).
// Reading it the same way the production code does, rather than assuming
// jsdom reports 0 for a borderless element, is what makes these expectations
// hold regardless of jsdom's own border-resolution quirks.
function expectedHeight(el: HTMLTextAreaElement, scrollHeight: number): string {
  const cs = getComputedStyle(el)
  const border = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth)
  return `${scrollHeight + border}px`
}

describe("ChatInput — composer wraps instead of scrolling sideways", () => {
  it("renders a textarea rather than a single-line input", () => {
    renderChatInput()
    // This is the actual mechanism behind the fix: an <input> cannot wrap
    // text onto a second line no matter what CSS it's given, so the element
    // type is what genuinely differs here, not a stylistic detail.
    expect(textarea().tagName).toBe("TEXTAREA")
  })

  it("starts at exactly one row, so the resting state is unchanged", () => {
    renderChatInput()
    expect(textarea().rows).toBe(1)
  })

  it("never disables resizing by drag, so a member can't drag it over the feed", () => {
    renderChatInput()
    expect(textarea().style.resize).toBe("none")
  })

  it("caps growth with a maxHeight and scrolls internally past it, rather than eating the screen", () => {
    renderChatInput()
    const el = textarea()
    expect(el.style.maxHeight).not.toBe("")
    expect(el.style.overflowY).toBe("auto")
  })

  // Vacuous alone against jsdom (see the file header): this guards against
  // an explicit Enter-submits handler being re-added, and only proves the
  // real requirement jointly with "renders a textarea" above, since a real
  // browser never implicitly submits a textarea on Enter regardless.
  it("pressing Enter does not submit — the send button is the only way to send", () => {
    const { onSubmit } = renderChatInput({ value: "hello there" })
    fireEvent.keyDown(textarea(), { key: "Enter" })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("grows to fit content reported by scrollHeight as the value prop changes", () => {
    const onChange = vi.fn()
    const onSubmit = vi.fn()
    const { rerender } = renderChatInput({ value: "", onChange, onSubmit })
    const el = textarea()

    // jsdom does no real layout, so scrollHeight is a fixed 0 unless we tell
    // it otherwise — this simulates "the browser measured this much content".
    Object.defineProperty(el, "scrollHeight", { value: 90, configurable: true })
    rerenderWith(rerender, { value: "a message long enough to wrap onto several lines", onChange, onSubmit })

    expect(el.style.height).toBe(expectedHeight(el, 90))
  })

  it("shrinks back to resting height when the value is cleared after a send", () => {
    const onChange = vi.fn()
    const onSubmit = vi.fn()
    const { rerender } = renderChatInput({ value: "", onChange, onSubmit })
    const el = textarea()

    Object.defineProperty(el, "scrollHeight", { value: 90, configurable: true })
    rerenderWith(rerender, { value: "a long message that grew the box", onChange, onSubmit })
    expect(el.style.height).toBe(expectedHeight(el, 90))

    // GroupHome clears `value` the instant a send goes through; this is the
    // same effect that grew the box also having to be the one that shrinks
    // it, since there's no separate "reset" path anywhere in this file.
    Object.defineProperty(el, "scrollHeight", { value: 26, configurable: true })
    rerenderWith(rerender, { value: "", onChange, onSubmit })
    expect(el.style.height).toBe(expectedHeight(el, 26))
  })
})
