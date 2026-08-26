# Email sign-in

Slice branch: `email-sign-in`. Opened 25 August 2026.

**Status: design approved by the owner, 25 August 2026. Plan below, no code
written.**

---

## Front section (for the owner)

### Settled, do not relitigate

Anonymous-first stays; email upgrades an identity, it never gates the front
door. Emails are never displayed in the UI, to anyone, including their owner.
Supabase does auth only and its Data API stays off. Production and dev-test are
never crossed. Optional forever, asked twice. A one-time code, not a link. No
merge for identities that already duplicated. Full reasoning in the two round
sections below; do not re-derive it.

**Baseline, recorded before any code:** 97 files / 955 tests, green, zero
skipped, matching main at `a4f7c9f`.

### Not in this slice

Notifications of any kind, including the digest (digest slice). Merging existing
duplicates (the founder's remove button). The rejoin hole (audit finding 10). A
per-member read position (first task of the digest slice). Unsubscribe, and any
seat for it (digest slice). Editing an attached email beyond re-running the
attach flow (the post-MVP edit-path slice).

### How this slice will be verified

Automated: the two-ask eligibility rule as a pure function tested at the
seven-day boundary with injected time; the auth seam against a mocked Supabase
client, every failure branch; a guard test that no email reaches a rendered
surface, proven by making it fail first. By hand here: every screen and failure
state in a browser. **By hand, needing a real inbox:** a code arriving and a
sign-in on a second device. That is reachable on dev-test before Resend exists,
because Supabase's built-in sender delivers to the owner (an organisation
member) and refuses everyone else. Test numbers before and after in the PR.

### Debt this slice is expected to open

The email is stored twice, in Supabase as the credential and in `ContactMethod`
as the app's copy, and they could drift; accepted over a service-role key that
would bypass every protection in the product. A second identity is orphaned
rather than merged when someone signs in while sitting in one, by decision. A
member who mistypes an address they never check cannot see it, by rule, and
re-running the attach flow is the whole recovery. And a new deploy-time
obligation: the Resend account, the DNS records, three Supabase settings.

---

## The notification-channel decision, recorded here because it lived only in chat

Decided in conversation with the owner, 25 August 2026, at the opening of this
slice. **None of it is built here.** It is written down because three decisions
inside this slice are shaped by it, and because a decision that lives only in
chat is a decision the repo does not have.

**The owner wants notifications eventually, and email is one of three channels,
not the only one.**

1. **Calendar. Already built, and never counted as notifications.** "Add to
   calendar" hands a member's own phone a native reminder with no push
   infrastructure and no permission prompt. Its limit is recorded at
   build-notes §6: a saved entry does not update itself when the group later
   moves the plan, so the feed announcement stays the correction channel until
   the post-MVP subscribable feed exists.
2. **Email digest, once or twice a day, summarising chat somebody missed.**
   Explicitly **not** an email per message, at any stage, which is the same rule
   build-notes §6 already states for every future channel and which traces
   straight to the founding complaint about notification noise. Alongside it,
   event-triggered emails for the time-boxed moments, with a "these need your
   action now" block at the top of the digest.
3. **Push. Best for urgency, worst for adoption.** iOS web push requires the
   person to add the site to their home screen first, which is a heavy ask for
   someone who has just tapped a texted invite link. Registered at build-notes
   §8 as a post-MVP fast-follow; the owner separately asked to be reminded,
   after this slice, to weigh web push against a thin native shell that carries
   only push. Three rungs, not two, and nobody is proposing a full native app.

**Why the digest is safer here than it sounds.** Orbit's speaking moments are
already rationed in code, not by convention: one bump then let it die; a gauge
closing two hours before its proposed start; one ask and one guess on a
day-blocked idea. An email channel that mirrors those moments inherits that
discipline rather than needing new rules written for it.

**The tension still to resolve, recorded unsolved.** If an urgent item has
already sent its own email, repeating it at the top of the digest
double-notifies. The clean version is probably that the digest's "needs you"
block carries only what did not warrant its own email. Not settled, and not
this slice's to settle.

**What this slice must not foreclose.** Anything above. In particular the three
decisions named below, each of which is cheap now and a migration or a provider
switch later.

---

## Settled with the owner, 25 August 2026 (round one)

**Q1. Attaching an email is optional, permanently, and Orbit asks twice.**
Optional because "eventually required" is only a gate with a delay on it, and it
would fire while someone is trying to do something else. The owner overruled the
single-ask recommendation: the first ask lands before a member has reason to
trust the product, and the case for reminders gets stronger as the group proves
itself, so a second ask at a later moment is a fair one rather than a nag. Two
asks is the whole allowance; after a second decline Orbit never asks again and
the group info page stays the permanent way in. A decline must be remembered in
data, which needs a field on `User` that does not exist today (surfaced as a
design element with no data home, not added silently).

