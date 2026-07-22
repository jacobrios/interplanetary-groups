# Venue Capture at Onboarding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Onboarding captures each rhythm's usual place, Step 2 plays it back editably, and scheduled events carry a Venue row the existing card/detail UI already renders. Venue never gates anything.

**Architecture:** `venueName: string | null` rides on every layer that already carries a rhythm: extraction schema (required-but-nullable), `Candidate`/sanitize/toStored in normalize.ts, `StoredRhythm`/`GroupRhythm` + both parsers in rhythm.ts, the merge round-trip re-encode, and reconcile → `createEvent({ venue: { name } })`. Zero Prisma migration (JSON column), zero change to `isSchedulable`, `classifyGap`, provision, create-group, buildAnnouncement, EventCard, or event detail.

**Tech stack:** Next.js 16, Prisma 7, Vitest (real dev-test DB for integration suites), Anthropic structured outputs (claude-haiku-4-5).

## Context

The walkthrough design shows a venue on the pinned event card and event detail, and `createEvent` has accepted a `venue` argument since the data-foundation slice — but no code path has ever supplied one. Onboarding extraction has no location field (its prompt actively *discards* location words), and `reconcile.ts` creates events venue-less. This slice closes the design-implies-data-nobody-collects gap, sequenced ahead of the spark slice so a future spark can pencil in the group's actual spot (§5) instead of inventing one.

