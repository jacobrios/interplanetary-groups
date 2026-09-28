"use client"
//
// Onboarding step 2's editor (Task 9, onboarding-step2-cleanup slice). It is
// group info's own editor, in place: the same form body
// (GroupDetailsFields), the same validation (validateDetailsEdit), the same
// card, body, hidden heading and sticky band as EditGroupDetails. Two
// differences, both deliberate:
//
// - The band reads "Never mind | Done", not "Never mind | Save", because
//   nothing is saved here. Done hands the validated values back to the
//   wizard, and the group is created only at step 2's confirm.
// - No "Times in ..." line inside the editor (decision 7): the zone is
//   reference text on the read-only card, not something this form edits.
//
// The card shell, band and focus handling repeat EditGroupDetails' by
// design for this slice (known duplication, named in the PR); lifting a
// shared shell is not this task's.

import { useEffect, useRef, useState } from "react"
import { toRhythmEdit, validateDetailsEdit } from "@/lib/groups/details-edit"
import type { RhythmEdit } from "@/lib/groups/rhythm-edit"
import type { StoredRhythm } from "@/lib/orbit/rhythm"
import GroupDetailsFields from "@/components/GroupDetailsFields"
import { ErrorLine } from "@/components/choice"
import { visuallyHiddenStyle } from "@/components/visually-hidden"
import { neverMindButton, saveButton } from "@/components/form-fields"
import { detailsBodyStyle, detailsBandStyle } from "@/app/events/[id]/details-card"
import { infoCardStyle } from "@/app/groups/[id]/info/info-card"

interface Props {
  groupName: string
  rhythms: StoredRhythm[]
  /** Called only with validateDetailsEdit's ok output. */
  onDone: (name: string, rhythms: StoredRhythm[]) => void
  onCancel: () => void
}

export default function EditDetailsCard({ groupName, rhythms, onDone, onCancel }: Props) {
  // Seeded once at mount: the card mounts fresh on every open, so an
  // abandoned edit can never leak into the next one.
  const [name, setName] = useState(groupName)
  const [drafts, setDrafts] = useState<RhythmEdit[]>(() => rhythms.map(toRhythmEdit))
  const [error, setError] = useState<string | null>(null)

  // The EditGroupDetails convention (EditGroupDetails.tsx:53-77): focus the
  // hidden heading (never a text field, which would raise the iOS keyboard)
  // with preventScroll, and scroll the card's START into view, so the focus
  // call cannot pull the page back up and hide the top of the form.
  const cardRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
    cardRef.current?.scrollIntoView?.({ block: "start" })
  }, [])

  function handleDone() {
    const v = validateDetailsEdit(rhythms, { name, rhythms: drafts })
    if (!v.ok) {
      setError(v.error)
      return
    }
    onDone(v.name, v.rhythms)
  }

  return (
    // overflow: "clip", not "hidden": the reason is at EditGroupDetails.tsx,
    // the comment on its own outer card div (a sticky band never sticks
    // inside a scroll container it is not the one scrolling).
    <div ref={cardRef} style={{ ...infoCardStyle, marginTop: 0, padding: 0, overflow: "clip" }}>
      <div style={detailsBodyStyle}>
        <h2 ref={headingRef} tabIndex={-1} style={{ ...visuallyHiddenStyle, outline: "none" }}>
          Editing group details
        </h2>

        <GroupDetailsFields
          nameInputId="details-name"
          rhythmIdPrefix="details-rhythm"
          name={name}
          onNameChange={setName}
          rhythms={drafts}
          cadences={rhythms.map((r) => r.cadence)}
          onRhythmChange={(index, next) =>
            setDrafts((prev) => prev.map((v, idx) => (idx === index ? next : v)))
          }
          disabled={false}
        />

        <ErrorLine msg={error} />
      </div>

      {/* Sticky band, matching the comment on EditGroupDetails.tsx's own
          sticky band div: pinned to the viewport's bottom edge once the
          form outgrows the screen, opaque so fields never scroll up
          through it. className="sticky-band-safe-bottom" (globals.css,
          task 5 of the home-screen-web-app slice) adds the home-indicator
          inset to this band's bottom padding under viewportFit: "cover";
          see that rule's own comment for why the addition lives in a
          stylesheet class rather than in an inline longhand (jsdom throws
          on a longhand padding holding an unresolved calc(); it does not
          on a shorthand). */}
      <div
        className="sticky-band-safe-bottom"
        style={{
          ...detailsBandStyle,
          position: "sticky",
          bottom: 0,
          zIndex: 1,
          backgroundColor: "var(--surface-raised)",
        }}
      >
        <div style={{ display: "flex", gap: "0.625rem" }}>
          <button type="button" onClick={onCancel} style={{ ...neverMindButton, cursor: "pointer" }}>
            Never mind
          </button>
          <button type="button" onClick={handleDone} style={{ ...saveButton, cursor: "pointer" }}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