**Q3. The ask lives on the group home, rendered per viewer, with the group info
page as its permanent home.** The build-notes §3 placement (Orbit asks in chat
after the first RSVP) no longer fits and is amended by this slice. Two reasons it
cannot stand: the group feed is the product's one conversation surface and it is
public, so an ask addressed to one member is clutter for everyone else and
repeats per member; and the only input on that screen is the chat composer, so
answering the ask would post the member's email into the group feed, breaking
"emails are never displayed anywhere in the UI" outright. The §3 *trigger*
survives untouched: the first RSVP is still when "I want a reminder for this" is
true. Only the surface moves. Rendering per viewer rather than posting reuses the
pattern the time-change-ending slice established for the vote confirmation line.
Capturing at onboarding step 3 and the join screen was considered and declined:
it would capture the most, and it is the thing anonymous-first exists to prevent.

**Q4. A one-time code, not a magic link.** (Written as "six-digit" until task 1 measured it at **eight**; see the findings.) A link in an email opens in the mail
app's in-app browser, a different browser with different storage from the one the
person is sitting in. build-notes §3 already names in-app browsers as a session
fragility risk; this points the fix at the same root cause. A code is typed into
the browser they are already in, and it survives the email arriving on a laptop
while the person is holding a phone.

**Q4 / (a). Resend, free tier, and the domain it forces.** Supabase's built-in
sender is unusable, not merely weak: 2 messages an hour, and only to members of
the Supabase organisation, with no delivery guarantee, by Supabase's own docs.
Every real sending service requires a domain the owner controls DNS for, and
`interplanetary-groups.vercel.app` is not one. So **email sign-in forces the
custom domain that deploy decision 2 deferred**; roughly $12 to $20 a year, with
the sending itself at $0. Resend's free tier is 3,000 emails a month and 100 a
day, which covers login codes now and a daily digest to roughly 100 members
later, so transactional-only versus transactional-plus-digest does not change the
choice at this product's scale. One provider, one domain, one bill for both is
the actual reason to pick it, rather than the price. **This is the first
deploy-time obligation since the deploy** and goes on the pre-deploy checklist in
this slice's PR.

**(b). Unsubscribe: build nothing, and deliberately build no seat either.** A
login code is transactional and needs no unsubscribe. The digest will need one.
But an unsubscribe is a per-channel preference and the channels are not decided
(digest, event-triggered, both, separately), so a boolean guessed now is more
likely wrong than right and costs one migration to fix either way. Recorded as a
deliberate decline rather than an oversight, because it is the one of the three
notification-adjacent decisions where "build the seat" is the wrong answer.

---

## Settled with the owner, 25 August 2026 (round two)

**Q1, the second ask fires on the next RSVP at least seven days after the first
ask.** The owner's number, against a recommended fourteen. Nothing else changes:
two asks is the whole allowance, and the field on `User` that remembers the
decline also paces the second ask, so there is no separate machinery.

**Q2. No automatic merge. Prevent the duplicate, and clean up the existing ones
by hand.** Three findings decided it, all verified in the code rather than
assumed. First, the founder's existing remove button already cleans this up:
`deriveRoster` walks the current member list and looks up each person's answer,
so a removed ghost's answers leave every count immediately, today, with no code.
Second, the rejoin hole is real and stays open (audit finding 10: a removed ghost
tapping the invite link again resurrects their old rows). Third, and new: the
cheap merge is unsafe, because `Message.author` is `onDelete: SetNull`, so
deleting a ghost account leaves its chat messages in the feed still marked
`authorType: MEMBER` with no author attached. A safe merge has to reassign every
row individually, which was priced at roughly a third of this slice.

So the fix moves upstream: an invite link tapped by an unrecognised visitor asks
whether they have been here before **before any account is created**. That is
what stops the duplicate at its source, and the set it cannot help (identities
already duplicated) stops growing the day this lands. The two or so in the live
group are removed by hand from the group info page.

**(c). The per-member read position is declined here and becomes the first task
of the digest slice.** The owner's three precedents (many-to-many, venue options,
the invite token) were all expensive to retrofit: a join table plus every query
rewritten, a one-to-many, a unique column needing a backfill. A read position
retrofits as one nullable column on `Membership` with no backfill and no query
changes, so the usual argument does not apply. What actually costs something
cannot be bought early at all: the bookmark is worth nothing unless it is being
written, and writing it means deciding what counts as "read" (opening the group?
scrolling to the bottom?). Deciding that with nothing reading it is a guess with
no way to check it, and every member's value would still be null on the day the
digest ships. It belongs next to the feature that depends on it.

