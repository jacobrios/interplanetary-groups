# Pre-launch whole-codebase audit

**Run 22 Aug 2026, from `main` at `18acf40`. Branch `audit/pre-launch-codebase`.**
Item 5 of the pre-MVP triage order, registered in `docs/build-notes.md` §8
("Pre-launch whole-codebase audit," added 11 Aug 2026, triage round two follow-on).

---

## The charter

**Settled before the sweep, do not relitigate.** This is a read-only pass: nothing in
`src/`, `prisma/`, `scripts/`, `evals/`, or config is edited, and every finding becomes
its own decision afterwards rather than an in-audit fix. It exists as its own step because
per-slice review only ever sees a diff, and this is the one pass that reads the repo whole,
the way an engineer evaluating the work will. Seven lanes cover it, findings are verified
adversarially before they reach the owner, and everything found is written down while only
findings that can name a product consequence ask for the owner's attention.

**Not in this audit.** No fixes (each becomes its own decision, or its own micro-PR).
No eval-bench runs, `eval:detect` and `eval:onboarding` cost money and hit the network, and
their numbers are current in the record; a bench run becomes a post-audit decision if lane 3
finds a prompt disagreeing with the code. No dev server, no migrations, no seeds. No design
re-litigation: `docs/design/design-polish-rd-2/` remains the build source and recorded
decisions win over the walkthrough screens.

**How it is verified.** Test baseline recorded before anything: **92 files / 935 tests
green, 73.5s**, matching the finishing number of the polish-slice-three entry, with no
pre-existing failure to carry. `npm run db:which` printed the dev-test ref
(`pxbewardwvoyqqcvogel`) on all three sources before the suite ran, its only database touch.
Every finding is anchored to `file:line` and refuted by an independent verifier before it is
reported; `fix-now` findings face three verifiers with different lenses. A file-coverage
ledger names anything nobody opened.

**Debt this audit is expected to open.** A findings list is not a fix list: the audit's own
output is a queue the owner has to triage, and the register grows before it shrinks.

---

## The seven lanes

Ordered by what a finding in that lane costs, not by execution order.

1. **Can the product be wrong about who is in?** The counting and state machines: RSVP rows,
   gauge tallies, proposal consensus arithmetic, promotion paths, the hourly cron sweep,
   transaction boundaries, concurrent-write races. First because CLAUDE.md states RSVP
   accuracy is the entire value of the product.
2. **Can someone see or do what they shouldn't?** Every read and write path against the
   membership wall, invite-token lifecycle, the cron secret, id-guessing across group
   boundaries, whether an email can leave the server in any payload, what a removed
   member's stale tab can still fire.
3. **Does Orbit do what we have written down that it does?** The "where Orbit decides to
   speak or stay quiet" register checked against actual code, prompt prose versus code
   rules (the 29 July bug class), whether every consumer reads through `normalize.ts`, and
   every path that fails toward silence.
4. **Does the code still obey the product's own rules?** The invariant sweep in the shared
   brief. Structurally the thing per-slice review cannot do.
5. **Would the tests catch a regression?** 935 tests read for tests that cannot fail,
   reliance on ambient rows, and coverage holes measured against claimed behaviors.
6. **What breaks or costs money the day it is live?** Model-call failure handling,
   connection behavior under Vercel, unbounded and N+1 queries, `vercel.json`, build and
   env config, and the §11 pre-deploy checklist checked against the repo.
7. **What does an engineer think reading this cold?** Dead code, duplicated logic, the
   slice-specific QA-stage scripts, docs-versus-reality drift, README and AGENTS.md accuracy.

## Shape of the sweep

Prep (suppression list, invariant list, file ledger) → seven lane readers in parallel →
a second finder round on lanes 1, 2 and 3 told to find what round one missed, repeating
until a round returns nothing new → per-finding adversarial verification, three lenses for
anything rated `fix-now` → dedup against the suppression list → synthesis → a completeness
critic asking what was never read and which claim went unchecked.

Each lane writes its findings to `docs/audits/findings/` as it goes rather than at the end,
so a run that dies partway leaves its work behind.

---

## Findings

*99 raw findings from seven lanes. 24 refuted by adversarial verification and dropped.
75 survived; deduplicated to 48, with eight defects found independently by more than one
lane. Everything already on the suppression list was cut silently.*
Ranked by what each costs, most severe first. Forty-eight findings, deduplicated across the seven lanes: eight defects were found by more than one lane and appear once here, with the lanes named. Everything already on the suppression list has been cut silently. One finding is marked UNVERIFIED.

---

### Fix before deploy

**1. Without two Supabase settings that appear nowhere on the pre-deploy checklist, every page of the site fails on the first request.**
- `docs/build-notes.md:342` (the eleven-item checklist), against `src/lib/supabase/env.ts:4`
- Cost: the checklist reads as complete, the deploy goes green, and the site is entirely down. The two values are also inlined at build time, so they must be set in Vercel before the build runs, not just before the first visitor. The error names the missing setting, so diagnosis is fast once someone looks.
- Do: add both variable names, and the "set before the build" note, as their own checklist item.

**2. Nothing tells the owner to switch on anonymous sign-in in the production Supabase project, and without it nobody can create or join a group.**
- `docs/build-notes.md:338`, against `src/app/actions/create-group.ts:70` and `src/app/actions/join-group.ts:38`
- Cost: every identity in the product starts as an anonymous session, and both doors mint one. Production is a different Supabase project from the one everything was built against, and this is a dashboard switch that does not carry over. If it is off, the founder finishes the whole wizard and gets "Could not create a session. Please try again." forever, and so does everyone who opens the invite link. The message points at nothing.
- Do: add "turn on anonymous sign-ins in the production Supabase project" to the checklist.

**3. The invite link, the only key to a group, is generated by a non-random id generator, while the "Reset link" button correctly uses a cryptographic one.**
- `prisma/schema.prisma:52`, against `src/lib/groups/reset-invite.ts:16`
- Cost: the link is the whole credential (name, roster, schedule, meeting address, and one tap into the feed). Most of it is a timestamp plus a machine fingerprint, with only a short ordinary-random tail. Guessing a specific group's link is still expensive work rather than a casual stumble, so this is a missing guarantee, not an open door. It rates fix-now on timing: it is a one-line change now, and after launch it means rotating every group's link out from under its members. The repo's own two files already disagree in writing about this, in a codebase an investor will read.
- Do: change the schema default to a cryptographic random value and add the migration before the first real link exists.

---

### Queue

**4. One bad group can stop everything Orbit does on a schedule, for every group, for that hour.**
- `src/lib/orbit/reconcile.ts:130`, reached from `src/app/api/cron/orbit/route.ts:50`
- Cost: the hourly job does three things in order, and the first one stops the whole run on any unexpected database error in any single group. That group and every group after it misses its recurring plan, and the other two jobs (last calls, idea goodbyes, stalled time-change closures) do not run at all. A one-off glitch costs an hour and heals itself. A fault that repeats on the same group keeps Orbit's scheduled behaviour switched off until somebody notices, with only a failed cron run to show for it. Both other sweeps already survive a bad row and carry on; this one, which runs first, does not.
- Do: wrap the per-group work in the same try/catch the two sibling sweeps already use.
- Found by lanes 1, 3 and 6. Lane 6 rated it fix-now and one verifier upheld that; two verifiers argued queue because no repeating trigger is reachable today. The fix is one line, so it is cheap to take before deploy either way.

**5. A group whose standing plan is on two days a week only ever has one of them on the calendar, and the second appears while the first is already happening.**
- `src/lib/events/upcoming-list.ts:38`, with `src/lib/orbit/reconcile.ts:76`
- Cost: for a Mondays-and-Wednesdays group, Wednesday's plan does not exist while Monday's is still ahead: nobody can RSVP, add it to a calendar, or see it on the group home. It is created and announced within the hour after Monday's meeting has already started. A Saturday-and-Sunday group gets under a day's notice for the Sunday, every week. Harmless for a single-day group, which is why it went unnoticed.
- Do: let the scheduler hold more than one upcoming occurrence per rhythm.

**6. For a group anywhere from New Zealand eastwards, Orbit skips the meeting happening today and schedules the next one a week out.**
- `src/lib/orbit/occurrence.ts:133`
- Cost: at UTC+12 or further east (New Zealand year-round, Fiji, Samoa, Kiribati, Kamchatka) the calendar walk starts on tomorrow instead of today. A founder in Auckland finishing onboarding on a Saturday morning for a Saturdays group is shown their first plan seven days away, and that morning's meeting is never created: no RSVP, no announcement, no recovery, because the hourly job then sees the group as already scheduled. Every zone west of UTC+12 is correct, which includes the owner, the demo, and the first shared link.
- Do: anchor the day scan to the group's own local date rather than to UTC noon.
- Found by lanes 1 and 3.

