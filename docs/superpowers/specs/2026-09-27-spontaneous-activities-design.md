# Spontaneous activities are explained, not stored

Designed 27 Sept 2026 on branch `spontaneous-activities`, from the owner's
27 Sept phone QA of the step 2 cleanup (build-notes §11, "onboarding step 2
cleanup", 27 Sept postscript, "Tennis and pizza blend together"). Item 2 of
his 27 Sept queue order.

---

## Front section

**Settled with the owner, 27 Sept 2026. Do not relitigate.**

1. **Only the main weekly activity is stored for a new group.** Everything
   else the founder mentions (beers now and then, a monthly pizza, a second
   weekly activity) is not a stored row; floating it in chat is how it
   happens.
2. **Orbit says so once, in step 2's opening bubble**, only when the founder
   mentioned something extra: "I'll put climbing on the calendar every
   week. For beers, just say it in the group chat when someone's up for it,
   like "beers Friday?" I'll take it from there." Two or three extras are
   listed; more than three read "the other things you mentioned".
3. **Not a second bubble below the card**, not in the gap-ask, not in the
   group chat.
4. **Older groups keep their rows** and keep showing them. No migration.
5. **Pictures approved 27 Sept**, with the owner's two copy changes.

**Non-goals.** Any Orbit prompt change (the model already finds every
activity; the split is plain code after it). Cleaning up older groups'
rows. A chat message teaching members to float plans.

**Verified by.** Tests, red first: the split, the sentence for 0 to 4+
extras, both onboarding actions, the server storing only the main activity,
step 2 showing the sentence. Bench: new cases confirming the model still
names the extras, run once (nothing in the model path changes, so a before
run cannot differ). Not tested: layout; a 390px browser pass with real model
calls, then the owner's phone.

**Debt expected.** A floated plan in a new group no longer inherits a place
from a stored secondary activity ("beers at Lucky Lab"); it starts as Place
TBD and anyone can set it on the plan's page.

---

## Tasks

### Global constraints

- TDD: every behaviour test is written and shown failing before the change.
- Orbit's copy: no em or en dashes; plain 7th to 8th grade words.
- Do not touch `src/lib/orbit/extract.ts`, `merge.ts`, `normalize.ts`,
  `gap.ts`, `replay.ts` or any prompt. The model path is unchanged on
  purpose: `normalizeExtraction` keeps returning every activity, and the
  replay and merge calls keep seeing them. The split happens at the two
  onboarding action boundaries and the server confirm.
- Do not touch `src/lib/gauges/promote.ts`, group info, the join screen or
  the details editor: they render and edit whatever is stored, so a new
  group shows one activity and an older group keeps its rows.
- Run `npm run db:which` before any test run that touches the database.

### File map

- `src/lib/orbit/main-activity.ts` (new): `splitMainActivity`.
- `src/lib/orbit/playback.ts`: `formatOtherActivitiesNote`.
- `src/app/actions/extract-group.ts`: split both result paths, return
  `otherActivities`.
- `src/app/actions/merge-gap.ts`: store only position 0 on both result paths.
- `src/app/actions/create-group.ts`: write only position 0.
- `src/app/create/OnboardingWizard.tsx`, `Step2Playback.tsx`: carry and show
  the sentence.
- `evals/onboarding/cases.ts`: new `extract-others-*` cases.
- Tests beside each.

### Task 0: open the record (coordinator)

Baseline into build-notes §11 as a new entry: 2265 of 2265 across 182 files
at `4410449`, matching the gap-ask-thread finish exactly. Commit this document.

### Task 1: the split and the sentence (pure functions)

`splitMainActivity(rhythms: StoredRhythm[]): { rhythms: StoredRhythm[];
otherActivities: string[] }`. Returns `rhythms[0]` alone (empty in, empty
out) and the other activities' `activity` names: trimmed, empties dropped,
deduplicated case-insensitively (first spelling wins), and any name equal
(case-insensitive) to the main activity's dropped. Order preserved.

`formatOtherActivitiesNote(main: string, others: string[]): string | null`
in `playback.ts`. Null for no others. Otherwise exactly:

`I'll put ${main} on the calendar every week. For ${list}, just say it in
the group chat when someone's up for it, like “${others[0]} Friday?” I'll
take it from there.`

`list`: one name as is; two as "a and b"; three as "a, b, and c"; four or
more as "the other things you mentioned" (the example still uses
`others[0]`). Curly quotes as shown. Tests pin each count with the full
string, and assert no em or en dash in any output.

### Task 2: the onboarding actions return the split

`extract-group.ts`: on `ready`, `profile.rhythms` becomes the split's
`rhythms` and the result gains `otherActivities` (on the profile). On
`incomplete`, `gap.rhythms` becomes the split's `rhythms` and the result
gains `otherActivities` (on the gap). Compute the split AFTER the existing
unusable check and after the gap question is resolved from
`normalized.rhythms[0]`, which the split does not change. Update the result
types.

`merge-gap.ts`: both its ready and incomplete results carry only position 0
(`splitMainActivity(...).rhythms`); no `otherActivities` there, since the
wizard keeps the ones from extraction. The merge input it builds from the
client is unchanged.

Tests: with a stubbed model returning climbing plus beers, the extract
action returns one rhythm and `["beers"]` on both paths; the merge action
returns one rhythm when the model re-adds beers.

### Task 3: the server stores only the main activity

`create-group.ts`: after the existing gate and spot check, pass
`rhythms.slice(0, 1)` to `provisionFounderGroup`. Truncate, do not refuse:
a founder whose wizard was opened before this deploy may still hold two
rows, and refusing would strand them. Comment says so. Test: a two-row
payload creates a group whose stored `recurringActivities` has length 1 and
is the climbing row.

### Task 4: the wizard carries the extras, step 2 says them

`OnboardingWizard.tsx`: hold `otherActivities: string[]`, set from every
extract result (ready and incomplete, including the prior-answers path),
reset to `[]` when a new extraction starts, never touched by a merge
result. Pass it to `Step2Playback`.

`Step2Playback.tsx`: new prop `otherActivities: string[]`. When
`formatOtherActivitiesNote(rhythms[0].activity, otherActivities)` is
non-null, the opening tailed bubble renders it as a second paragraph under
"Here's what I understood." (`margin: "0.5rem 0 0"`, as in the approved
picture). Same bubble in edit mode. Nothing else on the card changes.

Tests: step 2 shows the sentence with one extra and not with none; the
wizard passes extras from extraction through a merge round to step 2, and
a second extraction replaces them.

### Task 5: bench cases for the extras

Add to `evals/onboarding/cases.ts`, ids prefixed `extract-others-`, each
graded through `splitMainActivity(outcome.normalized.rhythms)`:

1. "we climb at Movement Gowanus every Tuesday at 7pm, and grab pizza now
   and then": main is climbing; others are exactly ["pizza"]; status ready.
2. "we climb Tuesdays at 7pm at Movement Gowanus and run Saturday mornings
   in Prospect Park": main is climbing (the one with a time); others
   contain one entry naming running; status ready.
3. "we play tennis Sundays at 10am at the Riverside courts, and sometimes
   do beers, board games, or a movie": main is tennis; others has three
   entries.
4. "we get beers sometimes": normalized status incomplete with
   `nothing_schedulable` (the founder goes back to step 1, as today).

Existing cases are untouched: `normalizeExtraction` still returns both
rows, so "both rhythms survive" stays true.

### Task 6: verification and the record (coordinator)

Bench: `npm run eval:onboarding -- 5 extract-others`, spend reported.
Full suite, production build. Browser at 390px against the worktree dev
server with real model calls: one extra, three extras, none, the editor,
and a created group's info page showing one activity. Whole-branch review.
Build-notes §11 entry, CLAUDE.md current state (including the venue
guardrail's "other activities" wording and the debt), PR with the QA
script.

### Self-review (done while writing)

No placeholders. The split point is stated once (actions and confirm) and
the model path is fenced off in the constraints. Task 2's ordering note
keeps the gap question reading the unsplit list, which is the same list at
position 0.
