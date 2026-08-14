# Chat-feed boundary design (13 Aug 2026)

The group home's card region and its chat feed do not separate from each other, and the idea
card does not separate from either. This slice gives both seams a real edge. Source read
before anything was proposed: the 12 Aug QA postscript at the end of build-notes §11 (note
one), which records the complaint in the owner's own words and the two constraints any fix
inherits.

**Status: design settled with the owner 13 Aug 2026; the visual answer is not.** This slice has
a gate in its middle. The brief below goes to Claude Design, the handoff comes back, and only
then can the implementation plan be written. Nothing is built yet.

---

## Front section

**Decisions settled (do-not-relitigate).**

1. The fix is sourced from a Claude Design round, not decided in-repo. The design boards have
   no boundary at this seam either, so there is no existing source to match against; this is a
   gap in the design rather than a build that drifted from it.
2. The chat feed's own appearance may change. Both structural directions go to the designer as
   variants rather than being pre-picked.
3. `--surface-base` is never redefined. A new ground is a new token.
4. The confirmed event card is frozen, with one declared exception (below).
5. The scrolling risk is accepted knowingly: a static board cannot prove how the seam feels
   under a thumb, and the owner chose the design round anyway.

**Not in this slice.** The onboarding wizard's two bubble grammars and its undrawn `OrbitPause`
state, which belong to polish slice two. Every other screen and the `OrbitNoteScreen` wall,
which belong to polish slice three. The discoverability gap recorded on 12 Aug (nothing on the
card region says the chat chips are the way back after a decline), which was deliberately not
queued and stays that way.

**How it is verified.** A rendered browser comparison of every changed screen state against the
returned handoff boards, side by side, because this is a "matches the design" claim and nothing
else counts for one. Then a real-scroll pass on the owner's phone, which is the only thing that
can answer the motion half of the complaint and which no board can supply.

**Debt expected.** If direction B wins, a second ground under the chat is a contrast question
every future chat element inherits, and polish slices two and three will need to know which
ground they draw on.

---

## Part 1 · What is actually wrong, with the values

Three findings from reading the shipped code, all confirmed before the brief was written.

**The idea card has no fill.** `IdeaCard.tsx` sets `backgroundColor: var(--surface-base)`,
which is `#15161e`, the exact value of the page behind it and of the chat feed below it. The
card is a 1px hairline outline drawn on the chat's own ground. The confirmed card sits on
`--surface-raised` (`#262b37`) with `box-shadow: 0 1px 3px rgba(0,0,0,.35)`. That difference is
the entire visual distinction between an idea and a plan today, and it is why the idea card is
the one that disappears.

**The seam is unmarked, and it is the only one on the screen that is.** The group home has
three horizontal seams. The header ends in `borderBottom: 1px solid var(--hairline)`
(`PageHeader.tsx`). The composer sits on a scrim,
`linear-gradient(0deg, rgba(0,0,0,.34), rgba(0,0,0,0))` (`ChatInput.tsx`). Between the card
region and the feed there is `marginTop: 0.75rem` and nothing else: same background above and
below, no rule, no shadow, no change of plane. The owner's "it all blends" is exact.

**The design boards never drew one either.** In `docs/design/design-polish-rd-2/`,
`.gh-pinned` and `.gh-feed` are separated by padding alone; the only separation rule in the
round-4 base CSS is `03 · PENDING STRIP · SEPARATION TREATMENT`, which addressed the strip that
retired on 12 Aug. So this is not a build that drifted from its design. The design has a hole,
which is what makes a design round the right source rather than a code fix.

## Part 2 · The two directions

Both go to Claude Design. Neither is pre-selected.

**Direction A, move the card.** The idea card gets a ground of its own, distinct from both the
chat behind it and the confirmed card beside it. The feed is untouched. Because
`--surface-base` and `--surface-raised` are both spoken for, this most likely introduces a
fourth surface value. Cheapest in ripple, and it leaves the seam problem to be solved
separately by an edge treatment.

**Direction B, move the ground.** The chat feed carries its own surface, so the whole lower
region reads as a different plane from the card region above it. One move answers both
complaints: the regions separate because they are literally different grounds, and the idea
card stops matching the chat because the chat moved. It is also the direction that most
directly kills "the feed slides underneath," since the feed would have a real ground with a
real top edge rather than a void. The cost: every bubble is currently drawn against base, so
all of their contrast shifts at once, and the viewer's own `--surface-self` bubble (`#363c4b`)
is the one most at risk of going muddy.

