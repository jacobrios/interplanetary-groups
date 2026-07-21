# Gap-Ask Conversational Loop Implementation Plan

> **This is a pre-build plan, preserved as written.** It records intent before implementation; build-notes §11 (gap-ask conversational loop slice) records what actually landed, and the drift between the two is part of the record.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace onboarding's static gap gate with a two-round conversational loop: Orbit asks one generated, code-validated question per round, a single merge call per founder answer returns merged rhythm state plus the next question, and ambiguous clock times become a structured flag instead of a silent model guess.

**Architecture:** Both model calls (extract, merge) share one widened structured-output schema carrying `timeAmbiguous` per rhythm and a top-level `clarifyingQuestion`, so the question always rides the same response as the state (one labeled pause per utterance). All raw output passes through the existing `normalizeExtraction`; all round/cap/fallback control flow lives in a new pure module `gap.ts` (the CI seam). The wizard gains a `gap` step rendered per mockup screen 03.

**Tech Stack:** Next.js 16 server actions, `@anthropic-ai/sdk` structured outputs (`claude-haiku-4-5`), Vitest pure-seam tests, `tsx` harness scripts.

## Global Constraints

- One model call per founder answer; two back-to-back pauses per answer is a product failure.
- Two conversational rounds maximum (two founder answers), then the existing edit-description escape hatch.
- Merged output is normalized before any control flow reads it (raw output is a claim, not a fact).
- Orbit's question: one sentence, ends in `?`, 8–140 chars in code (prompt asks < 120), no em/en dashes, no newlines; invalid → silent fallback to static templates (templates are demoted, never deleted).
- No em/en dashes in any user-facing copy; three-letter weekday abbreviations; soft declines; 7th–8th grade Orbit voice.
- Lime is never a button: send button is neutral when empty, teal when typed (ChatInput recipe); lime appears only on the gap marker and gapped row label.
- `rhythm.ts`, `create-group.ts` (server completeness gate), `Step2Playback.tsx`, and the Prisma schema are untouched.
- The unauthenticated pre-auth model-call debt ceiling rises from 1 to ~3–4 calls per visitor; restate in the PR.
- Server actions must not trust the client round-trip: re-validate `gap.rhythms` via `parseStoredRhythms`, clamp `round`, whitelist `missing`, re-check `candidateTimeLocal` against `HH:MM`.

