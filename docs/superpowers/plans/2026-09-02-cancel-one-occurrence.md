# Cancel One Occurrence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A member can call off a single occurrence of a plan from its own page in two taps, anyone can put it back, and every surface that reads plans stops pretending a called-off game is still happening.

**Architecture:** One new `EventStatus` column on `Event` plus `cancelledAt`. The row is never deleted, which is what stops the hourly cron recreating the cancelled plan within the hour. Two transactional functions (`cancelEvent`, `restoreEvent`) modelled on the existing `moveEventTime`, one server action behind the existing membership wall, an inline two-tap confirm on event detail, and status filters applied per read site rather than inside the shared query helpers.

**Tech Stack:** Next.js 16 (App Router, server actions), Prisma 7, Supabase (auth only), Vitest, TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-02-cancel-one-occurrence-design.md`. Read it before task 1. It carries the seven settled decisions and the reasoning behind each choice below.

## Global Constraints

- **Test-suite baseline, recorded at slice start by running it:** 1581 passed across 140 files, zero failures. No pre-existing failures to carry.
- **No model call and no eval bench anywhere in this slice.** If a task seems to need one, stop and raise it: that is the signal the work has crossed into the declined chat-recognition scope.
- **No em dashes or en dashes** in any Orbit copy, code comment, commit message, or document. Use commas, semicolons or parentheses. Standard hyphens in compound words are fine.
- **Orbit's voice:** plain, warm, approachable to a teen or an 80-year-old, roughly 7th-to-8th grade reading level. Soft declines everywhere.
- **Status is never carried by hue.** Brightness, label, icon or position. The owner is red/green colourblind.
- **Teal (`--action`) marks an action that genuinely matters** and never a secondary or destructive one. Neither the cancel control nor the restore control is teal. Neither is red.
- **Everything renders in the group's timezone**, never viewer-local.
- **Never point anything at the production database.** Run `npm run db:which` before any migration; it must print `pxbewardwvoyqqcvogel` (dev-test) and exit zero.
- **Bracketed route directories** (`src/app/events/[id]/`, `src/app/groups/[id]/`) are glob-expanded by zsh. Use `git grep`, quoted paths, or the Read tool, never a bare shell glob, or a scan will silently report clean for the wrong reason.
- **Tests build their own fixtures.** The suite must run green from an empty database; never lean on rows that happen to exist.
- **A passing test is only evidence if it could have failed.** Every test below is written and shown failing before the code that makes it pass.
- Run the full suite with `npm test`. Run one file with `npx vitest run <path>`.

---

## File Structure

**Created:**
- `prisma/migrations/<timestamp>_add_event_status/migration.sql`: the enum and two columns.
- `src/lib/orbit/cancel-copy.ts`: Orbit's two announcement strings. Pure, deterministic, no model call.
- `src/lib/events/cancel.ts`: `cancelEvent` and `restoreEvent`, each one transaction.
- `src/app/actions/cancel-event.ts`: the two server actions, membership-gated.
- `src/app/events/[id]/CancelControls.tsx`: the inline two-tap confirm, client component.
- `src/lib/digest/cancellations.ts`: pure derivation of which cancellations a member missed.
- Test files mirroring each of the above under the sibling `__tests__/` directory.

**Modified:**
- `prisma/schema.prisma`: the `Event` model and the new enum.
- `src/lib/orbit/change-copy.ts`: export `whenPhrase` and `cap` so `cancel-copy.ts` shares them rather than duplicating.
- `src/lib/events/upcoming-list.ts`: comment only, pinning why `hasUpcomingScheduledEvent` stays unfiltered.
- `src/lib/events/rsvp.ts`, `src/lib/events/move.ts`, `src/lib/proposals/create.ts`: refuse a cancelled event.
- `src/app/actions/detect-intent.ts`: three status filters.
- `src/lib/proposals/read.ts`: one status filter.
- `src/app/events/[id]/page.tsx`: the cancelled treatment and the controls.
- `src/app/groups/[id]/EventCard.tsx` and `src/app/groups/[id]/page.tsx`: the cancelled card.
- `src/lib/cards/region.ts`: the CANCELLED label.
- `src/lib/digest/run.ts`, `src/lib/digest/compose.ts`: the filter and the new block.
- `scripts/send-test-digest.ts`: mirrors the digest query.
- `docs/build-notes.md`, `CLAUDE.md`: the record and the current-state section.

---

## Task 1: Orbit's cancellation copy

Pure string composition, no database, no model. Built first because task 2's announcement depends on it.

**Files:**
- Create: `src/lib/orbit/cancel-copy.ts`
- Create: `src/lib/orbit/__tests__/cancel-copy.test.ts`
- Modify: `src/lib/orbit/change-copy.ts:82` and `:93` (add `export` to `whenPhrase` and `cap`)

**Interfaces:**
- Consumes: `whenPhrase(startsAt: Date, timeZone: string, now: Date): string` and `cap(label: string): string`, both currently private in `src/lib/orbit/change-copy.ts`.
- Produces:
  - `buildCancelAnnouncement(actorName: string, label: string, startsAt: Date, timeZone: string, now: Date): string`
  - `buildRestoreAnnouncement(actorName: string, label: string, startsAt: Date, timeZone: string, now: Date): string`

- [ ] **Step 1: Export the two shared helpers**

In `src/lib/orbit/change-copy.ts`, change two lines. Line 82:

```ts
export function whenPhrase(startsAt: Date, timeZone: string, now: Date): string {
```

Line 93:

```ts
export function cap(label: string): string {
```

Change nothing else in that file. These are shared rather than duplicated so the date phrasing in a cancellation can never drift from the date phrasing in a time change.

- [ ] **Step 2: Write the failing test**

Create `src/lib/orbit/__tests__/cancel-copy.test.ts`:

```ts
// Pure copy tests: no database, no model call, no clock of their own.
import { describe, it, expect } from "vitest"
import { buildCancelAnnouncement, buildRestoreAnnouncement } from "../cancel-copy"

const TZ = "America/New_York"
// A Tuesday. NOW is the Sunday two days before, so whenPhrase renders
// "this Tue" rather than the dated form.
const START = new Date("2026-09-08T23:00:00Z")
const NOW = new Date("2026-09-06T15:00:00Z")

describe("buildCancelAnnouncement", () => {
  it("names the person, the activity, and when, and points at the undo", () => {
    const body = buildCancelAnnouncement("Sam", "tennis", START, TZ, NOW)
    expect(body).toBe(
      "Sam called off tennis this Tue. If that's not right, anyone can put it back on the plan's page."
    )
  })

  it("uses the dated phrasing for a plan more than a week out", () => {
    const farOff = new Date("2026-09-22T23:00:00Z")
    const body = buildCancelAnnouncement("Sam", "tennis", farOff, TZ, NOW)
    expect(body).toContain("on Tue, Sep 22")
  })

  it("carries no em dash or en dash", () => {
    const body = buildCancelAnnouncement("Sam", "tennis", START, TZ, NOW)
    expect(body).not.toMatch(/[–—]/)
  })
})

describe("buildRestoreAnnouncement", () => {
  it("names the person and says the RSVPs are unchanged", () => {
    const body = buildRestoreAnnouncement("Jordan", "tennis", START, TZ, NOW)
    expect(body).toBe(
      "Jordan put tennis this Tue back on. Everyone's RSVPs are the same as before."
    )
  })

  it("carries no em dash or en dash", () => {
    const body = buildRestoreAnnouncement("Jordan", "tennis", START, TZ, NOW)
    expect(body).not.toMatch(/[–—]/)
  })
})
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `npx vitest run src/lib/orbit/__tests__/cancel-copy.test.ts`
Expected: FAIL, cannot resolve `../cancel-copy`.

- [ ] **Step 4: Write the implementation**

Create `src/lib/orbit/cancel-copy.ts`:

```ts
// src/lib/orbit/cancel-copy.ts
//
// What Orbit says when somebody calls off one occurrence, and when somebody
// puts it back. Deterministic string composition, no model call: this whole
// slice deliberately adds no model behavior (spec section 9).
//
// These are the product's FIRST stored Orbit message bodies that name a
// member. Every other Orbit line that names people (buildTallyLine) is
// rendered live from vote rows at page render, never stored. That is a real
// consequence and it is registered as debt in the spec: person-deletion
// nulls authorId on a person's own messages and cannot reach a name sitting
// inside Orbit's prose, so a deleted person's name survives in this one line.
//
// Why this announcement names anyone at all, when buildChangeAnnouncement
// and buildConsensusAnnouncement are both impersonal: a time change goes
// through a group vote, so it is nobody's individual call. A cancellation
// has no vote and no permission gate (decisions 1 and 2), which means the
// social check is the only check there is, and an anonymous cancellation in
// a 16-20 person group leaves nobody to ask why. Settled with the owner,
// 2 September 2026.
//
// whenPhrase and cap are imported rather than copied so the date phrasing
// here can never drift from the date phrasing in a time change.

import { whenPhrase } from "./change-copy"

/**
 * The feed line the moment a plan is called off. Two sentences, and the
 * second earns its place: it is the only place in the product where the
 * group ever learns that anyone can undo this.
 */
export function buildCancelAnnouncement(
  actorName: string,
  label: string,
  startsAt: Date,
  timeZone: string,
  now: Date
): string {
  return `${actorName} called off ${label} ${whenPhrase(startsAt, timeZone, now)}. If that's not right, anyone can put it back on the plan's page.`
}

/**
 * The feed line when a plan comes back. The second sentence answers the
 * question a member will actually have, and it is answerable only because a
 * cancel does not touch a single RSVP row (spec section 5).
 */
export function buildRestoreAnnouncement(
  actorName: string,
  label: string,
  startsAt: Date,
  timeZone: string,
  now: Date
): string {
  return `${actorName} put ${label} ${whenPhrase(startsAt, timeZone, now)} back on. Everyone's RSVPs are the same as before.`
}
```

Note `cap` is imported by neither function: both labels sit mid-sentence after a name. Do not add an unused import.

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run src/lib/orbit/__tests__/cancel-copy.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Run the change-copy tests, since that file was edited**

Run: `npx vitest run src/lib/orbit/__tests__/`
Expected: PASS. Adding `export` changes no behavior; this confirms it.

- [ ] **Step 7: Commit**

```bash
git add src/lib/orbit/cancel-copy.ts src/lib/orbit/__tests__/cancel-copy.test.ts src/lib/orbit/change-copy.ts
git commit -m "Give Orbit the words for calling off a plan and putting it back"
```

---

## Task 2: The schema, the migration, and the cancel/restore mechanism

**Files:**
- Modify: `prisma/schema.prisma` (the `Event` model, and a new enum beside the others)
- Create: `prisma/migrations/<timestamp>_add_event_status/migration.sql` (generated, not hand-written)
- Create: `src/lib/events/cancel.ts`
- Create: `src/lib/events/__tests__/cancel.test.ts`

**Interfaces:**
- Consumes: `buildCancelAnnouncement` and `buildRestoreAnnouncement` from task 1 (the caller composes the body and passes it in, exactly as `moveEventTime` takes `announcementBody`; this module never composes copy itself).
- Produces:
  - `type CancelEventResult = { status: "cancelled" } | { status: "skipped"; reason: "no_event" | "already_cancelled" | "already_started" | "stale" }`
  - `type RestoreEventResult = { status: "restored" } | { status: "skipped"; reason: "no_event" | "not_cancelled" | "stale" }`
  - `cancelEvent(input: { eventId: string; announcementBody: string; now: Date }): Promise<CancelEventResult>`
  - `restoreEvent(input: { eventId: string; announcementBody: string; now: Date }): Promise<RestoreEventResult>`

- [ ] **Step 1: Confirm which database this checkout points at**

Run: `npm run db:which`
Expected: prints `pxbewardwvoyqqcvogel` and exits zero. **If it prints anything else, or exits nonzero, stop and report it.** Never run a migration against production.

- [ ] **Step 2: Add the enum and the columns to the schema**

In `prisma/schema.prisma`, add the enum beside the other enums:

```prisma
enum EventStatus {
  SCHEDULED
  CANCELLED
}
```

In the `Event` model, add two fields after `previousStartsAt` and before `gaugeId`:

```prisma
  /// Whether this occurrence is still happening. CANCELLED is set by a
  /// member calling it off from the event's own page, and cleared by anyone
  /// putting it back.
  ///
  /// The row is NEVER deleted, and that is load-bearing rather than
  /// stylistic. hasUpcomingScheduledEvent (lib/events/upcoming-list.ts) asks
  /// only whether a scheduled event starts in the future, with no status
  /// filter. A delete would free that guard AND the unique scheduledKey, so
  /// the hourly cron would recreate the cancelled plan within the hour with
  /// a fresh announcement. With the row retained the guard still sees it and
  /// the cancelled row is its own tombstone, so reconcile needs no change.
  /// Do not "tidy" this into a delete, and do not add a status filter to
  /// that guard.
  status           EventStatus @default(SCHEDULED)
  /// When this occurrence was called off; null whenever status is SCHEDULED.
  /// Not decoration: it is what lets the digest ask "cancelled since this
  /// member last looked" (lib/digest/cancellations.ts). Cleared on restore so
  /// the field can never claim a cancellation that was undone.
  cancelledAt      DateTime?
```

No new index. `status` is a low-cardinality filter on result sets the existing `@@index([groupId, startsAt])` already narrows.

- [ ] **Step 3: Generate the migration and the client**

Run: `npx prisma migrate dev --name add_event_status`

Expected: a new directory under `prisma/migrations/` whose `migration.sql` creates the `EventStatus` type and adds two columns with `DEFAULT 'SCHEDULED'`. Read the generated SQL and confirm it contains no `DROP` of any kind. It needs no backfill: every existing row takes the default.

- [ ] **Step 4: Write the failing tests**

Create `src/lib/events/__tests__/cancel.test.ts`. Fixture shape copied from `move.test.ts`, including its FK-ordered cleanup:

```ts
// Integration tests for cancelEvent / restoreEvent: hits the real dev-test DB.
// Cleanup order (FK constraints): Message → ChangeProposal → Event (Rsvps
// cascade) → Membership → Group → User.

import { describe, it, expect, afterEach, beforeEach } from "vitest"
import { prisma } from "@/lib/prisma"
import {
  EventStatus,
  MessageAuthor,
  ProposalAnswer,
  ProposalKind,
  RsvpStatus,
} from "@prisma/client"
import { cancelEvent, restoreEvent } from "../cancel"

let userId: string | null = null
let secondUserId: string | null = null
let groupId: string | null = null
let eventId: string | null = null

const START = new Date("2099-06-14T18:00:00Z")
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
    data: { name: "[TEST] Canceller", supabaseAuthId: `test-cancel-${suffix}` },
  })
  userId = user.id
  const second = await prisma.user.create({
    data: { name: "[TEST] Other", supabaseAuthId: `test-cancel2-${suffix}` },
  })
  secondUserId = second.id
  const group = await prisma.group.create({
    data: {
      name: "[TEST] Cancel Group",
      founderId: user.id,
      timeZone: "UTC",
      recurringActivities: [] as never,
      memberships: { create: [{ userId: user.id }, { userId: second.id }] },
    },
  })
  groupId = group.id
  const event = await prisma.event.create({
    data: { groupId: group.id, title: "Tennis", activityLabel: "tennis", startsAt: START },
  })
  eventId = event.id
  await prisma.rsvp.createMany({
    data: [
      { eventId: event.id, userId: user.id, status: RsvpStatus.IN },
      { eventId: event.id, userId: second.id, status: RsvpStatus.OUT },
    ],
  })
})

