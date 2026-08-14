# Handoff: Round 7 — the seam and the two grounds

*Pulled from the Claude Design project through the connector's read path, 13 Aug 2026. The
reference HTML (`round7-design-reference.html`) is deliberately not stored here yet; it is
pulled at plan time, once a direction is picked, because only the chosen direction's boards
are needed for the rendered comparison. `round7-seam.css` is the source of truth either way,
and it is stored in full below. Departure from rounds 5 and 6, which stored their reference
HTML up front; declared rather than silent.*

## Overview
Fixes the one unmarked horizontal seam on the group home (card region → chat feed) and gives the
pending idea card an edge of its own. Two directions are drawn, **A (move the card)** and
**B (move the ground)**; **only one will be built — confirm the pick, and the seam strength
(quiet or firm), before implementing.** Nothing outside the seam and the two grounds named below
is superseded.

Round-5 intent survives in both directions: the idea card stays quiet and subordinate — it gains
an edge, never a promotion.

## About the design files
Design references created in HTML — prototypes of the intended look, not production code. Recreate
in the target codebase with its established components. `round7-seam.css` is real, complete CSS and
the source of truth for every new value; port the values, not the file.

## Fidelity
**High fidelity.** Final colours and spacing, built from shipped components plus exactly one new
token per direction. Frames are 390×780 full screens plus two ladder isolates.

---

## New tokens (one per direction — only the chosen direction's token ships)
- **`--surface-low: #1f222c`** (direction A) — a fourth surface between `--surface-base` (#15161e)
  and `--surface-raised` (#262b37). The pending idea card's ground. Declared explicitly per the
  constraint: `--surface-base` is NOT redefined; fifteen component files keep reading it unchanged.
- **`--surface-well: #10111a`** (direction B) — one step BELOW base. The chat feed's ground.
  Same declaration: a new token with a new name, `--surface-base` untouched.
- Neither direction solved it with the existing three surfaces. All three are spoken for (base =
  page/idea/human-bubble, raised = cards/bubbles, self = viewer bubble), so a fourth value was
  unavoidable either way; the cost is symmetric.

## Direction A — move the card (boards 01, 02, 05a, 06a)
- `.gh-evcard.idea` gains `background: var(--surface-low)`. Everything else on the idea card is
  round 5 verbatim: 1px hairline, 14px radius, no shadow, UI-weight body-size title. Ladder:
  raised > low > base, three brightness steps, greyscale-safe.
- The seam is solved separately, at one of two strengths (owner picks):
  - **Quiet**: `border-top: 1px solid var(--hairline)` on the feed, full-bleed — the header's own
    boundary grammar (`.seam-rule`).
  - **Firm**: the hairline plus an 18px inner scrim pinned to the feed's top edge,
    `linear-gradient(180deg, rgba(0,0,0,.32), transparent)` — the composer's scrim grammar
    inverted (`.seam-scrim`). Production: an overlay on the scroll region, not content.
- Gap between region and feed stays 12px (`.gh-pinned.r7gap { padding-bottom: 12px }`).

## Direction B — move the ground (boards 03, 04, 05b, 06b)
- The feed, composer row and home-indicator strip take `background: var(--surface-well)`:
  `.gh-feed`, `.gh-pin`, `.home-ind`. The composer keeps its shipped scrim (a background-image;
  it composes over the well). The card region keeps `--surface-base`.
- One move answers both complaints: the idea card no longer shares a fill with the chat window,
  and the feed is a real lower plane with a real top edge — the "slides underneath" reading
  becomes literally true and visually marked.
- **Bubble contrast shifts, all upward** (the brief asked for honesty here): Orbit's raised bubble
  and the viewer's `--surface-self` bubble both gain distance from the ground; the human bubble's
  `--surface-base` fill — invisible today — reads as an actual fill on the well. Nothing goes
  muddy; the at-rest boards show all three voices.
- **The declared-exception clause goes unused**: the confirmed card needed no adjustment.
- Seam strengths: **quiet** = the value step alone, no rule; **firm** = the step plus the same
  full-bleed hairline (`.seam-rule`). No scrim variant — the ground itself already darkens.
- Honest weakness (board 05b): inside its own region the idea card still leans on its hairline —
  B fixes the card's relationship to the chat, not to the region ground. If the owner judges that
  insufficient, A's `--surface-low` composes with B; the directions are exclusive only in the seam
  treatment.

## Empty-state box (both directions — board 06)
`.gh-empty`, drawn this round: no fill, `1px dashed var(--hairline)` (the roster's "not yet"
grammar), 14px radius, centred `--text-faint` text at `--type-meta` ("Nothing planned yet — float
an idea in chat"). Sits below both card kinds on the ladder. Identical in A and B.

## Interactions & behaviour
- No new interactions. The seam treatments are edges on the existing scroll region; no animation.
- The scrolled boards (02, 04) fake the scroll with a clipped offset (`.gh-feed.clip` / `.cut`,
  mock only); production is the scroll region's own top edge.
- Layout grows with content, nothing clips, nothing renders below 13px; the tokens are neutral
  values, so every board survives greyscale.

## Frozen, verified untouched
Confirmed card shell and content, gauge chips + selected states, RSVP pair and its teal grammar,
peek geometry and dots, header, composer geometry, teal (never on the seam, never a wash), lime.

## Files — which direction each belongs to
- `round7-design-reference.html` — all six boards with notes. Open this first.
  Boards: 01a/01b = A at rest (quiet/firm) · 02 = A scrolled (firm) · 03a/03b = B at rest
  (quiet/firm) · 04 = B scrolled (quiet) · 05a/05b = worst case A/B · 06a/06b = ladders A/B.
- `round7-seam.css` — everything new this round, **source of truth**. Direction-A blocks:
  `--surface-low`, `.dirA .gh-evcard.idea`, `.seam-rule`, `.seam-scrim`. Direction-B blocks:
  `--surface-well`, `.dirB` rules (`.seam-rule` is shared — B's firm strength borrows it).
  Both-directions block: `.gh-empty`, `.gh-pinned.r7gap`. Mock-only block at the foot, do not port.
- `walkthrough.css`, `pending-surface.css`, `round4-base.css`, `round5-cards.css` — shipped base,
  unchanged, included so the reference renders.
- `round6-proposal.css` — included for the post-round-5 rulings (teal viewer-move labels,
  names-voice `.gh-vtally`, question-mark idea titles, region stretch + `.gh-ask` anchor), which
  the boards render. Its proposal-variant blocks (`.gh-propline`, `.gh-propband.trim`,
  `.gh-slotq`) are inert here — that round's variant pick is still open and independent of this one.
- `orbit-mark.js` — Orbit mark, unchanged.
- Load order: walkthrough → pending-surface → round4-base → round5-cards → round6-proposal →
  round7-seam.

Superseded: the bare 12px margin between the card region and the feed, and (direction A only) the
idea card's `--surface-base` fill. Nothing else in rounds 4–6 is touched.
