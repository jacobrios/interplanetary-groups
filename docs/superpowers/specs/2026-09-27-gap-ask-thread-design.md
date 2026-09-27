# The gap-ask keeps the conversation on screen

Designed 27 Sept 2026 on branch `gap-ask-thread`, from the owner's 27 Sept
phone QA of the step 2 cleanup (build-notes §11, "onboarding step 2 cleanup",
27 Sept postscripts). Item 1 of his 27 Sept queue order.

---

## Front section

**Settled with the owner, 27 Sept 2026. Do not relitigate.**

1. **The whole back-and-forth stays on screen**: every Orbit question and
   every founder answer, the founder's as the group chat's own "you" bubble.
2. **The card sits at the top of the conversation and scrolls with it**, not
   pinned. The message box is pinned to the bottom, like the group chat.
3. **Back to step 1 and continuing starts a fresh conversation on screen,
   but Orbit keeps the founder's earlier answers**: if the new description
   still leaves a gap, those answers fill it before Orbit asks.
4. **An answer appears the moment it is sent**; on failure it comes back out
   and its text returns to the box.
5. **A re-ask after an answer that moved nothing** reads "No problem. A best
   guess at a spot is fine for now." with no question, naming what is
   missing, two rows at 390px. Morning-or-evening and weekly-or-not gaps
   keep "No worries. Let me ask again:" plus the question.
6. **Pictures approved 27 Sept**, with 5 applied.
7. **Where a new description and an earlier answer disagree, the
   description wins**, enforced in code (build ruling, owner away).

**Non-goals.** Any Orbit prompt change: the earlier answers go through the
existing answer-reading step.

**Verified by.** Tests: the re-ask line per gap kind; the thread growing,
resetting and rolling back; the shared bubble; answers carried, capped and
losing to the description. Bench: new replay cases red before, green after,
under $5. Not tested: scroll and keyboard; a 375px browser pass, then the
owner's phone.

**Debt expected.** One extra Orbit call (about half a cent) on that return
path only.

---

## Tasks

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this task by task. Steps use checkbox (`- [ ]`) syntax for tracking. Read the front section above first: it is the contract, and anything here that contradicts it is a bug in this half. Tasks marked **(coordinator)** are never handed to an implementer.

**Goal:** the gap-ask step renders as a short chat. Orbit's questions and the founder's answers accumulate as bubbles below the playback card, the message box is pinned to the bottom of the screen, a stalled re-ask for a guessable gap acknowledges "I don't know" instead of repeating the question, and a founder who goes back to step 1 and continues keeps their earlier answers, which fill whatever the new description still leaves missing, with the description winning any disagreement.

**Architecture:** the wizard (`OnboardingWizard.tsx`) owns a new `thread` state: an ordered list of turns, each either Orbit's line (a string composed once, when the round arrives, and stored; never re-derived on render, per CLAUDE.md's "stored state is not display") or the founder's answer. `StepGapAsk` stays presentational and renders the thread instead of a single bubble. The gap step gets its own full-height screen (header, scrolling region holding the card and the thread, pinned composer), mirroring the group home's `height: 100dvh` column. The viewer's chat bubble is lifted out of `MessageFeed.tsx` into a shared `SelfBubble` so both screens draw it identically. The stalled lead-in becomes a per-kind table in `gap.ts`, typed as a total `Record<GapAskable, …>` so a future gap kind cannot compile without its own line. Remembered answers are a second, independent piece: the wizard keeps the founder's successfully sent answers, sends them with the step 1 form, and `extractGroupAction` replays them through the existing merge call (no prompt change) only when a fresh extraction comes back incomplete; a new deterministic guard then restores every field the fresh extraction had, so the description always wins.

**Tech stack:** Next.js 16, React 19, Vitest with jsdom for components. No database, no migration, no prompt changes. One server action (`extractGroupAction`) gains a replay path that reuses the existing merge model call. The onboarding eval bench (`npm run eval:onboarding`, tsx, outside Vitest, costs money).

### Global constraints

