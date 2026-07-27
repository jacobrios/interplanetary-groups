# App-Wide Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared header chrome this app never had, and use it to close every navigational dead end: a session-aware front door at `/`, a way back from event detail, a way out of create step 1 and of a bad invite link, and the two missing route boundaries.

**Architecture:** Three small presentational components in a new `src/components/` directory. One owns the header bar's rules and nothing about content (`PageHeader`); one renders `‹ label` inside it (`BackLink`); one is the chevron icon that today exists as two hand-inlined copies. No header goes in the root layout, so every screen opts in and the join screen and front door stay headerless. The only branching logic in the slice (where `/` sends you) is extracted as a pure function in `src/lib` so it can be unit-tested in the existing Node environment.

**Tech Stack:** Next.js 16 (App Router, server components by default), React 19.2, Prisma 7, Vitest 4, inline `style` objects reading CSS custom properties from `src/app/globals.css`.

**Spec:** `docs/superpowers/specs/2026-07-27-app-navigation-design.md`. Where this plan and the spec differ, the spec is the intent.

## Global Constraints

- **Styling is inline `style={{}}` objects reading CSS custom properties.** Tailwind classes appear only in `layout.tsx` and the scaffold page; do not introduce Tailwind into product screens. All colors, sizes, and line-heights come from tokens in `src/app/globals.css`, never hardcoded values.
- **Do not edit `src/app/globals.css`.** Its light-mode default and Arial body font are known scaffolding gaps owned by the end-of-build visual-polish pass.
- **No em dashes or en dashes in any user-facing copy.** Commas, periods, parentheses only. Standard hyphens in compound words are fine.
- **Type role mapping:** primary CTAs at `--type-body`; metadata, status, and reference notes at `--type-meta`; uppercase eyebrows at `--type-eyebrow` (13px, a hard floor, nothing smaller anywhere).
- **Teal (`--color-teal`) is the primary action, at most one per card or screen region. Lime (`--color-lime`) is Orbit's brand and never marks an action.**
- **Layout grows with content, never clips.** Use `min-height` plus padding, never fixed heights.
- **`next/link` for every internal navigation.** No raw `<a href>` to an in-app route.
- **Never point anything at the production database.** All verification runs against the dev/test Supabase project already configured in `.env`.
- **Existing behavior stays put.** Do not move `RsvpControls`, do not touch the duplicated page-shell style objects, do not add membership gating.
- Do not run `prisma migrate` or `prisma db push` anywhere in this plan. No schema changes.

---

### Task 1: Front-door destination logic

The only real branching logic in the slice. Pure function, no database, no React, testable in the existing Node environment.

**Files:**
- Create: `src/lib/nav/front-door.ts`
- Test: `src/lib/nav/__tests__/front-door.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `resolveFrontDoor(memberships: readonly FrontDoorMembership[]): FrontDoorDestination`, where `FrontDoorMembership` is `{ groupId: string; joinedAt: Date }` and `FrontDoorDestination` is `{ kind: "front-door" } | { kind: "group"; groupId: string }`. Task 7 calls this from `src/app/page.tsx`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/nav/__tests__/front-door.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { resolveFrontDoor } from "@/lib/nav/front-door"

describe("resolveFrontDoor", () => {
  it("shows the front door when there is no membership at all", () => {
    expect(resolveFrontDoor([])).toEqual({ kind: "front-door" })
  })

  it("sends a member of one group straight into that group", () => {
    const result = resolveFrontDoor([
      { groupId: "group-a", joinedAt: new Date("2026-07-01T00:00:00Z") },
    ])
    expect(result).toEqual({ kind: "group", groupId: "group-a" })
  })

  it("sends a member of several groups to the most recently joined one", () => {
    const result = resolveFrontDoor([
      { groupId: "older", joinedAt: new Date("2026-06-01T00:00:00Z") },
      { groupId: "newest", joinedAt: new Date("2026-07-20T00:00:00Z") },
      { groupId: "middle", joinedAt: new Date("2026-07-02T00:00:00Z") },
    ])
    expect(result).toEqual({ kind: "group", groupId: "newest" })
  })

  it("breaks a joinedAt tie deterministically by group id", () => {
    const sameInstant = new Date("2026-07-20T00:00:00Z")
    const forward = resolveFrontDoor([
      { groupId: "bbb", joinedAt: sameInstant },
      { groupId: "aaa", joinedAt: sameInstant },
    ])
    const reversed = resolveFrontDoor([
      { groupId: "aaa", joinedAt: sameInstant },
      { groupId: "bbb", joinedAt: sameInstant },
    ])
    expect(forward).toEqual({ kind: "group", groupId: "aaa" })
    expect(reversed).toEqual(forward)
  })

  it("does not mutate the array it was given", () => {
    const memberships = [
      { groupId: "older", joinedAt: new Date("2026-06-01T00:00:00Z") },
      { groupId: "newest", joinedAt: new Date("2026-07-20T00:00:00Z") },
    ]
    const snapshot = memberships.map((m) => m.groupId)
    resolveFrontDoor(memberships)
    expect(memberships.map((m) => m.groupId)).toEqual(snapshot)
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails for the right reason**

Run:

```bash
npx vitest run src/lib/nav/__tests__/front-door.test.ts
```

Expected: the run fails to resolve `@/lib/nav/front-door` (the module does not exist yet). If it fails for any other reason, stop and read the error before writing code.

- [ ] **Step 3: Write the implementation**

Create `src/lib/nav/front-door.ts`:

```ts
// src/lib/nav/front-door.ts
//
// Where "/" sends a visitor. The one piece of real branching logic in the
// app-wide navigation slice, kept out of the page component so it can be
// tested without a database or a browser.
//
// The several-groups case is a placeholder, not a designed behavior: the
// multi-group home is a fast-follow (build-notes §8) and this function is
// the seat being held for it. Until then the most recently joined group is
// the least surprising guess, since it is the group the person most likely
// arrived for.

export interface FrontDoorMembership {
  groupId: string
  joinedAt: Date
}

export type FrontDoorDestination =
  | { kind: "front-door" }
  | { kind: "group"; groupId: string }

