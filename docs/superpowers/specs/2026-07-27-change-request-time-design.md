# Change request part one: Orbit can change the time

*Design spec. 27 July 2026. Settled with the product owner before any code, in a decisions-only session; this document records those decisions and the scope they define. The implementation plan (docs/superpowers/plans/) is written from this document; where the two differ, this one is the intent.*

---

## What this slice is

Orbit announces plans, sometimes discloses that it guessed the time by coin flip, and then offers no way to fix a wrong guess. "Concrete-first, override-friendly" is one of Orbit's core guardrails and only the first half exists. This slice builds the override half for the one field where a wrong guess is most visible and most fixable: an existing event's time.

A member says "can we do 9 instead?" in the group chat, and Orbit moves the plan, announces the change with the old time named, resets the RSVPs so nobody's yes silently attaches to a time they never agreed to, and invites a revert in plain words. When Orbit is only mostly sure what someone meant, it proposes its best concrete reading and asks, with a one-tap answer for the person who asked. When someone asks for a change Orbit cannot make yet (the venue, the day, the standing rhythm), Orbit says so plainly instead of staying silent, because a request that gets silently ignored teaches the group Orbit does not listen, and that is the trust problem this slice exists to fix.

Time only, on an existing event, is the settled scope. Venue, day, and anything rhythm-altering are out: they are unproven ground of their own, and rhythm changes carry their own guardrail (they must be gauged with the group first, build-notes §4), which makes them a separate slice rather than a stretch goal. The destination this slice must not foreclose: a person should eventually be able to tell Orbit to change anything in plain language, including compound requests.

## Settled decisions

**A moved time resets every RSVP, and the requester is seeded as in.** Someone's "I'm in" for the 8am climb is not an answer about a 6pm climb, and carrying it forward would be the displayed state lying about who is coming, which is exactly the failure the RSVP rules exist to prevent (CLAUDE.md data-model rules; build-notes optimistic-RSVP slice). The existing model absorbs this cleanly: "haven't replied" is the absence of a row, so clearing returns everyone to an honest pending state with no third status invented. The one exception is the person who asked: they named the time they wanted, so their message already is their yes, the same precedent as the gauge initiator who named the day (build-notes §11, spark part one). The alternative of keeping all RSVPs was rejected as momentum bought with inaccuracy. This is the first row deletion anywhere in the product, and it happens inside one transaction with the move and the announcement, so no reader can ever catch the event half-moved.

**The easy revert is textual: "say the word and I'll put it back."** This is the recorded §4 phrasing, taken literally. A revert is not a special mechanism; it is simply another change request flowing through the same detection ("put it back," "make it 8 again"), open to anyone, forever, with RSVPs following the same reset rule because a reverted time is just as much a new proposal as a moved one. The rejected alternative, a one-tap revert chip, would have needed its own rules (who may tap, how long it lives, what happens after new RSVPs arrive) and would land in the recorded chip-wrap layout debt. For "put it back" to be resolvable at all, the event must remember where it was; see the data model section.

**Orbit asks when it is only mostly sure, and the ask is concrete.** The owner chose to build the ask-when-ambiguous path now rather than defer it. When a message is probably but not clearly a change request, or the target or meaning is fuzzy but a best reading exists, Orbit does not interrogate with open questions; it proposes its single best concrete reading and asks for a yes ("Sounds like you want climbing moved to 9am this Sun. Want me to make the change?"). This is concrete-first applied to the asking itself, and it also answers "which event do you mean" when the group has several cards up: Orbit names the one it believes is meant. A message with no plausible reading gets silence, the same high-precision posture spark detection already takes.

**The clarifying question is answered with one-tap chips, visible only to the asker.** Two chips under Orbit's question, confirm or leave it, reusing the proven gauge-chip pattern: attached to the Orbit message by id, state derived server-side, chips gone once resolved, the message left as plain history. Chips are deterministic, so a yes can never be misread; a text reply would have required Orbit to recognize confirmations in conversation, a whole new way to be wrong about intent. Only the asker sees the chips because the question clarifies one person's intent, and anyone else who wants the change can say so in their own words, which is the normal path anyway. Everyone else sees Orbit's question as ordinary feed history.

**A bare hour inherits the event's current part of day, and Orbit says so.** "Make it 9" on an 8am plan reads as 9am; on a 7pm plan it reads as 9pm. An explicit am or pm always wins outright. A change request carries a signal the spark path never had, the plan's existing time, so there is no coin flip here; flipping against the obvious meaning would read as Orbit being dense. When inheritance is applied to an ambiguous hour, the announcement discloses it once, matching the coin-flip disclosure precedent from spark part two.

**Anyone in the group can change a plan.** Already settled, not reopened: build-notes §4 records that anyone can ask Orbit to change group details, and the guardrail is transparency plus triage, not permissions. The organizer role dissolving is the product's north star. Structurally, detection only ever runs on a member's own message, so non-members are excluded without a gate.

