"use client"
//
// The founder's in-place group-details editor on group info (task 8,
// group-details-editing slice). Approved picture: a quiet underlined link
// under the WHO/activities card ("Edit group details", ResetInviteLink's
// own style); tapping it turns the whole card into the form, in place, the
// same swap EditEventDetails already does on the event page; Save either
// submits, or, when the first activity changed and a plan is coming up,
// turns the band into one question over an equal-weight "Leave it | Update
// it too" pair before submitting either answer.
//
// Members never see the link or the form: page.tsx renders this component
// for the founder only, and everyone else gets the same rows inside a plain
// `infoCardStyle` div (info-card.ts), so the two paths can never drift.

import { useEffect, useRef, useState, useTransition } from "react"
import { updateGroupDetailsAction } from "@/app/actions/update-group-details"
import {
  GROUP_NAME_MAX,
  diffDetails,
  firstRhythmChanged,
  toRhythmEdit,
  validateDetailsEdit,
} from "@/lib/groups/details-edit"
import type { RhythmEdit } from "@/lib/groups/rhythm-edit"
import type { StoredRhythm } from "@/lib/orbit/rhythm"
import RhythmFields from "@/components/RhythmFields"
import { ErrorLine } from "@/components/choice"
import { visuallyHiddenStyle } from "@/components/visually-hidden"
import { fieldStyle, labelStyle, neverMindButton, saveButton } from "@/components/form-fields"
import { pairPill, pairRow } from "@/app/events/[id]/pills"
import { detailsBodyStyle, detailsBandStyle } from "@/app/events/[id]/details-card"
import { infoCardStyle } from "./info-card"

interface Props {
  groupId: string
  groupName: string
  rhythms: StoredRhythm[]
  /** question = buildPlanQuestion(plan.startsAt, group.timeZone), computed on the page. */
  nextPlan: { eventId: string; startsAt: string; question: string } | null
  /** The card's rows at rest (WHO + activities), server-rendered. */
  children: React.ReactNode
}

