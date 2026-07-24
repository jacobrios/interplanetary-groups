# Spark, part two: three yeses make it real

*Design spec. 24 July 2026. Settled with the product owner before any code, in a decisions-only session; this document records those decisions and the scope they define. The implementation plan (`docs/superpowers/plans/`) is written from this document; where the two differ, this one is the intent.*

---

## What this slice is

Part one taught Orbit to listen: someone floats an idea, Orbit proposes a day, and three chips gather answers. This slice teaches Orbit to finish the job. The third yes creates the event, the people who said yes are already on it, a second card appears on the home screen, and Orbit's copy finally gets to make the promise part one deliberately withheld.

This is walkthrough screen 08, and it picks up exactly where part one stopped. It takes the remaining three of spark's six integration points: event creation triggered by a member's tap, RSVPs seeded from votes, and a second event on the home screen.

## Settled decisions

These came out of the part two decision session (24 July) and are not open for re-litigation during the build. The threshold itself (three people, including an initiator who named the day) was settled earlier and is unchanged.

**A stated time wins, and it is captured the moment Orbit reads the message.** "Beers Friday at 8pm" produces an event at 8pm. Part one deliberately discarded the time; this slice stops discarding it. Because the event is created days after the message is read (detection is near-instant, it is the three yeses that take time), the stated time needs a home in between: the gauge gains a stored time, written at detection. Re-reading the original message at creation would be regenerating stored state, which this project bans; carry it, do not re-derive it.

**The model resolves am/pm from the activity, and flags only genuine coin flips.** "Beers at 8" is 8pm and "breakfast at 8" is 8am to any human reader, and we are already paying for a model read of the message; refusing to let it resolve the obvious would be buying intelligence and using it as a keyword matcher. The extraction returns a time plus an ambiguity flag, the same two fields onboarding's extraction has carried since the gap-ask slice. The claim passes through the normalize layer like every other model output; deterministic code decides what renders.

**A genuine coin flip keeps the stated hour, lands in the evening, and gets one line of disclosure.** "Meet at 8" for an activity that truly happens at both ends of the day becomes 8pm, not the 7pm default; the person said 8, and a card that says 7 would contradict them. Because am/pm is easy to miss in casual reading, Orbit says what it assumed, once, in the gauge message: *"You said 8, so I'm taking that as 8pm."* Nothing more. The clause "just let me know and I'll change it" was considered and cut: Orbit has no way to read a correction out of chat yet, and an invitation that gets silently ignored teaches people Orbit does not listen. That clause lands with the change-request slice, the same pattern as the setup promise landing here. This disclosure is a deliberate, narrow exception to "the gauge proposes a day, not a time": it fires only when someone stated an hour Orbit had to genuinely guess about, because an undisclosed assumption about the group's own words is a transparency problem, not a scheduling detail. A confidently resolved time stays silent at gauge time; a fully unstated time has nothing to disclose.

**Defaults are part-of-day aware, and they are placeholders with the same lifecycle as Friday.** When no time was stated, the extraction also reports whether the activity is a morning thing, an evening thing, or unknown. Evening or unknown gets Friday, 7pm. Morning gets Saturday, 9am, because "breakfast sometime" defaulting to Friday 7pm would be absurd twice over; Friday was chosen on evening-social logic and should only apply there. All four numbers have no data behind them, live in one place, and are the raw material for the override learning already recorded in build notes §5. The day half of this modifies part one's shipped fallback (`chooseProposedDate`), which was explicitly built as a one-function placeholder that is cheap to change; each bucket gets a pinning test.

**Yes, the default time is the mockup's number, for non-mockup reasons.** Part one's spec warned against answering this with "7pm because the mockup said so." The examined answer still lands on 7pm: defaulting beats asking (a poll after the third yes reopens exactly the coordination loop this product exists to kill, and there is no one person to ask without reinventing the organizer); the standing rhythm's time is the wrong donor (the 8am climb is a fact about climbing, not about this group's evenings); and evening is where unstated casual plans actually live, the same folk logic that made Friday the day fallback.

**Same-instant events are legal, and each creation path guards its own duplicates.** The rule "a group can never hold two events at the same start instant" was bookkeeping, not product, and every way of keeping it is worse than dropping it: silently failing to create breaks the promise Orbit just made in the feed, nudging to 7:01 is a visible absurdity, and asking the group to move is a poll. With a 7pm default and any evening-rhythm group, exact collisions are not exotic, and deliberate ones are legitimate (beers right after the Friday climb). What the constraint was actually earning, duplicate protection, is replaced per path: a sparked event links back to the gauge that created it, and that link is unique, so one gauge can only ever produce one event no matter how many times the third yes is double-tapped or retried; the scheduled path keeps its existing upcoming-event guard plus a scheduled-only idempotency key (mechanics below).

