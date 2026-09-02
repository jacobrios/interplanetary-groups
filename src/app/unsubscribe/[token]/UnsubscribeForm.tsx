"use client"

// Copy in Orbit's voice: plain, warm, no dashes. No survey, no "are you
// sure", no alternatives offered. That is the anti-clutter brand applied to
// the exit as well as the entrance. The button is the screen's one real
// action, so it takes --action.
//
// The confirmation is shown only on a recorded "ok", never on the mere fact
// that the call returned. This screen exists to tell somebody their opt-out
// landed, and saying so when it did not is the worst failure available here:
// they keep getting mail they believe they stopped, and reach for the spam
// button instead of this page. On a failure the button stays live so the tap
// can simply be repeated, which is the whole recovery.
//
// The way back sits underneath that same confirmation, as a quiet text
// control rather than another teal button: unsubscribing was the screen's
// one real action, and a second teal control here would read as two equally
// weighted asks. Same success discipline as the unsubscribe button: the
// "you're back on" line is shown only for a recorded "ok", and a failure
// leaves the control live so the tap can be repeated.

import { useState, useTransition } from "react"
import { unsubscribeAction, resubscribeAction } from "@/app/actions/unsubscribe"

export default function UnsubscribeForm({ token }: { token: string }) {
  const [done, setDone] = useState(false)
  const [failed, setFailed] = useState(false)
  const [backOn, setBackOn] = useState(false)
  const [resubFailed, setResubFailed] = useState(false)
  const [pending, startTransition] = useTransition()
  const [resubPending, startResubTransition] = useTransition()

  if (backOn) {
    return (
      <p style={{ fontSize: "var(--type-body)", color: "var(--text-primary)" }}>
        You&rsquo;re back on. Orbit will email you again when something in your group needs
        you.
      </p>
    )
  }

  if (done) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <p style={{ fontSize: "var(--type-body)", color: "var(--text-primary)" }}>
          You&rsquo;re unsubscribed. Orbit won&rsquo;t email you group updates any more. Your
          sign-in codes still work, so you can always get back into your group.
        </p>
        {resubFailed && (
          <p
            role="status"
            style={{ fontSize: "var(--type-meta)", color: "var(--danger)" }}
          >
            That didn&rsquo;t go through, so nothing has changed yet. Please try again.
          </p>
        )}
        <button
          type="button"
          disabled={resubPending}
          onClick={() =>
            startResubTransition(async () => {
              const result = await resubscribeAction(token).catch(() => "service_error")
              if (result === "ok") {
                setResubFailed(false)
                setBackOn(true)
              } else {
                setResubFailed(true)
              }
            })
          }
          style={{
            background: "none",
            border: "none",
            padding: "4px 2px",
            minHeight: 44,
            alignSelf: "flex-start",
            color: "var(--text-secondary)",
            fontSize: "var(--type-meta)",
            textDecoration: "underline",
            cursor: "pointer",
          }}
        >
          Didn&rsquo;t mean to? Turn them back on
        </button>
      </div>
    )
  }

  return (
    // Flex column with a gap, not a bare fragment: the stylesheet resets
    // paragraph margins, so without an explicit layout the copy and the
    // button sit flush against each other. The gap value (16) is taken from
    // EmailAttachFlow's sheet layout (the space between its copy block and
    // the action group beneath it), the closest comparable "copy above its
    // action" spacing in the product. Using gap rather than a one-off
    // marginTop on the button keeps the spacing correct whether or not the
    // failure line is present.
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p style={{ fontSize: "var(--type-body)", color: "var(--text-primary)" }}>
        Orbit emails a short update when something in your group needs you. Stopping it
        won&rsquo;t affect your sign-in codes, and you can still open your group any time.
      </p>
      {failed && (
        <p
          role="status"
          style={{ fontSize: "var(--type-meta)", color: "var(--danger)" }}
        >
          That didn&rsquo;t go through, so nothing has changed yet. Please try again.
        </p>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            // The catch covers the trip itself, the way SeenMarker's does:
            // the action is soft on the server, but a dropped connection
            // rejects out here, and an uncaught rejection in a transition
            // would replace this page with the error screen instead of
            // letting the member simply tap again.
            const result = await unsubscribeAction(token).catch(() => "service_error")
            if (result === "ok") {
              setFailed(false)
              setDone(true)
            } else {
              setFailed(true)
            }
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
    </div>
  )
}