**7. If creating the plan fails at the third yes, nothing tries again, and Orbit later tells the group the idea did not come together.**
- `src/app/actions/gauge-vote.ts:119`, with `src/lib/orbit/endgame.ts:260`
- Cost: the one attempt to turn three yeses into a real plan is best-effort. If it hits a database hiccup the idea sits at three yeses with no plan, the hourly sweep recognises the state and deliberately leaves it alone, and at close Orbit posts "Beers didn't come together this time" to three people who all said yes. It heals only by luck, if somebody happens to tap yes again before it closes. The same shape exists on the time-change vote.
- Do: let the hourly sweep retry a gauge sitting at the bar with no event behind it.
- Found by lanes 1, 3 and 6.

**8. A time-change vote that reaches its bar because somebody dropped out, or left the group, is never re-checked and lapses instead of passing.**
- `src/app/actions/proposal-vote.ts:114`, with `src/lib/proposals/consensus.ts:44`
- Cost: the bar depends on two moving numbers (yeses, and how many are still coming at the old time), but only a new yes ever re-checks it. A vote sitting one short, followed by an "I can't make it" or someone leaving, now satisfies the arithmetic, and nothing notices. Hours later Orbit closes it with "the time change didn't come together." Nobody is misled about the outcome; the change the group's own numbers supported just quietly never happens, and the asker has to start again.
- Do: re-check the bar when an RSVP changes or a membership ends, not only on a new yes.

**9. Orbit is shown the three soonest plans while the group sees five, so a request about a later plan is answered about the wrong one, or not at all.**
- `src/app/actions/detect-intent.ts:90`, against `src/lib/cards/region.ts:8`
- Cost: the card region shows up to five plans. A member asking to move the fourth or fifth cannot be answered correctly. The likely outcome is Orbit asking "which plan?" and listing three that exclude the one they were looking at, which reads as Orbit unable to see the group's own calendar. The worse outcome, gated behind a real three-yes vote, is a plan nobody asked about being moved and every RSVP on it resetting. The code comment still claims the two numbers match; they stopped matching on 12 August.
- Do: feed detection the same cap the card region uses.
- Found by lanes 1 and 3.

**10. Someone removed from a group and let back in brings their old answers with them, and can push an idea to three yeses that never becomes a plan.**
- `src/lib/groups/remove-member.ts:40`, with `src/lib/groups/join.ts:52`
- Cost: removal deletes only the membership row, so old RSVPs and votes survive. Rejoining through the same link (the documented way back in) makes them count again with nobody answering anything: the group sees the returning member as coming to every future plan they had previously answered. Sharper still, their old yes on a live idea starts counting again and nothing re-checks the bar on a join, so the idea can show three in, never create a plan, and get the goodbye in front of the three people it says are in. No trace in the logs, because no attempt was ever made.
- Do: on rejoin, either clear the stale rows or re-check any live gauge's bar.

**11. A member's answer to Orbit's "what day works?" can open a plan for a different activity and count that member in on it.**
- `src/lib/gauges/open-ask.ts:54`, with `src/app/actions/detect-intent.ts:185`
- Cost: when two ideas have both stalled on their day, Orbit asks two questions in chat and only the newer one can be answered. A member answering the older one gets a brand-new card for the other activity with them recorded as a yes. Two more yeses turns it into a real event with them RSVP'd. Undoable by tapping a chip, and the activity is one the group did want, so the harm is a confusing card and one wrong vote. Meanwhile the older question is unanswerable by anyone until the newer one's window shuts.
- Do: carry the activity through the answer so it attaches to the question actually being answered.

**12. The join form tells the server whether the visitor already has an account, and the server believes it, so a person can end up in the group with no name at all.**
- `src/app/actions/join-group.ts:26`, with `src/app/join/[inviteToken]/JoinForm.tsx:253`
- Cost: if the session lapses between opening the join screen and tapping Join, the server skips the "your name is required" check, creates a blank account, and puts them in the group. The chat shows a bare " joined", the roster carries a nameless person, and they count toward every three-yes bar. Nothing in the product can fix it afterwards: no path anywhere renames a user, and re-opening the invite link reuses the same blank account.
- Do: re-check the session server-side instead of trusting the hidden field.

