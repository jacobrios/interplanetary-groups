# Second-group entry point

*Slice document. The front section was written 1 September 2026 before any code
and before the design rounds ran; the task-by-task half was added the same day,
after the round 13 handoff was pulled and described back.*

---

## Settled, do not relitigate

The owner settled all three product questions on 1 September 2026. Two of the
three answers overruled the recommendation put to him, and both were right.

**Tapping the Orbit mark always goes to a home screen listing your groups**,
whatever number you belong to, and that screen also carries a way to start a new
group. **Arriving at the site cold behaves differently on purpose**: nobody goes
to the pitch, one group sends you straight into it with no tap, two or more shows
the home screen because the product genuinely does not know which one you meant.

Those two destinations are welded together today, and pulling them apart is the
whole trick. The first recommendation put to the owner fused them, which made a
list-of-one look like a tax charged to every ordinary member on every arrival. It
is not: the only person who lands on a list-of-one is the person who chose to tap
Orbit. The owner saw this before the recommendation did.

**The create action lives on the home screen and nowhere else.** A quiet link on
the group info page was proposed and the owner declined it as undiscoverable and
out of place, which it was.

**Scope guard, and it is firm:** the home screen says *which groups you are in*,
never *what is happening in them*.

---

## Non-goals

- **The multi-group home.** Out of scope for MVP by CLAUDE.md, and this slice does
  not quietly become it. Concretely barred from a row: next-event or upcoming-plan
  previews, unread counts, needs-you badges, member counts, activity summaries.
  Those belong to the multi-group home fast-follow, build-notes §8.
- **A group-info entry point.** Considered and declined by the owner; it belongs
  nowhere now that the home screen carries create.
- **Merging duplicate identities.** Untouched. Still audit finding 10.
- **Any change to how a group is entered from a link.** Invite links and digest
  emails point at a specific group and bypass all of this. They stay as they are.

---

## How this will be verified, written before any code

- **Unit tests on the destination logic**, which is where the real behavior lives.
  The three arrival cases (none, one, several) and the always-list case for the
  Orbit button. `src/lib/nav/front-door.ts` already has a test file; this extends
  it rather than starting one.
- **A component test on the list**, scoped honestly: the repo can test shared
  components and cannot test server-rendered screens. So the row list gets a test
  and the page does not.
- **A browser pass is mandatory here and is not optional dressing.** Build-notes
  records that the several-groups front door has *never been seen in a browser*,
  because no dev-test user has ever belonged to more than one group; it is covered
  by unit tests only. That gap is this slice's to close.
- **Therefore a seed script is part of the work, not an afterthought.** Something
  has to put one dev-test person into two and then several groups. It only adds
  rows, so it is safe alongside the concurrent site-health session sharing the
  dev-test database.
- **A real-phone pass**, because this is a new screen in a mobile-first project,
  which is one of the two triggers for it.
- **Deliberately not tested:** the visual match. That is a human gate against the
  rendered screen beside the design, per the standing rule.

---

## Debt this slice is expected to open

- **A screen that always exists is a screen that invites filling.** The scope guard
  above is prose, not a mechanism. Nothing stops a later slice adding a next-event
  line to a row except somebody reading this document.
- **`resolveFrontDoor` stops being one question and becomes two** (where do I land,
  what is the list). If that lands as two functions it is clean; if it lands as one
  function with a flag, that is the thing to watch in review.
- **The list is unbounded.** Nobody in this product has more than a handful of
  groups and there is no pagination. Fine today, named so it is not a surprise.

---

## Findings that shaped this, recorded because they are not obvious

**The control is not missing, it is wrong.** The group home header's Orbit mark
already links to `/`, and `/` redirects to your most recently joined group. So for
someone in two groups it does one of two unhelpful things: from the newest group it
bounces straight back, and from the older group it silently drops you into a
different group. The seat was held for the multi-group home and something wrong is
sitting in it. This slice repairs an active defect, not only an absence.

**No migration, confirmed.** Many-to-many from day one. `Membership` already
carries `userId`, `groupId`, `joinedAt`, and `lastSeenAt`. Nothing here needs a
column, so this slice creates no production deploy obligation and does not break
the concurrency assumption it was started under.