**The app moves to the new custom domain, not only the email sending.** The
domain is being bought for email regardless; attaching it to the Vercel project
is free on the existing plan, the `vercel.app` address keeps working so no
existing invite link breaks, and this is the cheapest moment to do it. This
reverses deploy decision 2's deferral, and the reason it reverses is that the
expensive half of that decision was forced by something else.

---

**The domain is `interplanetarygroups.com`, $12/year, bought through Vercel
(25 August 2026).** `casualgroups.com` was available and considered as insurance
against a branding change; the owner declined to buy it. The name was chosen to
match what a member reads on the join screen seconds before the login email
lands, because a sender that matches the product they just saw reads as
legitimate to a person and to a spam filter. Length was weighed and dismissed:
nobody types this domain, since invite links are texted and tapped and a sender
line is read rather than typed.

Three things settled with it, none of them purchase decisions:

- **Auto-renew on, WHOIS privacy on.** A lapsed domain takes the app's address
  and every login email in the same hour, which is the same shape as the
  free-tier Supabase pause already recorded at the deploy entry: an accidental
  dependency nobody would connect to the symptom.
- **No mailbox.** `no-reply@` only sends. Nothing needs to receive.
- **Send from a subdomain, not the root**, per Resend's own recommendation, to
  keep sending reputation separate from the website's. `account.` carries login
  codes; when the digest arrives it gets `updates.` and its own reputation, so a
  digest that collects spam complaints can never drag login codes down with it.
  This is the first place the recorded notification-channel decision has changed
  a choice inside this slice.

*Raised and deliberately parked: the thing members will actually talk about is
**Orbit**, not "Interplanetary Groups." If branding is ever revisited that is
where to look first. Not this slice's to settle, and nothing here depends on it.*

---

---

# The plan

Eleven tasks. Every task names what proves it. A task that cannot be proven is
not done, and "could not verify" is a complete answer that must be said out loud
rather than skipped past.

**Sequencing note that shapes the whole plan.** Supabase's built-in sender
delivers only to members of the Supabase organisation, and the owner is one. So
the entire flow is buildable and provable on dev-test, with real codes arriving
in the owner's real inbox, before Resend exists. Resend is what lets *anyone
else* receive mail, which makes it a production obligation rather than a
blocker. Task 1 exists to prove that assumption before ten tasks are built on
top of it.

---

## Task 1. Prove the auth mechanism before building anything on it

A throwaway script, run by hand against **dev-test**, that walks the real
Supabase calls end to end and prints what comes back. No UI, no committed code
beyond the script itself under the existing hand-run script convention.

What it must establish, because each one is an assumption the rest of the plan
rests on:

1. An anonymous user can attach an email via `supabase.auth.updateUser({ email })`.
2. **Which `type` `verifyOtp` needs for that confirmation.** The documented value
   for an email change is `email_change`; whether an anonymous user's first
   attach uses that or `email` is *not established* and must not be guessed.
   This is the single most likely place the plan is wrong.
3. That the email template can be made to deliver a **one-time code** rather
   than a link, via `{{ .Token }}`.
4. That `signInWithOtp({ email, shouldCreateUser: false })` refuses an unknown
   address, and what the error looks like, since product copy depends on it.
5. That `verifyOtp({ type: "email" })` returns a session for the **original**
   user, whose `supabaseAuthId` still matches the existing Prisma `User` row.
6. What a rate-limit response looks like, since the built-in sender allows two
   messages an hour and the flow will hit it during development.

**Proves it:** the script's own output, pasted into the task record, plus a code
that actually arrives in the owner's inbox. **If any assumption fails, stop and
re-plan rather than working around it.**

---

## Task 2. The migration

Two columns on `User`:

- `emailAskCount Int @default(0)`
- `emailAskedAt DateTime?`

`ContactMethod` already exists with `type EMAIL`, `isVerified` and `isPreferred`,
has never been written to, and needs no change. That is the seat this project
built early and is now cashing in.

Generated through the Prisma CLI, never hand-edited (a hook blocks direct edits
to migrations, correctly). `npm run db:which` before and after.

**Proves it:** `migrate status` clean on dev-test, and the existing Prisma smoke
test still green.

---

## Task 3. The eligibility rule, as a pure function

`shouldOfferEmail({ user, latestRsvpAt, hasVerifiedEmail, now })` returning
`"first" | "second" | null`. All of the product rule lives here and nowhere else:

