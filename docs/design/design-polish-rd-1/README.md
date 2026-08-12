# Handoff: Round 4 — front door, carousel chrome, pending-strip separation, finish layer

## Overview
Four items for Interplanetary Groups.

1. **The front door (`/`)** — the only screen with no design. A visitor with no session gets the
   product's pitch and one teal action. New screen.
2. **Carousel chrome** — the group home's pinned event region. The shipped chrome is interim (dots
   with no active state). This is the finished chrome: dot active state, peek treatment, and the
   single-card case.
3. **Pending strip · separation treatment** — the collapsed one-line strip between the event card and
   the chat feed currently reads as the event card's footer. Redrawn so it separates from both
   neighbours without being promoted above the card.
4. **Finish-layer pilot (group home only)** — the group home as it ships, with items 2 and 3 folded
   in, plus a restrained, motion-free finish layer. Delivered as a before/after pair. The finish
   layer is a separate stylesheet scoped to one class and can be adopted or declined on its own.

Nothing else on the group home changes. Every other screen in the app is out of scope for this round.

## About the design files
The files in this bundle are **design references created in HTML** — prototypes of the intended look
and behaviour, not production code to ship. The task is to **recreate them in the target codebase's
existing environment** (React Native, SwiftUI, web, whatever the app uses) with its established
components and patterns. If no environment exists yet, pick the appropriate framework and implement
there. `round4-base.css` and `finish-layer.css` are real, complete CSS and are the source of truth
for every measurement below; port the values, not the files.

## Fidelity
**High fidelity.** Final colours, type scale, spacing and copy. Everything is built from the existing
app tokens and reuses existing components (event card, chat bubble, quick-reply chips, pending strip)
verbatim. Recreate pixel-for-pixel using the codebase's existing primitives.

Phone geometry in every frame: 390 × 844, 44px status bar, 26px home indicator.

---

## Screens / views

### 01 — Front door (`/`)
**Purpose:** a visitor with no session learns what Orbit is and why the thing you create is a group,
then takes one action. A session already in a group is routed past this screen, so there is no
returning-user state and nothing behind it.

Layout: `.fd-body`, `flex-direction: column`, `padding: 4px 24px 0`, and the footer pinned with
`margin-top: auto` so the action sits at the bottom of the screen at any text size.

Components, top to bottom:

- **Orbit mark** — 104 × 104 box, `margin: 6px 0 0 -9px` (the orbit path overflows the sphere, so the
  negative left margin optically aligns the sphere with the 24px gutter). The only lime on the screen
  and the only brand moment. Existing avatar component.
- **Eyebrow** — `--type-eyebrow` 13px, uppercase, letter-spacing `.18em`, weight 700, `--text-faint`,
  `margin-top: 16px`. Copy: "Interplanetary Groups".
- **Headline** — `--type-display` 28px, Hanken Grotesk 800, `--leading-tight` 1.15, letter-spacing
  `-.015em`, `--text-primary`, `margin-top: 9px`, `text-wrap: balance`.
  Copy: "Start a group. Orbit takes the planning from there."
- **Lede** — `--type-body` 17px / `--leading-normal` 1.5, `--text-secondary`, `margin-top: 12px`.
  Copy: "Orbit is the member of your group who handles logistics. It floats ideas, finds out who is
  in, and turns the ones people want into real plans."
- **Three claims** — `ul.fd-list`, `margin-top: 18px`. Each row `display: flex`, `gap: 13px`,
  `padding: 11px 0`, `border-top: 1px solid --hairline`.
  - Number: Hanken 800, `--type-eyebrow`, letter-spacing `.08em`, `--text-faint`, tabular figures,
    `padding-top: .35em`. Copy: 01 / 02 / 03.
  - Title: `--type-body` / 1.15, weight 600, `--text-primary`.
  - Line: `--type-meta` 15px / 1.5, `--text-secondary`, `margin-top: .3em`, `text-wrap: pretty`.
  - Copy: **You make a group, not an event** / "The group is the part that lasts. Plans come and go
    inside it." · **Orbit reads the room** / "It asks who is interested and only sets something up
    once enough people say yes." · **One thread for all of it** / "Chat, answers and the next plan sit
    in the same place."
- **Primary action** — the one teal element on the screen. Full width, `min-height: 52px`,
  `border-radius: 28px`, fill `--action`, label `--action-ink` at `--type-body` weight 700, trailing
  arrow icon 1.05em at `--action-ink`, `padding: .5em 1.2em`. Copy: "Start your group".
