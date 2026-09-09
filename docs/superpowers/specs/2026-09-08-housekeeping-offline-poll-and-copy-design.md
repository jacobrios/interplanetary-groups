# Housekeeping: the offline poll, and two legal pages that stopped being true

Cut from `main` at `c3f2f3f`. Test-suite baseline recorded at slice start, by
running the suite rather than copying the last recorded figure: **1880 passed of
1880, across 158 files, zero pre-existing failures.** Cross-checked against the
previous slice's finishing number as the rule requires: the duplicate-name slice
recorded 1827 across 154 files, and PR #130 (redirect assertions) accounts for
the growth. Nothing is carried red into this branch.

This is a bundle rather than a single feature, and it is one on purpose. Three of
its four items were RICE-scored against the rest of the queue on 8 Sept 2026 and
came out cheap enough that shipping them separately would cost more in branches,
reviews and QA passes than in code. The fourth, a runbook line, rides along
declared.

---

## Front section

**Settled with Jacob, 8 Sept 2026, do not relitigate.**

1. **A member who loses signal keeps the screen they had, and is told nothing.**
   Not a marker, not a banner, not a catch-up summary. Both the failure and the
   recovery are silent. Chosen against a quiet offline indicator because that
   indicator is new chrome on the product's most contested screen, shown during
   a state that is usually seconds long.
2. **The fix gates on the browser's own online flag, and nothing more.** The
   pre-flight probe (a small request before each refresh, catching every network
   failure) was weighed and declined: it permanently doubles request volume on
   the group home to buy a subset of cases. Jacob's deciding reason, which is
   the one to record: in the connected-but-no-internet case *everything else in
   the app is broken too*, so the member already knows something is wrong, and
   an app that keeps working perfectly there was never the promise.
3. **The privacy notice's cookie section is rewritten, and grows.** 53 words
   against 30, on a page deliberately shortened by about 90 words on 2 Sept.
   The growth is the accuracy, and the specificity is what makes the
   no-tracking sentence credible.
4. **The terms page's dead signpost is fixed by moving the link, not by deleting
   the phrase.** Deleting ", linked just above" would leave a section headed
   "Your information" that names a document and offers no way to reach it.
5. **The Vercel log drain is configuration, and it is Jacob's hands.** This
   slice writes the steps onto the after-launch list; it does not click
   anything.

**This reverses a recorded decision, and the reversal is the point.**
`terms/page.tsx:183` carries a comment explaining that the privacy-notice link
was deliberately *not* repeated in the "Your information" section, because two
underlined "privacy notice" links two paragraphs apart read as a stutter on a
phone at 375x812. That decision was sound and is now falsified by a reader:
Jacob read the page on 8 Sept 2026, could not find the link, and reported the
sentence as pointing at nothing. A real reader failing to find a link outranks a
design argument about stutter. The comment is replaced rather than deleted, so
the next session does not "fix" the stutter back in.

### Non-goals

- **Connected-but-no-internet.** Named in code and in the PR body, not fixed.
  Its trigger, if it ever becomes worth fixing: somebody actually observing the
  browser error page after this ships.
- **The send path.** A chat send while offline has its own deadline handling in
  `GroupHome.tsx` (`withDeadline` / `SEND_DEADLINE_MS`) and is out of this
  lane. If sends behave badly offline, that belongs to its own slice.
- **Screens other than the group home.** Only the group home polls, so only the
  group home can hit this. Event detail and group info are static once loaded
  and were never affected.
- **`deletion-plan.ts`'s product-wide body-text match.** This slice adds a
  warning to the runbook so the human confirming a deletion plan does not accept
  a stranger's join line. It does not scope the query. The real fix stays its own
  item, RICE 1.2 on 8 Sept 2026, and is ranked below everything else in the
  bundle.
- **`DeployWatch`.** Verified during design rather than assumed: its guard 2
  already makes a rejected fetch do nothing, so an offline tab-return is
  already silent there. No change.

### How this is verified, written before any code

- **The offline gate gets real tests, each proven by mutation.** Three
  behaviours: a refresh does not fire while the browser reports itself offline;
  coming back online fires one immediately; and the guards that already exist
  (paused, visibility, in-flight, coalesce) still hold with the new early return
  in place. Each must be shown red with the thing it guards removed. A green
  suite is not offered as evidence for any of them.
- **The two copy changes get no tests, deliberately, and the PR says so.**
  `src/app/__tests__/legal-pages.test.tsx` was read during design: it pins the
  contact address, the seven-day promise and the page headings, and pins no
  wording. Both files carry a comment saying the wording is deliberately
  untested. Adding a test that pins a sentence would make every future copy pass
  fail for the wrong reason.
