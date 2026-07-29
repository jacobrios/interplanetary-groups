# Change request part two: consensus and a conversational window

*Design spec. 28 July 2026. Brainstormed autonomously from the recorded seed (the post-merge QA postscript in build-notes §11 and the CLAUDE.md next-slice block), not from scratch and not in a live session with the owner. Everything the seed settled is carried unchanged; everything this document decides beyond the seed is flagged in the list immediately below and needs the owner's sign-off before the implementation plan is executed. The implementation plan (docs/superpowers/plans/) is written from this document; where the two differ, this one is the intent.*

**Decisions this spec makes beyond the seed, for owner review:**

1. **The consensus arithmetic is amended so the bar is always reachable.** A yes to the new time from someone who is in on the current time counts as them switching sides, and an explicit keep tap counts on the incumbent side. This changes the owner-stated wording, which is why it leads this list. (Section: the small-group edge.)
2. **The three-yes floor becomes "three or the whole group, whichever is smaller."** Nothing changes for groups of three or more. A two-person group needs both people; a one-person group moves immediately, which is exactly part one's behavior surviving as the degenerate case. (Same section.)
3. **A two-person group now needs the other person's yes.** Part one would have moved the plan on one message. This is the consensus rule doing its job, but it is a behavior change for duos worth seeing named.
4. **Keep voters are not seeded OUT when the move happens anyway.** This diverges from spark's precedent of seeding both flavours of no as OUT, with reasoning below. (Section: the moment of consensus.)
5. **Newest proposal wins, per event and per asker.** A second time proposed for the same plan supersedes the first, and a person's new request closes their own prior open one, which is what makes "sorry, I meant beers" actually retract the wrong proposal. (Section: corrections.)
6. **A request for the time the plan already has now gets a one-line reply instead of silence.** Small, but it is a new speaking path, and the amended guardrail is why it exists.
7. **Typed votes are explicitly deferred.** "9 works for me" typed in chat does not count toward the tally in this slice; only chips do. (Section: what does not change.)

---

## What this slice is

Part one gave Orbit ears for one sentence at a time, and the owner's post-merge QA showed exactly what one-sentence hearing costs: a bare follow-up moved the wrong plan, a correction died in silence, and an ambiguous "it" silenced even the honest decline. It also gave one person the power to move a plan everyone else had already said yes to, which was always a placeholder for something fairer.

This slice replaces both. A time change becomes a proposal to the group: Orbit posts the question with one-tap chips for everyone, keeps a running tally, and moves the plan only when the new time has enough yeses to clear the bar, with the asker's own message counting as their yes and yeses carrying through as RSVPs on the moved plan, the same promise the spark gauge already keeps. And detection stops reading each message alone: Orbit now reads the recent conversation, its own messages included, with timestamps, so a follow-up lands on the plan the group was just talking about, a correction is understood as a correction, and "it" usually resolves itself.

The product-experience frame: this is the slice where Orbit stops being a switchboard and starts being a participant in the conversation. The cost is that a clear request no longer acts instantly; the plan moves when the group agrees, not when one person types. That trade is the point, not a side effect.

## What the seed already settled (not reopened)

**A time change is a proposal, not an edit.** Orbit moves the plan only when the new time has at least three yeses, the asker's message counting as theirs, and more yeses than the current time has people in. Chips go to the whole group. Yeses carry through as RSVPs on the moved plan, the gauge precedent. "Put it back" follows the same rule with no special case. Part one's machinery (the question with chips, the tally shape, the safe move transaction, the carry-through) is the foundation; part two widens who holds the chips and adds the bar. (The arithmetic amendment in the next section refines this rule; the rule itself is not reopened.)

**Stay-quiet governs Orbit's own initiative, never replies.** The CLAUDE.md guardrail amendment of 28 July. A direct ask with an ambiguous part gets a verifying question, not silence. The owner's framing, kept verbatim in the build notes: better a little too eager to help than not at all.