- **Note** — `--type-eyebrow`, `--text-faint`, centred, `margin-top: 12px`. Deliberately **not** a
  second button: people with an invite link land on the join screen, not here.
  Copy: "Already invited? Open the link you were sent."

Rules: one action only; no nav, no footer, no marketing sections, nothing below the fold. The whole
pitch fits one screen at default text size; at larger OS text sizes the page grows and scrolls,
nothing truncates.

### 02 — Carousel chrome (group home, pinned event region)
**Purpose:** hold up to three confirmed upcoming events, soonest first, one swipe apart.

Track: `.gh-rail`, `display: flex`, `gap: 10px`, `overflow-x: auto`,
`scroll-snap-type: x mandatory`, `scroll-padding-left: 16px`, scrollbars hidden. Cards
`scroll-snap-align: start`.

**Multi-card (2 or 3 cards).** The region drops its own side padding
(`.gh-pinned.peek { padding-left: 0; padding-right: 0 }`) and the track carries the gutter
(`.gh-rail.peek { padding: 0 16px }`), so the row can scroll past the screen edge instead of stopping
inside a padded box. Card width `flex: 0 0 calc(100% - 16px)` of the padded track — **342px** on a
390px screen.

Peek geometry, measured:
- Card 1 snapped: card at x = 16, next card's left edge at x = 368, so **22px of the next card shows**,
  including its own 1.7px border and 14px radius.
- Card 2 snapped: 6px of card 1 behind on the left, 22px of card 3 ahead on the right. Start-snapping
  makes the trailing sliver thinner than the leading one; that asymmetry is intentional, the thick
  edge is where the row continues.
- Last card: reached at the scroll end, so it sits flush against the right 16px gutter with 22px of
  the previous card on the left. No overscroll, no bounce-back.
- The peeking card is **never** dimmed, faded, masked or scaled. It is the same card at full strength,
  clipped by the screen: dimming reads as disabled, and a gradient mask over live type reads as a
  rendering fault.

**Dots.** `.gh-dots`, `display: flex`, `gap: 6px`, `justify-content: center`, `padding-top: 11px`.
- Inactive: 6 × 6, `border-radius: 3px`, `--hairline` #454c5e.
- Active: **17 × 6** pill, `--text-primary` #ECEDF2.
- Width **plus** brightness, never hue: the state survives greyscale and any colour-vision profile.
- No transition on the state change (the region has no animation).
- Dots are chrome, not the control surface. Swipe is the interaction; tapping a dot is optional.

**Single card.** Unchanged from today and deliberately so: no `.peek` modifier, card at full width
(358px, 16px both sides), **no dots** and no peek. One dot would be chrome describing nothing.

**Cap.** Three cards. A fourth confirmed event does not enter the pinned region; it lives in the feed
and the event list. One dot per card, always.

Each card keeps its own teal "I'm in" primary — settled, unchanged, not part of this round.

### 03 — Pending strip · separation treatment
**Purpose:** unchanged. One quiet line telling the member some group decisions are waiting on them,
and opening the panel.

**What was wrong.** The interim strip is inset 16px, which is *exactly* the event card's own left and
right edges, sits 2px below it and shares its background. Matching gutters is the strongest grouping
cue on the screen — stronger than the hairline meant to divide them — so on first open the region
reads as a fourth row of the card with a footer. The top hairline also lands where a card's internal
divider would land. And it is inconsistent with itself: the expanded panel is already full-bleed, so
opening the strip changes its width.

**The fix** (`.pd-strip.pd-sep`, additive class — the interim rules stay valid for anything without
it):

- **Full bleed.** `margin: 0`; the hairline rules run edge to edge. Nothing else on the screen is
  card-shaped and full-width at once, so the band cannot be read as part of an object.
- **Feed gutter, not card gutter.** `padding: 12px 20px`, `gap: 11px`. Contents align with the chat
  below (20px) rather than the card above (16px), which groups the strip with its lower neighbour.
  Alignment does the work the hairline could not.
- **Air above.** The pinned region's bottom padding goes 2px → **14px** (`.gh-pinned.pd-above`). The
  gap above the strip is now larger than any gap inside the card, so the card visually closes before
  the strip begins.
