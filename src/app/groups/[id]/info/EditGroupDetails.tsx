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
  const cardRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const linkRef = useRef<HTMLButtonElement>(null)
  const focusAfterSwap = useRef<"form" | "link" | null>(null)
  useEffect(() => {
    if (focusAfterSwap.current === "form") {
      headingRef.current?.focus()
      cardRef.current?.scrollIntoView?.({ block: "end" })
    } else if (focusAfterSwap.current === "link") {
      linkRef.current?.focus()
    }
    focusAfterSwap.current = null
  }, [editing])

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
    <div ref={cardRef} data-info-card style={{ ...infoCardStyle, padding: 0, overflow: "hidden" }}>
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

      <div style={detailsBandStyle}>
        {asking && nextPlan ? (
          <>
            <p
              style={{
                textAlign: "center",
                fontSize: "var(--type-meta)",
                color: "var(--text-secondary)",
                marginBottom: "0.625rem",
              }}
            >
              {nextPlan.question}
            </p>
            <div style={pairRow}>
              <button
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