## Part 3 · Scope, frozen and open

**Open.** The seam between the card region and the feed. The idea card's ground. The feed's own
ground. The palette, to the extent of adding a new surface value.

**Frozen.** The confirmed event card's content and shell; the gauge chips; the RSVP pair; the
carousel's peek geometry and dot treatment; the header; the composer; every other screen. The
card-state-grammar handoff landed on 12 Aug and this round is not an opportunity to reopen it.

**The one declared exception.** If moving the feed's ground makes the confirmed card's contrast
wrong, the confirmed card may be adjusted. Any such adjustment must be named in the handoff
rather than slipped in, so the describe-back can catch it.

**The hard constraint, stated separately because it is cheap to violate and expensive to
undo.** `--surface-base` is read by fifteen component files across the front door, the join
screen, onboarding steps 1 through 3, the group home, event detail, group info, the members-only
wall, and both dead-end screens. Redefining its value would repaint all of them and would
invalidate design work for polish slices two and three, neither of which has started. A new
ground is therefore a new token, always.

## Part 4 · Verification, written before any code

1. **Describe-back before any visual code is written.** The returned handoff is described in
   plain language, including anything it implies but does not hold, and every difference from
   the shipped screen is raised as a question rather than fixed silently.
2. **Rendered comparison.** Each changed state is rendered in a browser next to its board:
   the group home at rest, the group home scrolled with a message meeting the feed's top edge,
   the single-idea-card case, and the empty-state case. A "matches the design" claim without
   this comparison is not made.
3. **The subordination check, which is a product claim and not a pixel one.** With a confirmed
   card and an idea card in the same rail, an idea must still read as a maybe at a glance. This
   is checked by looking, and recorded as checked by looking.
4. **The real-scroll pass on the owner's phone.** The motion half of the complaint cannot be
   answered by a board or by a desktop browser. This is the accepted risk of choosing a design
   round, named here so the PR does not later claim it was covered.
5. **Test baseline.** 87 files, 880 tests, green as of 13 Aug 2026, matching the previous
   slice's finishing number. No pre-existing failures to carry.
6. **The test tripwire.** The card shells' background values are asserted nowhere, so the shell
   changes are test-neutral. The chips and the RSVP pair *are* colour-asserted, in
   `src/components/__tests__/choice.test.tsx` and
   `src/components/__tests__/RsvpControls.test.tsx`. If the returned design pushes either of
   those, that is a scope breach to raise, not a test to update.

## Part 5 · Debt this slice expects to open

**If direction B wins: a second ground under the chat.** Every chat element added after this
inherits a contrast question that a single base ground never posed, and the two unbuilt polish
slices need to know which ground they are drawing on. The product cost is small and slow: it
makes future chat work marginally more expensive to get right, and it makes a careless future
change more likely to produce something that looks nearly right. Recorded rather than avoided,
because the alternative direction has its own cost and the owner is choosing between them with
the boards in hand.

**Either direction: one more token in a palette that is deliberately small.** The palette has
three surfaces because three was enough. A fourth is justified only if the boards show it
earning its place; if a variant solves this with the existing three, that variant wins on that
ground alone.

## Part 6 · The brief sent to Claude Design

The prompt is kept in its companion file,
`docs/superpowers/specs/2026-08-13-chat-feed-boundary-design-prompt.md`, so the exact text sent
is recoverable later. It asks for six phone-width dark boards covering both directions at rest
and scrolled, the single-idea-card worst case, and the subordination ladder, with two seam
strengths offered on the at-rest boards.

## Part 7 · What happens when the handoff returns

In order, with the owner's gates marked:

1. The handoff lands in `docs/design/` under its own round folder.
2. Describe-back, in plain language, before any code. **Owner gate:** every difference from the
   shipped screen is a question for the owner.
3. The owner picks a direction and a seam strength from the boards.
4. The implementation plan is written against the chosen boards, and this spec gains a
   revision note recording what was picked and why.
5. **Owner gate:** the go signal before any execution run begins.
6. Build, verify per Part 4, open the PR, **owner gate:** the merge.

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
