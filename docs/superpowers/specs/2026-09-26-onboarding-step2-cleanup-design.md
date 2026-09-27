# Onboarding step 2 cleanup

Designed 26 Sept 2026 on branch `onboarding-step2-cleanup`, from the owner's
25 Sept phone QA of group details editing (build-notes §11, that entry's
postscript).

---

## Front section

**Settled with the owner, 26 Sept 2026. Do not relitigate.**

1. **The main weekly activity (position 0) must have a spot; every other
   activity stays optional.** Orbit asks for it in the conversation.
2. **Orbit asks for everything missing in one message**, e.g. "What time do
   you meet, and where?". The card marks the gap in lime ("where?",
   "what time and where?").
3. **"idk" or "we'll figure it out" is no spot**; Orbit asks again.
4. **Up to three answers, then back to step 1**, with a message naming what
   is actually missing (today's always says "day and time").
5. **Step 2 is read-only playback.** No name box, no spot boxes, no "Change
   day or time". The spot reads " · Movement Gowanus" on its row.
6. **"Edit details" replaces "Edit my description"** on step 2; the gap-ask
   loses its link too (the back arrow does the same). It opens group info's
   editor in place, band "Never mind | Done".
7. **A non-weekly activity shows only name and spot in the editor**, on both
   surfaces. No timezone line in the editor.
8. **The server refuses a group with no main spot.**
9. **Secondary activities stay captured and shown**, trimmed as above.
   Floated ideas are unaffected.
10. **Pictures approved 26 Sept as drawn**, with 6 and 7 applied.

**Non-goals.** Dropping secondary activities, and cadence: the cadence
slice. Spot changes by chat: verbal group two.

**Verified by.** Tests: gap kinds (spot alone, with time, never for a
secondary), fallback questions, the three-answer cap and its message, spot
carry-over, the server refusal, step 2's read-only card and editor
open/close, non-weekly fields. Model behaviour: new onboarding bench cases
shown red before the prompt change and green after, numbers and cost per
run recorded. Rendering: 375px pass, then a real-phone pass.

**Debt expected.** A group with no fixed place cannot be created without
typing one. Omitting a place costs one more model call (about half a
cent). Existing spotless groups stay spotless. The beers row still promises
a day nobody picks.

---

## Tasks

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this task by task. Steps use checkbox (`- [ ]`) syntax for tracking. Read the front section above first: it is the contract, and anything here that contradicts it is a bug in this half. Tasks marked **(coordinator)** are never handed to an implementer.

**Goal:** the main weekly activity cannot reach step 2 without a spot, because Orbit asks for it in the same conversation that asks for a missing day or time (one question, up to three answers); step 2 becomes a read-only playback whose only way to change anything is "Edit details", which opens group info's editor in place; and the server refuses a group whose main activity has no spot.

**Architecture:** the gap vocabulary grows six kinds (`spot`, and `time_spot`, `day_spot`, `both_spot`, `cadence_spot`, `ambiguous_time_spot`), declared once in `src/lib/orbit/normalize.ts` and given copy in the existing per-kind tables (`gap.ts`, `playback.ts`, `merge.ts`). `normalizeExtraction` adds one completeness requirement for position 0 only, after primary selection, so it never changes which rhythm is promoted and never changes `isSchedulable`. The two prompts learn the spot (after the bench shows them red). On the UI side, the group-info form body is lifted into one shared component (`GroupDetailsFields`) so step 2's editor and group info's editor are the same fields, and `RhythmFields` learns to show only Activity and Place for a non-weekly activity.

**Why flat kinds rather than a `{ schedule, spot }` pair (declared choice):** every place that says something per gap is already a total `Record<GapAskable, string>`, so a flat kind makes TypeScript refuse to compile until every table has a string for every new kind (the `auth/email.ts` guarantee CLAUDE.md asks us to copy), each Orbit string stays a literal the owner can read and review in one place, and the payload that round-trips through the client keeps its shape, so the server plumbing changes by one whitelist line. The cost is six more entries per table, which is the reviewable form of the same information.

**Tech stack:** Next.js 16 (App Router, server actions), Prisma 7 against the dev-test Supabase database (only `create-group` touches it, and its test mocks it), Vitest (jsdom for components), React 19, the onboarding eval bench (`npm run eval:onboarding`, tsx, outside Vitest).

**Spec:** the front section of this same document. Mocks: approved 26 Sept 2026, described in words in "The approved picture" below (the mock files are throwaways and are deleted in Task 11).

### Global constraints

- Run `npm run db:which` before any database-backed test run; it must print the dev-test ref. Never point anything at production.
- Every Orbit string: no em dashes or en dashes, plain words at a 7th to 8th grade level, three-letter weekdays, soft phrasing. Every new string in this slice is written out verbatim below; do not reword one without saying so in the task report.
- Teal (`var(--action)`) appears on step 2 only on the confirm band and on the editor's Done button. The gap marker stays lime (`PlaybackGapMarker`); lime never marks a button.
- Styles are copied by VALUE from the file and line named in the picture (CLAUDE.md: map tokens by value, never by name). Text inputs are 16px (`fieldStyle`'s `1rem`) so iOS never force-zooms. Never use `--text-faint` (it is guarded by `token-contrast.test.ts`).
- Write the failing test first and SHOW it failing. A test that passes on its first run needs a one-line reason it could have failed, and confirmation that nothing environmental (timezone, locale, clock) made it green.
- Tests build their own fixtures and pass from an empty database.
- Do NOT change `src/lib/orbit/spark.ts`, any detection prompt, or anything the detect bench reaches. `FIELD_RULES` is not used by spark (verified: only `merge.ts` imports it), so the Task 6 prompt change cannot reach `npm run eval:detect`.
- Do NOT run `npm run eval:onboarding` or `npm run eval:detect` as an implementer. They cost money and hit the network; only the coordinator runs them, in Tasks 5 and 7.
- `isSchedulable` (normalize.ts:112) keeps its meaning and signature. `parseRhythm` and `reconcile` are untouched.
- This slice has NO migration. If a task seems to need a schema change, stop and report it.
- `src/app/zz-mock/` is git-excluded and still compiled by Next. Once Task 8 lands it no longer typechecks (it passes `showPlace`); ignore type errors inside `src/app/zz-mock/` until Task 11 deletes it, and never "fix" them.
- Route directories carry brackets (`groups/[id]`): scan them with `rg` or quoted paths, never a bare shell glob.
- Run a single test file with `npx vitest run <path>`.

### The approved picture (build to this)

All five screens sit in the `/create` page frame (`src/app/create/page.tsx`: `--surface-base` page, `2rem 1.5rem` padding, content column `maxWidth: 28rem`) under `WizardHeader`. Example data used below: founder Jacob, group "Climbing Crew", climbing Tue and Thu at 7pm at Movement Gowanus, beers once a month with no day, time or spot.

1. **Gap-ask, time and place both missing** (`WizardHeader step={2}` with back). The playback card exactly as `StepGapAsk.tsx:119-171` renders it today: name row "Climbing Crew" as read-only heading text, `Who` row "Jacob", the gapped `CLIMBING` row reading `Tue & Thu` followed by the lime marker `what time and where?`, then the `BEERS` row `Once a month, we'll pick a day later`. Below it Orbit's feed bubble (`StepGapAsk.tsx:175-188`): `Here's what I got. One question: What time do you meet, and where?`. The composer (`StepGapAsk.tsx:203-249`) unchanged. The hint line (`StepGapAsk.tsx:253-273`): `e.g. “7pm at Movement”`. **No "Edit my description" link below it** (the header back arrow does the same thing).
2. **Gap-ask, place only.** Same card, the gapped row reads `Tue & Thu at 7pm` followed by the lime marker `where?`. Bubble: `Here's what I got. One question: Where do you usually meet for climbing?`. Hint: `e.g. “Movement Gowanus” · “Sam’s place”`. No "Edit my description".
3. **Step 2, read-only playback.** The tailed bubble `Here's what I understood.` (`Step2Playback.tsx:159-163`, unchanged). The `PlaybackCard` with the confirm band as its footer, markup unchanged (`Step2Playback.tsx:169-236`). Inside: the name row as read-only text, not an input (the gap-ask's own treatment, `StepGapAsk.tsx:122-133`: `rowValueTextStyle` plus `fontSize: var(--type-heading)`, `lineHeight: var(--leading-tight)`, `fontWeight: 600`); `Who` "Jacob"; one row per activity reading `formatRhythmRow(r).value` followed by ` · ${venueName}` when there is one (the suffix at `StepGapAsk.tsx:163-166`), so `Tue & Thu at 7pm, every week · Movement Gowanus` and `Once a month, we'll pick a day later`. No spot boxes, no "(required)" button, no "Change day or time". The `Times in Eastern Time` line stays on this card (`Step2Playback.tsx:438-447`), and the create-error slot stays (`Step2Playback.tsx:449-460`, the `error` prop only). Below the card, one quiet link `Edit details`, styled exactly as today's "Edit my description" (`Step2Playback.tsx:463-481`: centered block, `1rem auto 0` margin, no background, no border, `0.25rem 0.5rem` padding, `var(--text-secondary)`, `var(--type-meta)`, `var(--leading-normal)`, underline), disabled while creating.
4. **Step 2, editor open.** The tailed bubble stays. The playback card, its confirm band and the `Edit details` link are all replaced by one card: `infoCardStyle` (`src/app/groups/[id]/info/info-card.ts:11-22`) with `marginTop: 0`, `padding: 0`, `overflow: "clip"` (the reason is at `EditGroupDetails.tsx:178-182`). Body `detailsBodyStyle` (`src/app/events/[id]/details-card.ts:28`), holding a visually hidden `Editing group details` heading, then `Group name` (label `labelStyle`, input `fieldStyle`, `maxLength={GROUP_NAME_MAX}`), then one block per activity separated by `borderTop: 1.4px solid var(--hairline)`, `paddingTop: 10px`, `marginTop: 10px` from the second on (`EditGroupDetails.tsx:189-223`). A weekly activity shows `Activity`, `Days` (seven gauge chips), `Time`, `Place`; a non-weekly activity (monthly or loose) shows only `Activity` and `Place`. **No "Times in ..." line in the editor.** An `ErrorLine` under the fields. The band: `detailsBandStyle` (`details-card.ts:33-37`) plus `position: sticky`, `bottom: 0`, `zIndex: 1`, `backgroundColor: var(--surface-raised)` (`EditGroupDetails.tsx:250-258`), holding `Never mind` (`neverMindButton`, `form-fields.ts:56-61`) and `Done` (`saveButton`, `form-fields.ts:63-68`) in a flex row with `gap: 0.625rem`.
5. **Back to step 1 after three answers still leave a gap** (`WizardHeader step={1}`, no back). Step 1 as today with the founder's description still in the box, and the tailed bubble naming what is actually missing. For a missing spot: `I still need to know where you meet. Add it to your description, like “at Movement Gowanus”, and I'll take another look.` Every other kind has its own sentence, listed in Task 1.

**Group info** (front section decision 7): the founder's editor on group info gets the same non-weekly rule, only `Activity` and `Place` for a monthly or loose activity. Nothing else on group info changes.

### File map

| File | Create/Modify | Responsibility |
|---|---|---|
| `src/lib/orbit/normalize.ts` | Modify | New kinds and helpers (T1); the position-0 spot requirement and the non-answer venue guard (T2) |
| `src/lib/orbit/gap.ts` | Modify | Kind list, fallback questions, hints, place check, cap of 3 (T1); carry-over treats a non-answer as empty (T2) |
| `src/lib/orbit/playback.ts` | Modify | Gap-row markers, Step 1 re-ask copy, exhausted copy per kind (T1) |
| `src/lib/orbit/merge.ts` | Modify | `ASKED_ABOUT` entries (T1); merge rules for a spot answer (T6) |
| `src/lib/orbit/extract.ts` | Modify | `FIELD_RULES`: venue non-answers, the clarifying question covers the spot (T6) |
| `src/app/actions/extract-group.ts` | Modify | Pass the activity to the fallback (T3) |
| `src/app/actions/merge-gap.ts` | Modify | Whitelist from the kind list, round comment, exhausted carries what is missing (T3) |
| `src/app/actions/create-group.ts` | Modify | Refuse a missing main spot (T3) |
| `evals/onboarding/cases.ts` | Modify | Existing cases restated for the new gate; new spot cases and helpers (T4) |
| `src/components/RhythmFields.tsx` | Modify | `showPlace` out, `showSchedule` in (T8) |
| `src/components/GroupDetailsFields.tsx` | Create | Group name plus every activity's fields, lifted from EditGroupDetails (T8) |
| `src/app/groups/[id]/info/EditGroupDetails.tsx` | Modify | Use `GroupDetailsFields` (T8) |
| `src/app/create/EditDetailsCard.tsx` | Create | Step 2's in-place editor, band `Never mind | Done` (T9) |
| `src/app/create/Step2Playback.tsx` | Modify | Read-only playback, `Edit details` (T9) |
| `src/app/create/PlaybackCard.tsx` | Modify | Delete the `venue` slot, whose only caller goes (T9) |
| `src/app/create/OnboardingWizard.tsx` | Modify | `onDetailsChange` (T9); exhausted copy per kind, no gap-ask edit link (T10) |
| `src/app/create/StepGapAsk.tsx` | Modify | Drop "Edit my description" (T10) |
| `docs/build-notes.md`, `CLAUDE.md` | Modify | Bench numbers (T5, T7); the record and current state (T11) |

Test files touched: `src/lib/orbit/__tests__/{normalize,gap,playback,extract}.test.ts`, `src/app/actions/__tests__/{extract-group,merge-gap}.test.ts`, `src/app/actions/__tests__/create-group.test.ts` (new), `src/components/__tests__/{RhythmFields,GroupDetailsFields}.test.tsx` (second is new), `src/app/groups/[id]/info/__tests__/EditGroupDetails.test.tsx`, `src/app/create/__tests__/Step2Playback.test.tsx` (new), `src/app/create/__tests__/{OnboardingWizard,StepGapAsk}.test.tsx`; deleted: `src/app/create/__tests__/Step2PlaybackVenue.test.tsx` and `Step2PlaybackDayTime.test.tsx` (both test controls this slice removes).

---

### Task 0: capture the approved mocks before they stop compiling (coordinator)

- [ ] Start the dev server from this worktree (the `dev-webpack` launch entry; Turbopack refuses the worktree's `node_modules` symlink), open `/zz-mock/1` through `/zz-mock/5` at 375x812, and save one screenshot each to the scratchpad as `mock-1.png` to `mock-5.png`. Note on each that screen 4 still shows the `Times in ...` line and a day-chip row for beers, both of which the owner removed (decision 7); the words above win over the screenshot. Stop the dev server.
- [ ] Why now: Task 8 removes `showPlace`, after which `MockStep2.tsx` no longer compiles, and Task 11's picture check needs these as the reference.

---

### Task 1: name every gap, including a missing spot (pure vocabulary and copy)

**Files:**
- Modify: `src/lib/orbit/normalize.ts` (types and helpers only; classification does not change in this task), `src/lib/orbit/gap.ts`, `src/lib/orbit/playback.ts`, `src/lib/orbit/merge.ts` (`ASKED_ABOUT` only)
- Test: `src/lib/orbit/__tests__/gap.test.ts`, `src/lib/orbit/__tests__/playback.test.ts`

**Interfaces:**
- Produces, in `normalize.ts`:
```ts
export type ScheduleGap = "time" | "day" | "both" | "cadence" | "ambiguous_time"
export type SpotGap = "spot" | `${ScheduleGap}_spot`
export type MissingField = ScheduleGap | SpotGap | "nothing_schedulable"
/** True for every kind that still needs the main activity's spot. */
export function needsSpot(m: MissingField): boolean
/** "time" -> "time_spot". */
export function withSpot(g: ScheduleGap): `${ScheduleGap}_spot`
/** The schedule half of a kind: "time_spot" -> "time", "spot" and "nothing_schedulable" -> null. */
export function scheduleGapOf(m: MissingField): ScheduleGap | null
```
- Produces, in `gap.ts`:
```ts
export const MAX_GAP_ROUNDS = 3
export const GAP_ASKABLE_KINDS: readonly GapAskable[]   // all eleven, in the order below
export function gapFallbackQuestion(missing: GapAskable, activity: string): string
export function resolveGapQuestion(missing: GapAskable, rawQuestion: unknown, activity: string): string  // third param is new
```
- Produces, in `playback.ts`: `EXHAUSTED_COPY: Record<MissingField, string>`; `REASK_COPY` and `formatGapRhythmRow` cover the new kinds.
- `GapAskable` stays `Exclude<MissingField, "nothing_schedulable">`, so it widens automatically, and every `Record<GapAskable, string>` must gain six entries or fail to compile. That is the point.

The copy, verbatim (every string below is Orbit's; no em or en dashes):

| kind | `GAP_REASK_COPY` (fire-exit question) | `GAP_HINT_EXAMPLES` | gap-row marker | `ASKED_ABOUT` |
|---|---|---|---|---|
| `spot` | `Where do you usually meet?` (used only when the activity-specific one below fails validation) | `e.g. “Movement Gowanus” · “Sam’s place”` | `where?` | `where they usually meet` |
| `time_spot` | `What time do you meet, and where?` | `e.g. “7pm at Movement”` | `what time and where?` | `the time, and where they usually meet` |
| `day_spot` | `What days do you meet, and where?` | `e.g. “Tuesdays at Movement”` | `what days and where?` | `the days, and where they usually meet` |
| `both_spot` | `What day and time do you meet, and where?` | `e.g. “Tuesdays at 7pm, at Movement”` | `when and where?` | `the day and time, and where they usually meet` |
| `cadence_spot` | `Is that every week, and where do you meet?` | `e.g. “yep, every week, at Movement”` | `every week, and where?` | `whether it repeats every week, and where they usually meet` |
| `ambiguous_time_spot` | `Is that morning or evening, and where do you meet?` | `e.g. “7 at night, at Movement”` | `morning or evening, and where?` | `whether the time is morning or evening, and where they usually meet` |

`REASK_COPY` (Step 1, shown when the founder backs out of the gap step) gains:
- `spot`: `Got it. Where do you usually meet? Add that to your description and I'll set up the schedule.`
- `time_spot`: `Got it. What time do you meet, and where? Add that to your description and I'll set up the schedule.`
- `day_spot`: `Got it. What days do you meet, and where? Add that and I'll set up the schedule.`
- `both_spot`: `I need a day, a time, and a place to set up your schedule. Add those to your description and try again.`
- `cadence_spot`: `Got it. Is that every week, and where do you meet? Say so in your description and I'll set up the schedule.`
- `ambiguous_time_spot`: `Got it. Is that morning or evening, and where do you meet? Add those to your description and I'll set up the schedule.`

`EXHAUSTED_COPY` (Step 1 after three answers, front section decision 4), one per `MissingField`:
- `time`: `I still need to know what time you meet. Add it to your description, like “at 7pm”, and I'll take another look.`
- `day`: `I still need to know what days you meet. Add them to your description, like “on Tuesdays”, and I'll take another look.`
- `both`: `I still need to know what day and time you meet. Add them to your description, like “Tuesdays at 7pm”, and I'll take another look.`
- `cadence`: `I still need to know if that's every week. Add it to your description, like “every Tuesday”, and I'll take another look.`
- `ambiguous_time`: `I still need to know if that's morning or evening. Add am or pm to your description, like “7pm”, and I'll take another look.`
- `spot`: `I still need to know where you meet. Add it to your description, like “at Movement Gowanus”, and I'll take another look.` (approved screen 5)
- `time_spot`: `I still need to know what time you meet, and where. Add them to your description, like “7pm at Movement Gowanus”, and I'll take another look.`
- `day_spot`: `I still need to know what days you meet, and where. Add them to your description, like “Tuesdays at Movement Gowanus”, and I'll take another look.`
- `both_spot`: `I still need to know when and where you meet. Add them to your description, like “Tuesdays at 7pm, at Movement Gowanus”, and I'll take another look.`
- `cadence_spot`: `I still need to know if that's every week, and where you meet. Add them to your description, like “every Tuesday at Movement Gowanus”, and I'll take another look.`
- `ambiguous_time_spot`: `I still need to know if that's morning or evening, and where you meet. Add them to your description, like “7pm at Movement Gowanus”, and I'll take another look.`
- `nothing_schedulable`: the same string as `REASK_COPY.nothing_schedulable` (reference it, do not copy it).

- [ ] **Step 1: Write the failing tests.** In `gap.test.ts` (keep the existing `incomplete` / `ready` helpers; update the two existing `resolveGapQuestion(kind, q)` calls to pass `"climbing"` as the third argument):

```ts
import { GAP_ASKABLE_KINDS, gapFallbackQuestion } from "../gap"
import { needsSpot, scheduleGapOf, withSpot } from "../normalize"

describe("the spot kinds (onboarding step 2 cleanup)", () => {
  it("lists every askable kind exactly once, matching every per-kind table", () => {
    const keys = Object.keys(GAP_REASK_COPY).sort()
    expect([...GAP_ASKABLE_KINDS].sort()).toEqual(keys)
    expect(Object.keys(GAP_HINT_EXAMPLES).sort()).toEqual(keys)
    expect(GAP_ASKABLE_KINDS).toHaveLength(11)
  })

  it("splits and joins kinds", () => {
    expect(needsSpot("spot")).toBe(true)
    expect(needsSpot("time_spot")).toBe(true)
    expect(needsSpot("time")).toBe(false)
    expect(needsSpot("nothing_schedulable")).toBe(false)
    expect(withSpot("ambiguous_time")).toBe("ambiguous_time_spot")
    expect(scheduleGapOf("both_spot")).toBe("both")
    expect(scheduleGapOf("spot")).toBeNull()
    expect(scheduleGapOf("nothing_schedulable")).toBeNull()
    expect(scheduleGapOf("cadence")).toBe("cadence")
  })

  it("the spot fallback names the activity", () => {
    expect(gapFallbackQuestion("spot", "climbing")).toBe("Where do you usually meet for climbing?")
  })

  it("the spot fallback degrades to the generic question when the activity would break the validator", () => {
    expect(gapFallbackQuestion("spot", "st. patrick's parade")).toBe("Where do you usually meet?")
  })

  it("combined kinds fall back to one question asking both", () => {
    expect(gapFallbackQuestion("time_spot", "climbing")).toBe("What time do you meet, and where?")
    expect(resolveGapQuestion("time_spot", null, "climbing")).toBe("What time do you meet, and where?")
  })

  it("a valid model question that forgets the place is replaced for a spot kind (decision 2: one message asks for everything)", () => {
    expect(resolveGapQuestion("time_spot", "What time do you usually climb?", "climbing")).toBe(
      "What time do you meet, and where?"
    )
    expect(resolveGapQuestion("spot", "Is that every week?", "climbing")).toBe(
      "Where do you usually meet for climbing?"
    )
  })

  it("a valid model question that names the place passes through for a spot kind", () => {
    expect(resolveGapQuestion("time_spot", "What time do you climb, and where?", "climbing")).toBe(
      "What time do you climb, and where?"
    )
  })

  it("a schedule-only kind never demands a place word", () => {
    expect(resolveGapQuestion("time", "What time do you usually climb?", "climbing")).toBe(
      "What time do you usually climb?"
    )
  })

  it("every new template passes the validator", () => {
    for (const k of GAP_ASKABLE_KINDS) expect(validateQuestion(gapFallbackQuestion(k, "climbing"))).not.toBeNull()
  })
})

describe("decideGapOutcome, the three-answer cap", () => {
  it("asks after two answers", () => {
    expect(decideGapOutcome(incomplete(), "What time do you meet?", 2).kind).toBe("ask")
  })
  it("escapes after three", () => {
    expect(MAX_GAP_ROUNDS).toBe(3)
    expect(decideGapOutcome(incomplete(), "What time do you meet?", 3)).toEqual({ kind: "escape" })
  })
  it("asks a spot gap with the activity-specific fallback when the model gave no question", () => {
    const spot = incomplete({
      missing: "spot",
      rhythms: [{ ...PARTIAL_RHYTHM, timeLocal: "19:00", venueName: null }],
    })
    expect(decideGapOutcome(spot, null, 0)).toEqual({
      kind: "ask",
      missing: "spot",
      question: "Where do you usually meet for climbing?",
    })
  })
})
```
Update the existing "escapes after two answers" test's name to "escapes once the cap is reached" (it already uses `MAX_GAP_ROUNDS`, so it keeps passing with 3).

In `playback.test.ts` (keep the file's `rhythm()` helper; import `EXHAUSTED_COPY`):

```ts
describe("formatGapRhythmRow, spot kinds", () => {
  const climb = (over: Partial<StoredRhythm> = {}) =>
    rhythm({ cadence: "weekly", daysOfWeek: [2, 4], timeLocal: "19:00", ...over })

  it("spot alone keeps the whole schedule as the known part", () => {
    expect(formatGapRhythmRow(climb(), "spot", null)).toEqual({
      label: "CLIMBING", known: "Tue & Thu at 7pm", marker: "where?",
    })
  })
  it("spot alone on every day reads every day", () => {
    expect(formatGapRhythmRow(climb({ daysOfWeek: [0, 1, 2, 3, 4, 5, 6] }), "spot", null).known).toBe("Every day at 7pm")
  })
  it("time and spot", () => {
    expect(formatGapRhythmRow(climb({ timeLocal: null }), "time_spot", null)).toEqual({
      label: "CLIMBING", known: "Tue & Thu", marker: "what time and where?",
    })
  })
  it("day and spot, both and spot, cadence and spot", () => {
    expect(formatGapRhythmRow(climb({ daysOfWeek: null }), "day_spot", null)).toMatchObject({ known: "At 7pm", marker: "what days and where?" })
    expect(formatGapRhythmRow(climb({ daysOfWeek: null, timeLocal: null }), "both_spot", null)).toMatchObject({ known: null, marker: "when and where?" })
    expect(formatGapRhythmRow(climb({ cadence: null }), "cadence_spot", null)).toMatchObject({ known: "Tue & Thu at 7pm", marker: "every week, and where?" })
  })
  it("ambiguous time and spot, and its null-candidate degrade", () => {
    expect(formatGapRhythmRow(climb({ daysOfWeek: [2], timeLocal: null }), "ambiguous_time_spot", "19:00")).toMatchObject({ known: "Tue at 7", marker: "morning or evening, and where?" })
    expect(formatGapRhythmRow(climb({ daysOfWeek: [2], timeLocal: null }), "ambiguous_time_spot", null)).toMatchObject({ known: "Tue", marker: "what time and where?" })
  })
})

describe("EXHAUSTED_COPY", () => {
  it("names the spot, not the day and time, when only the spot is missing (the bug decision 4 fixes)", () => {
    expect(EXHAUSTED_COPY.spot).toBe(
      "I still need to know where you meet. Add it to your description, like “at Movement Gowanus”, and I'll take another look."
    )
    expect(EXHAUSTED_COPY.spot).not.toMatch(/day|time/i)
  })
  it("a combined gap names both halves", () => {
    expect(EXHAUSTED_COPY.time_spot).toMatch(/what time you meet, and where/)
  })
  it("nothing schedulable reuses the Step 1 copy", () => {
    expect(EXHAUSTED_COPY.nothing_schedulable).toBe(REASK_COPY.nothing_schedulable)
  })
  it("carries no em or en dashes", () => {
    for (const s of [...Object.values(EXHAUSTED_COPY), ...Object.values(REASK_COPY)]) expect(s).not.toMatch(/[—–]/)
  })
})
```
Extend the existing "gap markers carry no em or en dashes" sample list with one call per new kind, and the existing gap.test.ts "no em or en dashes in any gap copy" already iterates `Object.values(GAP_REASK_COPY)` and `GAP_HINT_EXAMPLES`, so it covers the new entries for free.

- [ ] **Step 2: Run and see them fail:** `npx vitest run src/lib/orbit/__tests__/gap.test.ts src/lib/orbit/__tests__/playback.test.ts`. Expected: import errors for the new names, then assertion failures (`MAX_GAP_ROUNDS` is 2).

- [ ] **Step 3: Implement.**
  - `normalize.ts`: the three types and three helpers above, placed beside `MissingField`. `needsSpot = m === "spot" || m.endsWith("_spot")`. `scheduleGapOf` returns `null` for `"spot"` and `"nothing_schedulable"`, strips a trailing `_spot` otherwise. Change `classifyGap`'s declared return type to `ScheduleGap | "nothing_schedulable"` (its body does not change). Do not touch `normalizeExtraction` yet.
  - `gap.ts`: `MAX_GAP_ROUNDS = 3` with its comment updated to "Three founder answers maximum". `GAP_ASKABLE_KINDS = ["time", "day", "both", "cadence", "ambiguous_time", "spot", "time_spot", "day_spot", "both_spot", "cadence_spot", "ambiguous_time_spot"] as const satisfies readonly GapAskable[]`. Add the six entries to `GAP_REASK_COPY` and `GAP_HINT_EXAMPLES`. Add:
```ts
/** A question counts as asking for the place only if it says so. */
const PLACE_WORD_RE = /\b(where|place|spot)\b/i

/** The fire exit. Only `spot` is composed, so it can name the activity the
 * founder used; a composed string that fails the validator (an activity
 * with a period in it, say) falls back to the generic one. */
export function gapFallbackQuestion(missing: GapAskable, activity: string): string {
  if (missing === "spot") {
    return validateQuestion(`Where do you usually meet for ${activity}?`) ?? GAP_REASK_COPY.spot
  }
  return GAP_REASK_COPY[missing]
}

/** Validated model question, else the fire exit. For a kind that still needs
 * the spot, a question that never asks where is treated as invalid: the card
 * marks the place as missing, and front section decision 2 says one message
 * asks for everything, so a time-only question must not reach the screen. */
export function resolveGapQuestion(missing: GapAskable, rawQuestion: unknown, activity: string): string {
  const q = validateQuestion(rawQuestion)
  if (q !== null && (!needsSpot(missing) || PLACE_WORD_RE.test(q))) return q
  return gapFallbackQuestion(missing, activity)
}
```
    and in `decideGapOutcome` pass `normalized.rhythms[0].activity` as the third argument. Update the `decideGapOutcome` doc comment's "two-answer maximum" to "three-answer maximum".
  - `playback.ts`: replace the `switch` in `formatGapRhythmRow` with two tables (`MARKER: Record<ScheduleGap, string>` holding today's five markers, `MARKER_WITH_SPOT: Record<ScheduleGap, string>` holding the column above) and keep the per-schedule-gap `known` logic exactly as it is; when `scheduleGapOf(missing)` is null (spot alone) `known` is the whole schedule, `every day ${time}` for seven days else `[days, time].filter(Boolean).join(" ") || null`, and the marker is `where?`. The ambiguous-with-null-candidate degrade applies to `ambiguous_time_spot` too. Add the six `REASK_COPY` entries and `EXHAUSTED_COPY` with a header comment: per kind so the founder is told what is actually missing (the old single string always said "day and time", front section decision 4).
  - `merge.ts`: add the six `ASKED_ABOUT` entries. Nothing else in `merge.ts` changes in this task. Declared, because it is prompt text: these lines are only ever sent for the new kinds, which no production call could produce before Task 2, and the Task 5 RED baseline is taken with them present, so the baseline measures "the code asks the right question; the prompt has not been taught the spot".

- [ ] **Step 4: Run** the two files: pass. Then `npx vitest run src/lib/orbit src/app/create src/app/actions`: pass (StepGapAsk and Step1Describe read these tables by kind, and the existing kinds' strings are unchanged). Run `npx tsc --noEmit -p .` and confirm the only errors are in `src/app/actions/extract-group.ts` (the new third argument, fixed in Task 3) and `src/app/zz-mock/` (ignore); report the list.

- [ ] **Step 5: Commit** `git add src/lib/orbit && git commit -m "Name the gaps where the main activity's spot is missing, with copy for each"`

---

### Task 2: the main activity's spot joins the completeness gate

**Files:**
- Modify: `src/lib/orbit/normalize.ts`, `src/lib/orbit/gap.ts` (`enforceVenueCarryOver` only)
- Test: `src/lib/orbit/__tests__/normalize.test.ts`, `src/lib/orbit/__tests__/gap.test.ts`

**Interfaces:**
- Consumes: Task 1's types and helpers.
- Produces: `export function isNonAnswerVenue(v: string): boolean` from `normalize.ts`. `normalizeExtraction` returns `incomplete` with a spot kind whenever position 0 has no venue.

Rules, each one a test:
1. Primary selection and promotion are unchanged: they read `isSchedulable` only (normalize.ts:274-280). The spot is checked on whichever rhythm ended up at position 0, after that.
2. Primary unschedulable: `schedule = classifyGap(primary)`. If `schedule` is `nothing_schedulable`, that is the answer whatever the venue. Otherwise `missing = primary.venueName === null ? withSpot(schedule) : schedule`.
3. Primary schedulable and `venueName === null`: `incomplete`, `missing: "spot"`, `rhythms: stored`, `groupName` the same weekday-guarded cleaned suggestion the incomplete path already uses (normalize.ts:294), `candidateTimeLocal: null`.
4. A secondary rhythm's venue never affects the result.
5. A venue the founder did not actually give is no venue: after `cleanVenueName`, a value `isNonAnswerVenue` recognises becomes `null`, on every rhythm. `isNonAnswerVenue` lower-cases, removes apostrophes, turns every other non-letter into a space, collapses spaces, strips one trailing ` yet` or ` later`, and checks membership in: `idk`, `i dont know`, `dont know`, `dunno`, `not sure`, `no idea`, `tbd`, `tba`, `to be decided`, `undecided`, `somewhere`, `anywhere`, `wherever`, `varies`, `it varies`, `well figure it out`, `we will figure it out`, `figure it out`. Exact membership only, so "Somewhere Coffee" is a place.
6. `enforceVenueCarryOver` treats a merged venue `isNonAnswerVenue` recognises as empty, so "idk" in an answer can never overwrite a spot the founder already gave (without this, carry-over would keep "idk" and normalize would then null it, losing the real spot).

- [ ] **Step 1: Write the failing tests.** In `normalize.test.ts`:
  - Give the shared `CLIMB` fixture `venueName: "Summit Gym"` (declared: the fixture meant "a complete primary" and a complete primary now includes its spot). Run the file once after only that change and before adding tests; every test that still fails is one that asserted `ready` for a spotless primary. List each in the report and fix it by giving the rhythm a venue, never by weakening the assertion.
  - Replace the "absent, null, wrong-type, and empty venueName all become null" test's `ready` guard with: `if (r.status !== "incomplete") throw ...; expect(r.missing).toBe("spot"); expect(r.rhythms[0].venueName).toBeNull()`.
  - Replace the whole `describe("normalizeExtraction — venue never gates (regression pins)")` block (normalize.test.ts:490-517) with:

```ts
// The main activity's spot is required (onboarding step 2 cleanup, 26 Sept
// 2026, owner's decision). These replace the "venue never gates" pins that
// guarded the opposite rule; the promotion pin below is new and is what
// keeps the spot from quietly changing WHICH rhythm is the main one.
describe("normalizeExtraction, the main activity's spot", () => {
  it("a full schedule with no spot asks for the spot", () => {
    const r = normalizeExtraction(raw([{ ...CLIMB, venueName: null }]))
    expect(r).toMatchObject({ status: "incomplete", missing: "spot", candidateTimeLocal: null })
  })

  it("a full schedule with a spot is ready", () => {
    expect(normalizeExtraction(raw([CLIMB])).status).toBe("ready")
  })

  it("a schedule gap with no spot becomes the combined kind", () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ ...CLIMB, timeLocal: null, venueName: null }, "time_spot"],
      [{ ...CLIMB, daysOfWeek: null, venueName: null }, "day_spot"],
      [{ ...CLIMB, daysOfWeek: null, timeLocal: null, venueName: null }, "both_spot"],
      [{ ...CLIMB, cadence: null, venueName: null }, "cadence_spot"],
      [{ ...CLIMB, timeLocal: "07:00", timeAmbiguous: true, venueName: null }, "ambiguous_time_spot"],
    ]
    for (const [rhythm, expected] of cases) {
      const r = normalizeExtraction(raw([rhythm]))
      if (r.status !== "incomplete") throw new Error(`expected incomplete for ${expected}`)
      expect(r.missing).toBe(expected)
    }
  })

  it("a schedule gap WITH a spot stays the plain kind", () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ ...CLIMB, timeLocal: null }, "time"],
      [{ ...CLIMB, daysOfWeek: null }, "day"],
      [{ ...CLIMB, daysOfWeek: null, timeLocal: null }, "both"],
      [{ ...CLIMB, cadence: null }, "cadence"],
      [{ ...CLIMB, timeLocal: "07:00", timeAmbiguous: true }, "ambiguous_time"],
    ]
    for (const [rhythm, expected] of cases) {
      const r = normalizeExtraction(raw([rhythm]))
      if (r.status !== "incomplete") throw new Error(`expected incomplete for ${expected}`)
      expect(r.missing).toBe(expected)
    }
  })

  it("the ambiguous guess still travels in candidateTimeLocal on the combined kind", () => {
    const r = normalizeExtraction(raw([{ ...CLIMB, timeLocal: "07:00", timeAmbiguous: true, venueName: null }]))
    if (r.status !== "incomplete") throw new Error("expected incomplete")
    expect(r.candidateTimeLocal).toBe("07:00")
  })

  it("never asks about a secondary activity's spot", () => {
    expect(normalizeExtraction(raw([CLIMB, { ...BEERS, venueName: null }])).status).toBe("ready")
  })

  it("the spot does not change which rhythm is promoted", () => {
    // A monthly rhythm WITH a spot, and a schedulable rhythm WITHOUT one:
    // the schedulable one is still the main activity, and it is the one asked about.
    const r = normalizeExtraction(
      raw([{ ...BEERS, isPrimary: true, venueName: "Lucky Lab" }, { ...CLIMB, isPrimary: false, venueName: null }])
    )
    if (r.status !== "incomplete") throw new Error("expected incomplete")
    expect(r.missing).toBe("spot")
    expect(r.rhythms[0].activity).toBe("climbing")
    expect(r.rhythms[1].venueName).toBe("Lucky Lab")
  })

  it("a designated primary that is schedulable but spotless is not demoted for a spotted secondary", () => {
    const TENNIS = { ...CLIMB, activity: "tennis", isPrimary: false, venueName: "Court 3" }
    const r = normalizeExtraction(raw([{ ...CLIMB, venueName: null }, TENNIS]))
    if (r.status !== "incomplete") throw new Error("expected incomplete")
    expect(r.rhythms[0].activity).toBe("climbing")
  })

  it("nothing schedulable stays nothing schedulable, spot or no spot", () => {
    const r = normalizeExtraction(raw([{ ...BEERS, venueName: null }]))
    expect(r).toMatchObject({ status: "incomplete", missing: "nothing_schedulable" })
  })

  it("a spot-only gap keeps the cleaned name suggestion, guarded like every incomplete path", () => {
    const r = normalizeExtraction(raw([{ ...CLIMB, venueName: null }], "Climbing Crew"))
    if (r.status !== "incomplete") throw new Error("expected incomplete")
    expect(r.groupName).toBe("Climbing Crew")
  })
})

describe("isNonAnswerVenue and the non-answer guard", () => {
  it("recognises the ways people say the place is not settled", () => {
    for (const v of ["idk", "IDK yet", "not sure", "Not sure yet.", "we'll figure it out", "We’ll figure it out later", "TBD", "somewhere", "it varies", "dunno"]) {
      expect(isNonAnswerVenue(v)).toBe(true)
    }
  })
  it("leaves real places alone, including ones that contain a non-answer word", () => {
    for (const v of ["Movement Gowanus", "Somewhere Coffee", "the gym", "Sam's place", "Anywhere Fitness"]) {
      expect(isNonAnswerVenue(v)).toBe(false)
    }
  })
  it("a non-answer extracted as the main spot counts as no spot", () => {
    const r = normalizeExtraction(raw([{ ...CLIMB, venueName: "idk yet" }]))
    expect(r).toMatchObject({ status: "incomplete", missing: "spot" })
  })
  it("a non-answer on a secondary is nulled too, and never gates", () => {
    const r = normalizeExtraction(raw([CLIMB, { ...BEERS, venueName: "tbd" }]))
    if (r.status !== "ready") throw new Error("expected ready")
    expect(r.rhythms[1].venueName).toBeNull()
  })
})
```
  In `gap.test.ts`'s `enforceVenueCarryOver` block, using its own `prior`, `mergedRaw` and `rhythm` helpers:
```ts
  it("a non-answer in the merged output never overwrites a spot already given", () => {
    const out = enforceVenueCarryOver(mergedRaw([rhythm({ venueName: "idk yet" })]), prior) as { rhythms: Array<{ venueName: unknown }> }
    expect(out.rhythms[0].venueName).toBe("Summit Gym")
  })
```
  Confirm the existing "restores a venueName the merged output nulled" and "leaves a replacement venue alone" still pass unchanged: they are the "carry-over keeps an already-given spot" evidence the front section's verification list names.

- [ ] **Step 2: Run and see them fail:** `npx vitest run src/lib/orbit/__tests__/normalize.test.ts src/lib/orbit/__tests__/gap.test.ts`. Expected: the spot tests fail with `status: "ready"`, and `isNonAnswerVenue` is not exported.

- [ ] **Step 3: Implement** rules 1 to 6. In `sanitize`, replace the venue line (normalize.ts:103-105) with a `const venue = cleanVenueName(o.venueName)` and `venueName: venue !== null && isNonAnswerVenue(venue) ? null : venue`, and rewrite its comment: the venue is carried data, sanitized like everything else, and a non-answer is not a venue. In `normalizeExtraction`, after `const stored = ordered.map(toStored)`:
```ts
  // The main activity's spot (onboarding step 2 cleanup, 26 Sept 2026): a
  // separate requirement on position 0 only, checked AFTER primary
  // selection so it can never change which rhythm is the main one, and kept
  // out of isSchedulable, which parseRhythm and reconcile rely on meaning
  // "the schedule is complete" and nothing more.
  const spotMissing = primary.venueName === null
  if (!isSchedulable(primary)) {
    const schedule = classifyGap(primary)
    return {
      status: "incomplete",
      missing: schedule === "nothing_schedulable" || !spotMissing ? schedule : withSpot(schedule),
      ...
    }
  }
  if (spotMissing) {
    return { status: "incomplete", missing: "spot", rhythms: stored, groupName: rejectWeekdayNameOnMultiDay(cleanSuggestedName(suggestedName), primary.daysOfWeek), candidateTimeLocal: null }
  }
```
  Update the file header's "the completeness gate" sentence to say the gate now includes the main activity's spot. In `enforceVenueCarryOver`, change `if (merged) continue` to `if (merged && !isNonAnswerVenue(merged)) continue`, and rewrite the function's doc comment to drop "a gap answer is about time, day, or cadence" (it can now be about the spot) while keeping the reasoning that no answer removes a standing venue.

- [ ] **Step 4: Run** both files, then `npx vitest run src/lib/orbit src/app/actions src/app/create`. The existing `merge-gap.test.ts` and `extract-group.test.ts` only test failure states and must pass untouched. Report any other failure by name before changing it.

- [ ] **Step 5: Commit** `"Require the main activity's spot before onboarding is complete"`

---

### Task 3: the server plumbing, and the server refusing a spotless group

**Files:**
- Modify: `src/app/actions/extract-group.ts`, `src/app/actions/merge-gap.ts`, `src/app/actions/create-group.ts`
- Test: `src/app/actions/__tests__/extract-group.test.ts`, `src/app/actions/__tests__/merge-gap.test.ts`, `src/app/actions/__tests__/create-group.test.ts` (new)

**Interfaces:**
- Consumes: Tasks 1-2; `detailsNoSpot` from `@/lib/groups/details-edit`; `cleanVenueName` from `@/lib/orbit/rhythm`.
- Produces: `MergeGapResult`'s exhausted member becomes `{ status: "exhausted"; missing: MissingField }`. `createGroupAction` returns `{ error: detailsNoSpot(activity) }` when position 0 has no spot.

- [ ] **Step 1: Write the failing tests.**

`extract-group.test.ts`, one case:
```ts
it("a full schedule with no spot asks for the spot, naming the activity when the model asked nothing", async () => {
  vi.mocked(extractGroupProfile).mockResolvedValueOnce({
    suggestedGroupName: "Climbing Crew",
    clarifyingQuestion: null,
    rhythms: [{ activity: "climbing", cadence: "weekly", daysOfWeek: [2, 4], timeLocal: "19:00", timeAmbiguous: false, isPrimary: true, venueName: null }],
  })
  const result = await extractGroupAction({ status: "idle" }, form("we climb tuesdays and thursdays at 7pm"))
  expect(result).toMatchObject({ status: "incomplete", gap: { missing: "spot", question: "Where do you usually meet for climbing?" } })
})
```

`merge-gap.test.ts` (keep `GAP_INPUT`; add a helper `rawRhythm(over)` returning the schema-shaped rhythm `{ activity: "climbing", cadence: "weekly", daysOfWeek: [0], timeLocal: "08:00", timeAmbiguous: false, isPrimary: true, venueName: null, ...over }` and `raw = (r) => ({ suggestedGroupName: "Sunday Climbers", clarifyingQuestion: null, rhythms: [r] })`):
```ts
describe("mergeGapAction, the spot kinds and the cap", () => {
  it("accepts every askable kind", async () => {
    for (const kind of GAP_ASKABLE_KINDS) {
      vi.mocked(mergeGapAnswer).mockResolvedValueOnce(raw(rawRhythm({ venueName: "Summit Gym" })))
      const result = await mergeGapAction({ ...GAP_INPUT, gap: { ...GAP_INPUT.gap, missing: kind } })
      expect(result.status).toBe("ready")
    }
  })
  it("still refuses an unknown kind", async () => {
    const result = await mergeGapAction({ ...GAP_INPUT, gap: { ...GAP_INPUT.gap, missing: "venue" as never } })
    expect(result).toEqual({ status: "error" })
  })
  it("a third answer is still asked about (round 1 -> round 2)", async () => {
    vi.mocked(mergeGapAnswer).mockResolvedValueOnce(raw(rawRhythm()))
    const result = await mergeGapAction({ ...GAP_INPUT, round: 1, gap: { ...GAP_INPUT.gap, missing: "spot" } })
    expect(result).toMatchObject({ status: "incomplete", round: 2, gap: { missing: "spot" } })
  })
  it("after the third answer it gives up, saying what is still missing", async () => {
    vi.mocked(mergeGapAnswer).mockResolvedValueOnce(raw(rawRhythm()))
    const result = await mergeGapAction({ ...GAP_INPUT, round: 2, gap: { ...GAP_INPUT.gap, missing: "spot" } })
    expect(result).toEqual({ status: "exhausted", missing: "spot" })
  })
  it("a merge that loses everything schedulable gives up naming that", async () => {
    vi.mocked(mergeGapAnswer).mockResolvedValueOnce({ suggestedGroupName: null, clarifyingQuestion: null, rhythms: [] })
    const result = await mergeGapAction(GAP_INPUT)
    expect(result).toEqual({ status: "exhausted", missing: "nothing_schedulable" })
  })
  it("an 'idk' answer to the spot question keeps asking and keeps a spot already given", async () => {
    // prior state already holds a spot for climbing; the answer is a non-answer
    vi.mocked(mergeGapAnswer).mockResolvedValueOnce(raw(rawRhythm({ timeLocal: null, venueName: "idk" })))
    const result = await mergeGapAction({
      ...GAP_INPUT,
      answer: "idk",
      gap: { ...GAP_INPUT.gap, missing: "time", rhythms: [{ ...GAP_INPUT.gap.rhythms[0], venueName: "Summit Gym" }] },
    })
    expect(result).toMatchObject({ status: "incomplete", gap: { missing: "time" } })
    if (result.status !== "incomplete") return
    expect(result.gap.rhythms[0].venueName).toBe("Summit Gym")
  })
})
```

`create-group.test.ts` (new; copy the `vi.hoisted` shape of `update-group-details.test.ts`; nothing touches the database):
```ts
import { beforeEach, describe, expect, it, vi } from "vitest"

const { getUser, signInAnonymously, provisionFounderGroup, reconcileScheduledEvents } = vi.hoisted(() => ({
  getUser: vi.fn(),
  signInAnonymously: vi.fn(),
  provisionFounderGroup: vi.fn(),
  reconcileScheduledEvents: vi.fn(),
}))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser, signInAnonymously } }) }))
vi.mock("@/lib/groups/provision", () => ({ provisionFounderGroup }))
vi.mock("@/lib/orbit/reconcile", () => ({ reconcileScheduledEvents }))

import { createGroupAction } from "../create-group"

const climbing = (venueName: string | null) => ({
  activity: "climbing", title: "Climbing", cadence: "weekly", daysOfWeek: [2, 4], timeLocal: "19:00", venueName,
})
const beers = { activity: "beers", title: "Beers", cadence: "monthly", daysOfWeek: null, timeLocal: null, venueName: null }
const input = (rhythms: unknown) => ({ founderName: "Jacob", groupName: "Climbing Crew", description: "x", rhythms, timeZone: "America/New_York" })

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: "auth_1" } } })
  provisionFounderGroup.mockResolvedValue({ group: { id: "grp_1", inviteToken: "tok_1" } })
  reconcileScheduledEvents.mockResolvedValue(undefined)
})

describe("createGroupAction, the main spot (decision 8)", () => {
  it("refuses a main activity with no spot and creates nothing", async () => {
    expect(await createGroupAction(input([climbing(null)]))).toEqual({ error: "Add where you meet for climbing." })
    expect(provisionFounderGroup).not.toHaveBeenCalled()
  })
  it("refuses a blank spot the same way", async () => {
    expect(await createGroupAction(input([climbing("   ")]))).toEqual({ error: "Add where you meet for climbing." })
    expect(provisionFounderGroup).not.toHaveBeenCalled()
  })
  it("creates the group when the main activity has a spot, a spotless secondary notwithstanding", async () => {
    expect(await createGroupAction(input([climbing("Movement Gowanus"), beers]))).toEqual({ groupId: "grp_1", inviteToken: "tok_1" })
    expect(provisionFounderGroup).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run and see them fail:** `npx vitest run src/app/actions/__tests__/extract-group.test.ts src/app/actions/__tests__/merge-gap.test.ts src/app/actions/__tests__/create-group.test.ts`. Expected: the extract case gets the generic spot question or a type error on the missing argument; the merge whitelist test errors on the new kinds; exhausted lacks `missing`; the create-group refusals return a group.

- [ ] **Step 3: Implement.**
  - `extract-group.ts`: `resolveGapQuestion(normalized.missing, readClarifyingQuestion(raw), normalized.rhythms[0].activity)`.
  - `merge-gap.ts`: delete the local `GAP_KINDS` and use `GAP_ASKABLE_KINDS` from `gap.ts` (`GAP_ASKABLE_KINDS.includes(input.gap?.missing)`); update the `round` doc comment to "0, 1 or 2"; the exhausted branch returns `{ status: "exhausted", missing: normalized.status === "incomplete" && normalized.rhythms.length > 0 ? normalized.missing : "nothing_schedulable" }`, and the `MergeGapResult` type says so.
  - `create-group.ts`, right after the completeness gate (create-group.ts:51-54):
```ts
  // The main activity's spot (decision 8, onboarding step 2 cleanup): the
  // wizard cannot reach confirm without one, and the server does not trust
  // the wizard. Position 0 only; every other activity stays spot-optional.
  if (cleanVenueName(rhythms[0].venueName) === null) {
    return { error: detailsNoSpot(rhythms[0].activity) }
  }
```
    and add "and whose main activity has a spot" to the header comment's completeness sentence.

- [ ] **Step 4: Run** the three files, then `npx vitest run src/app/actions src/lib/orbit`: pass. `npx tsc --noEmit -p .`: zero errors outside `src/app/zz-mock/` (the wizard ignores the new `missing` field until Task 10). Report the output.

- [ ] **Step 5: Commit** `"Carry the spot kinds through the server actions, and refuse a group with no main spot"`

---

### Task 4: bench cases for the spot, before any prompt changes

**Files:**
- Modify: `evals/onboarding/cases.ts` only. Do NOT run the bench.

**Interfaces:**
- Consumes: `MissingField` with the new kinds; `statusIncomplete` already takes any `MissingField`.
- Produces: new assertion builders in `cases.ts`, beside the existing ones:
```ts
function venueIs(want: string): Assertion        // `venue holds "${want}"`, case-insensitive includes on primaryOf().venueName
const questionMentionsPlace: Assertion           // "question asks where", o.question !== null && /\b(where|place|spot)\b/i
const questionMentionsTime: Assertion            // "question asks the time", o.question !== null && /\b(time|when)\b/i
function questionDoesNotName(word: string): Assertion  // `question does not mention "${word}"`, o.question === null || !new RegExp(`\\b${word}`, "i").test(o.question)
const noQuestionAsked: Assertion                 // "no question asked", o.question === null
```
`questionMentionsPlace` uses the same place words as `gap.ts`'s `PLACE_WORD_RE` on purpose; say so in its comment. These grade the model's own question (`toOutcome` passes it through `validateQuestion` only, never through `resolveGapQuestion`'s fallback), which is what makes them able to go red: in production a question that forgets the place is replaced by the fallback (Task 1), so the founder never sees the miss, but the bench must.

Before editing, confirm the bench stays outside Vitest: `vitest.config.ts` uses the default include glob (`*.test.*` / `*.spec.*`), and neither `cases.ts` nor `run.ts` matches it. Say so in the report.

- [ ] **Step 1: Restate the existing cases for the new gate** (the rule changed, not the model; every change below is mechanical and is listed in the report):
  - Every extract case whose founder text names no place and whose schedule is complete (`extract-multi-day`, `extract-single-day`, `extract-two-rhythms`, `extract-day-prominent-run`, `extract-day-prominent-beers`, `extract-day-prominent-multi-day`, `extract-own-words-book-club`, `extract-own-words-family-dinner`): `statusReady` becomes `statusIncomplete("spot")`. Everything else in them stays, including `venueIsNull`.
  - `extract-no-time`: `statusIncomplete("time")` becomes `statusIncomplete("time_spot")`; add `questionMentionsPlace` and `questionMentionsTime` (this is the "time and spot both missing asks both in one question" case). Append to its description: "Since 26 Sept 2026 the place is missing too, so the one question must ask both."
  - `extract-no-venue`: `statusReady` becomes `statusIncomplete("spot")`; add `questionMentionsPlace` and `questionDoesNotName("day")`; rewrite its description: no place mentioned anywhere; guards both "never invent a venue" and, since 26 Sept 2026, that Orbit asks where the group meets.
  - `extract-with-venue`: add `noQuestionAsked` (a stated spot means nothing is asked). `statusReady` stays.
  - The three merge cases: each `askedAbout` becomes its realistic spot form (`merge-carry-forward` and `merge-day-replacement`: `"time"` to `"time_spot"`; `merge-ambiguous-time`: `"ambiguous_time"` to `"ambiguous_time_spot"`), because a spotless state is now always asked about the spot too; `statusReady` becomes `statusIncomplete("spot")`; `venueIsNull` stays (the answer names no place, so none may appear). Add one sentence to the merge section comment saying why.
  - Known side effect to state in the report, not to fix: on the incomplete path `normalized.groupName` is the model's cleaned suggestion with no derived fallback (normalize.ts:31), so a name the weekday guard discards now reads as a red "name: non-empty" where on the ready path it used to be rescued by the fallback. That is the model's own miss becoming visible; do not loosen the assertion.

- [ ] **Step 2: Add the new cases** (ids and assertions exact; descriptions one or two sentences in the file's own voice, saying why the case exists):
```ts
{ id: "extract-secondary-spotless", kind: "extract",
  founderDescription: "we climb at Movement Gowanus every Tuesday at 7pm, and we grab beers once a month",
  assertions: [statusReady, activityIs("climbing"), venueIs("movement gowanus"), daysAre([2]), timeIs("19:00"),
    { name: "both rhythms survive", check: (o) => o.normalized.rhythms.length === 2 },
    noQuestionAsked, ...nameAssertions([2])] },
{ id: "extract-spot-missing-with-secondary", kind: "extract",
  founderDescription: "we climb every Tuesday at 7pm, and we grab beers once a month",
  assertions: [statusIncomplete("spot"), activityIs("climbing"), daysAre([2]), timeIs("19:00"), venueIsNull,
    questionMentionsPlace, questionDoesNotName("beer"), ...nameAssertions([2])] },
{ id: "merge-time-and-spot", kind: "merge",
  input: { description: "we climb tuesdays and thursdays", groupName: "Climbing Crew",
    currentState: [{ activity: "climbing", title: "Climbing", cadence: "weekly", daysOfWeek: [2, 4], timeLocal: null, venueName: null }],
    candidateTimeLocal: null, askedAbout: "time_spot", answer: "7pm at Movement Gowanus" },
  assertions: [statusReady, activityIs("climbing"), daysAre([2, 4]), timeIs("19:00"), timeNotAmbiguous, venueIs("movement gowanus"), ...nameAssertions([2, 4])] },
{ id: "merge-spot-only", kind: "merge",
  input: { description: "we climb tuesdays and thursdays at 7pm", groupName: "Climbing Crew",
    currentState: [{ activity: "climbing", title: "Climbing", cadence: "weekly", daysOfWeek: [2, 4], timeLocal: "19:00", venueName: null }],
    candidateTimeLocal: null, askedAbout: "spot", answer: "Movement Gowanus" },
  assertions: [statusReady, activityIs("climbing"), daysAre([2, 4]), timeIs("19:00"), venueIs("movement gowanus"), ...nameAssertions([2, 4])] },
{ id: "merge-spot-idk", kind: "merge",
  input: { ...same currentState as merge-spot-only..., askedAbout: "spot", answer: "idk yet" },
  assertions: [statusIncomplete("spot"), daysAre([2, 4]), timeIs("19:00"), venueIsNull, questionMentionsPlace] },
{ id: "merge-spot-figure-it-out", kind: "merge",
  input: { ...same currentState as merge-spot-only..., askedAbout: "spot", answer: "we'll figure it out" },
  assertions: [statusIncomplete("spot"), venueIsNull, questionMentionsPlace] },
{ id: "merge-spot-kept", kind: "merge",
  input: { description: "we climb tuesdays at Movement Gowanus", groupName: "Climbing Crew",
    currentState: [{ activity: "climbing", title: "Climbing", cadence: "weekly", daysOfWeek: [2], timeLocal: null, venueName: "Movement Gowanus" }],
    candidateTimeLocal: null, askedAbout: "time", answer: "7pm" },
  assertions: [statusReady, timeIs("19:00"), venueIs("movement gowanus"), ...nameAssertions([2])] },
```
Write `merge-spot-idk` and `merge-spot-figure-it-out` out in full in the file (no spread shorthand in the case list; the case must read on its own).

- [ ] **Step 3: Typecheck the bench without running it:** `npx tsc --noEmit -p .` must show no error in `evals/`. Also `npx vitest run src/lib/orbit` to confirm nothing in the suite imports the bench.

- [ ] **Step 4: Commit** `"Bench the main activity's spot: new cases, and existing cases restated for the new gate"`

---

### Task 5: RED baseline on the unchanged prompts (coordinator)

- [ ] The bench never touches the database. It loads `ANTHROPIC_API_KEY` through its own dotenv call; do not read `.env` to check it.
- [ ] Note the time, then run `npm run eval:onboarding` (5 runs per case, 21 cases, 105 calls). Save the full output to the scratchpad.
- [ ] Per-run cost: read the spend for the run's window from the Anthropic console usage page. If it cannot be read, estimate from the call count and Haiku 4.5's published per-token prices at a measured prompt size, and label it "estimate".
- [ ] Record in `docs/build-notes.md`, appended to the "§11 entry: onboarding step 2 cleanup" (append-only, dated): commit hash, total assertion-runs passed, every assertion below full marks by case and name with its rate, the cost, and one plain sentence per red line on what the founder would have seen. Expected red at minimum: `questionMentionsPlace` on `extract-no-venue`, `extract-no-time` and `extract-spot-missing-with-secondary`. Anything red that the prompt change is not meant to touch (the name assertions, the schedule fields) is the baseline to hold, not a target. Also record that the six new `ASKED_ABOUT` lines were already present (Task 1's declaration).
- [ ] If an existing must-hold assertion (activity, days, time, cadence, title) reads below its last recorded rate, stop and tell the owner before Task 6: the prompt change would then be measured against a moving baseline.

---

### Task 6: teach both prompts the spot

**Files:**
- Modify: `src/lib/orbit/extract.ts` (`FIELD_RULES` only), `src/lib/orbit/merge.ts` (`MERGE_SYSTEM_PROMPT` only)
- Test: `src/lib/orbit/__tests__/extract.test.ts`, `src/lib/orbit/__tests__/merge.test.ts`

**Interfaces:** no new names. `EXTRACTION_SCHEMA` does not change (it already carries `venueName`).

- [ ] **Step 1: Write the failing contract tests** (string pins on the prompt text, the kind this file already keeps; they guard against the rule being deleted, not its effect, which is the bench's job):
```ts
// extract.test.ts
describe("extraction contract, the main activity's spot", () => {
  it("the clarifying question lists a missing place among the primary's gaps", () => {
    expect(FIELD_RULES).toMatch(/place missing\?/)
    expect(FIELD_RULES).toMatch(/What time do you meet, and where\?/)
  })
  it("never asks about another rhythm's place", () => {
    expect(FIELD_RULES).toMatch(/never ask about any other rhythm, including where it meets/)
  })
  it("a word that only says the place is not settled is not a place", () => {
    expect(FIELD_RULES).toMatch(/"idk"/)
  })
})
// merge.test.ts
it("the merge prompt tells the model an answer can carry the place", async () => {
  await mergeGapAnswer({ description: "we climb tuesdays at 7pm", groupName: null,
    currentState: [{ activity: "climbing", title: "Climbing", cadence: "weekly", daysOfWeek: [2], timeLocal: "19:00", venueName: null }],
    candidateTimeLocal: null, askedAbout: "spot", answer: "Movement Gowanus" })
  const [system, user] = vi.mocked(callExtractionModel).mock.calls.at(-1)!
  expect(system).toMatch(/put it in the primary rhythm's venueName/)
  expect(user).toMatch(/WE ASKED: about where they usually meet/)
})
```
- [ ] **Step 2: Run and see them fail:** `npx vitest run src/lib/orbit/__tests__/extract.test.ts src/lib/orbit/__tests__/merge.test.ts` (the `WE ASKED` half passes already because of Task 1; the system-prompt half fails; say so).
- [ ] **Step 3: Implement.** In `FIELD_RULES`:
  - `venueName`: append `A phrase that only says the place is not settled ("idk", "not sure", "somewhere", "we'll figure it out", "TBD") is not a place: null.`
  - `clarifyingQuestion`: replace the opening condition with `null when the primary rhythm has a weekly cadence, at least one stated day, an unambiguous time, and a venueName.`; the gap list becomes `(day missing? time missing? time ambiguous? cadence unclear? place missing?)`; the scope sentence becomes `Only the primary rhythm's gaps matter: never ask about any other rhythm, including where it meets, they are allowed to stay loose.`; append two examples to the existing list: `time and place both missing, "What time do you meet, and where?"; only the place missing, "Where do you usually meet for climbing?" (name the activity).`
  In `MERGE_SYSTEM_PROMPT`'s merge rules, after the "answer often settles the asked-about gap indirectly" line:
  - `The answer can name where the group meets, alone or with a day or time ("7pm at Movement Gowanus", or just "Movement Gowanus"): put it in the primary rhythm's venueName.`
  - `If the answer only says the place is not settled ("idk yet", "we'll figure it out"), venueName stays null, and the question asks where again.`
  Keep the single worked example; add a second, three lines, below it: `WE ASKED: about where they usually meet` / `ANSWER: "Movement Gowanus"` / `Correct output: rhythms[0].venueName is "Movement Gowanus", every other field copied, clarifyingQuestion is null.` Keep every new line free of em and en dashes and under the prompt's existing register.
- [ ] **Step 4: Run** both files and `npx vitest run src/lib/orbit`: pass. Confirm by `rg -n "FIELD_RULES" src` that only `merge.ts` imports it (spark untouched).
- [ ] **Step 5: Commit** `"Teach extraction and the gap merge to ask for and hear the main activity's spot"`

---

### Task 7: GREEN run, and the call to keep or revise (coordinator)

- [ ] Run `npm run eval:onboarding` exactly as in Task 5, same run count. Save the output.
- [ ] Record in the same §11 entry, dated, beside the baseline: total, every assertion that moved (both directions) with before and after rates, the cost, and the per-onboarding cost implication in product terms (a founder who omits a place now spends one more merge call, the front section's "about half a cent"; state the measured figure and whether it matches).
- [ ] Bar: every `questionMentionsPlace` and `venueIs` assertion at 5/5, the non-answer cases at 5/5, and no existing assertion below its baseline rate. A miss is reported to the owner with the failing outputs, not tuned silently; at most one prompt revision round is attempted before asking, and each round is benched and recorded.

---

### Task 8: non-weekly activities show only name and spot, and the form body is shared

**Files:**
- Modify: `src/components/RhythmFields.tsx`, `src/app/groups/[id]/info/EditGroupDetails.tsx`
- Create: `src/components/GroupDetailsFields.tsx`
- Test: `src/components/__tests__/RhythmFields.test.tsx`, `src/components/__tests__/GroupDetailsFields.test.tsx` (new), `src/app/groups/[id]/info/__tests__/EditGroupDetails.test.tsx`

**Interfaces:**
- Produces:
```ts
// RhythmFields: `showSchedule` is added. `showPlace` stays for now, because
// step 2's old day/time block still passes false until Task 9 removes that
// block; Task 9 then removes `showPlace` too, since no caller will pass false.
export default function RhythmFields(props: {
  idPrefix: string; value: RhythmEdit; onChange: (next: RhythmEdit) => void
  showPlace: boolean
  showSchedule: boolean   // false for a non-weekly activity: Activity and Place only
  disabled: boolean
}): JSX.Element

// GroupDetailsFields: the group-info form body (EditGroupDetails.tsx:189-223), lifted as is.
export default function GroupDetailsFields(props: {
  nameInputId: string                 // "group-details-name" on group info
  rhythmIdPrefix: string              // "rhythm" on group info -> ids "rhythm-0-activity", ...
  name: string
  onNameChange: (v: string) => void
  rhythms: RhythmEdit[]
  cadences: StoredRhythm["cadence"][] // same order as rhythms; "weekly" shows the schedule
  onRhythmChange: (index: number, next: RhythmEdit) => void
  disabled: boolean
}): JSX.Element
```
- The lift is behaviour-preserving for group info apart from decision 7: the ids, labels, `maxLength={GROUP_NAME_MAX}`, and the separator style stay exactly as they are, which is what lets the existing `EditGroupDetails.test.tsx` pass unchanged.

- [ ] **Step 1: Write the failing tests.**
  - `RhythmFields.test.tsx`: add `showSchedule` to every existing render; add:
```ts
it("a non-weekly activity shows only Activity and Place", () => {
  render(<RhythmFields idPrefix="r1" value={{ activity: "beers", daysOfWeek: null, timeLocal: null, venueName: null }} onChange={() => {}} showPlace showSchedule={false} disabled={false} />)
  expect(screen.getByLabelText("Activity")).toBeTruthy()
  expect(screen.getByLabelText("Place")).toBeTruthy()
  expect(screen.queryByLabelText("Time")).toBeNull()
  expect(screen.queryByRole("group", { name: "Days" })).toBeNull()
  expect(screen.queryByRole("button", { name: /Sat/ })).toBeNull()
})
```
  - `GroupDetailsFields.test.tsx` (new, jsdom): renders `Group name` with the given id and `maxLength` 50; one block per rhythm, the second carrying `borderTop: 1.4px solid var(--hairline)`; a weekly and a monthly rhythm render one `Time` and two `Place`; typing in the second block's Place calls `onRhythmChange(1, { ...rhythm, venueName: "Rusty Anchor" })`; typing in Group name calls `onNameChange`.
  - `EditGroupDetails.test.tsx`, two cases:
```ts
it("a monthly activity shows only Activity and Place on group info (decision 7)", () => {
  renderIt({ rhythms: [climbing, beers] })
  openForm()
  expect(screen.getAllByLabelText("Time")).toHaveLength(1)
  expect(screen.getAllByLabelText("Place")).toHaveLength(2)
  expect(screen.getAllByRole("group", { name: "Days" })).toHaveLength(1)
})
it("saving leaves a hidden monthly day and time exactly as stored", async () => {
  renderIt({ rhythms: [climbing, beers] })
  openForm()
  fireEvent.change(screen.getByLabelText("Group name"), { target: { value: "Wednesday Climbers" } })
  fireEvent.click(screen.getByRole("button", { name: "Save" }))
  await waitFor(() => expect(updateGroupDetailsAction).toHaveBeenCalledTimes(1))
  const fd = updateGroupDetailsAction.mock.calls[0][1] as FormData
  const payload = JSON.parse(fd.get("payload") as string)
  expect(payload.rhythms[1]).toMatchObject({ daysOfWeek: [5], timeLocal: "20:00" })
})
```
  The second passes on its first run by design (the values ride through `toRhythmEdit` untouched whether or not the fields render); say so and name it a regression pin for "hiding a field must not clear it".
- [ ] **Step 2: Run and see them fail:** `npx vitest run src/components/__tests__/RhythmFields.test.tsx src/components/__tests__/GroupDetailsFields.test.tsx "src/app/groups/[id]/info/__tests__/EditGroupDetails.test.tsx"`.
- [ ] **Step 3: Implement.** `RhythmFields`: wrap the `Days` group and the `Time` block in `{showSchedule && (...)}`; update the header comment (a non-weekly activity has no day and time the product can schedule, so the editor does not offer to change them; the cadence slice owns cadence). `GroupDetailsFields`: move the markup of `EditGroupDetails.tsx:189-223` into it verbatim, passing `showPlace` and `showSchedule={cadences[i] === "weekly"}`; header comment: lifted 26 Sept 2026 so group info and onboarding step 2 render one form body. `EditGroupDetails`: render `<GroupDetailsFields nameInputId="group-details-name" rhythmIdPrefix="rhythm" ... cadences={rhythms.map((r) => r.cadence)} />` in place of the lifted markup. Step2Playback's existing day/time block (removed in Task 9) gets `showSchedule` added to its one `RhythmFields` call and keeps `showPlace={false}`; touch nothing else in Step2Playback.
- [ ] **Step 4: Run** the three files plus `npx vitest run src/components "src/app/groups" src/app/create`: pass. The existing EditGroupDetails tests passing unchanged is the evidence the lift changed nothing else.
- [ ] **Step 5: Commit** `"Show only name and spot for a non-weekly activity, and share the group-details form body"`

---

### Task 9: step 2 becomes read-only playback with "Edit details"

**Files:**
- Create: `src/app/create/EditDetailsCard.tsx`
- Modify: `src/app/create/Step2Playback.tsx`, `src/app/create/OnboardingWizard.tsx` (step 2 wiring only), `src/app/create/PlaybackCard.tsx` (delete the `venue` slot), `src/components/RhythmFields.tsx` and `src/components/GroupDetailsFields.tsx` (remove `showPlace`, whose last `false` caller this task deletes)
- Test: `src/app/create/__tests__/Step2Playback.test.tsx` (new), `src/app/create/__tests__/OnboardingWizard.test.tsx`, `src/components/__tests__/RhythmFields.test.tsx` (drop `showPlace` from every render and delete the "hides it on step 2" half of the Place test, keeping its `maxLength` half)
- Delete: `src/app/create/__tests__/Step2PlaybackVenue.test.tsx`, `src/app/create/__tests__/Step2PlaybackDayTime.test.tsx` (every control they test is removed by decision 5; the replacement coverage is the new file)

**Interfaces:**
- Consumes: `GroupDetailsFields` (Task 8), `validateDetailsEdit`, `toRhythmEdit`, `detailsNoSpot`, `GROUP_NAME_MAX`, `infoCardStyle`, `detailsBodyStyle`, `detailsBandStyle`, `neverMindButton`, `saveButton`, `ErrorLine`, `visuallyHiddenStyle`.
- Produces:
```ts
// EditDetailsCard.tsx
export default function EditDetailsCard(props: {
  groupName: string
  rhythms: StoredRhythm[]
  onDone: (name: string, rhythms: StoredRhythm[]) => void  // called only with validateDetailsEdit's ok output
  onCancel: () => void
}): JSX.Element

// Step2Playback props, after:
interface Props {
  founderName: string
  groupName: string
  rhythms: StoredRhythm[]
  onDetailsChange: (name: string, rhythms: StoredRhythm[]) => void
  timeZone: string | null
  onConfirm: () => void
  isCreating: boolean
  error: string | null
}
// removed: onGroupNameChange, onVenueNameChange, onRhythmChange, onBack
```
- `OnboardingWizard`: delete `handleVenueNameChange` and `handleRhythmChange` (and the `RhythmEdit` / `titleCaseActivity` imports if unused); pass `onDetailsChange={(name, next) => { setGroupName(name); setRhythms(next) }}`. `handleConfirm` is unchanged (its trims are now redundant with validation and harmless; leave them).

Behaviour, each a test in `Step2Playback.test.tsx` (jsdom; stub `scrollIntoView` exactly as `EditGroupDetails.test.tsx:16-19` does; fixtures `climbing = { activity: "climbing", title: "Climbing", cadence: "weekly", daysOfWeek: [2, 4], timeLocal: "19:00", venueName: "Movement Gowanus" }` and `beers = { activity: "beers", title: "Beers", cadence: "monthly", daysOfWeek: null, timeLocal: null, venueName: null }`; a small `Harness` that holds `groupName` and `rhythms` in `useState` and passes a spy-wrapped `onDetailsChange`, since the real wizard handler is covered by `OnboardingWizard.test.tsx`):
1. At rest it is read-only: `screen.queryAllByRole("textbox")` is empty; `Climbing Crew` is text; the climbing row reads `Tue & Thu at 7pm, every week · Movement Gowanus`; the beers row reads `Once a month, we'll pick a day later` with no ` · `; `Times in` is present; no button named `Change day or time`, `Edit my description` or `/Add where you meet/`; a button named `Edit details` is present.
2. `Edit details` opens the editor in place: `Group name` value `Climbing Crew`; the band has `Never mind` and `Done`; the confirm band (`/looks right, set up invites/i`) and `Edit details` are gone; `screen.queryByText(/Times in/)` is null; `Done` carries `var(--action)` as its background (the only teal on screen).
3. `Done` applies: change `Group name` to `Tuesday Crew` and climbing's `Place` to ` Brooklyn Boulders ` then `Done`; the spy was called once with `("Tuesday Crew", [ { ...climbing, venueName: "Brooklyn Boulders" }, beers ])`; the read-only card is back showing `Tuesday Crew` and `· Brooklyn Boulders`.
4. `Never mind` discards: change `Group name`, `Never mind`; spy not called; the card shows `Climbing Crew`; reopening shows `Climbing Crew` in the field.
5. The main spot is required: clear climbing's `Place`, `Done`; the editor stays open showing `Add where you meet for climbing.`; spy not called.
6. A non-weekly activity shows only name and spot (decision 7, step 2 surface): with `[climbing, beers]` the editor has one `Time`, two `Place`, one Days group.
7. The confirm band is disabled when what is on screen would not validate (a primary with `venueName: null` passed as props, which only a forged path could produce now): the confirm button is `disabled`.
8. While creating, `Edit details` is disabled.
9. After `Done` or `Never mind`, focus returns to `Edit details` (`document.activeElement`).

`OnboardingWizard.test.tsx`: rewrite the existing test's editing half to go through the new path (the rest of it, including what it asserts about the payload, stays): wait for `Edit details`, click it, change `Activity` to `padel `, click `Done`, then confirm; `payload.rhythms[0].activity` is `padel` and `title` is `Padel`. Update the file's header comment to name the new path. Add one test: after `Done` with a renamed group, the payload's `groupName` is the new name.

- [ ] **Step 1: Write the failing tests above; delete the two old files in the same step.**
- [ ] **Step 2: Run and see them fail:** `npx vitest run src/app/create/__tests__/Step2Playback.test.tsx src/app/create/__tests__/OnboardingWizard.test.tsx`.
- [ ] **Step 3: Implement** to the approved picture, screens 3 and 4.
  - `EditDetailsCard.tsx` (`"use client"`): local `name`, `drafts` (`rhythms.map(toRhythmEdit)`, seeded once at mount, since the card mounts fresh on every open) and `error`. Card, body, hidden heading, band and buttons exactly as the picture's screen 4 describes, with `ref`s so that on mount it focuses the hidden heading with `{ preventScroll: true }` and calls `cardRef.current?.scrollIntoView?.({ block: "start" })` (the EditGroupDetails convention and its reason, `EditGroupDetails.tsx:53-77`). `Done`: `const v = validateDetailsEdit(rhythms, { name, rhythms: drafts }); if (!v.ok) { setError(v.error); return } onDone(v.name, v.rhythms)`. `Never mind`: `onCancel()`. Header comment: step 2's editor is group info's editor, in place, band "Never mind | Done" because nothing is saved until confirm; no timezone line in the editor (decision 7).
  - `Step2Playback.tsx`: delete the venue input/button, the day/time block, `seededVenueIdx`, `tappedVenueIdx`, `openDayTimeIdx`, `primaryVenueFilled` and `dayTimeErrorMsg` with their comments; add `const [editing, setEditing] = useState(false)` and an `editLinkRef` that receives focus after `Done` or `Never mind`. `canConfirm = !isCreating && validateDetailsEdit(rhythms, { name: groupName, rhythms: rhythms.map(toRhythmEdit) }).ok` (this subsumes the old name and spot checks, which is why both go). When `editing`, render the tailed bubble then `<EditDetailsCard ... onDone={(n, r) => { onDetailsChange(n, r); close() }} onCancel={close} />` and nothing else; otherwise the read-only card and the `Edit details` link per screen 3. Rewrite the file header: step 2 is read-only playback (decision 5); everything Orbit understood is changed through `Edit details`, group info's own editor.
  - `RhythmFields.tsx` / `GroupDetailsFields.tsx`: remove `showPlace`; Place always renders. Confirm with `rg -n "showPlace" src` that nothing outside `src/app/zz-mock/` still passes it.
  - `PlaybackCard.tsx`: delete `PlaybackRow`'s `venue` prop, its rendering line and its doc paragraph (its only caller is gone). Confirm with `rg -n "venue=" src/app` that nothing else passes it.
  - `OnboardingWizard.tsx`: the wiring above. The header chevron's `onBack` stays as it is.
- [ ] **Step 4: Run** `npx vitest run src/app/create src/components "src/app/groups"`: pass.
- [ ] **Step 5: Commit** `"Make onboarding step 2 read-only, with Edit details opening group info's editor in place"`

---

### Task 10: the gap-ask loses its edit link, and giving up names what is missing

**Files:**
- Modify: `src/app/create/StepGapAsk.tsx`, `src/app/create/OnboardingWizard.tsx` (gap and exhausted wiring only)
- Test: `src/app/create/__tests__/StepGapAsk.test.tsx`, `src/app/create/__tests__/OnboardingWizard.test.tsx`

**Interfaces:**
- Consumes: `EXHAUSTED_COPY` (Task 1), `MergeGapResult`'s `missing` (Task 3).
- Produces: `StepGapAsk` loses the `onEditDescription` prop. The wizard's `gapExhausted: boolean` becomes `exhaustedMissing: MissingField | null`; `bubbleOverride={exhaustedMissing ? EXHAUSTED_COPY[exhaustedMissing] : undefined}`; `EXHAUSTED_COPY` the local constant (OnboardingWizard.tsx:35-39) is deleted.

- [ ] **Step 1: Write the failing tests.**
  - `StepGapAsk.test.tsx`: remove `onEditDescription={() => {}}` from every render; add:
```ts
it("has no Edit my description link (decision 6: the header back arrow does the same)", () => {
  render(<StepGapAsk {...props} />)
  expect(screen.queryByRole("button", { name: "Edit my description" })).toBeNull()
})
it("renders a spot gap: the whole schedule, the lime where? marker, and the spot hint", () => {
  const spotGap: GapPayload = { ...gap, missing: "spot", question: "Where do you usually meet for tennis?",
    rhythms: [{ ...rhythm, timeLocal: "09:00" }] }
  render(<StepGapAsk {...props} gap={spotGap} />)
  expect(screen.getByText("where?")).toBeTruthy()
  expect(screen.getByText(/Sat at 9am/)).toBeTruthy()
  expect(screen.getByText("Here's what I got. One question: Where do you usually meet for tennis?")).toBeTruthy()
  expect(screen.getByText("e.g. “Movement Gowanus” · “Sam’s place”")).toBeTruthy()
})
```
  (use whatever the file's existing props object is called; if it has none, build one from the existing render calls).
  - `OnboardingWizard.test.tsx`: one test driving the real loop to the exhausted message. `extractMock` resolves `{ status: "incomplete", gap: { missing: "spot", question: "Where do you usually meet for padel?", groupName: "Padel Crew", rhythms: [{ ...RHYTHMS[0], venueName: null }], candidateTimeLocal: null } }`; make `mergeGapAction` a controllable `vi.fn` resolving `{ status: "exhausted", missing: "spot" }`; type `idk` into `Message Orbit`, click `Send answer`; expect the step 1 bubble to read `EXHAUSTED_COPY.spot` and `screen.queryByText(/Add the day and time/)` (the old single string) to be null. `mergeGapAction` is currently mocked as a bare `vi.fn()` inside the module factory; hoist it (`vi.hoisted`) so this test can set its resolved value.
- [ ] **Step 2: Run and see them fail:** `npx vitest run src/app/create/__tests__/StepGapAsk.test.tsx src/app/create/__tests__/OnboardingWizard.test.tsx`.
- [ ] **Step 3: Implement.** `StepGapAsk.tsx`: delete the button (StepGapAsk.tsx:275-293) and the prop; update the header comment. `OnboardingWizard.tsx`: the state change above; `setExhaustedMissing(result.missing)` in place of `setGapExhausted(true)`; every `setGapExhausted(false)` becomes `setExhaustedMissing(null)`; drop `onEditDescription` from the `StepGapAsk` render; update the two comments that say "two answers" to "three".
- [ ] **Step 4: Run** `npx vitest run src/app/create src/app/actions src/lib/orbit`: pass. `npx tsc --noEmit -p .`: zero errors outside `src/app/zz-mock/`.
- [ ] **Step 5: Commit** `"Drop the gap-ask's edit link, and name what is still missing after three answers"`

---

### Task 11: verification and the record (coordinator)

- [ ] Delete `src/app/zz-mock/` (git-excluded, so nothing to commit), then full suite from the worktree: `npm run db:which`, then `npx vitest run`. Record passed/total against the 2146 of 2146 baseline in the §11 entry, naming the files added and deleted so the count reconciles.
- [ ] Stop the dev server, then `npx next build --webpack`: exit 0. Restart the dev server after.
- [ ] **Picture check, before the QA handoff:** at 375x812 on the real build, screenshot the gap-ask with time and place missing, the gap-ask with the place alone, step 2 read-only, step 2 with the editor open (with a monthly second activity), step 1 after three answers, and group info's editor with a monthly activity. Compare each against Task 0's `mock-*.png` and the words in "The approved picture" (the words win where they differ: no timezone line in the editor, no chips or time for beers). Fix any difference before handing over.
- [ ] Real-phone pass on the LAN address (`ipconfig getifaddr en0`, checked against `next.config.ts`'s allowed dev origins): new layout on step 2, and the editor changes vertical space. Check the sticky band on a tall editor, that opening the editor raises no keyboard, and that the step 2 card fits one screen. Stop the dev server after.
- [ ] `docs/build-notes.md`, the §11 entry (append-only), 400 to 600 words in product language: what was decided (flat kinds and why; the place check on the model's question and the fallback; the non-answer guard; three answers; the shared form body; `showPlace` removed), the bench numbers and cost from Tasks 5 and 7, the debt from the front section plus anything found, and the out-of-lane touches (none planned). No migration, so no after-launch item; confirm by reading the final diff for `prisma/` changes (there must be none).
- [ ] `CLAUDE.md` current state: rewrite the onboarding sentence at line 17 (the gap-ask now resolves a missing day, time, or main spot; step 2 is read-only playback with `Edit details`; drop "the founder can add the group's meeting spot at the playback step" and the dated "ruled to change" parenthetical); amend with dated notes, never delete, the "venue stopped hiding on onboarding step 2" paragraph (its button no longer exists) and the group-details paragraph's "On onboarding step 2 each activity has a quiet 'Change day or time'" sentence; add a short paragraph for this slice with its debt.
- [ ] Independent read-only review of the assembled diff, then the PR (body near 300 words, review report included, `pr-review-guard` requires it), then the QA script in chat per `~/.claude/checklists/pr-handoff.md`, seeded so the founder can reach each gap shape by typing a description.

### Self-review (done while writing)

- **Front section coverage.** 1 (main spot required, others optional, Orbit asks) → T2 rules 2-4, T1 copy, T6 prompts. 2 (one message, lime marker) → T1 markers and combined fallbacks, T1 place check in `resolveGapQuestion`, T6. 3 ("idk" is no spot, ask again) → T2 guard and carry-over, T6 merge rule, T4 `merge-spot-idk` and `merge-spot-figure-it-out`, T3 merge test. 4 (three answers, then a message naming what is missing) → T1 `MAX_GAP_ROUNDS` and `EXHAUSTED_COPY`, T3 exhausted `missing`, T10. 5 (read-only step 2) → T9. 6 (Edit details, editor in place, gap-ask loses its link) → T9, T10. 7 (non-weekly shows name and spot on both surfaces, no timezone line) → T8 (group info and the shared body), T9 test 6 (step 2). 8 (server refuses) → T3. 9 (secondaries captured and shown, floated ideas unaffected) → T2 "never asks about a secondary", T9 test 1 (beers row shown), no change to spark or events. 10 (pictures) → the approved-picture section, T0, T11. Verification list → T1-T3, T8-T10 tests; bench red then green with cost → T4, T5, T6, T7; 375px and real phone → T11. Debt → T11 record.
- **Choices beyond the front section, declared.** The place check on a model question for a spot kind, and the deterministic non-answer list, both enforce decisions 2 and 3 in code rather than trusting the prompt alone (the claim-to-fact rule). `showPlace` is removed in Task 9 rather than left unused (kept through Task 8 so the suite stays green between the two). `PlaybackRow`'s `venue` slot is deleted because its only caller goes. The existing bench cases are restated, not loosened, because the gate changed under them.
- **Known limit, not built:** the editor accepts a typed "idk" as a spot (the non-answer guard lives in the model path, not in `cleanVenueName`, which also reads stored rows). Decision 3 is about Orbit's conversation; a founder typing a non-answer into a box is their own word. Worth one line in the record.
- **Placeholder scan:** no TBD or "similar to" steps; the two merge cases written with spread shorthand in this document carry an explicit instruction to write them in full.
- **Names cross-checked:** `ScheduleGap`, `SpotGap`, `MissingField`, `needsSpot`, `withSpot`, `scheduleGapOf`, `isNonAnswerVenue`, `GAP_ASKABLE_KINDS`, `gapFallbackQuestion`, `resolveGapQuestion(missing, raw, activity)`, `EXHAUSTED_COPY`, `MergeGapResult` exhausted `missing`, `RhythmFields.showSchedule`, `GroupDetailsFields`, `EditDetailsCard`, `Step2Playback.onDetailsChange`, `exhaustedMissing`.