describe("cancelEvent", () => {
  it("sets the status, stamps cancelledAt, and announces once", async () => {
    const result = await cancelEvent({
      eventId: eventId!,
      announcementBody: "Sam called off tennis this Mon.",
      now: NOW,
    })
    expect(result).toEqual({ status: "cancelled" })

    const event = await prisma.event.findUnique({ where: { id: eventId! } })
    expect(event?.status).toBe(EventStatus.CANCELLED)
    expect(event?.cancelledAt).toEqual(NOW)

    const messages = await prisma.message.findMany({ where: { groupId: groupId! } })
    expect(messages).toHaveLength(1)
    expect(messages[0].authorType).toBe(MessageAuthor.ORBIT)
    expect(messages[0].authorId).toBeNull()
    expect(messages[0].body).toBe("Sam called off tennis this Mon.")
  })

  it("leaves every RSVP exactly as it was", async () => {
    const before = await prisma.rsvp.findMany({
      where: { eventId: eventId! },
      orderBy: { userId: "asc" },
    })

    await cancelEvent({ eventId: eventId!, announcementBody: "x", now: NOW })

    const after = await prisma.rsvp.findMany({
      where: { eventId: eventId! },
      orderBy: { userId: "asc" },
    })
    expect(after).toEqual(before)
  })

  it("supersedes a live group time-change vote, silently", async () => {
    const proposal = await prisma.changeProposal.create({
      data: {
        groupId: groupId!,
        eventId: eventId!,
        askerUserId: userId!,
        kind: ProposalKind.GROUP,
        priorStartsAt: START,
        proposedStartsAt: new Date("2099-06-14T20:00:00Z"),
      },
    })

    await cancelEvent({ eventId: eventId!, announcementBody: "x", now: NOW })

    const after = await prisma.changeProposal.findUnique({ where: { id: proposal.id } })
    expect(after?.answer).toBe(ProposalAnswer.SUPERSEDED)
    expect(after?.answeredAt).not.toBeNull()

    // Silent: the cancellation announcement is the only message written.
    const messages = await prisma.message.findMany({ where: { groupId: groupId! } })
    expect(messages).toHaveLength(1)
  })

  it("refuses a second cancel and writes no second message", async () => {
    await cancelEvent({ eventId: eventId!, announcementBody: "first", now: NOW })
    const again = await cancelEvent({ eventId: eventId!, announcementBody: "second", now: NOW })

    expect(again).toEqual({ status: "skipped", reason: "already_cancelled" })
    const messages = await prisma.message.findMany({ where: { groupId: groupId! } })
    expect(messages).toHaveLength(1)
  })

  it("refuses a plan whose start has already passed", async () => {
    const afterStart = new Date(START.getTime() + 60_000)
    const result = await cancelEvent({
      eventId: eventId!,
      announcementBody: "x",
      now: afterStart,
    })
    expect(result).toEqual({ status: "skipped", reason: "already_started" })

    const event = await prisma.event.findUnique({ where: { id: eventId! } })
    expect(event?.status).toBe(EventStatus.SCHEDULED)
  })

  it("refuses an event that does not exist", async () => {
    const result = await cancelEvent({
      eventId: "does-not-exist",
      announcementBody: "x",
      now: NOW,
    })
    expect(result).toEqual({ status: "skipped", reason: "no_event" })
  })
})

describe("restoreEvent", () => {
  it("clears the status and cancelledAt, and announces once", async () => {
    await cancelEvent({ eventId: eventId!, announcementBody: "off", now: NOW })
    const result = await restoreEvent({
      eventId: eventId!,
      announcementBody: "Jordan put tennis this Mon back on.",
      now: NOW,
    })
    expect(result).toEqual({ status: "restored" })

    const event = await prisma.event.findUnique({ where: { id: eventId! } })
    expect(event?.status).toBe(EventStatus.SCHEDULED)
    expect(event?.cancelledAt).toBeNull()

    const messages = await prisma.message.findMany({
      where: { groupId: groupId! },
      orderBy: { createdAt: "asc" },
    })
    expect(messages).toHaveLength(2)
    expect(messages[1].body).toBe("Jordan put tennis this Mon back on.")
  })

  it("returns every RSVP untouched across a cancel and a restore", async () => {
    const before = await prisma.rsvp.findMany({
      where: { eventId: eventId! },
      orderBy: { userId: "asc" },
    })

    await cancelEvent({ eventId: eventId!, announcementBody: "off", now: NOW })
    await restoreEvent({ eventId: eventId!, announcementBody: "on", now: NOW })

    const after = await prisma.rsvp.findMany({
      where: { eventId: eventId! },
      orderBy: { userId: "asc" },
    })
    expect(after).toEqual(before)
  })

  it("does not revive the vote the cancel superseded", async () => {
    const proposal = await prisma.changeProposal.create({
      data: {
        groupId: groupId!,
        eventId: eventId!,
        askerUserId: userId!,
        kind: ProposalKind.GROUP,
        priorStartsAt: START,
        proposedStartsAt: new Date("2099-06-14T20:00:00Z"),
      },
    })

    await cancelEvent({ eventId: eventId!, announcementBody: "off", now: NOW })
    await restoreEvent({ eventId: eventId!, announcementBody: "on", now: NOW })

    const after = await prisma.changeProposal.findUnique({ where: { id: proposal.id } })
    expect(after?.answer).toBe(ProposalAnswer.SUPERSEDED)
  })

  it("refuses an event that is not cancelled", async () => {
    const result = await restoreEvent({ eventId: eventId!, announcementBody: "x", now: NOW })
    expect(result).toEqual({ status: "skipped", reason: "not_cancelled" })

    const messages = await prisma.message.findMany({ where: { groupId: groupId! } })
    expect(messages).toHaveLength(0)
  })
})
```

- [ ] **Step 5: Run them and confirm they fail**

Run: `npx vitest run src/lib/events/__tests__/cancel.test.ts`
Expected: FAIL, cannot resolve `../cancel`.

- [ ] **Step 6: Write the implementation**

Create `src/lib/events/cancel.ts`:

```ts
// src/lib/events/cancel.ts
//
// Calling off one occurrence, and putting it back.
//
// Modelled directly on move.ts, and the contrast with it is the whole design.
// A move deletes every RSVP, because the plan changed and an 8am yes
// displayed against a 6pm plan misrepresents who is coming. A cancel does
// not change the plan, it removes it; if it comes back it is the identical
// plan at the identical time, and the people who said they were coming still
// mean it. So THIS MODULE NEVER TOUCHES AN RSVP ROW, and that is what makes
// "anyone can undo it" safe rather than merely permitted (spec section 5).
//
// The row is never deleted either. hasUpcomingScheduledEvent has no status
// filter, so a delete would free both that guard and the unique
// scheduledKey, and the hourly cron would recreate the cancelled plan within
// the hour with a fresh announcement. The cancelled row is its own
// tombstone; reconcile needs no change at all.
//
// This module composes no copy. The caller passes announcementBody in,
// exactly as moveEventTime takes it, so the wording lives in one place
// (lib/orbit/cancel-copy.ts) and this file stays about state.

