# Handoff: Pending Surface (group home)

## Overview
A new region on the Interplanetary Groups group-home screen. It sits between the pinned event
card and the chat feed and holds the group decisions still waiting on the current member's
answer, so they can answer in place instead of scrolling the feed. Two states: a collapsed
one-line strip and an expanded panel that overlays the feed.

## About the design files
The files in this bundle are **design references created in HTML** - prototypes of the intended
look and behavior, not production code to ship. The task is to **recreate them in the target
codebase's existing environment** (React Native, SwiftUI, web, whatever the app uses) with its
established components and patterns. If no environment exists yet, pick the appropriate
framework and implement there. `pending-surface.css` is real, complete CSS and is the source of
truth for every measurement below; port the values, not the file.

## Fidelity
**High fidelity.** Final colors, type scale, spacing and copy. The region is built entirely from
the existing app's tokens and reuses existing components (chat bubble, quick-reply chips) verbatim.
Recreate it pixel-for-pixel using the codebase's existing primitives.

## Screens / views

### 01 - Collapsed strip
**Purpose:** tell the member, quietly, that some group decisions are waiting on them, and open the panel.

Layout: a full-width row inset 16px on each side, sitting directly below the pinned event card
rail and above the chat feed. `display:flex; align-items:center; gap:10px; padding:11px 2px`.
Hairline rules top and bottom (1px `--hairline` #454c5e), background `--surface-base` #15161e.
No card, no shadow, no radius: it must stay visually junior to the raised event card above it.

Components:
- **Clock icon** 16x16, stroke `--text-secondary` #A7AAB6, 1.9 stroke width.
- **Label** `--type-meta` (15px / 1.5), color `--text-secondary`. Segments joined by a middle dot
  (`--placeholder` #8c91a0, 1.12em) rendered as a trailing `::after` on each non-last segment, so a
  wrapped line never begins with a dot. Counts only are `--text-primary` #ECEDF2, weight 700.
  Copy: "2 waiting on you / 1 you're in on" (dot separated). The second segment appears only when
  the member holds at least one standing yes.
- **Chevron** 18x18, stroke `--text-faint` #6F7280, points down when collapsed, rotated 180 degrees when open.

Rules: the strip **never animates for attention** - no badge, no pulse, no color change on new
items; the count changing is the whole notification. When there is nothing waiting and no standing
yes the region is **not rendered at all** (screen 04) - there is no empty state.

### 02 - Expanded panel
**Purpose:** answer every pending item without leaving the group home.

The strip stays in place and becomes the panel header (chevron flips up); tapping it again is the
one way to close. The panel is absolutely positioned from the bottom edge of the strip
(`top:100%` of the strip host), full width, over the chat feed. The feed **is not resized**; it is
dimmed behind the panel with an overlay of `rgba(11,12,17,.74)`. Panel: background `--surface-base`,
`border-radius:0 0 16px 16px`, `border-bottom:1px solid --hairline`,
`box-shadow:0 22px 46px -14px rgba(0,0,0,.78)`. It grows with its content and scrolls internally
(`overflow-y:auto`, `max-height: calc(100vh - <strip bottom>)`); it may cover the message composer.

Row order: **waiting items first, soonest first**, then the "You're in on" group.

#### Row type A - idea row
- **Kind line** `--type-eyebrow` (13px), uppercase, letter-spacing .14em, weight 700, `--text-faint`,
  line-height 1.35. Dot-separated: "New idea / from Maya".
- **Title** `--type-body` (17px) / `--leading-tight` (1.15), weight 600, `--text-primary`,
  `margin-top:3px`, `text-wrap:pretty`. **The activity in the member's own words**, never rewritten.
- **When** `--type-meta` / 1.5, `--text-secondary`, `margin-top:.34em`. Dot-separated segments,
  three-letter weekday: "Sat 10am / Mesa Rock".
- **Tally** `--type-label` (14px), weight 700, `--text-secondary`, `margin-top:.48em`:
  "3 in / 1 next time / 4 waiting". The waiting count is `--text-faint` weight 600, since it is not an answer.
- **Chips** the existing quick-reply spec, unchanged: container `.gh-qr`
  (`display:flex; flex-wrap:wrap; gap:7px`, `margin:9px 0 0`), chip `.gh-qrchip` - pill, 1.7px
  `--hairline` border, transparent fill, `--type-label` weight 600. One full-strength chip
  ("I'm in"), the rest `.quiet` (`--text-secondary`). Labels: I'm in / Next time / Yes, can't Sat,
  each with its existing emoji. **Do not restyle the chips** - see `Orbit Suggestion Chips - Spec.html`.
- Row padding `10px 18px 11px`; rows separated by a 1px `--hairline` top border. Flat on
  `--surface-base`: no card, no shadow.

#### Row type B - time-change row
Same skeleton, with the when-line replaced by a shift line:
- Kind: "Time change / from Sam". Title: the plan being changed ("Monday morning climb").
- **Shift line** `display:flex; flex-wrap:wrap; align-items:baseline; column-gap:.45em; row-gap:.25em;
  margin-top:.42em`, `--type-meta`.
  - `NOW` label: `--type-eyebrow`, uppercase, .12em tracking, weight 700, `--text-faint`.
  - Old time: `--text-faint` with `line-through` (decoration color `--hairline`).
  - Arrow: 15x15, stroke `--text-faint`, `align-self:center`.
  - `NEW` label, then new time: `--text-primary` weight 700.
  - Old vs new is carried by **label + brightness + strikethrough**, never hue.
- Tally: "3 for 9am / 2 for 8am / 3 waiting".
- Chips: two, keep-or-switch: "Switch to 9" (full strength) and "Keep 8" (`.quiet`).

#### Standing-yes row ("You're in on")
A memory aid, not a call to action, so every level steps down.
- **Group label** `--type-eyebrow` uppercase .14em, weight 700, `--text-faint`, padding `10px 18px 0`,
  1px `--hairline` top border. Copy: "You're in on".
- **Title** drops to `--type-meta`, weight 600, `--text-secondary`, `margin-top:0`.
- **When** drops to `--type-label`, `--text-faint`.
- **Answer** row `margin-top:.5em`: 14x14 check icon (stroke `--text-secondary`, width 2.7) plus the
  words "You're in" at `--type-label` weight 700, `--text-secondary`. Icon **and** label together;
  status is never color alone.
- **Change** affordance right-aligned (`margin-left:auto`), `--type-label` weight 600,
  `--text-secondary`, underlined with `--hairline`, 3px offset. Never teal.
- The whole row is tappable and expands the same chip set to change the answer.
- Row padding `8px 18px 10px`.

### 03 - Caught-up note
Fires when the member answers their **last** waiting item with a decline. The waiting rows clear
and the panel's only content becomes one Orbit message, rendered with the existing chat bubble
(`.gh-msgrow` / `.gh-msgav` / `.gh-msg`) inside `padding:15px 18px 17px`, so the voice reads as the
same Orbit from the feed. The strip header text becomes "All caught up" (no counts).

Copy, verbatim: "Next time it is. That was the last thing waiting on you, so you're all set.
I'll say something when the group floats a new idea."

Voice rules: plain and warm, roughly 7th-8th grade, acknowledges the decline without arguing with
it, no em-dashes, no exclamation mark, soft declines only ("Next time", never "Pass" or bare "No").

### 04 - Nothing pending
No waiting items and no standing yes: the strip and panel are not rendered. The pinned card sits
directly on the feed exactly as before this region existed.

## Interactions & behavior
- **Tap strip** expands the panel. **Tap the header again** (or the chevron) collapses it. That is
  the only collapse control; no separate close button, no swipe-only dismissal.
- Expanding overlays the feed and dims it; the feed does not reflow, scroll, or resize.
- **Tap a chip** records the answer and the row leaves the "Waiting on you" group. An "I'm in"
  answer moves the item into "You're in on"; "Next time" removes it; "Yes, can't <day>" removes it
  from waiting and hands the item back to Orbit to float an alternative.
- When the last waiting row clears **by decline**, swap the rows for the caught-up note in place
  (fade / height transition, about 180ms, ease-out). If the member still has standing yeses, keep
  that group visible below the note.
- On collapse after caught-up, unmount the strip entirely if no standing yes remains.
- Counts in the strip update silently. No entrance animation, no attention badge, ever.
- Rows grow with content: titles wrap, chips wrap to a second line, tallies and metadata wrap with
  trailing separators. Nothing is height-capped or truncated. Respect OS text size (the type scale
  is rem-based).

## State
- `pendingItems: PendingItem[]` - `{ id, kind: 'idea' | 'time_change', title, proposer, startsAt,
  place?, currentTime?, proposedTime?, tally }`
- `standingYes: EventRef[]` - events the member has answered "in" on that have not happened yet.
- `expanded: boolean` - panel open. `caughtUp: boolean` - show the note this session.
- Region renders only when `pendingItems.length || standingYes.length`.
- Sort: both groups ascending by `startsAt`.
- Answering is optimistic; the tally updates locally and reconciles with the server response.

## Design tokens (existing app tokens - do not add new values)
Surfaces: `--surface-base` #15161e, `--surface-raised` #262b37, `--surface-self` #363c4b,
`--hairline` / `--border` #454c5e
Text: `--text-primary` #ECEDF2, `--text-secondary` #A7AAB6, `--placeholder` #8c91a0,
`--text-faint` #6F7280
Brand: `--lime` #a4ef4e - Orbit's mark only: never an action, never a button, never a status.
Action: `--action` #18bccb, ink `--action-ink` #0a2125 - one primary per element. **This region uses
none**, because the pinned event card owns the only teal on the screen and the chips are neutral
outlines by spec.
Type scale (rem, floor 13px): `--type-display` 28, `--type-title` 24, `--type-heading` 20,
`--type-body` 17, `--type-meta` 15, `--type-label` 14, `--type-eyebrow` 13.
Leading: `--leading-tight` 1.15 (titles), `--leading-normal` 1.5 (everything else).
Fonts: Hanken Grotesk 800 (display), Inter 400-700 (UI).
Radius: panel 0 0 16px 16px, chips 20px. Shadow: panel only.

## Rules that are product constraints, not styling preferences
1. The pinned event card stays senior: it is the only raised, bordered, shadowed object and holds
   the only teal action. The strip and panel are flat surfaces with hairline rules.
2. Teal is a single primary action per element. Lime is Orbit's brand color only.
3. Status is brightness plus icon or label. Never hue alone, never red/green as the only signal.
4. Type scale only, nothing below the 13px eyebrow floor.
5. Layout grows with content; rows stack, chips wrap, nothing clips.
6. The strip is quiet by default and never animates for attention.

## Assets
- `orbit-mark.js` - Orbit's avatar mark (lime sphere and moon on an orbit path), `OrbitMark.svg(size)`.
  In-app this is the existing avatar component; use whatever the codebase already ships.
- All other icons are inline stroked SVG paths, present in the HTML: clock (strip), chevron,
  arrow (shift line), check (standing-yes answer).
- No images, no icon font.

## Files
- `pending-surface-design-reference.html` - all four states plus the four isolated pieces and the
  annotation. Open this first.
- `pending-surface.css` - the region's CSS (`.pd-` prefix). Source of truth for measurements.
- `walkthrough.css` - the app's tokens, phone shell, chat and chip styles the region builds on.
- `Orbit Suggestion Chips - Spec.html` - the chip spec the answer chips reuse verbatim.
- `orbit-mark.js` - Orbit avatar mark.
