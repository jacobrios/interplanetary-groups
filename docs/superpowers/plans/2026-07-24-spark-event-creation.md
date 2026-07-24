# Spark Part Two: Event Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The third yes on a gauge creates the event, seeds the gauge answers as RSVPs, puts a second card on the group home, and lets Orbit finally make the promise part one withheld.

**Architecture:** Detection grows three fields (stated time, ambiguity flag, part of day) so the time is resolved once, at detection, and stored on the gauge. A new `promote` module turns a gauge that has reached three yeses into an Event in one transaction: event row, venue inherited from the group's rhythm, RSVPs seeded from votes, and Orbit's announcement. The `Event.@@unique([groupId, startsAt])` constraint is replaced by per-path idempotency keys (`Event.gaugeId` for sparked, `Event.scheduledKey` for the cron), and the cron's upcoming-event guard is narrowed so a sparked event can never suppress the standing rhythm.

**Tech Stack:** Next.js 16 (App Router, server actions), Prisma 7 (`prisma-client-js` generator, driver adapter, `prisma.config.ts`), Postgres via Supabase, Vitest (integration tests hit the real dev-test DB), Anthropic `claude-haiku-4-5` via `callExtractionModel`.

**Spec:** `docs/superpowers/specs/2026-07-24-spark-event-creation-design.md`. Where this plan and the spec differ, the spec is the intent.

## Global Constraints

Every task's requirements implicitly include this section.

- **Two databases, never crossed.** Before any `prisma migrate` or test run, confirm the `DATABASE_URL` / `DIRECT_URL` host in `.env` is the `interplanetary-groups-dev-test` project. If in doubt, stop and ask. This is the one unrecoverable mistake in the repo.
- **Never hand-write a migration.** Run `npx prisma migrate dev --name <name>`; a PreToolUse hook blocks direct edits to migration files by design.
- **Prisma 7 realities:** no bundled query engine (driver adapter in `src/lib/prisma.ts`), `prisma generate` does not run automatically, CLI config lives in `prisma.config.ts`.
- **Next.js 16:** `revalidatePath` must be called **outside and after** any try/catch — it uses the same internal throw mechanism as `redirect()` and gets swallowed inside a catch. The repo states this verbatim in three places; match it.
- **No em dashes in anything Orbit says.** Commas, periods, parentheses only. (Applies to Orbit's user-facing copy; standard hyphens in compound words are fine.)
- **Three-letter weekday abbreviations** in card and rhythm copy (`formatWeekdayShort`). `formatWeekdayLong` is used only inside Orbit's chat sentences, matching part one.
- **Everything renders in the group's timezone, never viewer-local.** Every instant is converted through `group.timeZone` with `zonedWallTimeToUtc` / `getLocalParts`. No silent UTC fallback.
- **RSVP is per-person status (IN / OUT only). Counts are always derived, never stored.** "Haven't replied" is the absence of a row.
- **Orbit is never a User or Membership row.** Orbit messages are `MessageAuthor.ORBIT` with `authorId: null`.
- **Venue never gates anything.** A missing or unmatched venue degrades to no venue; it never blocks creation.
- **Teal is the single primary action per screen; lime is Orbit's brand color and never an action.** Chips stay neutral outlined pills.
- **Status by brightness plus icon or label, never by hue alone** (the product owner is red/green colorblind).
- **Layout grows with content, never clips.** min-height plus padding, never fixed heights.
- **Chat body stays at `--type-body` (17px)** and is never shrunk to fit.
- **Test command:** `npx vitest run` (all), `npx vitest run <path>` (one file). Tests are integration-style against the dev-test DB; there is no mock harness and no `setupFiles`. Follow the cleanup-in-`afterAll` pattern in `src/lib/gauges/__tests__/gauges.test.ts` and prefix test fixture names with `[TEST]`.
- **Record the suite baseline before writing any code** (Task 0) so the finishing number is a real comparison.

---

## File Structure

**Created:**
- `src/lib/orbit/spark-copy.ts` — every pure formatter and scheduling decision for spark: `chooseProposedDate`, `isGaugeLive`, `resolveSparkTime`, `buildGaugeMessage`, `chipLabels`, `buildTallyLine`, `buildSparkAnnouncement`, time label helpers. No Anthropic import, so a client component can import from it safely. This is the debt payment part one deferred to "whenever part two touches it."
- `src/lib/gauges/threshold.ts` — `SPARK_THRESHOLD`, `countIn`, `hasReachedThreshold`. Derived-only, no storage.
- `src/lib/gauges/promote.ts` — `promoteGaugeToEvent`: the creation transaction (event + venue + seeded RSVPs + announcement) and every skip reason.
- `src/lib/events/upcoming-list.ts` — `findUpcomingEvents(groupId, limit)` for the two-card home, and `hasUpcomingScheduledEvent(groupId)` for the narrowed cron guard.
- `src/app/groups/[id]/EventCarousel.tsx` — the peek-and-dots row wrapping one or more `EventCard`s.
- Test files alongside each: `src/lib/orbit/__tests__/spark-copy.test.ts`, `src/lib/gauges/__tests__/threshold.test.ts`, `src/lib/gauges/__tests__/promote.test.ts`, `src/lib/events/__tests__/upcoming-list.test.ts`.

**Modified:**
- `prisma/schema.prisma` — `Gauge.proposedTime`, `Event.gaugeId` (unique), `Event.scheduledKey` (unique), drop `@@unique([groupId, startsAt])`, add `@@index([groupId, startsAt])`.
- `src/lib/orbit/spark.ts` — schema and prompt grow three fields; `NormalizedSpark` carries them; pure functions move out to `spark-copy.ts` and are re-exported for one task only, then callers are updated.
- `src/lib/events/create.ts` — `createEventInTx` extracted so `promote.ts` can join an existing transaction; `gaugeId` and `scheduledKey` accepted.
- `src/lib/orbit/reconcile.ts` — writes `scheduledKey`, uses the narrowed guard.
- `src/lib/gauges/create.ts` — stores `proposedTime`.
- `src/lib/gauges/read.ts` — excludes gauges that already produced an event.
- `src/app/actions/detect-spark.ts` — resolves time, passes it and the disclosure to the copy and the gauge.
- `src/app/actions/gauge-vote.ts` — refuses a vote on a closed gauge, and attempts promotion after an IN vote.
- `src/app/groups/[id]/page.tsx` — queries a list of events, renders the carousel.
- `docs/build-notes.md` (§11 entry, §8 registers) and `CLAUDE.md` ("Where the build is").

---

## Task 0: Record the baseline

**Files:** none (measurement only)

- [ ] **Step 1: Confirm the database is dev-test**

Run: `grep -o 'db\.[a-z0-9]*\.supabase\.co' .env | sort -u`
Expected: the dev-test project host only. If anything looks like production, STOP and ask.

- [ ] **Step 2: Run the full suite and record the number**

Run: `npx vitest run 2>&1 | tail -20`
Expected: all green. Write the exact "N tests across M files" figure into the task notes; the §11 entry needs it as a real before-number.

- [ ] **Step 3: Confirm the toolchain is clean before any edits**

Run: `npx tsc --noEmit && npx next lint`
Expected: both clean. A pre-existing failure must be reported now, not discovered later and attributed to this slice.

---

## Task 1: Schema and migration

**Files:**
- Modify: `prisma/schema.prisma` (Event model, Gauge model)
- Create: `prisma/migrations/<timestamp>_spark_event_creation/migration.sql` (generated, never hand-written)

**Interfaces:**
- Produces: `Gauge.proposedTime: string | null`, `Gauge.event: Event | null`, `Event.gaugeId: string | null` (unique), `Event.gauge: Gauge | null`, `Event.scheduledKey: string | null` (unique). Every later task depends on these names.

**Context the implementer needs:** `Event` currently carries `@@unique([groupId, startsAt])` with the comment "backs the 'soonest upcoming event for a group' query". That unique is also what `src/lib/events/upcoming.ts` relies on for its index (its own comment credits an `@@index([groupId, startsAt])` from an earlier migration that the unique later replaced). Dropping the unique therefore **must** add the composite index back, or the upcoming-event query loses its index.

- [ ] **Step 1: Edit the Gauge model**

Add to `model Gauge`, after `proposedDate`:

```prisma
  /// Group-local "HH:mm" the event will start at, resolved once at detection:
  /// the member's stated time when they gave one, otherwise the part-of-day
  /// default. Nullable only for gauges written before this slice; a pre-slice
  /// gauge reaching threshold falls back to the evening default.
  proposedTime String?
```

And add to its relation block, after `votes`:

```prisma
  event         Event?
```

- [ ] **Step 2: Edit the Event model**

Replace the two lines at the bottom of `model Event`:

```prisma
  @@index([groupId])
  @@unique([groupId, startsAt]) // backs the "soonest upcoming event for a group" query
```

with:

```prisma
  @@index([groupId])
  @@index([groupId, startsAt]) // backs the "soonest upcoming event for a group" query
```

and add these fields to `model Event` (after `activityLabel`):

```prisma
  /// The gauge that created this event, when it was sparked rather than
  /// scheduled. Unique, so one gauge can only ever produce one event however
  /// many times the third yes is double-tapped. Null means Orbit's cron
  /// created it, which is also how the cron guard tells the two apart.
  gaugeId       String?   @unique
  /// Idempotency key for the scheduled path only: "<groupId>:<ISO instant>",
  /// written exclusively by reconcile.ts. Replaces the old
  /// @@unique([groupId, startsAt]), which forbade a sparked event from sharing
  /// an instant with the standing one (build-notes §11, spark part two).
  scheduledKey  String?   @unique
```

and to its relation block:

```prisma
  gauge         Gauge?    @relation(fields: [gaugeId], references: [id], onDelete: SetNull)
```

`SetNull` deliberately: deleting a gauge must not delete a real event the group is attending.

- [ ] **Step 3: Generate the migration**

Run: `npx prisma migrate dev --name spark_event_creation`
Expected: a new directory under `prisma/migrations/`, applied cleanly, client regenerated. The SQL should contain two `ADD COLUMN`s on `Event`, one on `Gauge`, two `CREATE UNIQUE INDEX`, one `CREATE INDEX` on `("groupId", "startsAt")`, and one `DROP INDEX` for `Event_groupId_startsAt_key`.

- [ ] **Step 4: Verify the constraint actually went away**

Run:
```bash
npx prisma db execute --stdin <<'SQL'
SELECT indexname FROM pg_indexes WHERE tablename = 'Event' ORDER BY indexname;
SQL
```
Expected: `Event_gaugeId_key`, `Event_groupId_idx`, `Event_groupId_startsAt_idx`, `Event_scheduledKey_key`, `Event_pkey`. Crucially **no** `Event_groupId_startsAt_key`. If the old unique is still there, the rest of this slice will fail in a way that looks like a logic bug.

- [ ] **Step 5: Prove two events can now share an instant**

This is the whole point of the task, so it gets a test rather than an assertion.

Create `src/lib/events/__tests__/same-instant.test.ts`:

```ts
// src/lib/events/__tests__/same-instant.test.ts
//
// The constraint this slice removed: a group could not hold two events at the
// same start instant. With a 7pm default and any evening rhythm, a sparked
// event colliding with the standing one is ordinary, not exotic.

import { describe, it, expect, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"

const AUTH_ID = `test-same-instant-${Date.now()}`
let userId: string
let groupId: string

afterAll(async () => {
  if (groupId) {
    await prisma.event.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.membership.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.group.delete({ where: { id: groupId } }).catch(() => {})
  }
  if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {})
  await prisma.$disconnect()
})

describe("two events at the same instant", () => {
  it("is allowed, because a spark may land on the standing event's slot", async () => {
    const user = await prisma.user.create({
      data: { name: "[TEST] Same Instant", supabaseAuthId: AUTH_ID },
    })
    userId = user.id
    const group = await prisma.group.create({
      data: { name: "[TEST] Same Instant Group", founderId: user.id, timeZone: "UTC" },
    })
    groupId = group.id

    const startsAt = new Date("2026-08-07T19:00:00Z")
    await prisma.event.create({ data: { groupId, title: "Climbing Friday", startsAt } })
    await prisma.event.create({ data: { groupId, title: "Beers", startsAt } })

    expect(await prisma.event.count({ where: { groupId, startsAt } })).toBe(2)
  })
})
```

- [ ] **Step 6: Run it and confirm it passes only because of the migration**

Run: `npx vitest run src/lib/events/__tests__/same-instant.test.ts`
Expected: PASS. **Prove it could have failed:** `git stash` is not enough here (the DB is already migrated), so instead confirm the test's power by checking it against the old constraint's name in Step 4's output. If `Event_groupId_startsAt_key` had still existed, the second `create` would throw P2002. Note that reasoning in the commit body.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/events/__tests__/same-instant.test.ts
git commit -m "Allow two events at one instant, key each creation path instead"
```

---

## Task 2: Split the pure formatters out of spark.ts

**Files:**
- Create: `src/lib/orbit/spark-copy.ts`
- Modify: `src/lib/orbit/spark.ts` (delete the moved functions, keep the model call)
- Modify: importers — `src/app/actions/detect-spark.ts`, `src/app/actions/gauge-vote.ts`, `src/lib/gauges/read.ts`, `src/app/groups/[id]/page.tsx`
- Modify: the existing spark unit tests (find the exact path first)

**Interfaces:**
- Produces: `src/lib/orbit/spark-copy.ts` exporting `ACTIVITY_MAX`, `chooseProposedDate`, `isGaugeLive`, `buildGaugeMessage`, `chipLabels`, `buildTallyLine`, and the types `ChipLabels` and `GaugeVoteLike`. Every later task imports copy and scheduling helpers from **`spark-copy`**, never from `spark`.
- Consumes: nothing new.

**Why this task exists:** part one's build notes recorded it verbatim — "nothing stops a future client component importing `spark.ts` and dragging the Anthropic SDK into the browser bundle... the real fix is to split the pure formatters out of `spark.ts` when part two touches it anyway." Part two touches it. Doing the split **first** means every later task lands on the clean side and no import gets rewritten twice.

**This task changes no behavior.** It is a pure move. The existing tests are the proof: they must pass untouched except for their import lines.

- [ ] **Step 1: Find the existing spark test file and the full importer list**

Run:
```bash
ls src/lib/orbit/__tests__/ && grep -rln "orbit/spark" src/ docs/ --include=*.ts --include=*.tsx
```
Expected: a spark test file (likely `src/lib/orbit/__tests__/spark.test.ts`) plus the importers listed above. Use the real output, not this plan's guess, as the list to update in Step 4.

- [ ] **Step 2: Create `src/lib/orbit/spark-copy.ts`**

Move these **verbatim** from `spark.ts`, with no edits to their bodies: `ACTIVITY_MAX`, the `FRIDAY` and `FALLBACK_BUFFER_DAYS` constants, `weekdayOf`, `chooseProposedDate`, `isGaugeLive`, `CHIP_IN_EMOJI`, `THIS_WEEK_DAYS`, `GaugeVoteLike`, `ChipLabels`, `buildGaugeMessage`, `chipLabels`, `buildTallyLine`, and `startOfLocalDay`. Header:

```ts
// src/lib/orbit/spark-copy.ts
//
// Every pure decision and every string the spark flow produces: which day
// Orbit proposes, whether a gauge is still live, and all of the copy.
//
// Split out of spark.ts deliberately (build-notes §11, spark part one debt).
// spark.ts imports the Anthropic SDK; this file must never import it, so a
// client component can pull a formatter or a label type from here without
// dragging the model client into the browser bundle.
//
// Structured-extract-then-format: the model supplies fields, code composes
// every string. Nothing in this file is generated prose.

import type { GaugeAnswer } from "@prisma/client"

import {
  formatMonthDay,
  formatWeekdayLong,
  formatWeekdayShort,
} from "@/lib/events/format"
import { getLocalParts, zonedWallTimeToUtc } from "./occurrence"
```

- [ ] **Step 3: Strip `spark.ts` down to the model call**

`spark.ts` keeps only: its header comment (updated), `SPARK_SCHEMA`, `SPARK_SYSTEM_PROMPT`, `SparkContext`, `NormalizedSpark`, `detectSparkClaim`, `normalizeSpark`. Its remaining imports are `callExtractionModel` and `cleanShortText` only. Re-export nothing: a re-export would leave the client-bundle hazard exactly where it was. Add to its header:

```ts
// Pure formatters and scheduling helpers live in spark-copy.ts, which has no
// Anthropic import. Keep it that way: this module must stay server-only.
```

- [ ] **Step 4: Update every importer**

In each file from Step 1, split the import. Example, `src/app/actions/detect-spark.ts`:

```ts
import { detectSparkClaim, normalizeSpark } from "@/lib/orbit/spark"
import { buildGaugeMessage, chooseProposedDate } from "@/lib/orbit/spark-copy"
```

`src/lib/gauges/read.ts` and `src/app/actions/gauge-vote.ts` import only `isGaugeLive`, so their line becomes `from "@/lib/orbit/spark-copy"`. `src/app/groups/[id]/page.tsx` imports `buildTallyLine, chipLabels` — same change.

- [ ] **Step 5: Run the full suite — it must pass with zero test-logic changes**

Run: `npx vitest run`
Expected: the same green count as Task 0's baseline. Any behavioral difference means this stopped being a pure move; revert and redo it. Also run `npx tsc --noEmit` (this is where a missed importer surfaces).

- [ ] **Step 6: Commit**

```bash
git add src/lib/orbit/spark.ts src/lib/orbit/spark-copy.ts src/app src/lib
git commit -m "Split spark's pure copy out of the module that loads the model SDK"
```

---

## Task 3: Detection learns to read a time

**Files:**
- Modify: `src/lib/orbit/spark.ts` (`SPARK_SCHEMA`, `SPARK_SYSTEM_PROMPT`, `NormalizedSpark`, `normalizeSpark`)
- Test: the spark unit test file found in Task 2, Step 1

**Interfaces:**
- Produces:
```ts
export type PartOfDay = "morning" | "evening"
export type NormalizedSpark =
  | { spark: false }
  | {
      spark: true
      activity: string
      statedDayOfWeek: number | null
      statedTime: string | null      // validated "HH:mm", or null when none was stated
      timeAmbiguous: boolean         // a clock number with no am/pm and no context
      partOfDay: PartOfDay | null    // what kind of activity this is, for the defaults
    }
```
- Consumes: `cleanShortText` from `./rhythm` (unchanged).

**Context:** onboarding's `EXTRACTION_SCHEMA` already carries `timeLocal` + `timeAmbiguous` with prompt rules that work (`src/lib/orbit/extract.ts`, `FIELD_RULES`). Reuse that language rather than inventing new phrasing, so the two calls cannot drift on what "ambiguous" means. The regex `^([01]\d|2[0-3]):[0-5]\d$` in `src/lib/orbit/rhythm.ts` (`TIME_LOCAL_RE`) is the existing validity rule; export it and reuse it rather than writing a second one.

- [ ] **Step 1: Export the time regex from rhythm.ts**

In `src/lib/orbit/rhythm.ts`, change `const TIME_LOCAL_RE` to `export const TIME_LOCAL_RE`. One word; it stops this slice from owning a second copy of "what a valid time looks like."

- [ ] **Step 2: Write the failing normalize tests**

Append to the spark unit test file:

```ts
describe("normalizeSpark, time fields", () => {
  const base = { isSpark: true, activity: "beers", statedDayOfWeek: 5 }

  it("keeps a valid stated time", () => {
    const r = normalizeSpark({ ...base, statedTime: "20:00", timeAmbiguous: false, partOfDay: "evening" })
    expect(r).toEqual({
      spark: true, activity: "beers", statedDayOfWeek: 5,
      statedTime: "20:00", timeAmbiguous: false, partOfDay: "evening",
    })
  })

  it("treats a malformed time as no time at all", () => {
    // A claim, not a fact: "99:99" and "8pm" are both the model failing the
    // contract, and the product must degrade to its default rather than
    // putting an unparseable string anywhere near an event.
    for (const bad of ["99:99", "8pm", "8", "", null, 20]) {
      const r = normalizeSpark({ ...base, statedTime: bad, timeAmbiguous: false, partOfDay: null })
      expect(r).toMatchObject({ spark: true, statedTime: null, timeAmbiguous: false })
    }
  })

  it("cannot report ambiguity when there is no time to be ambiguous about", () => {
    const r = normalizeSpark({ ...base, statedTime: null, timeAmbiguous: true, partOfDay: null })
    expect(r).toMatchObject({ statedTime: null, timeAmbiguous: false })
  })

  it("rejects a part of day it does not recognise", () => {
    const r = normalizeSpark({ ...base, statedTime: null, timeAmbiguous: false, partOfDay: "afternoon" })
    expect(r).toMatchObject({ partOfDay: null })
  })

  it("still normalizes a spark from a model that omitted the new fields", () => {
    // Defensive: the schema requires them, but normalize is the boundary and
    // must not throw on a response that skipped one.
    const r = normalizeSpark(base)
    expect(r).toMatchObject({ spark: true, statedTime: null, timeAmbiguous: false, partOfDay: null })
  })
})
```

- [ ] **Step 3: Run them and watch them fail**

Run: `npx vitest run src/lib/orbit/__tests__/spark.test.ts`
Expected: FAIL — the returned objects lack `statedTime`, `timeAmbiguous`, and `partOfDay`.

- [ ] **Step 4: Grow the schema**

In `spark.ts`, replace `SPARK_SCHEMA` with:

```ts
export const SPARK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["isSpark", "activity", "statedDayOfWeek", "statedTime", "timeAmbiguous", "partOfDay"],
  properties: {
    isSpark: { type: "boolean" },
    activity: { type: ["string", "null"] },
    statedDayOfWeek: { type: ["integer", "null"] },
    statedTime: { type: ["string", "null"] },
    timeAmbiguous: { type: "boolean" },
    partOfDay: {
      anyOf: [{ type: "string", enum: ["morning", "evening"] }, { type: "null" }],
    },
  },
} as const
```

- [ ] **Step 5: Grow the prompt**

Append to `SPARK_SYSTEM_PROMPT`, after the `statedDayOfWeek` bullet:

```
- statedTime: 24-hour "HH:MM" only if the message stated a time. Use the activity to read it: "beers at 8" is "20:00", "breakfast at 8" is "08:00". Null when no time was stated.
- timeAmbiguous: true only when a clock number was given with no am or pm AND the activity does not settle it. "beers at 8" is not ambiguous, because beers do not happen at 8 in the morning. "breakfast at 8" is not ambiguous. "meet at 8" for something that happens at both ends of the day IS ambiguous: set statedTime to your best reading and timeAmbiguous to true. When statedTime is null, timeAmbiguous is false.
- partOfDay: "morning" for activities that happen in the morning (breakfast, coffee, a sunrise hike), "evening" for activities that happen at night (beers, dinner, drinks, a movie). Null when the activity could genuinely be either, or when you are unsure. This is about the activity itself, not about any time that was stated.
```

- [ ] **Step 6: Grow `normalizeSpark`**

Replace its return with the widened shape. Add above the return:

```ts
  const statedTime =
    typeof o.statedTime === "string" && TIME_LOCAL_RE.test(o.statedTime) ? o.statedTime : null

  // Ambiguity is a property of a time that exists. Without one there is
  // nothing to be uncertain about, and letting the flag stand alone would
  // send the disclosure line out with nothing to disclose.
  const timeAmbiguous = statedTime !== null && o.timeAmbiguous === true

  const partOfDay: PartOfDay | null =
    o.partOfDay === "morning" || o.partOfDay === "evening" ? o.partOfDay : null

  return { spark: true, activity, statedDayOfWeek, statedTime, timeAmbiguous, partOfDay }
