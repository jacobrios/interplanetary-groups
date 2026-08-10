# Answer Seam Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Orbit recognizes a member's reply to its own "What day works better?" ask and opens the revival gauge from stored facts, closing the seam where the two bench cases fail 0/5.

**Architecture:** A third intent class ("answer to Orbit's open question") joins spark and change in the one existing model call. Deterministic code derives whether an ask is open *before* the call (from `Gauge.retryAskMessageId` plus the same answered-test the guess uses), feeds the model one context line only when it is, and refuses to trust an "answer" claim outside that window. The model contributes only answer-ness, a named day, and an optional stated time; the activity, carried time, and fallback date all come from the stored failed gauge. Spec: `docs/superpowers/specs/2026-08-05-answer-seam-design.md`.

**Tech Stack:** Next.js 16 server action (`detect-intent.ts`), Prisma 7, claude-haiku-4-5 via `callExtractionModel` structured outputs, Vitest, the `evals/detect` bench (tsx, real model, no DB).

## Global Constraints

- **No schema change, no migration.** Decision 2: the open-ask window is derived from existing columns. If you find yourself editing `prisma/schema.prisma`, stop; the plan is wrong or you are.
- **`src/lib/orbit/spark-copy.ts` must never import the Anthropic SDK** (its header explains why). All new pure helpers go there; all model calls stay in `spark.ts`.
- **No em dashes in any Orbit copy** (CLAUDE.md product-voice rule). The new context line is model-facing, not member-facing, but follow the rule there too.
- **TDD, red first:** every unit test is written and watched failing before its implementation. The bench is the slice's day-one red and is re-confirmed red (filtered run) before any prompt text changes.
- **The bench never joins the test suite.** No new file under `evals/` or `scripts/` may be named `*.test.ts`.
- **Suite stays green from an empty database**; DB-backed tests create and clean their own fixtures (see `src/lib/gauges/__tests__/gauges.test.ts` for the house pattern).
- **`npm run db:which` before running any staging script**, every time. It must print the dev-test ref `pxbewardwvoyqqcvogel`.
- Suite baseline, already recorded on this branch: **605 tests / 40 files, green** (spec, 5 Aug 2026). Run `npm test` after each task; finish at ≥ 605 with zero failures.
- Commit after each task with a message in the repo's plain-language house style (see `git log`).

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `CLAUDE.md` | Modify (settled list) | Record the time-carry amendment first (spec decision 5) |
| `src/lib/gauges/open-ask.ts` | Create | Derive "an unanswered day-ask is open" from stored state |
| `src/lib/gauges/__tests__/open-ask.test.ts` | Create | DB-backed tests for that derivation |
| `src/lib/orbit/spark-copy.ts` | Modify | `buildOpenAskLine`, `resolveAnswerTime`, `planAnswerGauge` (all pure) |
| `src/lib/orbit/__tests__/spark-copy.test.ts` | Modify | Unit tests for the three helpers |
| `src/lib/orbit/spark.ts` | Modify | Schema + prompt + `NormalizedAnswer` + `normalizeIntent` answer arm + `IntentContext.openAskLine` |
| `src/lib/orbit/__tests__/spark.test.ts` | Modify | Normalize-arm tests, prompt-pinning tests, `openAskLine` plumbing tests |
| `src/app/actions/detect-intent.ts` | Modify | Fetch open ask, feed context, carry out the answer branch |
| `evals/detect/cases.ts` | Modify | `openAsk` case field; retarget the four retry-answer cases |
| `evals/detect/run.ts` | Modify | Build the same context the action builds; grade the answer kind |
| `scripts/qa-stage-answer.ts` | Create | Stage a group with a posted, unanswered ask for browser QA |
| `docs/build-notes.md` | Modify | §11 entry, register rows (final task) |

---

### Task 1: The CLAUDE.md amendment (first, per the standing rules-file rule)

**Files:**
- Modify: `CLAUDE.md` (the "Settled and not open, carried forward" list in "Where the build is")

Spec decision 5 amends last slice's "a member's answer rides the spark path unchanged": time now inherits. The rules file loads every session, so the edit lands before any code.

**Interfaces:** none; prose only.

- [ ] **Step 1: Edit the settled-list item**

In `CLAUDE.md`, find the settled-list entry ending:

> and time carrying across a retry by copying the original gauge's stored `proposedTime`, never by re-deriving it (4 Aug 2026, wrong-day-retry slice).

Replace that final clause with:

