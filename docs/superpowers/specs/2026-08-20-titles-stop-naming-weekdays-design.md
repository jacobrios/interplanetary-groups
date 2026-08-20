# Slice: titles stop naming weekdays, and onboarding gets its first eval bench

Date: 2026-08-20. Branch: `slice/titles-stop-naming-weekdays`.

---

## Front section (for the product owner)

**Settled, do not relitigate.** The event title becomes the founder's title-cased activity word and
nothing else, on every path including single-day groups; "Climbing Sunday" is deliberately lost. The
title stays deterministic and the model never names an event. The group name stays model-generated
with tightened wording rather than becoming deterministic, because the founder edits it on the
playback card before the group exists. The deterministic fallback becomes the bare title-cased
activity ("Climbing"). Both onboarding prompts get benched, merge kept thin. The two capitalizers
unify on title-case through one shared helper. The bench is built and run against the current prompt
before the prompt changes, so the before-number is real.

**Not in this slice.** No migration for groups already holding a bad title: the dev-test database is
test data and the fix for any group that matters is to re-run onboarding. Venue, day, and rhythm
correction after creation stays queued as "founder can fix group details after creation." The step 2
name input's horizontal clipping is not fixed, because a single-line input scrolls rather than wraps
and shorter names are the only real remedy; it belongs to whatever slice reshapes that field. The
character counter stays declined per the 20 Aug postscript.

**How it will be verified.** A failing test at the two-to-six-day case, shown red before the fix. Suite
from 92 files / 922 tests green. Bench before-and-after numbers on both prompts. A browser walkthrough
of onboarding with a Mon/Wed/Fri description. A real-phone LAN pass, which is the owner's gate.

**Debt it opens.** The group name is still model output: the risk is now measured, not removed.
`promote.ts` is touched outside this slice's lane. The bench is the first thing here that costs money
to run on purpose, which makes "did you run it" a question the PR must answer honestly.

---

## Context an executing agent needs

### The two bugs, as diagnosed

**The event title freezes a weekday and then lies.** `deriveTitle` in `src/lib/orbit/normalize.ts`
builds `titleCase(activity) + " " + WEEKDAY_FULL[daysOfWeek[0]]`, taking the first day in the stored
array. A Mon/Wed/Fri climbing group gets "Climb Monday". That string is stamped into
`Group.recurringActivities` at onboarding (`normalize.ts:196`, written by
`src/lib/groups/provision.ts`) and copied forward verbatim by the reconciler
(`src/lib/orbit/reconcile.ts:91-96`) onto every occurrence, including the hourly Vercel cron's. The
date is computed separately and correctly, so a card reads "Climb Monday" above "Fri, Aug 21 - 8am"
while Orbit's own message below says "Next up: climb Fri at 8am". The screen contradicts itself.

There is a guard for the all-seven-days case (`length < 7`) and none for two-to-six days. No test
covers a two-to-six-day rhythm's title. `src/lib/orbit/__tests__/normalize.test.ts:53-57` pins
"Climbing Sunday" for the single-day case.

Blast radius is the label only: every other surface derives from `startsAt`. But the title also rides
into the founder's real calendar as the event name (`src/lib/events/ics.ts:88`), and
`src/lib/events/move.ts` touches only the times, so even a single-day group's title goes stale the
moment the group moves a plan.

**The spark path already does it right, which is the strongest argument for the fix.**
`src/lib/gauges/promote.ts:153` has a private `titleFor` producing "Beers" from "beers". A sparked
event has never carried a weekday. This slice makes onboarding agree with a rule the rest of the
product already follows, rather than inventing a new one.

**The group name is named after days because the prompt teaches it.** `suggestedGroupName` is model
output. Its only instruction is one line in `FIELD_RULES` at `src/lib/orbit/extract.ts:68`, whose sole
example is "Sunday Climbers". The same `FIELD_RULES` block is reused verbatim by the merge prompt
(`src/lib/orbit/merge.ts:41`), whose worked example is "Tuesday Climbers". The deterministic fallback
at `normalize.ts:250-252` is single-weekday too, producing "Monday Climb" for a Mon/Wed/Fri group.
Three places modelling the same wrong shape.

Two runs of the same description ("climb on Mondays, Wednesdays and Fridays at 8 AM") produced
"Monday Climbers" (accurate for one day in three, and misleading) and "Monday Wednesday Friday
Climbers" (accurate, 32 characters, clips inside the step 2 input). The prompt currently fails in
both directions.