```

Import `TIME_LOCAL_RE` from `./rhythm` alongside `cleanShortText`.

- [ ] **Step 7: Run the tests**

Run: `npx vitest run src/lib/orbit/__tests__/spark.test.ts`
Expected: PASS, including every part-one test that was already there.

- [ ] **Step 8: Commit**

```bash
git add src/lib/orbit/spark.ts src/lib/orbit/rhythm.ts src/lib/orbit/__tests__
git commit -m "Read a stated time and the activity's part of day out of a spark"
```

---

## Task 4: Resolve the time and the day together

**Files:**
- Modify: `src/lib/orbit/spark-copy.ts` (add `resolveSparkTime`, `formatTimeLocalLabel`, `spokenHour`; change `chooseProposedDate`)
- Test: `src/lib/orbit/__tests__/spark-copy.test.ts` (create)

**Interfaces:**
- Consumes: `PartOfDay` from `./spark` (type-only import, safe — a type import erases at compile time and cannot pull the SDK in).
- Produces:
```ts
export const EVENING_TIME = "19:00"
export const MORNING_TIME = "09:00"
export interface ResolvedSparkTime {
  timeLocal: string        // always concrete "HH:mm"
  disclosure: string | null // the sentence Orbit adds, or null when nothing was guessed
}
export function resolveSparkTime(input: {
  statedTime: string | null
  timeAmbiguous: boolean
  partOfDay: PartOfDay | null
}): ResolvedSparkTime
export function chooseProposedDate(
  statedDayOfWeek: number | null,
  partOfDay: PartOfDay | null,
  timeZone: string,
  now: Date
): Date            // NOTE: signature changed, partOfDay inserted second
export function formatTimeLocalLabel(timeLocal: string): string  // "20:00" → "8pm"
```

**The rules, from the spec:** a stated unambiguous time wins outright. A genuine coin flip **keeps the stated hour** and lands in the evening, plus one disclosure sentence — it does not fall to 7pm, because the person said 8 and a card saying 7 would contradict them. Nothing stated falls to the part-of-day default. Morning activities propose Saturday; everything else keeps part one's Friday.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/orbit/__tests__/spark-copy.test.ts`:

