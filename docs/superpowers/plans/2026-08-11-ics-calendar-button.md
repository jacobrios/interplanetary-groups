# .ics Add-to-Calendar Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The event detail screen gains a teal "Add to calendar" pill that serves a correct, freshly composed .ics calendar file for that event.

**Architecture:** A pure composer module (`src/lib/events/ics.ts`) turns an event's stored rows into RFC 5545 text; a thin App Router GET route handler at `/events/[id]/calendar.ics` fetches the event and serves the composer's output with the calendar MIME type; the button is a plain anchor component on the detail page. No migration, no model call, no new env var.

**Tech Stack:** Next.js 16 (App Router route handler), Prisma 7 (read-only queries), Vitest (pure unit tests for the composer; integration test against the dev-test database for the route; jsdom component test for the button).

**Spec:** `docs/superpowers/specs/2026-08-11-ics-calendar-button-design.md` — read it first.

## Global Constraints

- **Branch prerequisite (pipeline):** this slice starts only after the joining-arc PR has merged to main. Task 1 verifies that before anything else. Work happens on `feat/ics-calendar-button`, in place, no worktrees (standing owner rule).
- **Two databases, never crossed:** run `npm run db:which` before the baseline run and before any seed; it must print the dev-test ref `pxbewardwvoyqqcvogel` and exit 0. Never read `.env` for this.
- **TDD:** every new test is written first and shown failing before the code that passes it.
- **The suite must stay green from an empty database:** tests build their own fixtures, prefix seeded names with `[TEST]`, uniquify `supabaseAuthId` with `Date.now()`, and clean up in `afterAll` (idiom: `src/lib/groups/__tests__/join.test.ts` — delete groups before users, each `.catch(() => {})`, then `prisma.$disconnect()`).
- **Copy is exact.** Button label: "Add to calendar". Description line in the file: `Details and RSVPs: <event url>`. No em dashes anywhere in product copy.
- **Color and type rules:** the pill is teal (`--color-teal`), the screen's single teal in its own region (the details card keeps its own teal "I'm in"); label-size text (`--type-label`); 44px-class height via min-height, never fixed height.
- **File format is load-bearing:** CRLF (`\r\n`) line endings everywhere in the .ics output, UTC `...Z` timestamps only, RFC 5545 escaping (backslash, semicolon, comma, newline), 75-octet line folding. The tests pin all four.
- **Commit style:** sentence-case subject describing the change, body explaining why in product language, ending with both lines: `Co-Authored-By: Claude <noreply@anthropic.com>` and `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Quote test paths in shell commands** — they contain `[id]` and `calendar.ics` (brackets and dots): `npx vitest run "src/app/events/[id]/calendar.ics/__tests__/route.test.ts"`.

---

### Task 1: Branch cut and slice docs landed

**Files:**
- Create: `docs/superpowers/specs/2026-08-11-ics-calendar-button-design.md` (copied verbatim from the scratchpad path in the header)
- Create: `docs/superpowers/plans/2026-08-11-ics-calendar-button.md` (this file, copied verbatim from the scratchpad; update its header's "until Task 1 lands it" parenthetical to say the spec now lives at its repo path)

**Interfaces:**
- Produces: the branch every later task commits to, with the spec at the path every later task cites.

- [ ] **Step 1: Verify the joining arc merged**

Run: `git fetch origin && git log origin/main --oneline -3`
Expected: the top commits include the joining-arc merge (a "Merge pull request" commit referencing feat/joining-arc). If not, STOP — this slice must not start; report to the owner.

- [ ] **Step 2: Sync main and cut the branch**

```bash
git checkout main
git pull
git status
git branch -d feat/joining-arc
git checkout -b feat/ics-calendar-button
```

Expected: `git status` shows a clean tree on an up-to-date main before the new branch is cut. If `branch -d` refuses (unmerged), STOP and report; never force-delete.

- [ ] **Step 3: Land the spec and plan**

Copy both scratchpad files to their repo paths named above, byte-for-byte except the plan header's parenthetical.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-08-11-ics-calendar-button-design.md docs/superpowers/plans/2026-08-11-ics-calendar-button.md
git commit -m "Stage the ics-slice spec and plan"
```

