# Change Request Part One (Time) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A member can tell Orbit in chat to change an existing event's time; Orbit moves it (resetting RSVPs, announcing with the old time and a textual revert invitation), asks first with one-tap chips when only mostly sure, and honestly declines requests it cannot act on yet.

**Architecture:** The existing per-message spark detection call is widened into a three-way intent read (spark / change request / neither) behind the established claim-to-fact boundary in `src/lib/orbit/spark.ts`. A pure planner turns a normalized change claim into one of four outcomes; a new transactional move helper performs the first Event mutation in the product; a `ChangeProposal` model (shaped like `Gauge`) carries the ask-first path with asker-only chips.

**Tech Stack:** Next.js 16 (server actions, App Router), Prisma 7 (driver adapter, no auto-generate), Vitest 4 (unit + real-DB integration against the dev-test database), claude-haiku-4-5 via the shared `callExtractionModel`.

## Global Constraints

- Spec of record: `docs/superpowers/specs/2026-07-27-change-request-time-design.md`. Where this plan and the spec differ, the spec is the intent.
- The two-databases rule: integration tests and the browser walkthrough hit the dev-test Supabase project only (the checked-out `.env` already points there). Never point anything at production.
- Raw model output never drives behavior; everything goes through `normalizeIntent` in `src/lib/orbit/spark.ts` (CLAUDE.md claim-to-fact boundary).
- Orbit is never a User row: feed writes use `MessageAuthor.ORBIT` with `authorId: null`.
- All copy is composed deterministically (structured-extract-then-format). Orbit's copy: plain and warm, no em dashes, three-letter weekdays, group timezone always (`formatTime`/`formatWeekdayShort` from `src/lib/events/format.ts`, which require an explicit timeZone).
- Chips: neutral outlined pills, never lime, never teal-filled; chosen state marked with a checkmark prefix, never color alone (GaugeChips precedent).
- `revalidatePath` is always called outside and after try/catch in server actions (stated in three places in the repo; it throws internally).
- `Event.scheduledKey` is never written or cleared by this slice. A move relocates the occurrence; it does not free the slot.
- Commit messages follow the house style: a product-language summary line, reasoning in the body.
- Prisma 7 does not auto-run `prisma generate`; run it after any schema change.
- Test command: `npx vitest run <path>` (or `npm test` for the whole suite).

---

### Task 1: Schema — `Event.previousStartsAt`, `ChangeProposal`, and the scheduledKey intention

**Files:**
- Modify: `prisma/schema.prisma` (Event model ~lines 73-102, Message model ~lines 157-178, Group, User)
- Create: migration via `npx prisma migrate dev` (never hand-edit migration files; the repo hooks block direct edits to migrations)

**Interfaces:**
- Produces: `Event.previousStartsAt: DateTime?`; model `ChangeProposal` with fields `id, groupId, eventId, askerUserId, sourceMessageId (unique), orbitMessageId (unique), proposedStartsAt, priorStartsAt, answer: ProposalAnswer?, answeredAt: DateTime?, createdAt`; enum `ProposalAnswer { CONFIRMED DECLINED }`. Later tasks rely on these exact names.

- [ ] **Step 1: Add `previousStartsAt` to Event and extend the scheduledKey comment**

In the `Event` model, below `startsAt`/`endsAt`, add:

```prisma
  /// Where this event's start sat before its last move; null when it has never
  /// been moved. The data home for "put it back": the model never sees feed
  /// history, so a textual revert is unresolvable without it. Last move only,
  /// overwritten each time; the feed itself is the full history.
  previousStartsAt DateTime?
```

Append to the existing `scheduledKey` doc comment (do not change the existing lines):

```prisma
  /// A time change deliberately leaves this key alone: moving an occurrence
  /// relocates it, it does not free the slot. After a moved-earlier event
  /// passes, the cron's attempt to recreate the original slot collides with
  /// this key (P2002, caught as a skip) and that skip is correct behavior,
  /// pinned by a reconcile test. Rewriting or clearing the key on a move would
  /// make the cron recreate and announce the plan the group just moved from.
```

- [ ] **Step 2: Add the ChangeProposal model and enum**

Add after the `GaugeVote`/`GaugeAnswer` block:

```prisma
/// One round of Orbit asking "did you want the plan moved?". Created when a
/// message is probably but not clearly a time-change request: Orbit posts its
/// best concrete reading and the asker confirms or declines with one tap.
///
/// sourceMessageId unique is the whole idempotency story (the createGauge
/// precedent): a double-fired detection collides on P2002 and is caught as a
/// skip. orbitMessageId unique is where the chips attach in the feed.
///
/// priorStartsAt is the event's start as it stood when the question was asked,
/// and is the staleness baseline: chips render only while the event still
/// starts there, and the confirm re-checks it inside the move transaction, so
/// a confirm can never move the event from a time the asker was never shown.
model ChangeProposal {
  id               String          @id @default(cuid())
  groupId          String
  eventId          String
  askerUserId      String
  sourceMessageId  String          @unique
  orbitMessageId   String          @unique
  proposedStartsAt DateTime
  priorStartsAt    DateTime
  answer           ProposalAnswer?
  answeredAt       DateTime?
  createdAt        DateTime        @default(now())

  group         Group   @relation(fields: [groupId], references: [id], onDelete: Cascade)
  event         Event   @relation(fields: [eventId], references: [id], onDelete: Cascade)
  asker         User    @relation(fields: [askerUserId], references: [id], onDelete: Cascade)
  sourceMessage Message @relation("ProposalSource", fields: [sourceMessageId], references: [id], onDelete: Cascade)
  orbitMessage  Message @relation("ProposalOrbit", fields: [orbitMessageId], references: [id], onDelete: Cascade)

  @@index([groupId])
  @@index([eventId])
}

enum ProposalAnswer {
  CONFIRMED
  DECLINED
}
```

Add the back-relations: on `Message`, `proposalAsSource ChangeProposal? @relation("ProposalSource")` and `proposalAsOrbit ChangeProposal? @relation("ProposalOrbit")` (beside the existing `gaugeAsSource`/`gaugeAsOrbit`); on `Event`, `changeProposals ChangeProposal[]`; on `User`, `changeProposals ChangeProposal[]`; on `Group`, `changeProposals ChangeProposal[]`.

- [ ] **Step 3: Migrate and generate**

Run: `npx prisma migrate dev --name change_request_time`
Expected: new migration under `prisma/migrations/*_change_request_time/` applied to the dev-test database, no drift warnings.
Run: `npx prisma generate`
Expected: client regenerated; `npx tsc --noEmit` (or `npm test`) still clean.

- [ ] **Step 4: Commit**

```bash
git add prisma/
git commit -m "Schema: an event remembers its last start, and Orbit can hold a change question"
```

---

### Task 2: Pin the relocate-not-free cron semantics with a reconcile test

**Files:**
- Modify: `src/lib/orbit/__tests__/reconcile.test.ts` (append one describe block)
- Modify: `src/lib/orbit/reconcile.ts` (comment only, beside the P2002 catch ~line 118)

**Interfaces:**
- Consumes: `reconcileScheduledEvents(now, { groupId })` returning `{ groupId, status: "created", eventId } | { groupId, status: "skipped", reason: "no_rhythm" | "upcoming_exists" | "duplicate" }`; the file's existing `createTestUserAndGroup(SUNDAY_RHYTHM)` helper, `NOW = 2099-06-14T06:00:00Z`, `EXPECTED_STARTS_AT = 2099-06-14T08:00:00Z`, and its `eventIds`/`messageIds` cleanup arrays.
- Produces: nothing for later tasks; this is the behavioral pin the spec requires.

- [ ] **Step 1: Write the failing-in-spirit pin test**

This pins existing behavior, so it passes immediately; it exists so a future refactor that "fixes" the P2002 skip fails loudly. To prove the test can fail, temporarily assert `reason: "created"` in step 2, watch it fail, then restore. Append:

```ts
describe("a moved occurrence relocates its slot rather than freeing it", () => {
  it("skips recreating the original slot after a moved-earlier event has passed, then heals the following week", async () => {
    const { group } = await createTestUserAndGroup(SUNDAY_RHYTHM)

    // Cron creates Sunday 08:00 with its scheduledKey.
    const first = await reconcileScheduledEvents(NOW, { groupId: group.id })
    expect(first[0].status).toBe("created")
    const event = await prisma.event.findFirst({ where: { groupId: group.id } })
    if (!event) throw new Error("expected the scheduled event")
    eventIds.push(event.id)

    // The group moves it a day earlier (Saturday 08:00). Key untouched: a
    // move relocates the occurrence, it does not free the slot.
    const movedTo = new Date(EXPECTED_STARTS_AT.getTime() - 24 * 60 * 60 * 1000)
    await prisma.event.update({
      where: { id: event.id },
      data: { startsAt: movedTo, previousStartsAt: event.startsAt },
    })

    // Saturday has passed, Sunday 08:00 has not. The cron computes the next
    // occurrence (Sunday 08:00), collides with the stale key, and skips.
    // That skip is the product behavior: this occurrence already happened,
    // on its moved time.
    const betweenNow = new Date(movedTo.getTime() + 2 * 60 * 60 * 1000)
    const second = await reconcileScheduledEvents(betweenNow, { groupId: group.id })
    expect(second[0]).toEqual({ groupId: group.id, status: "skipped", reason: "duplicate" })

    // The following week heals itself: a fresh slot, a fresh key.
    const afterSunday = new Date(EXPECTED_STARTS_AT.getTime() + 60 * 60 * 1000)
    const third = await reconcileScheduledEvents(afterSunday, { groupId: group.id })
    expect(third[0].status).toBe("created")
    const events = await prisma.event.findMany({ where: { groupId: group.id } })
    for (const e of events) if (!eventIds.includes(e.id)) eventIds.push(e.id)
    const messages = await prisma.message.findMany({ where: { groupId: group.id } })
    for (const m of messages) if (!messageIds.includes(m.id)) messageIds.push(m.id)
    expect(events).toHaveLength(2)
    const nextWeek = new Date(EXPECTED_STARTS_AT.getTime() + 7 * 24 * 60 * 60 * 1000)
    expect(events.map((e) => e.startsAt.getTime()).sort()).toEqual(
      [movedTo.getTime(), nextWeek.getTime()].sort()
    )
  })
})
```

Every `reconcileScheduledEvents` call MUST stay scoped with `{ groupId }` (the file header explains the permanent leak an unscoped call causes on the shared dev-test DB).

- [ ] **Step 2: Prove it can fail, then run green**

Temporarily change `reason: "duplicate"` to `reason: "created"`, run `npx vitest run src/lib/orbit/__tests__/reconcile.test.ts`, confirm FAIL on that assertion, restore, re-run.
Expected: PASS, all pre-existing tests in the file untouched and green.

- [ ] **Step 3: State the intention beside the P2002 catch in reconcile.ts**

Above the existing `if ((err as { code?: string }).code === "P2002")` in `reconcile.ts`, extend the comment:

```ts
      // Step g: Prisma unique-constraint violation (the unique scheduledKey).
      // Also the deliberate landing spot for a moved occurrence: a time change
      // leaves the key alone, so after a moved-earlier event passes, the
      // attempt to recreate its original slot lands here and skips. Relocate,
      // not free (see the scheduledKey schema comment and the reconcile test
      // pinning this).
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/orbit/__tests__/reconcile.test.ts src/lib/orbit/reconcile.ts
git commit -m "Pin it down: a moved occurrence keeps its slot, the cron does not refill it"
```

---

### Task 3: The change-request copy and time arithmetic (`change-copy.ts`)

