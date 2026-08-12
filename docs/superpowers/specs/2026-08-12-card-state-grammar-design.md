# Card state grammar design (12 Aug 2026)

Two changes to the group home's card region, brainstormed together because they are the same
underlying question: how a card communicates its own state. One, the event card's RSVP pair
stops leaning on the answer and gains an honest teal ask-and-answer grammar. Two, the pending
strip retires and pending items become cards in the top carousel. Sources read before anything
was proposed: the 12 Aug QA postscript at the end of build-notes §11 (which records both
changes and their lineage), the strip-placement decision record (11 Aug), and the
pending-surface postscript (10 Aug) whose switching-cost assessment still holds.

**Status: decisions settled with the owner in the 12 Aug brainstorm exchange.** This file was
first committed as the pre-conversation draft; this revision carries the owner's rulings from
that exchange (the teal grammar, chronological order with a cap of five, the label system).
The remaining gates, in order: the Claude Design round (prompt committed beside this file as
`2026-08-12-card-state-grammar-design-prompt.md`), the implementation plan, the owner's go,
and the merge. Nothing is built yet.

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
Only an answer the member chose may hold the teal fill.** Every other teal in the app survives
unchanged: "Add to calendar", the onboarding CTAs, the share button, and the composer send are
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
bare and the bare state reads as a small reward:

- Pending card, viewer has not voted: **"Needs your vote"**
- Pending card, viewer voted yes: **"Needs more votes"** (a declined viewer sees no card)
- Confirmed card, viewer has not RSVP'd: **"Needs your RSVP"**
- Confirmed card, viewer has answered: **no label**

The confirmed-versus-pending distinction rides on the wording (RSVP versus vote), the chrome
brightness, and the tally style, never on hue. Labels are a carousel device only; the event
detail screen inherits the pair treatment but carries no label. Final copy stays the owner's
call on the rendered board.

### 7. Pending cards are subordinate by structure and label, never by hue

A pending gauge card carries: the label above; a title composing the activity plus proposed
day and time through the existing deterministic format helpers; the same three gauge chips as
chat (same component, same server action, same tally, per the settled answer-in-place
decision); and the live tally in the product's one tally voice. Subordination constraints
binding on the design round: the pending card reads quieter than the confirmed card by
brightness and structure (for example a flatter, hairline-only shell); never hue alone, never
red or green as the only signal; **no teal wash on any card** (a washed pending card would
rank a maybe above a real plan, inverting the hierarchy the wash was retired with). Layout
grows with content and never clips.

### 8. A time-change proposal is a band on its event's own card, not a second card

The strip carried proposals as their own rows; in the carousel, the affected event already has
a card, and two cards for one plan would corrupt the at-a-glance read worse than any label
could repair. The proposal renders as a band on the confirmed event's card: the question, the
two proposal chips, and the live tally, all the existing shared components. The card stays a
confirmed card (the plan is real; only its time is in question) and grows to hold the band.
The dense face this creates (a card holding its own RSVP pair, possibly a "Needs your RSVP"
label, and an open proposal band at once) is a named problem handed to the design round.
Alternative considered and declined: a separate "time change proposed" card, rejected for the
duplicate-plan confusion.

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

### 13. The Claude Design round, and what it must draw

The strip-placement record said a placement change needs its own design round, since the
handoff drew the strip and not cards. The prompt is committed beside this spec. The round must
draw six boards: the confirmed card unanswered (teal-bordered pair, "Needs your RSVP"); the
confirmed card in both answered states (teal-filled choice, no label); the pending card
unanswered ("Needs your vote", quiet chips, tally); the pending card after the viewer's yes
("Needs more votes", selected chip); the dense face (confirmed card with an open proposal
band); and the mixed carousel in date order showing subordination at a glance. The chip
grammar, the carousel chrome, and the card shell are shipped and settled and are not up for
redraw. The empty-state box, chat, and the event detail screen are out of the round's scope.

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
   rather than composing as its own item; both empty-state branches; and all four label states
   (needs your vote, needs more votes, needs your RSVP, bare). The existing derivation tests
   carry over; the strip's own tests and the strip-gate helper's tests retire with their
   components.
4. **Browser walkthrough on dev-test, multi-session**, evidence captured as screenshots and
   named in the PR: the unanswered card leaning on nothing, both borders equal; a "Can't make
   it" tap visibly moving the teal to the chosen answer; the label flipping from "Needs your
   vote" to "Needs more votes" on a chip yes, and disappearing on an RSVP; a chip vote from a
   pending card landing in chat's tally and vice versa (same action, same rows); a third yes
   from a card chip creating the event, the card converting in place, chat announcing once; a
   decline clearing the last pending card with nothing else firing; a proposal band on the
   event card whose clearing vote moves the plan and resets RSVPs per the settled consensus
   rules; the date order holding with confirmed and pending mingled.
5. **Rendered-vs-design comparison** against the design round's board for every visual claim,
   per the no-claimed-match-without-comparison rule.
6. **Owner QA script**, proposed unprompted with the PR, ten minutes or less, run on a real
   phone, and it must include re-judging both originating complaints: "does the card still
   lean toward yes before you have answered?" and "do the maybes read clearly subordinate to
   the real plans?", plus the label copy call, which is a judgment only a human should make.

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
