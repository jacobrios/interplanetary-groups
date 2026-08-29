# The digest, slice two: the digest itself

Slice branch: `digest-slice-two`, cut from `50cfeed`. Opened 29 August 2026.

**Status: shape and slicing approved by the owner, 29 August 2026. No code written at the time of writing.**

---

## Front section (for the owner)

### Settled, do not relitigate

Two blocks in one email. "Needs you" carries an idea you have not voted on, a
confirmed event you have not RSVP'd to, and a time-change vote you have not
answered; it is built on the card ladder in `src/lib/cards/region.ts`, with the
time-change vote added as a third kind that ladder deliberately does not draw
(decision 2 below). "You missed" carries the message count and last three member
lines since the later of your last visit or our last email. Both blocks empty
means no email. Two send rules, pure date arithmetic: the day a person created
the thing (never an event Orbit auto-created, but yes to a sparked one), and
three days before it happens. Code composes it; no model call. Once a day, in
the hour the group's own clock reads 8pm. One email per group. A dead item is
never emailed. `User.digestOptOutAt` is respected. Subject-line rules in task 7.

### Not in this slice

One email per person across groups (belongs with the queued multi-group home,
which is where a person-level digest first becomes coherent). A real send log
(belongs with whichever slice first has to answer "did it arrive"; this slice
adds a per-member send date, which is a schedule marker, not a log). The unread
divider and scroll restoration in chat (its own queued slice; the digest does
not need it). Per-channel notification preferences (declined, and no seat is
built for them). Event-triggered mail for time-boxed moments (sibling slice).

### How this slice will be verified

**Automated.** The "needs you" derivation, every kind and every already-answered
case, including that a declined idea and a closed gauge never appear. The "you
missed" derivation, including the never-opened member falling back to their join
date and the count running from the later of two dates. The two send rules,
including the recurring-event exclusion and the sparked-event inclusion. The
once-a-day marker refusing a second send in the same group-local day. Subject
composition across all five situations, singular and plural. The one-click POST
endpoint honouring an unsubscribe and the GET redirecting. The race-safe token
helper under concurrent callers, proven by making it fail first. The wall's new
door rendering.

**By hand, in a browser.** The wall's door, the unsubscribe page, and the
one-click endpoint.

**By hand, needing a real inbox, and this is the slice's whole point.** One real
digest to the owner and one to a friend, before anything sends to a group. It
also settles the open question slice one could not: whether the mail service
rewrites the links in the body, unanswerable from a message that had none.

**Deliberately not tested.** The scheduled job's own firing (Vercel's cron is
not ours to test); the rendered appearance of the email in any specific mail
client; and anything that costs money or hits the network, which stays hand-run
under the same rule as the eval benches.

### Debt this slice is expected to open

**Still no send log.** The new `lastDigestSentAt` is a schedule marker, not
evidence of delivery: it records that we tried, never that anything arrived. If
a member says "I never got it," Resend's dashboard is still the only place to
look. Recommend accepting; it is strictly less debt than slice one carried.

**Reputation is unmeasurable from the owner's own inbox.** He clicked "Not
Spam" on the first send, which trains his Gmail about this sender specifically.
Judging whether `updates.` is improving needs a different mailbox. Recommend
accepting and using the friend's inbox as the instrument.

**One email per group, not per person.** Only one group is reachable today, so
this costs nothing yet and becomes real the moment the multi-group home lands.

**The unsubscribe token still never rotates.** Carried forward unchanged from
slice one; blast radius is one person's digest.

---

## The seven decisions the owner settled, 29 August 2026

Recorded here because they were settled in conversation and would otherwise live
only in chat. Numbered as they were asked.

**1. Both unsubscribe tasks are first, race-safety before the button.** Two
instructions each said "first task": the owner's carryover named the token race,
and `CLAUDE.md`'s recorded trigger named the one-click endpoint. They are not in
conflict, both are small, and both sit in the same corner. The owner's ordering
stands because a dead unsubscribe link is worse than a missing button.

