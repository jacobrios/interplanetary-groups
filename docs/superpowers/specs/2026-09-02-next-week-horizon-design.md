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

---

# Implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach Orbit's spark path which week a member meant, so "we should grab beers next week" and "beers next Friday" both stop landing inside the week the member excluded.

**Architecture:** One new extraction field (`horizon`) validated at the existing claim-to-fact boundary, consumed by `chooseProposedDate`'s date arithmetic and by one disclosure string, wired through a new pure planner that mirrors the `planAnswerGauge` precedent. Nothing is stored; nothing else in the product learns a new word.

**Tech stack:** TypeScript, Next.js 16 server actions, Vitest, Anthropic structured outputs.

## Global constraints

Every task's requirements implicitly include these.

- **Two horizon values only:** `"thisWeek"`, `"nextWeek"`, `null`. "this weekend", "tomorrow", "in two weeks", "sometime next month" all stay `null`.
- **No new intent class.** The classifier still decides spark / change / answer / dayComment exactly as today.
- **Spark half only.** The answer, dayComment and change halves of the schema, prompt and normalizer are untouched.
- **No em-dash or en-dash** in anything Orbit says, and Orbit's copy targets a 7th-to-8th grade reading level.
- **Nothing is stored.** No Prisma schema change, no migration, no deploy obligation, no pre-deploy checklist entry.
- **`npm run db:which` must read DEV-TEST** (`pxbewardwvoyqqcvogel`) before anything runs. It does, as of slice start.
- **Test-suite baseline:** 1704 passed of 1704 across 146 files, zero pre-existing failures, at `d2c5031`. Any task ending with a lower passing count than it started with has broken something.
- **`eval:onboarding` is not reached by this slice.** Do not run it. Reasoning in §1 above.

## File map

| File | Responsibility | Task |
|---|---|---|
| `src/lib/orbit/spark.ts` | The `Horizon` type, the schema field, the prompt line, and `normalizeSpark`'s validation | 2, 6 |
| `src/lib/orbit/spark-copy.ts` | Date arithmetic, the disclosure string, the dated-form switch, and the new `planSparkGauge` | 3, 4, 5 |
| `src/app/actions/detect-intent.ts` | Carries the planner's answer out; owns no spark arithmetic after task 5 | 5 |
| `evals/detect/cases.ts` | Horizon on `Expected`; seven new cases | 7 |
| `evals/detect/run.ts` | Horizon on `Outcome`, in `describe()` and in `grade()` | 7 |
| `docs/build-notes.md`, `CLAUDE.md` | The decision record and the current-state section | 10 |

---

### Task 1: Record the pre-change bench numbers

**This measurement can never be taken again once task 6 lands.** It is its own task for that reason and for no other. No code changes.

**Files:** none. Appends to this document only.

**Interfaces:**
- Consumes: nothing.
- Produces: a recorded per-bucket scoreboard that task 8 compares against.

- [ ] **Step 1: Confirm the tree is unmodified**

Run: `git status --short`
Expected: empty output. If anything is listed, stop and report; the baseline must be taken on untouched code.

- [ ] **Step 2: Run the full bench at five runs**

Run: `npm run eval:detect`
Expected: roughly 33 cases x 5 = 165 model calls, about 80 cents, a few minutes. It ends with a `=== SCOREBOARD ===` block of four bucket lines.

- [ ] **Step 3: Record the scoreboard verbatim in this document**

Append a `## Bench baseline (pre-change)` section directly below this task, holding the date, the four bucket lines exactly as printed, and the full `=== FAILURES ===` list. Do not summarise and do not tidy. A known-red case that goes redder later is only visible if the before-picture is complete.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-09-02-next-week-horizon-design.md
git commit -m "Record the recognition bench before touching the prompt"
```

---

### Task 2: The horizon field at the claim-to-fact boundary

The field exists and cannot carry garbage. No arithmetic, no prompt, no copy.

**Files:**
- Modify: `src/lib/orbit/spark.ts`
- Test: `src/lib/orbit/__tests__/spark.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `export type Horizon = "thisWeek" | "nextWeek"`, and `horizon: Horizon | null` on the `spark: true` variant of `NormalizedSpark`. Tasks 3, 4, 5 and 7 all import `Horizon` from `@/lib/orbit/spark` (type-only imports, so the model SDK is never dragged along).