**`lastSeenAt` exists and is a better ordering key than `joinedAt`.** It arrived
with the digest plumbing slice. "Most recently opened" beats "most recently
joined" both for ordering the list and for the several-groups arrival case, and it
is free. Open for the implementation to take or leave with a reason.

**The emblem costs nothing.** Group emblems are initials derived from the group's
name (`src/lib/groups/initials.ts`), already built and already on the group info
page. A row can carry one with no new data and no new query.

---

# Task-by-task detail

*Written 1 September 2026, after the round 13 handoff was pulled and described
back and the owner settled the create treatment. The design is settled; what
follows is the build.*

## The design, as settled

**Round 12 established the screen**, round 13 settled its one unresolved element,
and the owner made two calls across them.

**Name only. The emblem is dropped.** The eight-group frame argued against its
own emblem version honestly: "Climbing Crew" and "Cooking Club" both derive the
initials CC, so the name does the telling regardless. Eight lime circles under a
header that already carries a lime Orbit mark also turns a brand moment into list
decoration. The emblem keeps group info, where it is a single identity moment.

**Create takes V1's position and half of V3a's weight.** Position first: it sits
*above* the list, in its own section, because the owner missed it entirely at the
bottom of round 12 and his reading is that negative space between two decisions
loses the lower one. Weight second, and this is the part that is not on any board:
V1 as drawn is the round 12 button relocated and *not restyled*, so on its own it
does not answer the half of the miss that was faintness. V3a's full recipe would
have, but it fills the button and gives it a row's shadow, which at the top of the
screen reads as a group you are in. So the build takes the half that does not
collide: **border stepped from `--hairline` to `--text-faint`, label to weight
700, background stays transparent.** Every real group is filled; this is not.

**No teal anywhere on this screen, and that is correct rather than a gap.** Teal
marks actions; this screen's primary interaction is navigation, which is the same
category as back links and exits, and those are non-teal by rule. The only place
teal could go here is create, the rarest thing on screen, which would invert the
hierarchy. Verified rather than asserted: `/signin` already carries zero teal, so
a teal-free screen is not a first.

**The screen, top to bottom:** Orbit mark in the slot it was tapped from, beside
the "Interplanetary Groups" wordmark (identity, not navigation, and there is
nothing to go back to). Then the create control. Then a small tracked "Your
groups" eyebrow, which fences the list so nothing above the label reads as a
group. Then the rows: raised fill, hairline border, 14px radius, name at
`--type-heading` weight 800, no chevron, nothing else. A pill-shaped create
against rectangular rows is the second thing keeping the two apart.

## Decisions the handoff does not hold, settled here

- **List order: most recently opened first.** `Membership.lastSeenAt`, already
  written by `markGroupSeen`, descending, with never-opened groups after opened
  ones, then `joinedAt` descending, then `groupId` for a stable tie-break. The
  design shows names in no particular order and with eight rows the order is the
  screen. Recorded as this slice's call, not the design's.
- **Zero groups at `/groups` redirects to `/`.** Unreachable by tapping Orbit,
  but reachable by typing, and an empty list with a create button is a worse
  answer than the front door's own pitch.
- **The scroll fade appears when the list actually overflows**, never at a row
  count. The board applies it by hand and its prose says "past roughly seven
  rows"; seven is not a condition a computer can evaluate, and at large device
  text three rows already fill the screen. A count would lie in both directions.
- **`text-wrap: balance` is taken for row names only.** The round 13 README calls
  it system-wide going forward; that is a design-system intention, not this
  slice's mandate, and widening it is out of lane.

## Tasks

### Task 1: Teach the destination logic about the list

Tests first, extending `src/lib/nav/__tests__/front-door.test.ts`, which already
covers none / one / several / tie-break / no-mutation.

`resolveFrontDoor` currently answers one question and must answer it differently:
several memberships stop resolving to a guessed group and resolve to the list.
Add a `{ kind: "groups" }` destination. The existing "most recently joined" sort
does not survive as the answer for several, but the tie-break discipline it
carries does, so read it before deleting it.

Watch for, and flag in review rather than solving quietly: this function is now
close to answering two questions (where do I land, what is in the list). If the
ordering lands here it should be its own exported function, not a flag on this
one.

**Verification:** the extended test file passes, and the previously passing
"several groups" case is *changed* rather than added to, so it fails first
against the old behavior. Show it failing.

### Task 2: The ordering function