import { prisma } from "@/lib/prisma"
import {
  EventStatus,
  MessageAuthor,
  ProposalAnswer,
  ProposalKind,
} from "@prisma/client"

export type CancelEventResult =
  | { status: "cancelled" }
  | {
      status: "skipped"
      reason: "no_event" | "already_cancelled" | "already_started" | "stale"
    }

export type RestoreEventResult =
  | { status: "restored" }
  | { status: "skipped"; reason: "no_event" | "not_cancelled" | "stale" }

interface CancelInput {
  eventId: string
  /** Composed by the caller (lib/orbit/cancel-copy), in the group's timezone. */
  announcementBody: string
  now: Date
}

/**
 * Call off one occurrence. Everything lands in one transaction for the same
 * reason move.ts gives: half of this visible mid-write would be Orbit
 * announcing a cancellation against a card that still offers an RSVP.
 */
export async function cancelEvent({
  eventId,
  announcementBody,
  now,
}: CancelInput): Promise<CancelEventResult> {
  return prisma.$transaction(async (tx) => {
    const event = await tx.event.findUnique({ where: { id: eventId } })
    if (!event) return { status: "skipped", reason: "no_event" } as const
    if (event.status === EventStatus.CANCELLED) {
      return { status: "skipped", reason: "already_cancelled" } as const
    }
    // Cancelling a game that already happened means nothing, and the detail
    // page is reachable by URL for a past event.
    if (event.startsAt.getTime() <= now.getTime()) {
      return { status: "skipped", reason: "already_started" } as const
    }

    // The pre-read above is a fast path, not the guard: at READ COMMITTED two
    // concurrent callers can both pass it. This conditional write is the real
    // guard, the same shape move.ts uses. A count of 0 means the other caller
    // won, so this one reports stale rather than writing a second
    // announcement for a cancellation that already happened.
    const updated = await tx.event.updateMany({
      where: { id: eventId, status: EventStatus.SCHEDULED },
      data: { status: EventStatus.CANCELLED, cancelledAt: now },
    })
    if (updated.count === 0) return { status: "skipped", reason: "stale" } as const

    // A live vote to move this plan is moot the moment the plan is off, and
    // leaving it open would keep asking the group to move a game that is not
    // happening. SUPERSEDED with nothing posted is the rule already settled
    // in the time-change-ending slice for a vote made moot because the plan
    // changed some other way. Conditional on answer:null so a concurrent
    // resolution is never overwritten.
    await tx.changeProposal.updateMany({
      where: { eventId, kind: ProposalKind.GROUP, answer: null },
      data: { answer: ProposalAnswer.SUPERSEDED, answeredAt: now },
    })

    await tx.message.create({
      data: {
        groupId: event.groupId,
        authorType: MessageAuthor.ORBIT,
        authorId: null,
        body: announcementBody,
      },
    })

    return { status: "cancelled" } as const
  })
}

/**
 * Put a called-off occurrence back. The mirror of cancelEvent, with one
 * deliberate asymmetry: it does NOT revive the vote the cancel superseded.
 * That vote is dead, and reopening a question nobody is currently asking is
 * worse than silence. Anyone who still wants the time moved can ask again.
 */
export async function restoreEvent({
  eventId,
  announcementBody,
  now,
}: CancelInput): Promise<RestoreEventResult> {
  return prisma.$transaction(async (tx) => {
    const event = await tx.event.findUnique({ where: { id: eventId } })
    if (!event) return { status: "skipped", reason: "no_event" } as const
    if (event.status !== EventStatus.CANCELLED) {
      return { status: "skipped", reason: "not_cancelled" } as const
    }

    const updated = await tx.event.updateMany({
      where: { id: eventId, status: EventStatus.CANCELLED },
      data: { status: EventStatus.SCHEDULED, cancelledAt: null },
    })
    if (updated.count === 0) return { status: "skipped", reason: "stale" } as const

    await tx.message.create({
      data: {
        groupId: event.groupId,
        authorType: MessageAuthor.ORBIT,
        authorId: null,
        body: announcementBody,
      },
    })

    return { status: "restored" } as const
  })
}
```

Note there is deliberately no `startsAt` guard on restore: a plan cancelled while it was still ahead can be put back right up to its own start, and after that the card no longer shows it anyway.

- [ ] **Step 7: Run the tests and confirm they pass**

Run: `npx vitest run src/lib/events/__tests__/cancel.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 8: Prove the RSVP test could have failed**

Temporarily add `await tx.rsvp.deleteMany({ where: { eventId } })` inside `cancelEvent` just before the message write. Re-run the file. Expected: the two RSVP tests FAIL. **Remove the line** and re-run to confirm green again. A passing test is only evidence if it could have failed, and the RSVP guarantee is the hinge this whole slice hangs on.

- [ ] **Step 9: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/events/cancel.ts src/lib/events/__tests__/cancel.test.ts
git commit -m "Let a plan be called off without deleting it"
```

---

## Task 3: Pin the reason the row survives

Tests only, against code this slice deliberately does not change. This is the most important task in the slice: it is what stops a future session "tidying" the cancel into a delete, or adding a status filter to the cron's guard, and silently reintroducing a recreated plan an hour after every cancellation.

**Files:**
- Modify: `src/lib/events/upcoming-list.ts` (comment only, no logic)
- Modify: `src/lib/events/__tests__/upcoming-list.test.ts` (add one test)
- Modify: `src/lib/orbit/__tests__/reconcile.test.ts` (add one test)

**Interfaces:**
- Consumes: `cancelEvent` from task 2; `hasUpcomingScheduledEvent(groupId: string, now: Date): Promise<boolean>` from `src/lib/events/upcoming-list.ts`.
- Produces: nothing new. Behaviour pinned, not added.

- [ ] **Step 1: Write the failing guard test for the cron's guard**

Append to `src/lib/events/__tests__/upcoming-list.test.ts`, inside the existing `describe` for `hasUpcomingScheduledEvent`. Follow the fixture style already in that file:

```ts
  it("still sees a cancelled scheduled event, which is what makes it the tombstone", async () => {
    // Deliberately NOT filtered by status. If this guard ever learned about
    // CANCELLED, reconcile would see nothing upcoming, computeNextOccurrence
    // would return the same slot, and the hourly cron would recreate the
    // plan the group just called off, with a fresh announcement. The retained
    // row IS the record that this slot is spoken for.
    await prisma.event.update({
      where: { id: eventId! },
      data: { status: EventStatus.CANCELLED, cancelledAt: new Date() },
    })

    const result = await hasUpcomingScheduledEvent(groupId!, NOW)
    expect(result).toBe(true)
  })
```

Add `EventStatus` to that file's `@prisma/client` import if it is not already there.

- [ ] **Step 2: Run it and confirm it passes for the right reason**

Run: `npx vitest run src/lib/events/__tests__/upcoming-list.test.ts`
Expected: PASS.

This one passes on its first run, so prove it could have failed: temporarily add `status: EventStatus.SCHEDULED` to the `where` clause in `hasUpcomingScheduledEvent` (`src/lib/events/upcoming-list.ts:39`) and re-run. Expected: the new test FAILS. **Remove that filter** and re-run to confirm green. Record both outcomes in the task report.

- [ ] **Step 3: Write the failing end-to-end test for reconcile**

Append to `src/lib/orbit/__tests__/reconcile.test.ts`, following that file's existing fixture and assertion style:

```ts
  it("does not recreate an occurrence the group called off", async () => {
    // The whole reason cancel sets a status instead of deleting the row.
    // Without the retained row this sweep would schedule the same slot again
    // and announce it, within the hour, undoing the cancellation nobody asked
    // to undo.
    await prisma.event.update({
      where: { id: scheduledEventId! },
      data: { status: EventStatus.CANCELLED, cancelledAt: new Date() },
    })
    const messagesBefore = await prisma.message.count({ where: { groupId: groupId! } })

    await reconcileGroupEvents({ groupId: groupId!, now: NOW })

    const events = await prisma.event.findMany({ where: { groupId: groupId! } })
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe(EventStatus.CANCELLED)

    const messagesAfter = await prisma.message.count({ where: { groupId: groupId! } })
    expect(messagesAfter).toBe(messagesBefore)
  })
