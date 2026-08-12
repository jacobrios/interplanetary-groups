# Card State Grammar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The event card's RSVP pair becomes an honest ask-and-answer control, and the pending strip retires in favor of pending ideas as subordinate cards in the top carousel; an open time-change vote surfaces as a one-line notice on its event's card with the vote itself on the event detail screen, and the whole region adopts the round-6 stretch-and-anchor height rule (spec decision 8, settled after the round-6 alternatives round).

**Architecture:** One shared choice-grammar module (`src/components/choice.tsx`) replaces four near-duplicate style blocks; a pure region module (`src/lib/cards/region.ts`) owns ordering, the cap of five, and the need-label ladder; `src/lib/pending/derive.ts` is trimmed to idea items plus a new proposal-band derivation. Presentation follows `docs/design/design_handoff_round5/` (boards 01-04, 06) and `docs/design/design_handoff_round6/` (variant A take 1, board 06 mixed heights), with the owner-ruled departures in the spec's decisions 8 and 13, notably the objective proposal copy composed from stored facts.

**Tech Stack:** Next.js 16 App Router (server components + client islands), Prisma enums, Vitest with per-file jsdom + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-08-12-card-state-grammar-design.md` (fully settled; read decisions 1-13 before starting).

## Global Constraints

- Work in place on `feat/card-state-grammar`. No worktrees.
- No animation or CSS transitions anywhere; state changes swap styles instantly.
- No new design tokens; inline styles reading the tokens in `src/app/globals.css`. Never load any file from `docs/design/` into the app; port values.
- Teal (`--action`) appears only as: both RSVP options' borders while unanswered, the chosen RSVP option's fill after, and need-label text when the label names the viewer's own move. Chips are never teal.
- Label strings, stored sentence case and uppercased by CSS: `Needs your RSVP`, `Needs your vote`, `Needs other votes`. Nothing renders below `--type-eyebrow` (13px).
- Status is never hue alone: keep every `✓ ` prefix exactly as the existing components do.
- User-facing copy: no em dashes, three-letter weekdays, Orbit's plain warm voice.
- Tests first, shown failing, then implementation. Component tests: `// @vitest-environment jsdom` + @testing-library/react + `vi.mock` of server actions (mirror `src/app/groups/[id]/__tests__/GroupProposalChips.test.tsx`). Suite must stay green from an empty database; no test touches the model or network.
- Combined card cap is 5 (`CARD_REGION_CAP`).
- Commit after every task with a descriptive message.

---

### Task 1: Record the test-suite baseline

**Files:**
- Modify: `docs/build-notes.md` (append a §11 stub at the end)

**Interfaces:**
- Produces: the baseline count later tasks' PR text and the §11 entry cite.

- [ ] **Step 1: Run the full suite and capture the counts**

Run: `npx vitest run 2>&1 | tail -6`
Expected: all green. Record the exact "Test Files N passed" and "Tests N passed" numbers.

- [ ] **Step 2: Append the baseline stub to build-notes §11**

Append at the end of `docs/build-notes.md`:

```markdown
## §11 entry: card state grammar (opened 12 Aug 2026)

Slice branch `feat/card-state-grammar`, cut from main at 3e4c749. Spec and design
round in docs/superpowers/specs/ (2026-08-12-card-state-grammar-*). Test-suite
baseline at slice start, before any code: <N> files / <M> tests, all passing,
matching polish slice one's finishing number. No pre-existing failures to carry.
(Entry completed when the slice lands.)
```

Replace `<N>` / `<M>` with the real numbers. If any test fails at baseline, STOP and report; do not fix it silently.

- [ ] **Step 3: Commit**

```bash
git add docs/build-notes.md
git commit -m "Record card-state-grammar suite baseline before any code"
```

---

### Task 2: Shared choice grammar (`choice.tsx`)

**Files:**
- Create: `src/components/choice.tsx`
- Test: `src/components/__tests__/choice.test.tsx`

**Interfaces:**
- Produces (exact signatures later tasks import):
  - `ChoiceChip({ name, value, label, selected, quiet, disabled }: { name: string; value: string; label: string; selected: boolean; quiet: boolean; disabled: boolean })` submit-button pill.
  - `ChipRow({ margin, children }: { margin: string; children: React.ReactNode })` wrapping flex row, gap 7px.
  - `TallyLine({ line, marginTop = 9, marginLeft = 0 }: { line: string; marginTop?: number; marginLeft?: number })` returns null on empty line; hairline top, dot, tabular numerals.
  - `ErrorLine({ msg, marginLeft = 0 }: { msg: string | null; marginLeft?: number })` returns null on null.
  - `RsvpOption({ value, label, state, disabled, padding, radius }: { value: string; label: string; state: "ask" | "pick" | "other"; disabled: boolean; padding: string; radius: string })` submit button named `status`; `pick` renders `✓ ` prefix.

- [ ] **Step 1: Write the failing test**

`src/components/__tests__/choice.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { ChoiceChip, ChipRow, TallyLine, RsvpOption } from "../choice"

afterEach(cleanup)

describe("ChoiceChip", () => {
  it("renders the bare label unselected and the checkmark when selected", () => {
    render(
      <form>
        <ChoiceChip name="answer" value="IN" label="🍻 I'm in" selected={false} quiet={false} disabled={false} />
        <ChoiceChip name="answer" value="OUT" label="🙏 Next time" selected={true} quiet={true} disabled={false} />
      </form>
    )
    expect(screen.getByRole("button", { name: "🍻 I'm in" })).toBeDefined()
    expect(screen.getByRole("button", { name: "✓ 🙏 Next time" })).toBeDefined()
  })

  it("never uses the action color in any state", () => {
    render(
      <form>
        <ChoiceChip name="answer" value="IN" label="I'm in" selected={true} quiet={false} disabled={false} />
      </form>
    )
    const btn = screen.getByRole("button", { name: "✓ I'm in" })
    expect(btn.style.backgroundColor).toBe("var(--surface-self)")
    expect(btn.style.border).not.toContain("--action")
  })
})

describe("TallyLine", () => {
  it("renders nothing for an empty line", () => {
    const { container } = render(<TallyLine line="" />)
    expect(container.innerHTML).toBe("")
  })
  it("renders the line when present", () => {
    render(<TallyLine line="Rowan is in so far · one more makes it happen" />)
    expect(screen.getByText("Rowan is in so far · one more makes it happen")).toBeDefined()
  })
})

describe("RsvpOption", () => {
  it("ask state: transparent fill, action border, no checkmark", () => {
    render(
      <form>
        <RsvpOption value="IN" label="I'm in" state="ask" disabled={false} padding="0.375rem 0.75rem" radius="24px" />
      </form>
    )
    const btn = screen.getByRole("button", { name: "I'm in" })
    expect(btn.style.backgroundColor).toBe("transparent")
    expect(btn.style.border).toBe("1.5px solid var(--action)")
  })
  it("pick state: action fill, ink text, checkmark", () => {
    render(
      <form>
        <RsvpOption value="OUT" label="Can't make it" state="pick" disabled={false} padding="0.375rem 0.75rem" radius="24px" />
      </form>
    )
    const btn = screen.getByRole("button", { name: "✓ Can't make it" })
    expect(btn.style.backgroundColor).toBe("var(--action)")
    expect(btn.style.color).toBe("var(--action-ink)")
  })
  it("other state: hairline border, secondary text, no checkmark", () => {
    render(
      <form>
        <RsvpOption value="IN" label="I'm in" state="other" disabled={false} padding="0.375rem 0.75rem" radius="24px" />
      </form>
    )
    const btn = screen.getByRole("button", { name: "I'm in" })
    expect(btn.style.border).toBe("1.5px solid var(--hairline)")
    expect(btn.style.color).toBe("var(--text-secondary)")
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/__tests__/choice.test.tsx`
Expected: FAIL, cannot resolve `../choice`.

- [ ] **Step 3: Implement `src/components/choice.tsx`**

