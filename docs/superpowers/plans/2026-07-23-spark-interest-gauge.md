# Spark part one: Orbit gauges interest — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-07-23-spark-interest-gauge-design.md` — read it first. Where this plan and the spec differ, the spec is the intent.

**Goal:** A member floats an idea in the feed, Orbit reads it, replies proposing a specific day, and offers three one-tap answers with a live tally. Nothing is created. Below the bar, the idea scrolls away with no residue.

**Architecture:** One new pure module (`src/lib/orbit/spark.ts`) holding the extraction call, the claim-to-fact normalize seam, the proposed-day rule, and the deterministic copy. Two new tables (`Gauge`, `GaugeVote`) plus a `GaugeAnswer` enum. Two new server actions (`detectSparkAction`, `gaugeVoteAction`). Chip and tally rendering added to `MessageFeed`; a second `useTransition` in `GroupHome` fires detection after the send settles so the input is never blocked. `createMessage`, `createEvent`, `setRsvp`, `reconcile.ts`, and the whole onboarding path are untouched.

**Tech stack:** Next.js 16, Prisma 7, Vitest (real dev-test DB for integration suites), Anthropic structured outputs (`claude-haiku-4-5`).

## Context

Orbit today only acts on a daily cron. It has never reacted to anything a person said. This slice is the first time it does, and it is the first time anything in a chat bubble is tappable.

Spark as a whole opens six integration points at once: a model call in the message path, two new tables with a new relationship, an interactive control inside a bubble, event creation triggered by a member's tap, a second event on the home screen, and RSVPs seeded from votes. Build-notes §11 records that concentration as the shape that fails. This plan takes the first three and stops.

## Signed-off product decisions (23 July 2026, do not relitigate)

- **A model call on every member message**, no keyword pre-filter. About $0.0008 per message; a filter saves fractions of a cent and risks the product's headline moment.
- **Detection runs after the send completes**, in a transition whose pending flag is not wired to the input. The chat input is never disabled waiting on Orbit.
- **Three chips**, per `Orbit Suggestion Chips · Spec` (checked into `docs/design/` by Task 1): yes at full strength, "Next time" and "Yes, can't {Day}" quiet.
- **A vote belongs to a specific proposal, not to the idea.** This is why `GaugeVote` hangs off `Gauge` (which carries the proposed date) and not off an idea record.
- **The initiator is counted only when they named the day themselves.** "Beers on Friday?" is a yes to Friday and re-asking would be asking twice; "beers sometime" is a yes to nothing, because Orbit picked the day afterward. Product-owner correction, then refinement, on spec review. Two rules tighten as a result: the two-day buffer applies only to a day Orbit guesses, never to one someone stated; and a day counts as stated only when exactly one is named, so "Friday or Saturday" falls back rather than silently picking one and counting them for it. The "never ask twice" rule this was over-borrowed from is intact and governs part two.
- **Orbit makes no promise in this half.** No "if three of you are in, I'll set it up", no "one more makes it happen". Both land in part two with the delivery. Deliberate deviation from the mockup copy, closed by the named slice.
- **One fixed emoji on the yes chip**, not one matched to the activity. Nothing maps activity to emoji; a table that guesses wrong reads worse than one that never tries.
- **Fallback day is the coming Friday**, pushed to the following Friday when that is under two days out so the group has time to answer. Explicitly a placeholder for build-notes §5 override learning.

## Global constraints

- **The model's answer is a claim.** Nothing branches on raw output; `normalizeSpark` is the only door, mirroring `normalize.ts`.
- **Orbit stays quiet when unsure.** A missed idea costs nothing visible; a wrong interjection teaches people to tune Orbit out. Anti-clutter outranks coverage everywhere in this slice.
- **Orbit is never a User or Membership row.** The gauge message is `MessageAuthor.ORBIT` with a null author, as today.
- **Counts and names are always derived** from `GaugeVote` rows. Nothing about a tally is stored.
- **Copy rules:** no em or en dashes in anything Orbit says; three-letter weekday abbreviations; plain warm voice at a 7th-to-8th grade reading level.
- **Colour rules:** chips are neutral outlined pills. Never lime (Orbit's cue, not an action), never teal-filled (teal is the one primary action per screen, which on the group home is the event card's "I'm in").
- **Migrations go to the dev-test database only.** Never point anything at production.
- **Stay in lane.** Note anything spotted outside the slice; do not fix it.
- **Merge boundary:** PR touches code → open the PR and stop. Jacob merges.

