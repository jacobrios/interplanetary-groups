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
