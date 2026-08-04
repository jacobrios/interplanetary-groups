# Wrong-Day Retry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-08-04-wrong-day-retry-design.md`. Read it in full before starting. Thirteen settled decisions; do not relitigate any of them.

**Goal:** When a gauge closes short but its "I'm in" plus "Yes, can't that day" votes would have cleared the bar, Orbit closes-and-asks for a better day in one message; if nobody names one by the next evening, Orbit posts one deterministic guess (same weekday one week after the failed day) as a real gauge with chips; then the idea dies for good.

**Architecture:** Everything rides the existing hourly endgame sweep (`src/lib/orbit/endgame.ts`) and the existing spark machinery. Two new nullable marker columns on `Gauge` (the established `String? @unique` + create-then-conditionally-attach pattern), one relaxed column (`sourceMessageId` becomes nullable, null only for Orbit-guessed gauges), two new deterministic copy builders, one new creation path for the guess gauge. Zero new model calls; a member's answer rides the per-message detection already in place. Zero UI changes: the ask renders as an ordinary Orbit message (no gauge message-id column points at it, so no chips), and the guess gauge is an ordinary gauge whose own `orbitMessageId` gets chips through the existing feed path.

**Tech Stack:** Next.js 16, Prisma 7 (driver adapter, no auto-generate), Vitest integration tests against the remote dev-test DB, tsx scripts for bench and QA staging.

## Global Constraints

- Orbit copy: plain, warm, ~7th-grade voice; **no em dashes in anything Orbit says**; soft declines; composed deterministically in `src/lib/orbit/spark-copy.ts` (structured-extract-then-format; that file must never import the Anthropic SDK).
- All times group-timezone, never viewer-local; day math via `getLocalParts` / `zonedWallTimeToUtc` (day overflow past month/year ends is absorbed by `Date.UTC`; already proven in `chooseProposedDate`).
- Every endgame test call is scoped `runGaugeEndgame(NOW, { groupId: gid })`. Never add an unscoped call back (test-file header rule).
- TDD: every new test written first and watched failing before the code that makes it pass. Suite baseline on this branch: **576 tests / 40 files, green** (recorded in the spec).
- `npm run db:which` before running any script that writes rows (staging, migration). Expected ref: `pxbewardwvoyqqcvogel`.
- Commit after each task. Repo commit style is a short narrative sentence (see `git log`), with trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- `prisma migrate dev` needs a TTY and stalls on a benign `(y/N)` prompt; drive it with `expect` (spawn, wait for the prompt, send `y`), per build-notes §11 (gauge endgame, tooling blocker). Verify no drift and no `db push` before migrating.
- Counts are always derived from vote rows, member-filtered via the existing `memberFilteredVotes` convention. Nothing new is stored that can be derived.

---

### Task 1: Amend "one bump, then let it die" in CLAUDE.md

The spec's first execution task (decision 10): the slice bends a standing rule, so the rule is edited before any code.

**Files:**
- Modify: `CLAUDE.md` (project root), the Orbit guardrails bullet "**One bump, then let it die.**"

**Interfaces:** none (docs only).

- [ ] **Step 1: Replace the guardrail bullet**

Replace the bullet reading "**One bump, then let it die.** A stalled-but-viable idea earns at most one resurfacing. No pinning, no banners." with:

```markdown
- **One bump, then let it die. (Amended 4 Aug 2026, wrong-day-retry slice.)** A stalled-but-viable idea earns at most one resurfacing. No pinning, no banners. One carve-out: a day-blocked idea that would have cleared the bar (in-votes plus can't-that-day votes reaching three) additionally gets one ask at its close and one same-weekday-next-week guess the evening after, then dies; that is its whole allowance. "A gauge whose day has passed is dead" is NOT bent by this: every revival is a genuinely new gauge. (Spec: docs/superpowers/specs/2026-08-04-wrong-day-retry-design.md.)
```

- [ ] **Step 2: Check the edit for em/en dashes**

Run: `grep -n '—\|–' CLAUDE.md | grep -i 'one bump'`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "The one-bump rule learns its one carve-out before any code bends it

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Schema: two retry markers, and sourceMessageId relaxes

**Files:**
- Modify: `prisma/schema.prisma` (Gauge model, lines ~200–249; Message back-relations, lines ~183–186)
- Create: `prisma/migrations/<timestamp>_wrong_day_retry_markers/migration.sql` (generated)
- Modify: `docs/build-notes.md` ("Before first Vercel deploy — prerequisites checklist", ~line 257): append the new migration as an item (deploy-time obligation rule).

**Interfaces:**
- Produces: `Gauge.retryAskMessageId: string | null` (unique, FK to Message, SetNull), `Gauge.retryGuessOfGaugeId: string | null` (unique, FK to Gauge, SetNull), `Gauge.sourceMessageId: string | null` (was non-null). Tasks 5–7 rely on these exact names.

- [ ] **Step 1: Edit the Gauge model**

Change `sourceMessageId String @unique` to `sourceMessageId String? @unique` and its relation to `sourceMessage Message? @relation("GaugeSource", fields: [sourceMessageId], references: [id], onDelete: Cascade)`. Update the field's trailing comment to: `// the MEMBER message that sparked it (idempotency key); null ONLY for an Orbit-guessed retry gauge, which carries retryGuessOfGaugeId instead`.

Add after `closureMessageId`:

