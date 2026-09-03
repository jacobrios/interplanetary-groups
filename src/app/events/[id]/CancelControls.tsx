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
// ── Placement and shape, amended 2 Sept 2026 (QA feedback round, spec §13) ──
// This control used to live inside the details card's RSVP footer band. That
// was the single cause of three separate complaints from the owner's phone
// pass: a box inside a box, a "Call this off" narrower than the RSVP pair
// above it, and a confirm step whose two buttons sat inside the same border
// as "I'm in" and "Can't make it", reading as four options for one question.
// It now renders BELOW the details card as a full-width pill, in the exact
// geometry AddToCalendarButton already uses on this screen, so it is plainly
// its own thing rather than a fourth answer to the RSVP question. The confirm
// step travels with it, which is what dissolves the four-options problem
// without a separate fix.
//
// Restore is teal, cancel is not, and that asymmetry is deliberate rather
// than an inconsistency to tidy away. Teal marks an action that genuinely
// matters. On a called-off plan, putting it back on IS the screen's primary
// action and the only teal on the screen (there is no RSVP pair and no
// "Add to calendar" there). On a live plan the primary ask is still the
// RSVP, and calling the plan off is the rarer, heavier move, so it stays
// outlined and quiet.
//
// Neither confirm control is teal, in either state: teal never leans an open
// question. Neither is red either: status and action are never carried by hue
// in this product.

import { useState, useTransition } from "react"
import { cancelEventAction, restoreEventAction } from "@/app/actions/cancel-event"
import { ErrorLine } from "@/components/choice"

interface Props {
  eventId: string
  groupId: string
  isCancelled: boolean
}

// Geometry read from AddToCalendarButton and reproduced exactly, so the two
// controls stack as one column of pills rather than as two different ideas.
// minHeight is a floor, never a fixed height, per the layout-grows rule.
const pill: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  width: "100%",
  minHeight: "44px",
  padding: "0.75rem 1.5rem",
  borderRadius: "24px",
  fontSize: "var(--type-label)",
  fontWeight: 600,
  lineHeight: "var(--leading-normal)",
  cursor: "pointer",
}

const outlinedPill: React.CSSProperties = {
  ...pill,
  background: "transparent",
  border: "1px solid var(--hairline)",
  color: "var(--text-secondary)",
}

const tealPill: React.CSSProperties = {
  ...pill,
  backgroundColor: "var(--action)",
  color: "var(--action-ink)",
  border: "1px solid var(--action)",
}

// The two confirm controls share the pill's full width, so together they
// occupy exactly the footprint the resting control just vacated. Their
// horizontal padding drops from 1.5rem to 0.75rem because two pills side by
// side on a 375px phone cannot each carry 1.5rem of side padding and still
// hold "Yes, call it off" on one line; the text wraps rather than clips if it
// ever does not fit, since minHeight is a floor.
const confirmPill: React.CSSProperties = {
  ...outlinedPill,
  // Longhands rather than the `flex` shorthand: identical in a browser, and
  // jsdom drops `flex: 1 1 0` outright, so the shorthand would leave the
  // shared-width rule untestable.
  flexGrow: 1,
  flexShrink: 1,
  flexBasis: 0,
  minWidth: 0,
  padding: "0.75rem",
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
      // Reset for both outcomes, not just the error branch. The server
      // action revalidates on success and isCancelled flips on the next
      // render, but this component instance is not remounted, so any local
      // state left dangling here (namely confirming) survives into that
      // re-render and reopens the confirm row for the OPPOSITE action.
      setConfirming(false)
      if (result?.errors?.general) {
        setErrorMsg(result.errors.general)
      }
    })
  }

  if (!confirming) {
    return (
      <div>
        <button
          type="button"
          style={isCancelled ? tealPill : outlinedPill}
          onClick={() => setConfirming(true)}
        >
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
          textAlign: "center",
        }}
      >
        {consequence}
      </p>
      <div style={{ display: "flex", gap: "0.625rem" }}>
        {/* Safe control first, in the resting button's own position, and
            brighter than the other one. The brightness used to run the other
            way, which made the destructive option the louder of the two; the
            owner called that backwards on 2 Sept 2026 and he is right. Both
            stay outlined and hue-free, so the only thing separating them is
            ink weight, which is exactly the "brightness plus label, never
            hue" rule this product already runs on. */}
        <button
          type="button"
          style={{
            ...confirmPill,
            color: "var(--text-primary)",
            opacity: isPending ? 0.65 : 1,
          }}
          disabled={isPending}
          onClick={() => setConfirming(false)}
        >
          Never mind
        </button>
        <button
          type="button"
          style={{ ...confirmPill, opacity: isPending ? 0.65 : 1 }}
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