**2. The email carries time-change votes even though the card ladder does not.**
`region.ts` draws exactly two labels, and the time-change rung was deliberately
deleted in the card-region-height slice when that vote moved to chat and the
event screen. Options were: carry it anyway, put it back on the cards, or drop
it. The owner chose to carry it. Reasoning: the email stands in for the whole
screen rather than the card strip, and a stalled time-change vote is already the
most invisible thing in the product, which is why it was given an ending in
August. This is a knowing, narrow departure from "the email and the group home
can never disagree", and it must be written into the code that implements it
rather than left for a reader to discover.

**3. The members-only wall gains a way in.** The wall tells a visitor to ask for
an invite link and offers one button, "Start your own group", pointing at
`/create`. A member arriving from a digest on a device holding no session is
therefore invited to found a second group, a cousin of the duplicate-identity
problem the email slice closed. `/signin` already exists and the wall has never
pointed at it; slice one's brainstorm flagged this and left it for whoever built
the thing that would send people there.

**4. What the "you missed" block prints.** Three lines, newest last. **People
only**, for both the count and the quoted lines: Orbit's own messages and the
quiet join announcements are excluded, because anything needing a response is
already in the block above and an email from Orbit quoting Orbit reads wrong.
The accepted cost, stated plainly: a plan Orbit announced that the member has
already RSVP'd to appears nowhere in the digest, which is correct because
nothing about it needs them. A member who has never opened the group has their
read position treated as their join date, so no first digest says "you missed
340 messages."

**5. A duplicate email is worse than a missed one, so the slice spends a
column.** The scheduled job runs hourly and fires in the one hour the group's
clock reads 8pm; a skipped run silently sends nothing that day, a repeated run
sends twice. `Membership.lastDigestSentAt` guarantees at most one a day. The
counter-argument was heard and rejected: it is a stored fact the two send rules
were shaped to avoid needing, but a duplicate email is the single most likely
thing to make somebody unsubscribe.

**6. A sparked event counts as "a person did something".** Rule one excludes an
event Orbit scheduled on its own; an event created by a third yes is not that.
Narrow in practice, since everyone who voted already holds an RSVP, so the only
person it reaches is somebody who never voted at all, which is precisely the
person worth reaching.

**7. Subject lines group by the word the product says, not the backend table.**
The backend holds three separate things (an `Rsvp`, a `GaugeVote`, a
`ProposalVote`), but the product's own language has two words, and the group
home already says "Needs your RSVP" and "Needs your vote". An idea vote and a
time-change vote are both "a vote" to a member. Collapsing everything to "votes"
was considered and declined: it would have the email contradict the screen,
which is the thing decision 2 already stretches as far as it should go.

| Situation | Subject |
|---|---|
| All RSVPs | `Climbing Crew: 2 RSVPs need you` |
| All votes (idea, time change, or both) | `Climbing Crew: 2 votes need you` |
| Mixed RSVPs and votes | `Climbing Crew: 3 things need you` |
| Messages only | `Climbing Crew: 6 new messages` |
| Both blocks | `Climbing Crew: 2 things need you, plus 6 new messages` |

The group name always leads, because on a phone it is often all that survives
truncation and it is what tells a member this is not junk, which matters more
than usual given the first real send was filtered. Digits, never words. Singular
forms are real copy, not an afterthought: "1 RSVP needs you", "1 vote needs
you", "1 new message".

**And the consequence the owner confirmed when it was surfaced.** Under the
settled rules as written, either block having content sends an email, and "you
missed" is suppressed only by opening the group. A member away for a week from a
group that chats daily would get seven emails, each re-reporting messages they
had already been told about. The block therefore counts from **the later of
`lastSeenAt` and `lastDigestSentAt`**, using the marker decision 5 already buys.
A quiet day sends nothing, and the same message is never reported twice.