**13. A chat message has no length limit, and every long one is re-sent to the paid AI on the next nineteen sends.**
- `src/app/actions/send-message.ts:48`, with `src/lib/orbit/fetch-window.ts:19`
- Cost: a member pasting an article or an email thread into chat has that text stored uncapped and then included in Orbit's reading window for the following nineteen messages. The billing cost is real but small. The sharper risk is a message long enough to blow the model's input limit, which would make Orbit's reading fail outright for that stretch, so the group silently loses its coordinator. The same field's siblings (the founder's description, the gap answer) are all capped.
- Do: cap the message body the way the onboarding fields already are.

**14. The group home loads every message the group has ever sent, on every render, and again on every send.**
- `src/app/groups/[id]/page.tsx:101`
- Cost: opening a group ships its entire chat history to the phone, however long it is, and sending a message does it again. A young group will not notice; a group chatting for a few months gets slower every week on the interaction people use most, and the person who notices first is on a weak signal. It also costs money in database egress and function time, growing with conversation length rather than with usage.
- Do: load a recent window with paging, the way Orbit's own reading window already does.

**15. A person joining through an invite link can put any amount of text into their name, and it lands permanently in someone else's group.**
- `src/app/actions/join-group.ts:20`; the founder's edited group name has the same gap at `src/app/actions/create-group.ts:41`
- Cost: the name is stored exactly as typed, with no limit in the form, the server, or the database. It then appears in the join line, the roster, the group info page, and inside Orbit messages that are written into the feed forever. The founder's only recourse is removal; nobody can correct a name. Reaching it requires holding the invite link, so this is carelessness or griefing inside an invited group, not an open door.
- Do: cap both fields at the same place the group name is already capped.
- Found by lanes 2 and 3.

**16. The product cannot tell "you are not signed in" from "we could not reach the sign-in service", and it always guesses the first.**
- `src/lib/auth/current-user.ts:14` (and ten other call sites)
- Cost: during a sign-in service blip a real member is shown the invite-only wall on their own group, which self-heals on refresh. On the write side, one failing request immediately followed by a succeeding one creates the person a second identity: a founder would create a duplicate group, and a member would rejoin as a stranger, with no way back except their saved invite link. That needs a narrow window, but the outcome is unrecoverable.
- Do: read the error the sign-in library already returns and treat a service failure differently from being signed out.

**17. Onboarding asks the founder for their name, then throws the answer away if they already have an account.**
- `src/lib/groups/provision.ts:49`
- Cost: someone who joined a friend's group as "Jake" and then starts their own family group as "Jacob Rios" appears to every member of the new group as "Jake", on the roster and every RSVP list, permanently. The join screen handles this honestly (it shows "Joining as Sam" instead of a name field); onboarding shows the empty field to everyone and discards what they type. Reaching it means typing /create as an existing member, so it is less likely on the first shared link than it looks.
- Do: either update the stored name or show the founder the name they will actually appear under.

**18. A live idea silently swallows a member's "Sunday works better" whenever Orbit's reading of the activity differs even slightly from how the idea is stored.**
- `src/lib/orbit/day-comment-plan.ts:55`
- Cost: if the model returns "beer" for a "beers" idea, the comment is dropped: no reply, no recorded vote, and the better day is not remembered, so the idea may miss the bar that would have triggered the "what day works better?" retry. The member can still tap a chip, so nothing is mis-recorded. How often the model paraphrases is unmeasured. The narrower certain defect: when exactly one idea is being voted on, a near-miss name should attach to it, which the slice's own spec says and the code does not do.
- Do: fall back to the single live idea when there is only one, as the spec intended.

**19. Answering Orbit's own question with a day or hour that has already passed gets total silence.**
- `src/app/actions/detect-intent.ts:179`, with `src/lib/orbit/spark-copy.ts:398`; second silent exit at `:163`
- Cost: a member replying "Friday?" on a Friday evening, after the carried 7pm has gone, gets nothing at all. This is silence directly after Orbit asked that person a question, which is the exact behaviour the never-leave-a-direct-ask-hanging rule exists to prevent. Neither this exit nor its sibling (something with the same activity already on the calendar) appears in the project's register of where Orbit speaks or stays quiet, though the spark path lists both.
- Do: say something short instead of nothing, and add both rows to the register.
- Found by lanes 3 and 4.

**20. When Orbit cannot read a chat message, the member is told about it in only one of five failure modes.**
- `src/lib/orbit/extract.ts:118`, sinking at `src/app/actions/detect-intent.ts:373`
- Cost: the two common failures (out of credits, service down) are covered by the honest "Orbit might miss ideas" line. A refusal, an oversized or unreadable request, unparsable output, or any unexpected error during detection all produce complete silence, which looks identical to Orbit deciding the message was not a request, so somebody who asked to move a plan has no reason to try again. Onboarding shows the founder something for all five.
- Do: route the remaining four to the honest line that already exists.

**21. Two people answering in the same moment can leave one of them saying yes while the plan shows them as not having replied.**
- `src/lib/gauges/promote.ts:57`; same shape at `src/lib/proposals/promote.ts:31`
- Cost: at the instant the third yes creates the plan, one of two simultaneous voters can end up with their yes on the idea and no answer on the plan it became: the card shows them as not replied, counts are short by one, and they are asked something they already answered. On the time-change side it is worse, because Orbit announces "I marked everyone who said yes as in" and for that person it is not true. Nothing is logged. Needs a sub-second collision, so it is rare.
- Do: carry the losing vote into an RSVP when the promotion is already done.

**22. Two people asking to move the same plan in the same instant can open two competing votes, and the plan's own screen shows only one.**
- `src/lib/proposals/create.ts:130`
- Cost: the group gets two time-change questions about one plan in chat, each with chips, and the answers split so neither reaches its bar. A member who answered the second sees no trace of their vote on the plan's screen, though their chip still shows in chat. The plan never moves to a wrong time and the state clears itself, either by one passing or by two near-identical "it's staying at 7pm" lines. The window is milliseconds after two independent model calls.
- Do: back the one-live-vote-per-plan rule with a database constraint, as every sibling rule already is.

**23. Opening a time-change vote in one group silently cancels the same person's open vote in a different group.**
- `src/lib/proposals/create.ts:118`
- Cost: a person in two groups with a live time-change ask in each has the earlier one silently cancelled. Orbit's question stays in the first group's chat with its chips gone, the votes cast stop counting, the plan never moves, and nobody is told. Only that person's own asks are affected, and reaching it takes running two groups at once, which the MVP gives no in-app way to do.
- Do: add the group filter; the column and its index already exist.

**24. Orbit's reply to a "Sunday works better" comment can be written onto an idea that became a real plan seconds earlier.**
- `src/app/actions/detect-intent.ts:224`
- Cost: the one thing Orbit does on an inference is also the only write in that action that never re-checks whether it still makes sense. If a third yes lands during the second or two Orbit spends reading the comment, the group sees Orbit announce the plan and then, right below, say the noted day is kept "in case this one doesn't come together." In one of the two orderings the commenter is also left showing as not having replied. Rare, needing two members acting inside one model call.
- Do: re-check the idea is still open before writing, as the four sibling writes do.

**25. Orbit's one retry guess has a four-hour window to fire and is lost silently if the hourly job misses it.**
- `src/lib/orbit/endgame.ts:400`
- Cost: a day-blocked idea nobody answered earns exactly one guess the next evening, and it is only eligible across four or five specific hourly runs. A deploy window, a brief outage, or a slow run drops that last chance with no record anywhere and no way to notice. The members did already get Orbit's question, so the idea does not end in silence; only the follow-up is lost. The file's own comment claims the window tolerates "a long outage," which the arithmetic does not support.
- Do: widen the window so the guess can still fire the following day.

**26. In three timezones, one day a year, a plan is booked for the day before the one the member asked for.**
- `src/lib/orbit/spark-copy.ts:203`
- Cost: the product stores "which day an idea is for" as midnight in the group's timezone, and in a few places the clocks jump forward at exactly midnight, so that moment does not exist and the stored value lands on the previous day. In those groups, on that date, "climbing Sunday?" gets Orbit proposing Saturday, chips saying Saturday, and a real Saturday event. Measured across all 418 zones for 2026: Havana (8 Mar), Santiago (6 Sep), Azores (29 Mar). Chile is the only one with a plausible user base. The product stays internally consistent, so a member can see and correct it.
- Do: use midday rather than midnight as the day anchor for these stored dates.

**27. The guard that stops Orbit renaming a founder's activity mid-conversation switches off if the model lists the same days in a different order.**
- `src/lib/orbit/gap.ts:140`
- Cost: the guard exists because "climbing" once drifted to "climb" in front of a founder. It compares day lists as ordered lists, so "Mon and Wed" against "Wed and Mon" reads as a different schedule and the guard steps aside, which also costs the captured meeting spot, since the venue guard matches on the activity word. It needs two unusual model behaviours in one reply, and the founder does see the result on the confirm card before anything is written. Worth taking because the fix is one line with no downside.
- Do: compare the two day lists as sets.

**28. If an onboarding call dies in transit rather than failing cleanly, the founder loses the wizard and everything they typed.**
- `src/app/create/OnboardingWizard.tsx:120`
- Cost: the two slowest calls in the product have no handling for the trip itself failing (going offline in the beat after tapping Continue). The likely outcome is the whole wizard replaced by the broken-page screen, taking the description, the name, the rhythms and the venue with it; the milder one is the button simply stopping with no explanation. The group chat has exactly this guard, with a comment explaining why.
- Do: add the same one-line guard the chat already uses.

**29. The AI client is created with no time limit, so a slow model can replace Orbit's honest "can't think right now" screen with a raw platform error.**
- `src/lib/orbit/extract.ts:97`
- Cost: the shipped default wait is ten minutes. A hung call outlives the hosting platform's own request limit, so the founder gets a generic platform error page during first-time onboarding instead of the designed one. The same unbounded wait sits behind every Orbit call in chat, holding a paid function open. Retries are not part of the problem; an overload spell is retried in seconds and then surfaces correctly.
- Do: set a timeout on the client.

**30. The hourly job sets no time limit of its own, and its work grows with the number of groups.**
- `src/app/api/cron/orbit/route.ts:23`
- Cost: the three sweeps run one after another with nothing bounding how much each takes on, so the hosting platform's default cut-off decides. Today, with a handful of groups and no AI calls on these paths, it finishes well inside the budget; it would take hundreds of groups to get close. If it were ever cut off, the two closing sweeps pick up next hour, but the recurring-plan pass re-checks every group every hour, so the same groups at the end of the list would keep missing their next plan, with nothing in the job's report saying so.
- Do: bound the per-run work rather than only raising the ceiling.

**31. On the group home nothing can shrink except the chat, and the page cannot scroll, so at large device text the conversation can be squeezed to nothing.**
- `src/app/groups/[id]/page.tsx:216`
- Cost: the cards, the header and the message box all keep every pixel they need and the conversation gets what is left, which can be zero, with no way to scroll to it. The message box stays usable, so a member can still send. Ordinary browser zoom does not trigger it; a phone's text-size accessibility setting does, and on the measured 661px screen the card region would need to roughly double. The project's own rule says layout grows with content and never clips.
- Do: cap the card region's height so the feed always keeps a floor.

**32. The "TIME CHANGE" heading on the event screen renders at 2.89:1, far below the readable floor.**
- `src/app/events/[id]/ProposalSection.tsx:33`
- Cost: on a phone in daylight the label above the vote is likely to wash out, so the block loses the heading that names what it is. Nobody votes unaware, because the sentence under it and both chips are at full contrast. The same screen's roster heading directly below uses the brighter token the rest of the product uses, and the project already refused this exact pairing elsewhere with a comment explaining why.
- Do: use the secondary text token, matching every other eyebrow in the product.

**33. The front door's "Already invited?" line, the only instruction for an invited visitor, renders at 3.77:1.**
- `src/app/page.tsx:163`
- Cost: the smallest size in the dimmest grey, below the floor the product enforced elsewhere. It mostly costs the rare visitor who types the address rather than tapping their link, since people with a link land on the join screen. Someone who misses it may create an empty group they did not want, though they can still open their invite link afterwards.
- Do: same fix as above.

**34. Orbit's own week-later guess asks the group to vote without ever saying what a vote does.**
- `src/lib/orbit/spark-copy.ts:324`
- Cost: "No takers on a new day yet, so how about beers next Saturday?" posts with three chips and nothing anywhere stating that three yeses is what makes it happen. Every other idea Orbit opens says so in its own message, and the card's countdown only appears once exactly two people are in, so at zero or one yes the bar is stated nowhere in the product. This is Orbit's last attempt to save that idea.
- Do: add the same "if three are in" clause the other two openers carry.

**35. Orbit says the same thing two different ways on two identical controls, and the longer one is the shape the 17 August copy pass deleted.**
- `src/lib/orbit/spark-copy.ts:300`
- Cost: a revived idea reads "...Anyone in for beers this Sunday? If three of you are in, I'll set it up," while the original it is reviving sits in the same feed with the shortened wording. One extra rendered row in chat and a visible voice inconsistency. This is already known: the 17 August pass named this exact function as out of its lane and sent it to the owner as an open question that was never answered.
- Do: answer the open question and apply it; the decision is what is missing, not the discovery.

**36. The days a founder gave are shown back to them in whatever order the model happened to return.**
- `src/lib/orbit/playback.ts:31`
- Cost: nothing sorts the days into week order on the one screen whose job is proving Orbit understood, and whatever order arrives is frozen into the group forever and re-read by every invited stranger on the join screen. Scheduling is unaffected; this is display only. Whether the model actually returns them out of order was not measured.
- Do: sort before rendering.

**37. Nothing stops a founder's or a member's own words from carrying an em-dash into Orbit's mouth, or from being arbitrarily long.**
- `src/lib/orbit/rhythm.ts:50` and `src/lib/orbit/normalize.ts:71`
- Cost: the activity name is in nearly every sentence Orbit says about an idea, and becomes the event title and the calendar entry, but it is only trimmed. The product already strips dashes from the one other model-written string a founder sees and rejects Orbit's generated questions outright if they contain one. Nothing carries a dash today; the gap is that nothing stops it. Separately, the activity is the one founder-facing field with no length limit at all, on a screen whose height the owner fought for.
- Do: run it through the same clean-and-cap the group name already gets.

**38. The recognition bench contains no case at all for the behaviour the product is built around: someone floating an idea.**
- `evals/detect/cases.ts:36`
- Cost: all fifteen must-recognise cases are change, answer or day-comment cases. A prompt or model change that stopped Orbit opening an idea on "we should finally grab beers" would leave the whole bench green. This is already recorded as debt in the build notes; what is new is that the model-eval register labels intent recognition "Healthy" on the strength of these cases without noting that the central behaviour is measured by none of them.
- Do: add spark cases, or correct the register so it does not overclaim.

**39. The four bench cases meant to prove Orbit answers a day comment stop one step before the code that decides whether it answers.**
- `evals/detect/run.ts:126`
- Cost: the bench grades whether Orbit understood the message, not what the member ends up seeing. Production takes four more decisions after that point, one of which depends on the model (the activity name matching the idea being voted on), and the bench throws that name away. So all four cases can read a clean 5/5 on runs where a real member would get silence. The one case carrying a stated time never checks the time.
- Do: run these cases through the real planner, as the change cases already do.

**40. The bench's flagship regression case rebuilds the failure using words Orbit does not say and a sequence the product can no longer produce.**
- `evals/detect/cases.ts:99`
- Cost: the case reproducing the 29 July "direct ask met with silence" bug works by showing the model the conversation Orbit just had, and on the change cases those lines are hand-written. The real announcement ends by inviting a member to ask for the old time back, which the fixture drops; one case shows an exchange the product cannot produce any more; and a must-stay-quiet case quotes wording retired in the August copy pass. The messages being classified are fine, so the bench is not broken; the claim that its number describes real conversations is weakened. The gauge cases in the same file quote Orbit's real copy word for word.
- Do: build the history lines from the same copy functions the product uses.

**41. The register of every place Orbit speaks or stays quiet is missing one real decision.**
- `src/lib/orbit/endgame.ts:500`
- Cost: a day-blocked idea somebody gave a better day for is silently not revived when a same-activity idea is already live, and the register's line for that path says Orbit speaks "one message either way," which is now untrue. The next person tuning how eager Orbit is reads a line that says it always speaks where it sometimes says nothing. This register is the artifact the 29 July bug proved load-bearing.
- Do: add the row.

**42. Eleven of the thirteen button handlers are replaced by stand-ins in every test and executed by none.**
- `src/app/actions/proposal-answer.ts:68`, with `src/app/actions/proposal-vote.ts:82`
- Cost: narrower than it sounds, because for votes, RSVPs, messages, leaving and removals the rule that has to hold is enforced inside the database transaction underneath, and those are tested. Four pieces are genuinely unprotected: only-the-asker-may-answer, the members-only check on a group time-change vote (the one write with no library guard beneath it), the group-of-one shortcut, and the members-only check before Orbit reads a message. A future change to any of those breaks quietly.
- Do: add tests for those four; the repo already executes server actions in two places, so the harness exists.

**43. "The completeness gate is the only door to group creation" is a stated always-true rule with no test behind it.**
- `src/app/actions/create-group.ts:51`
- Cost: four lines in one file hold the rule that a group can never exist without a real schedule, and nothing would notice if they changed. Nothing is broken for a founder today. If it did change, a founder could finish onboarding into a group with no schedule: no first event and nothing for the hourly job to work from, so the recurring rhythm that is the group's whole premise never fires.
- Do: one test that a payload with no valid rhythm is refused.

**44. The hourly job, as production actually runs it, is exercised by no test at all.**
- `src/app/api/cron/orbit/route.ts:26`
- Cost: the recurring plan appearing every week, an idea getting its last call, and a stalled vote finally closing all ride on one job nothing tests. Every existing sweep test passes a single-group scope that production never passes, so the unscoped branch is the production branch and the one branch no test enters. The check that only the scheduler may call it reads correctly today, but nothing pins it, so a future edit could lock the job out or loosen the door unnoticed.
- Do: test the handler's three-sweep arrangement and its auth check.

**45. The members-only wall is written out three times by hand and no test protects any of the three. UNVERIFIED.**
- `src/app/groups/[id]/page.tsx:70`, plus `src/app/events/[id]/page.tsx:53` and `src/app/groups/[id]/info/page.tsx:52`
- Cost: "a group is invite-only" is the promise that stops a stranger holding a URL from reading a group's chat, roster and plans, and on three of the four surfaces it is kept by a hand-copied line with nothing checking it. A refactor touching any one page could open a group's chat and leave the suite green. The fourth surface (the calendar file) proves it is testable with what the repo already has.
- Do: a test per page, or one shared helper. **This finding is the one item every verifier failed to return on, so it is reported as the lane wrote it and has not been independently checked.**

**46. The onboarding wizard's whole flow is orchestrated by one piece no test touches.**
- `src/app/create/OnboardingWizard.tsx:39`
- Cost: creating a group is the first thing anyone does and the investor's first click. The exposure is narrower than it sounds: the question loop cannot run away and confirm cannot fire twice, both guarded elsewhere. What is unprotected is the hand-off of what the founder typed between steps (description, group name, meeting spot) and the recovery routes after a failure. Every future onboarding change needs a manual walkthrough to be trusted. Already recorded in the build notes as low debt.
- Do: test the state hand-off between steps.

**47. The checklist's connection-pooling fix does nothing, because the database driver this project switched to never reads that setting.**
- `docs/build-notes.md:350`
- Cost: item 3 tells the owner to add a setting the driver ignores, so following it exactly leaves the pool cap at the driver's default of ten per function instance. The cost is a false tick: the owner believes a protection is in place that is not, and the item that would apply it is nowhere on the list. Actual outage risk is low, because production traffic goes through Supabase's pooler and a demo will not come close.
- Do: change the item to name the setting the driver actually reads.

**48. The checklist's "add prisma generate to the build" item does not mention that the generate step itself needs a database variable, so doing exactly what it says still fails the build.**
- `docs/build-notes.md:346`, against `prisma.config.ts:9`
- Cost: a failed first deploy over something the project already knows and wrote down in its own README. The error names the missing setting, so the stumble is short rather than mysterious.
- Do: add the variable to that checklist item.

**49. Nothing on the checklist says to put the app and the database in the same part of the world.**
- `docs/build-notes.md:339`
- Cost: a one-time setting, free to get right now and awkward to change later. The product's writes are chatty (passing a time-change vote holds about a dozen round trips inside one all-or-nothing block with a five-second ceiling), so the further apart they are, the more of that budget every write spends. Nobody's vote is lost if it ran out; the member who cast the deciding yes would just see the plan not move.
- Do: add one line naming the region for both projects.

**50. Four of the ten QA staging scripts have no database guard at all, and one was written after its own plan asked for one.**
- `scripts/qa-stage-endgame.ts:17`
- Cost: six of the ten refuse to run unless the database is confirmed to be dev-test. Four do not check, and would write invented members, fake chat and fake events into whatever database the settings file points at. Nothing can go wrong today because production does not exist. Once it does and the settings file gets repointed for a deploy, an old script rerun out of habit becomes a way to put fabricated people into a real group, which is the one mistake this project has written down as unrecoverable. Worth knowing: the plan for one of the four told the implementer to copy the guard from another of the four, which had none.
- Do: add the guard to all four, and put it on the pre-deploy checklist.

**51. `npm run lint`, one of two commands the README tells a stranger to run, can never pass.**
- `eslint.config.mjs:9`, with `README.md:133`
- Cost: thirteen of the fifteen errors come from vendored design-handoff files that are not part of the running product and will never be fixed, leaving two real ones in product code buried in that noise. The team has been working around this by remembering "fifteen is normal" and watching the number, which has genuinely caught things, so the check is not dead; it now depends on somebody recalling a count from a build log, and it can never gate a bad change automatically. In a repo whose purpose is to be read by evaluating engineers, its own quality gate reads red.
- Do: add the design folder to the ignore list. The two real ones are worth leaving: one is a deliberate, documented choice and the other is a cosmetic apostrophe.

**52. The README is out of date in three places, including a "Next up" pointing at work that shipped eighteen days ago.**
- `README.md:84`, `:111`, `:80` and `:107`
- Cost: the first document a stranger reads says the next piece of work is the one-bump resurface (shipped 4 August), that a visual polish pass is pending and scaffolding defaults are still in place (three polish slices landed since), that the suite is 517 tests across 38 files (it is 935 across 92), and that the recurring job runs daily (it is hourly). For a repo whose whole argument is process rigour, the README is arguing against the code and undersells the testing work by nearly half.
- Do: rewrite the "Where it stands" and "Testing" lines; the same "daily" wording is also in `.env.example` and a comment in `reconcile.ts`.

**53. CLAUDE.md states an eval-bench reading as "current" that its own later paragraph contradicts.**
- `CLAUDE.md:31`, against `CLAUDE.md:59`
- Cost: this file loads at the start of every session, so a stale number is carried by every future session and by the owner. It now gives two different answers to how many cases Orbit must recognise and what they score, and the one labelled "current" is the wrong one. The bench prints its own bucket counts when it runs, so this costs a confused reconciliation rather than a misread result.
- Do: correct line 31 to match the 19 August entry and the code.

**54. Neither README.md nor CLAUDE.md mentions the scripts folder at all.**
- `README.md:138`
- Cost: twenty files, about a tenth of the hand-written code, and neither document a stranger is pointed at says what it is. Ten look interchangeable from outside, though each stages a different slice's walkthrough and each carries a genuinely good header. A careful body of QA-staging work goes uncredited in a repo whose argument is process rigour.
- Do: a short `scripts/README.md` and one pointer line.

**55. A QA staging script still walks the reader through a screen element that was deleted ten days ago.**
- `scripts/qa-stage-pending.ts:239`
- Cost: its printed final step tells you to look for the pending strip, removed 12 August. The data it stages still shows up correctly as the cards that replaced it, so nobody is misled for long, but a QA pass gets wasted hunting for something that cannot appear. The sibling script shows the project's own convention is to annotate these headers when a slice removes what they describe.
- Do: update the instructions or mark the script historical.

**56. A leftover hook on two vote controls is kept alive only by its own tests.**
- `src/app/groups/[id]/GaugeChips.tsx:52`, with `src/app/groups/[id]/GroupProposalChips.tsx:39`
- Cost: nothing a member sees is wrong. On a close read, which this project expects, an engineer sees an extension point the live app has never used, left behind when the pending panel was deleted. One of the two components has no tests except the two hanging off that dead hook.
- Do: delete the callback and its four assertions.

**57. The same "turn an hour into 8pm" rule is written out twice in full and a third time in part.**
- `src/lib/orbit/spark-copy.ts:133`, with `src/lib/orbit/playback.ts:19` and `src/lib/events/format.ts:77`
- Cost: nothing is wrong today; all three agree on every hour, and all three have tests. If how times read ever changes (a 24-hour option, another language) the change has to land in each place or the onboarding screen, the chat and the event card start showing the same time differently, which erodes trust in a scheduling app. None of those changes is in MVP scope.
- Do: extract one shared formatter next time one of the three is touched.

---

### Declined (found, and the recommendation is to leave it)

**58. Orbit's mascot writes the brand green out by hand instead of reading the token holding the same value.** `src/components/OrbitMark.tsx:8`. The face is a shaded illustration built from three greens and only the middle one has a token, so wiring that one up would leave the highlight and shadow on the old colour: a worse result than the current all-stale mark. Nothing gets worse by never doing it.

**59. The rule for what Orbit calls a plan when it speaks is written out inline in five places.** `src/app/actions/detect-intent.ts:120` and four siblings. The rule has never changed, and every site is found by one search for the field name they all share. A small tidiness win, no consequence.

**60. The dev-test database identifier is copy-pasted into nine developer scripts.** `scripts/db-which.ts:21`. The shared safety logic itself is imported, not duplicated; only the identifier and a short stop-and-explain block repeat. A missed line would make that script refuse to run and name the mismatch, rather than touch the wrong database. Changing dev databases is a deliberate act after which the first run fails loudly.

**61. A dead branch in the message-handling path that the codebase already documented and never removed.** `src/lib/orbit/change-plan.ts:32`. The line cannot run. Deleting the leftover option is a two-line change that also makes the compiler point straight at it, so it is worth taking for free the next time anyone opens the file, and worth nothing as scheduled work.

---

## Coverage

**The ledger.** `docs/audits/findings/file-ledger.txt` names 265 files. The seven lanes read 196 of them. Everything in `src/app/`, `src/lib/`, `src/components/`, `evals/`, `scripts/`, the schema, and every config file was read, most of them by two or more lanes. Files read that are not on the ledger: `CLAUDE.md`, `docs/build-notes.md` (three sections in full, the rest by targeted search), `.claude/settings.json` and the four safety-net hooks with their tests, `docs/design/design-polish-rd-2/walkthrough.css` (targeted), `docs/superpowers/plans/2026-08-10-pending-surface.md` (one line), and four vendored library sources read to verify specific claims (`@prisma/adapter-pg`, `pg-pool`, `pg-connection-string`, `@supabase/auth-js`, `@anthropic-ai/sdk`, and the Next 16 ESLint doc).

**Not exhausted.** Lanes 1, 2 and 3 were still producing new findings when the three-round cap stopped them. Each of those lanes ran its full three rounds and each third round returned genuinely new material (F-1-14 through F-1-17, F-2-7 through F-2-9, F-3-20 through F-3-27). The sweep's design was to repeat until a round returned nothing new; that condition was never reached on those three lanes. **The counting and state machines, the access-and-exposure surface, and Orbit's behaviour against the register are covered but not exhausted, and a fourth round on any of them would likely find more.** Lanes 4, 5, 6 and 7 each ran once by design.

**Files on the ledger that no lane read: 69.** One config file, thirteen migrations, and fifty-five test files.

Config: `postcss.config.mjs`.

Migrations (the initial one was read; these thirteen were not, and lane 6 read only the directory listing against the checklist): `20260619004737_rsvp_index_and_default`, `20260624204419_add_message_and_event_start_index`, `20260626001346_add_group_timezone_and_unique_occurrence`, `20260721145651_add_group_description`, `20260723232850_add_spark_gauge`, `20260724232540_spark_event_creation`, `20260728032447_change_request_time`, `20260728234513_change_request_consensus`, `20260804145211_gauge_endgame_markers`, `20260804190626_wrong_day_retry_markers`, `20260810204408_gauge_day_suggestion`, `20260811150701_add_system_message_author`, `20260818190840_proposal_lapsed_answer` (all `/migration.sql`).

Test files not read line by line. **Important qualifier: all 92 test files went through lane 5's scripted survey (assertion presence, ambient-row reliance, skipped or exclusive tests, console spies, fixture-id randomness, self-referential expected values) and were searched for specific behaviours. What none of these 55 received is a human read of the body, so a subtle logical hole (a case that looks covered and is not) would not have been caught in them.**
`src/app/create/__tests__/Step1DescribeUnavailable.test.tsx`, `src/app/create/__tests__/Step3Share.test.tsx`, `src/app/events/[id]/__tests__/AddToCalendarButton.test.tsx`, `src/app/events/[id]/__tests__/ProposalSection.test.tsx`, `src/app/events/[id]/calendar.ics/__tests__/route.test.ts`, `src/app/groups/[id]/__tests__/CardRegionEmpty.test.tsx`, `src/app/groups/[id]/__tests__/CarouselRail.test.tsx`, `src/app/groups/[id]/__tests__/FeedSeam.test.tsx`, `src/app/groups/[id]/__tests__/GaugeChips.test.tsx`, `src/app/groups/[id]/__tests__/GroupHomeHeader.test.tsx`, `src/app/groups/[id]/__tests__/GroupProposalChips.test.tsx`, `src/app/groups/[id]/__tests__/OrbitDownNote.test.tsx`, `src/app/groups/[id]/__tests__/ProposalChips.test.tsx`, `src/app/groups/[id]/info/__tests__/LeaveGroupButton.test.tsx`, `src/app/groups/[id]/info/__tests__/ManageMembers.test.tsx`, `src/app/groups/[id]/info/__tests__/ResetInviteLink.test.tsx`, `src/lib/events/__tests__/create.test.ts`, `src/lib/events/__tests__/format.test.ts`, `src/lib/events/__tests__/ics.test.ts`, `src/lib/events/__tests__/move.test.ts`, `src/lib/events/__tests__/rsvp-membership.test.ts`, `src/lib/events/__tests__/upcoming.test.ts`, `src/lib/gauges/__tests__/day-comment.test.ts`, `src/lib/gauges/__tests__/gauges.test.ts`, `src/lib/gauges/__tests__/open-ask.test.ts`, `src/lib/gauges/__tests__/promote.test.ts`, `src/lib/gauges/__tests__/threshold.test.ts`, `src/lib/gauges/__tests__/vote-membership.test.ts`, `src/lib/groups/__tests__/join.test.ts`, `src/lib/groups/__tests__/leave.test.ts`, `src/lib/groups/__tests__/provision.test.ts`, `src/lib/groups/__tests__/remove-member.test.ts`, `src/lib/groups/__tests__/reset-invite.test.ts`, `src/lib/groups/__tests__/timezone.test.ts`, `src/lib/messages/__tests__/create-membership.test.ts`, `src/lib/messages/__tests__/create.test.ts`, `src/lib/orbit/__tests__/announce.test.ts`, `src/lib/orbit/__tests__/change-copy.test.ts`, `src/lib/orbit/__tests__/change-plan.test.ts`, `src/lib/orbit/__tests__/day-comment-plan.test.ts`, `src/lib/orbit/__tests__/endgame.test.ts`, `src/lib/orbit/__tests__/fetch-window.test.ts`, `src/lib/orbit/__tests__/gap.test.ts`, `src/lib/orbit/__tests__/merge.test.ts`, `src/lib/orbit/__tests__/model-errors.test.ts`, `src/lib/orbit/__tests__/occurrence.test.ts`, `src/lib/orbit/__tests__/playback.test.ts`, `src/lib/orbit/__tests__/reconcile.test.ts`, `src/lib/orbit/__tests__/rhythm.test.ts`, `src/lib/orbit/__tests__/spark-copy.test.ts`, `src/lib/orbit/__tests__/window.test.ts`, `src/lib/pending/__tests__/derive.test.ts`, `src/lib/proposals/__tests__/endgame.test.ts`, `src/lib/proposals/__tests__/promote.test.ts`, `src/lib/proposals/__tests__/proposals.test.ts`.

**Partial reads, declared.** `docs/build-notes.md` (603 KB) was read in three sections and searched elsewhere, never whole. `docs/superpowers/` (41 plans and specs) was opened at one line. `docs/walkthrough.html` was not opened: the project's own rules forbid grepping it and rendering it was out of scope for a read-only pass, so this audit makes no claim about mockup copy. `.claude/hooks/protect-paths.test.ts` was not read, though its companion QA script was.

**One piece of audit work was destroyed and is not recoverable.** During lane 2's second round, the round-one copy of `docs/audits/findings/lane-2-access-and-exposure.md` was overwritten by a truncating shell redirect. It was untracked, so there is no version to restore. Lost: the full write-up of the invite-token finding and the unauthenticated-model-call finding (both reconstructed here from the audit brief's summary and from re-verification, so the findings themselves survive), and four appendix items in their entirety. Recovering them means re-running lane 2's first round.

