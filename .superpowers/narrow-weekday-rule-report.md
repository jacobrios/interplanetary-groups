# Narrowing the weekday-naming rule

Branch: `fix/bench-learns-day-prominent-shapes`. Work done in place, no worktree.

## 1. The prompt sentence

File: `src/lib/orbit/extract.ts`, `FIELD_RULES`, `suggestedGroupName` line.

Before:
```
Never name a group after a day of the week: a group that meets on more than one day is not a Monday group, and any group can change its day later.
```

After:
```
Only name a group after a day of the week when the group meets on exactly one day: a group that meets on more than one day is not a Monday group.
```

Verification of exact transcription: ran `git diff src/lib/orbit/extract.ts` after the edit and
read the diff character by character against the owner-approved wording given in the task. The
`Edit` tool replaced only the exact old sentence with the exact new sentence (a single
`old_string`/`new_string` swap), so everything before and after the changed sentence on that line
is byte-identical to before, confirmed by the diff showing a single-line change with the rest of
the line's text unchanged on both sides. `FIELD_RULES` is not forked; `merge.ts` still imports it
verbatim (confirmed: `import { FIELD_RULES, callExtractionModel } from "./extract"` and
`${FIELD_RULES}` inside merge's own system prompt, untouched).

Grepped the repo for `Never name a group after a day`, `Monday group`, and `meets on more than one
day`: only `extract.ts` matched, so no unit test or other file asserts the old sentence and none
needed updating.

## 2. The bench's conditional assertion

File: `evals/onboarding/cases.ts`.

Design: split what had been one `NAME_ASSERTIONS` array (four checks: non-empty, no-weekday, three
words or fewer, safe characters) into two things:

- `NAME_ASSERTIONS` (now three checks: non-empty, three words or fewer, safe characters) — applies
  to every case unconditionally, unchanged in meaning.
- `NO_WEEKDAY_NAME`, a single `Assertion` — the weekday bar, pulled out on its own with a doc
  comment stating the owner's ruling in the codebase's own voice: "a group that meets on more than
  one day is not a Monday group, but a group that only ever meets on Saturday is rightly named
  'Saturday Morning Runners.'"
- `nameAssertions(multiDay: boolean): Assertion[]`, a small function that returns the three base
  checks, plus `NO_WEEKDAY_NAME` only when `multiDay` is `true`.

Every case site now spreads `...nameAssertions(true)` or `...nameAssertions(false)` instead of
`...NAME_ASSERTIONS`, each with a one-line comment naming the case's own day count and why the bar
does or doesn't apply, e.g. `// Mon/Wed/Fri: more than one day, so a weekday name is barred.` or
`// Saturday only: one day, so a weekday name is allowed, not required.` This was the deliberate
shape: rather than inferring "multi-day" from the founder text or the case id, the boolean is
passed explicitly at each site, matching each case's own `daysAre([...])` expectation, so a future
reader sees at a glance which cases bar a weekday and can check it against the days array two lines
away without cross-referencing anything.

Multi-day vs. single-day, case by case (all extraction cases have exactly one rhythm with a stated
`daysOfWeek`, except `extract-two-rhythms`, discussed below):

- `extract-multi-day` — days `[1, 3, 5]` — **multi-day**, bars the weekday word. This is the one
  case the rule still protects and the one that must never regress.
- `extract-single-day`, `extract-no-time`, `extract-with-venue`, `extract-no-venue`,
  `extract-day-prominent-run`, `extract-day-prominent-beers`, `extract-own-words-book-club`,
  `extract-own-words-family-dinner` — each has a single stated day — single-day, weekday word
  allowed.
- `extract-two-rhythms` — the primary (climbing) rhythm is Wednesday only; the secondary (beers)
  rhythm states no day at all. There is still only one day in play, so this is single-day.
- All three merge cases (`merge-carry-forward`, `merge-ambiguous-time` on Tuesday;
  `merge-day-replacement`, which replaces the day with Saturday) are single-day.

**Merge cases: same treatment, and why.** The merge prompt shares `FIELD_RULES` verbatim with
extraction (by design, per the task's own note and confirmed in `merge.ts`), so the two calls
cannot be held to different naming rules. All three merge cases land on a single day, so they now
use `nameAssertions(false)` too. This changes nothing about their pass rate today (they were not
failing on the weekday check before), it only stops a weekday name from being penalized there in
the future if the model happens to produce one, which is consistent with the prompt they're
actually driven by.

I also fixed one now-stale doc comment: `groupNameIs`'s comment used to say "not just the four
shape checks in NAME_ASSERTIONS" (now three, and the weekday check moved out to a separate
function), updated to point at `nameAssertions`.

## 3. Re-measurement, two full runs of `npm run eval:onboarding -- 5`

### Run 1

```
> interplanetary-groups@0.1.0 eval:onboarding
> tsx scripts/eval-onboarding.ts 5

13 cases x 5 runs = 65 model calls
133 assertions, each scored over every run

  ...5/13
  ...10/13
  ...13/13

=== SCOREBOARD ===

extract-multi-day  (12/12 assertions clean)
    status is ready                         5/5
    activity is "climbing"                  5/5
    cadence is weekly                       5/5
    days are [1, 3, 5]                      5/5
    time is "08:00"                         5/5
    time not read as ambiguous              5/5
    title is "Climbing"                     5/5
    venue is null                           5/5
    name: non-empty                         5/5
    name: three words or fewer              5/5
    name: letters, numbers and spaces only  5/5
    name: no weekday word                   5/5

extract-single-day  (11/11 assertions clean)
    status is ready                         5/5
    activity is "board games"               5/5
    cadence is weekly                       5/5
    days are [4]                            5/5
    time is "19:00"                         5/5
    time not read as ambiguous              5/5
    title is "Board Games"                  5/5
    venue is null                           5/5
    name: non-empty                         5/5
    name: three words or fewer              5/5
    name: letters, numbers and spaces only  5/5

extract-no-time  (8/8 assertions clean)
    status is incomplete, gap "time"                  5/5
    activity is "climbing"                            5/5
    cadence is weekly                                 5/5
    days are [2]                                      5/5
    clarifying question survives as something to ask  5/5
    name: non-empty                                   5/5
    name: three words or fewer                        5/5
    name: letters, numbers and spaces only            5/5

extract-with-venue  (11/11 assertions clean)
    status is ready                         5/5
    activity is "climbing"                  5/5
    activity holds no venue words           5/5
    venue holds "Summit Gym"                5/5
    cadence is weekly                       5/5
    days are [2]                            5/5
    time is "19:00"                         5/5
    time not read as ambiguous              5/5
    name: non-empty                         5/5
    name: three words or fewer              5/5
    name: letters, numbers and spaces only  5/5

extract-no-venue  (5/5 assertions clean)
    status is ready                         5/5
    venue is null                           5/5
    name: non-empty                         5/5
    name: three words or fewer              5/5
    name: letters, numbers and spaces only  5/5

extract-two-rhythms  (10/10 assertions clean)
    status is ready                         5/5
    both rhythms survive                    5/5
    activity is "climbing"                  5/5
    cadence is weekly                       5/5
    days are [3]                            5/5
    time is "18:00"                         5/5
    time not read as ambiguous              5/5
    name: non-empty                         5/5
    name: three words or fewer              5/5
    name: letters, numbers and spaces only  5/5

extract-day-prominent-run  (9/11 assertions clean)
    status is ready                         5/5
  x activity is "running"                   2/5
    cadence is weekly                       5/5
    days are [6]                            5/5
    time is "07:00"                         5/5
    time not read as ambiguous              5/5
  x title is "Running"                      2/5
    venue is null                           5/5
    name: non-empty                         5/5
    name: three words or fewer              5/5
    name: letters, numbers and spaces only  5/5

extract-day-prominent-beers  (11/11 assertions clean)
    status is ready                         5/5
    activity is "beers"                     5/5
    cadence is weekly                       5/5
    days are [5]                            5/5
    time is "19:00"                         5/5
    time not read as ambiguous              5/5
    title is "Beers"                        5/5
    venue is null                           5/5
    name: non-empty                         5/5
    name: three words or fewer              5/5
    name: letters, numbers and spaces only  5/5

extract-own-words-book-club  (12/12 assertions clean)
    status is ready                         5/5
    activity is "book club"                 5/5
    cadence is weekly                       5/5
    days are [0]                            5/5
    time is "16:00"                         5/5
    time not read as ambiguous              5/5
    title is "Book Club"                    5/5
    name is "Book Club"                     5/5
    venue is null                           5/5
    name: non-empty                         5/5
    name: three words or fewer              5/5
    name: letters, numbers and spaces only  5/5

extract-own-words-family-dinner  (12/12 assertions clean)
    status is ready                         5/5
    activity is "dinner"                    5/5
    cadence is weekly                       5/5
    days are [0]                            5/5
    time is "18:00"                         5/5
    time not read as ambiguous              5/5
    title is "Dinner"                       5/5
    name is "Family Dinner"                 5/5
    venue is null                           5/5
    name: non-empty                         5/5
    name: three words or fewer              5/5
    name: letters, numbers and spaces only  5/5

merge-carry-forward  (10/10 assertions clean)
    status is ready                         5/5
    activity is "climbing"                  5/5
    cadence is weekly                       5/5
    days are [2]                            5/5
    time is "19:00"                         5/5
    time not read as ambiguous              5/5
    venue is null                           5/5
    name: non-empty                         5/5
    name: three words or fewer              5/5
    name: letters, numbers and spaces only  5/5

merge-ambiguous-time  (10/10 assertions clean)
    status is ready                         5/5
    activity is "climbing"                  5/5
    cadence is weekly                       5/5
    days are [2]                            5/5
    time is "07:00"                         5/5
    time not read as ambiguous              5/5
    venue is null                           5/5
    name: non-empty                         5/5
    name: three words or fewer              5/5
    name: letters, numbers and spaces only  5/5

merge-day-replacement  (10/10 assertions clean)
    status is ready                         5/5
    activity is "climbing"                  5/5
    cadence is weekly                       5/5
    days are [6]                            5/5
    time is "10:00"                         5/5
    time not read as ambiguous              5/5
    venue is null                           5/5
    name: non-empty                         5/5
    name: three words or fewer              5/5
    name: letters, numbers and spaces only  5/5

total: 659/665 assertion-runs passed

=== FAILURES (2 assertions) ===

[extract-day-prominent-run] activity is "running"  2/5
  x2 ready | name "Saturday Morning Runners" | rhythms: {activity "run", title "Run", cadence weekly, days [6], time 07:00, venue null}
  x1 ready | name "Saturday Running Club" | rhythms: {activity "run", title "Run", cadence weekly, days [6], time 07:00, venue null}

[extract-day-prominent-run] title is "Running"  2/5
  (same two failing runs, activity/title tied together as expected)
```

### Run 2

```
> interplanetary-groups@0.1.0 eval:onboarding
> tsx scripts/eval-onboarding.ts 5

13 cases x 5 runs = 65 model calls
133 assertions, each scored over every run

  ...5/13
  ...10/13
  ...13/13

=== SCOREBOARD ===

extract-multi-day  (12/12 assertions clean)
    status is ready                         5/5
    activity is "climbing"                  5/5
    cadence is weekly                       5/5
    days are [1, 3, 5]                      5/5
    time is "08:00"                         5/5
    time not read as ambiguous              5/5
    title is "Climbing"                     5/5
    venue is null                           5/5
    name: non-empty                         5/5
    name: three words or fewer              5/5
    name: letters, numbers and spaces only  5/5
    name: no weekday word                   5/5

extract-single-day  (11/11 assertions clean)
    status is ready                         5/5
    activity is "board games"               5/5
    cadence is weekly                       5/5
    days are [4]                            5/5
    time is "19:00"                         5/5
    time not read as ambiguous              5/5
    title is "Board Games"                  5/5
    venue is null                           5/5
    name: non-empty                         5/5
    name: three words or fewer              5/5
    name: letters, numbers and spaces only  5/5

extract-no-time  (8/8 assertions clean)
    status is incomplete, gap "time"                  5/5
    activity is "climbing"                            5/5
    cadence is weekly                                 5/5
    days are [2]                                      5/5
    clarifying question survives as something to ask  5/5
    name: non-empty                                   5/5
    name: three words or fewer                        5/5
    name: letters, numbers and spaces only            5/5

extract-with-venue  (11/11 assertions clean)
    status is ready                         5/5
    activity is "climbing"                  5/5
    activity holds no venue words           5/5
    venue holds "Summit Gym"                5/5
    cadence is weekly                       5/5
    days are [2]                            5/5
    time is "19:00"                         5/5
    time not read as ambiguous              5/5
    name: non-empty                         5/5
    name: three words or fewer              5/5
    name: letters, numbers and spaces only  5/5

extract-no-venue  (5/5 assertions clean)
    status is ready                         5/5
    venue is null                           5/5
    name: non-empty                         5/5
    name: three words or fewer              5/5
    name: letters, numbers and spaces only  5/5

extract-two-rhythms  (10/10 assertions clean)
    status is ready                         5/5
    both rhythms survive                    5/5
    activity is "climbing"                  5/5
    cadence is weekly                       5/5
    days are [3]                            5/5
    time is "18:00"                         5/5
    time not read as ambiguous              5/5
    name: non-empty                         5/5
    name: three words or fewer              5/5
    name: letters, numbers and spaces only  5/5

extract-day-prominent-run  (9/11 assertions clean)
    status is ready                         5/5
  x activity is "running"                   3/5
    cadence is weekly                       5/5
    days are [6]                            5/5
    time is "07:00"                         5/5
    time not read as ambiguous              5/5
  x title is "Running"                      3/5
    venue is null                           5/5
    name: non-empty                         5/5
    name: three words or fewer              5/5
    name: letters, numbers and spaces only  5/5

extract-day-prominent-beers  (11/11 assertions clean)
    status is ready                         5/5
    activity is "beers"                     5/5
    cadence is weekly                       5/5
    days are [5]                            5/5
    time is "19:00"                         5/5
    time not read as ambiguous              5/5
    title is "Beers"                        5/5
    venue is null                           5/5
    name: non-empty                         5/5
    name: three words or fewer              5/5
    name: letters, numbers and spaces only  5/5

extract-own-words-book-club  (12/12 assertions clean)
    status is ready                         5/5
    activity is "book club"                 5/5
    cadence is weekly                       5/5
    days are [0]                            5/5
    time is "16:00"                         5/5
    time not read as ambiguous              5/5
    title is "Book Club"                    5/5
    name is "Book Club"                     5/5
    venue is null                           5/5
    name: non-empty                         5/5
    name: three words or fewer              5/5
    name: letters, numbers and spaces only  5/5

extract-own-words-family-dinner  (10/12 assertions clean)
    status is ready                         5/5
  x activity is "dinner"                    4/5
    cadence is weekly                       5/5
    days are [0]                            5/5
    time is "18:00"                         5/5
    time not read as ambiguous              5/5
  x title is "Dinner"                       4/5
    name is "Family Dinner"                 5/5
    venue is null                           5/5
    name: non-empty                         5/5
    name: three words or fewer              5/5
    name: letters, numbers and spaces only  5/5

merge-carry-forward  (10/10 assertions clean)
    status is ready                         5/5
    activity is "climbing"                  5/5
    cadence is weekly                       5/5
    days are [2]                            5/5
    time is "19:00"                         5/5
    time not read as ambiguous              5/5
    venue is null                           5/5
    name: non-empty                         5/5
    name: three words or fewer              5/5
    name: letters, numbers and spaces only  5/5

merge-ambiguous-time  (10/10 assertions clean)
    status is ready                         5/5
    activity is "climbing"                  5/5
    cadence is weekly                       5/5
    days are [2]                            5/5
    time is "07:00"                         5/5
    time not read as ambiguous              5/5
    venue is null                           5/5
    name: non-empty                         5/5
    name: three words or fewer              5/5
    name: letters, numbers and spaces only  5/5

merge-day-replacement  (10/10 assertions clean)
    status is ready                         5/5
    activity is "climbing"                  5/5
    cadence is weekly                       5/5
    days are [6]                            5/5
    time is "10:00"                         5/5
    time not read as ambiguous              5/5
    venue is null                           5/5
    name: non-empty                         5/5
    name: three words or fewer              5/5
    name: letters, numbers and spaces only  5/5

total: 659/665 assertion-runs passed

=== FAILURES (4 assertions) ===

[extract-day-prominent-run] activity is "running"  3/5
  x2 ready | name "Saturday Morning Runners" | rhythms: {activity "run", title "Run", cadence weekly, days [6], time 07:00, venue null}

[extract-day-prominent-run] title is "Running"  3/5
  (same two failing runs)

[extract-own-words-family-dinner] activity is "dinner"  4/5
  x1 ready | name "Family Dinner" | rhythms: {activity "family dinner", title "Family Dinner", cadence weekly, days [0], time 18:00, venue null}

[extract-own-words-family-dinner] title is "Dinner"  4/5
  (same failing run)
```

## Per-case before/after comparison

Pre-change baseline (given in the task, from the day-prominent bench widening): 11 failures in 100
assertion-runs across the two probe runs that motivated this fix, 9 of them on
`extract-day-prominent-run`'s weekday-name checks and 2 on `extract-no-venue`'s weekday-name check.

Post-change, both runs combined (this report):

- **`extract-multi-day`** — "name: no weekday word" 5/5 + 5/5 = **10/10**. Unchanged and still
  passing; this is the one case the rule still protects, and it never regressed.
- **`extract-day-prominent-run`** — "name: no weekday word" assertion no longer exists on this
  case (removed by `nameAssertions(false)`), so it can no longer fail on weekday-naming. The only
  failures left are `activity is "running"` / `title is "Running"` (2/5, then 3/5 across the two
  runs), which is the pre-flagged, explicitly out-of-scope activity-naming-form residual ("run" vs.
  "running"), left untouched as instructed.
- **`extract-no-venue`** — "name: no weekday word" assertion also no longer exists on this case;
  it scored 5/5 + 5/5 = **10/10** clean on every remaining assertion in both runs. Whatever
  weekday-name behavior the model has here is now correctly unmeasured rather than incorrectly
  penalized.
- **`extract-day-prominent-beers`, `extract-own-words-book-club`** — clean in both runs, as
  before.
- **`extract-own-words-family-dinner`** — clean in run 1; in run 2, `activity is "dinner"` /
  `title is "Dinner"` failed once (4/5), on the pre-documented, separate "family" qualifier-drop
  behavior the case's own description already calls out as unrelated to the weekday question. Not
  a weekday-naming failure and not something this change touches.
- Every other case (`extract-single-day`, `extract-no-time`, `extract-with-venue`,
  `extract-two-rhythms`, all three merge cases) stayed fully clean in both runs, as they were
  before.

Net effect on the weekday check specifically: it now appears only on `extract-multi-day` (10/10
across both runs) and has been removed from every single-day case, where it can no longer produce a
false failure. No weekday-related failure occurred anywhere in either run.

## Multi-day case regression check

**Confirmed: `extract-multi-day` still passes.** 12/12 assertions clean in both runs, including
"name: no weekday word" at 5/5 and 5/5 (10/10 combined). This is the case the whole original slice
existed for, and it is the one case still required to bar a weekday name; it never dropped a single
assertion.

## Suite and typecheck

- `npm test -- --run`: **92 files passed (92), 923 tests passed (923)**, matching the recorded
  baseline exactly. No test asserted the old prompt sentence, so nothing needed updating there.
- `npx tsc --noEmit`: clean, no output, no errors.

## Records touched

- `docs/build-notes.md`: appended a dated annotation on the existing "The numbers" paragraph in the
  20 Aug 2026 titles/bench §11 entry (append-only, not rewritten), pointing forward to a new
  entry. Appended a new §11 entry, "the weekday rule narrows (narrow-weekday-rule slice, 20 Aug
  2026)," at the end of the document covering: why the original reading was unrepresentative (six
  same-shaped cases), the real breakdown (every failure single-day, the multi-day case clean
  10/10), the owner's ruling, and the post-change numbers.
