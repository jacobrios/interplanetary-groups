# Pending surface: answer what's waiting without scrolling (10 August 2026)

One idea can now produce six Orbit messages over roughly ten days, and every one of them exists because chat is the only place an unanswered idea can be seen or answered. This slice gives pending group decisions a second home: a collapsible strip on the group home where a member can see what's waiting on them, answer it with the same chips as chat, and see what they've already said yes to before they overschedule themselves.

## Decisions settled in brainstorming (do not relitigate)

1. **The surface's job is answer-in-place, not awareness.** A member who missed the idea taps a chip right on the surface; votes land in the same tally as chat. A pointer-only index was considered and rejected: it relieves none of the original pain.
2. **Scope is both chip-votable pending decision types: open idea gauges and open time-change proposals.** Owner's call, over the gauges-only recommendation. Orbit's open day-question is excluded (it answers in prose, not chips; see not-in-this-slice).
3. **The view is the tailored middle, not "everything open, always" and not pure waiting-on-you.** Items the viewer hasn't answered lead, with full chips. Items the viewer said yes to (idea IN, or a vote for the new time) stay in a quieter row, answer shown and changeable. Items the viewer declined (OUT, can't-that-day, keep) leave their view. Rationale: the owner's forgotten-yes case (say yes Monday, overschedule by Wednesday, forget the commitment) needs yeses to persist, and the same row is where the fix happens: flip the yes to a no. Declined items carry no future obligation, and a declined idea that clears the bar surfaces as a real event card anyway.
4. **Placement is a collapsible strip between the pinned event card and the chat feed.** One line when collapsed ("2 waiting on you · 1 you're in on"), absent entirely when the viewer has nothing unanswered and no standing yes, expanding to a panel over the feed (the feed is covered, never squeezed). Carousel cards and a separate screen were rejected: cards dilute the card region's one job (the confirmed next plan), and a separate screen is missable, which is the failure this surface exists to fix.
5. **Orbit's chat behavior does not change in this slice.** The six-message chain stays exactly as it is; the strip is purely additive. Quieting the bump or the failure chain is a follow-up tuning slice, taken only once the strip proves it moves answer rates, so one change at a time stays measurable.
6. **Nothing new is stored.** The strip is a pure read over existing rows, reusing the existing open-gauge definition (no event yet, closing time not reached) and the existing proposal-state derivation. No status column, no stored counts. The strip and the chat chips are two windows onto the same rows and cannot disagree.
7. **One row per idea, keyed by the idea.** However many messages an idea produced in chat (gauge, bump, retry ask, guess), the surface shows it as one row. The feed's two-entries-per-bumped-gauge treatment is a feed fact, not a surface fact.
8. **A chip tap on the panel is the same vote as a chip tap in chat.** Same server action, same tally, and per the recorded guardrail it never posts a chat message. A third yes from the panel promotes exactly as from chat: event created, Orbit announces in the feed, card appears, item leaves the pending set for everyone.
9. **Build approach is one slice, both item types, design-led.** The only unproven ground is the strip-and-panel chrome, which both item types share. Visual code is built only from a Claude Design handoff (prompt in `2026-08-10-pending-surface-design-prompt.md` beside this spec); the implementation plan is written after the handoff lands.

## The surface, precisely

**Strip (collapsed).** One line between the pinned card region and the chat feed. Shows the viewer's counts: unanswered items, and standing yeses when nonzero. Rendered only for a session-holding viewer (consistent with feed chips; the standing no-surface-is-membership-gated gap is unchanged by this slice). When both counts are zero the strip does not render and the screen is exactly today's screen.

**Panel (expanded).** Opens over the feed on tap; one tap collapses. Rows in two groups, soonest-first by proposed or current start time:

- *Waiting on you.* A gauge row: activity, proposed day and time (three-letter weekday rule applies), live tally, the same three chips as chat. A proposal row: which plan, current time versus asked-for time, live tally, the same keep-or-switch chips as chat.
- *You're in on,* quieter, below. Ideas the viewer said yes to and switches they voted for, standing answer shown, still tappable to change.

**Movement.** Answer yes: the row moves to the quiet group. Answer no, can't-that-day, or keep: the row leaves the viewer's view. Answer the last unanswered item with a decline: the panel shows a brief caught-up note; on collapse the strip is gone (unless yeses remain, in which case the strip carries just the yes count).

**Freshness.** Counts and tallies are computed at screen render; chip taps update the panel optimistically. No new live-refresh machinery: a tally can be slightly stale until the next render, same as chat today. Accepted knowingly.