## Design positions (recorded for build-notes §11)

1. **`Gauge.sourceMessageId` is unique, and that is the whole idempotency story.** A double-fired detection hits the constraint and is caught as a no-op, the same P2002 pattern `reconcile.ts` already uses. We deliberately do **not** add a "spark already checked" column to `Message`: it would widen the migration to cover a rare duplicate *cost*, while the unique constraint already covers the duplicate *harm* (two Orbit messages for one idea).
2. **Both border tokens in the chip spec sheet are the same hex** (`--stroke` and `--stroke-strong` are both `#363a49`). The full-strength versus quiet distinction is carried entirely by text colour. In project tokens that is one `--border-subtle` on all three chips, `--text-primary` on the yes chip, `--text-secondary` on the other two. Recorded so nobody later "fixes" this by inventing a second border token. It also satisfies the accessibility rule directly: emphasis by brightness, never hue.
3. **Exact chip colours are not matched this slice.** The spec sheet carries its own palette (`#20222d` surfaces) which differs from the shipped tokens (`#141414`). The shipped chat-bubble fills are already recorded as functional placeholders awaiting the end-of-build visual pass; chips join them rather than turning this slice into a theming exercise. What *is* matched now is everything structural: pill shape, border weight, `--type-label` at weight 600, the wrapping row, and the brightness distinction.
4. **The proposed day is stored as the group-local midnight instant** via the existing `zonedWallTimeToUtc`, and a gauge is live until the end of that local day. One stored instant, read through the group's zone like everything else, so a gauge can never disagree with the card grammar around it.
5. **`callExtractionModel` gains a schema parameter, defaulted to `EXTRACTION_SCHEMA`.** A change to shipped code, flagged in the PR. Every existing caller is unchanged; spark passes its own schema. The alternative, a second near-identical call helper, is the duplication the timezone slice already rejected once.
6. **Only a named weekday is extracted.** "beers Friday" resolves; "beers tomorrow" does not and falls back. Deliberate limitation with a named candidate fix (pass the group-local date so the model can resolve relative days), following the same shape as onboarding's ambiguous-time limitation that the gap-ask slice later closed.
7. **The tally renders only once at least one vote exists.** A zero-state line is noise the chips already imply, and with the initiator no longer auto-voting, every gauge now starts at zero.
8. **Voting is not membership-gated**, consistent with every other surface and with `setRsvp`. Covered by the standing access-control gap, not a new one.

## Task 0: Slice hygiene — DONE

