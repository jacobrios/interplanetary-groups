# Claude Design prompt: dense-face alternatives round (12 Aug 2026)

Follow-up to the round-5 handoff (`design_handoff_round5`). The owner rejected board 05's
consequence before build; this round replaces that one board. Companion records:
`2026-08-12-card-state-grammar-design.md` (decision 8, reopened) and the round-5 prompt.

---

This is a follow-up to your Round 5 handoff for Interplanetary Groups (the card region:
honest RSVP pair, pending ideas as cards). Round 5 is approved and will build as drawn,
with one exception: **board 05, the confirmed card carrying an open time-change vote as a
full band, is rejected, and this round replaces it.**

**Why it was rejected, so the alternatives solve the actual problem.** The carousel region
renders at the height of its tallest card. Board 05's band makes its card much taller than
every other card, so while a vote is open, every shorter card sits above a stretch of blank
background, and the whole screen loads with a visibly shorter chat window. The owner's
specific dislike: blank space below cards that do not need it. There is no animation in the
product, so nothing "grows" on screen; the cost is a between-visits layout shift and dead
space, and it is not acceptable.

**Draw three variants of how a confirmed event card hosts an open time-change vote without
becoming the region's tallest element by more than a small margin:**

1. **Variant A, the leading candidate (the owner leans this way; give it the most
   attention, and feel free to show two takes on it).** A compact notice on the card, one
   line in the spirit of "Time change proposed · Move to 8pm?", with the full vote living
   on the event detail screen. Draw BOTH halves: the card state (notice line plus the
   "NEEDS YOUR VOTE" label; where does the notice sit so it cannot be mistaken for the
   card's own metadata?) and the event detail screen's proposal section (Orbit's question,
   the two shipped chips, the live tally, placed among the detail screen's existing
   sections: details card, Add to calendar, roster).
2. **Variant B, the trimmed band.** The vote stays on the card but shrinks to its
   essentials: the question and the two chips, no kind label, no tally line (the tally
   still lives in chat and on the detail screen). Draw it next to a normal confirmed card
   at the same scale so the remaining height difference is honest.
3. **Variant C, your own invention.** Something we have not thought of, same constraints.
   The one hard rule you cannot bend: one plan, one card; a second carousel card for the
   proposal is rejected (it also would not help, since the region is as tall as its tallest
   card either way). Truncation and internal scrolling are also out: layout grows with
   content and never clips.

**Secondary question, answer it once for the whole region:** even with no vote open, a
pending idea card is naturally shorter than a confirmed event card, so a smaller version of
the blank-space problem exists in any mixed set. Propose how the region should treat mixed
card heights (the current behavior is top-aligned cards over dead space). If one of your
variants solves this at the same time, say so.

**Carry these post-round-5 rulings into everything you draw (they supersede the round-5
boards):**

- Need labels naming the viewer's own move render in the action teal ("NEEDS YOUR RSVP",
  "NEEDS YOUR VOTE"); "NEEDS OTHER VOTES" (that exact copy, not "needs more votes") stays
  `--text-secondary`. The label ladder on a card with an open vote: NEEDS YOUR RSVP until
  the viewer RSVPs, then NEEDS YOUR VOTE until they vote, then NEEDS OTHER VOTES.
- Pending idea titles carry a question mark ("Beers?").
- Proposal chip copy is the shipped copy: "8pm works" / "Keep 7pm". Tally lines read in the
  product's names voice ("Rowan & Devon are in so far · one more makes it happen"), never
  counts-only.
- The RSVP pair per round-5 boards 01-02: both borders teal while unanswered, the chosen
  option filled teal with ink text and a checkmark after, the other dropping to hairline.

**Binding constraints, unchanged from round 5:** existing tokens only (`--surface-base`,
`--surface-raised`, `--surface-self`, `--hairline`, `--text-primary`, `--text-secondary`,
`--placeholder`, `--text-faint`, `--action`/`--action-ink`, `--lime`/`--lime-ink`); Geist;
dark is the one theme; teal never on chips, never a wash, never decorative; lime is Orbit's
mark and never an action; status never by hue alone and never red versus green (the owner
is red/green colorblind); nothing below 13px; layout grows with content and never clips;
no animation; the gauge chips, carousel chrome, and card shells are shipped, reuse them
verbatim; copy is plain and warm, no em dashes, three-letter weekdays.

**Out of scope:** everything else. Round-5 boards 01, 02, 03, 04, and 06 are approved and
are not up for redraw; the chat feed, composer, header, and empty state are untouched.

**Deliverable:** a "Send to local coding agent" handoff superseding round-5 board 05 only,
plus whatever your mixed-height answer touches, stating clearly which variant is which.