export default function EditGroupDetails({ groupId, groupName, rhythms, nextPlan, children }: Props) {
  const [editing, setEditing] = useState(false)
  const [asking, setAsking] = useState(false)
  const [nameValue, setNameValue] = useState(groupName)
  const [rhythmValues, setRhythmValues] = useState<RhythmEdit[]>(() => rhythms.map(toRhythmEdit))
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Focus and scroll follow the swap, the EditEventDetails convention:
  // into the form's own hidden heading (never a text field, which would
  // raise the iOS keyboard) when it opens, back to the link when it closes.
  //
  // Owner's phone QA (iPhone, Chrome on iOS, PR #140): scrolling the card's
  // END into view and then focusing the heading meant the focus call itself
  // scrolled the page back up (focusing an off-top element pulls it back
  // on screen), so the founder saw the TOP of the form with Save below the
  // fold. Scrolling the card's START into view instead, and passing
  // `preventScroll: true` to every focus() call in this file, is what stops
  // focus from fighting the scroll it's supposed to follow.
  const cardRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const linkRef = useRef<HTMLButtonElement>(null)
  const leaveButtonRef = useRef<HTMLButtonElement>(null)
  const focusAfterSwap = useRef<"form" | "link" | null>(null)
  useEffect(() => {
    if (focusAfterSwap.current === "form") {
      headingRef.current?.focus({ preventScroll: true })
      cardRef.current?.scrollIntoView?.({ block: "start" })
    } else if (focusAfterSwap.current === "link") {
      linkRef.current?.focus()
    }
    focusAfterSwap.current = null
  }, [editing])

  // Coordinator phone-width fix, PR #140: entering the plan question still
  // moves focus onto the first answer, "Leave it", but no longer re-scrolls
  // the card. The band is sticky now (below), so it stays on screen through
  // the question's extra rows without a second scrollIntoView call.
  useEffect(() => {
    if (asking) {
      leaveButtonRef.current?.focus({ preventScroll: true })
    }
  }, [asking])

  function openForm() {
    // Re-seeded from props on every open, not left with a prior abandoned
    // edit's typing: a "Never mind" or a failed save must not leak stale
    // text into the next tap.
    setNameValue(groupName)
    setRhythmValues(rhythms.map(toRhythmEdit))
    setErrorMsg(null)
    setAsking(false)
    focusAfterSwap.current = "form"
    setEditing(true)
  }

  function cancelForm() {
    setErrorMsg(null)
    setAsking(false)
    focusAfterSwap.current = "link"
    setEditing(false)
  }

  function doSubmit(planChoice: "update" | "leave" | "") {
    startTransition(async () => {
      setErrorMsg(null)
      const formData = new FormData()
      formData.set("groupId", groupId)
      formData.set("payload", JSON.stringify({ name: nameValue, rhythms: rhythmValues }))
      formData.set("planChoice", planChoice)
      if (nextPlan) {
        formData.set("planEventId", nextPlan.eventId)
        formData.set("planStartsAt", nextPlan.startsAt)
      }
      const result = await updateGroupDetailsAction({}, formData)
      if (result?.errors?.general) {
        // Back to the form, not the question: the question only makes sense
        // beside the answer it produced, and that answer just failed.
        setAsking(false)
        setErrorMsg(result.errors.general)
        return
      }
      focusAfterSwap.current = "link"
      setEditing(false)
      setAsking(false)
    })
  }

  function handleSave() {
    setErrorMsg(null)
    const validated = validateDetailsEdit(rhythms, { name: nameValue, rhythms: rhythmValues })
    if (!validated.ok) {
      setErrorMsg(validated.error)
      return
    }
    const diff = diffDetails(rhythms, validated.rhythms, groupName, validated.name)
    const first = firstRhythmChanged(diff)
    if (first && nextPlan) {
      setAsking(true)
      return
    }
    doSubmit("")
  }

  if (!editing) {
    return (
      <>
        <div data-info-card style={infoCardStyle}>
          {children}
        </div>
        <button
          ref={linkRef}
          type="button"
          onClick={openForm}
          style={{
            alignSelf: "flex-start",
            background: "none",
            border: "none",
            padding: 0,
            marginTop: "12px",
            color: "var(--text-secondary)",
            fontSize: "var(--type-meta)",
            textDecoration: "underline",
            cursor: "pointer",
          }}
        >
          Edit group details
        </button>
      </>
    )
  }

  return (
    // overflow: "clip" rather than "hidden" (owner's phone QA, PR #140):
    // "hidden" makes this element a scroll container of its own, and a
    // sticky descendant never sticks inside a scroll container it isn't
    // the one scrolling. "clip" keeps the same rounded-corner clipping
    // this card needs without creating that container.
    <div ref={cardRef} data-info-card style={{ ...infoCardStyle, padding: 0, overflow: "clip" }}>
      <div style={detailsBodyStyle}>
        <h2 ref={headingRef} tabIndex={-1} style={{ ...visuallyHiddenStyle, outline: "none" }}>
          Editing group details
        </h2>

        <div style={{ marginBottom: "10px" }}>
          <label htmlFor="group-details-name" style={labelStyle}>
            Group name
          </label>
          <input
            id="group-details-name"
            type="text"
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            maxLength={GROUP_NAME_MAX}
            disabled={isPending}
            style={fieldStyle}
          />
        </div>

        {rhythmValues.map((r, i) => (
          <div
            key={i}
            style={
              i > 0
                ? { borderTop: "1.4px solid var(--hairline)", paddingTop: "10px", marginTop: "10px" }
                : undefined
            }
          >
            <RhythmFields
              idPrefix={`rhythm-${i}`}
              value={r}
              onChange={(next) =>
                setRhythmValues((prev) => prev.map((v, idx) => (idx === i ? next : v)))
              }
              showPlace
              disabled={isPending}
            />
          </div>
        ))}

        <ErrorLine msg={errorMsg} />
      </div>

      {/* Sticky band (owner's phone QA, PR #140): the picture check found
          the band scrolled off the bottom of the screen once the form grew
          taller than the viewport, since the card's own overflow: clip (see
          above) is what lets position: sticky work at all here. bottom: 0
          pins it to the viewport's bottom edge; zIndex and an opaque
          background (the same surface as the card, since detailsBandStyle's
          own background is transparent) keep the form's fields from
          scrolling up through it.

          A safe-area-aware paddingBottom (`calc(13px + env(safe-area-inset-
          bottom))`) was tried and dropped: jsdom's inline-style CSSOM cannot
          resolve `calc()` wrapping `env()` and throws while computing every
          element's accessibility role in this file's tests, not just this
          band's, so it does not meet the brief's own condition ("only if it
          can be done without changing... otherwise leave padding as is and
          say so"; the failure here is a testability break rather than a
          visual one, but the instruction's fallback is the right call
          either way). Padding stays the unmodified 13px from
          detailsBandStyle; the sticky band still sits above the home
          indicator on most iPhones because Safari's own viewport-fit
          handling already keeps a sticky/fixed element off it by default,
          just without the extra breathing room a safe-area inset would add. */}
      <div
        style={{
          ...detailsBandStyle,
          position: "sticky",
          bottom: 0,
          zIndex: 1,
          backgroundColor: "var(--surface-raised)",
        }}
      >
        {asking && nextPlan ? (
          <>
            {/* Teal question, no separate label (owner's call, PR #140):
                weight and color alone say this needs an answer, so no
                eyebrow was added beside it. */}
            <p
              style={{
                textAlign: "center",
                fontSize: "var(--type-meta)",
                color: "var(--action)",
                fontWeight: 600,
                marginBottom: "0.625rem",
              }}
            >
              {nextPlan.question}
            </p>
            <div style={pairRow}>
              <button
                ref={leaveButtonRef}
                type="button"
                onClick={() => doSubmit("leave")}
                disabled={isPending}
                style={{ ...pairPill, color: "var(--text-primary)", opacity: isPending ? 0.65 : 1 }}
              >
                Leave it
              </button>
              <button
                type="button"
                onClick={() => doSubmit("update")}
                disabled={isPending}
                style={{ ...pairPill, color: "var(--text-primary)", opacity: isPending ? 0.65 : 1 }}
              >
                Update it too
              </button>
            </div>
          </>
        ) : (
          <div style={{ display: "flex", gap: "0.625rem" }}>
            <button
              type="button"
              onClick={cancelForm}
              disabled={isPending}
              style={{ ...neverMindButton, cursor: isPending ? "default" : "pointer", opacity: isPending ? 0.65 : 1 }}
            >
              Never mind
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              style={{ ...saveButton, cursor: isPending ? "default" : "pointer", opacity: isPending ? 0.65 : 1 }}
            >
              Save
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
