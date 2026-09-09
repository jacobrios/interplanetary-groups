# Housekeeping Bundle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop a member who loses signal from being thrown onto the browser's error page, and make two legal pages true again.

**Architecture:** One new early return and one new event listener in an existing client component, plus copy and documentation changes in four separate files. No new modules, no migration, no dependency, no product surface added anywhere.

**Tech Stack:** Next.js 16.3.2 (App Router), React 19, TypeScript, Vitest with jsdom, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-08-housekeeping-offline-poll-and-copy-design.md`. Read its front section before starting; it carries the settled decisions and the non-goals.

**Branch:** `housekeeping-offline-poll-and-copy`, cut from `main` at `c3f2f3f`.

**Baseline, taken by running the suite at slice start:** 1880 passed of 1880 across 158 files, zero pre-existing failures. If a run reports fewer than 1880 or any failure that is not attributable to your own edit, stop and report it rather than proceeding.

## Global Constraints

- **No em dashes or en dashes** in any file you write or edit, including code comments, test names, commit messages and documentation. Use commas, semicolons or parentheses. Standard hyphens in compound words are correct.
- **Orbit's user-facing copy targets a 7th to 8th grade reading level.** This applies to Task 2's privacy copy and Task 3's terms copy.
- **A passing test is only evidence if it could have failed.** Every test in this plan must be shown red before the implementation and green after. Where a step says "prove it can fail," that means actually breaking the code, observing red, and restoring it. Report both results.
- **Do not run `npm test` and another full suite at the same time.** `suite-lock.mjs` serializes runs inside one checkout, but a second checkout is not covered.
- **Never edit `.env`.** Nothing in this plan needs it.
- **Stay in lane.** No refactoring, renaming or tidying beyond what a task names. `LiveRefresh.tsx`'s early-return list is registered debt in the spec with its own trigger; do not extract it here.
- **`LiveRefresh.tsx`'s header comment is load-bearing and has been corrected twice for overclaiming.** Do not shorten it. Do not add a claim to it you have not verified in Next's own source.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/app/groups/[id]/LiveRefresh.tsx` | Modify: add the offline early return and the `online` listener | 1 |
| `src/app/groups/[id]/__tests__/LiveRefresh.test.tsx` | Modify: new offline tests, plus extend the existing teardown test to the third listener | 1 |
| `src/app/privacy/page.tsx` | Modify: the Cookies section's heading and body | 2 |
| `src/app/terms/page.tsx` | Modify: the "Your information" section's link, and the comment above it | 3 |
| `src/app/__tests__/legal-pages.test.tsx` | Modify: one new test pinning the terms link destination | 3 |
| `docs/build-notes.md` | Modify: after-launch item 16 | 4 |
| `docs/runbooks/person-deletion.md` | Modify: a warning in the "joined" line section | 5 |

Task 1 is the only one touching product behaviour. Tasks 2 to 5 are mutually independent and touch different files.

---

### Task 1: The poll stops firing while the browser reports itself offline

**Files:**
- Modify: `src/app/groups/[id]/LiveRefresh.tsx`
- Test: `src/app/groups/[id]/__tests__/LiveRefresh.test.tsx`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing other tasks rely on. `REFRESH_IN_FLIGHT_TIMEOUT_MS` stays exported and unchanged.

**Background you need before writing anything.** `router.refresh()` ends up in Next's `fetchServerResponse`. On a network failure that function does **not** rethrow. It logs `Failed to fetch RSC payload ... Falling back to browser navigation.` and returns the request's own URL as a plain string, which the caller reads as an instruction to do a full browser navigation (`doMpaNavigation` then `location.replace()`). A full browser navigation with no connectivity lands the member on the browser's own error page. Verified in `node_modules/next/dist/client/components/router-reducer/fetch-server-response.js`, at the `catch` block, on Next 16.3.2. There is a retry-on-reconnect branch in that same catch, but it is gated on `process.env.__NEXT_USE_OFFLINE`, which `node_modules/next/dist/build/define-env.js:126` defines from `config.experimental.useOffline`; `next.config.ts` does not set it, so that branch is dead code in this build.

- [ ] **Step 1: Add a `setOnline` helper next to the existing `setVisibility` helper**

In `src/app/groups/[id]/__tests__/LiveRefresh.test.tsx`, directly below the existing `setVisibility` function (around line 52):

