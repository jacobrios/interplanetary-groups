// src/app/create/Step2Playback.tsx
//
// Onboarding Step 2: Orbit plays back what it understood, read-only
// (decision 5, onboarding-step2-cleanup slice, 26 Sept 2026). The bubble
// shares Step 1's tailed treatment (TailedOrbitBubble): no avatar, tail
// pointing up at the header's own Orbit mark, so a step sitting directly
// under the header never shows two Orbit faces stacked (polish slice two
// phone QA). Everything Orbit understood (the group name, each activity's
// name, days, time and spot) is changed only through the quiet "Edit
// details" link, which opens group info's own editor in place
// (EditDetailsCard). Every string on the read-only card is composed
// deterministically from normalized fields.

"use client"

import { useEffect, useRef, useState } from "react"
import type { StoredRhythm } from "@/lib/orbit/rhythm"
import { formatRhythmRow } from "@/lib/orbit/playback"
import { formatTimeZoneLabel } from "@/lib/groups/timezone"
import { TailedOrbitBubble } from "@/components/TailedOrbitBubble"
import { PlaybackCard, PlaybackNameRow, PlaybackRow, rowValueTextStyle } from "./PlaybackCard"
import EditDetailsCard from "./EditDetailsCard"
import { toRhythmEdit, validateDetailsEdit } from "@/lib/groups/details-edit"

const INTRO_COPY = "Here's what I understood."

interface Props {
  founderName: string
  groupName: string
  rhythms: StoredRhythm[]
  /** Called with validateDetailsEdit's ok output when the founder taps Done
   * in the editor; the wizard stores both, nothing is saved until confirm. */
  onDetailsChange: (name: string, rhythms: StoredRhythm[]) => void
  /**
   * The founder's browser-inferred IANA zone (or null before detection / when
   * it produced nothing). This is the only place a wrong inference becomes
   * visible before confirm, so the reference line renders on every path: the
   * null/UTC case reads "Times in UTC", which is itself the signal to a founder
   * in another zone that something is off.
   */
  timeZone: string | null
  onConfirm: () => void
  isCreating: boolean
  error: string | null
}

