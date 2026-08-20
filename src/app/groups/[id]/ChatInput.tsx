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

import { useId } from "react"
import SendCircleButton from "@/components/SendCircleButton"

interface Props {
  groupId: string
  value: string
  onChange: (value: string) => void
  onSubmit: (formData: FormData) => void
  isPending: boolean
  errorMsg: string | null
}

export default function ChatInput({
  groupId,
  value,
  onChange,
  onSubmit,
  isPending,
  errorMsg,
}: Props) {
  const inputId = useId()
  const hasText = value.trim().length > 0

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
        <input
          id={inputId}
          name="body"
          type="text"
          autoComplete="off"
          placeholder="Send a message…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={isPending}
          style={{
            flex: 1,
            padding: 0,
            backgroundColor: "transparent",
            border: "none",
            color: "var(--text-primary)",
            fontSize: "var(--type-body)",
            outline: "none",
            caretColor: "var(--text-primary)",
          }}
        />

        {/* Send circle: neutral fill when empty, teal fill the moment there's
            text. The drawing moved to SendCircleButton, which the onboarding
            gap-ask input shares; the states, sizes and markup are unchanged
            here. */}
        <SendCircleButton
          active={hasText}
          disabled={!hasText || isPending}
          label="Send message"
        />
      </form>
    </div>
  )
}