```tsx
// Mirrors setVisibility above rather than inventing a second mocking style:
// navigator.onLine is a read-only accessor in jsdom, so a test that wants to
// simulate a dropped radio has to redefine the property.
function setOnline(online: boolean) {
  Object.defineProperty(navigator, "onLine", {
    value: online,
    configurable: true,
  })
}
```

Then add `setOnline(true)` to **both** `beforeEach` and `afterEach`, alongside the existing `setVisibility("visible")` calls. Without the `afterEach` reset an offline test leaks into every later test in the file, exactly the way the existing `mockRefreshPending` reset comment describes.

- [ ] **Step 2: Write the three failing tests**

Add these inside the existing `describe("LiveRefresh", ...)` block, after the coalesce tests:

```tsx
  // The whole point of the offline gate. Without it, this tick reaches
  // router.refresh(), whose network failure falls through to a full browser
  // navigation, which with no connectivity is the browser's error page. See
  // LiveRefresh.tsx's header for the traced Next mechanism.
  it("fires no refresh at all while the browser reports itself offline", () => {
    setOnline(false)
    render(<LiveRefresh paused={false} />)

    vi.advanceTimersByTime(50_000)
    expect(refresh).not.toHaveBeenCalled()

    // Not just the timer: the two event-driven paths are gated too, since a
    // member returning to the tab while still offline is the likelier case.
    setVisibility("hidden")
    document.dispatchEvent(new Event("visibilitychange"))
    setVisibility("visible")
    document.dispatchEvent(new Event("visibilitychange"))
    window.dispatchEvent(new Event("focus"))
    expect(refresh).not.toHaveBeenCalled()
  })

  it("refreshes as soon as the browser reports itself back online", () => {
    setOnline(false)
    render(<LiveRefresh paused={false} />)

    vi.advanceTimersByTime(50_000)
    expect(refresh).not.toHaveBeenCalled()

    setOnline(true)
    window.dispatchEvent(new Event("online"))
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it("clears the online listener on unmount", () => {
    const { unmount } = render(<LiveRefresh paused={false} />)
    unmount()

    window.dispatchEvent(new Event("online"))
    expect(refresh).not.toHaveBeenCalled()
  })
```

- [ ] **Step 3: Extend the existing teardown test to the third listener**

This is an expected, in-scope edit and not the "stop and report" case. The existing test at line 174 is titled `"clears the interval and both listeners on unmount"` and asserts on two `removeEventListener` calls. There are three listeners after this change. Rename it to `"clears the interval and all three listeners on unmount"` and add, after the existing `removeWindowListener` assertion for `"focus"`:

```tsx
    expect(removeWindowListener).toHaveBeenCalledWith(
      "online",
      expect.any(Function)
    )
```

and add `window.dispatchEvent(new Event("online"))` to that test's behavioural block, alongside the existing `visibilitychange` and `focus` dispatches.

**Stop and report instead of editing** if any *other* existing test needs changing. Those cover paused, visibility, in-flight and coalesce behaviour that this task must not alter; one of them going red means the change did something it was not supposed to.

- [ ] **Step 4: Run the new tests and verify they fail**

Run: `npx vitest run src/app/groups/\[id\]/__tests__/LiveRefresh.test.tsx`

Expected: the three new tests FAIL. The first two fail because `refresh` is called when it should not be, or not called when it should be; the third fails because no `online` listener exists so nothing is torn down, and the extended teardown test fails on the missing `removeEventListener` call. Record the actual failure messages in your task report; if any of the three passes at this point, the test is not testing what it claims and must be fixed before proceeding.

- [ ] **Step 5: Add the offline early return**

In `src/app/groups/[id]/LiveRefresh.tsx`, inside the `refresh` function, **above** the existing `if (pausedRef.current) return`:

```tsx
      // OFFLINE IS CHECKED FIRST, ABOVE EVERY OTHER GUARD.
      //
      // Not arbitrary ordering. The other three early returns are about this
      // app's own state (a send is in flight, a refresh is in flight, one just
      // happened). This one is about the platform, is the cheapest read of the
      // four, and when it is true none of the others can matter, because
      // nothing is going to happen either way. There is no point asking
      // whether we are allowed to refresh when we cannot refresh.
      //
      // WHY THIS GUARD EXISTS AT ALL, since the failure it prevents is not
      // visible from this file. router.refresh() ends in Next's
      // fetchServerResponse, which on a network failure does NOT rethrow: it
      // logs "Failed to fetch RSC payload... Falling back to browser
      // navigation." and returns the request's own URL as a plain string,
      // which the caller reads as an instruction to perform a full browser
      // navigation (doMpaNavigation, then location.replace()). A full browser
      // navigation with no connectivity lands the member on the browser's own
      // error page, and the group home they were reading is gone until they
      // reload by hand. Verified at the catch block in
      // node_modules/next/dist/client/components/router-reducer/fetch-server-response.js
      // on Next 16.3.2.
      //
      // THERE IS A RETRY-ON-RECONNECT BRANCH IN THAT SAME CATCH, AND IT IS OFF
      // HERE. It is gated on process.env.__NEXT_USE_OFFLINE, which
      // node_modules/next/dist/build/define-env.js:126 defines from
      // config.experimental.useOffline. next.config.ts does not set it, so the
      // branch is dead code in this build. Recorded because it is the most
      // likely thing a future session will find and use to argue this guard is
      // redundant: if that flag is ever turned on, re-evaluate this guard
      // rather than keeping it out of habit.
      //
      // WHAT THIS DOES NOT COVER, decided rather than overlooked: a device
      // connected to a network that has no working internet (a captive portal,
      // a wifi with no backhaul) reports itself online, so this guard misses
      // it. Jacob's ruling, 8 Sept 2026: in that state everything else in the
      // app is broken too, so the member already knows something is wrong. The
      // alternative, a pre-flight probe before each refresh, was declined
      // because it permanently doubles request volume on this screen to buy a
      // subset of cases. Trigger for revisiting: somebody actually observing
      // the browser error page after this shipped.
      //
      // `=== false` rather than `!navigator.onLine`, so this fails toward
      // working: only an explicit false blocks a refresh. A platform where the
      // property is missing gets the old behaviour rather than a component
      // that silently never refreshes again.
      if (navigator.onLine === false) return
```

- [ ] **Step 6: Add the `online` listener**

Alongside `handleVisibilityChange` and `handleFocus` in the same effect:

```tsx
    // A member who walks back into signal should see the catch-up now, not up
    // to REFRESH_INTERVAL_MS later. The coalesce window keeps this from
    // double-firing with a tick that lands in the same moment.
    //
    // DELIBERATELY NO MATCHING "offline" LISTENER, and this is a question the
    // next reader will have. Stopping the interval on the way out would add a
    // second piece of state to keep consistent with this one, for no benefit:
    // the tick is already gated on visibility and now on connectivity, so a
    // tick while offline costs one boolean read and nothing else.
    //
    // This deliberately does NOT call startInterval(). If the tab is visible
    // the interval is already running; if it is hidden it must stay stopped,
    // and visibilitychange starts it when the member comes back. That is the
    // opposite of handleFocus, which does restart it, because focus is a
    // return-to-the-tab signal and this is not.
    const handleOnline = () => {
      refresh()
    }
```

Register it with `window.addEventListener("online", handleOnline)` next to the existing `focus` registration, and remove it in the cleanup with `window.removeEventListener("online", handleOnline)`. The cleanup must tear down all three listeners plus the interval; this file's header names a real incident caused by a dangling timer, so teardown is not ceremony here.

- [ ] **Step 7: Run the file's tests and verify all pass**

Run: `npx vitest run src/app/groups/\[id\]/__tests__/LiveRefresh.test.tsx`

Expected: PASS, every test in the file, including all the pre-existing ones unchanged.

- [ ] **Step 8: Prove each new test could have failed**

One at a time, break the thing and record the result:

1. Delete the `if (navigator.onLine === false) return` line. Expected: the offline test and the back-online test both go red. Restore.
2. Delete the `window.addEventListener("online", handleOnline)` line. Expected: the back-online test goes red. Restore.
3. Delete the `window.removeEventListener("online", handleOnline)` line. Expected: the unmount test and the extended teardown test go red. Restore.

Report the observed output for each. A mutation that does not produce red means that test is not holding what it claims, and it must be fixed before this task is done.

- [ ] **Step 9: Add the test file's own honesty comment**

At the top of the three new tests, add:

```tsx
  // WHAT THESE TESTS CANNOT SHOW. None of this exercises a real dropped
  // connection: jsdom has no network, and router.refresh is mocked here
  // anyway. What is proven is that this component reads navigator.onLine and
  // honours it. That honouring it prevents the browser error page rests on the
  // Next source trace in LiveRefresh.tsx's header, not on any test in this
  // repo. The device pass is the only real proof and it is Jacob's.
```

- [ ] **Step 10: Run the full suite**

Run: `npm test`

Expected: 1883 passed of 1883 across 158 files (1880 baseline plus the three new tests), zero failures. Report the actual numbers. If the count differs from 1883 in any direction other than the three you added, stop and report.

- [ ] **Step 11: Commit**

```bash
git add "src/app/groups/[id]/LiveRefresh.tsx" "src/app/groups/[id]/__tests__/LiveRefresh.test.tsx"
git commit -m "Stop polling while the phone has no signal

A member reading the group home when signal drops was thrown onto the
browser's error page. The ten-second poll calls router.refresh(), and Next's
fetchServerResponse does not rethrow a network failure: it falls through to a
full browser navigation, which with no connectivity is the error page. Their
group was gone until they reloaded by hand.

The poll now skips while the browser reports itself offline, and an online
listener refreshes the moment signal returns. The member keeps the screen they
had, and neither the failure nor the recovery says anything.

Not covered, decided rather than missed: a device connected to a network with
no working internet reports itself online. In that state everything else in the
app is broken too."
```

---

### Task 2: The privacy notice's cookie section becomes true

**Files:**
- Modify: `src/app/privacy/page.tsx`, the `LegalSection` headed `Cookies` (around line 287)

**Interfaces:**
- Consumes: nothing. Produces: nothing.

**Why it is false today, both halves.** `src/lib/auth/email-ask-cooldown.ts:134` writes `document.cookie` to remember that a member closed the email-ask sheet, so it waits 24 hours before asking again; that shipped 3 Sept 2026. And `GroupHome.tsx:204` writes the composer's unsent message to `window.sessionStorage`, which is device storage rather than a cookie, so the section's heading stops covering its own subject too.

- [ ] **Step 1: Replace the heading and body**

The section currently reads:

```tsx
      <LegalSection heading="Cookies">
        <LegalText>
          The app sets cookies to keep you signed in, and that is all they do.
          No analytics, no tracking, no advertising, and nothing that follows
          you around other websites.
        </LegalText>
      </LegalSection>
```

Replace with:

```tsx
      {/* Rewritten 8 Sept 2026. The previous version said cookies "keep you
          signed in, and that is all they do", which two shipped changes had
          already falsified: the email-ask snooze cookie
          (src/lib/auth/email-ask-cooldown.ts:134, 3 Sept) and the composer's
          parked draft (GroupHome.tsx:204, 4 Sept). Found by Jacob reading the
          page, which is the second time in eight days this page has been found
          stale by a human rather than by any check.

          Two accuracy constraints that shaped this wording, so a future copy
          pass does not undo them. It deliberately does NOT say the stored
          things never leave the device: the sign-in cookie is sent to our own
          server on every request, which is how sessions work, so that
          comforting sentence would be a new false claim inside a fix for a
          false claim. And "until you close the tab" is load-bearing and
          correct, because the draft is in sessionStorage rather than
          localStorage; GroupHome.tsx's own header explains that choice.

          53 words against the previous 30, on a page shortened by about 90
          words on 2 Sept. Jacob approved the growth explicitly as the price of
          accuracy. */}
      <LegalSection heading="Cookies and your device">
        <LegalText>
          The app stores a few things on your device: what keeps you signed in,
          a note that you closed the box asking for your email so it waits a
          day before asking again, and an unsent message until you close the
          tab. No analytics, no tracking, no advertising, and nothing that
          follows you around other websites.
        </LegalText>
      </LegalSection>
```

- [ ] **Step 2: Add no test, and confirm why**

Do not add a test. Confirm by reading `src/app/__tests__/legal-pages.test.tsx` that it pins the contact address, the seven-day deletion promise and the page headings, and pins no wording anywhere. State in your task report that you checked this rather than assuming it. Both legal page files carry a comment saying the wording is deliberately untested; that comment stays.

- [ ] **Step 3: Verify it renders**

Run: `npx vitest run src/app/__tests__/legal-pages.test.tsx`

Expected: PASS, unchanged. This is a regression check that the JSX is well formed, not evidence about the copy.

- [ ] **Step 4: Commit**

