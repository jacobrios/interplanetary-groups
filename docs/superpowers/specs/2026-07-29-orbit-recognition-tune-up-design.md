# Orbit recognition tune-up: closing the hole upstream of the never-silent ladder

**Date:** 29 July 2026
**Slice:** recognition tune-up (follows change request part two)
**Status:** spec, awaiting owner sign-off

---

## The problem, in one paragraph

On 28 July the owner loosened Orbit's stay-quiet rule: a direct ask never gets silence. That change was written into CLAUDE.md and the reply ladder was rebuilt to honor it. The next day, in ordinary use, "can we move it?" sent right after a consensus move got silence anyway. Nothing broke and nothing was slow. The message never reached the ladder, because the ladder only guarantees an answer to a message that has *already been recognized* as a change request, and recognition still enforces the rule the owner replaced. The loosening landed in one half of the system and not the other.

## Why it happened, which is the part worth remembering

The never-silent rule exists in two places written in two languages. The reply ladder is code, and it was updated. The recognition step is a prompt, and it is a separate copy of the same rule, written in prose, in a different file, for a different reader. Nothing connects them, so both looked correct in isolation and the pair was wrong.

That is not a failure more care would have caught, which is why this slice ships a checklist as well as a fix.

---

## What this slice does

Four things, in this order.

1. **Measure first.** Build a recognition eval bench and record a baseline, before changing anything.
2. **Fix the three known holes** where the old philosophy is still enforced.
3. **Sweep for the rest** of the places the old philosophy is still written down, and fix only the ones in the recognition lane.
4. **Leave a checklist** naming every place in the product where the speak-or-stay-quiet decision gets made, so the next tune-up starts from a list instead of a bug.

### Settled going in, so the build does not relitigate it

**Option A, not option B.** Recognition gets more willing to treat a plan-shaped ask as a change request even when the ask names no plan and no time. It does *not* grow a fourth "aimed at Orbit but unclear" class. The owner accepted that B may follow later; the A-to-B path was checked and is additive (one schema field, one prompt section, one ladder rung, its copy), so nothing here is built to be torn out.

**A false positive here is cheap and that is why A is safe.** The ladder's answer to a change request with everything missing is a question, never a move. The worst case is one extra Orbit message asking which plan was meant.

**Not the cause: missing context.** The twenty-message window is live and feeds the same single model call that classifies. The model saw the history and still chose silence. Confirmed in code, not assumed.

---

## Part 1: the three holes

All three sit upstream of the ladder. Two are prompt text and one is our own code.

### Hole 1: the prompt still argues the old philosophy

`src/lib/orbit/spark.ts:135` currently tells the model:

> If you are not sure, answer isSpark false and isChangeRequest false. Missing something real costs nothing; interjecting on ordinary chat is worse. A message cannot be both: if it somehow reads as both, set only the one it mostly is.

"Missing something real costs nothing" is the exact belief the 28 July amendment overturned, still instructing the model to prefer silence when torn.

**The fix is to split one uncertainty into two,** because they are not the same and only one of them should produce silence:

- Unsure **whether the message is asking Orbit for anything at all** → still answer neither. Anti-clutter is unchanged and still governs this case.
- Unsure **what the person means**, once it is clear they want a plan changed (which plan, what time) → classify it as a change request and leave the unknown fields null. Those gaps are what the ladder exists to ask about.

The mutual-exclusion clause ("a message cannot be both") stays verbatim; the normalize layer depends on it.

Intended replacement, as a starting point rather than locked copy:

> If the message is asking for a plan to change, say so even when it does not say which plan or what time. Leave those fields null and set isChangeRequest true; the missing pieces get asked about, so an incomplete ask is still an ask. If you are not sure the message is asking for anything at all, answer isSpark false and isChangeRequest false. A message cannot be both: if it somehow reads as both, set only the one it mostly is.

Exact wording is the builder's call within that rule.

### Hole 2: the negative list says bare asks are not requests

`src/lib/orbit/spark.ts:130` lists as NOT a change request:

> - questions about an existing plan ("what time again?", "where is it?")

"Can we move it?" is a question about an existing plan. The instruction and the intent collide and the model resolved it as written.

**The fix is to narrow the bullet to questions that only ask for information,** and say out loud that a question asking for a change is a change request. Intended replacement:

> - questions that only ask for information about an existing plan ("what time again?", "where is it?"). A question that asks for the plan to change ("can we move it?", "any chance we push it later?") IS a change request, even with no time or plan named.

### Hole 3: our own code kills a bare ask, every time

