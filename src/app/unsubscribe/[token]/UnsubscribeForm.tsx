"use client"

// Copy in Orbit's voice: plain, warm, no dashes. No survey, no "are you
// sure", no alternatives offered. That is the anti-clutter brand applied to
// the exit as well as the entrance. The button is the screen's one real
// action, so it takes --action.

import { useState, useTransition } from "react"
import { unsubscribeAction } from "@/app/actions/unsubscribe"

export default function UnsubscribeForm({ token }: { token: string }) {
  const [done, setDone] = useState(false)
  const [pending, startTransition] = useTransition()

  if (done) {
    return (
      <p style={{ fontSize: "var(--type-body)", color: "var(--text-primary)" }}>
        You&rsquo;re unsubscribed. Orbit won&rsquo;t email you group updates any more. Your
        sign-in codes still work, so you can always get back into your group.
      </p>
    )
  }

  return (
    <>
      <p style={{ fontSize: "var(--type-body)", color: "var(--text-primary)" }}>
        Orbit sends a short update when something in your group needs you. Stopping it
        won&rsquo;t affect your sign-in codes, and you can still open your group any time.
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await unsubscribeAction(token)
            setDone(true)
          })
        }
        style={{
          fontSize: "var(--type-label)",
          background: "var(--action)",
          color: "var(--action-ink)",
          border: "none",
          borderRadius: 999,
          padding: "14px 22px",
          minHeight: 44,
          width: "100%",
          cursor: "pointer",
        }}
      >
        Stop sending me these
      </button>
    </>
  )
}