> and time carrying across a retry by copying the original gauge's stored `proposedTime`, never by re-deriving it (4 Aug 2026, wrong-day-retry slice; extended 5 Aug 2026, answer-seam slice: a member's day-answer inherits the same stored time too, a stated time in the answer winning, so "rides the spark path unchanged" no longer holds for time).

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "The settled time-carry rule grows to cover a member's answer"
```

---

### Task 2: Confirm the bench is still red, then derive the open ask

**Files:**
- Create: `src/lib/gauges/open-ask.ts`
- Test: `src/lib/gauges/__tests__/open-ask.test.ts`

**Interfaces:**
- Consumes: `prisma` from `@/lib/prisma`; schema fields `Gauge.retryAskMessageId`, `Gauge.retryGuessOfGaugeId`, `Gauge.activity`, `Gauge.proposedDate`, `Gauge.proposedTime`, relation `retryAskMessage`.
- Produces (later tasks rely on these exact names):

```ts
export interface OpenRetryAsk {
  gaugeId: string
  activity: string
  /** Group-local midnight of the day that failed. */
  proposedDate: Date
  /** The failed gauge's stored "HH:mm", null only for pre-part-two gauges. */
  proposedTime: string | null
  askCreatedAt: Date
}
export async function findOpenRetryAsk(groupId: string, now: Date): Promise<OpenRetryAsk | null>
```

- [ ] **Step 1: Re-confirm the day-one red (no code yet)**

```bash
npm run eval:detect 5 retry-answer
```

Expected (matches the recorded wrong-day-retry numbers): `retry-answer-bare-day` 0/5, `retry-answer-day-works` 0/5, `retry-answer-nostalgia` 5/5. Paste the scoreboard into the task report; it is the before-number for build-notes §11.

- [ ] **Step 2: Write the failing tests**

Create `src/lib/gauges/__tests__/open-ask.test.ts`, following the fixture pattern of `gauges.test.ts` in the same directory (unique `[TEST]`-prefixed rows, `afterAll` cleanup in FK order, `timeZone: "UTC"`). Fixture helper: create a gauge via `prisma.gauge.create` with an Orbit message, then attach an ask message by setting `retryAskMessageId`. Cases:

```ts
import { describe, it, expect, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { MessageAuthor } from "@prisma/client"
import { findOpenRetryAsk } from "../open-ask"

// Fixtures: one group; helpers below create gauges with or without an
// attached ask, at controlled createdAt values via prisma's data payload.

describe("findOpenRetryAsk", () => {
  it("returns null for a group with no asked gauge", async () => { /* fresh group */ })

  it("finds an asked gauge nothing has answered", async () => {
    // gauge activity "beers", proposedDate yesterday, ask message created 3h ago
    // expect: { gaugeId, activity: "beers", askCreatedAt } matching the fixture
  })

  it("a member-opened same-activity gauge after the ask closes the window", async () => {
    // second gauge, activity "beers", createdAt after askCreatedAt → null
  })

  it("Orbit's own guess gauge closes the window too", async () => {
    // second gauge with retryGuessOfGaugeId set → null. This is DELIBERATELY
    // wider than handleGuess's answered-test, which excludes guess gauges for
    // its own race reasons: once the guess is posted, a day reply is a comment
    // on a live gauge (queued seam), not an answer to the ask.
  })

  it("a different-activity gauge does not close the window", async () => {
    // "bowling" gauge after the ask → the beers ask is still open
  })

  it("case-insensitive activity match", async () => { /* "Beers" closes "beers" */ })

  it("an ask older than the safety cap is not open", async () => {
    // ask message createdAt 49h before now → null
  })

  it("with two open asks, the newest wins", async () => { /* two activities */ })
})
```

Write real fixture code for each (the shapes above are the required cases, not placeholders to skip).

- [ ] **Step 3: Run to verify failure**

```bash
npx vitest run src/lib/gauges/__tests__/open-ask.test.ts
```

Expected: FAIL, module `../open-ask` not found.

- [ ] **Step 4: Implement `src/lib/gauges/open-ask.ts`**

```ts
// src/lib/gauges/open-ask.ts
//
// Derives "Orbit has an unanswered day-ask open in this group" from stored
// state alone (spec decision 2: no new fields). The window opens when the
// retry ask posts and closes the moment ANY new same-activity gauge exists,
// a member's answer or Orbit's own guess alike. That is deliberately wider
// than endgame.ts's answered-test, which excludes guess gauges for its own
// concurrency reasons: once the guess is up, a day reply is a comment on a
// live gauge (a queued seam), not an answer to the ask.

import { prisma } from "@/lib/prisma"

/**
 * Safety cap only. In a healthy sweep the guess posts the next evening and
 * closes the window itself within about a day; the cap keeps an ask from
 * lingering open forever if the sweep is down long enough for the gauge to
 * age out of the candidate window without ever guessing.
 */
export const RETRY_ASK_OPEN_HOURS = 48

export interface OpenRetryAsk {
  gaugeId: string
  activity: string
  proposedDate: Date
  proposedTime: string | null
  askCreatedAt: Date
}

export async function findOpenRetryAsk(groupId: string, now: Date): Promise<OpenRetryAsk | null> {
  const cutoff = new Date(now.getTime() - RETRY_ASK_OPEN_HOURS * 60 * 60 * 1000)

  const candidates = await prisma.gauge.findMany({
    where: {
      groupId,
      retryAskMessageId: { not: null },
      retryAskMessage: { createdAt: { gt: cutoff } },
    },
    include: { retryAskMessage: { select: { createdAt: true } } },
    orderBy: { retryAskMessage: { createdAt: "desc" } },
  })

  for (const gauge of candidates) {
    const askCreatedAt = gauge.retryAskMessage?.createdAt
    if (!askCreatedAt) continue
    const answered = await prisma.gauge.findFirst({
      where: {
        groupId,
        id: { not: gauge.id },
        activity: { equals: gauge.activity, mode: "insensitive" },
        createdAt: { gt: askCreatedAt },
      },
      select: { id: true },
    })
    if (!answered) {
      return {
        gaugeId: gauge.id,
        activity: gauge.activity,
        proposedDate: gauge.proposedDate,
        proposedTime: gauge.proposedTime,
        askCreatedAt,
      }
    }
  }
  return null
}
```

- [ ] **Step 5: Run to verify pass, then full suite**

```bash
npx vitest run src/lib/gauges/__tests__/open-ask.test.ts
npm test
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/gauges/open-ask.ts src/lib/gauges/__tests__/open-ask.test.ts
git commit -m "An open day-ask becomes a fact code can derive from stored state"
```

---

### Task 3: The pure planners (spark-copy.ts)

**Files:**
- Modify: `src/lib/orbit/spark-copy.ts`
- Test: `src/lib/orbit/__tests__/spark-copy.test.ts`

**Interfaces:**
- Consumes: existing `chooseProposedDate`, `chooseRetryGuessDate`, `sparkStartInstant`, `CLOSE_BEFORE_START_HOURS`, `EVENING_TIME`, `formatWeekdayLong`, and the file-local `pad`/`splitTime`.
- Produces (Tasks 5 and 6 rely on these exact names):

```ts
export function buildOpenAskLine(activity: string, failedProposedDate: Date, timeZone: string): string

export function resolveAnswerTime(input: {
  answerTime: string | null
  answerTimeAmbiguous: boolean
  /** The failed gauge's stored proposedTime; null only for pre-part-two gauges. */
  carriedTime: string | null
}): string

export interface PlannedAnswerGauge {
  proposedDate: Date
  timeLocal: string
  /** True only when the member named exactly one day (the existing seeding rule). */
  seedNamer: boolean
  /** Born inside its own close window; caller appends the urgency clause. */
  bornLate: boolean
}
export function planAnswerGauge(
  answer: { dayOfWeek: number | null; time: string | null; timeAmbiguous: boolean },
  ask: { proposedDate: Date; proposedTime: string | null },
  timeZone: string,
  now: Date
): PlannedAnswerGauge | null // null: the resolved start is already past; stay quiet
```

- [ ] **Step 1: Write the failing tests** (append to `spark-copy.test.ts`; use the same weekday anchors documented at the top of `spark.test.ts`: 2026-07-20 Mon, 07-24 Fri, and `Pacific/Midway` for the zone-boundary case)

```ts
describe("buildOpenAskLine", () => {
  it("names the activity and the failed weekday", () => {
    // failedProposedDate = Fri 2026-07-24 UTC midnight, tz UTC
    // expect: "Orbit asked the group what day works better for beers, since Friday didn't work, and is waiting on an answer."
  })
  it("reads the weekday in the group's zone, not the server's", () => {
    // 2026-07-23T02:00Z is still Wed in Pacific/Midway; expect "Wednesday"
  })
  it("uses no em or en dashes", () => { /* match the buildGaugeMessage precedent */ })
})

describe("resolveAnswerTime", () => {
  it("no stated time carries the original's", () =>
    expect(resolveAnswerTime({ answerTime: null, answerTimeAmbiguous: false, carriedTime: "20:00" })).toBe("20:00"))
  it("a stated unambiguous time wins", () =>
    expect(resolveAnswerTime({ answerTime: "21:00", answerTimeAmbiguous: false, carriedTime: "20:00" })).toBe("21:00"))
  it("a bare number lands in the original's half of day: evening original", () =>
    // "Saturday at 9?" against a 20:00 plan is 21:00, decided by the group's own
    // stored time, so no disclosure exists anywhere in this path
    expect(resolveAnswerTime({ answerTime: "09:00", answerTimeAmbiguous: true, carriedTime: "20:00" })).toBe("21:00"))
  it("a bare number against a morning original stays morning", () =>
    expect(resolveAnswerTime({ answerTime: "09:00", answerTimeAmbiguous: true, carriedTime: "08:00" })).toBe("09:00"))
  it("no original time falls to the evening default", () =>
    expect(resolveAnswerTime({ answerTime: null, answerTimeAmbiguous: false, carriedTime: null })).toBe("19:00"))
})

describe("planAnswerGauge", () => {
  // ask fixture: proposedDate Fri 2026-07-24, proposedTime "20:00", tz UTC
  it("a named day takes its next occurrence with the time carried", () => {
    // now Sat 2026-07-25 09:00Z, dayOfWeek 6 (Sat) → proposedDate Sat 07-25, timeLocal "20:00", seedNamer true
  })
  it("no named day falls to the same weekday next week, nobody seeded", () => {
    // dayOfWeek null → proposedDate Fri 07-31 (chooseRetryGuessDate), seedNamer false
  })
  it("a stated time wins over the carried one", () => { /* time "21:00" → timeLocal "21:00" */ })
  it("refuses a start already past", () => {
    // now Sat 2026-07-25 21:00Z, dayOfWeek 6, carried "20:00" → null
  })
  it("flags a same-evening answer as born late", () => {
    // now Sat 2026-07-25 19:00Z, dayOfWeek 6, carried "20:00" → bornLate true
  })
  it("computes the fallback across a month boundary in a non-UTC zone", () => {
    // ask proposedDate near a month end, tz "America/Chicago"; assert exact instant
  })
})
```

Write the full bodies; the comments above state the fixtures and expectations each must assert.

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/lib/orbit/__tests__/spark-copy.test.ts` — expect FAIL on missing exports.

- [ ] **Step 3: Implement in `spark-copy.ts`** (beside the other retry helpers; `import type { NormalizedAnswer }` is NOT needed, take plain field params as typed above to keep this file free of spark.ts imports beyond the existing type-only `PartOfDay`)

```ts
/** Model-facing context, not member-facing copy: the fact the recognizer needs. */
export function buildOpenAskLine(activity: string, failedProposedDate: Date, timeZone: string): string {
  const weekday = formatWeekdayLong(failedProposedDate, timeZone)
  return `Orbit asked the group what day works better for ${activity}, since ${weekday} didn't work, and is waiting on an answer.`
}