`src/lib/orbit/spark.ts:222-228`, in the claim-to-fact boundary:

```ts
// A change request that names nothing to change is not one.
if (requestedFields.length === 0) return { kind: "none" }
```

That comment is the same stale philosophy in code form. A bare "can we move it?" names nothing to change, so even on a run where the model *does* recognize the ask, this converts it to silence before the ladder sees it. Unlike the prompt holes this one fails identically every time; it is not model variance.

**The fix is to delete the guard and let an empty list flow through.** Traced: the ladder's first rung asks whether any requested field is something other than time, which is false for an empty list, so an empty list correctly skips the decline and lands on the which-plan or which-time question. That is the desired behavior with no further change.

**Deliberately not done: defaulting an empty list to `["time"]`.** That would assert a claim the model never made, on the one boundary whose whole job is to not do that, and it would be wrong for someone who meant the venue.

**What this accepts:** a run where the model says "change request" but names nothing and meant nothing now produces a question instead of silence. That is the false positive option A is buying, priced at one message.

**The plan must verify** that nothing downstream of normalize assumes a non-empty `requestedFields`. The two known consumers are safe (the ladder uses `.some()`, and the decline copy only runs when a non-time field exists), but this is a check to run, not an assumption to carry.

---

## Part 2: the sweep

**What it covers.** Every remaining place where the stay-quiet-when-unsure philosophy from change request part one is still encoded: prompt copy, guards in our own code that convert an unclear answer to silence, every exit from the detection path into quiet, and the docs.

Known starting points, from the investigation already done:

- The prompt's rule that agreeing with a live proposal is neither a spark nor a change request (`spark.ts:126`, final sentence). Adjacent to this failure and worth examining, though it only applies while a proposal is live and the owner's failure came after one had closed.
- Every quiet exit in `src/app/actions/detect-intent.ts`: the structural ones (no user, no message, Orbit's own message, wrong triggerer), the classification exit, the ladder's own quiet branch, the move-failed fallback, and the swallowed-error path.
- The spark arm's suppressions (duplicate gauge, activity already on the calendar, start time already past) and the normalize degradations on both arms.
- CLAUDE.md and build-notes wording that still describes the old default.

**The lane, and it is firm.** The sweep *finds and lists everything*. It *fixes* only what sits in the recognition lane for change requests. Anything it turns up in the spark path, the gauge path, or elsewhere is written into the checklist and reported to the owner as a finding, not changed inside this slice.

**One finding already anticipated,** flagged here so it is not mistaken for something the sweep invented: a thrown error during detection is currently swallowed to silence. Under a never-silent rule that is arguably wrong, and it is arguably right (a failed model call has nothing honest to say). It is out of this slice's lane either way. It goes on the checklist as a question for the owner.

---

## Part 3: the eval bench

### Why it exists

Recognition is not deterministic; the owner has already recorded that the same sentence can classify differently run to run. So a single passing walkthrough is not evidence that this is fixed, and saying otherwise would repeat the standard of proof that let this ship.

### What a case is

Not a long conversation. A case is **a short setting plus one message plus the expected outcome**:

```
{
  id, bucket, description,
  calendar:  the numbered upcoming plans the model is shown,
  history:   a handful of messages with relative timestamps and authors (member or Orbit),
  trigger:   the one message being classified,
  expect:    the classification (change / spark / none) AND the resulting ladder action
}
```

**It asserts the outcome the member would experience, not just the label.** After the model answers, the case runs the answer through the normalize layer and then the ladder planner, both of which are pure and take no database. So a case says "this message produces a which-plan question," not merely "this classifies as a change request." That is the thing the owner actually cares about.

**No database, ever.** The bench calls the classification and the pure functions directly and never touches the action that writes rows. It reads the model and nothing else. This also keeps it fast and makes it safe to run repeatedly.

### The buckets

| Bucket | What it holds | Bar |
|---|---|---|
| **Must recognize** | Bare asks ("can we move it?"), corrections, follow-ups, indirect-but-real asks, the owner's own 29 July failure verbatim | 5/5 |
| **Must stay quiet** | Agreement, reactions, availability ("running late", "I can't make 8"), commentary ("9 would've been better"), small talk, someone reacting to what Orbit just did | 5/5 |
| **Genuinely ambiguous** | Cases with no right answer, recorded to watch for drift | none, descriptive only |

The must-stay-quiet bucket is not decoration. It is the only thing standing between this slice and a chattier Orbit, and it is where a fix to recognition would show up as damage.

### Size, runs, and cost

- **Around twenty cases** for this slice, weighted toward the two bars.
- **Five runs each.** Five distinguishes "always" from "sometimes." It does not resolve fine gradations, and the spec says so rather than implying more precision than exists: a case at four out of five is a flag to look at, not a measured 80%.
- **A few cases deliberately longer than the twenty-message window,** because window truncation is the one thing only a long history can test. Most cases stay short, since extra history is noise around what is being measured.
- **Cost is not a constraint.** Roughly twenty cases at five runs, before and after, is about two hundred model calls, on the order of fifteen cents and a couple of minutes.

### Where it lives, and how it runs

- A top-level `evals/` directory, outside `src/`.
- **It must never be picked up by the automated suite.** Verified: `vitest.config.ts` sets no `include`, so Vitest's default glob only collects `*.test.ts` / `*.spec.ts`. Eval files must not use those suffixes. The plan verifies this by running the suite and confirming the file count and test count did not move.
- Run deliberately by command, following the precedent already set by `scripts/try-extract.ts` (costs money, hits the network, not part of CI).
- **Output is a scoreboard, not a transcript:** per bucket, a score; then the failing cases only, each with its setting, the message, what was expected, and what Orbit actually did. The owner reads failures, not histories.

### The order that makes it mean anything

**Baseline first.** The bench is built and run against the current code *before* any of the three holes are touched, and the baseline is recorded. Without a before-number the after-number says nothing. The baseline is also the honest test of the bench itself: if it does not reproduce the owner's failure on today's code, the bench is wrong and gets fixed before the fix does.

---

## Part 4: the checklist

A named section in `docs/build-notes.md` listing every place in the product where the speak-or-stay-quiet decision is made, what each one currently says, and which direction it leans. One line each, pointing at the file.

- Its home is build-notes because it is reference, not a rule that must hold every session. A one-line pointer goes in CLAUDE.md so a fresh session knows it exists.
- **Written next to the list, because a checklist is only true the day it is written:** any slice that adds a new speak-or-stay-quiet decision adds its line. Without that rule this rots into something worse than nothing, a list that looks complete and is not.

---

## Standing rules this slice must not break

- **Venue, day, and rhythm changes still get an honest decline**, not an edit. Recognition getting more willing must not turn a venue ask into a time change.
- **The claim-to-fact boundary holds.** Normalize still degrades rather than invents. Deleting the empty-list guard removes a *rejection*; it does not add a fabricated value.
- **Anti-clutter still governs unprompted nudges.** This slice only touches how Orbit reads a message aimed at it.
- **The prompt is still doing three jobs.** Build-notes has flagged this twice. This slice does not add a fourth, and the flag is carried forward, not resolved.

---

## Definition of done

- The three holes fixed, each with the reasoning recorded.
- The sweep run, with everything it found written into the checklist and out-of-lane findings reported to the owner rather than fixed.
- The bench built, baseline recorded before the fix, after-run recorded, both numbers in the record.
- Both bars met, or any case below its bar reported honestly with the number rather than smoothed over.
- The automated suite still green and its count unmoved by the eval files.
- A build-notes §11 entry, and the CLAUDE.md "Where the build is" section rewritten for the new slice boundary.
- A PR opened and stopped at, with a five-minute manual QA script in the PR body and repeated in the chat message announcing it.

## Verification, and what it can honestly claim

- **Can be claimed:** the recognition rate on the bench, before and after, per bucket. The deterministic hole (number 3) fixed, provable by a test that fails before and passes after.
- **Cannot be claimed:** that recognition is now correct in general. Twenty cases at five runs measures twenty cases. The bench is a floor that keeps rising, not proof.
- **The owner's own 29 July failure** is in the bench verbatim as a named case, so the thing that started this is the thing that gets measured.

## Risk

**The bench is the unproven part.** Nothing in this repo has ever run the intent prompt against the real model in a repeatable harness; every existing detection test uses a stand-in. That makes it the most likely piece to take longer than estimated. It is deliberately kept small and database-free to limit that.

The three fixes themselves are low risk: two are prose edits and one is a deletion of four lines whose downstream path has been traced.

## Debt this slice is expected to open

- **The bench covers recognition only.** Spark's own classification and the gauge path are not in it. It is built so they can be added, and that is the natural growth path rather than a separate project.
- **Five runs is a coarse instrument.** Anything that needs a real rate rather than always-or-sometimes needs more runs than this slice buys.
- **Option B is still open,** and the checklist is where the case for it will accumulate if bare asks keep dying in shapes A does not cover.