- Never, if a verified EMAIL `ContactMethod` exists.
- Never, if `emailAskCount >= 2`.
- **First ask:** `emailAskCount === 0` and the member has at least one RSVP.
- **Second ask:** `emailAskCount === 1`, at least **seven days** have passed
  since `emailAskedAt`, and their latest RSVP is more recent than
  `emailAskedAt`. The freshness check is what keeps the second ask attached to a
  moment when a reminder is actually wanted, and it needs no new field because
  `Rsvp.respondedAt` already exists.

**Proves it:** unit tests at the boundary, including exactly seven days, one
second under, and one second over. Time is injected, never read from the clock,
so the machine's timezone cannot be what makes it green.

---

## Task 4. The auth seam

`src/lib/auth/email.ts`, four functions, each returning a normalized result
rather than a raw Supabase response, so no user-facing branch ever reads raw
model or service output. This mirrors the claim-to-fact discipline
`normalize.ts` already enforces for the model.

- `requestEmailAttach(email)` → `ok | invalid_email | email_taken | rate_limited | service_error`
- `confirmEmailAttach(email, code)` → `ok | wrong_code | expired | service_error`
- `requestSignInCode(email)` → `ok | invalid_email | unknown_email | rate_limited | service_error`
- `confirmSignInCode(email, code)` → `{ ok, userId } | wrong_code | expired | no_user | service_error`

`confirmEmailAttach` also writes the `ContactMethod` row (EMAIL, verified,
preferred) for the current Prisma user, in the same call, so an attached email
can never exist in Supabase without the app knowing.

**One thing this task must not repeat.** The deploy cost two hours because
`create-group.ts:73` threw Supabase's error away. Every `service_error` branch
here logs the underlying error before returning its friendly string.

**Proves it:** unit tests against a mocked Supabase client for all four, every
branch.

---

## Task 5. The ask on the group home

A per-viewer element, rendered, never posted to the feed. Two states: email
entry, then code entry. Dismissing is the decline.

Server actions: `offerDismissed()` (increments `emailAskCount`, stamps
`emailAskedAt`), plus wrappers over task 4's request and confirm. The ask is
also stamped when it is *shown*, not only when dismissed, so a member who
ignores it rather than dismissing it still only ever sees two.

Copy is Orbit's voice, plain, warm, no em dashes, and it states the concrete
reason: reminders, and getting back in from any device. The founder's copy
carries the extra clause build-notes §3 already specifies, that losing the
session means losing founder powers.

Visual grammar: this is **not** a chat bubble (nothing in the feed responds to
it), it is a note. Teal only on the confirm action, which is a genuine action.

**Proves it:** rendered in a browser here, both states, plus the dismiss path;
plus a test that the element does not render for a member with no RSVP, for a
member with a verified email, or for a member at count 2.

---

## Task 6. The permanent affordance on group info

A quiet row. For a member with no email: a way to add one. For a member with
one: "Email reminders are on," plus a way to change it. **The address itself is
never printed, even to its owner.** The rule says emails are never displayed
anywhere in the UI; reading it literally costs nothing and removes an argument
later.

Styling follows the page's existing quiet text links (`ManageMembers`,
`ResetInviteLink`), not a pill, and never teal.

**Proves it:** rendered in a browser, both states.

---

## Task 7. The invite screen stops manufacturing duplicates

`JoinForm` gains a second path for a visitor with no session. "I'm new here"
stays the default and stays one step, because most taps genuinely are new
people. "I've been here before" opens email and code.

On success the person is routed into the group they are already a member of, or
joined to this one if they are not.

**This is the task that actually fixes the bug the slice exists for**, and it
must not regress the ordinary join, which is the product's activation point.

**Proves it:** browser walkthrough of both paths, plus the existing join tests
still green.

---

## Task 8. A way back in without an invite link

A `/signin` route (email, then code), plus an entry point on the front door. The
front door already carries "Already invited? Open the link you were sent"; that
line gains a sibling for someone who has been here before.