```

Adapt the fixture variable names (`scheduledEventId`, `groupId`, `NOW`) and the reconcile call signature to whatever that file already uses. Read the surrounding tests first rather than assuming.

- [ ] **Step 4: Run it**

Run: `npx vitest run src/lib/orbit/__tests__/reconcile.test.ts`
Expected: PASS. Prove it could have failed the same way: temporarily `delete` the event row instead of cancelling it, re-run, and confirm the test FAILS because reconcile created a second event and announced it. Restore the cancel and confirm green.

- [ ] **Step 5: Write the reasoning into the guard itself**

In `src/lib/events/upcoming-list.ts`, extend the existing doc comment on `hasUpcomingScheduledEvent` with a new paragraph:

```
 * DELIBERATELY BLIND TO status (cancel-one-occurrence slice, 2 Sep 2026).
 * A cancelled occurrence must keep satisfying this guard. Cancelling sets a
 * status and never deletes the row precisely so that this query still sees
 * it: the cancelled row is its own tombstone, and reconcile needs no change.
 * Adding `status: SCHEDULED` here would make the cron recreate the plan the
 * group just called off, within the hour, with a fresh announcement. Pinned
 * by a test in this module's own suite and by one in reconcile's.
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/events/upcoming-list.ts src/lib/events/__tests__/upcoming-list.test.ts src/lib/orbit/__tests__/reconcile.test.ts
git commit -m "Pin the reason a called-off plan keeps its row"
```

---

## Task 4: Refuse writes against a called-off plan

A stale tab still holds live buttons, the same reasoning that put the membership wall on every write path. Three existing modules learn one new refusal each.

**Files:**
- Modify: `src/lib/events/rsvp.ts:50-58`
- Modify: `src/lib/events/move.ts:84-90`
- Modify: `src/lib/proposals/create.ts:108-112`
- Modify: `src/lib/events/__tests__/rsvp.test.ts`, `src/lib/events/__tests__/move.test.ts`, `src/lib/proposals/__tests__/proposals.test.ts`

**Interfaces:**
- Consumes: `EventStatus` from `@prisma/client` (task 2).
- Produces: `setRsvp` additionally throws `Error("EVENT_CANCELLED")`; `moveEventCoreInTx` additionally returns `{ status: "skipped", reason: "cancelled" }`, so `MoveEventResult`'s reason union gains `"cancelled"`; `createGroupProposal` additionally throws `StaleEventInTx` (the existing class, no new type).

- [ ] **Step 1: Write the three failing tests**

In `src/lib/events/__tests__/rsvp.test.ts`, add to the existing describe:

```ts
  it("refuses an RSVP on a plan that has been called off", async () => {
    await prisma.event.update({
      where: { id: eventId! },
      data: { status: EventStatus.CANCELLED, cancelledAt: new Date() },
    })

    await expect(
      setRsvp({ supabaseAuthId: authId!, eventId: eventId!, status: RsvpStatus.IN })
    ).rejects.toThrow("EVENT_CANCELLED")

    const rows = await prisma.rsvp.findMany({ where: { eventId: eventId! } })
    expect(rows).toHaveLength(0)
  })
```

In `src/lib/events/__tests__/move.test.ts`:

```ts
  it("refuses to move a plan that has been called off", async () => {
    await prisma.event.update({
      where: { id: eventId! },
      data: { status: EventStatus.CANCELLED, cancelledAt: new Date() },
    })

    const result = await moveEventTime({
      eventId: eventId!,
      expectedStartsAt: OLD_START,
      newStartsAt: NEW_START,
      requesterUserId: userId!,
      announcementBody: "Done. Test announcement.",
    })
    expect(result).toEqual({ status: "skipped", reason: "cancelled" })

    const event = await prisma.event.findUnique({ where: { id: eventId! } })
    expect(event?.startsAt).toEqual(OLD_START)
    const messages = await prisma.message.findMany({ where: { groupId: groupId! } })
    expect(messages).toHaveLength(0)
  })
```

In `src/lib/proposals/__tests__/proposals.test.ts`, following that file's existing style for the stale-event case:

```ts
  it("refuses to open a time-change vote on a plan that has been called off", async () => {
    await prisma.event.update({
      where: { id: eventId! },
      data: { status: EventStatus.CANCELLED, cancelledAt: new Date() },
    })

    await expect(
      createGroupProposal({
        groupId: groupId!,
        eventId: eventId!,
        askerUserId: userId!,
        priorStartsAt: START,
        proposedStartsAt: new Date(START.getTime() + 3_600_000),
        askBody: "Move it?",
      })
    ).rejects.toThrow(StaleEventInTx)

    const proposals = await prisma.changeProposal.findMany({ where: { eventId: eventId! } })
    expect(proposals).toHaveLength(0)
  })
```

Adapt each call's argument shape to what the file's existing tests already pass. Read them first.

- [ ] **Step 2: Run all three and confirm they fail**

Run: `npx vitest run src/lib/events/__tests__/rsvp.test.ts src/lib/events/__tests__/move.test.ts src/lib/proposals/__tests__/proposals.test.ts`
Expected: FAIL. The RSVP one writes a row instead of throwing; the move one moves the plan; the proposal one opens a vote.

- [ ] **Step 3: Add the guard to `setRsvp`**

In `src/lib/events/rsvp.ts`, change the event read to include status and add the refusal:

```ts
    const event = await tx.event.findUnique({
      where: { id: eventId },
      select: { groupId: true, status: true },
    })
    if (!event) throw new Error("NO_EVENT")
    // A called-off plan takes no answers: there is nothing to be in or out
    // for. A stale tab still holds live RSVP buttons, which is the same
    // reason the membership gate below is here rather than on the screen.
    if (event.status === EventStatus.CANCELLED) throw new Error("EVENT_CANCELLED")
```

Add `EventStatus` to the file's `@prisma/client` import. Then extend the doc comment's numbered guard list with a sixth entry: `6. Throws "EVENT_CANCELLED" when the event has been called off.`

Add the matching branch wherever `rsvpAction` maps `setRsvp`'s thrown messages to member-facing copy (`src/app/actions/rsvp.ts`), using: `"This one's been called off."`

- [ ] **Step 4: Add the guard to `moveEventCoreInTx`**

In `src/lib/events/move.ts`, widen the result type:

```ts
export type MoveEventResult =
  | { status: "moved" }
  | { status: "skipped"; reason: "no_event" | "stale" | "noop" | "cancelled" }
```

and add the check immediately after the `!event` guard:

```ts
    if (!event) return { status: "skipped", reason: "no_event" } as const
    // A called-off plan is not a plan to move. Reachable from a stale tab
    // holding a live time-change chip.
    if (event.status === EventStatus.CANCELLED) {
      return { status: "skipped", reason: "cancelled" } as const
    }
```

Add `EventStatus` to that file's `@prisma/client` import. Then check every caller that switches on `MoveEventResult`'s reason (`src/lib/proposals/promote.ts`, `src/app/actions/proposal-answer.ts`) and make sure the new variant is handled rather than falling through silently; TypeScript will point at any exhaustive switch that needs it.

- [ ] **Step 5: Add the guard to `createGroupProposal`**

In `src/lib/proposals/create.ts`, extend the existing in-transaction guard:

```ts
      const event = await tx.event.findUnique({ where: { id: eventId } })
      if (
        !event ||
        event.startsAt.getTime() !== priorStartsAt.getTime() ||
        event.status === EventStatus.CANCELLED
      ) {
        throw new StaleEventInTx()
      }
```

Add `EventStatus` to that file's `@prisma/client` import, and extend the comment above the guard to say that a called-off plan counts as stale for this purpose: there is no time to change.

- [ ] **Step 6: Run the three files and confirm they pass**

Run: `npx vitest run src/lib/events/__tests__/rsvp.test.ts src/lib/events/__tests__/move.test.ts src/lib/proposals/__tests__/proposals.test.ts`
Expected: PASS.

- [ ] **Step 7: Run the full suite, because three shared modules changed**

Run: `npm test`
Expected: PASS, at least 1581 + the new tests. Any failure here is a real consumer of `MoveEventResult` or `setRsvp` that needs the new variant.

- [ ] **Step 8: Commit**

```bash
git add src/lib/events/rsvp.ts src/lib/events/move.ts src/lib/proposals/create.ts src/app/actions/rsvp.ts src/lib/events/__tests__ src/lib/proposals/__tests__
git commit -m "Stop a stale tab acting on a plan that is already off"
```

---

## Task 5: Stop the reads pretending a called-off plan is on

Four read sites. The first is the one that matters most to the tennis group: without it, calling off Tuesday's game silences Orbit for every new tennis idea, so the group loses the ability to reschedule the thing they just cancelled.

**Files:**
- Modify: `src/app/actions/detect-intent.ts:90`, `:163`, `:246`
- Modify: `src/lib/proposals/read.ts:28`
- Modify: `src/app/actions/__tests__/detect-intent.test.ts` (or the closest existing detect-intent test file)
- Modify: `src/lib/proposals/__tests__/proposals.test.ts`

**Interfaces:**
- Consumes: `EventStatus` from `@prisma/client`.
- Produces: no new exports. `findUpcomingEvents` keeps its signature and stays status-blind; filtering is applied by the caller.

- [ ] **Step 1: Write the failing tests**

In the detect-intent test file, add:

```ts
  it("opens a gauge for an activity whose only upcoming plan was called off", async () => {
    // Without this, calling off Tuesday tennis silences Orbit for "tennis
    // Thursday?": the group loses the ability to reschedule the very game
    // they just called off. The worst bug this slice could have shipped.
    await prisma.event.update({
      where: { id: eventId! },
      data: { status: EventStatus.CANCELLED, cancelledAt: new Date() },
    })

    // ...trigger the spark path with a message naming the same activity,
    // using whatever helper this file already uses to drive detectIntentAction
    // with a stubbed model reply. Assert a gauge now exists.
    const gauges = await prisma.gauge.findMany({ where: { groupId: groupId! } })
    expect(gauges).toHaveLength(1)
  })

  it("does not offer a called-off plan as something to move", async () => {
    await prisma.event.update({
      where: { id: eventId! },
      data: { status: EventStatus.CANCELLED, cancelledAt: new Date() },
    })

    // ...drive a change request. With no live plan left, the honest
    // no-plans reply is the correct outcome, via the existing NO_PLANS_REPLY
    // path in change-plan.ts.
    const messages = await prisma.message.findMany({
      where: { groupId: groupId!, authorType: MessageAuthor.ORBIT },
    })
    expect(messages.at(-1)?.body).toContain("I don't see any plans")
  })
```

Read the existing detect-intent tests first and match how they stub the model reply; do not invent a new stubbing mechanism, and do not make a real model call.

In `src/lib/proposals/__tests__/proposals.test.ts`:

```ts
  it("does not report a live vote on a plan that has been called off", async () => {
    await prisma.changeProposal.create({
      data: {
        groupId: groupId!,
        eventId: eventId!,
        askerUserId: userId!,
        kind: ProposalKind.GROUP,
        priorStartsAt: START,
        proposedStartsAt: new Date(START.getTime() + 3_600_000),
      },
    })
    await prisma.event.update({
      where: { id: eventId! },
      data: { status: EventStatus.CANCELLED, cancelledAt: new Date() },
    })

    const live = await findLiveProposals(groupId!, NOW)
    expect(live).toHaveLength(0)
  })
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run src/app/actions/__tests__/detect-intent.test.ts src/lib/proposals/__tests__/proposals.test.ts`
Expected: FAIL on all three.

- [ ] **Step 3: Filter the numbered plan list**

In `src/app/actions/detect-intent.ts`, at line 90:

```ts
    // findUpcomingEvents is deliberately status-blind, because the group
    // home's card region must still SHOW a called-off plan. Filtering
    // belongs to each caller instead, and this caller must never offer a
    // called-off plan as something to move. When this empties, the existing
    // NO_PLANS_REPLY path answers honestly with no further change.
    const events = (await findUpcomingEvents(group.id, now, 3)).filter(
      (e) => e.status === EventStatus.SCHEDULED
    )
