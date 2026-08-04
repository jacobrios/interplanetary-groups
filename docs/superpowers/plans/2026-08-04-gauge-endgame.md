# Gauge Endgame Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A gauge gets one bump the evening before its proposed day, closes two hours before its proposed start, and posts a soft closure note when it dies with at least one yes.

**Architecture:** Two nullable message pointers on `Gauge` (`bumpMessageId`, `closureMessageId`) carry both the feed wiring and the never-post-twice guarantees. All liveness/timing logic is pure functions in `spark-copy.ts` (which must never import the Anthropic SDK); a new `src/lib/orbit/endgame.ts` sweep runs from the existing cron route, which moves from daily to hourly. Zero model calls anywhere in this slice.

**Tech Stack:** Next.js 16, Prisma 7 (driver adapter, no auto-generate), Vitest 4 against the shared remote dev-test Supabase, Vercel cron.

**Spec:** `docs/superpowers/specs/2026-08-04-gauge-endgame-design.md` — read it first; its fifteen settled decisions are do-not-relitigate.

## Global Constraints

- **Test-first always.** Every behavior change lands as a failing test before its implementation. The suite baseline is **553 tests / 39 files, all green**, recorded on this branch before any code.
- **DB-backed tests must scope every sweep.** Any call to `runGaugeEndgame` in a test MUST pass `{ groupId }`. An unscoped sweep writes real messages into every group in the shared dev-test database (see the warning header in `src/lib/orbit/__tests__/reconcile.test.ts`). Fixtures use `[TEST]`-prefixed names and `Date.now()`-uniquified auth ids; cleanup deletes in FK order with `.catch(() => {})`.
- **DB-backed test files with many round-trips start with `vi.setConfig({ testTimeout: 30_000 })` at module scope** (never inside beforeAll; vitest bakes timeouts at collection). Copy the rationale comment style from `src/lib/proposals/__tests__/promote.test.ts:20-37`.
- **Clock control is an explicit `now: Date` parameter.** No fake timers, no `Date.now()` inside logic. Test dates use far-future years (2099 convention) where "upcoming" matters.
- **Orbit copy rules:** plain and warm, roughly 7th-8th grade, NO em dashes or en dashes in anything Orbit says, soft declines, three-letter weekday abbreviations. All copy is deterministic (structured-extract-then-format); no model writes any sentence in this slice.
- **`spark-copy.ts` must never import the Anthropic SDK** (client components import from it; see its header comment). New copy builders and time helpers go there.
- **`revalidatePath` stays outside try/catch** in server actions (repo-wide convention, stated in three files).
- **Timezone:** every render/computation goes through the group's `timeZone`; `formatTime`/`formatWeekdayShort` etc. all require it. Use `getLocalParts` + `zonedWallTimeToUtc` from `src/lib/orbit/occurrence.ts` for wall-clock math (they handle DST).
- **Prisma 7:** after editing `prisma/schema.prisma`, run `npx prisma migrate dev --name <name>` then `npx prisma generate` (not auto-run). NEVER edit migration files directly (a hook blocks it). Run `npm run db:which` before any migration; it must print the dev-test ref `pxbewardwvoyqqcvogel`.
- **Commit after every green task** with a narrative message in this repo's style (a sentence, not a `feat:` prefix; look at `git log --oneline -10`).

---

### Task 1: Schema — two message pointers on Gauge

**Files:**
- Modify: `prisma/schema.prisma` (Gauge model ~line 217, Message model ~line 172)
- Created by tooling: `prisma/migrations/<timestamp>_gauge_endgame_markers/`

**Interfaces:**
- Produces: `Gauge.bumpMessageId: string | null`, `Gauge.closureMessageId: string | null`, both `@unique`, with relations `bumpMessage`/`closureMessage` to `Message`, and Message back-relations `gaugeAsBump`/`gaugeAsClosure`. Later tasks rely on these exact names.

- [ ] **Step 1: Confirm the database target**

Run: `npm run db:which`
Expected: all three sources print `pxbewardwvoyqqcvogel`, exit 0. If not, STOP and report.

- [ ] **Step 2: Edit the schema**

