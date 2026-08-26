# Email sign-in

Slice branch: `email-sign-in`. Opened 25 August 2026.

**Status: design in progress.** The front section below is incomplete on purpose;
it is filled in once the owner has settled the open questions. What is complete
and durable already is the notification-channel record, because that decision was
made in conversation and had no home in the repo, which is the failure mode this
project keeps finding.

---

## Front section (for the owner)

### Settled, do not relitigate

- **Anonymous-first stays.** Experience before PII is a founding decision
  (build-notes §3). Email upgrades an existing anonymous identity. It never
  becomes a gate in front of the front door.
- **Emails are never displayed anywhere in the UI**, even after capture. Member
  lists are names only. The email is given to Orbit, not to the group
  (CLAUDE.md, build-notes §3).
- **Supabase does auth only.** The Data API on the production project is off,
  and that is what makes "no RLS policies" safe. Nothing in this slice switches
  it on, and nothing in this slice reaches for a Supabase client library to
  touch data (build-notes §11, the deploy entry).
- **Production and dev-test are separate Supabase projects and are never
  crossed.** `npm run db:which` before anything database-related.
- **Test-suite baseline, recorded before any code:** 97 files / 955 tests,
  green, zero skipped, run on the branch at its cut. Matches main's finishing
  number at `a4f7c9f`, so nothing landed outside a PR.

### Not in this slice

*(To be completed once the design is settled. Every exclusion names where it
does belong instead.)*

### How this slice will be verified

*(Written before any code. To be completed.)*

### Debt this slice is expected to open

*(To be completed.)*

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

**Q4. A six-digit code, not a magic link.** A link in an email opens in the mail
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

## Open questions (the owner's, being settled before any build)

1. Whether attaching an email is optional or eventually required, and what the
   product does about someone who declines.
2. What happens to identities that have already duplicated. The live group has
   real rows in it.
3. Where the ask lives. CLAUDE.md and build-notes §3 both say Orbit asks after a
   member's first RSVP with a concrete reason attached; that was written before
   any of today's screens existed.
4. How the magic link is actually delivered, and what that costs.

Plus three notification-adjacent decisions that this slice makes and the
notification work inherits:

- a. The sending service.
- b. Unsubscribe handling.
- c. Whether the data model gets a per-member read position now.
