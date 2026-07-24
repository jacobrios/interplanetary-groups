# Spark, part one: Orbit gauges interest

*Design spec. 23 July 2026. Settled with the product owner before any code. The implementation plan (`docs/superpowers/plans/`) is written from this document; where the two differ, this one is the intent.*

---

## What this slice is

Someone types "we should finally grab beers sometime" into the group feed. Orbit reads it, replies with a concrete proposal for a specific day, and asks the group with one tap. A running tally shows who is in. Nobody had to become the organizer.

That is the whole slice. **Nothing gets created.** Three people saying yes does not produce an event yet; that is part two. Below the bar, the idea scrolls away and leaves nothing behind, which is already the designed behavior.

This is walkthrough screen 07 and the chip spec sheet, and it stops exactly where screen 08 begins.

## Why it is sliced here

Spark as a whole opens six integration points the product has never used: a model call in the message path, two new database tables with a new relationship, an interactive control inside a chat bubble, event creation triggered by a member's tap, a second event on the home screen, and RSVPs seeded from votes. The recorded lesson from the one-shot experiment is that building on unproven ground fails at exactly that concentration.

Part one takes three of those six and leaves the other three alone. It is also a complete product experience on its own: a group can float ideas and see interest gather. What it cannot yet do is finish the job.

## Settled decisions

These came out of the phase-one conversation and are not open for re-litigation during the build.

**Orbit reads every message.** No keyword pre-filter. The cost is about $0.0008 per message, roughly 75 cents per thousand, and the only thing a filter would buy is that saving while risking the product's headline moment. A missed spark is the aha moment not happening; that trade is not worth cents.

**Detection runs after the message sends, not during.** The member's message posts and the input stays live. Orbit's reply arrives a beat later on its own. The alternative locks the keyboard for two to three seconds on the most-used interaction in the product.

**Three chips, exactly as the spec sheet draws them.** "I'm in" at full strength, "Next time" and "Yes, can't [day]" quiet. Neutral outlined pills, never lime, never teal-filled.

**A vote belongs to a specific proposal, not to the idea.** Saying yes to beers-on-Friday is not saying yes to beers-in-general. This is what makes part two's day-change behavior fall out for free instead of needing a clean-up step bolted on later.

**The initiator is counted only when they named the day themselves.** "Does anyone want to grab beers on Friday?" is a yes to Friday, and asking that person to tap a chip confirming the day they just proposed is asking twice. "We should grab beers sometime" is not a yes to anything, because Orbit picked the day afterward.

This is the principle applied exactly rather than bluntly: a vote has to be about the day being proposed. It rejects counting someone for a day they never mentioned, and it permits counting someone who named it. An earlier draft of this spec auto-counted the initiator in both cases, which contradicted the rule directly above it; the correction, and then this refinement, came from the product owner on review.

Two consequences fall out of it, both tightening rules elsewhere in this document:

- **The two-day buffer applies only to the day Orbit guesses, never to a day someone stated.** "Beers Friday" said on a Friday means today, and pushing it a week out would count the initiator for a day they did not mean. A stated day is taken at face value, including today, even though that leaves only hours to gather answers. That is what they asked for.
- **A day is only "stated" when exactly one is named.** "Beers Friday or Saturday?" floats options rather than proposing a day, so Orbit falls back to its own pick and the initiator votes like anyone else. Silently choosing one of their two and counting them for it would be the original mistake wearing a disguise.

The "never ask twice" rule this was originally over-borrowed from is intact and governs something else: a yes given during gauging carries through to the created event's RSVP without a second tap. That is part two's job and it is unaffected.

**The bar is three people, including the initiator.** Already settled in build notes; restated because it is load-bearing here.

## What the group sees

Orbit posts one message in its normal voice, proposing a specific day: *"Love it. Anyone in for beers this Friday?"* Under it sits a quiet line showing where things stand, and under that, the three chips.

**Orbit does not promise anything in this half, and that is a correction to an earlier draft.** The designed copy is *"...If three of you are in, I'll set it up,"* and the tally closes with *"one more makes it happen."* Both are promises this half cannot keep, because three yeses do not create anything until part two. Shipping the promise without the delivery would put a visible lie in the feed, which is worse than shipping a smaller sentence.

So the promise and the countdown clause land in part two, together with the ability to honor them. The walkthrough copy arrives complete rather than half-arriving here. Recorded as a deliberate deviation with a named closing slice, not as a copy shortcut.

The tally stays honest at every count. It appears only once somebody has actually voted, since "nobody is in yet" is noise the chips already imply. One or two people show by name; more collapses to names plus a count. When people have said they want a different day, that shows too, because hiding it would misrepresent the group to itself and it is the signal part two acts on.

Chips are live only while the gauge is. Once the proposed day has passed, the message stays in the feed as history and the chips are gone. No pinning, no banner, no residue.

## Where Orbit stays quiet

Anti-clutter is the brand, and this slice is the first time Orbit interjects into a live conversation uninvited. It is the highest-risk thing Orbit will ever do, so the guardrails matter more than the coverage.

Orbit does not spark on agreement ("sounds good"), on reactions, on talk about the event already on the calendar, or on its own messages. It does not open a second gauge for something the group is already gauging. When the read is uncertain, it stays quiet: a missed idea costs nothing visible, and a wrong interjection teaches people to tune Orbit out.

The model's answer is a claim, not a fact. It passes through the same normalize-then-branch layer every other model output in this product goes through before anything reaches the feed.