**Detection reads a conversational window.** Roughly the last twenty messages, definitely including Orbit's own messages and message timestamps, because a correction is unfixable without Orbit's own actions in view and a reply can arrive twelve hours after the message it answers. What counts as "what we were just talking about" is deliberately not reduced to a rule; the model reads the window and judges, which is the point of having one.

## The small-group edge: yeses switch sides

The seed's open question: in a three-person group where all three are in on the current time, the new time can collect at most three yeses and the incumbent has three people in, so "more yeses than the current time has people in" can never be true, even when every single member wants the change. The literal rule locks the group into a time it has unanimously outgrown.

The resolution is not a small-group special case; it is reading the votes for what they say. **A yes to the new time from someone who is in on the current time is that person switching sides.** Their old RSVP was an answer about the old time; their chip tap is a newer answer about the newer question, and counting them on both sides at once is the arithmetic lying about what people want. So the incumbent's side is counted as: everyone in on the current time, plus everyone who tapped keep, minus everyone who has said yes to the new time. The bar is then two conditions, checked together:

- **The floor:** at least three yeses, or every member of the group when the group is smaller than three.
- **The comparison:** more yeses than the incumbent side has people, counted as above.

Why keep taps count on the incumbent side: a chip that changes nothing is dishonest UI, and someone who taps "keep it at 8" has made a fresher, more explicit statement in favor of the current time than a days-old RSVP row. Someone with no RSVP and no tap counts for neither side, which is the product's standing posture that silence is pending, not a vote.

Walked through the cases that matter:

- **Three-person group, all in, all want 9 instead of 8.** All three yes: floor met, incumbent side is empty (all three switched), three beats zero, the plan moves. The seed's deadlock is gone.
- **Five-person group, four in at 8.** One asks for 9 (their yes is seeded), two more yes, one of them previously in. Yeses three, incumbent side is the two in-members who have not switched. Three beats two, the plan moves. The two who stayed get asked fresh by the card.
- **One person against four.** The asker alone never clears the floor. Part one's unilateral move is gone for any group of two or more.
- **Two-person group.** Floor is both people. One asks, the other yeses, incumbent side empties, it moves. If the other person never answers, the proposal quietly dies and the plan stays. This is the named behavior change for duos: part one would have moved it on one message.
- **One-person group.** Floor is one, the asker's message meets it, the incumbent side (at most the asker) has switched, the move is immediate. Part one's clear-path behavior survives exactly here, as the degenerate case rather than a second code path.
- **Nobody in on the current time.** The floor still holds: an undefended time still takes three yeses (or the whole tiny group) to move, because moving a plan is a group act even when nobody has committed yet.

With side-switching, the bar is reachable in every group: the yes side can always grow to the whole membership and the incumbent side can always empty. There is no arithmetic dead end left, which is the property the seed asked this brainstorm to secure. The bar is computed live from rows at every evaluation (RSVPs, votes, membership), never stored, per the derived-counts rule; RSVPs arriving mid-proposal legitimately raise or lower it.

The spark threshold shares this edge in miniature (a two-person group can never gauge three yeses), and it is deliberately **not** changed here. That is spark's own knob, out of this slice's lane; it is recorded in the debt section rather than silently inherited or silently fixed.

## The window: the trigger message plus the nineteen before it

**Size: twenty messages, counting the message being interpreted.** The constant lives in one place and is a revisit knob, not a law. Twenty covers any realistic burst of coordination chatter; the messages are chat-length, so the whole window is a few hundred tokens against a spend the seed already called fractions of a cent. Larger was considered and declined for now, not for cost but because the marginal messages are stale ones, and stale intent in context is a new way to be wrong. If QA shows relevant context scrolling out, the knob turns.

**Shape: the feed, rendered as the feed.** Oldest first, one line per message: a group-timezone timestamp, the author (member name, or Orbit), and the body. The final line is the trigger message, explicitly marked as the one to interpret. Two additions frame it:

- **A now-anchor.** One line stating the current date and time in group time. Timestamps without an anchor are noise; the model cannot judge "twelve hours ago" without knowing when now is. Today's prompt has no time reference at all, so this is new.
- **Open-question context.** When a live group proposal exists, one line names it: which plan, what time, who asked. This is what lets the model read "actually, 10 works better" as a new proposal superseding the old one rather than a fresh idea, and a correction as a correction.

