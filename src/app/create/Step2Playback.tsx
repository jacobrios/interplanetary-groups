// src/app/create/Step2Playback.tsx
//
// Onboarding Step 2: Orbit plays back what it understood as rows inside its
// bubble. The bubble now shares Step 1's tailed treatment (extracted as
// TailedOrbitBubble): no avatar, tail pointing up at the header's own
// Orbit mark, so a step sitting directly under the header never shows two
// Orbit faces stacked on top of each other (polish slice two phone QA).
// The group-name row is inline-editable (recorded deviation from the
// read-only mockup: rename exists nowhere else in the product yet). Every
// string here is composed deterministically from normalized fields.

"use client"

import { useState } from "react"
import { VENUE_NAME_MAX, type StoredRhythm } from "@/lib/orbit/rhythm"
import { formatRhythmRow } from "@/lib/orbit/playback"
import { formatTimeZoneLabel } from "@/lib/groups/timezone"
import { TailedOrbitBubble } from "@/components/TailedOrbitBubble"
import { PlaybackCard, PlaybackNameRow, PlaybackRow, rowValueTextStyle } from "./PlaybackCard"

const INTRO_COPY = "Here's what I understood."

interface Props {
  founderName: string
  groupName: string
  onGroupNameChange: (v: string) => void
  rhythms: StoredRhythm[]
  /** Per-rhythm standing-place edit; index matches the rhythms array. */
  onVenueNameChange: (index: number, value: string) => void
  /**
   * The founder's browser-inferred IANA zone (or null before detection / when
   * it produced nothing). This is the only place a wrong inference becomes
   * visible before confirm, so the reference line renders on every path — the
   * null/UTC case reads "Times in UTC", which is itself the signal to a founder
   * in another zone that something is off.
   */
  timeZone: string | null
  onConfirm: () => void
  onBack: () => void
  isCreating: boolean
  error: string | null
}