```tsx
// src/components/choice.tsx
//
// The product's one choice grammar, shared by every chip row and the RSVP
// pair (spec decision 12: four hand-kept copies will drift; one file is how
// a grammar stays one). Presentational only: consumers own their <form>,
// their optimistic state, and their server action.
//
// Grammar rules carried here so no consumer can restate them differently:
// - A chosen option is marked by a "✓ " prefix plus a fill shift, never by
//   color alone (the owner is red/green colorblind; hue is never the signal).
// - Chips are never teal. Teal belongs to the RSVP pair alone: both borders
//   while the ask is open (leaning toward neither answer), the chosen
//   option's fill after (CLAUDE.md teal rule as amended by this slice).

export function ChoiceChip({
  name,
  value,
  label,
  selected,
  quiet,
  disabled,
}: {
  name: string
  value: string
  label: string
  selected: boolean
  quiet: boolean
  disabled: boolean
}) {
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={disabled}
      style={{
        border: "1.7px solid var(--hairline)",
        backgroundColor: selected ? "var(--surface-self)" : "transparent",
        borderRadius: "20px",
        padding: "8px 12px",
        fontSize: "var(--type-label)",
        fontWeight: 600,
        fontFamily: "inherit",
        color: quiet && !selected ? "var(--text-secondary)" : "var(--text-primary)",
        whiteSpace: "nowrap",
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {selected ? `✓ ${label}` : label}
    </button>
  )
}

export function ChipRow({ margin, children }: { margin: string; children: React.ReactNode }) {
  return <div style={{ display: "flex", flexWrap: "wrap", gap: "7px", margin }}>{children}</div>
}

/** The quiet where-things-stand line: hairline above, dot, tabular numerals.
 *  Null on empty: "nobody has voted" is noise the chips already imply. */
export function TallyLine({
  line,
  marginTop = 9,
  marginLeft = 0,
}: {
  line: string
  marginTop?: number
  marginLeft?: number
}) {
  if (!line) return null
  return (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        marginTop,
        marginLeft,
        paddingTop: 9,
        borderTop: "1.4px solid var(--hairline)",
        fontSize: "var(--type-label)",
        lineHeight: "var(--leading-normal)",
        color: "var(--text-secondary)",
        fontWeight: 600,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <i
        aria-hidden="true"
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          backgroundColor: "var(--text-secondary)",
          flexShrink: 0,
        }}
      />
      {line}
    </span>
  )
}

export function ErrorLine({ msg, marginLeft = 0 }: { msg: string | null; marginLeft?: number }) {
  if (!msg) return null
  return (
    <p
      style={{
        fontSize: "var(--type-meta)",
        lineHeight: "var(--leading-normal)",
        color: "#f87171",
        margin: `0.5rem 0 0 ${marginLeft}px`,
      }}
    >
      {msg}
    </p>
  )
}

/** One side of the RSVP pair. ask = open question (teal border, no mark);
 *  pick = the viewer's answer (teal fill, ink, checkmark); other = the road
 *  not taken (hairline, secondary), still tappable to change the answer. */
export function RsvpOption({
  value,
  label,
  state,
  disabled,
  padding,
  radius,
}: {
  value: string
  label: string
  state: "ask" | "pick" | "other"
  disabled: boolean
  padding: string
  radius: string
}) {
  const stateStyle = {
    ask: {
      backgroundColor: "transparent",
      border: "1.5px solid var(--action)",
      color: "var(--text-primary)",
      fontWeight: 600,
    },
    pick: {
      backgroundColor: "var(--action)",
      border: "1.5px solid var(--action)",
      color: "var(--action-ink)",
      fontWeight: 700,
    },
    other: {
      backgroundColor: "transparent",
      border: "1.5px solid var(--hairline)",
      color: "var(--text-secondary)",
      fontWeight: 600,
    },
  }[state]

  return (
    <button
      type="submit"
      name="status"
      value={value}
      disabled={disabled}
      style={{
        flex: 1,
        padding,
        borderRadius: radius,
        fontSize: "var(--type-label)",
        fontFamily: "inherit",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.65 : 1,
        ...stateStyle,
      }}
    >
      {state === "pick" ? `✓ ${label}` : label}
    </button>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/__tests__/choice.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/choice.tsx src/components/__tests__/choice.test.tsx
git commit -m "Add the shared choice grammar: chips, tally, error, RSVP option"
```

---

### Task 3: Region logic and the need label

**Files:**
- Create: `src/lib/cards/region.ts`
- Create: `src/components/NeedLabel.tsx`
- Test: `src/lib/cards/__tests__/region.test.ts`
- Test: `src/components/__tests__/NeedLabel.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `CARD_REGION_CAP = 5`
  - `type NeedLabelValue = { text: string; needsViewer: boolean }`
  - `eventNeedLabel(viewerRsvp: "IN" | "OUT" | null, openProposal: { viewerAnswer: "YES" | "KEEP" | null } | null): NeedLabelValue | null`
  - `ideaNeedLabel(viewerAnswer: "IN" | "OUT" | "NOT_THAT_DAY" | null): NeedLabelValue | null`
  - `type RegionEntry<E, I> = { kind: "event"; sortMs: number; data: E } | { kind: "idea"; sortMs: number; item: I }`
  - `composeCardRegion<E, I>(events: { sortMs: number; data: E }[], ideas: { sortMs: number; item: I }[], cap?: number): RegionEntry<E, I>[]`
  - `NeedLabel({ value }: { value: NeedLabelValue | null })` React component, null-safe.

- [ ] **Step 1: Write the failing tests**

`src/lib/cards/__tests__/region.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  CARD_REGION_CAP,
  composeCardRegion,
  eventNeedLabel,
  ideaNeedLabel,
} from "../region"

describe("composeCardRegion", () => {
  const ev = (id: string, ms: number) => ({ sortMs: ms, data: id })
  const idea = (id: string, ms: number) => ({ sortMs: ms, item: id })

  it("mingles kinds in pure date order", () => {
    const out = composeCardRegion([ev("sat", 200)], [idea("fri", 100)])
    expect(out.map((e) => e.kind)).toEqual(["idea", "event"])
  })

  it("breaks a same-instant tie in favor of the confirmed plan", () => {
    const out = composeCardRegion([ev("e", 100)], [idea("i", 100)])
    expect(out[0].kind).toBe("event")
  })

  it("caps the combined list at five", () => {
    const events = [ev("a", 1), ev("b", 2), ev("c", 3)]
    const ideas = [idea("x", 4), idea("y", 5), idea("z", 6)]
    const out = composeCardRegion(events, ideas)
    expect(CARD_REGION_CAP).toBe(5)
    expect(out).toHaveLength(5)
    expect(out[4]).toMatchObject({ kind: "idea", item: "y" })
  })

  it("returns empty for no input (the empty-state branch)", () => {
    expect(composeCardRegion([], [])).toEqual([])
  })
})

describe("eventNeedLabel (the dense-face ladder, spec decision 6)", () => {
  it("no RSVP yet: needs your RSVP, viewer's move, whatever the proposal state", () => {
    expect(eventNeedLabel(null, null)).toEqual({ text: "Needs your RSVP", needsViewer: true })
    expect(eventNeedLabel(null, { viewerAnswer: null })).toEqual({
      text: "Needs your RSVP",
      needsViewer: true,
    })
  })
  it("RSVP settled, proposal unanswered: needs your vote, viewer's move", () => {
    expect(eventNeedLabel("IN", { viewerAnswer: null })).toEqual({
      text: "Needs your vote",
      needsViewer: true,
    })
  })
  it("RSVP settled, proposal answered either way: needs other votes, not the viewer's move", () => {
    expect(eventNeedLabel("IN", { viewerAnswer: "YES" })).toEqual({
      text: "Needs other votes",
      needsViewer: false,
    })
    expect(eventNeedLabel("OUT", { viewerAnswer: "KEEP" })).toEqual({
      text: "Needs other votes",
      needsViewer: false,
    })
  })
  it("settled card, no open proposal: bare", () => {
    expect(eventNeedLabel("IN", null)).toBeNull()
    expect(eventNeedLabel("OUT", null)).toBeNull()
  })
})

describe("ideaNeedLabel", () => {
  it("unvoted: needs your vote", () => {
    expect(ideaNeedLabel(null)).toEqual({ text: "Needs your vote", needsViewer: true })
  })
  it("viewer yes: needs other votes", () => {
    expect(ideaNeedLabel("IN")).toEqual({ text: "Needs other votes", needsViewer: false })
  })
  it("declined viewers see no card, so no label exists for them", () => {
    expect(ideaNeedLabel("OUT")).toBeNull()
    expect(ideaNeedLabel("NOT_THAT_DAY")).toBeNull()
  })
})
```

`src/components/__tests__/NeedLabel.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { NeedLabel } from "../NeedLabel"

afterEach(cleanup)

describe("NeedLabel", () => {
  it("renders nothing for a settled card", () => {
    const { container } = render(<NeedLabel value={null} />)
    expect(container.innerHTML).toBe("")
  })
  it("renders a needs-you label in the action teal", () => {
    render(<NeedLabel value={{ text: "Needs your RSVP", needsViewer: true }} />)
    const el = screen.getByText("Needs your RSVP")
    expect(el.style.color).toBe("var(--action)")
    expect(el.style.textTransform).toBe("uppercase")
  })
  it("renders an others-move label in quiet grey", () => {
    render(<NeedLabel value={{ text: "Needs other votes", needsViewer: false }} />)
    expect(screen.getByText("Needs other votes").style.color).toBe("var(--text-secondary)")
  })
})
```

- [ ] **Step 2: Run to verify both fail**

Run: `npx vitest run src/lib/cards src/components/__tests__/NeedLabel.test.tsx`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`src/lib/cards/region.ts`:

```ts
// src/lib/cards/region.ts
// The card region's brain: what shows, in what order, wearing which label.
// Pure on purpose, like lib/pending/derive.ts: page.tsx feeds it rows it
// already fetched; nothing here queries or stores.

/** Combined cap, confirmed and pending together (spec decision 5: the
 *  owner's answer to cap collisions, chosen over a slot-guarantee rule). */
export const CARD_REGION_CAP = 5

export type NeedLabelValue = { text: string; needsViewer: boolean }

/** The dense-face ladder (spec decision 6): the label names the card's
 *  highest outstanding need, the viewer's own before anyone else's, and is
 *  absent when the card needs nothing. */