export function resolveAnswerTime({ answerTime, answerTimeAmbiguous, carriedTime }: {
  answerTime: string | null
  answerTimeAmbiguous: boolean
  carriedTime: string | null
}): string {
  const carried = carriedTime ?? EVENING_TIME
  if (answerTime === null) return carried
  if (!answerTimeAmbiguous) return answerTime
  // A bare clock number reads into the half of day the group already chose.
  // The original stored time did the deciding, not Orbit, so no disclosure
  // exists on this path (the same reasoning as resolveSparkTime's
  // morning-partOfDay case).
  const [h, m] = splitTime(answerTime)
  const carriedHour = splitTime(carried)[0]
  if (carriedHour >= 12 && h >= 1 && h <= 11) return `${pad(h + 12)}:${pad(m)}`
  return answerTime
}

export function planAnswerGauge(
  answer: { dayOfWeek: number | null; time: string | null; timeAmbiguous: boolean },
  ask: { proposedDate: Date; proposedTime: string | null },
  timeZone: string,
  now: Date
): PlannedAnswerGauge | null {
  const proposedDate =
    answer.dayOfWeek !== null
      ? chooseProposedDate(answer.dayOfWeek, null, timeZone, now)
      : chooseRetryGuessDate(ask.proposedDate, timeZone)
  const timeLocal = resolveAnswerTime({
    answerTime: answer.time,
    answerTimeAmbiguous: answer.timeAmbiguous,
    carriedTime: ask.proposedTime,
  })
  const start = sparkStartInstant(proposedDate, timeLocal, timeZone)
  if (start <= now) return null
  const bornLate = now.getTime() >= start.getTime() - CLOSE_BEFORE_START_HOURS * 60 * 60 * 1000
  return { proposedDate, timeLocal, seedNamer: answer.dayOfWeek !== null, bornLate }
}
```

(Plus the `PlannedAnswerGauge` interface as in the Interfaces block.)

- [ ] **Step 4: Run to verify pass, then full suite** — `npx vitest run src/lib/orbit/__tests__/spark-copy.test.ts && npm test`

- [ ] **Step 5: Commit**

```bash
git add src/lib/orbit/spark-copy.ts src/lib/orbit/__tests__/spark-copy.test.ts
git commit -m "Pure planners turn a day answer plus stored facts into a gauge shape"
```

---

### Task 4: The recognizer learns the answer class (spark.ts)

**Files:**
- Modify: `src/lib/orbit/spark.ts`
- Test: `src/lib/orbit/__tests__/spark.test.ts`

**Interfaces:**
- Produces (Tasks 5 and 6 rely on these exact names):

```ts
export interface NormalizedAnswer {
  dayOfWeek: number | null
  /** Validated "HH:mm", or null when none was stated. */
  time: string | null
  timeAmbiguous: boolean
}
export type NormalizedIntent =
  | { kind: "none" }
  | { kind: "spark"; spark: Extract<NormalizedSpark, { spark: true }> }
  | { kind: "change"; change: NormalizedChange }
  | { kind: "answer"; answer: NormalizedAnswer }

