# Visual-Polish Slice One Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt the design system's real palette, typeface, and Orbit mark app-wide, and dress the group home to the approved round-two handoff (carousel chrome, separated-and-washed pending strip, bubble/chip fidelity, header subline, day dividers, tabular numerals, grounded composer).

**Architecture:** The app styles everything with inline `style={{}}` objects reading CSS custom properties from `src/app/globals.css` (the only stylesheet). This slice first rewrites the token layer (names and values) to the design system's vocabulary, then ports per-region values from `docs/design/design-polish-rd-2/` (source-of-truth CSS: `walkthrough.css` overridden by `round4-base.css`; the late "DARK IDENTITY role overrides" block at the bottom of `walkthrough.css` wins over earlier rules in that file). Two new client components carry the only new state: a carousel rail that derives its active dot from scroll position, and the OrbitMark SVG (needs `useId` for its gradient/clip ids).

**Tech Stack:** Next.js 16 App Router, React inline styles + CSS custom properties, Vitest + Testing Library (jsdom via `// @vitest-environment jsdom` pragma on line 1 — there is no setup file and no jest-dom; assert with `toBeDefined()`/`toBe()`), Prisma 7 (read-only here).

## Global Constraints

- Work in place on branch `feat/visual-polish-1`. No worktrees (standing owner rule).
- Build source: `docs/design/design-polish-rd-2/` only. Never load or port `finish-layer.css`. Never build `tint-b`. rd-1 is lineage, not input.
- The strip wash is exactly `rgba(24,188,203,.07)` (`tint-a`).
- No animation anywhere: no new transitions, and the two existing micro-transitions are removed (`MessageFeed.tsx` optimistic opacity transition, `ChatInput.tsx` send-arrow color transition).
- Typeface is Geist everywhere (owner's recorded decision; the handoff's Hanken Grotesk / Inter are prototype fonts and are NOT loaded). Port weights/sizes, not families.
- Teal (`--action` `#18bccb`) marks actions that genuinely matter; lime (`--lime` `#a4ef4e`) is Orbit's brand, never an action. Type floor 13px (`--type-eyebrow`); rem sizes; unitless line-heights. Layout grows with content, never clips.
- Everything renders in the group's timezone, never viewer-local (day dividers included).
- No em dashes in any Orbit-voiced copy. Three-letter weekday abbreviations in schedule copy.
- Preserve aria contracts: `aria-label="Orbit"` on marks, `aria-label="Home"` on the header home button — existing tests query by these labels.
- Baseline: 73 test files, 778 tests, all green; lint baseline on main is fifteen errors (thirteen in `docs/design/*.jsx`, one each in `OnboardingWizard.tsx` and `ResetInviteLink.tsx`) — do not fix them silently, do not add to them.
- Run `npm test` (full suite) before claiming a task done if the task touched anything imported by tests; `npx tsc --noEmit` must stay clean.
- Commit after every task with a product-language message.

**Token rename map (used by Tasks 1-2, referenced throughout):**

| Old token | New token | New value |
|---|---|---|
| `--surface-page` | `--surface-base` | `#15161e` |
| `--surface-card` | `--surface-raised` | `#262b37` |
| `--surface-input` | `--surface-raised` | `#262b37` |
| `--surface-orbit` | `--surface-raised` | `#262b37` |
| `--surface-bubble-member` | `--surface-base` | `#15161e` |
| `--surface-self` | `--surface-self` (kept) | `#363c4b` |
| `--border-subtle` | `--hairline` | `#454c5e` |
| `--text-primary` | `--text-primary` (kept) | `#ECEDF2` |
| `--text-secondary` | `--text-secondary` (kept) | `#A7AAB6` |
| `--text-placeholder` | `--placeholder` | `#8c91a0` |
| (new) | `--text-faint` | `#6F7280` |
| `--color-teal` | `--action` | `#18bccb` |
| `--color-teal-hover` | (delete; if any usage is found, map it to `--action`) | — |
| (new) | `--action-ink` | `#0a2125` |
| `--color-lime` | `--lime` | `#a4ef4e` |
| (new) | `--lime-ink` | `#233006` |
| `--background`, `--foreground` | (delete scaffold tokens) | — |

Note on the design CSS's alias names: in `walkthrough.css`, `--ink` = `--text-primary`, `--ink-soft` and `--ink-faint` both = `#A7AAB6` = `--text-secondary` (the comment "retired dim gray → now secondary" is deliberate), `--stroke` and `--stroke-strong` both = `#454c5e` = `--hairline`, `--paper` = `--surface-base`, `--fill` = `--surface-raised`, `--accent` = `--action`. When a port below quotes a rule using those names, translate with this table.

---

### Task 1: Rewrite the token layer — real palette, dark default, Geist body

**Files:**
- Modify: `src/app/globals.css` (full rewrite, content below)

**Interfaces:**
- Consumes: nothing.
- Produces: the token names in the rename map above, consumed by every later task. Also the utility class `.scrollbar-hidden` (Task 5) — the one thing inline styles cannot express (`::-webkit-scrollbar`).

- [ ] **Step 1: Replace the entire contents of `src/app/globals.css` with:**

```css
@import "tailwindcss";

:root {
  color-scheme: dark;

  /* ===== Dark identity tokens =====
     Source of truth: docs/design/design-polish-rd-2/walkthrough.css :root
     (adopted by the visual-polish pass, 11 Aug 2026). Dark is the default,
     not a media-query branch. */
  --surface-base: #15161e;
  --surface-raised: #262b37;
  --surface-self: #363c4b;   /* viewer's own bubble; strongest fill, never teal */
  --hairline: #454c5e;
  --text-primary: #ECEDF2;
  --text-secondary: #A7AAB6;
  --placeholder: #8c91a0;    /* empty-field text */
  --text-faint: #6F7280;     /* eyebrows, incidental chrome */
  --lime: #a4ef4e;           /* Orbit brand — never an action */
  --lime-ink: #233006;
  --action: #18bccb;         /* teal: an action that genuinely matters */
  --action-ink: #0a2125;

  /* Type scale (rem values honor device text size; unitless line-heights) */
  --type-display:  1.75rem;   /* 28px */
  --type-title:    1.5rem;    /* 24px */
  --type-heading:  1.25rem;   /* 20px */
  --type-body:     1.0625rem; /* 17px — raised base */
  --type-meta:     0.9375rem; /* 15px */
  --type-label:    0.875rem;  /* 14px */
  --type-eyebrow:  0.8125rem; /* 13px — hard floor */

  --leading-tight:  1.15;
  --leading-normal: 1.5;
}

@theme inline {
  --color-background: var(--surface-base);
  --color-foreground: var(--text-primary);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

body {
  background: var(--surface-base);
  color: var(--text-primary);
  font-family: var(--font-geist-sans), system-ui, sans-serif;
}

/* The one thing inline styles cannot express: WebKit scrollbar hiding for
   the carousel rail (Firefox is covered by inline scrollbarWidth). */
.scrollbar-hidden::-webkit-scrollbar { display: none; }
```

