# Claude Design prompt: card state grammar round (12 Aug 2026)

The prompt below is what the owner carries to Claude Design. It asks for a
"Send to local coding agent" handoff, which is the only build source visual code
is written from. Companion to `2026-08-12-card-state-grammar-design.md`.

---

I need a design round for the group home's card region in Interplanetary Groups,
a dark-first mobile group-coordination app. The current group home shipped
against your design-polish-rd-2 handoff and matches it; this round changes two
things about the card carousel at the top of that screen, and everything else on
the screen stays exactly as shipped.

**What is changing, in product terms.** One: the event card's RSVP pair
currently shows "I'm in" as a solid teal button and "Can't make it" as an
outline, which reads as if the member already said yes; it becomes an honest
ask-and-answer pair. Two: the pending strip between the card and the chat feed
is retiring; the ideas it held (interest gauges waiting on votes, time-change
proposals) become cards in the top carousel, mingled with confirmed event cards
in date order.

**Draw these six boards, phone-width, dark:**

1. **Confirmed event card, viewer has not answered.** The RSVP pair as two
   visually equal options: transparent fills, and BOTH options carrying a border
   in the action teal, so the teal marks the ask itself and leans toward neither
   answer. Label in the card's top right: "NEEDS YOUR RSVP" (uppercase eyebrow
   style, never below 13px). Everything else per the shipped card: title, day
   and time, venue label, the counts line.
2. **Confirmed card, both answered states.** One board state where "I'm in" was
   chosen: that option filled with the action teal, its ink text, and a
   checkmark; "Can't make it" dropped to a quiet hairline outline. And the
   mirror where "Can't make it" was chosen, same treatment on that side. No
   top-right label in either; a settled card goes bare.
3. **Pending idea card, viewer has not voted.** A new element: a card for an
   idea being gauged (for example "Beers · Fri 7pm"). It must read clearly
   subordinate to the confirmed card by brightness and structure (for example a
   flatter, hairline-only shell), never by hue alone. Label: "NEEDS YOUR VOTE".
   Body: the three gauge chips exactly as shipped in the chat feed (grey chip
   grammar with the emojis; do not restyle them and do not make them teal), and
   the live tally line below the chips in the product's existing tally voice,
   tabular numerals.
4. **Pending card after the viewer's yes.** Label flips to "NEEDS MORE VOTES";
   the chosen chip shows the shipped selected state (checkmark plus the grey
   fill shift); the tally reflects it.
5. **The dense face.** A confirmed event card that also carries an open
   time-change proposal: the card's own title, details, and RSVP pair, plus a
   proposal band holding Orbit's question ("Move Friday beers to 8pm?" in
   spirit), the two proposal chips, and that vote's own live tally. This is the
   hardest board: one card, two live questions, and it must stay legible without
   splitting into a second card. The card may grow; it never clips.
6. **The mixed carousel.** The rail with a pending card and confirmed cards
   mingled in pure date order (for example: pending Fri card first, confirmed
   Sat card second), the shipped peek geometry and dot treatment, showing at a
   glance that a maybe never reads as a plan.

**Binding constraints, all from the shipped system:**

- Existing tokens only: `--surface-base`, `--surface-raised`, `--surface-self`,
  `--hairline`, `--text-primary`, `--text-secondary`, `--placeholder`,
  `--text-faint`, `--action` (teal) with `--action-ink`, `--lime` with
  `--lime-ink`. Geist everywhere. Dark is the product's one theme.
- Teal exactly as specified and nowhere else: both borders while the RSVP pair
  is unanswered, the chosen option's fill after. Never on chips, never as a
  wash on any card, never decorative. Lime is Orbit's brand mark and never an
  action.
- Status is never signalled by hue alone, and never by red versus green (the
  owner is red/green colorblind). Checkmarks, labels, and brightness carry
  state.
- Nothing renders below 13px. Type roles per the shipped scale (card titles at
  heading, body at body, in-card buttons at label, metadata at meta, eyebrows
  at the floor).
- Layout grows with content and never clips; buttons stack when they cannot sit
  side by side; assume enlarged device text.
- The gauge chips, the carousel chrome (peek, dots, single-card bare state),
  and the confirmed card's shell are shipped and settled: reuse them, do not
  redraw them.
- Copy voice is plain and warm, roughly 7th grade; no em dashes anywhere in
  user-facing copy; three-letter weekdays ("Fri", "Sat"). The four label
  strings above are the working copy; propose better ones if you have them,
  but keep the system: the label names what the card still needs and is absent
  when it needs nothing.
- No animation.

**Out of scope for this round:** the chat feed, the composer, the header, the
empty-state box, the event detail screen (it inherits the RSVP pair treatment
automatically and carries no label), and every other screen.

**Deliverable:** a "Send to local coding agent" handoff with the real CSS,
components, and assets, superseding nothing outside the card region.