export function resolveFrontDoor(
  memberships: readonly FrontDoorMembership[]
): FrontDoorDestination {
  if (memberships.length === 0) return { kind: "front-door" }

  // Copy before sorting: callers pass query results they may still use.
  // Ties break on groupId so the destination is stable across query orders,
  // which matters because Prisma makes no ordering promise without orderBy.
  const [mostRecent] = [...memberships].sort((a, b) => {
    const byRecency = b.joinedAt.getTime() - a.joinedAt.getTime()
    if (byRecency !== 0) return byRecency
    return a.groupId.localeCompare(b.groupId)
  })

  return { kind: "group", groupId: mostRecent.groupId }
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npx vitest run src/lib/nav/__tests__/front-door.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Run the whole suite to confirm nothing else moved**

```bash
npm test
```

Expected: every previously passing test still passes.

- [ ] **Step 6: Commit**

```bash
git add src/lib/nav/front-door.ts src/lib/nav/__tests__/front-door.test.ts
git commit -m "Add the front-door destination rule

Where / sends a visitor, extracted as a pure function so it can be
tested without a database. No membership means the front door; one
membership means that group; several means the most recently joined,
which is a placeholder holding a seat for the multi-group home rather
than a designed behavior.

Ties on joinedAt break on group id, because Prisma promises no ordering
without an explicit orderBy and a front door that sends you somewhere
different on refresh would be a real bug.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Component test tooling, and the three shared components

Adds the repo's first ability to test a component, then builds the shared chrome. Tooling and components are one task because the tooling exists to test these components and neither is independently reviewable.

**Files:**
- Modify: `package.json` (dev dependencies only)
- Create: `src/components/Chevron.tsx`
- Create: `src/components/PageHeader.tsx`
- Create: `src/components/BackLink.tsx`
- Test: `src/components/__tests__/BackLink.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `Chevron({ direction }: { direction: "left" | "right" })` returning a 14x14 inline SVG that inherits `currentColor`.
  - `PageHeader({ children }: { children: React.ReactNode })` returning a `<header>` element.
  - `BackLink({ href, label }: { href: string; label: string })` returning a `next/link` anchor containing a left chevron and the label.
  - Tasks 3 through 6 import all three from `@/components/...`.

- [ ] **Step 1: Install the test tooling**

```bash
npm install -D jsdom @testing-library/react @testing-library/dom
```

Notes for whoever runs this. `@testing-library/react` v16 and later is the version that supports React 19, and v16 moved `@testing-library/dom` from a bundled dependency to an explicit peer dependency, which is why it is installed alongside rather than arriving automatically. Do **not** modify `vitest.config.ts`: it sets `environment: "node"` for the whole suite and loads `.env` before any test imports Prisma. Component test files opt into the browser-like environment individually with a docblock comment, which is why the 26 existing tests cannot be affected by this change.

- [ ] **Step 2: Confirm the existing suite is unaffected by the install**

```bash
npm test
```

Expected: the same passing result as before the install. This is the specific claim the per-file-environment approach was chosen to make, so verify it rather than assuming it.

- [ ] **Step 3: Write the failing component test**

Create `src/components/__tests__/BackLink.test.tsx`:

```tsx
// @vitest-environment jsdom
//
// next/link is mocked to a plain anchor on purpose. What is under test is
// BackLink's own contract (it renders the label it is given, points where it
// is told, and carries a decorative chevron), not Next's Link component,
// which has its own tests and needs an App Router context this test has no
// business constructing.

import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import BackLink from "@/components/BackLink"

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string
    children: ReactNode
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

// Testing Library only auto-cleans between tests when Vitest globals are on,
// and this project's config does not enable them. Without this, the second
// render would leave two "Climbing Crew" links in the document and
// getByRole would throw on finding multiple matches.
afterEach(cleanup)

describe("BackLink", () => {
  it("renders the label it is given as the link text", () => {
    render(<BackLink href="/groups/abc" label="Climbing Crew" />)
    expect(screen.getByRole("link", { name: "Climbing Crew" })).toBeDefined()
  })

  it("points at the destination it is given", () => {
    render(<BackLink href="/groups/abc" label="Climbing Crew" />)
    const link = screen.getByRole("link", { name: "Climbing Crew" })
    expect(link.getAttribute("href")).toBe("/groups/abc")
  })

  it("hides the chevron from assistive technology so the label is the whole name", () => {
    const { container } = render(
      <BackLink href="/groups/abc" label="Climbing Crew" />
    )
    const svg = container.querySelector("svg")
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute("aria-hidden")).toBe("true")
  })

  it("points its chevron left, not right", () => {
    const { container } = render(
      <BackLink href="/groups/abc" label="Climbing Crew" />
    )
    // The left path starts at x=9 and moves back to x=5; the right path is
    // the mirror. Asserting the path data is what makes a mirrored-icon
    // regression fail here instead of in someone's eyes.
    expect(container.querySelector("path")?.getAttribute("d")).toBe("M9 11l-4-4 4-4")
  })
})
```

- [ ] **Step 4: Run the test and confirm it fails for the right reason**

```bash
npx vitest run src/components/__tests__/BackLink.test.tsx
```

Expected: fails to resolve `@/components/BackLink`. If instead it fails on the jsdom environment or on a missing `@testing-library` package, the install in Step 1 did not take; fix that before writing components.

- [ ] **Step 5: Write the chevron**

Create `src/components/Chevron.tsx`:

```tsx
// src/components/Chevron.tsx
//
// The product's chevron, extracted from the two hand-inlined copies that
// previously lived in the group-home and group-info headers and differed
// only in path data. Inherits currentColor, so the caller decides the color
// by setting it on the surrounding element.
//
// Decorative by definition: every chevron in this product sits beside a text
// label that already names the destination, so it is always aria-hidden.

const PATHS = {
  left: "M9 11l-4-4 4-4",
  right: "M5 3l4 4-4 4",
} as const

export default function Chevron({
  direction,
}: {
  direction: "left" | "right"
}) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d={PATHS[direction]}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
```

- [ ] **Step 6: Write the header bar**

Create `src/components/PageHeader.tsx`:

```tsx
// src/components/PageHeader.tsx
//
// The header bar, and deliberately nothing else. It owns the bar's rules:
// breathing room, the hairline beneath it, that it does not scroll away with
// the page, and that it grows with whatever is placed inside it.
//
// It has no title slot, no trailing-action slot, and no opinion about what
// any screen's header contains. That boundary is the point: the alternative
// considered was one configurable header that knew every screen, and it is
// the version that would eventually have swallowed the group home's title
// chevron (spec: "the shared piece owns the bar, not the content").
//
// It owns no height either, so a one-line child header is one line tall and
// the group home's two-line header is taller, and neither pays for the other
// (CLAUDE.md: layout grows with content, never clips).

export default function PageHeader({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        padding: "0.875rem 1rem",
        borderBottom: "1px solid var(--border-subtle)",
        flexShrink: 0,
      }}
    >
      {children}
    </header>
  )
}
```

- [ ] **Step 7: Write the back link**

Create `src/components/BackLink.tsx`:

```tsx
// src/components/BackLink.tsx
//
// The child-screen header content: a left chevron and the name of the parent
// you are going back to, as drawn on walkthrough screens 09 and 10
// ("‹ Climbing Crew").
//
// The destination is a fixed parent link, never browser-history back. History
// back is unpredictable in exactly the case that matters: arrive at an event
// from a shared invite link and it throws you out of the product entirely.

import Link from "next/link"
import Chevron from "./Chevron"

export default function BackLink({
  href,
  label,
}: {
  href: string
  label: string
}) {
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.375rem",
        textDecoration: "none",
        color: "var(--text-secondary)",
        fontSize: "var(--type-body)",
      }}
    >
      <Chevron direction="left" />
      {label}
    </Link>
  )
}
```

- [ ] **Step 8: Run the component test and confirm it passes**

```bash
npx vitest run src/components/__tests__/BackLink.test.tsx
```

Expected: 4 passed.

- [ ] **Step 9: Run the whole suite**

```bash
npm test
```

Expected: all previous tests plus the 5 from Task 1 plus these 4.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json src/components
git commit -m "Add shared header chrome and the ability to test a component

The app had no shared chrome: layout.tsx renders bare {children}, so
every screen hand-wrote its own header and any screen whose author did
not simply had none. Three small components replace that: a bar that
owns only the bar's rules, the child-screen back link drawn on
walkthrough screens 09 and 10, and one chevron replacing the two
hand-inlined copies that differed only in path data.

PageHeader deliberately knows nothing about content. The rejected
alternative was one configurable header switching on screen type, which
is the version that eventually swallows the group home's title chevron
and collects every future screen's exception in one file.

Also adds jsdom and @testing-library/react, so the repo can test a
component for the first time. Component tests opt into the browser-like
environment per file, leaving vitest.config.ts untouched, which is what
makes the existing 26 tests provably unaffected.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: The not-found and error route boundaries

Today three `notFound()` calls and any render error fall through to Next's unbranded defaults, which are themselves dead ends.

**Files:**
- Create: `src/components/DeadEndScreen.tsx`
- Create: `src/app/not-found.tsx`
- Create: `src/app/error.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `DeadEndScreen({ heading, body, children }: { heading: string; body: string; children: React.ReactNode })`. `children` is the action row. Not used outside this task.

- [ ] **Step 1: Write the shared dead-end screen**

Create `src/components/DeadEndScreen.tsx`:

```tsx
// src/components/DeadEndScreen.tsx
//
// The layout shared by the not-found and error boundaries: a centered
// column, a heading, a line of explanation, and an action row.
//
// Orbit is deliberately absent from both. Orbit's presence in this product
// means something is being handled for you, and Orbit did not break a
// mistyped URL; putting its face on a crash makes it look less competent
// than it is (spec: "Orbit speaks on the bad invite link and stays off the
// technical failures"). Warmth lives in the copy instead.

export default function DeadEndScreen({
  heading,
  body,
  children,
}: {
  heading: string
  body: string
  children: React.ReactNode
}) {
  return (
    <main
      style={{
        minHeight: "100dvh",
        backgroundColor: "var(--surface-page)",
        color: "var(--text-primary)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1.5rem",
        fontFamily: "var(--font-geist-sans, system-ui, sans-serif)",
      }}
    >
      <div style={{ width: "100%", maxWidth: "28rem" }}>
        <h1
          style={{
            fontSize: "var(--type-title)",
            lineHeight: "var(--leading-tight)",
            fontWeight: 700,
            marginBottom: "0.5rem",
          }}
        >
          {heading}
        </h1>
        <p
          style={{
            fontSize: "var(--type-body)",
            lineHeight: "var(--leading-normal)",
            color: "var(--text-secondary)",
            marginBottom: "1.5rem",
          }}
        >
          {body}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {children}
        </div>
      </div>
    </main>
  )
}
```

Note on the action row: it stacks in a column rather than sitting side by side, because CLAUDE.md requires buttons to stack when they cannot sit side by side and a column is the honest default at this width.

- [ ] **Step 2: Write the not-found boundary**

Create `src/app/not-found.tsx`:

```tsx
// src/app/not-found.tsx
//
// Catches all three notFound() calls in the app: an unknown group id
// (groups/[id] and groups/[id]/info) and an unknown event id (events/[id]).
//
// One generic page rather than per-segment ones, decided rather than
// defaulted: the copy is honest about all three cases and it is one file
// instead of three. A later slice can split it without wondering whether the
// single page was an oversight.
//
// Known limit, recorded in the spec: this page cannot tell "that event was
// cancelled" from "that URL is wrong", because the product does not keep
// cancelled events. Hence the neutral wording.

import Link from "next/link"
import DeadEndScreen from "@/components/DeadEndScreen"

export default function NotFound() {
  return (
    <DeadEndScreen
      heading="That page isn't here."
      body="It might have been removed, or the link might have a typo in it."
    >
      <Link
        href="/"
        style={{
          display: "block",
          width: "100%",
          padding: "0.75rem 1.5rem",
          backgroundColor: "var(--color-teal)",
          color: "#0a0a0a",
          fontSize: "var(--type-body)",
          fontWeight: 600,
          borderRadius: "0.5rem",
          textAlign: "center",
          textDecoration: "none",
        }}
      >
        Take me home
      </Link>
    </DeadEndScreen>
  )
}
```

- [ ] **Step 3: Write the error boundary**

Create `src/app/error.tsx`. It must be a client component: Next's error boundary receives a `reset` callback and can only be one.

```tsx
// src/app/error.tsx
//
// Catches any render error below the root layout. Next requires this to be a
// client component, because it receives a reset() callback.
//
// No global-error.tsx: that would additionally cover a crash inside the root
// layout itself, which is a few lines of font wiring, so the uncovered case
// is close to theoretical. Recorded in the spec rather than covered.

"use client"

import Link from "next/link"
import DeadEndScreen from "@/components/DeadEndScreen"

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <DeadEndScreen
      heading="Something broke on our end."
      body="Not your fault. Try again, and if it keeps happening, give it a minute."
    >
      <button
        type="button"
        onClick={reset}
        style={{
          width: "100%",
          padding: "0.75rem 1.5rem",
          backgroundColor: "var(--color-teal)",
          color: "#0a0a0a",
          fontSize: "var(--type-body)",
          fontWeight: 600,
          border: "none",
          borderRadius: "0.5rem",
          cursor: "pointer",
        }}
      >
        Try again
      </button>
      <Link
        href="/"
        style={{
          display: "block",
          width: "100%",
          padding: "0.75rem 1.5rem",
          backgroundColor: "transparent",
          color: "var(--text-primary)",
          fontSize: "var(--type-body)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "0.5rem",
          textAlign: "center",
          textDecoration: "none",
        }}
      >
        Take me home
      </Link>
    </DeadEndScreen>
  )
}
```

Note: the `error` prop is declared and unused on purpose. Next passes it, the type documents it, and deliberately not rendering it is the decision (a stack trace or a raw message on a user-facing screen tells a person nothing and can leak internals). If the linter objects to the unused binding, keep the prop in the type and destructure only `reset`, exactly as written above.

- [ ] **Step 4: Verify both boundaries render**

Start the dev server via the preview tooling (never `npm run dev` in a shell), then:

1. Visit `/groups/does-not-exist`. Expected: the not-found screen with "That page isn't here." and a teal "Take me home."
2. Visit `/events/does-not-exist`. Expected: the same screen.
3. Click "Take me home." Expected: it lands on `/` (which at this point in the plan is still the scaffold page; Task 7 replaces it). Confirm the navigation happens, not the destination's content.
4. Check the browser console and the server logs for errors.

The error boundary has no natural trigger yet. Verify it by temporarily adding `throw new Error("boundary check")` at the top of `src/app/events/[id]/page.tsx`'s component body, loading any event, confirming the error screen appears with both actions, then **removing the throw** and confirming the event page renders again. Do not commit the throw.

- [ ] **Step 5: Run the suite and the linter**

```bash
npm test && npm run lint
```

Expected: tests pass, lint clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/DeadEndScreen.tsx src/app/not-found.tsx src/app/error.tsx
git commit -m "Give a wrong link and a crash somewhere to go

Three notFound() calls and any render error previously fell through to
Next's unbranded defaults, which are themselves dead ends: no way back
into the product from either.

Both screens are written warmly and neither has Orbit on it. Orbit's
presence in this product means something is being handled for you, and
Orbit did not break a mistyped URL. Character lives in the copy instead,
so neither screen reads as though nobody wanted to deal with it.

One generic not-found page rather than per-segment ones, and no
global-error boundary, both decided rather than defaulted; reasoning is
in the file headers so a later slice knows it was a choice.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Event detail gets a way back

The dead end the product owner actually hit, and the most-reached screen in the product since every card taps into it.

**Files:**
- Modify: `src/app/events/[id]/page.tsx:58-96`

**Interfaces:**
- Consumes: `PageHeader` and `BackLink` from Task 2.
- Produces: nothing.

- [ ] **Step 1: Add the imports**

In `src/app/events/[id]/page.tsx`, after the existing `RosterAvatar` import (currently line 8), add:

```ts
import PageHeader from "@/components/PageHeader"
import BackLink from "@/components/BackLink"
```

- [ ] **Step 2: Restructure the page shell so the header spans the full width**

The current `<main>` carries `alignItems: "center"` and `padding: "2rem 1.5rem"`, which would inset the header and stop its hairline reaching both edges. Move that padding to a new inner wrapper.

Replace the opening of the returned JSX, from `<main` through the line `<div style={{ width: "100%", maxWidth: "28rem" }}>`, with:

```tsx
    <main
      style={{
        minHeight: "100dvh",
        backgroundColor: "var(--surface-page)",
        color: "var(--text-primary)",
        display: "flex",
        flexDirection: "column",
        fontFamily: "var(--font-geist-sans, system-ui, sans-serif)",
      }}
    >
      {/* Back to the group this event belongs to (walkthrough screen 09).
          A fixed parent link, never history back: arriving here from a
          shared link and pressing history back leaves the product. The
          group relation is already loaded for the roster, so this costs
          no extra query. */}
      <PageHeader>
        <BackLink href={`/groups/${event.group.id}`} label={event.group.name} />
      </PageHeader>

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "2rem 1.5rem",
        }}
      >
        <div style={{ width: "100%", maxWidth: "28rem" }}>