**Heads-up that will otherwise look like a wall of unexplained red:** `spark.test.ts` deliberately uses strict `toEqual` on normalized sparks, with a shared fixture `const NO_TIME = { statedTime: null, timeAmbiguous: false, partOfDay: null }` near the top. Adding a field to `NormalizedSpark` breaks every assertion that spreads it. Adding `horizon: null` to that one fixture fixes them all at once. That strictness is the point, not a nuisance: it is what catches a field appearing that nobody intended.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/orbit/__tests__/spark.test.ts`, inside the existing `describe("normalizeSpark, time fields")` block or a new sibling block `describe("normalizeSpark, horizon")`:

```ts
describe("normalizeSpark, horizon", () => {
  const base = { isSpark: true, activity: "beers", statedDayOfWeek: null }

  it("keeps both valid horizons", () => {
    expect(normalizeSpark({ ...base, horizon: "nextWeek" })).toMatchObject({
      horizon: "nextWeek",
    })
    expect(normalizeSpark({ ...base, horizon: "thisWeek" })).toMatchObject({
      horizon: "thisWeek",
    })
  })

  it("degrades anything else to null, which is today's behaviour", () => {
    // A wrong case, a plausible-but-unlisted value, a non-string, and a
    // missing key. Every one of them must land on null rather than reaching
    // the date arithmetic, because null is the reading that changes nothing.
    for (const bad of ["nextweek", "NEXTWEEK", "next-week", "weekend", "in two weeks", 2, true, null, undefined, {}]) {
      expect(normalizeSpark({ ...base, horizon: bad })).toMatchObject({ horizon: null })
    }
    expect(normalizeSpark(base)).toMatchObject({ horizon: null })
  })
})
```

Add to the existing schema-shape test block (the one that already reads `expect(INTENT_SCHEMA.required).toContain("isAskAnswer")`):

```ts
it("requires the horizon field of the model", () => {
  expect(INTENT_SCHEMA.required).toContain("horizon")
  expect(INTENT_SCHEMA.properties.horizon).toBeDefined()
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/orbit/__tests__/spark.test.ts`
Expected: FAIL. The horizon tests fail because `normalizeSpark` returns no such key, and `INTENT_SCHEMA.required` does not contain `"horizon"`.

- [ ] **Step 3: Add the type, the schema entry and the validation**

In `src/lib/orbit/spark.ts`, beside the existing `PartOfDay` type:

```ts
/**
 * Which week the message pushed the idea into, when it said so at all.
 *
 * Two values and nothing else, deliberately. "This weekend", "in two weeks"
 * and "sometime next month" all carry real information too, and every one of
 * them stays null: modelling them is modelling English, and the fix here is
 * for the one phrase that was observed producing a wrong date in front of a
 * person. (Spec: next-week-horizon, scope trap 1.)
 */
export type Horizon = "thisWeek" | "nextWeek"
```

Add to the `spark: true` variant of `NormalizedSpark`, directly under `partOfDay`:

```ts
      /** Which week they meant, when they said. Null keeps today's behaviour. */
      horizon: Horizon | null
```

Add to `INTENT_SCHEMA.required`, in the first group alongside the other spark fields:

```ts
    "isSpark", "activity", "statedDayOfWeek", "statedTime", "timeAmbiguous", "partOfDay",
    "horizon",
```

Add to `INTENT_SCHEMA.properties`, directly after `partOfDay` and shaped the same way, because an enum-or-null is exactly what `partOfDay` already needed:

```ts
    horizon: {
      anyOf: [{ type: "string", enum: ["thisWeek", "nextWeek"] }, { type: "null" }],
    },
```

In `normalizeSpark`, directly after the `partOfDay` line and before the return:

```ts
  const horizon: Horizon | null =
    o.horizon === "thisWeek" || o.horizon === "nextWeek" ? o.horizon : null
```

And extend the returned object:

```ts
  return { spark: true, activity, statedDayOfWeek, statedTime, timeAmbiguous, partOfDay, horizon }
```

- [ ] **Step 4: Fix the shared fixture**

In `src/lib/orbit/__tests__/spark.test.ts`, extend the fixture near the top of the file:

```ts
const NO_TIME = { statedTime: null, timeAmbiguous: false, partOfDay: null, horizon: null }
```

- [ ] **Step 5: Run the file, then the whole suite**

Run: `npx vitest run src/lib/orbit/__tests__/spark.test.ts`
Expected: PASS.

Run: `npm test -- --run`
Expected: 146 files passed, 1704 + the new tests passed, zero failures.

- [ ] **Step 6: Commit**

```bash
git add src/lib/orbit/spark.ts src/lib/orbit/__tests__/spark.test.ts
git commit -m "Give the extraction schema somewhere to put a horizon"
```

---

### Task 3: The date arithmetic

**Files:**
- Modify: `src/lib/orbit/spark-copy.ts`
- Modify (mechanical, `, null` appended to each call): `src/lib/orbit/__tests__/spark-copy.test.ts`, `src/lib/orbit/__tests__/spark.test.ts`, `scripts/qa-stage-polish.ts`, `scripts/qa-stage-pending.ts`, `scripts/qa-stage-retry.ts`, `evals/detect/run.ts`, and `chooseProposedDate`'s own call inside `planAnswerGauge`
- Test: `src/lib/orbit/__tests__/spark-copy.test.ts`

**Interfaces:**
- Consumes: `Horizon` from task 2.
- Produces: `chooseProposedDate(statedDayOfWeek: number | null, partOfDay: PartOfDay | null, timeZone: string, now: Date, horizon: Horizon | null): Date`. The fifth argument is **required**; tasks 4 and 5 rely on that.

**Why required rather than optional, so a reviewer does not read it as churn for its own sake:** twenty-two call sites exist and all but one genuinely want `null`, so an optional parameter would compile everywhere and cost nothing today. It is required because a *future* caller resolving a spark must be forced to decide, and a silently forgotten horizon is a wrong date with no error anywhere. This is the same reasoning that makes `src/lib/auth/email.ts`'s error maps a compile error at every call site.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/orbit/__tests__/spark-copy.test.ts`. Note that the existing `describe("chooseProposedDate")` block's six calls must each gain a trailing `, null` in step 3; these are the new block.

```ts
describe("chooseProposedDate, horizons", () => {
  const TZ = "UTC"
  // Weekday anchors, verified against Intl before they were written down:
  // 2026-08-26 Wed · 08-29 Sat · 08-30 Sun · 08-31 Mon · 09-04 Fri · 09-11 Fri.
  const WED = new Date("2026-08-26T12:00:00Z")
  const SAT = new Date("2026-08-29T12:00:00Z")
  const SUN = new Date("2026-08-30T12:00:00Z")
  const MON = new Date("2026-08-31T12:00:00Z")
  const THU = new Date("2026-08-27T12:00:00Z")

  it("fixes the bug that was seen in production", () => {
    // "we should grab beers next week", Wednesday 26 Aug 2026. Orbit answered
    // Friday the 28th, two days later, inside the week the member excluded.
    expect(chooseProposedDate(null, "evening", TZ, WED, "nextWeek").toISOString()).toBe(
      "2026-09-04T00:00:00.000Z"
    )
  })

  it("fixes the second case, where the member named their day and was still half-heard", () => {
    // "beers next Friday" on the same Wednesday. This is the owner's reading,
    // stated in build-notes: nine days out, not two.
    expect(chooseProposedDate(5, "evening", TZ, WED, "nextWeek").toISOString()).toBe(
      "2026-09-04T00:00:00.000Z"
    )
  })

  it("reads a week as Monday to Sunday, so a weekend ask does not overshoot", () => {
    // Saturday: next week's Friday is six days out, not thirteen. This is the
    // cell that rejected the simpler always-add-seven rule.
    expect(chooseProposedDate(5, "evening", TZ, SAT, "nextWeek").toISOString()).toBe(
      "2026-09-04T00:00:00.000Z"
    )
    expect(chooseProposedDate(5, "evening", TZ, SUN, "nextWeek").toISOString()).toBe(
      "2026-09-04T00:00:00.000Z"
    )
  })

  it("never lets next week mean tomorrow", () => {
    // Sunday saying "next Monday" is the Monday-week rule's one bad cell: it
    // resolves to +1. The notice buffer that already exists catches it, which
    // is why no new number was invented for this.
    expect(chooseProposedDate(1, "evening", TZ, SUN, "nextWeek").toISOString()).toBe(
      "2026-09-07T00:00:00.000Z"
    )
  })

  it("counts from the week today sits in, not from today", () => {
    // Monday's own next week starts seven days out, so next Friday is eleven.
    expect(chooseProposedDate(5, "evening", TZ, MON, "nextWeek").toISOString()).toBe(
      "2026-09-11T00:00:00.000Z"
    )
  })

  it("sends a morning idea to next week's Saturday", () => {
    expect(chooseProposedDate(null, "morning", TZ, WED, "nextWeek").toISOString()).toBe(
      "2026-09-05T00:00:00.000Z"
    )
  })

  it("lets this week override the notice buffer", () => {
    // Thursday + "beers this week". Without the horizon the buffer pushes this
    // to 4 Sep, contradicting the member's own word. With it, tomorrow.
    expect(chooseProposedDate(null, "evening", TZ, THU, "thisWeek").toISOString()).toBe(
      "2026-08-28T00:00:00.000Z"
    )
    expect(chooseProposedDate(null, "evening", TZ, THU, null).toISOString()).toBe(
      "2026-09-04T00:00:00.000Z"
    )
  })

  it("leaves a stated day alone under thisWeek, exactly as under null", () => {
    expect(chooseProposedDate(5, "evening", TZ, WED, "thisWeek").toISOString()).toBe(
      chooseProposedDate(5, "evening", TZ, WED, null).toISOString()
    )
  })

  it("crosses a month end without a special case", () => {
    // Wed 30 Sep 2026 + next week's Friday = 9 Oct.
    const SEP30 = new Date("2026-09-30T12:00:00Z")
    expect(chooseProposedDate(5, "evening", TZ, SEP30, "nextWeek").toISOString()).toBe(
      "2026-10-09T00:00:00.000Z"
    )
  })

  it("crosses a year end without a special case", () => {
    // Wed 30 Dec 2026 + next week's Friday = 8 Jan 2027.
    const DEC30 = new Date("2026-12-30T12:00:00Z")
    expect(chooseProposedDate(5, "evening", TZ, DEC30, "nextWeek").toISOString()).toBe(
      "2027-01-08T00:00:00.000Z"
    )
  })

  it("reads the week boundary in the group's zone, not the server's", () => {
    // Pacific/Midway is UTC-11 year round, so this instant is still Saturday
    // there while it is already Sunday in UTC. Both resolve to Fri 4 Sep here,
    // so the assertion that earns its keep is the Monday case below it.
    const MIDWAY = "Pacific/Midway"
    // 2026-08-30T02:00Z is Sat 29 Aug 15:00 in Midway.
    const acrossMidnight = new Date("2026-08-30T02:00:00Z")
    expect(chooseProposedDate(1, "evening", MIDWAY, acrossMidnight, "nextWeek").toISOString()).toBe(
      // Sat in Midway: next week's Monday is 31 Aug, two days out, clears the
      // buffer. Read as Sunday it would have been pushed to 7 Sep.
      "2026-08-31T11:00:00.000Z"
    )
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/orbit/__tests__/spark-copy.test.ts`
Expected: FAIL, on a TypeScript error that `chooseProposedDate` expects 4 arguments but got 5. That is the signature not existing yet, which is a legitimate red. After step 3's signature change but before its body change, the same tests must fail on *values* (for example `expected 2026-08-28... to be 2026-09-04...`); run them again at that point and confirm you saw a value failure, not only a type failure, before writing the arithmetic.

- [ ] **Step 3: Add the arithmetic**

In `src/lib/orbit/spark-copy.ts`, add the type-only import beside the existing `PartOfDay` one:

```ts
// Type-only, so it erases at compile time and cannot pull the model SDK back in.
import type { Horizon, PartOfDay } from "./spark"
```

Add beside the existing `FRIDAY` / `SATURDAY` constants:

```ts
const MONDAY = 1

/**
 * Days from today to the Monday that starts NEXT week.
 *
 * A week runs Monday to Sunday, and "next week" is the week after the one
 * today sits in. That convention is the whole reason a Saturday "next Friday"
 * is six days out rather than thirteen; the simpler always-add-seven rule was
 * rejected because it is wrong for every weekday named on a weekend. Never
 * zero: a Monday's own next week is seven days out, not today.
 *
 * Placeholder in the same sense as the Friday and Saturday fallbacks above,
 * and replaced with them by the override-learning behavior in build-notes §5.
 */
function daysToNextWeekStart(todayDow: number): number {
  return ((MONDAY - todayDow + 7) % 7) || 7
}
```

Replace the body of `chooseProposedDate` (keep and extend its existing doc comment; add the horizon paragraph shown after the code):

```ts
export function chooseProposedDate(
  statedDayOfWeek: number | null,
  partOfDay: PartOfDay | null,
  timeZone: string,
  now: Date,
  horizon: Horizon | null
): Date {
  const today = getLocalParts(now, timeZone)
  const todayDow = weekdayOf(today.year, today.month, today.day)

  // Friday was chosen on end-of-the-week social logic, which is about
  // evenings. A morning idea inherits Saturday instead: "breakfast sometime"
  // proposed for Friday 7pm would be wrong twice over.
  const fallbackDay = partOfDay === "morning" ? SATURDAY : FRIDAY

  let offsetDays: number
  if (horizon === "nextWeek") {
    // The day they named, or Orbit's own fallback, taken inside next week
    // rather than this one. The buffer is reused rather than replaced: it is
    // what stops a Sunday "next Monday" landing on tomorrow, which would be an
    // undershoot of exactly the kind this whole change exists to fix.
    const day = statedDayOfWeek ?? fallbackDay
    offsetDays = daysToNextWeekStart(todayDow) + ((day - MONDAY + 7) % 7)
    if (offsetDays < FALLBACK_BUFFER_DAYS) offsetDays += 7
  } else if (statedDayOfWeek !== null) {
    offsetDays = (statedDayOfWeek - todayDow + 7) % 7
  } else {
    offsetDays = (fallbackDay - todayDow + 7) % 7
    // "this week" is the member ruling out the push. Thursday's "beers this
    // week" otherwise lands on next Friday, contradicting the word they used.
    if (horizon !== "thisWeek" && offsetDays < FALLBACK_BUFFER_DAYS) offsetDays += 7
  }

  // Date.UTC absorbs the day overflow, so month and year ends need no special case.
  return zonedWallTimeToUtc(today.year, today.month, today.day + offsetDays, 0, 0, timeZone)
}
```

Append this paragraph to the function's existing doc comment, after the "These are starting heuristics" paragraph:

```
 * Horizon, added 3 September 2026: "next week" puts the day inside the week
 * after the one today sits in, and "this week" suppresses the notice buffer.
 * Null is every other phrase and behaves exactly as this function did before,
 * which is what keeps a confused model harmless. (Spec: next-week-horizon.)
```

- [ ] **Step 4: Update the twenty-one other call sites**

Every existing call gains a trailing `, null`. They are:

- `src/lib/orbit/spark-copy.ts` — inside `planAnswerGauge`, which passes `null` deliberately: a day answer names a day, never a week, and teaching it to is a non-goal of this slice.
- `src/app/actions/detect-intent.ts` — leave this one alone for now; task 5 rewrites the whole block.
- `src/lib/orbit/__tests__/spark-copy.test.ts` — six calls in the existing `describe("chooseProposedDate")` block.
- `src/lib/orbit/__tests__/spark.test.ts` — nine calls.
- `scripts/qa-stage-polish.ts:282`, `scripts/qa-stage-pending.ts:172` and `:212`, `scripts/qa-stage-retry.ts:202`.
- `evals/detect/run.ts` — the live-gauge line's call.

Find any you missed with: `npx tsc --noEmit`
Expected: no errors. A missed call site is a compile error, which is the entire point of making the parameter required.

- [ ] **Step 5: Run the file, then the whole suite**

Run: `npx vitest run src/lib/orbit/__tests__/spark-copy.test.ts`
Expected: PASS, including all six pre-existing cases, which prove the null path did not move.

Run: `npm test -- --run`
Expected: zero failures.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Teach Orbit which week a member meant"
```

---

### Task 4: The copy

**Files:**
- Modify: `src/lib/orbit/spark-copy.ts`
- Test: `src/lib/orbit/__tests__/spark-copy.test.ts`

**Interfaces:**
- Consumes: `Horizon` (task 2), `weekdayLongName` (already exported from this file).
- Produces: `horizonDisclosure(statedDayOfWeek: number | null, horizon: Horizon | null): string | null`, and a sixth optional parameter on `buildGaugeMessage(activity, proposedDate, timeZone, now, disclosure, datedWhen = false)`. Task 5 uses both.

- [ ] **Step 1: Write the failing tests**

```ts
describe("horizonDisclosure", () => {
  it("owns up only when the member named a day and Orbit read it the far way", () => {
    expect(horizonDisclosure(5, "nextWeek")).toBe(
      "You said next Friday, so I'm taking that as the one after this week."
    )
    expect(horizonDisclosure(1, "nextWeek")).toBe(
      "You said next Monday, so I'm taking that as the one after this week."
    )
  })

  it("stays quiet when there was nothing of theirs to misread", () => {
    // "beers next week" names no day, so Friday is Orbit's own fallback pick,
    // which is undisclosed today and stays undisclosed. This is the am/pm rule
    // exactly: disclose a reading of what they said, never a guess they left open.
    expect(horizonDisclosure(null, "nextWeek")).toBeNull()
    expect(horizonDisclosure(5, "thisWeek")).toBeNull()
    expect(horizonDisclosure(5, null)).toBeNull()
    expect(horizonDisclosure(null, null)).toBeNull()
  })

  it("carries no em-dash, per the product-voice rule", () => {
    expect(horizonDisclosure(5, "nextWeek")).not.toMatch(/[—–]/)
  })
})

describe("buildGaugeMessage, dated form", () => {
  const TZ = "UTC"
  const WED = new Date("2026-08-26T12:00:00Z")
  const SOON = new Date("2026-08-28T00:00:00Z") // Fri, two days out

  it("still says 'this Friday' for a nearby day by default", () => {
    expect(buildGaugeMessage("beers", SOON, TZ, WED, null)).toContain("Beers this Friday?")
  })

  it("names the date when asked to, however near the day is", () => {
    // Without this, a Saturday "next Friday" resolves six days out and Orbit
    // answers "Beers this Friday? You said next Friday..." , the message
    // contradicting its own next sentence.
    const msg = buildGaugeMessage("beers", SOON, TZ, WED, null, true)
    expect(msg).toContain("Beers on Friday, Aug 28?")
    expect(msg).not.toContain("this Friday")
  })

  it("carries the horizon clause between the question and the promise", () => {
    const msg = buildGaugeMessage("beers", SOON, TZ, WED, horizonDisclosure(5, "nextWeek"), true)
    expect(msg).toBe(
      "Love it. Beers on Friday, Aug 28? You said next Friday, so I'm taking that as the one after this week. If three are in, I'll set it up."
    )
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/orbit/__tests__/spark-copy.test.ts -t "horizonDisclosure"`
Expected: FAIL, `horizonDisclosure is not defined`.

Run: `npx vitest run src/lib/orbit/__tests__/spark-copy.test.ts -t "dated form"`
Expected: FAIL on the dated-form cases, and PASS on the default case, which is what proves the default path is unchanged.

- [ ] **Step 3: Add the disclosure and the dated form**

In `src/lib/orbit/spark-copy.ts`, beside `resolveSparkTime`:

```ts
/**
 * Orbit owning up to the week it picked, in one clause.
 *
 * Fires on exactly one condition: they named a weekday AND said "next". That
 * is the am/pm rule's own shape, which discloses a reading of an hour the
 * member stated and stays silent when nothing was stated, because there is
 * nothing of theirs to misread. So "beers next week" gets no clause: Friday is
 * Orbit's own fallback pick and has never been disclosed.
 *
 * People genuinely disagree about "next Friday" and some do mean the upcoming
 * one, so Orbit picks a reading and says so rather than asking. Asking would
 * break the concrete-first guardrail, which is to propose a specific day and
 * absorb overrides. (Spec: next-week-horizon, §3.)
 */
export function horizonDisclosure(
  statedDayOfWeek: number | null,
  horizon: Horizon | null
): string | null {
  if (horizon !== "nextWeek" || statedDayOfWeek === null) return null
  return `You said next ${weekdayLongName(statedDayOfWeek)}, so I'm taking that as the one after this week.`
}
```

In `buildGaugeMessage`, add the parameter and use it:

```ts
export function buildGaugeMessage(
  activity: string,
  proposedDate: Date,
  timeZone: string,
  now: Date,
  disclosure: string | null,
  /**
   * Force the dated form. A "next Friday" reading can land inside the week (six
   * days out on a Saturday), where "this Friday" would contradict the very
   * clause disclosing it. Optional, unlike chooseProposedDate's horizon,
   * because this is presentation derived from a decision already made upstream
   * and the one caller that sets it is pinned by a test.
   */
  datedWhen = false
): string {
```

and change the `when` expression:

```ts
  const when =
    datedWhen || daysAway >= THIS_WEEK_DAYS
      ? `on ${weekday}, ${formatMonthDay(proposedDate, timeZone)}`
      : `this ${weekday}`
```

- [ ] **Step 4: Run the file, then the whole suite**

Run: `npx vitest run src/lib/orbit/__tests__/spark-copy.test.ts`
Expected: PASS.

Run: `npm test -- --run`
Expected: zero failures. The twelve QA staging scripts calling `buildGaugeMessage` with five arguments still compile, because the sixth is optional.

- [ ] **Step 5: Commit**

```bash
git add src/lib/orbit/spark-copy.ts src/lib/orbit/__tests__/spark-copy.test.ts
git commit -m "Let Orbit say which Friday it picked"
```

---

### Task 5: The pure planner, and the action reduced to carrying its answer out

**Files:**
- Modify: `src/lib/orbit/spark-copy.ts`
- Modify: `src/app/actions/detect-intent.ts:255-287`
- Test: `src/lib/orbit/__tests__/spark-copy.test.ts`

**Interfaces:**
- Consumes: `chooseProposedDate` (task 3), `horizonDisclosure` (task 4), `resolveSparkTime` and `sparkStartInstant` (existing).
- Produces: `planSparkGauge(spark, timeZone, now): PlannedSparkGauge | null`.

**Why this extraction is in lane rather than drive-by refactoring.** `detect-intent.ts` is a server action that talks to the database and the model, so nothing in this repo can unit-test it, and the bench does not reach it either: `evals/detect/run.ts` rebuilds the context and grades the model's claim, stopping before any gauge date is chosen. Left inline, the horizon wiring would have no automated evidence at all and would rest entirely on one hand-run message. `planAnswerGauge` sits forty lines above in `spark-copy.ts` doing exactly this for the answer path, so the pattern is established rather than invented, and the action keeps its documented job of carrying a pure planner's answer out.

- [ ] **Step 1: Write the failing tests**

```ts
describe("planSparkGauge", () => {
  const TZ = "UTC"
  const WED = new Date("2026-08-26T12:00:00Z")
  const bare = { statedDayOfWeek: null, statedTime: null, timeAmbiguous: false, partOfDay: "evening" as const, horizon: null }

  it("plans the production bug's message the way it should always have", () => {
    // "we should grab beers next week", Wednesday 26 Aug 2026.
    const p = planSparkGauge({ ...bare, horizon: "nextWeek" }, TZ, WED)
    expect(p).not.toBeNull()
    expect(p!.proposedDate.toISOString()).toBe("2026-09-04T00:00:00.000Z")
    expect(p!.timeLocal).toBe("19:00")
    // No day was named, so nothing of theirs was reinterpreted.
    expect(p!.disclosure).toBeNull()
    expect(p!.datedWhen).toBe(false)
  })

  it("discloses and dates a named day read the far way", () => {
    const p = planSparkGauge({ ...bare, statedDayOfWeek: 5, horizon: "nextWeek" }, TZ, WED)
    expect(p!.proposedDate.toISOString()).toBe("2026-09-04T00:00:00.000Z")
    expect(p!.disclosure).toBe(
      "You said next Friday, so I'm taking that as the one after this week."
    )
    expect(p!.datedWhen).toBe(true)
  })

  it("keeps both disclosures when Orbit guessed twice", () => {
    // "meet at 8 next Friday": an ambiguous clock number and a week to read.
    // Suppressing either would be Orbit hiding a guess it made.
    const p = planSparkGauge(
      { ...bare, statedDayOfWeek: 5, statedTime: "08:00", timeAmbiguous: true, horizon: "nextWeek" },
      TZ,
      WED
    )
    expect(p!.timeLocal).toBe("20:00")
    expect(p!.disclosure).toBe(
      "You said 8, so I'm taking that as 8pm. You said next Friday, so I'm taking that as the one after this week."
    )
  })

  it("changes nothing at all when no horizon was said", () => {
    const p = planSparkGauge(bare, TZ, WED)
    expect(p!.proposedDate.toISOString()).toBe("2026-08-28T00:00:00.000Z")
    expect(p!.disclosure).toBeNull()
    expect(p!.datedWhen).toBe(false)
    expect(p!.bornLate).toBe(false)
  })

  it("refuses a plan whose start has already gone", () => {
    // Friday 8pm, asked for Friday 7pm. Mirrors planAnswerGauge's own guard.
    const fridayLate = new Date("2026-08-28T20:00:00Z")
    expect(planSparkGauge({ ...bare, statedDayOfWeek: 5 }, TZ, fridayLate)).toBeNull()
  })

  it("flags a gauge born inside its own close window", () => {
    // Friday 6pm for a Friday 7pm plan: one hour, inside the two-hour close.
    const fridayEarly = new Date("2026-08-28T18:00:00Z")
    const p = planSparkGauge({ ...bare, statedDayOfWeek: 5 }, TZ, fridayEarly)
    expect(p!.bornLate).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/orbit/__tests__/spark-copy.test.ts -t "planSparkGauge"`
Expected: FAIL, `planSparkGauge is not defined`.

- [ ] **Step 3: Add the planner**

In `src/lib/orbit/spark-copy.ts`, directly above `planAnswerGauge` so the two sit together:

```ts
export interface PlannedSparkGauge {
  proposedDate: Date
  timeLocal: string
  /** Every guess Orbit made, joined, or null when it made none. */
  disclosure: string | null
  /** Force the dated form, because a next-week reading can land inside the week. */
  datedWhen: boolean
  /** Born inside its own close window; caller appends the urgency clause. */
  bornLate: boolean
}

/**
 * Turns a normalized spark into a gauge's shape: the day, the hour, whatever
 * Orbit has to own up to, and whether the gauge is already up against its own
 * close.
 *
 * Returns null when the resolved start has already passed, so a gauge is never
 * opened for a plan the group could not attend. Same guard, same reason, as
 * planAnswerGauge below.
 *
 * The two disclosures are joined here rather than inside buildGaugeMessage
 * because this is the only place that holds both. Time first, then week, which
 * is the order the member said them in.
 */
export function planSparkGauge(
  spark: {
    statedDayOfWeek: number | null
    statedTime: string | null
    timeAmbiguous: boolean
    partOfDay: PartOfDay | null
    horizon: Horizon | null
  },
  timeZone: string,
  now: Date
): PlannedSparkGauge | null {
  const proposedDate = chooseProposedDate(
    spark.statedDayOfWeek,
    spark.partOfDay,
    timeZone,
    now,
    spark.horizon
  )
  const { timeLocal, disclosure: timeDisclosure } = resolveSparkTime({
    statedTime: spark.statedTime,
    timeAmbiguous: spark.timeAmbiguous,
    partOfDay: spark.partOfDay,
  })
  const start = sparkStartInstant(proposedDate, timeLocal, timeZone)
  if (start <= now) return null

  const weekDisclosure = horizonDisclosure(spark.statedDayOfWeek, spark.horizon)
  const disclosure =
    [timeDisclosure, weekDisclosure].filter((d): d is string => d !== null).join(" ") || null

  return {
    proposedDate,
    timeLocal,
    disclosure,
    datedWhen: weekDisclosure !== null,
    bornLate: now.getTime() >= start.getTime() - CLOSE_BEFORE_START_HOURS * 60 * 60 * 1000,
  }
}
```

- [ ] **Step 4: Rewrite the action's spark block**

In `src/app/actions/detect-intent.ts`, replace everything from `const proposedDate = chooseProposedDate(` through the `bornLate` line (currently lines 255-275) with:

```ts
      const planned = planSparkGauge(spark, group.timeZone, now)
      if (planned === null) {
        return { status: "quiet" }
      }
```

and change the `createGauge` call's `proposedDate`, `proposedTime` and `body` to read from `planned`:

```ts
        proposedDate: planned.proposedDate,
        proposedTime: planned.timeLocal,
        body:
          buildGaugeMessage(
            spark.activity,
            planned.proposedDate,
            group.timeZone,
            now,
            planned.disclosure,
            planned.datedWhen
          ) + (planned.bornLate ? buildUrgencyClause(planned.timeLocal) : ""),
```

Then fix the imports at the top of the file: remove `chooseProposedDate`, `resolveSparkTime` and `sparkStartInstant` if nothing else in the file uses them, and add `planSparkGauge`. `CLOSE_BEFORE_START_HOURS` is likewise only needed if another branch still uses it.

Check with: `npx tsc --noEmit`
Expected: no errors, and no unused-import complaints from the linter.

Leave the seeding line exactly as it is:

```ts
        initiatorUserId: spark.statedDayOfWeek !== null ? user.id : null,
```

Naming a weekday still seeds the member IN even when Orbit read the week the far way. That is a deliberate accepted cost, identical in shape to being seeded for a plan whose hour Orbit guessed, and recoverable with a chip or a day comment. Do not "fix" it.

- [ ] **Step 5: Run the file, then the whole suite**

Run: `npx vitest run src/lib/orbit/__tests__/spark-copy.test.ts`
Expected: PASS.

Run: `npm test -- --run`
Expected: zero failures.

- [ ] **Step 6: Commit**

```bash
git add src/lib/orbit/spark-copy.ts src/lib/orbit/__tests__/spark-copy.test.ts src/app/actions/detect-intent.ts
git commit -m "Move the spark path's date decisions somewhere they can be tested"
```

---

### Task 6: The prompt

The first task whose evidence is a bench run rather than a test, because the deliverable is prose.

**Files:**
- Modify: `src/lib/orbit/spark.ts` (`INTENT_SYSTEM_PROMPT`)

**Interfaces:**
- Consumes: the schema field from task 2.
- Produces: nothing structural. Task 8 measures it.

- [ ] **Step 1: Amend the statedDayOfWeek line**

The model must set **both** fields for "beers next Friday", and the current line could be read as "next Friday" not naming a specific weekday. Find the existing line and append one sentence to it, leaving the rest untouched:

```
- statedDayOfWeek: 0 for Sunday through 6 for Saturday, and ONLY when the message names exactly one specific weekday. "beers Friday" is 5. "beers Friday or Saturday" names two, so it is null. "beers tomorrow" and "beers this weekend" do not name a weekday, so they are null. Null whenever you are not certain a single weekday was named. "beers next Friday" and "beers this Friday" both name Friday, so both are 5, and the "next" or "this" goes in horizon instead.
```

- [ ] **Step 2: Add the horizon line**

Directly after the `partOfDay` line, as the last of the spark fields:

```
- horizon: which week the message puts the idea in. "nextWeek" when it pushes the idea past this week ("next week", "next Friday", "the week after this one"). "thisWeek" when it pins the idea to the current week ("this week", "this Friday", "later this week"). Null for absolutely everything else, including "this weekend", "tomorrow", "in two weeks", "at the end of the month", "sometime next month", and any message that says nothing about which week at all. Only these two phrasings have a value; a phrase that is about time but is not one of them is null. Null whenever you are not certain.
```

Note for whoever tunes this: the words "absolutely everything else" and the explicit non-examples are load-bearing, not padding. The model over-labelling ("this weekend" read as `nextWeek`) invents a wrong date nobody asked for and blocks the merge; the model under-labelling returns the product to exactly today's behaviour. The prompt is written asymmetrically on purpose.

- [ ] **Step 3: Confirm nothing else moved**

Run: `git diff src/lib/orbit/spark.ts`
Expected: exactly two changed lines inside `INTENT_SYSTEM_PROMPT`, and nothing in the change, answer or day-comment field blocks.

Run: `npm test -- --run`
Expected: zero failures. No test reads the prompt's prose, so this passing proves only that nothing was broken, not that the prompt works. The bench in task 8 is the evidence.

- [ ] **Step 4: Commit**

```bash
git add src/lib/orbit/spark.ts
git commit -m "Ask the model which week the member meant"
```

---

### Task 7: Teach the bench to grade a horizon

**Files:**
- Modify: `evals/detect/cases.ts`
- Modify: `evals/detect/run.ts`

**Interfaces:**
- Consumes: `Horizon` (task 2).
- Produces: seven new cases and a horizon-aware grader for task 8.

**Worth knowing before you start:** the bench holds 33 cases and **not one of them expects a spark**. The `spark` arm of `Expected`, of `Outcome` and of `grade()` has never run. That is the pre-deploy audit's finding F-3-20 sitting in the file, and it means step 3's first job is proving the arm works at all, not only that horizon grading works.

- [ ] **Step 1: Widen the types**

In `evals/detect/cases.ts`, add the import and widen `Expected`:

```ts
import type { Horizon } from "../../src/lib/orbit/spark"
```

```ts
  | { kind: "spark"; statedDayOfWeek?: number | null; horizon?: Horizon | null }
```

In `evals/detect/run.ts`, widen `Outcome`, where the field is required rather than optional because an outcome always has one:

```ts
  | { kind: "spark"; statedDayOfWeek: number | null; horizon: Horizon | null }
```

Import the type there too, then make `describe()` print it, so a failure line says which half went wrong:

```ts
function describe(o: Outcome): string {
  if (o.kind === "change") return `change / ${o.action}: ${o.text}`
  if (o.kind === "dayComment") return `dayComment / day ${o.dayOfWeek}`
  if (o.kind === "spark") return `spark / day ${o.statedDayOfWeek} / horizon ${o.horizon}`
  return o.kind
}
```

Carry the field out of `runOnce`:

```ts
  if (intent.kind === "spark") {
    return {
      kind: "spark",
      statedDayOfWeek: intent.spark.statedDayOfWeek,
      horizon: intent.spark.horizon,
    }
  }
```

And grade it, directly after the existing `statedDayOfWeek` comparison in `grade()`:

```ts
  if (
    e.kind === "spark" &&
    graded.kind === "spark" &&
    e.horizon !== undefined &&
    e.horizon !== graded.horizon
  ) {
    return `expected spark with horizon ${e.horizon}, got ${graded.horizon}`
  }
```

- [ ] **Step 2: Add the seven cases**

Append to `CASES` in `evals/detect/cases.ts`, before the closing `]`:

```ts
  {
    id: "spark-next-week-bare",
    bucket: "must-recognize",
    description:
      "The 26 Aug 2026 production failure, in the member's own words. Orbit answered 'Beers this Friday?' and opened a gauge for two days later, inside the week he had just excluded. No weekday is named, so statedDayOfWeek is rightly null; the horizon is the only field that can carry 'not this week'.",
    calendar: [],
    history: [{ author: "Priya", body: "that climb yesterday was brutal", minutesAgo: 90 }],
    trigger: { author: "Jacob", body: "we should grab beers next week" },
    memberCount: 4,
    expected: { kind: "spark", statedDayOfWeek: null, horizon: "nextWeek" },
  },
  {
    id: "spark-next-weekday",
    bucket: "must-recognize",
    description:
      "The second broken case, read from the code rather than observed: a named weekday was taken at face value with no buffer, so 'next Friday' on a Wednesday landed on the Friday two days later. Both fields must be set here, which is the thing the amended statedDayOfWeek prompt line exists for.",
    calendar: [],
    history: [{ author: "Sam", body: "long week", minutesAgo: 120 }],
    trigger: { author: "Jesse", body: "beers next friday?" },
    memberCount: 4,
    expected: { kind: "spark", statedDayOfWeek: 5, horizon: "nextWeek" },
  },
  {
    id: "spark-this-weekday",
    bucket: "must-recognize",
    description:
      "The mirror of the case above. 'This Thursday' names a day and pins it to the current week, and reading it as nextWeek would push the plan a week past what was asked for.",
    calendar: [],
    history: [{ author: "Priya", body: "anyone free at all this week", minutesAgo: 200 }],
    trigger: { author: "Sam", body: "climbing this thursday?" },
    memberCount: 4,
    expected: { kind: "spark", statedDayOfWeek: 4, horizon: "thisWeek" },
  },
  {
    id: "spark-plain-weekday",
    bucket: "must-recognize",
    description:
      "A plain weekday with no week word at all. Guards the common case against over-labelling: this must stay null, because null is what preserves the behaviour every existing group already gets.",
    calendar: [],
    history: [{ author: "Jo", body: "the new gym is open", minutesAgo: 60 }],
    trigger: { author: "Priya", body: "anyone want to climb saturday?" },
    memberCount: 4,
    expected: { kind: "spark", statedDayOfWeek: 6, horizon: null },
  },
  {
    id: "spark-this-weekend-null-horizon",
    bucket: "must-recognize",
    description:
      "The hardest of the three null traps, because the phrase literally starts with 'this'. A weekend is not a week: reading it as thisWeek would suppress the notice buffer for an idea that never asked for that.",
    calendar: [],
    history: [{ author: "Sam", body: "weather looks good", minutesAgo: 45 }],
    trigger: { author: "Jesse", body: "beers this weekend?" },
    memberCount: 4,
    expected: { kind: "spark", statedDayOfWeek: null, horizon: null },
  },
  {
    id: "spark-two-weeks-null-horizon",
    bucket: "must-recognize",
    description:
      "The scope line, as a graded case. 'In two weeks' carries real information that this product deliberately cannot hold, and the only safe place to put it is nowhere: reading it as nextWeek would be a wrong date that nobody asked for.",
    calendar: [],
    history: [{ author: "Jo", body: "I'm away till the 10th", minutesAgo: 300 }],
    trigger: { author: "Priya", body: "we should do a hike in two weeks" },
    memberCount: 4,
    expected: { kind: "spark", statedDayOfWeek: null, horizon: null },
  },
  {
    id: "spark-next-month-null-horizon",
    bucket: "must-recognize",
    description:
      "The last null trap, and the one closest to the field's own wording: 'next month' shares the word 'next' with the phrase that does set it. Same reasoning as the case above.",
    calendar: [],
    history: [{ author: "Jesse", body: "we never do anything nice", minutesAgo: 400 }],
    trigger: { author: "Sam", body: "we should grab dinner sometime next month" },
    memberCount: 4,
    expected: { kind: "spark", statedDayOfWeek: null, horizon: null },
  },
```

**On the bucket choice**, since a reviewer will ask why the two "must say nextWeek" cases carry a bar the stop rule calls acceptable to miss. They are `must-recognize` because they are the point of the slice: if they do not work, the slice did not happen. If they come in under 5/5 after task 8's two tuning rounds, the numbers go to Jacob, who decides whether one moves to the `accepted` bucket with a dated build-notes entry naming who accepted it and why. That bucket exists for exactly this and its use is his call, never the implementer's.

- [ ] **Step 3: Prove the grader works before spending money on a full run**

Run: `npm run eval:detect -- 1 spark-plain-weekday`
Expected: 1 case x 1 run. It passes, or it fails with a line naming both the day and the horizon. Either way this proves the spark arm of `describe()` and `grade()` executes, which no case has ever done before.

If it errors rather than passing or failing, the wiring is wrong; fix it here rather than discovering it 200 calls into task 8.

- [ ] **Step 4: Confirm the suite is untouched**

Run: `npm test -- --run`
Expected: zero failures. Bench files are deliberately outside Vitest's glob, so this proves only that nothing leaked into the suite, which is itself worth confirming.

- [ ] **Step 5: Commit**

```bash
git add evals/detect/cases.ts evals/detect/run.ts
git commit -m "Give the bench its first spark cases, and a horizon to grade"
```

---

### Task 8: Run the bench, compare, and tune inside the stop rule

**Files:**
- Possibly modify: `src/lib/orbit/spark.ts` (`INTENT_SYSTEM_PROMPT` only)
- Appends to: this document

**Interfaces:**
- Consumes: task 1's recorded baseline, task 6's prompt, task 7's cases.
- Produces: the after-numbers that task 10 writes into build-notes.

- [ ] **Step 1: Run the full bench**

Run: `npm run eval:detect`
Expected: about 40 cases x 5 runs, roughly $1.

- [ ] **Step 2: Compare against task 1, bucket by bucket**

Write the new scoreboard into this document under `## Bench after-numbers`, beside the baseline. Then check three things in this order:

1. **Did anything that was green go red?** A pre-existing case regressing matters more than a new case underperforming, because it means the prompt edit reached further than intended. If so, that is the thing to fix first.
2. **Are the three null-trap cases clean?** `spark-this-weekend-null-horizon`, `spark-two-weeks-null-horizon`, `spark-next-month-null-horizon`. These must be 5/5. A miss here invents a wrong date and **blocks the merge**.
3. **Are the two nextWeek cases clean?** A miss here returns the product to today's behaviour, which is bad but not wrong.

- [ ] **Step 3: Tune, at most twice**

Only `INTENT_SYSTEM_PROMPT` may change. Do not touch the schema, the normalizer, the arithmetic or the cases to make a number move; changing a case to match the model's answer is marking your own homework.

After each edit run only the affected cases first (`npm run eval:detect -- 5 spark-`), then a full run before declaring done.

**Stop after the second round whatever the numbers say.** Write them into this document and hand them to Jacob rather than starting a third. The failure this rule exists to prevent is a build session quietly spending an afternoon and an unbounded amount of money chasing a rate that a person should have been asked about.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Record what the recognition bench says about the horizon field"
```

---

### Task 9: See it happen

The copy's only evidence. No test in this repo renders a real gauge from a real model call.

**Files:** none.

- [ ] **Step 1: Confirm the database target**

Run: `npm run db:which`
Expected: `DEV-TEST (expected). Project ref pxbewardwvoyqqcvogel matches on all three sources.` Stop if it says anything else.

- [ ] **Step 2: Start the dev server**

Use the Browser pane's `preview_start` with the `dev-webpack` entry in `.claude/launch.json`. Turbopack refuses a worktree's `node_modules` symlink, which is why that entry exists; do not start a server with Bash.

- [ ] **Step 3: Stage a group and open its home**

Run: `npx tsx scripts/qa-stage-cardstate.ts` and use the URL it prints.

**Pick your activity before you type, or this step silently proves nothing.** The spark path refuses to open a second gauge for an activity that is already being gauged or already on the calendar (`detect-intent.ts`, the `liveGauges.some(...)` and `alreadyOnCalendar` guards). This script leaves a live **beers** gauge and a **trivia** event, so "beers next friday" would be met with correct, deliberate silence that looks exactly like a broken feature. Read the script's own output and choose something it did not stage.

- [ ] **Step 4: Type the message that started this**

Type `pizza next friday` into the group chat and send it. The phrasing is what matters here, not the activity; "beers" is unusable against this script for the reason in step 3.

Expected, once Orbit's read settles: a message naming the date rather than "this Friday", carrying the clause, and an idea card whose day matches. Something of this shape, with the actual dates depending on the day you run it:

```
Love it. Pizza on Friday, Sep 11? You said next Friday, so I'm taking that as the one after this week. If three are in, I'll set it up.
```

If Orbit says nothing at all, check the server log before assuming the feature is broken: a suppressed duplicate and a failed model call look identical from the feed.

- [ ] **Step 5: Take the screenshot and check the card**

Screenshot the feed and the card together. Confirm the card's day matches the message's date, since they are composed by different code paths from the same stored row.

- [ ] **Step 6: Stop the dev server**

Stop it with `preview_stop`, and any stray server serving this project. Leaving one running is a standing rule, not a nicety.

---

### Task 10: Record it and finish

**Files:**
- Modify: `docs/build-notes.md` (§11)
- Modify: `CLAUDE.md` (the "Where the build is" section)

- [ ] **Step 1: Write the build-notes §11 entry**

400 to 600 words, in product language, appended (the record is append-only). It must carry: the two cases and the one cause; the three decisions Jacob settled and the reasoning behind each, especially why a week runs Monday to Sunday; the bench before-and-after numbers; what the lived QA showed; and the debt below. Add a dated postscript to the existing "Next week got answered with this Friday" entry pointing at it, rather than editing that entry.

Also correct, in the new entry, the 3 September queue entry's claim that this slice needs "both eval benches". It needs one. `eval:onboarding` was never reached.

- [ ] **Step 2: Update CLAUDE.md's current-state section**

The paragraph beginning "Where a sparked event's time comes from" holds the bug's description and its two candidate fixes. Strike the parts that are now false and say what is true, in this file's established strike-through-with-a-date style. Do not delete: the record of the wrong diagnosis being in circulation is part of why the entry exists.

State plainly what is still **not** fixed: a member who was misheard still cannot say "no, I meant the week after" and be understood, because that phrase names no weekday either.

- [ ] **Step 3: Record the debt, in the same edit**

Three items, none blocking. A week-start convention joins the undated-placeholder family that override-learning (build-notes §5) replaces as one decision. The disclosure string is a fifth member of the copy family. And the bench still cannot grade a resolved date, only the extracted claim, so the arithmetic's only evidence is the unit suite.

- [ ] **Step 4: Run the suite one last time**

Run: `npm test -- --run`
Expected: 146 files, zero failures, and a passing count at or above the 1704 baseline.

- [ ] **Step 5: Commit and open the pull request**

The PR body is written for an engineer skimming the repo later, near 300 words, four things only: what changed; how it was verified, with the test numbers before and after, the bench numbers before and after, what was checked by hand, and what could not be checked; what the review found and what was deliberately not fixed; and a pointer to the build-notes entry. Name the `planSparkGauge` extraction explicitly, since it touches already-shipped code the spec's task list is the only record of.

**Open the PR and stop.** Do not merge. The chat message announcing it carries the manual QA script, per `~/.claude/checklists/pr-handoff.md`.

---

## Bench baseline (pre-change)

Taken 3 September 2026, on commit `f34f29a5cb50a91d939036b03db49656977f0ff` (untouched tree, `git status --short` empty before the run). Command: `npm run eval:detect`, default 5 runs. Full output below, verbatim, from `npm run eval:detect 2>&1 | tee /tmp/bench-baseline.txt`.

```
33 cases x 5 runs = 165 model calls

  ...5/33
  ...10/33
  ...15/33
  ...20/33
  ...25/33
  ...30/33
  ...33/33

=== SCOREBOARD ===
must-recognize: 75/75 runs, 15/15 cases clean
must-stay-quiet: 65/65 runs, 13/13 cases clean
ambiguous: 10/20 runs, 2/4 cases clean  (no bar, watched for drift)
accepted: 5/5 runs, 1/1 cases clean  (no bar; a known gap the owner accepted, watched for drift)

=== FAILURES (2) ===

[ambiguous] might-be-late-implies-move  0/5
  Reads as availability and as a hint that the time should move. No right answer; recorded to watch which way the dial drifts.
  x5 expected change, got none

[ambiguous] group-grumble  0/5
  Commentary on behalf of the group that stops just short of asking. Watched, not barred.
  x5 expected change, got none
```

## Bench after-numbers

Taken 3 September 2026, on commit `9e104b14c9714033582f9d18a18bcd99b52745b3` (task 7's commit, `git status --short` empty before the run; no tuning edit was made, so this is also the number on the tree at commit time). Command: `npm run eval:detect`, default 5 runs. Full output below, verbatim, from `npm run eval:detect 2>&1 | tee /tmp/bench-after-round0.txt`.

```
40 cases x 5 runs = 200 model calls

  ...5/40
  ...10/40
  ...15/40
  ...20/40
  ...25/40
  ...30/40
  ...35/40
  ...40/40

=== SCOREBOARD ===
must-recognize: 103/110 runs, 18/22 cases clean
must-stay-quiet: 65/65 runs, 13/13 cases clean
ambiguous: 10/20 runs, 2/4 cases clean  (no bar, watched for drift)
accepted: 5/5 runs, 1/1 cases clean  (no bar; a known gap the owner accepted, watched for drift)

=== FAILURES (6) ===

[ambiguous] might-be-late-implies-move  0/5
  Reads as availability and as a hint that the time should move. No right answer; recorded to watch which way the dial drifts.
  x5 expected change, got none

[ambiguous] group-grumble  0/5
  Commentary on behalf of the group that stops just short of asking. Watched, not barred.
  x5 expected change, got none

[must-recognize] spark-this-weekday  3/5
  The mirror of the case above. 'This Thursday' names a day and pins it to the current week, and reading it as nextWeek would push the plan a week past what was asked for.
  x2 expected spark, got none

[must-recognize] spark-plain-weekday  2/5
  A plain weekday with no week word at all. Guards the common case against over-labelling: this must stay null, because null is what preserves the behaviour every existing group already gets.
  x3 expected spark with horizon null, got thisWeek

[must-recognize] spark-two-weeks-null-horizon  4/5
  The scope line, as a graded case. 'In two weeks' carries real information that this product deliberately cannot hold, and the only safe place to put it is nowhere: reading it as nextWeek would be a wrong date that nobody asked for.
  x1 expected spark, got none

[must-recognize] spark-next-month-null-horizon  4/5
  The last null trap, and the one closest to the field's own wording: 'next month' shares the word 'next' with the phrase that does set it. Same reasoning as the case above.
  x1 expected spark, got none
```

**Comparison against the baseline, in the brief's order.**

1. *Did anything green go red?* No. `must-stay-quiet` (65/65, 13/13) and `accepted` (5/5, 1/1) are byte-identical to the baseline. `ambiguous` is identical too, down to the same two failing case names at the same 0/5 (`might-be-late-implies-move`, `group-grumble`); nothing in this slice touched change-request copy. `must-recognize` grew from 15 to 22 cases (task 7's seven new spark cases) and every one of the original 15 that carried over from the baseline stayed clean; all six failing runs land on the seven brand-new spark cases, which had no baseline reading to regress from. No pre-existing case regressed.

2. *Are the three null-trap cases clean?* **No, not as the rule is literally worded, and that is stated plainly rather than reframed as a pass.** This step's own text sets the bar: "These must be 5/5. A miss here invents a wrong date and blocks the merge." Two of the three are 4/5, not 5/5: `spark-this-weekend-null-horizon` is 5/5, but `spark-two-weeks-null-horizon` and `spark-next-month-null-horizon` each miss one run. **The bar as worded is not met.**

   What is also true, and does not repair the sentence above so much as sit beside it: both misses read `expected spark, got none`, meaning the model did not classify the message as a spark at all that run, and stayed silent, which is this product's documented default for anything it does not recognise. Neither miss reads `got horizon nextWeek`. Across all 40 cases and 200 calls in this run, zero returned `horizon: nextWeek` for a phrase that does not mean next week, so the specific harm the rule's reason names, a wrongly invented date reaching a member, did not occur once.

   The rule bundled a bar (5/5) with a reason (a miss invents a wrong date), and here the two came apart: the bar assumed the only way to miss was to return `nextWeek`, and it turned out there is a second way to miss that the rule did not anticipate. **Deciding that the rule was written too narrowly, and proceeding on that basis, is the coordinator's call, not this report's to make on its own** — recorded here as the coordinator's disclosed reasoning, to go to Jacob rather than be resolved silently in this document.

3. *Are the two nextWeek cases clean?* Yes. `spark-next-week-bare` and `spark-next-weekday` are both 5/5, not present in the failures list at all. The two production bugs this slice targets are fixed 5/5 on the first bench run after the prompt change.

**No tuning was performed.** The stop rule in Task 8's brief gates tuning on "the dangerous direction is failing" (a case reading `nextWeek` for a phrase that does not mean next week); it did not fail anywhere in this run, so zero of the two allowed rounds were spent. The two remaining failure shapes are recorded rather than chased:

- `spark-plain-weekday` (2/5 clean, 3/5 `got thisWeek` instead of `horizon null`) is the behaviourally inert case named in Task 7's report: a stated weekday plus `thisWeek` reaches the exact same date-arithmetic branch as a stated weekday plus `null`, so this case's failures change nothing a member would see. It is bucketed `must-recognize`, which scores it red on a distinction the product cannot act on; flagged as possibly mis-barred (candidate: `ambiguous`, or a horizon-specific no-bar note) rather than changed here, per the instruction not to alter a case's bucket while tuning.
- `spark-this-weekday`, `spark-two-weeks-null-horizon`, and `spark-next-month-null-horizon` each missed one run with `got none`, a plain spark-recognition miss unrelated to the horizon field. These are the first bench cases in this repo's history to exercise spark recognition at all (`grep` confirms no prior `must-recognize` case had `kind: "spark"`), so there was no baseline reading for whether ~90% single-run spark recognition is a change or the pre-existing rate. Answered by the control run directly below.

### Control: the same cases against the pre-change prompt

Requested by the coordinator to answer the open question just above: is the `got none` spark-recognition miss pre-existing, or did the prompt change introduce it? Run on commit `7412d770...` (HEAD at the time), with `src/lib/orbit/spark.ts` temporarily edited to reverse exactly the two lines commit `67c5895` added to `INTENT_SYSTEM_PROMPT` (the `statedDayOfWeek` sentence about "next Friday"/"this Friday", and the whole `- horizon:` line). Nothing else changed: the schema (`INTENT_SCHEMA`), the normalizer, the arithmetic, and all seven bench cases are untouched, and the edit was never committed. `git status --short` was empty again before anything in this task was committed.

Command: `npm run eval:detect -- 5 spark-` (7 cases x 5 runs = 35 model calls). Full output, verbatim:

```
7 cases x 5 runs = 35 model calls

  ...5/7
  ...7/7

=== SCOREBOARD ===
must-recognize: 23/35 runs, 3/7 cases clean

=== FAILURES (4) ===

[must-recognize] spark-this-weekday  3/5
  The mirror of the case above. 'This Thursday' names a day and pins it to the current week, and reading it as nextWeek would push the plan a week past what was asked for.
  x2 expected spark with horizon thisWeek, got null

[must-recognize] spark-plain-weekday  2/5
  A plain weekday with no week word at all. Guards the common case against over-labelling: this must stay null, because null is what preserves the behaviour every existing group already gets.
  x3 expected spark with horizon null, got thisWeek

[must-recognize] spark-this-weekend-null-horizon  3/5
  The hardest of the three null traps, because the phrase literally starts with 'this'. A weekend is not a week: reading it as thisWeek would suppress the notice buffer for an idea that never asked for that.
  x1 expected spark with horizon null, got thisWeek
  x1 expected spark with horizon null, got nextWeek

[must-recognize] spark-two-weeks-null-horizon  0/5
  The scope line, as a graded case. 'In two weeks' carries real information that this product deliberately cannot hold, and the only safe place to put it is nowhere: reading it as nextWeek would be a wrong date that nobody asked for.
  x5 expected spark with horizon null, got nextWeek
```

**A necessary caveat before reading this: the horizon field was not fully absent from what the model saw.** `INTENT_SCHEMA` was left untouched per instruction, and its `horizon` property still requires an enum of `"thisWeek" | "nextWeek" | null` with no natural-language description attached (confirmed by reading the schema: it carries only `{ anyOf: [{ type: "string", enum: [...] }, { type: "null" }] }`, no `description` key). So the control removed the prose that explains what `horizon` means, but the model still had to emit *something* for a field literally named `horizon`, and it plainly used the field name itself as a cue: every one of the 35 calls returned a `spark` kind with some horizon value, several of them `thisWeek` or `nextWeek`. **This means the horizon-value assertions in this control are not a clean measurement of "the old prompt" and should not be read as one** — `spark-two-weeks-null-horizon` failing 0/5 here does not mean the old prompt was worse at that phrase than the new one; it means the field name alone was enough to make the model guess wrong on that case even with no guidance text, which is a different fact than the new prompt's own tuning.

**What this control does cleanly measure, and the only thing it should be read for: the `got none` rate, a kind mismatch, independent of any horizon value.** Scanning all four failure entries above, none reads `got none` — every failure is `expected spark with horizon X, got Y`, meaning the model recognised every single one of these 35 messages as a spark. **The `got none` rate against the old prompt is 0/35. The `got none` rate against the new prompt, on these same seven cases, is 4/35** (`spark-this-weekday` 2/5, `spark-two-weeks-null-horizon` 1/5, `spark-next-month-null-horizon` 1/5, all reported earlier in this document's after-numbers).

**Conclusion: the `got none` spark-recognition misses are not pre-existing. They do not appear at all under the old prompt and appear at an 11% rate (4/35) under the new one, so the prompt change introduced them.** This was not tuned against here, per the coordinator's instruction to run the control only, not to touch the prompt again.

After the control run, `src/lib/orbit/spark.ts` was restored with `git checkout -- src/lib/orbit/spark.ts` and `git status --short` confirmed empty before this section was committed.

Reasoning, the flagged bucket question, and this control's finding (a real, newly-introduced recognition cost, separate from the horizon-invention bug this slice targets) are Task 10's to carry into build-notes §11.