- `CLAUDE.md`: amended the "Event titles no longer name a day..." line under "Where the build is"
  with two inline strikethrough-and-annotate corrections (never deleted, never rewritten): the
  claim that the wording "forbids weekday names" outright, and the "1/45 to 44/45 and 42/45"
  residual-rate claim that had been presented as an accepted measured fact. Both point to the new
  build-notes §11 entry for the full reasoning.

## What I was unsure about

- The task described the current build-notes wording as stating the residual rate as "roughly 1 in
  15." I could not find that literal phrase anywhere in `docs/build-notes.md` or `CLAUDE.md`; the
  actual recorded numbers are "no weekday word 1/30... 0/15... 1/45 combined" (build-notes) and
  "went from 1/45 to 44/45 and 42/45" (CLAUDE.md). I treated this as the task's own rough
  paraphrase of that combined figure rather than a literal string to find, and corrected the actual
  passages that presented a residual weekday rate as a settled, accepted number. Flagging this in
  case a different passage was intended and I missed it.
- For `extract-two-rhythms`, whether the secondary (beers) rhythm, which states no day at all,
  should count toward "multi-day." I treated it as single-day, since only one specific weekday
  (Wednesday, from the primary climbing rhythm) is ever stated for the group as a whole; there is no
  second day to conflict with. This reads as the correct application of the owner's rule but is a
  judgment call worth a second look if the owner disagrees.
