# Founder Onboarding (first Anthropic API call) — Implementation Plan

> **This is a pre-build plan, preserved as written.** It records intent before implementation; build-notes §11 (founder-onboarding slice) records what actually landed, and the drift between the two is part of the record.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. On approval, also copy this file to `docs/superpowers/plans/2026-07-21-founder-onboarding.md` per project convention.

**Goal:** Replace the two-field create-group stub with the designed three-beat onboarding: founder describes the group in free text → claude-haiku-4-5 extracts structured rhythms → deterministic playback → confirm → group created with a real first event on the home screen.

**Architecture:** One server-side Anthropic call (structured outputs, JSON schema) returns raw claims; a pure, fully-tested normalization layer turns claims into the stored shape and runs the completeness gate; every founder-visible string is composed deterministically from normalized fields. The existing scheduled-event engine is widened (storage shape, time range check, group-scoped reconcile) without changing its behavior for the current single-weekly path — all 30 existing rhythm tests and all reconcile/announce/occurrence tests pass unchanged.

**Tech Stack:** Next.js 16 (server actions + client wizard), `@anthropic-ai/sdk` (new dep), Prisma 7 (one new migration), Vitest.

## Global Constraints

- **Model:** `claude-haiku-4-5`, server-side only; `ANTHROPIC_API_KEY` never reaches the browser. (User-specified model; do not substitute.)
- **No model-written user-facing copy.** The one model-authored string is `suggestedGroupName`, a structured field (approved decision, venue-displayLabel precedent) — normalized, capped, editable, deterministic fallback.
- **Normalize before branching.** Nothing branches on raw model output. Structured outputs guarantees shape only; semantics (ranges, whitelists, promotion, gate) live in `normalize.ts`.
- **No bypass:** no path creates a group without a schedulable primary rhythm. Enforced server-side in the confirm action, not just in the UI.
- **Existing tests pass unchanged** — `src/lib/orbit/__tests__/{rhythm,occurrence,reconcile,announce}.test.ts`, `src/lib/groups/__tests__/*`.
- **Timezone: write nothing.** `Group.timeZone` stays at `"UTC"` default. No browser timezone capture.
- **Copy rules:** no em/en-dashes in user-facing copy; three-letter weekday abbreviations; soft, warm, ~7th-grade Orbit voice; teal = exactly one primary action per screen; lime = Orbit only, never a button.
- **Two databases, never crossed.** Migration runs against the dev-test DB in `.env`; production migration is a pre-deploy step, recorded in build-notes §11 checklist.
- **Branch `feat/founder-onboarding` off main. Do not merge the PR** (touches non-.md files — human merges).
- **Next.js 16:** before writing any Next-specific pattern not already used in this repo, read the relevant guide in `node_modules/next/dist/docs/`.

## Context

The engine (`rhythm.ts`, `occurrence.ts`, `reconcile.ts`, `announce.ts`) is built and tested but fed only by a seed fixture. The create-group stub collects founderName + groupName and writes neither `recurringActivities` nor anything Orbit can schedule from, so every real group today gets `no_rhythm`-skipped forever and an empty home. This slice feeds the engine real input and generates the first event at creation time (reconcile currently has no group filter and is only called by the daily cron — in local dev, never).

Product decisions settled with the owner during planning:
1. **Group name:** extraction returns `suggestedGroupName` as a structured field; code normalizes (trim, strip em/en-dashes, collapse spaces, cap 50 chars) with deterministic fallback `"{WeekdayFullName} {TitleCased activity}"`; the playback row is inline-editable.
2. **Founder description is stored:** new nullable `Group.description` column, written at confirm, read by nothing yet (flagged).

Deliberate consequences to be aware of (already implied by the spec, made explicit here):
- A **monthly-only** description ("we do dinner first Friday monthly") cannot create a group in this slice — it fails the completeness gate and gets the generic re-ask. Weekly is the only schedulable cadence.
- A rhythm with day + time but **unconfident cadence** (model returned `null`) is *not* inferred to be weekly by code — guessing could silently create wrong weekly events for a monthly group. The prompt instructs the model that a stated weekday implies weekly; if it still returns null, the founder gets the generic re-ask. "Ask if missing, don't guess."

## Prerequisite (human, before Task 5 can be verified live)

- [ ] Add `ANTHROPIC_API_KEY=<key>` to `.env` (server-side; there is no `.env.example` in this repo — same situation as `CRON_SECRET`).

## File Map

| File | Action | Responsibility |
|---|---|---|
| `package.json` | modify | add `@anthropic-ai/sdk` |
| `prisma/schema.prisma` + migration `add_group_description` | modify | `Group.description String?` |
| `src/lib/orbit/rhythm.ts` | modify | widen: `StoredRhythm`, `parseStoredRhythms`, time range fix in shared regex; `parseRhythm` contract unchanged |
| `src/lib/orbit/normalize.ts` | create | raw extraction → normalized profile; promotion; position-zero guarantee; completeness gate; name normalization |
| `src/lib/orbit/playback.ts` | create | deterministic playback rows, time/day formatting, re-ask templates |
| `src/lib/orbit/extract.ts` | create | the Anthropic call: prompt, JSON schema, returns `unknown` |
| `src/lib/orbit/reconcile.ts` | modify | optional `{ groupId }` filter |
| `src/lib/groups/provision.ts` | modify | accept + write `recurringActivities`, `description` |
| `src/app/actions/extract-group.ts` | create | Step-1 action: extract → normalize → gate |
| `src/app/actions/create-group.ts` | rewrite | confirm action: re-validate payload, provision, scoped reconcile (fail-soft), redirect |
| `src/app/create/page.tsx` | rewrite | thin server shell → `OnboardingWizard` |
| `src/app/create/OnboardingWizard.tsx` + `Step1Describe.tsx` + `Step2Playback.tsx` | create | client wizard |
| `scripts/try-extract.ts` | create | manual prompt-iteration harness |
| `scripts/seed-fixture-rhythm.ts` | delete | §11 records "retires when onboarding lands" |
| `docs/build-notes.md` | modify | §11 slice entry + pre-deploy checklist additions |
| Tests | create/extend | `normalize.test.ts`, `playback.test.ts` (new); `rhythm.test.ts`, `reconcile.test.ts`, `provision.test.ts` (extend) |

## Shared Contracts (source of truth for all tasks)