**Closing edges.** A vote from the panel goes through the same server action as a vote from chat, so behavior on a just-closed gauge or settled proposal is whatever the product already does there, one code path, unchanged.

**Chattiness posture.** The strip itself follows the anti-clutter brand: it never animates for attention, never badges the header, never notifies. It is one quiet line that exists only when it has something for you.

## Not in this slice (each names its home)

- **Orbit's open day-question as a strip row.** It answers in prose, not chips, so it needs a pointer-style row the panel deliberately does not have yet. Home: the future slice that brings the day-question to the surface (possibly the queued day-comment slice's successor).
- **Any quieting of Orbit's six-message chain** (retiring the bump, muting the failure chain). Home: a follow-up tuning slice after the strip proves itself.
- **Live-updating tallies.** Home: only if QA or real use shows the staleness confusing anyone.
- **Verbal RSVP, the carousel design pass, read-only "what's open?" questions to Orbit.** Unchanged, all where they already were on the queue.

## Verification (written before any code)

No model calls anywhere in this slice: deterministic reads and existing vote actions end to end. No bench, no prompt changes, no per-message cost change.

1. **Unit tests, written failing-first,** over the pending-set derivation: what counts as open, how the viewer's vote rows split items into waiting / standing-yes / gone, one row per idea regardless of message count, soonest-first ordering. Fixtures built from scratch; green from an empty database.
2. **Component tests** (the repo can test shared components) for the strip and panel: strip absent at zero counts, count-line composition, row grouping, chips rendered only with a session.
3. **Browser walkthrough** for what tests cannot reach (screens are server-rendered and untestable today): strip appears and disappears at the right moments, expand and collapse, a vote from the panel updating the chat tally, a standing yes flipped to a no, and the one no test can carry: the third yes tapped from the panel creating the event, Orbit announcing in chat, the card appearing up top.
4. **Suite baseline** recorded in build-notes §11 at slice start, before and after numbers in the PR, per standing rules.
5. **Deploy obligations: none.** No migration, no new environment variable, nothing added to the pre-deploy checklist.

## Debt this slice expects to open

- **Staleness** (see Freshness above). Recommendation: decline to fix until evidence of confusion; nothing degrades by waiting.
- **The panel's rows are all chip-answerable.** A third, prose-answerable row type (the day-question) will cost a small rework when it arrives. Queued, successor named above.

## Open questions for the owner

None at spec time; the design-prompt round trip to Claude Design may surface visual questions, which come back here as dated postscripts.

---

## Postscript, 10 August 2026: the design handoff arrived, and three drifts were settled

The handoff (committed at `docs/design/pending-surface-handoff/`) came back high-fidelity and largely faithful to this spec: strip posture, panel overlay behavior, row order, hierarchy, chip reuse (byte-identical spec, labels matching shipped code exactly), voice rules, and the no-hue status treatment all check out against the record. Claude Design's project context predates many shipped decisions, so the describe-back gate ran as a diff against the record. Three drifts surfaced; all three were decided by the owner the same day:

1. **"You're in on" holds pending things only; the spec wins over the design's state model.** The design annotated standing yeses as events the member has RSVP'd to that haven't happened yet (its example row carries a venue, which only an event can have). Decided: an idea leaves the surface the moment it promotes; created events live on the card carousel, which already shows the viewer's RSVP. The design's standing-yes row is the visual treatment for a still-open yes, nothing more.
2. **No venue on rows this slice.** The design's idea row shows a place ("Mesa Rock"), but no gauge stores a venue; one attaches only at promotion. Showing a would-be-inherited venue early could promise a venue the event never gets. Decided: idea and standing-yes rows show day and time only; the design's own wrapping rules make the dropped segment safe. Venue display returns if and when it earns a data home.
3. **The region builds on the repo's existing tokens, mapped by role, not the handoff's exact values.** The handoff's palette is the original walkthrough palette; the repo runs placeholder values with the pixel pass deferred (registered in build-notes' feel-pass register). Decided: map design roles onto existing tokens (their base surface to our card surface, their hairline to our subtle border, and so on) so the region matches the app it ships into; the handoff's palette and fonts (Hanken Grotesk, Inter) are registered as input to the end-of-build polish pass, where the whole app moves together.

Also noted at the gate, not adopted, already on the polish-pass register: the mockups still draw the never-built header subline and Orbit's real-face avatar. And one README prose nit with no build impact: it describes the "Yes, can't <day>" chip as handing the item back to Orbit to float an alternative, which overstates the shipped behavior; that chip records a vote, and Orbit's retry runs only at close, only if the would-have-cleared bar is met.
