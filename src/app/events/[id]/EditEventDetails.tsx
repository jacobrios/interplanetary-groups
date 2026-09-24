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
//
// ── Amended 24 Sept 2026, owner's phone QA ──
// The paragraph above describes the first build. "Edit" left the details
// card (it made the card taller than production's for a rare action) and
// now sits below "Add to calendar", sharing one row with "Call off": two
// equal-width outlined pills, neither teal. And editing takes the whole card
// over: the form replaces the card's body, the RSVP band becomes
// "Never mind | Save" in the RSVP pair's own geometry, and the calendar pill
// and the Edit | Call off row are hidden while the form is open. The
// time-change vote and the roster below still never move.
//
// That editing state spans the card AND the pill region, so this component
// now owns both, for an editable plan only: the page renders the static
// pieces on the server and hands them in (`children` for the title and meta
// rows, `rsvp` for the band's RSVP pair, `calendar` for the calendar pill).
// A plan nobody can edit (called off, or already started) never mounts this
// component and keeps the page's own card. The card shell is shared through
// details-card.ts so the two paths cannot drift.

import { useEffect, useRef, useState, useTransition } from "react"
import { editEventAction, type EditEventState } from "@/app/actions/edit-event"
import { EDIT_TITLE_MAX } from "@/lib/events/edit-fields"
import { VENUE_NAME_MAX } from "@/lib/orbit/rhythm"
import { ErrorLine } from "@/components/choice"
import { visuallyHiddenStyle } from "@/components/visually-hidden"
import CancelControls from "./CancelControls"
import { pairPill } from "./pills"
import { detailsCardStyle, detailsBodyStyle, detailsBandStyle } from "./details-card"