```ts
// src/lib/orbit/__tests__/spark-copy.test.ts
import { describe, it, expect } from "vitest"
import {
  chooseProposedDate,
  formatTimeLocalLabel,
  resolveSparkTime,
} from "../spark-copy"

describe("resolveSparkTime", () => {
  it("takes a clear stated time at face value, and says nothing", () => {
    expect(resolveSparkTime({ statedTime: "20:00", timeAmbiguous: false, partOfDay: "evening" }))
      .toEqual({ timeLocal: "20:00", disclosure: null })
  })

  it("takes a clear morning time at face value too", () => {
    expect(resolveSparkTime({ statedTime: "08:00", timeAmbiguous: false, partOfDay: "morning" }))
      .toEqual({ timeLocal: "08:00", disclosure: null })
  })

  it("keeps the stated hour on a coin flip and lands it in the evening", () => {
    // The person said 8. Falling back to the 7pm default here would put a time
    // on the card they never said.
    expect(resolveSparkTime({ statedTime: "08:00", timeAmbiguous: true, partOfDay: null }))
      .toEqual({ timeLocal: "20:00", disclosure: "You said 8, so I'm taking that as 8pm." })
  })

  it("leaves an already-evening ambiguous reading alone but still discloses", () => {
    expect(resolveSparkTime({ statedTime: "20:00", timeAmbiguous: true, partOfDay: null }))
      .toEqual({ timeLocal: "20:00", disclosure: "You said 8, so I'm taking that as 8pm." })
  })

  it("reads an ambiguous 12 as noon, not midnight", () => {
    expect(resolveSparkTime({ statedTime: "12:00", timeAmbiguous: true, partOfDay: null }).timeLocal)
      .toBe("12:00")
  })

  it("carries minutes through a coin flip", () => {
    expect(resolveSparkTime({ statedTime: "08:30", timeAmbiguous: true, partOfDay: null }))
      .toEqual({ timeLocal: "20:30", disclosure: "You said 8:30, so I'm taking that as 8:30pm." })
  })

  it("defaults an evening activity to 7pm with nothing to disclose", () => {
    expect(resolveSparkTime({ statedTime: null, timeAmbiguous: false, partOfDay: "evening" }))
      .toEqual({ timeLocal: "19:00", disclosure: null })
  })

  it("defaults a morning activity to 9am", () => {
    expect(resolveSparkTime({ statedTime: null, timeAmbiguous: false, partOfDay: "morning" }))
      .toEqual({ timeLocal: "09:00", disclosure: null })
  })

  it("defaults an unknown activity to the evening", () => {
    expect(resolveSparkTime({ statedTime: null, timeAmbiguous: false, partOfDay: null }).timeLocal)
      .toBe("19:00")
  })

  it("never discloses when nothing was stated: there is no guess to own up to", () => {
    expect(resolveSparkTime({ statedTime: null, timeAmbiguous: false, partOfDay: null }).disclosure)
      .toBeNull()
  })
})

describe("formatTimeLocalLabel", () => {
  it("renders the group-facing label", () => {
    expect(formatTimeLocalLabel("19:00")).toBe("7pm")
    expect(formatTimeLocalLabel("09:00")).toBe("9am")
    expect(formatTimeLocalLabel("20:30")).toBe("8:30pm")
    expect(formatTimeLocalLabel("12:00")).toBe("12pm")
    expect(formatTimeLocalLabel("00:00")).toBe("12am")
  })
})

describe("chooseProposedDate", () => {
  const TZ = "UTC"
  // Wednesday 2026-07-22.
  const WED = new Date("2026-07-22T12:00:00Z")

  it("proposes Friday for an evening activity with no stated day", () => {
    const d = chooseProposedDate(null, "evening", TZ, WED)
    expect(d.toISOString()).toBe("2026-07-24T00:00:00.000Z")
  })

  it("proposes Friday when the activity's part of day is unknown", () => {
    expect(chooseProposedDate(null, null, TZ, WED).toISOString()).toBe("2026-07-24T00:00:00.000Z")
  })

  it("proposes Saturday for a morning activity", () => {
    // Friday was chosen on evening-social logic; breakfast should not inherit it.
    expect(chooseProposedDate(null, "morning", TZ, WED).toISOString()).toBe("2026-07-25T00:00:00.000Z")
  })

  it("still honours a stated day whatever the activity is", () => {
    // Monday, stated. Taken at face value, part of day irrelevant.
    expect(chooseProposedDate(1, "morning", TZ, WED).toISOString()).toBe("2026-07-27T00:00:00.000Z")
  })

  it("still applies the notice buffer to its own guess", () => {
    // Thursday: the coming Friday is one day out, inside the two-day buffer,
    // so it pushes a week. Part one behavior, must not regress.
    const THU = new Date("2026-07-23T12:00:00Z")
    expect(chooseProposedDate(null, "evening", TZ, THU).toISOString()).toBe("2026-07-31T00:00:00.000Z")
  })

  it("applies the buffer to the Saturday guess too", () => {
    // Friday: the coming Saturday is one day out, inside the buffer.
    const FRI = new Date("2026-07-24T12:00:00Z")
    expect(chooseProposedDate(null, "morning", TZ, FRI).toISOString()).toBe("2026-08-01T00:00:00.000Z")
  })
})
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run src/lib/orbit/__tests__/spark-copy.test.ts`
Expected: FAIL — `resolveSparkTime` and `formatTimeLocalLabel` are not exported, and `chooseProposedDate` takes three arguments.

- [ ] **Step 3: Implement, in `spark-copy.ts`**

```ts
import type { PartOfDay } from "./spark"

/**
 * Where an unstated time lands. Both numbers are placeholders with no data
 * behind them (accepted 24 July 2026), kept here beside the day fallback so
 * the override-learning behavior in build-notes §5 replaces all four at once.
 */
export const EVENING_TIME = "19:00"
export const MORNING_TIME = "09:00"

export interface ResolvedSparkTime {
  /** Always concrete: the event has to start at some o'clock. */
  timeLocal: string
  /**
   * The sentence Orbit adds to own up to a guess, or null when it did not
   * guess. Deliberately narrow: it fires only when someone stated an hour
   * whose half of the day Orbit had to pick. A fully unstated time gets no
   * line, because there is nothing the group said that could be misread.
   */
  disclosure: string | null
}

export function resolveSparkTime({
  statedTime,
  timeAmbiguous,
  partOfDay,
}: {
  statedTime: string | null
  timeAmbiguous: boolean
  partOfDay: PartOfDay | null
}): ResolvedSparkTime {
  if (statedTime === null) {
    return {
      timeLocal: partOfDay === "morning" ? MORNING_TIME : EVENING_TIME,
      disclosure: null,
    }
  }

  if (!timeAmbiguous) {
    return { timeLocal: statedTime, disclosure: null }
  }

  // A coin flip. Keep their hour, put it in the evening, and say so.
  // A known-morning activity would never have reached here: the model settles
  // "breakfast at 8" itself.
  const [h, m] = splitTime(statedTime)
  const eveningHour = h >= 1 && h <= 11 ? h + 12 : h === 0 ? 12 : h
  const timeLocal = `${pad(eveningHour)}:${pad(m)}`

  return {
    timeLocal,
    disclosure: `You said ${spokenHour(statedTime)}, so I'm taking that as ${formatTimeLocalLabel(timeLocal)}.`,
  }
}

/** "20:00" → "8pm", "08:30" → "8:30am". The group-facing label. */
export function formatTimeLocalLabel(timeLocal: string): string {
  const [h, m] = splitTime(timeLocal)
  const suffix = h < 12 ? "am" : "pm"
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${h12}${suffix}` : `${h12}:${pad(m)}${suffix}`
}

/** "08:30" → "8:30": the number as the member themselves said it, no suffix. */
function spokenHour(timeLocal: string): string {
  const [h, m] = splitTime(timeLocal)
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${h12}` : `${h12}:${pad(m)}`
}

function splitTime(t: string): [number, number] {
  const [h, m] = t.split(":").map(Number)
  return [h, m]
}

function pad(n: number): string {
  return String(n).padStart(2, "0")
}
```

- [ ] **Step 4: Change `chooseProposedDate` to take the part of day**

Replace the constant and the fallback branch:

```ts
const FRIDAY = 5
const SATURDAY = 6
```

Insert `partOfDay: PartOfDay | null` as the **second** parameter, and change the else branch:

```ts
  } else {
    // Friday was chosen on end-of-the-week social logic, which is about
    // evenings. A morning idea inherits Saturday instead: "breakfast sometime"
    // proposed for Friday 7pm would be wrong twice over.
    const fallbackDay = partOfDay === "morning" ? SATURDAY : FRIDAY
    offsetDays = (fallbackDay - todayDow + 7) % 7
    if (offsetDays < FALLBACK_BUFFER_DAYS) offsetDays += 7
  }
```

Update its doc comment to name both fallbacks and keep the "starting heuristic, cheap to replace" framing.

- [ ] **Step 5: Fix the one existing caller so the build passes**

`src/app/actions/detect-spark.ts` currently calls `chooseProposedDate(spark.statedDayOfWeek, group.timeZone, now)`. Change it to `chooseProposedDate(spark.statedDayOfWeek, spark.partOfDay, group.timeZone, now)`. Task 5 rewrites more of this action; this is the minimum to compile.

- [ ] **Step 6: Run the new tests, then the whole suite**

Run: `npx vitest run src/lib/orbit/__tests__/spark-copy.test.ts && npx vitest run`
Expected: new file PASS; full suite green. Part one's own `chooseProposedDate` tests (in the spark test file) will need their call sites updated to pass `null` for the new parameter — that is a signature change, not a behavior change, and their expectations must not move.

- [ ] **Step 7: Commit**

```bash
git add src/lib/orbit/spark-copy.ts src/lib/orbit/__tests__ src/app/actions/detect-spark.ts
git commit -m "Resolve a sparked event's time, and send morning ideas to Saturday"
```

---

## Task 5: Orbit's copy grows up

**Files:**
- Modify: `src/lib/orbit/spark-copy.ts` (`buildGaugeMessage`, `buildTallyLine`, add `buildSparkAnnouncement`)
- Test: `src/lib/orbit/__tests__/spark-copy.test.ts`, plus the part-one tests that pin the promise OUT

**Interfaces:**
- Consumes: `SPARK_THRESHOLD` — **defined in this task** as a local constant in `spark-copy.ts` and re-exported by `src/lib/gauges/threshold.ts` in Task 6, so there is exactly one 3 in the codebase.
- Produces:
```ts
export const SPARK_THRESHOLD = 3
export function buildGaugeMessage(
  activity: string,
  proposedDate: Date,
  timeZone: string,
  now: Date,
  disclosure: string | null   // NOTE: new fifth parameter
): string
export function buildSparkAnnouncement(activity: string, startsAt: Date, timeZone: string): string
```

**Context — this task deliberately breaks part one's tests.** Part one pinned the promise and countdown clauses OUT with tests, "so that the day part two lands, the boundary moved on purpose rather than by accident." Flipping those tests is the intended signal, not a regression. Find them first so the flip is deliberate:

- [ ] **Step 1: Find the tests that pin the absent copy**

Run: `grep -rn "set it up\|makes it happen\|no promise\|countdown" src/ docs/superpowers/plans/`
Expected: assertions in the spark test file that the gauge message does **not** contain "set it up" and the tally does **not** contain "makes it happen". Note them; Step 6 rewrites them.

- [ ] **Step 2: Write the failing copy tests**

Append to `src/lib/orbit/__tests__/spark-copy.test.ts`:

```ts
import { buildGaugeMessage, buildSparkAnnouncement, buildTallyLine } from "../spark-copy"