**Baseline evidence.** `npm test`: 92 files, 935 tests, all passing, 71 to 89 seconds across four runs. `npx tsc --noEmit`: clean, exit 0. `npm run lint`: 15 errors, 28 warnings, exit 1 (finding 51). `npm run db:which`: dev-test ref on all three sources, the audit's only database touch. No file under `src/`, `prisma/`, `scripts/`, `evals/` or config was modified.

---

## Appendix: real, no product consequence

Twenty-eight items the lanes verified and could not attach a cost to. Listed so nobody rediscovers them.

**Consistency and tidiness**
1. Two resolution writes are unconditional where their four siblings guard against a concurrent write. Both are asker-only questions with silent endings, so an overwrite changes nothing anyone sees. `src/app/actions/proposal-answer.ts:80`
2. `--surface-self`, defined as "the viewer's own bubble," also fills a chosen chip. The chip reads as the viewer's own answer, so nothing is wrong on screen; the token's one-line definition no longer covers all its uses. `src/components/choice.tsx:38`
3. One more hand-written colour where a token exists, distinct from the two registered ones. `src/app/create/Step2Playback.tsx:145`
4. The two message composers disagree on the text cursor's colour, though they share a send button and otherwise read as the same control. `src/app/groups/[id]/ChatInput.tsx:108`
5. Thirteen source files lack the header comment every other file has, including `src/proxy.ts`, the one filename in the tree whose purpose is not guessable from its name.
6. `spark-copy.ts` is 663 lines and its name covers about half of what it holds, including the product's central number (the three-vote bar). Placement is deliberate and documented.
7. `AGENTS.md` is 327 bytes of generic boilerplate, unchanged since the project was created, and says nothing about this project.
8. The README's setup steps run a migration without mentioning the sanctioned database check that CLAUDE.md calls mandatory before any migration.
9. The invite URL is assembled twice, three lines apart, on the same screen.
10. Seven byte-identical copies of `walkthrough.css` sit under `docs/design/`, and about thirty code comments cite it by line number without a directory. Not ambiguous yet, because all seven match.
11. `scripts/qa-protect-paths.sh` is a frozen historical demo of a fix merged on 3 August; nothing it checks can regress. Worth keeping and worth labelling.
12. Twenty-eight lint warnings alongside the fifteen errors, two of them in product files (an unused type import and an eslint directive that no longer suppresses anything).
13. Three more places still call the hourly job "daily": `.env.example:22`, `reconcile.ts:19`, and the cron route's header, which also claims there is no `.env.example` when there is.
14. The invite link's own text is truncated with an ellipsis on two screens. Deliberate and harmless; the share button carries the real value.
15. The calendar file's version number has one-minute resolution, so two time changes inside the same minute produce the same version. No realistic group moves a plan twice in sixty seconds.
16. `Event.previousStartsAt` is written on every move, read by nothing, and its schema comment states a premise the product has since disproved.
17. Both eval scripts exit successfully no matter how red the board is. Correct as designed (human-read, deliberately outside CI), worth knowing before anyone wires one into a gate.
18. The eval benches are outside the test runner by filename convention rather than by configuration. Holds today because nobody has named a file wrongly.
19. Orbit spells weekdays out in full in chat and abbreviates them on the chips and the announcement, sometimes in the same exchange. Both are deliberate somewhere.
20. The which-plan question chains "or" once a group has three plans; the good comma-list version already exists four files away.
21. `findOpenRetryAsk` runs one extra query per candidate row, bounded twice over to one or two in practice.
22. Four React test files render without cleanup and pass by luck of unique queries; every other React test file calls it, and one explains why.
23. `next.config.ts` pins a specific home LAN address for phone QA, dev-only, and its own comment already says so.