**Files:**
- Create: `src/lib/orbit/change-copy.ts`
- Modify: `src/lib/orbit/spark-copy.ts` (export two currently-private things)
- Test: `src/lib/orbit/__tests__/change-copy.test.ts`

**Interfaces:**
- Consumes: `formatTime/formatWeekdayShort/formatMonthDay` from `@/lib/events/format`; `getLocalParts/zonedWallTimeToUtc` from `./occurrence`; `formatTimeLocalLabel`, and (newly exported) `startOfLocalDay`, `THIS_WEEK_DAYS` from `./spark-copy`.
- Produces (later tasks import these exact names from `@/lib/orbit/change-copy`):
  - `resolveChangeTime({ requestedTime: string; requestedTimeAmbiguous: boolean; eventStartsAt: Date; timeZone: string }): { timeLocal: string; disclosure: string | null }`
  - `changeStartInstant(eventStartsAt: Date, timeLocal: string, timeZone: string): Date`
  - `buildChangeAnnouncement(label: string, newStartsAt: Date, previousStartsAt: Date, timeZone: string, now: Date, disclosure: string | null): string`
  - `buildChangeQuestion(label: string, proposedStartsAt: Date, timeZone: string, now: Date): string`
  - `buildCantDoReply(fields: ChangeField[], eventStartsAt: Date, timeZone: string): string`
  - `PAST_TIME_REPLY: string`, `STALE_PROPOSAL_ERROR: string`
  - `changeChipLabels(): { confirm: string; decline: string }`

- [ ] **Step 1: Export the two shared helpers from spark-copy.ts**

In `src/lib/orbit/spark-copy.ts`, change `const THIS_WEEK_DAYS = 7` to `export const THIS_WEEK_DAYS = 7` and `function startOfLocalDay(` to `export function startOfLocalDay(` (it sits at the bottom of the file). No behavior change; run `npx vitest run src/lib/orbit/__tests__/spark-copy.test.ts` and expect PASS.

- [ ] **Step 2: Write the failing tests**

Create `src/lib/orbit/__tests__/change-copy.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import {
  buildCantDoReply,
  buildChangeAnnouncement,
  buildChangeQuestion,
  changeChipLabels,
  changeStartInstant,
  PAST_TIME_REPLY,
  resolveChangeTime,
} from "../change-copy"

// Fixtures in UTC so wall time and instant read the same in assertions.
const ZONE = "UTC"
const MORNING_EVENT = new Date("2099-06-14T08:00:00Z") // Sun 8am
const EVENING_EVENT = new Date("2099-06-12T19:00:00Z") // Fri 7pm
const NOW = new Date("2099-06-10T12:00:00Z") // Wed before both

describe("resolveChangeTime", () => {
  it("keeps an unambiguous time untouched, no disclosure", () => {
    expect(
      resolveChangeTime({
        requestedTime: "18:00",
        requestedTimeAmbiguous: false,
        eventStartsAt: MORNING_EVENT,
        timeZone: ZONE,
      })
    ).toEqual({ timeLocal: "18:00", disclosure: null })
  })

  it("reads a bare 9 on a morning plan as 9am, disclosed", () => {
    const r = resolveChangeTime({
      requestedTime: "21:00", // the model's best reading; ambiguous
      requestedTimeAmbiguous: true,
      eventStartsAt: MORNING_EVENT,
      timeZone: ZONE,
    })
    expect(r.timeLocal).toBe("09:00")
    expect(r.disclosure).toBe(
      "You said 9, and since this plan was in the morning I took that as 9am."
    )
  })

  it("reads a bare 9 on an evening plan as 9pm, disclosed", () => {
    const r = resolveChangeTime({
      requestedTime: "09:00",
      requestedTimeAmbiguous: true,
      eventStartsAt: EVENING_EVENT,
      timeZone: ZONE,
    })
    expect(r.timeLocal).toBe("21:00")
    expect(r.disclosure).toBe(
      "You said 9, and since this plan was in the evening I took that as 9pm."
    )
  })

  it("keeps minutes through inheritance", () => {
    const r = resolveChangeTime({
      requestedTime: "21:30",
      requestedTimeAmbiguous: true,
      eventStartsAt: MORNING_EVENT,
      timeZone: ZONE,
    })
    expect(r.timeLocal).toBe("09:30")
  })

  it("leaves twelve o'clock to the model's best reading, undisclosed", () => {
    expect(
      resolveChangeTime({
        requestedTime: "12:00",
        requestedTimeAmbiguous: true,
        eventStartsAt: EVENING_EVENT,
        timeZone: ZONE,
      })
    ).toEqual({ timeLocal: "12:00", disclosure: null })
  })
})

describe("changeStartInstant", () => {
  it("keeps the event's local day and swaps the wall time", () => {
    expect(changeStartInstant(MORNING_EVENT, "18:00", ZONE).toISOString()).toBe(
      "2099-06-14T18:00:00.000Z"
    )
  })
  it("respects the group zone", () => {
    // 8am UTC on Jun 14 is Jun 14 in LA too (1am); 18:00 LA wall = 01:00 UTC Jun 15.
    expect(
      changeStartInstant(MORNING_EVENT, "18:00", "America/Los_Angeles").toISOString()
    ).toBe("2099-06-15T01:00:00.000Z")
  })
})

describe("copy composers", () => {
  it("announcement names both times, the reset, and the revert invitation", () => {
    const body = buildChangeAnnouncement(
      "climbing",
      new Date("2099-06-14T18:00:00Z"),
      MORNING_EVENT,
      ZONE,
      NOW,
      null
    )
    expect(body).toBe(
      "Done. Climbing this Sun is moving to 6pm, it was 8am. Since the time changed, I cleared everyone's RSVPs, so answer again up top. Want it back at 8am? Say the word."
    )
  })

  it("announcement carries the disclosure when one was needed", () => {
    const body = buildChangeAnnouncement(
      "climbing",
      new Date("2099-06-14T09:00:00Z"),
      MORNING_EVENT,
      ZONE,
      NOW,
      "You said 9, and since this plan was in the morning I took that as 9am."
    )
    expect(body).toContain("it was 8am. You said 9, and since this plan was in the morning I took that as 9am. Since the time changed")
  })

  it("switches to a dated phrase beyond a week, like the gauge copy", () => {
    const farOut = new Date("2099-06-21T18:00:00Z") // 11 days from NOW
    const body = buildChangeAnnouncement("climbing", farOut, MORNING_EVENT, ZONE, NOW, null)
    expect(body).toContain("on Sun, Jun 21")
  })

  it("question proposes the concrete reading and asks", () => {
    expect(buildChangeQuestion("climbing", new Date("2099-06-14T09:00:00Z"), ZONE, NOW)).toBe(
      "Sounds like you want climbing this Sun moved to 9am. Want me to make the change?"
    )
  })

  it("declines by field: day wins over venue, venue over other", () => {
    expect(buildCantDoReply(["day", "time"], MORNING_EVENT, ZONE)).toBe(
      "I can't move it to another day yet. I can change the time on Sun if that helps."
    )
    expect(buildCantDoReply(["venue"], MORNING_EVENT, ZONE)).toBe(
      "I can't change the spot yet, that's coming. I can move the time if that helps."
    )
    expect(buildCantDoReply(["other"], MORNING_EVENT, ZONE)).toBe(
      "I can't change that part of the plan yet. Moving the time is what I can do."
    )
  })

  it("fixed strings and chip labels", () => {
    expect(PAST_TIME_REPLY).toBe("That time has already passed, so I'm leaving the plan alone.")
    expect(changeChipLabels()).toEqual({ confirm: "Yes, move it", decline: "Leave it" })
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/lib/orbit/__tests__/change-copy.test.ts`
Expected: FAIL, cannot resolve `../change-copy`.

- [ ] **Step 4: Implement `src/lib/orbit/change-copy.ts`**

```ts
// src/lib/orbit/change-copy.ts
//
// Every pure decision and every string the change-request flow produces: how a
// requested time is read against the plan it would change, and all of Orbit's
// copy for moves, questions, and honest declines.
//
// SDK-free, like spark-copy.ts and for the same reason: client components pull
// chip labels from here, and the Anthropic SDK must never reach the browser
// bundle.
//
// Structured-extract-then-format: the model supplies fields, code composes
// every string. Nothing in this file is generated prose.

import { formatMonthDay, formatTime, formatWeekdayShort } from "@/lib/events/format"
import { getLocalParts, zonedWallTimeToUtc } from "./occurrence"
import { formatTimeLocalLabel, startOfLocalDay, THIS_WEEK_DAYS } from "./spark-copy"
// Type-only, so it erases at compile time and cannot pull the model SDK in.
import type { ChangeField } from "./spark"

export interface ResolvedChangeTime {
  timeLocal: string
  /** Orbit owning up to reading a bare hour off the plan's part of day, or null. */
  disclosure: string | null
}

/**
 * How a requested time is read against the plan it would change.
 *
 * An explicit or settled time wins outright. A bare clock number ("can we do 9
 * instead?") inherits the event's current part of day: 9 on an 8am plan is
 * 9am, on a 7pm plan it is 9pm, disclosed once. No coin flip here: the
 * existing time is the signal the spark path never had, and flipping against a
 * plan's obvious meaning would read as Orbit being dense.
 *
 * Twelve o'clock is exempt from inheritance (noon and midnight do not map onto
 * "the same half of the day as the plan" in any way a person would recognize)
 * and keeps the model's best reading, undisclosed.
 */
export function resolveChangeTime({
  requestedTime,
  requestedTimeAmbiguous,
  eventStartsAt,
  timeZone,
}: {
  requestedTime: string
  requestedTimeAmbiguous: boolean
  eventStartsAt: Date
  timeZone: string
}): ResolvedChangeTime {
  if (!requestedTimeAmbiguous) return { timeLocal: requestedTime, disclosure: null }

  const [h, m] = requestedTime.split(":").map(Number)
  const h12 = h % 12
  if (h12 === 0) return { timeLocal: requestedTime, disclosure: null }

  const morning = getLocalParts(eventStartsAt, timeZone).hour < 12
  const hour = morning ? h12 : h12 + 12
  const mm = String(m).padStart(2, "0")
  const timeLocal = `${String(hour).padStart(2, "0")}:${mm}`

  const spoken = m === 0 ? `${h12}` : `${h12}:${mm}`
  return {
    timeLocal,
    disclosure: `You said ${spoken}, and since this plan was in the ${morning ? "morning" : "evening"} I took that as ${formatTimeLocalLabel(timeLocal)}.`,
  }
}

/**
 * The instant the plan's current local day starts at wall time `timeLocal`.
 * The day never moves in this slice; only the clock does.
 */
export function changeStartInstant(
  eventStartsAt: Date,
  timeLocal: string,
  timeZone: string
): Date {
  const day = getLocalParts(eventStartsAt, timeZone)
  const [hour, minute] = timeLocal.split(":").map(Number)
  return zonedWallTimeToUtc(day.year, day.month, day.day, hour, minute, timeZone)
}

/** "this Sun" inside a week, "on Sun, Jun 21" beyond it, mirroring the gauge copy. */
function whenPhrase(startsAt: Date, timeZone: string, now: Date): string {
  const daysAway = Math.round(
    (startsAt.getTime() - startOfLocalDay(now, timeZone).getTime()) / 86_400_000
  )
  const weekday = formatWeekdayShort(startsAt, timeZone)
  return daysAway >= THIS_WEEK_DAYS
    ? `on ${weekday}, ${formatMonthDay(startsAt, timeZone)}`
    : `this ${weekday}`
}

/**
 * What Orbit says the moment a plan's time moves. Names both times so the feed
 * carries its own history (the original announcement is never edited), owns the
 * RSVP reset out loud, and ends with the recorded revert phrasing: the revert
 * is textual, handled by the same detection as any other change request.
 */
export function buildChangeAnnouncement(
  label: string,
  newStartsAt: Date,
  previousStartsAt: Date,
  timeZone: string,
  now: Date,
  disclosure: string | null
): string {
  const lead = label.charAt(0).toUpperCase() + label.slice(1)
  const oldTime = formatTime(previousStartsAt, timeZone)
  const disclosureClause = disclosure ? ` ${disclosure}` : ""
  return `Done. ${lead} ${whenPhrase(newStartsAt, timeZone, now)} is moving to ${formatTime(newStartsAt, timeZone)}, it was ${oldTime}.${disclosureClause} Since the time changed, I cleared everyone's RSVPs, so answer again up top. Want it back at ${oldTime}? Say the word.`
}

