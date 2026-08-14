# Chat-Feed Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the group home's card region a real edge against the chat feed, and give the pending idea card a ground of its own instead of the chat's.

**Architecture:** Direction A of the round-7 handoff, firm seam. The idea card gains a fourth surface token (`--surface-low`) so it sits one step above the page and one step below a confirmed card. The seam becomes a new local component that wraps the chat section and owns exactly two things: a full-bleed hairline where the feed begins, and an 18px non-interactive scrim pinned to the feed's top edge. The scrim must be an overlay *outside* the scrolling element, or it scrolls away with the content. The card region's empty-state box is extracted from the server-rendered page into its own component so its copy and treatment can be tested at all.

**Tech Stack:** Next.js 16 (App Router, server components), React 19, TypeScript, Vitest + Testing Library (jsdom), inline style objects (this codebase does not use CSS modules or Tailwind classes for component styling).

## Global Constraints

- **`--surface-base` (`#15161e`) is never redefined.** Fifteen component files across every screen read it. A new ground is a new token with a new name.
- **New token, direction A only:** `--surface-low: #1f222c`. `--surface-well` from direction B is **not** adopted and must not appear anywhere.
- **Frozen, do not touch:** the confirmed event card (`EventCard.tsx`), the gauge chips (`GaugeChips.tsx`, `choice.tsx`), the RSVP pair (`RsvpControls.tsx`), the carousel peek and dots (`CarouselRail.tsx`, `EventCarousel.tsx`), the header (`PageHeader.tsx`, `GroupHomeHeader.tsx`), the composer (`ChatInput.tsx`), and every screen other than the group home.
- **Teal (`--action`) is not a candidate for this seam.** No teal, no wash, nothing decorative. Lime is untouched.
- **No hue-only signalling; the owner is red/green colorblind.** Every change here is brightness and structure.
- **Nothing renders below 13px** (`--type-eyebrow`, the hard floor). Layout grows with content and never clips.
- **Product-voice rule holds: no em dashes in anything Orbit says, and none in the new empty-state copy.** Use commas or periods.
- **Tests that assert colour on the chips or the RSVP pair are a tripwire, not a target.** `src/components/__tests__/choice.test.tsx` and `src/components/__tests__/RsvpControls.test.tsx` must not need editing. If a change here makes one of them fail, stop and report it as a scope breach.
- **Test baseline: 87 files, 880 tests, green.** No pre-existing failures. The suite must finish at 880 plus whatever this plan adds, with nothing subtracted.
- Run the whole suite with `npm test`. Run one file with `npx vitest run <path>`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/app/globals.css` | **Modify.** Declares `--surface-low` beside the other surface tokens. Single source of truth for palette values. |
| `src/app/groups/[id]/IdeaCard.tsx` | **Modify.** One line: the card's fill moves from `--surface-base` to `--surface-low`. Nothing else about the card changes. |
| `src/app/groups/[id]/FeedSeam.tsx` | **Create.** Owns the boundary and nothing else: the hairline where the feed begins, and the non-interactive scrim over the feed's top edge. Wraps the chat section as children. Knows nothing about what is above it or what it contains. |
| `src/app/groups/[id]/CardRegionEmpty.tsx` | **Create.** The card region's empty state, lifted out of `page.tsx` so it is testable. Dashed hairline, no fill, faint centred copy. |
| `src/app/groups/[id]/page.tsx` | **Modify.** Composition only: wraps the chat section in `FeedSeam`, and swaps the inline empty-state block for `CardRegionEmpty`. |
| `src/app/groups/[id]/__tests__/FeedSeam.test.tsx` | **Create.** Pins the two guarantees that can actually break: children render, and the scrim never intercepts taps. |
| `src/app/groups/[id]/__tests__/CardRegionEmpty.test.tsx` | **Create.** Pins the copy exactly, including the no-em-dash rule. |
| `src/app/groups/[id]/__tests__/IdeaCard.test.tsx` | **Modify.** Adds the ground assertion. |
| `docs/superpowers/specs/2026-08-13-chat-feed-boundary-design.md` | **Modify.** Revision note recording which direction won and why. |

**Why `FeedSeam` is a component and not three style properties in `page.tsx`.** `page.tsx` is a server component that queries the database; this repo cannot unit test it. The scrim carries a real failure mode (an overlay that eats taps makes the topmost gauge chip in the feed untappable), and a failure mode with no test is how it ships. Extracting it is what makes that testable. It follows the same reasoning as `PageHeader`: the piece owns the boundary's rules and nothing about content.

---

### Task 1: The idea card gets a ground of its own

**Files:**
- Modify: `src/app/globals.css:12` (immediately after `--surface-self`)
- Modify: `src/app/groups/[id]/IdeaCard.tsx:21`
- Modify: `src/app/groups/[id]/__tests__/IdeaCard.test.tsx`
- Modify: `docs/superpowers/specs/2026-08-13-chat-feed-boundary-design.md`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: the CSS custom property `--surface-low`, referenced as `var(--surface-low)`. No exported symbols.

- [ ] **Step 1: Record the direction that won, in the spec**

Append this section to the end of `docs/superpowers/specs/2026-08-13-chat-feed-boundary-design.md`:

```markdown
## Part 8 · Revision, 13 Aug 2026: direction A, firm seam