**Signed-off product decisions (2026-07-22, do not relitigate):**
- **Storage (open question a):** per-rhythm `venueName: string | null` inside `Group.recurringActivities` JSON. Venue table rows stay strictly per-event; reconcile snapshots the standing place into a fresh Venue row per event. Standing place vs event venue stay distinguishable (§4-ready: a one-occasion switch later edits the event's Venue row, never the rhythm). Loose rhythms can carry a venue (future spark inheritance not foreclosed).
- **Step 2 UI (open question b):** always-on quiet inline input beneath each rhythm's value line (group-name-row precedent, styled quieter). Captured venue seeds it; empty state shows a placeholder. Approved extension of the spec: captured venues are editable before confirm.
- **Step 1 copy:** the hint line exists in the mockup, below the Continue button on screen 01 ("Orbit reads this to set your days, send reminders, and build a shared group page.") — verified by rendering `docs/walkthrough.html` in the browser (it is a JS-packed export; text greps cannot inspect it, which is how an earlier "not in mockup" claim went wrong). Shipped `Step1Describe.tsx` has no hint line anywhere (whole-file read). So: add the line **below the Continue button** in the design's position, keeping the mockup sentence verbatim and appending the venue invitation on the same single line. Also sharpen the placeholder (exact copy in Task 6).

## Global Constraints

- **Venue never gates anything.** Not in `isSchedulable`, not in `classifyGap`, no gap-ask, no lime marker, never blocks creation. Any path where a missing venue stops a founder is wrong.
- **No lime on the venue empty state** — lime means "Orbit needs this before it can proceed"; neutral treatment only.
- Model output is a claim: venueName passes through sanitize before any branch or storage read.
- Copy rules: no em-dashes in user-facing copy, plain warm Orbit voice, "(optional)" in parentheses is fine.
- Out of scope: post-creation venue add/change, Orbit venue nudges in the feed, generated display labels (§2), multi-venue UI / maps / addresses / geocoding, spark behavior, announcement copy mentioning venue, any refactor outside the slice.
- Stay in lane; note (don't fix) anything spotted outside the slice.
- Merge boundary: PR touches code → human merges.

## Design positions (recorded for build-notes §11)

1. **Strict vs lenient per parser.** `parseStoredRhythms` (validates our own writes): strict on type — non-string/non-null `venueName` rejects the array, same philosophy as `durationMinutes`; but a *string* is trimmed/capped and empty degrades to null (the Step 2 input legitimately produces empty strings; rejecting them would be venue gating creation). `parseRhythm` (scheduling read): fully lenient — any unusable venueName degrades to null, rhythm still parses, because `parseRhythm === null` means the group never schedules again, and no venue value may ever have that power. Observed-not-changed asymmetry: `parseRhythm` rejects wrong-type `durationMinutes` (rhythm.ts:73); left alone, flagged in PR.
2. **`VENUE_NAME_MAX = 80`** (exported from rhythm.ts; shared by both parsers and sanitize via an exported `cleanVenueName`). 50 (group-name cap) is too tight for real venue names; 80 keeps the pinned card's `· label` sane.
3. **Venue carry-over is a sibling, not an extension.** `enforceVenueCarryOver(raw, prior)` in gap.ts, called right *after* `enforceActivityCarryOver` in merge-gap.ts. A time/day answer never legitimately removes a venue: a merged rhythm that nulled a previously captured venueName gets it restored, but only on an activity match (restructured lists are never corrected by position). A non-null replacement is the founder's latest word and is left alone.
4. **Deliberate behavior change:** `gapAnswerMoved` counts venue movement, so a venue-only gap answer gets the normal lead-in, not the "stalled" one. Flagged in PR.
5. **Wizard holds the raw editing string; trim-or-null at confirm.** Server re-nulls empty strings in `parseStoredRhythms` anyway (no-bypass belt and braces).
6. **Display format (settled 2026-07-22, product owner asked for the call now):** `venueName` stays a separate structured field and never enters the composed schedule string. `formatRhythmRow` remains schedule-only; each surface appends `· {venue}` with the separator-dot grammar where the design shows it (mockup frame 06: "Mon Jun 15 · 8:00 AM · The climbing gym", dot bound to end of item on wrap). Rationale: (a) event surfaces render the event's Venue row while rhythm surfaces render the standing place — one baked string would blur the §4 distinction; (b) Step 2's editable input needs the raw field; (c) future join-screen / group-info rhythm rows inherit `{formatRhythmRow(r).value} · {r.venueName}` without touching the formatter. Nothing is built for those unbuilt surfaces this slice.
7. **EventCard verified, no change needed (direct read, EventCard.tsx:101):** the pinned card already renders `{venueLabel && <span> · {venueLabel}</span>}` in the metadata row, matching mockup frames 06–08; event detail conditionally renders the Where MetaRow (events/[id]/page.tsx:115). Task 5's snapshot lights up an existing, so-far-always-empty segment. Confirmed in-lane. (Observed, not changed: mockup 06 shows counts on their own line; shipped card inlines them — pre-existing deviation, out of lane.)

## Task 0: Start-of-slice hygiene + branch

- [ ] `git checkout main && git pull` — confirm local main matches origin (`git status`, `git log origin/main -1`)
- [ ] Delete previous slice's merged local branch if present (`git branch --merged main`)
- [ ] `git checkout -b feat/venue-capture-onboarding`
- [ ] Baseline: `npm test` — expect full suite green (237 at last count); record the count

## Task 1: rhythm.ts — types, both parsers, VENUE_NAME_MAX

**Files:** Modify `src/lib/orbit/rhythm.ts`; Test `src/lib/orbit/__tests__/rhythm.test.ts`
**Produces:** `VENUE_NAME_MAX = 80`, `cleanVenueName(v: unknown): string | null` (exported), `venueName?: string | null` on `StoredRhythm` and `GroupRhythm`; both parsers always emit the key explicitly (string or null) so downstream never sees `undefined` post-parse.

- [ ] **Step 1: Failing tests** — append to rhythm.test.ts:

```ts
describe("parseStoredRhythms — venueName", () => {
  it("accepts and trims a venueName string", () => {
    const r = parseStoredRhythms([{ ...VALID_RHYTHM, venueName: "  Summit Gym " }])
    expect(r?.[0].venueName).toBe("Summit Gym")
  })
  it("absent venueName parses as null (legacy rows)", () => {
    expect(parseStoredRhythms([VALID_RHYTHM])?.[0].venueName).toBeNull()
  })
  it("explicit null is null", () => {
    expect(parseStoredRhythms([{ ...VALID_RHYTHM, venueName: null }])?.[0].venueName).toBeNull()
  })
  it("empty and whitespace-only degrade to null, never reject (venue never gates creation)", () => {
    expect(parseStoredRhythms([{ ...VALID_RHYTHM, venueName: "   " }])?.[0].venueName).toBeNull()
  })
  it("caps at VENUE_NAME_MAX", () => {
    const r = parseStoredRhythms([{ ...VALID_RHYTHM, venueName: "x".repeat(200) }])
    expect(r?.[0].venueName?.length).toBeLessThanOrEqual(VENUE_NAME_MAX)
  })
  it("rejects the array on a non-string non-null venueName (strict on our own writes)", () => {
    expect(parseStoredRhythms([{ ...VALID_RHYTHM, venueName: 42 }])).toBeNull()
  })
})

describe("parseRhythm — venueName (lenient: a bad venue can never stop scheduling)", () => {
  it("carries a valid venueName", () => {
    expect(parseRhythm([{ ...VALID_RHYTHM, venueName: "Summit Gym" }])?.venueName).toBe("Summit Gym")
  })
  it("absent venueName is null", () => {
    expect(parseRhythm([VALID_RHYTHM])?.venueName).toBeNull()
  })
  it("a wrong-type venueName degrades to null and the rhythm still parses", () => {
    const r = parseRhythm([{ ...VALID_RHYTHM, venueName: 42 }])
    expect(r).not.toBeNull()
    expect(r?.venueName).toBeNull()
  })
  it("empty string degrades to null", () => {
    expect(parseRhythm([{ ...VALID_RHYTHM, venueName: "" }])?.venueName).toBeNull()
  })
})
```

All genuinely fail first: `toBeNull()` fails on `undefined`.

- [ ] **Step 2: Run to confirm failures** — `npx vitest run src/lib/orbit/__tests__/rhythm.test.ts` → new cases FAIL (undefined ≠ null / no export)
- [ ] **Step 3: Implement:**

```ts
export const VENUE_NAME_MAX = 80

/** Trim, cap, empty→null. The one definition of venue string hygiene,
 *  shared by both parsers here and sanitize() in normalize.ts. */
export function cleanVenueName(v: unknown): string | null {
  if (typeof v !== "string") return null
  const t = v.trim().slice(0, VENUE_NAME_MAX).trim()
  return t.length > 0 ? t : null
}
```

`GroupRhythm` and `StoredRhythm` each gain `venueName?: string | null` (comment: standing place, snapshotted into a Venue row per event / optional like durationMinutes, absent parses as null). `parseRhythm`: `venueName: cleanVenueName(r.venueName)` in the return — no rejection path. `parseStoredRhythms`: `if (r.venueName !== undefined && r.venueName !== null && typeof r.venueName !== "string") return null`, then `venueName: cleanVenueName(r.venueName)` in the pushed object.

- [ ] **Step 4: Full suite green** — `npm test`
- [ ] **Step 5: Commit** — `feat: per-rhythm venueName in the stored rhythm shape`

## Task 2: normalize.ts — Candidate, sanitize, toStored + gate-unchanged pins

**Files:** Modify `src/lib/orbit/normalize.ts`; Test `src/lib/orbit/__tests__/normalize.test.ts`
**Consumes:** `cleanVenueName` from Task 1.
**Untouched by design:** `isSchedulable` (117–122), `classifyGap` (166–181), `deriveTitle`, primary promotion, `NormalizedOnboarding`.

- [ ] **Step 1: Failing tests + regression pins:**

```ts
describe("normalizeExtraction — venueName", () => {
  it("carries a trimmed venueName per rhythm on the ready path", () => {
    const r = normalizeExtraction(raw([
      { ...CLIMB, venueName: "  Summit Gym " },
      { ...BEERS, venueName: "Lucky Lab" },
    ]))
    if (r.status !== "ready") throw new Error("expected ready")
    expect(r.rhythms[0].venueName).toBe("Summit Gym")
    expect(r.rhythms[1].venueName).toBe("Lucky Lab")   // loose rhythms carry venues too
  })
  it("absent, null, wrong-type, and empty venueName all become null", () => {
    for (const venueName of [undefined, null, 42, ""]) {
      const r = normalizeExtraction(raw([{ ...CLIMB, venueName }]))
      if (r.status !== "ready") throw new Error("expected ready")
      expect(r.rhythms[0].venueName).toBeNull()
    }
  })
  it("caps venueName at VENUE_NAME_MAX", () => {
    const r = normalizeExtraction(raw([{ ...CLIMB, venueName: "x".repeat(200) }]))
    if (r.status !== "ready") throw new Error("expected ready")
    expect(r.rhythms[0].venueName!.length).toBeLessThanOrEqual(VENUE_NAME_MAX)
  })
  it("carries venueName into the incomplete partial state so a gap round cannot lose it", () => {
    const r = normalizeExtraction(raw([{ ...CLIMB, timeLocal: null, venueName: "Summit Gym" }]))
    if (r.status !== "incomplete") throw new Error("expected incomplete")
    expect(r.rhythms[0].venueName).toBe("Summit Gym")
  })
})

describe("normalizeExtraction — venue never gates (regression pins)", () => {
  it("a full schedule with no venue is still ready", () => {
    expect(normalizeExtraction(raw([{ ...CLIMB, venueName: null }])).status).toBe("ready")
  })
  it("venueName does not change gap classification", () => {
    // mirror the existing completeness-gate cases, each with venueName: "Summit Gym":
    // missing time → "time"; missing day → "day"; both missing → "both";
    // cadence null (day+time known) → "cadence"; ambiguous time → "ambiguous_time"
  })
})
```

**Honesty flag (per CLAUDE.md):** the two never-gates pins pass on first run *by design* — `isSchedulable`/`classifyGap` don't read the field and this plan forbids touching them. They are regression pins on the unchanged surface, not TDD tests; the commit message says exactly that. The carry tests fail first (venueName is `undefined` in stored output today). Nothing environmental (timezone/locale/clock) affects any of them.

- [ ] **Step 2: Run — carry tests FAIL, pins PASS** (state this in output)
- [ ] **Step 3: Implement** — `Candidate` gains `venueName: string | null`; in `sanitize`'s loop: `const venueName = cleanVenueName(o.venueName)` (import from rhythm.ts), added to the pushed Candidate; `toStored` adds `venueName: c.venueName` (venue is not nulled on the ambiguous-time path — only the unconfirmed time guess is).
- [ ] **Step 4: Full suite green**
- [ ] **Step 5: Commit** — `feat: venueName sanitized through normalize; gate provably untouched`

## Task 3: extract.ts — schema + FIELD_RULES

**Files:** Modify `src/lib/orbit/extract.ts`; Test (new) `src/lib/orbit/__tests__/extract.test.ts`

- [ ] **Step 1: Failing contract test** (new file — no extract test exists; the API call stays untested by design, but the schema constant is testable):

```ts
import { describe, it, expect } from "vitest"
import { EXTRACTION_SCHEMA, FIELD_RULES } from "../extract"

describe("extraction contract — venueName", () => {
  it("rhythm items require venueName so the model can never silently omit it", () => {
    const items = EXTRACTION_SCHEMA.properties.rhythms.items
    expect(items.required).toContain("venueName")
    expect(items.properties.venueName).toEqual({ type: ["string", "null"] })
  })
  it("FIELD_RULES defines venueName and anchors the activity/venue split to the shared example", () => {
    expect(FIELD_RULES).toMatch(/venueName:/)
    expect(FIELD_RULES).toMatch(/climbing at the gym/i)
  })
})
```

Not tautological: with `additionalProperties: false`, forgetting `venueName` in `required` lets structured outputs omit it — sanitize nulls it and venues silently never extract. First assertion fails today; the FIELD_RULES regex on the *existing example* passes on first run (declared pin — it guards the example the new rule anchors to).

- [ ] **Step 2: Run to confirm failure**
- [ ] **Step 3: Implement** — schema: add `"venueName"` to per-rhythm `required`, `venueName: { type: ["string", "null"] }` to properties. FIELD_RULES: insert directly after the `activity` rule (they interlock on the same example; activity rule's "Drop location and filler words" sentence stays verbatim):

```
- venueName: where the group usually meets, in the founder's own words, one short phrase (e.g. "Summit Gym", "the gym", "Maria's place"). "climbing at the gym" is activity "climbing" with venueName "the gym". Only a place the founder actually stated; if no place is mentioned, null. Never invent a venue, and never move the place into activity.
```

FIELD_RULES is shared verbatim with the merge prompt, so the merge call learns the field for free.

- [ ] **Step 4: Full suite green**
- [ ] **Step 5: Commit** — `feat: venueName in the extraction contract (schema + field rules)`

## Task 4: merge round-trip — merge.ts re-encode, gap.ts carry-over, gapAnswerMoved

**Files:** Modify `src/lib/orbit/merge.ts`, `src/lib/orbit/gap.ts`, `src/app/actions/merge-gap.ts`; Test `src/lib/orbit/__tests__/gap.test.ts`, (new) `src/lib/orbit/__tests__/merge.test.ts`
**Produces:** `enforceVenueCarryOver(raw: unknown, prior: StoredRhythm[]): unknown` exported from gap.ts.

- [ ] **Step 1: Failing tests** — gap.test.ts:

```ts
describe("enforceVenueCarryOver", () => {
  const prior = [rhythm({ venueName: "Summit Gym" })]   // reuse the file's rhythm() helper
  it("restores a venueName the merged output nulled (a time answer never removes a venue)", () => {
    const raw = mergedRaw({ venueName: null })
    const out = enforceVenueCarryOver(raw, prior) as { rhythms: Array<Record<string, unknown>> }
    expect(out.rhythms[0].venueName).toBe("Summit Gym")
  })
  it("leaves a replacement venue alone (latest word wins)", () => { /* venueName "Movement" stays */ })
  it("does nothing when prior had no venue", () => { /* prior null → merged null stays null */ })
  it("does not restore across an activity change", () => { /* merged activity "running" → stays null */ })
  it("passes garbage shapes through untouched", () => { /* null, "x", {rhythms:"nope"} return as-is */ })
})

it("gapAnswerMoved counts a venue change as movement", () => {
  // before/after identical except venueName null → "Summit Gym"; expect true
})
```

merge.test.ts (new; mocks the shared call helper, asserts the wire payload):

```ts
import { vi, it, expect } from "vitest"
vi.mock("../extract", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../extract")>()),
  callExtractionModel: vi.fn(async () => ({})),
}))
import { callExtractionModel } from "../extract"
import { mergeGapAnswer } from "../merge"

it("re-encodes venueName into CURRENT UNDERSTANDING so a gap round cannot drop a captured venue", async () => {
  await mergeGapAnswer({
    description: "we climb tuesdays at summit gym",
    groupName: null,
    currentState: [{ activity: "climbing", title: "Climbing", cadence: "weekly",
      daysOfWeek: [2], timeLocal: null, venueName: "Summit Gym" }],
    candidateTimeLocal: null,
    askedAbout: "time",
    answer: "7pm",
  })
  const user = vi.mocked(callExtractionModel).mock.calls[0][1]
  const understanding = JSON.parse(
    user.split("CURRENT UNDERSTANDING:\n")[1].split("\n\nCANDIDATE TIME")[0])
  expect(understanding.rhythms[0].venueName).toBe("Summit Gym")
})
```

- [ ] **Step 2: Run to confirm failures**
- [ ] **Step 3: Implement:**
  - merge.ts re-encode (lines 75–83): add `venueName: r.venueName ?? null` to the mapped rhythm object.
  - gap.ts `projectRhythms` (inside `gapAnswerMoved`): add `venueName: r.venueName ?? null`.
  - gap.ts new sibling:

```ts
/**
 * Venue carry-over on the raw merged claim. A gap answer is about time, day,
 * or cadence; it never legitimately removes a standing venue, so a merged
 * rhythm that nulled a previously captured venueName gets it restored — but
 * only when the rhythm is recognizably the same one (same activity), so a
 * restructured list is never "corrected" by position. A replacement venue
 * (non-null) is the founder's latest word and is left alone.
 */
export function enforceVenueCarryOver(raw: unknown, prior: StoredRhythm[]): unknown {
  if (raw === null || typeof raw !== "object") return raw
  const rhythms = (raw as Record<string, unknown>).rhythms
  if (!Array.isArray(rhythms)) return raw

  const out = structuredClone(raw) as { rhythms: unknown[] }
  const n = Math.min(rhythms.length, prior.length)
  for (let i = 0; i < n; i++) {
    const item = out.rhythms[i]
    if (item === null || typeof item !== "object") continue
    const o = item as Record<string, unknown>
    const p = prior[i]
    if (!p.venueName) continue

    const merged = typeof o.venueName === "string" ? o.venueName.trim() : ""
    if (merged) continue

    const activity = typeof o.activity === "string" ? o.activity.trim().toLowerCase() : ""
    if (activity === p.activity.toLowerCase()) o.venueName = p.venueName
  }
  return out
}
```

  - merge-gap.ts: immediately after the `enforceActivityCarryOver` call, `raw = enforceVenueCarryOver(raw, currentState)` (activity first, so a drift-restored activity lets the venue's activity match succeed).
- [ ] **Step 4: Full suite green**
- [ ] **Step 5: Commit** — `feat: venue survives gap rounds (re-encode + carry-over + movement)`

## Task 5: reconcile.ts — pass the venue through + end-to-end integration proof

**Files:** Modify `src/lib/orbit/reconcile.ts`; Test `src/lib/orbit/__tests__/reconcile.test.ts` (real dev-test DB; Venue rows cascade-delete with Events so existing cleanup covers them — verify, don't assume)

- [ ] **Step 1: Failing test + pin:**

```ts
it("snapshots the rhythm's venueName into a Venue row ({name} only)", async () => {
  const { group } = await createTestUserAndGroup([{ ...SUNDAY_RHYTHM[0], venueName: "Summit Gym" }])
  const results = await reconcileScheduledEvents(NOW, { groupId: group.id })
  if (results[0].status !== "created") throw new Error("expected created")
  eventIds.push(results[0].eventId)
  // track message IDs for cleanup per the file's existing pattern
  const venue = await prisma.venue.findFirst({ where: { eventId: results[0].eventId } })
  expect(venue).not.toBeNull()
  expect(venue!.name).toBe("Summit Gym")
  expect(venue!.displayLabel).toBeNull()
  expect(venue!.address).toBeNull()
  expect(venue!.url).toBeNull()
})

it("a rhythm without venueName creates no Venue row (no-venue flow unchanged)", async () => {
  const { group } = await createTestUserAndGroup(SUNDAY_RHYTHM)
  const results = await reconcileScheduledEvents(NOW, { groupId: group.id })
  if (results[0].status !== "created") throw new Error("expected created")
  eventIds.push(results[0].eventId)
  expect(await prisma.venue.count({ where: { eventId: results[0].eventId } })).toBe(0)
})
```

**Declared pin:** the second test passes on first run — it can only fail if the reconcile change over-reaches (e.g. always passes a venue object), which is exactly what it guards.

- [ ] **Step 2: Run — first FAILS (no Venue row today), second passes (pin)**
- [ ] **Step 3: Implement** — in the `createEvent` call (~line 86):

```ts
// Standing-place snapshot: the rhythm's venue becomes this event's Venue
// row ({name} only; label/address/url are per-event concerns, left null).
venue: rhythm.venueName ? { name: rhythm.venueName } : null,
```

`createEvent` and its tests already cover atomic Venue creation; no change there.

- [ ] **Step 4: Full suite green** — pipeline below the UI is done
- [ ] **Step 5: Commit** — `feat: scheduled events carry the rhythm's standing place`

## Task 6: UI — Step 2 venue input, wizard threading, Step 1 copy

**Files:** Modify `src/app/create/Step2Playback.tsx`, `src/app/create/OnboardingWizard.tsx`, `src/app/create/Step1Describe.tsx`
No component tests exist in this repo (UI verified manually per convention); this task's evidence is Task 7.

- [ ] **Step 1: OnboardingWizard.tsx** — per-rhythm updater + trim-or-null at confirm:

```ts
function handleVenueNameChange(index: number, value: string) {
  setRhythms((prev) =>
    prev ? prev.map((r, i) => (i === index ? { ...r, venueName: value } : r)) : prev
  )
}
```

In `handleConfirm`, map the payload: `rhythms: rhythms.map((r) => ({ ...r, venueName: r.venueName?.trim() ? r.venueName.trim() : null }))`. Pass `onVenueNameChange={handleVenueNameChange}` to Step2Playback. (Adapt to the file's actual state setter names on read.)

- [ ] **Step 2: Step2Playback.tsx** — props gain `onVenueNameChange: (index: number, value: string) => void`. Inside the rhythms map, beneath the value line (keep the `const row =` pattern):

```tsx
{/* Quiet standing-place input: label scale, subtle border, neutral
    colors, never lime — venue is optional and must not read as a gap. */}
<input
  id={`venueName-${i}`}
  type="text"
  value={r.venueName ?? ""}
  onChange={(e) => onVenueNameChange(i, e.target.value)}
  disabled={isCreating}
  maxLength={80}
  placeholder="Where do you usually meet? (optional)"
  aria-label={`Where you usually meet for ${r.activity}`}
  style={{
    width: "100%", marginTop: "0.25rem", padding: "0.25rem 0.5rem",
    backgroundColor: "var(--surface-input)", border: "1px solid var(--border-subtle)",
    borderRadius: "0.375rem", color: "var(--text-primary)",
    fontSize: "var(--type-label)", lineHeight: "var(--leading-normal)",
    outline: "none", boxSizing: "border-box",
  }}
/>
```

Confirm-disable condition untouched — Continue works with or without venues.

- [ ] **Step 3: Step1Describe.tsx** — placeholder becomes `"e.g. A few of us climb at Summit Gym on Sunday mornings at 8, and we grab beers once a month."`; add the hint **below the Continue button** (design position, mockup screen 01: centered, small, secondary), after the `isExtracting ? <OrbitPause/> : <button>` block so it renders in both states. Mockup sentence verbatim plus the venue invitation, one line element:

```tsx
<p style={{ fontSize: "var(--type-meta)", lineHeight: "var(--leading-normal)",
  color: "var(--text-secondary)", textAlign: "center", margin: "0.75rem 0 0" }}>
  Orbit reads this to set your days, send reminders, and build a shared group page.
  Mention your usual spot too, if you have one.
</p>
```

- [ ] **Step 4: `npm test` + `npx tsc --noEmit` green**
- [ ] **Step 5: Commit** — `feat: Step 2 standing-place input + Step 1 invite-where copy`

## Task 7: Manual browser verification — the three required artifacts

Run the dev server (browser preview tools), capture screenshots. Claims need artifacts a reader could check.

- [ ] **Artifact 1 — venue-named flow end to end.** Step 1: "A few of us climb at Summit Gym on Sunday mornings at 8, and we grab beers once a month at Lucky Lab." Step 2: climbing input seeded "Summit Gym", beers input "Lucky Lab", activity label reads CLIMBING (extraction split check — venue must not leak into the label). Confirm → pinned card shows "… · Summit Gym"; event detail shows Where row. Screenshots of Step 2, pinned card, event detail, plus the stored Venue row (name "Summit Gym", displayLabel/address/url null) next to the rendered screen.
- [ ] **Artifact 2 — no-venue flow identical to today.** Step 1: "A few of us climb on Sunday mornings at 8, and we grab beers once a month." (two rhythms, neither with a venue). Step 2 identical to pre-slice playback plus one quiet empty input per rhythm, no lime anywhere near them; Continue works; created event has no venue segment on the card, no Where row, zero Venue rows in the DB. Screenshots + DB count. **The two-rhythm empty-state screenshot is a product-decision artifact:** the owner judges from it whether two persistent empty inputs read as conversation or form — do not adjust the treatment preemptively.
- [ ] **Artifact 3 — empty-state fill-in persists.** No-venue description → type "Movement Gym" into the Step 2 input → confirm → pinned card and detail show it; DB row matches. Screenshots + stored value.
- [ ] **Spot check — gap round-trip.** "We climb at Summit Gym on Tuesdays" → gap ask (time) → answer "7pm" → Step 2 still shows Summit Gym seeded. Screenshot.
- [ ] Look at the rendered Step 2 screen next to the walkthrough mockup's card and report differences honestly (mockup card has no venue row, so this is a taste check on the quiet-input treatment, not a pixel match claim).

## Task 8: Docs + PR

- [ ] Copy this plan into `docs/superpowers/plans/2026-07-22-venue-capture-onboarding.md` (repo convention: pre-build plans are published).
- [ ] build-notes §11 entry recording what the slice decided along the way (§9): storage shape decision + reasoning; strict/lenient parser split; VENUE_NAME_MAX=80; always-editable extension of the spec; `gapAnswerMoved` venue-movement change; the Step 1 hint-line finding (line existed only in the mockup, below Continue; shipped code had none; added in the design position — plus the lesson that the JS-packed walkthrough export is not text-greppable); carry-over sibling design; **the display-format decision** (venueName is a separate field, never part of the composed schedule string; surfaces append `· venue` with dot grammar; future join/info rhythm rows inherit `{value} · {venueName}`).
- [ ] **Debt, logged in plain language (build-notes §11 + PR):**
  - A founder who skips the venue at onboarding has no way to add one later, and no group can switch venues, until the change-request slice lands.
  - A venue captured on a loose rhythm is stored and shown at playback, then displayed nowhere afterward until the spark slice can inherit it — log alongside the existing loose-rhythm display debt.
  - The rhythm's venue is snapshotted into a per-event Venue row at creation, so changing the standing place later will not alter events already created. Recorded as the shape the change-request slice inherits.
  - Observed-not-changed: `parseRhythm` rejects wrong-type `durationMinutes` while `venueName` degrades to null (strictness asymmetry).
- [ ] PR on `feat/venue-capture-onboarding` with the artifacts embedded; what-and-why body; flag the deliberate behavior change and the declared first-run-pass pins. Human merges (touches non-.md files).

## Verification summary (how regression safety is demonstrated, not asserted)

1. Full suite green at baseline (Task 0, count recorded) and after every task — the 237 existing tests include the complete gap-classification and no-venue-flow surface.
2. `git diff` shows `isSchedulable`, `classifyGap`, `deriveTitle`, provision, create-group, announce, EventCard, event detail untouched.
3. New regression pins (declared as pins, not TDD): gate classification unchanged under venueName; no-venue reconcile creates zero Venue rows; FIELD_RULES keeps the shared example.
4. Artifact 2 is the human-visible proof the no-venue founder experience is unchanged.

## Risks / notes

- **Prompt-drift risk:** if manual verification shows activity absorbing venues (or vice versa), tighten the venueName rule's examples, never the activity rule.
- StepGapAsk needs no change (renders via formatRhythmRow/formatGapRhythmRow, venue rides invisibly in `GapPayload.rhythms: StoredRhythm[]`). playback.ts untouched. extract-group.ts / create-group.ts / provision.ts: zero code changes expected (types flow; verify at build time).
- Pre-auth Anthropic call ceiling unchanged (no new calls added).