// IntentContext gains, alongside the existing three fields:
//   /** buildOpenAskLine output when an unanswered day-ask is open, else null. */
//   openAskLine: string | null

// hasOpenAsk is REQUIRED, no default, so the compiler surfaces every call site.
export function normalizeIntent(raw: unknown, upcomingCount: number, hasOpenAsk: boolean): NormalizedIntent
```

- [ ] **Step 1: Write the failing normalize tests** (append to the `normalizeIntent` describe block in `spark.test.ts`; also update every existing `normalizeIntent(x, n)` call in this file to `normalizeIntent(x, n, false)` — the compiler will list them)

```ts
describe("normalizeIntent, answer arm", () => {
  const answerClaim = {
    isAskAnswer: true, answerDayOfWeek: 6, answerTime: null, answerTimeAmbiguous: false,
    isSpark: false, activity: null, statedDayOfWeek: null, statedTime: null,
    timeAmbiguous: false, partOfDay: null,
    isChangeRequest: false, targetEventNumber: null, requestedTime: null,
    requestedTimeAmbiguous: false, requestedFields: [], intentClear: false,
  }

  it("carries an answer through inside an open window", () => {
    expect(normalizeIntent(answerClaim, 0, true)).toEqual({
      kind: "answer", answer: { dayOfWeek: 6, time: null, timeAmbiguous: false },
    })
  })

  it("ignores the claim entirely when no ask is open (decision 3)", () => {
    // Same claim, hasOpenAsk false: falls through to the existing arms → none.
    expect(normalizeIntent(answerClaim, 0, false)).toEqual({ kind: "none" })
  })

  it("the answer arm outranks a change claim inside the window (decision 4)", () => {
    expect(
      normalizeIntent({ ...answerClaim, isChangeRequest: true, requestedFields: ["day"] }, 0, true).kind
    ).toBe("answer")
  })

  it("the answer arm outranks even an incoherent both-true claim inside the window", () => {
    expect(
      normalizeIntent({ ...answerClaim, isSpark: true, isChangeRequest: true }, 0, true).kind
    ).toBe("answer")
  })

  it("degrades a bad day to no named day rather than rejecting the answer", () => {
    expect(normalizeIntent({ ...answerClaim, answerDayOfWeek: 9 }, 0, true)).toEqual({
      kind: "answer", answer: { dayOfWeek: null, time: null, timeAmbiguous: false },
    })
  })

  it("validates the time and ties ambiguity to a time that exists", () => {
    expect(
      normalizeIntent({ ...answerClaim, answerTime: "21:00", answerTimeAmbiguous: true }, 0, true)
    ).toEqual({ kind: "answer", answer: { dayOfWeek: 6, time: "21:00", timeAmbiguous: true } })
    expect(
      normalizeIntent({ ...answerClaim, answerTime: "9ish", answerTimeAmbiguous: true }, 0, true)
    ).toEqual({ kind: "answer", answer: { dayOfWeek: 6, time: null, timeAmbiguous: false } })
  })

  it("still normalizes when a model omits the new fields entirely", () => {
    const { isAskAnswer, answerDayOfWeek, answerTime, answerTimeAmbiguous, ...old } = answerClaim
    expect(normalizeIntent(old, 0, true)).toEqual({ kind: "none" })
  })
})
```

- [ ] **Step 2: Write the failing prompt-pinning and plumbing tests** (append to the `detectIntentClaim` describe block; every existing `detectIntentClaim` call in this file gains `openAskLine: null`)

```ts
it("teaches the answer class and its precedence", async () => {
  await detectIntentClaim("Saturday?", { upcomingLines: [], conversationBlock: "", openProposalLines: [], openAskLine: null })
  const system = vi.mocked(callExtractionModel).mock.calls.at(-1)![0]
  expect(system).toContain("ANSWER")
  expect(system.toLowerCase()).toContain("waiting on an answer")
  expect(system).toContain("prefer ANSWER over CHANGE REQUEST")
})

