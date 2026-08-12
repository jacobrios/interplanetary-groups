# Handoff: Round 5 — the card region: honest RSVP pair, pending ideas as cards

## Overview
Two changes to the group home's top carousel. Everything else on the screen ships as it is today.

1. **Honest RSVP pair** — the confirmed event card's "I'm in" / "Can't make it" pair stops presuming
   a yes. Unanswered: both options transparent with a `--action` teal border, visually equal. Answered:
   the chosen side fills with teal, ink text and a checkmark; the other drops to a quiet hairline
   outline. A "NEEDS YOUR RSVP" label sits top right until the viewer answers.
2. **Pending strip retires** — interest gauges and time-change proposals leave the strip/panel and
   become cards in the top carousel, mingled with confirmed event cards in pure date order. A
   time-change proposal on a confirmed event rides on that event's own card as a recessed band.

**Typeface change:** the product has moved to **Geist** everywhere. `round5-cards.css` remaps
`--display` and `--ui` to Geist; weights and the type scale are unchanged. Load Geist (400–900).

## About the design files
Design references created in HTML — prototypes of the intended look, not production code. Recreate
them in the target codebase's environment with its established components. `round5-cards.css` is real,
complete CSS and the source of truth for every measurement; port the values, not the file.

## Fidelity
**High fidelity.** Final colours, type roles, spacing and copy. Everything is built from existing
tokens and reuses shipped components (event card shell, gauge chips, carousel chrome) verbatim.
Frames are card-region isolates at 390px width.

---

## Components

### 01 — RSVP pair, unanswered (`.gh-rsvp.ask`)
- Both options: `background: transparent`, `border: 1.5px solid var(--action)`, label
  `--text-primary` at `--type-label` weight 600. Geometry as shipped (`min-width: 10.2em`,
  `min-height: 2.9em` in `.slim`, radius 24, 50/50 flex; they stack when they cannot sit side by side).
- **No checkmark** on either option: the check is a state marker and no state exists yet.
- The teal marks the ask itself and leans toward neither answer. This is one of exactly two permitted
  teal uses in the card region.

### 02 — RSVP pair, answered (`.gh-rsvp.done`)
- Chosen option gets `.pick`: fill `--action`, `border: 1.5px solid var(--action)`, text
  `--action-ink` weight 700, checkmark svg at 1.05em stroke `--action-ink`.
- Other option gets `.other`: transparent, `border: 1.5px solid var(--hairline)`, `--text-secondary`
  weight 600. Still tappable to change the answer.
- Same treatment on either side: "Can't make it" chosen is the exact mirror. Never red/green.
- The counts line updates with the answer. No top-right label on a settled card.

### 03 — Need label (`.gh-need`)
- A full-width row at the top of the card padding, content right-aligned: `13px` (`--type-eyebrow`,
  the hard floor) uppercase, `letter-spacing: .14em`, weight 700, `--text-secondary`,
  `padding-bottom: 7px`. In flow, so long strings and enlarged text wrap instead of overlapping.
- Strings (working copy): `NEEDS YOUR RSVP` (confirmed, unanswered) · `NEEDS YOUR VOTE` (pending,
  unvoted) · `NEEDS MORE VOTES` (pending, viewer voted, threshold not met).
- System rule: the label names what the card still needs and is **absent when it needs nothing**.
- Precedence on a card with two open asks (RSVP + proposal): the RSVP owns the label; once the RSVP
  settles it flips to `NEEDS YOUR VOTE`; when both settle it goes bare.

### 04 — Pending idea card (`.gh-evcard.idea`)
- Shell: `background: var(--surface-base)`, `border: 1px solid var(--hairline)`, **no shadow**, same
  14px radius and rail geometry as `.gh-evcard` (it takes the class and the `.idea` modifier).
  Subordination is brightness + structure, never hue.
- Title `.gh-idtitle`: `--type-body` weight 700 in the UI face (not the display heading).
- When-line reuses `.gh-cmeta` (`--type-meta`, `--text-secondary`, `·` separators, three-letter
  weekdays: "Fri 7pm").
- Gauge chips: `.gh-qr` / `.gh-qrchip` **verbatim from the shipped chat feed** — grey chip grammar,
  emojis, one full-strength chip, the rest `.quiet`. Do not restyle; never teal.
- Tally below the chips: `.pd-tally` voice as shipped ("3 in · 1 next time · 4 waiting"),
  `--type-label` weight 700, waiting count dimmer, `font-variant-numeric: tabular-nums`.
- No chevron: no detail screen behind an idea.