- **The terms link gets one test**, because it is behaviour rather than wording:
  the "Your information" section must contain a link whose destination is
  `/privacy`. That one can genuinely fail, and it is what stops the stutter
  decision being restored by accident.
- **The after-launch item and the runbook line get none.** Documentation.
- **A production build must pass** (`npx next build --webpack`), per the gate
  added on 4 Sept after three deploys failed while four suites stayed green.
- **Not reachable by any automated check, and named rather than glossed:**
  whether the gate behaves correctly against a real phone losing real signal.
  jsdom has no radio. The honest proof is a device pass, and it is Jacob's.

### Debt this slice opens

- **The gate trusts a browser flag that is known to lie**, and nothing anywhere
  detects when it lies. Accepted knowingly, per settled decision 2.
- **`navigator.onLine` becomes a second thing `LiveRefresh` reads from the
  platform**, alongside `document.visibilityState`. That file's early-return
  list is now four deep (paused, in-flight, coalesce, offline) and is the
  clearest signal so far that its refresh-eligibility rules want extracting into
  their own tested unit, the way `should-reload.ts` already holds `DeployWatch`'s.
  Not done here: extracting it is a bigger change than the fix it would carry,
  and doing it inside a housekeeping bundle is exactly the scope creep the
  stay-in-lane rule exists to stop. **Trigger, not a date: the next time
  anything is added to or removed from that list.**
- **The privacy notice still has no mechanism keeping it true.** This is the
  second time in eight days it has been found stale by a human reading it. The
  existing pointer in `CLAUDE.md` is the strongest guard available and it did
  not work either time.

---

## Tasks

### Task 1: the poll stops firing while the browser reports itself offline

**Files:** `src/app/groups/[id]/LiveRefresh.tsx` and
`src/app/groups/[id]/__tests__/LiveRefresh.test.tsx`. Both paths confirmed
during design.

**Read this file's header before touching it.** It is long, it is accurate, and
it has already been corrected twice for overclaiming. Several of its comments
exist specifically to stop a future session re-adding something that does not
work. Do not shorten it, and do not add a claim to it you have not verified in
Next's own source.

**The behaviour.** `refresh()` currently returns early on three conditions, in
this order: `pausedRef.current`, then still-in-flight, then the coalesce window.
Add a fourth: **if the browser reports itself offline, return without
refreshing.**

**Where it goes in the order, and why it is not arbitrary.** Put the offline
check **first**, above the `paused` check. Reasoning to carry into the code
comment: the other three are all about *this app's own state* (a send is in
flight, a refresh is in flight, one just happened), and each is cheap but not
free to evaluate. Offline is about the platform, is the cheapest read of the
four, and when it is true none of the others can matter, because nothing is
going to happen either way. Ordering it first is also what makes the code read
the way the rule reads: there is no point asking whether we are allowed to
refresh when we cannot refresh.

**Why this fixes anything, for the code comment.** State this precisely, because
the mechanism is not obvious and the next reader will otherwise assume the
fallback is ours to intercept. `router.refresh()` ultimately calls Next's
`fetchServerResponse`. On a network failure that function does **not** rethrow:
it logs `Failed to fetch RSC payload ... Falling back to browser navigation.`
and returns the request's own URL as a plain string, which the caller reads as
an instruction to perform a full browser navigation (`doMpaNavigation` →
`location.replace()`). A full browser navigation with no connectivity lands the
member on the browser's own error page, and their group home is gone until they
reload. Verified in
`node_modules/next/dist/client/components/router-reducer/fetch-server-response.js`
at the `catch` block, on Next 16.3.2.

**There is a retry-on-reconnect path in that same catch, and it is off here.**
It is guarded by `process.env.__NEXT_USE_OFFLINE`, which
`node_modules/next/dist/build/define-env.js:126` defines from
`config.experimental.useOffline`. `next.config.ts` does not set it, so it is
false and the offline branch is dead code in this build. Record that in the
comment, because it is the single most likely thing a future session will
"discover" and use to argue this gate is unnecessary. **If that flag is ever
turned on, this gate should be re-evaluated rather than kept out of habit.**

**Resuming.** Add a `window` `online` event listener that calls `refresh()`, so
a member who walks back into signal sees the catch-up immediately rather than up
to ten seconds later. It must be torn down on unmount alongside the interval and
the two existing listeners. That file's header already names a real incident
caused by a dangling timer, so the teardown is not ceremony.

**Do NOT add an `offline` listener that stops the interval.** The tick is
already gated on visibility and now on connectivity, so a tick while offline
costs one boolean read. Stopping and restarting the interval adds a second piece
of state to keep consistent with the `online` listener, for no benefit. Say so
in a comment, because "why does this only listen for one of the pair" is a
question the next reader will have.

**Tests. Write each one first and show it failing before the change.**

