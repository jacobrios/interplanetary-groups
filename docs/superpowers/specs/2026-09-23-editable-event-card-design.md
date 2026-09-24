# The editable event card

A plan created from a floated idea can never get a place, and nothing in the product can
correct any existing plan's place, title, day or time. This slice gives every plan an
Edit control on its own page.

## Settled, do not relitigate (owner, 23 Sept 2026)

- **Anyone in the group edits; Orbit names who.** The cancel precedent.
- **Place and title save directly. Day and time open the existing group vote**, with the
  editor counted as a yes; the vote gains the ability to move the day.
- **One Orbit line per save**, naming the person and the old and new values. Revert is
  another edit. A rename also changes what Orbit calls the plan.
- **Place and title leave RSVPs untouched**; day and time keep the vote's reset.
- **Saved calendar entries stay stale**; re-adding hands out a newer version.
- **The edit lives on the plan's page**, not the home card.
- **The onboarding required-venue revert moves to the group-details slice**, because an
  edit fixes one occurrence and the rhythm would recreate the missing venue weekly.

## Non-goals

- Editing the rhythm: the parked group-details slice.
- Changing day or place by chat: verbal group two (queue item 5).
- Onboarding asking for place alongside time: queued, below.

## Verified by

Tests for every save, refusal, announcement and the vote's day change, plus the hourly
job meeting a moved day. Not tested: the screen's look (browser walkthrough plus real
phone). One paid bench case for the changed refusal copy.

## Debt it opens

See "Debt" at the end.

---

## Design detail (for the executing agents)

### Where it lives

`src/app/events/[id]/page.tsx`. A quiet text control, "Edit", on the details card (never
teal: a secondary action). It reveals an inline form in the details card, not a modal and
not a new route. The form is built from the field language the onboarding playback card
already uses (the group-name input and the 4 Sept venue field): 16px inputs so iOS does
not zoom, hairline borders, token colours mapped by value. No design handoff exists;
this is a form in an existing visual language, recorded as a declared choice.

Fields, prefilled from the stored plan: **Title**, **Place** (optional), **Day**,
**Time**. Buttons: "Save" (teal, it is the form's one real action) and "Never mind"
(text link).

Shown only to a member, only while the plan is SCHEDULED and has not started. A
called-off plan shows no Edit (put it back on first). A started plan shows no Edit.

### Place and title: the direct path

A new module `src/lib/events/edit-details.ts` (this is the write path the parked
group-details slice reuses; keep it free of anything card-specific). One transaction:

1. Re-read the event. Refuse `no_event`, `cancelled`, `already_started`, and `noop`
   (nothing actually changed after trimming).
2. Title: trimmed, 1-50 characters. Writes `title` and sets `activityLabel` to the new
   title as typed, so Orbit's copy and the duplicate-idea guard key off the new name.
   (Not lowercased, amended during planning: lowercasing turns "Pool at Sam's" into
   "Pool at sam's" once `cap()` restores only the first letter. The duplicate guard is
   already case-insensitive.)
3. Place: trimmed, 0-80 characters. Empty clears it. Update the existing first Venue row
   **in place** (never delete-and-recreate: that nulls any `Rsvp.venueId`). If none
   exists, create one. Clearing deletes the row. A place change also clears that row's
   `address` and `displayLabel`, so the calendar can never pair a new name with an old
   street address.
4. **Always touch `Event.updatedAt`** in the same transaction, even for a place-only
   edit, because the calendar file's SEQUENCE is derived from it
   (`src/lib/events/ics.ts`). Without this, re-adding hands out a file that looks like the
   old version.
5. RSVPs are not touched. `scheduledKey` and `gaugeId` are never touched.
6. Write exactly one Orbit message, composed by the caller (the cancel pattern), naming
   the editor.

Copy, in a new `src/lib/orbit/edit-copy.ts` (plain voice, no em dashes, three-letter
weekdays, `whenPhrase` as cancel uses it):

- Place changed: "Sam changed the spot for Beers this Fri, from Rusty Anchor to Sam's
  place. Anyone can change it back on the plan's page."
- Place added: "Sam set the spot for Beers this Fri: Sam's place."
- Place cleared: "Sam removed the spot for Beers this Fri (it was Rusty Anchor). Anyone
  can change it back on the plan's page."
- Renamed: "Sam renamed Beers this Fri to Pool at Sam's. Anyone can change it back on
  the plan's page."
- Both: one message, rename first, then the spot clause.

The name in the message is the person's stored name at write time, the same as cancel's
announcements (and the same deletion debt).

Server action: `src/app/actions/edit-event.ts`, modelled on
`src/app/actions/cancel-event.ts`'s `resolveActor` (member check server-side, a removed
member's stale tab refused), per-reason error strings, `revalidatePath` for the event
and the group home.

### Day and time: the vote path

If Day or Time differ from the stored plan, Save opens a GROUP proposal through
`createGroupProposal` (`src/lib/proposals/create.ts`) with the editor as asker (their
yes is seeded there already). Everything downstream exists: tally, consensus bar,
promotion through `moveEventCoreInTx` (RSVP reset, yes voters carried as IN), LAPSED and
SUPERSEDED endings, the per-viewer "your vote counted" line.

What must change:

- **No source message.** `ChangeProposal.sourceMessageId` is required and points at the
  member's chat message; a card edit has none. Make it nullable (a migration; see the
  deploy obligation). Do not point it at the Orbit message: it would claim the member
  said something they did not.