In the `Gauge` model, after `proposedTime`, add (comment included — it is the record of the rule):

```prisma
  /// Orbit's one bump message, posted the evening before the proposed day.
  /// Null until bumped; the unique pointer is also the never-bump-twice guard.
  bumpMessageId String? @unique
  /// Orbit's closure note, posted at close when at least one yes existed.
  /// Null when the gauge closed silently (zero yeses) or is still open.
  closureMessageId String? @unique
```

And in the relations block of `Gauge`:

```prisma
  bumpMessage    Message? @relation("GaugeBump", fields: [bumpMessageId], references: [id], onDelete: SetNull)
  closureMessage Message? @relation("GaugeClosure", fields: [closureMessageId], references: [id], onDelete: SetNull)
```

In the `Message` model, next to `gaugeAsOrbit`:

```prisma
  gaugeAsBump    Gauge? @relation("GaugeBump")
  gaugeAsClosure Gauge? @relation("GaugeClosure")
```

Also update the stale doc comment above `Gauge` (~line 208) that says a gauge is live until the end of its local day: replace that sentence with "A gauge closes two hours before its proposed start (at the start itself for a gauge born inside that window); see `gaugeClosesAt` in spark-copy.ts."

- [ ] **Step 3: Migrate and generate**

Run: `npx prisma migrate dev --name gauge_endgame_markers && npx prisma generate`
Expected: one new migration folder, no data loss warnings (both columns nullable).

- [ ] **Step 4: Full suite still green**

Run: `npm test 2>&1 | tail -3`
Expected: `553 passed` — the schema addition changes no behavior.

- [ ] **Step 5: Commit**

```bash
git add prisma/ && git commit -m "A gauge can now remember its bump and its goodbye"
```

---

### Task 2: Pure timing — `gaugeClosesAt` and the new `isGaugeLive`

**Files:**
- Modify: `src/lib/orbit/spark-copy.ts` (constants near `EVENING_TIME`; `isGaugeLive` at ~line 204)
- Modify: `src/lib/gauges/read.ts:54`, `src/app/actions/gauge-vote.ts:68` (call sites)
- Test: `src/lib/orbit/__tests__/spark.test.ts` (existing `isGaugeLive` tests at ~298-318, plus new cases)

**Interfaces:**
- Consumes: `getLocalParts`, `zonedWallTimeToUtc` from `src/lib/orbit/occurrence.ts`; existing `sparkStartInstant(proposedDate, proposedTime, timeZone): Date`.
- Produces (exact, later tasks depend on these):

```ts
export const CLOSE_BEFORE_START_HOURS = 2
export const BUMP_LOCAL_HOUR = 20 // ~8pm group-local, the evening before

export function gaugeClosesAt(
  proposedDate: Date,          // group-local midnight, as stored
  proposedTime: string | null, // "HH:mm" group-local, null falls back inside sparkStartInstant
  createdAt: Date,
  timeZone: string
): Date

export function isGaugeLive(
  gauge: { proposedDate: Date; proposedTime: string | null; createdAt: Date },
  timeZone: string,
  now: Date
): boolean
```

Note the **signature change**: `isGaugeLive` previously took `(proposedDate, timeZone, now)`. All call sites and tests must move to the object form in this task.

- [ ] **Step 1: Write the failing tests** (add to the existing `isGaugeLive` describe block; convert the existing three call sites in the test file to the new signature at the same time)