**A one-off time change is not gauged with the group.** The §4 triage puts small factual changes in the announce-and-easy-revert tier; only rhythm-altering changes get the interest-gauge treatment before taking effect. Moving one occurrence's time is tier one. Changing the standing rhythm stays out of scope and receives the honest decline.

## How Orbit reads the chat now

Every member message already goes to the model after the send settles, once, for spark detection. That single call is extended rather than joined by a second one: the current prompt already teaches the model what a change request looks like, purely so it can answer "not a spark," and this slice turns that negative class into a positive one. One read now returns one of three intents: a new idea (spark, unchanged), a change request, or neither. A second call per message was rejected because it would roughly double both the per-message cost and the detection latency, and the only thing that could gate a second call is the classification the first one performs.

The model's context grows to match the question it is now asked. Today it sees one line about the soonest upcoming event; it will see each upcoming event the home screen shows (up to three), indexed, with title and current day and time in group time, so it can say which plan a request is about. A change-request reading returns claims: which event, the requested time, whether am or pm was explicit, which field the person asked to change (time, day, venue, or something else), and whether the intent is clear or only probable. Claims, as always, are not facts: a new normalize arm alongside the spark one turns the raw reading into a normalized three-way shape, and nothing user-facing ever keys off the raw response (the claim-to-fact boundary, CLAUDE.md). Invalid pieces degrade the way spark's do: a clear reading with a broken field degrades to the ask path or to silence, never to a wrong action.

Spark behavior must not regress. The existing "chatter about the plan on the calendar is not a spark" behavior is preserved by the change-request class absorbing exactly those messages, and every existing spark test stays green.

## The moment of change

A clear, time-only request with one confident target and a resolvable time acts immediately. One transaction: the event's start moves, its previous start is remembered, every RSVP row on the event is deleted, the requester's in is written, and Orbit's announcement is created. Half of that visible to a reader mid-write would be Orbit announcing a time the card does not show, so it is all-or-nothing, on the promote.ts precedent.

The requested time is read in the group's timezone on the event's current day (day changes are out of scope, so the day never moves). A request whose resolved instant is already in the past gets the honest decline, on the same principle as "a threshold reached after the proposed start creates nothing." A request that resolves to the time the event already has is a quiet no-op, which also makes an accidentally repeated detection harmless.

The announcement is composed deterministically, structured-extract-then-format, in the group's timezone, naming both times so the feed carries its own history (the original announcement is never edited; the feed is append-only by design). Candidate copy, final wording owned by the composers under test:

`Done. Climbing is moving to 6pm this Sun, it was 8am. Since the time changed, I cleared everyone's RSVPs, so answer again up top. Want it back at 8am? Say the word.`

When a bare hour was read by inheritance, one added sentence discloses it: `You said 9, and since this plan was in the morning I took that as 9am.`

The card, the event detail page, and the carousel all render from the event's stored start, so they update with no extra work; a move can reorder the carousel, which is correct.

## When Orbit asks first

The probable-but-not-certain path posts Orbit's question and creates a change proposal attached to it, the gauge pattern reused: a proposal row holds the source message, Orbit's question message, the target event, the asker, the proposed new start, and the event's start as it stood when the question was asked. The asker sees two chips under the question:

`Yes, move it` · `Leave it`

Confirm runs the exact same move transaction as the clear path, with the asker as requester. Leave it resolves the proposal and nothing else happens; the chips vanish and the question stays as history, no residue, matching how gauges close.

A proposal can go stale before it is answered: the event starts, or the event's time is changed by someone else in the meantime. Chips render only while the proposal is unanswered, the event is still upcoming, and the event's start still matches what the asker was shown; a confirm that races a concurrent change fails softly ("The plan already changed, take a look up top") rather than moving the event from a time the asker never saw.

## What Orbit says when it cannot act

A clearly understood request for something outside this slice gets a plain, honest reply, composed from which field was asked about, never generated prose. Venue: `I can't change the spot yet, that's coming. I can move the time if that helps.` Day, or day and time together: `I can't move it to another day yet. I can change the time on Sun if that helps.` A compound request acts on nothing rather than half of it; changing the time while silently ignoring the venue half would be the misread this slice exists to prevent. The rhythm-flavored request ("let's always do 9 from now on") gets the same treatment, since rhythm changes belong to their own gauged slice. These replies have no pending state and no chips; they are Orbit being straight with the group, in Orbit's voice, at Orbit's reading level.

## What changes in the data model

**`Event.previousStartsAt`, nullable, overwritten on each move.** The data home for "put it back," named under the no-data-home rule rather than silently invented. The model never sees feed history, so without this column a revert request is unresolvable. Last move only, by design: the feed itself is the full history, and override learning (build-notes §5), not this column, is the named future home for learning from corrections.