---

## Implementation plan

> **For agentic workers:** each task below is self-contained. Steps use checkbox
> (`- [ ]`) syntax for tracking. Read the global constraints before starting any
> task; they are requirements of every one of them.

**Goal:** A member with a confirmed email hears, once a day at most and only
when there is something to say, what is waiting for them and what they missed,
and can stop it in one click.

**Architecture:** One new pure composition layer (`src/lib/digest/`) that turns
already-fetched rows into a decided email or into nothing; one new route handler
for one-click unsubscribe; one nullable column with no backfill; one new
isolated step inside the existing hourly cron. No model call anywhere.

**Tech stack:** Next.js 16 (App Router, route handlers), Prisma 7, Vitest 4,
Resend SDK (already wired through `src/lib/email/send.ts`).

### Global constraints

Every task's requirements implicitly include all of these.

- **Never point anything at production.** Run `npm run db:which` and confirm it
  prints `pxbewardwvoyqqcvogel` immediately before any `prisma migrate` command.
  Anything else: stop and report.
- **Migrations are created with `npx prisma migrate dev --name <name>`**, never
  by hand-editing a file in `prisma/migrations/`. A safety-net hook blocks
  direct edits; if it fires, report it as Jacob-built before doing anything else.
- **Database tests use the real dev-test database and build their own
  fixtures**, following `src/lib/auth/__tests__/email-ask.test.ts`: names
  prefixed `[TEST] `, ids collected in arrays, an `afterAll` deleting children
  before parents and calling `prisma.$disconnect()`. The suite must run green
  from an empty database, so never read a row a test did not create.
- **Add no new test dependencies.** Clicks use `fireEvent` from
  `@testing-library/react`. There is no `jest-dom`; assert with `toBeTruthy()`
  on a found element.
- **Component tests carry `// @vitest-environment jsdom` on line 1** (the config
  default is `node`).
- **The `@/` alias resolves to `src/`.**
- **No em-dashes or en-dashes in any user-facing copy.** Orbit's voice is plain
  and warm, roughly a 7th-to-8th-grade reading level.
- **Colour comes from the tokens in `src/app/globals.css`**, never hardcoded
  hex. Nothing renders below the 13px eyebrow floor. (Email HTML is the one
  exception and task 7 says why.)
- **Every service-error branch logs the underlying error before returning.
  Never log an email address.**
- **Run the full suite before each commit.** Baseline recorded on this branch at
  `50cfeed`, before any code: **120 files / 1286 tests, green, zero skipped.**
- **A known intermittent jsdom teardown flake** prints `ReferenceError: window
  is not defined` at teardown roughly one run in six. It never fails a test. Do
  not chase it; if a run is otherwise green, it is green.

---

## Task 1: Make the unsubscribe token race-safe

**Product framing.** Two digests composed for one person at the same moment can
each mint a token, and the one already embedded in a sent email loses. That
member's unsubscribe link is dead forever and nothing anywhere reports it. It
cannot fire today because only a hand-run script calls it; it can the moment a
digest loops over members, which task 8 makes true.

**Files:** `src/lib/email/unsubscribe.ts`,
`src/lib/email/__tests__/unsubscribe.test.ts` (extend).

- [ ] Write a failing test first: two concurrent `ensureUnsubscribeToken` calls
      for the same user must return the same token, and the row must hold that
      token. Prove it fails against the current read-then-write implementation
      before changing anything. If it passes by luck, force the interleaving
      rather than accepting the pass; a test that could not have failed is not
      evidence.
- [ ] Make the write atomic. `updateMany` scoped to
      `{ id: userId, unsubscribeToken: null }` writes only when the column is
      still empty, so a loser writes nothing; then read the row back and return
      whatever it actually holds. The unique constraint on `unsubscribeToken`
      makes a two-winner outcome impossible at the database level, so the read
      back is the authority, never the value this call generated.
