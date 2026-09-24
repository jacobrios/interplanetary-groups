// src/app/events/[id]/EditEventDetails.tsx
"use client"
//
// The plan's own Edit control. Lives on the event page rather than the
// group home's compact card (settled with the owner, 23 Sept 2026): the
// card is the gist and its height budget was won by a whole slice
// (card-region-height, 14 Aug 2026); a control here would spend it again.
//
// Inline rather than a modal, the CancelControls precedent: this product's
// only modal is the email bottom sheet, whose heavy focus/scroll/back-gesture
// handling exists because that ask can appear unprompted over any screen.
// This form is opened by the viewer's own tap on a page they are already on,
// so an inline swap matches the chip and RSVP grammar already here.
//
// At rest, renders the page's own title and meta rows unchanged (passed as
// children) plus a quiet "Edit" text control. Tapping it replaces those
// children with a form; the swap is local state, not a route or a modal, so
// the rest of the page (roster card, cancel control, calendar button) never
// moves.

import { useEffect, useRef, useState, useTransition } from "react"
import { editEventAction, type EditEventState } from "@/app/actions/edit-event"
import { EDIT_TITLE_MAX } from "@/lib/events/edit-fields"
import { VENUE_NAME_MAX } from "@/lib/orbit/rhythm"
import { ErrorLine } from "@/components/choice"

interface Props {
  eventId: string
  title: string
  place: string
  /** "YYYY-MM-DD", already in the group's own timezone (task brief). */
  dateLocal: string
  /** "HH:mm", 24h, already in the group's own timezone. */
  timeLocal: string
  zoneLabel: string
  children: React.ReactNode
}

// Field styling reproduced by VALUE from the venue input in
// src/app/create/Step2Playback.tsx (lines ~260-320), per CLAUDE.md's
// "map tokens by value, never by name" rule. fontSize is 1rem here per the
// task brief rather than that input's literal "16px" string; both compute
// to the same 16px iOS needs to avoid the force-zoom trap, so the browser
// outcome is identical.
const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.25rem 0.5rem",
  backgroundColor: "var(--surface-base)",
  border: "1px solid var(--hairline)",
  borderRadius: "0.375rem",
  color: "var(--text-primary)",
  fontSize: "1rem",
  lineHeight: "var(--leading-normal)",
  outline: "none",
  boxSizing: "border-box",
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "var(--type-meta)",
  fontWeight: 600,
  color: "var(--text-secondary)",
  marginBottom: "0.25rem",
}

// Save's geometry is CancelControls' tealPill, reproduced rather than
// imported: that pill is a module-local const there, not an export, and
// this is the same "read the value, don't reach across a module boundary
// for a private const" call the field styling above makes about
// Step2Playback's input.
const tealPill: React.CSSProperties = {
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
  backgroundColor: "var(--action)",
  color: "var(--action-ink)",
  border: "1px solid var(--action)",
}