```

Then add one extra `</div>` before the closing `</main>` to close the new wrapper. Everything between the max-width div and that point is unchanged.

- [ ] **Step 3: Remove the now-duplicated group-name eyebrow**

Find the `<p>` element that renders `{event.group.name}` as an uppercase eyebrow directly above the `<h1>` holding the event title. (Identify it by content, not by line number: Step 2 shifted the line numbers.) It said the group's name because nothing else on the screen did. The header now does, and walkthrough screen 09 shows the group name once, in the header, not twice. Delete that entire `<p>` element and its `{/* Group name eyebrow */}` comment.

This is in lane: it exists only because there was no header, and leaving it would print the group's name twice on one screen.

- [ ] **Step 4: Verify in the browser**

With the dev server running:

1. Open a group home, tap an event card. Expected: the event page now has `‹ <group name>` at the top, left-aligned, one line, and the group's name appears exactly once on the screen.
2. Click the back link. Expected: it lands on that event's group home, and it is a client-side transition (the page does not do a full reload flash).
3. Confirm the header's bottom hairline reaches both edges of the screen rather than stopping short.
4. Screenshot the event page.
5. Compare that screenshot against `docs/design/walkthrough-screens/screens-09-10.png` (the left half). This is one of only two screens in the slice with a design to match, so the comparison is required before any "matches the design" claim. Differences are questions to raise, not defects to fix.

- [ ] **Step 5: Run the suite and the linter**

```bash
npm test && npm run lint
```

- [ ] **Step 6: Commit**

```bash
git add src/app/events/[id]/page.tsx
git commit -m "Give event detail its way back to the group