- [ ] Keep the lazy behaviour: a user who already holds a token is one read and
      no write.
- [ ] Header comment explaining why this is atomic rather than the obvious
      shape, naming the silent failure mode.

**Verification:** the new concurrency test passing, having been seen to fail.

---

## Task 2: Build the one-click unsubscribe

**Product framing.** Gmail shows no unsubscribe control on our mail today. The
first real send landed in spam, and the unsubscribe button is the main thing
giving an annoyed member an exit that is not the spam button, which is exactly
what damages the reputation of the subdomain the `account.` / `updates.` split
exists to protect. Slice one measured that the header we advertised could never
be honoured and dropped it; this builds the half that was missing.

**The structural constraint that made slice one drop it, and the way around
it.** `/unsubscribe/[token]` is a page route, and a page route and a route
handler cannot share a path, so a POST there returns the page's HTML and writes
nothing. The fix is a separate route handler path that `List-Unsubscribe` points
at instead.

**Files:** new `src/app/api/unsubscribe/[token]/route.ts` and its `__tests__`;
`src/lib/email/send.ts`.

- [ ] New route handler exporting both verbs.
      **POST** performs the opt-out via `unsubscribeByToken` and returns 200 with
      an empty body. It is silent for an unknown token and for somebody already
      opted out, exactly as the existing action is, so a stranger holding a
      guessed token learns nothing from the response.
      **GET** redirects (302) to `/unsubscribe/[token]`, so a human who follows
      the header's URL in a browser lands on the real page with its button.
- [ ] The POST must never require a session. The token is the authorisation,
      and the population this exists for is holding a mail app on a device with
      no session, which is the same reasoning `src/app/actions/unsubscribe.ts`
      already carries.
- [ ] In `send.ts`, point `List-Unsubscribe` at the new route-handler URL and
      re-add `List-Unsubscribe-Post: List-Unsubscribe=One-Click` alongside it.
      Replace the long comment explaining why the header was dropped with one
      explaining why it is now honest, keeping the measurement that produced
      the original decision.
- [ ] The `unsubscribeUrl` input keeps its current meaning (an absolute URL) so
      no caller changes shape; only what the caller passes changes.
- [ ] Tests: POST writes the opt-out; POST with an unknown token returns 200 and
      writes nothing; POST twice does not overwrite the first timestamp; GET
      redirects; and the existing test pinning that opting out never touches
      `ContactMethod.isVerified` still passes.

**Verification:** new tests green, plus a hand-run POST against a local build
returning 200 and the row actually changing (the check slice one's review ran
and failed).

---

## Task 3: Point the members-only wall at the door that exists

**Product framing.** A digest arrives on a phone. Tapped on a device holding no
session, it lands on a screen that says to ask someone for an invite link, under
a button offering to start a second group. `/signin` has existed since 27
August. Without this, the digest reliably dead-ends the exact people it exists
to bring back, and offers to duplicate them on the way out.

**Files:** `src/components/MembersOnlyWall.tsx`, its `__tests__`.

- [ ] The note gains a way back for somebody who has been here before, in
      Orbit's voice, without promising anything to somebody who has never
      attached an email (many members have not, and it is optional forever).
      Proposed copy, adjustable in review: *"This group is invite-only. If you
      know someone in it, ask them for the invite link, it'll bring you right
      in. Been here before? You can sign in with your email."*
- [ ] `/signin` becomes the screen's link. **"Start your own group" must not
      remain the primary way out of this screen**, which is the actual defect;
      whether it stays as a quieter secondary link is a judgement call for the
      implementer to make and state, not to make silently.
- [ ] The screen still reveals nothing about the group: no name, no member
      count, no confirmation the URL is real. Verify this has not regressed.
- [ ] Delete the now-false header comment claiming this line is the way back
      "until email sign-in exists". It exists.
- [ ] Test: the sign-in door renders and points at `/signin`. Break it once to
      confirm the test could have failed.

