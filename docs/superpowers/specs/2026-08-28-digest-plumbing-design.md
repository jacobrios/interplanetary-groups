# The digest, slice one: the plumbing

Slice branch: `digest`. Opened 28 August 2026.

**Status: shape approved by the owner, 28 August 2026. No code written.**

---

## Front section (for the owner)

### Settled, do not relitigate

A digest, never an email per message, on any channel, at any stage. It sends
from `updates.`, not `account.`, so spam complaints can never reach login-code
deliverability. One email per group to start, per person later. Code composes
it; Orbit does not write it. Once a day, evening, group-local. Nothing to say
means nothing sent. Two send rules, both pure date arithmetic: the day a person
created the thing (ideas and time-change asks only, never an auto-created
recurring event), and three days before it happens (everything with a date).
**Reversed on 28 August 2026 by the owner: an unsubscribe link is built.** The
per-channel preference model stays declined. Full shape in the section below.

**Baseline, recorded before any code:** 113 files / 1237 tests, green, zero
skipped, matching main at `72013b1`.

### Not in this slice

The digest's content, its copy, and its cron (slice two). The unread divider and
scroll restoration, WhatsApp-style (its own queued slice; the digest does not
need it). One email per person across groups (later, once a second group is
reachable). Event-triggered mail for time-boxed moments (sibling slice, where
the double-notify tension also lives). Per-channel notification preferences
(declined, and no seat built for them).

### How this slice will be verified

Automated: the send seam's result mapping against a mocked Resend client, every
branch including refusal and network failure; the non-production send guard
refusing an address that is not allowlisted, proven by making it fail first; the
read-position write; the unsubscribe write, plus a test pinning that opting out
never changes `isVerified`, because login codes must survive it. By hand, in a
browser: the unsubscribe page and its confirmation. **By hand, needing a real
inbox, and this is the slice's whole point:** one real email, sent by a hand-run
script through the real seam to the owner's real address. Deliberately not in
the suite: it costs money and hits the network, same rule as the eval benches.

### Debt this slice is expected to open

**No send log.** Nothing in our database will record that an email was sent. The
two send rules are pure functions of stored dates and need no memory, which is
what makes this affordable; the cost is that when somebody says "I never got
it", the only evidence is Resend's dashboard. Recommend accepting: a send log is
cheap to add later and expensive to design blind.

**`updates.` starts with no sending reputation**, so the first digests may land
in spam. Unavoidable, and exactly what the subdomain split was for.

**The unsubscribe token never rotates**, so forwarding a digest hands over the
ability to unsubscribe that person. Recommend accepting: blast radius is one
person's digest.

**A new deploy-time obligation:** the `updates.` sending domain, its DNS, and
`RESEND_API_KEY` in Vercel.

---

## The digest's settled shape, recorded here because slice two inherits it

None of this is built in slice one. It is written down because slice one's
seams are shaped by it, and because it was settled in conversation and would
otherwise live only in chat.

**Two blocks in one email.**

*Block A, "needs you."* An idea you have not voted on, a confirmed event you
have not RSVP'd to, a time-change vote you have not answered. **Sends whether or
not you opened the app**, by the owner's instruction: this is the only
notification channel the product has, and the whole point is to pull people
back. Built on `src/lib/cards/region.ts`, the ladder that already draws NEEDS
YOUR RSVP and NEEDS YOUR VOTE on the cards, so the email and the group home can
never disagree about what is waiting for you.

*Block B, "you missed."* The message count since you last opened the group, the
last few lines, and a link in for the rest. **Suppressed entirely if you have
opened the group since the newest message.**

**Both blocks empty means no email.** That single rule is what makes a daily
cadence safe.

**The two send rules, and why rule one excludes recurring events.** Rule one is
"the day it was created", and it applies only to things a person did: an idea
floated, a time change asked for. Rule two is "three days before it happens",
and it applies to everything with a date. The exclusion was the owner's call
after a fact was checked rather than assumed: `upcoming-list.ts:39` matches on
`startsAt >= now`, so the next Saturday climb is created on Saturday, about an
hour after the current one starts. Rule one applied to it would email the group
that same evening asking them to RSVP for a climb six days out, on the one day
nobody needs reminding that this group climbs. Rule one means "a human did
something, go weigh in"; an event Orbit scheduled is not news.

**What that costs a member.** A group with a weekly climb and nothing else
happening gets one email a week, on Wednesday. An idea floated Monday for
Thursday produces one email, not two, because creation day and three-days-before
are the same evening.

**A dead item is never emailed.** An idea floated at 6pm for tonight may have
closed or become a real event by the 8pm send. Only items still open and
answerable at send time are included.

**Time-change votes need no special case**, checked rather than assumed: they do
not expire on a timer, they stay open until the event starts
(`proposals/endgame.ts`), so both rules apply to them normally.