An unknown email is answered honestly ("I don't have an account with that
email") rather than with the vague version, because the vague version leaves a
typo waiting forever for mail that is never coming, and knowing whether an
address is on an account buys an attacker nothing without the inbox.

**Proves it:** browser walkthrough including the unknown-email and wrong-code
states.

---

## Task 9. The guard test

A test asserting no email address reaches any rendered surface: the group home,
group info, event detail, the roster, and the feed. Written so it **could
fail**: it is checked by deliberately printing an address in one component,
watching the test go red, and reverting.

---

## Task 10. Documentation, and one amendment that must land

- **build-notes §3 is amended.** Its claim that Orbit asks for the email in
  chat after the first RSVP is now wrong, and the reasoning (the feed is public,
  and the composer would post the address into it) goes with the amendment as a
  dated note.
- **"Where Orbit decides to speak or stay quiet" gains its line**, per the
  standing rule that any slice adding such a decision adds its row.
- **CLAUDE.md's current-state section** rewritten, and the struck claim about a
  lost session meeting the wall (already corrected once) updated to say what is
  now true.
- **build-notes §11** gets the slice entry, 400 to 600 words, carrying the
  notification-channel decision recorded above.
- **The pre-deploy checklist** gains the Resend account, the DNS records and the
  three Supabase settings.

---

## Task 11. Production setup, the owner's hands

Written as a numbered list for the owner, with exact values, because these are
his accounts and not reachable from here:

1. Resend account, domain `account.interplanetarygroups.com`.
2. The DNS records, pasted into Vercel's DNS panel.
3. Supabase custom SMTP pointed at Resend.
4. The two email templates switched to `{{ .Token }}`.
5. Auto-renew and WHOIS privacy on the domain.

**Proves it:** the owner receives a code at a real address on the live site, and
a second person who is not in the Supabase organisation does too. That last one
is the only proof that Resend is actually working rather than the built-in
sender quietly covering for it.

---

# Task 1 findings (26 August 2026). All six questions answered; the plan holds.

Run by hand against **dev-test** (`npm run db:which` confirmed before every send),
with real mail to the owner's own inbox. Script: `scripts/spike-email-auth.ts`.

**Q1. An anonymous identity can attach an email, and it is upgraded in place.**
`updateUser({ email })` on an anonymous user returned no error and set
`new_email` to the address while leaving `email` empty and `is_anonymous` true,
so Supabase holds the address as pending until it is confirmed. This is the
premise anonymous-first rests on and it is now proven rather than assumed.

**Q2. The confirmation type is `email_change`.** This was the single most likely
place for the plan to be wrong, and the script tried four candidates in order
rather than guessing. `email_change` succeeded; `email`, `signup` and
`magiclink` did not. **The user id was identical before and after**
(`cf9e29b2-9123-49dc-8f2e-441ec8fc9eb6`), and `is_anonymous` flipped to false.
The identity is upgraded, never replaced.

**Q3. The code works, and it is EIGHT digits, not six.** `{{ .Token }}` renders.
Supabase chose the **"Change email address"** template for an anonymous attach,
which the deliberately-different subject lines are what proved. Two consequences:
every "six-digit" in this document was wrong and is corrected above, and the
code input must accept the length Supabase actually sends rather than a length
anybody assumed.

**Q4. An unknown address is refused as `otp_disabled` / 422** ("Signups not
allowed for otp") when `shouldCreateUser: false`. Recorded caveat: that same
code is what Supabase returns if OTP sign-in were switched off project-wide, so
the error alone cannot separate "no such account" from "misconfigured." Accepted,
because the second is a setup error caught once rather than a runtime condition.

**Q5. Signing in fresh returns the ORIGINAL identity.** `signInWithOtp` then
`verifyOtp({ type: "email" })` returned `cf9e29b2-9123-49dc-8f2e-441ec8fc9eb6`,
the same id the attach produced. This is the whole slice in one line: the person
comes back as themselves instead of as a second member.

**Q6. Rate limits were NOT empirically hit, and that is stated rather than
implied.** Configuration was read, not tested: minimum interval per user is 60
seconds, and Supabase raises the ceiling to 30 emails an hour once custom SMTP
is on. The 60-second floor is real enough to design against (task 4 already has
a `rate_limited` branch) but no test in this spike proved its behaviour.

**Two findings the spike produced that nobody asked for.**

1. **Expired and wrong codes are indistinguishable.** Both return
   `otp_expired` / 403, "Token has expired or is invalid." So the product cannot
   honestly say "that code expired" or "that code is wrong"; one message must
   cover both. Copy written any other way would be a lie the code cannot back up.
2. **Deliverability evidence, first of its kind here.** The mail arrived in the
   Gmail **Inbox**, not spam, rendered as `Orbit
   <no-reply@account.interplanetarygroups.com>`. Gmail is the strictest common
   inbox, so this is the best single datapoint available, and it is one provider
   rather than proof for all of them.

**Verdict: no re-plan needed.** Tasks 2 through 11 stand as written, with three
edits folded in: `email_change` is the named confirmation type in task 4, the
code length is read from what Supabase sends rather than fixed at six, and the
wrong-or-expired copy is merged into one honest message.