```

- [ ] **Step 4: Filter the two "already on calendar" guards**

At `src/app/actions/detect-intent.ts:163` and again at `:246`, add one line to each `where` clause:

```ts
      const alreadyOnCalendar = await prisma.event.findFirst({
        where: {
          groupId: group.id,
          startsAt: { gte: now },
          // A called-off plan must not suppress a fresh idea for the same
          // activity: rescheduling is exactly what the group does next.
          status: EventStatus.SCHEDULED,
          activityLabel: { equals: spark.activity, mode: "insensitive" },
        },
        select: { id: true },
      })
```

The `:163` copy uses `openAsk.activity` rather than `spark.activity`; keep each site's own expression. Add `EventStatus` to the file's `@prisma/client` import.

- [ ] **Step 5: Filter the live-proposal read**

In `src/lib/proposals/read.ts`, at the `where` clause on line 28:

```ts
      event: {
        startsAt: { gt: now },
        // Belt and braces beside the supersede inside cancelEvent: a
        // proposal opened in the same second as a cancellation would
        // otherwise keep asking the group to move a game that is off.
        status: EventStatus.SCHEDULED,
      },
```

Add `EventStatus` to that file's `@prisma/client` import.

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npx vitest run src/app/actions/__tests__/detect-intent.test.ts src/lib/proposals/__tests__/proposals.test.ts`
Expected: PASS.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS. `findLiveProposals` feeds the group home, the event detail page and the digest, so a break here surfaces widely.

- [ ] **Step 8: Commit**

```bash
git add src/app/actions/detect-intent.ts src/lib/proposals/read.ts src/app/actions/__tests__ src/lib/proposals/__tests__
git commit -m "Let the group reschedule the game they just called off"
```

---

## Task 6: The server action and the two-tap confirm

**Files:**
- Create: `src/app/actions/cancel-event.ts`
- Create: `src/app/events/[id]/CancelControls.tsx`
- Create: `src/app/events/[id]/__tests__/CancelControls.test.tsx`

**Interfaces:**
- Consumes: `cancelEvent`, `restoreEvent` (task 2); `buildCancelAnnouncement`, `buildRestoreAnnouncement` (task 1); `isGroupMember` from `src/lib/auth/membership.ts`.
- Produces:
  - `interface CancelEventState { errors?: { general?: string } }`
  - `cancelEventAction(prevState: CancelEventState, formData: FormData): Promise<CancelEventState>` reading form fields `eventId` and `groupId`
  - `restoreEventAction(prevState: CancelEventState, formData: FormData): Promise<CancelEventState>` with the same fields
  - `<CancelControls eventId groupId isCancelled />` default export

- [ ] **Step 1: Write the server action**

Create `src/app/actions/cancel-event.ts`, following `src/app/actions/proposal-vote.ts` line for line on auth and error shape:

```ts
// src/app/actions/cancel-event.ts
"use server"

import { revalidatePath } from "next/cache"

import { prisma } from "@/lib/prisma"
import { createClient } from "@/lib/supabase/server"
import { isGroupMember } from "@/lib/auth/membership"
import { cancelEvent, restoreEvent } from "@/lib/events/cancel"
import {
  buildCancelAnnouncement,
  buildRestoreAnnouncement,
} from "@/lib/orbit/cancel-copy"

export interface CancelEventState {
  errors?: {
    general?: string
  }
}

// Anyone in the group can call a plan off, and anyone can put it back
// (decisions 1 and 4). Founder-only would rebuild the organizer role the
// product exists to dissolve, and weather is an observable fact rather than
// a judgment call. What makes that safe is that the action is reversible in
// two taps by anybody and announced publicly the same second.
async function resolveActor(eventId: string) {
  const supabase = await createClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()
  if (!authUser) return { error: "You need to be signed in to do that." } as const

  const user = await prisma.user.findUnique({ where: { supabaseAuthId: authUser.id } })
  if (!user) return { error: "You need to be signed in to do that." } as const

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { group: { select: { id: true, timeZone: true } } },
  })
  if (!event) return { error: "That plan is gone." } as const

  // Every write path is membership-gated: a removed member's stale tab still
  // holds live buttons.
  if (!(await isGroupMember(user.id, event.group.id))) {
    return { error: "Only members can change this group's plans." } as const
  }

  return { user, event } as const
}

export async function cancelEventAction(
  _prevState: CancelEventState,
  formData: FormData
): Promise<CancelEventState> {
  const eventId = (formData.get("eventId") as string | null)?.trim() ?? ""
  if (!eventId) return { errors: { general: "That plan is gone." } }

  const resolved = await resolveActor(eventId)
  if ("error" in resolved) return { errors: { general: resolved.error } }
  const { user, event } = resolved

  const now = new Date()
  const label = event.activityLabel ?? event.title.toLowerCase()
  const result = await cancelEvent({
    eventId,
    announcementBody: buildCancelAnnouncement(
      user.name,
      label,
      event.startsAt,
      event.group.timeZone,
      now
    ),
    now,
  })

  if (result.status === "skipped") {
    if (result.reason === "already_cancelled") {
      return { errors: { general: "This one's already been called off." } }
    }
    if (result.reason === "already_started") {
      return { errors: { general: "This one has already started." } }
    }
    return { errors: { general: "Couldn't do that, try again." } }
  }

  revalidatePath(`/events/${eventId}`)
  revalidatePath(`/groups/${event.group.id}`)
  return {}
}

export async function restoreEventAction(
  _prevState: CancelEventState,
  formData: FormData
): Promise<CancelEventState> {
  const eventId = (formData.get("eventId") as string | null)?.trim() ?? ""
  if (!eventId) return { errors: { general: "That plan is gone." } }

  const resolved = await resolveActor(eventId)
  if ("error" in resolved) return { errors: { general: resolved.error } }
  const { user, event } = resolved

  const now = new Date()
  const label = event.activityLabel ?? event.title.toLowerCase()
  const result = await restoreEvent({
    eventId,
    announcementBody: buildRestoreAnnouncement(
      user.name,
      label,
      event.startsAt,
      event.group.timeZone,
      now
    ),
    now,
  })

  if (result.status === "skipped") {
    if (result.reason === "not_cancelled") {
      return { errors: { general: "This one's already back on." } }
    }
    return { errors: { general: "Couldn't do that, try again." } }
  }

  revalidatePath(`/events/${eventId}`)
  revalidatePath(`/groups/${event.group.id}`)
  return {}
}
```

Revalidating the group home as well as the event page matches how `rsvpAction` already works: a member who acts here and taps back should not meet a stale card.

- [ ] **Step 2: Write the failing component test**

Create `src/app/events/[id]/__tests__/CancelControls.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest"
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react"
import CancelControls from "../CancelControls"

// fireEvent, not @testing-library/user-event: that package is NOT a
// dependency of this repo, and every existing component test here drives
// clicks with fireEvent. Do not add the dependency for this one file.
const cancelEventAction = vi.fn(async (..._args: unknown[]) => ({}))
const restoreEventAction = vi.fn(async (..._args: unknown[]) => ({}))

vi.mock("@/app/actions/cancel-event", () => ({
  cancelEventAction: (...args: unknown[]) => cancelEventAction(...args),
  restoreEventAction: (...args: unknown[]) => restoreEventAction(...args),
}))

afterEach(() => {
  cleanup()
  cancelEventAction.mockClear()
  restoreEventAction.mockClear()
})

describe("CancelControls, live plan", () => {
  it("shows one quiet control at rest and calls nothing", () => {
    render(<CancelControls eventId="e1" groupId="g1" isCancelled={false} />)
    expect(screen.getByRole("button", { name: "Call this off" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Yes, call it off" })).toBeNull()
    expect(cancelEventAction).not.toHaveBeenCalled()
  })

  it("does not cancel on the first tap", () => {
    render(<CancelControls eventId="e1" groupId="g1" isCancelled={false} />)
    fireEvent.click(screen.getByRole("button", { name: "Call this off" }))

    expect(cancelEventAction).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Yes, call it off" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Never mind" })).toBeTruthy()
    expect(screen.getByText(/This tells the group/)).toBeTruthy()
  })

  it("cancels on the second tap", async () => {
    render(<CancelControls eventId="e1" groupId="g1" isCancelled={false} />)
    fireEvent.click(screen.getByRole("button", { name: "Call this off" }))
    fireEvent.click(screen.getByRole("button", { name: "Yes, call it off" }))

    await waitFor(() => expect(cancelEventAction).toHaveBeenCalledTimes(1))
  })

  it("returns to rest on Never mind, having called nothing", () => {
    render(<CancelControls eventId="e1" groupId="g1" isCancelled={false} />)
    fireEvent.click(screen.getByRole("button", { name: "Call this off" }))
    fireEvent.click(screen.getByRole("button", { name: "Never mind" }))

    expect(cancelEventAction).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Call this off" })).toBeTruthy()
  })
})

describe("CancelControls, cancelled plan", () => {
  it("offers the restore, also behind two taps", async () => {
    render(<CancelControls eventId="e1" groupId="g1" isCancelled />)
    fireEvent.click(screen.getByRole("button", { name: "Put this back on" }))
    expect(restoreEventAction).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Yes, put it back" }))
    await waitFor(() => expect(restoreEventAction).toHaveBeenCalledTimes(1))
  })
})
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `npx vitest run "src/app/events/[id]/__tests__/CancelControls.test.tsx"`
Note the quoted path: the bracketed directory is glob-expanded by zsh otherwise.
Expected: FAIL, cannot resolve `../CancelControls`.

- [ ] **Step 4: Write the component**

Create `src/app/events/[id]/CancelControls.tsx`:

```tsx
// src/app/events/[id]/CancelControls.tsx
"use client"
//
// Calling a plan off, and putting it back. Two taps, never type-to-confirm
// (decision 3): person:delete makes the owner type a name because that
// action is irreversible and private, while this one is reversible by
// anybody in two taps and announced publicly the same second.
// Type-to-confirm on a reversible action teaches people the product is
// fragile.
//
// Inline rather than a modal. The product's only modal precedent is the
// email bottom sheet, whose focus handling, scroll lock, back gesture and
// ARIA semantics are deliberately heavy; an inline two-step matches the chip
// and RSVP grammar already on this screen.
//
// "Never mind" sits FIRST, where the resting button was, so an accidental
// double-tap lands on the safe control rather than on the destructive one.
//
// Neither control is teal: teal marks an action that genuinely matters and
// never a destructive or secondary one. Neither is red either: status and
// action are never carried by hue in this product.

import { useState, useTransition } from "react"
import { cancelEventAction, restoreEventAction } from "@/app/actions/cancel-event"
import { ErrorLine } from "@/components/choice"

interface Props {
  eventId: string
  groupId: string
  isCancelled: boolean
}