- [ ] **Step 2: Verify the app still compiles and the suite is untouched**

Run: `npx tsc --noEmit && npm test`
Expected: tsc clean; 73 files / 778 tests pass. (Old token names are now undefined — screens will render with fallback/inherited colors until Task 2 lands. That is fine mid-branch; Tasks 1 and 2 land back to back and Task 2's step 4 is the rendered check.)

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "Adopt the design system's palette and make dark the real default"
```

---

### Task 2: Token rename sweep and font de-duplication

**Files:**
- Modify: every file under `src/` that references an old token name (36 files use inline styles; the sweep is grep-driven, not from memory)

**Interfaces:**
- Consumes: Task 1's tokens.
- Produces: a codebase where only new token names exist; later tasks style against them.

- [ ] **Step 1: Sweep the renames mechanically, one old token at a time**

For each row of the rename map (Global Constraints), run a repo grep and replace every usage in `src/`:

```bash
grep -rln -- "--surface-page\|--surface-card\|--surface-input\|--surface-orbit\|--surface-bubble-member\|--border-subtle\|--text-placeholder\|--color-teal\|--color-lime\|var(--background)\|var(--foreground)" src/
```

Replace per the map (`--surface-input` → `--surface-raised`, `--text-placeholder` → `--placeholder`, `--color-teal` → `--action`, `--color-lime` → `--lime`, etc.). `--color-teal-hover` should have zero usages; if grep finds one, replace with `--action`.

- [ ] **Step 2: Remove the eight duplicated per-root font declarations**

The body now owns the family. Delete the `fontFamily: "var(--font-geist-sans, system-ui, sans-serif)"` line from all eight page roots:
`src/app/page.tsx:53`, `src/app/create/page.tsx:22`, `src/app/groups/[id]/page.tsx:216`, `src/app/groups/[id]/info/page.tsx:82`, `src/app/events/[id]/page.tsx:76`, `src/app/join/[inviteToken]/JoinForm.tsx:29`, `src/components/OrbitNoteScreen.tsx:33`, `src/components/DeadEndScreen.tsx:32`.

- [ ] **Step 3: Prove the sweep is complete**

Run: `grep -rn -- "--surface-page\|--surface-card\|--surface-input\|--surface-orbit\|--surface-bubble-member\|--border-subtle\|--text-placeholder\|--color-teal\|--color-lime" src/ | wc -l`
Expected: `0`

Run: `npx tsc --noEmit && npm test`
Expected: clean; 73 / 778 pass.

- [ ] **Step 4: Rendered smoke check**

Start the dev server, open the group home (dev-test DB group), and confirm: dark background `#15161e` family everywhere, Geist rendering (compare a heading against Arial by eye — Geist's single-story "g" is the tell), no white flash, form controls dark. This is a smoke check, not the fidelity pass.

- [ ] **Step 5: Commit**

```bash
git add -A src/
git commit -m "Move every screen onto the design system's token names"
```

---

### Task 3: OrbitMark — the real face, one shared component

**Files:**
- Create: `src/components/OrbitMark.tsx`
- Test: `src/components/__tests__/OrbitMark.test.tsx`
- Modify: `src/components/OrbitBubble.tsx:18-35`, `src/app/groups/[id]/page.tsx:243-263`, `src/components/WizardHeader.tsx:43-60`, `src/app/create/OrbitPause.tsx:16-33`, `src/app/create/StepGapAsk.tsx:63-84`, `src/app/create/Step2Playback.tsx:90-108`, `src/components/OrbitNoteScreen.tsx:71-88`

**Interfaces:**
- Consumes: nothing.
- Produces: `OrbitMark({ size, label }: { size: number; label?: string | null })` — `size` is the avatar slot in px; `label` defaults to `"Orbit"`; pass `label={null}` for decorative (`aria-hidden`) placements. The SVG overflows the slot by design (156%, per walkthrough.css `.orbit-mark`), so parents must NOT set `overflow: hidden` on the slot.

- [ ] **Step 1: Write the failing test**

`src/components/__tests__/OrbitMark.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { OrbitMark } from "@/components/OrbitMark"

afterEach(cleanup)

describe("OrbitMark", () => {
  it("renders an accessible image labeled Orbit by default", () => {
    render(<OrbitMark size={28} />)
    expect(screen.getByLabelText("Orbit")).toBeDefined()
  })

  it("is decorative when label is null", () => {
    const { container } = render(<OrbitMark size={20} label={null} />)
    expect(screen.queryByRole("img")).toBeNull()
    const slot = container.firstElementChild as HTMLElement
    expect(slot.getAttribute("aria-hidden")).toBe("true")
  })

  it("renders two marks without colliding SVG defs ids", () => {
    const { container } = render(<><OrbitMark size={28} /><OrbitMark size={28} /></>)
    const ids = Array.from(container.querySelectorAll("radialGradient")).map((g) => g.id)
    expect(ids.length).toBe(2)
    expect(new Set(ids).size).toBe(2)
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/components/__tests__/OrbitMark.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/components/OrbitMark.tsx`**

Ported from `docs/design/design-polish-rd-2/orbit-mark.js` (the approved mark: lime planet, open smile with coral tongue, blue cheek, blue moon on a thin orbit path). The moon position is precomputed from that file's geometry (`rx 106, ry 42, rot -18°, theta -52°` → `mx 185.26, my 86.90`). `useId` replaces the file's mutable counter so SSR and hydration agree.

```tsx
"use client"

import { useId } from "react"

// Orbit's mark, ported from docs/design/design-polish-rd-2/orbit-mark.js.
// The sphere is centred in the 240 viewBox; the moon and orbit path overflow
// the avatar slot uncropped (slot stays transparent, overflow visible).
const LIME = "#a4ef4e"
const LIME_HI = "#c2f878"
const LIME_SH = "#8ad53b"
const INK = "#181c12"
const BLUE = "#45a6ff"
const EYE = "#1c2218"
const CORAL = "#ff8f7a"
const PATH = "#8b99ad"

const CX = 120
const LX = 96
const RX = 144
const EY = 116
const ER = 16
const MT = 136
const MOUTH = `M${CX - 20} ${MT} L${CX + 20} ${MT} A 20 22 0 0 1 ${CX - 20} ${MT} Z`
const MOON_X = 185.26
const MOON_Y = 86.9

export function OrbitMark({ size, label = "Orbit" }: { size: number; label?: string | null }) {
  const uid = useId()
  const gid = `osph${uid}`
  const cid = `omc${uid}`
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label ?? undefined}
      aria-hidden={label ? undefined : true}
      style={{
        position: "relative",
        display: "inline-flex",
        width: size,
        height: size,
        flexShrink: 0,
      }}
    >
      <svg
        viewBox="0 0 240 240"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: "156%",
          height: "156%",
          transform: "translate(-50%, -50%)",
          display: "block",
          pointerEvents: "none",
        }}
      >
        <defs>
          <radialGradient id={gid} cx="38%" cy="32%" r="75%">
            <stop offset="0%" stopColor={LIME_HI} />
            <stop offset="55%" stopColor={LIME} />
            <stop offset="100%" stopColor={LIME_SH} />
          </radialGradient>
          <clipPath id={cid}>
            <path d={MOUTH} />
          </clipPath>
        </defs>
        <g transform="rotate(-18 120 120)">
          <ellipse cx={120} cy={120} rx={106} ry={42} fill="none" stroke={PATH} strokeWidth={4.5} />
        </g>
        <circle cx={120} cy={120} r={74} fill={`url(#${gid})`} stroke={INK} strokeWidth={9} />
        <circle cx={92} cy={86} r={7} fill="#eaffc9" opacity={0.85} />
        <circle cx={LX} cy={EY} r={ER} fill={EYE} />
        <circle cx={RX} cy={EY} r={ER} fill={EYE} />
        <circle cx={LX + 5.5} cy={EY - 6.5} r={5.5} fill="#fff" />
        <circle cx={RX + 5.5} cy={EY - 6.5} r={5.5} fill="#fff" />
        <circle cx={LX - 13} cy={EY + 13} r={5} fill={BLUE} />
        <path d={MOUTH} fill={EYE} />
        <g clipPath={`url(#${cid})`}>
          <ellipse cx={CX} cy={MT + 22} rx={14} ry={11} fill={CORAL} />
        </g>
        <path d={MOUTH} fill="none" stroke={INK} strokeWidth={6} strokeLinejoin="round" />
        <g transform="rotate(-18 120 120)">
          <circle cx={MOON_X} cy={MOON_Y} r={13.5} fill={BLUE} stroke={INK} strokeWidth={6} />
        </g>
      </svg>
    </span>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/__tests__/OrbitMark.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Swap all seven letter-"O" sites**

Replace each lime-circle-with-letter-"O" block with `<OrbitMark />`, deleting the old circle styles. The slot must be transparent with no border and no `overflow: hidden` (walkthrough.css late override: avatar slots go `background: transparent; border: none; overflow: visible`).

| Site | Replacement | Notes |
|---|---|---|
| `src/components/OrbitBubble.tsx` avatar | `<OrbitMark size={28} />` | keeps `getByLabelText("Orbit")` green |
| `src/app/groups/[id]/page.tsx` header home button | `<OrbitMark size={28} label={null} />` inside the existing `<Link href="/" aria-label="Home">` | the Link keeps `aria-label="Home"`; the mark inside is decorative |
| `src/components/WizardHeader.tsx` | `<OrbitMark size={36} />` | keeps its test green |
| `src/app/create/OrbitPause.tsx` | `<OrbitMark size={28} label={null} />` | was `aria-hidden` |
| `src/app/create/StepGapAsk.tsx` (`OrbitAvatar`) | `<OrbitMark size={28} />`; keep the wrapper's `marginTop: "0.25rem"` on a wrapping span or pass via parent layout | used twice |
| `src/app/create/Step2Playback.tsx` | `<OrbitMark size={28} />`; keep `marginTop: "0.25rem"` | |
| `src/components/OrbitNoteScreen.tsx` | `<OrbitMark size={20} label={null} />` | was `aria-hidden` |

Leave alone: the group emblem on the info page and `RosterAvatar` (they are not Orbit; walkthrough keeps them flat lime / initials).

- [ ] **Step 6: Full suite + typecheck**

Run: `npx tsc --noEmit && npm test`
Expected: clean; all tests pass (OrbitBubble, WizardHeader, OrbitNoteScreen tests exercise the swapped sites).

- [ ] **Step 7: Rendered check**

Dev server: confirm the mark renders in the group-home header, a chat bubble, and the onboarding header; confirm the moon overflows without being clipped.

- [ ] **Step 8: Commit**

```bash
git add -A src/
git commit -m "Give Orbit its real face everywhere the letter O stood in"
```

---

### Task 4: Group-home header — heading-weight name and the designed subline

**Files:**
- Create: `src/app/groups/[id]/GroupHomeHeader.tsx`
- Test: `src/app/groups/[id]/__tests__/GroupHomeHeader.test.tsx`
- Modify: `src/app/groups/[id]/page.tsx:233-293` (replace the inline header content with the new component; pass a real member count)

**Interfaces:**
- Consumes: `OrbitMark` (Task 3), `Chevron` (`src/components/Chevron.tsx`), `PageHeader` stays the wrapper in `page.tsx`.
- Produces: `GroupHomeHeader({ groupId, groupName, memberCount }: { groupId: string; groupName: string; memberCount: number })` — a server-compatible component rendering the three-child header row.

- [ ] **Step 1: Write the failing test**

`src/app/groups/[id]/__tests__/GroupHomeHeader.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { GroupHomeHeader } from "@/app/groups/[id]/GroupHomeHeader"

afterEach(cleanup)

describe("GroupHomeHeader", () => {
  it("renders the group name and the members subline inside the info link", () => {
    render(<GroupHomeHeader groupId="g1" groupName="Climbing Crew" memberCount={8} />)
    expect(screen.getByText("Climbing Crew")).toBeDefined()
    expect(screen.getByText("8 members · group info & invite link")).toBeDefined()
    const link = screen.getByRole("link", { name: /Climbing Crew/ })
    expect(link.getAttribute("href")).toBe("/groups/g1/info")
  })

  it("uses the singular for a group of one", () => {
    render(<GroupHomeHeader groupId="g1" groupName="Solo" memberCount={1} />)
    expect(screen.getByText("1 member · group info & invite link")).toBeDefined()
  })

  it("keeps the home button labeled Home", () => {
    render(<GroupHomeHeader groupId="g1" groupName="Climbing Crew" memberCount={8} />)
    const home = screen.getByLabelText("Home")
    expect(home.getAttribute("href")).toBe("/")
  })
})
```

- [ ] **Step 2: Run it to verify it fails** (module not found).

- [ ] **Step 3: Implement `GroupHomeHeader.tsx`**

Move the existing three-child `space-between` row out of `page.tsx` verbatim, then apply the design values (walkthrough.css `.gh-name`, `.gh-sub`, translated: Geist stays the family):

- Home button: existing `<Link href="/" aria-label="Home">` with `<OrbitMark size={28} label={null} />`; drop the old lime-circle styles (transparent slot).
- Title block (inside the existing `<Link href={`/groups/${groupId}/info`}>`): name `fontSize: "var(--type-heading)"`, `fontWeight: 800`, `letterSpacing: "-.01em"`, `lineHeight: "var(--leading-tight)"`, `color: "var(--text-primary)"`, `whiteSpace: "nowrap"`, followed by the existing `<Chevron direction="right" />` at 16px, `color: "var(--text-secondary)"`.
- Subline under the name row, still inside the link: `` {`${memberCount} ${memberCount === 1 ? "member" : "members"} · group info & invite link`} `` with `fontSize: "var(--type-eyebrow)"`, `color: "var(--text-secondary)"`, `fontWeight: 500`, `marginTop: 2`, `letterSpacing: ".02em"`.
- Balancing spacer: `width: 28` as today.

- [ ] **Step 4: Wire the member count in `page.tsx`**

The count is current members only. Reuse the info page's counting source (`src/app/groups/[id]/info/page.tsx` derives `memberCount` from the group's memberships) — if the group-home query does not already include memberships, add `prisma.membership.count({ where: { groupId } })` alongside the existing reads in `page.tsx` rather than widening the group include. Replace `page.tsx:233-293` with `<GroupHomeHeader groupId={group.id} groupName={group.name} memberCount={memberCount} />` inside the existing `<PageHeader>`.

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run "src/app/groups/[id]/__tests__/GroupHomeHeader.test.tsx" && npx tsc --noEmit`
Expected: PASS; clean. Then `npm test` — all green.

- [ ] **Step 6: Commit**

```bash
git add -A src/
git commit -m "Header says who the group is: heading-weight name plus the members subline"
```

---

### Task 5: Carousel chrome — peek geometry and the active dot

**Files:**
- Create: `src/app/groups/[id]/CarouselRail.tsx`
- Test: `src/app/groups/[id]/__tests__/CarouselRail.test.tsx`
- Modify: `src/app/groups/[id]/EventCarousel.tsx`, `src/app/groups/[id]/page.tsx:296` (region padding)

**Interfaces:**
- Consumes: `EventCard` server-rendered children (server components pass as `children` into a client component — this is the supported pattern).
- Produces: `CarouselRail({ cardCount, children }: { cardCount: number; children: React.ReactNode })` and the exported pure helper `snappedIndex(scrollLeft: number, cardWidth: number, gap: number): number`.

Target values (round4-base.css, which overrides walkthrough.css here): multi-card region drops its side padding and the rail carries the gutter (`.gh-rail.peek { padding: 0 16px }`), card slot `flex: 0 0 calc(100% - 16px)`, `gap: 10px`, `scroll-snap-type: x mandatory`, `scroll-padding-left: 16px`, scrollbars hidden both engines. Dots: container `gap: 6px; padding-top: 11px`, inactive `6×6, border-radius: 3px, var(--hairline)`, active `17×6` pill `var(--text-primary)`, no transition, `aria-hidden`. Single card: full width, no dots, no peek. The peeking card is never dimmed, masked, or scaled.

- [ ] **Step 1: Write the failing test**

`src/app/groups/[id]/__tests__/CarouselRail.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { CarouselRail, snappedIndex } from "@/app/groups/[id]/CarouselRail"

afterEach(cleanup)

describe("snappedIndex", () => {
  it("maps scroll positions to the nearest snapped card", () => {
    // 342px card + 10px gap on a 390px screen (handoff geometry)
    expect(snappedIndex(0, 342, 10)).toBe(0)
    expect(snappedIndex(352, 342, 10)).toBe(1)
    expect(snappedIndex(340, 342, 10)).toBe(1) // nearly there rounds forward
    expect(snappedIndex(170, 342, 10)).toBe(0) // under halfway rounds back
    expect(snappedIndex(704, 342, 10)).toBe(2)
  })

  it("is safe at zero width", () => {
    expect(snappedIndex(120, 0, 10)).toBe(0)
  })
})

describe("CarouselRail", () => {
  it("renders one dot per card with the first active", () => {
    const { container } = render(
      <CarouselRail cardCount={3}>
        <div>a</div>
        <div>b</div>
        <div>c</div>
      </CarouselRail>
    )
    const dots = container.querySelectorAll("[data-dot]")
    expect(dots.length).toBe(3)
    expect((dots[0] as HTMLElement).style.width).toBe("17px")
    expect((dots[1] as HTMLElement).style.width).toBe("6px")
  })

  it("renders no dots for a single card", () => {
    const { container } = render(
      <CarouselRail cardCount={1}>
        <div>a</div>
      </CarouselRail>
    )
    expect(container.querySelectorAll("[data-dot]").length).toBe(0)
  })
})
```

- [ ] **Step 2: Run it to verify it fails** (module not found).

- [ ] **Step 3: Implement `CarouselRail.tsx`**

```tsx
"use client"

import { useRef, useState } from "react"

// One swipe per card; the active dot is derived from scroll position, so it
// can never disagree with what is actually snapped. Dots are chrome, not a
// control surface (handoff item 02): swipe is the interaction.
export function snappedIndex(scrollLeft: number, cardWidth: number, gap: number): number {
  const step = cardWidth + gap
  if (step <= 0) return 0
  return Math.round(scrollLeft / step)
}

export function CarouselRail({ cardCount, children }: { cardCount: number; children: React.ReactNode }) {
  const [active, setActive] = useState(0)
  const railRef = useRef<HTMLDivElement>(null)
  const peek = cardCount > 1

  const handleScroll = () => {
    const rail = railRef.current
    if (!rail) return
    const card = rail.firstElementChild as HTMLElement | null
    const width = card ? card.offsetWidth : 0
    const index = Math.min(cardCount - 1, Math.max(0, snappedIndex(rail.scrollLeft, width, 10)))
    setActive(index)
  }

  return (
    <div>
      <div
        ref={railRef}
        onScroll={peek ? handleScroll : undefined}
        className={peek ? "scrollbar-hidden" : undefined}
        style={{
          display: "flex",
          gap: "0.625rem",
          overflowX: peek ? "auto" : "visible",
          scrollSnapType: peek ? "x mandatory" : undefined,
          scrollPaddingLeft: peek ? 16 : undefined,
          padding: peek ? "0 16px" : undefined,
          scrollbarWidth: peek ? "none" : undefined,
        }}
      >
        {children}
      </div>
      {peek ? (
        <div
          aria-hidden="true"
          style={{ display: "flex", justifyContent: "center", gap: 6, paddingTop: 11 }}
        >
          {Array.from({ length: cardCount }, (_, i) => (
            <i
              key={i}
              data-dot
              style={{
                width: i === active ? 17 : 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: i === active ? "var(--text-primary)" : "var(--hairline)",
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes.**

- [ ] **Step 5: Rewire `EventCarousel.tsx` and the region padding**

`EventCarousel.tsx` (stays a server component) renders `<CarouselRail cardCount={events.length}>` and, per card, a slot `<div style={{ flex: single ? "1 0 100%" : "0 0 calc(100% - 16px)", minWidth: 0, scrollSnapAlign: "start" }}>` around each `EventCard`. Delete the old inline rail + dots (`EventCarousel.tsx:51-103`) and the stale interim-chrome comment at `:14-20`, replacing it with one line pointing at the handoff. In `page.tsx:296`, the pinned region's side padding must drop in the multi-card case so the rail can bleed: `padding: multi ? "0.75rem 0 0" : "0.75rem 1rem 0"` where `multi = events.length > 1` (the bottom padding changes again in Task 6).

- [ ] **Step 6: Full suite + typecheck + rendered check**

Run: `npx tsc --noEmit && npm test` — clean, all green.
Dev server with a 2-3 event group: 22px of next card peeking at the screen edge, snap per card, dots reflect the snapped card with no transition, single-card group shows full-width card and no dots.

- [ ] **Step 7: Commit**

```bash
git add -A src/
git commit -m "Finish the carousel chrome: real peek and a dot that knows where you are"
```

---

### Task 6: Pending strip — separation geometry plus the teal wash

**Files:**
- Modify: `src/app/groups/[id]/PendingStrip.tsx:338-358` (strip button styles), `src/app/groups/[id]/page.tsx` (pinned-region bottom padding), `src/app/groups/[id]/MessageFeed.tsx:113-122` (feed top padding when the strip sits above)

**Interfaces:**
- Consumes: tokens from Task 1.
- Produces: `MessageFeed` gains an optional prop `stripAbove?: boolean` (default false), passed from `GroupHome.tsx` (which receives it from `page.tsx`, which knows whether `pending` rendered).

Target values (round4-base.css items 03 + 03b, pending-surface.css base): strip `margin: 0; padding: 12px 20px; gap: 11px; width: 100%`, top/bottom hairlines run edge to edge, `background-color: rgba(24,188,203,.07)` (tint-a — never tint-b), no fill promotion, no radius, no border box, no shadow. Pinned region below the card: `padding-bottom: 14px` (`.gh-pinned.pd-above`). Feed below the strip: `padding-top: 6px`. Counts stay the only `--text-primary` weight-700 text; add `fontVariantNumeric: "tabular-nums"` to the count line. Clock icon stays `--text-secondary`; chevron moves to `--text-faint` (it was on the placeholder token).

- [ ] **Step 1: Apply the strip geometry and wash in `PendingStrip.tsx`**

On the collapsed strip button (`:338-358`): replace `width: "calc(100% - 2rem)"; margin: "0 1rem"` with `width: "100%"; margin: 0`; `padding: "11px 2px"` → `"12px 20px"`; `gap: "10px"` → `"11px"`; `background: "var(--surface-page)"` (now `--surface-base` after the sweep) → `backgroundColor: "rgba(24,188,203,.07)"` with a comment naming it tint-a from the decision record. Keep both hairlines (`1px solid var(--hairline)`). Chevron color → `var(--text-faint)`. On the count text container (`:361-399`): add `fontVariantNumeric: "tabular-nums"`.

- [ ] **Step 2: The air above and the feed below**

In `page.tsx`, when `pending` renders, the pinned region's bottom padding becomes 14px (combined with Task 5's side-padding logic: `padding: `0.75rem ${multi ? 0 : "1rem"} ${pending ? "14px" : 0}``). In `MessageFeed.tsx`, accept `stripAbove?: boolean` and set the container's top padding to `stripAbove ? 6 : undefined` (the rest of the feed padding changes in Task 8; here only the 6px rule lands). Thread the prop through `GroupHome.tsx`.

- [ ] **Step 3: Full suite + typecheck**

Run: `npx tsc --noEmit && npm test`
Expected: clean; the existing `PendingStrip.test.tsx` (behavioral: counts, open/close, rows) stays green untouched. If any assertion breaks, the change was more than style — stop and re-read.

- [ ] **Step 4: Rendered check**

Dev server with pending items: the band runs edge to edge with a just-visible teal cast, contents align with the chat's 20px gutter (not the card's 16px), clear air below the card, the card still the only raised/bordered/shadowed object, expanded panel unchanged and un-washed.

- [ ] **Step 5: Commit**

```bash
git add -A src/
git commit -m "The pending strip reads as its own element: full bleed, feed gutter, tint-a wash"
```

---

### Task 7: Day dividers in the feed, in group time

**Files:**
- Create: `src/lib/messages/day-groups.ts`
- Test: `src/lib/messages/__tests__/day-groups.test.ts`
- Modify: `src/app/groups/[id]/MessageFeed.tsx` (render groups), `src/app/groups/[id]/GroupHome.tsx` + `src/app/groups/[id]/page.tsx` (thread the group's timezone if MessageFeed does not already receive it)

**Interfaces:**
- Consumes: the group's IANA timezone string (already stored on the group; page.tsx has the group row).
- Produces:

```ts
export type DayGroup<T> = { key: string; label: string; messages: T[] }
export function groupMessagesByDay<T extends { createdAt: Date | string }>(
  messages: T[],
  timeZone: string,
  now: Date
): DayGroup<T>[]
```

Labels: `"Today"`, `"Yesterday"`, else three-letter weekday + short date (`"Mon, Jul 27"`), all computed in `timeZone`, never viewer-local. The handoff draws only "Today" (`.gh-day`); the older-day labels follow the standing three-letter-weekday rule and are named as a copy choice in the PR.

- [ ] **Step 1: Write the failing test**

`src/lib/messages/__tests__/day-groups.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { groupMessagesByDay } from "@/lib/messages/day-groups"

const msg = (id: string, iso: string) => ({ id, createdAt: new Date(iso) })

describe("groupMessagesByDay", () => {
  // Group in Chicago (UTC-5 in August). "Now" is the evening of Mon 10 Aug 2026 there.
  const tz = "America/Chicago"
  const now = new Date("2026-08-11T01:30:00Z") // Mon 10 Aug, 8:30pm in Chicago

  it("splits messages on the group's day boundary, not UTC's", () => {
    const groups = groupMessagesByDay(
      [
        msg("a", "2026-08-10T02:00:00Z"), // Sun 9 Aug 9pm Chicago — UTC already Monday
        msg("b", "2026-08-10T14:00:00Z"), // Mon 10 Aug 9am Chicago
      ],
      tz,
      now
    )
    expect(groups.length).toBe(2)
    expect(groups[0].label).toBe("Yesterday")
    expect(groups[0].messages.map((m) => m.id)).toEqual(["a"])
    expect(groups[1].label).toBe("Today")
    expect(groups[1].messages.map((m) => m.id)).toEqual(["b"])
  })

  it("labels older days with a three-letter weekday and short date", () => {
    const groups = groupMessagesByDay([msg("a", "2026-07-27T17:00:00Z")], tz, now)
    expect(groups[0].label).toBe("Mon, Jul 27")
  })

  it("keeps one group for messages on the same group-local day", () => {
    const groups = groupMessagesByDay(
      [msg("a", "2026-08-10T13:00:00Z"), msg("b", "2026-08-10T23:00:00Z")],
      tz,
      now
    )
    expect(groups.length).toBe(1)
  })

  it("accepts string timestamps (client-serialized rows)", () => {
    const groups = groupMessagesByDay([{ id: "a", createdAt: "2026-08-10T14:00:00Z" }], tz, now)
    expect(groups[0].label).toBe("Today")
  })
})
```

- [ ] **Step 2: Run it to verify it fails** (module not found).

- [ ] **Step 3: Implement `day-groups.ts`**

```ts
// Day dividers render in the group's timezone, never the viewer's — the
// feed is a shared surface and "Today" must mean the same day to everyone
// in the group's own terms (CLAUDE.md, time rules).
export type DayGroup<T> = { key: string; label: string; messages: T[] }

function dayKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

function dayLabel(date: Date, timeZone: string, now: Date): string {
  const key = dayKey(date, timeZone)
  if (key === dayKey(now, timeZone)) return "Today"
  const dayBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  if (key === dayKey(dayBefore, timeZone)) return "Yesterday"
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
  return `${get("weekday")}, ${get("month")} ${get("day")}`
}

export function groupMessagesByDay<T extends { createdAt: Date | string }>(
  messages: T[],
  timeZone: string,
  now: Date
): DayGroup<T>[] {
  const groups: DayGroup<T>[] = []
  for (const message of messages) {
    const created = message.createdAt instanceof Date ? message.createdAt : new Date(message.createdAt)
    const key = dayKey(created, timeZone)
    const last = groups[groups.length - 1]
    if (last && last.key === key) {
      last.messages.push(message)
    } else {
      groups.push({ key, label: dayLabel(created, timeZone, now), messages: [message] })
    }
  }
  return groups
}
```

Note: the "Yesterday" check via `now - 24h` is correct across DST edges for labeling purposes because both sides go through `dayKey` in the group's zone; a DST-day being 23/25 hours long still lands `now - 24h` inside the adjacent calendar day except at exact-midnight edge times, which the tests do not promise. Do not add machinery for it.

- [ ] **Step 4: Run the test to verify it passes.**

- [ ] **Step 5: Render dividers in `MessageFeed.tsx`**

Group the message list with `groupMessagesByDay(messages, timezone, new Date())` and render, per group, a centered divider followed by that group's rows:

```tsx
<div
  style={{
    textAlign: "center",
    fontSize: "var(--type-eyebrow)",
    letterSpacing: ".12em",
    textTransform: "uppercase",
    color: "var(--text-secondary)",
    fontWeight: 700,
    padding: "12px 0 4px",
  }}
>
  {group.label}
</div>
```

Thread `timezone: string` from `page.tsx` → `GroupHome.tsx` → `MessageFeed.tsx` if not already present. SYSTEM lines and optimistic messages stay inside their day groups in feed order (an optimistic message is always "Today"). The empty-feed state renders no divider.

- [ ] **Step 6: Full suite + typecheck + rendered check**

Run: `npx tsc --noEmit && npm test` — clean, green (the existing `MessageFeed.test.tsx` SYSTEM case must still pass; it now renders under a "Today" divider, which does not break its text assertions).
Dev server: seed messages across two days (dev-test DB) and confirm the divider sits between them, uppercase, centered.

- [ ] **Step 7: Commit**

```bash
git add -A src/
git commit -m "The feed marks its days, in the group's own time"
```

---

### Task 8: Chat voices, chips, and tallies to walkthrough fidelity

**Files:**
- Modify: `src/components/OrbitBubble.tsx`, `src/app/groups/[id]/MessageFeed.tsx`, `src/app/groups/[id]/GaugeChips.tsx`, `src/app/groups/[id]/GroupProposalChips.tsx`, `src/app/groups/[id]/ProposalChips.tsx`

**Interfaces:**
- Consumes: `OrbitMark` (Task 3), `stripAbove` prop (Task 6), day groups (Task 7).
- Produces: nothing new — style fidelity only. Existing behavioral tests must pass unchanged; if one fails, the change went beyond style.

Target values (walkthrough.css with its late dark-identity overrides applied; translate alias tokens per the Global Constraints table):

| Element | Target |
|---|---|
| Feed container (`.gh-feed`) | `padding: "4px 20px 0"` (top 6px when `stripAbove`, Task 6); remove the container `gap` — spacing moves to rows |
| Orbit row (`.gh-msgrow`) | avatar + bubble, `gap: 9px`, `alignItems: "flex-end"`, `marginTop: 12px`, `maxWidth: "93%"` |
| Orbit bubble (`.gh-msg`) | `background: var(--surface-raised)`, `borderRadius: "16px 16px 16px 5px"` (notch bottom-left, by the avatar), `padding: "12px 14px"`, `fontSize: var(--type-body)`, `lineHeight: var(--leading-normal)`, `color: var(--text-primary)` |
| Member block (`.gh-human`) | `marginTop: 14px`, `maxWidth: "93%"`; name at `var(--type-eyebrow)`, `var(--text-secondary)`, `fontWeight: 600`, `margin: "0 0 4px 8px"` |
| Member bubble (`.hmsg`) | `background: var(--surface-base)`, `border: "1px solid var(--hairline)"`, `borderRadius: "16px 16px 16px 5px"`, `padding: "11px 14px"` |
| Self bubble (`.smsg`) | `background: var(--surface-self)`, **no border**, `borderRadius: "16px 16px 5px 16px"` (notch bottom-right), `padding: "11px 14px"`, `maxWidth: "93%"`, right-aligned |
| Chip row (`.gh-qr`) | `gap: 7px`, `margin: "8px 0 0 37px"`, wraps |
| Chip (`.gh-qrchip`) | `background: transparent`, `border: "1.7px solid var(--hairline)"`, `borderRadius: 20`, `padding: "8px 12px"`, `fontSize: var(--type-label)`, `fontWeight: 600`, `color: var(--text-primary)`; quiet variant `color: var(--text-secondary)` |
| Selected chip | not drawn in the handoff — keep the shipped treatment (`--surface-self` fill + `✓ ` prefix) and name it in the PR |
| Tally (`.gtally`, both `GaugeTally` and `GroupProposalTally`) | `fontSize: var(--type-label)`, `fontWeight: 600`, `color: var(--text-secondary)`, `marginTop: 9`, `paddingTop: 9`, `borderTop: "1.4px solid var(--hairline)"`, dot `6×6` round `var(--text-secondary)`, `fontVariantNumeric: "tabular-nums"` |
| Motion | delete `transition: "opacity 0.1s ease"` from the optimistic row (`MessageFeed.tsx:160`); the 0.65 opacity dim itself stays |

Placement notes that survive on purpose: `GroupProposalTally` stays below its chip row (recorded deviation, `GroupProposalChips.tsx:123-127`); SYSTEM lines and the empty-feed state keep their current treatment (not covered by the handoff); the avatar slot inside `OrbitBubble` is already transparent from Task 3 — this task only aligns the row (bottom-aligned avatar next to the bottom-left notch).

- [ ] **Step 1: Apply the table above, element by element, in the five files.**
- [ ] **Step 2: Full suite + typecheck**

Run: `npx tsc --noEmit && npm test`
Expected: clean; all green — `GaugeChips`, `GroupProposalChips`, `ProposalChips`, `MessageFeed`, `PendingStrip` (it reuses the tallies) and `OrbitBubble` tests all exercise these files without asserting styles.

- [ ] **Step 3: Rendered check**

Dev server: three voices distinct by structure and fill (Orbit raised + mark, member outlined on base with name, self strongest fill right-aligned, no border), notches at the bottom, chips outlined not filled, tally under its hairline inside the bubble.

- [ ] **Step 4: Commit**

```bash
git add -A src/
git commit -m "Chat voices, chips, and tallies match the approved boards"
```

---

### Task 9: Event card shell and status line

**Files:**
- Modify: `src/app/groups/[id]/EventCard.tsx`

**Interfaces:**
- Consumes: tokens; `formatCounts` (`src/lib/events/roster.ts`) unchanged.
- Produces: nothing new — the card's counts move into their own status line element.

Target values (walkthrough.css `.gh-evcard` family with late overrides): shell `background: var(--surface-raised)`, `border: "1.7px solid var(--hairline)"`, `borderRadius: 14`, `boxShadow: "0 1px 3px rgba(0,0,0,.35)"` (the card stays the screen's only shadowed object), body padding `"14px 15px 13px"` (`.gh-evpad`). Title (`.gh-ctitle`): `fontSize: var(--type-heading)`, `fontWeight: 800`, `letterSpacing: "-.01em"`, `lineHeight: var(--leading-tight)`, `textWrap: "balance"`. Metadata (`.gh-cmeta`): `fontSize: var(--type-meta)`, `color: var(--text-secondary)`, `marginTop: "0.5em"`, keep the existing separator-dot idiom. Status line (`.gh-statusline`): the counts (`formatCounts` output, e.g. "4 In · 1 Out · 4 TBD") move out of the metadata paragraph into their own element: `fontSize: var(--type-label)`, `fontWeight: 700`, `color: var(--text-secondary)`, `marginTop: "0.55em"`, `fontVariantNumeric: "tabular-nums"`. RSVP row: replace the bordered footer band (`EventCard.tsx:112-113`) with the in-body row per `.gh-rsvp`: `marginTop: "0.95em"`, chips gap `0.6em`, still `RsvpControls` compact — its "I'm in" is already the teal primary (now `--action`/`--action-ink` after the sweep) and "Can't make it" outlined hairline.

- [ ] **Step 1: Apply the values above in `EventCard.tsx`.**
- [ ] **Step 2: Full suite + typecheck** — `npx tsc --noEmit && npm test`, clean and green.
- [ ] **Step 3: Rendered check** — card raised off the base surface with the 1.7px border and soft shadow, counts on their own bold label line that doesn't jiggle when a tally changes, RSVP row inside the card body with no footer hairline.
- [ ] **Step 4: Commit**

```bash
git add -A src/
git commit -m "The event card takes its finished shell, with counts on their own steady line"
```

---

### Task 10: Grounded composer

**Files:**
- Modify: `src/app/groups/[id]/ChatInput.tsx`

**Interfaces:**
- Consumes: tokens.
- Produces: nothing new.

Target values (walkthrough.css `.gh-pin` / `.gh-input` / `.gh-send` with late overrides, plus the kept move from the declined pilot in round4-base.css): wrapper `padding: "12px 16px 4px"`, `backgroundColor: "var(--surface-base)"`, `backgroundImage: "linear-gradient(0deg, rgba(0,0,0,.34), rgba(0,0,0,0))"` (the grounded-composer scrim — the feed now ends instead of sliding bare under the input), **no top hairline** (the scrim replaces it). Input pill: `background: var(--surface-raised)`, `border: "1px solid var(--hairline)"`, `borderRadius: 26`, `padding: "7px 7px 7px 16px"` — this is the row's padding; the send button sits inside the pill row at its right edge — `caretColor: "var(--text-primary)"`.

**Send button, owner ruling 11 Aug 2026 (overrides the board on this one point, do not "correct" it back).** The board drew the send as permanently neutral on the argument that composing is not the primary action. The owner ruled the opposite: sending a message IS an action that genuinely matters, so it keeps its teal. Build the board's geometry with a two-state fill:

- Always: `40×40` circle, `borderRadius: "50%"`, flex-centered, `flexShrink: 0`.
- Empty input: `backgroundColor: "var(--surface-self)"`, arrow `stroke: "var(--text-secondary)"`.
- Has text: `backgroundColor: "var(--action)"`, arrow `stroke: "var(--action-ink)"`.
- The state switches instantly: delete `transition: "color 0.15s ease"` (`ChatInput.tsx:111`) and add no replacement. No-animation still governs; only the fade is removed, not the state change.

- [ ] **Step 1: Apply the values above in `ChatInput.tsx`** (keep the disabled/pending behavior and `OrbitDownNote` placement untouched).
- [ ] **Step 2: Full suite + typecheck** — clean and green.
- [ ] **Step 3: Rendered check** — feed scrolls into a soft darkening above the composer; send circle is neutral when the input is empty and teal-filled with a dark arrow the moment there is text, with no fade between the two.
- [ ] **Step 4: Commit**

```bash
git add -A src/
git commit -m "Ground the composer: the feed ends instead of sliding under it"
```

---

### Task 11: Verification pass, records, and the PR

**Files:**
- Modify: `docs/build-notes.md` (§11 landing entry), `CLAUDE.md` ("Where the build is" rewrite at the slice boundary)
- No product code except fixes the verification itself surfaces.

- [ ] **Step 1: Full evidence run**

```bash
npx tsc --noEmit
npm test
npm run lint
```

Expected: tsc clean; 73+ files / 778+ tests green with zero skipped (record the exact after-numbers); lint at the fifteen-error baseline, not one more.

- [ ] **Step 2: Rendered side-by-side**

Open `docs/design/design-polish-rd-2/round4-design-reference.html` in a browser next to the dev server's group home (dev-test DB — run `npm run db:which` before any seeding; seed a group with 3 upcoming events, pending items for the viewer, and chat spanning at least two days). Walk items 02, 03/03b, and the kept finish moves against the running app. Screenshot both sides for the PR. Also confirm the OS-light-mode default is dark now (toggle the OS or use devtools emulation).

- [ ] **Step 3: Records**

Append the §11 landing entry (what shipped, decisions made in passing, the before/after suite numbers, debt opened — the spec's expected-debt list plus anything discovered). Rewrite CLAUDE.md's "Where the build is" (polish slice one landed; slice two, the onboarding wizard, is next per the standing triage order). Update CLAUDE.md's dark-theme rule paragraph: the scaffolding-gap sentences about the white `:root` and Arial body are now stale — mark them closed rather than deleting the rule.

- [ ] **Step 4: Independent review, then the PR**

Run the code review per `superpowers:requesting-code-review` (read-only reviewer; findings, fixes, and deliberate non-fixes recorded). Then follow `~/.claude/checklists/pr-handoff.md`: PR body with QA script (the script MUST include the owner re-judging the dressed strip against the original complaint: "does it now read as its own element?", plus: front door and onboarding intentionally still unpolished; verify dark default on a light-mode device; carousel peek and dots; day dividers say Today/Yesterday correctly in group time; Orbit's face everywhere), the review report, open questions (the Geist-vs-Hanken-Grotesk display-font call; the day-divider older-day copy; the undrawn selected-chip state), before/after suite numbers, and the two rendered screenshots. Seed the dev-test DB and start the server before handing off. Open the PR and stop — no merge.

---

## Self-review notes (run at planning time)

- Spec coverage: palette/dark/Geist (Tasks 1-2), mark (3), subline + heading header (4), carousel chrome (5), strip separation + tint-a (6), day dividers (7), bubbles/chips/tallies + tabular numerals (6, 8, 9), grounded composer (10), no-animation (8, 10), verification + records + QA-script strip re-judgment (11). Front door deliberately absent (slice three, per spec).
- Type consistency: `OrbitMark({size, label})` used identically in Tasks 3-5; `snappedIndex(scrollLeft, cardWidth, gap)` matches test and implementation; `groupMessagesByDay(messages, timeZone, now)` matches; `stripAbove` named identically in Tasks 6 and 8.
- The `.gh-input` padding note in Task 10 contains a typo-guard: the value is `"7px 7px 7px 16px"` (no stray parenthesis) — copy it from walkthrough.css:383 when implementing.