**No age cutoff.** The seed settled this: a reply can arrive twelve hours later, and a hard recency filter would misread that group. The timestamps are in the window precisely so the model can judge staleness itself.

The window is composed by a pure function (messages in, prompt block out) so its exact rendering is pinned by unit tests, and the feed query behind it is bounded (`take` twenty), unlike the page's unbounded feed read, which this slice does not touch. Detection still triggers only on the sender's own member message; Orbit's messages appear in windows but never trigger a read.

## Never silent on a direct ask: the verify ladder

Part one's decision ladder (`change-plan.ts`) resolved every incomplete reading to silence. Under the amended guardrail, silence is reserved for messages that are not asking Orbit anything; a request-shaped reading that is missing a piece gets a question. No new extraction fields are needed for any of this: the window fixes what the model can know, and the ladder rewrite fixes what Orbit does when the model still cannot know. The extraction schema is untouched, which keeps the claim-to-fact boundary exactly where it is.

The rewritten ladder, in decision order, with the change from part one named:

1. **A non-time request declines whether or not the target is known.** "Can we move it to tony's?" gets the venue decline even when "it" never resolves, because the decline never needed the target. This fixes the third QA failure, where an ambiguous "it" silenced even the honest no. It also declines whether intent is clear or only probable; the model's conservative tiebreak (not sure means not a request) is the false-positive guard.
2. **A time request with no resolvable target gets a which-plan question.** Plain text, naming the actual plans: "I can move a time. Which plan do you mean, Climbing Tuesday or Beers?" No chips, because there is no concrete full reading to confirm; the member's reply comes back through the window as a complete request, which is the whole reason the window exists. With the window in place this should be rare (the second QA failure's bare follow-up now has the conversation to land on), but rare is not never.
3. **A time request with a target but no time gets a which-time question.** "Happy to move Beers. What time were you thinking?" Same shape, same reasoning. Part one resolved this to silence as concrete-first; the amended guardrail overrides that for direct asks, and the question is still concrete about everything it knows.
4. **A past time still gets the honest reply; a same-time request now gets one too.** "Can we do 8?" on a plan already at 8 was a silent no-op; it becomes "Good news, Climbing this Tue is already at 8pm." A member asking for the current time is confused, and silence leaves them confused.
5. **A complete, probable reading gets part one's verify chips, unchanged in shape.** Orbit proposes its single best concrete reading with confirm-or-leave-it chips visible only to the asker. What changes is what confirm does: it opens the group proposal instead of moving the plan (except where the floor is one, where it still moves immediately).
6. **A complete, clear reading opens the group proposal directly**, with the asker's yes seeded from their own message.

The three QA failures, replayed against this design:

- **Wrong-target bare follow-up.** "Can we do 9 instead?" arrives with the beers conversation in the window; the model targets beers. If it still cannot pick, rung 2 asks which plan instead of guessing or going quiet. Either way the failure mode (silently acting on the wrong plan) is gone, and under consensus even a wrong guess is a proposal, not a move.
- **The dead correction.** "Sorry, I meant beers, not climbing" arrives with Orbit's own wrong-target proposal visible in the window, so the model can emit a complete request: beers, at the 9 the asker named two messages ago. That opens the beers proposal, and the supersede rule below retracts the climbing one. If the model cannot recover the time, rung 3 asks. Nothing in this path can end in silence.
- **The ambiguous "it".** Rung 1. The decline fires target or no target.

