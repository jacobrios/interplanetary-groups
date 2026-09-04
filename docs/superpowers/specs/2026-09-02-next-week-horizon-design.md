# The "next week" horizon fix

Designed 3 September 2026, ahead of execution, in a worktree cut off `main` at
`d2c5031`. Ranked **first** in the queue the owner settled on 3 September
(build-notes §11, "what Orbit can hear"), because it is the only queued item
where Orbit says something *wrong* rather than merely incomplete, and a
confidently wrong date is what makes a person stop trusting it.

Test-suite baseline recorded at slice start, by running the suite rather than by
copying a number out of an older document: **1704 passed of 1704, across 146
files, zero pre-existing failures**, at `d2c5031`.

Source material, both on `main` and both required reading before the first edit:
build-notes §11, "Next week got answered with this Friday", **and its same-day
correction**, which withdraws the copy-only fix and adds the second broken case.

---

## Front section

**Settled with Jacob, 3 September 2026, do not relitigate.**

1. **A week runs Monday to Sunday, and "next week" is the week after the one
   today sits in.** On a Saturday, "beers next Friday" is the Friday six days
   later, not thirteen.
2. **"This week" earns its place by suppressing the notice buffer**, so
   Thursday's "we should grab beers this week" proposes tomorrow instead of next
   Friday.
3. **Orbit picks a reading and discloses it once**, never asks. The clause is
   "You said next Friday, so I'm taking that as the one after this week."

**Non-goals, each with where it belongs instead.** No new intent class; the
classifier still decides spark / change / answer / dayComment exactly as today.
No horizon on the answer, dayComment or change paths (their own slices, if ever).
Nothing beyond two values: "this weekend", "in two weeks" and "sometime next
month" all stay `null` and keep today's behaviour exactly. No recovery path for
"no, I meant the week after" (still open, build-notes §11). Override-learning
(§5) remains the named successor to this whole placeholder family.

**How it will be verified, written before any code.** Three instruments, split by
which one can prove its half honestly. Vitest with a frozen clock owns the date
arithmetic, all six cells. `eval:detect` owns the extracted field and never a
resolved date. One lived message in a dev group owns the copy. Details below.

**Debt this opens.** A week-start convention joins the undated-placeholder
family. The disclosure string becomes a fifth member of the copy family. The
bench still cannot grade a resolved date.

---

## The bug, in two cases with one cause

Both were caused by the same missing field, and a fix that closes one and ships
feels finished and is not.

1. **Observed in production, Wednesday 26 August 2026.** A member typed "we
   should grab beers next week". Orbit answered "Beers this Friday?" and opened a
   gauge for Friday the 28th, two days later, inside the week the member had just
   excluded.
2. **Read from the code, not observed.** "beers next Friday" on that same
   Wednesday *also* lands on Friday the 28th, because `chooseProposedDate` takes a
   stated weekday at face value with no buffer. Here the member named their day
   explicitly and still got half-heard.

**Nothing misfired.** The intent prompt tells the model that a phrase naming no
weekday returns `null` for `statedDayOfWeek`, so `null` was correct.
`normalizeSpark` passed it through correctly. `chooseProposedDate` applied its
documented fallback correctly. The information was lost **at the schema**: none
of the five spark fields can hold a horizon. This is an input with no data home,
this project's signature failure mode, not a misread. Do not go looking for a
model mistake; there isn't one.

---

## 1. The field

`horizon: "thisWeek" | "nextWeek" | null`, added to the **spark half only** of
`INTENT_SCHEMA` and to `NormalizedSpark` in `src/lib/orbit/spark.ts`.

`normalizeSpark` accepts exactly those two strings and turns everything else,
including a missing key, a wrong case, and any other string, into `null`. That is
the claim-to-fact boundary doing its ordinary job, and it means the worst a
confused model can do on this field is return the product to today's behaviour.

**Nothing is stored.** The horizon is consumed at gauge creation and the resolved
date is what lands in the row, exactly as today. No migration, no deploy
obligation, no change to existing gauges.

**Confirmed by reading, and it corrects the 3 September entry:** this does **not**
reach the onboarding prompt. `INTENT_SCHEMA` and `INTENT_SYSTEM_PROMPT` live in
`spark.ts` and are referenced only there and in its own tests; onboarding
extraction (`extract.ts`, `merge.ts`) shares no import with them and has no
horizon-shaped field. The queue entry says "both eval benches"; only
`eval:detect` is actually reached. Do not spend a run on `eval:onboarding`.