**Behaviour that is correct but worth knowing**
24. A day-blocked idea skipped because another idea for the same activity is live never gets any ending at all. Arguably right, and the alternative (a goodbye next to a live card for the same thing) is worse.
25. Orbit's last-call bump has the same four-hour firing window as the retry guess (finding 25). A missed last call costs one nudge rather than an idea's final chance.
26. A member told "Sunday's noted in case this one doesn't come together" is often noted and then nothing, because the revival needs the idea to also clear a bar the commenter cannot see. The copy is deliberately hedged.
27. Orbit declines a venue or day change before checking whether the group has any plans at all, so a brand-new group gets "I can't change the spot yet" about a plan that does not exist. Not a lie, and no better answer is available.
28. A stranger can tell a real group id from a made-up one by which refusal screen they get. The wall itself names nothing about the group, and group ids are published nowhere.

**Model cost, as a product fact rather than a defect.** One model call per member chat message, one per onboarding step plus at most two follow-ups, and zero per hourly cron tick (every scheduled string is composed in code). All on the cheapest model, roughly $0.004 per member message, about $4 per thousand. One lever deliberately not recommended: the same 2,500-token prefix is resent on every chat call with no caching, worth about 60% of per-message cost, which at this volume is single-digit dollars against a five-minute cache window and bursty group chat.