The screen every event card taps into had no header, no back link, and
no router call anywhere in the file, so the only way out was the
browser's back button. Walkthrough screen 09 was drawn with this header
all along; it was simply never built.

The link is a fixed parent, never history back: arriving at an event
from a shared invite link and pressing history back leaves the product
entirely. The group relation was already loaded for the roster, so the
group's name costs no extra query.

Also drops the uppercase group-name eyebrow above the title. It existed
only because nothing else on the screen named the group; keeping it now
would print the group's name twice, and screen 09 shows it once.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Group info's header conforms to its design

The app's only existing back link, and it does not match the screen it was drawn from.

**Files:**
- Modify: `src/app/groups/[id]/info/page.tsx:19, 45-96`

**Interfaces:**
- Consumes: `PageHeader` and `BackLink` from Task 2.
- Produces: nothing.

- [ ] **Step 1: Add the imports**

In `src/app/groups/[id]/info/page.tsx`, after the `CopyInviteLink` import (currently line 19), add:

```ts
import PageHeader from "@/components/PageHeader"
import BackLink from "@/components/BackLink"
```

- [ ] **Step 2: Replace the hand-written header**

Replace the whole block from `{/* Back header */}` through the closing `</header>` (currently lines 45-96) with:

```tsx
      {/* Back to the group home (walkthrough screen 10). The design labels
          the back link with the group's own name and centers nothing; the
          previous hand-written header read "Back" with the name centered
          beside it, which no design called for. */}
      <PageHeader>
        <BackLink href={`/groups/${group.id}`} label={group.name} />
      </PageHeader>
```