### The standing rule that fires here

CLAUDE.md queues benches for onboarding extraction and the gap-ask merge with a trigger rather than a
date: "the first task of whichever slice next touches onboarding." Polish slice two waived it on the
grounds that a pixel-only slice touched no prompts, which was reasonable, and the owner's QA on that
slice then found exactly the gap a bench exists to catch. This slice changes both prompts, so the
trigger fires on both, and the owner has agreed to build it.

### Rules that govern the bench, from CLAUDE.md

The test suite tests the deterministic interpretation seam and never calls the model. Model behavior
is verified by a named hand-run bench, graded as a rate over N runs through the real production path,
never by a single clean walkthrough. Bench files must be provably outside the test runner's
collection. Baseline and after numbers go in the decision record. `npm run eval:detect` is the
existing pattern; copy its shape.

---

## Decisions taken during design, with reasoning

**One bench command, not two.** Both onboarding prompts share `FIELD_RULES` verbatim and both grade
through the same `normalizeExtraction` boundary, so they are one concern with two entry points rather
than two benches. They live under `evals/onboarding/` behind `npm run eval:onboarding`, with case ids
prefixed `extract-` and `merge-` so `eval-detect`'s existing id-substring filter idiom selects either
family for free. Two near-identical scripts and two near-identical scoreboards would have been the
duplication this codebase has already rejected once.

**Per-assertion scoring, which departs from detect.** Detect scores a case as one pass or fail because
a message has one outcome. Extraction returns eight fields at once, so a whole-case pass/fail hides
which field drifted: "2/5" tells you nothing about whether the days broke or the name did. Each case
carries named assertions scored as separate rates, so the scoreboard names the failing field. It
costs no extra model calls.

**The name is graded by predicate, every other field by equality.** The model legitimately varies on
the name, so equality would fail the bench for being right in a different way. The name's assertions
are: contains no weekday word, three words or fewer, non-empty, letters and numbers and spaces only.
Days, times, cadence, activity, venue, status and gap are graded by equality against what the founder
actually said.

**Task 1 lands before the bench, and that does not weaken the before-number.** The before-number
exists to measure the prompt change, which is task 4. Task 1's title change is deterministic and
covered by the suite, and the bench's title assertions must match post-task-1 behavior or they would
encode the bug.

---

## Tasks

Each task is one implementer and one independent read-only reviewer. The implementer's report is a
set of claims; the reviewer treats it as unverified. Work in place on this branch, no worktrees.

### Task 1: the event title loses its weekday, and the two capitalizers become one

**Write the failing test first and show it failing.** In
`src/lib/orbit/__tests__/normalize.test.ts`, add a case for a two-to-six-day rhythm: a climbing rhythm
with `daysOfWeek: [1, 3, 5]` and a stated time, asserting `r.rhythms[0].title` is `"Climbing"`.
Against current code this must produce `"Climbing Monday"`. Paste the failing output into the task
report before changing any source. A test that passes on its first run is not evidence here.

**Then the fix.** In `src/lib/orbit/normalize.ts`, `deriveTitle` collapses to the title-cased activity
on every path. The `isSchedulable(c) && c.daysOfWeek!.length < 7` branch goes entirely. Rewrite the
function's doc comment: the old one explains a weekday rule that will no longer exist, and a comment
describing absent behavior is worse than none. The new comment should say the title is the founder's
activity and nothing else, because the date sits directly under the title on every surface, so a
weekday in the title is duplicated information whose only possible future is to go stale.

Remove the `WEEKDAY_FULL` import from `normalize.ts` only if nothing else in the file uses it. Check
before deleting; the group-name fallback at line 250 also uses it today, and that line is task 4's,
not yours. If task 4 has not run yet, `WEEKDAY_FULL` stays.

**The shared capitalizer.** `normalize.ts` has a private `titleCase` capitalizing every word;
`promote.ts:153` has a private `titleFor` capitalizing only the first. After this task they produce
nearly the same string from the same raw material and differ only in case. Unify on title-case:
export one helper from `src/lib/orbit/rhythm.ts`, which already owns the shared rhythm vocabulary, and
have both call sites use it. Delete both private copies. `promote.ts` is outside this slice's lane and
is touched only for this extraction; verify its existing tests still pass and note the touch in your
report so the PR body can name it.

Behavior change to expect and not be alarmed by: a sparked "board games" event titles as "Board Games"
where it used to be "Board games". Pre-launch, test data only.