Verify questions and declines are plain messages with no proposal row behind them, which means (as with part one's declines) they carry no idempotency key; a hypothetically re-fired detection would repeat one. Part one accepted this exposure for declines and nothing here widens the trigger (one detection per send, fired once by the client); it is recorded in debt rather than engineered away.

## Corrections, and who wins when proposals collide

**Newest wins, per event.** A new time proposed for a plan that already has a live proposal supersedes it: the old proposal is stamped superseded, its chips die, its message stays as plain history with no residue, exactly how a stale-baseline proposal already retires. Votes do not carry over, because a yes to 9 is not a yes to 10 (the vote-belongs-to-a-proposal rule from spark). The conversation moved; pinning the group to the first number typed would make Orbit stubborn.

**Newest wins, per asker.** A person's new change request closes their own prior live proposal, whatever event it was on. This is the mechanism that makes a correction real: "sorry, I meant beers" opens the beers proposal and retracts the climbing one in the same stroke, so a proposal known by everyone to be a mistake is never left armed where three stray taps could move the wrong plan. The cost is that one person cannot hold two live time proposals on two different plans at once; they can ask again the moment the first resolves, and a person mid-correction is overwhelmingly the more common case.

Orbit does not announce a supersede. The new proposal's message is the visible response, and anti-clutter covers the rest. (A nicety was considered and deferred: the correction's proposal message explicitly saying "Climbing stays where it is." It needs the model to flag corrections as corrections, a new extraction surface this slice deliberately avoids.)

## The moment of consensus

The group proposal is one Orbit message: who asked, which plan, the new time against the old, the chips, and the live tally. Candidate copy, final wording owned by the composers under test:

`Sam wants Climbing this Tue at 9am instead of 8am. Works for you?`