### 05 — Selected gauge chip (`.gh-qrchip.sel`)
- The viewer's answered chip: checkmark (1em, stroke `--text-primary`, stroke-width 2.7) plus the grey
  fill shift `--surface-raised` → `--surface-self`, border `--hairline`, text `--text-primary`.
- Chips stay grey in every state. Other chips remain tappable to change the answer.

### 06 — Proposal band (`.gh-propband`)
- Rides at the bottom of a confirmed card that has an open time-change proposal. One card, two live
  questions; the card grows and never clips or splits.
- `border-top: 1px solid var(--hairline)`, `background: var(--surface-base)` (recessed one step under
  the raised card), `padding: 11px 15px 13px`, full card width, square edges against the card's own
  radius (the card's `overflow: hidden` clips it).
- Contents: kind label `.pkind` (13px uppercase `--text-faint`), Orbit's question `.pq` (`--type-meta`
  weight 600 `--text-primary`, e.g. "Move Fri beers to 8pm?"), the two shipped proposal chips
  (e.g. `🔄 Switch to 8` / `🕗 Keep 7`), and that vote's own `.pd-tally`
  ("2 for 8pm · 1 for 7pm · 6 waiting").
- The band's vote never borrows the RSVP's teal.

### 07 — Mixed carousel
- Ordering: ascending by date, kinds mingled. A pending Fri idea sits before a confirmed Sat event.
- Chrome verbatim from Round 4: `.gh-pinned.peek` / `.gh-rail.peek`, 342px cards on a 390px screen,
  22px peek, 10px gap, dots 6×6 `--hairline` with the active 17×6 `--text-primary` pill, no dots for a
  single card, no dimming or masking of the peeking card, no animation.
- Cap: three cards; ideas count toward the cap. Overflow lives in the feed as before.

## What retires
The pending strip and panel (`.pd-strip`, `.pd-panel`, the `.pd-sep` treatment and the 03b teal band)
leave the group home. `pending-surface.css` stays in the build only for `.pd-tally` (reused in cards)
unless its rules are extracted. The feed's gauge bubbles and chips are unchanged.

## Interactions & behaviour
- RSVP options and gauge chips answer in place; answers are changeable by tapping the other option/chip.
- Card body (confirmed) opens event detail, which **inherits the RSVP pair treatment automatically and
  carries no label** — no separate work in this round.
- No animation anywhere. State changes swap styles with no transition.
- Growth: every row wraps; the RSVP pair stacks when it cannot sit side by side; assume enlarged
  device text. Nothing is height-capped, nothing truncates, nothing renders below 13px.

## State
- Confirmed card: `viewerRsvp: null | 'in' | 'out'` → `.ask` / `.done` + `.pick`/`.other`; label shown
  only while `null`.
- Pending card: `viewerVote: null | chipId`, `tally` → label `NEEDS YOUR VOTE` / `NEEDS MORE VOTES`;
  card leaves the carousel when the idea confirms (becomes an event card) or expires.
- Proposal: `proposal: { question, options, tally, viewerVote }` on an event → band renders; label
  precedence per component 03.
- Carousel: union of confirmed events and open ideas, sorted ascending by date, sliced to 3.

## Design tokens
No new tokens. `--surface-base` #15161e · `--surface-raised` #262b37 · `--surface-self` #363c4b ·
`--hairline` #454c5e · `--text-primary` #ECEDF2 · `--text-secondary` #A7AAB6 · `--placeholder` #8c91a0 ·
`--text-faint` #6F7280 · `--action` #18bccb / `--action-ink` #0a2125 · `--lime` #a4ef4e / `--lime-ink`
#233006 (Orbit only; unused in this region). Type scale unchanged, 13px floor. Font: **Geist** 400–900
(the one family change; `--display` and `--ui` both map to it).

Teal appears exactly twice: both borders of an unanswered RSVP pair; the chosen option's fill after.
Never on chips, never as a wash, never decorative. Status is never hue alone and never red vs green:
checkmarks, labels and brightness carry every state.

## Files
- `round5-design-reference.html` — the six boards with notes. Open this first.
- `round5-cards.css` — everything new this round. **Source of truth for measurements.**
- `walkthrough.css`, `pending-surface.css`, `round4-base.css` — the shipped base, unchanged, included
  so the reference renders. Load order: walkthrough → pending-surface → round4-base → round5-cards.

Overridden from the shipped CSS: `.gh-rsvp` states via `.ask`/`.done`, `.gh-qrchip` via `.sel`,
`.gh-evcard` via `.idea`, and the `--display`/`--ui` font mapping. Nothing else is touched; nothing
outside the card region is superseded.
