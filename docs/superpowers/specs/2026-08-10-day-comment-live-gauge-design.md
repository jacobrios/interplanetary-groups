# Day comment on a live gauge · design

**Date:** 10 Aug 2026
**Slice branch:** `feat/day-comment-live-gauge`
**Status:** approved by the owner in the brainstorming session, 10 Aug 2026

## The problem

A gauge is live ("Beers Saturday? I'm in / Can't make it / Can't that day") and a member replies in chat with a day instead of a chip: "Sunday works better." Today Orbit either hears nothing, or hears it wrong: when the model reads the message as a change request, Orbit answers "I can't move it to another day yet, I can change the time if that helps" about a calendar plan that does not exist. The third chip already records that the day is the blocker but has nowhere to put which day would work, so the retry machinery guesses blind (same weekday, one week later) even when a member said the answer out loud mid-gauge. The answer seam taught Orbit to hear the first reply to its own day question; this slice teaches it to hear the same information volunteered a step earlier.

## Decisions settled in brainstorming (do not relitigate)

1. **A day comment acts now as a vote and later as the retry's answer; it never touches the live gauge's day.** One member naming a different day must not reset or split a vote others have already answered. (Owner chose this over an immediate counter-gauge and over an acknowledge-only reply.)
2. **Vote recording: can't-that-day, unless already in.** A member with no vote, a can't-that-day, or a "next time" gets recorded as can't-that-day (naming a day is re-engaging with the idea). An explicit "I'm in" is never overridden by an inference; their yes stands and their named day is still remembered.
3. **Orbit replies once per comment.** A chip tap is its own feedback; a sentence to Orbit is not, and Orbit here acts on an inference (recording a vote nobody tapped), which the transparency guardrail says must be announced. One short reply per comment, never a message per later tally change.
4. **At a day-blocked close that would have cleared the bar, a remembered day means skip the ask and revive immediately on that day.** The "what day works better?" ask exists only to obtain this information; asking a question already answered would make Orbit look like it was not listening. No remembered day means today's ask-then-guess flow, untouched. The eligibility bar itself is unchanged, nothing looser.
5. **The revival is a member-named gauge with full rights.** The namer is seeded in (they named the day, the standing rule), the original gauge's stored time carries over, a time stated in the comment wins, and the naming message anchors the gauge the same way every member-named gauge is anchored to its message.
6. **A day comment on Orbit's own guess gauge earns it a revival.** The loop cap keys on whose move it was, and only a human resets the clock; a member naming a day mid-gauge is a human move. No runaway loop is possible: every further cycle needs a fresh human naming a fresh day; Orbit alone still never goes twice.
7. **The remembered day lives on the gauge row, latest wins.** One suggested weekday, an optional stated time, who named it, and the message that named it; a newer comment overwrites. Chosen over per-vote storage because the retry only ever needs one answer, and "the newest proposal supersedes" is the product's standing tie-break. (Owner settled this as the data-home decision.)
8. **Detection is a fourth reading, gated the way the answer seam is gated.** The model is asked whether the message names a better day for an idea currently being gauged, but the question only exists when stored rows confirm a live gauge; a claimed day comment with no live gauge is discarded whatever the model says. Inside the situation the day-comment reading outranks the change reading, which is the fix for the wrong-reply bug.
9. **Ambiguity between simultaneously live gauges gets a question, not a guess and not silence.** If two different ideas are gauging at once and the comment does not make clear which it means, Orbit asks which one. This is a new speak-or-quiet decision and gets its line in the build-notes speak-or-quiet list.
10. **A day counts as named only when exactly one is named** (standing rule), **and it must differ from the gauge's own proposed weekday.** "Saturday works for me" on a Saturday gauge is verbal attendance, which stays the written-but-unbuilt guardrail it is today.

## The member experience

The Saturday beers gauge is live. Dana replies "Sunday works better."

- Her vote is recorded as can't-that-day (rules above); the gauge's tally updates like any chip tap.
- The gauge remembers Sunday, and that Dana named it.
- Orbit replies once: "Got it, Saturday doesn't work for you. Sunday's noted in case this one doesn't come together." If Dana was already in: "You're still in for Saturday, and Sunday's noted if it doesn't come together." The reply never promises a revival, only that the day is noted, because whether a revival happens depends on a bar the comment cannot see.