## Which day Orbit proposes

If the person named a day, Orbit uses it. That is extraction, and it is the same thing onboarding already does.

If nobody named a day, Orbit picks one, because proposing something concrete beats asking an open question. The rule: **the coming Friday, or the following Friday if that is less than two days out.** Friday because casual social plans default to the end of the week; the two-day buffer because a gauge needs time to collect three answers, and proposing tomorrow does not give a group that.

**Accepted as a starting heuristic (23 July).** It has no data behind it, and it lives in one place so it stays cheap to change.

**It is a starting point because Orbit is expected to stop guessing.** Over time a group reveals when it is actually free: propose Friday, watch the group land on Tuesday, and the next idea should be proposed for Tuesday. This is not new scope. It is the override-learning behavior already recorded in build notes §5, which says a group that shoots down a default three times stops getting that default, and treats overrides as training data. This spec is where it finds its first home.

Nothing extra needs storing for it now. The gauge rows this slice writes, each carrying the day Orbit proposed, are themselves the raw material; whether a gauge was answered, ignored, or moved is derivable from the votes and the date. That is why learning can be added later as behavior rather than as a migration.

It is genuinely a later slice for a reason worth stating: the only signal available in part one is "that day does not work," which says the guess was wrong without saying what is right. Knowing that Tuesday works comes from watching where plans actually land, and plans do not land until part two creates them.

**The gauge proposes a day, not a time.** Screen 07 says "this Friday" with no clock time, and that is correct: nobody needs to agree on 7pm to say they are interested. Screen 08's card does show a time, which means part two has to produce one, and nothing in the product currently knows what time a group grabs beers. **That is an open question for part two, named now so it does not get quietly answered with "7pm because the mockup said so."**

## The one thing the design implies that we cannot supply

The spec sheet's yes chip reads "🍻 I'm in", with the emoji matched to the activity. Nothing in the product can map an activity to an emoji. The options are a hardcoded table that will be wrong for anything outside it, or a model call spending money on decoration.

**Settled (23 July): one fixed emoji on the yes chip, deviation recorded.** The other two chips are already fixed in the design, so only the first one changes. The rejected alternative was a small activity table; a table that guesses wrong reads worse than one that never tries, and an emoji is decoration that does not justify a model call.

## What gets stored

Two new tables. A **gauge** records what is being gauged, which day Orbit proposed, and which messages it connects to. A **vote** records one person's answer on one gauge, one row each, changeable.

Everything the group reads is derived from those rows and never stored: the counts, the names, the tally sentence, whether the bar has been reached. This is the same rule RSVPs already follow, for the same reason: a stored count can drift out of sync with reality, and being right about who is coming is the entire value of this product.

Two things deliberately get **no** storage in this slice: the one-bump rule and parked interest that has no viable date. Both are real designed behaviors and both are deferred, and adding their columns now would be building for a slice we have not specified.

## Not in this slice

Creating the event at three yeses · seeding those yeses as RSVPs · Orbit proposing a different day · Orbit learning a group's natural day from its history · the two-card home screen · the one-bump resurface · parking interest for later · reading RSVP intent out of ordinary chat ("see you Monday") · the email ask · membership gating.

Each of these has a home. None of them belongs here.

## How this gets verified

Both gates hold, per the standing agreement.

**Looked at, not assumed.** The rendered chip row and gauge message go next to the spec sheet and get compared. No "matches the design" claim without that.

**Shown, not asserted.** Automated coverage on the decision layer, written failing first, plus a browser walkthrough of named scenarios:

1. A real idea produces a gauge naming a specific day, with three chips.
2. An ordinary message produces nothing at all: no Orbit reply, no gauge, no model spend visible in the feed.
3. Someone who floats an idea without a day starts at zero and is counted only once they tap.
4. Someone who names the day themselves is already counted, and is never asked to confirm the day they just proposed.
5. Tapping changes the tally; tapping a different chip changes your answer rather than adding a second one.
6. Three yeses does **not** create an event. This one is pinned deliberately, so that the day part two lands, the boundary moved on purpose rather than by accident.
7. Someone choosing "Yes, can't Fri" appears in the different-day count and not in the in count.
8. A gauge whose day has passed renders as history with no chips.

The suite baseline was recorded before any code was written on this branch: **267 tests across 19 files, all green**, which matches the number build notes recorded at the end of the venue slice. The finishing number is therefore a real comparison and not a figure with nothing behind it.

## Debt this slice opens

**Every message now costs a model call, with no ceiling.** The pre-filter we chose not to build was also an accidental spending cap. One member spamming the feed is one paid call per message. Acceptable while the app is unlaunched and the URL is private; it needs a real answer before anyone promotes it.

**Detection is best-effort.** If someone closes the tab in the couple of seconds after posting an idea, Orbit never answers it. It fails quietly rather than wrongly, which is the right failure at this stage.

---

## Review, 23 July

Read and approved by the product owner, with one correction and both open questions answered.

**The correction: the initiator does not get an automatic yes.** Caught on review and applied above. It was not a preference call; the auto-count contradicted the rule that a vote belongs to a specific proposal, since the initiator's message predates the proposal it was being counted as a vote on. The spec was internally inconsistent and now is not.

**Both open questions are closed:** one fixed emoji on the yes chip, and Friday accepted as the starting fallback with override learning recorded as its successor.

Nothing in this document is open. The implementation plan is written from here.
