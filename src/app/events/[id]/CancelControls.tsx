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
//
// ── Confirm-row weight, reversed again (owner's phone QA, 3 Sept 2026) ──
// "Never mind" and "Yes, call it off"/"Yes, put it back" now share the SAME
// ink weight, both --text-primary. The previous round had dimmed the
// destructive option to --text-secondary, on purpose, to make the safe
// control read as the louder one; the owner reversed that call, because it
// was solving a safety problem the product had already settled as a
// symmetry problem. From CLAUDE.md: "teal never leans an open question. When
// a control offers two or more equally valid answers, the options carry
// equal weight while open" (the RSVP pair carries teal on both borders, and
// the gauge chips are both grey). This is that same rule: while the confirm row
// is open, it IS an open question, so leaning one answer's brightness over
// the other's was never a different case from leaning color. The safe-first
// POSITION (see above) still does the accidental-tap protection on its own;
// brightness doing it too just cost clarity for no added safety. Both bright
// rather than both quiet: these are the only two controls in this region,
// and dimming both would read as disabled.

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
  // The cancel consequence shouts the state word, matching Orbit's own
  // announcements ("Squash this Thu is OFF"), owner's phone QA, 3 Sept 2026.
  // The restore consequence is deliberately left alone: only the cancel line
  // was named, and "back on" already reads as the reassuring case, not one
  // that needed shouting.
  const consequence = isCancelled
    ? "This tells the group the plan is back on, with everyone's RSVPs as they were."
    : "This tells the group the plan is OFF. Anyone can undo it."

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
        {/* Equal weight, both --text-primary (owner's phone QA, 3 Sept 2026,
            reversing the 2 Sept round). This IS an open question while the
            confirm row is showing, and the product already has a rule for
            that: "teal never leans an open question... the options carry
            equal weight while open" (CLAUDE.md). Dimming the destructive
            option was solving a safety problem the product had already
            settled as a symmetry problem; the safe-first POSITION below
            still does the accidental-tap protection on its own, so having
            brightness do it too just cost clarity. Both bright rather than
            both quiet: dimming both would read as disabled, and these are
            the only two controls in this region. */}
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
          style={{
            ...confirmPill,
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
