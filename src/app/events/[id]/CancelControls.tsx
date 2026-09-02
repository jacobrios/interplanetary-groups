// src/app/events/[id]/CancelControls.tsx
"use client"
//
// Calling a plan off, and putting it back. Two taps, never type-to-confirm
// (decision 3): person:delete makes the owner type a name because that
// action is irreversible and private, while this one is reversible by
// anybody in two taps and announced publicly the same second.
// Type-to-confirm on a reversible action teaches people the product is
// fragile.
//
// Inline rather than a modal. The product's only modal precedent is the
// email bottom sheet, whose focus handling, scroll lock, back gesture and
// ARIA semantics are deliberately heavy; an inline two-step matches the chip
// and RSVP grammar already on this screen.
//
// "Never mind" sits FIRST, where the resting button was, so an accidental
// double-tap lands on the safe control rather than on the destructive one.
//
// Neither control is teal: teal marks an action that genuinely matters and
// never a destructive or secondary one. Neither is red either: status and
// action are never carried by hue in this product.

import { useState, useTransition } from "react"
import { cancelEventAction, restoreEventAction } from "@/app/actions/cancel-event"
import { ErrorLine } from "@/components/choice"

interface Props {
  eventId: string
  groupId: string
  isCancelled: boolean
}

const quietButton: React.CSSProperties = {
  fontSize: "var(--type-label)",
  fontWeight: 700,
  lineHeight: "var(--leading-normal)",
  color: "var(--text-secondary)",
  background: "transparent",
  border: "1.5px solid var(--hairline)",
  borderRadius: "0.5rem",
  padding: "0.625rem 1rem",
  minHeight: "44px",
  cursor: "pointer",
}

export default function CancelControls({ eventId, groupId, isCancelled }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const restText = isCancelled ? "Put this back on" : "Call this off"
  const confirmText = isCancelled ? "Yes, put it back" : "Yes, call it off"
  const consequence = isCancelled
    ? "This tells the group the plan is back on, with everyone's RSVPs as they were."
    : "This tells the group the plan is off. Anyone can undo it."

  function submit() {
    startTransition(async () => {
      setErrorMsg(null)
      const formData = new FormData()
      formData.set("eventId", eventId)
      formData.set("groupId", groupId)
      const action = isCancelled ? restoreEventAction : cancelEventAction
      const result = await action({}, formData)
      if (result?.errors?.general) {
        setErrorMsg(result.errors.general)
        setConfirming(false)
      }
    })
  }

  if (!confirming) {
    return (
      <div>
        <button type="button" style={quietButton} onClick={() => setConfirming(true)}>
          {restText}
        </button>
        <ErrorLine msg={errorMsg} />
      </div>
    )
  }

  return (
    <div>
      <p
        style={{
          fontSize: "var(--type-meta)",
          lineHeight: "var(--leading-normal)",
          color: "var(--text-secondary)",
          marginBottom: "0.625rem",
        }}
      >
        {consequence}
      </p>
      <div style={{ display: "flex", gap: "0.625rem", flexWrap: "wrap" }}>
        {/* Safe control first, in the resting button's own position. */}
        <button
          type="button"
          style={{ ...quietButton, opacity: isPending ? 0.65 : 1 }}
          disabled={isPending}
          onClick={() => setConfirming(false)}
        >
          Never mind
        </button>
        <button
          type="button"
          style={{
            ...quietButton,
            color: "var(--text-primary)",
            opacity: isPending ? 0.65 : 1,
          }}
          disabled={isPending}
          onClick={submit}
        >
          {confirmText}
        </button>
      </div>
      <ErrorLine msg={errorMsg} />
    </div>
  )
}
