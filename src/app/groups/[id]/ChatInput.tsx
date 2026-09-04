// src/app/groups/[id]/ChatInput.tsx
"use client"

// Controlled message input bar — purely presentational.
// All state (optimistic messages, transition, error) lives in GroupHome,
// which passes down the value, the change handler, and the form action.
//
// Send button per build-notes §7 (owner ruling 11 Aug 2026, visual-polish
// slice, task 10, corrected in fix round 1): sending IS an action that
// matters, so the circle fills teal once there's text to send. This was
// first built against walkthrough.css's DARK IDENTITY block, which reads as
// permanently neutral in isolation, but the file's LAST word on .gh-send is
// its "REFINEMENT PASS" block (~line 691), which already encodes this same
// two-state teal via an .active class — the board's final pass and the
// owner's ruling agree. Values match that block exactly:
// - Empty: raised fill (--surface-raised), 1px hairline border, faint arrow
//   (--text-faint).
// - Has text: teal fill (--action), border turns teal too (--action),
//   dark arrow (--action-ink).
// The border is 1px in both states (only its color switches) so the circle
// can't change size when the state flips.
// This contextual teal coexists with the card's persistent "I'm in" teal
// because a contextual action (only live while composing) is not a second
// persistent primary — it does not violate one-primary-action-per-screen.

import { useId, useEffect, useRef } from "react"
import SendCircleButton from "@/components/SendCircleButton"

// The composer wraps rather than scrolling sideways (spec:
// docs/superpowers/specs/2026-09-04-chat-input-wrap-design.md). It grows with
// content up to a cap and then scrolls internally, because this project has a
// measured height budget for the group home (the card region and the feed
// each earned their share the hard way, card-region-height slice, 14 Aug
// 2026) and an unbounded composer would take it back silently. The cap is
// expressed in em, not px, so it tracks --type-body 1:1: a member reading at
// a larger device text size gets a taller cap rather than one that stops
// scaling with the font the moment it's written as a fixed pixel value.
// Built from the CSS variable rather than a literal 7.5em: this project has
// already shipped one bug from a token copied by eyeballed value instead of
// read live (the --ink-faint / --text-faint mixup, polish slice two, 18-19
// Aug 2026), and calc() can multiply --leading-normal's number straight
// through without us re-typing what it currently equals.
const MAX_LINES = 5
const LINE_HEIGHT = "var(--leading-normal)"
const MAX_HEIGHT = `calc(${LINE_HEIGHT} * ${MAX_LINES} * 1em)`

// Resizes the textarea to fit its content, and is also what shrinks it back
// down the moment GroupHome clears `value` after a send: this file has no
// separate "reset" path, because running the same grow logic on every value
// change already covers both directions. Resetting height to "auto" first is
// what makes shrinking work — without it, scrollHeight keeps reporting the
// old, taller box's content height instead of what the current (now
// shorter) text actually needs.
//
// The border compensation is not a defensive nicety, it was caught wrong: a
// first cut of this function set `style.height` straight from `scrollHeight`,
// and StepGapAsk.tsx's textarea (which has a 1px border on every side, unlike
// this one) rendered 1.5px short of the input it replaced, measured in a
// real browser, not assumed. `scrollHeight` is specified to exclude border
// even on a border-box element, while the `height` style this element is
// given is interpreted as the full border-box size, so on a bordered
// element the two disagree by exactly the border width and the box comes
// out that much too short. Adding the border back in is what makes
// scrollHeight and style.height agree again regardless of whether a given
// composer has a border; here, with border:none, the correction is zero.
function autoGrow(el: HTMLTextAreaElement) {
  el.style.height = "auto"
  const cs = getComputedStyle(el)
  const border = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth)
  el.style.height = `${el.scrollHeight + border}px`
}

// The input is never disabled, and there is deliberately no `isPending` prop to
// disable it with (message-send-latency slice, 31 Aug 2026). It used to take
// one, and wiring it to `disabled` cost the member their keyboard for five to
// six seconds a send: on iOS, disabling the field you are typing in dismisses
// the keyboard, and re-enabling does not bring it back. Nothing was gained for
// it. The optimistic entry already puts the message on screen and the field is
// already cleared on submit, so the only thing the disable achieved was
// stopping the member typing the next one.
//
// The prop is absent rather than accepted-and-ignored on purpose, and THE
// ABSENCE IS WHAT ENFORCES THIS, not a test. A boolean sitting unused on this
// interface is an invitation to wire it back to `disabled`; with no prop, doing
// so is a deliberate act that has to add the prop back first. GroupHome.test.tsx
// does assert the input is never disabled, but that test can only fail once
// somebody has already re-added the prop AND wired it, so it is a backstop
// rather than the guarantee. Stated precisely because an earlier version of this
// comment credited the test with holding the behaviour, and this component's
// history is specifically a history of comments claiming more than was true.

interface Props {
  groupId: string
  value: string
  onChange: (value: string) => void
  onSubmit: (formData: FormData) => void
  errorMsg: string | null
}

export default function ChatInput({
  groupId,
  value,
  onChange,
  onSubmit,
  errorMsg,
}: Props) {
  const inputId = useId()
  const hasText = value.trim().length > 0
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Runs on every value change, whichever direction: a member typing past one
  // line grows the box, and GroupHome clearing `value` after a send shrinks
  // it back to `rows={1}` rather than leaving it tall and empty.
  useEffect(() => {
    const el = textareaRef.current
    if (el) autoGrow(el)
  }, [value])

  return (
    <div
      style={{
        backgroundColor: "var(--surface-base)",
        backgroundImage: "linear-gradient(0deg, rgba(0,0,0,.34), rgba(0,0,0,0))",
        padding: "12px 16px 4px",
        flexShrink: 0,
      }}
    >
      {errorMsg && (
        <p
          style={{
            fontSize: "var(--type-meta)",
            lineHeight: "var(--leading-normal)",
            color: "#f87171",
            marginBottom: "0.5rem",
          }}
        >
          {errorMsg}
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit(new FormData(e.currentTarget))
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.625rem",
          backgroundColor: "var(--surface-raised)",
          border: "1px solid var(--hairline)",
          borderRadius: 26,
          padding: "7px 7px 7px 16px",
        }}
      >
        <input type="hidden" name="groupId" value={groupId} />

        <label htmlFor={inputId} style={{ display: "none" }}>
          Send a message
        </label>
        <textarea
          ref={textareaRef}
          id={inputId}
          name="body"
          autoComplete="off"
          placeholder="Send a message…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={1}
          style={{
            flex: 1,
            padding: 0,
            backgroundColor: "transparent",
            border: "none",
            color: "var(--text-primary)",
            fontSize: "var(--type-body)",
            lineHeight: LINE_HEIGHT,
            outline: "none",
            caretColor: "var(--text-primary)",
            resize: "none",
            maxHeight: MAX_HEIGHT,
            overflowY: "auto",
          }}
        />

        {/* Send circle: neutral fill when empty, teal fill the moment there's
            text. The drawing moved to SendCircleButton, which the onboarding
            gap-ask input shares; the states, sizes and markup are unchanged
            here. */}
        <SendCircleButton
          active={hasText}
          disabled={!hasText}
          label="Send message"
        />
      </form>
    </div>
  )
}