describe("buildGaugeMessage, part two", () => {
  const TZ = "UTC"
  const WED = new Date("2026-07-22T12:00:00Z")
  const FRI = new Date("2026-07-24T00:00:00Z")

  it("makes the promise it can now keep", () => {
    const msg = buildGaugeMessage("beers", FRI, TZ, WED, null)
    expect(msg).toBe("Love it. Anyone in for beers this Friday? If three of you are in, I'll set it up.")
  })

  it("owns up to a guessed half of the day, before the promise", () => {
    const msg = buildGaugeMessage("pickleball", FRI, TZ, WED, "You said 8, so I'm taking that as 8pm.")
    expect(msg).toBe(
      "Love it. Anyone in for pickleball this Friday? You said 8, so I'm taking that as 8pm. If three of you are in, I'll set it up."
    )
  })

  it("says nothing about time when it guessed nothing", () => {
    expect(buildGaugeMessage("beers", FRI, TZ, WED, null)).not.toContain("taking that as")
  })

  it("never uses an em dash", () => {
    // Product-voice rule: Orbit does not speak in dashes.
    const msg = buildGaugeMessage("beers", FRI, TZ, WED, "You said 8, so I'm taking that as 8pm.")
    expect(msg).not.toMatch(/[—–]/)
  })
})

describe("buildTallyLine, the countdown", () => {
  const names = new Map([["a", "Jacob"], ["b", "Maya"], ["c", "Jesse"]])
  const inVote = (userId: string) => ({ userId, answer: "IN" as const })

  it("counts down when the group is one away", () => {
    expect(buildTallyLine([inVote("a"), inVote("b")], names))
      .toBe("Jacob & Maya are in so far · one more makes it happen")
  })

  it("stays quiet at one, where the countdown would be pressure", () => {
    expect(buildTallyLine([inVote("a")], names)).toBe("Jacob is in so far")
  })

  it("stops counting down once the bar is met", () => {
    expect(buildTallyLine([inVote("a"), inVote("b"), inVote("c")], names))
      .not.toContain("makes it happen")
  })

  it("does not count a different-day answer toward the bar", () => {
    const votes = [inVote("a"), { userId: "b", answer: "NOT_THAT_DAY" as const }]
    expect(buildTallyLine(votes, names)).toBe("Jacob is in so far · 1 wants a different day")
  })
})

describe("buildSparkAnnouncement", () => {
  it("names the day and the time, so the guess is visible the moment it is made", () => {
    const startsAt = new Date("2026-07-24T19:00:00Z")
    expect(buildSparkAnnouncement("beers", startsAt, "UTC"))
      .toBe("Three of you are in, so beers is on for Fri at 7pm. It's up top now.")
  })

  it("never uses an em dash", () => {
    const startsAt = new Date("2026-07-24T19:00:00Z")
    expect(buildSparkAnnouncement("beers", startsAt, "UTC")).not.toMatch(/[—–]/)
  })
})
```

- [ ] **Step 3: Run and watch them fail**

Run: `npx vitest run src/lib/orbit/__tests__/spark-copy.test.ts`
Expected: FAIL — `buildGaugeMessage` takes four arguments and makes no promise; `buildSparkAnnouncement` does not exist.

- [ ] **Step 4: Implement the three copy changes**

In `spark-copy.ts`:

```ts
/** Three people, including an initiator who named the day themselves. */
export const SPARK_THRESHOLD = 3
```

`buildGaugeMessage` gains the fifth parameter and the promise. Replace its return:

```ts
  const disclosureClause = disclosure ? ` ${disclosure}` : ""

  // The promise part one deliberately withheld. It can be kept now: three
  // yeses create the event in the same tap that produces the third one.
  return `Love it. Anyone in for ${activity} ${when}?${disclosureClause} If three of you are in, I'll set it up.`
```

and update its doc comment (delete the "makes no promise" paragraph; say instead that the promise is honored by `promoteGaugeToEvent`).

`buildTallyLine` gains the countdown, immediately before `return parts.join(" · ")`:

```ts
  // One away, and only one away: at zero or one the countdown would be
  // pressure rather than information, and past the bar there is nothing left
  // to count down to.
  if (inNames.length === SPARK_THRESHOLD - 1) {
    parts.push("one more makes it happen")
  }
```

New function:

```ts
/**
 * What Orbit says in the feed the moment a gauge becomes an event.
 *
 * States the time out loud on purpose: the time may be Orbit's own default or
 * its reading of an ambiguous hour, and the group should see it the moment it
 * is fixed rather than discovering it on the card later.
 */
export function buildSparkAnnouncement(
  activity: string,
  startsAt: Date,
  timeZone: string
): string {
  const weekday = formatWeekdayShort(startsAt, timeZone)
  const time = formatTime(startsAt, timeZone)
  return `Three of you are in, so ${activity} is on for ${weekday} at ${time}. It's up top now.`
}
```

Add `formatTime` to the existing `@/lib/events/format` import.

- [ ] **Step 5: Update the one existing `buildGaugeMessage` caller**

In `src/app/actions/detect-spark.ts`, the `body:` argument becomes a five-argument call. Task 7 wires the real disclosure; for now pass `null` so the build stays green.

- [ ] **Step 6: Flip part one's pin-out tests**

Rewrite the assertions found in Step 1 from "does not contain" to the new expected strings. In each, replace the comment explaining why the clause is absent with one line naming this slice, e.g.:

```ts
// Part one pinned this clause OUT because it could not honor it. Part two
// creates the event at the third yes, so the promise is now true.
```

- [ ] **Step 7: Run the full suite**

Run: `npx vitest run`
Expected: green. Any remaining failure mentioning "set it up" or "makes it happen" is a pin-out test Step 1 missed; flip it the same way.

- [ ] **Step 8: Commit**

```bash
git add src/lib/orbit src/app/actions/detect-spark.ts
git commit -m "Let Orbit promise the setup, count down, and own its time guess"
```

---

## Task 6: Store the resolved time at detection

**Files:**
- Modify: `src/lib/gauges/create.ts` (`CreateGaugeInput.proposedTime`, write it)
- Modify: `src/app/actions/detect-spark.ts` (resolve, disclose, store)
- Test: `src/lib/gauges/__tests__/gauges.test.ts`

**Interfaces:**
- Consumes: `resolveSparkTime`, `chooseProposedDate`, `buildGaugeMessage` from `@/lib/orbit/spark-copy`.
- Produces: `CreateGaugeInput` gains `proposedTime: string` (required for new callers). Every gauge written from here on carries a concrete time.

**Why the time resolves here and not at creation:** the part-of-day bucket already decides the proposed *day* at detection, so resolving the *time* in the same breath keeps one decision in one place. Creation then only ever reads a stored value, never re-derives one from the original message, which is the "carry it, do not regenerate it" rule.

- [ ] **Step 1: Write the failing data-layer test**

Append to `src/lib/gauges/__tests__/gauges.test.ts`, inside the existing `describe("createGauge", ...)`:

```ts
  it("stores the time the event will start at", async () => {
    const src = await sourceMessage("beers Friday at 8pm")

    const result = await createGauge({
      groupId,
      sourceMessageId: src,
      activity: "beers",
      proposedDate: new Date("2026-07-24T00:00:00Z"),
      proposedTime: "20:00",
      body: "Love it. Anyone in for beers this Friday? If three of you are in, I'll set it up.",
    })
    if (result.status !== "created") throw new Error("fixture failed")

    expect(result.gauge.proposedTime).toBe("20:00")
  })
```

Every other `createGauge(...)` call in this file also needs `proposedTime` added (use `"19:00"`), because it becomes required. Do that in the same edit.

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/lib/gauges/__tests__/gauges.test.ts`
Expected: FAIL — TypeScript rejects the unknown property, or `proposedTime` comes back null.

- [ ] **Step 3: Accept and write it in `createGauge`**

Add to `CreateGaugeInput`:

```ts
  /**
   * Group-local "HH:mm" the event will start at if this gauge reaches the bar.
   * Resolved at detection (stated time, or the part-of-day default) so
   * creation reads a stored value instead of re-deriving one from the original
   * message days later.
   */
  proposedTime: string
```

Destructure it and add `proposedTime` to the `tx.gauge.create({ data: ... })` block.

- [ ] **Step 4: Wire the action**

In `src/app/actions/detect-spark.ts`, replace the `chooseProposedDate` / `createGauge` block:

```ts
    const proposedDate = chooseProposedDate(
      spark.statedDayOfWeek,
      spark.partOfDay,
      group.timeZone,
      now
    )

    // One resolution, one place. The disclosure rides along with it: Orbit
    // says what it assumed only when it actually had to assume something.
    const { timeLocal, disclosure } = resolveSparkTime({
      statedTime: spark.statedTime,
      timeAmbiguous: spark.timeAmbiguous,
      partOfDay: spark.partOfDay,
    })

    const result = await createGauge({
      groupId: group.id,
      sourceMessageId: message.id,
      activity: spark.activity,
      proposedDate,
      proposedTime: timeLocal,
      body: buildGaugeMessage(
        spark.activity,
        proposedDate,
        group.timeZone,
        now,
        disclosure
      ),
      initiatorUserId: spark.statedDayOfWeek !== null ? user.id : null,
    })
```

and add `resolveSparkTime` to the `spark-copy` import.

- [ ] **Step 5: Run the suite**

Run: `npx vitest run && npx tsc --noEmit`
Expected: green and clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/gauges/create.ts src/app/actions/detect-spark.ts src/lib/gauges/__tests__
git commit -m "Resolve and store a sparked event's start time when Orbit reads the idea"
```

---

## Task 7: The threshold, derived from votes

**Files:**
- Create: `src/lib/gauges/threshold.ts`
- Test: `src/lib/gauges/__tests__/threshold.test.ts`

**Interfaces:**
- Consumes: `SPARK_THRESHOLD` from `@/lib/orbit/spark-copy` (Task 5).
- Produces:
```ts
export { SPARK_THRESHOLD }
export function countIn(votes: { answer: GaugeAnswer }[]): number
export function hasReachedThreshold(votes: { answer: GaugeAnswer }[]): boolean
```

**Why a module for two small functions:** the bar is a product rule that both the tally copy and the creation path have to agree on forever. One home, one number, no second 3 anywhere.

- [ ] **Step 1: Write the failing test**

Create `src/lib/gauges/__tests__/threshold.test.ts`:

```ts
// src/lib/gauges/__tests__/threshold.test.ts
//
// The bar is three people. Pure derivation from vote rows: nothing about a
// tally is ever stored, the same rule RSVPs follow.

import { describe, it, expect } from "vitest"
import { GaugeAnswer } from "@prisma/client"
import { countIn, hasReachedThreshold, SPARK_THRESHOLD } from "../threshold"

const v = (answer: GaugeAnswer) => ({ answer })

describe("countIn", () => {
  it("counts only yes answers", () => {
    expect(countIn([v("IN"), v("OUT"), v("NOT_THAT_DAY"), v("IN")])).toBe(2)
  })

  it("counts nothing in an empty gauge", () => {
    expect(countIn([])).toBe(0)
  })
})