```bash
git add src/app/privacy/page.tsx
git commit -m "The privacy notice stops claiming cookies only keep you signed in

Two shipped changes had already made that false: the email-ask snooze cookie
on 3 Sept, and the composer's parked draft on 4 Sept. The section now names
all three things stored on the device and keeps the no-tracking promise, which
the added specificity is what makes credible.

It deliberately does not claim the stored things never leave the device: the
sign-in cookie goes to our own server on every request, and a comforting
sentence that is false would be no better than the one being replaced."
```

---

### Task 3: The terms page's signpost gets its own link

**Files:**
- Modify: `src/app/terms/page.tsx`, the comment block around line 183 and the `LegalSection` headed `Your information` around line 190
- Test: `src/app/__tests__/legal-pages.test.tsx`

**Interfaces:**
- Consumes: nothing. Produces: nothing.

**The premise, verified during design rather than assumed:** neither `/terms` nor `/privacy` renders `LegalFooter`, so before this change the only route from the terms page to the privacy notice was the single in-context link at `terms/page.tsx:174`.

- [ ] **Step 1: Write the failing test**

In `src/app/__tests__/legal-pages.test.tsx`, add:

```tsx
  // Behaviour, not wording. The "Your information" section is the signpost a
  // reader scanning headings lands on, and until 8 Sept 2026 it named the
  // privacy notice while carrying no link, pointing at an in-context link one
  // section up that Jacob could not find when he read the page. This test is
  // what stops a future copy pass restoring that.
  it("gives the terms page's Your information section its own link to the privacy notice", () => {
    render(<TermsPage />)

    const heading = screen.getByRole("heading", { name: /your information/i })
    const section = heading.closest("section")
    expect(section).not.toBeNull()

    const link = section!.querySelector('a[href="/privacy"]')
    expect(link).not.toBeNull()
  })
```

Adapt the render call and imports to whatever pattern the file already uses for the terms page; do not introduce a second style. If `LegalSection` does not render a `<section>` element, use whatever container element it does render and say so in your task report.

- [ ] **Step 2: Run it and verify it fails**

Run: `npx vitest run src/app/__tests__/legal-pages.test.tsx -t "Your information"`

Expected: FAIL, because the section contains no link at all.

- [ ] **Step 3: Replace the comment above the section**

The current comment explains why the link was deliberately not repeated. Replace it rather than deleting it, so the reversal is on the record:

```tsx
      {/* This section carries its own link to the privacy notice, and that
          reverses a recorded decision rather than overlooking one.

          Fix round 1 deliberately did NOT repeat the link from the section
          directly above, because two underlined "privacy notice" links two
          paragraphs apart read as a stutter on a phone at 375x812, which is
          how it was caught. Reversed 8 Sept 2026: Jacob read this page, could
          not find the link at all, and reported this sentence as pointing at
          nothing. Neither this page nor /privacy renders LegalFooter, so that
          one in-context link was the only route between them.

          A real reader failing to find a link outranks a design argument about
          stutter. The link now lives at the sentence that sends the reader
          somewhere, so the signpost is not pointing at nothing. Both links
          stay. */}
```

- [ ] **Step 4: Make the change**

The section body becomes:

```tsx
      <LegalSection heading="Your information">
        <LegalText>
          What else the app keeps, who can see it, and how to have it deleted
          is all on the{" "}
          <Link
            href="/privacy"
            style={{ color: "var(--text-secondary)", textDecoration: "underline" }}
          >
            privacy notice
          </Link>
          .
        </LegalText>
      </LegalSection>
```

The style object's values are copied from the existing link at `terms/page.tsx:174-178`. Copy them rather than inventing a variant; if the two should ever differ that is a decision for a design pass, not for this task. `Link` is already imported in this file for that existing link; confirm rather than adding a duplicate import.

- [ ] **Step 5: Run the test and verify it passes**

Run: `npx vitest run src/app/__tests__/legal-pages.test.tsx`

Expected: PASS, all tests in the file.

- [ ] **Step 6: Prove the test could have failed**

Remove the `<Link>` wrapper, leaving the words as plain text. Expected: the new test goes red. Restore it. Report the observed output.

- [ ] **Step 7: Commit**