```prisma
  /// Orbit's close-and-ask message, posted at close for a day-blocked gauge
  /// whose IN plus NOT_THAT_DAY votes would have cleared the bar. Replaces the
  /// closure note for this class; the unique pointer is also the
  /// never-ask-twice guard. (Spec: wrong-day-retry, decision 3.)
  retryAskMessageId String? @unique
  /// Set on a retry GUESS gauge only: the original gauge whose failed day this
  /// gauge re-proposes (same weekday, one week later). Doubles as the
  /// Orbit-guessed marker (a guess gauge never earns its own ask, spec
  /// decision 7) and as the one-guess-per-original idempotency key.
  retryGuessOfGaugeId String? @unique
```

Add to the relations block of Gauge:

```prisma
  retryAskMessage Message? @relation("GaugeRetryAsk", fields: [retryAskMessageId], references: [id], onDelete: SetNull)
  retryGuessOf    Gauge?   @relation("GaugeRetryGuess", fields: [retryGuessOfGaugeId], references: [id], onDelete: SetNull)
  retryGuess      Gauge?   @relation("GaugeRetryGuess")
```

Add to Message's back-relations (next to `gaugeAsBump` / `gaugeAsClosure`):

```prisma
  gaugeAsRetryAsk Gauge? @relation("GaugeRetryAsk")
```

- [ ] **Step 2: Verify the checkout points at dev-test**

Run: `npm run db:which`
Expected: all three sources agree on `pxbewardwvoyqqcvogel`.

- [ ] **Step 3: Check for drift, then migrate via expect**

Run `npx prisma migrate status` first; expected: no drift, all migrations applied. Then drive `npx prisma migrate dev --name wrong_day_retry_markers` with `expect` (spawn it, `expect "(y/N)"`, `send "y\r"`, `expect eof`), per the recorded tooling blocker. Then `npx prisma generate` (Prisma 7 does not auto-run it).

Expected migration SQL (verify it matches this intent before applying): one `ALTER TABLE "Gauge" ALTER COLUMN "sourceMessageId" DROP NOT NULL`, two `ADD COLUMN` (TEXT, nullable), two unique indexes, two FKs (`ON DELETE SET NULL`).

- [ ] **Step 4: Run the suite to prove nothing broke**

Run: `npm test`
Expected: 576 tests / 40 files green (no behavior change yet).

- [ ] **Step 5: Append the deploy obligation**

In `docs/build-notes.md`'s pre-deploy checklist, append an item in the checklist's existing numbering/style: apply migration `<timestamp>_wrong_day_retry_markers` (two nullable Gauge marker columns plus nullable `sourceMessageId`) to production before deploying this slice.

- [ ] **Step 6: Commit**

```bash
git add prisma/ docs/build-notes.md
git commit -m "The gauge record learns to remember an ask and a guess

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Retry eligibility, as pure arithmetic

**Files:**
- Modify: `src/lib/gauges/threshold.ts`
- Test: `src/lib/gauges/__tests__/threshold.test.ts`

**Interfaces:**
- Consumes: existing `countIn(votes: { answer: GaugeAnswer }[]): number`, `SPARK_THRESHOLD` (= 3).
- Produces: `countNotThatDay(votes: { answer: GaugeAnswer }[]): number` and `isRetryEligible(votes: { answer: GaugeAnswer }[]): boolean`. Task 6 calls `isRetryEligible(memberFilteredVotes(gauge))` and uses both counts for copy.

- [ ] **Step 1: Write the failing tests**

Add to `threshold.test.ts` (pure, no DB), following the file's existing style:

```ts
import { countNotThatDay, isRetryEligible } from "../threshold"
import { GaugeAnswer } from "@prisma/client"

const v = (answer: GaugeAnswer) => ({ answer })