```ts
import { gaugeClosesAt, isGaugeLive, CLOSE_BEFORE_START_HOURS } from "../spark-copy"

// Friday 2099-06-12 group-local midnight UTC-stored for an America/Chicago group
const TZ = "America/Chicago"
const FRIDAY_MIDNIGHT = zonedWallTimeToUtc(2099, 6, 12, 0, 0, TZ)
const TUESDAY = zonedWallTimeToUtc(2099, 6, 9, 15, 0, TZ) // an ordinary creation moment

describe("gaugeClosesAt", () => {
  it("closes two hours before the proposed start", () => {
    const closes = gaugeClosesAt(FRIDAY_MIDNIGHT, "19:00", TUESDAY, TZ)
    expect(closes).toEqual(zonedWallTimeToUtc(2099, 6, 12, 17, 0, TZ))
  })

  it("a gauge born inside the window closes at the start itself", () => {
    const bornAt6pm = zonedWallTimeToUtc(2099, 6, 12, 18, 0, TZ) // 1h before a 7pm start
    const closes = gaugeClosesAt(FRIDAY_MIDNIGHT, "19:00", bornAt6pm, TZ)
    expect(closes).toEqual(zonedWallTimeToUtc(2099, 6, 12, 19, 0, TZ))
  })

  it("null proposedTime falls back to the evening default", () => {
    const closes = gaugeClosesAt(FRIDAY_MIDNIGHT, null, TUESDAY, TZ)
    expect(closes).toEqual(zonedWallTimeToUtc(2099, 6, 12, 17, 0, TZ)) // 19:00 - 2h
  })
})

describe("isGaugeLive (two-hour close)", () => {
  const g = { proposedDate: FRIDAY_MIDNIGHT, proposedTime: "19:00", createdAt: TUESDAY }
  it("live the evening before", () => {
    expect(isGaugeLive(g, TZ, zonedWallTimeToUtc(2099, 6, 11, 20, 0, TZ))).toBe(true)
  })
  it("live at one minute before close", () => {
    expect(isGaugeLive(g, TZ, zonedWallTimeToUtc(2099, 6, 12, 16, 59, TZ))).toBe(true)
  })
  it("closed at exactly two hours before start", () => {
    expect(isGaugeLive(g, TZ, zonedWallTimeToUtc(2099, 6, 12, 17, 0, TZ))).toBe(false)
  })
  it("a late-born gauge is live between its creation and its start", () => {
    const late = { ...g, createdAt: zonedWallTimeToUtc(2099, 6, 12, 18, 0, TZ) }
    expect(isGaugeLive(late, TZ, zonedWallTimeToUtc(2099, 6, 12, 18, 30, TZ))).toBe(true)
    expect(isGaugeLive(late, TZ, zonedWallTimeToUtc(2099, 6, 12, 19, 0, TZ))).toBe(false)
  })
})
```

- [ ] **Step 2: Run, verify the new tests fail and the old signature tests break loudly**

Run: `npx vitest run src/lib/orbit/__tests__/spark.test.ts 2>&1 | tail -15`
Expected: FAIL — `gaugeClosesAt` not exported; type errors on the new object signature.

- [ ] **Step 3: Implement in spark-copy.ts**

```ts
export const CLOSE_BEFORE_START_HOURS = 2
export const BUMP_LOCAL_HOUR = 20

/**
 * When the gauge stops taking answers. Two hours before the proposed start,
 * so a half-committed plan never limps ambiguously into its final hour; a
 * gauge born inside that window (a same-evening rally) runs to the start
 * itself instead. Both numbers are placeholders with no data behind them,
 * kept beside EVENING_TIME so override learning replaces the family at once.
 */
export function gaugeClosesAt(
  proposedDate: Date,
  proposedTime: string | null,
  createdAt: Date,
  timeZone: string
): Date {
  const start = sparkStartInstant(proposedDate, proposedTime, timeZone)
  const normalClose = new Date(start.getTime() - CLOSE_BEFORE_START_HOURS * 60 * 60 * 1000)
  return createdAt.getTime() >= normalClose.getTime() ? start : normalClose
}

export function isGaugeLive(
  gauge: { proposedDate: Date; proposedTime: string | null; createdAt: Date },
  timeZone: string,
  now: Date
): boolean {
  return now.getTime() < gaugeClosesAt(gauge.proposedDate, gauge.proposedTime, gauge.createdAt, timeZone).getTime()
}
```

Delete the old end-of-day body and its doc comment; the new doc comment above replaces it. Update the two production call sites: `read.ts` filter becomes `.filter((g) => isGaugeLive(g, group.timeZone, now))` (the row already carries all three fields); `gauge-vote.ts` passes the gauge row it already fetched.

- [ ] **Step 4: Run the file, then the full suite**

Run: `npx vitest run src/lib/orbit/__tests__/spark.test.ts 2>&1 | tail -3` then `npm test 2>&1 | tail -3`
Expected: all green. If any *other* file fails, it is a call site you missed; fix it, do not skip it.

