# Group details editing (founder fixes group details)

Designed 2 Sept 2026 and parked; resumed and redesigned 24 Sept 2026 on branch
`group-details-editing`, after the editable event card (PR #137) changed the
ground under it. The 2 Sept version is in git history; what changed and why is
in "Lineage" at the foot of this front section.

---

## Front section

**Settled with the owner, 24 Sept 2026. Do not relitigate.**

1. **The founder alone edits, on group info, in place.** A quiet "Edit group
   details" link under the card turns the card into the form, with a
   "Never mind | Save" band (the event card's pattern). Members see nothing new.
2. **Also on onboarding step 2**, per activity, behind a quiet "Change day or
   time" link.
3. **Editable:** group name, and for every activity its name, days, time and
   spot. Not cadence, not timezone.
4. **The first activity's spot stays required** at creation and cannot be
   cleared in the editor.
5. **This week's plan:** one question, "Update that one too, or leave it?".
   Spot and name apply directly, RSVPs untouched. Day or time opens the group
   vote with the founder counted yes; when it passes the founder is marked
   in, like any other asker (amended 24 Sept 2026, owner: consistency over an
   exception that would have needed a migration).
   Not asked once the plan has started. A vote that clears its bar the
   moment it opens moves the plan at once (also fixing the event card's
   solo-group dead end, declared in the PR).
6. **Chat: one Orbit message naming the founder**, carrying the vote chips
   when it moves the plan. Silent while the founder is alone, and for a rename.
7. **Orbit's chat declines are unchanged.** No bench runs.
8. **Days use the gauge chips** as seven toggles. Mocks approved as drawn.

**Non-goals, and where they belong.** Orbit acting on day or spot changes in
chat: verbal group two. Timezone and cadence editing: their own slices.
Member editing: contradicts 1. Server-side enforcement of the required spot:
debt, below.

**Verified by.** Tests: the validator; the founder gate; the message composer
(one message, founder named, silent alone and on rename); each state of the
plan question; the founder's yes becoming an IN RSVP when the plan moves; a vote that clears
at birth moving the plan. Not tested: the native pickers, and rendering, which
get the 375px pass and a real-phone pass.

**Debt expected.** The required spot is enforced in the browser only; only the
first activity ever schedules; no edit history; a member still cannot change
the regular schedule anywhere.

**Lineage.** 2 Sept had a separate `/edit` screen, a direct plan move, a
rewrite of Orbit's declines and a "tell Orbit" line for members. The event card
made day and time a group decision, already rewrote the declines, and the line
was deleted as untrue.

---

## Tasks

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this task by task. Steps use checkbox (`- [ ]`) syntax for tracking. Read the front section above first: it is the contract, and anything here that contradicts it is a bug in this half.

**Goal:** the founder can correct the group's name and every activity's name, days, time and spot, on group info after creation and on onboarding step 2 before it, with this week's plan brought along on request.

**Architecture:** one pure module validates and diffs an edit (`src/lib/groups/details-edit.ts`), one pure module composes Orbit's single message (`src/lib/orbit/details-copy.ts`), one lib function does the founder-gated write (`src/lib/groups/update-details.ts`) reusing the event card's write path (an extracted `applyDetailChangeInTx`) and the existing group vote (`createGroupProposal`, `moveEventCoreInTx`). One shared client component (`RhythmFields`) renders the fields on both surfaces.

**Tech stack:** Next.js 16 (App Router, server actions), Prisma 7 against the dev-test Supabase database, Vitest (jsdom for components, the real dev-test database for lib tests), React 19.

**Spec:** the front section of this same document. Mocks: approved 24 Sept 2026, see "The approved picture" below.

### Global constraints

- Run `npm run db:which` before any migration, seed or database-backed test run; it must print `DEV-TEST`. Never point anything at production.
- Every Orbit string: no em dashes or en dashes, three-letter weekdays, times in the group's timezone (`Group.timeZone`), never viewer-local.
- Teal (`var(--action)`) appears only on the Save button. Day chips are grey, never teal.
- Styles are copied by VALUE from the named source (CLAUDE.md: map tokens by value, never by name). Text inputs are 16px (`1rem`) so iOS never force-zooms.
- Native date/time inputs carry `appearance: none` / `WebkitAppearance: "none"` and `className="edit-picker"` (the iPhone overflow fix already in `EditEventDetails.tsx` and `globals.css`).
- Tests build their own fixtures and pass from an empty database. Copy the fixture and cleanup shape of `src/lib/events/__tests__/submit-edit.test.ts`.
- Write the failing test first and SHOW it failing. A test that passes on its first run needs a one-line reason it could have failed.
- Do NOT change `buildCantDoReply` or any other chat decline, prompt, `normalize.ts`, or `spark.ts`. Do NOT run `eval:detect` or `eval:onboarding`.
- This slice has NO migration. If a task seems to need a schema change, stop and report it.
- Run a single test file with `npx vitest run <path>`.

### The approved picture (build to this)

1. **Group info, founder, at rest:** production page, plus one quiet underlined link directly under the WHO/activities card: `Edit group details` (style of `ResetInviteLink.tsx:40-51`: no background, no border, no padding, `var(--text-secondary)`, `var(--type-meta)`, underline, `alignSelf: flex-start`, 12px above it). Members never see it.
2. **Editing:** the card itself becomes the form in place (card padding 0, body `15px 16px`, band below with `detailsBandStyle`). Fields in order: `Group name`, then per activity `Activity`, `Days` (seven gauge chips), `Time` (half-width row, native time picker), `Place`. Band: `Never mind | Save` (EditEventDetails' band buttons). The link below the card hides while editing. The form scrolls into view on open (`scrollIntoView({ block: "end" })`).
3. **After Save, when the first activity changed and a plan is coming up:** the fields stay; the band becomes one centered meta line `Your next plan is Sat, Oct 3. Update that one too, or leave it?` over an equal-weight pair `Leave it | Update it too` (`pairPill` + `pairRow` from `src/app/events/[id]/pills.ts`, both `var(--text-primary)`, the CancelControls confirm row).
4. **Onboarding step 2:** under each activity's spot control, a quiet `Change day or time` link (style of Step2Playback's "Edit my description", left-aligned, 8px above). Tapped, it is replaced by a hairline-topped block with `Activity`, `Days`, `Time` (no Place: the spot box above already is it). The row summary above updates live.

### File map

| File | Create/Modify | Responsibility |
|---|---|---|
| `src/components/form-fields.ts` | Create | Field, label, picker, column and band-button styles lifted from EditEventDetails |
| `src/components/choice.tsx` | Modify | Export `choiceChipStyle`; ChoiceChip uses it |
| `src/app/events/[id]/EditEventDetails.tsx` | Modify | Import the lifted styles; no visual change |
| `src/components/RhythmFields.tsx` | Create | Activity / Days / Time (/ Place) fields for one activity |
| `src/lib/groups/details-edit.ts` | Create | `validateDetailsEdit`, `diffDetails`, error strings, `GROUP_NAME_MAX` |
| `src/lib/orbit/details-copy.ts` | Create | `buildDetailsAnnouncement`, `buildPlanQuestion` |
| `src/lib/events/submit-edit.ts` | Modify | Promote a vote that clears its bar the moment it opens |
| `src/lib/events/move.ts` | Modify | `announcementBody: string | null`; null writes no message |
| `src/lib/events/edit-details.ts` | Modify | Extract `applyDetailChangeInTx`; `editEventDetails` unchanged in behaviour |
| `src/lib/groups/update-details.ts` | Create | `findNextRhythmPlan`, `updateGroupDetails` |
| `src/app/actions/update-group-details.ts` | Create | Server action |
| `src/app/groups/[id]/info/info-card.ts` | Create | The info card's shell style, shared by page and editor |
| `src/app/groups/[id]/info/EditGroupDetails.tsx` | Create | Founder's in-place editor |
| `src/app/groups/[id]/info/page.tsx` | Modify | Mount the editor for the founder |
| `src/app/create/Step2Playback.tsx`, `OnboardingWizard.tsx` | Modify | Change day or time on step 2 |

---

### Task 1: lift the shared form styles (behaviour-preserving)

**Files:**
- Create: `src/components/form-fields.ts`
- Modify: `src/app/events/[id]/EditEventDetails.tsx` (delete its local `fieldStyle`, `labelStyle`, `bandButton`, `neverMindButton`, `saveButton`, `shrinkColumn`, `pickerStyle`; import them)
- Modify: `src/components/choice.tsx` (export `choiceChipStyle`)
- Test: `src/components/__tests__/form-fields.test.ts`

**Interfaces:**
- Produces: `fieldStyle`, `labelStyle`, `pickerStyle`, `shrinkColumn`, `neverMindButton`, `saveButton` (all `React.CSSProperties`) from `@/components/form-fields`; `choiceChipStyle(selected: boolean, quiet: boolean, disabled: boolean): React.CSSProperties` from `@/components/choice`.

- [ ] **Step 1: Write the failing test**

```ts
// src/components/__tests__/form-fields.test.ts
import { describe, it, expect } from "vitest"
import { fieldStyle, pickerStyle, saveButton } from "@/components/form-fields"
import { choiceChipStyle } from "@/components/choice"

describe("shared form styles", () => {
  it("keeps the 16px field that stops iOS zooming", () => {
    expect(fieldStyle.fontSize).toBe("1rem")
  })
  it("strips native picker appearance for iOS width", () => {
    expect(pickerStyle.appearance).toBe("none")
    expect(pickerStyle.WebkitAppearance).toBe("none")
  })
  it("fills Save with the action colour", () => {
    expect(saveButton.backgroundColor).toBe("var(--action)")
  })
  it("chip: a picked chip gets the self fill, a quiet unpicked one goes secondary", () => {
    expect(choiceChipStyle(true, true, false).backgroundColor).toBe("var(--surface-self)")
    expect(choiceChipStyle(false, true, false).color).toBe("var(--text-secondary)")
    expect(choiceChipStyle(false, false, true).cursor).toBe("default")
  })
})
```

- [ ] **Step 2: Run it and see it fail** (`npx vitest run src/components/__tests__/form-fields.test.ts`): module not found.

- [ ] **Step 3: Create `src/components/form-fields.ts`** by moving the seven constants out of `EditEventDetails.tsx` verbatim (values, and their comments, unchanged). Add a header comment: lifted 24 Sept 2026 so the group-details editor and the event editor cannot drift. In `choice.tsx`, move ChoiceChip's inline style object into:

```ts
export function choiceChipStyle(selected: boolean, quiet: boolean, disabled: boolean): React.CSSProperties {
  return {
    border: "1.7px solid var(--hairline)",
    backgroundColor: selected ? "var(--surface-self)" : "transparent",
    borderRadius: "20px",
    padding: "8px 12px",
    fontSize: "var(--type-label)",
    fontWeight: 600,
    fontFamily: "inherit",
    color: quiet && !selected ? "var(--text-secondary)" : "var(--text-primary)",
    whiteSpace: "nowrap",
    cursor: disabled ? "default" : "pointer",
  }
}
```
and make ChoiceChip use `style={choiceChipStyle(selected, quiet, disabled)}`.

- [ ] **Step 4: Run the new test and the existing ones that cover these files:**
`npx vitest run src/components/__tests__/form-fields.test.ts src/app/events src/components` : all pass. The existing EditEventDetails and chip tests passing unchanged is the evidence the lift changed nothing.

- [ ] **Step 5: Commit** `git add src/components src/app/events/[id]/EditEventDetails.tsx && git commit -m "Lift the event editor's field styles and the chip style into shared modules"`

---

### Task 2: `RhythmFields`, the shared per-activity fields

**Files:**
- Create: `src/components/RhythmFields.tsx`
- Test: `src/components/__tests__/RhythmFields.test.tsx`

**Interfaces:**
- Consumes: Task 1's styles and `choiceChipStyle`; `VENUE_NAME_MAX` from `@/lib/orbit/rhythm`; `EDIT_TITLE_MAX` from `@/lib/events/edit-fields`.
- Produces:
```ts
export interface RhythmEdit {
  activity: string
  daysOfWeek: number[] | null
  timeLocal: string | null
  venueName: string | null
}
export default function RhythmFields(props: {
  idPrefix: string            // unique per rhythm, e.g. "rhythm-0"
  value: RhythmEdit
  onChange: (next: RhythmEdit) => void
  showPlace: boolean          // false on onboarding step 2
  disabled: boolean
}): JSX.Element
```
`RhythmEdit` is exported from this file and re-exported by `details-edit.ts` (Task 3) so lib code never imports a client component: put the interface in `src/lib/groups/rhythm-edit.ts` and import it into both.

- [ ] **Step 1: Write the failing tests**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import RhythmFields from "../RhythmFields"

const base = { activity: "tennis", daysOfWeek: [6], timeLocal: "09:00", venueName: "Court 3" }

describe("RhythmFields", () => {
  it("toggles a day on, reporting sorted day numbers", () => {
    const onChange = vi.fn()
    render(<RhythmFields idPrefix="r0" value={base} onChange={onChange} showPlace disabled={false} />)
    fireEvent.click(screen.getByRole("button", { name: /Mon/ }))
    expect(onChange).toHaveBeenCalledWith({ ...base, daysOfWeek: [1, 6] })
  })
  it("toggles a picked day off", () => {
    const onChange = vi.fn()
    render(<RhythmFields idPrefix="r0" value={{ ...base, daysOfWeek: [1, 6] }} onChange={onChange} showPlace disabled={false} />)
    fireEvent.click(screen.getByRole("button", { name: /Sat/ }))
    expect(onChange).toHaveBeenCalledWith({ ...base, daysOfWeek: [1] })
  })
  it("turning the last day off reports null, which validation later refuses", () => {
    const onChange = vi.fn()
    render(<RhythmFields idPrefix="r0" value={base} onChange={onChange} showPlace disabled={false} />)
    fireEvent.click(screen.getByRole("button", { name: /Sat/ }))
    expect(onChange).toHaveBeenCalledWith({ ...base, daysOfWeek: null })
  })
  it("marks picked days for assistive tech and shows the tick", () => {
    render(<RhythmFields idPrefix="r0" value={base} onChange={() => {}} showPlace disabled={false} />)
    const sat = screen.getByRole("button", { name: /Sat/ })
    expect(sat.getAttribute("aria-pressed")).toBe("true")
    expect(sat.textContent).toBe("✓ Sat")
  })
  it("round-trips HH:mm through the native time input", () => {
    const onChange = vi.fn()
    render(<RhythmFields idPrefix="r0" value={base} onChange={onChange} showPlace disabled={false} />)
    fireEvent.change(screen.getByLabelText("Time"), { target: { value: "20:30" } })
    expect(onChange).toHaveBeenCalledWith({ ...base, timeLocal: "20:30" })
  })
  it("an emptied time reports null", () => {
    const onChange = vi.fn()
    render(<RhythmFields idPrefix="r0" value={base} onChange={onChange} showPlace disabled={false} />)
    fireEvent.change(screen.getByLabelText("Time"), { target: { value: "" } })
    expect(onChange).toHaveBeenCalledWith({ ...base, timeLocal: null })
  })
  it("caps the place at VENUE_NAME_MAX and hides it on step 2", () => {
    const { rerender } = render(<RhythmFields idPrefix="r0" value={base} onChange={() => {}} showPlace disabled={false} />)
    expect(screen.getByLabelText("Place").getAttribute("maxLength")).toBe("80")
    rerender(<RhythmFields idPrefix="r0" value={base} onChange={() => {}} showPlace={false} disabled={false} />)
    expect(screen.queryByLabelText("Place")).toBeNull()
  })
  it("the day chips are type=button so they never submit a surrounding form", () => {
    render(<RhythmFields idPrefix="r0" value={base} onChange={() => {}} showPlace disabled={false} />)
    expect(screen.getByRole("button", { name: /Sun/ }).getAttribute("type")).toBe("button")
  })
})
```

- [ ] **Step 2: Run it and see it fail** (module not found).

- [ ] **Step 3: Implement.** Layout, all margins from the approved mock:

```tsx
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
      <div style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
        <div style={shrinkColumn}>
          <label htmlFor={`${idPrefix}-time`} style={labelStyle}>Time</label>
          <input id={`${idPrefix}-time`} type="time" value={value.timeLocal ?? ""} disabled={disabled}
            onChange={(e) => onChange({ ...value, timeLocal: e.target.value === "" ? null : e.target.value })}
            className="edit-picker" style={{ ...fieldStyle, ...pickerStyle }} />
        </div>
        <div style={shrinkColumn} />
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
```
`src/lib/groups/rhythm-edit.ts` holds only the `RhythmEdit` interface with a one-line comment.

- [ ] **Step 4: Run** the test file: all pass. Also add `RhythmFields` to `src/app/__tests__/token-contrast.test.ts` (or wherever that guard lists components) after confirming it renders on `--surface-raised` (the info card) and inside `PlaybackCard` (also `--surface-raised`). This is a Jacob-built guard change: name it in the task report.

- [ ] **Step 5: Commit** `git commit -m "Add RhythmFields, one activity's editable fields for both editing surfaces"`

---

### Task 3: validate and diff an edit (pure)

**Files:**
- Create: `src/lib/groups/details-edit.ts`
- Test: `src/lib/groups/__tests__/details-edit.test.ts`

**Interfaces:**
- Consumes: `StoredRhythm`, `parseRhythm`, `cleanShortText`, `cleanVenueName`, `titleCaseActivity`, `TIME_LOCAL_RE` from `@/lib/orbit/rhythm`; `EDIT_TITLE_MAX`; `RhythmEdit`.
- Produces:
```ts
export const GROUP_NAME_MAX = 50  // matches normalize.ts's NAME_MAX for model-suggested names
export const DETAILS_UNSCHEDULABLE = "I need at least one day and a time to keep your schedule going."
export const DETAILS_NO_NAME = "Your group needs a name."
export const DETAILS_NO_ACTIVITY = "Each activity needs a name."
export const DETAILS_GENERIC = "Couldn't save that, try again."
export function detailsNoSpot(activity: string): string  // `Add where you meet for ${activity}.`
export function toRhythmEdit(r: StoredRhythm): RhythmEdit
export type DetailsValidation =
  | { ok: true; name: string; rhythms: StoredRhythm[] }
  | { ok: false; error: string }
export function validateDetailsEdit(stored: StoredRhythm[], input: { name: string; rhythms: RhythmEdit[] }): DetailsValidation
export interface RhythmDiff {
  index: number
  activity: { from: string; to: string } | null
  schedule: boolean            // days or time differ
  spot: { from: string | null; to: string | null } | null
}
export interface DetailsDiff { nameChanged: boolean; rhythms: RhythmDiff[] } // only changed rhythms listed
export function diffDetails(before: StoredRhythm[], after: StoredRhythm[], beforeName: string, afterName: string): DetailsDiff
export function firstRhythmChanged(diff: DetailsDiff): RhythmDiff | null  // the index-0 entry or null
```

Rules for `validateDetailsEdit`, each one a test:
1. `input.rhythms.length !== stored.length` → `DETAILS_GENERIC` (adding and removing activities is a non-goal).
2. Name: `cleanShortText(name, GROUP_NAME_MAX)`; null → `DETAILS_NO_NAME`.
3. Per rhythm: activity `cleanShortText(activity, EDIT_TITLE_MAX)`, null → `DETAILS_NO_ACTIVITY`. Days: keep integers 0-6, dedupe, sort; empty → null. Time: `TIME_LOCAL_RE` or null. Venue: `cleanVenueName`. **`cadence` and `durationMinutes` are copied from `stored[i]`, never from input.** `title = titleCaseActivity(activity)`.
4. Index 0: `parseRhythm([r0])` must be non-null, else `DETAILS_UNSCHEDULABLE`; its `venueName` must be non-null, else `detailsNoSpot(r0.activity)` (front section decision 4).

- [ ] **Step 1: Write the failing tests** (fixture: `const STORED: StoredRhythm[] = [{ activity: "tennis", title: "Tennis", cadence: "weekly", daysOfWeek: [6], timeLocal: "09:00", venueName: "Court 3" }, { activity: "beers", title: "Beers", cadence: "monthly", daysOfWeek: [5], timeLocal: "19:00", venueName: null }]`, and `const edit = (patch = {}) => ({ name: "Saturday Tennis", rhythms: STORED.map(toRhythmEdit), ...patch })`):

```ts
it("accepts an unchanged edit and returns stored-shaped rhythms", () => {
  const r = validateDetailsEdit(STORED, edit())
  expect(r).toEqual({ ok: true, name: "Saturday Tennis", rhythms: STORED })
})
it("refuses zero days on the first activity", () => {
  const rh = STORED.map(toRhythmEdit); rh[0] = { ...rh[0], daysOfWeek: null }
  expect(validateDetailsEdit(STORED, edit({ rhythms: rh }))).toEqual({ ok: false, error: DETAILS_UNSCHEDULABLE })
})
it("refuses a missing or malformed time on the first activity", () => {
  for (const t of [null, "25:00", "9am"]) {
    const rh = STORED.map(toRhythmEdit); rh[0] = { ...rh[0], timeLocal: t }
    expect(validateDetailsEdit(STORED, edit({ rhythms: rh })).ok).toBe(false)
  }
})
it("refuses clearing the first activity's spot", () => {
  const rh = STORED.map(toRhythmEdit); rh[0] = { ...rh[0], venueName: "  " }
  expect(validateDetailsEdit(STORED, edit({ rhythms: rh }))).toEqual({ ok: false, error: "Add where you meet for tennis." })
})
it("accepts clearing a later activity's spot", () => {
  const rh = STORED.map(toRhythmEdit); rh[1] = { ...rh[1], venueName: "Rusty Anchor" }
  const r = validateDetailsEdit(STORED, edit({ rhythms: rh }))
  expect(r.ok && r.rhythms[1].venueName).toBe("Rusty Anchor")
})
it("keeps a monthly rhythm monthly whatever is edited", () => {
  const rh = STORED.map(toRhythmEdit); rh[1] = { ...rh[1], daysOfWeek: [3], timeLocal: "18:00" }
  const r = validateDetailsEdit(STORED, edit({ rhythms: rh }))
  expect(r.ok && r.rhythms[1].cadence).toBe("monthly")
})
it("derives the title from a renamed activity", () => {
  const rh = STORED.map(toRhythmEdit); rh[0] = { ...rh[0], activity: "padel" }
  const r = validateDetailsEdit(STORED, edit({ rhythms: rh }))
  expect(r.ok && r.rhythms[0].title).toBe("Padel")
})
it("dedupes and sorts days, dropping out-of-range values", () => {
  const rh = STORED.map(toRhythmEdit); rh[0] = { ...rh[0], daysOfWeek: [6, 1, 1, 9] }
  const r = validateDetailsEdit(STORED, edit({ rhythms: rh }))
  expect(r.ok && r.rhythms[0].daysOfWeek).toEqual([1, 6])
})
it("refuses a blank group name and a blank activity", () => {
  expect(validateDetailsEdit(STORED, edit({ name: "  " }))).toEqual({ ok: false, error: DETAILS_NO_NAME })
  const rh = STORED.map(toRhythmEdit); rh[1] = { ...rh[1], activity: " " }
  expect(validateDetailsEdit(STORED, edit({ rhythms: rh }))).toEqual({ ok: false, error: DETAILS_NO_ACTIVITY })
})
it("refuses adding or removing an activity", () => {
  expect(validateDetailsEdit(STORED, edit({ rhythms: [toRhythmEdit(STORED[0])] }))).toEqual({ ok: false, error: DETAILS_GENERIC })
})
describe("diffDetails", () => {
  it("reports nothing when nothing changed", () => {
    expect(diffDetails(STORED, STORED, "A", "A")).toEqual({ nameChanged: false, rhythms: [] })
  })
  it("reports each field independently", () => {
    const after = [{ ...STORED[0], activity: "padel", title: "Padel", timeLocal: "08:00", venueName: "Court 5" }, STORED[1]]
    expect(diffDetails(STORED, after, "A", "B")).toEqual({
      nameChanged: true,
      rhythms: [{ index: 0, activity: { from: "tennis", to: "padel" }, schedule: true, spot: { from: "Court 3", to: "Court 5" } }],
    })
  })
  it("treats reordered identical days as unchanged", () => {
    const before = [{ ...STORED[0], daysOfWeek: [1, 6] }]
    const after = [{ ...STORED[0], daysOfWeek: [6, 1] }]
    expect(diffDetails(before, after, "A", "A").rhythms).toEqual([])
  })
})
```

- [ ] **Step 2: Run and see them fail.** **Step 3: implement** to the rules above. **Step 4: run, all pass.** **Step 5: commit** `"Validate and diff a group-details edit"`.

---

### Task 4: Orbit's one message (pure)

**Files:**
- Create: `src/lib/orbit/details-copy.ts`
- Test: `src/lib/orbit/__tests__/details-copy.test.ts`

**Interfaces:**
- Consumes: `DetailsDiff`, `StoredRhythm`; `formatRhythmRow` (`@/lib/orbit/playback`); `whenPhrase` (`@/lib/orbit/change-copy`); `formatWeekdayShort`, `formatTime`, `formatMonthDay` (`@/lib/events/format`).
- Produces:
```ts
export type PlanOutcome =
  | { kind: "none" }                                              // no plan, or the first activity did not change
  | { kind: "left"; startsAt: Date }
  | { kind: "updated"; startsAt: Date }                           // spot/name applied, no time change
  | { kind: "vote"; startsAt: Date; proposedStartsAt: Date; detailsUpdated: boolean }
export function buildDetailsAnnouncement(input: {
  founderName: string
  after: StoredRhythm[]           // validated, post-edit
  before: StoredRhythm[]
  diff: DetailsDiff
  memberCount: number
  plan: PlanOutcome
  timeZone: string
  now: Date
}): string | null
export function buildPlanQuestion(startsAt: Date, timeZone: string): string
// `Your next plan is ${formatWeekdayShort}, ${formatMonthDay}. Update that one too, or leave it?`
```

Composition rules (front section decision 6), each one a test:
- `memberCount <= 1` → `null` (founder alone: silence).
- `diff.rhythms.length === 0` → `null` (rename only, or nothing).
- One clause per change, rhythms in order, within a rhythm in the order rename, schedule, spot. Clause shapes, with `A` the activity's name AFTER any rename in that save:
  - rename: `renamed ${from} to ${to}`
  - schedule: `changed ${A} to ${sched}` where `sched = formatRhythmRow(afterRhythm).value`, its first letter lower-cased unless it begins with a three-letter weekday (`/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\b/`)
  - spot set: `changed the spot for ${A} to ${to}`; spot cleared: `removed the spot for ${A}`
- Join: one clause as is; two with `, and `; three or more with `, ` and a final `, and `. Sentence: `${founderName} ${joined}.`
- Plan sentence, appended with a space, `w = whenPhrase(startsAt, timeZone, now)`:
  - `left`: `The plan ${w} stays as it was.`
  - `updated`: `The plan ${w} is updated too.`
  - `vote`, `detailsUpdated`: `The plan ${w} is updated too. Move it to ${day} ${time} as well?`
  - `vote`, not: `Move the plan ${w} to ${day} ${time} too?`
  with `day = formatWeekdayShort(proposedStartsAt, tz)`, `time = formatTime(proposedStartsAt, tz)`.

- [ ] **Step 1: Write the failing tests.** Fixtures: `TZ = "America/Chicago"`, `NOW = new Date("2099-06-10T12:00:00Z")` (a Wednesday), `SAT = new Date("2099-06-13T14:00:00Z")` (Sat 9am Chicago), `SUN8 = new Date("2099-06-14T13:00:00Z")` (Sun 8am Chicago), `BEFORE = [{ activity: "tennis", title: "Tennis", cadence: "weekly", daysOfWeek: [6], timeLocal: "09:00", venueName: "Court 3" }]`. Build `after`/`diff` with Task 3's `diffDetails`. Expected strings (exact):

| after (rhythm 0) | plan | expected |
|---|---|---|
| days `[0]`, time `08:00` | `left` SAT | `Casey changed tennis to Sun at 8am, every week. The plan this Sat stays as it was.` |
| venue `Court 5` | `updated` SAT | `Casey changed the spot for tennis to Court 5. The plan this Sat is updated too.` |
| days `[0]`, time `08:00`, venue `Court 5` | `vote` SAT→SUN8, detailsUpdated | `Casey changed tennis to Sun at 8am, every week, and changed the spot for tennis to Court 5. The plan this Sat is updated too. Move it to Sun 8am as well?` |
| days `[0]`, time `08:00` | `vote` SAT→SUN8, not | `Casey changed tennis to Sun at 8am, every week. Move the plan this Sat to Sun 8am too?` |
| activity `padel`, days `[0]`, time `08:00`, venue `Court 5` | `none` | `Casey renamed tennis to padel, changed padel to Sun at 8am, every week, and changed the spot for padel to Court 5.` |
| days `[0,1,2,3,4,5,6]` | `none` | `Casey changed tennis to every day at 9am.` |

Plus: `memberCount: 1` → `null` for the first row's inputs; a diff with only `nameChanged: true` → `null`; every non-null output contains no `—` or `–`; `buildPlanQuestion(SAT, TZ)` → `Your next plan is Sat, Jun 13. Update that one too, or leave it?`

Before trusting a row: check `formatRhythmRow`'s real output for that rhythm in the test (`expect(formatRhythmRow(after[0]).value).toBe("Sun at 8am, every week")`) so a formatter wording drift fails loudly in this file rather than as a baffling string mismatch.

- [ ] **Steps 2-5:** see it fail, implement, pass, commit `"Compose Orbit's one message for a group-details edit"`.

---

### Task 5: a vote that clears its bar the moment it opens moves the plan

**Files:**
- Modify: `src/lib/events/submit-edit.ts`
- Test: `src/lib/events/__tests__/submit-edit.test.ts` (add a case)

**Interfaces:**
- Produces: no new names. After `createGroupProposal` returns `created`, `submitEventEdit` calls `promoteProposalMove` once, best-effort. The asker's yes, seeded by `createGroupProposal`, still becomes an IN RSVP when the plan moves, exactly as today (the owner chose this for the founder too, 24 Sept 2026, so nothing about seeding changes).

- [ ] **Step 1: Write the failing test.** In a group whose only member is the actor (delete `otherUserId`'s membership in the test's own setup), `submitEventEdit` with a new time returns `{ status: "ok", proposed: true }` AND the event's `startsAt` is now the new time AND the actor holds an IN RSVP on it. Today the plan stays put: a vote in a group of one clears its bar ("the whole group when smaller than three") the instant it opens, but promotion only ever runs on a chip tap, so nothing moves it.
- [ ] **Step 2: Run it and see it fail** on the `startsAt` assertion.
- [ ] **Step 3: Implement**, after the `createGroupProposal` call:
```ts
  if (proposalResult.status === "created") {
    // A vote can clear its bar the moment it opens (a group of one: the
    // bar is the whole group). Without this nothing ever moves it, because
    // promotion only runs on a chip tap (group-details slice, 24 Sept 2026).
    try {
      await promoteProposalMove(proposalResult.proposal.id, now)
    } catch (err) {
      console.error("[submit-edit] promote-at-birth failed", err)
    }
  }
```
- [ ] **Step 4: Run** `src/lib/events` and `src/lib/proposals`: pass. A two-member group's edit must still leave the plan unmoved (the existing tests cover it; confirm one does, and add one if not).
- [ ] **Step 5: Commit** `"Move a plan whose vote clears its bar as it opens"`.

---

### Task 6: two seams the founder path needs from the event card's code

**Files:**
- Modify: `src/lib/events/move.ts`, `src/lib/events/edit-details.ts`
- Test: `src/lib/events/__tests__/move.test.ts` (or wherever `moveEventCoreInTx` is tested: find it), `src/lib/events/__tests__/edit-details.test.ts`

**Interfaces:**
- Produces:
  - `MoveCoreInput.announcementBody: string | null`; `null` writes no message. `MoveEventInput` (the public `moveEventTime`) keeps `string`.
  - `export async function applyDetailChangeInTx(tx: Prisma.TransactionClient, input: { eventId: string; title: string; place: string; now: Date }): Promise<{ status: "applied"; change: DetailChange; currentTitle: string; groupId: string } | { status: "skipped"; reason: "no_event" | "cancelled" | "already_started" | "noop" | "stale" | "invalid_title" | "invalid_place" }>`: everything `editEventDetails` does today from its input validation through the venue write, **without** the message.
  - `editEventDetails` keeps its exact signature and behaviour: it opens the transaction, calls `applyDetailChangeInTx`, and writes `announce(change, currentTitle)` as before.

- [ ] **Step 1: Write the failing tests.** `moveEventCoreInTx` with `announcementBody: null` moves the event and adds zero Message rows for the group (count before and after). `applyDetailChangeInTx` inside `prisma.$transaction` with a new place returns `applied`, updates the Venue row, and adds zero Message rows.
- [ ] **Step 2: See them fail** (type error on `null` is a valid failure; show it).
- [ ] **Step 3: Implement.** In `move.ts`, wrap the `tx.message.create` in `if (announcementBody !== null)`. In `edit-details.ts`, move the body into `applyDetailChangeInTx` (validation moves inside too; it is pure and cheap). The existing `edit-details` and `submit-edit` tests must pass untouched: that is the proof the lift changed nothing.
- [ ] **Step 4: Run** `src/lib/events` whole: pass. **Step 5: Commit** `"Let a plan move stay silent, and lift the detail write out of editEventDetails"`.

---

### Task 7: the founder-gated save

**Files:**
- Create: `src/lib/groups/update-details.ts`, `src/app/actions/update-group-details.ts`
- Test: `src/lib/groups/__tests__/update-details.test.ts`, `src/app/actions/__tests__/update-group-details.test.ts`

**Interfaces:**
- Consumes: Tasks 3-6.
- Produces:
```ts
// src/lib/groups/update-details.ts
export type Db = Prisma.TransactionClient | typeof prisma
/** The next plan the hourly job made from the rhythm: not floated, not called
 *  off, not started. Floated plans (gaugeId set) are never "this week's plan". */
export async function findNextRhythmPlan(db: Db, groupId: string, now: Date): Promise<Event | null>
// findFirst({ where: { groupId, gaugeId: null, status: EventStatus.SCHEDULED, startsAt: { gt: now } }, orderBy: { startsAt: "asc" } })

export const DETAILS_STALE = "Someone just changed the next plan. Take another look."
export interface UpdateGroupDetailsInput {
  supabaseAuthId: string
  groupId: string
  name: string
  rhythms: RhythmEdit[]
  planChoice: "update" | "leave" | null
  openedPlan: { eventId: string; startsAt: string } | null   // what the form's question was about, ISO
  now: Date
}
export type UpdateGroupDetailsResult = { status: "ok" } | { status: "error"; message: string }
export async function updateGroupDetails(input: UpdateGroupDetailsInput): Promise<UpdateGroupDetailsResult>
// throws Error("NO_USER" | "GROUP_NOT_FOUND" | "NOT_FOUNDER"), the reset-invite.ts pattern

// src/app/actions/update-group-details.ts
export interface UpdateGroupDetailsState { errors?: { general?: string } }
export async function updateGroupDetailsAction(_prev: UpdateGroupDetailsState, formData: FormData): Promise<UpdateGroupDetailsState>
// formData: groupId, payload (JSON { name, rhythms }), planChoice ("update" | "leave" | ""), planEventId, planStartsAt
```

**Algorithm (the order matters; each numbered line maps to at least one test):**
1. In one `prisma.$transaction`: load caller by `supabaseAuthId` (`NO_USER`), group (`GROUP_NOT_FOUND`), `group.founderId !== caller.id` → throw `NOT_FOUNDER` (copy `src/lib/groups/reset-invite.ts:22-26` exactly: the lib re-checks, never trusting the action).
2. `stored = parseStoredRhythms(group.recurringActivities)`; null → `{ status: "error", message: DETAILS_GENERIC }`. `validateDetailsEdit(stored, input)`; not ok → its error. `diff = diffDetails(stored, v.rhythms, group.name, v.name)`. Nothing changed → `{ status: "ok" }`, no writes.
3. `first = firstRhythmChanged(diff)`; `plan = first ? await findNextRhythmPlan(tx, groupId, now) : null`.
4. If `plan`: the question must have been about this exact plan. `input.planChoice === null` or `openedPlan?.eventId !== plan.id` or `openedPlan.startsAt !== plan.startsAt.toISOString()` → `{ status: "error", message: DETAILS_STALE }` with **no writes** (the transaction returns before step 6).
5. `memberCount = await tx.membership.count({ where: { groupId } })`.
6. Write `group.name` and `recurringActivities` (the validated `StoredRhythm[]`, never the raw payload).
7. If `plan` and `planChoice === "update"`:
   - If `first.activity || first.spot`: `applyDetailChangeInTx(tx, { eventId: plan.id, title: v.rhythms[0].title, place: v.rhythms[0].venueName ?? "", now })`. `stale` → return `DETAILS_STALE` and let the transaction roll back (throw a local error class and map it). `noop` is fine.
   - If `first.schedule`: `proposed = computeNextOccurrence(parseRhythm(v.rhythms)!, group.timeZone, now)`. Equal to `plan.startsAt` → no move. Otherwise, **founder alone (`memberCount === 1`)**: `moveEventCoreInTx(tx, { eventId: plan.id, expectedStartsAt: plan.startsAt, newStartsAt: proposed, seedInUserIds: [caller.id], announcementBody: null })`; not `moved` → roll back with `DETAILS_STALE`. **Others present:** remember `{ proposed }` for step 9.
8. `outcome: PlanOutcome` = `none` (no plan) | `left` | `updated` | `vote`. `body = buildDetailsAnnouncement({ founderName: caller.name, before: stored, after: v.rhythms, diff, memberCount, plan: outcome, timeZone: group.timeZone, now })`. If the outcome is not `vote` and `body` is non-null: `tx.message.create({ data: { groupId, authorType: MessageAuthor.ORBIT, authorId: null, body } })`.
9. After the transaction, only for `vote`: `createGroupProposal({ groupId, eventId: plan.id, askerUserId: caller.id, sourceMessageId: null, proposedStartsAt: proposed, priorStartsAt: plan.startsAt, body })`. That call writes the ONE message, carrying the chips. If it returns `skipped`, write the `left`-shaped body instead via `createMessage` (so the group still hears about the schedule change), and return `{ status: "ok" }`. Record in a code comment that this step is outside the transaction on purpose: `createGroupProposal` owns its own transaction and row lock.

The action: copy `src/app/actions/reset-invite-link.ts`'s shape. Parse `payload` with `JSON.parse` inside try/catch (bad JSON → `DETAILS_GENERIC`); `rhythms` must be an array; the lib validates the rest. Map `NOT_FOUNDER`/`NO_USER` → `"Only the founder can change group details."`, anything else logged and → `DETAILS_GENERIC`. After the try/catch: `revalidatePath` for `/groups/${groupId}/info` and `/groups/${groupId}`, and for `/events/${planEventId}` when present.

- [ ] **Step 1: Write the failing lib tests** (fixture from `submit-edit.test.ts`: founder Casey + member Riley, rhythm tennis Sat 09:00 Court 3, event at START with a `scheduledKey`, Casey and Riley IN). One test each:
  1. a non-founder (Riley's auth id) → throws `NOT_FOUNDER`, nothing written;
  2. a founder of another group → throws `NOT_FOUNDER`;
  3. an invalid edit (no days) → `DETAILS_UNSCHEDULABLE`, column unchanged;
  4. the column holds the validated shape (whitespace trimmed, title derived, cadence from storage) and not the raw payload;
  5. rename only → name written, **zero** new messages;
  6. founder alone (delete Riley's membership in setup), spot change, `leave` → rhythm updated, event venue untouched, zero messages;
  7. others present, spot change, `update` → event's Venue now `Court 5`, both RSVPs still IN, exactly one ORBIT message, null author, body starting `Casey changed the spot for tennis to Court 5.`;
  8. others present, time change to 08:00 Sun, `update` → event `startsAt` unchanged, one open GROUP proposal with Casey's YES, exactly one ORBIT message and it is the proposal's `orbitMessageId`;
  9. founder alone, time change, `update` → event moved to the Sunday occurrence, RSVPs reset with Casey the only IN (the consistent-asker rule), **zero** messages, no proposal;
  10. `leave` with a schedule change → event untouched, one message ending `stays as it was.`;
  11. stale: `openedPlan.startsAt` differs from the stored plan → `DETAILS_STALE`, nothing written (name and column unchanged);
  12. `planChoice: null` while a plan exists and the first activity changed → `DETAILS_STALE`;
  13. a plan that has already started is not "the next plan": event with `startsAt` before `now` → treated as no plan, choice ignored, save succeeds;
  14. a called-off plan (status CANCELLED) is not the next plan either;
  15. every test asserts the ORBIT message count explicitly (0 or 1), because "exactly one message" is the front section's promise.
- [ ] **Step 2: Write the failing action tests** by copying `src/app/actions/__tests__/edit-event.test.ts`'s `vi.hoisted` mock shape: signed out → the sign-in error; `NOT_FOUNDER` thrown → the founder-only error; bad JSON → generic error; success → `revalidatePath` called for info and home.
- [ ] **Step 3: See all fail. Step 4: implement. Step 5: run** both files plus `src/lib/groups` and `src/lib/proposals`: pass. **Step 6: commit** `"Save a founder's group-details edit, bringing this week's plan along on request"`.

---

### Task 8: the founder's in-place editor on group info

**Files:**
- Create: `src/app/groups/[id]/info/info-card.ts`, `src/app/groups/[id]/info/EditGroupDetails.tsx`
- Modify: `src/app/groups/[id]/info/page.tsx`
- Test: `src/app/groups/[id]/info/__tests__/EditGroupDetails.test.tsx`, and extend `src/app/groups/[id]/info/__tests__/page-copy.test.tsx` if it asserts founder-only copy

**Interfaces:**
- Consumes: Tasks 1-4, 7.
- Produces:
```ts
// info-card.ts: the card shell currently inline at page.tsx (the WHO card): value-for-value
export const infoCardStyle: React.CSSProperties  // marginTop 16px, --surface-raised, 1.7px hairline, 14px radius, the standard shadow, padding "13px 17px 5px"
// EditGroupDetails.tsx
export default function EditGroupDetails(props: {
  groupId: string
  groupName: string
  rhythms: StoredRhythm[]
  nextPlan: { eventId: string; startsAt: string; question: string } | null  // question = buildPlanQuestion(...)
  children: React.ReactNode   // the card's rows at rest (WHO + activities), server-rendered
}): JSX.Element
```

Behaviour, each a test:
- At rest: renders `children` inside a `<div style={infoCardStyle}>`, then the `Edit group details` link (12px above, ResetInviteLink style).
- Tapping the link: the card becomes the form (card `padding: 0`, `overflow: hidden`; body `padding: 15px 16px`; `Group name` field with `maxLength={GROUP_NAME_MAX}`, then one `RhythmFields` per rhythm with `showPlace`, separated by `borderTop: 1.4px solid var(--hairline)` and 10px padding when there is more than one); the band shows `Never mind | Save`; the link is gone; focus goes to a visually hidden heading `Editing group details` (EditEventDetails' iOS-keyboard reason); the card calls `scrollIntoView({ block: "end" })`.
- `Never mind` returns to rest and discards typing (the next open is re-seeded from props).
- `Save` runs `validateDetailsEdit(props.rhythms, state)` first; a refusal shows its message with `ErrorLine` above the band and calls no action.
- `Save` with a changed first activity and a `nextPlan`: no action call yet; the band shows `nextPlan.question` (centered, meta, `var(--text-secondary)`, `marginBottom 0.625rem`) over `Leave it | Update it too` (`pairRow`, two `pairPill`s with `color: var(--text-primary)`). Either one submits with its choice.
- `Save` otherwise: submits with `planChoice: ""`.
- Submit sends `groupId`, `payload` (`JSON.stringify({ name, rhythms })`), `planChoice`, `planEventId`, `planStartsAt`; on `{}` returns to rest; on an error returns to the form (not the question) with the message shown.
- Everything is disabled while pending, opacity 0.65, the EditEventDetails convention.

`page.tsx`: for the founder only, wrap the existing WHO/activity rows in `<EditGroupDetails ...>` instead of the inline card; everyone else renders the same rows inside `<div style={infoCardStyle}>`. Compute `nextPlan` on the page with `findNextRhythmPlan(prisma, group.id, new Date())` for the founder only, and `question = buildPlanQuestion(plan.startsAt, group.timeZone)`.

- [ ] **Steps:** write the component tests (mock `@/app/actions/update-group-details` exactly as EditEventDetails' test mocks its action), see them fail, implement, pass. Then run `src/app/groups` whole. Commit `"Give the founder an in-place group-details editor on group info"`.

---

### Task 9: change day or time on onboarding step 2

**Files:**
- Modify: `src/app/create/Step2Playback.tsx`, `src/app/create/OnboardingWizard.tsx`
- Test: `src/app/create/__tests__/Step2Playback.test.tsx` (extend), `src/app/create/__tests__/OnboardingWizard.test.tsx` (extend if present; otherwise assert through Step2Playback's props)

**Interfaces:**
- Consumes: `RhythmFields`, `validateDetailsEdit`, `toRhythmEdit`, `titleCaseActivity`.
- Produces: `Step2Playback` prop `onRhythmChange: (index: number, next: RhythmEdit) => void`. `OnboardingWizard` implements it:
```ts
function handleRhythmChange(index: number, next: RhythmEdit) {
  setRhythms((prev) =>
    prev
      ? prev.map((r, i) =>
          i === index
            ? { ...r, activity: next.activity, title: titleCaseActivity(next.activity.trim() || r.activity),
                daysOfWeek: next.daysOfWeek, timeLocal: next.timeLocal }
            : r)
      : prev
  )
}
```
(venue keeps flowing through the existing `onVenueNameChange`; cadence is never touched.)

Behaviour, each a test:
- Each rhythm row shows a `Change day or time` link under its spot control (Edit-my-description style, left-aligned, 8px above).
- Tapping it replaces the link with a block (`borderTop: 1.4px solid var(--hairline)`, `paddingTop: 10px`, `marginTop: 10px`) holding `RhythmFields` with `showPlace={false}`, seeded from that rhythm.
- The row's summary line updates live (it already reads `formatRhythmRow(r)` from props).
- `canConfirm` additionally requires `validateDetailsEdit(rhythms, { name: groupName, rhythms: rhythms.map(toRhythmEdit) }).ok`; when it is not ok and an editor is open, show its message in the card's existing error slot.
- The confirm payload carries the edited days and time (test through the wizard, or by asserting `onRhythmChange` calls and a re-render's `canConfirm`).

Commit `"Let a founder fix a misread day or time on onboarding step 2"`.

---

### Task 10: verification and the record (the coordinator's, not an implementer's)

- [ ] Full suite from the worktree: `npx vitest run`. Record passed/total against the 2040 baseline.
- [ ] Stop the dev server, then `npx next build --webpack`: exit 0. Restart the dev server after.
- [ ] **Picture check, before the QA handoff (owner's design rule 3):** rebuild the throwaway comparison page (`src/app/zz-mock/`, git-excluded) so each changed screen, now the REAL build, sits beside its production neighbour at 375px: group info at rest, editing, the plan question, step 2 open. Screenshot each, compare against the approved mocks above, and fix any difference before handing over. Delete `src/app/zz-mock/` afterwards.
- [ ] Real-phone pass on the LAN address (`ipconfig getifaddr en0`, checked against `next.config.ts`'s allowed dev origins): new layouts, and the editor changes vertical space. The owner tests with Chrome on iOS (WebKit): check the time picker width and that opening the form raises no keyboard.
- [ ] `docs/build-notes.md`: the §11 entry opened on 24 Sept, 400 to 600 words, product language; no migration, so no after-launch item; confirm that by reading the final diff's `prisma/` changes (there must be none).
- [ ] `CLAUDE.md` current state: what is now true; strike the "Still missing, and known" founder-fix sentence and the rhythm-venue parenthetical; the venue-required rule now permanent; the debt from the front section; the out-of-lane solo-vote fix named.
- [ ] Independent read-only review of the assembled diff, then the PR (body near 300 words, review report included, `pr-review-guard` requires it), then the QA script in chat per `~/.claude/checklists/pr-handoff.md`.

### Self-review (done while writing)

- Front section coverage: decisions 1 → T8; 2 → T9; 3 → T3/T2; 4 → T3 rule 4; 5 → T5 (solo fix), T7 steps 7 and 9 (founder marked in like any asker); 6 → T4/T7 step 8; 7 → global constraints; 8 → T2. The solo dead-end fix → T5. Verification list → T3, T4, T5, T7 tests. Debt → T10 record.
- Deviation from the front section, declared: for a founder ALONE, a day or time change moves the plan directly (T7 step 7) instead of opening a vote that would clear the instant it opened. The outcome is identical and it is what keeps the founder-alone case silent, since a vote always posts its question.
- Names cross-checked: `RhythmEdit`, `validateDetailsEdit`, `diffDetails`, `firstRhythmChanged`, `buildDetailsAnnouncement`, `buildPlanQuestion`, `PlanOutcome`, `findNextRhythmPlan`, `updateGroupDetails`, `applyDetailChangeInTx`.
