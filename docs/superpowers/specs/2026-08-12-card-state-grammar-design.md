# Card state grammar design (12 Aug 2026)

Two changes to the group home's card region, brainstormed together because they are the same
underlying question: how a card communicates its own state. One, the event card's RSVP pair
stops leaning on the answer and gains an honest teal ask-and-answer grammar. Two, the pending
strip retires and pending items become cards in the top carousel. Sources read before anything
was proposed: the 12 Aug QA postscript at the end of build-notes §11 (which records both
changes and their lineage), the strip-placement decision record (11 Aug), and the
pending-surface postscript (10 Aug) whose switching-cost assessment still holds.

**Status: fully settled with the owner, 12 Aug 2026, across the live brainstorm exchange and
the post-handoff review.** This file was first committed as the pre-conversation draft, revised
once with the brainstorm rulings (the teal grammar, chronological order with a cap of five,
the label system), and revised again after the Claude Design round returned: the handoff lives
at `docs/design/design_handoff_round5/`, the describe-back ran, and the owner ruled on every
difference it surfaced (all recorded below, with the deliberate departures from the boards
listed in decision 13). The remaining gates, in order: the implementation plan, the owner's
go, and the merge. Nothing is built yet.

---

## Part 1 · Decisions settled (do-not-relitigate)

### 1. The RSVP pair gets the teal ask-and-answer grammar

