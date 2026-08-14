# Claude Design prompt: card region height round (14 Aug 2026)

The prompt below is the exact text to paste into Claude Design. It asks for a "Send to local
coding agent" handoff, which is the only build source visual code is written from. Companion to
`2026-08-14-card-region-height-design.md`.

Pasted by the owner rather than pushed through the connector. The connector's write path works
as of this date, but it is an authoring surface: using it would make the build agent the
designer, and the value of a round is a fresh instance reading only the brief.

---

I need a design round for one card on the group home of Interplanetary Groups, a dark-first
mobile group-coordination app. The screen shipped against your design-polish-rd-2 handoff, the
card-state-grammar round, and the round 7 seam round, and it matches all three. This round fixes
something none of them drew: nobody has ever given the card region a height budget.

## The problem, measured on the owner's phone

The group home, top to bottom: a header, a pinned card region (a horizontal snap carousel
mingling confirmed event cards and pending idea cards in date order), a chat feed that is its own
scroll region, and a pinned composer.

On an iPhone 13 Pro in Chrome, the page gets 661 CSS pixels of height, because Chrome holds both
its bars and the feed's inner scroll never collapses them. That 661 is spent like this:

| Region | Height | Share |
|---|---|---|
| Header | 74px | 11% |
| **Card region** | **315px** | **47.7%** |
| **Chat feed** | **208px** | **31.5%** |
| Composer | 64px | 10% |

The card region takes nearly half the screen and the chat, which is the product's one
conversation surface and where every plan actually starts, gets two visible messages.

Every card sets `height: 100%` and the rail renders at its tallest card's height, so one tall
card sizes every card beside it and the whole region. **Equal-height cards are a settled decision
and are not being reopened.** What has to change is the height of the whole set.

## What is already solved, and is not your problem

The pending idea card was the tallest card at 272px. Two copy changes, already decided, bring it
to 203px: its three chips now fit on one row, and its tally line now fits on one line. **Treat
the idea card as fixed at 203px.** You may reference it, and board 5 below asks you to draw it,
but do not redesign it.

That leaves the confirmed event card as the tallest thing in the region, and it is this round's
whole subject.

## The confirmed event card, with real values

The card is **342px wide** at a 390px viewport, leaving **310px** of content width inside its
padding. Measured heights of every part, in render order:

| Part | Height | Notes |
|---|---|---|
| Card border | 3.4px | `1.7px` all round |
| Padding | 27px | `14px` top, `13px` bottom |
| Need label | 25px | optional; see states below |
| Title | 23px one line, **46px two lines** | `--type-heading` 20px, weight 800 |
| Meta line | 23px | date, then venue label when there is one |
| Counts line | 29px | includes its top margin |
| RSVP pair | 51px | includes its top padding |
| Time-change notice | 42px | optional; a recessed full-width footer line |

**Natural totals: 229px with a one-line title, 246px with a two-line title.**

Content states each part can take:

- **Need label** (top-right eyebrow, 13px uppercase): "NEEDS YOUR RSVP" or "NEEDS YOUR VOTE" in
  teal when the outstanding move is the viewer's own; "NEEDS OTHER VOTES" in grey when it is
  other people's; **absent entirely** when the card needs nothing.
- **Title**: an event name, from a member's own words. "Trivia Night" is one line. "Sunday
  Morning Climbing Session at the Wall" is two. Two lines is a real case, not an edge case.
- **Meta**: "Wed, Aug 19 · 7pm · The Hoppy Place". The venue is optional. The venue string is a
  short display label by design, so assume it is short, but the date and time are always present.
- **Counts**: "2 In · 1 Out · 2 TBD". The Out clause is hidden when zero. Names never appear
  here; the roster with names lives on the event's own screen.
- **RSVP pair**: two side-by-side buttons, "I'm in" and "Can't make it".
- **Time-change notice**: present only when the group has an open vote to move this event's time.
  Today it is a recessed footer line: a swap icon, "Time change proposed · Move to 8pm?", a
  chevron. It links to the event's screen, where the vote itself lives. It never carries its own
  chips, deliberately.

## The ask

**Compose this card inside a 204px budget**, at a 390px viewport, with a one-line title and no
time-change notice as the baseline state.