**The cron guard stops counting other people's events.** Found while verifying the constraint question, and the hardest requirement in this slice: the daily cron's guard is "if this group has any upcoming event, do nothing." The moment a sparked event exists, that guard sees it and silently stops creating the standing occurrence, so the group sparks beers for Friday and next Sunday's climb card shows up days late, in a product whose home screen promises the constant next-event reminder. The guard must count only Orbit's own scheduled events, which the gauge link makes distinguishable. This ships as a hard requirement of this slice with its own test, not as a discovered bug.

**The gauge stays unpinned; the one-bump resurface is the next slice, not this one.** Raised and settled: the no-pinning rule is recorded in three places and holds. The designed answer to ideas dying in the scroll is the one-bump rule, already a guardrail, still unbuilt. It stays out of this slice because it is genuinely separable (it needs its own decisions about when "stalled" starts and what the bump says) and because this slice changes the gauge's gravity on its own: once the promise clause ships, a gauge is a pending outcome, and people scroll back for outcomes. Watch whether ideas still die in the scroll after that before tuning the bump.

**Conflict-aware proposing is cut.** Orbit does not steer a morning idea away from climb day. It requires Orbit to reason about the group's calendar and negotiate, a new class of behavior, and it can guess wrong in both directions; post-climb breakfast on climb day might be exactly what the group wants. The honest signal (which proposals draw "can't that day" votes, where plans actually land) is the override-learning successor. Same-instant events being legal means nothing breaks in the meantime; the worst case is an imperfect slot drawing a "not that day," which is the feedback loop working.

## The moment of creation

The third yes is the trigger. When a vote lands that brings the in-count to three distinct people (the seeded initiator counts), the event is created right there in the vote action, in one transaction with everything it implies. No cron involvement, no delay; the person who tapped the third yes should see the event exist when the screen settles.

What gets created:

- **Start:** the gauge's proposed day plus its time, resolved by the rules above, converted through the group's timezone by the existing wall-time helper. **End: none.** Nothing knows how long beers lasts, and the field is already optional.
- **Title and activity:** from the gauge's stored activity, composed deterministically ("beers" becomes "Beers").
- **Venue, inherited when the group already told us:** if the gauge's activity matches a stored rhythm that carries a venue (the "beers at Lucky Lab" loose rhythm from onboarding), the event gets that venue. This is the payoff the venue-capture slice was explicitly sequenced ahead of spark to enable. Matching is a case-insensitive comparison of the activity word; a miss means no venue, and venue never gates anything, so the failure mode of a fuzzy miss is an event without a penciled-in spot, which is exactly what part one would have produced anyway.
- **RSVPs, seeded from the votes, no second tap.** This is the never-ask-twice rule doing the job it was written for: a gauge answer is an answer about attending that concrete day, and re-asking it as an RSVP would be asking twice. In seeds in, and both flavors of no seed out ("Next time" declined the idea, "can't that day" declined the day; both mean not coming Friday, and the tally's honesty is the product). Votes after creation do not exist, because:
- **The gauge closes at creation.** Its chips go inert and it renders as history, the same way an expired gauge already does; whether a gauge is closed is derived from the existence of its linked event, never stored. From that moment the event card is the one place answers live, through the normal RSVP controls. Two surfaces collecting the same answer would eventually disagree, and derived-only state is how this product avoids that by construction.
- **The announcement, which says the time out loud.** Orbit posts the event to the feed in its own voice, stating day and time, so the group sees the guess the moment it is made. Members cannot yet tell Orbit to change it; no change flow exists for the standing event either, so this is a consistent known gap whose home is the change-request slice, not new debt opened here.

One edge, decided rather than discovered: **a threshold reached after the start time has passed creates nothing.** A gauge is live until the end of its proposed day, so three yeses can technically arrive at 9pm for a 7pm proposal. A card and an announcement for an event that already started is noise about the past; the gauge simply expires. Rare, and the quiet failure is the right one.

## The copy this slice unlocks

Part one shipped smaller sentences than the design drew, because the drawn copy made promises that half could not keep. This slice can keep them, so the walkthrough copy arrives complete:

- The gauge message gains the promise: *"...If three of you are in, I'll set it up."*
- The tally gains the countdown at one-away: *"one more makes it happen."*
- The coin-flip disclosure line, new in this slice, per the settled decision above.
- The creation announcement, new copy in Orbit's voice, naming day and time.

Part one pinned the promise and countdown out with tests so they could not drift in early; this slice flips those tests on purpose, which is exactly what they were built for. Exact wording follows the walkthrough where it exists and Orbit's voice rules everywhere (plain and warm, no em-dashes in anything Orbit says, three-letter weekdays).

## What changes in the data model

- **Gauge** gains a stored time: the resolved "HH:mm" local time, stated or default, written once at detection. The defaults are applied at detection rather than at creation, deliberately: the part-of-day bucket already shapes the proposed day at detection (morning means Saturday), so resolving the time in the same moment keeps one decision in one place and means creation only ever reads, never re-derives. The bucket itself is consumed there and never stored. The column is nullable only for gauges that predate this slice; a pre-slice gauge reaching threshold falls back to 7pm.
- **Event** gains an optional link to the gauge that created it, unique, which is three things at once: the sparked path's idempotency guard, the flag that distinguishes sparked from scheduled (no separate source column needed), and the thread override learning will eventually pull on to see where plans actually land.
- **The `[groupId, startsAt]` unique constraint is dropped**, replaced by a plain index for the soonest-upcoming query it was backing.
- **Scheduled events get an explicit idempotency key:** an optional unique column holding group-plus-instant, written only by the reconcile path, preserving today's exact double-cron protection. This is the "different idempotency key" the debt register anticipated. The cleaner-looking alternative, a partial unique index scoped to scheduled rows, needs raw SQL outside the schema file and drifts from what Prisma can express; a write-once key column the schema fully describes is the boring choice, and boring is correct in a migration. *(not 100% sure, verify at implementation: Prisma 7's exact posture on partial unique indexes; if it can express one cleanly, prefer it and record the swap.)*
- **The spark extraction schema grows** from three fields to six: activity, stated day, and spark-or-not, plus stated time, time-ambiguity, and part of day. Same model call, same cost, normalized like everything else.