**Existing tests that must change, not be worked around.** `normalize.test.ts:53-57` pins "Climbing
Sunday"; rewrite it to "Climbing" and update the trailing comment, which currently reads "schedulable:
activity + weekday" and would become a lie. The seven-day test at 43-50 keeps passing unchanged but
its comment now explains a distinction that no longer exists; either fold it into the new general
case or rewrite its comment to say a seven-day rhythm is no longer a special case at all. Do not leave
a comment describing a branch that is gone.

Search the whole repo for other pinned titles before declaring done: `grep -rn "Climbing Sunday\|
Climb Monday\|Beers Tuesday"` across `src` and `scripts`, including the `qa-stage-*` scripts, which
seed data and may assert or display titles.

**Done when:** the new test is green, the suite is green, `tsc --noEmit` is clean, and the report
includes the failing-first output.

### Task 2: the onboarding bench harness and the extraction cases

Build `evals/onboarding/` and `scripts/eval-onboarding.ts`, modelled closely on `evals/detect/` and
`scripts/eval-detect.ts`. Read both of those first; match their structure, their comment voice, and
their dotenv-before-import ordering, which exists so `ANTHROPIC_API_KEY` is present at import time.

**File layout.**

- `evals/onboarding/cases.ts`: the fixtures and their types. A header comment stating this is NOT a
  test file, that it hits the real model, that it is scored as a rate, and that the filename
  deliberately avoids `*.test.ts` so Vitest's default glob never collects it. Copy the spirit of
  `evals/detect/cases.ts`'s header.
- `evals/onboarding/run.ts`: `runCase(c, runs)` returning per-assertion pass counts.
- `scripts/eval-onboarding.ts`: the CLI and scoreboard.
- `package.json`: `"eval:onboarding": "tsx scripts/eval-onboarding.ts"`.

**The real production path, and nothing mocked.** An extract case calls
`extractGroupProfile(description)` from `src/lib/orbit/extract.ts` and passes its raw result to
`normalizeExtraction` from `src/lib/orbit/normalize.ts`. Both are the real exports the product uses.
`extractGroupProfile` returns `unknown` on purpose: that is the claim-to-fact boundary, and the bench
grades the normalized fact, never the raw claim. Never touch the database.

**Types.** A case carries an id, a `kind` of `"extract"`, a one-line description, the founder's
`description` string, and a list of named assertions. An assertion is a name plus a predicate over
`NormalizedOnboarding`. Keep the predicate signature narrow enough that a case cannot reach past the
normalized shape.

**Scoring and the scoreboard.** Run each case `runs` times (default 5), evaluate every assertion on
every run, and report each assertion as `passes/runs`. The scoreboard prints one block per case with
its assertion lines, then a summary line of total assertion-runs passed. Any assertion below full
marks prints its case id, its name, and one line per failing run showing what was actually produced,
so a failure is diagnosable without a re-run. Mirror `eval-detect`'s concurrency approach (chunks of
5) so a full run stays near a minute.

**Bucket handling, and the honest-limits rule.** Do not invent a bucket vocabulary yet. Every
assertion in this task carries a bar. If a case turns out to have no right answer, bring it to the
controller rather than inventing an `ambiguous` bucket to make the board green; detect's four-bucket
system was earned case by case and is documented in `evals/detect/cases.ts`, and copying its
vocabulary without its history would be cargo cult. If the runner caps or samples anything, log what
was dropped: silent truncation reads as full coverage.

**The six extraction cases.**

1. `extract-multi-day`: "we climb on Mondays, Wednesdays and Fridays at 8 AM". Assert status ready,
   activity "climbing", cadence weekly, days `[1, 3, 5]`, time "08:00", not ambiguous, title
   "Climbing", venue null. Plus the name predicates. This is the case the whole slice exists for.
2. `extract-single-day`: a one-day rhythm with a clear time. Assert the same field set for one day,
   and title equal to the bare activity, which is the behavior change task 1 shipped.
3. `extract-no-time`: a stated day with no stated time. Assert status incomplete and the gap
   classified as the time gap, and that `clarifyingQuestion` survives normalization as something to
   ask. Read `classifyGap` in `normalize.ts` for the exact `MissingField` values before writing the
   assertion; do not guess the string.
4. `extract-with-venue`: a description naming a place, phrased so the place must not leak into the
   activity ("we climb at Summit Gym on Tuesdays at 7pm"). Assert activity is "climbing" with no
   venue words in it, and `venueName` holds the place. This guards the prompt's "never move the place
   into activity" rule.