With the bare-hour disclosure appended once, here, when inheritance decided the reading (part one's rule, unchanged, disclosed at the proposal rather than the move because the proposal is where the group first sees the number). Two chips, whole group, soft on both sides:

`9am works` · `Keep 8am`

Chip taps update the tally and never post a message. The tally line mirrors spark's: names for the yeses, a count for the keeps, and the countdown clause only when exactly one yes short of the live bar. The bar is dynamic (keep taps and fresh RSVPs can raise it), so "one more makes it happen" is computed from rows at render, like everything else. Votes are one row per person per proposal, mind-changing allowed until resolution, the asker's seeded yes included.

**The yes that clears the bar moves the plan in the same tap**, the spark-promotion precedent held exactly: only a yes triggers a promotion attempt (a keep tap can only raise the bar, so it never needs to), and the attempt re-reads votes, RSVPs, and membership inside the transaction, so a racing mind-change cannot move a plan the tally no longer supports. Inside one transaction: the event's start moves off the proposal's stored baseline (the conditional-write stale guard from part one, unchanged), `previousStartsAt` is written, every RSVP row is deleted, every yes voter is seeded IN, the announcement is posted, and the proposal is stamped confirmed. A proposal whose baseline no longer matches the event, whose event has started, or whose own proposed time has passed is not live, renders no chips, and refuses votes; all of this is part one's derived-liveness machinery inherited whole.

**Keep voters get no RSVP row on the moved plan.** Spark seeded both flavours of no as OUT, and this deliberately diverges: spark's no was an answer about attending on a day, while a keep tap is a comparison between two times. "8 works better for me" does not say "I can't make 9," and writing OUT would put words in their mouth on the surface where accuracy is the entire product. They return to honest pending, and the card asks them fresh. The announcement owns this out loud:

`That settles it. Climbing this Tue is moving to 9am, it was 8am. I marked everyone who said yes as in; the rest of you, answer again up top. Want it back at 8am? Say the word.`

(The yes count in any final wording is derived from the rows read inside the transaction, never assumed to be three; spark part two already shipped and fixed a hardcoded "Three" once.)

The revert stays textual and follows the same consensus rule with no special case, per the seed. `previousStartsAt` keeps remembering only the last move; `scheduledKey` stays untouched (relocate, never free the slot); both are part one's decisions, inherited.

Voting requires membership, checked in the action, and chips render only for member viewers. The proposal message itself is ordinary feed history for everyone else, consistent with the surfaces-ungated standing state.

## What changes in the data model

- **`ProposalVote`**, shaped like `GaugeVote`: proposal, user, answer (yes or keep), one row per person per proposal via a compound unique. Derived tallies only; nothing stores a count.
- **`ChangeProposal` grows a kind**: verify (part one's asker-only question) or group (the whole-group proposal). Existing rows are verify.
- **The source-message idempotency key becomes per-kind**: unique on message-and-kind rather than message alone, so a verify question and the group proposal its confirmation opens can both trace to the same member message, each exactly once.
- **The answered marker gains superseded** alongside confirmed and declined, so a retired proposal is distinguishable from a declined one and liveness stays fully derived.

Nothing else moves. No new Event columns, no Message metadata column (message kind stays derived from back-relations, the recorded design), RSVPs and memberships untouched.

## What does not change

- **The extraction schema.** Same fields, same claim-to-fact boundary; the prompt gains the window, the now-anchor, the open-proposal line, and guidance that a short message may take its plan and time from the conversation. The three-way classification and the conservative tiebreak stand.
- **Typed votes are not votes.** "9 works for me" typed in chat updates no tally; the chip is the mechanism, one tap, right there under the question. Recognizing textual agreement is a fourth intent class, and part one's own debt note says the one-prompt design should be re-examined, not silently extended, when a fourth intent arrives. Deferred, recorded.
- **The declines.** Venue, day, and rhythm requests still get their honest declines; part one's retirement debt ("the slice that ships venue changes must retire the decline") is not due, because this slice ships no venue or day changes. What changes is only that declines now fire reliably (rung 1).
- **Spark, whole.** Gauges, votes, promotion, the spark threshold, and the small-group edge it shares in miniature: all untouched, the last one recorded below rather than inherited silently.
- **The event card, RSVP writes, the cron.** A proposal never blocks the card's own RSVP buttons; RSVPs on the current time keep their meaning (and now shape the bar, which is the system telling the truth).

## Testing and verification

The consensus arithmetic, the window composer, and the rewritten ladder are pure functions, and that is where the load-bearing tests go: a table over the bar cases in the walkthrough above (deadlock-turned-unanimous, side-switching, duo, solo, undefended incumbent, keep taps raising the bar, mind-changes), the window rendered byte-for-byte (ordering, timestamps, now-anchor, trigger marking, proposal line), and every ladder rung including all three QA failures replayed as claim-level fixtures. The promotion transaction gets the gauge-promotion treatment against the real dev-test database: seeding, the keep-voter no-row rule, the baseline race, supersede stamping, and the re-read-inside-the-transaction guard. Prompt content keeps its spot-check style, extended to the new blocks. Every existing test stays green, spark's especially.

Browser QA must run on a **two-plan sandbox**, because the owner's two-plan QA is what caught what a one-plan walkthrough structurally could not; a one-plan walkthrough here would be repeating the known blind spot. The dev-test sandbox is dirty from part-one QA (Tuesday Climbers plus moved events and QA feed noise, recorded in build-notes and project memory) and gets reset first: confirm the target with `npm run db:which`, clear all rows (the 27 July precedent), then rebuild through the real product (walk `/create`, join members, spark or schedule a second plan). The walkthrough then replays the three QA failures verbatim and walks one full consensus arc (propose, second yes, third yes moves it, RSVPs seeded, keeps pending) plus one supersede and one revert-through-consensus.

## Debt opened, carried, and flagged

- **Text replies have no idempotency key** (carried from part one's declines, now more paths). One detection per send today; recorded, not engineered.
- **The intent prompt now does three jobs with a much larger context.** Part one's re-examination note stands and gets more true; the moment a fourth intent lands, split it.
- **Detection latency now sits in front of every reply path.** Same feel-issue debt as part one, unchanged in kind, slightly wider in surface.
- **The spark threshold's small-group edge remains.** A two-person group still cannot spark an event. Out of this slice's lane, now recorded instead of implicit.
- **(not 100% sure, verify) The gauge vote action may not check membership.** The new proposal-vote action does; the older gauge one should be checked in passing and flagged, not fixed, in this slice.
- **The unbounded feed query on the group page stands.** The window query is bounded and separate; the page read is prior debt.
- **The correction-acknowledgment nicety** ("Climbing stays where it is") is deferred with the extraction flag it would need.