---

## Two recorded premises this slice corrects

Both were checked against the repo, and both were listed as binding constraints
at the slice's start.

**1. Supabase's 30-emails-an-hour ceiling does not bind the digest.** Supabase
Auth sends only its own auth templates; there is no generic send. The repo has
no Resend dependency and no `RESEND_API_KEY` today, because Resend is purely the
SMTP relay behind Supabase Auth. So the digest must call Resend directly, which
means build-notes' "After launch" item 6, trigger 1, is disarmed: raising
Supabase's hourly limit *before the digest ships* protects login codes only, and
the digest was never going to spend that budget. **Trigger 2 stands unchanged**:
Resend's free tier is 100 a day and 3,000 a month, shared with login codes
because both leave the same Resend account, and it binds around 80 members on a
daily digest. That is a billing decision, not an engineering one.

**2. "Configure it on both Supabase projects" does not bite here.** Nothing
about the digest is a Supabase setting. Resend sending domains are
account-level, so one setup serves dev-test and production both. The only
two-environment item is the API key, in local `.env` and in Vercel.

---

## Task-by-task

### Task 1 — Correct the record, before anything else

Per the standing rule that a slice whose decision invalidates a recorded one
makes that edit its first task, because the wrong version keeps loading.

**build-notes §11, email sign-in slice, "What was settled with the owner before
the build, compressed".** The clause reading "Unsubscribe: build nothing, and
deliberately build no seat" gets a dated append-only amendment, not an edit:
struck, with a note that the owner reversed it on 28 August 2026 on
deliverability grounds ("we definitely need an unsubscribe link or we're going
to get marked as spam"), and that the *preference model* half of the decision
stands. Name the distinction explicitly, because the original wording collapsed
two different things: a preference model is a settings screen choosing which
kinds of mail you get; an unsubscribe link is one door that stops digests.

**build-notes §8, "After launch" item 6.** Append a dated postscript carrying
correction 1 above: trigger 1's premise was wrong, and why.

**build-notes §8, the email arc entry.** Append a line recording that the
digest's shape was settled on 28 August 2026, pointing at this document.

No code. This task ends with a commit.

### Task 2 — The read position

**Schema.** `Membership.lastSeenAt DateTime?`, nullable, no backfill. On
`Membership` rather than `User` because it is a fact about a person *in a
group*, and the many-to-many model has been load-bearing since day one. A null
means "never opened", which slice two will read as "everything is unseen".

**The write.** A server action, `markGroupSeenAction(groupId)`, that sets
`lastSeenAt = now` for the calling member's membership in that group. It must
refuse a non-member, through `src/lib/auth/membership.ts`, like every other
write path. It is fired from the group home on mount.

**Where the call lives, and the thing to check rather than assume.** A write
inside a server component's render can re-run and is discouraged in Next.js 16;
`AGENTS.md` points at `node_modules/next/dist/docs/` and that guide should be
read before choosing. The expected shape is a small client component in
`src/app/groups/[id]/` firing the action from an effect on mount, which keeps
the write off the render path and gives the action its own testable seam. If the
docs point somewhere better, take that and say so in the PR.

**What "seen" honestly means, stated so slice two does not overclaim.** The feed
scrolls to the newest message on mount (`MessageFeed.tsx:104`), with no unread
divider and no saved position. So `lastSeenAt` records that the member opened
the group, not that they read every message above the fold. It errs toward
*under*-notifying: we will assume they saw things they may not have, and stay
quiet, rather than mail them about messages they already read. That is the safe
direction and it is the reason the cheap column is enough.

**Tests.** The action writes the timestamp for a member; refuses a non-member;
is idempotent on repeat calls. Mocked prisma, no database.

### Task 3 — The Resend sending seam

**`src/lib/email/send.ts`.** The one place the app talks to Resend, and
deliberately the sibling of `src/lib/auth/email.ts`, which build-notes calls the
stronger of the product's two claim-to-fact boundaries. Copy its mechanism, not
just its spirit: a normalized discriminated result, never a raw service
response, so no caller ever branches on Resend's own shape.

```
sendEmail({ to, subject, text, html }): Promise<SendResult>
type SendResult = "ok" | "invalid_address" | "rate_limited" | "service_error" | "suppressed_dev"
```

`suppressed_dev` is a success, not a failure: it means the guard below did its
job, and no caller may treat it as an error or retry on it.

It never throws. Every `service_error` branch logs the underlying error before
returning, per the lesson `create-group.ts:73` cost two hours of the production
deploy. **It never logs the address**, matching the rule already written into
`auth/email.ts`.

**Dependency.** Add `resend`. Alternative considered and worth one line in the
PR: a bare `fetch` to Resend's REST API, no dependency at all. Recommend the SDK
for its typed errors; the seam is thin enough that swapping later is contained.

**Env.** `RESEND_API_KEY`. The from-address is a module constant,
`Orbit <orbit@updates.interplanetarygroups.com>`, not an env var: it is a
product decision, not a deployment one, and an env var would let the two
environments silently disagree about who the mail is from.

**The dev-send guard, and this is the part that matters most.** The dev-test
database holds QA rows with real addresses in them. A local run that sends for
real is one command away from mailing a real person from a half-built feature.
So: when `VERCEL_ENV !== "production"`, `sendEmail` sends **only** to an address
listed in `EMAIL_DEV_ALLOWLIST` (comma-separated), and returns `suppressed_dev`
for anything else, logging the fact. Unset allowlist means nothing sends. The
guard is the first thing the function does, before the API key is even read.

**Tests.** Every result branch against a mocked client, including a thrown
network error mapping to `service_error`. The guard: a non-allowlisted address
in non-production returns `suppressed_dev` and never calls the client, and an
allowlisted one does call it. **Write the guard test first and show it failing**,
because a guard that was never seen to refuse is not evidence of anything.

### Task 4 — The unsubscribe door

**Schema.** This is the slice's second migration; task 2 holds the first. They
stay separate rather than being merged into one, so that either task can land or
be reverted without dragging the other's column with it. Two columns on `User`,
both nullable, no backfill:
`digestOptOutAt DateTime?` and `unsubscribeToken String? @unique`. The token is
generated with `randomUUID()` from `crypto`, exactly as `reset-invite.ts:34`
does, so one link can never be guessed from another. It is generated lazily, the
first time a digest is composed for that person, so ordinary use of this slice
writes no token rows. **Task 5's script is the one exception and deliberately
so:** it generates a token if the recipient has none, so the one real email this
slice sends carries a real, working unsubscribe link rather than a stub.

**Why on `User` and not `ContactMethod`:** it is a decision about a person, and
it must be readable without touching the address row, so that nothing in the
digest path has a reason to load an address it does not need.

**Scope, stated because the two halves differ and could be read either way:**
digests are sent per group, but unsubscribing is per person and stops digests
for **every** group they are in. That is what somebody means when they click it,
and offering a per-group choice would be the preference model by the back door.

**The route.** `/unsubscribe/[token]`.

- **GET renders a page with one button.** It writes nothing. This is not
  ceremony: mail clients and security scanners prefetch links, and a GET that
  mutates would unsubscribe people who never clicked.
- **POST performs the write** and renders the confirmation.
- An unknown or already-used token renders the same confirmation rather than an
  error, because "you are unsubscribed" is true either way and a stranger should
  learn nothing from the difference.

**The rule the tests must pin: opting out never touches `ContactMethod.isVerified`.**
Login codes are transactional, they leave through `account.`, and a member who
stops wanting digests must still be able to sign in. This is the one way this
task could quietly break the slice that shipped last week.

**Copy**, in Orbit's voice, plain and warm, no em-dashes: the page says what
stops (group digests) and what does not (sign-in codes), and says the group info
page is the way back. No survey, no "are you sure", no alternatives offered.
That is the anti-clutter brand applied to the exit as well as the entrance.

**Header.** The seam sets `List-Unsubscribe` and `List-Unsubscribe-Post` on
every digest, pointing at this route, so mail clients can offer their own
unsubscribe control instead of a member reaching for the spam button. Costs
nothing and is most of what protects the `updates.` reputation.

**Tests.** GET writes nothing; POST sets `digestOptOutAt`; POST leaves
`isVerified` untouched; an unknown token renders the confirmation and writes
nothing.

### Task 5 — The proof, and the checklist

**`scripts/send-test-email.ts`**, hand-run, taking an address on the command
line and sending one real message through the real seam. Registered as
`npm run email:test`. Deliberately outside the test runner, same reasoning and
same shape as `eval:detect` and `eval:onboarding`: it costs money and hits the
network. Its output is the evidence pasted into the PR, and it is the only thing
in this slice that proves the pipe works end to end.

**Append to build-notes §8's "After launch" list**, per the rule that a slice
creating a deploy-time obligation records it in the same PR:

1. Add `updates.interplanetarygroups.com` as a sending domain in Resend, and
   verify its DNS. Vercel wrote the records itself last time, because the domain
   was bought through Vercel; expect the same and check rather than assume.
2. Set `RESEND_API_KEY` in Vercel production environment variables.
3. Set `EMAIL_DEV_ALLOWLIST` in local `.env` to the owner's own address.
   Deliberately absent in production, where the guard does not apply.

*Not on the list, and the entry should say why so nobody adds it later out of
superstition:* nothing needs configuring in either Supabase project, and raising
Supabase's hourly email limit is not a prerequisite for the digest. See the
premise corrections above.

**Update CLAUDE.md's "Where the build is"** with what is now true, per the rule
that a slice is not done until it does.