- [ ] **Step 5: Update the stale comment in `src/lib/gauges/promote.ts:58-63`** — the `start_passed` guard stays (cron paths and clock skew still need it) but its comment must stop saying gauges live to end of day. Replace with: `// A live gauge always closes before its start now, but the guard stays: the endgame sweep and clock skew can still present a past start.`

- [ ] **Step 6: Commit**

```bash
git add src/ && git commit -m "A gauge now closes while the plan can still be acted on"
```

---

### Task 3: Copy — bump, closure, urgency

**Files:**
- Modify: `src/lib/orbit/spark-copy.ts`
- Test: `src/lib/orbit/__tests__/spark.test.ts`

**Interfaces:**
- Consumes: `formatTimeLocalLabel(timeLocal: string): string` (exists), `SPARK_THRESHOLD`, `countIn` from `src/lib/gauges/threshold.ts`.
- Produces (exact):

```ts
export function buildBumpMessage(
  activity: string,
  inNames: string[],        // display names of members currently IN, feed order
): string
export function buildClosureMessage(activity: string): string
export function buildUrgencyClause(proposedTime: string | null): string
```

- [ ] **Step 1: Write the failing tests**

```ts
describe("buildBumpMessage", () => {
  it("last call with names and the countdown when people are in", () => {
    expect(buildBumpMessage("beers", ["Maya", "Jesse"])).toBe(
      "Last call on beers tomorrow: Maya & Jesse are in, one more makes it happen."
    )
  })
  it("singular in-count and plural remaining", () => {
    expect(buildBumpMessage("beers", ["Maya"])).toBe(
      "Last call on beers tomorrow: Maya is in, two more make it happen."
    )
  })
  it("gentle surfacing when nobody has answered", () => {
    expect(buildBumpMessage("beers", [])).toBe(
      "In case this got buried: anyone in for beers tomorrow?"
    )
  })
})

describe("buildClosureMessage", () => {
  it("soft, final, no dialogue invited", () => {
    expect(buildClosureMessage("beers")).toBe(
      "Beers didn't come together this time. Maybe next week."
    )
  })
})

describe("buildUrgencyClause", () => {
  it("names the time plainly", () => {
    expect(buildUrgencyClause("19:00")).toBe(
      " Heads up, this one's for today at 7pm, so get your yes in quick."
    )
  })
  it("falls back to the evening default when no time was resolved", () => {
    expect(buildUrgencyClause(null)).toBe(
      " Heads up, this one's for today at 7pm, so get your yes in quick."
    )
  })
})
```

- [ ] **Step 2: Run to verify FAIL** — `npx vitest run src/lib/orbit/__tests__/spark.test.ts 2>&1 | tail -8`

- [ ] **Step 3: Implement** (in spark-copy.ts, beside `buildGaugeMessage`; "tomorrow" is always literally true because the bump only ever fires the evening before)

```ts
export function buildBumpMessage(activity: string, inNames: string[]): string {
  if (inNames.length === 0) {
    return `In case this got buried: anyone in for ${activity} tomorrow?`
  }
  const who = inNames.length === 1 ? inNames[0] : `${inNames.slice(0, -1).join(", ")} & ${inNames[inNames.length - 1]}`
  const verb = inNames.length === 1 ? "is" : "are"
  const remaining = SPARK_THRESHOLD - inNames.length
  const countdown = remaining === 1 ? "one more makes it happen" : `${NUMBER_WORDS[remaining]} more make it happen`
  return `Last call on ${activity} tomorrow: ${who} ${verb} in, ${countdown}.`
}

const NUMBER_WORDS: Record<number, string> = { 2: "two", 3: "three" }

export function buildClosureMessage(activity: string): string {
  const cap = activity.charAt(0).toUpperCase() + activity.slice(1)
  return `${cap} didn't come together this time. Maybe next week.`
}