describe("hasReachedThreshold", () => {
  it("is false below the bar", () => {
    expect(hasReachedThreshold([v("IN"), v("IN")])).toBe(false)
  })

  it("is true at the bar", () => {
    expect(hasReachedThreshold([v("IN"), v("IN"), v("IN")])).toBe(true)
  })

  it("stays true above the bar", () => {
    expect(hasReachedThreshold([v("IN"), v("IN"), v("IN"), v("IN")])).toBe(true)
  })

  it("does not let willing-but-not-that-day answers reach the bar", () => {
    // "Yes, can't Fri" is interest in the idea, not attendance on the day
    // being proposed, and the event created here is for that day.
    expect(hasReachedThreshold([v("IN"), v("IN"), v("NOT_THAT_DAY")])).toBe(false)
  })

  it("agrees with the exported number", () => {
    expect(hasReachedThreshold(Array(SPARK_THRESHOLD).fill(v("IN")))).toBe(true)
    expect(hasReachedThreshold(Array(SPARK_THRESHOLD - 1).fill(v("IN")))).toBe(false)
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/lib/gauges/__tests__/threshold.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/gauges/threshold.ts`:

```ts
// src/lib/gauges/threshold.ts
//
// Whether a gauge has reached the bar. Derived from the vote rows every time
// and never stored, the same rule RSVP counts follow: a stored count can drift
// out of sync with the rows it describes, and being right about who is coming
// is the entire value of this product.
//
// The number itself lives in spark-copy.ts beside the copy that counts down to
// it, so the tally and the creation path can never disagree about the bar.

import type { GaugeAnswer } from "@prisma/client"
import { SPARK_THRESHOLD } from "@/lib/orbit/spark-copy"

export { SPARK_THRESHOLD }

/** How many people said yes to the day being proposed. */
export function countIn(votes: { answer: GaugeAnswer }[]): number {
  return votes.filter((v) => v.answer === "IN").length
}

/**
 * Only IN counts. NOT_THAT_DAY is interest in the idea without attendance on
 * this day, and the event this unlocks is for this day.
 */
export function hasReachedThreshold(votes: { answer: GaugeAnswer }[]): boolean {
  return countIn(votes) >= SPARK_THRESHOLD
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/gauges/__tests__/threshold.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/gauges/threshold.ts src/lib/gauges/__tests__/threshold.test.ts
git commit -m "Derive the three-yes bar from vote rows"
```

---

## Task 8: Key the scheduled path, and stop it seeing sparked events

**Files:**
- Modify: `src/lib/events/create.ts` (extract `createEventInTx`, accept `gaugeId` / `scheduledKey`)
- Create: `src/lib/events/upcoming-list.ts` (`hasUpcomingScheduledEvent`, `findUpcomingEvents`)
- Modify: `src/lib/orbit/reconcile.ts` (write the key, use the narrowed guard)
- Test: `src/lib/events/__tests__/upcoming-list.test.ts`, plus the existing reconcile test file

**Interfaces:**
- Produces:
```ts
// events/create.ts
export interface CreateEventInput { /* ...existing... */ gaugeId?: string | null; scheduledKey?: string | null }
export async function createEventInTx(tx: Prisma.TransactionClient, input: CreateEventInput): Promise<Event>
export async function createEvent(input: CreateEventInput): Promise<Event>   // unchanged signature
// events/upcoming-list.ts
export async function hasUpcomingScheduledEvent(groupId: string, now: Date): Promise<boolean>
export async function findUpcomingEvents(groupId: string, now: Date, limit: number): Promise<UpcomingEvent[]>
```
- `UpcomingEvent` is the existing type from `src/lib/events/upcoming.ts`; re-export it rather than defining a second one.

**This is the hardest requirement in the slice.** The cron's guard is currently "if this group has **any** upcoming event, do nothing" (`reconcile.ts`, `findSoonestUpcomingEvent`). The moment a sparked event exists, that guard sees it and silently stops creating the standing occurrence, so a group that sparks beers for Friday gets next Sunday's climb card days late. Nothing about that is visible until someone notices a missing card.

- [ ] **Step 1: Write the failing test that proves the bug**

Create `src/lib/events/__tests__/upcoming-list.test.ts`:

```ts
// src/lib/events/__tests__/upcoming-list.test.ts
//
// The cron guard must count only the events Orbit's schedule created. A
// sparked event sitting in the future is not evidence that the standing
// rhythm has been scheduled, and treating it as such delays the group's
// actual recurring event by days.

import { describe, it, expect, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { findUpcomingEvents, hasUpcomingScheduledEvent } from "../upcoming-list"

const AUTH_ID = `test-upcoming-list-${Date.now()}`
let userId: string
let groupId: string

const NOW = new Date("2026-07-24T12:00:00Z")

async function ensureGroup() {
  if (groupId) return
  const user = await prisma.user.create({
    data: { name: "[TEST] Upcoming List", supabaseAuthId: AUTH_ID },
  })
  userId = user.id
  const group = await prisma.group.create({
    data: { name: "[TEST] Upcoming List Group", founderId: user.id, timeZone: "UTC" },
  })
  groupId = group.id
}

afterAll(async () => {
  if (groupId) {
    await prisma.event.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.group.delete({ where: { id: groupId } }).catch(() => {})
  }
  if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {})
  await prisma.$disconnect()
})

describe("hasUpcomingScheduledEvent", () => {
  it("is false when the only upcoming event was sparked", async () => {
    await ensureGroup()
    await prisma.event.deleteMany({ where: { groupId } })

    // A sparked event has no scheduledKey. Before this function existed, the
    // cron's any-upcoming-event guard saw this row and skipped the group,
    // silently withholding the standing rhythm's next occurrence.
    await prisma.event.create({
      data: { groupId, title: "Beers", startsAt: new Date("2026-07-31T19:00:00Z") },
    })

    expect(await hasUpcomingScheduledEvent(groupId, NOW)).toBe(false)
  })

  it("is true when the standing rhythm's occurrence is already there", async () => {
    await ensureGroup()
    await prisma.event.deleteMany({ where: { groupId } })
    await prisma.event.create({
      data: {
        groupId,
        title: "Climbing Sunday",
        startsAt: new Date("2026-07-26T15:00:00Z"),
        scheduledKey: `${groupId}:2026-07-26T15:00:00.000Z`,
      },
    })

    expect(await hasUpcomingScheduledEvent(groupId, NOW)).toBe(true)
  })

  it("ignores a scheduled event that has already happened", async () => {
    await ensureGroup()
    await prisma.event.deleteMany({ where: { groupId } })
    await prisma.event.create({
      data: {
        groupId,
        title: "Climbing Sunday",
        startsAt: new Date("2026-07-19T15:00:00Z"),
        scheduledKey: `${groupId}:2026-07-19T15:00:00.000Z`,
      },
    })

    expect(await hasUpcomingScheduledEvent(groupId, NOW)).toBe(false)
  })
})

describe("findUpcomingEvents", () => {
  it("returns upcoming events soonest first, with venues, whatever created them", async () => {
    await ensureGroup()
    await prisma.event.deleteMany({ where: { groupId } })

    await prisma.event.create({
      data: { groupId, title: "Beers", startsAt: new Date("2026-07-31T19:00:00Z") },
    })
    await prisma.event.create({
      data: {
        groupId,
        title: "Climbing Sunday",
        startsAt: new Date("2026-07-26T15:00:00Z"),
        scheduledKey: `${groupId}:2026-07-26T15:00:00.000Z`,
      },
    })
    await prisma.event.create({
      data: { groupId, title: "Old thing", startsAt: new Date("2026-07-01T15:00:00Z") },
    })

    const events = await findUpcomingEvents(groupId, NOW, 5)
    expect(events.map((e) => e.title)).toEqual(["Climbing Sunday", "Beers"])
    expect(events[0].venues).toEqual([])
  })

  it("respects the limit", async () => {
    await ensureGroup()
    const events = await findUpcomingEvents(groupId, NOW, 1)
    expect(events).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/lib/events/__tests__/upcoming-list.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/lib/events/upcoming-list.ts`**

```ts
// src/lib/events/upcoming-list.ts
//
// Upcoming-event queries that know the difference between the two creation
// paths.
//
// findSoonestUpcomingEvent (upcoming.ts) answers "what is next for this
// group", which is a display question and correctly blind to origin. The cron
// needs a different question: "has the standing rhythm already been scheduled",
// and a sparked event is not an answer to it. Conflating the two makes a spark
// silently delay the group's recurring event (build-notes §11, spark part two).

import { prisma } from "@/lib/prisma"
import type { UpcomingEvent } from "./upcoming"

export type { UpcomingEvent }

/**
 * Whether Orbit's schedule has already put a future occurrence on the board.
 * Only rows carrying a scheduledKey count: that key is written exclusively by
 * reconcile.ts, so it is what distinguishes a scheduled event from a sparked
 * one without a separate source column.
 */
export async function hasUpcomingScheduledEvent(
  groupId: string,
  now: Date
): Promise<boolean> {
  const existing = await prisma.event.findFirst({
    where: { groupId, startsAt: { gte: now }, scheduledKey: { not: null } },
    select: { id: true },
  })
  return existing !== null
}

/**
 * The group's upcoming events, soonest first: the home screen's card list.
 * Deliberately origin-blind, because the group does not care which path
 * created a plan it is attending.
 */
export async function findUpcomingEvents(
  groupId: string,
  now: Date,
  limit: number
): Promise<UpcomingEvent[]> {
  return prisma.event.findMany({
    where: { groupId, startsAt: { gte: now } },
    orderBy: { startsAt: "asc" },
    take: limit,
    include: { venues: true },
  })
}
```

- [ ] **Step 4: Run the new test**

Run: `npx vitest run src/lib/events/__tests__/upcoming-list.test.ts`
Expected: PASS.

- [ ] **Step 5: Extract `createEventInTx`**

In `src/lib/events/create.ts`, add `gaugeId` and `scheduledKey` to `CreateEventInput`:

```ts
  /** Set only by the spark path: the gauge this event was created from. */
  gaugeId?: string | null
  /** Set only by reconcile.ts: "<groupId>:<ISO instant>". The scheduled path's idempotency key. */
  scheduledKey?: string | null
```

Split the body so a caller that already holds a transaction can join it:

```ts
/**
 * The event write itself, inside a caller-supplied transaction.
 *
 * Exists because promoteGaugeToEvent needs the event, its venue, the seeded
 * RSVPs and Orbit's announcement to land together or not at all, and Prisma
 * cannot nest interactive transactions. Keeping the write here rather than
 * copying it into promote.ts keeps one canonical event-creation path.
 */
export async function createEventInTx(
  tx: Prisma.TransactionClient,
  input: CreateEventInput
): Promise<Event> {
  const { groupId, title, startsAt, endsAt, activityLabel, venue, gaugeId, scheduledKey } = input

  const event = await tx.event.create({
    data: {
      groupId,
      title,
      startsAt,
      endsAt: endsAt ?? null,
      activityLabel: activityLabel ?? null,
      gaugeId: gaugeId ?? null,
      scheduledKey: scheduledKey ?? null,
    },
  })

  if (venue) {
    await tx.venue.create({
      data: {
        eventId: event.id,
        name: venue.name,
        displayLabel: venue.displayLabel ?? null,
        address: venue.address ?? null,
        url: venue.url ?? null,
      },
    })
  }

  return event
}

export async function createEvent(input: CreateEventInput): Promise<Event> {
  return prisma.$transaction((tx) => createEventInTx(tx, input))
}
```

Add `import type { Prisma } from "@prisma/client"`. Update the doc comment on `createEvent`: duplicate prevention is now per-path (`gaugeId` for sparked, `scheduledKey` for scheduled), not a blanket instant constraint.

- [ ] **Step 6: Update `reconcile.ts`**

Two changes. The guard:

```ts
    // Step b: skip if the STANDING rhythm already has an upcoming occurrence.
    // Deliberately not "any upcoming event": a sparked event is not evidence
    // that the schedule has run, and counting it would silently withhold the
    // group's recurring event until the spark had passed.
    const alreadyScheduled = await hasUpcomingScheduledEvent(groupId, now)
    if (alreadyScheduled) {
      results.push({ groupId, status: "skipped", reason: "upcoming_exists" })
      continue
    }
```

and the write:

```ts
      const event = await createEvent({
        groupId,
        title: rhythm.title,
        startsAt,
        activityLabel: rhythm.activity,
        // The scheduled path's own idempotency key, replacing the dropped
        // @@unique([groupId, startsAt]). Two cron runs racing on the same
        // occurrence still collide on P2002 and come back as a skip.
        scheduledKey: `${groupId}:${startsAt.toISOString()}`,
        venue: rhythm.venueName ? { name: rhythm.venueName } : null,
      })
```

Swap the import from `findSoonestUpcomingEvent` to `hasUpcomingScheduledEvent`, and update the file's header comment where it describes the guard. Leave the P2002 catch exactly as it is; it now catches the new key.

- [ ] **Step 7: Add the regression test to the reconcile suite**

Find the reconcile test file (`grep -rln "reconcileScheduledEvents" src/`) and add:

```ts
  it("still schedules the standing rhythm when a sparked event is upcoming", async () => {
    // The bug this slice had to fix: the old guard counted any upcoming event,
    // so a sparked beers night on Friday suppressed Sunday's climb entirely.
    // Follow the file's existing fixture helpers for the group + rhythm setup.
    await prisma.event.create({
      data: { groupId, title: "Beers", startsAt: new Date("2026-07-31T19:00:00Z") },
    })

    const results = await reconcileScheduledEvents(new Date("2026-07-24T12:00:00Z"), { groupId })

    expect(results[0].status).toBe("created")
    expect(
      await prisma.event.count({ where: { groupId, scheduledKey: { not: null } } })
    ).toBe(1)
  })
```

Adapt the fixture setup to whatever that file already uses; do not introduce a second fixture style.

- [ ] **Step 8: Run everything**

Run: `npx vitest run && npx tsc --noEmit`
Expected: green and clean. The reconcile suite is the one to watch: its existing idempotency tests now exercise `scheduledKey` rather than the dropped constraint, and they must still pass unchanged.

- [ ] **Step 9: Commit**

```bash
git add src/lib/events src/lib/orbit/reconcile.ts
git commit -m "Keep a sparked event from suppressing the group's standing rhythm"
```

---

## Task 9: Promote a gauge into an event

**Files:**
- Create: `src/lib/gauges/promote.ts`
- Test: `src/lib/gauges/__tests__/promote.test.ts`

**Interfaces:**
- Consumes: `createEventInTx` (Task 8), `hasReachedThreshold` (Task 7), `buildSparkAnnouncement` (Task 5), `zonedWallTimeToUtc` / `getLocalParts` from `@/lib/orbit/occurrence`, `parseStoredRhythms` from `@/lib/orbit/rhythm`, `EVENING_TIME` from `@/lib/orbit/spark-copy`.
- Produces:
```ts
export type PromoteResult =
  | { status: "created"; eventId: string }
  | { status: "skipped"; reason: "below_threshold" | "already_created" | "start_passed" | "no_gauge" }
export async function promoteGaugeToEvent(gaugeId: string, now: Date): Promise<PromoteResult>
```

**Everything lands together or not at all:** the event, its inherited venue, the seeded RSVPs, and Orbit's announcement are one transaction. A half-created spark would be Orbit announcing an event that does not exist, or an event nobody was told about. `createGauge` already set this precedent for its own pair.

**The seeding rule:** a gauge answer is an answer about attending that concrete day, so re-asking it as an RSVP would be asking twice. `IN` seeds `RsvpStatus.IN`; **both** `OUT` and `NOT_THAT_DAY` seed `RsvpStatus.OUT`, because both mean not coming on the day the event is for.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/gauges/__tests__/promote.test.ts`:

```ts
// src/lib/gauges/__tests__/promote.test.ts
//
// The moment the product exists for: three yeses become a real event, and the
// people who already said yes are already on it.

import { describe, it, expect, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { GaugeAnswer, MessageAuthor } from "@prisma/client"
import { createGauge } from "../create"
import { promoteGaugeToEvent } from "../promote"

const AUTH = [0, 1, 2, 3].map((n) => `test-promote-${n}-${Date.now()}`)
const userIds: string[] = []
let groupId: string

const NOW = new Date("2026-07-22T12:00:00Z")          // Wednesday
const FRIDAY = new Date("2026-07-24T00:00:00Z")        // group-local midnight

async function ensureGroup(recurringActivities?: unknown) {
  if (groupId) return
  for (const [i, authId] of AUTH.entries()) {
    const u = await prisma.user.create({
      data: { name: `[TEST] Promote ${i}`, supabaseAuthId: authId },
    })
    userIds.push(u.id)
  }
  const group = await prisma.group.create({
    data: {
      name: "[TEST] Promote Group",
      founderId: userIds[0],
      timeZone: "UTC",
      recurringActivities: (recurringActivities ?? null) as never,
      memberships: { create: userIds.map((userId) => ({ userId })) },
    },
  })
  groupId = group.id
}

/** A fresh gauge with the given answers already on it. */
async function gaugeWith(
  activity: string,
  answers: GaugeAnswer[],
  proposedTime = "19:00"
): Promise<string> {
  await ensureGroup()
  const msg = await prisma.message.create({
    data: { groupId, authorType: MessageAuthor.MEMBER, authorId: userIds[0], body: `we should ${activity}` },
  })
  const r = await createGauge({
    groupId,
    sourceMessageId: msg.id,
    activity,
    proposedDate: FRIDAY,
    proposedTime,
    body: `Love it. Anyone in for ${activity} this Friday? If three of you are in, I'll set it up.`,
  })
  if (r.status !== "created") throw new Error("fixture failed")
  for (const [i, answer] of answers.entries()) {
    await prisma.gaugeVote.create({
      data: { gaugeId: r.gauge.id, userId: userIds[i], answer },
    })
  }
  return r.gauge.id
}

afterAll(async () => {
  if (groupId) {
    await prisma.event.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.message.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.membership.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.group.delete({ where: { id: groupId } }).catch(() => {})
  }
  for (const id of userIds) {
    await prisma.user.delete({ where: { id } }).catch(() => {})
  }
  await prisma.$disconnect()
})

describe("promoteGaugeToEvent", () => {
  it("creates nothing below the bar", async () => {
    const gaugeId = await gaugeWith("bowling", ["IN", "IN"])
    expect(await promoteGaugeToEvent(gaugeId, NOW)).toEqual({
      status: "skipped",
      reason: "below_threshold",
    })
    expect(await prisma.event.count({ where: { gaugeId } })).toBe(0)
  })

  it("does not let a different-day answer reach the bar", async () => {
    const gaugeId = await gaugeWith("darts", ["IN", "IN", "NOT_THAT_DAY"])
    expect((await promoteGaugeToEvent(gaugeId, NOW)).status).toBe("skipped")
  })

  it("creates the event at the third yes, at the stored day and time", async () => {
    const gaugeId = await gaugeWith("beers", ["IN", "IN", "IN"], "20:00")

    const result = await promoteGaugeToEvent(gaugeId, NOW)
    expect(result.status).toBe("created")

    const event = await prisma.event.findFirst({ where: { gaugeId } })
    expect(event).not.toBeNull()
    expect(event!.startsAt.toISOString()).toBe("2026-07-24T20:00:00.000Z")
    expect(event!.endsAt).toBeNull()   // nothing knows how long beers lasts
    expect(event!.title).toBe("Beers")
    expect(event!.activityLabel).toBe("beers")
    expect(event!.scheduledKey).toBeNull()  // the cron must not see this as its own
  })

  it("seeds the gauge answers as RSVPs, so nobody is asked twice", async () => {
    const gaugeId = await gaugeWith("tacos", ["IN", "IN", "IN", "OUT"])
    await promoteGaugeToEvent(gaugeId, NOW)

    const event = await prisma.event.findFirst({ where: { gaugeId } })
    const rsvps = await prisma.rsvp.findMany({ where: { eventId: event!.id } })

    expect(rsvps).toHaveLength(4)
    expect(rsvps.filter((r) => r.status === "IN")).toHaveLength(3)
    expect(rsvps.filter((r) => r.status === "OUT")).toHaveLength(1)
  })

  it("seeds a can't-that-day answer as out, because it is out for this day", async () => {
    const gaugeId = await gaugeWith("karaoke", ["IN", "IN", "IN", "NOT_THAT_DAY"])
    await promoteGaugeToEvent(gaugeId, NOW)

    const event = await prisma.event.findFirst({ where: { gaugeId } })
    const seeded = await prisma.rsvp.findFirst({
      where: { eventId: event!.id, userId: userIds[3] },
    })
    expect(seeded!.status).toBe("OUT")
  })

  it("announces the event in the feed, naming the time out loud", async () => {
    const gaugeId = await gaugeWith("pool", ["IN", "IN", "IN"])
    await promoteGaugeToEvent(gaugeId, NOW)

    const messages = await prisma.message.findMany({
      where: { groupId, authorType: MessageAuthor.ORBIT },
      orderBy: { createdAt: "desc" },
      take: 1,
    })
    expect(messages[0].body).toContain("pool is on for Fri at 7pm")
    expect(messages[0].authorId).toBeNull()
  })

  it("creates one event however many times the third yes fires", async () => {
    const gaugeId = await gaugeWith("chess", ["IN", "IN", "IN"])

    const [a, b] = await Promise.all([
      promoteGaugeToEvent(gaugeId, NOW),
      promoteGaugeToEvent(gaugeId, NOW),
    ])

    const created = [a, b].filter((r) => r.status === "created")
    expect(created).toHaveLength(1)
    expect(await prisma.event.count({ where: { gaugeId } })).toBe(1)
  })

  it("creates nothing once the proposed start has already passed", async () => {
    // A gauge stays live until the end of its day, so the third yes can land
    // at 9pm on a 7pm proposal. A card announcing the past is noise.
    const gaugeId = await gaugeWith("bingo", ["IN", "IN", "IN"])
    const late = new Date("2026-07-24T21:00:00Z")

    expect(await promoteGaugeToEvent(gaugeId, late)).toEqual({
      status: "skipped",
      reason: "start_passed",
    })
    expect(await prisma.event.count({ where: { gaugeId } })).toBe(0)
  })

  it("leaves no orphan announcement when the event cannot be written", async () => {
    const gaugeId = await gaugeWith("squash", ["IN", "IN", "IN"])
    const before = await prisma.message.count({ where: { groupId, authorType: MessageAuthor.ORBIT } })

    // Force the write to fail after the transaction has begun: an event
    // already occupies this gauge's unique link.
    await prisma.event.create({
      data: { groupId, title: "Squatter", startsAt: new Date("2026-08-09T19:00:00Z"), gaugeId },
    })

    const result = await promoteGaugeToEvent(gaugeId, NOW)
    expect(result).toEqual({ status: "skipped", reason: "already_created" })
    expect(
      await prisma.message.count({ where: { groupId, authorType: MessageAuthor.ORBIT } })
    ).toBe(before)
  })

  it("reports a gauge that is gone rather than throwing", async () => {
    expect(await promoteGaugeToEvent("no-such-gauge-id", NOW)).toEqual({
      status: "skipped",
      reason: "no_gauge",
    })
  })
})

describe("promoteGaugeToEvent, venue inheritance", () => {
  it("pencils in the group's standing spot for that activity", async () => {
    // The payoff the venue-capture slice was sequenced ahead of spark for:
    // "beers at Lucky Lab" told us where this group drinks.
    const user = await prisma.user.create({
      data: { name: "[TEST] Venue Inherit", supabaseAuthId: `test-venue-inherit-${Date.now()}` },
    })
    const group = await prisma.group.create({
      data: {
        name: "[TEST] Venue Inherit Group",
        founderId: user.id,
        timeZone: "UTC",
        recurringActivities: [
          { activity: "climbing", title: "Climbing Sunday", cadence: "weekly", daysOfWeek: [0], timeLocal: "08:00", venueName: "Summit Gym" },
          { activity: "beers", title: "Beers", cadence: null, daysOfWeek: null, timeLocal: null, venueName: "Lucky Lab" },
        ] as never,
        memberships: { create: { userId: user.id } },
      },
    })

    try {
      const msg = await prisma.message.create({
        data: { groupId: group.id, authorType: MessageAuthor.MEMBER, authorId: user.id, body: "beers?" },
      })
      const r = await createGauge({
        groupId: group.id,
        sourceMessageId: msg.id,
        activity: "Beers",   // different case on purpose
        proposedDate: FRIDAY,
        proposedTime: "19:00",
        body: "Love it. Anyone in for beers this Friday? If three of you are in, I'll set it up.",
      })
      if (r.status !== "created") throw new Error("fixture failed")

      // Three yeses from one fixture user is impossible, so vote rows are
      // written directly with distinct ids.
      const extras = await Promise.all(
        [1, 2].map((n) =>
          prisma.user.create({
            data: { name: `[TEST] Venue Extra ${n}`, supabaseAuthId: `test-venue-extra-${n}-${Date.now()}` },
          })
        )
      )
      for (const u of [user, ...extras]) {
        await prisma.gaugeVote.create({
          data: { gaugeId: r.gauge.id, userId: u.id, answer: GaugeAnswer.IN },
        })
      }

      await promoteGaugeToEvent(r.gauge.id, NOW)

      const event = await prisma.event.findFirst({
        where: { gaugeId: r.gauge.id },
        include: { venues: true },
      })
      expect(event!.venues[0]?.name).toBe("Lucky Lab")

      await prisma.event.deleteMany({ where: { groupId: group.id } })
      for (const u of extras) await prisma.user.delete({ where: { id: u.id } }).catch(() => {})
    } finally {
      await prisma.message.deleteMany({ where: { groupId: group.id } }).catch(() => {})
      await prisma.membership.deleteMany({ where: { groupId: group.id } }).catch(() => {})
      await prisma.group.delete({ where: { id: group.id } }).catch(() => {})
      await prisma.user.delete({ where: { id: user.id } }).catch(() => {})
    }
  })

  it("creates the event with no venue when nothing matches", async () => {
    const gaugeId = await gaugeWith("laser tag", ["IN", "IN", "IN"])
    await promoteGaugeToEvent(gaugeId, NOW)

    const event = await prisma.event.findFirst({
      where: { gaugeId },
      include: { venues: true },
    })
    // Venue never gates anything: a miss is an event without a penciled-in
    // spot, never a failure to create.
    expect(event!.venues).toEqual([])
  })
})
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run src/lib/gauges/__tests__/promote.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/gauges/promote.ts`**

```ts
// src/lib/gauges/promote.ts
//
// Three yeses become a real event.
//
// Everything lands in one transaction: the event, the venue inherited from the
// group's own rhythm, the RSVPs seeded from the votes, and Orbit's
// announcement. A half-created spark is Orbit announcing an event that does
// not exist, or an event nobody was told about; createGauge set this precedent
// for its own message-plus-gauge pair.
//
// Idempotency is the unique Event.gaugeId, the same shape as createGauge's
// unique sourceMessageId: a double-fired third yes hits the constraint and
// comes back as a skip.

import { prisma } from "@/lib/prisma"
import { MessageAuthor, RsvpStatus } from "@prisma/client"

import { createEventInTx } from "@/lib/events/create"
import { getLocalParts, zonedWallTimeToUtc } from "@/lib/orbit/occurrence"
import { parseStoredRhythms } from "@/lib/orbit/rhythm"
import { buildSparkAnnouncement, EVENING_TIME } from "@/lib/orbit/spark-copy"
import { hasReachedThreshold } from "./threshold"

export type PromoteResult =
  | { status: "created"; eventId: string }
  | {
      status: "skipped"
      reason: "below_threshold" | "already_created" | "start_passed" | "no_gauge"
    }

/**
 * Create the event this gauge has earned, or explain why not.
 *
 * Safe to call after every vote: below the bar it is two queries and a no-op,
 * and above it the unique constraint makes a second call harmless.
 */
export async function promoteGaugeToEvent(
  gaugeId: string,
  now: Date
): Promise<PromoteResult> {
  const gauge = await prisma.gauge.findUnique({
    where: { id: gaugeId },
    include: {
      group: { select: { id: true, timeZone: true, recurringActivities: true } },
      votes: { select: { userId: true, answer: true } },
      event: { select: { id: true } },
    },
  })

  if (!gauge) return { status: "skipped", reason: "no_gauge" }
  if (gauge.event) return { status: "skipped", reason: "already_created" }
  if (!hasReachedThreshold(gauge.votes)) {
    return { status: "skipped", reason: "below_threshold" }
  }

  const zone = gauge.group.timeZone
  const startsAt = startInstant(gauge.proposedDate, gauge.proposedTime, zone)

  // A gauge stays live until the end of its day, so the third yes can arrive
  // after the proposed start. A card and an announcement for something that
  // already began is noise about the past; the gauge just expires.
  if (startsAt.getTime() <= now.getTime()) {
    return { status: "skipped", reason: "start_passed" }
  }

  const venueName = inheritedVenue(gauge.group.recurringActivities, gauge.activity)

  try {
    const eventId = await prisma.$transaction(async (tx) => {
      const event = await createEventInTx(tx, {
        groupId: gauge.group.id,
        title: titleFor(gauge.activity),
        startsAt,
        // No end: nothing in the product knows how long beers lasts, and the
        // field is optional for exactly this reason.
        endsAt: null,
        activityLabel: gauge.activity,
        gaugeId: gauge.id,
        venue: venueName ? { name: venueName } : null,
      })

      // Never ask twice: a gauge answer is an answer about attending this day,
      // so it carries through without a second tap. Both flavors of no seed
      // OUT, because "next time" and "can't that day" both mean not coming to
      // the event this creates.
      await tx.rsvp.createMany({
        data: gauge.votes.map((v) => ({
          eventId: event.id,
          userId: v.userId,
          status: v.answer === "IN" ? RsvpStatus.IN : RsvpStatus.OUT,
        })),
        skipDuplicates: true,
      })

      await tx.message.create({
        data: {
          groupId: gauge.group.id,
          authorType: MessageAuthor.ORBIT,
          authorId: null,
          body: buildSparkAnnouncement(gauge.activity, startsAt, zone),
        },
      })

      return event.id
    })

    return { status: "created", eventId }
  } catch (err) {
    // The unique Event.gaugeId: a concurrent third yes got there first.
    if ((err as { code?: string }).code === "P2002") {
      return { status: "skipped", reason: "already_created" }
    }
    throw err
  }
}

/** The proposed day's local midnight plus the stored time, as one instant. */
function startInstant(proposedDate: Date, proposedTime: string | null, zone: string): Date {
  const day = getLocalParts(proposedDate, zone)
  // Null only for gauges written before part two shipped; they fall to the
  // evening default rather than blocking a group that is ready to go.
  const [hour, minute] = (proposedTime ?? EVENING_TIME).split(":").map(Number)
  return zonedWallTimeToUtc(day.year, day.month, day.day, hour, minute, zone)
}

/** "beers" becomes "Beers": the card wants a title, not a fragment. */
function titleFor(activity: string): string {
  return activity.charAt(0).toUpperCase() + activity.slice(1)
}

/**
 * The group's standing spot for this activity, when it told us one.
 *
 * Matched on the activity word, case-insensitively. A miss ("grab drinks"
 * against a "beers" rhythm) yields no venue, which is correct: venue never
 * gates anything, and a wrong guess about where a group drinks is worse than
 * no guess.
 */
function inheritedVenue(recurringActivities: unknown, activity: string): string | null {
  const rhythms = parseStoredRhythms(recurringActivities)
  if (!rhythms) return null
  const match = rhythms.find(
    (r) => r.activity.toLowerCase() === activity.toLowerCase() && r.venueName
  )
  return match?.venueName ?? null
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/gauges/__tests__/promote.test.ts`
Expected: PASS, all of them.

- [ ] **Step 5: Prove the concurrency test could actually fail**

The double-fire test passes trivially if the two calls happen to serialize. Confirm it has teeth: temporarily comment out the `catch` P2002 branch (make it `throw err`) and re-run only that test. Expected: it fails with an unhandled P2002. Restore the catch and re-run. Note this in the commit body; a passing race test nobody has seen fail is not evidence.

- [ ] **Step 6: Run the whole suite**

Run: `npx vitest run && npx tsc --noEmit`
Expected: green and clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/gauges/promote.ts src/lib/gauges/__tests__/promote.test.ts
git commit -m "Turn a gauge that reached three yeses into a real event"
```

---

## Task 10: The third tap creates it

**Files:**
- Modify: `src/app/actions/gauge-vote.ts`
- Modify: `src/lib/gauges/read.ts` (exclude gauges that already produced an event)

**Interfaces:**
- Consumes: `promoteGaugeToEvent` (Task 9).
- Produces: no new exports. `findLiveGauges` narrows: a gauge with an event is no longer returned.

**Two behaviors in one task because they are the same product moment:** creation happens in the vote action, and the same instant closes the gauge. Splitting them would leave a commit where the event exists and the chips still invite answers into a dead surface.

- [ ] **Step 1: Write the failing read-layer test**

Append to `src/lib/gauges/__tests__/gauges.test.ts`, inside `describe("findLiveGauges", ...)`:

```ts
  it("drops a gauge once it has produced its event", async () => {
    // From creation on, the event card is the only place answers live. Two
    // surfaces collecting the same answer would eventually disagree.
    await ensureGroup()
    const src = await sourceMessage("we should play pool")
    const r = await createGauge({
      groupId,
      sourceMessageId: src,
      activity: "pool",
      proposedDate: new Date("2026-07-24T00:00:00Z"),
      proposedTime: "19:00",
      body: "Love it. Anyone in for pool this Friday? If three of you are in, I'll set it up.",
    })
    if (r.status !== "created") throw new Error("fixture failed")

    const before = await findLiveGauges(groupId, new Date("2026-07-24T12:00:00Z"))
    expect(before.map((g) => g.activity)).toContain("pool")

    await prisma.event.create({
      data: {
        groupId,
        title: "Pool",
        startsAt: new Date("2026-07-24T19:00:00Z"),
        gaugeId: r.gauge.id,
      },
    })

    const after = await findLiveGauges(groupId, new Date("2026-07-24T12:00:00Z"))
    expect(after.map((g) => g.activity)).not.toContain("pool")
  })
```

Add `await prisma.event.deleteMany({ where: { groupId } }).catch(() => {})` to this file's `afterAll`, before the message sweep.

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/lib/gauges/__tests__/gauges.test.ts`
Expected: FAIL — the promoted gauge is still returned as live.

- [ ] **Step 3: Narrow `findLiveGauges`**

In `src/lib/gauges/read.ts`, add `event: null` to the `where` and extend the doc comment:

```ts
  const candidates = await prisma.gauge.findMany({
    where: {
      groupId,
      proposedDate: { gte: new Date(now.getTime() - WINDOW_MS) },
      // A gauge that produced its event is finished asking. Its message stays
      // in the feed as history, exactly like an expired one: no chips, no
      // tally, no residue. Whether a gauge is closed is derived from the
      // event's existence and never stored.
      event: null,
    },
    ...
```

- [ ] **Step 4: Run it**

Run: `npx vitest run src/lib/gauges/__tests__/gauges.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire creation into the vote action**

In `src/app/actions/gauge-vote.ts`, after the existing `isGaugeLive` check, add the closed-gauge guard:

```ts
  // Already created: the question is settled and the event card owns answers
  // from here.
  const existingEvent = await prisma.event.findFirst({
    where: { gaugeId },
    select: { id: true },
  })
  if (existingEvent) {
    return { errors: { general: "That one's already set. It's up top." } }
  }
```

Then replace the `castVote` try/catch:

```ts
  try {
    await castVote({ supabaseAuthId: user.id, gaugeId, answer })
  } catch {
    return { errors: { general: "Couldn't save that, try again." } }
  }

  // The third yes is what creates the event, right here in the tap that
  // produced it: the person who tapped should see it exist when the screen
  // settles, with no cron in between.
  //
  // Best-effort on purpose. A vote that saved is a real answer, and failing
  // the whole action because promotion errored would throw away something the
  // member actually said. Logged, because a silently unpromoted gauge sitting
  // at three yeses is Orbit visibly breaking the promise in its own message.
  if (answer === GaugeAnswer.IN) {
    try {
      await promoteGaugeToEvent(gaugeId, new Date())
    } catch (err) {
      console.error("[gauge-vote] promotion failed", err)
    }
  }
```

Import `promoteGaugeToEvent` from `@/lib/gauges/promote`. Leave `revalidatePath` exactly where it is, outside and after the try/catch; it now also refreshes the new card.

- [ ] **Step 6: Verify the action compiles and nothing regressed**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean and green. There is no server-action unit test in this repo (actions are proven in the browser walkthrough), so the evidence for this step is Task 13's walkthrough, not a test file.

- [ ] **Step 7: Commit**

```bash
git add src/app/actions/gauge-vote.ts src/lib/gauges/read.ts src/lib/gauges/__tests__/gauges.test.ts
git commit -m "Create the event on the third yes and close the gauge behind it"
```

---

## Task 11: Two cards on the home screen

**Files:**
- Create: `src/app/groups/[id]/EventCarousel.tsx`
- Modify: `src/app/groups/[id]/page.tsx`

**Interfaces:**
- Consumes: `findUpcomingEvents` (Task 8), the existing `EventCard` (unchanged), `deriveRoster`.
- Produces: `EventCarousel` taking `{ events: EventCardData[], groupId, timeZone, viewerHasSession }` where `EventCardData` is `EventCard`'s existing props bundled per event.

**STOP-AND-ASK GATE — read before writing any visual code.** The carousel is new visual surface. Per CLAUDE.md, visual code is built from the real design source (a Claude Design handoff with actual CSS and assets), never from a screenshot, and a describe-back happens before the code.

- [ ] **Step 1: Check what design source exists**

Run: `ls docs/design/ docs/design/walkthrough-screens/ && grep -rin "carousel\|peek\|dots" docs/build-notes.md | head -20`

Then **stop and report to the product owner**: describe in your own words what the source shows for a multi-card home, and say explicitly whether a Claude Design handoff for the carousel chrome exists. If it does not, say so and ask whether to (a) wait for a handoff, or (b) ship a minimal, honest interim treatment. **Do not improvise carousel chrome silently.** Build-notes §11 already records the peek-and-dots intent from the group-home slice; that is intent, not a source.

If the answer is (b), the interim treatment below is the agreed minimum: a horizontal scroll-snap row of full-width cards with a small peek of the next one and a dot per card. No new colors, no animation, no new tokens.

- [ ] **Step 2: Write `EventCarousel.tsx` (only after Step 1 is answered)**

```tsx
// src/app/groups/[id]/EventCarousel.tsx
//
// The pinned card region when a group has more than one upcoming event, which
// is exactly the condition the group-home slice deferred this for: a sparked
// event sitting beside the standing one.
//
// One card renders bare, with no carousel chrome at all: dots under a single
// card would be furniture implying something that is not there.
//
// Scroll-snap rather than a JS carousel: the browser already does this well,
// it degrades to a plain scroll everywhere, and it keeps the region free of
// state that would fight the server-rendered card list.

import EventCard from "./EventCard"
import { RsvpStatus } from "@prisma/client"

export interface EventCardData {
  event: {
    id: string
    title: string
    startsAt: Date
    endsAt: Date | null
    venues: { displayLabel: string | null; name: string }[]
  }
  inCount: number
  outCount: number
  pendingCount: number
  viewerStatus: RsvpStatus | null
}

interface Props {
  events: EventCardData[]
  groupId: string
  timeZone: string
  viewerHasSession: boolean
}

export default function EventCarousel({ events, groupId, timeZone, viewerHasSession }: Props) {
  const single = events.length === 1

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: "0.625rem",
          overflowX: single ? "visible" : "auto",
          scrollSnapType: "x mandatory",
          // The card region grows with its content; never a fixed height.
          scrollbarWidth: "none",
        }}
      >
        {events.map((data) => (
          <div
            key={data.event.id}
            style={{
              // A peek of the next card is what tells people to swipe. One
              // card takes the full width, because there is nothing to peek at.
              flex: single ? "1 0 100%" : "0 0 92%",
              scrollSnapAlign: "start",
            }}
          >
            <EventCard
              event={data.event}
              groupId={groupId}
              timeZone={timeZone}
              inCount={data.inCount}
              outCount={data.outCount}
              pendingCount={data.pendingCount}
              viewerStatus={data.viewerStatus}
              viewerHasSession={viewerHasSession}
            />
          </div>
        ))}
      </div>

      {!single && (
        <div
          aria-hidden="true"
          style={{ display: "flex", justifyContent: "center", gap: "0.375rem", paddingTop: "0.5rem" }}
        >
          {events.map((data) => (
            <i
              key={data.event.id}
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                backgroundColor: "var(--text-placeholder)",
                opacity: 0.5,
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
```

The dots are decorative and marked `aria-hidden`: the cards themselves are the content, and a screen reader gets both cards in order regardless.

- [ ] **Step 3: Rewrite the page's event query**

In `src/app/groups/[id]/page.tsx`, replace the single-event block:

```tsx
  // Up to three upcoming cards. The carousel comes live here because a sparked
  // event beside the standing one is exactly the two-or-more condition the
  // group-home slice deferred it for. Three is a display cap, not a rule: a
  // fourth upcoming event is possible and simply waits its turn.
  const upcomingEvents = await findUpcomingEvents(group.id, new Date(), 3)

  const allMembers = group.memberships.map((m) => m.user)
  const cards: EventCardData[] = await Promise.all(
    upcomingEvents.map(async (event) => {
      const rsvps = await prisma.rsvp.findMany({ where: { eventId: event.id } })
      const { inMembers, outMembers, pendingMembers, viewerStatus } = deriveRoster(
        allMembers,
        rsvps,
        viewer?.id ?? null
      )
      return {
        event,
        inCount: inMembers.length,
        outCount: outMembers.length,
        pendingCount: pendingMembers.length,
        viewerStatus,
      }
    })
  )
```

Swap the import of `findSoonestUpcomingEvent` for `findUpcomingEvents` (from `@/lib/events/upcoming-list`), and import `EventCarousel` and its `EventCardData` type. Keep `findSoonestUpcomingEvent` itself in the codebase: `detect-spark.ts` still uses it to tell the model what is already on the calendar, which is correctly origin-blind.

- [ ] **Step 4: Render the carousel**

Replace the `{upcomingEvent ? <EventCard .../> : <empty state/>}` block with:

```tsx
        {cards.length > 0 ? (
          <EventCarousel
            events={cards}
            groupId={group.id}
            timeZone={group.timeZone}
            viewerHasSession={viewer !== null}
          />
        ) : (
          /* unchanged empty state */
        )}
```

- [ ] **Step 5: Verify in the browser, not by reading**

Start the dev server via the preview tool (never `npm run dev` in Bash), open a dev-test group that has both a standing event and a sparked one, and confirm: both cards present, soonest first, dots showing, the second card peeking, the chat feed still scrolling independently below, and the body text still at 17px. Take a screenshot.

Then resize to 375px and to enlarged text, and confirm nothing clips (the grow-with-content rule). A card that clips at large text is a defect in this task, not the polish pass.

- [ ] **Step 6: Compare against the design**

Put the rendered home next to `docs/design/walkthrough-screens/` screen 08. Record every difference as either a recorded deviation or a question for the product owner. **Do not claim "matches the design" without this comparison having happened.**

- [ ] **Step 7: Commit**

```bash
git add src/app/groups/[id]/EventCarousel.tsx src/app/groups/[id]/page.tsx
git commit -m "Carry a second card on the group home when a spark lands"
```

---

## Task 12: The browser walkthrough

**Files:** none (verification only)

This is the gate that caught what a read-through missed in part one (the unseeded initiator vote), so it is a task, not a formality. Run against dev-test with a real group created through the real wizard. Record what you saw, verbatim, including anything that did not work.

- [ ] **Step 1: Full suite, types, lint**

Run: `npx vitest run && npx tsc --noEmit && npx next lint`
Expected: all green and clean. Record the finishing test count against Task 0's baseline.

- [ ] **Step 2: Set up a group with a standing rhythm and a venue**

Through the real onboarding wizard, describe a group like: "we climb Sundays at 8am at Summit Gym, and we grab beers at Lucky Lab once in a while". Confirm the group is created with its first scheduled event on the card. Add two more members (seeded users are fine, as part one did).

- [ ] **Step 3: Scenario A — the full happy path**

Post "we should finally grab beers sometime". Confirm Orbit replies proposing a Friday, with the promise clause present ("If three of you are in, I'll set it up"), three chips, and no tally yet.

Vote IN as three different people. At the second yes, confirm the tally reads the countdown ("one more makes it happen"). At the third, confirm **all** of:
- Orbit posts the announcement naming the day and time ("beers is on for Fri at 7pm").
- A second card appears on the home screen, in date order beside the climb.
- The new card's venue reads Lucky Lab, inherited from the group's own rhythm.
- The card's counts show 3 In with no second tap from anyone.
- The gauge's chips are gone and its message reads as history.

- [ ] **Step 4: Scenario B — a stated time wins**

Post "beers Friday at 8pm" (as a member who did not vote above, in a fresh group or after the first gauge expires to avoid the duplicate-activity guard). Confirm the gauge counts the initiator immediately, and that on the third yes the event is at 8pm, not 7pm.

- [ ] **Step 5: Scenario C — a morning idea**

Post "we should do breakfast sometime". Confirm Orbit proposes a **Saturday**, and that the created event lands at 9am.

- [ ] **Step 6: Scenario D — the disclosure**

Post something genuinely ambiguous, e.g. "anyone up for pickleball at 8?". Confirm the gauge message carries the disclosure sentence ("You said 8, so I'm taking that as 8pm.") and that the created event is at 8pm. If the model resolves it confidently instead (no disclosure), that is a legitimate model judgment, not a bug: record what actually happened rather than forcing the scenario.

- [ ] **Step 7: Scenario E — the cron is not blocked**

With a sparked event upcoming, hit the cron route (`/api/cron/orbit`, with whatever auth the route expects) after the standing event has passed, and confirm the next standing occurrence is created anyway. This is the invisible regression the whole slice was most at risk of, so it gets its own scenario.

- [ ] **Step 8: Scenario F — the below-threshold path is unchanged**

Confirm a gauge sitting at one or two yeses creates nothing, and that an ordinary message ("sounds good") still produces no Orbit reply at all.

- [ ] **Step 9: Write down what you saw**

Draft the *Shown* paragraph for the build-notes entry now, while the screens are in front of you: actual copy Orbit produced, actual counts, and anything that could not be verified. "Could not verify X" is a complete and useful answer; a confident claim that turns out untrue costs more.

---

## Task 13: Records and handoff

**Files:**
- Modify: `docs/build-notes.md` (new §11 entry; update the §8 registers)
- Modify: `CLAUDE.md` ("Where the build is")

A slice is not done until its decision record is written. Write in product language, not engineering language.

- [ ] **Step 1: Add the §11 entry**

Append after the spark part one entry, titled `### Spark part two: three yeses make it real (24 July 2026)`. It must cover, each in a short paragraph:

- **What it is**: the third yes creates the event, seeds the yeses as RSVPs, and puts a second card on the home screen.
- **Where a sparked event's time comes from**: stated time wins; am/pm resolved from the activity; a true coin flip keeps the stated hour, lands pm, and is disclosed once; unstated falls to part-of-day defaults (Fri 7pm, Sat 9am). All four numbers are placeholders with override learning as the named successor.
- **The clause that was cut**: "just let me know and I'll change it" was in the product owner's own sketch and was removed, because Orbit cannot read a correction yet and an invitation that gets silently ignored teaches people Orbit does not listen. Same reasoning as part one withholding the promise. Names the change-request slice as its home.
- **Why same-instant events became legal**: the constraint was bookkeeping, not product; every way of keeping it (fail silently, nudge to 7:01, ask the group) is worse. Replaced by per-path keys.
- **The cron guard, found while verifying the constraint question**: the any-upcoming-event guard would have let a spark silently delay the standing rhythm. Record that it was found by checking the code rather than reasoning about it, because that is the second time this pattern has paid.
- **Design positions recorded so nobody later "fixes" them**: both no-answers seed OUT; the gauge closes at creation and the event card owns answers from then on; a threshold reached after the start time creates nothing; venue inheritance matches the activity word exactly; the time resolves at detection rather than at creation.
- **Verification**: baseline and finishing test counts, plus the *Looked at* and *Shown* paragraphs from Task 12.
- **Debt this slice opens**: the four undated defaults; a wrong time guess having no correction path (medium, now applies to two event sources); exact-word venue matching; and anything Task 12 surfaced.

- [ ] **Step 2: Update the §8 registers**

The multi-card carousel line in §8 (build-notes.md:129) says the chrome was deferred until there are two or more events. Mark it as landed with this slice, or, if Task 11's gate produced an interim treatment, record precisely that: what shipped, what a real design handoff would change, and that the difference is a known question rather than a defect.

- [ ] **Step 3: Rewrite "Where the build is" in CLAUDE.md**

Replace the whole section. It must now say: spark is complete end to end (Orbit listens, gauges, and creates); name the next slice as the one-bump resurface, with its open questions (when does an idea count as stalled, what does the bump say); and carry forward the standing items that are still true. Delete the two part-two open questions, both of which this slice answered, and delete the "nothing is created, at any vote count" line, which is now false. Keep it terse; this section churns every slice.

- [ ] **Step 4: Confirm no stale claim survives**

Run: `grep -rn "part two\|nothing is created\|@@unique(\[groupId, startsAt\])" CLAUDE.md docs/build-notes.md`
Expected: every remaining hit is either historical record (part one's entry, which stays as written) or correctly updated. A rule file that still promises the old behavior is worse than no rule file.

- [ ] **Step 5: Commit and open the PR**

```bash
git add docs/build-notes.md CLAUDE.md
git commit -m "Record the spark part two decisions and rewrite the build-state section"
git push -u origin spark-part-two
```

Then open a PR whose description is written in product language: what the group can now do that it could not before, what Orbit now promises and keeps, the two product decisions that shaped it (where the time comes from, why two events may share an instant), and the debt. **Open the PR and stop.** Do not merge; the product owner reviews and gives the merge signal.

---

## Self-Review

Checked against the spec, 24 July 2026.

**Spec coverage.** Every settled decision maps to a task: stated time wins (3, 4, 6) · am/pm from activity context (3) · coin flip keeps the hour, goes pm, discloses (4, 5) · part-of-day defaults including Saturday mornings (4) · same-instant events legal with per-path keys (1, 8) · cron guard narrowed (8) · creation at the third yes with RSVP seeding, venue inheritance, announcement, and the gauge closing (9, 10) · threshold-after-start creates nothing (9) · promise and countdown copy (5) · two-card home (11) · the spark.ts formatter split (2) · records (13). The three "not in this slice" items (one-bump, conflict-aware proposing, change requests) appear in no task, which is correct.

**Known gaps in this plan, called out rather than hidden.**
- **Task 11 cannot be fully specified in advance.** Its Step 1 is a genuine stop-and-ask gate, not a placeholder: whether a design handoff exists for the carousel chrome is a fact about the world this plan cannot resolve. The interim treatment is written out in full so that *if* the answer is "ship interim", the implementer is not improvising.
- **No server-action unit tests** for `gauge-vote` or `detect-spark`. That matches the repo (there are none today); the actions are proven by Task 12's walkthrough. Named so the absence reads as consistency, not oversight.
- **The `partOfDay` type import** in `spark-copy.ts` points back at `spark.ts`. It is `import type`, so it erases at compile time and cannot pull the Anthropic SDK into a bundle. If a later reader wants the dependency arrow gone entirely, move `PartOfDay` into `spark-copy.ts` and have `spark.ts` import it from there.

**Type consistency.** `chooseProposedDate` takes `partOfDay` second in every call site (Tasks 4, 6). `buildGaugeMessage` takes `disclosure` fifth in every call site (Tasks 5, 6). `promoteGaugeToEvent(gaugeId, now)` is positional in Tasks 9 and 10. `SPARK_THRESHOLD` is defined once in `spark-copy.ts` and re-exported by `threshold.ts`. `EventCardData` is defined in `EventCarousel.tsx` and imported by `page.tsx`.

**Scope.** One slice, thirteen tasks, one migration, one PR. No task touches code outside the spark, event-creation, and group-home paths.
