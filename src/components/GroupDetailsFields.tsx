"use client"
// The group-details form body, lifted 26 Sept 2026 (Task 8,
// onboarding-step2-cleanup slice) so group info and onboarding step 2
// render one form body. Behaviour-preserving lift from
// EditGroupDetails.tsx:189-223: same ids, labels, GROUP_NAME_MAX, and
// separator style, so the existing EditGroupDetails tests pass unchanged.
// Passes RhythmFields its own showSchedule per rhythm (cadences[i] ===
// "weekly"), so a non-weekly activity's fields show only Activity and
// Place, with no Days or Time row to fill in for something that does not
// repeat on a schedule.

import { GROUP_NAME_MAX } from "@/lib/groups/details-edit"
import type { RhythmEdit } from "@/lib/groups/rhythm-edit"
import type { StoredRhythm } from "@/lib/orbit/rhythm"
import RhythmFields from "@/components/RhythmFields"
import { fieldStyle, labelStyle } from "@/components/form-fields"

interface Props {
  nameInputId: string
  rhythmIdPrefix: string
  name: string
  onNameChange: (v: string) => void
  rhythms: RhythmEdit[]
  /** Same order as rhythms; "weekly" shows the schedule (Days + Time). */
  cadences: StoredRhythm["cadence"][]
  onRhythmChange: (index: number, next: RhythmEdit) => void
  disabled: boolean
}

export default function GroupDetailsFields({
  nameInputId,
  rhythmIdPrefix,
  name,
  onNameChange,
  rhythms,
  cadences,
  onRhythmChange,
  disabled,
}: Props) {
  return (
    <>
      <div style={{ marginBottom: "10px" }}>
        <label htmlFor={nameInputId} style={labelStyle}>
          Group name
        </label>
        <input
          id={nameInputId}
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          maxLength={GROUP_NAME_MAX}
          disabled={disabled}
          style={fieldStyle}
        />
      </div>

      {rhythms.map((r, i) => (
        <div
          key={i}
          style={
            i > 0
              ? { borderTop: "1.4px solid var(--hairline)", paddingTop: "10px", marginTop: "10px" }
              : undefined
          }
        >
          <RhythmFields
            idPrefix={`${rhythmIdPrefix}-${i}`}
            value={r}
            onChange={(next) => onRhythmChange(i, next)}
            showSchedule={cadences[i] === "weekly"}
            disabled={disabled}
          />
        </div>
      ))}
    </>
  )
}