export function buildUrgencyClause(proposedTime: string | null): string {
  const label = formatTimeLocalLabel(proposedTime ?? EVENING_TIME)
  return ` Heads up, this one's for today at ${label}, so get your yes in quick.`
}
```

(If `formatTimeLocalLabel("19:00")` renders something other than `7pm`, match the test to its actual established format rather than changing the formatter — it is shipped copy.)

- [ ] **Step 4: Run file + suite green** — same commands as Task 2 Step 4.

- [ ] **Step 5: Commit** — `git add src/ && git commit -m "Orbit learns three new sentences, all composed, none generated"`

---

### Task 4: The urgency line reaches the feed

**Files:**
- Modify: `src/app/actions/detect-intent.ts` (~lines 145-155, around the `sparkStartInstant` guard)

**Interfaces:**
- Consumes: `gaugeClosesAt`, `buildUrgencyClause`, `buildGaugeMessage` (existing), `createGauge` (existing).

- [ ] **Step 1: Implement directly** (no unit test: server actions have no test harness in this repo by standing decision, spark part two debt list; the pure pieces are tested in Tasks 2-3 and the walkthrough covers the wiring)

Immediately after the existing stay-quiet guard (`if (sparkStartInstant(...) <= now) return { status: "quiet" }`), the action currently builds `body` via `buildGaugeMessage(...)`. Change the body composition to append urgency when the gauge is born inside its own close window:

```ts
      const start = sparkStartInstant(proposedDate, timeLocal, group.timeZone)
      if (start <= now) {
        return { status: "quiet" }
      }
      const bornLate =
        now.getTime() >= start.getTime() - CLOSE_BEFORE_START_HOURS * 60 * 60 * 1000
      const body =
        buildGaugeMessage(spark.activity, proposedDate, group.timeZone, now, disclosure) +
        (bornLate ? buildUrgencyClause(timeLocal) : "")
```

(Adapt variable names to what the file actually uses at those lines; the guard shown is verbatim from the file today. Do not touch the guard itself: past-start ideas stay silent, unchanged.)

- [ ] **Step 2: `tsc` and suite green** — `npx tsc --noEmit && npm test 2>&1 | tail -3`

- [ ] **Step 3: Commit** — `git add src/ && git commit -m "A same-evening rally hears the clock in Orbit's voice"`

---

### Task 5: The endgame sweep

**Files:**
- Create: `src/lib/orbit/endgame.ts`
- Test: `src/lib/orbit/__tests__/endgame.test.ts` (DB-backed)

**Interfaces:**
- Consumes: `gaugeClosesAt`, `isGaugeLive`, `buildBumpMessage`, `buildClosureMessage`, `BUMP_LOCAL_HOUR` (Task 2-3); `countIn` from threshold.ts; `getLocalParts`, `zonedWallTimeToUtc` from occurrence.ts; prisma.
- Produces (the cron route consumes this exact shape):

```ts
export type EndgameResult =
  | { gaugeId: string; action: "bumped" }
  | { gaugeId: string; action: "closed_with_note" }
  | { gaugeId: string; action: "skipped"; reason:
      "still_open" | "already_bumped" | "born_today" | "still_newest" |
      "not_the_eve" | "already_closed_out" | "closed_silently" | "promoted" }

export async function runGaugeEndgame(
  now: Date,
  opts?: { groupId?: string }
): Promise<EndgameResult[]>
```

**Semantics (from the spec, restated so this task stands alone):**
- Candidate gauges: no linked event, `closureMessageId: null`, `proposedDate` within `[now - 2 days, now + 2 days]` (coarse window, same trick as `findLiveGauges`).
- **Bump** a gauge when ALL hold: still live (`isGaugeLive`); not yet bumped (`bumpMessageId: null`); group-local now is the day BEFORE the proposed day AND local hour >= `BUMP_LOCAL_HOUR`; the gauge was NOT created on that same local day (`born_today` guard); the gauge's orbit message is NOT the newest message in the group (`still_newest` guard). The bump is one interactive transaction: re-read the gauge inside the tx, re-check `bumpMessageId === null`, create the ORBIT message (`authorType: MessageAuthor.ORBIT, authorId: null`, body from `buildBumpMessage` fed the IN-voters' member-filtered display names in vote order), set `bumpMessageId`.
- **Close** a gauge when it is no longer live: if it has at least one member IN vote, one transaction posts the closure note and sets `closureMessageId` (`closed_with_note`); with zero IN votes, write nothing, report `closed_silently` (the coarse window ages it out of future sweeps; no marker needed, silence is the settled behavior).
- Process groups sequentially like `reconcileScheduledEvents` does. Never throw per-gauge; catch, `console.error`, continue.

- [ ] **Step 1: Write the failing DB tests.** File skeleton (module scope: `vi.setConfig({ testTimeout: 30_000 })` with the promote.test.ts rationale comment; `[TEST]` fixtures copied from `src/lib/gauges/__tests__/promote.test.ts`'s `ensureGroup`/`gaugeWith` pattern, group `timeZone: "UTC"` so wall math is transparent; ALL sweep calls scoped `{ groupId }`). Cover, minimum:

```ts
// Eve of the proposed day, 8pm UTC. Gauge created two days earlier, one member IN.
const FRIDAY = new Date("2099-06-12T00:00:00Z")
const EVE_8PM = new Date("2099-06-11T20:00:00Z")

