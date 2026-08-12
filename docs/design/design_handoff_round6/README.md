# Handoff: Round 6 — a proposal on a card, without the tallest-card tax

## Overview
Supersedes **round-5 board 05 only** (the full proposal band on a confirmed event card), plus the
region's mixed-height behaviour. Round-5 boards 01, 02, 03, 04 and 06 are approved and build as drawn,
amended by the post-round-5 rulings below.

Why board 05 was rejected: the carousel region renders at the height of its tallest card. The full
band made its card far taller than every sibling, so shorter cards sat over dead background and the
chat window shortened whenever a vote was open.

This round draws three replacement variants (A is the owner's lean and gets two takes) and answers the
mixed-height question once for the whole region. **Which to build: variant A is the leading candidate;
B and C are drawn alternatives. Confirm the pick before implementing.**

## About the design files
Design references created in HTML — prototypes of the intended look, not production code. Recreate
them in the target codebase's environment with its established components. `round6-proposal.css` is
real, complete CSS and the source of truth for every new measurement; port the values, not the file.

## Fidelity
**High fidelity.** Final colours, type roles, spacing and copy, built entirely from existing tokens
and shipped components. Frames are 390px card-region isolates plus one full detail screen.

---

## Post-round-5 rulings (supersede the round-5 boards everywhere)
- **Need labels**: labels naming the viewer's own move render in the action teal —
  `.gh-need .lbl.you { color: var(--action) }` — for `NEEDS YOUR RSVP` and `NEEDS YOUR VOTE`.
  `NEEDS OTHER VOTES` (exact copy; replaces round 5's "NEEDS MORE VOTES") stays `--text-secondary`.
  Ladder on a card with an open vote: NEEDS YOUR RSVP → NEEDS YOUR VOTE → NEEDS OTHER VOTES; absent
  when the card needs nothing.
- **Pending idea titles carry a question mark**: "Beers?".
- **Proposal chips use the shipped copy**: "8pm works" / "Keep 7pm" (grey chip grammar with emojis,
  never teal).
- **Tally lines read in the names voice**, never counts-only: `.gh-vtally`, `--type-label` weight 600
  `--text-secondary`, names in weight-700 `--text-primary`. E.g. "Rowan & Devon are in so far · one
  more makes it happen".
- The RSVP pair itself is round-5 boards 01–02, unchanged.

## Variant A — compact notice on the card, vote on the detail screen (leading candidate)

### A · take 1 — footer notice (`.gh-propline`) — boards 01 + 03
- One full-card-width line at the card's foot: `border-top: 1px solid var(--hairline)`,
  `background: var(--surface-base)` (recessed under the raised card), `padding: 10px 15px`, flex row
  gap 9px. Height cost ≈ 40px.
- Contents: swap icon 15px stroke `--text-secondary` → text at `--type-label` weight 600 — "Time
  change proposed · " in `--text-secondary`, the question "Move to 8pm?" bold `--text-primary` → its
  own chevron 16px `--text-faint`. Text wraps at enlarged sizes.
- Cannot read as metadata because no metadata row is full-bleed, recessed, icon-prefixed or
  chevroned. Tapping it opens the detail screen's proposal section.

### A · take 2 — shift line (board 02)
- Reuses the shipped `.pd-shift` grammar verbatim inside the card body, between the meta line and the
  counts line: eyebrow label "PROPOSED" (`--text-faint`), old time struck (`--text-faint`,
  line-through `--hairline`), arrow 15px, new time bold `--text-primary` with a question mark:
  "PROPOSED 7:00 PM → 8pm?". `margin-top: .45em`. Height cost ≈ 25px.
- Strike + arrow + eyebrow make it unmistakably not a metadata seg. Quieter than take 1: no chevron
  of its own; the teal NEEDS YOUR VOTE label carries the signpost.

### A · second half — detail screen proposal section (board 03)
- A shipped `.ed-card` placed **between the details card and Add to calendar** (it amends the time the
  calendar button would save). Uses `.ed-rgroup` padding.
- Contents: `.ed-seclabel` "TIME CHANGE · FROM ORBIT" → question `.pq` at `--type-body` weight 600
  `--text-primary` ("Sam can't do 7. Move Fri beers to 8pm?") → the two shipped chips ("🔄 8pm works"
  full-strength, "🕗 Keep 7pm" `.quiet`) → `.gh-vtally` ("Maya & Rowan want 8pm so far · one more
  makes it happen").
- No need-label on the detail screen, as shipped. Everything else on the screen is untouched.

## Variant B — trimmed band (`.gh-propband.trim`) — board 04
- The round-5 band cut to essentials: question + two chips. No kind label, no tally on the card (the
  tally lives in Orbit's chat bubble and on the detail screen).
- `padding: 10px 15px 12px`, question `.pq` with `margin-top: 0`; everything else inherits the
  round-5 `.gh-propband` (hairline top, `--surface-base`, full card width).
- Height cost ≈ 90px vs a normal card (round 5's band was ≈ 130px). The only variant keeping both
  questions visible at once; leans hardest on the mixed-height rule below.

## Variant C — one slot, one question (`.gh-slotq`) — board 05
- The card's bottom slot hosts exactly one open ask. Unanswered RSVP → the RSVP pair, as shipped.
  Viewer answers → the settled pair leaves the card face; their answer joins the counts line as a
  leading segment `.gh-statusline .you` ("You're in" + 12px check, `--text-primary`, check + words,
  never hue); the slot renders the proposal instead.
- `.gh-slotq`: `margin-top: .85em; padding-top: .85em; border-top: 1.4px solid var(--stroke)` (the
  same geometry as the RSVP pair's slot); question `.pq` at `--type-meta` weight 600
  `--text-primary`; the two shipped chips below, `margin: 9px 0 0`.
- After the viewer votes the slot empties (label → NEEDS OTHER VOTES). Changing an RSVP lives on the
  detail screen's You're in / Change band, which already exists.
- Height cost ≈ 25–30px, honestly measured: the question line + chip row run slightly taller than the
  44px RSVP pair they replace. The card never carries two answer rows at once, so an open vote costs
  about one text line — the same residue as A take 2 and roughly a third of variant B's. Weakness,
  stated on the board: while the RSVP is unanswered the proposal is signalled only by the label ladder
  and chat.

## Mixed heights — region rule (board 06; applies to the whole carousel, any variant)
- **Stretch the shell**: the rail keeps flex's natural stretch — every card's border runs the full
  region height, so leftover space lives inside a card's hairline, not as dead background below it.
  `.gh-rail > .gh-evcard { display: flex; flex-direction: column }`.
- **Anchor the ask**: `.gh-evpad` becomes a column with `flex: 1 1 auto`; the ask block gets a
  `.gh-ask` wrapper with `margin-top: auto` (the RSVP pair, or the gauge chips + tally). Every card's
  answer row lands on a shared baseline just above the dots; slack sits mid-card between title and
  chips.
- Nothing is height-capped, nothing clips; at enlarged text the tallest card sets a taller region.
- Interaction with the variants: C keeps confirmed cards near one height (≈ 25–30px residue); A adds
  ~25–40px; B relies on the rule most.

## Interactions & behaviour
- A take 1: the footer line opens the event detail screen's proposal section. A take 2: the card body
  opens detail as always. B and C: chips answer in place; answers changeable by tapping another chip.
- No animation anywhere. Variant C's slot swap is a state render between visits, never a transition.
- Growth: all rows wrap; the RSVP pair stacks when it cannot sit side by side; nothing below 13px.

## State
- Event: `proposal: { question, options: [chipA, chipB], votes, viewerVote } | null`.
- Label ladder derives from `(viewerRsvp, proposal.viewerVote)`: null RSVP → NEEDS YOUR RSVP (teal) ·
  RSVP set + null vote → NEEDS YOUR VOTE (teal) · both set, threshold unmet → NEEDS OTHER VOTES
  (secondary) · no open ask → no label.
- Variant C additionally swaps the slot content on `viewerRsvp` settling.

## Design tokens
No new tokens, no new hues. Geist 400–900 everywhere (mapped in `round5-cards.css`). Type scale
unchanged, 13px floor. Teal: unanswered RSVP borders, chosen RSVP fill, and (per the new ruling)
viewer-move need-labels. Never on chips, never a wash, never decorative. Lime is Orbit's mark only.
Status never hue alone, never red vs green.

## Assets
All icons are inline stroked SVG in the reference HTML: swap arrows (proposal notice), chevrons,
check, clock, pin, calendar, person. No images, no icon font.

## Files
- `round6-design-reference.html` — the six boards with notes. Open this first. Board tags: 01 = A
  take 1 · 02 = A take 2 · 03 = A detail screen · 04 = B + comparison card · 05 = C · 06 = mixed
  heights.
- `round6-proposal.css` — everything new this round. **Source of truth for measurements.**
- `round5-cards.css`, `round4-base.css`, `pending-surface.css`, `walkthrough.css` — the shipped base,
  unchanged, included so the reference renders. Load order: walkthrough → pending-surface →
  round4-base → round5-cards → round6-proposal.

Superseded: round-5 board 05 (`.gh-propband` full band — its `.trim` variant survives as variant B),
the round-5 label colour/copy (`NEEDS MORE VOTES` → `NEEDS OTHER VOTES`), counts-only card tallies
(→ `.gh-vtally` names voice), and the region's top-aligned mixed heights. Nothing else in rounds 4–5
is touched.