/**
 * The ask-first question: Orbit's single best concrete reading, not an open
 * question. Concrete-first applies to the asking too. The proposed time is
 * named outright, so a confirm needs no re-disclosure.
 */
export function buildChangeQuestion(
  label: string,
  proposedStartsAt: Date,
  timeZone: string,
  now: Date
): string {
  return `Sounds like you want ${label} ${whenPhrase(proposedStartsAt, timeZone, now)} moved to ${formatTime(proposedStartsAt, timeZone)}. Want me to make the change?`
}

/**
 * The honest decline for a clearly understood request this slice cannot act
 * on. Day outranks venue (a day request often names a time too, and acting on
 * half a request is the misread this slice exists to prevent).
 *
 * DEBT (recorded in the spec): each of these hardcodes what Orbit cannot do.
 * The slice that ships venue or day changes must retire its line here as part
 * of its definition of done, or Orbit starts lying.
 */
export function buildCantDoReply(
  fields: ChangeField[],
  eventStartsAt: Date,
  timeZone: string
): string {
  if (fields.includes("day")) {
    return `I can't move it to another day yet. I can change the time on ${formatWeekdayShort(eventStartsAt, timeZone)} if that helps.`
  }
  if (fields.includes("venue")) {
    return `I can't change the spot yet, that's coming. I can move the time if that helps.`
  }
  return `I can't change that part of the plan yet. Moving the time is what I can do.`
}

/** The same principle as promote's start_passed skip: no plans about the past. */
export const PAST_TIME_REPLY = "That time has already passed, so I'm leaving the plan alone."

/** Client-side error under the chips, never a feed message (gauge-vote precedent). */
export const STALE_PROPOSAL_ERROR = "The plan already changed, take a look up top."

export interface ChangeChipLabels {
  confirm: string
  decline: string
}

/** Soft decline per the copy rules: "Leave it", never a bare "No". */
export function changeChipLabels(): ChangeChipLabels {
  return { confirm: "Yes, move it", decline: "Leave it" }
}
```

Note: `ChangeField` does not exist yet; Task 4 defines it in `spark.ts`. To keep this task self-contained and green, define it here temporarily as `export type ChangeField = "time" | "day" | "venue" | "other"` WITHOUT the import, and Task 4 will move the canonical definition to `spark.ts` and flip this file to the type-only import shown above.

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/lib/orbit/__tests__/change-copy.test.ts src/lib/orbit/__tests__/spark-copy.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/orbit/change-copy.ts src/lib/orbit/spark-copy.ts src/lib/orbit/__tests__/change-copy.test.ts
git commit -m "Orbit's change-request voice, and the bare-hour rule that reads 9 off the plan it changes"
```

---

### Task 4: Three-way intent detection (`spark.ts` widened)