const quietButton: React.CSSProperties = {
  fontSize: "var(--type-label)",
  fontWeight: 700,
  lineHeight: "var(--leading-normal)",
  color: "var(--text-secondary)",
  background: "transparent",
  border: "1.5px solid var(--hairline)",
  borderRadius: "0.5rem",
  padding: "0.625rem 1rem",
  minHeight: "44px",
  cursor: "pointer",
}

export default function CancelControls({ eventId, groupId, isCancelled }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const restText = isCancelled ? "Put this back on" : "Call this off"
  const confirmText = isCancelled ? "Yes, put it back" : "Yes, call it off"
  const consequence = isCancelled
    ? "This tells the group the plan is back on, with everyone's RSVPs as they were."
    : "This tells the group the plan is off. Anyone can undo it."

  function submit() {
    startTransition(async () => {
      setErrorMsg(null)
      const formData = new FormData()
      formData.set("eventId", eventId)
      formData.set("groupId", groupId)
      const action = isCancelled ? restoreEventAction : cancelEventAction
      const result = await action({}, formData)
      if (result?.errors?.general) {
        setErrorMsg(result.errors.general)
        setConfirming(false)
      }
    })
  }

  if (!confirming) {
    return (
      <div>
        <button type="button" style={quietButton} onClick={() => setConfirming(true)}>
          {restText}
        </button>
        <ErrorLine msg={errorMsg} />
      </div>
    )
  }

  return (
    <div>
      <p
        style={{
          fontSize: "var(--type-meta)",
          lineHeight: "var(--leading-normal)",
          color: "var(--text-secondary)",
          marginBottom: "0.625rem",
        }}
      >
        {consequence}
      </p>
      <div style={{ display: "flex", gap: "0.625rem", flexWrap: "wrap" }}>
        {/* Safe control first, in the resting button's own position. */}
        <button
          type="button"
          style={{ ...quietButton, opacity: isPending ? 0.65 : 1 }}
          disabled={isPending}
          onClick={() => setConfirming(false)}
        >
          Never mind
        </button>
        <button
          type="button"
          style={{
            ...quietButton,
            color: "var(--text-primary)",
            opacity: isPending ? 0.65 : 1,
          }}
          disabled={isPending}
          onClick={submit}
        >
          {confirmText}
        </button>
      </div>
      <ErrorLine msg={errorMsg} />
    </div>
  )
}
```

`ErrorLine`'s prop is `msg` (verified in `src/components/choice.tsx:102`), not `message`. It also takes an optional `marginLeft`.

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run "src/app/events/[id]/__tests__/CancelControls.test.tsx"`
Expected: PASS, 5 tests.

- [ ] **Step 6: Prove the two-tap test could have failed**

Temporarily make the resting button call `submit()` directly instead of `setConfirming(true)`. Re-run. Expected: "does not cancel on the first tap" FAILS. Restore and confirm green.

- [ ] **Step 7: Commit**

```bash
git add src/app/actions/cancel-event.ts "src/app/events/[id]/CancelControls.tsx" "src/app/events/[id]/__tests__/CancelControls.test.tsx"
git commit -m "Put calling off a plan behind two taps, and undo behind two more"
```

---

## Task 7: The event detail screen

**Files:**
- Modify: `src/app/events/[id]/page.tsx`
- Create: `src/app/events/[id]/__tests__/cancelled-detail.test.tsx`

**Interfaces:**
- Consumes: `CancelControls` (task 6); `event.status` (task 2).
- Produces: nothing new exported. The page renders `CancelControls` and suppresses three things when the plan is off.

- [ ] **Step 1: Write the failing test**

Create `src/app/events/[id]/__tests__/cancelled-detail.test.tsx`. This page is a server component that talks to the database, which this repo cannot render in a test, so test the pure decision instead: extract the treatment decision into a tiny pure helper and test that, then use it in the page.

Add to `src/lib/cards/region.ts`:

```ts
/** What the event surfaces show for a plan that has been called off. The
 *  label is not a need, so it never renders teal: teal in that slot means
 *  "this needs you". Shared by the detail screen and the home card so the
 *  two can never disagree about the word. */
export const CANCELLED_LABEL: NeedLabelValue = { text: "Called off", needsViewer: false }

/** The card's label ladder, now with a status rung above it. A called-off
 *  plan needs nothing from anybody, so no need label can outrank it. */
export function eventCardLabel(
  isCancelled: boolean,
  viewerRsvp: "IN" | "OUT" | null
): NeedLabelValue | null {
  if (isCancelled) return CANCELLED_LABEL
  return eventNeedLabel(viewerRsvp)
}
```

Then write the test in `src/lib/cards/__tests__/region.test.ts` (append to the existing file):

```ts
describe("eventCardLabel", () => {
  it("says called off, and never as a need on the viewer", () => {
    const label = eventCardLabel(true, null)
    expect(label).toEqual({ text: "Called off", needsViewer: false })
  })

  it("outranks an outstanding RSVP, because a called-off plan needs nothing", () => {
    expect(eventCardLabel(true, null)?.text).toBe("Called off")
    expect(eventCardLabel(false, null)?.text).toBe("Needs your RSVP")
  })

  it("falls through to the ordinary ladder for a live plan", () => {
    expect(eventCardLabel(false, "IN")).toBeNull()
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/lib/cards/__tests__/region.test.ts`
Expected: FAIL, `eventCardLabel` is not exported.

- [ ] **Step 3: Add the helper and confirm the test passes**

Add the code from step 1 to `src/lib/cards/region.ts`.

Run: `npx vitest run src/lib/cards/__tests__/region.test.ts`
Expected: PASS.

- [ ] **Step 4: Wire the detail page**

In `src/app/events/[id]/page.tsx`:

1. Import `CancelControls`, `eventCardLabel` and `NeedLabel`, and `EventStatus` from `@prisma/client`.
2. After `const venue = ...`, add:

```ts
  const isCancelled = event.status === EventStatus.CANCELLED
  // Brightness carries the state, never hue: the same device the roster
  // below already uses for IN / HAVEN'T REPLIED / OUT. The owner is
  // red/green colourblind and the status ladder is hue-free by rule.
  const detailInk = isCancelled ? "var(--text-secondary)" : "var(--text-primary)"
```

3. Render the label above the title, inside the details card's padded region and before the `<h1>`:

```tsx
            {isCancelled && (
              <p style={{ marginBottom: "8px" }}>
                <NeedLabel value={eventCardLabel(true, null)} />
              </p>
            )}
```

4. Change the `<h1>`'s `color` and each `DetailRow`'s `color` to `detailInk`. `DetailRow` takes its colour inline today, so add an optional `color` prop defaulting to `var(--text-primary)` and pass `detailInk` from each call site.

5. Suppress the RSVP footer band when cancelled, and put the controls in its place:

```tsx
          {viewer && (
            <div
              style={{
                borderTop: "1.6px solid var(--hairline)",
                padding: "13px 16px",
                backgroundColor: "transparent",
              }}
            >
              {isCancelled ? (
                <CancelControls eventId={event.id} groupId={event.group.id} isCancelled />
              ) : (
                <>
                  <RsvpControls
                    eventId={event.id}
                    currentStatus={viewerStatus}
                    groupId={event.group.id}
                  />
                  {/* Below the RSVP pair on purpose: the screen's primary ask
                      is still the RSVP, and calling the plan off is the rarer
                      move. No such control on the home card (decision 5): the
                      card region's height budget was won by a whole slice and
                      a control there spends it. */}
                  <div style={{ marginTop: "13px" }}>
                    <CancelControls
                      eventId={event.id}
                      groupId={event.group.id}
                      isCancelled={false}
                    />
                  </div>
                </>
              )}
            </div>
          )}
```

6. Hide "Add to calendar" when cancelled:

```tsx
        {/* Hidden on a called-off plan: there is nothing to save. The honest
            gap this leaves is registered as debt in the spec, and it is real:
            a member who already saved the plan still gets buzzed, and there
            is no path here to re-fetch an .ics carrying STATUS:CANCELLED.
            The subscribable feed (build-notes §6) is the actual fix. */}
        {!isCancelled && (
          <div style={{ marginBottom: "16px" }}>
            <AddToCalendarButton eventId={event.id} />
          </div>
        )}
```

7. Leave the roster card exactly as it is. The detail screen carries completeness, and those answers still exist because a cancel touches no RSVP row. Add a one-line comment above it saying so, or a future reader will read its survival as an oversight.

- [ ] **Step 5: Typecheck and run the suite**