it("bumps a below-bar gauge on the eve, with chips-ready message and marker set", ...)
   // action "bumped"; gauge.bumpMessageId now points at a new ORBIT message whose
   // body === buildBumpMessage("beers", ["[TEST] Promote 0"]); a member message
   // posted after the gauge makes it non-newest — create one in the fixture.
it("never bumps twice", ...)          // second sweep at EVE_9PM → "already_bumped"
it("does not bump a gauge created that same local day", ...)   // "born_today"
it("does not bump when the gauge is still the newest message", ...) // "still_newest"
it("does not bump outside the eve evening", ...)  // EVE at 15:00 → "not_the_eve"; the day-of at 8pm → "not_the_eve"
it("closes with a note when someone was in", ...)
   // now = Friday 17:00Z + 1min on a 19:00 gauge → "closed_with_note";
   // closure message body === buildClosureMessage("beers"); marker set;
   // second sweep → "already_closed_out"; note posted exactly once.
it("closes silently at zero yeses", ...)  // "closed_silently", zero new ORBIT messages in group
it("zero-vote close after an unanswered bump", ...) // bump then close: both messages exist, closure only because... NO — zero IN votes → silent even when bumped; assert exactly one new ORBIT message (the bump)
it("a promoted gauge is left alone", ...)  // gauge with linked event → "promoted"
it("scoping: only touches the given group", ...) // second [TEST] group in fixture, sweep scoped to first, second untouched
```

Write each as a real test with real assertions against the rows (count ORBIT messages in the group before/after; read `bumpMessageId`/`closureMessageId` back). The commented sketches above are the required coverage list, not the test code; the code follows the fixture pattern verbatim from `src/lib/gauges/__tests__/promote.test.ts`.

- [ ] **Step 2: Run to verify FAIL** — `npx vitest run src/lib/orbit/__tests__/endgame.test.ts 2>&1 | tail -5` — module not found.

- [ ] **Step 3: Implement `endgame.ts`.** Shape (follow reconcile.ts's sequential-groups structure and its file-header warning style; the header MUST carry the same unscoped-sweep warning reconcile's does):

```ts
export async function runGaugeEndgame(now, opts) {
  const gauges = await prisma.gauge.findMany({
    where: {
      ...(opts?.groupId ? { groupId: opts.groupId } : {}),
      event: null,
      closureMessageId: null,
      proposedDate: { gte: twoDaysBefore(now), lte: twoDaysAfter(now) },
    },
    include: { votes: true, group: { include: { memberships: { include: { user: true } } } } },
    orderBy: { createdAt: "asc" },
  })
  const results: EndgameResult[] = []
  for (const gauge of gauges) {
    try {
      results.push(await handleOne(gauge, now))
    } catch (err) {
      console.error("[orbit-endgame] gauge failed:", gauge.id, err)
    }
  }
  return results
}
```

`handleOne` branches: live → bump eligibility (compute the eve via `getLocalParts(now, tz)` against `getLocalParts(gauge.proposedDate, tz)`: same local date +1 test; `born_today` via `getLocalParts(gauge.createdAt, tz)`; `still_newest` via `prisma.message.findFirst({ where: { groupId }, orderBy: { createdAt: "desc" }, select: { id: true } })`); not live → closure branch. Bump and closure writes are `prisma.$transaction(async (tx) => { ... })` with an in-tx re-read of the marker, following `promoteGaugeToEvent`'s re-read-inside pattern. IN names: filter votes to `answer === "IN"` and to current member userIds, map through the memberships' user names, in vote `createdAt` order.

- [ ] **Step 4: Run the file, then the full suite** — all green.

- [ ] **Step 5: Commit** — `git add src/ && git commit -m "Orbit works the end of an idea's life: one bump, one goodbye"`

---

### Task 6: The cron goes hourly and runs the sweep

**Files:**
- Modify: `src/app/api/cron/orbit/route.ts`
- Modify: `vercel.json`
- Modify: `docs/build-notes.md` (§11 pre-deploy checklist)

**Interfaces:**
- Consumes: `runGaugeEndgame` (Task 5), `reconcileScheduledEvents` (existing).

- [ ] **Step 1: Widen the route.** Inside the existing try block:

```ts
    const results = await reconcileScheduledEvents(new Date())
    const endgame = await runGaugeEndgame(new Date())
    return Response.json({ ok: true, results, endgame })