export function eventNeedLabel(
  viewerRsvp: "IN" | "OUT" | null,
  openProposal: { viewerAnswer: "YES" | "KEEP" | null } | null
): NeedLabelValue | null {
  if (viewerRsvp === null) return { text: "Needs your RSVP", needsViewer: true }
  if (openProposal) {
    if (openProposal.viewerAnswer === null) return { text: "Needs your vote", needsViewer: true }
    return { text: "Needs other votes", needsViewer: false }
  }
  return null
}

export function ideaNeedLabel(
  viewerAnswer: "IN" | "OUT" | "NOT_THAT_DAY" | null
): NeedLabelValue | null {
  if (viewerAnswer === null) return { text: "Needs your vote", needsViewer: true }
  if (viewerAnswer === "IN") return { text: "Needs other votes", needsViewer: false }
  // A declined viewer's card is dropped before it ever gets here.
  return null
}

export type RegionEntry<E, I> =
  | { kind: "event"; sortMs: number; data: E }
  | { kind: "idea"; sortMs: number; item: I }

/** One list, pure date order, kinds mingled; a same-instant tie goes to the
 *  confirmed plan. Overflow past the cap simply is not shown in the region;
 *  chat still carries every item. */
export function composeCardRegion<E, I>(
  events: { sortMs: number; data: E }[],
  ideas: { sortMs: number; item: I }[],
  cap: number = CARD_REGION_CAP
): RegionEntry<E, I>[] {
  const entries: RegionEntry<E, I>[] = [
    ...events.map((e) => ({ kind: "event" as const, sortMs: e.sortMs, data: e.data })),
    ...ideas.map((i) => ({ kind: "idea" as const, sortMs: i.sortMs, item: i.item })),
  ]
  entries.sort((a, b) => {
    if (a.sortMs !== b.sortMs) return a.sortMs - b.sortMs
    if (a.kind === b.kind) return 0
    return a.kind === "event" ? -1 : 1
  })
  return entries.slice(0, cap)
}
```

`src/components/NeedLabel.tsx`:

```tsx
// src/components/NeedLabel.tsx
// The top-right eyebrow naming what a card still needs; absent when it needs
// nothing, so a settled card goes bare. Teal text when the need is the
// viewer's own move, quiet grey when it is other people's; the words carry
// the distinction on their own, so the color is reinforcement, never the
// only signal (spec decisions 2 and 6). In flow, right-aligned: long strings
// and enlarged text wrap instead of overlapping the title.
import type { NeedLabelValue } from "@/lib/cards/region"

export function NeedLabel({ value }: { value: NeedLabelValue | null }) {
  if (!value) return null
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", paddingBottom: 7 }}>
      <span
        style={{
          fontSize: "var(--type-eyebrow)",
          lineHeight: 1.35,
          letterSpacing: ".14em",
          textTransform: "uppercase",
          fontWeight: 700,
          textAlign: "right",
          color: value.needsViewer ? "var(--action)" : "var(--text-secondary)",
        }}
      >
        {value.text}
      </span>
    </div>
  )
}
```

- [ ] **Step 4: Run to verify both pass**

Run: `npx vitest run src/lib/cards src/components/__tests__/NeedLabel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cards src/components/NeedLabel.tsx src/components/__tests__/NeedLabel.test.tsx
git commit -m "Add region composition, the need-label ladder, and its component"
```

---

### Task 4: Rebuild the RSVP pair on the grammar and move it home

**Files:**
- Create: `src/components/RsvpControls.tsx` (moved from `src/app/events/[id]/RsvpControls.tsx`, rewritten)
- Delete: `src/app/events/[id]/RsvpControls.tsx`
- Modify: `src/app/groups/[id]/EventCard.tsx:23` (import path)
- Modify: `src/app/events/[id]/page.tsx` (import path; find the `RsvpControls` import near the top)
- Test: `src/components/__tests__/RsvpControls.test.tsx`

**Interfaces:**
- Consumes: `RsvpOption`, `ErrorLine` from `src/components/choice.tsx` (Task 2).
- Produces: `RsvpControls({ eventId, currentStatus, compact?, groupId? })`, default export, exact same props as today, new home `@/components/RsvpControls`.

- [ ] **Step 1: Write the failing test**

`src/components/__tests__/RsvpControls.test.tsx`:

```tsx
// @vitest-environment jsdom
//
// The action is mocked; under test is the ask-and-answer grammar itself,
// the correctness fix this slice exists for: nothing pre-selected, both
// options equal while open, the chosen answer and only the chosen answer
// filled after.

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react"
import RsvpControls from "../RsvpControls"

const rsvpMock = vi.fn(async (..._args: unknown[]) => ({}))
vi.mock("@/app/actions/rsvp", () => ({
  rsvpAction: (...args: unknown[]) => rsvpMock(...args),
}))

afterEach(() => {
  cleanup()
  rsvpMock.mockClear()
})