- **The vote's words must carry the day when it changes.** Every place that renders a
  proposal's times (`src/lib/orbit/change-copy.ts` including the chips at `:221-222`,
  the ask, the consensus announcement, the event-screen question, and through the chips
  the digest's time-change block) shows the
  weekday when proposed and prior fall on different days in the group's timezone: "Move
  to Thu 8pm" / "Keep Tue 7pm". Unchanged when the day is the same. The LAPSED line is
  untouched: it names only the time the plan is staying at, on its own day.
- **Refusals:** a time in the past, and, for a plan made by the rhythm (`gaugeId` null),
  a day on or after that rhythm's next regular occurrence. Moving past it would make the
  hourly job skip that week silently, because its guard sees an upcoming plan.
  Refusal copy names the limit plainly.
- If both place/title and day/time changed in one save: the direct fields save first
  (their announcement posts), then the vote opens (its ask posts). Two messages, in that
  order, is correct: they are two different kinds of change.

After Save, the editor is back on the plan's page, where the vote already renders with
their yes checked.

### Orbit's chat refusals become pointers

`buildCantDoReply` (`src/lib/orbit/change-copy.ts:139-153`) carries a DEBT note naming
this slice. The spot and day lines become pointers: "I can't change the spot from chat,
but anyone can on the plan's page." Keep the word "spot": `evals/detect/cases.ts:232`
asserts it. Run that one bench case (`npm run eval:detect -- 5 <case>`); it costs money
and hits the network.

### The hourly job and a moved day

`hasUpcomingScheduledEvent` ignores status and gauge plans; `scheduledKey` never changes.
Tests must pin: a rhythm plan moved earlier is not recreated at its old slot after it
passes (key collision skip); a rhythm plan moved later within the week produces no
duplicate and no missing week; the refusal above prevents the skipped-week case.

### Records to update in this slice

- CLAUDE.md: the "venue stopped hiding" paragraph's "it reverts when the editable event
  card ships" gets a dated amendment moving the trigger to the group-details slice; and
  the current-state section at the end.
- `Step2Playback.tsx`'s comment naming this slice as the revert trigger, amended to match.
- build-notes §11 entry, with the baseline: **1928 passing across 162 files** at
  291ead3, run 23 Sept 2026 at slice start, matching the previous slice's finish.
- Queued in build-notes: (1) onboarding's follow-up question should show the place field
  alongside the time, and stop saying "One question"; (2) whether venue stays required at
  onboarding permanently, owner leaning yes, settled in the group-details slice; (3) going
  back from step 2 regenerates the suggested group name, recommended decline unless an
  edited name is ever lost.

### Debt

- **An edit fixes one occurrence, never the rhythm.** Next week's plan returns to the
  rhythm's values. The group-details slice is the fix.
- **Saved calendar entries go stale**; the subscribable calendar (queue item 6) is the fix.
- **More stored messages name a member**; person deletion cannot reach them (cancel's
  existing debt, widened).
- **Renaming a rhythm plan lets a duplicate idea for its old name through** the
  duplicate-idea guard until that plan passes.
- **Deploy obligation:** the `sourceMessageId` migration goes on the pre-deploy
  checklist in this PR and must reach production before the merge.
- Real calendar apps replacing rather than duplicating a re-added entry: unverified.

---

# Implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Any member can fix a plan's place and title directly, and propose a new day or time through the existing group vote, from the plan's own page.

**Architecture:** A copy-free write path (`src/lib/events/edit-details.ts`) for place and title, reusable by the parked group-details slice; a pure limits check (`src/lib/events/edit-limits.ts`); an orchestration function (`src/lib/events/submit-edit.ts`) that the thin server action calls; day/time changes reuse `createGroupProposal`, made able to open without a source chat message. Copy lives in `src/lib/orbit/edit-copy.ts` and `change-copy.ts`.

**Tech Stack:** Next.js 16, Prisma 7 (dev-test Supabase Postgres), Vitest (+ jsdom for components, `fireEvent`, never `user-event`).

**Spec:** the design above, in this same file.

## Global Constraints

- Orbit copy: plain voice, no em or en dashes, three-letter weekdays, soft declines.
- Everything renders in the group's timezone (`group.timeZone`), never viewer-local. Tests pass the zone explicitly and never depend on the machine's timezone or clock.
- Teal only for the form's Save; "Edit" and "Never mind" are text controls. Status never by hue.
- Inputs at 16px (`1rem`) so iOS does not zoom. Layout grows, never clips (`minHeight`, never `height`).
- Two databases, never crossed: run `npm run db:which` before any migration; it must print the dev-test ref `pxbewardwvoyqqcvogel`. Never read `.env`.
- Hooks block direct edits to migration files: generate migrations only through `npx prisma migrate dev --name <name>`.
- Tests build their own fixtures (`[TEST]` names, 2099 dates) and clean up in FK order; they never lean on existing rows.
- No model calls anywhere in this slice. The bench run in Task 8 is hand-run, costs money, and never enters the suite.
- Route directories contain brackets (`[id]`): quote paths in shell commands.
- Baseline before this slice: 1928 passing across 162 files.

---

### Task 1: A group vote can open without a chat message