export default function Step2Playback({
  founderName,
  groupName,
  rhythms,
  onDetailsChange,
  timeZone,
  onConfirm,
  isCreating,
  error,
}: Props) {
  // Reference text, not an action: derived deterministically from the IANA zone
  // (never teal, never lime). Falls back to "UTC" before detection resolves.
  const zoneLabel = formatTimeZoneLabel(timeZone ?? "UTC")

  const [editing, setEditing] = useState(false)

  // Focus returns to "Edit details" after Done or Never mind (the
  // EditGroupDetails convention). The editor focuses its own hidden heading
  // when it opens, so only the close direction is handled here.
  const editLinkRef = useRef<HTMLButtonElement>(null)
  const focusLinkAfterClose = useRef(false)
  useEffect(() => {
    if (!editing && focusLinkAfterClose.current) {
      editLinkRef.current?.focus()
      focusLinkAfterClose.current = false
    }
  }, [editing])

  function close() {
    focusLinkAfterClose.current = true
    setEditing(false)
  }

  // One source for "can this be pressed", so the disabled attribute and the
  // dimmed appearance can never disagree. Validating what is on screen with
  // the editor's own rules covers the group name, the primary activity being
  // schedulable, and its required spot in one check; with the card read-only
  // it can only fail on a forged path, never on a founder's typing.
  const canConfirm =
    !isCreating &&
    validateDetailsEdit(rhythms, { name: groupName, rhythms: rhythms.map(toRhythmEdit) }).ok

  const bubble = (
    <div style={{ width: "100%", marginBottom: "1rem" }}>
      <TailedOrbitBubble>
        <p style={{ margin: 0 }}>{INTRO_COPY}</p>
      </TailedOrbitBubble>
    </div>
  )

  if (editing) {
    return (
      <div style={{ width: "100%", maxWidth: "28rem" }}>
        {bubble}
        <EditDetailsCard
          groupName={groupName}
          rhythms={rhythms}
          onDone={(n, r) => {
            onDetailsChange(n, r)
            close()
          }}
          onCancel={close}
        />
      </div>
    )
  }

  return (
    <div style={{ width: "100%", maxWidth: "28rem" }}>
      {/* Tailed Orbit bubble, shared with Step 1 (TailedOrbitBubble): the
          header's own Orbit mark sits directly above this step, so the
          bubble drops its avatar and points a tail up at the header
          instead. The width:100% wrapper is the same pattern MessageFeed
          uses so the bubble's content area fills the available width. */}
      {bubble}

      {/* The playback card (walkthrough.css .cardX / .s2-srow). The
          confirm button renders as the card's own footer band (.cfA), so it
          is passed as `footer` rather than nested in the row list below. */}
      <PlaybackCard
        footer={
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "10px",
              backgroundColor: "var(--action)",
              padding: "12px 15px",
              border: "none",
              // Two dimmed states, because the band is disabled for two
              // different reasons and only one of them used to show.
              // In-flight: the old palette shifted the fill to a second teal
              // while pending; the new palette has no second teal, so this
              // dims instead, matching MessageFeed's optimistic-message idiom
              // (0.65, greyscale-safe, no new token).
              // Not yet submittable (what is on screen would not validate): 0.5, the same
              // dim step 1's Continue button already uses for exactly this,
              // so a button that cannot be pressed never renders as a live
              // teal band. No transition: this slice is no-animation, so the
              // change is instant.
              opacity: isCreating ? 0.65 : canConfirm ? 1 : 0.5,
              cursor: canConfirm ? "pointer" : "not-allowed",
            }}
          >
            <span
              style={{
                fontSize: "var(--type-label)",
                fontWeight: 700,
                color: "var(--action-ink)",
              }}
            >
              {isCreating ? "Setting things up…" : "Looks right, set up invites"}
            </span>
            <span
              style={{
                width: "26px",
                height: "26px",
                borderRadius: "50%",
                backgroundColor: "rgba(10,33,37,.20)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flex: "0 0 auto",
              }}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 20 20"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M7 4l6 6-6 6"
                  stroke="var(--action-ink)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </button>
        }
      >
        {/* Group name row, read-only text: the gap-ask's own treatment
            (StepGapAsk.tsx), heading size and weight. */}
        <PlaybackNameRow>
          <p
            style={{
              ...rowValueTextStyle,
              fontSize: "var(--type-heading)",
              lineHeight: "var(--leading-tight)",
              fontWeight: 600,
            }}
          >
            {groupName}
          </p>
        </PlaybackNameRow>

        {/* WHO row. */}
        <PlaybackRow label="Who">
          <p style={rowValueTextStyle}>{founderName}</p>
        </PlaybackRow>

        {/* One row per activity, primary first; loose and monthly ones read
            as understood-but-not-scheduled. A spot, when there is one, is
            appended as " · spot", the suffix the gap-ask, the join screen
            and group info already use. */}
        {rhythms.map((r, i) => {
          const row = formatRhythmRow(r)
          return (
            <PlaybackRow key={i} label={row.label} isLast={i === rhythms.length - 1}>
              <p style={rowValueTextStyle}>
                {r.venueName ? `${row.value} · ${r.venueName}` : row.value}
              </p>
            </PlaybackRow>
          )
        })}

        {/* Quiet timezone reference line. Reference text (meta scale,
            secondary color), never an action, never teal or lime. Always
            shown so a wrong inference is visible before confirm. No period,
            no dashes, plain register. Not a key/value row, so it renders
            below the row list rather than through PlaybackRow. */}
        <p
          style={{
            fontSize: "var(--type-meta)",
            lineHeight: "var(--leading-normal)",
            color: "var(--text-secondary)",
            margin: "0.75rem 0 0",
          }}
        >
          Times in {zoneLabel}
        </p>

        {error && (
          <p
            style={{
              fontSize: "var(--type-meta)",
              lineHeight: "var(--leading-normal)",
              color: "var(--danger)",
              margin: "0.75rem 0 0",
            }}
          >
            {error}
          </p>
        )}
      </PlaybackCard>

      <button
        ref={editLinkRef}
        type="button"
        onClick={() => setEditing(true)}
        disabled={isCreating}
        style={{
          display: "block",
          margin: "1rem auto 0",
          background: "none",
          border: "none",
          padding: "0.25rem 0.5rem",
          color: "var(--text-secondary)",
          fontSize: "var(--type-meta)",
          lineHeight: "var(--leading-normal)",
          textDecoration: "underline",
          cursor: isCreating ? "not-allowed" : "pointer",
        }}
      >
        Edit details
      </button>
    </div>
  )
}