**Verified clean, recorded because absence of a finding is a result.** No id-guessing hole anywhere: every write resolves the row, re-derives the group from it, then checks membership, walked entry point by entry point. No email can leave the server in any payload, and the calendar file carries no attendee data. No secret can reach the browser: no `NEXT_PUBLIC_` variable holds one, and none of the eighteen logging calls in the codebase logs a token, key, message body or person's name. The AI library is kept out of every browser bundle. The invite token rotation genuinely destroys the old value. No page-not-found or redirect call sits inside a try/catch, the classic crash in this framework. No test in the suite lacks an assertion, computes its expected value from the function under test, reads unscoped from the database, or is skipped or marked exclusive. The safety-net hooks are the best-tested code in the repository.

---

## What could not be checked

**Nothing was run.** No dev server, no browser, no database write, no migration, no seed, no eval bench. Every finding is read from source, with three exceptions where a shipped function was executed in isolation to reproduce a claim (the timezone day-scan across all IANA zones, the daylight-saving midnight scan, and the time formatter across all 24 hours).

**Model behaviour is measured nowhere in this audit.** The benches cost money and hit the network, so they were not run, per the charter. Nine findings turn on what the model actually returns in a situation nothing benches: findings 9, 11, 18, 27, 36, 37, 38, 39 and 40. In every one of those the code path is certain and the frequency is unknown. Findings 38, 39 and 40 are specifically about the bench not being able to see these; a bench run is the natural post-audit decision.