- **Bench spend is capped at $5 for the whole slice.** Estimate before each run from the case count; stop and rule if the cap would be crossed.
- **No Orbit prompt changes.** `src/lib/orbit/extract.ts`, `merge.ts` and their prompts are untouched. If a task seems to need one, stop and report; it means paid bench runs and is the owner's call.
- **Orbit's copy is exact.** Every string below is owner-approved; do not reword, add punctuation, or add a question after the new re-ask line.
- **No em dashes in anything Orbit says.**
- **Only the gap step's layout changes.** Steps 1, 2 and 3 must render exactly as today; `src/app/create/page.tsx` is not edited.
- **Teal/lime rules:** the founder's bubble is `--surface-self`, never teal or lime. The send button keeps its existing `SendCircleButton` behaviour.
- **Nothing below 13px; chat body at `--type-body`.**

### The approved picture (build to this)

Captured from the throwaway mock at `src/app/zz-mock/gap-thread/` (git-excluded) at 390×661:

- Header (`WizardHeader step={2}` with back) at the top, never scrolling away.
- A scrolling region with `1.5rem` side padding holding: the playback card exactly as `StepGapAsk` draws it today, `1rem` below it, then the thread as a column with `0.75rem` gaps. Orbit turns are `OrbitBubble` (with avatar); founder turns are right-aligned `SelfBubble`s; while a merge runs, `OrbitPause` with "One sec, I'm updating your schedule." is the last item.
- A pinned bottom area: the existing textarea plus `SendCircleButton` row, and the hint line (`GAP_HINT_EXAMPLES[gap.missing]`) under it. The mock drew a hairline above it; **build it with the group home's composer treatment instead** (read how `GroupHome.tsx` grounds its composer and match it), which the owner accepted by default.
- The region opens scrolled to the newest item and follows each new one.

### File map

- Modify `src/lib/orbit/gap.ts`: the per-kind stalled lead-in; `gapBubbleLine` gains the gap kind.
- Modify `src/lib/orbit/__tests__/gap.test.ts`.
- Modify `scripts/try-merge.ts` (one call site of `gapBubbleLine`).
- Create `src/components/SelfBubble.tsx`; test in `src/components/__tests__/SelfBubble.test.tsx`.
- Modify `src/app/groups/[id]/MessageFeed.tsx` (use `SelfBubble`; behaviour-preserving, declared in the PR as a touch to shipped code).
- Modify `src/app/create/OnboardingWizard.tsx` (thread state, gap-step screen).
- Modify `src/app/create/StepGapAsk.tsx` (render the thread; layout).
- Modify `src/app/create/__tests__/OnboardingWizard.test.tsx`, `src/app/create/__tests__/StepGapAsk.test.tsx`.
- Create `src/lib/orbit/replay.ts` (answer parsing, the replay call, the description-wins guard) and `src/lib/orbit/__tests__/replay.test.ts`.
- Modify `src/app/actions/extract-group.ts` and its test (find it with `grep -rl extractGroupAction src --include=*.test.ts`).
- Modify `evals/onboarding/cases.ts` and `evals/onboarding/run.ts` (a `replay` case kind).

---

### Task 0: open the record (coordinator)