describe("RsvpControls", () => {
  it("unanswered: both options equal, teal borders, no fill, no checkmark", () => {
    render(<RsvpControls eventId="e1" currentStatus={null} compact />)
    const inBtn = screen.getByRole("button", { name: "I'm in" })
    const outBtn = screen.getByRole("button", { name: "Can't make it" })
    for (const btn of [inBtn, outBtn]) {
      expect(btn.style.border).toBe("1.5px solid var(--action)")
      expect(btn.style.backgroundColor).toBe("transparent")
    }
    expect(screen.queryByText(/✓/)).toBeNull()
  })

  it("answered IN: the yes fills teal with a checkmark, the no goes quiet", () => {
    render(<RsvpControls eventId="e1" currentStatus="IN" compact />)
    const pick = screen.getByRole("button", { name: "✓ I'm in" })
    const other = screen.getByRole("button", { name: "Can't make it" })
    expect(pick.style.backgroundColor).toBe("var(--action)")
    expect(pick.style.color).toBe("var(--action-ink)")
    expect(other.style.border).toBe("1.5px solid var(--hairline)")
  })

  it("answered OUT: the exact mirror, never red or green", () => {
    render(<RsvpControls eventId="e1" currentStatus="OUT" compact />)
    const pick = screen.getByRole("button", { name: "✓ Can't make it" })
    expect(pick.style.backgroundColor).toBe("var(--action)")
    expect(screen.getByRole("button", { name: "I'm in" }).style.backgroundColor).toBe("transparent")
  })

  it("flips optimistically on tap and calls the action", async () => {
    render(<RsvpControls eventId="e1" currentStatus={null} compact groupId="g1" />)
    fireEvent.click(screen.getByRole("button", { name: "I'm in" }))
    await waitFor(() => expect(rsvpMock).toHaveBeenCalledTimes(1))
    expect(screen.getByRole("button", { name: "✓ I'm in" })).toBeDefined()
  })

  it("surfaces the action's error line", async () => {
    rsvpMock.mockResolvedValueOnce({ errors: { general: "That event already ended." } })
    render(<RsvpControls eventId="e1" currentStatus={null} compact />)
    fireEvent.click(screen.getByRole("button", { name: "Can't make it" }))
    await waitFor(() => expect(screen.getByText("That event already ended.")).toBeDefined())
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/__tests__/RsvpControls.test.tsx`
Expected: FAIL, cannot resolve `../RsvpControls`.

- [ ] **Step 3: Implement the move and rewrite**

`git mv src/app/events/\[id\]/RsvpControls.tsx src/components/RsvpControls.tsx`, then replace its contents:

```tsx
// src/components/RsvpControls.tsx
"use client"
//
// The RSVP pair, rebuilt as an honest ask-and-answer control (spec decisions
// 1-3, closing the 12 Aug QA dark-pattern finding): while unanswered, both
// options are transparent with the action teal on BOTH borders, so the teal
// marks the question and leans toward neither answer; the chosen option
// fills teal with ink text and a checkmark, and the other drops to a quiet
// hairline. Same treatment on either side; a teal-filled "Can't make it" is
// the member's own settled answer, not a recommendation.
//
// Optimistic pattern unchanged from the original: the button flips
// instantly, useOptimistic reverts on write failure, the error line is
// surfaced, both buttons disable while a write is in flight (dimmed 0.65,
// no transition; this product ships no animation).
//
// Shared out of events/[id]/ because the group-home card renders it too;
// the old location was flagged tech debt from the day it was written.

import { useOptimistic, useTransition, useState } from "react"
import { rsvpAction } from "@/app/actions/rsvp"
import { RsvpStatus } from "@prisma/client"
import { ErrorLine, RsvpOption } from "./choice"

interface Props {
  eventId: string
  /** The viewer's current RSVP status, or null if they have not yet responded. */
  currentStatus: RsvpStatus | null
  /** Tighter padding for the compact home-screen card. */
  compact?: boolean
  /** Home-card callers pass this so the action revalidates the home route too. */
  groupId?: string
}

export default function RsvpControls({ eventId, currentStatus, compact = false, groupId }: Props) {
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(currentStatus)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handle(formData: FormData) {
    startTransition(async () => {
      const next = formData.get("status") as RsvpStatus
      setErrorMsg(null)
      setOptimisticStatus(next)
      const result = await rsvpAction({}, formData)
      if (result?.errors?.general) {
        setErrorMsg(result.errors.general)
      }
    })
  }

  // Geometry as shipped (round5 handoff: "geometry as shipped"); only the
  // state dress changed. The 1.5px border is now part of the state grammar
  // on both surfaces, superseding the old compact-only out-border note.
  const btnPadding = compact ? "0.375rem 0.75rem" : "0.625rem 1rem"
  const btnRadius = compact ? "24px" : "0.5rem"
  const rowGap = compact ? "0.6em" : "0.625rem"

  const stateFor = (own: RsvpStatus): "ask" | "pick" | "other" => {
    if (optimisticStatus === null) return "ask"
    return optimisticStatus === own ? "pick" : "other"
  }

  return (
    <form action={handle}>
      <input type="hidden" name="eventId" value={eventId} />
      {groupId && <input type="hidden" name="groupId" value={groupId} />}
      {errorMsg && (
        <div style={{ marginBottom: "0.75rem" }}>
          <ErrorLine msg={errorMsg} />
        </div>
      )}
      <div style={{ display: "flex", gap: rowGap, flexWrap: "wrap" }}>
        <RsvpOption
          value={RsvpStatus.IN}
          label="I'm in"
          state={stateFor(RsvpStatus.IN)}
          disabled={isPending}
          padding={btnPadding}
          radius={btnRadius}
        />
        <RsvpOption
          value={RsvpStatus.OUT}
          label="Can't make it"
          state={stateFor(RsvpStatus.OUT)}
          disabled={isPending}
          padding={btnPadding}
          radius={btnRadius}
        />
      </div>
    </form>
  )
}
```

Then update the two imports:
- `src/app/groups/[id]/EventCard.tsx`: `import RsvpControls from "@/components/RsvpControls"` (was `@/app/events/[id]/RsvpControls`); also delete the file-header tech-debt line about RsvpControls living under events/[id], it is paid now.
- `src/app/events/[id]/page.tsx`: same import-path change.

- [ ] **Step 4: Run the new test, then the whole suite**

Run: `npx vitest run src/components/__tests__/RsvpControls.test.tsx` then `npx vitest run`
Expected: new tests PASS; suite green (nothing else imported the old path besides the two callers).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Rebuild the RSVP pair as an honest ask-and-answer control"
```

---

### Task 5: Rebuild the three chip components on the grammar

**Files:**
- Modify: `src/app/groups/[id]/GaugeChips.tsx`
- Modify: `src/app/groups/[id]/GroupProposalChips.tsx`
- Modify: `src/app/groups/[id]/ProposalChips.tsx`
- Tests: existing files stay as the regression net; no new test files.

**Interfaces:**
- Consumes: `ChoiceChip`, `ChipRow`, `TallyLine`, `ErrorLine` from Task 2.
- Produces: every current export keeps its exact name, props, and behavior (`GaugeChips` default + `GaugeTally`, `GroupProposalChips` default + `GroupProposalTally`, `ProposalChips`), plus one addition: `GaugeChips` and `GroupProposalChips` gain an optional `rowMargin?: string` prop that, when set, overrides the chip row margin (used by the card surfaces in Tasks 6-7; when unset, behavior is byte-identical to today).

- [ ] **Step 1: Confirm the regression net is green first**

Run: `npx vitest run "src/app/groups/[id]/__tests__/GaugeChips.test.tsx" "src/app/groups/[id]/__tests__/GroupProposalChips.test.tsx" "src/app/groups/[id]/__tests__/ProposalChips.test.tsx"`
Expected: PASS (this is the could-have-failed evidence for a pure refactor: the same tests must still pass after).

- [ ] **Step 2: Refactor each component**

In each of the three, replace the hand-rolled button style block with `ChoiceChip`, the row div with `ChipRow`, and the error `<p>` with `ErrorLine`, keeping each component's own form, hidden inputs, optimistic hooks, and callbacks untouched. Margin logic, shared by GaugeChips and GroupProposalChips:

```tsx
const rowMarginValue = rowMargin ?? (indentPastAvatar ? "8px 0 0 37px" : "9px 0 0")
const errorMarginLeft = indentPastAvatar && !rowMargin ? 36 : 0
```

GaugeChips' render body becomes (hooks and `chips` array unchanged):

```tsx
return (
  <form action={handle}>
    <input type="hidden" name="gaugeId" value={gauge.id} />
    <ErrorLine msg={errorMsg} marginLeft={errorMarginLeft} />
    <ChipRow margin={rowMarginValue}>
      {chips.map(({ answer, label, quiet }) => (
        <ChoiceChip
          key={answer}
          name="answer"
          value={answer}
          label={label}
          selected={optimisticAnswer === answer}
          quiet={quiet}
          disabled={isPending}
        />
      ))}
    </ChipRow>
  </form>
)
```

`GaugeTally` becomes a delegation, keeping its export:

```tsx
export function GaugeTally({ line }: { line: string }) {
  return <TallyLine line={line} />
}
```

GroupProposalChips mirrors the same shape (its hidden input is `proposalId`, its two chips are YES full-strength and KEEP quiet) and keeps rendering its tally below the row:

```tsx
<GroupProposalTally line={proposal.tallyLine} indentPastAvatar={rowMargin ? false : indentPastAvatar} />
```

with

```tsx
export function GroupProposalTally({ line, indentPastAvatar = true }: { line: string; indentPastAvatar?: boolean }) {
  return <TallyLine line={line} marginLeft={indentPastAvatar ? 37 : 0} />
}
```

ProposalChips (asker-only confirm/decline) swaps its buttons for `ChoiceChip` and its error for `ErrorLine`; it has no indent prop and no tally, so nothing else changes.

Add `rowMargin?: string` to the two Props interfaces with a doc comment: "Card surfaces (IdeaCard, ProposalBand) pass an explicit margin; feed callers leave it unset."

- [ ] **Step 3: Run the full suite**

Run: `npx vitest run`
Expected: green, including the three untouched chip test files and PendingStrip's (it still consumes these components until Task 8 retires it).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Rebuild the three chip components on the shared choice grammar"
```

---

### Task 6: Trim derive to idea items and add proposal bands

**Files:**
- Modify: `src/lib/pending/derive.ts` (full rewrite below)
- Modify: `src/lib/orbit/change-copy.ts` (add `proposalBandQuestion` next to `proposalChipLabels`, around line 207)
- Modify: `src/lib/pending/__tests__/derive.test.ts`
- Note: `src/app/groups/[id]/PendingStrip.tsx` and `page.tsx` still import `derivePending`/`pendingStripWillRender` until Task 8; to keep the tree green in between, keep thin deprecated wrappers (shown below) that Task 8 deletes.

**Interfaces:**
- Consumes: existing `chipLabels`, `buildTallyLine`, `sparkStartInstant`, `formatTimeLocalLabel` (spark-copy), `proposalChipLabels`, `buildProposalTallyLine` (change-copy), `oneMoreClearsIt` (consensus), `formatWeekdayShort`, `formatTime` (events/format).
- Produces:
  - `interface IdeaItem { key: string; title: string; whenLine: string; sortMs: number; chips: FeedGauge }`
  - `deriveIdeaItems(input: { liveGauges: LiveGauge[]; viewerId: string; memberIds: Set<string>; timeZone: string }): IdeaItem[]` (declined viewers' gauges dropped; all others returned, viewer's answer inside `chips.viewerAnswer`; sorted soonest first)
  - `interface ProposalBandData { eventId: string; question: string; notice: string; chips: FeedGroupProposal }` (`question` is the detail-screen sentence, `notice` the card line's short question)
  - `deriveProposalBands(input: { liveProposals: LiveProposal[]; viewerId: string; memberIds: Set<string>; memberCount: number; timeZone: string }): Map<string, ProposalBandData>` keyed by eventId; GROUP kind only; NOT viewer-filtered (a KEEP voter still sees the band on the plan's card, their chip selected; only the label logic cares who answered)
  - `proposalBandQuestion(eventTitle: string, proposedStartsAt: Date, timeZone: string): string` returning `` `Move ${eventTitle} to ${formatTime(proposedStartsAt, timeZone)}?` ``
  - `proposalNoticeQuestion(proposedStartsAt: Date, timeZone: string): string` returning `` `Move to ${formatTime(proposedStartsAt, timeZone)}?` ``
  - Both are the owner's objective-copy ruling (spec decision 8): composed from stored facts, no asker constraint, no invented reason.

- [ ] **Step 1: Rewrite the tests first**

Rework `src/lib/pending/__tests__/derive.test.ts`: keep every existing gauge-tailoring case, retargeted from `derivePending().waiting/standingYes` to `deriveIdeaItems()` (a declined gauge absent; an unvoted and a yes-voted gauge both present with the right `chips.viewerAnswer`; soonest-first order; whenLine with and without a stored time). Delete the `pendingStripWillRender` describe block and the proposal-item cases. Add a `deriveProposalBands` describe block reusing the test fixtures the proposal-item cases used:

```ts
describe("deriveProposalBands", () => {
  it("keys the band by event id and keeps KEEP voters' bands visible", () => {
    const bands = deriveProposalBands({
      liveProposals: [proposalFixture({ viewerVote: "KEEP" })],
      viewerId: VIEWER,
      memberIds,
      memberCount: 4,
      timeZone: TZ,
    })
    const band = bands.get(proposalFixture().event.id)
    expect(band).toBeDefined()
    expect(band!.chips.viewerAnswer).toBe("KEEP")
  })
  it("composes the objective question and notice from stored facts alone", () => {
    const band = deriveProposalBands({ liveProposals: [proposalFixture()], viewerId: VIEWER, memberIds, memberCount: 4, timeZone: TZ }).get(proposalFixture().event.id)
    expect(band!.question).toBe("Move Friday beers to 8pm?")
    expect(band!.notice).toBe("Move to 8pm?")
  })
  it("ignores non-GROUP proposals", () => {
    const bands = deriveProposalBands({ liveProposals: [proposalFixture({ kind: "ASKER" })], viewerId: VIEWER, memberIds, memberCount: 4, timeZone: TZ })
    expect(bands.size).toBe(0)
  })
})
```

Adjust fixture builders to whatever the existing test file already provides (it has LiveGauge and LiveProposal fixtures; extend, do not rebuild). Match the existing fixture's title and proposed time in the question assertion (the string above assumes title "Friday beers" and 8pm; use the fixture's real values).

- [ ] **Step 2: Run to verify the reworked tests fail**

Run: `npx vitest run src/lib/pending`
Expected: FAIL on the new names.

- [ ] **Step 3: Implement**

Add to `src/lib/orbit/change-copy.ts`, directly under `proposalChipLabels`:

```ts
/** The proposal questions on the card notice and the detail screen (spec
 *  decision 8). Plain voice, no em dashes, deterministic, and deliberately
 *  impersonal: composed from stored rows at render, never stored, and never
 *  naming the asker's constraint (the owner's objective-copy ruling: the
 *  group answers the time, not the person). */
export function proposalBandQuestion(
  eventTitle: string,
  proposedStartsAt: Date,
  timeZone: string
): string {
  return `Move ${eventTitle} to ${formatTime(proposedStartsAt, timeZone)}?`
}

export function proposalNoticeQuestion(proposedStartsAt: Date, timeZone: string): string {
  return `Move to ${formatTime(proposedStartsAt, timeZone)}?`
}
```

(`formatTime` is already imported at the top of change-copy.ts; if not, add it from `@/lib/events/format`.)

Rewrite `src/lib/pending/derive.ts`: keep the gauge loop from today's `derivePending` byte-for-byte where possible, minus `kind`/`kindLine` and the waiting/standingYes split; add the band derivation; keep deprecated wrappers for the two old names so PendingStrip/page.tsx compile until Task 8:

```ts
export interface IdeaItem {
  key: string // gauge id
  title: string // gauge.activity, the member's own words, never rewritten
  whenLine: string // "Sat 10am"; "Sat" when proposedTime is null
  sortMs: number
  chips: FeedGauge
}

export function deriveIdeaItems(input: {
  liveGauges: LiveGauge[]
  viewerId: string
  memberIds: Set<string>
  timeZone: string
}): IdeaItem[] {
  const items: IdeaItem[] = []
  for (const g of input.liveGauges) {
    const viewerAnswer: GaugeAnswer | null =
      g.votes.find((v) => v.userId === input.viewerId)?.answer ?? null
    // A decline removes the card for that viewer (spec decision 9); the vote
    // stays recorded and arrives as OUT if the idea promotes.
    if (viewerAnswer === "OUT" || viewerAnswer === "NOT_THAT_DAY") continue
    const memberVotes = g.votes.filter((v) => input.memberIds.has(v.userId))
    const names = new Map(memberVotes.map((v) => [v.userId, v.user.name]))
    items.push({
      key: g.id,
      title: g.activity,
      whenLine: g.proposedTime
        ? `${formatWeekdayShort(g.proposedDate, input.timeZone)} ${formatTimeLocalLabel(g.proposedTime)}`
        : formatWeekdayShort(g.proposedDate, input.timeZone),
      sortMs: sparkStartInstant(g.proposedDate, g.proposedTime, input.timeZone).getTime(),
      chips: {
        id: g.id,
        orbitMessageId: g.orbitMessageId,
        tallyLine: buildTallyLine(memberVotes, names),
        labels: chipLabels(g.proposedDate, input.timeZone),
        viewerAnswer,
      },
    })
  }
  items.sort((a, b) => a.sortMs - b.sortMs)
  return items
}

export interface ProposalBandData {
  eventId: string
  question: string
  chips: FeedGroupProposal
}

export function deriveProposalBands(input: {
  liveProposals: LiveProposal[]
  viewerId: string
  memberIds: Set<string>
  memberCount: number
  timeZone: string
}): Map<string, ProposalBandData> {
  const bands = new Map<string, ProposalBandData>()
  for (const p of input.liveProposals) {
    if (p.kind !== "GROUP") continue
    const viewerAnswer: ProposalVoteAnswer | null =
      p.votes.find((v) => v.userId === input.viewerId)?.answer ?? null
    const memberVotes = p.votes.filter((v) => input.memberIds.has(v.userId))
    const yesVoters = memberVotes.filter((v) => v.answer === "YES")
    const consensus = {
      yesVoterIds: yesVoters.map((v) => v.userId),
      keepVoterIds: memberVotes.filter((v) => v.answer === "KEEP").map((v) => v.userId),
      currentInUserIds: p.event.rsvps
        .filter((r) => r.status === "IN" && input.memberIds.has(r.userId))
        .map((r) => r.userId),
      memberCount: input.memberCount,
    }
    bands.set(p.event.id, {
      eventId: p.event.id,
      question: proposalBandQuestion(p.event.title, p.proposedStartsAt, input.timeZone),
      notice: proposalNoticeQuestion(p.proposedStartsAt, input.timeZone),
      chips: {
        id: p.id,
        orbitMessageId: p.orbitMessageId,
        labels: proposalChipLabels(p.proposedStartsAt, p.priorStartsAt, input.timeZone),
        tallyLine: buildProposalTallyLine(
          yesVoters.map((v) => v.user.name),
          consensus.keepVoterIds.length,
          oneMoreClearsIt(consensus)
        ),
        viewerAnswer,
      },
    })
  }
  return bands
}
```

Keep, marked deprecated and deleted by Task 8, the old `PendingGaugeItem`/`PendingProposalItem`/`PendingData` types, `derivePending`, and `pendingStripWillRender`, implemented over today's logic unchanged, so the strip keeps compiling until it is deleted. Do not re-derive them from the new functions; leave the old code in place below a `// ── retiring with the strip (Task 8) ──` divider.

- [ ] **Step 4: Run the module tests, then the whole suite**

Run: `npx vitest run src/lib/pending` then `npx vitest run`
Expected: PASS; PendingStrip tests still green against the deprecated wrappers.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Derive idea items and proposal bands for the card region"
```

---

### Task 7: IdeaCard, the proposal notice, the detail-screen vote, and the stretch rule

**Files:**
- Create: `src/app/groups/[id]/IdeaCard.tsx`
- Create: `src/app/events/[id]/ProposalSection.tsx`
- Modify: `src/app/groups/[id]/EventCard.tsx`
- Modify: `src/app/events/[id]/page.tsx` (fetch the event's open GROUP proposal, render the section between the details card and the Add to calendar button)
- Modify: `src/app/actions/proposal-vote.ts` (also revalidate the event's detail path on success, since votes now happen there)
- Test: `src/app/groups/[id]/__tests__/IdeaCard.test.tsx`
- Test: `src/app/groups/[id]/__tests__/EventCard.test.tsx`
- Test: `src/app/events/[id]/__tests__/ProposalSection.test.tsx`

**Interfaces:**
- Consumes: `IdeaItem`, `ProposalBandData` (Task 6), `ideaNeedLabel`, `eventNeedLabel` (Task 3), `NeedLabel`, `TallyLine`, chips with `rowMargin` (Task 5), `RsvpControls` (Task 4).
- Produces:
  - `IdeaCard({ item }: { item: IdeaItem })` default export.
  - `ProposalSection({ band }: { band: ProposalBandData })` default export (event-detail server component).
  - `EventCard` props gain `proposal?: ProposalBandData | null` (default null); it renders the need-label ladder and, when a proposal exists, the footer notice line linking to `/events/[id]`; it never renders chips for the proposal.
  - Both cards implement the board-06 stretch: card root `height: "100%"`, column flex; padded interior `flex: "1 1 auto"`, column flex; the answer block wrapped in a div with `marginTop: "auto"`.

- [ ] **Step 1: Write the failing tests**

`src/app/groups/[id]/__tests__/IdeaCard.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import IdeaCard from "../IdeaCard"
import type { IdeaItem } from "@/lib/pending/derive"

vi.mock("@/app/actions/gauge-vote", () => ({
  gaugeVoteAction: vi.fn(async () => ({})),
}))

afterEach(cleanup)

const ITEM: IdeaItem = {
  key: "g1",
  title: "Beers",
  whenLine: "Fri 7pm",
  sortMs: 0,
  chips: {
    id: "g1",
    orbitMessageId: "m1",
    tallyLine: "Rowan is in so far",
    labels: { in: "🍻 I'm in", out: "🙏 Next time", notThatDay: "📅 Yes, can't Fri" },
    viewerAnswer: null,
  },
}

describe("IdeaCard", () => {
  it("titles the idea with a question mark: a maybe, not a plan", () => {
    render(<IdeaCard item={ITEM} />)
    expect(screen.getByText("Beers?")).toBeDefined()
  })
  it("shows the when-line with the fixed Place TBD segment", () => {
    render(<IdeaCard item={ITEM} />)
    expect(screen.getByText("Fri 7pm · Place TBD")).toBeDefined()
  })
  it("labels an unvoted card NEEDS YOUR VOTE in teal, and a voted one NEEDS OTHER VOTES in grey", () => {
    const { unmount } = render(<IdeaCard item={ITEM} />)
    expect(screen.getByText("Needs your vote").style.color).toBe("var(--action)")
    unmount()
    render(<IdeaCard item={{ ...ITEM, chips: { ...ITEM.chips, viewerAnswer: "IN" } }} />)
    expect(screen.getByText("Needs other votes").style.color).toBe("var(--text-secondary)")
  })
  it("renders the shipped chips and the tally", () => {
    render(<IdeaCard item={ITEM} />)
    expect(screen.getByRole("button", { name: "🍻 I'm in" })).toBeDefined()
    expect(screen.getByRole("button", { name: "📅 Yes, can't Fri" })).toBeDefined()
    expect(screen.getByText("Rowan is in so far")).toBeDefined()
  })
  it("does not append a second question mark if the activity already ends with one", () => {
    render(<IdeaCard item={{ ...ITEM, title: "Beers?" }} />)
    expect(screen.getByText("Beers?")).toBeDefined()
    expect(screen.queryByText("Beers??")).toBeNull()
  })
  it("stretches: column shell with the ask block bottom-anchored (board 06)", () => {
    const { container } = render(<IdeaCard item={ITEM} />)
    const root = container.firstElementChild as HTMLElement
    expect(root.style.height).toBe("100%")
    expect(root.style.flexDirection).toBe("column")
    const ask = container.querySelector("[data-ask]") as HTMLElement
    expect(ask.style.marginTop).toBe("auto")
  })
})
```

`src/app/groups/[id]/__tests__/EventCard.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import EventCard from "../EventCard"
import type { ProposalBandData } from "@/lib/pending/derive"

vi.mock("@/app/actions/rsvp", () => ({ rsvpAction: vi.fn(async () => ({})) }))

afterEach(cleanup)

const EVENT = {
  id: "e1",
  title: "Friday beers",
  startsAt: new Date("2026-08-14T19:00:00-06:00"),
  endsAt: null,
  venues: [{ displayLabel: "Barcade", name: "Barcade Denver" }],
}

const BAND: ProposalBandData = {
  eventId: "e1",
  question: "Move Friday beers to 8pm?",
  notice: "Move to 8pm?",
  chips: {
    id: "p1",
    orbitMessageId: "m1",
    labels: { yes: "8pm works", keep: "Keep 7pm" },
    tallyLine: "Sam says yes",
    viewerAnswer: null,
  },
}

function renderCard(overrides: Partial<Parameters<typeof EventCard>[0]> = {}) {
  return render(
    <EventCard
      event={EVENT}
      groupId="g1"
      timeZone="America/Denver"
      inCount={3}
      outCount={1}
      pendingCount={5}
      viewerStatus={null}
      viewerHasSession
      {...overrides}
    />
  )
}

describe("EventCard need label and proposal notice", () => {
  it("unanswered, no proposal: NEEDS YOUR RSVP in teal", () => {
    renderCard()
    expect(screen.getByText("Needs your RSVP").style.color).toBe("var(--action)")
  })
  it("answered, no proposal: bare", () => {
    renderCard({ viewerStatus: "IN" })
    expect(screen.queryByText(/Needs/)).toBeNull()
  })
  it("the ladder: RSVP settled with an unanswered proposal asks for the vote", () => {
    renderCard({ viewerStatus: "IN", proposal: BAND })
    expect(screen.getByText("Needs your vote").style.color).toBe("var(--action)")
  })
  it("the ladder: both answered goes grey until others vote", () => {
    renderCard({ viewerStatus: "IN", proposal: { ...BAND, chips: { ...BAND.chips, viewerAnswer: "KEEP" } } })
    expect(screen.getByText("Needs other votes").style.color).toBe("var(--text-secondary)")
  })
  it("renders the notice line as a link to the event, with the objective question", () => {
    renderCard({ proposal: BAND })
    const line = screen.getByText("Move to 8pm?").closest("a") as HTMLAnchorElement
    expect(line.getAttribute("href")).toBe("/events/e1")
    expect(screen.getByText(/Time change proposed/)).toBeDefined()
  })
  it("never renders proposal chips on the card", () => {
    renderCard({ proposal: BAND })
    expect(screen.queryByRole("button", { name: "8pm works" })).toBeNull()
  })
  it("no notice renders when there is no open proposal", () => {
    renderCard()
    expect(screen.queryByText(/Time change proposed/)).toBeNull()
  })
})
```

`src/app/events/[id]/__tests__/ProposalSection.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import ProposalSection from "../ProposalSection"
import type { ProposalBandData } from "@/lib/pending/derive"

vi.mock("@/app/actions/proposal-vote", () => ({ proposalVoteAction: vi.fn(async () => ({})) }))

afterEach(cleanup)

const BAND: ProposalBandData = {
  eventId: "e1",
  question: "Move Friday beers to 8pm?",
  notice: "Move to 8pm?",
  chips: {
    id: "p1",
    orbitMessageId: "m1",
    labels: { yes: "8pm works", keep: "Keep 7pm" },
    tallyLine: "Maya & Rowan want 8pm so far · one more makes it happen",
    viewerAnswer: null,
  },
}

describe("ProposalSection", () => {
  it("renders the section label, the objective question, the shipped chips, and the tally", () => {
    render(<ProposalSection band={BAND} />)
    expect(screen.getByText("Time change")).toBeDefined()
    expect(screen.getByText("Move Friday beers to 8pm?")).toBeDefined()
    expect(screen.getByRole("button", { name: "8pm works" })).toBeDefined()
    expect(screen.getByRole("button", { name: "Keep 7pm" })).toBeDefined()
    expect(screen.getByText("Maya & Rowan want 8pm so far · one more makes it happen")).toBeDefined()
  })
  it("marks the viewer's standing vote", () => {
    render(<ProposalSection band={{ ...BAND, chips: { ...BAND.chips, viewerAnswer: "YES" } }} />)
    expect(screen.getByRole("button", { name: "✓ 8pm works" })).toBeDefined()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run "src/app/groups/[id]/__tests__/IdeaCard.test.tsx" "src/app/groups/[id]/__tests__/EventCard.test.tsx" "src/app/events/[id]/__tests__/ProposalSection.test.tsx"`
Expected: FAIL (missing components, missing props).

- [ ] **Step 3: Implement**

`src/app/groups/[id]/IdeaCard.tsx`:

```tsx
// src/app/groups/[id]/IdeaCard.tsx
// An idea being gauged, living in the carousel beside confirmed cards.
// Subordinate by brightness and structure, never hue (spec decision 7): flat
// --surface-base, a single hairline, no shadow, body-size title, no chevron
// (there is no detail screen behind an idea). The title carries a question
// mark, a maybe and not a plan; "Place TBD" is fixed copy, kept by the owner
// because an empty spot where a place should be reads as a bug. The shell
// stretches to the region's height and the ask block anchors to the bottom
// baseline (board 06, spec decision 8), so slack reads as mid-card air.
import GaugeChips from "./GaugeChips"
import { NeedLabel } from "@/components/NeedLabel"
import { TallyLine } from "@/components/choice"
import { ideaNeedLabel } from "@/lib/cards/region"
import type { IdeaItem } from "@/lib/pending/derive"

export default function IdeaCard({ item }: { item: IdeaItem }) {
  const title = item.title.endsWith("?") ? item.title : `${item.title}?`
  return (
    <div
      style={{
        backgroundColor: "var(--surface-base)",
        border: "1px solid var(--hairline)",
        borderRadius: "14px",
        overflow: "hidden",
        flexShrink: 0,
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "14px 15px 13px",
          flex: "1 1 auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <NeedLabel value={ideaNeedLabel(item.chips.viewerAnswer)} />
        <p
          style={{
            fontSize: "var(--type-body)",
            lineHeight: "var(--leading-tight)",
            fontWeight: 700,
            color: "var(--text-primary)",
            textWrap: "balance",
          }}
        >
          {title}
        </p>
        <p
          style={{
            fontSize: "var(--type-meta)",
            lineHeight: "var(--leading-normal)",
            color: "var(--text-secondary)",
            marginTop: "0.5em",
          }}
        >
          {item.whenLine} · Place TBD
        </p>
        <div data-ask style={{ marginTop: "auto", paddingTop: "0.55em" }}>
          <GaugeChips gauge={item.chips} indentPastAvatar={false} rowMargin="11px 0 0" />
          <TallyLine line={item.chips.tallyLine} marginTop={10} />
        </div>
      </div>
    </div>
  )
}
```

`src/app/events/[id]/ProposalSection.tsx`:

```tsx
// src/app/events/[id]/ProposalSection.tsx
// The open time-change vote, on the plan it is about (spec decision 8,
// round-6 variant A): placed by the caller between the details card and the
// Add to calendar button, because it amends the time the calendar would
// save. The question is deterministic and deliberately impersonal: the
// group answers the time, never the asker's circumstances.
import GroupProposalChips from "@/app/groups/[id]/GroupProposalChips"
import type { ProposalBandData } from "@/lib/pending/derive"

export default function ProposalSection({ band }: { band: ProposalBandData }) {
  return (
    <div
      style={{
        backgroundColor: "var(--surface-raised)",
        border: "1px solid var(--hairline)",
        borderRadius: "14px",
        padding: "14px 15px 15px",
      }}
    >
      <p
        style={{
          fontSize: "var(--type-eyebrow)",
          lineHeight: 1.35,
          letterSpacing: ".14em",
          textTransform: "uppercase",
          fontWeight: 700,
          color: "var(--text-faint)",
        }}
      >
        Time change
      </p>
      <p
        style={{
          fontSize: "var(--type-body)",
          lineHeight: "var(--leading-normal)",
          fontWeight: 600,
          color: "var(--text-primary)",
          marginTop: 7,
          textWrap: "pretty",
        }}
      >
        {band.question}
      </p>
      <GroupProposalChips proposal={band.chips} indentPastAvatar={false} rowMargin="10px 0 0" />
    </div>
  )
}
```

(Match the section shell to the detail screen's existing card idiom when integrating: read the neighboring cards in `src/app/events/[id]/page.tsx` and reuse their exact shell styles if they differ from the above; the board's intent is "a shipped detail-screen card", not a new shell.)

`src/app/groups/[id]/EventCard.tsx` changes:
1. Add imports: `import { NeedLabel } from "@/components/NeedLabel"`, `import { eventNeedLabel } from "@/lib/cards/region"`, `import type { ProposalBandData } from "@/lib/pending/derive"`.
2. Props: add `proposal?: ProposalBandData | null` (destructure with `proposal = null`).
3. Board-06 stretch on the shell: card root gains `height: "100%", display: "flex", flexDirection: "column"`; the padded div gains `flex: "1 1 auto", display: "flex", flexDirection: "column"`; wrap the RSVP block in `<div data-ask style={{ marginTop: "auto", paddingTop: "0.95em" }}>` (replacing its current `marginTop: "0.95em"` wrapper).
4. At the top of the padded div, before the `<Link>`:

```tsx
{viewerHasSession && (
  <NeedLabel
    value={eventNeedLabel(
      viewerStatus,
      proposal ? { viewerAnswer: proposal.chips.viewerAnswer } : null
    )}
  />
)}
```

5. After the padded div's closing tag, still inside the card root (whose `overflow: hidden` squares the line against the card radius), the footer notice:

```tsx
{viewerHasSession && proposal && (
  <Link
    href={`/events/${event.id}`}
    style={{
      display: "flex",
      alignItems: "center",
      gap: 9,
      borderTop: "1px solid var(--hairline)",
      backgroundColor: "var(--surface-base)",
      padding: "10px 15px",
      textDecoration: "none",
    }}
  >
    <svg viewBox="0 0 24 24" style={{ width: 15, height: 15, flexShrink: 0 }} fill="none" stroke="var(--text-secondary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M17 3l4 4-4 4M21 7H7M7 21l-4-4 4-4M3 17h14" /></svg>
    <span style={{ flex: "1 1 auto", minWidth: 0, fontSize: "var(--type-label)", lineHeight: "var(--leading-normal)", fontWeight: 600, color: "var(--text-secondary)" }}>
      Time change proposed · <b style={{ color: "var(--text-primary)", fontWeight: 700 }}>{proposal.notice}</b>
    </span>
    <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, flexShrink: 0 }} fill="none" stroke="var(--text-faint)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
  </Link>
)}
```

6. Update the file-header comment: the teal-primary/outlined-secondary description is superseded by the ask-and-answer grammar and the notice line; point at spec decisions 1-3 and 8.

`src/app/events/[id]/page.tsx` changes: fetch the event's open GROUP proposal (reuse the group-scoped live-proposals read the group home uses, filtered to this event id, with the page's existing membership context), build the band via `deriveProposalBands` keyed lookup, and render `<ProposalSection band={band} />` between the details card and the Add to calendar button when a band exists.

`src/app/actions/proposal-vote.ts` change: on a successful vote, additionally `revalidatePath` the event's detail route (the proposal row carries its event id), so a vote cast on the detail screen re-renders in place. Keep the existing group-home revalidation.

- [ ] **Step 4: Run the new tests, then the whole suite**

Run: `npx vitest run "src/app/groups/[id]/__tests__" "src/app/events/[id]/__tests__"` then `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add IdeaCard, the proposal notice and detail vote, and the stretch rule"
```

---

### Task 8: The mixed carousel, the page rewiring, and the strip's retirement

**Files:**
- Modify: `src/app/groups/[id]/EventCarousel.tsx`
- Modify: `src/app/groups/[id]/page.tsx`
- Modify: `src/app/groups/[id]/GroupHome.tsx` (remove `stripAbove` prop end to end)
- Modify: `src/app/groups/[id]/MessageFeed.tsx` (remove `stripAbove`; keep the no-strip padding branch as the only branch)
- Modify: `src/lib/events/upcoming-list.ts` call site only (the limit argument lives in page.tsx)
- Delete: `src/app/groups/[id]/PendingStrip.tsx`
- Delete: `src/app/groups/[id]/__tests__/PendingStrip.test.tsx`
- Modify: `src/lib/pending/derive.ts` (delete the `// ── retiring with the strip (Task 8) ──` block)
- Test: extend `src/lib/cards/__tests__/region.test.ts` only if a gap is found; the carousel render path is covered by CarouselRail's existing tests.

**Interfaces:**
- Consumes: `composeCardRegion`, `CARD_REGION_CAP`, `RegionEntry` (Task 3); `deriveIdeaItems`, `deriveProposalBands`, `IdeaItem`, `ProposalBandData` (Task 6); `IdeaCard`, `EventCard` with `proposal` (Task 7).
- Produces: `EventCarousel({ entries, groupId, timeZone, viewerHasSession, proposals }: { entries: RegionEntry<EventCardData, IdeaItem>[]; groupId: string; timeZone: string; viewerHasSession: boolean; proposals: Map<string, ProposalBandData> })`.

- [ ] **Step 1: Rewrite EventCarousel**

Keep the server-component + CarouselRail split and the single-card bare rule. The board-06
stretch needs the wrapper divs to keep flex's default `align-items: stretch` (they already
do) and the card roots' `height: 100%` from Task 7; nothing in the rail itself changes for
it. The map becomes:

```tsx
export default function EventCarousel({ entries, groupId, timeZone, viewerHasSession, proposals }: Props) {
  const single = entries.length === 1
  return (
    <CarouselRail cardCount={entries.length}>
      {entries.map((entry) => (
        <div
          key={entry.kind === "event" ? entry.data.event.id : entry.item.key}
          style={{
            flex: single ? "1 0 100%" : "0 0 calc(100% - 16px)",
            minWidth: 0,
            scrollSnapAlign: "start",
          }}
        >
          {entry.kind === "event" ? (
            <EventCard
              event={entry.data.event}
              groupId={groupId}
              timeZone={timeZone}
              inCount={entry.data.inCount}
              outCount={entry.data.outCount}
              pendingCount={entry.data.pendingCount}
              viewerStatus={entry.data.viewerStatus}
              viewerHasSession={viewerHasSession}
              proposal={proposals.get(entry.data.event.id) ?? null}
            />
          ) : (
            <IdeaCard item={entry.item} />
          )}
        </div>
      ))}
    </CarouselRail>
  )
}
```

- [ ] **Step 2: Rewire page.tsx**

In `src/app/groups/[id]/page.tsx`:
1. `findUpcomingEvents(group.id, new Date(), 3)` becomes `findUpcomingEvents(group.id, new Date(), CARD_REGION_CAP)`; update the comment (five is the display cap, combined with ideas; a sixth item waits its turn in chat).
2. Replace the `derivePending`/`pendingStripWillRender`/`stripRenders` block with:

```tsx
const ideas = viewer
  ? deriveIdeaItems({ liveGauges, viewerId: viewer.id, memberIds, timeZone: group.timeZone })
  : []
const proposalBands = viewer
  ? deriveProposalBands({ liveProposals, viewerId: viewer.id, memberIds, memberCount, timeZone: group.timeZone })
  : new Map<string, ProposalBandData>()
const entries = composeCardRegion(
  cards.map((c) => ({ sortMs: c.event.startsAt.getTime(), data: c })),
  ideas.map((i) => ({ sortMs: i.sortMs, item: i }))
)
```

(`liveProposals` is already fetched for the feed; reuse that variable.)
3. The pinned-region wrapper: padding becomes `` `0.75rem ${entries.length > 1 ? 0 : "1rem"} 0` `` (the strip's air-above is gone); the branch tests `entries.length > 0` and renders `<EventCarousel entries={entries} groupId={group.id} timeZone={group.timeZone} viewerHasSession={viewer !== null} proposals={proposalBands} />`; the empty-state box now renders only when `entries.length === 0`, which is the both-empty branch (spec decision 11).
4. Delete the `<PendingStrip>` render, its import, and the `pending` computation.
5. `GroupHome` call site: drop the `stripAbove` prop.

- [ ] **Step 3: Retire the strip and the dead derive code**

```bash
git rm "src/app/groups/[id]/PendingStrip.tsx" "src/app/groups/[id]/__tests__/PendingStrip.test.tsx"
```

Remove the deprecated block from `src/lib/pending/derive.ts` (old types, `derivePending`, `pendingStripWillRender`). Remove `stripAbove` from `GroupHome.tsx` and `MessageFeed.tsx`, keeping the padding value the no-strip branch uses today; update `MessageFeed`'s and `GroupHome`'s tests if they pass `stripAbove` (search for the prop name; adjust those call sites to the removed signature).

- [ ] **Step 4: Full suite, typecheck, lint**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all green; the only deleted tests are PendingStrip's own. Any other test that fails here is a regression to fix, not to delete.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Mingle ideas into the carousel and retire the pending strip"
```

---

### Task 9: The record: CLAUDE.md, build-notes, the decision-record postscript

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/build-notes.md` (complete the §11 entry opened in Task 1)
- Modify: `docs/superpowers/specs/2026-08-11-strip-placement-call-decision.md` (append-only postscript)

**Interfaces:** none; this is the slice's documentation duty (spec, "Doc obligations").

- [ ] **Step 1: CLAUDE.md edits** (each is a surgical edit; keep the file terse)

1. Color section, the teal bullet: replace the two 11 Aug amendment sub-bullets' *current-state* claims as follows: strike the strip-wash sub-bullet's operative force with a dated note ("Retired 12 Aug 2026 with the pending strip itself; the wash left with it (card-state-grammar slice)"), and add one new sub-bullet: "Amended 12 Aug 2026 (card-state-grammar slice): teal never leans an open question. When a control offers two or more equally valid answers, the options carry equal weight while open: both quiet (the gauge chips) or both carrying the same teal mark (the unanswered RSVP pair's borders, marking the ask itself). Only an answer the member chose may hold the teal fill. A need label naming the viewer's own move (NEEDS YOUR RSVP, NEEDS YOUR VOTE) renders in teal; a label naming other people's move (NEEDS OTHER VOTES) stays grey. Scanning the card region for teal is scanning for what needs you."
2. Cards & layout section: update the event-card sentence ("teal primary plus outlined secondary on the event card") to "the event card's RSVP pair is an ask-and-answer control (both borders teal while unanswered, the chosen answer filled after)".
3. "Where the build is": replace the pending-strip paragraph ("Unanswered ideas now have a second home besides chat...") with a paragraph stating the strip is retired and pending items are cards in the carousel: pure date order mingled with confirmed events, cap five combined, idea cards subordinate by structure with "Beers?" titles and Place TBD, need labels per the ladder, proposals as a band on their event's own card, the caught-up note retired with nothing in its place. Point at build-notes §11 for reasoning.
4. Settled list: append the new settled decisions with the 12 Aug date: chronological order with ties to confirmed; cap five combined; the need-label ladder with teal for needs-you; decline drops the idea card for that viewer; "Beers?" titling; Place TBD as fixed copy; the proposal band on the event card; the caught-up note's deliberate retirement.
5. In "Where the build is", the next-slice line: confirm polish slice two remains next after this slice lands (no change needed unless the owner reorders).

- [ ] **Step 2: Complete the build-notes §11 entry**

Extend the Task 1 stub into the slice's full entry, product language: what was built and why (the dark-pattern finding, the fired revisit trigger), the decisions with reasoning (cite the spec rather than restating all of it), the five deliberate departures from the round-5 boards, the baseline and finishing test counts, the walkthrough evidence list (filled during Task 10), and the debt opened (overflow past five with its trigger; the proposal on an off-region card; mixed-height dead space; the written-off strip polish).

- [ ] **Step 3: Append the postscript to the strip-placement decision record**

At the end of `docs/superpowers/specs/2026-08-11-strip-placement-call-decision.md`:

```markdown
## Postscript, 12 Aug 2026

The revisit trigger fired early: seeing the dressed strip on a real phone was
enough, launch not required. The carousel option revived with its own design
round and shipped as the card-state-grammar slice; the two questions this
record said would need fresh answers were answered there (caught-up state:
nothing, cards simply absent; subordination: structure plus the need-label
system, never hue). See docs/superpowers/specs/2026-08-12-card-state-grammar-design.md.
```

- [ ] **Step 4: Pre-deploy checklist**

Nothing to add: no migration, no environment variable, no model call. Verify by inspection that the diff contains none of the three; state this in the PR body.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/build-notes.md docs/superpowers/specs/2026-08-11-strip-placement-call-decision.md
git commit -m "Record the card-state-grammar slice in the standing docs"
```

---

### Task 10: Walkthrough evidence, QA handoff, and the PR

**Files:**
- Modify: `docs/build-notes.md` (walkthrough evidence into the §11 entry)
- No code changes expected; fixes discovered here get their own commits.

**Interfaces:** consumes everything; produces the PR.

- [ ] **Step 1: Confirm the database and seed a walkthrough group**

Run: `npm run db:which`
Expected: exits zero naming the dev-test ref `pxbewardwvoyqqcvogel`. STOP if not.
Seed (or reuse) a dev-test group with: one confirmed upcoming event with no viewer RSVP, one live gauge on an earlier day than that event, and one open GROUP time-change proposal on the event. Use the project's existing seed scripts where they exist; otherwise create rows through the real UI flows (onboarding, chat spark, chat change request) in a browser session.

- [ ] **Step 2: Walk the spec's Part 3 item 4 list, capturing screenshots**

Dev server via the browser preview (never Bash). Multi-session: three browser sessions joined via the invite link. Capture, named for the PR:
1. Unanswered card: both RSVP borders teal and equal, teal "NEEDS YOUR RSVP", no checkmark anywhere.
2. Tap "Can't make it": teal moves to the chosen side with the checkmark; label gone.
3. Idea card ahead of the confirmed Saturday event (date order), flat shell, "Beers?" title, "Fri 7pm · Place TBD", teal "NEEDS YOUR VOTE".
4. Chip yes on the card: label flips grey "NEEDS OTHER VOTES", chat tally matches the card tally (same rows).
5. Third yes from a card chip: event created, card converts in place, chat announces once.
6. Decline clearing the viewer's last idea card: the card leaves, nothing else fires (no caught-up note anywhere).
7. The proposal flow end to end: the notice line ("Time change proposed · Move to 8pm?") on the event's card, structurally an attachment, tapping through to the detail screen; the proposal section sitting between the details card and Add to calendar with the objective question, shipped chip copy ("8pm works" / "Keep 7pm"), and the names tally; a vote there updating chat's tally and the card's label (same rows); the label ladder walking RSVP → vote → other votes as the viewer answers each.
8. The proposal clearing the bar: plan moves, RSVPs reset, the notice and section leave, the card label returns to "NEEDS YOUR RSVP" for a reset viewer.
9. The board-06 rule: with a short idea card beside a taller confirmed card, no dead background below either; both shells run the region's full height; the answer rows sit on a shared baseline above the dots.
Also: event detail page shows the same pair grammar with no label; the rendered screens compared side by side against `round5-design-reference.html` (boards 01-04, 06) and `round6-design-reference.html` (boards 01, 03, 06), served statically via the existing `design-static` launch config, with the departures named in spec decisions 8 and 13 as the only differences.

- [ ] **Step 3: Write the evidence into §11 and commit**

```bash
git add docs/build-notes.md
git commit -m "Record the card-state-grammar walkthrough evidence"
```

- [ ] **Step 4: Open the PR per the handoff checklist**

Follow `~/.claude/checklists/pr-handoff.md` in full. The PR body must carry: the product framing; baseline and after test counts; the review report section (what the independent read-only review found, fixed, and deliberately did not fix); open questions for the owner (include, all deferred to the owner's phone: the label copy judgment, whether the stretched region reads as calm rather than padded, and whether the proposal notice line is discoverable enough); every touch outside the plan's named files; the board departures named in spec decisions 8 and 13; and the QA script (ten minutes or less, on the owner's phone, including the re-judgments from the spec's Part 3 item 6). State plainly that no migration, environment variable, or model call was added. Open the PR and STOP; never merge.

---

## Self-review notes (run before handoff)

- Spec coverage: decisions 1-3 → Tasks 2/4; 4 → Task 8; 5 → Tasks 3/8; 6 → Tasks 3/7; 7 → Tasks 6/7; 8 → Tasks 6/7; 9 → Task 6 (decline drop) + existing RSVP carry-through (already shipped, verified in walkthrough step 5); 10 → Task 8 (deletion) + walkthrough step 6; 11 → Task 8 (empty-state branch); 12 → Tasks 2/4/5; 13 → global constraints + walkthrough comparison. Verification Part 3 → Tasks 1 (baseline), 2-8 (tests), 10 (walkthrough, comparison, QA). Debt Part 4 → recorded in Task 9.
- Type consistency: `IdeaItem`, `ProposalBandData`, `RegionEntry<E, I>`, `NeedLabelValue`, `rowMargin` are defined once (Tasks 3/6) and consumed by name in Tasks 5/7/8.
- The `"IN" | "OUT"` string literals in region.ts deliberately mirror Prisma's enum values so region.ts stays import-free of @prisma/client; EventCard passes `viewerStatus` (a Prisma enum whose values are those strings) directly.