**Nothing visual was rendered.** Every contrast ratio in findings 32 and 33 is computed from the token values in the stylesheet using the standard formula, not measured on a screen. Finding 31's squeeze is read from the layout rules; the exact text size at which the chat reaches zero height is unknown. All three should be confirmed on a real phone before acting.

**Concurrency was never exercised.** Findings 21, 22, 23 and 24 are races. The windows are read from the code and reasoned about, not reproduced. Confidence in each is about the code path, not about how often the window is hit.

**Platform behaviour is asserted from documentation, not observed.** The hosting platform's function time limit (findings 29 and 30), the AI library's default timeout and retry counts, whether the calendar file's event link resolves to the right public host once deployed, and whether the deployed build's Prisma generation step succeeds in a clean install. What is verified in each case is the absence in the repo, not the platform's number.

**The production Supabase project's settings were not inspected**, correctly, since this audit has no access to them. Finding 2 states what the code requires and what the checklist omits, not what is currently switched on.

**Two claims could not be settled and are flagged in the findings themselves.** Whether the non-cryptographic invite token is practically predictable would need a generated-token sample and a statistical test. And whether test rows are currently leaking into the shared dev-test database could not be answered: a read-only row-count probe was written and its execution was refused by the harness's own classifier (Anthropic built-in, not a project guardrail). That refusal changed the outcome, in that the mechanism is confirmed from the code and the actual effect is not; a single count query would settle it.

**Finding 45 has no verification.** Every verifier assigned to it failed to return, so it is reported as its lane wrote it. It is the only item in this report that has not been independently refuted or upheld.

---

# The completeness critic

*A final agent whose only job was to find what this audit missed. Reproduced in full and
unedited, including where it is hostile to the audit itself, because the parts that damage
the audit's own claims are the parts worth keeping.*
## 1. Files no lane read

**The ledger itself is incomplete, so "a ledger names anything nobody opened" is false at the root.** 22 tracked non-docs files are absent from `file-ledger.txt`: `public/file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`, `src/app/favicon.ico`, `.env.example`, `.gitignore`, `package-lock.json`, `prisma/migrations/migration_lock.toml`, `CLAUDE.md`, `.claude/settings.json`, `.claude/launch.json`, and all nine `.claude/hooks/*` files. Lanes 2, 5 and 6 read several of them anyway; nobody read `public/` or `favicon.ico` (see §4).

**Genuinely unread by every lane:**

- **All 14 `prisma/migrations/*/migration.sql`.** Zero appear in any coverage list; 13 of 14 are not mentioned in any lane file in any form. Lane 7's F-7-14 audits the *checklist's list of migrations* without opening one. I ran a cheap drift check myself (every schema column appears in the SQL, enums intact) but nobody proved the production database can be built from this history alone.
- **`src/lib/groups/initials.ts`** — zero mentions anywhere in any lane file.
- **`src/lib/orbit/merge.ts`** — cited in lane 3 findings, in nobody's coverage list. Same for `rhythm.ts` and `tally.ts`. Ledger-discipline failure, not a read failure.
- **~40 test files never named by anyone**, including `orbit/__tests__/{announce,change-copy,day-comment-plan,fetch-window,gap,merge,model-errors,playback,spark-copy,window}.test.ts`, `gauges/__tests__/{day-comment,gauges,open-ask,threshold}.test.ts`, `events/__tests__/{create,ics,move,upcoming}.test.ts`, `groups/__tests__/{leave,reset-invite,timezone}.test.ts`, `messages/__tests__/{create,create-membership}.test.ts`, `pending/__tests__/derive.test.ts`, `proposals/__tests__/promote.test.ts`, `FeedSeam.test.tsx`, `OrbitDownNote.test.tsx`, `AddToCalendarButton.test.tsx`. Lane 5 covers these by *machine survey* (pattern grep for no-assertion / weak-assertion / unscoped query) and says so honestly. That survey cannot see a test that asserts the wrong thing — which is precisely the defect class lane 3 found repeatedly (F-3-2, F-3-27) in the one artifact somebody actually read line by line.
- **9 of 10 `qa-stage-*.ts` plus `demo-stage.ts`** appear in no coverage list. Lane 7's F-7-9/F-7-10 cite exact line numbers in eight of them, so they were read; the coverage record just doesn't say so.

**Spot-check of two lanes' claims — both hold up.**
- Lane 4 F-4-8 ("another member's chat bubble renders with no fill"): `MessageFeed.tsx:275` is `backgroundColor: "var(--surface-base)"`, the page colour. Accurate.
- Lane 1 F-1-1 (cross-group supersede): `src/lib/proposals/create.ts:118-125` is `updateMany({ where: { answer: null, OR: [{ kind: GROUP, eventId }, { askerUserId }] } })` — no `groupId`. Accurate, and only reachable by someone who read the transaction.
- Lane 7's `AGENTS.md` byte count (327) is exact.

**One lane's evidence is factually wrong and no verifier caught it.** Lane 5 F-5-4 states "every sweep test passes a `{ groupId }` scope that production never passes." `src/app/actions/create-group.ts:97` is a production caller that passes exactly that: `await reconcileScheduledEvents(new Date(), { groupId: group.id })`. The finding's conclusion survives (the *hourly* path is uncovered); its stated evidence does not. That is a hole in the "refuted by an independent verifier" claim.

## 2. Lane briefs that went unanswered

