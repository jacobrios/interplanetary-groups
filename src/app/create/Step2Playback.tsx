// src/app/create/Step2Playback.tsx
//
// Onboarding Step 2: Orbit plays back what it understood as rows inside its
// bubble (feed-style bubble with avatar, untailed — the tail belongs to Step
// 1 only). The group-name row is inline-editable (recorded deviation from
// the read-only mockup: rename exists nowhere else in the product yet).
// Every string here is composed deterministically from normalized fields.

"use client"

import { useState } from "react"
import { VENUE_NAME_MAX, type StoredRhythm } from "@/lib/orbit/rhythm"
import { formatRhythmRow } from "@/lib/orbit/playback"
import { formatTimeZoneLabel } from "@/lib/groups/timezone"

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

const rowLabelStyle: React.CSSProperties = {
  fontSize: "var(--type-eyebrow)",
  lineHeight: "var(--leading-normal)",
  color: "var(--text-secondary)",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  margin: 0,
}

const rowValueStyle: React.CSSProperties = {
  fontSize: "var(--type-body)",
  lineHeight: "var(--leading-normal)",
  color: "var(--text-primary)",
  margin: 0,
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
  return (
    <div style={{ width: "100%", maxWidth: "28rem" }}>
      {/* Feed-style Orbit bubble: lime avatar, muted fill, no name label. */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", marginBottom: "1.5rem" }}>
        <div
          aria-label="Orbit"
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            backgroundColor: "var(--color-lime)",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "0.6875rem",
            fontWeight: 700,
            color: "#0a0a0a",
            marginTop: "0.25rem",
          }}
        >
          O
        </div>
        <div
          style={{
            backgroundColor: "var(--surface-orbit)",
            borderRadius: "4px 16px 16px 16px",
            padding: "0.75rem 1rem",
            flex: 1,
          }}
        >
          <p
            style={{
              fontSize: "var(--type-body)",
              lineHeight: "var(--leading-normal)",
              color: "var(--text-primary)",
              margin: "0 0 0.75rem",
            }}
          >
            {INTRO_COPY}
          </p>

          {/* Group name row — inline editable. */}
          <div style={{ marginBottom: "0.75rem" }}>
            <label htmlFor="groupName" style={rowLabelStyle}>
              Group name
            </label>
            <input
              id="groupName"
              type="text"
              value={groupName}
              onChange={(e) => onGroupNameChange(e.target.value)}
              disabled={isCreating}
              aria-label="Group name"
              style={{
                width: "100%",
                marginTop: "0.25rem",
                padding: "0.375rem 0.5rem",
                backgroundColor: "var(--surface-input)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "0.375rem",
                color: "var(--text-primary)",
                fontSize: "var(--type-heading)",
                lineHeight: "var(--leading-tight)",
                fontWeight: 600,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* WHO row. */}
          <div style={{ marginBottom: "0.5rem" }}>
            <p style={rowLabelStyle}>Who</p>
            <p style={rowValueStyle}>{founderName}</p>
          </div>

          {/* One row per rhythm, primary first; loose rhythms read as
              understood-but-not-scheduled. Beneath each value line: a captured
              venue renders the inline standing-place input (editing, the
              group-name precedent, but quieter: label scale, subtle border);
              an empty venue renders a tap-to-reveal link that expands into
              the same input (collecting — see the editing-vs-collecting note
              above). Neutral colors on purpose, never lime — venue is
              optional and never blocks Continue, so it must not borrow the
              gap marker's "Orbit needs this" cue. */}
          {rhythms.map((r, i) => {
            const row = formatRhythmRow(r)
            const venueRevealed = seededVenueIdx.has(i) || tappedVenueIdx.has(i)
            return (
              <div key={i} style={{ marginBottom: i === rhythms.length - 1 ? 0 : "0.5rem" }}>
                <p style={rowLabelStyle}>{row.label}</p>
                <p style={rowValueStyle}>{row.value}</p>
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
                      backgroundColor: "var(--surface-input)",
                      border: "1px solid var(--border-subtle)",
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
              </div>
            )
          })}

          {/* Quiet timezone reference line. Reference text (meta scale,
              secondary color), never an action, never teal or lime. Always
              shown so a wrong inference is visible before confirm. No period,
              no dashes, plain register. */}
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
        </div>
      </div>

      {error && (
        <p
          style={{
            fontSize: "var(--type-meta)",
            lineHeight: "var(--leading-normal)",
            color: "#f87171",
            marginBottom: "0.75rem",
          }}
        >
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={onConfirm}
        disabled={isCreating || groupName.trim().length === 0}
        style={{
          width: "100%",
          padding: "0.75rem 1.5rem",
          backgroundColor: isCreating ? "var(--color-teal-hover)" : "var(--color-teal)",
          color: "#0a0a0a",
          fontSize: "var(--type-body)",
          fontWeight: 600,
          border: "none",
          borderRadius: "0.5rem",
          cursor: isCreating ? "not-allowed" : "pointer",
        }}
      >
        {isCreating ? "Setting things up…" : "Looks right, set up invites"}
      </button>

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