```ts
// rhythm.ts — widened storage shape (one element of Group.recurringActivities)
export interface StoredRhythm {
  activity: string                       // non-empty, founder's words
  title: string                          // derived deterministically, non-empty
  cadence: "weekly" | "monthly" | null   // null = loose (yearly/unknown). Absent in old data ⇒ treat as invalid only if the engine needs it; parseStoredRhythms accepts "weekly" fixtures written before this slice unchanged.
  daysOfWeek: number[] | null            // 0=Sun…6=Sat; null = not stated
  timeLocal: string | null               // "HH:mm" 24h, range-valid; null = not stated
  durationMinutes?: number | null        // legacy, never written by onboarding
}
// GroupRhythm (engine contract) is UNCHANGED. parseRhythm(json) still answers
// "is there a schedulable rhythm at position 0" — activity, title, ≥1 day,
// range-valid HH:mm, cadence exactly "weekly". All 30 existing tests keep passing
// because monthly/loose/missing-field entries at [0] are still not schedulable.

// extract.ts — the model's claim (validated by normalize, never trusted)
// Wire shape enforced by structured outputs; TS type for documentation only:
interface RawExtraction {
  suggestedGroupName: string | null
  rhythms: Array<{
    activity: string | null
    cadence: "weekly" | "monthly" | null
    daysOfWeek: number[] | null
    timeLocal: string | null
    isPrimary: boolean
  }>
}

// normalize.ts
export type MissingField = "time" | "day" | "both" | "cadence" | "nothing_schedulable"
export type NormalizedOnboarding =
  | { status: "ready"; groupName: string; rhythms: StoredRhythm[] } // rhythms[0] schedulable — position-zero guarantee
  | { status: "incomplete"; missing: MissingField }
export function normalizeExtraction(raw: unknown): NormalizedOnboarding
// AMENDMENT (plan review): "cadence" covers day+time present but cadence unknown —
// the founder who wrote "we meet Tuesdays at 7" gets a targeted ask, not the generic one.
// Copy: "Got it. Is that every week? Say so in your description and I'll set up the schedule."

// playback.ts
export function formatRhythmRow(r: StoredRhythm): { label: string; value: string }
export function formatTimeLocal(timeLocal: string): string   // "08:00"→"8am", "14:30"→"2:30pm"
export const REASK_COPY: Record<MissingField, string>

// reconcile.ts
export async function reconcileScheduledEvents(now: Date, opts?: { groupId?: string }): Promise<ReconcileResult[]>

// provision.ts
interface ProvisionInput {
  supabaseAuthId: string; founderName: string; groupName: string
  description?: string | null
  recurringActivities?: StoredRhythm[] | null
}

// actions
export type ExtractGroupState =
  | { status: "idle" } | { status: "error" }
  | { status: "incomplete"; missing: MissingField }
  | { status: "ready"; profile: { groupName: string; rhythms: StoredRhythm[] } }
export async function extractGroupAction(prev: ExtractGroupState, formData: FormData): Promise<ExtractGroupState>

export interface CreateGroupInput {
  founderName: string; groupName: string; description: string; rhythms: unknown
}
export async function createGroupAction(input: CreateGroupInput): Promise<{ error: string } | void> // redirects on success
```

---

### Task 0: Branch, dependency, schema

**Files:** `package.json`, `prisma/schema.prisma`, new migration

- [ ] **Step 1:** `git checkout -b feat/founder-onboarding`
- [ ] **Step 2:** `npm install @anthropic-ai/sdk` (runtime dependency)
- [ ] **Step 3:** Add to `model Group` in `prisma/schema.prisma`, after `name`:

```prisma
  description         String?      // founder's onboarding free text; source material for future gap-ask/RAG slices; nothing reads it yet
```

- [ ] **Step 4:** `npx prisma migrate dev --name add_group_description` (runs against the dev-test DB in `.env`; verify `DATABASE_URL` host is the dev-test project first per the two-databases rule — if in doubt, stop and ask)
- [ ] **Step 5:** `npm test` — all existing suites pass (schema change is additive)
- [ ] **Step 6:** Commit: `chore: add @anthropic-ai/sdk and Group.description column`

### Task 1: Widen rhythm.ts (StoredRhythm, parseStoredRhythms, time range fix)

**Files:** Modify `src/lib/orbit/rhythm.ts`; extend `src/lib/orbit/__tests__/rhythm.test.ts`

**Interfaces:** Produces `StoredRhythm`, `parseStoredRhythms(json: unknown): StoredRhythm[] | null`. `parseRhythm` signature/behavior unchanged except `"99:99"`-class times now rejected (bug fix mandated by spec; no existing test asserts the old acceptance).

- [ ] **Step 1: failing tests** — append to `rhythm.test.ts`:

```ts
describe("parseRhythm time range", () => {
  it("rejects out-of-range hours", () => {
    expect(parseRhythm([{ ...VALID_RHYTHM, timeLocal: "99:99" }])).toBeNull()
    expect(parseRhythm([{ ...VALID_RHYTHM, timeLocal: "24:00" }])).toBeNull()
  })
  it("rejects out-of-range minutes", () => {
    expect(parseRhythm([{ ...VALID_RHYTHM, timeLocal: "08:60" }])).toBeNull()
  })
  it("accepts boundary times", () => {
    expect(parseRhythm([{ ...VALID_RHYTHM, timeLocal: "00:00" }])).not.toBeNull()
    expect(parseRhythm([{ ...VALID_RHYTHM, timeLocal: "23:59" }])).not.toBeNull()
  })
})

describe("parseStoredRhythms", () => {
  const LOOSE = { activity: "beers", title: "Beers", cadence: null, daysOfWeek: null, timeLocal: null }
  it("accepts a schedulable + loose pair", () => {
    const result = parseStoredRhythms([VALID_RHYTHM, LOOSE])
    expect(result).toHaveLength(2)
    expect(result?.[1].cadence).toBeNull()
  })
  it("accepts monthly with day and no time", () => {
    expect(parseStoredRhythms([{ ...LOOSE, cadence: "monthly", daysOfWeek: [5] }])).not.toBeNull()
  })
  it("accepts legacy fixture shape (no cadence-null fields)", () => {
    expect(parseStoredRhythms([VALID_RHYTHM])).not.toBeNull() // absent daysOfWeek/timeLocal ≠ present-and-invalid
  })
  it("rejects unknown cadence strings", () => {
    expect(parseStoredRhythms([{ ...LOOSE, cadence: "yearly" }])).toBeNull()
  })
  it("rejects empty activity / empty title / out-of-range day / range-invalid time", () => {
    expect(parseStoredRhythms([{ ...LOOSE, activity: "" }])).toBeNull()
    expect(parseStoredRhythms([{ ...LOOSE, title: "" }])).toBeNull()
    expect(parseStoredRhythms([{ ...LOOSE, daysOfWeek: [7] }])).toBeNull()
    expect(parseStoredRhythms([{ ...LOOSE, timeLocal: "99:99" }])).toBeNull()
  })
  it("rejects non-array and empty array", () => {
    expect(parseStoredRhythms(null)).toBeNull()
    expect(parseStoredRhythms([])).toBeNull()
  })
})
```