- **Lane 6, "build and env config."** Nobody ran `npm run build`. Both lane 6 (line 685) and lane 7 (line 444) file it under "could not check." The audit that exists to precede the deploy did not establish that the app compiles for production.
- **Lane 4, the invariant list it was handed.** Lane 4 returns 8 findings and never states which of the brief's ~30 invariants it cleared, so silence is indistinguishable from a pass. Specific invariants with **no verdict anywhere in any lane file**: "reaching for supabase-js to touch data is a defect" (the strings `supabase-js` and `Data API` appear zero times across all nine files); "soft declines everywhere, 'Next time' never 'Pass' or a bare 'No'"; "plain, warm, roughly 7th-8th grade reading level"; "many-to-many from day one / events store an optional end / event location is a set of venue options"; "the chat body stays at `--type-body` (17px) and is never shrunk to fit"; "nothing anywhere goes below the 13px eyebrow floor" (F-4-2 names one instance; no sweep is claimed).
- **Lane 3, "whether every consumer reads through `normalize.ts`."** Lane 3 never states it ran that sweep. The one violation in the audit (F-4-7, the founder's onboarding question read off the raw model response) came from lane 4, incidentally.
- **Lane 2, "invite-token lifecycle."** F-2-1 exists in the record as a *title only*. Its `consequence`, `evidence`, `severity` and `confidence` were destroyed by a truncating `cat >` against an untracked file, along with F-2-2's and appendix items A-2-1/2/4/5 entirely. Nobody re-derived them. The audit's headline access finding is currently an unsupported assertion. (It is true — `prisma/schema.prisma:52` is `inviteToken String @unique @default(cuid())` while `reset-invite.ts:34` uses `randomUUID()` — but the audit does not say why that matters, or how badly.)
- **Lane 5, "935 tests read for tests that cannot fail."** No finding names a single test that passes while asserting the wrong behaviour. Roughly 40 test files were never opened, and the substitute survey is structurally blind to that defect.

## 3. CLAUDE.md current-state claims nobody checked

- **"every count and tally already reads current members only, so removal self-heals with no extra write."** Contradicted by this audit's own lane 1: F-1-16 (gauge promote re-reads votes but keeps a stale membership snapshot) and F-1-17 (a re-joined member's old answers count). Lane 2 verified the claim for `proposals/promote.ts` only. Nobody proposed the correction, so the always-loaded file still asserts something two findings disprove.
- **"every write path refuses a non-member server-side through the shared check in `src/lib/auth/membership.ts`."** Lane 2's own A-2-6 shows `proposal-vote.ts:82` uses the pre-write form, outside the transaction it protects. The claim's *mechanism clause* is false and nobody flagged the doc.
- **"The whole app was walked screen by screen to prove the claim [no dead ends left]."** Nothing was rendered by anyone. Lane 4 says explicitly "nothing visual was rendered." Every navigation, back-link and exit-path claim in the current-state section rests on a walkthrough nobody re-ran.
- **The bench readings quoted as current** — "80/80 on must-recognize, 65/65 on must-stay-quiet, 10/20 ambiguous," "eval:onboarding, fourteen cases." Lane 3 F-3-20 (no bench case exists for the product's core spark behaviour), F-3-2 (four day-comment cases stop short of the deciding code) and F-3-27 (the flagship regression case rebuilds the failure with words Orbit no longer says) together mean those numbers measure less than the sentence around them claims. No lane drew that conclusion, and the charter forbade re-running to settle it.
- **Every measured visual claim** — "224.8px, 34%," "289.7px, 43.8%," "1.12:1 from a confirmed card," "4.4992:1." Unverifiable by a static read; no lane states that this entire claim class went unverified.
- **"the founder heads into the group home carrying their first scheduled event."** True (`create-group.ts:97`), but the failure branch is deliberately fail-soft (`console.error("first-event reconcile failed (cron will catch up)")`). Nobody asked what the founder sees when it fires: an empty group home for up to an hour, on the first screen after creation, with no notice. This is also the exact call lane 5 asserted does not exist.

## 4. The class the seven-lane split structurally cannot cover

**Nothing was ever run.** All seven lanes are static reads by charter (no dev server, no migrations, no seeds, no benches, no build). Every runtime-only defect is invisible in all seven at once: whether `next build` succeeds, whether pages hydrate, whether a server action round-trips under Next 16, whether anonymous sign-in works against a fresh Supabase project, whether the app boots from an empty database. That is one blind spot shared by every lane, not a gap between them.

Under it, four unowned areas:

- **The second person's screen.** Every state change is delivered by `revalidatePath`, which refreshes only the browser that fired the action. `grep` across `src/` finds no `setInterval`, no `EventSource`, no subscription, no `visibilitychange`. Member B sees nothing — not A's message, not Orbit's reply, not a vote landing, not the third yes creating the plan — until B navigates or reloads. In a group-chat product this is the shape of the product, and the words "realtime", "polling", "second browser" and "another member's screen" appear in no lane brief and in no finding.
- **The shipped brand and link-sharing surface.** `public/` still holds `next.svg`, `vercel.svg`, `file.svg`, `globe.svg`, `window.svg`, and `src/app/favicon.ico` is still Next's default 25,931-byte icon dated 17 June. `layout.tsx` declares `title` and `description` and **no `openGraph`** — so the invite link, which is this product's entire distribution mechanism, previews in a group text with no image and identical generic copy for every group. None of these files is in the ledger; no lane was pointed at them. By the brief's own `fix-now` definition ("embarrass the owner in front of the investor the first shared link goes to"), this is the cheapest fix-now in the repo and the audit missed it because nobody owned static assets.
- **Post-launch operational visibility.** No error tracking, no uptime check, no cron-success signal. If `CRON_SECRET` is unset in production, `route.ts:35-41` returns 401 forever and the entire scheduled half of Orbit — recurring events, idea bumps, vote closures — is dead, recorded only by a `console.error` nobody reads. Lane 6 touches "nobody would know to look" once inside F-6-11; no lane owns the question.
- **Accessibility beyond colour, and dependency supply chain.** The strings `keyboard`, `focus`, `aria-`, `screen reader` and `tab order` appear zero times across all nine lane files; the suppression list carries only contrast. `package-lock.json` is not in the ledger and no lane ran or mentioned `npm audit`.

## 5. What one more round should be pointed at

1. **Build-and-boot lane.** `npm run build` on a clean checkout, then boot the production build and walk the five screens. It is the literal next step in the triage order, both lanes that should have done it filed it as "could not check", and it is the cheapest possible proof of the one thing this audit does not know.
2. **Two-browser freshness lane.** One session acts, a second watches: post a message, cast the third yes, close a vote. This is the only unowned risk that can invalidate the product's core loop, and no lane's brief contains the word.
3. **Restore lane 2 round one.** Re-run the same file list to rebuild F-2-1 and F-2-2's reasoning and A-2-1/2/4/5. The audit's headline access finding is a bare title, and "adversarially verified before it reaches the owner" is untrue for it.
4. **Doc-truth lane.** Read CLAUDE.md's current-state section as a numbered list of claims and mark each verified / contradicted / unverifiable against this audit's own findings. Three are already known-contradicted (current-members-only, the "shared check" clause, the bench numbers' scope) and nobody proposed the edit. That file loads every session, so a wrong claim works against every future slice.
5. **Migrations and first-boot-from-empty.** Read all 14 migration SQL files and establish that the production database can be built from them alone. Not one lane opened one.

Not: another Orbit-behaviour pass. Lane 3 ran three rounds, produced 27 findings and 12 appendix items, and is the most saturated ground in the audit. The unread ground is the deploy path, the runtime, and the second viewer.

---

# Postscript: four of the critic's claims checked by hand (22 Aug 2026)

Verified directly rather than relayed on the critic's word, because each one changes what
happens next.

1. **`npm run build` passes.** Exit code 0, all nine routes compiled. The critic's first
   recommended next lane named this as the audit's cheapest unknown, and it is now known.
   The build compiling is not the same as the app booting and rendering, which is still
   unproven.
2. **`public/` holds five create-next-app SVGs** (`next.svg`, `vercel.svg`, `file.svg`,
   `globe.svg`, `window.svg`), all dated 17 June, and `src/app/favicon.ico` is still Next's
   default 25,931-byte icon. Confirmed by listing.
3. **`src/app/layout.tsx:15` declares `title` and `description` and no `openGraph`.**
   Confirmed by reading. The invite link is this product's entire distribution mechanism,
   and it previews in a group text with no image and identical generic copy for every group.
4. **There is no live-refresh primitive anywhere in `src/`.** No `setInterval`, no
   `EventSource`, no `WebSocket`, no `visibilitychange`. Every state change is delivered by
   `revalidatePath`, which refreshes only the browser that fired the action. A second member
   sees nothing until they navigate or reload.

Items 2, 3 and 4 were invisible to all seven lanes because nobody owned static assets or the
second viewer's screen. Item 4 is the largest single gap this audit found, and it found it in
the critic rather than in the sweep.

**Also true, and recorded against this audit rather than against the code:** the file ledger
this audit measured its own coverage against was itself incomplete, missing `public/`,
`.claude/`, `.env.example` and `package-lock.json`. Coverage claims made against it are
correspondingly narrower than they read. And lane 2's two headline access findings lost their
evidence to a truncating write against their own findings file; the conclusion was
independently re-derived and holds, but the reasoning behind it was never adversarially
verified, and the report says so.

---

# Postscript, 23 Aug 2026: one finding the audit missed, found in conversation

**Losing a session does not lock a member out. It duplicates them.** The recorded cost of
having no email sign-in is that "a member who loses their session meets the wall until email
sign-in exists, and the invite link is their way back." That is too kind. They still have the
link, they tap it, they have no session, so they join as a *second* member: the group now
holds two of them, their earlier answers belong to an identity nobody can reach, and every
count is quietly wrong in the one product whose whole claim is accurate attendance. Nobody
sees an error. One cache clear, or one switch from phone to laptop, is enough.

This is the strongest argument for moving the email arc forward, and it is recorded here
because no lane found it and neither did the critic: it surfaced in the owner's own question
the day after. Noted, not fixed, like everything else in this document.

**Also registered nowhere:** the second-viewer problem (nobody sees a message, a vote, or a
plan being created until they reload) appears in this audit's critic section and in no
register anywhere else. It needs a §8 entry before it can be sequenced.