**A `ChangeProposal` model, shaped like `Gauge`.** Unique source-message id (a double-fired detection collides and skips, the gauge precedent), unique Orbit-message id (where the chips attach), the target event, the asker, the proposed start, the event's start at proposal time (the staleness baseline), and an answered marker written on tap. Created in one transaction with Orbit's question message, like createGauge.

**Nothing else moves.** `scheduledKey` is untouched (next section), venues are untouched, `activityLabel` is untouched, `endsAt` is untouched (nothing writes it today), and messages remain append-only.

## The cron and the moved occurrence

`Event.scheduledKey` looked like this slice's landmine and turns out to be its cleanest decision. The key is not a pointer to when the event is; it is the cron's memory that this occurrence was already produced. **A move leaves the key alone, and that choice has a product meaning: moving an occurrence relocates it, it does not free the slot.**

Traced consequences: while a moved event is still upcoming it blocks the cron exactly as before (the guard reads upcoming-and-not-sparked, not the key). Once an event that was moved earlier has passed, the cron's attempt to recreate the original slot bounces off the old key and skips; that skip is the correct behavior, the group already held that occurrence on its new time, and the following week heals itself with a fresh key. Rewriting or clearing the key on a move was rejected because it frees the slot, and the cron would then recreate and announce the exact plan the group had just moved away from, hours later, loudly. Sparked events carry no key and have no hazard.

Because the correct behavior currently arrives by accident (an unhandled uniqueness collision caught as a skip), this slice writes the intention down: a doc comment on the schema field and the move path stating relocate-not-free, and a reconcile test pinning the moved-earlier skip and the next-week recovery, so no future refactor can mistake the collision for a bug and "fix" it.

## Not in this slice

- **Venue and day changes.** Clearly understood, honestly declined, deliberately not built; each is its own unproven ground. The venue edit's named home is the change-request slice's next part (build-notes §8 and the venue-capture debt).
- **Rhythm-altering changes.** They must be gauged with the group before taking effect (§4 triage, tier two), which is its own mechanism and its own slice.
- **Override learning.** A change request is precisely the training signal §5 has been waiting for (it says what is right, not just that a guess was wrong), but learning from corrections is a later slice; this one only creates the corrections. The four undated fallback defaults stay as they are.
- **Orbit reading confirmations or any other conversational state from the feed.** The chips exist so it does not have to. The model still reads one message plus the calendar, never history.
- **A per-visitor ceiling on model calls.** The per-message cost rises modestly with the longer prompt and richer context; the recorded no-ceiling debt (build-notes, spark part one) stands, unchanged in kind.
- **Relative-day language ("tomorrow", "tonight").** Already a recorded limitation with a named candidate fix; day changes being out of scope keeps it out of this slice's path.

## How this gets verified

**Unit-tested, and each test can genuinely fail:** the three-way normalize (malformed and hostile claims degrade to ask or silence, never to action; valid claims carry through), bare-hour inheritance including the explicit-meridiem override, every copy composer (announcement with and without disclosure, the question, each decline), the move transaction's semantics (RSVP rows gone, requester in, previous start written, key untouched, no-op on same instant, past-time refusal), proposal confirm and decline including the stale-baseline race, and the reconcile pin for the moved-earlier skip plus next-week recovery. Tests are written first and shown failing, per process.

**Component-tested, honestly modest:** the chips render for the asker and not for another member, and disappear once resolved, to the extent the shared-component test seam allows; the screens themselves remain server-rendered and untestable, as recorded.

**Proven only in a browser, on the dev-test database, with screenshots as evidence:** a clear request moves the card, the detail page, and the carousel order; the ask path's chips appear only for the asker and resolve on tap; a venue request gets the honest reply; "put it back" restores the old time and resets RSVPs again. A "matches the design" claim, if one is ever made here, requires the rendered screen beside the reference; this slice has no new mockup, so its bar is the walkthrough with evidence.

**Never** does any step point at the production Supabase project.

## Debt this slice opens

**Detection latency now sits in front of an action, not just a gauge.** The measured round trip is about four seconds, which was fine when the only outcome was a new gauge appearing; a person who asks for a change and watches nothing happen for four seconds may re-ask. The no-op guard makes a repeat harmless, but the waiting itself is a feel issue for the polish pass.

**The decline copy hardcodes what Orbit cannot do.** When venue changes land, a composer that says "I can't change the spot yet" becomes a lie the moment the capability ships. Cheap to fix in the moment, dangerous to forget; the next change-request part must retire the corresponding decline as part of its definition of done.

**previousStartsAt remembers only the last move.** Two moves deep, "put it back" means the middle time, not the original. The feed's history keeps the group honest, and the column's single-slot shape is deliberate, but it is a real limit of the textual revert and belongs to override learning's eventual bookkeeping if it ever needs paying.

**The intent prompt now does three jobs.** One prompt classifying sparks, change requests, and silence will drift harder under future additions (venue changes, day changes) than three narrow ones would; the single-call economics that justify it today should be re-examined when a fourth intent arrives.
