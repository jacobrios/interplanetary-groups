# Claude Design prompt: chat-feed boundary round (13 Aug 2026)

The prompt below is the exact text sent to Claude Design, through the connector rather than
carried by hand (a first for this project). It asks for a "Send to local coding agent" handoff,
which is the only build source visual code is written from. Companion to
`2026-08-13-chat-feed-boundary-design.md`.

---

I need a design round for one seam on the group home of Interplanetary Groups, a dark-first
mobile group-coordination app. The screen shipped against your design-polish-rd-2 handoff and
the card-state-grammar round after it, and it matches both. This round fixes something neither
round drew.

## The problem, in the product owner's words

"The chat feed and the card region do not separate from each other well enough. It all blends,
and scrolling makes the feed look like it slides underneath the card rather than stopping at a
boundary." And, separately: the pending idea card "has a background that is the exact same as
the background of the chat window. I don't want it to look exactly like confirmed events, it
should look different, but it also should not have the exact same styling as the chat window."

## The current state, with real values

The group home, top to bottom: a header, a pinned card region (a horizontal snap carousel
mingling confirmed event cards and pending idea cards in date order), a chat feed that is its
own scroll region, and a pinned composer.

There are three horizontal seams on this screen and only one of them is unmarked:

- The header ends in `border-bottom: 1px solid var(--hairline)`.
- The composer sits on a scrim, `linear-gradient(0deg, rgba(0,0,0,.34), rgba(0,0,0,0))`.
- **Between the card region and the chat feed there is 12px of margin and nothing else.** Same
  background above and below, no rule, no shadow, no change of plane. The feed's scroll region
  has no edge treatment either, so a message scrolling past the top simply ceases to exist.

And the two card kinds are separated by very little:

- **Confirmed event card:** `background: #262b37` (`--surface-raised`), `1.7px` hairline
  border, `border-radius: 14px`, `box-shadow: 0 1px 3px rgba(0,0,0,.35)`.
- **Pending idea card:** `background: #15161e` (`--surface-base`), `1px` hairline border,
  `border-radius: 14px`, no shadow.

`#15161e` is also the page background and the chat feed's background. So the idea card
effectively has **no fill at all**: it is a hairline outline drawn directly on the chat's own
ground. That is the root of both complaints.

The flat idea-card shell was a deliberate choice from the previous round, so that a maybe would
never read as a confirmed plan. That intent must survive this round. The quietness is right;
what it costs today is any edge of its own.

## Two directions, both wanted

Do not pick one. Draw both so they can be compared.

**Direction A, move the card.** The idea card gains a ground of its own, distinct from both the
chat behind it and the confirmed card beside it, and the chat feed is untouched. Since
`--surface-base` and `--surface-raised` are both spoken for, this likely means a fourth surface
value. The seam between the regions is then solved separately, by an edge treatment of your
choosing.

**Direction B, move the ground.** The chat feed carries its own surface, so the lower region
reads as a different plane from the card region above it. One move answers both complaints, and
it is the direction most likely to fix the "slides underneath" feeling, because the feed would
have a real ground with a real top edge instead of a void. Its cost, which the boards need to
show honestly: every chat bubble is currently drawn against `#15161e`, so all of their contrast
shifts at once, and the viewer's own bubble (`--surface-self`, `#363c4b`) is the one most at
risk of going muddy.

## Draw these six boards, phone-width, dark

1. **Direction A, at rest.** The full screen: header, a rail with a pending idea card first and
   a confirmed card peeking at the right edge, three or four chat messages below, the composer.
2. **Direction A, scrolled.** The same screen with a chat message cut by the feed's top edge, so
   the seam is shown doing its actual job rather than only sitting there.
3. **Direction B, at rest.** Same content, same framing, the other direction.
4. **Direction B, scrolled.** Same.
5. **The worst case, both directions side by side.** A single pending idea card alone in the
   region: no peek, no confirmed card next to it to borrow contrast from, the feed directly
   below. This is where a weak answer will fail first.
6. **The subordination ladder, both directions side by side.** A confirmed card, a pending idea
   card, and the quiet empty-state box (shown when there is no event and no idea), stacked, so
   it is visible at a glance that a maybe still never reads as a plan.

On boards 1 and 3, show **two strengths of the seam treatment**, a quiet one and a firm one, so
the owner is choosing between options rather than accepting one.

## Binding constraints, all from the shipped system

- **`--surface-base` (`#15161e`) may not be redefined.** Fifteen component files, spanning every
  screen in the product, read it, and two further design rounds have not been built yet. If a new ground is
  needed, it is a **new token** with a new name, never a new value for that one. Say so
  explicitly in the handoff when you add one.
- Existing tokens otherwise: `--surface-base` `#15161e`, `--surface-raised` `#262b37`,
  `--surface-self` `#363c4b`, `--hairline` `#454c5e`, `--text-primary` `#ECEDF2`,
  `--text-secondary` `#A7AAB6`, `--placeholder` `#8c91a0`, `--text-faint` `#6F7280`,
  `--lime` `#a4ef4e` with `--lime-ink` `#233006`, `--action` `#18bccb` with `--action-ink`
  `#0a2125`. Geist throughout. Dark is the product's one and only theme.
- **A fourth surface must earn its place.** The palette has three surfaces because three was
  enough. If a variant solves this with the three that already exist, that is a point in its
  favour and worth calling out.
- **Frozen, do not redraw:** the confirmed event card's content and shell, the gauge chips and
  their selected states, the RSVP pair and its teal ask-and-answer grammar, the carousel's peek
  geometry and dot treatment, the header, and the composer. One declared exception: if moving
  the feed's ground makes the confirmed card's contrast wrong, you may adjust the confirmed
  card, but **name that adjustment explicitly in the handoff** rather than folding it in
  quietly.
- **Teal (`--action`) is untouched by this round.** It marks the RSVP pair's ask and the
  member's chosen answer, and the need labels. It is never a wash, never a border on a region,
  never decorative, and it is not a candidate for solving this seam. Lime is Orbit's brand mark
  and is never an action.
- **Status is never signalled by hue alone, and never by red versus green.** The product owner
  is red/green colorblind. Brightness, structure, and labels carry meaning; every board must
  survive greyscale.
- Nothing renders below 13px. Layout grows with content and never clips; assume enlarged device
  text. No animation.

## Out of scope for this round

The onboarding wizard, the join screen, event detail, group info, the error and members-only
screens, the chat bubbles' own shapes and the composer's shape (their **contrast** against a
new ground is in scope under direction B, their geometry is not), and the card region's content
and behaviour, which the last round settled.

## Deliverable

A "Send to local coding agent" handoff with the real CSS, components, and assets, superseding
nothing outside the seam and the two grounds named above. Please state in the handoff which
direction each file belongs to, since only one direction will be built.