If Saturday clears the bar anyway, the event is created as always and the Sunday note quietly evaporates. If the gauge closes day-blocked and would have cleared the bar, Orbit skips the ask and immediately opens the Sunday gauge: same activity, the original time carried (or Dana's stated time), Dana seeded in, full chips and tally, full rights. If the gauge fails without clearing the bar, it dies exactly as today.

The same behavior holds on every kind of live gauge: an original spark, a member-named revival, and Orbit's own next-week guess. A second member naming a different day replaces the first and gets their own one reply. A day comment after the bump message behaves identically; the window is simply "while the gauge is live."

## Mechanism

### Detection (the model's one new judgement)

- The intent extraction gains a day-comment reading: is this message naming a better day for an idea currently being gauged, which single day, and did it state a time. Mirrors the answer seam's shape: `detect-intent` checks for live gauges before the model call, injects a live-gauge context line into the prompt only when one exists, and passes a deterministic flag into the claim-to-fact boundary (`normalizeIntent` in `src/lib/orbit/spark.ts`) so the reading is discarded unless deterministic code confirms the situation.
- Precedence inside the situation: day comment beats change request (defined precedence, the same pattern as answer-beats-change; not a widening of the queued both-true discard).
- When several live gauges exist across different activities, the model reports which activity the comment targets; deterministic code matches it to a live gauge. Exactly one live gauge and no contrary signal: attach to it. Several and unclear: Orbit asks which one (decision 9).

### Storage

- The gauge row gains nullable fields for the suggestion: named weekday, optional stated time, the naming member, and the naming message. Latest comment overwrites all of them together.
- The vote write goes through the existing per-member upsert; the rules in decision 2 decide the written answer.

### Close (endgame)

- The day-blocked eligibility test is unchanged and still runs before the closure outcomes.
- Inside the day-blocked branch: a remembered day means create the revival now, instead of posting the ask. No remembered day: today's flow, untouched.
- The guess gauge's terminal routing moves after the remembered-day check: a guess gauge with a remembered day gets the revival; without one it closes plainly as today.
- Revival mechanics: date is the first named weekday strictly after the failed day, resolved at close (so "Sunday" said on Wednesday about a Saturday gauge lands the Sunday right after that Saturday, and the resolved date is future by construction); time is the comment's stated time if given, else the original gauge's stored time copied verbatim, never re-derived; the namer is seeded in; the naming message is the revival's source message, which is both the cannot-create-twice guarantee and what makes it a full-rights member gauge under the existing loop-cap representation, with nothing new invented.

## Not in this slice (each with its home)

- **Verbal RSVP** ("Saturday works for me" marking someone in): the verbal-RSVP slice.
- **Day changes to real calendar events**: the day-change slice of change requests; those still get today's honest decline.
- **Showing the remembered day in any UI** (gauge card, pending surface): a later surface pass; only Orbit's reply discloses it.
- **The both-true discard** (idea plus change in one message): its own queued slice.
- **Ranked or tallied day preferences** ("two want Sunday, one wants Thursday"): declined until something needs it; latest-wins is the rule.
- **A day comment answering Orbit's open day question**: already built (answer seam), unchanged; the open-ask window and this seam cannot overlap because the window shuts the moment a live gauge exists.

## Verification (written before any code)

1. **Suite baseline** at slice start, recorded in build-notes §11 against the pending-surface slice's finishing count, any pre-existing failure named and carried untouched. Before and after numbers in the PR.
2. **Unit tests, TDD, each shown failing first**: vote-write rules (in preserved, next-time flips, no-vote records, can't-that-day idempotent); latest-wins overwrite of the whole suggestion group; close routing (revive when a day is remembered, ask-then-guess when not, guess gauge earning a revival, plain close when a guess gauge has no remembered day); date resolution (first named weekday strictly after the failed day, across a month boundary); time carrying (stated time wins, else copied, ambiguous bare clock number reads into the carried half of day); the naming-message anchor preventing a second revival; eligibility bar untouched by all of it. Suite stays green from an empty database.
3. **Bench, before and after, as rates over runs** (`npm run eval:detect`, not part of the suite):
   - Must-recognize: "Sunday works better" beside a live gauge; a "can't do Saturday, what about Sunday?" variant; one with a stated time ("Sunday at 6 works better").
   - Must-stay-quiet: the same words with no live gauge; a nostalgic look-alike ("last Sunday was fun"); the same-day comment ("Saturday works for me" on a Saturday gauge).
   - The wrong-reply case pinned directly: a live gauge plus a day comment must never produce the "I can't move it to another day yet" decline.
   - The existing 26 cases must hold their rates. New cases run before the fix to prove they fail.
4. **Browser QA**: a staging script in the pattern of `scripts/qa-stage-retry.ts` seeding a live gauge, so the five-minute PR script is: comment a day, see the reply and the tally tick, run the close, see the revival arrive seeded with the right day and time.
5. **Honest gap, named now**: the two-ideas-at-once ambiguity question (decision 9) is hard to stage cheaply in a browser and will likely be verified at the bench and unit level only.

## Expected debt

- The detection prompt grows slightly (one live-gauge context line plus the new schema fields) on the same cheap model; per-message cost rises by fractions of a cent. No spending-ceiling implication worth acting on; stated for the record.
- The remembered day is invisible outside Orbit's one reply, so a member who missed that message cannot see what Orbit is holding. If that confuses anyone, the fix lives in a surface slice, not here.
- Latest-wins deliberately discards earlier suggestions; a future "most requested day" feature would need to store more than we do. Recommendation: decline until proven otherwise; nothing gets worse by never doing it.
- Decision 9 adds a new place Orbit decides to speak; the build-notes speak-or-quiet list gains its line in this slice (an obligation, recorded here so it is not lost, not strictly debt).