**Verification:** test green having been seen to fail, plus the screen viewed in
a browser during the QA pass.

---

## Task 4: What is waiting for you

**Product framing.** The block that makes the email worth opening. It must never
name something already answered, already dead, or already promoted, because a
digest that asks for an answer somebody has given is worse than no digest.

**Files:** new `src/lib/digest/needs-you.ts` and `__tests__`.

- [ ] Pure module: rows in, decided items out. It queries nothing and stores
      nothing, following `src/lib/pending/derive.ts` and `src/lib/cards/region.ts`.
- [ ] Three kinds, each carrying a title, a when-line, the label the group home
      would use, and a URL:
      **Event needing an RSVP** via `eventNeedLabel` from `region.ts`, unchanged.
      **Idea needing a vote** via `ideaNeedLabel` from `region.ts`; a viewer who
      declined (`OUT` or `NOT_THAT_DAY`) drops the item exactly as the card does,
      and `Needs other votes` is excluded, because this block is the viewer's own
      outstanding list.
      **Time-change vote** the viewer has not answered. `region.ts` has no rung
      for this and must not grow one; the label is composed here.
- [ ] **Write the decision-2 departure into this file's header**: the ladder is
      the source for two kinds, the third is added here deliberately, the card
      region does not draw it, and that is a settled owner decision rather than
      drift. A future reader must not "fix" this by deleting it or by putting the
      rung back.
- [ ] Liveness is not re-derived. Feed this `findLiveGauges` and
      `findLiveProposals` output, which already decide what is still open and
      answerable, so "a dead item is never emailed" holds by construction rather
      than by a second opinion that could disagree with the screen.
- [ ] Ordering: date order, soonest first, same as the card region.
- [ ] Tests, each its own case: an unanswered event appears; an answered one does
      not; an unvoted idea appears; a declined idea does not; an idea the viewer
      is IN on does not (it needs other people, not them); an unanswered
      time-change vote appears; an answered one does not; a closed gauge and a
      lapsed proposal never appear.

---

## Task 5: What you missed

**Product framing.** The reason a member who has drifted away opens this at all.
Its whole risk is saying something untrue about how much they missed, in either
direction.

**Files:** `prisma/schema.prisma` plus a migration; new
`src/lib/digest/you-missed.ts` and `__tests__`.

- [ ] **The migration lands here, not in task 6, because this is the first
      consumer.** Add `Membership.lastDigestSentAt DateTime?`, nullable, no
      backfill. Doc comment stating plainly that it is a **schedule marker, not
      a send log**: it records that a send was attempted, never that anything
      arrived. It does two jobs, and both belong in that comment: it is half of
      the read position below, and it is task 6's once-a-day guard.
- [ ] Read position is **the later of `Membership.lastSeenAt` and
      `Membership.lastDigestSentAt`**. Both null falls back to
      `Membership.joinedAt`.
- [ ] Count and lines are **`MessageAuthor.MEMBER` only**. Orbit's own messages
      and `SYSTEM` join announcements are excluded from both, per decision 4.
- [ ] Three lines, newest last, each carrying the author's name and the body.
      Truncation of a long body belongs to task 7, which owns rendering; this
      module returns whole bodies.
- [ ] Suppressed entirely (returns nothing) when the count is zero.
- [ ] The viewer's own messages do not count as missed.
- [ ] Tests: the later-of-two-dates rule, both orderings; the never-opened
      member falling back to join date; Orbit and join lines excluded from count
      and lines; the viewer's own messages excluded; fewer than three messages
      returning what exists; zero returning nothing.

---

## Task 6: Who gets one today

**Product framing.** The task that sets the product's noise level, and the one
worth testing hardest. Everything else decides what an email says; this decides
whether a person hears from us at all.

**Files:** new `src/lib/digest/schedule.ts` and `__tests__`. The column this
task guards on was added in task 5; do not add it twice.