it("the open-ask line rides the user message when an ask is open", async () => {
  await detectIntentClaim("Saturday?", {
    upcomingLines: [], conversationBlock: "x", openProposalLines: [],
    openAskLine: "Orbit asked the group what day works better for beers, since Friday didn't work, and is waiting on an answer.",
  })
  const userMsg = vi.mocked(callExtractionModel).mock.calls.at(-1)![1]
  expect(userMsg).toContain("waiting on an answer")
})

it("no open ask, no line", async () => {
  await detectIntentClaim("Saturday?", { upcomingLines: [], conversationBlock: "x", openProposalLines: [], openAskLine: null })
  const userMsg = vi.mocked(callExtractionModel).mock.calls.at(-1)![1]
  expect(userMsg).not.toContain("waiting on an answer")
})

it("the schema carries the four answer fields", () => {
  expect(INTENT_SCHEMA.required).toContain("isAskAnswer")
  expect(INTENT_SCHEMA.properties.answerDayOfWeek).toBeDefined()
})
```

- [ ] **Step 3: Run to verify failure** — `npx vitest run src/lib/orbit/__tests__/spark.test.ts` — expect FAIL (type errors on `openAskLine`, missing prompt text).

- [ ] **Step 4: Implement in `spark.ts`**

Schema: add to `required` and `properties`:

```ts
    isAskAnswer: { type: "boolean" },
    answerDayOfWeek: { type: ["integer", "null"] },
    answerTime: { type: ["string", "null"] },
    answerTimeAmbiguous: { type: "boolean" },
```

Prompt, four edits to `INTENT_SYSTEM_PROMPT`:

1. Class list, after the CHANGE REQUEST bullet:

```
- ANSWER: possible only when a note below says Orbit is waiting on an answer about what day works better. The message answers that question with a day or a rough time frame, like "Saturday?", "saturday works for me", or "next week?".
```

2. Context paragraph, append:

```
 When a note says Orbit is waiting on an answer about what day works better for an activity, a short reply naming a day or a time frame is almost always that answer: classify it as ANSWER even though it names a weekday, not as a change request and not as a spark. A message about the past ("saturday was fun") answers nothing.
```

3. Tiebreak paragraph, append:

```
 While Orbit is waiting on a day answer, prefer ANSWER over CHANGE REQUEST for a short reply that names a day.