interface Props {
  eventId: string
  groupId: string
  title: string
  place: string
  /** "YYYY-MM-DD", already in the group's own timezone (task brief). */
  dateLocal: string
  /** "HH:mm", 24h, already in the group's own timezone. */
  timeLocal: string
  /** The title and meta rows, the card's body at rest. */
  children: React.ReactNode
  /** The RSVP pair, the card's footer band at rest. */
  rsvp: React.ReactNode
  /** The "Add to calendar" pill, below the card at rest. */
  calendar: React.ReactNode
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

// The editing band's two buttons: the RSVP pair's own geometry (RsvpOption
// at its non-compact size: 0.625rem 1rem padding, 0.5rem radius, 1.5px
// border, label size, 0.625rem gap), so the band keeps its shape while its
// question changes from "are you in?" to "keep these changes?". Never mind
// first and outlined; Save teal-filled, because saving is the one action
// that matters here and this is not an open question between equals.
// Longhand flex for the same jsdom reason as pills.ts.
const bandButton: React.CSSProperties = {
  flexGrow: 1,
  flexShrink: 1,
  flexBasis: 0,
  minWidth: 0,
  padding: "0.625rem 1rem",
  borderRadius: "0.5rem",
  fontSize: "var(--type-label)",
  fontFamily: "inherit",
  fontWeight: 600,
  lineHeight: "var(--leading-normal)",
}

const neverMindButton: React.CSSProperties = {
  ...bandButton,
  backgroundColor: "transparent",
  border: "1.5px solid var(--hairline)",
  color: "var(--text-primary)",
}

const saveButton: React.CSSProperties = {
  ...bandButton,
  backgroundColor: "var(--action)",
  border: "1.5px solid var(--action)",
  color: "var(--action-ink)",
}

// Day and Time share a row. Native date and time inputs carry an intrinsic
// minimum width on iOS that pushed the Time field past the card's right edge
// (owner's phone QA, 24 Sept 2026): each column is allowed to shrink below
// its content (flex-basis 0, min-width 0) and each input fills its column
// rather than asking for its own width.
const shrinkColumn: React.CSSProperties = {
  flexGrow: 1,
  flexShrink: 1,
  flexBasis: 0,
  minWidth: 0,
}

const pickerStyle: React.CSSProperties = {
  display: "block",
  minWidth: 0,
}

export default function EditEventDetails({
  eventId,
  groupId,
  title,
  place,
  dateLocal,
  timeLocal,
  children,
  rsvp,
  calendar,
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

  // Focus follows the swap: into the form when it opens, back to the Edit
  // pill when it closes, so a keyboard or screen-reader user is never
  // dropped onto a control that just unmounted. A ref, not state, so it only
  // acts on a swap this component caused (never on first render).
  //
  // Into the form means its visually hidden heading, NOT the Title input
  // (owner's phone QA, 24 Sept 2026): focusing a text field raised the iOS
  // keyboard on open, and the first tap on the date picker then dismissed
  // the keyboard, shifted the layout and closed the picker it had just
  // opened. A heading with tabIndex -1 puts a screen reader inside the form
  // and raises no keyboard.
  const headingRef = useRef<HTMLHeadingElement>(null)
  const editButtonRef = useRef<HTMLButtonElement>(null)
  const focusAfterSwap = useRef<"form" | "edit" | null>(null)
  useEffect(() => {
    if (focusAfterSwap.current === "form") headingRef.current?.focus()
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
    focusAfterSwap.current = "form"
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

  // The Edit pill, handed to CancelControls as the leading half of its row
  // so the cancel confirm step can take the whole row over (pills.ts).
  // aria-label keeps the fuller name a screen reader has always heard; it
  // starts with the visible word, so voice control still matches "Edit".
  const editPill = (
    <button
      ref={editButtonRef}
      type="button"
      onClick={openForm}
      aria-label="Edit this plan"
      style={pairPill}
    >
      Edit
    </button>
  )

  if (!editing) {
    return (
      <>
        <div data-details-card style={detailsCardStyle}>
          <div style={detailsBodyStyle}>{children}</div>
          <div style={detailsBandStyle}>{rsvp}</div>
        </div>

        {/* Add to calendar, then the Edit | Call off row: the page's own
            order below the card (see page.tsx), kept here because while the
            form is open both are hidden. */}
        <div style={{ marginBottom: "16px" }}>{calendar}</div>
        <div style={{ marginBottom: "16px" }}>
          <CancelControls
            eventId={eventId}
            groupId={groupId}
            isCancelled={false}
            leading={editPill}
          />
        </div>
      </>
    )
  }

  return (
    <div data-details-card style={detailsCardStyle}>
      <div style={detailsBodyStyle}>
        <h2 ref={headingRef} tabIndex={-1} style={{ ...visuallyHiddenStyle, outline: "none" }}>
          {/* Names the plan: while the form is open this hidden heading is
              the only one on the card, so without the title a screen reader
              would lose which plan is being edited. */}
          Editing {title}
        </h2>

        <div style={{ marginBottom: "10px" }}>
          <label htmlFor="edit-event-title" style={labelStyle}>
            Title
          </label>
          <input
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
          <div style={shrinkColumn}>
            <label htmlFor="edit-event-date" style={labelStyle}>
              Day
            </label>
            <input
              id="edit-event-date"
              type="date"
              value={dateValue}
              onChange={(e) => setDateValue(e.target.value)}
              disabled={isPending}
              style={{ ...fieldStyle, ...pickerStyle }}
            />
          </div>
          <div style={shrinkColumn}>
            <label htmlFor="edit-event-time" style={labelStyle}>
              Time
            </label>
            <input
              id="edit-event-time"
              type="time"
              value={timeValue}
              onChange={(e) => setTimeValue(e.target.value)}
              disabled={isPending}
              style={{ ...fieldStyle, ...pickerStyle }}
            />
          </div>
        </div>

        {/* A day or time typed here is not applied directly: it opens the
            group's own time-change vote (ProposalSection), the same path a
            "can we move it?" chat message takes. Named here so nobody fills
            in a new time expecting it to take effect on Save alone. The
            "Times in {zone}." tail was dropped on 24 Sept 2026 (owner's
            phone QA): everything on this screen is already in the group's
            time, so it said nothing a member needed. */}
        <p
          style={{
            fontSize: "var(--type-meta)",
            color: "var(--text-secondary)",
          }}
        >
          Changing the day or time asks the group first.
        </p>

        {/* Under the form and above the band, so a refusal sits beside the
            fields it is about and right above the button that caused it. */}
        <ErrorLine msg={errorMsg} />
      </div>

      {/* The RSVP band becomes the form's own answer row while editing. */}
      <div style={detailsBandStyle}>
        <div style={{ display: "flex", gap: "0.625rem" }}>
          <button
            type="button"
            onClick={cancelForm}
            disabled={isPending}
            style={{
              ...neverMindButton,
              cursor: isPending ? "default" : "pointer",
              opacity: isPending ? 0.65 : 1,
            }}
          >
            Never mind
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={isPending}
            style={{
              ...saveButton,
              cursor: isPending ? "default" : "pointer",
              opacity: isPending ? 0.65 : 1,
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