export default function EditEventDetails({
  eventId,
  title,
  place,
  dateLocal,
  timeLocal,
  zoneLabel,
  children,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [titleValue, setTitleValue] = useState(title)
  const [placeValue, setPlaceValue] = useState(place)
  const [dateValue, setDateValue] = useState(dateLocal)
  const [timeValue, setTimeValue] = useState(timeLocal)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  // What the form showed when it was opened, snapshotted once at open and
  // sent with every save. The server compares against these rather than
  // the stored row, because this page does not live-refresh: a form opened
  // minutes ago must not read somebody else's newer change as this member
  // asking to undo it. Snapshotted, not read from props at save time, so a
  // refresh landing under an open form cannot move the baseline either.
  const [opened, setOpened] = useState({ title, place, dateLocal, timeLocal })

  // Focus follows the swap: into the first field when the form opens, back
  // to the Edit control when it closes, so a keyboard or screen-reader user
  // is never dropped onto a control that just unmounted. A ref, not state,
  // so it only acts on a swap this component caused (never on first render).
  const titleRef = useRef<HTMLInputElement>(null)
  const editButtonRef = useRef<HTMLButtonElement>(null)
  const focusAfterSwap = useRef<"title" | "edit" | null>(null)
  useEffect(() => {
    if (focusAfterSwap.current === "title") titleRef.current?.focus()
    else if (focusAfterSwap.current === "edit") editButtonRef.current?.focus()
    focusAfterSwap.current = null
  }, [editing])

  function openForm() {
    // Fields are re-seeded from the page's current props every time the
    // form opens, not left with whatever a previous, abandoned edit typed:
    // a "Never mind" or a failed save should not leak stale text into the
    // next tap.
    setTitleValue(title)
    setPlaceValue(place)
    setDateValue(dateLocal)
    setTimeValue(timeLocal)
    setOpened({ title, place, dateLocal, timeLocal })
    setErrorMsg(null)
    focusAfterSwap.current = "title"
    setEditing(true)
  }

  function cancelForm() {
    setErrorMsg(null)
    focusAfterSwap.current = "edit"
    setEditing(false)
  }

  function submit() {
    startTransition(async () => {
      setErrorMsg(null)
      const formData = new FormData()
      formData.set("eventId", eventId)
      formData.set("title", titleValue)
      formData.set("place", placeValue)
      formData.set("dateLocal", dateValue)
      formData.set("timeLocal", timeValue)
      formData.set("origTitle", opened.title)
      formData.set("origPlace", opened.place)
      formData.set("origDateLocal", opened.dateLocal)
      formData.set("origTimeLocal", opened.timeLocal)
      const result: EditEventState = await editEventAction({}, formData)
      if (result?.errors?.general) {
        setErrorMsg(result.errors.general)
        return
      }
      focusAfterSwap.current = "edit"
      setEditing(false)
    })
  }

  if (!editing) {
    return (
      <div>
        {children}
        <div style={{ textAlign: "right", marginTop: "6px" }}>
          <button
            ref={editButtonRef}
            type="button"
            onClick={openForm}
            aria-label="Edit this plan"
            style={{
              background: "none",
              border: "none",
              padding: 0,
              minHeight: "44px",
              fontSize: "var(--type-meta)",
              color: "var(--text-secondary)",
              textDecoration: "underline",
              cursor: "pointer",
            }}
          >
            Edit
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ marginBottom: "10px" }}>
        <label htmlFor="edit-event-title" style={labelStyle}>
          Title
        </label>
        <input
          ref={titleRef}
          id="edit-event-title"
          type="text"
          value={titleValue}
          onChange={(e) => setTitleValue(e.target.value)}
          maxLength={EDIT_TITLE_MAX}
          disabled={isPending}
          style={fieldStyle}
        />
      </div>

      <div style={{ marginBottom: "10px" }}>
        <label htmlFor="edit-event-place" style={labelStyle}>
          Place
        </label>
        <input
          id="edit-event-place"
          type="text"
          value={placeValue}
          onChange={(e) => setPlaceValue(e.target.value)}
          maxLength={VENUE_NAME_MAX}
          placeholder="Where are you meeting?"
          disabled={isPending}
          style={fieldStyle}
        />
      </div>

      <div style={{ display: "flex", gap: "10px", marginBottom: "6px" }}>
        <div style={{ flex: 1 }}>
          <label htmlFor="edit-event-date" style={labelStyle}>
            Day
          </label>
          <input
            id="edit-event-date"
            type="date"
            value={dateValue}
            onChange={(e) => setDateValue(e.target.value)}
            disabled={isPending}
            style={fieldStyle}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label htmlFor="edit-event-time" style={labelStyle}>
            Time
          </label>
          <input
            id="edit-event-time"
            type="time"
            value={timeValue}
            onChange={(e) => setTimeValue(e.target.value)}
            disabled={isPending}
            style={fieldStyle}
          />
        </div>
      </div>

      {/* A day or time typed here is not applied directly: it opens the
          group's own time-change vote (ProposalSection), the same path a
          "can we move it?" chat message takes. Named here so nobody fills
          in a new time expecting it to take effect on Save alone. */}
      <p
        style={{
          fontSize: "var(--type-meta)",
          color: "var(--text-secondary)",
          marginBottom: "12px",
        }}
      >
        Changing the day or time asks the group first. Times in {zoneLabel}.
      </p>

      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
        <button
          type="button"
          onClick={cancelForm}
          disabled={isPending}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            minHeight: "44px",
            fontSize: "var(--type-meta)",
            color: "var(--text-secondary)",
            textDecoration: "underline",
            cursor: isPending ? "default" : "pointer",
            opacity: isPending ? 0.65 : 1,
          }}
        >
          Never mind
        </button>
        <div style={{ flex: 1 }}>
          <button
            type="button"
            onClick={submit}
            disabled={isPending}
            style={{ ...tealPill, opacity: isPending ? 0.65 : 1 }}
          >
            Save
          </button>
        </div>
      </div>

      <ErrorLine msg={errorMsg} />
    </div>
  )
}