- [ ] **Rule one, "the day a person created it", group-local.** Applies to an
      idea and to a time-change ask. Applies to a **sparked** event (decision 6).
      Never to an event `reconcile.ts` created, identified the way
      `upcoming-list.ts` already does it, by the **absence of a `gaugeId`**, not
      the presence of a `scheduledKey`; the comment there explains why, and this
      code must not invent a third way of asking the same question.
- [ ] **Rule two, "three days before it happens", group-local.** Applies to
      anything with a date, both kinds of event and an idea's proposed day.
- [ ] **What the rules gate, stated unambiguously because the two readings build
      different products.** The rules gate the "needs you" block only. If no rule
      fires today, that block is empty; if one fires, it carries **everything
      currently outstanding**, not just the item that triggered it, because if we
      are mailing somebody anyway a partial list is a worse email for no gain.
      The "you missed" block is **not** gated by the rules: it stands on its own,
      so a member who missed real conversation hears about it on a day no rule
      fired. An email goes when either block has content, which is the settled
      "both blocks empty means no email" read forwards.
- [ ] The once-a-day guard: refuse when `lastDigestSentAt` already falls inside
      the current group-local day. Follow the group-local-hour pattern
      `BUMP_LOCAL_HOUR` and `getLocalParts` already establish; do not invent a
      second way of asking what time it is somewhere.
- [ ] `User.digestOptOutAt` non-null means never, checked here so no caller can
      forget.
- [ ] Tests: each rule firing and not firing on adjacent days; the recurring
      exclusion; the sparked inclusion; the once-a-day guard refusing a second
      send in the same group-local day and permitting one the next; opt-out
      refusing; a group in a non-UTC zone where the local day and the UTC day
      disagree, which is where this breaks if it breaks.

---

## Task 7: The email itself

**Product framing.** The subject line is the entire product surface in an inbox
and decides whether this is opened or reported. The body has one job beyond
saying what is waiting: getting the member back into the group in one tap.

**Files:** new `src/lib/digest/compose.ts` and `__tests__`.

- [ ] Subject exactly as decision 7 specifies, all five situations, singular and
      plural. Group name always first.
- [ ] Body in plain text and HTML, both carrying the same information. Email
      HTML is the one place the design tokens do not reach (mail clients do not
      support custom properties and many strip `<style>`), so use inline styles
      with literal values and **say so in the header comment**, or a future
      reader will read it as carelessness.
- [ ] Order: "needs you" first, "you missed" second, one link into the group,
      then the unsubscribe link. The link into the group is the same absolute
      URL a member would otherwise have to find.
- [ ] Truncate a long quoted message to one line's worth with an ellipsis. Never
      truncate mid-word if avoidable.
- [ ] Both blocks empty returns **nothing**, not an empty email. This is the
      rule that makes a daily cadence safe and it belongs here as well as in
      task 8, because a caller that forgets it must still be unable to send an
      empty digest.
- [ ] The unsubscribe URL is built from `ensureUnsubscribeToken` and points at
      the task 2 route handler.
- [ ] Tests: all five subject situations; singular forms; both bodies carrying
      every item; the empty case returning nothing; a truncated line; the
      unsubscribe link present in both bodies.

---

## Task 8: The daily job

**Product framing.** Where it becomes a real product behaviour instead of a
library. The failure that matters here is not a crash, it is one group's bad
data silently costing every other group its digest, which is exactly the bug the
pre-deploy slice fixed in Orbit's own sweep.

**Files:** new `src/lib/digest/run.ts` and `__tests__`;
`src/app/api/cron/orbit/route.ts`.

- [ ] **Engineering choice, recorded rather than asked about:** this rides the
      existing hourly cron as a fourth step rather than adding a second
      scheduled task. One schedule is simpler, the hourly cadence is already
      what the group-local-8pm check needs, and the existing job is also what
      keeps the free-tier database from pausing. It gets its own `try/catch` so a
      digest failure can never take down reconciliation, and a per-group
      `try/catch` inside so one group cannot cost the others, returning a
      `failed` result the way `reconcile.ts` does rather than throwing.