```bash
git add src/app/terms/page.tsx src/app/__tests__/legal-pages.test.tsx
git commit -m "Give the terms page's signpost a link that goes somewhere

The Your information section named the privacy notice and said it was linked
just above. It was, one section up, mid-paragraph, and Jacob read the page and
could not find it. Neither legal page renders the footer, so that single
in-context link was the only route between them.

This reverses fix round 1's decision not to repeat the link, which was made to
avoid two underlined links reading as a stutter on a phone. A real reader
failing to find a link outranks that. Deleting the phrase instead would have
left a section that names a document and offers no way to reach it.

A test now pins the destination, so a future copy pass cannot quietly restore
the old shape."
```

---

### Task 4: The Vercel log drain goes on the after-launch list

**Files:**
- Modify: `docs/build-notes.md`, inserting after after-launch item 15 (which ends at line 671, immediately before the `### Data-foundation slice (18 to 19 June 2026)` heading at line 673)

**Interfaces:**
- Consumes: nothing. Produces: nothing.

This is Jacob's clicking, not ours. The item exists so the steps are written down once, by the session that understands why they are wanted.

- [ ] **Step 1: Insert item 16**

```markdown
16. **Send Vercel's runtime logs to Better Stack, and alert on error-level lines.** Added 8 Sept 2026 (housekeeping bundle). **Gates nothing:** no migration, no code, no merge dependency. It is dashboard configuration in two places, and it is the owner's hands rather than a build agent's.
    *What it is for.* The health check built on 1 Sept 2026 covers the database reads a signed-in screen depends on. It cannot see a render error, a crash in one route, or one bad group taking a page down: those return a 500 to one member and nothing anywhere raises a hand. A log drain carries Vercel's runtime logs into Better Stack, where an alert on error-level lines turns a silent 500 into a notification.
    *Why it is worth doing at this size.* The four-day outage of 28 to 31 Aug 2026 is the whole argument. Signed-in members saw a broken site, logged-out visitors saw a healthy one, and it was found by the owner happening to open the app. The heartbeat closes that exact case. The drain closes the class the heartbeat cannot see.
    *What it explicitly does NOT cover, stated because the site-health slice's own "two things it does not cover" list read exhaustive and was not.* **The Supabase auth soft-fail is invisible to this too.** `src/lib/auth/current-user.ts:16` reads only the `data` half of `auth.getUser()` and returns null when the call errors, so a degraded auth service logs every member out quietly onto the front door or the members-only wall. Nothing throws, so there is no error line for a drain to carry and no 500 to alert on. That is the next slice in the queue after this bundle, and this item does not shrink it.
    *No settings are named here on purpose.* Nobody has opened Vercel's log-drain screen yet, and item 13 learned three times over that writing a third-party setting into this record before somebody has looked at it produces a record that is confidently wrong. Whoever configures it should come back and write down what they actually chose and why, in item 13's shape.
```

- [ ] **Step 2: Verify the numbering and placement**

Run: `grep -n "^1[0-9]\. \*\*" docs/build-notes.md | tail -5`

Expected: items 10 through 16 in order, with 16 last, and nothing renumbered.

- [ ] **Step 3: Commit**

```bash
git add docs/build-notes.md
git commit -m "Put the Vercel log drain on the after-launch list

The heartbeat catches a database that stops answering. It cannot catch a render
error or a crash in one route, which return a 500 to one member with nothing
anywhere raising a hand. The drain closes that class.

Written with no settings named, per item 13's own lesson: nobody has opened the
screen yet, and a third-party setting recorded before somebody has looked at it
is a record that is confidently wrong. It also says plainly what the drain
cannot see, which is the auth soft-fail, so the list does not read exhaustive
the way the site-health one did."
```

---

### Task 5: A warning in the deletion runbook

**Files:**
- Modify: `docs/runbooks/person-deletion.md`, the `### The "joined" line questions` section (starts line 161)

**Interfaces:**
- Consumes: nothing. Produces: nothing.

**Declared out of lane**, riding this branch because it is one paragraph and because the bug it de-fangs was upgraded from theory to observation on 4 Sept 2026.

**Read this before writing, because the obvious warning would be the wrong one.** The runbook's existing three-tier list already warns about a same-named stranger, but only under `"doubtful, could be a different person"`, which defaults to no. `deletion-plan.ts`'s own comment says that is "the only class where confirming the match would delete an innocent person's join line." **That is not true, and the gap is exactly where the defaults are set to yes.** The evidence tier is computed from whether *the person being deleted* is tied to that group, not from whether that line is theirs. So if two same-named people share a group, the other person's join line in that group is labelled `current-member` ("definitely them", defaults to **yes**) or `left-with-trace` ("probably them", defaults to **yes**). The high-confidence tiers are exactly as wrong as the low one there, and they are the ones the operator is told are safe.

