# The gauge endgame: one bump, a clean close, and a goodbye

**Date:** 4 August 2026 · **Slice branch:** `feat/gauge-endgame` · **Status:** approved by the product owner in the brainstorming session of 4 Aug 2026, as a package.

## What this slice is

Today a gauge is born, collects taps, and then stops mattering silently at midnight. This slice gives it a complete life: one well-timed second chance the evening before its day, a clean close while the plan can still be acted on, and a goodbye when people had committed. It implements the "one bump, then let it die" guardrail that has been written in CLAUDE.md since the beginning and never built.

It is also, deliberately, the first slice built under the owner's chattier posture (stated 4 Aug 2026: err toward Orbit being a little chatty and helpful rather than silent and missing an important moment; recorded in session memory as a direction marker, not yet an amendment to the stay-quiet north star). Every new speak-or-stay-quiet decision this slice adds gets its line in the build-notes register, per that register's own standing rule.

## Settled decisions (do not relitigate)

1. **Which gauges get the one bump: the near-miss and the ignored idea both.** A gauge short of three yeses with its day ahead gets bumped whether it has two yeses or zero. The owner's reasoning is recorded: people are busy and MVP-era notifications are weak (mobile web plus email), so a missed message should not kill a good idea. The zero-yes bump is the first deliberate act of the chattier posture.
2. **The wrong-day case (interest present, day rejected) gets nothing this slice.** Not because it is wrong product, but because it is a different mechanism (a new proposal on a new day, with no signal about which day works) and it collides with the settled "a gauge whose day has passed is dead" line. It is the named next slice; see not-in-this-slice.
3. **The bump fires around 8pm group-local on the evening before the proposed day.** Evening, not morning-of, at the owner's direction: evenings are when people can actually check with the person they share a life with, and it leaves the whole next day for stragglers. "Around" is deliberate; see the precision decision below.
4. **Two suppression guards, both in the spirit of the bump justifying itself:** no bump for a gauge created earlier that same day (the group has not had time to miss it), and no bump when the gauge's message is still the most recent thing in the feed (a repeat into an empty room is clutter, not help).
5. **One bump per gauge, ever.** Mechanically near-guaranteed by the night-before timing; enforced regardless.
6. **The bump is a fresh Orbit message at the bottom of the feed carrying the same three chips and the live tally.** Answerable where it lands, no scrolling back. Both the original message's chips and the bump's chips stay live and write to the same tally, so they can never disagree; the owner approved this dual-surface coexistence knowingly, aware that "two surfaces collecting the same answer" was once the reason gauges close at event creation. The difference: these two surfaces share one underlying answer store; the gauge-versus-event-card case did not.
7. **Bump copy is deterministic and differs by situation.** Near-miss: last-call framing naming who is in and what one more yes does ("Last call on beers tomorrow: Maya & Jesse are in, one more makes it happen"). Ignored: a gentler surfacing ("In case this got buried: anyone in for beers tomorrow?"). Composed from stored facts, no model call, Orbit voice rules apply (plain, warm, no em dashes, soft framing).
8. **A gauge closes two hours before its proposed start, not at the end of its day.** After close, chips stop working and a late third yes creates nothing. This AMENDS the settled "a gauge stays live until the end of its proposed local day" (spark part one). The owner's reasoning: a half-committed plan must not limp ambiguously into its final hour, leaving two people at 6:45 wondering whether beers is a thing.
9. **A closure note is posted only when at least one person had said yes.** Soft, final, chip-less, no dialogue invited: "Beers didn't come together this time. Maybe next week." A gauge that collected zero yeses scrolls away in silence exactly as today. This NARROWS the settled "below-threshold ideas scroll away with no residue" (spark) to zero-yes ideas only: the confusion being prevented is people who committed not knowing it is off, and a zero-yes gauge has nobody to un-confuse.
10. **Reviving a closed idea is just a new spark.** Someone floats it again and the existing machinery answers. Nothing new is built for revival.
11. **A gauge born inside the two-hour window still opens, chips and all.** It skips the bump (no night-before exists for it), closes at the proposed start itself rather than two hours prior, and its gauge message carries one extra deterministic urgency line naming the time ("Heads up, this one's for tonight at 7, so get your yes in quick"). The owner chose this over extending the stay-quiet guard: a spontaneous same-evening rally is the most alive moment this product serves. Ideas whose resolved time has already passed stay silent, unchanged.
12. **The urgency line is generic, not activity-matched.** Activity-specific wit would require model-written per-message copy (new cost, new failure modes); declined on the same grounds as the activity-matched emoji in spark part one. Recorded in the declined pile, not the queue.
13. **Zero new model calls.** Bumps, closes, and every new sentence are deterministic, driven by Orbit's clock. This slice adds nothing to per-message spend. (Stated as a product fact per the model-cost rule; there is no new per-unit cost to name.)
14. **Orbit's daily wake-up becomes an hourly one, and hour-level precision is accepted.** "Around 8pm" and "about two hours before" land within the hour, not on the minute. The owner accepts this for a social nudge. The two numbers (8pm, two hours) are honest placeholders with no data behind them, kept as named constants in one place in the same style as the Friday-7pm family so a future learning slice replaces them as one decision.
15. **This slice updates the records it touches, in the same PR:** the two amendments above land in CLAUDE.md's carried-forward settled list, the "Where the build is" section is rewritten at the slice boundary as always, each new speak-or-stay-quiet decision point gets its line in the build-notes register, and the cron cadence change lands on the pre-deploy checklist (deploy-time obligation rule).