export default function Step2Playback({
  founderName,
  groupName,
  onGroupNameChange,
  rhythms,
  onVenueNameChange,
  timeZone,
  onConfirm,
  onBack,
  isCreating,
  error,
}: Props) {
  // Reference text, not an action: derived deterministically from the IANA zone
  // (never teal, never lime). Falls back to "UTC" before detection resolves.
  const zoneLabel = formatTimeZoneLabel(timeZone ?? "UTC")

  // Editing vs collecting (product decision, 22 July 2026, revised after the
  // always-on treatment was tried and seen): a captured venue gets the inline
  // input because that is editing something Orbit understood, matching the
  // group-name row precedent. An empty venue is not something Orbit
  // understood, so it gets a quiet tap-to-reveal link instead of a persistent
  // placeholder — two stacked placeholders read as a form on a card whose
  // thesis is "setup is a conversation, not a form."
  //
  // Seeded indexes are computed once at mount so clearing a captured venue
  // mid-edit never collapses the input under the founder's cursor; tapped
  // indexes are one-way for the same reason.
  const [seededVenueIdx] = useState<ReadonlySet<number>>(
    () => new Set(rhythms.flatMap((r, i) => (r.venueName ? [i] : [])))
  )
  const [tappedVenueIdx, setTappedVenueIdx] = useState<ReadonlySet<number>>(new Set())

  // One source for "can this be pressed", so the disabled attribute and the
  // dimmed appearance can never disagree (they did: the opacity keyed off
  // isCreating alone, so a confirm blocked by an empty group name still
  // rendered as a live teal band).
  const canConfirm = !isCreating && groupName.trim().length > 0

  return (
    <div style={{ width: "100%", maxWidth: "28rem" }}>
      {/* Tailed Orbit bubble, shared with Step 1 (TailedOrbitBubble): the
          header's own Orbit mark sits directly above this step, so the
          bubble drops its avatar and points a tail up at the header
          instead, same as Step 1. The width:100% wrapper is the same
          pattern MessageFeed uses so the bubble's content area fills the
          available width rather than shrinking to its content's intrinsic
          size. Task 4 moves the schedule rows onto their own card below;
          the bubble now carries only Orbit's spoken line. */}
      <div style={{ width: "100%", marginBottom: "1rem" }}>
        <TailedOrbitBubble>
          <p style={{ margin: 0 }}>{INTRO_COPY}</p>
        </TailedOrbitBubble>
      </div>

      {/* The playback card (walkthrough.css .cardX / .s2-srow, task 4). The
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
              // Not yet submittable (the group name is empty): 0.5, the same
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
        {/* Group name row, full width, label stacked above the input
            (PlaybackNameRow), inline editable. The input keeps its own box
            so the row still reads as tappable rather than a static
            headline. */}
        <PlaybackNameRow htmlForLabel="groupName">
          <input
            id="groupName"
            type="text"
            value={groupName}
            onChange={(e) => onGroupNameChange(e.target.value)}
            disabled={isCreating}
            aria-label="Group name"
            style={{
              width: "100%",
              padding: "0.375rem 0.5rem",
              backgroundColor: "var(--surface-base)",
              border: "1px solid var(--hairline)",
              borderRadius: "0.375rem",
              color: "var(--text-primary)",
              fontSize: "var(--type-heading)",
              lineHeight: "var(--leading-tight)",
              fontWeight: 600,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </PlaybackNameRow>

        {/* WHO row. */}
        <PlaybackRow label="Who">
          <p style={rowValueTextStyle}>{founderName}</p>
        </PlaybackRow>

        {/* One row per rhythm, primary first; loose rhythms read as
            understood-but-not-scheduled. Beneath each value line: a captured
            venue renders the inline standing-place input (editing, the
            group-name precedent, but quieter: label scale, subtle border);
            an empty venue renders a tap-to-reveal link that expands into
            the same input (collecting; see the editing-vs-collecting note
            above). Neutral colors on purpose, never lime; venue is
            optional and never blocks Continue, so it must not borrow the
            gap marker's "Orbit needs this" cue. */}
        {rhythms.map((r, i) => {
          const row = formatRhythmRow(r)
          const venueRevealed = seededVenueIdx.has(i) || tappedVenueIdx.has(i)
          return (
            <PlaybackRow key={i} label={row.label} isLast={i === rhythms.length - 1}>
              <p style={rowValueTextStyle}>{row.value}</p>
              {venueRevealed ? (
                <input
                  id={`venueName-${i}`}
                  type="text"
                  value={r.venueName ?? ""}
                  onChange={(e) => onVenueNameChange(i, e.target.value)}
                  disabled={isCreating}
                  maxLength={VENUE_NAME_MAX}
                  placeholder="Where do you usually meet? (optional)"
                  aria-label={`Where you usually meet for ${r.activity}`}
                  // Focus only the tap-revealed input; seeded inputs must
                  // not steal focus from the card on mount.
                  autoFocus={tappedVenueIdx.has(i)}
                  style={{
                    width: "100%",
                    marginTop: "0.25rem",
                    padding: "0.25rem 0.5rem",
                    backgroundColor: "var(--surface-base)",
                    border: "1px solid var(--hairline)",
                    borderRadius: "0.375rem",
                    color: "var(--text-primary)",
                    fontSize: "var(--type-label)",
                    lineHeight: "var(--leading-normal)",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setTappedVenueIdx(new Set([...tappedVenueIdx, i]))}
                  disabled={isCreating}
                  aria-label={`Add where you meet for ${r.activity}`}
                  style={{
                    display: "block",
                    background: "none",
                    border: "none",
                    padding: 0,
                    marginTop: "0.25rem",
                    color: "var(--text-secondary)",
                    fontSize: "var(--type-label)",
                    lineHeight: "var(--leading-normal)",
                    textDecoration: "underline",
                    cursor: isCreating ? "not-allowed" : "pointer",
                  }}
                >
                  Add where you meet
                </button>
              )}
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
        type="button"
        onClick={onBack}
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
        Edit my description
      </button>
    </div>
  )
}