```

(Unscoped here is correct: production sweeps every group. The scoping option exists for tests.)

- [ ] **Step 2: `vercel.json`** — schedule becomes `"0 * * * *"` (hourly).

- [ ] **Step 3: Pre-deploy checklist** (build-notes §11 "Before first Vercel deploy" section) — append:

```
- Cron cadence changed daily → hourly for the gauge endgame (vercel.json). Verify the
  Vercel plan tier supports hourly cron (Hobby caps at daily). If capped: either
  upgrade, or keep vercel.json daily and point an external scheduler (with the
  CRON_SECRET bearer header) at /api/cron/orbit hourly. The bump/close land within
  the hour of their target moments; that precision is the accepted product behavior.
```

- [ ] **Step 4: Exercise the real route in dev** (the reconcile precedent: prove it end to end, not only unit-tested). With the dev server running against dev-test: `curl -s http://localhost:3000/api/cron/orbit | head -c 400` — expect `{"ok":true,"results":[...],"endgame":[...]}`. Any `[TEST]` residue this creates: clean up per the fixture rules.

- [ ] **Step 5: `tsc`, suite, commit** — `git add src/ vercel.json docs/ && git commit -m "Orbit wakes hourly now, and its route says what the sweep did"`

---

### Task 7: Chips under the bump

**Files:**
- Modify: `src/app/groups/[id]/page.tsx` (~lines 96-119, the `liveGauges` → `FeedGauge[]` mapping)

**Interfaces:**
- Consumes: `FeedGauge` (existing shape in GaugeChips.tsx: `{ id, orbitMessageId, tallyLine, labels, viewerAnswer }`), `findLiveGauges`, `MessageFeed`'s `gaugeByMessageId` map (keyed on `FeedGauge.orbitMessageId`).
- No component changes: `GaugeChips` posts by `gauge.id`, so a second `FeedGauge` with the same `id` and a different message id Just Works; `MessageFeed`'s map gains a second key.

- [ ] **Step 1: Implement.** Where the page maps each live gauge to one `FeedGauge`, emit a second entry when `bumpMessageId` is set:

```ts
  const feedGauges: FeedGauge[] = liveGauges.flatMap((g) => {
    const base = { id: g.id, tallyLine: tallyFor(g), labels: labelsFor(g), viewerAnswer: viewerAnswerFor(g) }
    return [
      { ...base, orbitMessageId: g.orbitMessageId },
      ...(g.bumpMessageId ? [{ ...base, orbitMessageId: g.bumpMessageId }] : []),
    ]
  })
```