5. `extract-no-venue`: a description naming no place at all. Assert `venueName` is null. This guards
   "never invent a venue", a rule the prompt states and nothing currently proves.
6. `extract-two-rhythms`: two activities where only one is schedulable, the schedulable one not
   listed first in the sentence. Assert the schedulable rhythm is at position zero, both rhythms
   survive, and status is ready. This guards the primary-promotion behavior.

**The name assertions, applied to every extract case.** No weekday word anywhere in the name, matched
case-insensitively against all seven full weekday names and their three-letter abbreviations as whole
words; three words or fewer; non-empty; letters, numbers and spaces only. Write them once and reuse
them across cases rather than restating them per case.

**Run it and report the numbers.** Run `npm run eval:onboarding -- 5 extract` against the current
unmodified prompt and paste the full scoreboard into your report. This is the before-number. Expect
the name assertions to fail on `extract-multi-day` and expect the structured fields to be clean. **If
the structured fields are noisy, stop and report it rather than tuning anything.** That would be a
finding this slice did not go looking for and it belongs to the owner, not to you.

**Done when:** the bench runs, the scoreboard is legible, the before-numbers are in the report, and
`npx vitest list` proves the eval files are not collected by the runner. Include that proof.

### Task 3: the merge cases

Depends on task 2's harness. Add `kind: "merge"` cases to `evals/onboarding/cases.ts` and the
matching branch in `run.ts`.

A merge case calls `mergeGapAnswer(input)` from `src/lib/orbit/merge.ts` and normalizes the result the
same way. Read `MergeGapCallInput` at `merge.ts:52` for the exact shape: it needs the founder's
original description, the carried group name, the current partial state as `StoredRhythm[]` with the
gapped primary at position zero, and the candidate time when that is the open gap.

**Three cases.**

1. `merge-carry-forward`: the documented past failure. Current state holds activity "climbing"; the
   founder answers a question about the time. Assert the activity comes back as "climbing" character
   for character. This is the CLIMBING-to-CLIMB drift recorded in CLAUDE.md's stored-state guardrail,
   and it is the single most valuable merge case because it has actually happened.
2. `merge-ambiguous-time`: candidate time "19:00", we asked whether it is morning or evening, the
   founder answers "evening". Assert `timeLocal` is "19:00" and the ambiguity is resolved. Check how
   normalize represents a resolved ambiguous time before asserting; `toStored` nulls an ambiguous time
   on every path, so the assertion is that a time survives at all.
3. `merge-day-replacement`: the founder's answer contradicts the stored day ("actually Saturdays at
   10am"). Assert the days and time are replaced, not merged, per the latest-word-wins rule.

The name predicates from task 2 apply to merge cases too, since `FIELD_RULES` is shared and the merge
prompt carries its own worked example of the wrong shape.

**Run and report:** `npm run eval:onboarding -- 5 merge` against the current unmodified prompt. Before-numbers into the report.

### Task 4: the prompt stops teaching the weekday shape

Three edits, all approved by the owner in this exact wording.

**`src/lib/orbit/extract.ts:68`**, the `suggestedGroupName` line in `FIELD_RULES`, becomes:

> `- suggestedGroupName: a short plain name for the group, 2 or 3 words and never more than 3, built from the activity in the founder's own words. Letters, numbers and spaces only. Never name a group after a day of the week: a group that meets on more than one day is not a Monday group, and any group can change its day later. If the founder named a place, you may use it ("Summit Gym Climbers"). Otherwise pair the activity with a plain everyday word for a group of people ("Climbing Crew", "Board Game Club"). No jokes, no puns, no wordplay: the whole group sees this name and a clever one cannot be taken back.`

Do not paraphrase, reflow, or "improve" this. It is approved copy. `FIELD_RULES` is a template
literal shared verbatim by both prompts, which is the point; do not fork it.

**`src/lib/orbit/merge.ts:41`**, the worked example's `CURRENT UNDERSTANDING` line, changes
`"suggestedGroupName":"Tuesday Climbers"` to `"suggestedGroupName":"Climbing Crew"`. The example
otherwise stands: it is teaching latest-word-wins, and its group name is incidental to that lesson but
still teaching the wrong shape by example.