---

## 2. The arithmetic, all six cells

Let `todayDow` be the group-local weekday, 0 = Sunday. All values are offsets in
days from today.

| horizon | day named? | rule |
|---|---|---|
| `null` | yes | next occurrence counting today. **Unchanged.** |
| `null` | no | Fri (Sat if morning), pushed a week when under `FALLBACK_BUFFER_DAYS`. **Unchanged.** |
| `thisWeek` | yes | identical to `null`. **Unchanged.** |
| `thisWeek` | no | Fri/Sat, **no push** |
| `nextWeek` | yes | that weekday in next Monday's week, pushed a week when under `FALLBACK_BUFFER_DAYS` |
| `nextWeek` | no | Fri/Sat in next Monday's week |

**The `nextWeek` offset, stated so it can be tested rather than inferred.**

```
daysToNextMonday(todayDow) = ((1 - todayDow + 7) % 7) || 7
  Sun 1 · Mon 7 · Tue 6 · Wed 5 · Thu 4 · Fri 3 · Sat 2

offsetWithinWeek(day)      = (day - 1 + 7) % 7        // Mon 0 … Sun 6

offset = daysToNextMonday + offsetWithinWeek
if (offset < FALLBACK_BUFFER_DAYS) offset += 7
```

Worked, against the owner's own reading:

- Wed 26 Aug, "beers next week" → 5 + 4 = **9 → Fri 4 Sep.** The observed bug,
  fixed.
- Wed 26 Aug, "beers next Friday" → 5 + 4 = **9 → Fri 4 Sep.** The spec, exactly.
- Sat 29 Aug, "beers next Friday" → 2 + 4 = **6 → Fri 4 Sep.**
- Sun 30 Aug, "beers next Monday" → 1 + 0 = 1, under the buffer, **→ 8.**
- Mon 31 Aug, "beers next Friday" → 7 + 4 = **11 → Fri 11 Sep.**

**Why the buffer is reused rather than a new number invented.** The Monday-week
rule has exactly one bad cell on its own, Sunday saying "next Monday" landing on
tomorrow, and that is an undershoot of the same class as the bug being fixed.
`FALLBACK_BUFFER_DAYS`, which already exists and already means "a gauge needs
time to collect answers", catches it. The plain alternative rule (always add
seven to the next occurrence) has roughly ten bad cells instead of one, every
weekday Mon-Fri named on a Saturday or Sunday, and was rejected for that.

**On the `nextWeek` + no-day cell the buffer is unreachable**, since the minimum
is Sunday's 1 + 4 = 5. Keep the guard anyway rather than special-casing it; a
guard that never fires costs nothing and a missing one is how this family of bugs
starts.

**Accepted limit, named rather than solved.** `thisWeek` + no day on a Saturday
still resolves to next week's Friday, because the current week has no Friday
left. Suppressing the buffer is all `thisWeek` does; teaching it to look for a
day inside the remaining week is calendar modelling and is out of scope.

---

## 3. Copy

**The disclosure fires on exactly one condition:** a weekday was named **and**
the horizon is `nextWeek`.

That is the precise mirror of the am/pm precedent in `resolveSparkTime`, which
discloses only when the member stated an hour whose half of the day Orbit had to
pick, and stays silent when nothing was stated because there is nothing of theirs
to misread. So "beers next week" gets **no clause**: Friday is Orbit's own
fallback pick, undisclosed today and undisclosed after this.

```
Love it. Beers on Friday, Sep 4? You said next Friday, so I'm taking that as
the one after this week. If three are in, I'll set it up.
```

The clause is 7th-to-8th grade, carries no em-dash, and is the only candidate
that stays true at the week edge: on a Saturday, "not this Friday" would name a
day already in the past, and "I skipped this week's" would claim to have skipped
one that had already gone.

**The same condition forces the dated form.** `buildGaugeMessage` normally says
"this Friday" under `THIS_WEEK_DAYS` and "on Friday, Sep 4" past it. A `nextWeek`
resolution can land at six days on a Saturday or five on a Sunday, so without
this, Orbit would answer "beers next Friday" with "Beers **this** Friday? You
said next Friday, so I'm taking that as the one after this week." The message
would contradict its own next sentence. One condition drives both the disclosure
and the date form; they can never disagree.

**Two disclosures at once** ("meet at 8 next Friday") join with a single space,
both kept, in time-then-horizon order. Rare, and suppressing either would be
Orbit hiding a guess it made. No combined sentence is written for the collision;
a special-case string is a fifth copy variant to maintain for a case that may
never occur.