- [x] `main` confirmed level with `origin/main`; branch `feat/spark-interest-gauge` cut from it
- [x] Baseline recorded: **267 tests green across 19 files** (matches the venue slice's recorded figure)
- [x] Spec written, reviewed by the product owner, and committed (`c0cc667`, `efb3cf4`)
- [ ] Note for the PR: `.claude/settings.json` carries an unrelated uncommitted change (enables the Superpowers plugin). Left alone deliberately; it wants its own small PR.

## Task 1: Documentation correction, first because CLAUDE.md loads every session

**Files:** Modify `CLAUDE.md`; Modify `docs/build-notes.md`; Add `docs/design/orbit-suggestion-chips-spec.html`

CLAUDE.md currently states as settled a thing we have just overturned. Any future session loads that claim as fact, so it is fixed at the top of the slice rather than in end-of-slice bookkeeping.

- [ ] **CLAUDE.md line 28** — "the initiator never being asked twice" is too blunt to be true. Replace with the precise rule: the initiator is counted only when they named the day Orbit is proposing, and votes like anyone else when they did not.
- [ ] **CLAUDE.md line 19** — "(initiator included)" reads as an unconditional automatic yes. Reword to match the line above.
- [ ] **CLAUDE.md lines 21 to 26** — all five open questions are now answered. Replace the list with a pointer to the spec and a one-line statement of what was settled, keeping the section short (it is rewritten at every slice boundary anyway).
- [ ] **build-notes §5, "Auto-seed RSVPs"** — the line is correct as written, but it is the line the one-shot misread into an initiator auto-vote. Add one clause: floating an idea is not itself a yes.
- [ ] **build-notes §5, "Spontaneous mode"** — "(including the initiator)" is true of the count and ambiguous about the mechanism. Clarify that the initiator is counted by voting.
- [ ] Check the chip spec sheet into `docs/design/orbit-suggestion-chips-spec.html` with a one-line note in `docs/design/walkthrough-screens/README.md` pointing at it. It is a real build source (it carries actual CSS, unlike the crops) and it currently exists only in a Downloads folder.
- [ ] Verify: re-read the changed CLAUDE.md section start to finish and confirm no remaining sentence claims the initiator is auto-counted.

## Task 2: Schema — Gauge, GaugeVote, GaugeAnswer

**Files:** Modify `prisma/schema.prisma`; generated migration under `prisma/migrations/`

```prisma
model Gauge {
  id              String      @id @default(cuid())
  groupId         String
  sourceMessageId String      @unique   // the MEMBER message that sparked it; also the idempotency key
  orbitMessageId  String      @unique   // Orbit's gauge message, where the chips render
  activity        String                // "beers" — founder's own words, sanitized
  proposedDate    DateTime              // group-local midnight of the proposed day
  createdAt       DateTime    @default(now())

  group         Group       @relation(fields: [groupId], references: [id], onDelete: Cascade)
  sourceMessage Message     @relation("GaugeSource", fields: [sourceMessageId], references: [id], onDelete: Cascade)
  orbitMessage  Message     @relation("GaugeOrbit", fields: [orbitMessageId], references: [id], onDelete: Cascade)
  votes         GaugeVote[]

  @@index([groupId])
}

model GaugeVote {
  id        String      @id @default(cuid())
  gaugeId   String
  userId    String
  answer    GaugeAnswer
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt

  gauge Gauge @relation(fields: [gaugeId], references: [id], onDelete: Cascade)
  user  User  @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([gaugeId, userId])   // one answer per person per gauge; changeable, never duplicated
  @@index([gaugeId])
  @@index([userId])
}

enum GaugeAnswer {
  IN
  OUT
  NOT_THAT_DAY
}
```

- [ ] Add the models and enum; add back-relations `gauges Gauge[]` on `Group`, `gaugeVotes GaugeVote[]` on `User`, and the two named back-relations on `Message` (`gaugeAsSource Gauge? @relation("GaugeSource")`, `gaugeAsOrbit Gauge? @relation("GaugeOrbit")`)
- [ ] `npx prisma migrate dev --name add_spark_gauge` (the PreToolUse hook blocks hand-editing migrations by design; generate, never write)
- [ ] `npx prisma generate` — Prisma 7 does not auto-run it
- [ ] Confirm the migration landed on **dev-test** and nowhere else
- [ ] Verify: `npx tsc --noEmit` clean, full suite still 267 green (schema addition alone changes no behavior)

## Task 3: `spark.ts` — the call and the claim-to-fact seam

**Files:** Create `src/lib/orbit/spark.ts`; Create `src/lib/orbit/__tests__/spark.test.ts`; Modify `src/lib/orbit/extract.ts`

**Produces:** `SPARK_SCHEMA`, `detectSparkClaim(body, context)`, `normalizeSpark(raw)` returning `{ spark: false } | { spark: true; activity: string; statedDayOfWeek: number | null }`.

Schema, every field required with explicit nulls, matching the extraction doctrine:

```ts
{ isSpark: boolean, activity: string | null, statedDayOfWeek: integer | null }
```

Prompt must be conservative and say so explicitly: a spark is a genuine suggestion that the group do something together. Agreement, reactions, questions about the event already scheduled, and small talk are not sparks. Never invent an activity.

`statedDayOfWeek` is set **only when exactly one day is named**. Two or more floated as options ("Friday or Saturday?") is null, because that proposes choice rather than a day, and picking one silently would then count the initiator for a day they did not settle on. This rule is load-bearing for the initiator decision, not cosmetic; pin it with a test.

- [ ] **Step 1: failing tests first, watched fail.** Cover: `isSpark:false` returns `{spark:false}`; a valid spark normalizes; a spark with a blank or missing activity degrades to `{spark:false}` (no activity means nothing to gauge); `statedDayOfWeek` outside 0 to 6 degrades to null rather than rejecting; a non-object claim returns `{spark:false}`; activity is trimmed and capped.
- [ ] **Step 2:** implement. Reuse `cleanVenueName`'s trim-cap-empty-to-null shape for the activity via a local `cleanActivity` (or reuse directly if the cap suits; do not duplicate the logic).
- [ ] **Step 3:** widen `callExtractionModel(system, user, schema = EXTRACTION_SCHEMA)` in `extract.ts`. Existing callers untouched.
- [ ] Verify: new tests green, all 30-plus pre-existing extraction and normalize tests still green.

## Task 4: The proposed day

**Files:** Modify `src/lib/orbit/spark.ts`; Modify `src/lib/orbit/__tests__/spark.test.ts`

**Produces:** `chooseProposedDate(statedDayOfWeek, timeZone, now): Date` — group-local midnight of the chosen day; and `isGaugeLive(proposedDate, timeZone, now): boolean`.

- [ ] **Step 1: failing tests first.** A stated weekday resolves to its next occurrence. **A stated day that is today resolves to today**, not next week: the two-day buffer is fallback-only, and pushing a stated day out a week would count the initiator for a day they did not mean (pin this, it is the bug the initiator refinement exposed). No stated day gives the coming Friday. No stated day on a Thursday gives the *following* Friday, the buffer doing its one job. Both a large-negative-offset zone and UTC, so the day-boundary fix stays proven. `isGaugeLive` is true through the end of the local proposed day and false after.
- [ ] **Step 2:** implement on top of `zonedWallTimeToUtc` and `getLocalParts`. Do not write a second wall-clock reader.
- [ ] Verify: tests green; the occurrence suite's existing anchors unchanged.

## Task 5: Deterministic copy

**Files:** Modify `src/lib/orbit/spark.ts`; Modify `src/lib/events/format.ts`; tests in both

**Produces:** `buildGaugeMessage(activity, proposedDate, timeZone)`, `buildTallyLine(votes, names)`, `chipLabels(proposedDate, timeZone)`, and an extracted `formatWeekdayShort(date, timeZone)` in `format.ts`.

Structured-extract-then-format throughout: the model supplies fields, code composes every string.

- [ ] **Step 1: failing tests first.**
  - `buildGaugeMessage` → "Love it. Anyone in for beers this Friday?" — no promise clause, no dashes.
  - `chipLabels` → the third chip reads "Yes, can't Fri", the weekday abbreviated per the copy rule and derived from the stored date.
  - `buildTallyLine` → empty string with no votes; "Jesse is in so far" at one; "Jesse & Maya are in so far" at two; "Jesse, Maya & 2 others are in so far" at four; the different-day clause appended only when that count is nonzero; **no countdown clause at any count**, including at and above three (pin this — it is the deviation this slice ships deliberately).
- [ ] **Step 2:** extract `formatWeekdayShort` and have `formatEventDate` call it, rather than a second `Intl` weekday call (prefer extraction over duplication).
- [ ] Verify: tests green; `formatEventDate`'s existing assertions byte-identical.

## Task 6: Data layer

**Files:** Create `src/lib/gauges/create.ts`, `src/lib/gauges/vote.ts`, `src/lib/gauges/read.ts`; tests for each (integration, dev-test DB)

- [ ] **Step 1: failing tests first.**
  - `createGauge` writes the Orbit message and the gauge in **one transaction**, so a gauge can never exist without its message or the reverse. (This closes by construction the non-transactional gap `reconcile.ts` logged as debt for its event-plus-announcement pair; noted, not retrofitted there.)
  - A second `createGauge` for the same source message hits the unique constraint and is reported as a skip, not an error.
  - `castVote` upserts on `(gaugeId, userId)`: a re-tap with a different answer updates the single row; the count never doubles.
  - `findLiveGauges(groupId, now)` returns only gauges whose local day has not passed.
- [ ] **Step 2:** implement.
- [ ] Verify: tests green against dev-test.

## Task 7: Server actions

**Files:** Create `src/app/actions/detect-spark.ts`, `src/app/actions/gauge-vote.ts`; Modify `src/app/actions/send-message.ts`

- [ ] `sendMessageAction` returns the created message id alongside its existing state (**change to shipped code, flag in PR**). Its error shape and behavior are otherwise untouched.
- [ ] `detectSparkAction(messageId)`: re-verify session server-side; load the message and its group; refuse anything that is not a `MEMBER` message in a group the caller can see; skip when a live gauge already exists for the same activity (case-insensitive) so the group is never double-gauged for one idea; call, normalize, and on a spark create the gauge in one transaction. **Only calls `revalidatePath` when a gauge was actually created** — otherwise ordinary chatter would trigger a pointless re-render on every message.
- [ ] `gaugeVoteAction(gaugeId, answer)`: re-verify session, resolve the user server-side (never trust a client id), whitelist the answer against the enum, refuse a vote on a gauge whose day has passed, upsert, revalidate the group.
- [ ] Every failure path is soft: detection failing leaves the member's message exactly as it was, with nothing in the feed.
- [ ] Verify: `tsc` clean. Server actions stay untested by convention here; the tested seams are `spark.ts` and the `gauges/` lib.

## Task 8: UI — chips and tally

**Files:** Modify `src/app/groups/[id]/MessageFeed.tsx`, `GroupHome.tsx`, `src/app/groups/[id]/page.tsx`; Create `src/app/groups/[id]/GaugeChips.tsx`

- [ ] `page.tsx` loads live gauges with their votes and voter names alongside the feed, and passes each gauge down keyed to its Orbit message.
- [ ] `GaugeChips.tsx`: the three pills in a wrapping row indented under the bubble; the tally line inside the bubble above them; optimistic vote flip on tap with revert plus a soft error on failure, matching the RSVP pattern already shipped. Chips render only while the gauge is live.
- [ ] `GroupHome.tsx`: a **second** `useTransition` for detection, deliberately not wired to `ChatInput`'s `disabled`. This is the riskiest wiring in the slice and it is the piece automated tests cannot prove; it gets browser verification in Task 9.
- [ ] Structural fidelity per design position 2: one border token on all three, brightness carries emphasis, `--type-label` at weight 600, never lime, never teal.
- [ ] Verify: `tsc` clean, full suite green.

## Task 9: Verification — both gates

**Looked at, not assumed:**

- [ ] Render the group home with a live gauge next to `docs/design/orbit-suggestion-chips-spec.html` open, and compare directly. No "matches the design" claim without this. Record any difference as a question, not a defect.

**Shown, not asserted** — browser walkthrough against dev-test, each scenario recorded with what was observed:

- [ ] A real idea ("we should finally grab beers sometime") produces an Orbit reply naming a specific day, with three chips.
- [ ] An ordinary message ("sounds good") produces nothing: no reply, no gauge row.
- [ ] **The chat input stays usable through the whole detection round trip** — type a second message immediately after the first. This is the decision that shaped the architecture; it needs to be seen, not assumed.
- [ ] Someone who floats an idea with no day starts at zero and is counted only after tapping.
- [ ] Someone who names the day ("beers on Friday?") is already counted, and is not asked to confirm the day they just proposed.
- [ ] Tapping updates the tally; tapping a different chip changes the answer rather than adding one. Confirm one row in the database, not two.
- [ ] "Yes, can't Fri" lands in the different-day clause and not in the in-count.
- [ ] **Three yeses creates no event.** Pinned deliberately, so the day part two lands, the boundary moved on purpose.
- [ ] A gauge whose day has passed renders as history with no chips.
- [ ] Record the finishing test count against the 267 baseline.

## Task 10: Records

**Files:** Modify `docs/build-notes.md`; Modify `CLAUDE.md`

- [ ] build-notes §11 entry: what the slice was, the design positions above, the deliberate deviations (no promise copy, fixed emoji, exact colours deferred), the debt below, and what verification actually showed.
- [ ] Annotate the one-shot experiment entry: its two spark decisions were checked against the real design and neither survived. The chip set was two pills with invented copy; the sheet shows three with different labels. The initiator auto-vote misread the never-ask-twice rule. Recorded as an annotation, not a rewrite; the log stays a historical record.
- [ ] Rewrite CLAUDE.md's "Where the build is" for the new boundary, naming part two as next.
- [ ] Open the PR and stop.

## Debt this slice opens

- **Every member message costs a model call, with no ceiling.** The pre-filter we chose not to build was also an accidental spending cap. Acceptable while unlaunched and unpromoted; needs a real answer before the URL goes anywhere. Medium.
- **Detection is best-effort.** Closing the tab within a couple of seconds of posting an idea means Orbit never answers it. Fails quietly rather than wrongly. Low.
- **Relative days are not understood.** "beers tomorrow" falls back to Friday. Named candidate fix in design position 6. Low.
- **Chip colours are not pixel-matched**, joining the existing chat-bubble placeholders in the end-of-build visual pass. Low.
- **Inherited, not opened, and due in part two:** `Event.@@unique([groupId, startsAt])` means a sparked event cannot share an instant with the standing scheduled one. It bites when creation lands, not here.