- Below, separation is carried by the bottom hairline plus the feed's own centred uppercase day
  divider, which is unmistakably feed furniture. `.pd-host.pd-sep-host + .gh-feed { padding-top: 6px }`.

**Not changed, on purpose:** no fill, no radius, no shadow, no border box, no teal. One line when
collapsed. Clock icon 16px `--text-secondary`, chevron 18px `--text-faint`. Counts are the only
`--text-primary` weight 700 text in the strip. No badge, no pulse, no colour change on new items. The
region is absent entirely when nothing is waiting and no standing yes exists. Expanding still overlays
and dims the feed; the panel's internals are as previously drawn and unchanged here.

The event card remains the only raised, bordered, shadowed object on the screen and holds the screen's
only teal.

### 04 — Finish-layer pilot (group home)
Drawn twice with **identical markup**: `04a` plain (base + items 2 and 3) and `04b` with `.fx` added
to the screen root. Not one measurement, padding, type size or piece of copy differs between them, so
adopting or declining the layer cannot reflow anything.

Screen content in both: header (Orbit home button, group name, member sub-line), three-card pinned
carousel with dots, pending strip (collapsed, one line), chat feed (day divider, member bubble, Orbit
gauge bubble with tally, quick-reply gauge chips), pinned composer.

The eight finish moves, all in `finish-layer.css`, all scoped to `.fx`:

1. **Depth wash** — `radial-gradient(128% 58% at 50% -10%, rgba(146,170,205,.115), rgba(21,22,30,0) 62%)`
   on the screen background, 340px tall, `no-repeat`. Painted behind every region.
2. **Grain** — a 150 × 150 `feTurbulence` tile (`fractalNoise`, `baseFrequency .86`, 2 octaves,
   `stitchTiles: stitch`) at **5% opacity**, repeated over the wash so the ramp is dithered and cannot
   band on an OLED panel. Background only; it does not sit over content.
3. **Surface tones** — three steps instead of one: card lifted with
   `linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,0) 56%)` and border `#4d5468`;
   strip recessed with `rgba(6,7,11,.42)`; feed left on `--surface-base`. Regions separate without any
   new borders. Note the direction: the strip goes *down* the hierarchy, not up.
4. **Two-layer card shadow** — `0 1px 2px rgba(0,0,0,.55)` (tight contact edge) plus
   `0 16px 30px -12px rgba(0,0,0,.68)` (soft cast). The card stays the only shadowed object.
5. **Teal primary** — `linear-gradient(180deg, rgba(255,255,255,.22), rgba(255,255,255,0) 62%)` over
   the fill plus `inset 0 1px 0 rgba(255,255,255,.34)` and `0 1px 2px rgba(0,0,0,.42)`. The teal token
   itself is untouched, so label contrast is unchanged. Same recipe for any other teal primary if the
   layer is adopted app-wide.
6. **Lime glow** — `drop-shadow(0 0 9px rgba(164,239,78,.30))` on Orbit's mark in the header and on
   every Orbit bubble avatar. Reserved for the mark: never on an action, a status, a chip or a count.
7. **Uppercase eyebrow tracking** — day dividers open to `letter-spacing: .2em`.
8. **Tabular tallies** — `font-variant-numeric: tabular-nums` on the card status line, the strip
   counts and Orbit's gauge tally, so numbers stop shifting as they update.
   **Grounded composer** — `linear-gradient(0deg, rgba(0,0,0,.34), rgba(0,0,0,0))` under the pinned
   input, so the feed ends rather than sliding under it.

What the layer deliberately does not do: **no motion** (no transitions, entrances, shimmer or
parallax — every value is static); **no new hue** (the wash is a desaturated blue-grey at 11%, not a
brand tint; teal and lime keep their exact token values); **no new meaning** (nothing in the layer
carries status — greyscaling the screen loses nothing); **no layout change**; **no promotion of the
strip**.

**How to adopt or decline:** add or remove `.fx` on the screen root, or drop `finish-layer.css` from
the build. Items 2 and 3 live in `round4-base.css` and are unaffected either way. Do not merge the two
files.

---

## Interactions & behaviour
- **Front door:** the teal button starts group creation (existing flow, step 1). The note is text, not
  a link target; invite links resolve to the join screen. No other interactive element.