```

4. New field block after the change-request fields:

```
Answer fields (false or null whenever isAskAnswer is false, and always when no note says Orbit is waiting on an answer):
- isAskAnswer: true only when a note says Orbit is waiting on an answer AND this message answers it.
- answerDayOfWeek: 0 for Sunday through 6 for Saturday, ONLY when the answer names exactly one specific weekday. "next week?" and "any day works" name none, so null. Null whenever you are not certain a single weekday was named.
- answerTime: 24-hour "HH:MM" only if the answer states a time ("Saturday at 9?" is "09:00" with the ambiguity flag). Null when no time was stated.
- answerTimeAmbiguous: true only when a clock number was given with no am or pm. When answerTime is null, false.
```

Types and `IntentContext` per the Interfaces block. In `detectIntentClaim`, after `proposalBlock`:

```ts
  const askBlock = context.openAskLine ? `\n\n${context.openAskLine}` : ""
```

and include `${askBlock}` in the user template directly after `${proposalBlock}`.

`normalizeIntent`: insert the answer arm after the object guard and BEFORE the both-true discard:

```ts
  // The answer arm outranks the other two, and exists only inside its window:
  // hasOpenAsk is deterministic code's own confirmation (decision 3), so a
  // claimed answer with no open ask is ignored entirely, and inside the window
  // the answer reading beats a change reading (decision 4) because Orbit's own
  // question is the loudest context on screen.
  if (hasOpenAsk && o.isAskAnswer === true) {
    const d = o.answerDayOfWeek
    const dayOfWeek =
      typeof d === "number" && Number.isInteger(d) && d >= 0 && d <= 6 ? d : null
    const time =
      typeof o.answerTime === "string" && TIME_LOCAL_RE.test(o.answerTime) ? o.answerTime : null
    const timeAmbiguous = time !== null && o.answerTimeAmbiguous === true
    return { kind: "answer", answer: { dayOfWeek, time, timeAmbiguous } }
  }
```

Then fix the two other call sites the compiler reports (`detect-intent.ts`, `evals/detect/run.ts`) minimally so the build compiles: pass `openAskLine: null` and `false` for now; Tasks 5 and 6 wire them properly. Update the module header comment ("decides which of three things" → four, listing the answer class and its window).

- [ ] **Step 5: Run to verify pass, then full suite** — `npx vitest run src/lib/orbit/__tests__/spark.test.ts && npm test`

- [ ] **Step 6: Commit**

```bash
git add src/lib/orbit/spark.ts src/lib/orbit/__tests__/spark.test.ts src/app/actions/detect-intent.ts evals/detect/run.ts
git commit -m "The recognizer learns a third class: an answer to Orbit's open question"
```

---

### Task 5: The orchestration (detect-intent.ts)

**Files:**
- Modify: `src/app/actions/detect-intent.ts`

**Interfaces:**
- Consumes: `findOpenRetryAsk` (Task 2), `buildOpenAskLine`, `planAnswerGauge` (Task 3), the `kind: "answer"` branch of `normalizeIntent` (Task 4), existing `createGauge`, `findLiveGauges`, `buildGaugeMessage`, `buildUrgencyClause`.
- Produces: the member-visible behavior. No new exports.

This file is the thin orchestrator and stays deliberately without direct unit tests, matching the existing spark and change branches: every decision inside the new branch lives in the pure, tested helpers, the classification is bench-covered (Task 6), and the DB path is walked in the browser (Task 7). State exactly that in the task report rather than claiming coverage that does not exist.

- [ ] **Step 1: Fetch the open ask before the model call** (after the `openProposalLines` block, replacing Task 4's stopgap)

```ts
    // The open day-ask, derived before the model is called: the model is told
    // about it only when deterministic code says it exists, and normalizeIntent
    // refuses an answer claim unless the same check passed (decision 3).
    const openAsk = await findOpenRetryAsk(group.id, now)
    const openAskLine = openAsk
      ? buildOpenAskLine(openAsk.activity, openAsk.proposedDate, group.timeZone)
      : null

    const claim = await detectIntentClaim(message.body, {
      upcomingLines,
      conversationBlock,
      openProposalLines,
      openAskLine,
    })
    const intent = normalizeIntent(claim, events.length, openAsk !== null)