**Files:**
- Modify: `prisma/schema.prisma` (ChangeProposal, `sourceMessageId` and `sourceMessage`)
- Create: migration via `npx prisma migrate dev --name proposal_source_optional`
- Modify: `src/lib/proposals/create.ts` (`CreateGroupProposalInput`, `createGroupProposal`)
- Modify: `docs/build-notes.md` (after-launch list, new item 18 after item 17)
- Test: `src/lib/proposals/__tests__/create.test.ts` (add cases; read the file's existing fixture helpers first and reuse them)

**Interfaces:**
- Produces: `createGroupProposal({ ..., sourceMessageId: string | null, ... })`. With `null`, a second call by the same asker for the same event and the same `proposedStartsAt` while the first is still unanswered returns `{ status: "skipped", reason: "already_asked" }` and writes nothing (the null source loses the compound-unique idempotency the chat path relies on; this restores it for a double-tapped Save).

- [ ] **Step 1: Write the failing tests** in `create.test.ts`:

```ts
it("opens a GROUP proposal with no source message", async () => {
  const result = await createGroupProposal({
    groupId, eventId, askerUserId: userId,
    sourceMessageId: null,
    proposedStartsAt: PROPOSED, priorStartsAt: START,
    body: "[TEST] ask",
  })
  expect(result.status).toBe("created")
  if (result.status !== "created") return
  expect(result.proposal.sourceMessageId).toBeNull()
  const votes = await prisma.proposalVote.findMany({ where: { proposalId: result.proposal.id } })
  expect(votes.map((v) => v.userId)).toEqual([userId])
})

it("a double-submitted card ask with no source message opens once", async () => {
  const input = {
    groupId, eventId, askerUserId: userId, sourceMessageId: null,
    proposedStartsAt: PROPOSED, priorStartsAt: START, body: "[TEST] ask",
  }
  const first = await createGroupProposal(input)
  const second = await createGroupProposal(input)
  expect(first.status).toBe("created")
  expect(second).toEqual({ status: "skipped", reason: "already_asked" })
  expect(await prisma.changeProposal.count({ where: { eventId, answer: null } })).toBe(1)
  expect(await prisma.message.count({ where: { groupId, authorType: "ORBIT" } })).toBe(1)
})
```

(Use the file's existing `groupId`/`eventId`/`userId`/`START` fixtures; define `PROPOSED` one hour after `START` if the file has no equivalent.)

- [ ] **Step 2: Run to verify they fail.** `npx vitest run src/lib/proposals/__tests__/create.test.ts` : type error or FAIL on `sourceMessageId: null`.

- [ ] **Step 3: Schema.** In `ChangeProposal`: `sourceMessageId String?` and `sourceMessage Message? @relation("ProposalSource", fields: [sourceMessageId], references: [id], onDelete: Cascade)`. Keep `@@unique([sourceMessageId, kind])` (Postgres treats NULLs as distinct, which is why the guard below is needed). Add a schema comment: null means the proposal was opened from the plan's page, not from chat.

- [ ] **Step 4: Migrate dev-test.** `npm run db:which` (must say DEV-TEST), then `npx prisma migrate dev --name proposal_source_optional`. Confirm the generated SQL is only `ALTER TABLE "ChangeProposal" ALTER COLUMN "sourceMessageId" DROP NOT NULL;`. Anything else: stop and report.

- [ ] **Step 5: Implement.** In `createGroupProposal`, type `sourceMessageId: string | null`, and inside the transaction, after the stale check and before the supersede `updateMany`:

```ts
// A card ask has no chat message, so the (sourceMessageId, kind) unique
// cannot catch a double-tapped Save. This does: the same person asking the
// same thing about the same plan, still unanswered, is the same ask.
if (sourceMessageId === null) {
  const duplicate = await tx.changeProposal.findFirst({
    where: {
      eventId, askerUserId, kind: ProposalKind.GROUP, answer: null,
      proposedStartsAt,
    },
    select: { id: true },
  })
  if (duplicate) throw new DuplicateCardAskInTx()
}
```

Declare `class DuplicateCardAskInTx extends Error {}` beside `StaleEventInTx`, and map it in the catch to `{ status: "skipped", reason: "already_asked" }`. Update the `sourceMessageId` doc comment on the input interface. Fix any type errors this causes elsewhere (`npx tsc --noEmit`): readers of `proposal.sourceMessageId` (for example `src/app/actions/proposal-answer.ts:146`) pass a VERIFY proposal's id, which is always non-null; narrow with a comment rather than a non-null assertion where possible.

- [ ] **Step 6: Deploy obligation.** Append item 18 to the after-launch list in `docs/build-notes.md` (directly after item 17, before "### Data-foundation slice"), in the house form: bold imperative title "Run the proposal-source migration against production before the editable-event-card branch merges to main."; the command and method copied from item 1 (`DIRECT_URL="<production session-pooler URL>" npx prisma migrate deploy` inline, port 5432, then `npm run db:which`); *Why it matters*: purely additive (drops a NOT NULL), so running it first is safe for the live code, which always writes a value; running it after the merge means the first card edit of a day or time fails with a database error; *Detail*: migration name.

- [ ] **Step 7: Verify.** `npx vitest run src/lib/proposals` PASS; `npx tsc --noEmit` clean.

- [ ] **Step 8: Commit** (schema, migration folder, create.ts, test, build-notes, any narrowing fixes): "A group vote can open from the plan's page, with no chat message behind it".

---

### Task 2: The vote's words carry the day when the day changes

**Files:**
- Modify: `src/lib/orbit/change-copy.ts`
- Modify: `src/lib/pending/derive.ts:95` (call site of `proposalBandQuestion`)
- Modify: `src/app/actions/detect-intent.ts:151` (context line for the model)
- Test: `src/lib/orbit/__tests__/change-copy.test.ts`

**Interfaces:**
- Produces: `timeLabelAgainst(at: Date, other: Date, timeZone: string): string` returns `"8pm"` when `at` and `other` fall on the same local calendar day in `timeZone`, else `"Thu 8pm"`.
- Changes: `proposalBandQuestion(eventTitle: string, proposedStartsAt: Date, priorStartsAt: Date, timeZone: string)` (new third parameter).

Every existing same-day assertion in `change-copy.test.ts` must stay green unchanged: that is the proof the same-day wording did not move.

- [ ] **Step 1: Failing tests.** Add to `change-copy.test.ts` (zone `"America/Chicago"`; Tue 22 Sep 2099 19:00 CDT is `2099-09-23T00:00:00Z`; Thu 24 Sep 2099 20:00 CDT is `2099-09-25T01:00:00Z`; verify the weekdays with `formatWeekdayShort` in the test's first assertion so a wrong fixture fails loudly):

```ts
describe("a vote that changes the day names it", () => {
  const Z = "America/Chicago"
  const TUE_7PM = new Date("2099-09-23T00:00:00Z")
  const THU_8PM = new Date("2099-09-25T01:00:00Z")
  const TUE_8PM = new Date("2099-09-23T01:00:00Z")
  const NOW = new Date("2099-09-21T15:00:00Z")

  it("fixtures are the days they claim", () => {
    expect(formatWeekdayShort(TUE_7PM, Z)).toBe("Tue")
    expect(formatWeekdayShort(THU_8PM, Z)).toBe("Thu")
  })
  it("timeLabelAgainst adds the weekday only across days", () => {
    expect(timeLabelAgainst(THU_8PM, TUE_7PM, Z)).toBe("Thu 8pm")
    expect(timeLabelAgainst(TUE_8PM, TUE_7PM, Z)).toBe("8pm")
  })
  it("chips name both days", () => {
    expect(proposalChipLabels(THU_8PM, TUE_7PM, Z)).toEqual({ yes: "Move to Thu 8pm", keep: "Keep Tue 7pm" })
  })
  it("the ask names the old day", () => {
    expect(buildGroupProposalQuestion("Sam", "beers", THU_8PM, TUE_7PM, Z, NOW, null)).toBe(
      "Sam wants beers this Thu at 8pm instead of Tue 7pm. Move it?"
    )
  })
  it("the passed-vote announcement names the old day and points at the page for a revert", () => {
    expect(buildConsensusAnnouncement("beers", THU_8PM, TUE_7PM, Z, NOW)).toBe(
      "That settles it. Beers this Thu is moving to 8pm, it was Tue 7pm. I marked everyone who said yes as in; the rest of you, answer again up top. Want it back? Anyone can ask from the plan's page."
    )
  })
  it("the event-screen question names the new day", () => {
    expect(proposalBandQuestion("Beers", THU_8PM, TUE_7PM, Z)).toBe("Move Beers to Thu 8pm?")
    expect(proposalBandQuestion("Beers", TUE_8PM, TUE_7PM, Z)).toBe("Move Beers to 8pm?")
  })
})
```

(Confirm `whenPhrase` gives "this Thu" for this `NOW`; if the existing tests pin a different `THIS_WEEK_DAYS` behaviour, move `NOW` rather than the expectation.)

- [ ] **Step 2: Run, verify FAIL** (`timeLabelAgainst` undefined).

- [ ] **Step 3: Implement** in `change-copy.ts`:

```ts
/**
 * A time, with its weekday only when it falls on a different local day from
 * the time it is being compared against. A same-day vote reads exactly as it
 * always has ("Move to 8pm"); a vote that moves the day says so ("Move to
 * Thu 8pm"), because "8pm" alone would silently hide the bigger change.
 */
export function timeLabelAgainst(at: Date, other: Date, timeZone: string): string {
  const a = getLocalParts(at, timeZone)
  const b = getLocalParts(other, timeZone)
  const sameDay = a.year === b.year && a.month === b.month && a.day === b.day
  const time = formatTime(at, timeZone)
  return sameDay ? time : `${formatWeekdayShort(at, timeZone)} ${time}`
}
```

Then: `proposalChipLabels` uses `timeLabelAgainst(proposed, prior)` and `timeLabelAgainst(prior, proposed)`; `buildGroupProposalQuestion` replaces `instead of ${formatTime(priorStartsAt, timeZone)}` with `instead of ${timeLabelAgainst(priorStartsAt, proposedStartsAt, timeZone)}`; `buildConsensusAnnouncement` uses `timeLabelAgainst(oldStartsAt, newStartsAt, timeZone)` for "it was", and ends with `Want it back at ${oldTime}? Say the word.` when same day, else `Want it back? Anyone can ask from the plan's page.` (chat cannot move a day, so pointing at chat would be a promise Orbit cannot keep); `proposalBandQuestion` gains `priorStartsAt` and uses `timeLabelAgainst(proposedStartsAt, priorStartsAt, timeZone)`. Update each function's doc comment in one line. Update the caller in `derive.ts` to pass `p.priorStartsAt`, and `detect-intent.ts:151` to use `timeLabelAgainst(p.proposedStartsAt, p.priorStartsAt, group.timeZone)`.

- [ ] **Step 4: Run** `npx vitest run src/lib/orbit src/lib/pending src/lib/proposals src/lib/digest` : PASS, with every pre-existing assertion untouched. `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**: "The time-change vote names the day when the day is what changes".

---

### Task 3: The limits on a new day and time

**Files:**
- Create: `src/lib/events/edit-limits.ts`
- Test: `src/lib/events/__tests__/edit-limits.test.ts`

**Interfaces:**
- Produces:

```ts
export type EditedStartCheck =
  | { ok: true }
  | { ok: false; reason: "past" }
  | { ok: false; reason: "past_next_occurrence"; nextOccurrence: Date }

export function checkEditedStart(input: {
  event: { startsAt: Date; gaugeId: string | null; scheduledKey: string | null }
  recurringActivities: unknown
  timeZone: string
  proposedStartsAt: Date
  now: Date
}): EditedStartCheck
```

Why this exists (put it in the file header): the hourly job skips a group while a rhythm plan is upcoming (`hasUpcomingScheduledEvent`), so a rhythm plan moved on or past its rhythm's next regular slot makes that week's plan silently never exist. Floated plans (`gaugeId` set) are invisible to that guard and have no limit. The limit is measured from the plan's ORIGINAL slot (the ISO after the first `:` in `scheduledKey`), not its current time, so a plan already moved once cannot creep a week at a time.

- [ ] **Step 1: Failing tests** (pure, no database). Rhythm fixture, weekly Saturday 09:00 UTC:

```ts
const RHYTHM = [{ activity: "tennis", title: "Tennis", cadence: "weekly", daysOfWeek: [6], timeLocal: "09:00" }]
const SAT = new Date("2099-06-13T09:00:00Z")      // assert it is a Saturday in test 1
const NEXT_SAT = new Date("2099-06-20T09:00:00Z")
const NOW = new Date("2099-06-10T12:00:00Z")
const rhythmEvent = { startsAt: SAT, gaugeId: null, scheduledKey: `g1:${SAT.toISOString()}` }
```

Cases: fixture sanity (`SAT.getUTCDay() === 6`); a time before `now` is `{ ok:false, reason:"past" }` (also for a floated plan); Sat to Sun of the same week is ok; Sat to `NEXT_SAT` exactly is `past_next_occurrence` with `nextOccurrence` equal to `NEXT_SAT`; Sat to the Friday before `NEXT_SAT` is ok; a floated plan (`gaugeId: "x", scheduledKey: null`) moved three weeks out is ok; a plan already moved to Sunday (`startsAt` Sun, key still Sat) moved to `NEXT_SAT` is still refused (limit is from the original slot); a group with no parseable rhythm (`recurringActivities: []`) has no limit; a `scheduledKey` whose tail is not a date falls back to `startsAt`.

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Implement** using `parseRhythm` (`src/lib/orbit/rhythm.ts`) and `computeNextOccurrence` (`src/lib/orbit/occurrence.ts`, strictly after its `after` argument). Order: past check first; then `gaugeId !== null` returns ok; then parse rhythm (null returns ok); original slot from the key, falling back to `startsAt` on a missing or invalid date; `computeNextOccurrence` inside `try` (it throws on an invalid rhythm, which returns ok); `proposedStartsAt >= next` is refused.

- [ ] **Step 4: Run, verify PASS.**

- [ ] **Step 5: Commit**: "A weekly plan can be moved anywhere before its next regular slot".

---

### Task 4: What Orbit says about an edit

**Files:**
- Create: `src/lib/orbit/edit-copy.ts`
- Test: `src/lib/orbit/__tests__/edit-copy.test.ts`

**Interfaces:**
- Produces:

```ts
export interface DetailChange {
  title?: { from: string; to: string }
  place?: { from: string | null; to: string | null }
}
export function buildEditAnnouncement(
  actorName: string, currentTitle: string, change: DetailChange,
  startsAt: Date, timeZone: string, now: Date
): string
export const EDIT_REVERT_LINE = "Anyone can change it back on the plan's page."
```

Header comment: the second family of stored Orbit lines that name a member (after `cancel-copy.ts`), for the same reason: there is no vote on a place or title edit, so naming the editor is the only check; same deletion debt. It uses the plan's titles rather than `activityLabel`, because a rename is precisely a title and the title is what members see on the card. Imports `whenPhrase` from `change-copy.ts` so date phrasing cannot drift.

- [ ] **Step 1: Failing tests**, one per shape, exact strings (zone UTC, `NOW` two days before a Friday `startsAt`, fixture weekday asserted):

- place changed: `"Sam changed the spot for Beers this Fri, from Rusty Anchor to Sam's place. Anyone can change it back on the plan's page."`
- place added: `"Sam set the spot for Beers this Fri: Sam's place."`
- place cleared: `"Sam removed the spot for Beers this Fri (it was Rusty Anchor). Anyone can change it back on the plan's page."`
- renamed: `"Sam renamed Beers this Fri to Pool at Sam's. Anyone can change it back on the plan's page."`
- renamed and place changed: `"Sam renamed Beers this Fri to Pool at Sam's, and changed the spot from Rusty Anchor to Sam's place. Anyone can change it back on the plan's page."`
- renamed and place added: `"Sam renamed Beers this Fri to Pool at Sam's, and set the spot: Sam's place. Anyone can change it back on the plan's page."`
- renamed and place cleared: `"Sam renamed Beers this Fri to Pool at Sam's, and removed the spot (it was Rusty Anchor). Anyone can change it back on the plan's page."`
- every output matches no `/[–—]/`.
- an empty `DetailChange` throws (a caller bug, never a feed line).

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Implement.** The subject title is `change.title?.from` when renamed, else `currentTitle`. Place added alone gets no revert line (nothing was lost); every other shape ends with `EDIT_REVERT_LINE`.

- [ ] **Step 4: Run, verify PASS.** **Step 5: Commit**: "Orbit's line for an edited plan names who changed what, from what".

---

### Task 5: The place-and-title write path

**Files:**
- Create: `src/lib/events/edit-details.ts`
- Test: `src/lib/events/__tests__/edit-details.test.ts` (fixture pattern: copy `src/lib/events/__tests__/cancel.test.ts`'s `beforeEach`/`cleanup`, adding `venue` cleanup through the event cascade)

**Interfaces:**
- Consumes: `DetailChange` from Task 4.
- Produces:

```ts
export const EDIT_TITLE_MAX = 50
export type EditDetailsResult =
  | { status: "edited"; change: DetailChange }
  | { status: "skipped"; reason:
      "no_event" | "cancelled" | "already_started" | "noop" | "stale" |
      "invalid_title" | "invalid_place" }

export async function editEventDetails(input: {
  eventId: string
  title: string          // raw form value
  place: string          // raw form value; empty after trim clears the place
  now: Date
  /** Composes Orbit's line from what actually changed; this module writes no copy. */
  announce: (change: DetailChange, currentTitle: string) => string
}): Promise<EditDetailsResult>
```

File header: this is the write path the parked group-details slice reuses, so nothing card-specific belongs here; it never touches RSVPs, `startsAt`, `scheduledKey` or `gaugeId`; why `updatedAt` is always bumped (the calendar file's SEQUENCE, `ics.ts`); why a Venue row is updated in place (delete-and-recreate nulls `Rsvp.venueId`).

- [ ] **Step 1: Failing tests** (real dev-test database; `NOW` 2099 before `START`):
  1. rename writes `title` and `activityLabel` (as typed, `"Pool at Sam's"`), posts exactly one ORBIT message whose body is the `announce` return value, returns `change.title = { from: "Tennis", to: "Pool at Sam's" }`.
  2. place change on an event with a Venue updates that same row (same `id`), sets `name`, and nulls `address`, `displayLabel`, `url` (seed the venue with an address to prove it).
  3. place added on an event with no Venue creates one.
  4. empty place deletes the Venue; `change.place = { from: "Court 3", to: null }`.
  5. RSVP rows are identical before and after (ids and statuses).
  6. `updatedAt` strictly increases on a place-only edit (read before, sleep 5ms, edit, read after).
  7. `startsAt`, `scheduledKey`, `gaugeId` unchanged.
  8. refusals, each writing no message: unknown id `no_event`; CANCELLED `cancelled`; `startsAt <= now` `already_started`; same title and place after trim `noop`; blank title `invalid_title`; 51-char title `invalid_title`; 81-char place `invalid_place`.
  9. stale: run two `editEventDetails` calls concurrently (`Promise.all`) with different titles; exactly one returns `edited`, the other `stale`, and exactly one ORBIT message exists.

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Implement.** Validate first (trim; title 1 to `EDIT_TITLE_MAX`; place 0 to `VENUE_NAME_MAX` from `src/lib/orbit/rhythm.ts`). Then one `prisma.$transaction`:

```ts
const event = await tx.event.findUnique({
  where: { id: eventId },
  include: { venues: { orderBy: { id: "asc" }, take: 1 } },
})
// no_event / cancelled / already_started checks, as cancel.ts does
const venue = event.venues[0] ?? null
const currentPlace = venue ? (venue.displayLabel ?? venue.name) : null
const change: DetailChange = {}
if (title !== event.title) change.title = { from: event.title, to: title }
if ((place || null) !== currentPlace) change.place = { from: currentPlace, to: place || null }
if (!change.title && !change.place) return { status: "skipped", reason: "noop" } as const

// The real guard, as in cancel.ts: the first read is a fast path. Matching
// updatedAt means a concurrent edit makes this count 0, so only one editor
// posts an announcement. updatedAt is set explicitly (not left to
// @updatedAt) because a place-only edit writes nothing else on this row.
const updated = await tx.event.updateMany({
  where: { id: eventId, status: EventStatus.SCHEDULED, updatedAt: event.updatedAt },
  data: {
    ...(change.title ? { title, activityLabel: title } : {}),
    updatedAt: new Date(),
  },
})
if (updated.count === 0) return { status: "skipped", reason: "stale" } as const
```

Then the venue write (update in place with `displayLabel: null, address: null, url: null`; create; or delete), then `tx.message.create` with `announce(change, event.title)`, authorType ORBIT, authorId null.

- [ ] **Step 4: Run, verify PASS.** **Step 5: Commit**: "Place and title can be corrected on an existing plan, announced, RSVPs untouched".

---

### Task 6: One save, both paths, and the server action

**Files:**
- Create: `src/lib/events/submit-edit.ts`
- Create: `src/app/actions/edit-event.ts`
- Test: `src/lib/events/__tests__/submit-edit.test.ts`

**Interfaces:**
- Consumes: `editEventDetails` (Task 5), `buildEditAnnouncement` (Task 4), `checkEditedStart` (Task 3), `createGroupProposal` with `sourceMessageId: null` (Task 1), `buildGroupProposalQuestion` (Task 2), `zonedWallTimeToUtc`, `getLocalParts`, `isGroupMember`.
- Produces:

```ts
export type SubmitEventEditResult =
  | { status: "ok"; edited: boolean; proposed: boolean }
  | { status: "error"; message: string }

export async function submitEventEdit(input: {
  eventId: string
  actor: { id: string; name: string }
  title: string
  place: string
  dateLocal: string   // "YYYY-MM-DD" in the group's timezone
  timeLocal: string   // "HH:mm" 24h in the group's timezone
  now: Date
}): Promise<SubmitEventEditResult>

// src/app/actions/edit-event.ts
export interface EditEventState { errors?: { general?: string } }
export async function editEventAction(_prev: EditEventState, formData: FormData): Promise<EditEventState>
```

Order inside `submitEventEdit`, and why (header comment): everything is validated before anything is written, so a refused day never leaves a half-saved place behind.
1. Load event with `group: { select: { id, timeZone, recurringActivities } }`. Missing: "That plan is gone." Not a member (`isGroupMember`): "Only members can change this group's plans." CANCELLED: "Put this plan back on before changing it." Started: "This one has already started."
2. Parse `dateLocal`/`timeLocal` (regexes `^\d{4}-\d{2}-\d{2}$` and `TIME_LOCAL_RE` from `rhythm.ts`); bad: "Pick a day and a time." Build `proposedStartsAt` with `zonedWallTimeToUtc(y, m, d, hh, mm, tz)`.
3. `dayTimeChanged = proposedStartsAt.getTime() !== event.startsAt.getTime()`. If changed, `checkEditedStart`; `past`: "That time has already passed."; `past_next_occurrence`: `` `That runs into the next regular ${event.title} on ${formatWeekdayShort(next, tz)} at ${formatTime(next, tz)}. Pick a time before then.` ``
4. Title/place validation errors mapped: "Give the plan a name, up to 50 characters." / "Keep the place under 80 characters."
5. `editEventDetails` with `announce: (change, currentTitle) => buildEditAnnouncement(actor.name, currentTitle, change, event.startsAt, tz, now)`. `noop` is fine when `dayTimeChanged`; `noop` with no day/time change: "Nothing changed." `stale`: "Someone else just changed this plan, take another look."
6. If `dayTimeChanged`: re-read the event (title may have just changed); `createGroupProposal({ groupId, eventId, askerUserId: actor.id, sourceMessageId: null, proposedStartsAt, priorStartsAt: event.startsAt, body: buildGroupProposalQuestion(actor.name, fresh.activityLabel ?? fresh.title.toLowerCase(), proposedStartsAt, event.startsAt, tz, now, null) })`. `already_asked` counts as ok (a double-tap). `stale`: the same "Someone else just changed" message.

The action: `"use server"`; Supabase `auth.getUser()` then `prisma.user.findUnique({ where: { supabaseAuthId } })` exactly as `cancel-event.ts` does (signed out: "You need to be signed in to do that."); read the five form fields; call `submitEventEdit` with `now: new Date()`; on ok `revalidatePath(`/events/${eventId}`)` and the group home (`/groups/${groupId}`, read from the event); map error to `{ errors: { general } }`. The action stays thin and untested, the cancel precedent; the logic it calls is tested.

- [ ] **Step 1: Failing tests** for `submitEventEdit` (database fixtures as Task 5, group timezone `"America/Chicago"`, a rhythm in `recurringActivities`, the event created with a `scheduledKey`):
  1. place-only save: `{ ok, edited: true, proposed: false }`, one message naming the actor.
  2. time-only save: `{ ok, edited: false, proposed: true }`; a GROUP proposal exists with `sourceMessageId` null, `proposedStartsAt` equal to the Chicago wall time converted (assert the ISO), the actor's YES vote, and the event's `startsAt` unchanged.
  3. both: two ORBIT messages, the edit announcement created before the vote question (order by `createdAt`, then `id`), the question using the NEW title.
  4. non-member: error, nothing written.
  5. cancelled plan: error, nothing written.
  6. a day on the rhythm's next slot: the exact "runs into" message, and neither the title change in the same save nor a proposal was written (validation before writes).
  7. nothing changed: "Nothing changed."
  8. submitted twice with the same new time: one live proposal.

- [ ] **Step 2: Run, verify FAIL.** **Step 3: Implement both files.** **Step 4: Run, verify PASS; `npx tsc --noEmit` clean.**

- [ ] **Step 5: Commit**: "Saving an edit fixes the place and title and asks the group about the day and time".

---

### Task 7: The Edit control on the plan's page

**Files:**
- Create: `src/app/events/[id]/EditEventDetails.tsx`
- Modify: `src/app/events/[id]/page.tsx` (details card body, lines ~176-251)
- Test: `src/app/events/[id]/__tests__/EditEventDetails.test.tsx` (mock pattern: `CancelControls.test.tsx`)

**Interfaces:**
- Consumes: `editEventAction` (Task 6), `EDIT_TITLE_MAX` (Task 5), `VENUE_NAME_MAX`, `formatTimeZoneLabel` (`src/lib/groups/timezone.ts`), `ErrorLine` (`@/components/choice`).
- Produces: `<EditEventDetails eventId title place dateLocal timeLocal zoneLabel>{static view}</EditEventDetails>`.

Behaviour:
- At rest: renders `children` (the page's existing title and meta rows, unchanged) and, below them, right-aligned, a text button "Edit" (`--type-meta`, `--text-secondary`, underlined, no border, min 44px tap height), `aria-label="Edit this plan"`.
- Editing: replaces the children with a form of four labelled fields, prefilled: "Title" (`maxLength` 50), "Place" (placeholder "Where are you meeting?", `maxLength` 80), "Day" (`type="date"`), "Time" (`type="time"`). Under Day/Time, one `--type-meta` `--text-secondary` line: `Changing the day or time asks the group first. Times in ${zoneLabel}.` Then "Save" (teal pill, the geometry of `CancelControls`' `tealPill`) and "Never mind" (text button). Field styling: read the venue input in `src/app/create/Step2Playback.tsx` and reproduce its values (map tokens by VALUE, never by name, per CLAUDE.md), at `fontSize: "1rem"`. Labels are real `<label htmlFor>`.
- Save: `startTransition` calling `editEventAction({}, formData)` with `eventId, title, place, dateLocal, timeLocal`; buttons disabled with opacity 0.65 while pending; on success close the form; on error keep it open with `ErrorLine`.
- Page wiring: `canEdit = !isCancelled && event.startsAt.getTime() > Date.now()` (viewer is already guaranteed a member here). Compute `dateLocal`/`timeLocal` from `getLocalParts(event.startsAt, tz)` zero-padded. When `canEdit`, wrap the title `<h1>` and the meta rows in `EditEventDetails`; otherwise render them as today. Add a short comment: why the page and not the home card (settled with the owner, 23 Sept 2026: the card is the gist and its height budget is spent), why inline rather than a modal (the `CancelControls` reasoning).

- [ ] **Step 1: Failing component tests:** rest shows children and "Edit this plan", no form; tapping it shows four prefilled fields (assert values) and the hint text with the zone label; "Never mind" restores the children with no action call; Save calls the mocked action once with all five form fields; an action error renders its message and keeps the form open; a successful save closes the form.
- [ ] **Step 2: Run, verify FAIL.** **Step 3: Implement.** **Step 4: Run PASS; `npx tsc --noEmit` clean.**
- [ ] **Step 5: Commit**: "Every plan's page gets an Edit control".

---

### Task 8: Orbit's chat refusals point at the page

**Files:**
- Modify: `src/lib/orbit/change-copy.ts` (`buildCantDoReply`, lines ~130-153)
- Modify: `src/lib/orbit/__tests__/change-copy.test.ts` (the assertions at ~140-148 and ~231)

- [ ] **Step 1: Change the tests first** to the new strings, and run them to watch them fail:
  - day with a plan: `"I can't move it to another day from chat, but anyone can on the plan's page. I can change the time on Sun if that helps."`
  - day, no plan: `"I can't move it to another day from chat, but anyone can on the plan's page. I can change the time if that helps."`
  - venue: `"I can't change the spot from chat, but anyone can on the plan's page. I can move the time if that helps."`
  - other: unchanged.
- [ ] **Step 2: Implement.** Replace the DEBT paragraph in the doc comment with: retired by the editable-event-card slice (23 Sept 2026); the page can change place and title directly and open a vote for the day, so the honest answer is now a pointer, and chat still cannot act on either (verbal group two).
- [ ] **Step 3: Run** `npx vitest run src/lib/orbit` PASS.
- [ ] **Step 4: Commit**: "Orbit points at the plan's page when it can't make a change from chat".
- [ ] **Step 5: Bench, hand-run, costs money:** `npm run eval:detect -- 5 venue-ask-two-plans`. Record the score in the task report. Expect 5/5 (the case asserts the reply contains "spot", which the new copy keeps). Anything below: report, do not tune.

---

### Task 9: The hourly job and a plan whose day moved

**Files:**
- Test: `src/lib/orbit/__tests__/reconcile.test.ts` (inside the existing `describe("a moved occurrence relocates its slot rather than freeing it")`, lines ~442-485: reuse its setup verbatim)
- Test: `src/lib/proposals/__tests__/promote.test.ts` (read its fixtures first)

These pin existing behaviour this slice starts relying on; they are expected to pass on first run, so each must be shown able to fail (Step 3).

- [ ] **Step 1: reconcile, moved later within the week.** Following the existing block: cron creates the rhythm occurrence; move it one day later (keep `scheduledKey`, set `previousStartsAt`); at a `now` between the original slot and the moved time, reconcile returns `skipped / upcoming_exists` and creates nothing; at a `now` after the moved time, reconcile creates exactly the next regular occurrence (assert its `startsAt` is one week after the ORIGINAL slot and that the group has exactly two scheduled rows).
- [ ] **Step 2: promote, a day change end-to-end.** A GROUP proposal whose `proposedStartsAt` is two days after `priorStartsAt`, with three YES voters in a group of three: `promoteProposalMove` returns `moved`; the event's `startsAt` equals the proposal's; RSVPs are exactly the three yes voters IN; the announcement body contains `it was ` followed by the old weekday (Task 2's copy).
- [ ] **Step 3: Prove they can fail.** Temporarily change the reconcile assertion's expected week offset to zero and the promote test's expected weekday to a wrong day; confirm both FAIL; restore; confirm PASS. State in the report what was mutated and the failing output.
- [ ] **Step 4: Commit**: "Pin how the hourly job and the vote treat a plan whose day moved".

---

### Task 10: Records

**Files:**
- Modify: `src/app/create/Step2Playback.tsx` (comments at ~84-100, ~237-243, ~295 naming this slice as the revert trigger)
- Modify: `CLAUDE.md`
- Modify: `docs/build-notes.md` (§11 entry at the end of the file)

Runs after the whole-branch review and the browser walkthrough, so its numbers are real. No behaviour changes.

- [ ] **Step 1: Step2Playback comments.** Amend, do not delete, each comment that says the rule reverts when the editable event card ships: dated note (23 Sept 2026) that the trigger moved to the group-details slice, because an edit fixes one occurrence and the rhythm would recreate a missing venue weekly. Run its tests: unchanged and green.
- [ ] **Step 2: CLAUDE.md.** (a) In the "venue stopped hiding" paragraph, strike "**it reverts when the editable event card ships**" and add a dated amendment naming the new trigger and the reason. (b) Add a current-state paragraph after the auth soft-fail paragraph: what a member can now do, the vote carrying a day, the limit on weekly plans, what is deliberately still missing (rhythm edits, chat edits, stale saved calendars), the migration. (c) In the "Next" paragraph, add a dated amendment: editable event card built; group details editing (item 3) is next, and it now also owns the onboarding required-venue question. (d) In "Still missing, and known", strike the "A wrong venue guess still has no path to being fixed" clause for single plans, with a dated note that the rhythm's venue is still unfixable. Keep it terse; append-only form, strike-throughs with dates.
- [ ] **Step 3: build-notes §11 entry** "the editable event card (23 September 2026)", 400-600 words, product language: the seven settled decisions and the four planning decisions (with the owner's reasons where given); the baseline (1928/162 at 291ead3) and the finishing count; the bench score from Task 8; the queued items: (1) onboarding's follow-up should show the place alongside the time and stop saying "One question", (2) whether venue stays required at onboarding permanently, owner leaning yes, decided in the group-details slice, (3) going back from step 2 regenerates the suggested group name, recommended decline unless an edited name is ever lost; and the debt list from the design above.
- [ ] **Step 4: Commit**: "Record the editable event card".