(Adapt to the page's actual local helpers at those lines; the operative change is the `flatMap` + conditional second entry. `findLiveGauges` already returns the full Gauge row, which now includes `bumpMessageId`.)

- [ ] **Step 2: Verify in the browser** (dev server against dev-test): stage a bumped live gauge (set a `[TEST]` gauge's `bumpMessageId` via the sweep from Task 5's fixture path or a one-off script in the scratchpad), load the group home, confirm chips and tally render under BOTH the original message and the bump, and a tap on the bump's chips updates both tallies (same gauge underneath). Closure notes and zero-yes deaths need no wiring: a closed gauge is absent from `liveGauges`, so both of its messages render as plain history, which is exactly the spec.

- [ ] **Step 3: `tsc`, suite, commit** — `git add src/ && git commit -m "The bump answers where it lands"`

---

### Task 8: The records

**Files:**
- Modify: `CLAUDE.md` (carried-forward settled list in "Where the build is"; the full section rewrite happens at PR time per house convention)
- Modify: `docs/build-notes.md` ("Where Orbit decides to speak or stay quiet" register; §11 gets its slice entry at PR time)

- [ ] **Step 1: CLAUDE.md carried-forward amendments** — in the spark settled list, replace "the gauge closing at creation..." context with the two amended lines: a gauge closes two hours before its proposed start (at the start itself when born inside that window), and zero-yes ideas scroll away silently while a gauge with yeses closes with one chip-less note. Mark both "(amended 4 Aug 2026, gauge-endgame slice)".

- [ ] **Step 2: Register lines** — add to the spark-path table (or a new endgame table mirroring its format), one line each, with lean:

```
| endgame.ts, bump fires on the eve | The one bump, chattier-posture act one. Speaks. | Correct |
| endgame.ts, born_today guard | No bump for an idea the group has not had time to miss. | Correct |
| endgame.ts, still_newest guard | No bump when nothing has buried the gauge. | Correct |
| endgame.ts, closed_with_note | A goodbye when at least one person had committed. Speaks. | Correct |
| endgame.ts, closed_silently | Zero-yes gauges still die without residue. | Correct |
| detect-intent.ts, urgency clause on a late-born gauge | Speaks with the clock named. | Correct |
```

- [ ] **Step 3: Commit** — `git add CLAUDE.md docs/ && git commit -m "The records say what the endgame changed, where the next session will look"`

---

### Task 9: Final verification and PR prep

- [ ] **Step 1: Full suite, tsc, lint** — `npm test 2>&1 | tail -4 && npx tsc --noEmit && npm run lint 2>&1 | tail -5`. Expected: everything green except the one pre-existing `OnboardingWizard.tsx` lint error (on the baseline; carried, not attributable).

- [ ] **Step 2: The browser walkthrough** from the spec's verification section, against dev-test, staging times by adjusting stored gauge rows where waiting for a real evening is impractical. Every Orbit moment: near-miss bump with tally, ignored-idea bump, third yes on a bump chip creating the event with seeded RSVPs, closure note after yeses, zero-yes silent death, late-born urgency line. The PR must say which moments were staged versus lived.

- [ ] **Step 3: QA script** — committed in the repo at `scripts/qa-gauge-endgame.sh` (NEVER a scratch path; see `~/.claude/checklists/pr-handoff.md`), portable shell only (no `\s` in grep), stating what empty output means.

- [ ] **Step 4: PR per the house checklist** — independent read-only review with report in the PR body; before/after suite counts (553 baseline); the two record amendments named; QA handoff turnkey (state seeded, server running, links in order); stop at the open PR. The merge signal is the owner's.

---

## Self-review notes (already applied)

- Spec coverage: decisions 1-15 map to Tasks 2 (8, 11, 14-numbers), 3 (7, 9, 12), 4 (11), 5 (1-6, 9, 10), 6 (14, 15-checklist), 7 (6), 8 (15). Decision 2 (wrong-day retry excluded) needs no task by definition.
- The `start_passed` promote guard is kept, comment updated (Task 2 Step 5), so no behavior regression if the sweep lags.
- Re-spark widening (shorter liveness means the dedupe guard in detect-intent releases earlier) is spec-consistent: revival is a new spark, decision 10. The walkthrough should show it once rather than treat it as a surprise.
- Type consistency: `EndgameResult`, `gaugeClosesAt`, `isGaugeLive` object-signature, `buildBumpMessage(activity, inNames)` are each defined once and consumed with those exact names in later tasks.
