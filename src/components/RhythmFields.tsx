"use client"
// One activity's editable fields, shared by the founder's group-details
// editor (group info) and onboarding step 2 so the editor exists once.
// Styles come from form-fields.ts (lifted from EditEventDetails) and the
// gauge chip look (choiceChipStyle), approved by the owner 24 Sept 2026
// as the day picker: the product had no multi-pick control, and inventing
// one was ruled out.
import { fieldStyle, labelStyle, pickerStyle, shrinkColumn } from "@/components/form-fields"
import { choiceChipStyle } from "@/components/choice"
import { VENUE_NAME_MAX } from "@/lib/orbit/rhythm"
import { EDIT_TITLE_MAX } from "@/lib/events/edit-fields"
import type { RhythmEdit } from "@/lib/groups/rhythm-edit"

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export default function RhythmFields({ idPrefix, value, onChange, showPlace, disabled }: {
  idPrefix: string; value: RhythmEdit; onChange: (next: RhythmEdit) => void; showPlace: boolean; disabled: boolean
}) {
  const on = new Set(value.daysOfWeek ?? [])
  function toggle(d: number) {
    const next = new Set(on)
    if (next.has(d)) next.delete(d); else next.add(d)
    const days = [...next].sort((a, b) => a - b)
    onChange({ ...value, daysOfWeek: days.length > 0 ? days : null })
  }
  return (
    <>
      <div style={{ marginBottom: "10px" }}>
        <label htmlFor={`${idPrefix}-activity`} style={labelStyle}>Activity</label>
        <input id={`${idPrefix}-activity`} type="text" value={value.activity} maxLength={EDIT_TITLE_MAX}
          onChange={(e) => onChange({ ...value, activity: e.target.value })} disabled={disabled} style={fieldStyle} />
      </div>
      <div role="group" aria-labelledby={`${idPrefix}-days`} style={{ marginBottom: "10px" }}>
        <span id={`${idPrefix}-days`} style={labelStyle}>Days</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "7px" }}>
          {DAYS.map((d, i) => (
            <button key={d} type="button" aria-pressed={on.has(i)} disabled={disabled}
              onClick={() => toggle(i)} style={choiceChipStyle(on.has(i), true, disabled)}>
              {on.has(i) ? `✓ ${d}` : d}
            </button>
          ))}
        </div>
      </div>
      {/* Full row width, no second column (owner's phone QA, PR #140): the
          empty spacer div used to hold half the row for nothing, and at the
          owner's larger device text the Time value clipped to "07:00 A" in
          its half-width box. pickerStyle and edit-picker are unchanged; the
          iOS force-zoom / native-chrome fixes they carry have nothing to do
          with the column width. */}
      <div style={{ marginBottom: "10px" }}>
        <label htmlFor={`${idPrefix}-time`} style={labelStyle}>Time</label>
        <input id={`${idPrefix}-time`} type="time" value={value.timeLocal ?? ""} disabled={disabled}
          onChange={(e) => onChange({ ...value, timeLocal: e.target.value === "" ? null : e.target.value })}
          className="edit-picker" style={{ ...fieldStyle, ...pickerStyle }} />
      </div>
      {showPlace && (
        <div style={{ marginBottom: "6px" }}>
          <label htmlFor={`${idPrefix}-place`} style={labelStyle}>Place</label>
          <input id={`${idPrefix}-place`} type="text" value={value.venueName ?? ""} maxLength={VENUE_NAME_MAX}
            placeholder="Where do you meet?" disabled={disabled}
            onChange={(e) => onChange({ ...value, venueName: e.target.value })} style={fieldStyle} />
        </div>
      )}
    </>
  )
}