Migration note: one migration, additive except for the constraint swap. Existing rows need no backfill; a null gauge link correctly marks every existing event as scheduled, and the idempotency key only matters for rows created after it exists.

## The home screen carries two cards

The peek-and-dots carousel deferred at the group-home slice comes live here, because a sparked event beside the standing one is exactly the two-or-more condition it was waiting for. Cards order by start time, soonest first; the pinned-card grammar (card on top, chat scrolling under it, input pinned below) is unchanged. The chat body stays at its type size and is never shrunk to fit.

A design-source note for the build: screen 08 and the walkthrough crops are the reference for the sparked event card, which should render as the same event card the product already has (teal "I'm in", outlined "Can't make it", people not counts on detail). If no design handoff exists for the carousel chrome itself, that is a describe-back conversation before visual code, not a thing to improvise silently.

## Engineering debt this slice deliberately pays down

Recorded in part one with the note "the real fix is when part two touches it anyway," and part two touches it: the pure formatters split out of the spark module so no future client import can drag the model SDK toward the browser bundle. In scope because the file is being reopened regardless; the alternative is re-recording the same debt with one more layer of interest.

## Not in this slice

The one-bump resurface (next slice, settled above) · conflict-aware proposing (deferred to override learning, settled above) · Orbit reading corrections or change requests out of chat (change-request slice) · override learning itself · the email ask after first RSVP · membership gating · reading RSVP intent from ordinary chat ("see you Monday") · parking below-threshold interest.

Each has a home. None belongs here.

## How this gets verified

Both gates hold, per the standing agreement.

**Looked at, not assumed.** The two-card home and the sparked event card go next to screen 08 and the walkthrough crops. No "matches the design" claim without that comparison.

**Shown, not asserted.** Automated coverage on the decision layer, written failing first, plus a browser walkthrough of named scenarios:

1. Third yes creates the event; the tapper sees it without a refresh ritual.
2. The three gauge answers arrive on the event as in, out, and out, with nobody asked twice.
3. A stated time ("beers Friday at 8pm") is the event's time.
4. "Breakfast at 8" lands at 8am with no disclosure; a true coin flip lands pm with the one-line disclosure in the gauge message.
5. "Breakfast sometime" proposes Saturday and creates at 9am; an unknown-activity idea keeps Friday 7pm.
6. A sparked event at the standing event's exact instant creates cleanly.
7. Double-firing the third yes produces one event.
8. With a sparked event upcoming, the daily cron still creates the standing occurrence on time.
9. The home screen shows both cards, soonest first, and the closed gauge renders as history with inert chips.
10. Three yeses arriving after the proposed time has passed create nothing, and the gauge expires quietly.
11. The promise and countdown clauses render, flipping part one's pin-out tests deliberately.

Suite baseline recorded before any code on this branch, against the part one finishing figure, so the finishing number is a real comparison.

## Debt this slice opens

- **Four scheduling defaults with no data behind them** (Friday, Saturday, 7pm, 9am). Same status as part one's Friday: explicit placeholders, one function, override learning as the named successor. Low, already on the books.
- **A wrong time guess has no correction path.** The disclosure makes the guess visible; nothing yet lets the group fix it without the change-request slice. Consistent with the standing event's identical gap. Medium, because it now applies to two event sources instead of one.
- **Venue inheritance matches on the exact activity word.** "Grab drinks" will not find the beers rhythm's Lucky Lab. Accepted miss; venue never gates. Low.