- [ ] Add a new §11 entry to `docs/build-notes.md`, "the gap-ask keeps the conversation on screen (opened 27 September 2026)", carrying: the baseline (**2205 passed of 2205 across 180 files, zero failures, on `main` at `617d8b4`**, cut into `gap-ask-thread` in its own worktree; the step 2 cleanup slice recorded no finishing count, its starting count was 2146 across 179, so the cross-check is noted absent), and the seven settled decisions from the front section in one line each (7 marked as a build ruling made in the owner's absence).
- [ ] Commit the slice document and the entry together.

### Task 1: a stalled re-ask for a guessable gap acknowledges instead of repeating

**Files:** `src/lib/orbit/gap.ts`, `src/lib/orbit/__tests__/gap.test.ts`, `scripts/try-merge.ts`.

**What.** Replace the single stalled lead-in with a per-kind table. For a guessable kind the stalled bubble is the guess line **alone**, with no question after it. For the four non-guessable kinds the stalled bubble is exactly today's `"No worries. Let me ask again: " + question`.

The exact strings (owner-approved; the both_spot one is a declared build choice, see below):

| kind | stalled bubble |
|---|---|
| `time` | `No problem. A best guess at a time is fine for now.` |
| `day` | `No problem. A best guess at a day is fine for now.` |
| `both` | `No problem. A best guess at a day and time is fine for now.` |
| `spot` | `No problem. A best guess at a spot is fine for now.` |
| `time_spot` | `No problem. A best guess at a time and a spot is fine for now.` |
| `day_spot` | `No problem. A best guess at a day and a spot is fine for now.` |
| `both_spot` | `No problem. A best guess is fine for now.` |
| `cadence`, `ambiguous_time`, `cadence_spot`, `ambiguous_time_spot` | `No worries. Let me ask again: {question}` (unchanged) |

`both_spot` drops the naming because "a day, time and spot" measured three rows at 390px, and the approved constraint is two rows; the generic line is the declared fallback, surfaced to the owner in the go summary.

- [ ] **Write failing tests first** in `gap.test.ts` under `describe("gapBubbleLine")`:
  - For each of the seven guessable kinds, `gapBubbleLine(anyQuestion, 1, true, kind)` returns exactly the table string, and does **not** contain `anyQuestion`.
  - For each of the four non-guessable kinds, `gapBubbleLine("Is that every week?", 1, true, kind)` returns `"No worries. Let me ask again: Is that every week?"`.
  - A drive over `GAP_ASKABLE_KINDS` asserting every kind has an entry (so a new kind fails loudly).
  - Update the existing calls to pass a kind; the existing round-0 and not-stalled expectations are unchanged for every kind (round 0 never uses the stalled line even if `stalled` is true, as today's test at line ~321 already pins).
  - Replace the old `GAP_STALLED_INTRO` assertions at ~314-317 and ~524 with equivalents against the new export; keep the "no Thanks" property.
- [ ] Run `npx vitest run src/lib/orbit/__tests__/gap.test.ts` and show it failing.
- [ ] Implement: export `GAP_STALLED_REASK: Record<GapAskable, { kind: "guess"; line: string } | { kind: "repeat" }>` (or an equivalent total shape), keep `GAP_STALLED_INTRO` as the "repeat" lead-in, and change the signature to `gapBubbleLine(question: string, answersGiven: number, stalled: boolean, missing: GapAskable): string`. Update the doc comments to say why a guessable re-ask carries no question (the owner's two-row limit; the hint line under the box carries the example).
- [ ] Update `scripts/try-merge.ts:43` to pass the outcome's missing kind.
- [ ] Update `StepGapAsk.tsx:102` to pass `gap.missing` (Task 3 later moves this call into the wizard; this keeps the tree compiling now).
- [ ] Run the file green, then `npx tsc --noEmit` clean. Commit.

### Task 2: lift the viewer's bubble into a shared component

**Files:** create `src/components/SelfBubble.tsx` and `src/components/__tests__/SelfBubble.test.tsx`; modify `src/app/groups/[id]/MessageFeed.tsx`.

**What.** A behaviour-preserving extraction. `MessageFeed.tsx` ~lines 369-400 draw the self bubble: wrapper `maxWidth: "93%"`, inner `backgroundColor: var(--surface-self)`, `border: 1px solid var(--hairline)`, `borderRadius: "16px 16px 5px 16px"`, `padding: "11px 14px"`, body text at `--type-body` / `--leading-normal` / `--text-primary`. Read the whole self branch first; anything else inside it (e.g. a sending/opacity state, timestamps, the comment about the hairline and the later CSS pass) must keep working exactly as now.

- [ ] Write `SelfBubble.test.tsx` first: renders its children; the bubble carries `var(--surface-self)` and the `16px 16px 5px 16px` radius; it accepts whatever extra the feed needs (e.g. a `style` or `dimmed` prop, only if the feed's branch uses one). Show it failing (module missing).
- [ ] Create `SelfBubble` (presentational, no hooks, no `"use client"`, matching `OrbitBubble`'s header-comment style). Move the hairline comment with it.
- [ ] Replace the inline markup in `MessageFeed.tsx` with `<SelfBubble>`. Right-alignment stays the feed's job unless the feed already puts it inside this block.
- [ ] Run `npx vitest run src/components src/app/groups` green; `npx tsc --noEmit` clean. If any existing MessageFeed test changes, stop and report: this task must not change behaviour. Commit.

### Task 3: the wizard keeps the thread, and the gap step renders it

**Files:** `src/app/create/OnboardingWizard.tsx`, `src/app/create/StepGapAsk.tsx`, their tests.

**What.**

- New wizard state `thread: GapTurn[]`, where `type GapTurn = { from: "orbit"; text: string } | { from: "founder"; text: string }` (export the type from `StepGapAsk.tsx`).
- **Fresh extraction lands incomplete** (the existing `extractState.status === "incomplete"` branch): `thread` becomes `[{ from: "orbit", text: gapBubbleLine(gap.question, 0, false, gap.missing) }]`. This is also how decision 3 happens: returning to step 1 and continuing always re-extracts, so the thread resets.
- **Send** (`handleAnswerSubmit`): append `{ from: "founder", text: answerDraft.trim() }` and clear the draft **before** the merge resolves.
- **Merge `error` / `unavailable`**: remove that founder turn, put its text back into `answerDraft`, set the error as today. The round is not consumed (unchanged).
- **Merge `incomplete`**: append `{ from: "orbit", text: gapBubbleLine(result.gap.question, result.round, !result.progressed, result.gap.missing) }`, computed once here and stored.
- **Merge `ready` / `exhausted`**: unchanged; the thread is simply left behind.
- `stalled` and `round` props on `StepGapAsk` go away if nothing else reads them; `StepGapAsk` takes `thread` and renders each turn (`OrbitBubble` or `SelfBubble` right-aligned), then `OrbitPause` with the existing `MERGE_PAUSE_COPY` while `isMerging`. The pause moves from under the composer into the thread; the hint line under the composer stays.
- Keep everything else in `StepGapAsk` (the card, venue suffixes, error line, textarea behaviour, `aria` wiring) exactly as it is.

- [ ] **Tests first**, in `OnboardingWizard.test.tsx` (drive the real wizard; `extractMock` resolves `incomplete` with a gap payload, `mergeGapMock` controls each round):
  - After step 1 lands on the gap, exactly one Orbit bubble shows the round-0 line.
  - Sending "we start at 7" shows it as a bubble immediately (before `mergeGapMock` resolves; use a deferred promise), and the box is empty.
  - When the merge resolves `incomplete, progressed: true`, both Orbit lines and the answer are on screen, in order.
  - A stalled round on a `spot` gap appends exactly `No problem. A best guess at a spot is fine for now.` and no question text.
  - A merge resolving `error` removes the answer bubble and restores "we start at 7" to the box, with the error line shown.
  - Back arrow to step 1, Continue again (extract resolves incomplete again): only the fresh round-0 bubble remains.
- [ ] In `StepGapAsk.test.tsx`, update the props in the existing render helper to the new shape; every existing test must still pass unchanged in intent. Add: a founder turn renders in a `--surface-self` bubble; `OrbitPause` copy appears only while `isMerging`.
- [ ] Show the new tests failing, implement, show them green. `npx tsc --noEmit` clean. Commit.

### Task 4: the gap step gets its own full-height screen

**Files:** `src/app/create/OnboardingWizard.tsx` (the `step === "gap"` branch), `src/app/create/StepGapAsk.tsx`.

**What.** The gap step must fill the screen with a pinned composer while steps 1-3 keep today's page layout, and `create/page.tsx` is not edited (its `main` has `minHeight: 100dvh` and `2rem 1.5rem` padding around a `28rem` column). So the gap branch renders its own screen layer:

- Outer: `position: fixed; inset: 0; background: var(--surface-base); display: flex; justify-content: center` (covers the page's padding; nothing else is on the page at that step).
- Inner column: `height: 100dvh; width: 100%; max-width: 28rem; display: flex; flex-direction: column` (the group home's `100dvh` pattern, which the owner uses daily on the same phone without the overlap).
- Top: `WizardHeader` with `2rem 1.5rem 0` padding (matching today's position on screen).
- Middle: `flex: 1; min-height: 0; overflow-y: auto; padding: 0 1.5rem`, holding the card and the thread.
- Bottom: the composer row and hint, `padding: 0.5rem 1.5rem 1rem` plus `env(safe-area-inset-bottom)`, grounded with the group home composer's treatment (read `GroupHome.tsx`, reuse its values; do not invent a new one).
- Scroll to newest: an effect keyed on `thread.length` and `isMerging` that scrolls a sentinel at the end of the thread into view (`block: "end"`), and on first mount.

- [ ] Tests: jsdom cannot judge layout or scrolling, so assert only structure: the composer (the `Message Orbit` textarea) is **not** inside the scrolling region, and the card and the thread **are**; `scrollIntoView` (stubbed on `Element.prototype`) is called after a new turn arrives. Show both failing first.
- [ ] Implement. Steps 1, 2 and 3 render byte-for-byte as before: confirm by running their existing tests unchanged.
- [ ] Full suite green, `npx tsc --noEmit` clean. Commit.

### Task 5: replay bench cases, shown red on today's behaviour

**Files:** `evals/onboarding/cases.ts`, `evals/onboarding/run.ts`, create `src/lib/orbit/replay.ts` (stub only in this task).

**What.** A new case kind proves remembered answers are actually used, through the real production sequence, before the feature exists.

- In `replay.ts`, export `extractWithPriorAnswers(description: string, priorAnswers: string[]): Promise<unknown>`. **In this task it is a deliberate stub** that ignores `priorAnswers` and returns `extractGroupProfile(description)` (today's behaviour), with a comment saying Task 6 replaces it.
- Add `ReplayCase { id; kind: "replay"; description; founderDescription; priorAnswers: string[]; assertions }` to `cases.ts`, and a `runOnce` branch in `run.ts` that grades `toOutcome(await extractWithPriorAnswers(c.founderDescription, c.priorAnswers))`.
- Three cases, ids prefixed `replay-` so `npm run eval:onboarding -- 5 replay` selects them:
  1. `replay-fills-time-and-spot`: founderDescription `"We climb Tuesdays and Thursdays"`, priorAnswers `["around 7pm", "Movement Gowanus"]`. Assert: status ready; primary `timeLocal === "19:00"`; primary venue contains `Movement` (case-insensitive).
  2. `replay-description-wins`: founderDescription `"We climb Tuesdays and Thursdays at 6pm"`, priorAnswers `["around 7pm", "Movement Gowanus"]`. Assert: primary `timeLocal === "18:00"`; primary venue contains `Movement`.
  3. `replay-idk-stays-missing`: founderDescription `"We climb Tuesdays and Thursdays at 7pm"`, priorAnswers `["idk, we'll figure it out"]`. Assert: status incomplete; missing needs a spot (`needsSpot`).
  Use the file's existing shared readers; add one only if none fits.
- [ ] Run `npm run eval:onboarding -- 5 replay` (15 model calls, a few cents). Expected on the stub: case 1 red on both assertions, case 2 red on venue, case 3 green. Paste the scoreboard into the report. If case 1 is **not** red, stop and report: the bench cannot see the feature.
- [ ] `npx tsc --noEmit` clean. Commit (stub plus cases).

### Task 6: remembered answers fill the gap, and the description wins

**Files:** `src/lib/orbit/replay.ts`, `src/lib/orbit/__tests__/replay.test.ts`, `src/app/actions/extract-group.ts` and its test.

**What.**

- `parsePriorAnswers(raw: unknown): string[]`: accepts a JSON string of an array; keeps string items, trimmed, non-empty, each `.slice(0, ANSWER_MAX)` (import or share merge-gap's 500), keeps the **last 6**. Anything malformed returns `[]`, never throws (this is client input; treat it as a claim).
- `enforceFreshFieldsWin(raw: unknown, fresh: StoredRhythm[], freshGroupName: string | null): unknown`: after the merge, for each rhythm in the raw claim whose activity matches a fresh rhythm (case-insensitive, trimmed), restore every field the fresh rhythm had non-null: `daysOfWeek`, `timeLocal`, `venueName`, `cadence`; and restore the fresh group name when non-null. Read `enforceVenueCarryOver` / `enforceActivityCarryOver` (in `src/lib/orbit/`) for the raw claim's field names and follow their shape exactly; the raw claim may use schema names that differ from `StoredRhythm`'s.
- `extractWithPriorAnswers(description, priorAnswers)` (replacing the stub): extract; if `priorAnswers` is empty, return that raw claim. Otherwise normalize it; if it is `ready`, or `nothing_schedulable`, or has no rhythms, return the extraction raw claim unchanged (the description is complete or unusable, so answers are irrelevant). Otherwise call `mergeGapAnswer` with `{ description, groupName, currentState: fresh rhythms, candidateTimeLocal, askedAbout: fresh missing, answer: priorAnswers.join("\n") }`, then `enforceActivityCarryOver`, `enforceVenueCarryOver`, `enforceFreshFieldsWin`, and return that. **If the merge call throws, return the extraction raw claim** (fail-soft: the founder is simply asked, as today) after `console.error("[onboarding] prior-answer replay failed:", err)`; a `ModelUnavailableError` from the *extraction* still propagates exactly as today.
- `extractGroupAction` reads `formData.get("priorAnswers")` through `parsePriorAnswers` and calls `extractWithPriorAnswers` instead of `extractGroupProfile`. Everything after (normalize, gap question, statuses) is unchanged. The round the wizard starts at stays 0.

- [ ] Tests first, in `replay.test.ts` (no model calls; mock `mergeGapAnswer` / `extractGroupProfile` via `vi.mock` of their modules): `parsePriorAnswers` on a good array, junk, non-array, over-long items, seven items (keeps last six); `enforceFreshFieldsWin` restores a fresh time over a merged one, restores a fresh venue, leaves a field the fresh rhythm lacked as merged, ignores a merged rhythm with no fresh match; `extractWithPriorAnswers` skips the merge with no answers, skips it when extraction is ready, calls it with the joined answers when incomplete, and falls back to the extraction claim when the merge throws. In the action test: a malformed `priorAnswers` field behaves exactly like none.
- [ ] Show them failing, implement, green. `npx tsc --noEmit` clean. Commit.

### Task 7: the wizard remembers answers, and the bench goes green

**Files:** `src/app/create/OnboardingWizard.tsx`, `src/app/create/__tests__/OnboardingWizard.test.tsx`; then a bench run.

**What.**

- New wizard state `priorAnswers: string[]`. When a merge resolves with any non-error status (`incomplete`, `ready`, `exhausted`), append the trimmed answer that was sent, keeping the last 6. An `error` / `unavailable` merge appends nothing.
- `extractFormActionClearingExhausted(formData)` sets `formData.set("priorAnswers", JSON.stringify(priorAnswers))` before dispatching. Never cleared during the wizard's life.

- [ ] Tests first (real wizard, mocked actions): after one successful answer, going back and pressing Continue sends `priorAnswers` containing it to `extractGroupAction`; an answer whose merge errored is not sent; a first extraction sends `[]`.
- [ ] Green, `npx tsc --noEmit` clean, commit.
- [ ] Run `npm run eval:onboarding -- 5 replay`. Expected: all three cases clean. Then run the full bench once, `npm run eval:onboarding -- 5` (about 85 calls, well under a dollar), and compare every non-replay case against the step 2 cleanup's recorded after-numbers in build-notes §11; nothing may drop, since no prompt changed.
- [ ] **If a replay case is not clean:** rerun it once at 5 runs to separate noise. If still not clean, try the one change the plan allows: replay answers one at a time (a merge per answer, oldest first, each followed by the three guards) instead of joined, and rerun. If still not clean, the controller rules: ship Tasks 1-4 and the parser only, drop the replay path, and record why. No prompt edits, ever, in this slice.
- [ ] Record both scoreboards and the spend in the report.

### Task 8: verification and the record (coordinator)

- [ ] Delete `src/app/zz-mock/gap-thread/` (it no longer compiles after Task 1 and was never tracked).
- [ ] Browser pass at 375×812 (also: answer a question, go back to step 1, change the description, continue, and confirm the answer was kept or overridden as decision 7 says) on the worktree dev server (`npm run dev -- --webpack --port 3100`, since `preview_start` serves main): drive a real description missing time and spot through three rounds including an "idk" answer; screenshot rounds 1, 2 and the stalled re-ask; confirm the header stays put, the view follows the newest bubble, and step 1-3 look unchanged.
- [ ] Real-phone pass (mobile-first rule: new layout, vertical space changed): the owner, or LAN address, iPhone Chrome, with the keyboard up. Record whether the message box clears Chrome's floating address bar. If it does not, that finding goes to the owner before the PR, not into a speculative fix.
- [ ] `npm run build` green. Full suite: record passed/total against the 2205/180 baseline.
- [ ] Independent read-only review of the assembled diff; fix or record each finding.
- [ ] Finish the §11 entry (what was decided along the way, the both_spot fallback, the measurements, the debt) and update CLAUDE.md's "Where the build is" onboarding paragraph and the queue line (item 1 done).
- [ ] Open the PR with the review report; QA script in chat.

### Self-review (done while writing)

- Every front-section decision maps to a task: 1-2 → Tasks 2-4, 3 → Tasks 3 and 5-7, 4 → Task 3, 5 → Task 1, 6 → the approved picture, 7 → Task 6.
- No prompt, schema or migration change anywhere; one action gains a replay path.
- The only touch to shipped code outside onboarding is `MessageFeed.tsx`, declared. The bench files are touched to add a case kind, never to change an existing case.