## Not in this slice (every exclusion names its home)

- **The wrong-day retry** (Orbit coordinating a new day when interest is clear but the day was rejected): the named next slice. Its spec must settle how a new day is chosen with no signal, and must deliberately amend "a gauge whose day has passed is dead, not stalled."
- **A pending-events surface** (a place to see unanswered gauges without scrolling): a future design-led slice; no mockup exists and it is a real screen-real-estate decision. The bump is this slice's answer to the same pain.
- **"Ask Orbit what's open"** (Orbit answering read-only questions like "any pending events?"): a future candidate slice, to be weighed head-to-head against the pending-events surface, since it may be the cheaper of the two. Today such questions are deliberately classified as not-a-request and get silence; that stay-quiet lean is unchanged by this slice and is a named candidate for the chattier posture later.
- **Activity-matched wit** in the urgency line: declined outright (decision 12), joining activity-matched emoji.
- **Override learning** for the new numbers (8pm, two hours) and the old ones (Fri, Sat, 7pm, 9am): still the named successor slice for all of them, unchanged.
- **Verbal RSVP and the both-true claim:** untouched, exactly where CLAUDE.md already tracks them.

## How this will be verified (written before any code)

**Suite baseline, recorded:** 553 tests across 39 files, all passing, run on this branch before any code, matching the hook slice's recorded finishing number. No pre-existing failure is carried.

**Automated, all against a controlled clock (the injected-clock pattern the cron guard already follows):**

- The bump fires for a below-bar open gauge the evening before its day, and each suppression reason is proven both ways: already bumped, created that same day, still the newest message, already closed (which includes promoted-to-event, since the third yes closes the gauge in the same tap), day already arrived.
- The close boundary: a third yes just before close creates the event; the same yes just after close creates nothing.
- The closure note posts exactly once for a gauge with at least one yes, never for a zero-yes gauge, and never twice under a re-run (idempotency, same discipline as every other Orbit write path).
- A late-born gauge closes at its start, is never bumped, and carries the urgency line; a past-time idea still produces no gauge.
- Every new test is written first and watched failing before the code that makes it pass, per house TDD rules.

**By hand, in the browser against dev-test, one walkthrough covering each Orbit moment:** a near-miss bump with its tally; an ignored-idea bump; a third yes landing on a bump chip and creating the event with RSVPs seeded; a closure note after real yeses; a zero-yes silent death; a late-born gauge with its urgency line. Time-dependent moments may be staged by adjusting stored gauge times in dev-test rather than waiting for real evenings; the PR must say plainly which moments were staged versus lived, and anything the walkthrough cannot honestly reach gets named in the PR per the house rule.

## Debt this slice expects to open

- **Two more undated numbers** (8pm, two hours) join Fri/Sat/7pm/9am awaiting the learning slice. Medium visibility: a badly timed bump is visible to the whole group.
- **The dual answer surface** while a bump is live (original chips plus bump chips). Cannot disagree in data; slightly unusual to see. Accepted knowingly; revisit only if QA shows confusion.
- **Hourly cron widens the timing surface** the product depends on: more runs, same failure modes. The pre-deploy checklist carries the cadence change.
- **Engineering expectation, flagged not settled:** the gauge record likely grows nullable markers for "bumped" and "closure posted" (the established idempotency pattern). The implementation plan owns the exact shape; called out here because it likely means a migration, and migrations carry deploy obligations.