This is still reachable despite the 4 Sept duplicate-name join check, because that check does not gate somebody who already has a session joining a second group.

- [ ] **Step 1: Add the warning**

Insert after the three-tier bullet list, immediately before the `### Confirming for real` heading:

```markdown
**One case the labels above get wrong, and it is the one where they tell you
yes.** The label is worked out from whether *the person you are deleting* is
tied to that group, not from whether that particular line is theirs. So if two
people with the same name are in the same group, the other person's "joined"
line in that group is labelled "definitely them" or "probably them" and
defaults to **yes**. The tier that warns you about a name clash is the only one
that does not apply here.

**So before accepting any candidate, check the group it is in and the date, and
ask whether you know of anyone else by that name there.** The product cannot
tell you: these lines carry no id, only text, and the search runs across the
whole product. Since 4 Sept 2026 two people with the same name can no longer
join the same group in the ordinary way, so this mostly matters for lines
written before that date, and for the one case that check still lets through
(somebody who already had a session joining a second group).

This is a known bug in the tooling rather than a quirk of the data, and it has
been seen firing rather than only reasoned about. Scoping the query is its own
queued item.
```

- [ ] **Step 2: Read the whole section back**

Read `### The "joined" line questions` from its heading through the new paragraphs and confirm the addition does not contradict the three-tier list above it and does not repeat the advice already given for the doubtful tier. Fix inline if it does.

- [ ] **Step 3: Commit**

```bash
git add docs/runbooks/person-deletion.md
git commit -m "Warn the deletion runbook about the case its labels get wrong

The join-line candidates are matched by body text across the whole product,
with no id, and the confidence label is computed from whether the person being
deleted is tied to that group, not from whether the line is theirs. So two
same-named people in one group produce a candidate labelled definitely them,
defaulting to yes, that belongs to somebody else.

deletion-plan.ts's own comment says the doubtful tier is the only one where
confirming would delete an innocent person's line. That is wrong, and this is
the gap. The code is not changed here; scoping that query is its own queued
item."
```

---

## Finishing the branch

- [ ] **Run the full suite:** `npm test`. Expected 1884 passed of 1884 across 158 files (1880 baseline, plus three from Task 1 and one from Task 3). Report the real numbers.
- [ ] **Run the production build:** `npx next build --webpack`. Expected exit 0. This gate exists because three deploys failed on 4 Sept 2026 while four suites stayed green: vitest does not typecheck, and Vercel runs `tsc`. Use webpack rather than Turbopack if this is running in a worktree, since Turbopack refuses a symlinked `node_modules`.
- [ ] **Request an independent read-only review of the assembled diff.** Per-task reviews do not substitute: a per-task reviewer cannot see how the pieces interact. The reviewer treats the implementer's report as unverified claims.
- [ ] **Write the build-notes §11 entry**, 400 to 600 words, and update `CLAUDE.md`'s "Where the build is" section.
- [ ] **Open the PR and stop.** Do not merge. The PR body is near 300 words and must explicitly carry the two things the spec names: that connected-but-no-internet is uncovered by decision, and that nothing here has been seen working against a real phone losing real signal.
- [ ] **The chat message carries the QA script**, including the airplane-mode pass, which is the only way this slice's main change can be checked at all.

---

## Self-review notes

**Spec coverage.** All five spec tasks map to plan tasks 1 to 5. The spec's verification plan maps to Task 1 steps 4/8, Task 2 step 2, Task 3 steps 2/6, and the finishing checklist's build step. The spec's debt section is carried into the build-notes entry on the finishing checklist.

**One place this plan goes beyond the spec, flagged rather than smuggled.** The spec's Task 5 said to warn that candidates are matched by text so the operator should confirm the group. Reading `deletion-plan.ts` during planning showed the specific dangerous case is narrower and worse than that: the high-confidence tiers, which default to yes, are wrong in exactly the two-same-named-people-in-one-group case, and the code's own comment claims otherwise. The warning is written to that case instead. Same file, same one paragraph, no code change; the scope did not grow, the accuracy did.