This removes the inlined left-chevron SVG, the centered group-name span, and the 40px balancing spacer that only existed to offset that centering.

- [ ] **Step 3: Verify in the browser**

1. From a group home, tap the group title chevron. Expected: group info opens with `‹ <group name>` at the top left and nothing centered.
2. Click the back link. Expected: it returns to the group home as a client-side transition, not a full page reload. This is one of the two links that previously caused a full reload, so specifically watch for the reload flash being gone.
3. Screenshot, and compare against the right half of `docs/design/walkthrough-screens/screens-09-10.png`.

- [ ] **Step 4: Run the suite and the linter**

```bash
npm test && npm run lint
```

- [ ] **Step 5: Commit**

```bash
git add src/app/groups/[id]/info/page.tsx
git commit -m "Make group info's header match the screen it was drawn from

The shipped header read a generic 'Back' with the group's name centered
beside it and a spacer to balance the centering. Walkthrough screen 10
draws '‹ Climbing Crew', left-aligned, with nothing centered.

Naming the destination is also the better link: 'Back' tells you a
direction, the group's name tells you where you land. Replacing it with
the shared back link removes the second hand-inlined chevron SVG and
turns the app's one remaining full-page-reload link into a client
transition.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: The group home's logo becomes a real home button

CLAUDE.md and build-notes §7 both describe the Orbit logo top-left as the home button. It is currently an inert `<div>`, because until now there was nowhere for it to go.

**Files:**
- Modify: `src/app/groups/[id]/page.tsx:134-210`

**Interfaces:**
- Consumes: `PageHeader` and `Chevron` from Task 2.
- Produces: nothing.

- [ ] **Step 1: Add the imports**

In `src/app/groups/[id]/page.tsx`, after the existing type imports (currently through line 31), add:

```ts
import Link from "next/link"
import PageHeader from "@/components/PageHeader"
import Chevron from "@/components/Chevron"
```

- [ ] **Step 2: Replace the hand-written header**

Replace the whole block from `{/* ── Header ──` through the closing `</header>` (currently lines 134-210) with:

```tsx
      {/* ── Header ──────────────────────────────────────────────────────── */}
      {/* Grammar per §7: Orbit logo top-left is the home button; the group
          title plus chevron opens group info (which carries the invite
          link). The logo is a real link as of the navigation slice, now
          that "/" exists to send it to.

          The three children sit in their own space-between row rather than
          PageHeader arranging them: PageHeader owns the bar's rules and
          nothing about content, which is what keeps it from ever growing an
          opinion about this title chevron.

          Still unbuilt and owned by the visual-polish pass: Orbit's real
          avatar (a letter-O circle stands in) and the subline reading
          "N members · group info & invite link" drawn on screens 06 to 08. */}
      <PageHeader>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          {/* Orbit logo — the home button (multi-group home is a fast-follow) */}
          <Link
            href="/"
            aria-label="Home"
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              backgroundColor: "var(--color-lime)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.6875rem",
              fontWeight: 700,
              color: "#0a0a0a",
              letterSpacing: "-0.01em",
              textDecoration: "none",
              flexShrink: 0,
            }}
          >
            O
          </Link>

          {/* Group title + chevron → group info */}
          <Link
            href={`/groups/${group.id}/info`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.25rem",
              textDecoration: "none",
              color: "var(--text-primary)",
            }}
          >
            <span
              style={{
                fontSize: "var(--type-body)",
                fontWeight: 600,
                lineHeight: "var(--leading-tight)",
              }}
            >
              {group.name}
            </span>
            <span style={{ color: "var(--text-secondary)", display: "flex" }}>
              <Chevron direction="right" />
            </span>
          </Link>

          {/* Right-side spacer to visually balance the logo */}
          <div style={{ width: 28, flexShrink: 0 }} aria-hidden="true" />
        </div>
      </PageHeader>
```

Note on the chevron's color: it previously came from a `style` prop on the `<svg>` itself. `Chevron` inherits `currentColor`, so the color moves to the wrapping span. This keeps the icon component free of color decisions.

Note on the logo: it keeps the lime brand color, which is correct and is not a violation of the "lime is never an action" rule. The rule forbids lime marking a *primary* action or appearing as a plain button; this is Orbit's brand mark, which happens to be tappable, and the teal "I'm in" on the event card below remains the screen region's single primary action.

- [ ] **Step 3: Verify in the browser**

1. Load a group home. Expected: it looks the same as before, with the header hairline still spanning the full width.
2. Tap the lime "O". Expected: it navigates to `/` (still the scaffold page until Task 7). Confirm the navigation, not the destination.
3. Tap the group title. Expected: group info opens as a client transition, no reload flash. This was the second of the two full-reload links.
4. Confirm the right-pointing chevron beside the title still points right and is still the dimmer secondary color, not the primary text color.
5. Screenshot the group home.

- [ ] **Step 4: Run the suite and the linter**

```bash
npm test && npm run lint
```

- [ ] **Step 5: Commit**

```bash
git add src/app/groups/[id]/page.tsx
git commit -m "Make the Orbit logo the home button it was always described as

CLAUDE.md and build-notes §7 both call the logo top-left the home
button, and it has been an inert div this whole time, because until now
there was nowhere for it to go. With a front door existing, it becomes
a real link.