**Approved deviations (recorded):** teal-when-typed send button (mockup's final dark pass agrees); gap-card name row read-only; hint example "we start at 7" → "we start at 7pm"; two template sets (`REASK_COPY` description-editing context, `GAP_REASK_COPY` input context); merge action via `useTransition` (in-file `createGroupAction` precedent), not `useActionState`.

**Approved behavior note:** `nothing_schedulable` on the *initial* extraction deliberately keeps the static Step 1 treatment — no partial card exists to anchor a conversation. Mid-loop `nothing_schedulable` (merge lost the activity) escapes to describe with the exhausted explainer.

---

### Task 1: `gap.ts` pure decision logic

**Files:**
- Create: `src/lib/orbit/gap.ts`
- Test: `src/lib/orbit/__tests__/gap.test.ts`

**Interfaces (produced):**

```ts
export type GapAskable = Exclude<MissingField, "nothing_schedulable">
export const MAX_GAP_ROUNDS = 2
export const QUESTION_MAX = 140
export const GAP_REASK_COPY: Record<GapAskable, string>
export const GAP_ROUND_INTRO: [string, string]   // round 0 / round 1 lead-ins
export const GAP_HINT_EXAMPLES: Record<GapAskable, string>  // pre-joined "· " display strings
export function readClarifyingQuestion(raw: unknown): string | null
export function validateQuestion(q: unknown): string | null   // trimmed question or null
export function resolveGapQuestion(missing: GapAskable, rawQuestion: unknown): string
export type GapOutcome =
  | { kind: "ready" }
  | { kind: "ask"; missing: GapAskable; question: string }
  | { kind: "escape" }
export function decideGapOutcome(
  normalized: NormalizedOnboarding, rawQuestion: unknown, answersGiven: number
): GapOutcome
```

Copy (approved): `GAP_REASK_COPY` = time "What time do you usually meet?", day "What days do you usually meet?", both "What day and time do you usually meet?", cadence "Is that every week?", ambiguous_time "Is that in the morning or the evening?". `GAP_ROUND_INTRO` = ["Here's what I got. One question:", "Thanks. One more thing:"].

- [ ] Write `gap.test.ts` red: validator accept/reject matrix (short valid question trimmed; non-string/null; empty/under-8; missing trailing `?`; two `?`; internal `.` or `!`; em dash; en dash; newline; over 140), `resolveGapQuestion` pass-through/fallback/null-fallback, every `GAP_REASK_COPY` value passes `validateQuestion` (self-consistency), `decideGapOutcome` (ready discards rider question; incomplete under cap asks with resolved question; `answersGiven >= 2` escapes; mid-loop `nothing_schedulable` escapes at any round; empty partial rhythms escape), `readClarifyingQuestion` (string / absent / null / non-string / garbage shapes), copy-rules block (no em/en dashes in any exported copy).
- [ ] Implement `gap.ts` green. Note `decideGapOutcome` reads only the *normalized* result plus the raw question string; it never inspects raw rhythms.
- [ ] Full suite green (hook), commit.

### Task 2: `normalize.ts` ambiguity + partial incomplete state

**Files:**
- Modify: `src/lib/orbit/normalize.ts`
- Test: `src/lib/orbit/__tests__/normalize.test.ts` (extend; update `raw()` helper for `clarifyingQuestion: null` and `timeAmbiguous: false` fixtures)

**Interfaces (produced):**

```ts
export type MissingField = "time" | "day" | "both" | "cadence" | "ambiguous_time" | "nothing_schedulable"
export type NormalizedOnboarding =
  | { status: "ready"; groupName: string; rhythms: StoredRhythm[] }
  | { status: "incomplete"; missing: MissingField
      groupName: string | null            // cleaned suggestion only, never derived fallback
      rhythms: StoredRhythm[]             // gapped primary at [0]; [] only for nothing_schedulable
      candidateTimeLocal: string | null } // only non-null for ambiguous_time / ambiguous both
```

Rules: `sanitize` parses `timeAmbiguous: o.timeAmbiguous === true && timeLocal !== null`; `isSchedulable` adds `&& !c.timeAmbiguous`; classification priority — cadence-only gap (needs unambiguous time) → `cadence`; no day + no stated time → `both`; no day + ambiguous → `both` (candidate carried); no day + known time → `day`; day + no stated time → `time`; day + ambiguous → `ambiguous_time`; confidently monthly → `nothing_schedulable`. Ambiguity outranks cadence. On every path, ambiguous times on non-primary rhythms degrade to null; on the incomplete primary, the guess moves to `candidateTimeLocal` and stored `timeLocal` is null. `normalizeName` splits into `cleanSuggestedName` (cleaning half, null when empty) + ready-path fallback.

- [ ] Extend `normalize.test.ts` red per the plan's classification table, degradation cases, promotion-past-ambiguous-primary, ambiguity-before-cadence, widened incomplete shape, merge-overrides-prior-fields (synthetic merged raw → ready with new values).
- [ ] Implement green; existing incomplete-shape assertions updated.
- [ ] Full suite green, commit.

### Task 3: `playback.ts` gap row + template key

**Files:**
- Modify: `src/lib/orbit/playback.ts`
- Test: `src/lib/orbit/__tests__/playback.test.ts` (extend)

**Interfaces (produced):**

```ts
export function formatGapRhythmRow(
  r: StoredRhythm, missing: GapAskable, candidateTimeLocal: string | null
): { label: string; known: string | null; marker: string }
```

Marker table: time → known `formatDays(days)`, "what time?"; day → known `at {time}`, "what days?"; both → known null, "what day and time?"; cadence → known `{days} at {time}`, "every week?"; ambiguous_time → known `{days} at {bareHour}` ("19:00" → "7", "19:30" → "7:30", "12:00" → "12"; no am/pm), "morning or evening?"; null candidate degrades to the time row. `REASK_COPY.ambiguous_time` = "Got it. Is that morning or evening? Add am or pm to your description and I'll set up the schedule."

- [ ] Extend `playback.test.ts` red (per-gap rows, bare-hour cases, degradation, copy rules).
- [ ] Implement green, full suite, commit.

### Task 4: `extract.ts` schema/prompt + `merge.ts`

**Files:**
- Modify: `src/lib/orbit/extract.ts` (schema gains required `timeAmbiguous` per rhythm and top-level `clarifyingQuestion`; export `EXTRACTION_SCHEMA` and a new `FIELD_RULES` string; prompt bullets for timeAmbiguous semantics with positive/negative examples and the clarifyingQuestion contract)
- Create: `src/lib/orbit/merge.ts`

**Interfaces (produced):**

```ts
export function mergeGapAnswer(input: {
  description: string; currentState: StoredRhythm[]; groupName: string | null
  candidateTimeLocal: string | null; askedAbout: GapAskable; answer: string
}): Promise<unknown>
```

Merge system prompt: latest word wins (may replace any field including activity), untouched fields carried verbatim, indirect answers resolved against CANDIDATE TIME, vague answers leave fields unchanged, shared `FIELD_RULES`, question contract, one worked example. User message: labeled DESCRIPTION / CURRENT UNDERSTANDING (state re-encoded in schema shape: `isPrimary: i === 0`, `timeAmbiguous: false`, `clarifyingQuestion: null`) / CANDIDATE TIME / WE ASKED (human phrase per `GapAskable`) / ANSWER sections. Same client boilerplate, model, `max_tokens`, `ExtractionError` contract as `extractGroupProfile`. Untested seam (pure-seam pattern); harness-covered. Header comment states the Haiku reasoning.

- [ ] Modify `extract.ts`; create `merge.ts`; suite stays green (no unit tests here by design), commit.

### Task 5: server actions

**Files:**
- Modify: `src/app/actions/extract-group.ts`
- Create: `src/app/actions/merge-gap.ts`

**Interfaces (produced):**

```ts
export interface GapPayload {
  missing: GapAskable; question: string       // render-ready: validated or template
  groupName: string | null; rhythms: StoredRhythm[]; candidateTimeLocal: string | null
}
export type ExtractGroupState =
  | { status: "idle" } | { status: "error" } | { status: "unusable" }
  | { status: "incomplete"; gap: GapPayload }
  | { status: "ready"; profile: { groupName: string; rhythms: StoredRhythm[] } }

export interface MergeGapInput {
  description: string; answer: string; round: number   // answers given BEFORE this one: 0|1
  gap: { missing: GapAskable; groupName: string | null; rhythms: unknown; candidateTimeLocal: string | null }
}
export type MergeGapResult =
  | { status: "error" }                                  // soft retry, round not consumed
  | { status: "ready"; profile: { groupName: string; rhythms: StoredRhythm[] } }
  | { status: "incomplete"; gap: GapPayload; round: number }
  | { status: "exhausted" }
```

`extractGroupAction`: ready as today; `nothing_schedulable` or empty partial → `unusable`; else `incomplete` with `resolveGapQuestion`. `mergeGapAction`: validate (answer trimmed non-empty ≤ 500, description non-empty ≤ 2000, round integer clamp, `parseStoredRhythms` on the round-trip, whitelist `missing`, regex-check candidate) → `mergeGapAnswer` → `normalizeExtraction` → `decideGapOutcome(normalized, readClarifyingQuestion(raw), round + 1)` → map ready/ask/escape.

- [ ] Implement both; suite green (actions are untested plumbing over tested pure functions), commit.

### Task 6: wizard + gap step UI

**Files:**
- Create: `src/app/create/StepGapAsk.tsx`
- Modify: `src/app/create/OnboardingWizard.tsx`, `src/app/create/Step1Describe.tsx`

Wizard: step union `"describe" | "gap" | "playback"`; new state `gap`, `round`, `answerDraft`, `gapExhausted`, `mergeError`, `useTransition` merge; extraction handled-marker transition extends to route unhandled `incomplete` → gap step (reset round/draft/exhausted); merge result handling inside the transition (error → soft error + preserved draft; ready → copy profile, playback; incomplete → new gap payload + round, clear draft; exhausted → `gapExhausted`, describe). "Edit my description" → describe with `extractState` untouched so Step 1 shows `REASK_COPY[gap.missing]`. Wrapped form action clears `gapExhausted` on resubmit.

StepGapAsk (presentational): shipped-chrome playback card (plain name row when non-null, WHO row, `formatGapRhythmRow` at [0] with lime-tinted label + inline gap pill (clock SVG, italic `--text-secondary`, 2px lime bottom border), `formatRhythmRow` for the rest, no confirm affordance) → untailed Orbit question bubble (`GAP_ROUND_INTRO[min(round,1)]` + question) → optional error line (Step 1's treatment) → message form (ChatInput recipe, disabled-but-mounted while merging, send disabled when empty) → hint line (`--type-eyebrow`, `--text-placeholder`, centered) swapped for the labeled pause while merging (`MERGE_PAUSE_COPY = "One sec, I'm updating your schedule."`) → tertiary "Edit my description". Step1Describe: `bubbleOverride?: string` prop (exhausted explainer: "I'm still missing a few details. Add the day and time to your description and I'll take another look."), new-union copy selection.

- [ ] Implement all three; suite green; commit.

### Task 7: lint/build + harness + manual QA

**Files:**
- Modify: `scripts/try-extract.ts` (print `QUESTION:` raw and `VALIDATED:` verdict lines)
- Create: `scripts/try-merge.ts` (`npx tsx scripts/try-merge.ts "<description>" "<answer1>" ["<answer2>"]` — real extract → merge loop, printing RAW / NORMALIZED / OUTCOME / composed bubble per turn, building the gap payload exactly as the action does)

- [ ] `npm run lint` and `npm run build` clean (vitest doesn't typecheck; build catches cross-file drift).
- [ ] Run and record: ambiguity positives ("Tuesdays at 7", "we meet at 6"); negatives ("7am", "noon", "after work around 6", "Sunday mornings at 8"); vague answer "hmm not sure" (round consumed); override "actually Saturdays at 10" (both fields replaced); activity swap; cadence answer "once a month" (→ escape).
- [ ] Browser walkthrough at `/create` (dev-test DB): happy path unchanged; "Tuesdays at 7" → "Tue at 7" + "morning or evening?" → "in the evening" → playback "Tue at 7pm, every week"; two-round path; exhausted → describe + explainer → re-extract; mid-loop bail → Step 1 description-editing template; merge failure → soft error, draft preserved. Visual checks: one pause per answer, lime marker, teal-when-typed send, 13px hint. Screenshot evidence.
- [ ] Commit harness work.

### Task 8: build-notes §11 entry + PR

- [ ] §11 entry: what landed; closure of the "ambiguous clock times" named candidate; the five recorded deviations; the `nothing_schedulable`-keeps-static-Step-1 note; debt restatement (pre-auth ceiling now ~3–4 calls, same MVP-traffic acceptance; prompt quality still harness-verified, not CI-covered).
- [ ] Commit; open PR `feat/gap-ask-loop` → `main`; leave for the human to merge (code PR).
