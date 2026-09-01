# Second-group entry point

*Slice document. Written 1 September 2026, before any code and before the design
rounds have run. The visual build tasks below are deliberately unwritten until
the Claude Design handoff exists and has been described back; everything above
them is settled.*

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

## Task-by-task detail

*Held until the Claude Design handoff has been pulled and described back. Writing
visual tasks before the handoff exists is how a brief starts holding guesses, and
this project has a standing rule against exactly that. The non-visual tasks (the
destination logic, its tests, the seed script) are settled above and can be
written as soon as the owner wants them; the screen itself waits.*