- [ ] For each group whose local clock currently reads the digest hour: for each
      member holding a **verified** email (`ContactMethod` where
      `type: EMAIL, isVerified: true`), compose and send. A row only ever exists
      verified, checked in `src/lib/auth/email.ts`, so this is a belt-and-braces
      filter rather than a new rule.
- [ ] Stamp `lastDigestSentAt` **after** `sendEmail` returns, and stamp it for
      every outcome that means "we tried", including `suppressed_dev`. Do not
      stamp when composition returned nothing, because nothing was sent and
      tomorrow must be free to send.
- [ ] Members processed sequentially, matching `reconcile.ts`'s reasoning about
      timing races and low volume.
- [ ] Log a one-line summary per group: how many members considered, how many
      sent, how many skipped and why. Never log an address.
- [ ] Tests with `sendEmail` mocked: a member with nothing gets no email; a
      member with something gets one; an opted-out member gets none; a member
      with no verified address gets none; a group throwing does not stop the next
      group; the marker is stamped on send and not stamped on no-send.

---

## Task 9: Send it for real, and read where the links point

**Product framing.** The task the spam finding earned. Slice one shipped having
never delivered anything; this slice must not ship having never delivered a
*digest*. Sending to the owner and one friend before any group is the whole
point: a digest that lands in spam does not fail, it silently does not work.

**Files:** new `scripts/send-test-digest.ts`, `package.json`.

- [ ] Hand-run, never in the suite, same rule as the eval benches and
      `scripts/send-test-email.ts`, which is the pattern to follow.
- [ ] Composes a **real** digest for a named member of a named group through the
      real composition path, so this proves the product's own output rather than
      a fixture that resembles it.
- [ ] Refuses to run against production, and prints which database it is on
      before doing anything.
- [ ] Run it to the owner's address, then to one friend's address with that
      address added to `EMAIL_DEV_ALLOWLIST`.
- [ ] **Read where the links in the delivered message actually point.** This
      settles the question slice one could not: the first test message had no
      body links, so nobody knows whether the service rewrites them. A digest is
      almost entirely links. Record the answer either way.
- [ ] Record, in the PR and the decision entry: whether it arrived, which folder
      it landed in for each recipient, and where the links pointed. The friend's
      inbox is the usable instrument, since the owner's Gmail has been trained
      by a "Not Spam" click.

**This task cannot be faked and its result is not optional.** If the send does
not happen, the PR says so in those words.

---

## Task 10: Write the records

**Product framing.** The slice is not done until a future session can find out
why it is shaped this way without asking.

**Files:** `docs/build-notes.md`, `CLAUDE.md`, this document.

- [ ] A §11 entry: what the slice built, the seven decisions with their
      reasoning, what the real send actually showed, and the debt above. Target
      400 to 600 words; declare a deviation if it runs longer and say why.
- [ ] **Rows on "Where Orbit decides to speak or stay quiet" for the digest.** A
      daily email is the largest new speaking decision the product has added, and
      `CLAUDE.md` requires every slice that adds one to add its line. One row per
      trigger, naming when it speaks and when it stays quiet.
- [ ] **The `ProposalSection.tsx:67` row**, if this slice is judged to have
      touched the time-change flow. `CLAUDE.md` carries that as a trigger for
      whichever slice next does. Task 4 reads time-change votes to email them,
      which is a defensible reading of "touched"; the implementer should make
      that call explicitly and say which way they went, rather than letting it
      pass unmentioned.
- [ ] `CLAUDE.md`'s current-state section updated to say what is now true,
      including that "Email reminders are on." is finally honest.
- [ ] Any deploy-time obligation appended to the running pre-deploy list in the
      same PR.