The round-7 handoff landed at `docs/design/design_handoff_round7/` and the owner
picked **direction A with the firm seam**, after the describe-back.

**Why A over B.** A closes both halves of the complaint; B closes one and a half.
B fixes the seam and, as a side effect, the card-matches-the-chat problem, but
inside its own region the idea card is still an outline on the region's ground.
A's brightness step is also about twice B's (the well sat roughly 5 points per
channel below base, against A's 10 to 14), which matters because the one thing
no board can prove is how a step that small survives a phone in daylight. And A
leaves the chat untouched, so it never opens the debt Part 5 anticipated: no
future chat element inherits a question about which ground it draws on. That
debt is therefore **not incurred**, and Part 5's first paragraph is superseded.

**Why firm over quiet.** The motion half of the complaint is where a bare
hairline is weakest. A hairline says where the feed begins when nothing moves;
the scrim is what makes a message darken as it travels up, which is what reads
as stopping rather than sliding under.

**Measured, not eyeballed** (sampled off the rendered board): confirmed card
`#262b37`, idea card `#1f222c`, page `#15161e`. That is a 1.12:1 contrast ratio
between the idea card and a confirmed one and 1.14:1 against the page, where 3:1
is the usual floor for two UI surfaces being reliably tellable apart. The reason
the step is that small is that the whole palette spans 1.27:1 from page to
brightest card, so a third rung cannot be bigger without colliding. This is
normal for dark interfaces. The consequence, recorded because it is a real
limitation rather than a defect: **fill is the weakest of the five signals
separating an idea from a plan**, behind the controls, the shadow, the title
weight, and the need label. Direction A stops the fill being zero; it does not
make it the differentiator. The owner reviewed this measurement and chose to
ship and revisit with the app in hand, on the reasoning that every lever here
(fill value, border weight, corner treatment) is a one-line change later.

**Empty-state copy, settled.** "Nothing planned yet, float an idea in chat"
replaces "No upcoming events yet. Orbit will propose one soon." The board drew
it with an em dash, which was corrected: the product-voice rule stands, and the
empty-state box is chrome rather than Orbit speaking either way.
```

- [ ] **Step 2: Write the failing test**

In `src/app/groups/[id]/__tests__/IdeaCard.test.tsx`, add this test inside the existing `describe("IdeaCard", ...)` block:

```tsx
  it("sits on its own ground, not the chat's", () => {
    const { container } = render(<IdeaCard item={ITEM} />)
    const shell = container.firstElementChild as HTMLElement
    // The whole point of the slice: the idea card used to be var(--surface-base),
    // which is the exact value of the page and the chat feed behind it, so it
    // was a hairline outline on the chat's own floor.
    expect(shell.style.backgroundColor).toBe("var(--surface-low)")
    expect(shell.style.backgroundColor).not.toBe("var(--surface-base)")
  })
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run "src/app/groups/[id]/__tests__/IdeaCard.test.tsx"`

Expected: FAIL. The assertion reports the received value as `var(--surface-base)`. This is the test proving it could fail, so do not skip it: if it passes here, the fill was already changed and the change is not being verified by this cycle.

- [ ] **Step 4: Declare the token**

In `src/app/globals.css`, add the new line directly after the `--surface-self` line, keeping the existing comment style:

```css
  --surface-self: #363c4b;   /* viewer's own bubble; strongest fill, never teal */
  --surface-low: #1f222c;    /* pending idea card; one step above base, below raised */
  --hairline: #454c5e;
```

- [ ] **Step 5: Move the idea card onto it**

In `src/app/groups/[id]/IdeaCard.tsx`, change line 21 only:

```tsx
        backgroundColor: "var(--surface-low)",
```

Then update the file's header comment, which currently states the old fill. Replace the phrase `flat\n// --surface-base, a single hairline, no shadow` with:

```
// flat --surface-low, a single hairline, no shadow
```

and append to that same comment block:

```
// The fill moved off --surface-base in the chat-feed-boundary slice (round 7,
// direction A): sharing the page's own value meant the card had, in effect, no
// fill at all. It is still the quietest filled thing in the region, one step
// under a confirmed card, which is what keeps a maybe from reading as a plan.
```

- [ ] **Step 6: Run it and watch it pass**

Run: `npx vitest run "src/app/groups/[id]/__tests__/IdeaCard.test.tsx"`

Expected: PASS, all tests in the file.

- [ ] **Step 7: Run the whole suite**

Run: `npm test`

Expected: 87 files, 881 tests, green. One test added, none removed. If `choice.test.tsx` or `RsvpControls.test.tsx` fails, stop and report a scope breach.

- [ ] **Step 8: Commit**

```bash
git add src/app/globals.css "src/app/groups/[id]/IdeaCard.tsx" "src/app/groups/[id]/__tests__/IdeaCard.test.tsx" docs/superpowers/specs/2026-08-13-chat-feed-boundary-design.md
git commit -m "An idea gets a floor of its own instead of the chat's"
```

---

### Task 2: The seam between the plan and the conversation

**Files:**
- Create: `src/app/groups/[id]/FeedSeam.tsx`
- Create: `src/app/groups/[id]/__tests__/FeedSeam.test.tsx`
- Modify: `src/app/groups/[id]/page.tsx:281-301`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `export default function FeedSeam({ children }: { children: React.ReactNode })`. Renders a flex column that fills its parent's remaining height, carries the hairline on its top edge, and overlays a scrim on its first 18px. Callers put the whole chat section inside it.

- [ ] **Step 1: Write the failing test**

Create `src/app/groups/[id]/__tests__/FeedSeam.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import FeedSeam from "../FeedSeam"

afterEach(cleanup)

describe("FeedSeam", () => {
  it("renders what it wraps", () => {
    render(
      <FeedSeam>
        <p>the conversation</p>
      </FeedSeam>
    )
    expect(screen.getByText("the conversation")).toBeDefined()
  })

  it("draws the hairline where the feed begins", () => {
    const { container } = render(<FeedSeam><p>x</p></FeedSeam>)
    const seam = container.firstElementChild as HTMLElement
    expect(seam.style.borderTop).toBe("1px solid var(--hairline)")
  })

  it("never intercepts a tap", () => {
    // The failure this exists to stop: the scrim is an overlay sitting on top
    // of the feed's first 18px, which is exactly where the topmost gauge chip
    // sits after a scroll. An overlay that takes pointer events makes that
    // chip untappable, and nothing about the screen would look wrong.
    const { container } = render(<FeedSeam><p>x</p></FeedSeam>)
    const scrim = container.querySelector("[data-seam-scrim]") as HTMLElement
    expect(scrim).not.toBeNull()
    expect(scrim.style.pointerEvents).toBe("none")
  })

  it("pins the scrim to the top edge rather than letting it scroll", () => {
    // Absolute positioning inside a scrolling element would scroll away with
    // the content. The scrim is therefore a sibling of the scroll region, not
    // a child of it, positioned against this component's own box.
    const { container } = render(<FeedSeam><p>x</p></FeedSeam>)
    const seam = container.firstElementChild as HTMLElement
    const scrim = container.querySelector("[data-seam-scrim]") as HTMLElement
    expect(seam.style.position).toBe("relative")
    expect(scrim.style.position).toBe("absolute")
    expect(scrim.style.top).toBe("0px")
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run "src/app/groups/[id]/__tests__/FeedSeam.test.tsx"`

Expected: FAIL at import, `Cannot find module '../FeedSeam'`.

- [ ] **Step 3: Write the component**

Create `src/app/groups/[id]/FeedSeam.tsx`:

```tsx
// src/app/groups/[id]/FeedSeam.tsx
//
// The boundary between the pinned card region and the chat feed, and nothing
// else. It owns two marks and has no opinion about what sits on either side:
//
//   - a full-bleed hairline where the feed begins, the same grammar that
//     already ends the header (PageHeader's borderBottom)
//   - an 18px scrim over the feed's first pixels, the composer's own scrim
//     grammar turned upside down
//
// Why it exists as a piece rather than three properties on the page: the page
// is server-rendered and cannot be unit tested, and the scrim carries a real
// failure mode. It sits on top of the feed's top edge, which after a scroll is
// exactly where the topmost gauge chip sits. An overlay that accepts pointer
// events makes that chip untappable while the screen still looks correct.
//
// The scrim is a SIBLING of the scroll region, not a child. Absolute
// positioning inside a scrolling element resolves against the content box, so
// a scrim placed inside the feed would scroll away with the messages, which is
// the opposite of marking a fixed edge. (Round 7 handoff, direction A, firm
// seam: "an overlay on the scroll region, not content.")

export default function FeedSeam({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "relative",
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        borderTop: "1px solid var(--hairline)",
      }}
    >
      <div
        data-seam-scrim
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "18px",
          background: "linear-gradient(180deg, rgba(0,0,0,.32), rgba(0,0,0,0))",
          pointerEvents: "none",
          zIndex: 2,
        }}
      />
      {children}
    </div>
  )
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run "src/app/groups/[id]/__tests__/FeedSeam.test.tsx"`

Expected: PASS, 4 tests.

- [ ] **Step 5: Wire it into the page**

In `src/app/groups/[id]/page.tsx`, the chat section currently opens with a plain `<div>` carrying the layout properties. Replace that wrapper with `FeedSeam`, which now owns them. The block that begins with the `{/* ── Chat feed + pinned input (client island) ───── */}` comment becomes:

```tsx
      {/* ── Chat feed + pinned input (client island) ───────────────────── */}
      {/* The chat section fills remaining viewport height.  The feed is its
          own scroll region; the input is pinned at the bottom.
          Body stays at --type-body (17px), never shrunk (§7 firm rule).

          FeedSeam wraps it and owns the boundary against the card region
          above: the hairline and the scrim over the feed's top edge. It
          replaced a bare 12px margin, which left this the one unmarked seam
          on a screen whose other two are both drawn. */}
      <div style={{ marginTop: "0.75rem", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <FeedSeam>
          <GroupHome
            groupId={group.id}
            initialMessages={messages}
            viewerId={viewer?.id ?? null}
            viewerName={viewer?.name ?? null}
            timeZone={group.timeZone}
            gauges={gauges}
            proposals={proposals}
            groupProposals={groupProposals}
            viewerIsMember={viewerIsMember}
          />
        </FeedSeam>
      </div>
```

Add the import beside the other local component imports near the top of the file:

```tsx
import FeedSeam from "./FeedSeam"
```

- [ ] **Step 6: Confirm the page still type-checks and the suite is green**

Run: `npx tsc --noEmit`

Expected: clean, no output.

Run: `npm test`

Expected: 88 files, 885 tests, green.

- [ ] **Step 7: Commit**

```bash
git add "src/app/groups/[id]/FeedSeam.tsx" "src/app/groups/[id]/__tests__/FeedSeam.test.tsx" "src/app/groups/[id]/page.tsx"
git commit -m "The conversation stops at an edge instead of trailing off"
```

---

### Task 3: The empty-state box gets drawn, and testable

**Files:**
- Create: `src/app/groups/[id]/CardRegionEmpty.tsx`
- Create: `src/app/groups/[id]/__tests__/CardRegionEmpty.test.tsx`
- Modify: `src/app/groups/[id]/page.tsx:254-274`

**Interfaces:**
- Consumes: nothing from Tasks 1 and 2.
- Produces: `export default function CardRegionEmpty()`. Takes no props.

- [ ] **Step 1: Write the failing test**

Create `src/app/groups/[id]/__tests__/CardRegionEmpty.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import CardRegionEmpty from "../CardRegionEmpty"

afterEach(cleanup)

describe("CardRegionEmpty", () => {
  it("tells the member what to do instead of promising Orbit will handle it", () => {
    render(<CardRegionEmpty />)
    expect(screen.getByText("Nothing planned yet, float an idea in chat")).toBeDefined()
  })

  it("keeps the product-voice rule: no em dash", () => {
    // The design board drew this copy with an em dash. The rule stands, so the
    // dash became a comma. Pinned because copy gets retyped from boards.
    const { container } = render(<CardRegionEmpty />)
    expect(container.textContent).not.toMatch(/[—–]/)
  })

  it("is the quietest thing in the region: no fill, a dashed edge", () => {
    // It sits below both card kinds on the ladder. A dashed edge is the
    // roster's own "not yet" grammar, so this reads as an absence with a
    // border rather than as a card with nothing in it.
    const { container } = render(<CardRegionEmpty />)
    const box = container.firstElementChild as HTMLElement
    expect(box.style.border).toBe("1px dashed var(--hairline)")
    expect(box.style.backgroundColor).toBe("transparent")
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run "src/app/groups/[id]/__tests__/CardRegionEmpty.test.tsx"`

Expected: FAIL at import, `Cannot find module '../CardRegionEmpty'`.

- [ ] **Step 3: Write the component**

Create `src/app/groups/[id]/CardRegionEmpty.tsx`:

```tsx
// src/app/groups/[id]/CardRegionEmpty.tsx
//
// What the card region shows when there is no confirmed plan and no idea being
// gauged. Drawn for the first time in the round-7 handoff; before that it was
// an inline --surface-raised box in page.tsx, which made it as bright as a
// confirmed card while saying the least of anything on the screen.
//
// It is the bottom rung of the ladder: confirmed card, idea card, then this.
// No fill and a dashed edge, the roster's own "not yet" grammar, so it reads
// as an absence with a border rather than a card with nothing in it.
//
// Lifted out of page.tsx so its copy can be tested at all: the page is server
// -rendered and this repo cannot unit test it.

export default function CardRegionEmpty() {
  return (
    <div
      style={{
        border: "1px dashed var(--hairline)",
        borderRadius: "14px",
        backgroundColor: "transparent",
        minHeight: "92px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "18px 22px",
      }}
    >
      <p
        style={{
          fontSize: "var(--type-meta)",
          lineHeight: "var(--leading-normal)",
          color: "var(--text-faint)",
          fontWeight: 500,
          textWrap: "balance",
        }}
      >
        Nothing planned yet, float an idea in chat
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run "src/app/groups/[id]/__tests__/CardRegionEmpty.test.tsx"`

Expected: PASS, 3 tests.

- [ ] **Step 5: Swap it into the page**

In `src/app/groups/[id]/page.tsx`, replace the entire inline empty-state `<div>` in the `entries.length > 0 ? ... : ...` ternary (the block whose comment reads `/* No upcoming event or idea — quiet empty state; the feed still renders */`) with:

```tsx
        ) : (
          /* No upcoming event or idea. The quiet bottom rung of the card
             ladder; the feed still renders below it. */
          <CardRegionEmpty />
        )}
```

Add the import beside the other local component imports:

```tsx
import CardRegionEmpty from "./CardRegionEmpty"
```

- [ ] **Step 6: Confirm types and the suite**

Run: `npx tsc --noEmit`

Expected: clean.

Run: `npm test`

Expected: 89 files, 888 tests, green.

- [ ] **Step 7: Commit**

```bash
git add "src/app/groups/[id]/CardRegionEmpty.tsx" "src/app/groups/[id]/__tests__/CardRegionEmpty.test.tsx" "src/app/groups/[id]/page.tsx"
git commit -m "The empty region says what to do, quietly"
```

---

### Task 4: Prove it against the boards, in a browser

No code. This task exists because every claim this slice makes is visual, and the standing rule is that "matches the design" is never claimed without a rendered comparison.

**Files:**
- Create: `docs/design/design_handoff_round7/round7-design-reference.html` (pulled from the Claude Design project)

- [ ] **Step 1: Pull the reference boards into the repo**

The handoff folder deliberately shipped without its reference HTML, pending the direction pick. Pull it now via the Claude Design connector: project `1e6b5a4e-ca94-4a77-9b0c-726f22fe4ace`, path `design_handoff_round7/round7-design-reference.html`, written to the same path under `docs/design/`. The carried CSS files are already in the folder, so it renders offline once the HTML is there.

- [ ] **Step 2: Start the app and stage a group with an idea and a confirmed plan**

Run: `npm run db:which`

Expected: prints `pxbewardwvoyqqcvogel` and exits zero. **If it does not, stop.** Never run against production.

Then start the dev server through the preview tooling, not a bare shell command, and stage a group carrying one confirmed event and one idea gauge (the `qa:stage-cardstate` script already builds this shape).

- [ ] **Step 3: Compare, state by state**

Open the app beside board 01b (direction A, firm seam) and check each of these, recording what was seen rather than that it was checked:

1. **At rest.** The idea card reads as a filled panel against the page, and still reads quieter than the confirmed card beside it.
2. **Scrolled.** Push the feed up until a message meets the top edge. The message should darken into the seam rather than vanish at an invisible line. This is the one that answers the original complaint.
3. **The hairline.** Present, full-bleed, edge to edge, not inset to the card's width.
4. **The topmost chip is still tappable.** Scroll a gauge's chips up under the scrim and tap one. The vote must register. The unit test pins `pointerEvents: none`, but this is the behaviour it stands for.
5. **Single idea card, no confirmed plan.** The worst case from board 05a: one card, no peek, nothing beside it to borrow contrast from.
6. **Empty region.** No event, no idea: the dashed box, the new copy, no em dash.

- [ ] **Step 4: Run the suite one last time and record the number**

Run: `npm test`

Expected: 89 files, 888 tests, green. Baseline was 87 files, 880 tests. The PR reports both numbers.

- [ ] **Step 5: Commit the reference boards**

```bash
git add docs/design/design_handoff_round7/round7-design-reference.html
git commit -m "Keep the boards this slice was built against"
```

- [ ] **Step 6: Name what could not be verified**

Two things, both of which go in the PR body and neither of which may be claimed as checked:

- **The real-phone pass.** Everything above happened in a desktop browser. Whether a 1.14:1 step reads on a phone in daylight is the owner's check, and it is the accepted risk of sourcing this from static boards.
- **The ideas-only card region** was already a named gap from the card-state slice (covered by neither a test nor a walkthrough). Step 3 item 5 closes it if it is actually staged; if it is not, say so rather than letting it stay silently uncovered.

---

## Self-Review

**Spec coverage.** Part 1 (the three findings) is what Tasks 1 and 2 fix. Part 2's direction A is Task 1 plus Task 2. Part 3's frozen list is in Global Constraints. Part 4's verification items 1 through 4 are Task 4; item 5's baseline is in Global Constraints; item 6's tripwire is in Global Constraints and in Task 1 Step 7. Part 5's debt is recorded as *not incurred* in the Task 1 spec revision, since direction A does not touch the chat. Part 7's step 4 (the spec revision note) is Task 1 Step 1. **One gap found and closed while reviewing:** Part 7 step 1 says the handoff lands in `docs/design/` and the reference HTML was held back, so Task 4 Step 1 now pulls it.

**Placeholders.** None. Every code step carries the actual code; every run step carries the actual command and the expected result.

**Type consistency.** `FeedSeam` takes `{ children: React.ReactNode }` and is used with children in `page.tsx`. `CardRegionEmpty` takes no props and is used with none. `--surface-low` is spelled identically in `globals.css`, `IdeaCard.tsx`, and the test. `data-seam-scrim` is spelled identically in the component and all three tests that query it.

**Not in this plan, on purpose.** The build-notes §11 entry and the CLAUDE.md current-state rewrite are slice-completion work, not tasks: they are written once the browser pass is done and the numbers are real, so they describe what shipped rather than what was intended.