describe("isRetryEligible", () => {
  it("2 IN + 1 NOT_THAT_DAY reaches the bar: eligible", () => {
    expect(isRetryEligible([v("IN"), v("IN"), v("NOT_THAT_DAY")])).toBe(true)
  })
  it("0 IN + 3 NOT_THAT_DAY is the strongest case, not the weakest: eligible", () => {
    expect(isRetryEligible([v("NOT_THAT_DAY"), v("NOT_THAT_DAY"), v("NOT_THAT_DAY")])).toBe(true)
  })
  it("2 IN + 0 NOT_THAT_DAY: not eligible (a can't-day vote is required)", () => {
    expect(isRetryEligible([v("IN"), v("IN")])).toBe(false)
  })
  it("1 IN + 1 NOT_THAT_DAY: below the bar, not eligible", () => {
    expect(isRetryEligible([v("IN"), v("NOT_THAT_DAY")])).toBe(false)
  })
  it("OUT never counts toward the bar", () => {
    expect(isRetryEligible([v("IN"), v("OUT"), v("OUT"), v("NOT_THAT_DAY")])).toBe(false)
  })
  it("3 IN would have promoted; retry is only for closed-short gauges", () => {
    expect(isRetryEligible([v("IN"), v("IN"), v("IN"), v("NOT_THAT_DAY")])).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/gauges/__tests__/threshold.test.ts`
Expected: FAIL, `countNotThatDay` / `isRetryEligible` not exported.

- [ ] **Step 3: Implement**

In `threshold.ts`, matching its existing doc-comment style:

```ts
/** How many current answers are "yes, but not that day". */
export function countNotThatDay(votes: { answer: GaugeAnswer }[]): number {
  return votes.filter((v) => v.answer === GaugeAnswer.NOT_THAT_DAY).length
}

/**
 * Would this gauge have cleared the bar if the day had worked? True when IN
 * plus NOT_THAT_DAY together reach SPARK_THRESHOLD, at least one of them is a
 * NOT_THAT_DAY (otherwise the day was never the blocker), and the gauge is
 * genuinely short (3 IN would have promoted instead). Callers pass
 * member-filtered votes, same as every other count.
 * (Spec: wrong-day-retry, decisions 1 and 2.)
 */
export function isRetryEligible(votes: { answer: GaugeAnswer }[]): boolean {
  const inCount = countIn(votes)
  const cantDay = countNotThatDay(votes)
  return inCount < SPARK_THRESHOLD && cantDay >= 1 && inCount + cantDay >= SPARK_THRESHOLD
}
```

- [ ] **Step 4: Run to verify pass** — same command, expected: PASS, all green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/gauges/threshold.ts src/lib/gauges/__tests__/threshold.test.ts
git commit -m "Would-have-cleared, written as arithmetic a test can pin

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: The ask copy, the guess copy, and the guess-day arithmetic

**Files:**
- Modify: `src/lib/orbit/spark-copy.ts`
- Test: `src/lib/orbit/__tests__/spark-copy.test.ts`

**Interfaces:**
- Consumes: `formatWeekdayLong(date, timeZone)` from `@/lib/events/format`; `getLocalParts`, `zonedWallTimeToUtc` from `./occurrence`; the module-private number-word helper (`spellCount` / `NUMBER_WORDS`, reuse whatever `buildSparkAnnouncement` uses, including its existing fallback for large counts).
- Produces (task 6 and 7 rely on these exact signatures):
  - `chooseRetryGuessDate(failedProposedDate: Date, timeZone: string): Date` — group-local midnight of the same weekday one week after the failed day.
  - `buildRetryAskMessage(activity: string, failedProposedDate: Date, timeZone: string, wantCount: number): string`
  - `buildRetryGuessMessage(activity: string, guessDate: Date, timeZone: string): string`

- [ ] **Step 1: Write the failing tests**

Add to `spark-copy.test.ts`, following its existing pure-function style:

```ts
describe("chooseRetryGuessDate", () => {
  it("same weekday one week later, group-local midnight", () => {
    // Fri 2099-06-12 local midnight in Chicago -> Fri 2099-06-19 local midnight
    const failed = zonedWallTimeToUtc(2099, 6, 12, 0, 0, "America/Chicago")
    const guess = chooseRetryGuessDate(failed, "America/Chicago")
    expect(guess).toEqual(zonedWallTimeToUtc(2099, 6, 19, 0, 0, "America/Chicago"))
  })
  it("crosses a month boundary without a special case", () => {
    const failed = zonedWallTimeToUtc(2099, 1, 28, 0, 0, "America/Chicago")
    const guess = chooseRetryGuessDate(failed, "America/Chicago")
    expect(guess).toEqual(zonedWallTimeToUtc(2099, 2, 4, 0, 0, "America/Chicago"))
  })
})

describe("buildRetryAskMessage", () => {
  it("closes and asks in one breath, activity capitalized, count spelled", () => {
    const failed = zonedWallTimeToUtc(2099, 6, 12, 0, 0, "UTC") // a Friday
    expect(buildRetryAskMessage("beers", failed, "UTC", 3)).toBe(
      "Beers didn't happen for Friday, but three of you want it. What day works better?"
    )
  })
})

describe("buildRetryGuessMessage", () => {
  it("names the next same weekday, no em dashes, ends open for chips", () => {
    const guess = zonedWallTimeToUtc(2099, 6, 19, 0, 0, "UTC") // a Friday
    expect(buildRetryGuessMessage("beers", guess, "UTC")).toBe(
      "No takers on a new day yet, so how about beers next Friday?"
    )
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/orbit/__tests__/spark-copy.test.ts`
Expected: FAIL, functions not exported.

- [ ] **Step 3: Implement**

In `spark-copy.ts`, placed beside `chooseProposedDate` and the closure/bump builders, with the guess-day rule documented as a member of the placeholder family (extend the family doc comment at lines ~38–50 to name it):

```ts
/**
 * The retry guess: the same weekday one week after the failed day. The least
 * presumptuous guess with zero signal about which day works: it keeps the one
 * preference the group actually expressed (a Friday-shaped plan), and "can't
 * Fri" usually means this Friday, not Fridays. A placeholder like the rest of
 * this family; override-learning (build-notes §5) replaces them as one
 * decision. (Spec: wrong-day-retry, decision 5.)
 */
export function chooseRetryGuessDate(failedProposedDate: Date, timeZone: string): Date {
  const p = getLocalParts(failedProposedDate, timeZone)
  // Date.UTC absorbs the day overflow, so month and year ends need no special case.
  return zonedWallTimeToUtc(p.year, p.month, p.day + 7, 0, 0, timeZone)
}

/** The close-and-ask for a day-blocked gauge. Replaces the closure note. */
export function buildRetryAskMessage(
  activity: string,
  failedProposedDate: Date,
  timeZone: string,
  wantCount: number
): string {
  const cap = activity.charAt(0).toUpperCase() + activity.slice(1)
  const weekday = formatWeekdayLong(failedProposedDate, timeZone)
  return `${cap} didn't happen for ${weekday}, but ${spellCount(wantCount)} of you want it. What day works better?`
}

/** The one guess, posted as a real gauge's message the evening after the ask. */
export function buildRetryGuessMessage(activity: string, guessDate: Date, timeZone: string): string {
  const weekday = formatWeekdayLong(guessDate, timeZone)
  return `No takers on a new day yet, so how about ${activity} next ${weekday}?`
}
```

If the number-word helper's real name or signature differs from `spellCount(n)`, use the real one (it is the helper `buildSparkAnnouncement` uses) and keep its existing large-count fallback; adjust nothing else.

- [ ] **Step 4: Run to verify pass** — same command, expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/orbit/spark-copy.ts src/lib/orbit/__tests__/spark-copy.test.ts
git commit -m "The ask, the guess, and the day a week past the one that failed

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Creating the guess gauge

**Files:**
- Modify: `src/lib/gauges/create.ts`
- Test: `src/lib/gauges/__tests__/gauges.test.ts` (creation), `src/lib/gauges/__tests__/promote.test.ts` (time carry through promotion)

**Interfaces:**
- Consumes: `Gauge.retryGuessOfGaugeId` (Task 2), the existing transaction + P2002 pattern in `createGauge`.
- Produces (Task 7 relies on this):

```ts
export interface CreateRetryGuessInput {
  groupId: string
  /** The original gauge whose failed day this guess re-proposes. Also the idempotency key. */
  originGaugeId: string
  activity: string
  /** Group-local midnight, from chooseRetryGuessDate. */
  proposedDate: Date
  /** Copied verbatim from the original gauge (stored state is carried, not re-derived). */
  proposedTime: string
  /** Orbit's composed guess message body. Copy lives in orbit/spark-copy.ts, not here. */
  body: string
}

export type CreateRetryGuessResult =
  | { status: "created"; gauge: Gauge }
  | { status: "skipped"; reason: "already_guessed" }

export async function createRetryGuessGauge(input: CreateRetryGuessInput): Promise<CreateRetryGuessResult>
```

- [ ] **Step 1: Write the failing creation tests**

In `gauges.test.ts`, using the file's existing fixture helpers (group + founder), all scoped to a fresh group:

```ts
describe("createRetryGuessGauge", () => {
  it("creates an Orbit message and a gauge with no source message, no seed vote, and the origin link", async () => {
    // fixture: an ordinary gauge (the original), then:
    const res = await createRetryGuessGauge({
      groupId: gid,
      originGaugeId: original.id,
      activity: "beers",
      proposedDate: GUESS_DATE,
      proposedTime: "20:00",
      body: "No takers on a new day yet, so how about beers next Friday?",
    })
    expect(res.status).toBe("created")
    if (res.status !== "created") return
    expect(res.gauge.sourceMessageId).toBeNull()
    expect(res.gauge.retryGuessOfGaugeId).toBe(original.id)
    expect(res.gauge.proposedTime).toBe("20:00")
    const votes = await prisma.gaugeVote.count({ where: { gaugeId: res.gauge.id } })
    expect(votes).toBe(0) // Orbit named the day, and Orbit is never a vote
    const msg = await prisma.message.findUnique({ where: { id: res.gauge.orbitMessageId } })
    expect(msg?.authorType).toBe(MessageAuthor.ORBIT)
    expect(msg?.authorId).toBeNull()
  })

  it("a second guess for the same original skips as already_guessed and writes no message", async () => {
    // call twice with the same originGaugeId; second call:
    expect(second).toEqual({ status: "skipped", reason: "already_guessed" })
    // and the group's Orbit message count grew by exactly one across both calls
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/lib/gauges/__tests__/gauges.test.ts`, expected FAIL (function not exported).

- [ ] **Step 3: Implement**

In `create.ts`, beside `createGauge`, same shape: one `prisma.$transaction` creating the Orbit message (`{ groupId, authorType: MessageAuthor.ORBIT, authorId: null, body }`) then the gauge (`sourceMessageId: null, retryGuessOfGaugeId: originGaugeId, activity, proposedDate, proposedTime, orbitMessageId: message.id`), **no** vote seeding. Catch Prisma P2002 on the `retryGuessOfGaugeId` unique constraint and return `{ status: "skipped", reason: "already_guessed" }`; the rolled-back transaction takes the orphaned message with it (same reasoning as `createGauge`'s `sourceMessageId` P2002 handling; keep the comment style).

- [ ] **Step 4: Run to verify pass** — same command, expected PASS.

- [ ] **Step 5: Write the failing time-carry promotion test**

In `promote.test.ts` (which builds gauges through real creation paths): create an original-style gauge context, call `createRetryGuessGauge` with `proposedTime: "20:00"` and a proposed date ≥ 2 days ahead of the test's `NOW`, add three IN votes via the file's existing vote helper, then:

```ts
const result = await promoteGaugeToEvent(guessGauge.id, NOW)
expect(result.status).toBe("created")
const event = await prisma.event.findUnique({ where: { id: result.eventId } })
// sparkStartInstant(proposedDate, "20:00", zone): the original idea's 8pm
// survived the retry without promote.ts changing at all.
expect(event?.startsAt).toEqual(sparkStartInstant(GUESS_DATE, "20:00", "UTC"))
```

- [ ] **Step 6: Run to verify it fails or passes for the right reason**

Run: `npx vitest run src/lib/gauges/__tests__/promote.test.ts`
Expected: PASS with no production change (promotion reads `gauge.proposedTime` from the row; the carry happened at creation). Since this test can pass first-run, state why it could have failed: it fails if `createRetryGuessGauge` drops or re-derives `proposedTime`, or if promotion special-cases null `sourceMessageId`. Confirm both by temporarily breaking `proposedTime` in the test input (change to "09:00", watch the assertion fail, restore).

- [ ] **Step 7: Commit**

```bash
git add src/lib/gauges/create.ts src/lib/gauges/__tests__/
git commit -m "A gauge Orbit floats itself: no source message, no seeded vote, the old time carried

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: The sweep learns to ask

**Files:**
- Modify: `src/lib/orbit/endgame.ts`
- Test: `src/lib/orbit/__tests__/endgame.test.ts`

**Interfaces:**
- Consumes: `isRetryEligible`, `countIn`, `countNotThatDay` (Task 3), `buildRetryAskMessage` (Task 4), `Gauge.retryAskMessageId` / `retryGuessOfGaugeId` (Task 2).
- Produces: extended `EndgameResult` union (Task 7 extends it again; exact members below), and the re-ordered `handleOne` routing Task 7 slots into.

- [ ] **Step 1: Extend the result union**

Add to `EndgameResult`: action variant `{ gaugeId: string; action: "asked" }`, and skip reasons `"already_asked"` (lost ask race). (Task 7 adds its own members; keep the union in one place with a comment per reason, matching the existing style.)

- [ ] **Step 2: Write the failing tests**

In `endgame.test.ts`, reusing its fixture builders (`setupGroup`, `makeGauge`, `voteIn` — add a `voteNotThatDay(gaugeId, userId)` twin — `orbitMessageCount`, the 2099 instants, always `{ groupId: gid }`):

- **Eligible close gets the ask, not the goodbye:** gauge at `CLOSE_TIME` with 2 IN + 1 NOT_THAT_DAY (all current members) → result `{ action: "asked" }`; exactly one new Orbit message; its body is `"Beers didn't happen for Friday, but three of you want it. What day works better?"` (fixture proposed day 2099-06-12 is a Friday; activity "beers"); `retryAskMessageId` set; `closureMessageId` still null.
- **Zero-yes but day-blocked gets the ask, not silence:** 0 IN + 3 NOT_THAT_DAY → `{ action: "asked" }`.
- **Two in, nobody blocked by the day: ordinary goodbye:** 2 IN + 0 NOT_THAT_DAY → `{ action: "closed_with_note" }`, `retryAskMessageId` null (existing behavior preserved).
- **Below the bar with a can't-day: ordinary close:** 1 IN + 1 NOT_THAT_DAY → `closed_with_note`; 0 IN + 1 NOT_THAT_DAY → `closed_silently`.
- **Counts are member-filtered:** 1 IN + 2 NOT_THAT_DAY where one NOT_THAT_DAY voter's membership row is deleted → not eligible, ordinary close.
- **The ask never posts twice:** a second sweep at `CLOSE_TIME_2` returns `{ action: "skipped", reason: "already_asked" }` and the Orbit message count is unchanged. Note: this is the interim routing (see Step 4); Task 7 replaces this path with the guess phase and updates this exact test's expected reason to `awaiting_answer`. Both tasks say so in their steps, so the change is planned, not drift.
- **Concurrent asks: exactly one message.** Clone the existing concurrent bump test with `Promise.all` of two `CLOSE_TIME` sweeps: winner `{ action: "asked" }`, loser `{ action: "skipped", reason: "already_asked" }`, message count +1.

- [ ] **Step 3: Run to verify failure** — `npx vitest run src/lib/orbit/__tests__/endgame.test.ts`, expected: new tests FAIL (no `asked` action), existing 13 still pass.

- [ ] **Step 4: Implement**

Re-order `handleOne` (comment the routing so the order reads as the spec's decision 2):

```ts
if (gauge.event) return { gaugeId: gauge.id, action: "skipped", reason: "promoted" }
if (isGaugeLive(gauge, timeZone, now)) return handleBump(gauge, timeZone, now)
// Closed from here down. A retry guess gauge never earns its own ask or guess
// (spec decision 7): ordinary close outcomes only.
if (gauge.retryGuessOfGaugeId) return handleClose(gauge)
if (gauge.retryAskMessageId) return { gaugeId: gauge.id, action: "skipped", reason: "already_asked" } // Task 7 replaces this line with handleGuess(...)
if (gauge.closureMessageId) return { gaugeId: gauge.id, action: "skipped", reason: "already_closed_out" }
// Retry eligibility runs BEFORE the closure outcomes (spec decision 2), so a
// day-blocked gauge gets the ask instead of the goodbye, and instead of the
// zero-yes silence.
if (isRetryEligible(memberFilteredVotes(gauge))) return handleAsk(gauge, timeZone)
return handleClose(gauge)
```

`handleAsk(gauge, timeZone)`: compose `wantCount = countIn(votes) + countNotThatDay(votes)` over `memberFilteredVotes(gauge)`, `body = buildRetryAskMessage(gauge.activity, gauge.proposedDate, timeZone, wantCount)`, then the create-then-conditionally-attach transaction exactly per the bump instance (copy its explanatory comment's reasoning, referencing it rather than duplicating the full text): create the Orbit message, `updateMany({ where: { id: gauge.id, retryAskMessageId: null }, data: { retryAskMessageId: message.id } })`, `if (updated.count === 0) throw new AlreadyAskedInTx()`; module-private `class AlreadyAskedInTx extends Error {}` sentinel; catch → `{ action: "skipped", reason: "already_asked" }`. Return `{ gaugeId: gauge.id, action: "asked" }`.

Note the moved `closureMessageId` check: it now sits after the live check instead of before it. Behavior is identical for every gauge the old order served (a closure-marked gauge is never live, and closed gauges re-entering `handleClose` with zero yeses stay a silent no-op), and the new order is what lets an asked gauge keep flowing to the guess phase. Say this in a comment.

- [ ] **Step 5: Run to verify pass** — full file: `npx vitest run src/lib/orbit/__tests__/endgame.test.ts`, expected: all green, including the untouched original 13.

- [ ] **Step 6: Commit**

```bash
git add src/lib/orbit/endgame.ts src/lib/orbit/__tests__/endgame.test.ts
git commit -m "The sweep closes a day-blocked idea with a question instead of a goodbye

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: The sweep learns to guess, once

**Files:**
- Modify: `src/lib/orbit/endgame.ts`
- Test: `src/lib/orbit/__tests__/endgame.test.ts`

**Interfaces:**
- Consumes: `chooseRetryGuessDate`, `buildRetryGuessMessage` (Task 4), `createRetryGuessGauge` (Task 5), `BUMP_LOCAL_HOUR`, `getLocalParts`, the private `localDayNumber`.
- Produces: final `EndgameResult` union: adds action `{ gaugeId: string; action: "guessed" }` and skip reasons `"awaiting_answer"` (asked; not guess time yet), `"answered"` (a same-activity gauge opened after the ask), `"already_guessed"`.

- [ ] **Step 1: Write the failing tests**

New instants alongside the existing 2099 family (proposed Fri 2099-06-12, UTC group): `const NEXT_EVE_8PM = new Date("2099-06-13T20:00:00Z")`, `const NEXT_EVE_3PM = new Date("2099-06-13T15:00:00Z")`. Each test first stages an asked gauge (run one sweep at `CLOSE_TIME` against a 2-IN + 1-NOT_THAT_DAY gauge, assert `asked`), then:

- **The guess fires the next evening:** sweep at `NEXT_EVE_8PM` → `{ action: "guessed" }`; a new gauge row exists with `retryGuessOfGaugeId` = original id, `sourceMessageId` null, `proposedDate` = 2099-06-19 UTC midnight (same weekday one week after the failed day), `proposedTime` copied from the original, zero votes; its Orbit message body is `"No takers on a new day yet, so how about beers next Friday?"`.
- **Not before the evening:** sweep at `NEXT_EVE_3PM` → `{ action: "skipped", reason: "awaiting_answer" }`; same at `CLOSE_TIME_2` (still the failed day).
- **A member answer cancels the guess:** after the ask, create a same-activity gauge (via `makeGauge`, activity "beers", any future day, `createdAt` after the ask) → sweep at `NEXT_EVE_8PM` returns `{ action: "skipped", reason: "answered" }` for the original, and no guess gauge exists.
- **A different activity does not cancel it:** stage a "bowling" gauge after the ask instead → sweep at `NEXT_EVE_8PM` still returns `{ action: "guessed" }` (spec decision 6).
- **Never twice:** second sweep at `NEXT_EVE_8PM` (or later) → `{ action: "skipped", reason: "already_guessed" }`, exactly one guess gauge, Orbit message count unchanged.
- **Concurrent guesses: exactly one gauge.** `Promise.all` of two `NEXT_EVE_8PM` sweeps: one `guessed`, one skipped (`already_guessed` — either from the pre-check or the lost P2002 race; assert the reason, which is the same either way), exactly one row with `retryGuessOfGaugeId` = original id.
- **The guess gauge lives the ordinary life and never re-asks:** on the guess gauge, add 2 IN + 1 NOT_THAT_DAY (would-have-cleared shape), sweep past ITS close (2099-06-19 gauge with 19:00-or-copied time; pick an instant past `sparkStartInstant - 2h`) → `{ action: "closed_with_note" }` for the guess gauge, `retryAskMessageId` null on it, no new ask message. Also: a zero-vote guess gauge past close → `closed_silently`.
- **Non-UTC arithmetic:** one asked-gauge fixture in a second group with `timeZone: "America/Chicago"`, proposed local-midnight Fri via `zonedWallTimeToUtc(2099, 6, 12, 0, 0, "America/Chicago")`: sweep at Chicago-local next-evening 8pm (`zonedWallTimeToUtc(2099, 6, 13, 20, 0, "America/Chicago")`) → `guessed`, guess `proposedDate` = Chicago midnight 2099-06-19. (This slice's new date math does not join the all-UTC-fixtures debt; spec verification section.)
- **Update the Task 6 interim test:** the asked-gauge re-sweep at `CLOSE_TIME_2` now expects `awaiting_answer` (was `already_asked`); `already_asked` remains only for the lost ask race.

- [ ] **Step 2: Run to verify failure** — expected: new tests FAIL (`handleGuess` absent), the rest green.

- [ ] **Step 3: Implement**

Replace Task 6's interim line with `if (gauge.retryAskMessageId) return handleGuess(gauge, timeZone, now)`. Implement module-private `handleGuess`:

```ts
async function handleGuess(gauge: CandidateGauge, timeZone: string, now: Date): Promise<EndgameResult> {
  const existing = await prisma.gauge.findUnique({
    where: { retryGuessOfGaugeId: gauge.id },
    select: { id: true },
  })
  if (existing) return { gaugeId: gauge.id, action: "skipped", reason: "already_guessed" }

  // "Answered" is activity-exact and deliberately literal-minded: a pivot to a
  // different activity does not cancel the guess, because the people who voted
  // voted for THIS activity (spec decision 6; recorded as a watch-item).
  const answered = await prisma.gauge.findFirst({
    where: {
      groupId: gauge.groupId,
      id: { not: gauge.id },
      activity: { equals: gauge.activity, mode: "insensitive" },
      createdAt: { gt: askCreatedAt },
    },
    select: { id: true },
  })
  if (answered) return { gaugeId: gauge.id, action: "skipped", reason: "answered" }

  // The guess evening is anchored to the FAILED DAY, not the ask's send time:
  // the ask lands on the failed day whenever the sweep is healthy, and
  // anchoring here means a delayed ask can never push the guess past the
  // candidate window into silent death. Under a long outage the ask-to-guess
  // gap compresses; accepted, and the window ages the gauge out regardless.
  const nowParts = getLocalParts(now, timeZone)
  const dayDiff = localDayNumber(nowParts) - localDayNumber(getLocalParts(gauge.proposedDate, timeZone))
  if (dayDiff < 1 || (dayDiff === 1 && nowParts.hour < BUMP_LOCAL_HOUR)) {
    return { gaugeId: gauge.id, action: "skipped", reason: "awaiting_answer" }
  }

  const guessDate = chooseRetryGuessDate(gauge.proposedDate, timeZone)
  const res = await createRetryGuessGauge({
    groupId: gauge.groupId,
    originGaugeId: gauge.id,
    activity: gauge.activity,
    proposedDate: guessDate,
    proposedTime: gauge.proposedTime ?? EVENING_TIME,
    body: buildRetryGuessMessage(gauge.activity, guessDate, timeZone),
  })
  if (res.status === "skipped") return { gaugeId: gauge.id, action: "skipped", reason: "already_guessed" }
  return { gaugeId: gauge.id, action: "guessed" }
}
```

`askCreatedAt`: add `retryAskMessage: { select: { createdAt: true } }` to `gaugeInclude` and read `gauge.retryAskMessage!.createdAt` (non-null on this path by routing; assert with an early guard returning `awaiting_answer` if somehow null, so a broken pointer degrades to waiting rather than throwing).

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/lib/orbit/__tests__/endgame.test.ts`, expected all green.

- [ ] **Step 5: Run the full suite** — `npm test`, expected green (this is the task most likely to brush other files).

- [ ] **Step 6: Commit**

```bash
git add src/lib/orbit/endgame.ts src/lib/orbit/__tests__/endgame.test.ts
git commit -m "One guess the evening after, anchored to the day that failed, and never a second

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Bench cases for the answer seam

**Files:**
- Modify: `evals/detect/cases.ts`, `evals/detect/run.ts`

**Interfaces:**
- Consumes: the existing `EvalCase` / `Expected` / `Outcome` shapes and `grade()` in `run.ts`.
- Produces: `Expected` spark variant gains an optional day assertion: `{ kind: "spark"; statedDayOfWeek?: number | null }`; `Outcome` spark variant becomes `{ kind: "spark"; statedDayOfWeek: number | null }` (from the normalized spark the runner already holds).

- [ ] **Step 1: Extend the grading**

In `run.ts`: carry `statedDayOfWeek` into the spark `Outcome`; in `grade()`, after the kind check, add: if `e.kind === "spark" && o.kind === "spark" && e.statedDayOfWeek !== undefined && e.statedDayOfWeek !== o.statedDayOfWeek` return `` `expected spark on day ${e.statedDayOfWeek}, got ${o.statedDayOfWeek}` ``. Existing spark cases (no `statedDayOfWeek` on expected) grade exactly as before.

- [ ] **Step 2: Add four cases to `cases.ts`**

All four share this history shape (times in minutes, per the case format; Saturday must be day 6). Use a now-anchor-relative history where Orbit's ask is recent:

```ts
  {
    id: "retry-answer-bare-day",
    bucket: "must-recognize",
    description:
      "The wrong-day retry's whole bet: after Orbit's close-and-ask, a bare day name is an answer, and the conversational window is what resolves it to the activity. If this reads as none, the ask is a question Orbit ignores the answer to.",
    calendar: [],
    history: [
      { author: "Priya", body: "beers friday anyone?", minutesAgo: 60 * 26 },
      { author: "Orbit", body: "Love it. Anyone in for beers this Friday? If three of you are in, I'll set it up.", minutesAgo: 60 * 26 - 1 },
      { author: "Orbit", body: "Beers didn't happen for Friday, but three of you want it. What day works better?", minutesAgo: 60 * 3 },
    ],
    trigger: { author: "Jesse", body: "Saturday?" },
    memberCount: 4,
    expected: { kind: "spark", statedDayOfWeek: 6 },
  },
  {
    id: "retry-answer-day-works",
    bucket: "must-recognize",
    description: "Same seam, fuller sentence. 'saturday works for me' after the ask is a day answer, not chatter.",
    // same calendar/history; trigger: { author: "Maya", body: "saturday works for me" }
    expected: { kind: "spark", statedDayOfWeek: 6 },
  },
  {
    id: "retry-answer-next-week",
    bucket: "ambiguous",
    description:
      "'next week?' after the ask names no single day. The exactly-one-day rule says a spark with no stated day (fallback picks), not a silent guess at which day they meant. No bar; watched for drift.",
    // same calendar/history; trigger: { author: "Sam", body: "next week?" }
    expected: { kind: "spark", statedDayOfWeek: null },
  },
  {
    id: "retry-answer-nostalgia",
    bucket: "must-stay-quiet",
    description: "A look-alike: 'saturday was fun' right after the ask is about the past, not an answer. Recognition must not hear a day name and call it a proposal.",
    // same calendar/history; trigger: { author: "Jesse", body: "saturday was fun" }
    expected: { kind: "none" },
  },
```

(Write each case out in full; the "same calendar/history" comments above are for this plan's brevity, not for the file.)

- [ ] **Step 3: Run the bench and record**

Run: `npm run db:which` is NOT needed (the bench never touches the DB), but the API key is: `npm run eval:detect` (this spends real model money; default runs). Record the scoreboard before-and-after adding the cases; the four new cases' numbers are the "after" for this seam. If `retry-answer-bare-day` or `retry-answer-day-works` miss badly, STOP and report to the controller rather than tuning the prompt: prompt changes are recognition-path changes with their own blast radius, and the spec (decision 12) only funds bench *coverage* this slice, not prompt work. The numbers go into build-notes §11 either way (Task 9); a weak result is a finding, not a failure of this task.

- [ ] **Step 4: Commit**

```bash
git add evals/detect/
git commit -m "The bench learns to hear a day named as an answer, and a day named as a memory

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: QA staging, the register, and the records

**Files:**
- Create: `scripts/qa-stage-retry.ts`
- Modify: `docs/build-notes.md` (endgame register table ~L229–237; §11 new entry at the end; pre-deploy checklist already updated in Task 2)
- Modify: `CLAUDE.md` ("Where the build is": rewrite at the slice boundary; the carried-forward settled list gains this slice's decisions)

**Interfaces:** consumes everything; produces the walkthrough evidence and the records the PR must carry.

- [ ] **Step 1: Write the staging script**

`scripts/qa-stage-retry.ts`, modeled directly on `scripts/qa-stage-endgame.ts` (same header warnings verbatim-in-spirit: writes to whatever `.env` points at, `npm run db:which` first, deliberately outside the test suite, not named `*.test.ts`, fresh group per run, usage line `npx tsx --env-file=.env scripts/qa-stage-retry.ts`). It stages one group ("Riverside Runners", `TZ = "America/Chicago"`, four members, one joined via real invite flow is NOT required here; seeded members are fine for staging) holding:

1. **beers**: gauge on yesterday's local day (so it is closed), 2 IN + 1 NOT_THAT_DAY, then run the real scoped sweep at a controlled "close-time" clock → produces the ask message. Then run it again at tonight-8:30pm-local (the staged "next evening" relative to the failed day) → produces the guess gauge with chips, proposing the same weekday next week.
2. **breakfast**: closed with 2 IN + 1 NOT_THAT_DAY, ask staged, then a member message "sunday works" posted after the ask plus a real same-activity gauge (via `createGauge`) → sweep shows `answered`, no guess.
3. **yoga**: closed with 1 IN + 1 NOT_THAT_DAY (below the bar) → ordinary `closed_with_note`, proving the boundary in the same feed.

Print the JSON summary (group id, home URL, per-gauge sweep results) exactly as `qa-stage-endgame.ts` does. Note in the header: the darts-style live cases are already covered by the endgame script; this one stages only the retry states.

- [ ] **Step 2: Run it against dev-test and walk through in the browser**

`npm run db:which` first. Then run the script, open the group home in the browser, and verify with eyes: the ask reads correctly with no chips on it; the guess gauge shows chips and the "next Friday" copy; tapping the guess gauge's chips moves the live tally; the `answered` gauge shows the member's day answer followed by its new gauge; the below-bar gauge shows the plain goodbye. A third tap on the guess gauge (staged members) creates the event with the copied time visible on the card. Record which moments were staged versus lived for the PR body, per the house rule.

- [ ] **Step 3: Add the register rows**

Append to the endgame-path table in build-notes (`### The endgame path`), matching its column format, backticking the filename (the table's newer rows do):

```markdown
| `endgame.ts`, retry ask at close | A day-blocked idea that would have cleared the bar closes with a question instead of a goodbye. Speaks. Chattier-posture act two. | Correct |
| `endgame.ts`, retry guess next evening | One same-weekday-next-week guess when nobody answered the ask, posted as a real gauge. Speaks. | Correct |
| `endgame.ts`, guess gauge routing | Orbit's own guess never earns a second ask or guess, however it dies; only humans reset the cycle. Stays quiet. | Correct |
| `endgame.ts`, activity-exact answered check | A pivot to a different activity does not cancel the guess; the votes were for this activity. Speaks. Watch-item. | Correct |
```

- [ ] **Step 4: Write the build-notes §11 entry**

New `###` entry at the end of §11, in the log's established voice: what the slice is, the eligibility bar and why, the ask-then-guess shape and whose call each was, the amendment that landed on one-bump (and the dead-gauge rule surviving), the loop cap, time carry via the copied `proposedTime`, zero new model calls, the verification section (suite baseline 576/40 → the finishing number from the final `npm test`; bench scoreboard numbers from Task 8; staged-versus-lived walkthrough list), and the debt items from the spec's debt section, updated with anything execution actually found. Every number in it must be a number that was actually measured in this session; copy them from the task outputs, never from memory.

- [ ] **Step 5: Update CLAUDE.md's standing state**

- Rewrite "Where the build is": the retry paragraph replaces the "Next slice: the wrong-day retry" section; the open-questions bullets are resolved (note the premise correction: the third chip already held half the signal); promote the queued rivals (pending-events surface, ask-Orbit-what's-open) to the new "next slice" candidates.
- Append to the carried-forward settled list: the would-have-cleared bar; ask-then-guess with same-weekday-next-week; the whose-move loop cap; activity-exact answered; guess gauge seeds nobody; time carries via the stored `proposedTime` (all dated 4 Aug 2026, wrong-day-retry slice).

- [ ] **Step 6: Final verification pass**

Run: `npm test` (record the finishing count for §11 and the PR), `npx tsc --noEmit` (expect nothing in repo source), `npm run lint` (expect only the pre-existing `OnboardingWizard.tsx` error plus warnings). Then `grep -n '—\|–'` over every file this slice touched that carries Orbit copy or owner-facing prose (spark-copy.ts new strings, CLAUDE.md edits, build-notes additions, the spec and this plan are already clean): expect no em/en dashes outside genuine ranges.

- [ ] **Step 7: Commit**

```bash
git add scripts/qa-stage-retry.ts docs/build-notes.md CLAUDE.md
git commit -m "The retry's records, register rows, and a staged group to walk through

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## After the tasks: PR, not merge

Follow `~/.claude/checklists/pr-handoff.md`: open the PR with the review report (independent read-only whole-branch review before the PR is ready; treat implementer reports as unverified claims), the before/after suite numbers, staged-versus-lived, the five-minute QA script in the PR body AND the chat message, links ready to click, dev-test seeded by the staging script. Do not merge; the merge signal is the owner's. Also offer to land the parked `fix/suite-wide-test-timeout` micro-PR (stashed changes; see stash list) as a concurrent micro-PR: it touches `vitest.config.ts` and `src/lib/proposals/__tests__/promote.test.ts`, neither of which this slice touches, and the PR body must say so.
