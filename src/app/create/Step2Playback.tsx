// src/app/create/Step2Playback.tsx
//
// Onboarding Step 2: Orbit plays back what it understood as rows inside its
// bubble (feed-style bubble with avatar, untailed — the tail belongs to Step
// 1 only). The group-name row is inline-editable (recorded deviation from
// the read-only mockup: rename exists nowhere else in the product yet).
// Every string here is composed deterministically from normalized fields.

"use client"

import type { StoredRhythm } from "@/lib/orbit/rhythm"
import { formatRhythmRow } from "@/lib/orbit/playback"

const INTRO_COPY = "Here's what I understood."

interface Props {
  founderName: string
  groupName: string
  onGroupNameChange: (v: string) => void
  rhythms: StoredRhythm[]
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
  onConfirm,
  onBack,
  isCreating,
  error,
}: Props) {
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
              understood-but-not-scheduled. */}
          {rhythms.map((r, i) => {
            const row = formatRhythmRow(r)
            return (
              <div key={i} style={{ marginBottom: i === rhythms.length - 1 ? 0 : "0.5rem" }}>
                <p style={rowLabelStyle}>{row.label}</p>
                <p style={rowValueStyle}>{row.value}</p>
              </div>
            )
          })}
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
        {isCreating ? "Setting things up…" : "Looks right, create my group"}
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