Then show honestly what happens in the three states that exceed it: a two-line title, an open
time-change notice, and both at once. **Clipping and truncation are not available to you** (see
constraints), so those states either grow the card or the design absorbs them some other way.
Whichever you choose, name it in the handoff. A design that meets 204px on the short case and
silently grows to 250px on a real group's event name has not solved this.

**Draw two approaches, not one.** The owner chooses between them. They should differ in what they
do structurally, not in styling: for instance one that keeps all six parts and packs them, against
one that changes what a part is or where it lives.

## Draw these six boards, phone-width (390px), dark

1. **Approach A, baseline.** The confirmed card alone at the budget: one-line title, venue
   present, RSVP unanswered, need label showing "NEEDS YOUR RSVP", no notice.
2. **Approach B, baseline.** Same content, same framing, the other approach.
3. **Both approaches, the three overflow states**, side by side: two-line title; open
   time-change notice; both together. This is the board the round is really for.
4. **Both approaches, the settled state**: viewer has answered, no notice, so the need label is
   absent. The quietest the card ever gets, and a check that it does not look unfinished.
5. **The family check, both approaches**: the fixed 203px idea card and your confirmed card side
   by side as they sit in the rail. See the distinctness note below; this board is where a wrong
   answer will show.
6. **The full screen, the winning-looking approach only**, at 390x661: header, the rail with an
   idea card and a confirmed card peeking, the chat feed below, the composer. Show the actual
   chat gain rather than asserting it.

## Binding constraints, all from the shipped system

- **Do not buy height by weakening how an idea card differs from a confirmed one.** Five signals
  separate them, in measured strength order: the controls, the shadow, the title weight, the need
  label, and the fill. Fill is the weakest and is already spent, because the palette spans only
  1.27:1 from page to brightest card. **Background colour is not a lever in this round.** If an
  approach costs one of the other four, say so explicitly in the handoff rather than folding it in.
- **Teal (`--action`, `#18bccb`) grammar is frozen.** It marks the RSVP pair's ask (both borders
  while unanswered, leaning toward neither answer), the member's chosen answer (fill), and a need
  label naming the viewer's own move. It is never decorative, never a wash, never on a chat
  bubble. Lime (`#a4ef4e`) is Orbit's brand mark and is never an action.
- **Status is never signalled by hue alone, and never by red versus green.** The product owner is
  red/green colorblind. Brightness, structure, and labels carry meaning; every board must survive
  greyscale.
- **Layout grows with content and never clips.** Use min-height plus padding, never fixed heights.
  Assume enlarged device text. Truncation and line-clamping are not available for the title.
- **Nothing renders below 13px**, which is the type scale's hard floor. The existing roles: title
  at `--type-heading` (20px), body and chat at `--type-body` (17px), meta at `--type-meta` (15px),
  in-card buttons and counts at `--type-label` (14px), uppercase eyebrows at `--type-eyebrow`
  (13px). Sizes are in rem so they honor the device text setting.
- **Tokens** (do not redefine, add new names if you need new values): `--surface-base` `#15161e`
  (the page and the chat), `--surface-low` `#1f222c` (an idea card), `--surface-raised` `#262b37`
  (a confirmed card), `--surface-self` `#363c4b` (the viewer's own bubble), `--hairline`
  `#454c5e`, `--text-primary` `#ECEDF2`, `--text-secondary` `#A7AAB6`, `--text-faint` `#6F7280`,
  `--action` `#18bccb` with `--action-ink` `#0a2125`, `--lime` `#a4ef4e` with `--lime-ink`
  `#233006`. Geist throughout. Dark is the product's one and only theme.
- No animation.

## Out of scope for this round

The idea card's composition (fixed at 203px), the header, the composer, the chat bubbles, the
carousel's peek geometry and dot treatment, the seam between the card region and the feed (round
7 settled it), the empty-state box, and every other screen in the product.

Three things the owner has queued separately and deliberately excluded from this round, so please
do not solve them here even if a board makes them tempting: making an idea card more visually
distinct from a confirmed one, the wording of the time-change tally, and letting a member answer
a time change with checkboxes rather than an either/or.

## Deliverable

A "Send to local coding agent" handoff with the real CSS and components. State which files belong
to approach A and which to approach B, since only one will be built. In the handoff, state
plainly for each approach: its measured height in the baseline state, its height in each of the
three overflow states, and which of the five distinctness signals it spends, if any.