- [ ] **Step 2:** Run `npx vitest run src/lib/orbit/__tests__/rhythm.test.ts` — new tests FAIL (`parseStoredRhythms` not exported; `99:99` currently passes format check)
- [ ] **Step 3: implement** in `rhythm.ts`: change `TIME_LOCAL_RE` to `/^([01]\d|2[0-3]):[0-5]\d$/`; add the `StoredRhythm` interface from Shared Contracts; add:

```ts
/**
 * Validate the full recurringActivities array as the widened storage shape.
 * Strict: any invalid entry rejects the whole array (this validates our own
 * writes and the confirm-action payload, so partial acceptance would hide bugs).
 * Absent optional fields are treated as null (legacy fixtures predate them).
 */
export function parseStoredRhythms(json: unknown): StoredRhythm[] | null {
  if (!Array.isArray(json) || json.length === 0) return null
  const out: StoredRhythm[] = []
  for (const raw of json) {
    if (raw === null || typeof raw !== "object") return null
    const r = raw as Record<string, unknown>
    if (typeof r.activity !== "string" || r.activity.length === 0) return null
    if (typeof r.title !== "string" || r.title.length === 0) return null
    let cadence: StoredRhythm["cadence"]
    if (r.cadence === "weekly" || r.cadence === "monthly") cadence = r.cadence
    else if (r.cadence === null || r.cadence === undefined) cadence = null
    else return null
    let daysOfWeek: number[] | null = null
    if (r.daysOfWeek !== null && r.daysOfWeek !== undefined) {
      if (!Array.isArray(r.daysOfWeek) || r.daysOfWeek.length === 0) return null
      for (const d of r.daysOfWeek) {
        if (typeof d !== "number" || !Number.isInteger(d) || d < 0 || d > 6) return null
      }
      daysOfWeek = r.daysOfWeek as number[]
    }
    let timeLocal: string | null = null
    if (r.timeLocal !== null && r.timeLocal !== undefined) {
      if (typeof r.timeLocal !== "string" || !TIME_LOCAL_RE.test(r.timeLocal)) return null
      timeLocal = r.timeLocal
    }
    const dm = r.durationMinutes
    if (dm !== undefined && dm !== null && typeof dm !== "number") return null
    out.push({ activity: r.activity, title: r.title, cadence, daysOfWeek, timeLocal,
      durationMinutes: dm === undefined ? undefined : (dm as number | null) })
  }
  return out
}
```

`parseRhythm` body stays as-is (it now range-checks via the shared regex).
- [ ] **Step 4:** `npx vitest run src/lib/orbit/__tests__/` — all pass, including the 30 pre-existing rhythm tests unchanged
- [ ] **Step 5:** Commit: `feat: widen rhythm storage shape and range-check timeLocal`

### Task 2: Group-scoped reconcile

**Files:** Modify `src/lib/orbit/reconcile.ts`; extend `src/lib/orbit/__tests__/reconcile.test.ts`

**Interfaces:** Consumes nothing new. Produces `reconcileScheduledEvents(now, opts?: { groupId?: string })` — existing callers (`cron/orbit/route.ts`, tests) pass no second arg and behave identically.