1. **Offline blocks a refresh.** With the browser reporting offline, a tick does
   not call `router.refresh()`. Mutation proof: remove the early return, and this
   must go red.
2. **Coming back online refreshes immediately.** Dispatching `online` calls
   `router.refresh()` once, without waiting for the next interval. Mutation
   proof: remove the listener, and this must go red.
3. **The listener is torn down.** After unmount, dispatching `online` calls
   nothing. Mutation proof: drop the `removeEventListener`, and this must go
   red.
4. **The existing guards still hold.** The file's current tests must all still
   pass unchanged, and specifically the ones covering paused, visibility, the
   in-flight guard and the coalesce window. If any existing test needs editing
   to accommodate this change, **stop and report it** rather than editing it:
   that would mean this change altered behaviour it was not supposed to touch.

**On mocking the online flag:** jsdom's `navigator.onLine` is settable in the
way the existing tests already manipulate `document.visibilityState`. Follow
whatever pattern that file already uses for visibility rather than inventing a
second one, and if the existing pattern does not transfer, say so in the task
report rather than reaching for a different mocking style silently.

**What these tests cannot show, to be stated in the test file's own comment:**
none of this exercises a real dropped connection. jsdom has no network. What is
proven is that the gate reads the flag and honours it; that honouring the flag
prevents the browser error page rests on the Next source trace above, not on any
test in this repo.

---

### Task 2: the privacy notice's cookie section becomes true

**File:** `src/app/privacy/page.tsx`, the `LegalSection` currently headed
`Cookies` (around line 287).

**Why it is false today, both halves.** The section says cookies "keep you
signed in, and that is all they do."

1. `src/lib/auth/email-ask-cooldown.ts:134` writes `document.cookie` to remember
   that a member closed the email-ask sheet, so it waits 24 hours before asking
   again. That shipped 3 Sept 2026 and falsified this sentence a day before the
   draft parking did.
2. `GroupHome.tsx:204` writes the composer's unsent message to
   `window.sessionStorage`. That is device storage rather than a cookie, so the
   section's *heading* stops covering its subject too.

**The change.** Heading becomes **"Cookies and your device"**. Body becomes
exactly:

> The app stores a few things on your device: what keeps you signed in, a note
> that you closed the box asking for your email so it waits a day before asking
> again, and an unsent message until you close the tab. No analytics, no
> tracking, no advertising, and nothing that follows you around other websites.

**Two accuracy constraints that shaped this wording, so a future copy pass does
not undo them.** First, it deliberately does **not** say the stored things never
leave the device: the sign-in cookie is sent to our own server on every request,
which is how sessions work, so that comforting sentence would be a new false
claim in a fix for a false claim. Second, "until you close the tab" is load-
bearing and correct: the draft is in `sessionStorage`, not `localStorage`, and
`GroupHome.tsx`'s own header explains that this was chosen so a draft cannot
resurface days later in an unrelated tab.

**No test.** Confirmed during design: `src/app/__tests__/legal-pages.test.tsx`
pins the contact address, the seven-day deletion promise and the page headings,
and pins no wording anywhere. Do not add one. The file's existing comment saying
the wording is deliberately untested stays.

**Note the word count in the task report**: the replacement is 53 words against
the previous 30, on a page shortened by roughly 90 words on 2 Sept 2026. That
growth was approved by Jacob explicitly, on 8 Sept, as the price of accuracy.

---

### Task 3: the terms page's signpost gets its own link

**File:** `src/app/terms/page.tsx`, the `LegalSection` headed `Your information`
(around line 190), and the comment block directly above it (around line 183).

**The change.** The sentence currently reads:

> What else the app keeps, who can see it, and how to have it deleted is all on
> the privacy notice, linked just above.

It becomes:

> What else the app keeps, who can see it, and how to have it deleted is all on
> the privacy notice.

with **"privacy notice" as a `Link` to `/privacy`**, styled exactly as the
existing one in the "What you write is yours" section
(`terms/page.tsx:174-178`): `color: var(--text-secondary)`, `textDecoration:
underline`. Copy that style object's values rather than inventing a variant; if
the two ever want to differ, that is a decision for a design pass, not for this
task.

The earlier in-context link **stays**. There are now two links to `/privacy` on
this page, one section apart, and that is the intended outcome.

**Replace the comment above the section, do not delete it.** The current comment
explains why the link was deliberately not repeated. Deleting it loses the
history; leaving it makes the code contradict itself. The replacement must say:
the no-repeat decision was made in fix round 1 to avoid a stutter at 375x812; it
was reversed on 8 Sept 2026 after Jacob read the page and could not find the
link at all; a reader who cannot find a link outranks a stutter; and the section
now carries its own link so it is not a signpost pointing at nothing.