Run: `npx tsc --noEmit` then `npm test`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add "src/app/events/[id]/page.tsx" src/lib/cards/region.ts src/lib/cards/__tests__/region.test.ts
git commit -m "Show a called-off plan as called off on its own page"
```

---

## Task 8: The group home card

**Files:**
- Modify: `src/app/groups/[id]/EventCard.tsx`
- Modify: `src/app/groups/[id]/page.tsx` (pass the flag through)
- Modify: `src/app/groups/[id]/__tests__/EventCard.test.tsx` (or create it if absent)

**Interfaces:**
- Consumes: `eventCardLabel` and `CANCELLED_LABEL` (task 7); `event.status`.
- Produces: `EventCard`'s `event` prop gains `status: EventStatus`. No other signature change.

- [ ] **Step 1: Write the failing test**

In `src/app/groups/[id]/__tests__/EventCard.test.tsx`:

```tsx
  it("reads as called off, with no answer row and no counts", () => {
    render(
      <EventCard
        event={{
          id: "e1",
          title: "Tennis",
          startsAt: new Date("2099-06-14T18:00:00Z"),
          endsAt: null,
          status: EventStatus.CANCELLED,
          venues: [],
        }}
        groupId="g1"
        timeZone="UTC"
        inCount={4}
        outCount={1}
        pendingCount={3}
        viewerStatus={null}
        viewerHasSession
      />
    )

    expect(screen.getByText("Called off")).toBeInTheDocument()
    // The answer row goes: there is nothing to be in or out for.
    expect(screen.queryByRole("button", { name: /I'm in/i })).toBeNull()
    // The counts go: a tally under a called-off game reads as attendance for
    // something that is not happening.
    expect(screen.queryByText(/4 In/)).toBeNull()
    expect(screen.queryByText(/Needs your RSVP/)).toBeNull()
  })

  it("is unchanged for a live plan", () => {
    render(
      <EventCard
        event={{
          id: "e1",
          title: "Tennis",
          startsAt: new Date("2099-06-14T18:00:00Z"),
          endsAt: null,
          status: EventStatus.SCHEDULED,
          venues: [],
        }}
        groupId="g1"
        timeZone="UTC"
        inCount={4}
        outCount={1}
        pendingCount={3}
        viewerStatus={null}
        viewerHasSession
      />
    )

    expect(screen.getByText(/4 In/)).toBeInTheDocument()
    expect(screen.getByText("Needs your RSVP")).toBeInTheDocument()
    expect(screen.queryByText("Called off")).toBeNull()
  })
```

If the file does not exist, create it and copy the render harness from a sibling component test in that directory.

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run "src/app/groups/[id]/__tests__/EventCard.test.tsx"`
Expected: FAIL, the counts and RSVP controls still render.

- [ ] **Step 3: Change the card**

In `src/app/groups/[id]/EventCard.tsx`:

1. Add `status: EventStatus` to the `event` prop's inline type, and import `EventStatus` from `@prisma/client`.
2. Replace the `needLabel` line:

```ts
  const isCancelled = event.status === EventStatus.CANCELLED
  // The status rung sits above the need ladder: a called-off plan needs
  // nothing from anybody, so no need label can outrank it.
  const needLabel = viewerHasSession || isCancelled ? eventCardLabel(isCancelled, viewerStatus) : null
```

Import `eventCardLabel` in place of `eventNeedLabel`.
3. Step the title and metadata down to `var(--text-secondary)` when `isCancelled`.
4. Suppress the counts text when cancelled, keeping the label in its row:

```tsx
            {!isCancelled && (
              <p style={{ /* unchanged counts styling */ }}>{countsLabel}</p>
            )}
```

Leave the wrapping flex row itself in place so the label keeps its position; the label's `marginLeft: "auto"` already handles the now-empty row.
5. Suppress the RSVP block:

```tsx
        {/* No answer row on a called-off plan, and no cancel control here
            either (decision 5): the card region's height budget was won by a
            whole slice, 47.7% of the screen down to 34%, and a control here
            spends it. Calling a plan off lives on its own page. */}
        {viewerHasSession && !isCancelled && (
```

6. Add a header comment recording the deliberate disagreement with the detail screen:

```
// Cancel-one-occurrence slice: a called-off card drops its counts while the
// detail screen KEEPS its roster. That is on purpose, not an inconsistency
// to fix later: the preview card shows the gist and the gist is that it is
// off, while the detail screen carries completeness and those answers still
// exist, because a cancel touches no RSVP row.
```

- [ ] **Step 4: Pass the flag through the page**

In `src/app/groups/[id]/page.tsx`, the `EventCardData` shape already carries the whole `event` row from `findUpcomingEvents`, so `status` flows through with no change. Confirm by typechecking. **`findUpcomingEvents` itself stays status-blind**: the card must still show the called-off plan, which is the point of the slice.

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run "src/app/groups/[id]/__tests__/EventCard.test.tsx"`
Expected: PASS.

- [ ] **Step 6: Typecheck and run the suite**

Run: `npx tsc --noEmit` then `npm test`
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add "src/app/groups/[id]/EventCard.tsx" "src/app/groups/[id]/__tests__/EventCard.test.tsx"
git commit -m "Stop the home card offering an RSVP to a game that is off"
```

---

## Task 9: Stop the digest nagging about a called-off game

The smaller of the two digest changes, and the one that fixes an active defect: a Thursday cancellation currently produces a Friday digest telling the group to RSVP to a game that is not happening.

**Files:**
- Modify: `src/lib/digest/run.ts:212`
- Modify: `scripts/send-test-digest.ts:216`
- Modify: `src/lib/digest/__tests__/run.test.ts`

**Interfaces:**
- Consumes: `EventStatus`.
- Produces: no signature change. `upcomingEvents` in `runDigestForGroup` now excludes cancelled rows.

- [ ] **Step 1: Write the failing test**

In `src/lib/digest/__tests__/run.test.ts`, following that file's existing fixture style:

```ts
  it("does not ask anyone to RSVP to a plan that has been called off", async () => {
    await prisma.event.update({
      where: { id: eventId! },
      data: { status: EventStatus.CANCELLED, cancelledAt: new Date() },
    })

    const result = await runDigestForGroup(/* the shape this file already uses */)

    // With the only upcoming plan called off, the needs-you block has
    // nothing in it, so nothing is sent unless another block fires.
    expect(result.status).toBe("skipped")
  })
```

Adapt the call and the assertion to the file's own helpers; read three neighbouring tests first.

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/lib/digest/__tests__/run.test.ts`
Expected: FAIL, the digest still lists the cancelled plan.

- [ ] **Step 3: Filter the query**

In `src/lib/digest/run.ts`, line 212:

```ts
  const upcomingEvents: EventRow[] = await prisma.event.findMany({
    where: {
      groupId: group.id,
      startsAt: { gte: now },
      // A called-off plan asks nothing of anybody. Without this the digest
      // makes a cancellation WORSE than silent: a Thursday cancellation
      // produces a Friday email telling the group to RSVP to a game that is
      // not happening.
      status: EventStatus.SCHEDULED,
    },
    orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }],
    include: { venues: true },
  })
```

Add `EventStatus` to that file's `@prisma/client` import.

- [ ] **Step 4: Move the hand-run script with it**

Apply the identical `status: EventStatus.SCHEDULED` filter at `scripts/send-test-digest.ts:216`, with a one-line comment pointing at `run.ts` as the source of truth. A hand-run script that quietly stops matching production is worse than no script.

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run src/lib/digest/__tests__/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/digest/run.ts scripts/send-test-digest.ts src/lib/digest/__tests__/run.test.ts
git commit -m "Stop the digest nagging about a game that is off"
```

---

## Task 10: Tell a member, in the digest, what got called off

Derived from event rows rather than from Orbit's prose, which is what keeps the "you missed" block's MEMBER-only rule intact and avoids reopening "which Orbit messages qualify".

**Files:**
- Create: `src/lib/digest/cancellations.ts`
- Create: `src/lib/digest/__tests__/cancellations.test.ts`
- Modify: `src/lib/digest/compose.ts`
- Modify: `src/lib/digest/run.ts`
- Modify: `src/lib/digest/__tests__/compose.test.ts`

**Interfaces:**
- Consumes: `whenPhrase` from `src/lib/orbit/change-copy.ts` (exported in task 1).
- Produces:
  - `interface CancellationRow { id: string; title: string; activityLabel: string | null; startsAt: Date; cancelledAt: Date | null }`
  - `interface CancellationLine { title: string; whenLine: string }`
  - `deriveCancellations(input: { events: CancellationRow[]; lastSeenAt: Date | null; lastDigestSentAt: Date | null; joinedAt: Date; timeZone: string; now: Date }): CancellationLine[]`
  - `ComposeDigestInput` gains `cancellations: CancellationLine[]`

- [ ] **Step 1: Write the failing test**

Create `src/lib/digest/__tests__/cancellations.test.ts`:

```ts
// Pure: rows in, decided lines out. No Prisma, no clock of its own.
import { describe, it, expect } from "vitest"
import { deriveCancellations } from "../cancellations"

const TZ = "America/New_York"
const NOW = new Date("2026-09-06T15:00:00Z")
const JOINED = new Date("2026-08-01T00:00:00Z")

function row(over: Partial<Parameters<typeof deriveCancellations>[0]["events"][0]> = {}) {
  return {
    id: "e1",
    title: "Tennis",
    activityLabel: "tennis",
    startsAt: new Date("2026-09-08T23:00:00Z"),
    cancelledAt: new Date("2026-09-06T12:00:00Z"),
    ...over,
  }
}

describe("deriveCancellations", () => {
  it("reports a cancellation the member has not seen", () => {
    const lines = deriveCancellations({
      events: [row()],
      lastSeenAt: new Date("2026-09-06T09:00:00Z"),
      lastDigestSentAt: null,
      joinedAt: JOINED,
      timeZone: TZ,
      now: NOW,
    })
    expect(lines).toEqual([{ title: "Tennis", whenLine: "this Tue" }])
  })

  it("says nothing about a cancellation the member already saw", () => {
    const lines = deriveCancellations({
      events: [row()],
      lastSeenAt: new Date("2026-09-06T14:00:00Z"),
      lastDigestSentAt: null,
      joinedAt: JOINED,
      timeZone: TZ,
      now: NOW,
    })
    expect(lines).toEqual([])
  })

  it("uses the later of the visit and the last email as the read position", () => {
    const lines = deriveCancellations({
      events: [row()],
      lastSeenAt: new Date("2026-09-06T09:00:00Z"),
      lastDigestSentAt: new Date("2026-09-06T14:00:00Z"),
      joinedAt: JOINED,
      timeZone: TZ,
      now: NOW,
    })
    expect(lines).toEqual([])
  })

  it("falls back to the join time when the member has neither", () => {
    const lines = deriveCancellations({
      events: [row()],
      lastSeenAt: null,
      lastDigestSentAt: null,
      joinedAt: JOINED,
      timeZone: TZ,
      now: NOW,
    })
    expect(lines).toHaveLength(1)
  })

  it("ignores a row carrying no cancelledAt", () => {
    const lines = deriveCancellations({
      events: [row({ cancelledAt: null })],
      lastSeenAt: null,
      lastDigestSentAt: null,
      joinedAt: JOINED,
      timeZone: TZ,
      now: NOW,
    })
    expect(lines).toEqual([])
  })

  it("caps at three, newest first", () => {
    const events = [1, 2, 3, 4, 5].map((n) =>
      row({
        id: `e${n}`,
        title: `Game ${n}`,
        cancelledAt: new Date(`2026-09-0${n}T12:00:00Z`),
      })
    )
    const lines = deriveCancellations({
      events,
      lastSeenAt: null,
      lastDigestSentAt: null,
      joinedAt: new Date("2026-08-01T00:00:00Z"),
      timeZone: TZ,
      now: NOW,
    })
    expect(lines.map((l) => l.title)).toEqual(["Game 5", "Game 4", "Game 3"])
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/lib/digest/__tests__/cancellations.test.ts`
Expected: FAIL, cannot resolve `../cancellations`.

- [ ] **Step 3: Write the module**

Create `src/lib/digest/cancellations.ts`:

```ts
// src/lib/digest/cancellations.ts
//
// What got called off since this member last looked.
//
// Derived from EVENT ROWS, never from Orbit's message prose, and that is the
// whole point of the module. The you-missed block filters to
// MessageAuthor.MEMBER by a settled rule, so Orbit's cancellation
// announcement can never appear there; widening that filter would have
// reopened "which other Orbit messages qualify", which is a design question
// rather than a filter change. Reading the rows instead keeps that rule
// intact and matches the product's structured-extract-then-format
// discipline.
//
// Pure, following you-missed.ts and needs-you.ts: rows the caller already
// fetched go in, decided lines come out. Nothing here queries or writes.
//
// Read position is the same one you-missed uses: the later of
// Membership.lastSeenAt and Membership.lastDigestSentAt, falling back to
// joinedAt. Sharing that definition is deliberate, so the two blocks can
// never disagree about what "since you last looked" means.
//
// A cancellation that was undone before the digest runs produces no line at
// all, automatically: the row is SCHEDULED again, so the caller's query
// never returns it.

import { whenPhrase } from "@/lib/orbit/change-copy"

export interface CancellationRow {
  id: string
  title: string
  activityLabel: string | null
  startsAt: Date
  cancelledAt: Date | null
}

export interface CancellationLine {
  title: string
  /** "this Tue", or "on Tue, Sep 22" beyond a week: the same phrasing Orbit
   *  used in the feed, so the email and the chat never disagree. */
  whenLine: string
}

interface DeriveInput {
  /** Rows the caller already fetched, filtered to CANCELLED. Any order. */
  events: CancellationRow[]
  lastSeenAt: Date | null
  lastDigestSentAt: Date | null
  joinedAt: Date
  timeZone: string
  now: Date
}

/** How many cancellations get named. Newest first, because the soonest thing
 *  a member needs to not turn up for is the one just decided. */
const MAX_LINES = 3

function laterOf(a: Date | null, b: Date | null): Date | null {
  if (a && b) return a.getTime() >= b.getTime() ? a : b
  return a ?? b
}

export function deriveCancellations(input: DeriveInput): CancellationLine[] {
  const readPosition = laterOf(input.lastSeenAt, input.lastDigestSentAt) ?? input.joinedAt

  return input.events
    .filter(
      (e) => e.cancelledAt !== null && e.cancelledAt.getTime() > readPosition.getTime()
    )
    .sort((a, b) => b.cancelledAt!.getTime() - a.cancelledAt!.getTime())
    .slice(0, MAX_LINES)
    .map((e) => ({
      title: e.title,
      whenLine: whenPhrase(e.startsAt, input.timeZone, input.now),
    }))
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `npx vitest run src/lib/digest/__tests__/cancellations.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write the failing compose test**

In `src/lib/digest/__tests__/compose.test.ts`:

```ts
  it("names what got called off, above the chat the member missed", () => {
    const email = composeDigestEmail({
      /* ...the shape this file already uses... */
      needsYou: [],
      youMissed: null,
      cancellations: [{ title: "Tennis", whenLine: "this Tue" }],
    })

    expect(email).not.toBeNull()
    expect(email!.text).toContain("Called off: Tennis this Tue")
    expect(email!.html).toContain("Tennis this Tue")
  })

  it("sends on a cancellation alone", () => {
    const email = composeDigestEmail({
      /* ... */
      needsYou: [],
      youMissed: null,
      cancellations: [{ title: "Tennis", whenLine: "this Tue" }],
    })
    expect(email).not.toBeNull()
  })

  it("still sends nothing when all three blocks are empty", () => {
    const email = composeDigestEmail({
      /* ... */
      needsYou: [],
      youMissed: null,
      cancellations: [],
    })
    expect(email).toBeNull()
  })
```

- [ ] **Step 6: Run and confirm failure, then wire compose**

Run: `npx vitest run src/lib/digest/__tests__/compose.test.ts`
Expected: FAIL, `cancellations` is not a recognised input.

In `src/lib/digest/compose.ts`:

1. Import `CancellationLine` and add `cancellations: CancellationLine[]` to `ComposeDigestInput`.
2. Widen the empty gate:

```ts
export function composeDigestEmail(input: ComposeDigestInput): ComposedDigestEmail | null {
  if (
    input.needsYou.length === 0 &&
    input.youMissed === null &&
    input.cancellations.length === 0
  ) {
    return null
  }
```

3. In `buildText`, add the block ABOVE the you-missed block and below needs-you:

```ts
  if (input.cancellations.length > 0) {
    if (parts.length > 0) parts.push("")
    for (const line of input.cancellations) {
      parts.push(`Called off: ${line.title} ${line.whenLine}`)
    }
  }
```

4. In `buildHtml`, add the matching section in the same position, reusing the existing `CARD_BG` / `TEXT_PRIMARY` / `TEXT_SECONDARY` literals and the surrounding section markup. Do not introduce a new colour, and do not use red: status is never hue in this product.
5. Leave `buildSubject` alone unless every block but cancellations is empty; in that case the subject must still describe the email honestly. Read `buildSubject` and extend it so a cancellation-only digest gets a subject naming the group rather than falling through to a needs-you phrase that is not true.

- [ ] **Step 7: Wire `run.ts`**

In `src/lib/digest/run.ts`, after the memberships load:

```ts
  // One query for the whole group, filtered per member by the pure module.
  // Bounded by the earliest read position across the group's members, so a
  // long-dormant member cannot make this unbounded.
  const earliestWatermark = memberships.reduce<Date>(
    (earliest, m) => {
      const seen = m.lastSeenAt
      const sent = m.lastDigestSentAt
      const later = seen && sent ? (seen > sent ? seen : sent) : (seen ?? sent ?? m.joinedAt)
      return later < earliest ? later : earliest
    },
    now
  )
  const cancelledEvents = await prisma.event.findMany({
    where: {
      groupId: group.id,
      status: EventStatus.CANCELLED,
      cancelledAt: { gte: earliestWatermark },
    },
    select: {
      id: true,
      title: true,
      activityLabel: true,
      startsAt: true,
      cancelledAt: true,
    },
  })
```

Then, inside the per-member loop where `deriveYouMissed` is already called, add:

```ts
    const cancellations = deriveCancellations({
      events: cancelledEvents,
      lastSeenAt: membership.lastSeenAt,
      lastDigestSentAt: membership.lastDigestSentAt,
      joinedAt: membership.joinedAt,
      timeZone: group.timeZone,
      now,
    })
```

and pass `cancellations` into `composeDigestEmail`. Confirm the memberships query selects `lastSeenAt`, `lastDigestSentAt` and `joinedAt`; widen its `include`/`select` if it does not.

- [ ] **Step 8: Run the digest suite and the full suite**

Run: `npx vitest run src/lib/digest/__tests__/` then `npm test`
Expected: both PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/digest src/lib/digest/__tests__ scripts/send-test-digest.ts
git commit -m "Tell a member by email what the group called off while they were away"
```

---

## Task 11: See it, then write down what happened

Nothing here is optional. The record is what makes the next session's context true, and the browser pass is the only evidence this slice's visual claims have.

**Files:**
- Modify: `docs/build-notes.md` (§11 entry, and the after-launch list)
- Modify: `CLAUDE.md` ("Where the build is")

- [ ] **Step 1: Run the whole suite and record the number**

Run: `npm test`
Expected: PASS. Write down the passed and total counts; they go in the record and in the PR body against the 1581/140 baseline.

- [ ] **Step 2: Browser pass at 375x812**

Start the dev server through the Browser pane (never `npm run dev` in Bash), then walk five states and screenshot each:

1. A live plan's card on the group home: RSVP pair present, counts present, no CANCELLED label.
2. A live plan's detail screen: "Call this off" below the RSVP pair, "Add to calendar" present.
3. The confirm's first step: the consequence line, "Never mind" on the left.
4. The cancelled card: CANCELLED label, no counts, no RSVP pair.
5. The cancelled detail screen: label above the title, dimmed details, "Put this back on", no "Add to calendar", roster still there.

Also confirm Orbit's two announcements actually render in the feed with the right names and dates, and that the card region has not grown taller than it was before this slice.

- [ ] **Step 3: Real-phone pass**

Triggered by rule: both card faces change and the card region's height budget is in play. Serve on the machine's LAN address, look at the group home and the event detail on the phone, fold anything it surfaces into the QA script. Stop the dev server afterwards, including any stray one serving this project.

- [ ] **Step 4: Add the deploy obligation**

Append the migration to build-notes' "After launch" list as its own numbered item: one migration (`add_event_status`) must be applied to production before this merges. Note that it needs no backfill.

- [ ] **Step 5: Write the build-notes §11 entry**

400 to 600 words. Record what was decided along the way, not a retelling of the tasks. It must carry:

- Why the row is never deleted, with the `hasUpcomingScheduledEvent` mechanism stated plainly, because that is the thing a future session is most likely to undo.
- Why RSVPs survive, and that this is what makes "anyone can undo it" safe rather than merely permitted.
- Why this announcement names a person when every other Orbit announcement is impersonal, and that it is the product's first stored Orbit body containing a member's name, with the person-deletion consequence.
- The four read sites beyond the digest, and that the worst of them would have left the group unable to reschedule the game they just called off.
- Why the digest's "you missed" widening was done from event rows rather than by widening the MEMBER filter.
- The deliberate card-versus-detail disagreement about counts.
- The two debts: the stored name, and the saved calendar entry that still buzzes.
- The honest limit: the digest fires at 8pm group-local and is not a cancellation alert.

- [ ] **Step 6: Update CLAUDE.md's "Where the build is"**

Add a paragraph in the file's established voice saying what is now true: a member can call off one occurrence from its own page in two taps, anyone can put it back, RSVPs survive both, the row is never deleted and why, and what is deliberately still missing (the group-vote cancellation, the immediate email, Orbit hearing "rained out"). Amend rather than rewrite the surrounding entries, per the append-only rule.

- [ ] **Step 7: Commit**

```bash
git add docs/build-notes.md CLAUDE.md
git commit -m "Record how calling off one game was settled and built"
```

- [ ] **Step 8: Open the PR**

Follow `~/.claude/checklists/pr-handoff.md`. The PR body stays near 300 words and carries: what changed in a few bullets; the test numbers before (1581/140) and after, what was checked by hand and what could not be; what the independent review found, fixed, and deliberately did not fix; and a pointer to build-notes §11. The QA script and any open questions go in the chat message, not the PR body.

**Do not merge.** Open the PR and stop.

---

## Self-review notes

**Spec coverage.** Every spec section maps to a task: §2 data model → task 2; §3 mechanism → task 2 and task 6; §4 appearance → tasks 7 and 8; §5 RSVPs → task 2 steps 4 and 8; §6 copy → task 1; §7 read sites → tasks 3, 4 and 5; §8 digest → tasks 9 and 10; §9 verification → distributed, with the by-hand passes in task 11; §10 debt and §11 deploy obligation → task 11.

**Interface consistency.** `eventCardLabel(isCancelled, viewerRsvp)` is defined in task 7 and consumed in task 8 under that exact name. `CancelEventState` is defined in task 6 and used by `CancelControls` in the same task. `CancellationLine` is defined in task 10 and consumed by `compose.ts` in the same task. `MoveEventResult`'s reason union gains `"cancelled"` in task 4, and task 4 step 4 explicitly sends the implementer to every consumer of it.

**Known soft spots for the implementer to resolve by reading, not guessing.** Task 5's detect-intent tests and task 9's digest test both say to match the existing file's stubbing and fixture helpers rather than inventing new ones; those files' internals were not read line by line while writing this plan. Task 3's reconcile test names fixture variables that must be adapted to that file's own.
