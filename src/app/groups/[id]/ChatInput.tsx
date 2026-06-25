// src/app/groups/[id]/ChatInput.tsx
"use client"

// Controlled message input bar — purely presentational.
// All state (optimistic messages, transition, error) lives in GroupHome,
// which passes down the value, the change handler, and the form action.
//
// Send arrow color per build-notes §7:
// - Dim/inactive (--text-placeholder) when the input is empty.
// - Teal (--color-teal) once the viewer has typed.
// This contextual teal coexists with the card's persistent "I'm in" teal
// because a contextual action (only live while composing) is not a second
// persistent primary — it does not violate one-primary-action-per-screen.

import { useId } from "react"

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
        borderTop: "1px solid var(--border-subtle)",
        backgroundColor: "var(--surface-page)",
        padding: "0.75rem 1rem",
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
        style={{ display: "flex", gap: "0.5rem" }}
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
            padding: "0.5rem 0.75rem",
            backgroundColor: "var(--surface-input)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "1.5rem",
            color: "var(--text-primary)",
            fontSize: "var(--type-body)",
            outline: "none",
            caretColor: "var(--color-teal)",
          }}
        />

        {/* Send arrow: dim when empty, teal when the viewer has typed */}
        <button
          type="submit"
          disabled={!hasText || isPending}
          aria-label="Send message"
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            border: "none",
            backgroundColor: "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: hasText && !isPending ? "pointer" : "default",
            flexShrink: 0,
            alignSelf: "center",
            transition: "color 0.15s ease",
            color: hasText ? "var(--color-teal)" : "var(--text-placeholder)",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M10 16V4M10 4L5 9M10 4L15 9"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </form>
    </div>
  )
}