**`src/lib/orbit/normalize.ts:250-252`**, the deterministic fallback, becomes the bare title-cased
activity: `titleCase(primary.activity)`, using the shared helper task 1 extracted. Delete the
`WEEKDAY_FULL` interpolation. If this was the file's last use of `WEEKDAY_FULL`, remove the import.
Rewrite the surrounding comment if it explains the weekday shape.

`NAME_MAX` stays at 50. It is a hard truncation guard and truncating a name mid-word is worse than a
long one; the three-word instruction is what actually shortens names.

**Tests, and these line numbers were checked rather than guessed.** `normalize.test.ts` asserts
`"Sunday Climbers"` at lines 40, 262 and 297-ish; those are model-suggestion passthrough and cleaning
tests, and they must keep passing untouched. The *fallback* path is pinned at **lines 309, 315 and
319**, all asserting `"Sunday Climbing"` (the old `WEEKDAY_FULL[0] + titleCase(activity)` shape) for
a null name, a blank name, and a wrong-typed name. All three become `"Climbing"`. Read each one and
update its expectation and any comment that explains the weekday shape; do not blanket find-and-replace,
because two of those three are really testing input sanitization and only incidentally assert the
fallback string.

**Done when:** suite green, `tsc --noEmit` clean, and the diff contains no rewording of the approved
copy.

### Task 5: the after-numbers

Run the full bench twice over, `npm run eval:onboarding -- 5`, and paste both scoreboards. Two runs
because a single clean pass is the model equivalent of a test that cannot fail, and because the 18-19
Aug drift episode showed a case moving between runs on the same code.

Compare against task 2 and task 3's before-numbers field by field. Report honestly:

- If the name assertions went to full marks, say so with the numbers.
- If any assertion regressed, that is a finding, not something to tune away. Report it and stop.
- If a case is flaky between the two runs, say which and by how much. Do not average it into a
  clean-looking number.

Do not tune the prompt to chase a score without bringing the proposed change to the controller first.
The wording is the owner's approved copy and changing it is his call, not the bench's.

### Task 6: the record

**`docs/build-notes.md` §11**, a new dated entry, 400 to 600 words. It must carry: the two bugs as
diagnosed and why the title one was invisible for so long (the date was always right, so only a
person reading the card and Orbit's message together would catch it); the four decisions the owner
settled and the reasoning behind each, especially why the group name stays model-generated when his
own stated worry pointed at making it deterministic; the bench's departure from detect's grading and
why; the before-and-after numbers; and the debt.

Also append the postscript that the 20 Aug entry promises and does not contain. That entry's last
line reads "Written up in their own postscript below" and the file ends there. Either write that
postscript or amend the line to point at this slice's entry. Records are append-only: a dated
annotation, not a rewrite.

**`CLAUDE.md`**, the "Where the build is" section: state what is now true about event titles and
group names. Strike through, with a date, the two "no eval bench" claims in the "Still missing, and
known" paragraph, which say extraction and merge "have only ungraded hand-run scripts". That is the
sentence that goes stale the moment this slice lands, and it loads every session.

Check whether this slice creates a deploy-time obligation. It does not add an environment variable or
a migration, so the pre-deploy checklist should be unchanged; confirm that rather than assume it.

### Task 7: the browser walkthrough and the QA staging

Run onboarding end to end in the browser against the dev-test database, after confirming
`npm run db:which` prints the dev-test ref. Use a Mon/Wed/Fri description with a stated time.

**Verify by rendering, not by reading the diff:** the playback card shows a name with no weekday in
it; the created group's card shows the bare activity as the title above a correct date; Orbit's own
message below the card agrees with the card. Screenshot the group home showing the title and the date
together, because that pairing is the bug and the screenshot is the evidence it is fixed.

Then prepare the owner's handoff per `~/.claude/checklists/pr-handoff.md`: state seeded, dev server
running on the machine's LAN address, and the link he receives pointing at **`/create` directly, not
`/`**. His phone's session already belongs to a group and `/` correctly sends such a session straight
in, which would skip the entire thing under test.

---

## Verification summary

| What | Evidence |
|---|---|
| Title no longer names a weekday | Failing test shown red first, then green; suite from 92/922 |
| The fix reaches the real screen | Rendered group home screenshot, title and date together |
| Prompt no longer teaches the shape | Bench before-and-after, name assertions, two after-runs |
| Structured extraction did not regress | Every non-name assertion at full marks, before and after |
| Bench cannot masquerade as the suite | `npx vitest list` output showing eval files uncollected |
| Real-device behavior | Owner's phone pass. The build cannot produce this. |