- [ ] **Step 1: failing test** — add to `reconcile.test.ts` (reuse the file's existing helpers/fixture; create a second group in the test and track both for cleanup):

```ts
it("with a groupId filter, touches only that group", async () => {
  // create two groups with SUNDAY_RHYTHM via the file's helper pattern
  const results = await reconcileScheduledEvents(NOW, { groupId: firstGroupId })
  expect(results).toHaveLength(1)
  expect(results[0].groupId).toBe(firstGroupId)
  const otherEvents = await prisma.event.findMany({ where: { groupId: secondGroupId } })
  expect(otherEvents).toHaveLength(0)
})
```

- [ ] **Step 2:** Run it — FAILS (second arg not accepted / both groups processed)
- [ ] **Step 3: implement** — in `reconcile.ts`:

```ts
export async function reconcileScheduledEvents(
  now: Date,
  opts?: { groupId?: string }
): Promise<ReconcileResult[]> {
  const groups = opts?.groupId
    ? await prisma.group.findMany({ where: { id: opts.groupId } })
    : await prisma.group.findMany()
  // ...rest unchanged
```

Update the doc comment: the filter exists so group creation can generate the first event without sweeping every group.
- [ ] **Step 4:** `npx vitest run src/lib/orbit/__tests__/reconcile.test.ts` — all pass (existing tests unchanged)
- [ ] **Step 5:** Commit: `feat: optional groupId filter on reconcileScheduledEvents`

### Task 3: Normalization layer (the heart of the slice)

**Files:** Create `src/lib/orbit/normalize.ts`, `src/lib/orbit/__tests__/normalize.test.ts`

**Interfaces:** Consumes `StoredRhythm`, `parseStoredRhythms`-compatible shape. Produces `normalizeExtraction(raw: unknown): NormalizedOnboarding` and `MissingField` (see Shared Contracts). Task 6/7 consume these exact names.

- [ ] **Step 1: failing tests** — `normalize.test.ts` (pure, no DB). Cover every rule with at least:

```ts
import { describe, it, expect } from "vitest"
import { normalizeExtraction } from "../normalize"

const CLIMB = { activity: "climbing", cadence: "weekly", daysOfWeek: [0], timeLocal: "08:00", isPrimary: true }
const BEERS = { activity: "beers", cadence: "monthly", daysOfWeek: null, timeLocal: null, isPrimary: false }
const raw = (rhythms: unknown[], name: unknown = "Sunday Climbers") =>
  ({ suggestedGroupName: name, rhythms })

describe("normalizeExtraction — ready path", () => {
  it("returns ready with schedulable primary at position 0 and loose second", () => {
    const r = normalizeExtraction(raw([BEERS, { ...CLIMB, isPrimary: true }]))
    expect(r.status).toBe("ready")
    if (r.status !== "ready") return
    expect(r.rhythms[0].activity).toBe("climbing")   // position-zero guarantee
    expect(r.rhythms[0].cadence).toBe("weekly")
    expect(r.rhythms[1].activity).toBe("beers")
    expect(r.groupName).toBe("Sunday Climbers")
  })
  it("derives titles deterministically", () => {
    const r = normalizeExtraction(raw([CLIMB, BEERS]))
    if (r.status !== "ready") throw new Error("expected ready")
    expect(r.rhythms[0].title).toBe("Climbing Sunday")  // schedulable: activity + weekday
    expect(r.rhythms[1].title).toBe("Beers")            // loose: activity only
  })
  it("promotes a complete rhythm when the designated primary is incomplete", () => {
    const r = normalizeExtraction(raw([{ ...BEERS, isPrimary: true }, { ...CLIMB, isPrimary: false }]))
    expect(r.status).toBe("ready")
    if (r.status !== "ready") return
    expect(r.rhythms[0].activity).toBe("climbing")
  })
  it("never writes durationMinutes", () => {
    const r = normalizeExtraction(raw([{ ...CLIMB, durationMinutes: 90 }]))
    if (r.status !== "ready") throw new Error("expected ready")
    expect("durationMinutes" in r.rhythms[0] && r.rhythms[0].durationMinutes != null).toBe(false)
  })
})

describe("normalizeExtraction — sanitization (raw output is a claim)", () => {
  it("range-checks time: 99:99 becomes null (missing), not a crash or a pass-through", () => {
    const r = normalizeExtraction(raw([{ ...CLIMB, timeLocal: "99:99" }]))
    expect(r).toEqual({ status: "incomplete", missing: "time" })
  })
  it("filters invalid day numbers; all-invalid becomes missing day", () => {
    expect(normalizeExtraction(raw([{ ...CLIMB, daysOfWeek: [7, -1] }])))
      .toEqual({ status: "incomplete", missing: "day" })
  })
  it("unknown cadence string becomes loose, not an error", () => {
    const r = normalizeExtraction(raw([CLIMB, { ...BEERS, cadence: "quarterly" }]))
    if (r.status !== "ready") throw new Error("expected ready")
    expect(r.rhythms[1].cadence).toBeNull()
  })
  it("tolerates garbage input shapes", () => {
    expect(normalizeExtraction(null)).toEqual({ status: "incomplete", missing: "nothing_schedulable" })
    expect(normalizeExtraction({ rhythms: "nope" })).toEqual({ status: "incomplete", missing: "nothing_schedulable" })
  })
})

describe("normalizeExtraction — completeness gate", () => {
  it("missing time only", () => {
    expect(normalizeExtraction(raw([{ ...CLIMB, timeLocal: null }])))
      .toEqual({ status: "incomplete", missing: "time" })
  })
  it("missing day only", () => {
    expect(normalizeExtraction(raw([{ ...CLIMB, daysOfWeek: null }])))
      .toEqual({ status: "incomplete", missing: "day" })
  })
  it("missing both", () => {
    expect(normalizeExtraction(raw([{ ...CLIMB, daysOfWeek: null, timeLocal: null }])))
      .toEqual({ status: "incomplete", missing: "both" })
  })
  it("monthly-only description is not schedulable", () => {
    expect(normalizeExtraction(raw([{ ...BEERS, isPrimary: true, daysOfWeek: [5], timeLocal: "18:00" }])))
      .toEqual({ status: "incomplete", missing: "nothing_schedulable" })
  })
  it("day+time with unconfident cadence gets the targeted cadence re-ask, never silent weekly inference", () => {
    expect(normalizeExtraction(raw([{ ...CLIMB, cadence: null }])))
      .toEqual({ status: "incomplete", missing: "cadence" })
  })
  it("no usable activity at all", () => {
    expect(normalizeExtraction(raw([{ ...CLIMB, activity: "  " }])))
      .toEqual({ status: "incomplete", missing: "nothing_schedulable" })
  })
})

describe("normalizeExtraction — group name", () => {
  it("caps, strips em/en dashes, collapses whitespace", () => {
    const r = normalizeExtraction(raw([CLIMB], "  Sunday — Climbers   Club  "))
    if (r.status !== "ready") throw new Error("expected ready")
    expect(r.groupName).toBe("Sunday Climbers Club")
  })
  it("falls back deterministically when the suggestion is missing or unusable", () => {
    const r = normalizeExtraction(raw([CLIMB], null))
    if (r.status !== "ready") throw new Error("expected ready")
    expect(r.groupName).toBe("Sunday Climbing")
  })
})
```

- [ ] **Step 2:** Run — FAILS (module missing)
- [ ] **Step 3: implement** `normalize.ts`:

```ts
// src/lib/orbit/normalize.ts
//
// Turns raw extraction output (a claim) into the normalized onboarding profile
// (a fact) — CLAUDE.md guardrail: nothing branches on model output until it has
// been validated and normalized here. Pure and synchronous by design.

import type { StoredRhythm } from "./rhythm"

export type MissingField = "time" | "day" | "both" | "nothing_schedulable"
export type NormalizedOnboarding =
  | { status: "ready"; groupName: string; rhythms: StoredRhythm[] }
  | { status: "incomplete"; missing: MissingField }

const WEEKDAY_FULL = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const NAME_MAX = 50

interface Candidate {
  activity: string
  cadence: "weekly" | "monthly" | null
  daysOfWeek: number[] | null
  timeLocal: string | null
  isPrimary: boolean
}

function sanitize(raw: unknown): { rhythms: Candidate[]; suggestedName: string | null } {
  if (raw === null || typeof raw !== "object") return { rhythms: [], suggestedName: null }
  const r = raw as Record<string, unknown>
  const suggestedName = typeof r.suggestedGroupName === "string" ? r.suggestedGroupName : null
  if (!Array.isArray(r.rhythms)) return { rhythms: [], suggestedName }
  const rhythms: Candidate[] = []
  for (const item of r.rhythms) {
    if (item === null || typeof item !== "object") continue
    const o = item as Record<string, unknown>
    const activity = typeof o.activity === "string" ? o.activity.trim() : ""
    if (!activity) continue
    const cadence = o.cadence === "weekly" || o.cadence === "monthly" ? o.cadence : null
    let daysOfWeek: number[] | null = null
    if (Array.isArray(o.daysOfWeek)) {
      const valid = [...new Set(o.daysOfWeek.filter(
        (d): d is number => typeof d === "number" && Number.isInteger(d) && d >= 0 && d <= 6
      ))]
      if (valid.length > 0) daysOfWeek = valid
    }
    const timeLocal =
      typeof o.timeLocal === "string" && TIME_RE.test(o.timeLocal) ? o.timeLocal : null
    rhythms.push({ activity, cadence, daysOfWeek, timeLocal, isPrimary: o.isPrimary === true })
  }
  return { rhythms, suggestedName }
}

function isSchedulable(c: Candidate): boolean {
  return c.cadence === "weekly" && c.daysOfWeek !== null && c.timeLocal !== null
}

function titleCase(s: string): string {
  return s.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
}

function deriveTitle(c: Candidate): string {
  return isSchedulable(c)
    ? `${titleCase(c.activity)} ${WEEKDAY_FULL[c.daysOfWeek![0]]}`
    : titleCase(c.activity)
}

function normalizeName(suggested: string | null, primary: Candidate): string {
  const cleaned = (suggested ?? "").replace(/[—–]/g, " ").replace(/\s+/g, " ").trim()
  if (cleaned.length > 0) return cleaned.slice(0, NAME_MAX).trim()
  return `${WEEKDAY_FULL[primary.daysOfWeek![0]]} ${titleCase(primary.activity)}`
}

export function normalizeExtraction(raw: unknown): NormalizedOnboarding {
  const { rhythms, suggestedName } = sanitize(raw)
  if (rhythms.length === 0) return { status: "incomplete", missing: "nothing_schedulable" }

  // Primary selection with promotion (belt to the prompt's braces): the model's
  // isPrimary designation is honored only if that rhythm is schedulable; when it
  // isn't and another rhythm is, the complete one is promoted so the founder is
  // never re-asked about a description that already contained a full schedule.
  let primaryIdx = rhythms.findIndex(c => c.isPrimary)
  if (primaryIdx === -1) primaryIdx = 0
  if (!isSchedulable(rhythms[primaryIdx])) {
    const completeIdx = rhythms.findIndex(isSchedulable)
    if (completeIdx !== -1) primaryIdx = completeIdx
  }
  const primary = rhythms[primaryIdx]

  if (!isSchedulable(primary)) {
    // Targeted re-asks where we can name the gap; the generic re-ask otherwise.
    // We never invent a weekly schedule the founder didn't state — a complete
    // day+time with unknown cadence asks "is that every week?" instead of guessing.
    if (primary.cadence === null && primary.daysOfWeek !== null && primary.timeLocal !== null) {
      return { status: "incomplete", missing: "cadence" }
    }
    if (primary.cadence === "weekly" || primary.cadence === null) {
      const noDay = primary.daysOfWeek === null
      const noTime = primary.timeLocal === null
      if (noDay && noTime) return { status: "incomplete", missing: "both" }
      if (noTime) return { status: "incomplete", missing: "time" }
      if (noDay) return { status: "incomplete", missing: "day" }
    }
    return { status: "incomplete", missing: "nothing_schedulable" }
  }

  const ordered = [primary, ...rhythms.filter((_, i) => i !== primaryIdx)]
  const stored: StoredRhythm[] = ordered.map(c => ({
    activity: c.activity, title: deriveTitle(c),
    cadence: c.cadence, daysOfWeek: c.daysOfWeek, timeLocal: c.timeLocal,
  }))
  return { status: "ready", groupName: normalizeName(suggestedName, primary), rhythms: stored }
}
```

- [ ] **Step 4:** `npx vitest run src/lib/orbit/__tests__/normalize.test.ts` — PASS
- [ ] **Step 5:** Commit: `feat: extraction normalization layer with completeness gate`

### Task 4: Playback composition + re-ask templates

**Files:** Create `src/lib/orbit/playback.ts`, `src/lib/orbit/__tests__/playback.test.ts`

**Interfaces:** Produces `formatRhythmRow`, `formatTimeLocal`, `REASK_COPY` (Shared Contracts). Task 7 UI consumes them.

- [ ] **Step 1: failing tests:**

```ts
import { describe, it, expect } from "vitest"
import { formatRhythmRow, formatTimeLocal, REASK_COPY } from "../playback"

const base = { title: "x", durationMinutes: null }

describe("formatTimeLocal", () => {
  it("formats on-the-hour and half-hour times", () => {
    expect(formatTimeLocal("08:00")).toBe("8am")
    expect(formatTimeLocal("14:30")).toBe("2:30pm")
    expect(formatTimeLocal("00:00")).toBe("12am")
    expect(formatTimeLocal("12:00")).toBe("12pm")
  })
})

describe("formatRhythmRow", () => {
  it("weekly single day", () => {
    expect(formatRhythmRow({ ...base, activity: "climbing", cadence: "weekly", daysOfWeek: [0], timeLocal: "08:00" }))
      .toEqual({ label: "CLIMBING", value: "Sun at 8am, every week" })
  })
  it("weekly multiple days uses 3-letter abbreviations and ampersands", () => {
    expect(formatRhythmRow({ ...base, activity: "runs", cadence: "weekly", daysOfWeek: [1, 3], timeLocal: "06:30" }).value)
      .toBe("Mon & Wed at 6:30am, every week")
  })
  it("weekly all seven days reads as every day", () => {
    expect(formatRhythmRow({ ...base, activity: "walks", cadence: "weekly", daysOfWeek: [0,1,2,3,4,5,6], timeLocal: "06:00" }).value)
      .toBe("every day at 6am")
  })
  it("monthly with nothing stated", () => {
    expect(formatRhythmRow({ ...base, activity: "beers", cadence: "monthly", daysOfWeek: null, timeLocal: null }).value)
      .toBe("once a month, we'll pick a day later")
  })
  it("monthly with a stated day", () => {
    expect(formatRhythmRow({ ...base, activity: "beers", cadence: "monthly", daysOfWeek: [5], timeLocal: null }).value)
      .toBe("Fri, once a month")
  })
  it("loose (no cadence)", () => {
    expect(formatRhythmRow({ ...base, activity: "camping", cadence: null, daysOfWeek: null, timeLocal: null }).value)
      .toBe("we'll sort out timing later")
  })
  it("label is uppercased activity capped at two words", () => {
    expect(formatRhythmRow({ ...base, activity: "board game nights", cadence: null, daysOfWeek: null, timeLocal: null }).label)
      .toBe("BOARD GAME")
  })
})

describe("copy rules", () => {
  it("no em or en dashes anywhere in composed copy or re-ask templates", () => {
    const samples = [
      ...Object.values(REASK_COPY),
      formatRhythmRow({ ...base, activity: "beers", cadence: "monthly", daysOfWeek: null, timeLocal: null }).value,
    ]
    for (const s of samples) expect(s).not.toMatch(/[—–]/)
  })
  it("re-ask templates match the approved copy", () => {
    expect(REASK_COPY.time).toBe("Got it. What time do you usually meet? Add that to your description and I'll set up the schedule.")
    expect(REASK_COPY.day).toBe("Got it. What days do you usually meet? Add that and I'll set up the schedule.")
    expect(REASK_COPY.both).toBe("I need a day and a time to set up your schedule. Add those to your description and try again.")
    expect(REASK_COPY.cadence).toBe("Got it. Is that every week? Say so in your description and I'll set up the schedule.")
    expect(REASK_COPY.nothing_schedulable).toBe("Tell me a bit more about what your group does together and when. I need an activity, a day, and a time to get your schedule going.")
  })
})
```

- [ ] **Step 2:** Run — FAILS
- [ ] **Step 3: implement** `playback.ts`: `WEEKDAY_ABBREV = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]`; `formatTimeLocal` mirrors the hour/minute logic of `formatTime` in `src/lib/events/format.ts` but takes an `"HH:mm"` string (do **not** modify format.ts — out of lane). `formatRhythmRow` decision table:
  - weekly + days + time: 7 days → `every day at {time}`; else `{Day & Day} at {time}, every week`
  - monthly: parts = `[days joined " & " if present]` + `[at {time} if present]` joined with a space; no parts → `once a month, we'll pick a day later`; else `{parts}, once a month`
  - anything else (loose) → `we'll sort out timing later`
  - label: `activity.split(/\s+/).slice(0, 2).join(" ").toUpperCase()`
  - `REASK_COPY` verbatim from the tests (approved spec copy).
- [ ] **Step 4:** Run — PASS
- [ ] **Step 5:** Commit: `feat: deterministic playback composition and re-ask copy`

### Task 5: The extraction call

**Files:** Create `src/lib/orbit/extract.ts`, `scripts/try-extract.ts`

**Interfaces:** Produces `extractGroupProfile(description: string): Promise<unknown>` — returns the parsed JSON as `unknown` on purpose; `normalizeExtraction` owns interpretation. Throws on any failure (missing key, API error, refusal, truncation, unparsable output); callers map every throw to the same soft-retry state.

No unit test hits the live API (cost, flakiness); the interpretation seam is fully covered by Task 3's tests, and `scripts/try-extract.ts` is the deliberate manual harness for prompt iteration. This is a knowing gap: the prompt's quality is verified manually, not by CI. Flag it in the PR.

- [ ] **Step 1: implement** `extract.ts`:

```ts
// src/lib/orbit/extract.ts
//
// The product's first real Anthropic API call. Server-side only — the key
// never reaches the browser. Uses structured outputs so the wire shape is
// schema-enforced; semantic validation (ranges, whitelists, the completeness
// gate) lives in normalize.ts, which treats this return value as a claim.

import Anthropic from "@anthropic-ai/sdk"

const MODEL = "claude-haiku-4-5"

// Structured-outputs schema. All fields required; "not stated" is null, never
// absent — this forces the model to make each omission explicit.
const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["suggestedGroupName", "rhythms"],
  properties: {
    suggestedGroupName: { type: ["string", "null"] },
    rhythms: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["activity", "cadence", "daysOfWeek", "timeLocal", "isPrimary"],
        properties: {
          activity: { type: ["string", "null"] },
          cadence: { type: ["string", "null"], enum: ["weekly", "monthly", null] },
          daysOfWeek: { type: ["array", "null"], items: { type: "integer" } },
          timeLocal: { type: ["string", "null"] },
          isPrimary: { type: "boolean" },
        },
      },
    },
  },
} as const

const SYSTEM_PROMPT = `You read a founder's short description of their recurring group and extract its rhythms as structured data. Extract only what the founder actually said. Never invent a day, a time, or an activity.

Rules:
- Each distinct recurring activity is one rhythm.
- activity: a short noun phrase in the founder's own words (e.g. "climbing", "beers").
- cadence: "weekly" or "monthly" only when the description clearly supports it. A stated weekday ("Sundays", "every Tuesday") means weekly. "Every morning" or "every day" means weekly with all seven days. Yearly, one-off, or unclear cadence is null.
- daysOfWeek: integers 0-6 with 0=Sunday, only for days the founder stated. Otherwise null.
- timeLocal: 24-hour "HH:MM" only if the founder stated a time ("8" plus a morning context is "08:00"). Otherwise null.
- isPrimary: exactly one rhythm is primary, the group's main activity. If exactly one rhythm has both a stated day and a stated time, that rhythm must be the primary.
- suggestedGroupName: a short friendly name for the group, 2 to 4 words, drawn from the description (like "Sunday Climbers"). Letters, numbers and spaces only.`

/** Thrown for every failure mode; callers map it to one soft-retry state. */
export class ExtractionError extends Error {}

export async function extractGroupProfile(description: string): Promise<unknown> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ExtractionError("ANTHROPIC_API_KEY is not set")
  }
  const client = new Anthropic()
  let response: Anthropic.Message
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      output_config: { format: { type: "json_schema", schema: EXTRACTION_SCHEMA } },
      messages: [{ role: "user", content: description }],
    })
  } catch (err) {
    throw new ExtractionError(`extraction request failed: ${(err as Error).message}`)
  }
  if (response.stop_reason !== "end_turn") {
    throw new ExtractionError(`unexpected stop_reason: ${response.stop_reason}`)
  }
  const text = response.content.find((b) => b.type === "text")?.text
  if (!text) throw new ExtractionError("no text block in response")
  try {
    return JSON.parse(text)
  } catch {
    throw new ExtractionError("response was not valid JSON")
  }
}
```

Note for the implementer: verify the `output_config.format` field name against the installed SDK's types (`node_modules/@anthropic-ai/sdk`) before assuming — the claude-api skill documents `output_config: {format: {...}}` as canonical and `output_format` as deprecated; if the installed SDK version's types disagree, follow the SDK and note it in the PR.
- [ ] **Step 2:** `scripts/try-extract.ts` — manual harness, mirroring the repo's script conventions (`tsx`, dotenv):

```ts
// scripts/try-extract.ts — manual prompt-iteration harness (not CI).
// Usage: npx tsx scripts/try-extract.ts "we climb Sundays at 8 and grab beers once a month"
import { config } from "dotenv"
config()
import { extractGroupProfile } from "../src/lib/orbit/extract"
import { normalizeExtraction } from "../src/lib/orbit/normalize"

const description = process.argv[2]
if (!description) { console.error("usage: npx tsx scripts/try-extract.ts \"<description>\""); process.exit(1) }
extractGroupProfile(description).then((raw) => {
  console.log("RAW:", JSON.stringify(raw, null, 2))
  console.log("NORMALIZED:", JSON.stringify(normalizeExtraction(raw), null, 2))
})
```

- [ ] **Step 3: manual verification (requires ANTHROPIC_API_KEY in .env):** run the harness against at least: the mockup case ("we climb Sundays at 8 and grab beers once a month" → ready, climbing primary, beers loose), a missing-time case, a missing-day case, a vague case ("we're friends who hang out"), and a daily case ("morning walks every day at 6"). Record the actual outputs in the PR — evidence, not assertion. Iterate on SYSTEM_PROMPT if needed (normalize is the safety net either way).
- [ ] **Step 4:** `npm test` still green; commit: `feat: Anthropic extraction call with structured outputs + manual harness`

### Task 6: Provision + confirm/extract server actions

**Files:** Modify `src/lib/groups/provision.ts`; extend `src/lib/groups/__tests__/provision.test.ts`; create `src/app/actions/extract-group.ts`; rewrite `src/app/actions/create-group.ts`

**Interfaces:** Consumes `parseStoredRhythms`, `parseRhythm`, `normalizeExtraction`, `extractGroupProfile`, `reconcileScheduledEvents(now, {groupId})`. Produces the two action signatures in Shared Contracts, consumed by Task 7's wizard.

- [ ] **Step 1: failing provision test** — extend `provision.test.ts` (reuse its fixtures/cleanup):

```ts
it("writes recurringActivities and description when provided", async () => {
  const rhythms = [{ activity: "climbing", title: "Climbing Sunday", cadence: "weekly", daysOfWeek: [0], timeLocal: "08:00" }]
  const { group } = await provisionFounderGroup({
    supabaseAuthId: freshId(), founderName: "Jacob", groupName: "Sunday Climbers",
    description: "we climb Sundays at 8", recurringActivities: rhythms,
  })
  expect(group.description).toBe("we climb Sundays at 8")
  expect(group.recurringActivities).toEqual(rhythms)
})
it("leaves recurringActivities and description null when omitted", async () => {
  const { group } = await provisionFounderGroup({ supabaseAuthId: freshId(), founderName: "J", groupName: "G" })
  expect(group.recurringActivities).toBeNull()
  expect(group.description).toBeNull()
})
```

- [ ] **Step 2:** Run — FAILS. Implement in `provision.ts`: add `description?: string | null` and `recurringActivities?: StoredRhythm[] | null` to `ProvisionInput`; in `tx.group.create`, add `description: description ?? null` and `recurringActivities: recurringActivities ?? undefined` (cast the array through `Prisma.InputJsonValue` — check the Prisma 7 JSON-write typing in `node_modules/.prisma` or Prisma docs rather than assuming). Run — PASS.
- [ ] **Step 3:** Create `src/app/actions/extract-group.ts`:

```ts
"use server"
import { extractGroupProfile } from "@/lib/orbit/extract"
import { normalizeExtraction, type MissingField } from "@/lib/orbit/normalize"
import type { StoredRhythm } from "@/lib/orbit/rhythm"

export type ExtractGroupState =
  | { status: "idle" }
  | { status: "error" }
  | { status: "incomplete"; missing: MissingField }
  | { status: "ready"; profile: { groupName: string; rhythms: StoredRhythm[] } }

export async function extractGroupAction(
  _prev: ExtractGroupState,
  formData: FormData
): Promise<ExtractGroupState> {
  const description = (formData.get("description") as string | null)?.trim() ?? ""
  if (!description) return { status: "error" }
  let raw: unknown
  try {
    raw = await extractGroupProfile(description)
  } catch (err) {
    console.error("[onboarding] extraction failed:", err)
    return { status: "error" }
  }
  const normalized = normalizeExtraction(raw)
  return normalized.status === "incomplete"
    ? { status: "incomplete", missing: normalized.missing }
    : { status: "ready", profile: { groupName: normalized.groupName, rhythms: normalized.rhythms } }
}
```

- [ ] **Step 4:** Rewrite `src/app/actions/create-group.ts` as the confirm action. Keep the existing auth-layer guard (session reuse → `signInAnonymously`) verbatim; replace the form parsing:

```ts
"use server"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { provisionFounderGroup } from "@/lib/groups/provision"
import { parseStoredRhythms, parseRhythm } from "@/lib/orbit/rhythm"
import { reconcileScheduledEvents } from "@/lib/orbit/reconcile"

export interface CreateGroupInput {
  founderName: string
  groupName: string
  description: string
  rhythms: unknown // client-held normalized profile — re-validated here, never trusted
}

const DESCRIPTION_MAX = 2000

export async function createGroupAction(input: CreateGroupInput): Promise<{ error: string }> {
  const founderName = input.founderName?.trim() ?? ""
  const groupName = input.groupName?.trim() ?? ""
  const description = (input.description ?? "").trim().slice(0, DESCRIPTION_MAX)
  if (!founderName || !groupName) return { error: "Something went missing. Please try again." }

  // Server-side completeness gate — the "no bypass" rule. A group is never
  // created without a schedulable rhythm at position 0, regardless of what
  // the client sends.
  const rhythms = parseStoredRhythms(input.rhythms)
  if (!rhythms || parseRhythm(rhythms) === null) {
    return { error: "I lost track of your schedule. Go back a step and try again." }
  }

  // ...existing supabase session guard unchanged...

  let group /* : Group */
  try {
    const result = await provisionFounderGroup({
      supabaseAuthId: user.id, founderName, groupName,
      description, recurringActivities: rhythms,
    })
    group = result.group
  } catch {
    return { error: "Something went wrong creating your group. Please try again." }
  }

  // Create-time first event, scoped to this group. Fail-soft: a failed event
  // must never destroy a successfully created group; the daily cron catches up.
  try {
    await reconcileScheduledEvents(new Date(), { groupId: group.id })
  } catch (err) {
    console.error("[onboarding] first-event reconcile failed (cron will catch up):", err)
  }

  redirect(`/groups/${group.id}`)
}
```

  (The old `CreateGroupState`/FormData signature is deleted with the stub form — nothing else imports it; verify with grep before deleting.)
- [ ] **Step 5:** Before wiring: read `node_modules/next/dist/docs/` on server actions to confirm (a) calling an action directly from an event handler with a typed argument, and (b) `redirect()` behavior when invoked outside a `<form action>`. Both are standard, but Next 16 conventions must be verified, not assumed.
- [ ] **Step 6:** `npm test` green (actions have no unit tests — they are thin compositions of tested parts; the DB-backed seams are covered by provision/reconcile tests). Commit: `feat: onboarding server actions and rhythm-aware provisioning`

### Task 7: The wizard UI

**Files:** Rewrite `src/app/create/page.tsx` (thin server component rendering the wizard); create `src/app/create/OnboardingWizard.tsx`, `src/app/create/Step1Describe.tsx`, `src/app/create/Step2Playback.tsx`

**Interfaces:** Consumes `extractGroupAction`/`ExtractGroupState`, `createGroupAction`, `formatRhythmRow`, `REASK_COPY`. All styling via existing tokens (`--type-*`, `--surface-*`, `--color-teal`, `--color-lime`); bubble anatomy copied from [MessageFeed.tsx:102-142](src/app/groups/[id]/MessageFeed.tsx) (Orbit avatar 28px lime circle, `--surface-orbit` fill, radius `4px 16px 16px 16px`); input/button styling from the current create stub.

**Structure and behavior:**

- `OnboardingWizard.tsx` (`"use client"`): owns `step: "describe" | "playback"`, `founderName`, `description`, `groupName` (editable), `rhythms`, and the extract state via `useActionState(extractGroupAction, { status: "idle" })`; `isPending` from `useActionState` drives the pause state. When the action resolves `ready`, copy `profile` into state and advance to `playback`. `incomplete` and `error` stay on step 1 with the founder's text intact (inputs are controlled — nothing is cleared).
- `Step1Describe.tsx`:
  - **The tailed bubble** (§7's single exception): no avatar, left margin, small tail pointing up at the header. Implementation: the bubble div plus an absolutely-positioned CSS triangle above it (`border-left/right: 8px solid transparent; border-bottom: 10px solid var(--surface-orbit)`). No other bubble in the product gets a tail.
  - Bubble copy (provisional, flagged for the visual/copy pass): `"Hi, I'm Orbit. Tell me about your group. What do you do together, and when do you usually meet?"` On a re-ask return, the bubble text is `REASK_COPY[missing]` instead; on `error`: `"Hmm, that didn't go through. Give it another try in a moment."`
  - Founder name input (label "Your name", required) and description `<textarea>` (label "About your group", `--type-body`, min ~5 rows, grows with content). Both keep their values across re-asks.
  - One teal action: **Continue** (disabled while `isPending`).
  - **The pause:** while `isPending`, show a blocking state in Orbit's voice in place of the button area, e.g. the Orbit avatar plus `"One sec, I'm working out your schedule."` with the form fields left mounted but disabled. Labeled thinking, not a spinner.
- `Step2Playback.tsx`:
  - Standard Orbit bubble (with avatar, feed-style, untailed) whose content is the playback rows: an intro line `"Here's what I understood."`, then:
    - Group name row: inline-editable text input styled as the bubble's title line (`--type-heading`), controlled by wizard state. Recorded deviation: the mockup draws playback read-only; the editable name row is a deliberate product choice (rename exists nowhere else yet).
    - `WHO: {founderName}` row (eyebrow-style label at `--type-eyebrow`, value at `--type-body`).
    - One row per rhythm from `formatRhythmRow` — every rhythm Orbit understood, including loose ones, in position order (primary first).
  - One teal primary: **"Looks right, create my group"** (provisional copy; mockup's "set up invites" is wrong here because the share step is out of scope). On press: `useTransition` → `await createGroupAction({ founderName, groupName, description, rhythms })`; on `{error}` render it under the button at `--type-meta`; redirect happens server-side on success.
  - Tertiary text link back: **"Edit my description"** → returns to step 1 with all state intact (client state only, nothing re-fetched).
- `page.tsx`: server component that renders `<OnboardingWizard />` inside the existing page chrome (`--surface-page`, centered column, max-width 28rem — reuse the stub's layout values).

- [ ] **Step 1:** Build the components as specified; `npm run lint` clean; `npm test` green (PostToolUse hook runs tests on edits).
- [ ] **Step 2: browser verification (requires ANTHROPIC_API_KEY):** start the dev server, then walk and screenshot each state: step 1 initial (tailed bubble, one teal action), pause state, re-ask state (submit a description with no time — text preserved, "Got it. What time…" shown), playback state (mockup case: name row editable, WHO row, CLIMBING scheduled row, BEERS loose row), confirm → lands on group home with a live event card and Orbit's `"Next up: climbing Sun at 8am. RSVP up top."` announcement in the feed. Also verify the failure path: temporarily unset `ANTHROPIC_API_KEY` → soft error, text intact, no group created. Screenshots go in the PR — show it works, don't say it works.
- [ ] **Step 3:** Commit: `feat: founder onboarding wizard (describe, pause, playback, confirm)`

### Task 8: Cleanup + docs + PR

**Files:** Delete `scripts/seed-fixture-rhythm.ts`; modify `docs/build-notes.md`

- [ ] **Step 1:** Delete `scripts/seed-fixture-rhythm.ts` (build-notes §11 records it "retires when onboarding lands"). Grep for references first.
- [ ] **Step 2:** Build-notes §11: add the slice entry (what landed; decisions **made at plan review**: `suggestedGroupName` as a structured extraction field with deterministic fallback, and the `Group.description` column; plus the monthly-only-not-creatable consequence, the no-weekly-inference rule with its targeted cadence re-ask, tech debt below) and extend the pre-deploy checklist with: `ANTHROPIC_API_KEY` in Vercel env; `add_group_description` migration against production.
- [ ] **Step 3:** Full `npm test` + `npm run build` — both green, output captured.
- [ ] **Step 4:** Push branch, open PR. **Do not merge.** PR description covers: what changed and why (PM voice); the two changes to shipped code called out explicitly (create-group stub loses its group-name field and gains the wizard; `provisionFounderGroup` gains rhythm/description writes); the recorded deviation (editable name row); manual-verification evidence (harness outputs + screenshots); and the tech-debt flags:
  - Unauthenticated model calls: `/create` triggers a paid API call pre-auth; no rate limiting. Acceptable at MVP traffic; revisit before any promotion of the URL.
  - Prompt quality is manually verified (harness), not CI-covered.
  - `Group.description` is written but unread (deliberate, for gap-ask/RAG).
  - Loose rhythms are stored and shown at playback but not yet displayed anywhere post-onboarding (group info page shows no schedule today; unchanged).
  - Extraction latency sits inside a server action; no timeout beyond the SDK default (10 min). Fine for Haiku; note it.

## Verification (end-to-end)

1. `npm test` — every suite green, including all pre-existing engine tests unchanged.
2. `npx tsx scripts/try-extract.ts` on the five canonical descriptions (Task 5 Step 3) — outputs recorded.
3. Browser walkthrough per Task 7 Step 2 with screenshots — the founder lands on a home that is alive on day one: pinned event card + Orbit announcement.
4. `npm run build` green.
5. Negative checks: no-time description re-asks and never creates a group; confirm with a tampered `rhythms` payload (e.g. via harness-crafted call) returns the gate error; API-key-missing path fails soft on step 1.

## Explicitly out of scope (do not build)

Share/invite step · gap-ask conversational loop · monthly/other-cadence scheduling · timezone capture + UTC display fix (paired follow-on; `announce.ts`/`format.ts` untouched) · duration extraction/endsAt · visual polish against the walkthrough · any refactor outside the files listed above.