**One test, and it is behaviour rather than wording.** The "Your information"
section must contain a link whose `href` is `/privacy`. Prove it can fail by
removing the link and watching it go red. This is what stops the stutter
decision being silently restored by a future copy pass.

**The premise was verified during design, not assumed:** neither `/terms` nor
`/privacy` renders `LegalFooter`, so before this change the *only* route from the
terms page to the privacy notice was the single in-context link in the section
above. That is why the dead signpost mattered rather than being merely untidy.

---

### Task 4: the Vercel log drain goes on the after-launch list

**File:** `docs/build-notes.md`, the "After launch, running deploy-time
obligations" list. The last item is 15; this becomes **item 16**.

This is Jacob's clicking, not ours. The item exists so the steps are written
down once, by the session that understands why they are wanted.

**Write it in the shape item 13 uses** (the Better Stack heartbeat monitor):
the setting, then the reasoning for that setting, because a dashboard value with
no recorded reason is one nobody can later audit. Follow that item's own lesson
literally: **do not write a third-party setting into the record until somebody
has looked at the screen.** So this item names what is wanted and why, states
plainly that nobody has opened Vercel's log-drain screen yet, and leaves the
exact field names to whoever does.

**What the item must say.**

- **What it is for.** The health check built on 1 Sept covers database reads
  from a signed-in path. It cannot see a render error, a crash in one route, or
  a single bad group taking a page down: those return a 500 to one member and
  nothing anywhere raises a hand. A log drain sends Vercel's runtime logs to
  Better Stack, where an alert on error-level lines turns a silent 500 into a
  notification.
- **Why it is worth doing at this size.** The four-day outage of 28-31 Aug 2026
  is the argument: signed-in members saw a broken site, logged-out visitors saw
  a healthy one, and it was found by the owner opening the app. The heartbeat
  closes that exact case. The drain closes the class the heartbeat cannot see.
- **What it explicitly does NOT cover**, so the record does not read exhaustive
  the way an earlier list did: the Supabase auth soft-fail, which is next in the
  queue after this bundle. That failure logs members out silently, throws
  nothing, and therefore produces no error line for a drain to carry. Neither
  the heartbeat nor the drain can see it. Say this in the item.
- **That it gates nothing.** No migration, no code, no merge dependency.

---

### Task 5: one warning line in the deletion runbook

**File:** `docs/runbooks/person-deletion.md`.

**Declared out of lane**, and it rides this branch because it is one paragraph
and because the bug it de-fangs was upgraded from theory to observation on
4 Sept 2026.

**The bug, stated for the runbook's reader.**
`src/lib/people/deletion-plan.ts:232` finds a person's join announcement by
searching for messages whose body is exactly `"<name> joined"`, product-wide,
with no group scope and no person id. If anyone else anywhere in the product has
that name, their join line is returned as a high-confidence candidate. It has
been seen doing this: during the duplicate-name slice on 4 Sept 2026 it returned
join rows from a concurrent worktree's data, across group boundaries, and two
sessions confirmed it independently.

**What to add.** A warning, in the runbook's existing voice, at the step where
the operator reviews join-line candidates: check that each candidate belongs to
the group the deletion request came from before confirming it, because the match
is by text alone and a same-named person in another group will be offered here.

**Do not change `deletion-plan.ts`.** Scoping that query is its own item, and it
was ranked below this whole bundle on 8 Sept 2026. Widening this task into the
code fix is the scope creep this project's stay-in-lane rule exists to catch.

**No test.** Documentation.

---

## Task order and independence

Task 1 is the only one that touches product code and is the only one carrying
real risk; do it first, while the branch is otherwise clean, so a review of it is
not reading around three documentation diffs.

Tasks 2, 3, 4 and 5 are mutually independent and touch four different files.

## What the PR body must carry

Per the standing rule, near 300 words, written for an engineer reading the repo
later: what changed, how it was verified (test numbers before and after, the
production build result, what was checked by hand, and **which items owed no
evidence and why**), what the review found, and a pointer to the build-notes
entry. Every file touched that this document did not name gets one line.

**Two things must appear in it explicitly**, because both are the kind of thing
a reader would otherwise assume was covered:

1. The offline gate does not cover connected-but-no-internet, and that was a
   decision rather than an oversight.
2. Nothing in this slice has been seen working against a real phone losing real
   signal. The device pass is Jacob's.

## What the chat message must carry, separately from the PR

The manual QA script, about five minutes, focused on what automated verification
could not reach. It must include, at minimum: reading both legal pages on a
phone and confirming the terms signpost now reaches the privacy notice in one
tap; and the offline pass, which is the only way this slice's main change can be
checked at all (open the group home, turn on airplane mode, confirm the screen
stays put rather than bouncing to an error page, turn it off, confirm the screen
catches up on its own).