**Files:**
- Modify: `src/lib/orbit/spark.ts`
- Modify: `src/lib/orbit/change-copy.ts` (flip `ChangeField` to the type-only import per Task 3's note)
- Test: `src/lib/orbit/__tests__/spark.test.ts` (append a describe block; existing `normalizeSpark` tests stay untouched and green)

**Interfaces:**
- Consumes: existing `normalizeSpark`, `NormalizedSpark`, `callExtractionModel`, `TIME_LOCAL_RE`, `cleanShortText`.
- Produces (exact names later tasks import from `@/lib/orbit/spark`):
  - `type ChangeField = "time" | "day" | "venue" | "other"`
  - `interface NormalizedChange { targetEventIndex: number | null; requestedTime: string | null; requestedTimeAmbiguous: boolean; requestedFields: ChangeField[]; intentClear: boolean }`
  - `type NormalizedIntent = { kind: "none" } | { kind: "spark"; spark: Extract<NormalizedSpark, { spark: true }> } | { kind: "change"; change: NormalizedChange }`
  - `normalizeIntent(raw: unknown, upcomingCount: number): NormalizedIntent`
  - `detectIntentClaim(body: string, context: { upcomingLines: string[] }): Promise<unknown>`
  - `INTENT_SCHEMA` (exported like `SPARK_SCHEMA` is today)

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/orbit/__tests__/spark.test.ts` (add `normalizeIntent` to the existing `../spark` import at the top of the file, not mid-file):

```ts
describe("normalizeIntent", () => {
  const changeClaim = {
    isSpark: false,
    activity: null,
    statedDayOfWeek: null,
    statedTime: null,
    timeAmbiguous: false,
    partOfDay: null,
    isChangeRequest: true,
    targetEventNumber: 1,
    requestedTime: "21:00",
    requestedTimeAmbiguous: true,
    requestedFields: ["time"],
    intentClear: true,
  }

  it("passes a valid change claim through", () => {
    const r = normalizeIntent(changeClaim, 2)
    expect(r).toEqual({
      kind: "change",
      change: {
        targetEventIndex: 0,
        requestedTime: "21:00",
        requestedTimeAmbiguous: true,
        requestedFields: ["time"],
        intentClear: true,
      },
    })
  })

  it("delegates a spark claim to normalizeSpark", () => {
    const r = normalizeIntent(
      { ...changeClaim, isSpark: true, isChangeRequest: false, activity: "beers" },
      1
    )
    expect(r.kind).toBe("spark")
    if (r.kind === "spark") expect(r.spark.activity).toBe("beers")
  })

  it("treats a claim of both spark and change as none", () => {
    expect(normalizeIntent({ ...changeClaim, isSpark: true, activity: "beers" }, 1)).toEqual({
      kind: "none",
    })
  })

  it("bounds-checks the target: out of range degrades to null, not to a wrong event", () => {
    const r = normalizeIntent({ ...changeClaim, targetEventNumber: 3 }, 2)
    if (r.kind !== "change") throw new Error("expected change")
    expect(r.change.targetEventIndex).toBe(null)
  })

  it("rejects a malformed time and a lone ambiguity flag", () => {
    const r = normalizeIntent(
      { ...changeClaim, requestedTime: "9pm", requestedTimeAmbiguous: true },
      1
    )
    if (r.kind !== "change") throw new Error("expected change")
    expect(r.change.requestedTime).toBe(null)
    expect(r.change.requestedTimeAmbiguous).toBe(false)
  })

  it("drops unknown fields and dedupes; an empty field list is not a change request", () => {
    const r = normalizeIntent(
      { ...changeClaim, requestedFields: ["time", "time", "weather"] },
      1
    )
    if (r.kind !== "change") throw new Error("expected change")
    expect(r.change.requestedFields).toEqual(["time"])
    expect(normalizeIntent({ ...changeClaim, requestedFields: [] }, 1)).toEqual({ kind: "none" })
    expect(normalizeIntent({ ...changeClaim, requestedFields: "time" }, 1)).toEqual({ kind: "none" })
  })

  it("anything but explicit true intentClear is unclear", () => {
    const r = normalizeIntent({ ...changeClaim, intentClear: "yes" }, 1)
    if (r.kind !== "change") throw new Error("expected change")
    expect(r.change.intentClear).toBe(false)
  })

  it("non-objects and plain chatter are none", () => {
    expect(normalizeIntent(null, 1)).toEqual({ kind: "none" })
    expect(normalizeIntent([], 1)).toEqual({ kind: "none" })
    expect(normalizeIntent({ ...changeClaim, isChangeRequest: false }, 1)).toEqual({ kind: "none" })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/orbit/__tests__/spark.test.ts`
Expected: FAIL, `normalizeIntent` is not exported.

- [ ] **Step 3: Implement in `spark.ts`**

Add below the existing spark code (keep `SPARK_SCHEMA`, `detectSparkClaim`, `normalizeSpark` exactly as they are for now; Task 8 retires the spark-only claim path once nothing calls it):

```ts
// ── Three-way intent (change-request slice) ─────────────────────────────────
// One read per message, extending the spark call rather than adding a second:
// the spark prompt already taught the model what a change request looks like,
// purely to say "not a spark". Here that negative class becomes a positive one.

export type ChangeField = "time" | "day" | "venue" | "other"

export const INTENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "isSpark", "activity", "statedDayOfWeek", "statedTime", "timeAmbiguous", "partOfDay",
    "isChangeRequest", "targetEventNumber", "requestedTime", "requestedTimeAmbiguous",
    "requestedFields", "intentClear",
  ],
  properties: {
    isSpark: { type: "boolean" },
    activity: { type: ["string", "null"] },
    statedDayOfWeek: { type: ["integer", "null"] },
    statedTime: { type: ["string", "null"] },
    timeAmbiguous: { type: "boolean" },
    partOfDay: {
      anyOf: [{ type: "string", enum: ["morning", "evening"] }, { type: "null" }],
    },
    isChangeRequest: { type: "boolean" },
    targetEventNumber: { type: ["integer", "null"] },
    requestedTime: { type: ["string", "null"] },
    requestedTimeAmbiguous: { type: "boolean" },
    requestedFields: {
      type: "array",
      items: { type: "string", enum: ["time", "day", "venue", "other"] },
    },
    intentClear: { type: "boolean" },
  },
} as const

const INTENT_SYSTEM_PROMPT = `You read one message from a group chat and classify it. At most one of these is true:
- SPARK: the message floats a fresh idea for the group to do something together, like "we should finally grab beers" or "anyone want to climb Saturday?".
- CHANGE REQUEST: the message asks for a plan already on the group's calendar to be changed, like "can we do 9 instead?", "let's move it to 6pm", or "put it back at 8".
- Neither: everything else.

Be conservative in both directions. These are NOT sparks and NOT change requests:
- agreement or reactions ("sounds good", "nice", "haha", "same")
- questions about an existing plan ("what time again?", "where is it?")
- logistics and availability ("running late", "I can't make 8", "see you there")
- wishes and commentary that do not ask for anything ("9 would've been better")
- small talk, links, and anything with no activity or plan in it

If you are not sure, answer isSpark false and isChangeRequest false. Missing something real costs nothing; interjecting on ordinary chat is worse. A message cannot be both: if it somehow reads as both, set only the one it mostly is.

Spark fields (null, false, or empty when isSpark is false):
- activity: one or two words in the member's own words naming the activity ("beers", "climbing", "board games"). Drop filler and location words: "grab a beer at Tony's" is just "beers". Never invent an activity.
- statedDayOfWeek: 0 for Sunday through 6 for Saturday, and ONLY when the message names exactly one specific weekday. "beers Friday" is 5. "beers Friday or Saturday" names two, so it is null. "beers tomorrow" and "beers this weekend" do not name a weekday, so they are null. Null whenever you are not certain a single weekday was named.
- statedTime: 24-hour "HH:MM" only if the message stated a time. Use the activity to read it: "beers at 8" is "20:00", "breakfast at 8" is "08:00". Null when no time was stated.
- timeAmbiguous: true only when a clock number was given with no am or pm AND the activity does not settle it. "beers at 8" is not ambiguous, because beers do not happen at 8 in the morning. "breakfast at 8" is not ambiguous. "meet at 8" for something that happens at both ends of the day IS ambiguous: set statedTime to your best reading and timeAmbiguous to true. When statedTime is null, timeAmbiguous is false.
- partOfDay: "morning" for activities that happen in the morning (breakfast, coffee, a sunrise hike), "evening" for activities that happen at night (beers, dinner, drinks, a movie). Null when the activity could genuinely be either, or when you are unsure. This is about the activity itself, not about any time that was stated.

Change-request fields (null, false, or empty when isChangeRequest is false):
- targetEventNumber: the number of the calendar plan the message is about, from the numbered list you were given. Null when you cannot tell which one, or when nothing is on the calendar.
- requestedTime: 24-hour "HH:MM" best reading of the time they want the plan moved to. Null when they did not ask for a specific clock time.
- requestedTimeAmbiguous: true only when a clock number was given with no am or pm and nothing in the message settles it. "Can we do 9 instead?" IS ambiguous: put your best reading in requestedTime and set this true. "Make it 9pm" is not ambiguous.
- requestedFields: every part of the plan the message asks to change: "time" (a different clock time), "day" (a different calendar day, including "tomorrow" or a named weekday), "venue" (a different place), "other" (anything else). Asking to move a plan to a different day is "day", even when a time is named alongside it.
- intentClear: true when the message plainly asks for the change ("can we do 9 instead?", "let's make it 6pm", "put it back at 8"). False when you believe they want a change but the message is indirect, or you are unsure which plan or what exactly they want.`

export interface IntentContext {
  /** One line per upcoming plan, numbered from 1, in the order the group sees them. */
  upcomingLines: string[]
}

export interface NormalizedChange {
  /** Index into the upcoming-events list the model was shown, bounds-checked here. */
  targetEventIndex: number | null
  /** Validated "HH:mm", or null when no concrete time was requested. */
  requestedTime: string | null
  /** A clock number with no am/pm that nothing in the message settles. */
  requestedTimeAmbiguous: boolean
  requestedFields: ChangeField[]
  /** True only for a plain, direct ask. Anything less routes to the ask path. */
  intentClear: boolean
}

export type NormalizedIntent =
  | { kind: "none" }
  | { kind: "spark"; spark: Extract<NormalizedSpark, { spark: true }> }
  | { kind: "change"; change: NormalizedChange }

/**
 * One structured-outputs call. Returns raw model output: a claim, not a fact.
 * Callers must pass it through normalizeIntent before acting on it.
 */
export async function detectIntentClaim(
  body: string,
  context: IntentContext
): Promise<unknown> {
  const calendarBlock = context.upcomingLines.length
    ? `On this group's calendar right now:\n${context.upcomingLines.join("\n")}`
    : `This group has nothing on its calendar right now.`

  const user = `${calendarBlock}

The message:
${body}`

  return callExtractionModel(INTENT_SYSTEM_PROMPT, user, INTENT_SCHEMA)
}

const CHANGE_FIELDS: readonly string[] = ["time", "day", "venue", "other"]

/**
 * The claim-to-fact boundary for the three-way read. Same doctrine as
 * normalizeSpark: degrade, never throw, and degrade toward silence. A claim of
 * both intents at once is incoherent and acted on as neither.
 */
export function normalizeIntent(raw: unknown, upcomingCount: number): NormalizedIntent {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return { kind: "none" }
  const o = raw as Record<string, unknown>

  if (o.isSpark === true && o.isChangeRequest === true) return { kind: "none" }

  if (o.isSpark === true) {
    const spark = normalizeSpark(raw)
    return spark.spark ? { kind: "spark", spark } : { kind: "none" }
  }

  if (o.isChangeRequest !== true) return { kind: "none" }

  const requestedFields = Array.isArray(o.requestedFields)
    ? ([...new Set(o.requestedFields)].filter((f): f is ChangeField =>
        CHANGE_FIELDS.includes(f as string)
      ) as ChangeField[])
    : []
  // A change request that names nothing to change is not one.
  if (requestedFields.length === 0) return { kind: "none" }

  const n = o.targetEventNumber
  const targetEventIndex =
    typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= upcomingCount ? n - 1 : null

  const requestedTime =
    typeof o.requestedTime === "string" && TIME_LOCAL_RE.test(o.requestedTime)
      ? o.requestedTime
      : null
  // Same rule as spark: ambiguity is a property of a time that exists.
  const requestedTimeAmbiguous = requestedTime !== null && o.requestedTimeAmbiguous === true

  return {
    kind: "change",
    change: {
      targetEventIndex,
      requestedTime,
      requestedTimeAmbiguous,
      requestedFields,
      intentClear: o.intentClear === true,
    },
  }
}
```

Then in `change-copy.ts`, delete the temporary `export type ChangeField = ...` and add `import type { ChangeField } from "./spark"` (type-only; the erasure precedent is spark-copy's `PartOfDay` import).

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/orbit/__tests__/spark.test.ts src/lib/orbit/__tests__/change-copy.test.ts`
Expected: PASS, including every pre-existing `normalizeSpark` case.

- [ ] **Step 5: Commit**

```bash
git add src/lib/orbit/spark.ts src/lib/orbit/change-copy.ts src/lib/orbit/__tests__/spark.test.ts
git commit -m "One read, three answers: every message is a spark, a change request, or neither"
```

---

### Task 5: The pure planner (`change-plan.ts`)

**Files:**
- Create: `src/lib/orbit/change-plan.ts`
- Test: `src/lib/orbit/__tests__/change-plan.test.ts`

**Interfaces:**
- Consumes: `NormalizedChange`/`ChangeField` from `./spark`; everything from `./change-copy` (Task 3 signatures).
- Produces (imported by Task 8's action):
  - `interface ChangeTarget { id: string; label: string; startsAt: Date }`
  - `type ChangePlan = { action: "quiet" } | { action: "reply"; body: string } | { action: "move"; newStartsAt: Date; announcement: string } | { action: "ask"; proposedStartsAt: Date; question: string }`
  - `planChange(change: NormalizedChange, target: ChangeTarget | null, timeZone: string, now: Date): ChangePlan`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/orbit/__tests__/change-plan.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { planChange, type ChangeTarget } from "../change-plan"
import type { NormalizedChange } from "../spark"
import { PAST_TIME_REPLY } from "../change-copy"

const ZONE = "UTC"
const NOW = new Date("2099-06-10T12:00:00Z") // Wed noon
const TARGET: ChangeTarget = {
  id: "evt1",
  label: "climbing",
  startsAt: new Date("2099-06-14T08:00:00Z"), // Sun 8am
}

function change(overrides: Partial<NormalizedChange> = {}): NormalizedChange {
  return {
    targetEventIndex: 0,
    requestedTime: "18:00",
    requestedTimeAmbiguous: false,
    requestedFields: ["time"],
    intentClear: true,
    ...overrides,
  }
}

describe("planChange", () => {
  it("clear time request moves, announcement included", () => {
    const p = planChange(change(), TARGET, ZONE, NOW)
    if (p.action !== "move") throw new Error(`expected move, got ${p.action}`)
    expect(p.newStartsAt.toISOString()).toBe("2099-06-14T18:00:00.000Z")
    expect(p.announcement).toContain("Done. Climbing this Sun is moving to 6pm, it was 8am.")
  })

  it("probable intent asks instead of moving", () => {
    const p = planChange(change({ intentClear: false }), TARGET, ZONE, NOW)
    if (p.action !== "ask") throw new Error(`expected ask, got ${p.action}`)
    expect(p.proposedStartsAt.toISOString()).toBe("2099-06-14T18:00:00.000Z")
    expect(p.question).toBe(
      "Sounds like you want climbing this Sun moved to 6pm. Want me to make the change?"
    )
  })

  it("a bare hour inherits the plan's part of day before planning", () => {
    const p = planChange(
      change({ requestedTime: "21:00", requestedTimeAmbiguous: true }),
      TARGET,
      ZONE,
      NOW
    )
    if (p.action !== "move") throw new Error(`expected move, got ${p.action}`)
    expect(p.newStartsAt.toISOString()).toBe("2099-06-14T09:00:00.000Z")
    expect(p.announcement).toContain("I took that as 9am")
  })

  it("no target means silence, not a guess", () => {
    expect(planChange(change(), null, ZONE, NOW)).toEqual({ action: "quiet" })
  })

  it("a clearly asked non-time request gets the honest decline", () => {
    const p = planChange(change({ requestedFields: ["venue"] }), TARGET, ZONE, NOW)
    if (p.action !== "reply") throw new Error(`expected reply, got ${p.action}`)
    expect(p.body).toContain("I can't change the spot yet")
  })

  it("a probable non-time request stays quiet rather than interjecting", () => {
    expect(
      planChange(change({ requestedFields: ["venue"], intentClear: false }), TARGET, ZONE, NOW)
    ).toEqual({ action: "quiet" })
  })

  it("a compound day-and-time request declines rather than acting on half", () => {
    const p = planChange(change({ requestedFields: ["day", "time"] }), TARGET, ZONE, NOW)
    if (p.action !== "reply") throw new Error(`expected reply, got ${p.action}`)
    expect(p.body).toContain("I can't move it to another day yet")
  })

  it("a time request with no concrete time is nothing to propose", () => {
    expect(planChange(change({ requestedTime: null }), TARGET, ZONE, NOW)).toEqual({
      action: "quiet",
    })
  })

  it("a resolved instant in the past gets the honest reply when clearly asked", () => {
    const sameDayTarget: ChangeTarget = { ...TARGET, startsAt: new Date("2099-06-10T20:00:00Z") }
    const p = planChange(change({ requestedTime: "08:00" }), sameDayTarget, ZONE, NOW)
    if (p.action !== "reply") throw new Error(`expected reply, got ${p.action}`)
    expect(p.body).toBe(PAST_TIME_REPLY)
  })

  it("moving to the time it already has is a quiet no-op", () => {
    expect(planChange(change({ requestedTime: "08:00" }), TARGET, ZONE, NOW)).toEqual({
      action: "quiet",
    })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/orbit/__tests__/change-plan.test.ts`
Expected: FAIL, cannot resolve `../change-plan`.

- [ ] **Step 3: Implement `src/lib/orbit/change-plan.ts`**

```ts
// src/lib/orbit/change-plan.ts
//
// The pure decision at the heart of the change-request flow: given a
// normalized change claim and the plan it targets, what does Orbit do?
// Deterministic and fully unit-tested; the server action just carries the
// answer out (move, ask, reply, or nothing).

import type { NormalizedChange } from "./spark"
import {
  buildCantDoReply,
  buildChangeAnnouncement,
  buildChangeQuestion,
  changeStartInstant,
  PAST_TIME_REPLY,
  resolveChangeTime,
} from "./change-copy"

export interface ChangeTarget {
  id: string
  /** What Orbit calls the plan in copy: activityLabel, or the lowercased title. */
  label: string
  startsAt: Date
}

export type ChangePlan =
  | { action: "quiet" }
  | { action: "reply"; body: string }
  | { action: "move"; newStartsAt: Date; announcement: string }
  | { action: "ask"; proposedStartsAt: Date; question: string }

export function planChange(
  change: NormalizedChange,
  target: ChangeTarget | null,
  timeZone: string,
  now: Date
): ChangePlan {
  // No confident target and no best guess either: nothing to act on or ask about.
  if (!target) return { action: "quiet" }

  // Anything beyond the time is out of this slice. An honest decline, but only
  // for a plainly asked request: "I can't do that yet" aimed at something that
  // maybe was not a request would be Orbit interjecting on chatter. A compound
  // request declines whole rather than acting on half of it.
  if (change.requestedFields.some((f) => f !== "time")) {
    return change.intentClear
      ? { action: "reply", body: buildCantDoReply(change.requestedFields, target.startsAt, timeZone) }
      : { action: "quiet" }
  }

  // A time request with no concrete time ("can we do it later?") gives Orbit
  // nothing concrete to propose. Concrete-first cuts both ways: stay quiet.
  if (change.requestedTime === null) return { action: "quiet" }

  const { timeLocal, disclosure } = resolveChangeTime({
    requestedTime: change.requestedTime,
    requestedTimeAmbiguous: change.requestedTimeAmbiguous,
    eventStartsAt: target.startsAt,
    timeZone,
  })
  const newStartsAt = changeStartInstant(target.startsAt, timeLocal, timeZone)

  // No plans about the past, same principle as promote's start_passed skip.
  if (newStartsAt.getTime() <= now.getTime()) {
    return change.intentClear ? { action: "reply", body: PAST_TIME_REPLY } : { action: "quiet" }
  }

  // The time it already has: nothing to do. This also makes an accidentally
  // repeated detection of the same message harmless.
  if (newStartsAt.getTime() === target.startsAt.getTime()) return { action: "quiet" }

  if (change.intentClear) {
    return {
      action: "move",
      newStartsAt,
      announcement: buildChangeAnnouncement(
        target.label, newStartsAt, target.startsAt, timeZone, now, disclosure
      ),
    }
  }

  return {
    action: "ask",
    proposedStartsAt: newStartsAt,
    question: buildChangeQuestion(target.label, newStartsAt, timeZone, now),
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/orbit/__tests__/change-plan.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/orbit/change-plan.ts src/lib/orbit/__tests__/change-plan.test.ts
git commit -m "The four outcomes of a change request, decided in one pure, tested place"
```

---

### Task 6: The move transaction (`src/lib/events/move.ts`)

**Files:**
- Create: `src/lib/events/move.ts`
- Test: `src/lib/events/__tests__/move.test.ts` (real-DB integration, cleanup pattern from `reconcile.test.ts`)

**Interfaces:**
- Consumes: `prisma`, `RsvpStatus`, `MessageAuthor`, `ProposalAnswer` from the generated client (Task 1).
- Produces (imported by Tasks 8 and 9):
  - `type MoveEventResult = { status: "moved" } | { status: "skipped"; reason: "no_event" | "stale" | "noop" }`
  - `moveEventTime(input: { eventId: string; expectedStartsAt: Date; newStartsAt: Date; requesterUserId: string; announcementBody: string; resolveProposalId?: string }): Promise<MoveEventResult>`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/events/__tests__/move.test.ts`:

```ts
// Integration tests for moveEventTime — hits the real dev-test DB.
// Cleanup order (FK constraints): Message → ChangeProposal → Event (Rsvps
// cascade) → Membership → Group → User.

import { describe, it, expect, afterEach, beforeEach } from "vitest"
import { prisma } from "@/lib/prisma"
import { MessageAuthor, ProposalAnswer, RsvpStatus } from "@prisma/client"
import { moveEventTime } from "../move"

let userId: string | null = null
let secondUserId: string | null = null
let groupId: string | null = null
let eventId: string | null = null

const OLD_START = new Date("2099-06-14T08:00:00Z")
const NEW_START = new Date("2099-06-14T18:00:00Z")

async function cleanup() {
  if (groupId) {
    await prisma.changeProposal.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.message.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.event.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.membership.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.group.delete({ where: { id: groupId } }).catch(() => {})
    groupId = null
  }
  for (const id of [userId, secondUserId]) {
    if (id) await prisma.user.delete({ where: { id } }).catch(() => {})
  }
  userId = null
  secondUserId = null
  eventId = null
}

afterEach(async () => {
  await cleanup()
  await prisma.$disconnect()
})

beforeEach(async () => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  const user = await prisma.user.create({
    data: { name: "[TEST] Mover", supabaseAuthId: `test-move-${suffix}` },
  })
  userId = user.id
  const second = await prisma.user.create({
    data: { name: "[TEST] Other", supabaseAuthId: `test-move2-${suffix}` },
  })
  secondUserId = second.id
  const group = await prisma.group.create({
    data: {
      name: "[TEST] Move Group",
      founderId: user.id,
      timeZone: "UTC",
      recurringActivities: [] as never,
      memberships: { create: [{ userId: user.id }, { userId: second.id }] },
    },
  })
  groupId = group.id
  const event = await prisma.event.create({
    data: {
      groupId: group.id,
      title: "Climbing",
      activityLabel: "climbing",
      startsAt: OLD_START,
    },
  })
  eventId = event.id
  await prisma.rsvp.createMany({
    data: [
      { eventId: event.id, userId: user.id, status: RsvpStatus.IN },
      { eventId: event.id, userId: second.id, status: RsvpStatus.OUT },
    ],
  })
})

describe("moveEventTime", () => {
  it("moves, remembers, resets, seeds the requester, and announces, atomically", async () => {
    const result = await moveEventTime({
      eventId: eventId!,
      expectedStartsAt: OLD_START,
      newStartsAt: NEW_START,
      requesterUserId: userId!,
      announcementBody: "Done. Test announcement.",
    })
    expect(result).toEqual({ status: "moved" })

    const event = await prisma.event.findUnique({ where: { id: eventId! } })
    expect(event?.startsAt).toEqual(NEW_START)
    expect(event?.previousStartsAt).toEqual(OLD_START)
    expect(event?.scheduledKey).toBe(null) // untouched: this event never had one

    // Everyone reset to "haven't replied" except the requester, who is IN.
    const rsvps = await prisma.rsvp.findMany({ where: { eventId: eventId! } })
    expect(rsvps).toHaveLength(1)
    expect(rsvps[0]).toMatchObject({ userId: userId!, status: RsvpStatus.IN })

    const messages = await prisma.message.findMany({ where: { groupId: groupId! } })
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      authorType: MessageAuthor.ORBIT,
      authorId: null,
      body: "Done. Test announcement.",
    })
  })

  it("leaves a scheduled event's key alone", async () => {
    const key = `${groupId}:${OLD_START.toISOString()}`
    await prisma.event.update({ where: { id: eventId! }, data: { scheduledKey: key } })
    await moveEventTime({
      eventId: eventId!,
      expectedStartsAt: OLD_START,
      newStartsAt: NEW_START,
      requesterUserId: userId!,
      announcementBody: "x",
    })
    const event = await prisma.event.findUnique({ where: { id: eventId! } })
    expect(event?.scheduledKey).toBe(key)
  })

  it("refuses a stale expectation: never moves from a time the caller was not looking at", async () => {
    const result = await moveEventTime({
      eventId: eventId!,
      expectedStartsAt: new Date("2099-06-14T07:00:00Z"), // not the current start
      newStartsAt: NEW_START,
      requesterUserId: userId!,
      announcementBody: "x",
    })
    expect(result).toEqual({ status: "skipped", reason: "stale" })
    const rsvps = await prisma.rsvp.findMany({ where: { eventId: eventId! } })
    expect(rsvps).toHaveLength(2) // nothing was touched
  })

  it("no-ops on moving to the same instant, and reports a missing event", async () => {
    expect(
      await moveEventTime({
        eventId: eventId!,
        expectedStartsAt: OLD_START,
        newStartsAt: OLD_START,
        requesterUserId: userId!,
        announcementBody: "x",
      })
    ).toEqual({ status: "skipped", reason: "noop" })
    expect(
      await moveEventTime({
        eventId: "does-not-exist",
        expectedStartsAt: OLD_START,
        newStartsAt: NEW_START,
        requesterUserId: userId!,
        announcementBody: "x",
      })
    ).toEqual({ status: "skipped", reason: "no_event" })
  })

  it("resolves the proposal in the same transaction when asked to", async () => {
    const source = await prisma.message.create({
      data: { groupId: groupId!, authorType: MessageAuthor.MEMBER, authorId: userId!, body: "9?" },
    })
    const orbit = await prisma.message.create({
      data: { groupId: groupId!, authorType: MessageAuthor.ORBIT, authorId: null, body: "Move?" },
    })
    const proposal = await prisma.changeProposal.create({
      data: {
        groupId: groupId!,
        eventId: eventId!,
        askerUserId: userId!,
        sourceMessageId: source.id,
        orbitMessageId: orbit.id,
        proposedStartsAt: NEW_START,
        priorStartsAt: OLD_START,
      },
    })
    await moveEventTime({
      eventId: eventId!,
      expectedStartsAt: OLD_START,
      newStartsAt: NEW_START,
      requesterUserId: userId!,
      announcementBody: "x",
      resolveProposalId: proposal.id,
    })
    const resolved = await prisma.changeProposal.findUnique({ where: { id: proposal.id } })
    expect(resolved?.answer).toBe(ProposalAnswer.CONFIRMED)
    expect(resolved?.answeredAt).not.toBe(null)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/events/__tests__/move.test.ts`
Expected: FAIL, cannot resolve `../move`.

- [ ] **Step 3: Implement `src/lib/events/move.ts`**

```ts
// src/lib/events/move.ts
//
// The first Event mutation in the product: a change request moving an event's
// start time.
//
// Everything lands in one transaction: the new start (with the old one
// remembered on previousStartsAt), the RSVP reset, the requester's seeded yes,
// Orbit's announcement, and, on the confirm path, the proposal's resolution.
// Half of this visible mid-write would be Orbit announcing a time the card
// does not show, or a card whose yeses belong to a different time. The
// promote.ts precedent, applied to a mutation.
//
// The RSVP reset is the product's first row deletion. A moved time is a new
// proposal, and an 8am yes displayed against a 6pm plan misrepresents who is
// coming, which is the exact failure the RSVP rules exist to prevent. The
// requester is the one exception: they named the time they asked for, so
// their message already is their yes (the gauge-initiator precedent).
//
// scheduledKey is deliberately never touched here: a move relocates the
// occurrence, it does not free the slot (see the schema comment and the
// reconcile test pinning the cron's side of this).

import { prisma } from "@/lib/prisma"
import { MessageAuthor, ProposalAnswer, RsvpStatus } from "@prisma/client"

export type MoveEventResult =
  | { status: "moved" }
  | { status: "skipped"; reason: "no_event" | "stale" | "noop" }

export interface MoveEventInput {
  eventId: string
  /**
   * The start the caller believes the event has. Re-checked inside the
   * transaction so a move can never fire from a state nobody was shown:
   * a concurrent change comes back as a stale skip, not a surprise.
   */
  expectedStartsAt: Date
  newStartsAt: Date
  requesterUserId: string
  /** Composed by the caller (change-copy), in the group's timezone. */
  announcementBody: string
  /** Confirm path only: resolve this proposal in the same transaction. */
  resolveProposalId?: string
}

export async function moveEventTime({
  eventId,
  expectedStartsAt,
  newStartsAt,
  requesterUserId,
  announcementBody,
  resolveProposalId,
}: MoveEventInput): Promise<MoveEventResult> {
  return prisma.$transaction(async (tx) => {
    const event = await tx.event.findUnique({ where: { id: eventId } })
    if (!event) return { status: "skipped", reason: "no_event" } as const
    if (event.startsAt.getTime() !== expectedStartsAt.getTime()) {
      return { status: "skipped", reason: "stale" } as const
    }
    if (event.startsAt.getTime() === newStartsAt.getTime()) {
      return { status: "skipped", reason: "noop" } as const
    }

    await tx.event.update({
      where: { id: eventId },
      data: { startsAt: newStartsAt, previousStartsAt: event.startsAt },
    })

    await tx.rsvp.deleteMany({ where: { eventId } })
    await tx.rsvp.create({
      data: { eventId, userId: requesterUserId, status: RsvpStatus.IN },
    })

    await tx.message.create({
      data: {
        groupId: event.groupId,
        authorType: MessageAuthor.ORBIT,
        authorId: null,
        body: announcementBody,
      },
    })

    if (resolveProposalId) {
      await tx.changeProposal.update({
        where: { id: resolveProposalId },
        data: { answer: ProposalAnswer.CONFIRMED, answeredAt: new Date() },
      })
    }

    return { status: "moved" } as const
  })
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/events/__tests__/move.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/events/move.ts src/lib/events/__tests__/move.test.ts
git commit -m "Moving a plan's time: one transaction, RSVPs reset honestly, the old time remembered"
```

---

### Task 7: The proposal library (`src/lib/proposals/`)

**Files:**
- Create: `src/lib/proposals/create.ts`
- Create: `src/lib/proposals/read.ts`
- Test: `src/lib/proposals/__tests__/proposals.test.ts` (real-DB integration)

**Interfaces:**
- Consumes: generated `ChangeProposal` client (Task 1).
- Produces (imported by Tasks 8 and 9):
  - `createChangeProposal(input: { groupId: string; eventId: string; askerUserId: string; sourceMessageId: string; proposedStartsAt: Date; priorStartsAt: Date; body: string }): Promise<{ status: "created"; proposal: ChangeProposal } | { status: "skipped"; reason: "already_asked" }>`
  - `findLiveProposals(groupId: string, now: Date): Promise<(ChangeProposal & { event: Event })[]>` where "live" means unanswered, event still upcoming, and `priorStartsAt` still equals the event's current start.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/proposals/__tests__/proposals.test.ts` with the same fixture/cleanup pattern as `move.test.ts` (user, group, event at `2099-06-14T08:00:00Z`, member source message). Test cases, each with full setup via the shared `beforeEach`:

```ts
import { describe, it, expect, afterEach, beforeEach } from "vitest"
import { prisma } from "@/lib/prisma"
import { MessageAuthor, ProposalAnswer } from "@prisma/client"
import { createChangeProposal } from "../create"
import { findLiveProposals } from "../read"

let userId: string | null = null
let groupId: string | null = null
let eventId: string | null = null
let sourceMessageId: string | null = null

const EVENT_START = new Date("2099-06-14T08:00:00Z")
const PROPOSED = new Date("2099-06-14T18:00:00Z")
const NOW = new Date("2099-06-10T12:00:00Z")

async function cleanup() {
  if (groupId) {
    await prisma.changeProposal.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.message.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.event.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.membership.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.group.delete({ where: { id: groupId } }).catch(() => {})
    groupId = null
  }
  if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {})
  userId = null
}

afterEach(async () => {
  await cleanup()
  await prisma.$disconnect()
})

beforeEach(async () => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  const user = await prisma.user.create({
    data: { name: "[TEST] Asker", supabaseAuthId: `test-prop-${suffix}` },
  })
  userId = user.id
  const group = await prisma.group.create({
    data: {
      name: "[TEST] Proposal Group",
      founderId: user.id,
      timeZone: "UTC",
      recurringActivities: [] as never,
      memberships: { create: { userId: user.id } },
    },
  })
  groupId = group.id
  const event = await prisma.event.create({
    data: { groupId: group.id, title: "Climbing", activityLabel: "climbing", startsAt: EVENT_START },
  })
  eventId = event.id
  const source = await prisma.message.create({
    data: { groupId: group.id, authorType: MessageAuthor.MEMBER, authorId: user.id, body: "9?" },
  })
  sourceMessageId = source.id
})

function input() {
  return {
    groupId: groupId!,
    eventId: eventId!,
    askerUserId: userId!,
    sourceMessageId: sourceMessageId!,
    proposedStartsAt: PROPOSED,
    priorStartsAt: EVENT_START,
    body: "Sounds like you want climbing this Sun moved to 6pm. Want me to make the change?",
  }
}

describe("createChangeProposal", () => {
  it("creates the proposal and Orbit's question in one transaction", async () => {
    const result = await createChangeProposal(input())
    if (result.status !== "created") throw new Error("expected created")
    const orbit = await prisma.message.findUnique({
      where: { id: result.proposal.orbitMessageId },
    })
    expect(orbit).toMatchObject({ authorType: MessageAuthor.ORBIT, authorId: null })
    expect(orbit?.body).toContain("Want me to make the change?")
  })

  it("a double-fired detection collides on the source message and skips", async () => {
    await createChangeProposal(input())
    const second = await createChangeProposal(input())
    expect(second).toEqual({ status: "skipped", reason: "already_asked" })
    expect(await prisma.message.count({ where: { groupId: groupId!, authorType: "ORBIT" } })).toBe(1)
  })
})

describe("findLiveProposals", () => {
  it("returns an unanswered, unstale, upcoming proposal", async () => {
    await createChangeProposal(input())
    const live = await findLiveProposals(groupId!, NOW)
    expect(live).toHaveLength(1)
    expect(live[0].askerUserId).toBe(userId)
  })

  it("an answered proposal is not live", async () => {
    const r = await createChangeProposal(input())
    if (r.status !== "created") throw new Error("expected created")
    await prisma.changeProposal.update({
      where: { id: r.proposal.id },
      data: { answer: ProposalAnswer.DECLINED, answeredAt: new Date() },
    })
    expect(await findLiveProposals(groupId!, NOW)).toHaveLength(0)
  })

  it("a proposal goes stale when the event's time changed underneath it", async () => {
    await createChangeProposal(input())
    await prisma.event.update({
      where: { id: eventId! },
      data: { startsAt: new Date("2099-06-14T10:00:00Z") },
    })
    expect(await findLiveProposals(groupId!, NOW)).toHaveLength(0)
  })

  it("a proposal dies when its event has started", async () => {
    await createChangeProposal(input())
    const afterStart = new Date("2099-06-14T09:00:00Z")
    expect(await findLiveProposals(groupId!, afterStart)).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/proposals/__tests__/proposals.test.ts`
Expected: FAIL, cannot resolve `../create`.

- [ ] **Step 3: Implement**

`src/lib/proposals/create.ts`:

```ts
// src/lib/proposals/create.ts
//
// Writes one round of Orbit asking about a probable change request: Orbit's
// question message and the proposal that hangs off it, in ONE transaction
// (the createGauge precedent: chips must never render under nothing, and a
// question the product cannot answer must never be asked).

import { prisma } from "@/lib/prisma"
import { MessageAuthor } from "@prisma/client"
import type { ChangeProposal } from "@prisma/client"

export interface CreateChangeProposalInput {
  groupId: string
  eventId: string
  askerUserId: string
  /** The MEMBER message being clarified. Also the idempotency key. */
  sourceMessageId: string
  proposedStartsAt: Date
  /** The event's start as the asker was shown it: the staleness baseline. */
  priorStartsAt: Date
  /** Orbit's composed question. Copy lives in orbit/change-copy.ts, not here. */
  body: string
}

export type CreateChangeProposalResult =
  | { status: "created"; proposal: ChangeProposal }
  | { status: "skipped"; reason: "already_asked" }

export async function createChangeProposal({
  groupId,
  eventId,
  askerUserId,
  sourceMessageId,
  proposedStartsAt,
  priorStartsAt,
  body,
}: CreateChangeProposalInput): Promise<CreateChangeProposalResult> {
  try {
    const proposal = await prisma.$transaction(async (tx) => {
      const orbitMessage = await tx.message.create({
        data: { groupId, authorType: MessageAuthor.ORBIT, authorId: null, body },
      })
      return tx.changeProposal.create({
        data: {
          groupId,
          eventId,
          askerUserId,
          sourceMessageId,
          orbitMessageId: orbitMessage.id,
          proposedStartsAt,
          priorStartsAt,
        },
      })
    })
    return { status: "created", proposal }
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      return { status: "skipped", reason: "already_asked" }
    }
    throw err
  }
}
```

`src/lib/proposals/read.ts`:

```ts
// src/lib/proposals/read.ts
//
// Reads the change questions a group is currently being asked. Liveness is
// derived, never stored, like gauges: a proposal is live while it is
// unanswered, its event has not started, and the event still starts where the
// asker was shown it. A move by any other path silently retires the question
// (its message stays as history with no chips, no residue), and the
// priorStartsAt comparison is what makes a confirm on a stale question
// impossible to render in the first place.

import { prisma } from "@/lib/prisma"
import type { ChangeProposal, Event } from "@prisma/client"

export type LiveProposal = ChangeProposal & { event: Event }

export async function findLiveProposals(
  groupId: string,
  now: Date
): Promise<LiveProposal[]> {
  const candidates = await prisma.changeProposal.findMany({
    where: {
      groupId,
      answer: null,
      event: { startsAt: { gt: now } },
    },
    include: { event: true },
    orderBy: { createdAt: "asc" },
  })

  return candidates.filter(
    (p) => p.priorStartsAt.getTime() === p.event.startsAt.getTime()
  )
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/proposals/__tests__/proposals.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/proposals/ 
git commit -m "A change question Orbit can hold open: asked once, answered once, stale means gone"
```

---

### Task 8: Rewire detection (`detect-intent.ts`) and retire the spark-only call

**Files:**
- Rename: `src/app/actions/detect-spark.ts` → `src/app/actions/detect-intent.ts` (git mv, then edit)
- Modify: `src/app/groups/[id]/GroupHome.tsx` (import swap only, lines 28 and 106)
- Modify: `src/lib/orbit/spark.ts` (delete `SPARK_SCHEMA`, `SPARK_SYSTEM_PROMPT`, `detectSparkClaim`, `SparkContext`; keep `normalizeSpark` and everything Task 4 added)
- Modify: `src/lib/orbit/__tests__/spark.test.ts` (remove/adapt any tests importing the deleted spark-only exports; every `normalizeSpark` and `normalizeIntent` case stays)

**Interfaces:**
- Consumes: `detectIntentClaim`/`normalizeIntent` (Task 4), `planChange` (Task 5), `moveEventTime` (Task 6), `createChangeProposal` (Task 7), `findUpcomingEvents` from `@/lib/events/upcoming-list`, `createMessage` from `@/lib/messages/create`, plus everything the spark branch already used.
- Produces: `detectIntentAction(messageId: string): Promise<{ status: "gauged" | "changed" | "asked" | "replied" | "quiet" }>`. GroupHome discards the result, so the widened type breaks nothing.

- [ ] **Step 1: Rename and rewrite the action**

`git mv src/app/actions/detect-spark.ts src/app/actions/detect-intent.ts`, then replace its contents:

```ts
// src/app/actions/detect-intent.ts
"use server"

import { revalidatePath } from "next/cache"
import { MessageAuthor } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth/current-user"
import { findUpcomingEvents } from "@/lib/events/upcoming-list"
import { formatEventDate } from "@/lib/events/format"
import { createGauge } from "@/lib/gauges/create"
import { findLiveGauges } from "@/lib/gauges/read"
import { createMessage } from "@/lib/messages/create"
import { moveEventTime } from "@/lib/events/move"
import { createChangeProposal } from "@/lib/proposals/create"
import { detectIntentClaim, normalizeIntent } from "@/lib/orbit/spark"
import { planChange } from "@/lib/orbit/change-plan"
import {
  buildGaugeMessage,
  chooseProposedDate,
  resolveSparkTime,
  sparkStartInstant,
} from "@/lib/orbit/spark-copy"

export type DetectIntentResult = {
  status: "gauged" | "changed" | "asked" | "replied" | "quiet"
}

/**
 * Server action: read one member message and act on what it is. A fresh idea
 * opens a gauge (unchanged from the spark slice); a clear time-change request
 * moves the plan; a probable one gets Orbit's question with one-tap chips; a
 * clearly understood request this slice cannot act on gets an honest reply;
 * everything else stays silent.
 *
 * Called by the group home AFTER the send has settled, in its own transition.
 * The chat input is never waiting on this.
 *
 * Every failure path is soft, exactly as the spark slice established: Orbit
 * staying quiet costs nothing visible; Orbit interjecting wrongly teaches
 * people to tune it out.
 */
export async function detectIntentAction(messageId: string): Promise<DetectIntentResult> {
  let outcome: DetectIntentResult["status"] = "quiet"
  let touchedGroupId: string | null = null
  let touchedEventId: string | null = null

  try {
    const user = await getCurrentUser()
    if (!user) return { status: "quiet" }

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: { group: true },
    })

    // Orbit reads what members say, never its own messages. Detection is also
    // only ever triggered by the person who sent the message.
    if (!message) return { status: "quiet" }
    if (message.authorType !== MessageAuthor.MEMBER) return { status: "quiet" }
    if (message.authorId !== user.id) return { status: "quiet" }

    const group = message.group
    const now = new Date()

    // The model sees every plan the group sees (the carousel's three), each
    // numbered so a change request can say which one it means. One fetch, and
    // the same array resolves the model's answer, so the numbering can never
    // drift between what was shown and what is acted on.
    const events = await findUpcomingEvents(group.id, now, 3)
    const upcomingLines = events.map(
      (e, i) =>
        `${i + 1}. ${e.title}, ${formatEventDate(e.startsAt, e.endsAt, group.timeZone)}`
    )

    const claim = await detectIntentClaim(message.body, { upcomingLines })
    const intent = normalizeIntent(claim, events.length)

    if (intent.kind === "none") return { status: "quiet" }

    if (intent.kind === "spark") {
      const spark = intent.spark

      // Never open a second gauge for something the group is already being
      // asked about, or already has on the calendar (spark slice, unchanged).
      const activityKey = spark.activity.toLowerCase()
      const live = await findLiveGauges(group.id, now)
      if (live.some((g) => g.activity.toLowerCase() === activityKey)) {
        return { status: "quiet" }
      }
      const alreadyOnCalendar = await prisma.event.findFirst({
        where: {
          groupId: group.id,
          startsAt: { gte: now },
          activityLabel: { equals: spark.activity, mode: "insensitive" },
        },
        select: { id: true },
      })
      if (alreadyOnCalendar) return { status: "quiet" }

      const proposedDate = chooseProposedDate(
        spark.statedDayOfWeek,
        spark.partOfDay,
        group.timeZone,
        now
      )
      const { timeLocal, disclosure } = resolveSparkTime({
        statedTime: spark.statedTime,
        timeAmbiguous: spark.timeAmbiguous,
        partOfDay: spark.partOfDay,
      })
      if (sparkStartInstant(proposedDate, timeLocal, group.timeZone) <= now) {
        return { status: "quiet" }
      }

      const result = await createGauge({
        groupId: group.id,
        sourceMessageId: message.id,
        activity: spark.activity,
        proposedDate,
        proposedTime: timeLocal,
        body: buildGaugeMessage(spark.activity, proposedDate, group.timeZone, now, disclosure),
        initiatorUserId: spark.statedDayOfWeek !== null ? user.id : null,
      })
      if (result.status !== "created") return { status: "quiet" }

      outcome = "gauged"
      touchedGroupId = group.id
    } else {
      // A change request. The pure planner decides; this action only carries
      // the answer out.
      const target =
        intent.change.targetEventIndex !== null
          ? events[intent.change.targetEventIndex]
          : null

      const plan = planChange(
        intent.change,
        target
          ? {
              id: target.id,
              label: target.activityLabel ?? target.title.toLowerCase(),
              startsAt: target.startsAt,
            }
          : null,
        group.timeZone,
        now
      )

      if (plan.action === "quiet") return { status: "quiet" }

      if (plan.action === "reply") {
        await createMessage({
          groupId: group.id,
          authorType: MessageAuthor.ORBIT,
          authorId: null,
          body: plan.body,
        })
        outcome = "replied"
        touchedGroupId = group.id
      } else if (plan.action === "move") {
        const moved = await moveEventTime({
          eventId: target!.id,
          expectedStartsAt: target!.startsAt,
          newStartsAt: plan.newStartsAt,
          requesterUserId: user.id,
          announcementBody: plan.announcement,
        })
        if (moved.status !== "moved") return { status: "quiet" }
        outcome = "changed"
        touchedGroupId = group.id
        touchedEventId = target!.id
      } else {
        const created = await createChangeProposal({
          groupId: group.id,
          eventId: target!.id,
          askerUserId: user.id,
          sourceMessageId: message.id,
          proposedStartsAt: plan.proposedStartsAt,
          priorStartsAt: target!.startsAt,
          body: plan.question,
        })
        if (created.status !== "created") return { status: "quiet" }
        outcome = "asked"
        touchedGroupId = group.id
      }
    }
  } catch (err) {
    // Soft by design: the member's message stands, and nothing is said.
    console.error("[detect-intent] detection failed", err)
    return { status: "quiet" }
  }

  // CRITICAL: revalidatePath must be called outside and after try/catch.
  // Only fires when something visible actually happened.
  revalidatePath(`/groups/${touchedGroupId}`)
  if (touchedEventId) revalidatePath(`/events/${touchedEventId}`)
  return { status: outcome }
}
```

- [ ] **Step 2: Swap the GroupHome import**

In `src/app/groups/[id]/GroupHome.tsx`: change line 28 to `import { detectIntentAction } from "@/app/actions/detect-intent"` and the call inside `startDetection` to `await detectIntentAction(messageId).catch(() => {})`. Nothing else in the file changes; the fire-after-send seam is untouched.

- [ ] **Step 3: Retire the spark-only claim path**

In `src/lib/orbit/spark.ts`, delete `SPARK_SCHEMA`, `SPARK_SYSTEM_PROMPT`, `SparkContext`, and `detectSparkClaim` (nothing imports them now). Update the module header comment: the module reads one message and decides which of three things it is; normalizeSpark remains the spark arm's normalizer, called through normalizeIntent. In `spark.test.ts`, delete any test importing the removed exports (keep every `normalizeSpark` and `normalizeIntent` case; if a deleted test pinned the calendar-line format, its replacement is the `upcomingLines` numbering now living in the action).

- [ ] **Step 4: Full suite and typecheck**

Run: `npm test`
Expected: PASS across the whole suite.
Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add -A src/app/actions/ "src/app/groups/[id]/GroupHome.tsx" src/lib/orbit/spark.ts src/lib/orbit/__tests__/spark.test.ts
git commit -m "Orbit acts on what a message is: gauge it, move it, ask first, or say it can't yet"
```

---

### Task 9: The asker's chips (action, component, feed, page)

**Files:**
- Create: `src/app/actions/proposal-answer.ts`
- Create: `src/app/groups/[id]/ProposalChips.tsx`
- Modify: `src/app/groups/[id]/MessageFeed.tsx` (add `proposals` prop, render chips under the matching Orbit message)
- Modify: `src/app/groups/[id]/GroupHome.tsx` (pass `proposals` through, beside `gauges`)
- Modify: `src/app/groups/[id]/page.tsx` (fetch live proposals, compose asker-only DTOs)
- Test: `src/app/groups/[id]/__tests__/ProposalChips.test.tsx` (jsdom component test, BackLink precedent)

**Interfaces:**
- Consumes: `findLiveProposals` (Task 7), `moveEventTime` (Task 6), `buildChangeAnnouncement`, `changeChipLabels`, `STALE_PROPOSAL_ERROR` (Task 3).
- Produces: `proposalAnswerAction(prevState, formData)` with form fields `proposalId` and `answer` in `{"CONFIRM","DECLINE"}`; `interface FeedProposal { id: string; orbitMessageId: string; labels: { confirm: string; decline: string } }` exported from `ProposalChips.tsx`.

- [ ] **Step 1: Write the failing component test**

Create `src/app/groups/[id]/__tests__/ProposalChips.test.tsx`:

```tsx
// @vitest-environment jsdom
//
// The server action is mocked: under test is the component's own contract
// (two chips with the labels it is given, a checkmark on the optimistic
// choice, an error line when the action reports one), not the action.

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react"
import ProposalChips, { type FeedProposal } from "../ProposalChips"

const answerMock = vi.fn(async () => ({}))
vi.mock("@/app/actions/proposal-answer", () => ({
  proposalAnswerAction: (...args: unknown[]) => answerMock(...args),
}))

afterEach(() => {
  cleanup()
  answerMock.mockClear()
})

const PROPOSAL: FeedProposal = {
  id: "prop1",
  orbitMessageId: "msg1",
  labels: { confirm: "Yes, move it", decline: "Leave it" },
}

describe("ProposalChips", () => {
  it("renders both chips with their labels", () => {
    render(<ProposalChips proposal={PROPOSAL} />)
    expect(screen.getByRole("button", { name: "Yes, move it" })).toBeDefined()
    expect(screen.getByRole("button", { name: "Leave it" })).toBeDefined()
  })

  it("shows the error line when the action reports one", async () => {
    answerMock.mockResolvedValueOnce({
      errors: { general: "The plan already changed, take a look up top." },
    })
    render(<ProposalChips proposal={PROPOSAL} />)
    fireEvent.click(screen.getByRole("button", { name: "Yes, move it" }))
    await waitFor(() =>
      expect(screen.getByText("The plan already changed, take a look up top.")).toBeDefined()
    )
  })
})
```

Run: `npx vitest run "src/app/groups/[id]/__tests__/ProposalChips.test.tsx"`
Expected: FAIL, cannot resolve `../ProposalChips`.

- [ ] **Step 2: Implement the server action**

Create `src/app/actions/proposal-answer.ts`:

```ts
// src/app/actions/proposal-answer.ts
"use server"

import { revalidatePath } from "next/cache"

import { prisma } from "@/lib/prisma"
import { createClient } from "@/lib/supabase/server"
import { moveEventTime } from "@/lib/events/move"
import { buildChangeAnnouncement, STALE_PROPOSAL_ERROR } from "@/lib/orbit/change-copy"
import { ProposalAnswer } from "@prisma/client"

export interface ProposalAnswerState {
  errors?: { general?: string }
}

/**
 * Server action: the asker answers Orbit's change question with one tap.
 *
 * Same auth model as gaugeVoteAction: the session is re-verified server-side
 * and never trusted from the client. Only the asker may answer (the question
 * clarifies THEIR intent; the chips are only rendered for them, and this guard
 * makes that a rule rather than a rendering accident). Anyone else who wants
 * the change can say so in their own words, which is the normal path anyway.
 *
 * Confirm runs the exact same move transaction as a clear request, with the
 * proposal resolved inside it. The proposal's priorStartsAt is passed as the
 * move's expectation, so a plan that changed underneath the question comes
 * back as a stale skip and an honest error, never a surprise move.
 */
export async function proposalAnswerAction(
  _prevState: ProposalAnswerState,
  formData: FormData
): Promise<ProposalAnswerState> {
  const proposalId = (formData.get("proposalId") as string | null)?.trim() ?? ""
  const answerRaw = (formData.get("answer") as string | null)?.trim() ?? ""

  if (!proposalId || (answerRaw !== "CONFIRM" && answerRaw !== "DECLINE")) {
    return { errors: { general: "Couldn't save that, try again." } }
  }

  const supabase = await createClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()
  if (!authUser) {
    return { errors: { general: "You need to be signed in to answer." } }
  }
  const user = await prisma.user.findUnique({ where: { supabaseAuthId: authUser.id } })
  if (!user) {
    return { errors: { general: "You need to be signed in to answer." } }
  }

  const proposal = await prisma.changeProposal.findUnique({
    where: { id: proposalId },
    include: { event: true, group: { select: { id: true, timeZone: true } } },
  })
  if (!proposal) {
    return { errors: { general: "That question is gone. Please refresh and try again." } }
  }
  if (proposal.askerUserId !== user.id) {
    return { errors: { general: "Only the person who asked can answer this one." } }
  }
  if (proposal.answer !== null) {
    return { errors: { general: "That one's settled." } }
  }

  const now = new Date()
  let errorMsg: string | null = null

  try {
    if (answerRaw === "DECLINE") {
      await prisma.changeProposal.update({
        where: { id: proposal.id },
        data: { answer: ProposalAnswer.DECLINED, answeredAt: now },
      })
    } else {
      if (proposal.event.startsAt.getTime() <= now.getTime()) {
        return { errors: { general: "That plan has already started." } }
      }
      const label =
        proposal.event.activityLabel ?? proposal.event.title.toLowerCase()
      const announcement = buildChangeAnnouncement(
        label,
        proposal.proposedStartsAt,
        proposal.priorStartsAt,
        proposal.group.timeZone,
        now,
        null // the question already named the time; nothing left to disclose
      )
      const moved = await moveEventTime({
        eventId: proposal.eventId,
        expectedStartsAt: proposal.priorStartsAt,
        newStartsAt: proposal.proposedStartsAt,
        requesterUserId: user.id,
        announcementBody: announcement,
        resolveProposalId: proposal.id,
      })
      if (moved.status === "skipped") {
        errorMsg = moved.reason === "stale" ? STALE_PROPOSAL_ERROR : "Couldn't save that, try again."
      }
    }
  } catch {
    errorMsg = "Couldn't save that, try again."
  }

  if (errorMsg) return { errors: { general: errorMsg } }

  // CRITICAL: revalidatePath must be called outside and after try/catch.
  revalidatePath(`/groups/${proposal.group.id}`)
  revalidatePath(`/events/${proposal.eventId}`)
  return {}
}
```

- [ ] **Step 3: Implement the chips component**

Create `src/app/groups/[id]/ProposalChips.tsx`:

```tsx
// src/app/groups/[id]/ProposalChips.tsx
"use client"

// The two one-tap answers under Orbit's change question, rendered only for
// the asker (the page composes proposal DTOs for the asker alone; the server
// action enforces the same rule).
//
// Styling and behavior mirror GaugeChips: neutral outlined pills, never lime,
// never teal-filled, emphasis by text brightness, chosen chip marked with a
// checkmark prefix, optimistic flip reverted by the transition if the write
// fails. Resolution removes the proposal server-side, so on success the chips
// vanish with the next render and the question stays as plain history.

import { useOptimistic, useTransition, useState } from "react"
import { proposalAnswerAction } from "@/app/actions/proposal-answer"

export interface FeedProposal {
  id: string
  /** The Orbit question message these chips render under. */
  orbitMessageId: string
  labels: { confirm: string; decline: string }
}

type Answer = "CONFIRM" | "DECLINE"

interface Props {
  proposal: FeedProposal
}

export default function ProposalChips({ proposal }: Props) {
  const [optimisticAnswer, setOptimisticAnswer] = useOptimistic<Answer | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handle(formData: FormData) {
    startTransition(async () => {
      const next = formData.get("answer") as Answer
      setErrorMsg(null)
      setOptimisticAnswer(next)
      const result = await proposalAnswerAction({}, formData)
      if (result?.errors?.general) {
        setErrorMsg(result.errors.general)
      }
    })
  }

  const chips: { answer: Answer; label: string; quiet: boolean }[] = [
    { answer: "CONFIRM", label: proposal.labels.confirm, quiet: false },
    { answer: "DECLINE", label: proposal.labels.decline, quiet: true },
  ]

  return (
    <form action={handle}>
      <input type="hidden" name="proposalId" value={proposal.id} />

      {errorMsg && (
        <p
          style={{
            fontSize: "var(--type-meta)",
            lineHeight: "var(--leading-normal)",
            color: "#f87171",
            margin: "0.5rem 0 0 36px",
          }}
        >
          {errorMsg}
        </p>
      )}

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "7px",
          margin: "0.5rem 0 0 36px",
        }}
      >
        {chips.map(({ answer, label, quiet }) => {
          const selected = optimisticAnswer === answer
          return (
            <button
              key={answer}
              type="submit"
              name="answer"
              value={answer}
              disabled={isPending}
              style={{
                border: "1.7px solid var(--border-subtle)",
                backgroundColor: selected
                  ? "var(--surface-self)"
                  : "var(--surface-input)",
                borderRadius: "20px",
                padding: "8px 12px",
                fontSize: "var(--type-label)",
                fontWeight: 600,
                fontFamily: "inherit",
                color:
                  quiet && !selected ? "var(--text-secondary)" : "var(--text-primary)",
                whiteSpace: "nowrap",
                cursor: isPending ? "default" : "pointer",
              }}
            >
              {selected ? `✓ ${label}` : label}
            </button>
          )
        })}
      </div>
    </form>
  )
}
```

Run: `npx vitest run "src/app/groups/[id]/__tests__/ProposalChips.test.tsx"`
Expected: PASS.

- [ ] **Step 4: Thread proposals through MessageFeed, GroupHome, and the page**

`MessageFeed.tsx`: import `ProposalChips, { type FeedProposal } from "./ProposalChips"`; add `proposals?: FeedProposal[]` to `Props` (default `[]` in the signature, beside `gauges`); build `const proposalByMessageId = new Map(proposals.map((p) => [p.orbitMessageId, p]))` next to `gaugeByMessageId`; inside the Orbit branch add `const proposal = isOrbit ? proposalByMessageId.get(msg.id) : undefined` beside the gauge lookup and, directly under the `{gauge && viewerId !== null && <GaugeChips gauge={gauge} />}` line:

```tsx
                {/* The asker's one-tap answer to Orbit's change question. The
                    page only composes a proposal DTO for its asker, so
                    rendering it here is already asker-only. */}
                {proposal && viewerId !== null && <ProposalChips proposal={proposal} />}
```

`GroupHome.tsx`: add `proposals: FeedProposal[]` to `Props` (import the type from `./ProposalChips`), accept it in the destructuring, and pass `proposals={proposals}` to `<MessageFeed ... />`.

`page.tsx`: import `findLiveProposals` from `@/lib/proposals/read` and `changeChipLabels` from `@/lib/orbit/change-copy` and `type FeedProposal` from `./ProposalChips`. After the live-gauges block:

```ts
  // ── Live change questions ────────────────────────────────────────────────
  // Composed for the asker alone: the question clarifies one person's intent,
  // so only they get chips. Everyone else sees Orbit's question as history.
  const liveProposals = viewer ? await findLiveProposals(group.id, new Date()) : []
  const proposals: FeedProposal[] = liveProposals
    .filter((p) => p.askerUserId === viewer!.id)
    .map((p) => ({
      id: p.id,
      orbitMessageId: p.orbitMessageId,
      labels: changeChipLabels(),
    }))
```

and pass `proposals={proposals}` to `<GroupHome ... />`.

- [ ] **Step 5: Full suite, typecheck, commit**

Run: `npm test` then `npx tsc --noEmit`
Expected: PASS / clean.

```bash
git add src/app/actions/proposal-answer.ts "src/app/groups/[id]/ProposalChips.tsx" "src/app/groups/[id]/__tests__/ProposalChips.test.tsx" "src/app/groups/[id]/MessageFeed.tsx" "src/app/groups/[id]/GroupHome.tsx" "src/app/groups/[id]/page.tsx"
git commit -m "One tap settles Orbit's change question, and only the asker holds the chips"
```

---

### Task 10: Browser walkthrough on the dev-test database (evidence, not assertion)

**Files:** none created (screenshots for the PR; a scratch group on the dev-test DB)

- [ ] **Step 1: Start the dev server via the preview tooling** (never Bash) against the dev-test database, open a group that has an upcoming event with a couple of RSVPs, or create one.

- [ ] **Step 2: Walk the five paths, screenshotting each outcome:**
  1. Clear request ("can we do 6pm instead?"): card, detail page, and carousel order update; announcement names both times and the reset; RSVPs show only the requester IN, everyone else back to haven't replied.
  2. Probable request (something indirect enough to route to ask, e.g. "hmm, maybe 9 works better for people?"): Orbit's question appears with chips; verify in a second browser profile (another member's session) that the chips do NOT render for them; confirm from the asker's session and watch the move land.
  3. Decline path ("can we move it to Tony's?"): Orbit's honest venue reply, nothing else changes.
  4. Revert ("put it back at 8"): the time returns, RSVPs reset again, announcement invites the next word.
  5. Bare-hour inheritance ("can we do 9 instead?" on a morning plan): announcement carries the disclosure sentence.

- [ ] **Step 3: Check the model's actual classifications.** These live paths exercise Haiku for real; if a phrasing routes differently than expected (e.g. the probable example reads as clear), note what actually happened rather than forcing the screenshot to match the plan, and tune only the prompt examples if a path is unreachable.

- [ ] **Step 4: Clean up any scratch data** created on the dev-test DB (delete test group/user rows the way the integration tests do).

---

### Task 11: Documentation and the PR

**Files:**
- Modify: `CLAUDE.md` ("Where the build is": mark change-request part one built, restore one-bump as the next slice, and note the correction gap is now paid for time only; keep the section terse per its own rule)
- Modify: `docs/build-notes.md` (new §11 entry "Change request part one: Orbit can change the time (27 July 2026)")
- The spec is already committed (`docs/superpowers/specs/2026-07-27-change-request-time-design.md`)

- [ ] **Step 1: Write the §11 entry.** Record, in the house ADR voice: the RSVP-reset decision and its two competing precedents (proposal-scoped answers vs never-ask-twice) with the requester-seeded resolution; the textual revert and `previousStartsAt` as its data home; the owner's override building ask-when-ambiguous now, and the asker-only chip decision; bare-hour inheritance replacing the coin flip when an existing time is present; the relocate-not-free scheduledKey decision and its pin test; the single-call three-way intent read and its cost note (prompt grew on every message; the no-ceiling debt stands). Debt opened (from the spec): decline copy hardcodes what Orbit cannot do (the next change-request part must retire its line); detection latency now sits in front of an action; previousStartsAt remembers only the last move; the three-job prompt should be re-examined at a fourth intent.

- [ ] **Step 2: Update CLAUDE.md "Where the build is"** per its rewrite-at-slice-boundary rule, and adjust the "Still missing, and known" line (time correction now exists; venue correction still does not).

- [ ] **Step 3: Full suite one last time, then commit and open the PR.**

Run: `npm test && npx tsc --noEmit`
Expected: PASS / clean.

```bash
git add CLAUDE.md docs/build-notes.md
git commit -m "Record the change-request decisions where they live"
git push -u origin change-request-time
gh pr create --title "Change request part one: Orbit can change the time" --body "..."
```

PR body: product-language summary (what a member can now do, the RSVP-reset behavior and why, the ask path, the honest declines), the verification evidence (test counts and the walkthrough screenshots), and the debt opened. End with the standard generated-with line. **Open the PR and stop: no merging** (the product owner reviews and says merge).

---

## Verification (whole-slice)

- Unit: `change-copy` (resolution + every composer), `change-plan` (all four outcomes and every guard), `normalizeIntent` (hostile claims degrade to silence, never action).
- Integration (dev-test DB): `moveEventTime` semantics (reset, seed, remember, key untouched, stale, noop, proposal resolution), proposal create/read liveness (answered, stale, started), reconcile relocate pin.
- Component: ProposalChips labels and error line.
- Browser: the five-path walkthrough with screenshots (Task 10), which is the only honest evidence for the model-in-the-loop behavior.
- The whole suite green (`npm test`) and a clean `npx tsc --noEmit` before the PR.