(Body and co-author lines per Global Constraints. After this commit, delete the memory file `~/.claude/projects/-Users-rivers-m1-air-code-interplanetary-groups/memory/ics-spec-staged-awaiting-branch.md` and its MEMORY.md index line — the breadcrumb's job is done.)

---

### Task 2: Suite baseline and the superseded type-rule line

**Files:**
- Modify: `docs/build-notes.md` (§11, append a new entry stub at the section's end)
- Modify: `CLAUDE.md` (the type role-mapping line that places add-to-calendar among in-card buttons)

**Interfaces:**
- Produces: the baseline numbers Task 6's full §11 entry and the PR body will cite; a CLAUDE.md that no longer contradicts the placement decision.

- [ ] **Step 1: Confirm the database**

Run: `npm run db:which`
Expected: dev-test ref `pxbewardwvoyqqcvogel`, exit 0. If not, STOP and ask the owner.

- [ ] **Step 2: Run the full suite**

Run: `npm test`
Expected: all green. Note the exact file and test counts.

- [ ] **Step 3: Cross-check against the joining-arc finishing number**

In `docs/build-notes.md` §11, find the joining-arc entry (the most recent) and its recorded "suite after" numbers. They must match Step 2's counts. If they do not, record the discrepancy verbatim in the new stub and flag it in the session; do not silently absorb it.

- [ ] **Step 4: Append the entry stub to §11**

At the end of §11, append (real numbers for N/M, real hash for the merge commit):

```markdown
### The .ics add-to-calendar button (started 11 Aug 2026)

Slice started from main at <merge-commit-hash>. Suite baseline before any
code: N files, M tests, all green, matching the joining-arc slice's
finishing number. Spec:
docs/superpowers/specs/2026-08-11-ics-calendar-button-design.md. The rest
of this entry is written at slice close.
```

- [ ] **Step 5: Amend the CLAUDE.md type-rule line**

In `CLAUDE.md`, the role-mapping sentence reads in part: `compact in-card buttons (RSVP, add to calendar, leave) at label`. Change that fragment to: `compact in-card buttons (RSVP, leave) and the full-width add-to-calendar pill at label (placement settled 11 Aug 2026: event detail only, never in-card)`. Touch nothing else in the sentence.

- [ ] **Step 6: Commit**

```bash
git add docs/build-notes.md CLAUDE.md
git commit -m "Record the ics-slice baseline and settle the button's placement in the rules"
```

---

### Task 3: The composer

**Files:**
- Create: `src/lib/events/ics.ts`
- Test: `src/lib/events/__tests__/ics.test.ts`

**Interfaces:**
- Produces: `composeEventIcs(event: IcsEventInput, now: Date): string` and `export interface IcsEventInput { id: string; title: string; startsAt: Date; endsAt: Date | null; venue: { label: string | null; name: string; address: string | null } | null; eventUrl: string }`. Task 4 consumes both. Pure module: no prisma import, no I/O; `now` is a parameter so DTSTAMP is testable.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/events/__tests__/ics.test.ts
import { describe, it, expect } from "vitest"
import { composeEventIcs, type IcsEventInput } from "../ics"

const NOW = new Date("2026-08-11T12:00:00Z")

function baseEvent(overrides: Partial<IcsEventInput> = {}): IcsEventInput {
  return {
    id: "evt123",
    title: "Sunday climb",
    startsAt: new Date("2026-08-16T15:00:00Z"),
    endsAt: null,
    venue: null,
    eventUrl: "http://localhost:3000/events/evt123",
    ...overrides,
  }
}

describe("composeEventIcs", () => {
  it("writes UTC start and the one-hour fallback end", () => {
    const ics = composeEventIcs(baseEvent(), NOW)
    expect(ics).toContain("DTSTART:20260816T150000Z")
    expect(ics).toContain("DTEND:20260816T160000Z")
    expect(ics).toContain("DTSTAMP:20260811T120000Z")
  })

  it("lets a stored end time win over the fallback", () => {
    const ics = composeEventIcs(
      baseEvent({ endsAt: new Date("2026-08-16T18:30:00Z") }),
      NOW
    )
    expect(ics).toContain("DTEND:20260816T183000Z")
  })

  it("carries summary, description link, and calendar envelope", () => {
    const ics = composeEventIcs(baseEvent(), NOW)
    expect(ics).toContain("BEGIN:VCALENDAR")
    expect(ics).toContain("METHOD:PUBLISH")
    expect(ics).toContain("SUMMARY:Sunday climb")
    expect(ics).toContain(
      "DESCRIPTION:Details and RSVPs: http://localhost:3000/events/evt123"
    )
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true)
  })

  it("uses CRLF line endings exclusively", () => {
    const ics = composeEventIcs(baseEvent(), NOW)
    expect(ics.includes("\r\n")).toBe(true)
    expect(ics.replace(/\r\n/g, "").includes("\n")).toBe(false)
  })

  it("keeps the UID stable across compositions", () => {
    const first = composeEventIcs(baseEvent(), NOW)
    const second = composeEventIcs(baseEvent(), new Date("2026-09-01T00:00:00Z"))
    const uidOf = (s: string) => s.match(/UID:[^\r]+/)?.[0]
    expect(uidOf(first)).toBe("UID:evt123@interplanetary-groups")
    expect(uidOf(second)).toBe(uidOf(first))
  })

  it("renders location from the label, appending a stored address", () => {
    const ics = composeEventIcs(
      baseEvent({
        venue: { label: "Movement", name: "Movement Gym LLC", address: "123 Main St" },
      }),
      NOW
    )
    expect(ics).toContain("LOCATION:Movement\\, 123 Main St")
  })

  it("falls back to the venue name and omits LOCATION when no venue", () => {
    const named = composeEventIcs(
      baseEvent({ venue: { label: null, name: "The Wall", address: null } }),
      NOW
    )
    expect(named).toContain("LOCATION:The Wall")
    const bare = composeEventIcs(baseEvent(), NOW)
    expect(bare).not.toContain("LOCATION")
  })

  it("escapes commas, semicolons, and newlines in text fields", () => {
    const ics = composeEventIcs(
      baseEvent({ title: "Beers; then pool, maybe\ndarts" }),
      NOW
    )
    expect(ics).toContain("SUMMARY:Beers\\; then pool\\, maybe\\ndarts")
  })

  it("folds lines longer than 75 octets with a leading space", () => {
    const longTitle = "A".repeat(200)
    const ics = composeEventIcs(baseEvent({ title: longTitle }), NOW)
    const physicalLines = ics.split("\r\n")
    for (const line of physicalLines) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    }
    // Unfolding (CRLF + space removed) restores the logical line.
    expect(ics.replace(/\r\n /g, "")).toContain(`SUMMARY:${longTitle}`)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/events/__tests__/ics.test.ts`
Expected: FAIL — module `../ics` does not exist.

- [ ] **Step 3: Implement `src/lib/events/ics.ts`**

```ts
// src/lib/events/ics.ts
//
// Composes the one-way calendar snapshot (build-notes §6): one VEVENT,
// deterministic, no model call. Timestamps are written as UTC Z-times so
// every calendar client does its own zone conversion and daylight-saving
// math never enters this codebase. The member's calendar showing their
// local time is the spec'd behavior, not drift from the group-time rule,
// which governs the app's shared surfaces only.

export interface IcsEventInput {
  id: string
  title: string
  startsAt: Date
  endsAt: Date | null
  venue: { label: string | null; name: string; address: string | null } | null
  eventUrl: string
}

const ONE_HOUR_MS = 60 * 60 * 1000
const CRLF = "\r\n"

// RFC 5545 §3.3.11: backslash, semicolon, comma, and literal newlines are
// escaped in text values.
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n")
}

// RFC 5545 §3.1: physical lines are capped at 75 octets; the remainder
// continues on the next line after a single space. Measured in UTF-8 bytes,
// split only at codepoint boundaries.
function foldLine(line: string): string {
  const encoder = new TextEncoder()
  if (encoder.encode(line).length <= 75) return line
  const segments: string[] = []
  let current = ""
  let currentBytes = 0
  for (const ch of line) {
    const chBytes = encoder.encode(ch).length
    const limit = segments.length === 0 ? 75 : 74 // continuations lose one octet to the space
    if (currentBytes + chBytes > limit) {
      segments.push(current)
      current = ch
      currentBytes = chBytes
    } else {
      current += ch
      currentBytes += chBytes
    }
  }
  if (current) segments.push(current)
  return segments.map((seg, i) => (i === 0 ? seg : " " + seg)).join(CRLF)
}

function formatUtc(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  )
}

export function composeEventIcs(event: IcsEventInput, now: Date): string {
  const end = event.endsAt ?? new Date(event.startsAt.getTime() + ONE_HOUR_MS)
  const location = event.venue
    ? [event.venue.label ?? event.venue.name, event.venue.address]
        .filter((part): part is string => Boolean(part))
        .join(", ")
    : null

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Interplanetary Groups//Orbit//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.id}@interplanetary-groups`,
    `DTSTAMP:${formatUtc(now)}`,
    `DTSTART:${formatUtc(event.startsAt)}`,
    `DTEND:${formatUtc(end)}`,
    `SUMMARY:${escapeText(event.title)}`,
    ...(location ? [`LOCATION:${escapeText(location)}`] : []),
    `DESCRIPTION:${escapeText(`Details and RSVPs: ${event.eventUrl}`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
  return lines.map(foldLine).join(CRLF) + CRLF
}
```

- [ ] **Step 4: Run the tests to verify they pass, then the full suite**

Run: `npx vitest run src/lib/events/__tests__/ics.test.ts` then `npm test`
Expected: all green, suite count = baseline + 9.

- [ ] **Step 5: Commit**

```bash
git add src/lib/events/ics.ts src/lib/events/__tests__/ics.test.ts
git commit -m "Compose a correct calendar file from an event's stored rows"
```

---

### Task 4: The route

**Files:**
- Create: `src/app/events/[id]/calendar.ics/route.ts`
- Test: `src/app/events/[id]/calendar.ics/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `composeEventIcs`, `IcsEventInput` (Task 3).
- Produces: `GET /events/<id>/calendar.ics` → 200 `text/calendar` body, or 404. Task 5's anchor points here.

- [ ] **Step 1: Write the failing test**

```ts
// src/app/events/[id]/calendar.ics/__tests__/route.test.ts
//
// Integration test — hits the real dev database (repo idiom).
import { describe, it, expect, afterAll } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { GET } from "../route"

describe("GET /events/[id]/calendar.ics", () => {
  const groupIds: string[] = []
  const userIds: string[] = []

  afterAll(async () => {
    for (const id of groupIds) {
      await prisma.group.delete({ where: { id } }).catch(() => {})
    }
    for (const id of userIds) {
      await prisma.user.delete({ where: { id } }).catch(() => {})
    }
    await prisma.$disconnect()
  })

  it("serves a parseable calendar file for a real event", async () => {
    const founder = await prisma.user.create({
      data: { name: "[TEST] Ics Founder", supabaseAuthId: `test-ics-${Date.now()}` },
    })
    const group = await prisma.group.create({
      data: { name: "[TEST] Ics Group", founderId: founder.id },
    })
    groupIds.push(group.id)
    userIds.push(founder.id)
    const event = await prisma.event.create({
      data: {
        groupId: group.id,
        title: "[TEST] Sunday climb",
        startsAt: new Date("2026-08-16T15:00:00Z"),
        venues: { create: { name: "[TEST] The Wall", address: "123 Main St" } },
      },
    })

    const response = await GET(
      new NextRequest(`http://localhost:3000/events/${event.id}/calendar.ics`),
      { params: Promise.resolve({ id: event.id }) }
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8")
    const body = await response.text()
    expect(body).toContain("SUMMARY:[TEST] Sunday climb")
    expect(body).toContain("DTSTART:20260816T150000Z")
    expect(body).toContain("LOCATION:[TEST] The Wall\\, 123 Main St")
    expect(body).toContain(
      `DESCRIPTION:Details and RSVPs: http://localhost:3000/events/${event.id}`
    )
  })

  it("returns 404 for an unknown event id", async () => {
    const response = await GET(
      new NextRequest("http://localhost:3000/events/nope/calendar.ics"),
      { params: Promise.resolve({ id: "nope" }) }
    )
    expect(response.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run "src/app/events/[id]/calendar.ics/__tests__/route.test.ts"`
Expected: FAIL — module `../route` does not exist.

- [ ] **Step 3: Implement `src/app/events/[id]/calendar.ics/route.ts`**

```ts
// src/app/events/[id]/calendar.ics/route.ts
//
// Serves the one-way calendar snapshot. Public by design: no surface in the
// product is membership-gated (standing state, owned by the access-control
// slice), and the file contains nothing personal. Composed per request so a
// tap after a time-change vote carries the moved time; the literal
// calendar.ics segment gives the download its natural filename, and no
// Content-Disposition is set so phones may open their add-to-calendar flow
// directly instead of being forced into a download.

import type { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { composeEventIcs } from "@/lib/events/ics"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await context.params
  const event = await prisma.event.findUnique({
    where: { id },
    include: { venues: true },
  })
  if (!event) {
    return new Response("Not found", { status: 404 })
  }

  const venue = event.venues[0] ?? null
  const origin = new URL(request.url).origin
  const body = composeEventIcs(
    {
      id: event.id,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      venue: venue
        ? { label: venue.displayLabel, name: venue.name, address: venue.address }
        : null,
      eventUrl: `${origin}/events/${event.id}`,
    },
    new Date()
  )
  return new Response(body, {
    headers: { "Content-Type": "text/calendar; charset=utf-8" },
  })
}
```

- [ ] **Step 4: Run the test, then the full suite**

Run: `npx vitest run "src/app/events/[id]/calendar.ics/__tests__/route.test.ts"` then `npm test`
Expected: all green, suite count = Task 3's count + 2.

- [ ] **Step 5: Commit**

```bash
git add "src/app/events/[id]/calendar.ics"
git commit -m "Serve the calendar file from its own public endpoint"
```

---

### Task 5: The button

**Files:**
- Create: `src/app/events/[id]/AddToCalendarButton.tsx`
- Modify: `src/app/events/[id]/page.tsx` (insert the button between the details card and the roster card)
- Test: `src/app/events/[id]/__tests__/AddToCalendarButton.test.tsx`

**Interfaces:**
- Consumes: the Task 4 route (by URL only).
- Produces: `AddToCalendarButton({ eventId }: { eventId: string })`, default export, server-compatible (no `"use client"`, no handlers).

- [ ] **Step 1: Write the failing test**

```tsx
// src/app/events/[id]/__tests__/AddToCalendarButton.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import AddToCalendarButton from "../AddToCalendarButton"

afterEach(cleanup)

describe("AddToCalendarButton", () => {
  it("is a real link to the event's calendar file, teal, exact label", () => {
    render(<AddToCalendarButton eventId="evt42" />)
    const link = screen.getByRole("link", { name: "Add to calendar" })
    expect(link.getAttribute("href")).toBe("/events/evt42/calendar.ics")
    expect((link as HTMLElement).style.backgroundColor).toBe("var(--color-teal)")
  })
})
```

(Note: the `// @vitest-environment jsdom` pragma must be line 1, above the imports, per repo convention.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run "src/app/events/[id]/__tests__/AddToCalendarButton.test.tsx"`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

```tsx
// src/app/events/[id]/AddToCalendarButton.tsx
//
// The event screen's own primary action (spec: teal, its own region; the
// details card keeps its teal "I'm in"). A plain anchor, deliberately not
// next/link: the target is a file the browser or a phone's calendar app
// handles, never a client-side navigation.

export default function AddToCalendarButton({ eventId }: { eventId: string }) {
  return (
    <a
      href={`/events/${eventId}/calendar.ics`}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        minHeight: "2.75rem",
        backgroundColor: "var(--color-teal)",
        color: "#0a0a0a",
        borderRadius: "1.375rem",
        fontSize: "var(--type-label)",
        fontWeight: 600,
        textDecoration: "none",
      }}
    >
      Add to calendar
    </a>
  )
}
```

- [ ] **Step 4: Place it on the page**

In `src/app/events/[id]/page.tsx`: import `AddToCalendarButton` and render `<AddToCalendarButton eventId={event.id} />` between the details card's closing tag and the roster card's opening tag, with vertical spacing matching the page's existing gap between the two cards (read the file; reuse whatever margin/gap idiom separates the cards today rather than inventing a new value). Update the page's header comment if it enumerates the page's regions.

- [ ] **Step 5: Run the test, then the full suite**

Run: `npx vitest run "src/app/events/[id]/__tests__/AddToCalendarButton.test.tsx"` then `npm test`
Expected: all green, suite count = Task 4's count + 1.

- [ ] **Step 6: Commit**

```bash
git add "src/app/events/[id]/AddToCalendarButton.tsx" "src/app/events/[id]/__tests__/AddToCalendarButton.test.tsx" "src/app/events/[id]/page.tsx"
git commit -m "Put the add-to-calendar pill on the event screen"
```

---

### Task 6: The record

**Files:**
- Modify: `docs/build-notes.md` (extend the §11 stub from Task 2)
- Modify: `CLAUDE.md` ("Where the build is" section)

Append-only where the file is a record: postscripts and new lines, never rewrites of existing entries.

- [ ] **Step 1: The §11 entry**

Extend the ics-slice stub with the full record, in the established §11 voice (product language, decisions with reasoning). It must cover: why this button is the MVP's reminder mechanism (§6 lineage); the owner decisions (event-detail-only placement superseding the in-card line; teal-in-its-own-region resolving the handoff CSS contradiction; the one-hour fallback, chosen by the owner over the two-hour recommendation; fresh-at-tap server composition; local-time-on-personal-calendars recorded as correct, not drift; the stored address's first surface; stable UID so a re-tap replaces rather than duplicates); the declined items with homes (home-card button, VALARM, RRULE, per-vendor links); the debt (stale saved entries after a move, standing §6; the address now surfaced with no edit path behind it); no migration, no model call, nothing joining the pre-deploy checklist; and the verification numbers: baseline from Task 2, suite after (run `npm test`, real counts), tests written failing-first. Note the walkthrough evidence will be appended by Task 7.

- [ ] **Step 2: CLAUDE.md current state**

In "Where the build is": add a short paragraph that the .ics button is built (one sentence on what it does, one on the honest limitation), and update the "Next slice" pointer to the end-of-build visual-polish pass per the triage order. Check the "Still missing" list against reality and amend any line this slice made false.

- [ ] **Step 3: Commit**

```bash
git add docs/build-notes.md CLAUDE.md
git commit -m "Record the ics-slice decisions, debt, and current state"
```

---

### Task 7: Browser walkthrough (evidence, not assertion)

**Files:** none (evidence gathering; screenshots + appended §11 postscript)

Use the in-app browser against the dev server (`.claude/launch.json`; never Bash for servers). The dev-test database should already hold groups and events from prior QA; if none is upcoming, stage one with the established `scripts/qa-stage-*.ts` pattern (check `scripts/` for the closest precedent and follow it; name everything `[TEST]`).

- [ ] **Step 1:** Open an event's detail page. Verify the teal pill sits between the details card and the roster, label exactly "Add to calendar", and the details card's own "I'm in" is still teal (two regions, one teal each). Screenshot.
- [ ] **Step 2:** Click the pill. Verify the browser receives a `calendar.ics` file. Show the downloaded file's text contents in the session (the full VCALENDAR block) and confirm the times, title, venue-with-address line, and event URL are the seeded event's.
- [ ] **Step 3:** If a desktop calendar app is available on this Mac, import the file and screenshot the resulting entry (title, time, location). If not, say so; the format tests carry the format claim.
- [ ] **Step 4:** Fetch the endpoint for a nonsense id (browser address bar) and verify a 404, not a crash.
- [ ] **Step 5:** Append a dated walkthrough postscript to the §11 entry with what was verified and the named gaps (phone add-flow not exercisable from a desktop browser; real Google/Outlook import unverified), and commit:

```bash
git add docs/build-notes.md
git commit -m "Append the ics-slice walkthrough evidence"
```

After Task 7, the finishing flow (superpowers:finishing-a-development-branch, the pr-handoff checklist at `~/.claude/checklists/pr-handoff.md`, and the independent read-only review) takes over; that flow, not this plan, owns the PR body, the QA script (which offers the owner the optional phone step), and the review report.