- **Carousel:** horizontal swipe, snapping one card at a time, soonest first. Dots reflect the snapped
  index; tapping a dot may jump to that card. Card body opens event detail; the card's own teal button
  answers the RSVP in place. No auto-advance, ever, and no transition on the dot state.
- **Pending strip:** tap the strip to expand, tap the header or chevron again to collapse. That is the
  only collapse control. Expanding overlays and dims the feed; the feed does not reflow or resize.
  Counts update silently. No entrance animation, no attention badge.
- **No animation anywhere in this round.** If the codebase has a shared transition helper, the
  carousel scroll is the only place native momentum applies; nothing is scripted.
- **Growth:** the front-door rows, card titles and metadata, the strip line and every tally wrap.
  Nothing is height-capped or truncated. The type scale is rem-based and honours OS text size.

## State
- **Front door:** none beyond routing — render only when there is no session, or a session with no
  group. Never shown to a member of a group.
- **Carousel:** `pinnedEvents: Event[]` sorted ascending by `startsAt`, sliced to 3. `index: number`
  for the snapped card, derived from scroll position. Dots render only when `pinnedEvents.length > 1`.
- **Pending strip:** unchanged from the pending-surface handoff (`pendingItems`, `standingYes`,
  `expanded`, `caughtUp`). The region renders only when `pendingItems.length || standingYes.length`.
- **Finish layer:** not state. A build-time or theme-level class on the screen root.

## Design tokens
No new tokens. Everything comes from the existing set:

Surfaces `--surface-base` #15161e · `--surface-raised` #262b37 · `--surface-self` #363c4b ·
`--hairline` / `--border` #454c5e
Text `--text-primary` #ECEDF2 · `--text-secondary` #A7AAB6 · `--placeholder` #8c91a0 ·
`--text-faint` #6F7280
Brand `--lime` #a4ef4e (Orbit only: never an action, never a button, never a status) ·
`--lime-ink` #233006
Action `--action` #18bccb · `--action-ink` #0a2125
Type scale (rem, hard floor 13px) `--type-display` 28 · `--type-title` 24 · `--type-heading` 20 ·
`--type-body` 17 · `--type-meta` 15 · `--type-label` 14 · `--type-eyebrow` 13
Leading `--leading-tight` 1.15 (titles) · `--leading-normal` 1.5 (everything else)
Fonts Hanken Grotesk 800 (display) · Inter 400–700 (UI)
Radius card 14 · pill/chip 20–28 · panel 0 0 16 16
Shadow event card only

The finish layer adds **no colour values** — only black and white alphas over these tokens, plus the
one 11% blue-grey wash.

Colour independence: dot state is width + brightness; card status is a bright count plus a word label
("4 In · 1 Out · 4 TBD"); nothing added this round encodes meaning in hue.

## Assets
- `orbit-mark.js` — Orbit's avatar mark (lime sphere, moon on an orbit path), `OrbitMark.svg(size)`.
  In-app this is the existing avatar component; use whatever the codebase already ships.
- All other icons are inline stroked SVG paths in the reference HTML: arrow (front-door CTA, composer
  send), chevron (card, header, strip), clock (strip), check (RSVP).
- No images, no icon font. The grain in the finish layer is an inline SVG data URI, not an asset file.

## Files
- `round4-design-reference.html` — the board: item 01 front door, item 02 four carousel states, item 03
  before/after, item 04 before/after plus the finish-layer inventory and handoff notes. Open this first.
- `round4-base.css` — items 01, 02, 03. **Source of truth for measurements.** Contains no finish-layer
  styling. The last block (`.gh-rail.at2` / `.at3`) is mock-only: static stand-ins for two scroll
  positions on the board, not production.
- `finish-layer.css` — item 04. Every rule scoped to `.fx`. Separable by design.
- `walkthrough.css` — the app's tokens, phone shell, event card, chat and chip styles everything builds
  on (existing file, unchanged).
- `pending-surface.css` — the pending strip and panel (existing file, unchanged; item 03 overrides it
  additively via `.pd-sep`).
- `orbit-mark.js` — Orbit avatar mark.

Load order: `walkthrough.css` → `pending-surface.css` → `round4-base.css` → `finish-layer.css`.

Overridden from the earlier files: `.gh-dots` (active state), `.gh-rail.peek` and `.gh-pinned.peek`
(track and card widths), and `.pd-strip` via the additive `.pd-sep` class. Nothing else in the shipped
CSS is touched.