The header moves into the shared bar, and its three children keep their
own space-between row rather than the bar arranging them. That is the
boundary the whole slice rests on: the bar owns the bar's rules and
nothing about content, so it can never grow an opinion about the title
chevron that opens group info.

The title link also stops being a raw anchor, so the last
full-page-reload hop in the app is now a client transition.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: The front door

Replaces the untouched create-next-app scaffold, whose only links point at nextjs.org and vercel.com, and gives four dead ends one honest destination.

**Files:**
- Modify (full rewrite): `src/app/page.tsx`
- Modify: `src/app/layout.tsx:15-18`

**Interfaces:**
- Consumes: `resolveFrontDoor` and `FrontDoorMembership` from Task 1.
- Produces: nothing.

- [ ] **Step 1: Replace the scaffold page**

Overwrite `src/app/page.tsx` entirely:

```tsx
// src/app/page.tsx
//
// The front door. Session-aware rather than a static landing or a bare
// redirect: a visitor who already belongs to a group is sent straight in, and
// only someone with no group ever sees the copy below.
//
// This is the destination the rest of the navigation slice hangs off. The
// group home's Orbit logo, the not-found screen, and the error screen all
// point here, and it has to be correct whether or not the visitor has ever
// used the product before.
//
// The several-groups case lives in resolveFrontDoor and is a placeholder for
// the multi-group home (build-notes §8), not a designed behavior.
//
// No header: nothing to navigate back to, and the join screen is headerless
// for the same reason (walkthrough screen 05).

import Link from "next/link"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth/current-user"
import { resolveFrontDoor } from "@/lib/nav/front-door"

export default async function HomePage() {
  const viewer = await getCurrentUser()

  const memberships = viewer
    ? await prisma.membership.findMany({
        where: { userId: viewer.id },
        select: { groupId: true, joinedAt: true },
      })
    : []

  const destination = resolveFrontDoor(memberships)

  // redirect() throws to unwind the render, so it must not sit inside a
  // try/catch. It does not here; keep it that way.
  if (destination.kind === "group") {
    redirect(`/groups/${destination.groupId}`)
  }

  return (
    <main
      style={{
        minHeight: "100dvh",
        backgroundColor: "var(--surface-page)",
        color: "var(--text-primary)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1.5rem",
        fontFamily: "var(--font-geist-sans, system-ui, sans-serif)",
      }}
    >
      <div style={{ width: "100%", maxWidth: "28rem" }}>
        <p
          style={{
            fontSize: "var(--type-eyebrow)",
            lineHeight: "var(--leading-normal)",
            color: "var(--text-secondary)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: "0.75rem",
          }}
        >
          Interplanetary Groups
        </p>

        <h1
          style={{
            fontSize: "var(--type-display)",
            lineHeight: "var(--leading-tight)",
            fontWeight: 700,
            marginBottom: "0.75rem",
          }}
        >
          Casual plans shouldn&apos;t need a wedding planner.
        </h1>

        <p
          style={{
            fontSize: "var(--type-body)",
            lineHeight: "var(--leading-normal)",
            color: "var(--text-secondary)",
            marginBottom: "1.75rem",
          }}
        >
          But the other option is &ldquo;show up if you want,&rdquo; and then
          nobody does. Orbit picks a day, asks the group, and keeps track of
          who&apos;s in.
        </p>

        <Link
          href="/create"
          style={{
            display: "block",
            width: "100%",
            padding: "0.75rem 1.5rem",
            backgroundColor: "var(--color-teal)",
            color: "#0a0a0a",
            fontSize: "var(--type-body)",
            fontWeight: 600,
            borderRadius: "0.5rem",
            textAlign: "center",
            textDecoration: "none",
          }}
        >
          Start your group
        </Link>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Give the app its own name in the browser tab**

In `src/app/layout.tsx`, replace the scaffold metadata (currently lines 15-18) with:

```ts
export const metadata: Metadata = {
  title: "Interplanetary Groups",
  description:
    "Casual plans shouldn't need a wedding planner. Orbit picks a day, asks the group, and keeps track of who's in.",
}
```

Change nothing else in that file. It stays a bare `{children}` wrapper: no shared header goes in the root layout, which is what lets the join screen and this front door have no chrome.

- [ ] **Step 3: Verify all three session states in the browser**

1. **No session.** Open the app in a fresh private window at `/`. Expected: the front door, with the eyebrow, the wedding-planner headline, the two-sentence body, and one teal "Start your group." Confirm there is no header.
2. Click "Start your group." Expected: `/create` opens.
3. **Session with a group.** In the window where a group already exists, visit `/`. Expected: it redirects straight to that group's home, and the front-door copy never appears.
4. **The logo round trip.** From that group home, tap the lime "O." Expected: it goes to `/`, which immediately redirects back to the group home. Confirm it lands on the group and does not flash the front door.
5. Confirm the browser tab reads "Interplanetary Groups."
6. Check the console and server logs for errors, particularly any redirect-related warning.
7. Screenshot the front door.

If the several-groups case can be produced in the dev/test database without contriving data, check it too, and say plainly in the report if it was not exercised.

- [ ] **Step 4: Run the suite and the linter**

```bash
npm test && npm run lint
```

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/app/layout.tsx
git commit -m "Build the product's front door

The app's entry point was the untouched create-next-app scaffold, whose
only links point at nextjs.org and vercel.com. Nothing in the product
linked to /create, and the browser tab said 'Create Next App'.

It is session-aware rather than a static landing: someone who already
belongs to a group is sent straight in, so a returning member never
lands on a pitch, and only someone with no group sees the copy. That is
what lets four separate dead ends (the group home's logo, the bad invite
link, not-found, and error) all point at one honest destination that is
correct signed in or not.

The copy holds both halves of the founding complaint rather than only
the organizer half: plans die either because nobody organizes them or
because organizing one casual Sunday turns into a wedding.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: A bad invite link stops being a dead end

Someone who mistypes an invite currently gets one sentence and no way into the product at all.

**Files:**
- Modify: `src/app/join/[inviteToken]/page.tsx:1-54`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing.

- [ ] **Step 1: Add the Link import**

At the top of `src/app/join/[inviteToken]/page.tsx`, above the `prisma` import:

```ts
import Link from "next/link"
```

- [ ] **Step 2: Replace the bad-token branch**

Replace the body of the `if (!group) { ... }` block (currently lines 14-53) with:

```tsx
    return (
      <main
        style={{
          minHeight: "100dvh",
          backgroundColor: "var(--surface-page)",
          color: "var(--text-primary)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem 1.5rem",
          fontFamily: "var(--font-geist-sans, system-ui, sans-serif)",
        }}
      >
        <div style={{ width: "100%", maxWidth: "28rem" }}>
          <p
            style={{
              fontSize: "var(--type-eyebrow)",
              lineHeight: "var(--leading-normal)",
              color: "var(--text-secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: "0.75rem",
            }}
          >
            Invite link
          </p>

          {/* Orbit speaks here, unlike on the not-found and error screens: a
              real person is trying to join a real group, and a warm voice
              genuinely helps.

              A labeled note, not a bubble. CLAUDE.md allows a bubble only
              when the user's next on-screen action responds to Orbit, and
              there is nothing to reply to here, so a bubble would promise a
              conversation that cannot happen. Same treatment as the note on
              walkthrough screen 09. */}
          <div
            style={{
              backgroundColor: "var(--surface-card)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "0.75rem",
              padding: "1.25rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.625rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span
                aria-hidden="true"
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  backgroundColor: "var(--color-lime)",
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: "var(--type-eyebrow)",
                  color: "var(--text-secondary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                A note from Orbit
              </span>
            </div>
            <p
              style={{
                fontSize: "var(--type-body)",
                lineHeight: "var(--leading-normal)",
                color: "var(--text-primary)",
                margin: 0,
              }}
            >
              This invite link isn&apos;t working. Ask whoever sent it to share
              it again and I&apos;ll get you into the group.
            </p>
          </div>

          {/* Points at /create rather than "/" so the label does exactly what
              it says. Step 1 of the wizard now has its own way out, so
              someone who would rather look around first is not trapped.
              Deliberately not teal: what this person wanted was to join a
              group, and teal would oversell a consolation prize. */}
          <Link
            href="/create"
            style={{
              display: "block",
              width: "fit-content",
              margin: "1.25rem auto 0",
              padding: "0.25rem 0.5rem",
              color: "var(--text-secondary)",
              fontSize: "var(--type-meta)",
              lineHeight: "var(--leading-normal)",
              textDecoration: "underline",
            }}
          >
            Start your own group
          </Link>
        </div>
      </main>
    )
```

Note: the lime circle stands in for Orbit's avatar, matching the letter-O placeholder already used on the group home. Orbit's real doodle is owned by the visual-polish pass; do not invent one here.

- [ ] **Step 3: Verify in the browser**

1. Visit `/join/not-a-real-token`. Expected: the "Invite link" eyebrow, a card carrying "A NOTE FROM ORBIT" with a lime dot, the two-sentence note, and an underlined "Start your own group" beneath it. Confirm it is a bordered note card and not a chat bubble shape.
2. Click "Start your own group." Expected: `/create` opens.
3. Visit a real invite link and confirm the working join screen is unchanged, still with no header.
4. Screenshot the bad-token screen.

- [ ] **Step 4: Run the suite and the linter**

```bash
npm test && npm run lint
```

- [ ] **Step 5: Commit**

```bash
git add src/app/join/[inviteToken]/page.tsx
git commit -m "Stop a bad invite link from stranding people outside the product

Someone who mistyped or followed a stale invite got one sentence and no
link anywhere, which is the worst dead end in the app: it is the only
one that hits a person who has never used the product and has no session
to fall back on.

Orbit speaks here, unlike on the not-found and error screens, because a
real person is trying to join a real group and a warm voice earns its
place. It is a labeled note rather than a bubble: CLAUDE.md allows a
bubble only when the next on-screen action responds to Orbit, and there
is nothing here to reply to.

The way out points at /create rather than the front door so the label
does what it says, and it is deliberately not teal, because what this
person wanted was to join a group.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: Create step 1 gets a way out

The founder onboarding flow cannot be exited at all today.

**Files:**
- Modify: `src/app/create/Step1Describe.tsx` (end of the returned JSX)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing.

- [ ] **Step 1: Add the Link import**

At the top of `src/app/create/Step1Describe.tsx`, alongside the existing imports:

```ts
import Link from "next/link"
```

- [ ] **Step 2: Add the exit below the form**

At the very end of the returned JSX, immediately after the closing `</form>` and before the final closing `</div>`, add:

```tsx
      {/* The only exit from onboarding, and it is on step 1 only.
          Steps 2 and 3 already have "Edit my description" for going
          backwards inside the flow; a leave-the-flow link there would
          silently discard everything a founder had entered, which is worse
          than no exit. Because this lives in Step1Describe, which only
          renders on step 1, that constraint is structural rather than a
          conditional somebody can later get wrong.

          Bottom-anchored underlined text, matching this flow's own idiom
          for backwards controls, rather than a bar at the top: the top of
          /create is spoken for by Orbit's avatar and "STEP N OF 3", which
          the onboarding-share-moment slice has to build. */}
      <Link
        href="/"
        style={{
          display: "block",
          width: "fit-content",
          margin: "1rem auto 0",
          padding: "0.25rem 0.5rem",
          color: "var(--text-secondary)",
          fontSize: "var(--type-meta)",
          lineHeight: "var(--leading-normal)",
          textDecoration: "underline",
        }}
      >
        Never mind, take me back
      </Link>
```

- [ ] **Step 3: Verify in the browser**

1. From the front door, click "Start your group." Expected: step 1, with "Never mind, take me back" as underlined text below the hint line.
2. Click it. Expected: it returns to the front door.
3. Type a description and a name, click Continue, and reach the playback step. Expected: the exit link is **not** present on that step, and "Edit my description" still is.
4. Click "Edit my description" to return to step 1. Expected: the exit link is back, and the typed description is preserved.
5. Screenshot step 1.

- [ ] **Step 4: Run the suite and the linter**

```bash
npm test && npm run lint
```

- [ ] **Step 5: Commit**

```bash
git add src/app/create/Step1Describe.tsx
git commit -m "Give founder onboarding a way out of step 1

Once on /create there was no exit at all: no cancel, no back, nothing
linking anywhere else. The only ways out were finishing the flow or the
browser's own back button.

Step 1 only, deliberately. Steps 2 and 3 already go backwards inside the
flow, and a leave-the-flow link there would silently discard a founder's
description and Orbit's extraction with no warning, which is worse than
no exit. Putting the link in Step1Describe, which only renders on step
1, makes that structural instead of a conditional that can drift.

It is bottom-anchored underlined text because that is already this
flow's idiom for going backwards. The top of /create belongs to Orbit's
avatar and 'STEP N OF 3', which the onboarding-share-moment slice has to
build, and squatting there now would spend that slice's decision.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 10: The full walk, and the decision record

A slice is not done until its reasoning is written down, and this slice's central claim ("no dead ends") can only be proven by walking the whole app.

**Files:**
- Modify: `docs/build-notes.md` (§8 register entry, and a new §11 entry)
- Modify: `CLAUDE.md` ("Where the build is" section)

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: Walk the entire product and capture screenshots**

With the dev server running, do this in one pass, in order, capturing a screenshot at each numbered stop:

1. `/` with no session. The front door.
2. `/create`. Step 1, with its exit.
3. Click the exit. Back at the front door.
4. Complete onboarding to create a group. The group home.
5. Tap an event card. Event detail, with its back link.
6. Click back. The group home again.
7. Tap the group title. Group info, with its back link.
8. Click back. The group home again.
9. Tap the lime Orbit logo. It redirects to the group home (because this session now has a group).
10. `/groups/nonexistent-id`. The not-found screen.
11. `/events/nonexistent-id`. The not-found screen.
12. `/join/bad-token`. Orbit's note plus its way out.

Then confirm the claim that motivated the slice: **from every screen above, there is at least one route into the app that is not the browser's back button.**

- [ ] **Step 2: Report honestly, including anything not verified**

Write up what was walked, attach the screenshots, and state plainly anything that could not be exercised (for example the several-groups front-door case if the dev/test data did not permit it, or the error boundary if it was only checked with a temporary throw). "Could not verify" is a complete answer; a confident claim that turns out untrue is not.

- [ ] **Step 3: Update the §8 register entry**

In `docs/build-notes.md`, the bullet titled "**Navigation is missing on most screens, and there is no shared chrome to inherit it from.**" currently records the finding. Add a resolution paragraph at the end of that bullet, in the style of the carousel entry above it (which uses strikethrough plus a "Landed with..." note). State: what shipped, that the shared bar owns the bar's rules and nothing about content, that `/` became a session-aware front door, and the two things left standing (the group home's unbuilt subline and Orbit's real avatar, both owned by the visual-polish pass; the multi-group placeholder in `resolveFrontDoor`).

- [ ] **Step 4: Write the §11 build-log entry**

Add a new entry at the end of `docs/build-notes.md` §11, matching the ADR-style prose of the existing entries. It must answer both "what was this slice about" and "what did it decide along the way." At minimum:

- Why one slice and not five: `layout.tsx` rendered bare `{children}`, so every dead end had one structural cause.
- That rendering all five design crops (rather than assuming they predated these screens) showed the mockups already answered four of six screens, and that event detail's back header was an unbuilt decision rather than a new one.
- The two header shapes the design implies, splitting on hierarchy.
- The bar-owns-the-bar boundary, and the configurable-header alternative that was rejected, with the reason: it is the version that eventually swallows the group home's title chevron.
- Back as a fixed parent link, never history back, and why (arriving from a shared link).
- `/` as a session-aware front door, and why it had to be settled first: four dead ends resolve to it.
- Orbit on the bad invite link but not on the technical failures, and warmth in copy being separate from Orbit's presence.
- That the bad-invite screen is a note rather than a bubble, and that CLAUDE.md's own rule is what caught it.
- The create exit being step 1 only and bottom-anchored, including the rejected top-bar approach and why (it would have forced the wizard to take over the page heading, a visible change to steps 2 and 3 with no navigation value).
- The teal amendment already recorded on 27 July needs no further change; note explicitly that the front door and the two broken screens each carry at most one teal action.
- Debt opened: the multi-group placeholder, a front door with no design source, and the not-found page's inability to distinguish a cancelled event from a wrong URL.
- Debt paid: the repo can now test a component, honestly scoped to the shared pieces rather than the screens.

- [ ] **Step 5: Rewrite the CLAUDE.md "Where the build is" section**

That section is rewritten at each slice boundary. Update it to say navigation is built (front door, back links, route boundaries, shared chrome), and replace the "Next slice" paragraph. The one-bump resurface remains the open item it was, unless the walk surfaced something more urgent. Keep the two "Still missing, and known" items (Orbit cannot read a correction; the carousel's missing active dot) and add the group home's unbuilt subline and Orbit's placeholder avatar if they are not already covered by the visual-polish reference.

- [ ] **Step 6: Run the suite and the linter one last time**

```bash
npm test && npm run lint
```

- [ ] **Step 7: Commit the record**

```bash
git add docs/build-notes.md CLAUDE.md
git commit -m "Record the navigation slice

A slice is not done until its decision record is written, and the
incidental decisions are the ones that resurface later as mysteries.
Captures why this was one problem rather than five, the two header
shapes the design already implied, the bar-owns-the-bar boundary and the
configurable-header alternative it rejected, and every call made in
passing: fixed parent links over history back, Orbit present on a bad
invite but not on a crash, a note rather than a bubble there, and the
create exit being step 1 only.

Also updates the §8 register entry from found to resolved and moves
CLAUDE.md's 'Where the build is' to the new slice boundary.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

- [ ] **Step 8: Open the pull request and stop**

```bash
git push -u origin feat/app-wide-navigation
```

Then open a PR whose description is written in product language, not engineering language: what a person can now do that they could not before, screen by screen, with the screenshots from Step 1. **Do not merge.** The product owner reviews and gives the merge signal.

---

## Notes for the implementer

- **Read before writing, in a subagent.** If you need to understand an area of this codebase beyond what this plan quotes, dispatch a subagent to investigate rather than reading widely in your own context.
- **Do not run the dev server with `npm run dev` in a shell.** Use the preview tooling, which is what the verification steps assume.
- **Screenshots are the deliverable for every visual claim.** Do not report a screen as working on the strength of having read the code. If something could not be rendered, say so.
- **Two design comparisons are required, and only two.** Event detail and group info have designs to match (`docs/design/walkthrough-screens/screens-09-10.png`). The front door, both broken screens, and the create exit have none, so no "matches the design" claim should be made about them.
- **Never grep `docs/walkthrough.html` for mockup copy.** It is JavaScript-packed, so a grep returns nothing whether the line exists or not. Render it if you need it.