---

## 4. What changes in code, and one asymmetry worth its explanation

- **`spark.ts`**: `horizon` on `INTENT_SCHEMA` (required, `anyOf` enum-or-null,
  matching how `partOfDay` is declared), on `NormalizedSpark`, and validated in
  `normalizeSpark`. One new line in the spark-fields block of
  `INTENT_SYSTEM_PROMPT`, plus one example added to the `statedDayOfWeek` line so
  the model knows "beers next Friday" sets **both** fields.
- **`spark-copy.ts`**: `chooseProposedDate` gains a **required** fifth argument.
  Required, not optional, so a future caller cannot silently forget the horizon;
  twenty-two call sites exist today (counted, not estimated: one in
  `detect-intent.ts`, one in `spark-copy.ts` itself, fifteen across the two test
  files, four in QA staging scripts, one in `evals/detect/run.ts`), and all but
  the first take a mechanical `, null`. That churn buys compile-time proof, which
  is the same reasoning that makes
  `email.ts`'s error maps a compile error at every call site.
  `resolveSparkTime` is untouched. `buildGaugeMessage` gains an **optional**
  sixth argument forcing the dated form.
- **`detect-intent.ts`**: passes the horizon through, composes the disclosure
  list, and sets the dated-form flag. It is the only caller that has both
  disclosures, which is why they are joined here rather than inside the copy
  function.
- **`planAnswerGauge`** passes `null` explicitly, per the non-goal.

**The asymmetry, since a reviewer will ask.** `chooseProposedDate`'s new argument
is required because a caller resolving a spark must make a decision about the
horizon and getting it wrong produces a wrong date. `buildGaugeMessage`'s is
optional because it is presentation derived from a decision already made
upstream, and the single caller that sets it is pinned by a test; forcing twelve
QA staging scripts to pass `false` would buy nothing.

**Seeding is unchanged**, deliberately. Naming a weekday still seeds the member
IN, so someone whose "next Friday" was read the far way is counted in for the far
Friday. Accepted cost, identical in shape to being seeded for a plan whose hour
Orbit guessed, and recoverable with a chip or a day comment. The alternative,
declining to seed on a horizon-resolved day, would be a new rule with its own
oddity and no case behind it.

---

## 5. Verification

**Vitest owns the arithmetic**, with a frozen clock, in `spark-copy.test.ts`. All
six cells of the table above, across every weekday, plus month and year rollover,
plus the Sunday "next Monday" buffer cell explicitly. These are new behaviour, so
each can be shown red before the change by asserting the new date against the old
code. `spark.test.ts` gains normalize cases: a bad string, a wrong case, a
missing key, and each valid value.

**`eval:detect` owns the field and never a date.** A case expecting `nextWeek` is
a claim about words and is clock-independent; a case expecting Sep 4 would
silently mean something different depending on which weekday the bench happened
to run. That is exactly the trap that made `digest/run.test.ts` start failing at
noon on 2 September. `Expected` gains an optional `horizon`, `Outcome` gains a
real one, and `describe()` prints it so a failure is readable.

Roughly seven new cases, taking the bench to about forty, near $1 at five runs:
the flagship regression written in the member's **actual** words from 26 August
(the audit's F-3-27 found an earlier regression case rebuilding its failure with
words Orbit no longer says); "beers next Friday"; "beers this Friday"; a plain
"anyone want to climb Saturday?" guarding against over-labelling; and the three
null-horizon traps, "this weekend", "in two weeks", "sometime next month".

**Full-bench before-and-after numbers are required**, at five runs, recorded in
build-notes with the current per-bucket scoreboard. `eval:onboarding` is **not**
reached; see §1.

**One lived message** in a dev group, "beers next Friday", because no test in
this repo renders a real gauge from a real model call. The screenshot is the
copy's only evidence.

**The stop rule for prompt tuning, which is the real cost here.** The two failure
directions are not equal, and the rule follows from that rather than from a
tolerance someone picked.

- The model returning `null` where it should say `nextWeek` **degrades to exactly
  today's behaviour**. Acceptable to ship with the rate recorded.
- The model returning `nextWeek` for "this weekend" or "in two weeks"
  **invents a wrong date nobody asked for**. Must be fixed before merge.

Two tuning rounds. If the second does not clear the false-positive direction, the
numbers go to Jacob rather than a third round happening on its own.