New, its own unit, tests first: takes memberships carrying `lastSeenAt`,
`joinedAt` and `groupId`, returns them ordered per the rule above. Cases: all
opened, none opened, a mix, a `lastSeenAt` tie, a `joinedAt` tie inside it, and
non-mutation of the input array (the existing file establishes that habit).

### Task 3: The list component

A shared component under `src/components/`, because the repo can test components
and cannot test server-rendered screens, and this is the part worth a test.

Rows are real links to `/groups/[id]`, never divs with a click handler. Name only,
`--type-heading` weight 800, `text-wrap: balance`, wrapping rather than clipping
at any device text size. The create control is a link to `/create` styled as
settled above. Keyboard focus follows whatever the app's existing links do; match
`GroupHomeHeader` and `BackLink` rather than inventing a treatment.

**Verification:** component test covering a one-group list, a several-group list,
row hrefs, the create link's href, and that a long name is not truncated. The
long-name case is the one the design was corrected for; it earns a test.

### Task 4: The route

`src/app/groups/page.tsx`, a server component. Current user, memberships with the
group's name, ordered by task 2, rendered by task 3. Zero groups redirects to `/`.
`redirect()` throws to unwind the render, so it must not sit inside a try/catch;
`src/app/page.tsx` carries that warning already and the same rule applies here.

Members-only is not a new concern: a person only ever sees groups they belong to,
because the query is keyed to their own memberships. No wall needed, and no new
privacy surface. Say so in the PR rather than leaving a reader to wonder.

### Task 5: Point the Orbit mark at the list

`GroupHomeHeader.tsx`: `href="/"` becomes `href="/groups"`, and the `aria-label`
stops saying "Home". The label matters more than it looks; the comment in that
file records that the subline deletion made the aria-label the link's only
accessible name.

This is the task that repairs the existing defect. Before this, a member of two
groups tapping the mark either bounced back where they were or was dropped into a
different group with nothing saying why.

**Leave the dead-end screens alone.** "Take me home" on the not-found and error
screens still points at `/`, which is correct: those are reachable by someone with
no groups at all, and `/` is the destination that handles every case.

### Task 6: The front door's several-groups branch

`src/app/page.tsx` sends the new `groups` destination to `/groups`. One group and
zero groups are unchanged, which is the whole point of splitting the two
questions: arriving cold still costs a single-group member nothing.

### Task 7: QA staging script

`scripts/qa-stage-yourgroups.ts`, following the `qa-stage-*` convention already in
`scripts/`. It must put one dev-test person into several groups with a spread of
`lastSeenAt` values including at least one never-opened, and at least one long
three-word name, because that is the case the design was corrected for.

Additive only: it creates rows, never deletes, because the dev-test database is
shared with a concurrent session. Run `npm run db:which` before it touches
anything.

This is not optional tooling. Build-notes records that the several-groups front
door has **never been seen in a browser** because no dev-test user has ever
belonged to more than one group. Nothing else in this slice can be honestly
verified without it.

### Task 8: Browser pass, then a real-phone pass

Browser first: every state the design draws (one group, several, enough to
overflow), the Orbit round trip from inside a group and back, the create link, and
a long name rendering wrapped rather than clipped.

Then the phone, on the machine's LAN address, because this is a new screen in a
mobile-first project, which is one of the two triggers for that pass. The one
thing only the phone can answer is the question this whole round was about:
**is the create control findable.** If the answer is no, the heavier border was
not enough and that is a finding, not a failure.

Stop the dev server afterwards, whoever started it.

### Task 9: The record

Build-notes §11 entry, and CLAUDE.md's current-state section updated to say what
is now true: the Orbit mark is a real home button, the front door no longer
guesses, and the multi-group home is still out of scope.

CLAUDE.md carries at least two lines this slice makes false, and they must be
struck rather than left to argue against the build: the several-groups placeholder
under "Still missing, and known", and the queued "no way into a second group" item.
The rule is that a slice invalidating a standing line edits it, because the file
loads every session.

## What this slice does not do

No migration, so no production deploy obligation and no new item on the
after-launch list. No change to invite links, digest links, or any path that
points at a specific group. No merging of duplicate identities. And nothing that
turns this screen into the multi-group home: the scope line in the front section
is the test, and a row carrying anything about what is *happening* in a group
fails it.