Unanswered, "I'm in" and "Can't make it" render as two visually equal options: transparent
fill, and **both carrying a teal border**, so the teal marks the ask itself and leans toward
neither answer. Answering fills **the chosen option** with the action teal plus the checkmark;
the unchosen option drops to a quiet hairline border. The pair keeps its current two-across
full-width layout; the pair is one shared component, so the carousel card and the event detail
screen get the same treatment in the same edit. The dark-pattern complaint is closed by the
equal start, and the owner's want for color on the screen is answered by the ask and the
settled answer holding the teal, which is honest in both directions (a teal-filled "Can't make
it" is the member's own settled answer, not a recommendation). Colorblind-safe throughout:
border versus fill versus checkmark, never hue alone.

### 2. The teal rule is amended to match

Proposed CLAUDE.md wording: **teal never leans an open question. When a control offers two or
more equally valid answers, the options carry equal weight while open: both quiet (the gauge
chips) or both carrying the same teal mark (the RSVP pair's borders, marking the ask itself).
Only an answer the member chose may hold the teal fill. A need label naming something the
viewer must do (NEEDS YOUR RSVP, NEEDS YOUR VOTE) renders in the action teal; a label naming
someone else's move (NEEDS OTHER VOTES) stays quiet grey, so scanning the card region for teal
is scanning for your own to-dos.** The teal-label half was the owner's idea in the
post-handoff review, adopted because the words already carry the your-versus-other
distinction, making the color reinforcement rather than the only signal; the cost accepted
knowingly is that an unanswered confirmed card says "this needs you" twice (teal label above
teal borders), one message repeated rather than two competing, preferred over a special case
that greys the label only where borders exist. Every other teal in the app survives unchanged:
"Add to calendar", the onboarding CTAs, the share button, and the composer send are
invitations to act in one direction. The strip's 7% wash amendment is struck (dated, per
append-only rules) when the strip retires.

### 3. The teal grammar is scoped to the RSVP pair; chips stay grey everywhere

Ruled by the owner: chips are the secondary grammar (a poll on a maybe) and never take teal;
the RSVP pair is the ask on a real plan. The divergence between the two grammars is deliberate
and scoped, and it does subordination work: a confirmed card waiting on the viewer shows teal,
a pending card asks only through its label and quiet chips, so the real plan's ask visibly
outranks the maybe's poll. Consequence, stated so it is confirmed knowingly: a home where
everything is answered shows no teal until text enters the composer; teal on this screen now
means "something here is waiting on you, or holds your answer."

### 4. The strip and panel retire; pending items become carousel cards

The collapsed band, the panel, the scrim, the strip's icons, and the caught-up machinery all
go. What carries over unchanged, per the standing switching-cost assessment: the derivation
module, the server vote actions, the chip components and their callbacks, the shared Orbit
bubble, and (added by the 12 Aug postscript) the rebuilt carousel chrome, whose peek geometry,
scroll-derived dot, and disappearing-card reclamp are exactly what a mixed carousel needs.

### 5. One list, pure date order, cap of five

Confirmed events and pending gauges mingle in one list sorted by when the thing would happen,
ties going to the confirmed plan. Ruled by the owner over confirmed-first ordering: the
soonest item is the most actionable thing on the screen precisely when it is an unconfirmed
maybe, and hiding it behind a later confirmed plan buries the vote it needs. The dilution
worry (the product reason the carousel option originally lost) is answered in the treatment
layer instead: the label system and the quieter pending chrome keep a maybe from ever reading
as a plan. The combined cap rises from three to five, which is the owner's chosen answer to
cap collisions instead of a slot-guarantee rule: at five, the next confirmed plan only falls
off behind five earlier pending items, which real groups do not produce. If one ever does,
that is the recorded trigger to revisit. Overflow beyond five is simply not shown in the
region; chat still carries every item, which was always the primary surface.

### 6. The label answers one question: what does this card still need?

A short uppercase eyebrow label in the card's top right (at or above the 13px floor), present
only while the card needs something, gone when it needs nothing, so a fully settled card goes
bare and the bare state reads as a small reward. Labels naming a need from the viewer render
in the action teal; the one naming other people's move stays grey (decision 2):

- Pending card, viewer has not voted: **"NEEDS YOUR VOTE"** (teal)
- Pending card, viewer voted yes: **"NEEDS OTHER VOTES"** (grey; a declined viewer sees no
  card). The owner's copy, replacing the draft's "needs more votes", because it says whose
  move it is: you have done your part.
- Confirmed card, viewer has not RSVP'd: **"NEEDS YOUR RSVP"** (teal)
- Confirmed card, viewer has answered, no open proposal: **no label**
- Confirmed card with an open time-change proposal, the ladder (from the design round's
  boards, extended with the owner's copy): **NEEDS YOUR RSVP** (teal) until the viewer RSVPs,
  then **NEEDS YOUR VOTE** (teal) until they answer the proposal, then **NEEDS OTHER VOTES**
  (grey) until the vote resolves and the band leaves. The label always names the card's
  highest outstanding need, yours before anyone else's.

The confirmed-versus-pending distinction rides on the wording (RSVP versus vote), the chrome
brightness, and the tally style, never on hue alone. Labels are a carousel device only; the
event detail screen inherits the pair treatment but carries no label.

### 7. Pending cards are subordinate by structure and label, never by hue

A pending gauge card carries: the label above; a title composing **the activity plus a
question mark** ("Beers?"), the owner's post-handoff call, because the mark says "not settled
yet" in one character, in Orbit's own warmth, without duplicating the label's job (the
considered "Pending -" prefix was declined as a fourth state marker in colder language); a
when-line of the proposed day and time through the existing deterministic format helpers,
followed by a fixed **"Place TBD"** segment, kept by the owner because an empty spot where a
place should be reads as a bug while "Place TBD" says a venue is coming (it is constant copy,
not stored data, so the no-venue-until-promotion decision is untouched); the same three gauge
chips as chat (same component, same server action, per the settled answer-in-place decision);
and the live tally in the product's one tally voice. Subordination constraints, drawn and
approved in the round-5 boards: the pending card reads quieter than the confirmed card by
brightness and structure (flat `--surface-base` shell, single hairline, no shadow, body-size
title, no chevron since no detail screen exists behind an idea); never hue alone, never red or
green as the only signal; **no teal wash on any card** (a washed pending card would rank a
maybe above a real plan, inverting the hierarchy the wash was retired with). Layout grows with
content and never clips.

### 8. A time-change proposal is a band on its event's own card, not a second card

The strip carried proposals as their own rows; in the carousel, the affected event already has
a card, and two cards for one plan would corrupt the at-a-glance read worse than any label
could repair. The proposal renders as a band on the confirmed event's card, per the round-5
boards: recessed one step under the raised card (`--surface-base` behind a hairline top), a
"TIME CHANGE" kind label, Orbit's question, the two shipped proposal chips, and that vote's
own tally. The card stays a confirmed card (the plan is real; only its time is in question)
and grows to hold the band. The label ladder for this dense face is in decision 6.
Alternative considered and declined, and still declined: a separate "time change proposed"
card, rejected for the duplicate-plan confusion (it also would not help, since the region is
as tall as its tallest card either way).

**REOPENED 12 Aug 2026, same day, before any code.** The height cost was first accepted
knowingly; when the mechanics were replayed precisely (the region renders at its tallest
card's height, so every shorter card sits above blank space while a vote is open, and the
chat window loads shorter), the owner rejected that consequence, specifically the blank
space under cards that do not need it. A second Claude Design round decides the treatment
(prompt: `2026-08-12-dense-face-alternatives-design-prompt.md` beside this file), drawing
three variants: a compact notice on the card with the full vote moving to the event detail
screen (a knowing bend of the answer-in-place principle, one extra tap); a trimmed band
(question and chips only, no kind label, no tally on the card); and one variant of the
designer's own invention. Going in, the owner leans toward the compact notice; the other
variants are drawn for completeness, so the round weights its attention accordingly. The round also answers the general mixed-height question, since an
idea card is shorter than a confirmed card even with no vote open. The round-5 board 05 band
anatomy stands only as the superseded baseline the variants are judged against. Decisions 6
(the ladder), 9, and the rest of this spec are unaffected; the build is on hold at the
owner's call until this settles, and the implementation plan's derive/band/carousel tasks
get revised to match the outcome before execution.

### 9. Viewer tailoring carries over, adapted to cards

The carousel is already rendered per viewer. A viewer's yes stays visible as the selected chip
on the card, still changeable, so the strip's quiet "You're in on" group is no longer needed
as a separate structure. A decline removes that pending card from that viewer's carousel; the
vote stays recorded, and if the gauge later promotes, the decline arrives as an OUT RSVP on
the created event (already settled), so nothing is lost by hiding the card. Promotion still
removes the item from pending the instant it happens: the gauge card becomes the event card,
and the third yes from a card chip creates and announces exactly as chat does today.

### 10. The caught-up moment retires with nothing in its place

The panel's caught-up note and the band's "All caught up" label existed because an enclosed
surface needed an empty state. Cards need none: the card disappearing, the carousel
re-clamping, and the region simplifying are the feedback. The settled "note fires only when a
decline clears the last waiting item" decision retires with the panel it described; this is a
deliberate retirement, recorded so the silence is never read as an oversight.

### 11. Empty states

The existing "No upcoming events yet" box renders only when the composed list is empty
entirely (no confirmed events and no pending items). When there are no confirmed events but
something is pending, the pending cards render alone; a card with a live question beats a box
saying nothing is happening.

### 12. One chip primitive replaces four near-copies

Three sibling chip components ship today with duplicated style blocks, and restyling the RSVP
pair would create a fourth. This slice extracts one shared chip primitive into the shared
components folder and rebuilds all four consumers on it. Product reason: the slice is about
state grammars staying coherent, and one component is how a grammar stays one; four hand-kept
copies will drift, and the shared folder is the only place the repo can honestly test. The
RSVP pair component also moves out of the event-detail folder it is flagged as mis-homed in,
since it is being rewritten anyway.

### 13. The Claude Design round: complete, and where the build deliberately departs from it

The round ran 12 Aug against the committed prompt and returned the six boards as a real
handoff: `docs/design/design_handoff_round5/` (README with measurements and state model,
`round5-cards.css` as the source of truth for every new value, the shipped base CSS, and a
plain-markup reference of all six boards). The describe-back ran against the full source plus
rendered checks of boards 01 and 02; the handoff is high fidelity, and its gauge chip strings
match the shipped copy character for character. `round5-cards.css` values are ported into the
codebase's components, never loaded as a file, per the handoff's own instruction.

**The build departs from the boards in five named places, each ruled by the owner, so the
rendered-versus-design comparison at verification must treat these as intended:**

1. **Cap:** the boards say three cards; the recorded decision is five. Five wins.
2. **Tally and proposal-chip strings:** the boards show a counts-only tally voice ("2 in · 1
   next time · 5 waiting") and invented proposal chips ("🔄 Switch to 8"). The product has one
   recorded tally voice (names plus "one more makes it happen") and shipped proposal copy
   ("8pm works" / "Keep 7pm"). Shipped words win; the boards' tally placement below the chips
   and tabular numerals are adopted.
3. **Label copy:** the boards' "NEEDS MORE VOTES" becomes the owner's "NEEDS OTHER VOTES".
4. **Label color:** the boards render all labels `--text-secondary`; the owner's teal-label
   rule (decision 2) supersedes them for the needs-you labels.
5. **Pending title:** the boards' bare "Beers" becomes "Beers?" (decision 7).

Adopted from the boards beyond the prompt: the label-precedence ladder on the dense face
(decision 6) and the recessed band anatomy (decision 8). "Place TBD" on the pending when-line
was questioned in the describe-back and kept by the owner (decision 7). The chip grammar, the
carousel chrome, and the card shell remain shipped and settled; the empty-state box, chat, and
the event detail screen were out of the round's scope.

---

## Part 2 · Not in this slice (every exclusion names its home)

- **Orbit's open day-question getting a card or row.** It answers in prose, not chips;
  inherited exclusion from the pending-surface slice, home: a future slice when it earns a
  chip-free type.
- **Verbal RSVP** ("see you Monday" marking attendance). Home: its own queued slice, per the
  29 July QA finding in build-notes §11.
- **An overflow indicator or count** for items beyond the cap (the strip's "2 waiting on you"
  summary line dies with the strip). Home: post-MVP, with the trigger named in Part 4.
- **Venue on pending cards.** Settled: no gauge stores one until promotion; never shown early.
- **Any change to how often Orbit speaks in chat.** None; the region stays purely additive.
- **Condensing the event card after RSVP.** Open question recorded in build-notes §7; not
  built preemptively.
- **Animations** (card transitions, fades). Declined for MVP in the strip-placement record.
- **The onboarding wizard's polish.** Home: polish slice two, which this slice displaces in
  time but not in order; the pre-MVP triage order otherwise stands.
- **Founder fixing group details after creation.** Home: the queued post-MVP slice.
- **Multi-group home.** Out of MVP scope per build-notes §8.

---

## Part 3 · Verification (written before any code)

**No model behavior is touched.** No prompt changes, no new model calls, zero marginal run
cost; the recognition bench is not owed a run by this slice. Stated so the absence of bench
numbers in the PR is read as correct rather than skipped.

1. **Test-suite baseline** recorded at slice start in the build-notes §11 entry,
   cross-checked against polish slice one's finishing number, before any code lands.
2. **Component tests on the new chip primitive and the rebuilt RSVP pair**, written first and
   shown failing against the current build where applicable: unanswered renders both options
   with the action-teal border, no fill, no checkmark; selecting either option fills and marks
   exactly that option and quiets the other; the in-flight state disables both. Assertions
   target semantics (labels, marks, which option carries the action color), not pixel values.
   This closes the current zero-coverage gap on the RSVP pair.
3. **Pure-function tests on the carousel composition and the label logic**: pure date order
   with ties to the confirmed plan; the combined cap of five; a viewer's decline dropping the
   card; promotion moving an item from pending to confirmed; a proposal attaching to its event
   rather than composing as its own item; both empty-state branches; every rung of the label
   ladder (NEEDS YOUR RSVP, NEEDS YOUR VOTE, NEEDS OTHER VOTES, bare) including the dense-face
   precedence and the teal-versus-grey classification; and the pending title composing as
   activity plus question mark. The existing derivation tests carry over; the strip's own
   tests and the strip-gate helper's tests retire with their components.
4. **Browser walkthrough on dev-test, multi-session**, evidence captured as screenshots and
   named in the PR: the unanswered card leaning on nothing, both borders equal; a "Can't make
   it" tap visibly moving the teal to the chosen answer; the label flipping from the teal
   "NEEDS YOUR VOTE" to the grey "NEEDS OTHER VOTES" on a chip yes, and disappearing on an
   RSVP; the dense-face ladder walking all three rungs; a chip vote from a pending card
   landing in chat's tally and vice versa (same action, same rows); a third yes from a card
   chip creating the event, the card converting in place, chat announcing once; a decline
   clearing the last pending card with nothing else firing; a proposal band on the event card
   whose clearing vote moves the plan and resets RSVPs per the settled consensus rules; the
   date order holding with confirmed and pending mingled.
5. **Rendered-vs-design comparison** against the round-5 boards for every visual claim, per
   the no-claimed-match-without-comparison rule, with decision 13's five named departures
   treated as intended differences rather than misses.
6. **Owner QA script**, proposed unprompted with the PR, ten minutes or less, run on a real
   phone, and it must include re-judging both originating complaints: "does the card still
   lean toward yes before you have answered?" and "do the maybes read clearly subordinate to
   the real plans?", plus the two judgments only a human can make there: whether the dense
   face's height feels workable in the flesh (decision 8), and whether the label copy reads
   right at a glance.

---

## Part 4 · Debt this slice expects to open

- **Hidden overflow has no surface count.** More than five combined items hides the rest of
  pending from the region entirely, and the strip's summary count is gone. Accepted at cap
  five; revisit triggers: a real group regularly holding more than five simultaneous items, or
  a next confirmed plan ever falling off behind five earlier maybes. Home: post-MVP.
- **A proposal on an event outside the top five cards is invisible outside chat.** Same
  acceptance, same trigger.
- **Mixed-height cards leave dead space below shorter ones**, since the rail stretches to the
  tallest card. Cosmetic; handed to the design round, and accepted if the round does not
  solve it.
- **The written-off strip polish** (separation geometry, the wash) is knowingly discarded;
  already recorded in the 12 Aug postscript, restated here so the PR diff's deletions read as
  intended.
- **Inherited, unchanged:** the day-question has no surface outside chat; a wrong venue still
  has no fix path.

---

## Slicing recommendation: one slice (accepted direction)

Both changes build as one slice. They share one foundation (the chip primitive and the card
state grammar), one design round (the board must show the restyled pair and the pending cards
on the same card faces to be judged at all), one surface, and one QA walkthrough; split in
two, each half ends in a separate ten-minute QA of the same screen, and the owner's attention
is the binding constraint. Every seam is proven ground: the chips, the vote actions, the
derivation module, and the carousel chrome are all shipped and walked, so the slice is large
but honestly verifiable. The clean split point, recorded in case plans change: the RSVP pair
work alone needs no design round and could land first, at the cost of touching the same card
twice and running QA twice.

---

## Doc obligations when the slice lands (not debt; duties)

- CLAUDE.md: the teal-rule amendment in decision 2, plus the chips-never-teal scope note from
  decision 3; strike the strip-wash amendment line with a date; rewrite the pending-strip
  paragraph of "Where the build is"; update the event-card line in the color rules ("teal
  primary plus outlined secondary") to the ask-and-answer grammar; update the
  settled-decisions list where strip-specific decisions retire (the caught-up note, the wash)
  and where card decisions supersede them.
- build-notes §11: the slice entry, with baseline and after test counts and the walkthrough
  evidence.
- The strip-placement decision record gets a dated postscript pointing here, recording that
  the revisit trigger fired early (a real phone, pre-launch) and the carousel option revived.
- Pre-deploy checklist: nothing to add; no migration, no environment variable, no model call.