```

- [ ] **Step 2: The answer branch** (insert before the `intent.kind === "spark"` branch)

```ts
    if (intent.kind === "answer") {
      // normalizeIntent only returns "answer" when openAsk was non-null; the
      // guard keeps that coupling honest rather than trusting it at a distance.
      if (!openAsk) return { status: "quiet" }

      // Same two guards as the spark branch: never a second gauge for an
      // activity the group is already being asked about or already has booked.
      const activityKey = openAsk.activity.toLowerCase()
      const live = await findLiveGauges(group.id, now)
      if (live.some((g) => g.activity.toLowerCase() === activityKey)) {
        return { status: "quiet" }
      }
      const alreadyOnCalendar = await prisma.event.findFirst({
        where: {
          groupId: group.id,
          startsAt: { gte: now },
          activityLabel: { equals: openAsk.activity, mode: "insensitive" },
        },
        select: { id: true },
      })
      if (alreadyOnCalendar) return { status: "quiet" }

      const planned = planAnswerGauge(
        intent.answer,
        { proposedDate: openAsk.proposedDate, proposedTime: openAsk.proposedTime },
        group.timeZone,
        now
      )
      if (!planned) return { status: "quiet" }

      // Everything stored, nothing re-derived: the activity is the failed
      // gauge's own, the time is carried (a stated one won inside the
      // planner), and the disclosure slot is null because no coin flip
      // exists on this path.
      const result = await createGauge({
        groupId: group.id,
        sourceMessageId: message.id,
        activity: openAsk.activity,
        proposedDate: planned.proposedDate,
        proposedTime: planned.timeLocal,
        body:
          buildGaugeMessage(openAsk.activity, planned.proposedDate, group.timeZone, now, null) +
          (planned.bornLate ? buildUrgencyClause(planned.timeLocal) : ""),
        initiatorUserId: planned.seedNamer ? user.id : null,
      })
      if (result.status !== "created") return { status: "quiet" }

      outcome = "gauged"
      touchedGroupId = group.id
    } else if (intent.kind === "spark") {
```

(The existing spark branch becomes the `else if`; the change branch's `} else {` is untouched. Update the imports: add `findOpenRetryAsk` from `@/lib/gauges/open-ask`, and `buildOpenAskLine`, `planAnswerGauge` to the spark-copy import list. Update the action's header comment to name the fourth outcome.)

- [ ] **Step 3: Verify** — `npx tsc --noEmit` reports nothing new in repo source; `npm test` stays green (no new tests here by design, see the task preamble).

- [ ] **Step 4: Commit**

```bash
git add src/app/actions/detect-intent.ts
git commit -m "A recognized day answer opens the revival gauge from stored facts"
```

---

### Task 6: The bench learns to grade answers, then proves the seam

**Files:**
- Modify: `evals/detect/cases.ts`
- Modify: `evals/detect/run.ts`

**Interfaces:**
- Consumes: `buildOpenAskLine`, `startOfLocalDay` from `../../src/lib/orbit/spark-copy`; the `normalizeIntent` third argument.
- Produces: the before/after scoreboard for build-notes §11.

- [ ] **Step 1: Extend the case types** (`cases.ts`)

```ts
export type Expected =
  | { kind: "none" }
  | { kind: "spark"; statedDayOfWeek?: number | null }
  | { kind: "answer"; dayOfWeek?: number | null }
  | { kind: "change"; action?: "reply" | "ask" | "propose" | "move"; replyContains?: string }

// EvalCase gains:
  /** An unanswered retry ask, when one is open. Mirrors findOpenRetryAsk's output. */
  openAsk?: { activity: string; failedDayOfWeek: number }
```

- [ ] **Step 2: Teach the runner the same context the action builds** (`run.ts`)

```ts
// after conversationBlock is built:
  const openAskLine = c.openAsk
    ? buildOpenAskLine(c.openAsk.activity, mostRecentPastOccurrence(c.openAsk.failedDayOfWeek, now), TIME_ZONE)
    : null
```

with a small local helper (the failed day is pinned by weekday, not by a day count, so the line's weekday always matches the weekday the case's history names, whatever day the bench runs on):

```ts
/** The most recent group-local midnight strictly before now that falls on `dow`. */
function mostRecentPastOccurrence(dow: number, now: Date): Date {
  const today = startOfLocalDay(now, TIME_ZONE)
  for (let back = 1; back <= 7; back++) {
    const d = new Date(today.getTime() - back * 86_400_000)
    const local = startOfLocalDay(d, TIME_ZONE)
    if (new Date(local.toLocaleString("en-US", { timeZone: TIME_ZONE })).getDay() === dow) return local
  }
  return today
}
```

(If `getLocalParts` is exported from `src/lib/orbit/occurrence.ts`, prefer it over the `toLocaleString` round-trip for the weekday read; check and use whichever the repo already exposes.)

Pass the line and the flag through:

```ts
  const claim = await detectIntentClaim(c.trigger.body, {
    upcomingLines, conversationBlock, openProposalLines, openAskLine,
  })
  const intent = normalizeIntent(claim, plans.length, c.openAsk !== undefined)
```

`Outcome` gains `| { kind: "answer"; dayOfWeek: number | null }`; after the spark line:

```ts
  if (intent.kind === "answer") return { kind: "answer", dayOfWeek: intent.answer.dayOfWeek }
```

`grade` gains, mirroring the spark day check:

```ts
  if (e.kind === "answer" && o.kind === "answer" && e.dayOfWeek !== undefined && e.dayOfWeek !== o.dayOfWeek) {
    return `expected answer naming day ${e.dayOfWeek}, got ${o.dayOfWeek}`
  }
```

- [ ] **Step 3: Retarget the four retry-answer cases** (`cases.ts`; history and calendar stay byte-identical, all four gain the same `openAsk`)

All four: add `openAsk: { activity: "beers", failedDayOfWeek: 5 }`.

- `retry-answer-bare-day`: `expected: { kind: "answer", dayOfWeek: 6 }`; description now: `"The wrong-day retry's whole bet: after Orbit's close-and-ask, a bare day name is an answer. The open-ask note is what makes it hearable; before it, this read as a plan change or nothing on every run."`
- `retry-answer-day-works`: `expected: { kind: "answer", dayOfWeek: 6 }`; description: `"Same seam, fuller sentence. 'saturday works for me' after the ask is a day answer, not chatter and not a change request."`
- `retry-answer-next-week`: `expected: { kind: "answer", dayOfWeek: null }`; description: `"An answer that names no single day is still an answer. Orbit picks the day (same weekday next week, decision 6); recognition's only job is answer-ness and that no single day was named."`
- `retry-answer-nostalgia`: keep `expected: { kind: "none" }` and the bucket; description: `"The look-alike, now harder: the open-ask note is present and the message still is not an answer. 'saturday was fun' is about the past; recognition must not hear a day name plus an open ask and call it an answer."`

- [ ] **Step 4: Filtered after-run**

```bash
npm run eval:detect 5 retry-answer
```

Expected: `retry-answer-bare-day` 5/5, `retry-answer-day-works` 5/5, `retry-answer-next-week` 5/5, `retry-answer-nostalgia` 5/5. If a must-recognize case scores under 5/5, iterate ONLY on prompt language (the four Task 4 edits), one change per bench run, and record every intermediate number honestly; do not touch normalize logic to chase the model.

- [ ] **Step 5: Full bench run**

```bash
npm run eval:detect
```

Expected: must-stay-quiet holds at 50/50; no previously passing must-recognize case regresses; ambiguous improves by exactly the next-week case. Paste the full scoreboard into the task report; it is the after-number for build-notes §11.

- [ ] **Step 6: Commit**

```bash
git add evals/detect/cases.ts evals/detect/run.ts
git commit -m "The bench hears the answer class, and the answer seam runs green"
```

---

### Task 7: Staging, records, and the QA handoff

**Files:**
- Create: `scripts/qa-stage-answer.ts`
- Modify: `docs/build-notes.md` (§11 entry; register rows in "Where Orbit decides to speak or stay quiet")
- Modify: `CLAUDE.md` ("Where the build is" rewrite at the slice boundary)

**Interfaces:** consumes everything; produces the PR-ready evidence.

- [ ] **Step 1: The staging script**

Create `scripts/qa-stage-answer.ts` on the exact pattern of `scripts/qa-stage-retry.ts` (read it first; fresh group each run, not named `*.test.ts`, run with `npx tsx --env-file=.env`, prints the group link). It stages: a group in `America/Chicago` with four members; one closed day-blocked beers gauge (proposedDate = yesterday group-local, proposedTime "20:00", two IN votes and one NOT_THAT_DAY from seeded members) with its retry ask message posted and attached (create the Orbit message, set `retryAskMessageId`), so the feed ends on "Beers didn't happen for [weekday], but three of you want it. What day works better?". Add a `--verify <groupId>` mode that prints, in plain English, the newest gauge's activity, proposed date, proposed time, and seeded voter names, e.g. `New gauge: beers · Sat Aug 8 · 20:00 (carried) · seeded: Jacob`. Run `npm run db:which` first, every time.

- [ ] **Step 2: Walk it in the browser** (dev server against dev-test)

1. `npm run db:which` → dev-test ref. 2. Stage; open the printed link. 3. Reply "saturday was fun" → Orbit stays silent (wait ~10s, refresh). 4. Reply "Saturday?" → Orbit posts "Love it. Anyone in for beers this Saturday? If three of you are in, I'll set it up." with the tally naming you. 5. `--verify` printout shows the carried 20:00 and your seed. Screenshot the feed for the PR. If any step misbehaves, stop and fix before touching records.

- [ ] **Step 3: build-notes §11 entry and register rows**

New §11 entry in the established voice: what the slice is, the settled decisions by number (pointer to the spec), the bench before/after scoreboards from Tasks 2 and 6, suite before/after counts, what was staged versus lived in QA, and the debt list from the spec verbatim (rate-not-guarantee; the hand-fed context slot; the precedence register row; the more-visible second-member seam). Register table: one new row for the answer class (speak: a recognized answer opens a gauge; the window that gates it) and one for the precedence rule (answer beats change inside the window). Mark the wrong-day-retry entry's answer-seam debt item resolved with a dated strikethrough pointer, per the append-only rule.

- [ ] **Step 4: CLAUDE.md "Where the build is" rewrite**

Rewrite the slice-boundary sections: the answer seam paragraph ("the conversational half does not work" is no longer true; state the new numbers), the next-slice candidates (the recognition fix is done; pending-events surface and read-only questions remain, plus the queued "day comment on a live gauge" seam), and the settled list gains the new decisions (the third class and its window; answer-beats-change precedence; no-single-day answers falling to the guess's date rule). Pre-deploy checklist: nothing to add, and say so in the PR (no migration, no new env).

- [ ] **Step 5: Final suite run and commit**

```bash
npm test
git add scripts/qa-stage-answer.ts docs/build-notes.md CLAUDE.md
git commit -m "The answer seam's records, staging script, and slice-boundary rewrite"
```

- [ ] **Step 6: PR** per `~/.claude/checklists/pr-handoff.md`: independent read-only review first, then the PR with the review report, the QA script (the five browser steps above), before/after bench and suite numbers, and the staged-versus-lived statement. Open the PR and stop; no merging.
