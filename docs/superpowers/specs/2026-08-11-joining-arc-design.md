# Joining arc, design (11 Aug 2026)

One slice, two halves of the same product moment, per the 10 Aug 2026 pre-MVP
triage (build-notes §11, do not relitigate the pairing): the onboarding share
moment (mockup 04) that hands the founder their invite link at peak setup
momentum, and the "Jesse joined" announcement that lets the group see the
person the link produced. Today the founder lands in their group alone with
the link buried on the info page, and a join leaves the feed silent; both are
recorded as demo-critical (build-notes §8).

Visual source: `docs/design/joining-arc-handoff/` (the real Claude Design
handoff, trimmed with owner approval; provenance and known overrides in its
`HANDOFF-NOTES.md`). Build-time decisions override the designs wherever they
conflict (owner, 11 Aug 2026).

## Decisions already settled (do not relitigate)

Carried from the record:

- Joins are announced in the feed; departures (leaving and removal) stay
  silent. The asymmetry is the decision, not an oversight (build-notes §11,
  group-info slice).
- The invite link joins people to the group, never to an event (§1).
- The new member's arrival stays a calm landing on the group home, never an
  immediate ask to recruit others (member-join slice deferral note).
- One share link per group; no per-inviter attribution (§4).

Settled with the owner in this slice's brainstorm (11 Aug 2026):

- **The wizard header rebuild rides in this slice.** Orbit avatar, name, and
  "STEP N OF 3" on every wizard step, per the handoff's header component. The
  missing share step and the missing step indicator are one problem with two
  symptoms (build-notes §8); building one without the other ships a step the
  flow cannot count.
- **The join announcement is a quiet centered line.** Small, muted, centered,
  no bubble, no avatar, no name label. The room noticing, not anyone speaking.
  A bubble would promise a reply and nobody replies to a join notice (§7,
  bubbles are for dialogue).
- **The invite link stays the opaque token.** Friendly slugs declined for MVP;
  the share button means nobody retypes the URL. This closes the founder-auth
  slice's open question about a friendlier link format as declined.
- **The share moment is a real third wizard step**, not a separate route or a
  banner. Precedent honored: the old join-success and welcome routes were
  rejected as future dead code, and the query-param banner was rejected in the
  one-shot experiment.
- **No back chevron on step 3.** The group already exists; back to the confirm
  step would imply the creation can still be changed or undone, which is
  false. A recorded deviation from the mockup, which draws one.
- **Step-2 confirm copy becomes "Looks right, set up invites."** The design's
  wording, honest again now that the button leads into the share step instead
  of ending the flow, and already the wording the recorded color rule cites.
- **The wizard header uses the letter-O placeholder avatar**, matching every
  other Orbit appearance in the product. The real mascot face stays queued for
  the visual-polish pass; its asset now lives in the repo (`orbit-mark.js`).

## The design

### Founder side: the wizard becomes an honest three steps

Describe is step 1; the playback and gap rounds are step 2 (the design marks
the gap screen as a step 2 variant); the new share screen is step 3. Every
step gets the designed header. The back chevron appears only where back is
real: on step 2 the chevron is new UI wired to the flow's existing backwards
path, step 1 keeps its bottom exit link instead of a chevron, and step 3 has
no back at all.

Confirm stops redirecting into the group. The create action instead hands the
wizard the new group's id and invite token, and the wizard advances to the
share state: the group's name on a card, a "GROUP INVITE LINK" eyebrow, the
real invite URL in a pill (truncated the way the design truncates), the teal
"Share invite link" button, Orbit's bubble, and an outlined "Take me to my
group" that navigates to the group home, with the caption "You can invite
people now or anytime later" beneath.

The share button is the one already shipped on the group-info page (native
share sheet where available, clipboard copy with "Copied!" feedback
otherwise), lifted into the shared components folder and used from both
places, never duplicated.

Orbit's bubble copy, with the mockup's em dash rewritten out per the
product-voice rule: "Here's your invite link. Send it to anyone you want.
They just tap to join, and you can share it again anytime from inside your
group. Ready? Head in below."

If the founder refreshes or abandons the tab on step 3, the group exists and
the wizard is gone; their link lives on the info page. Accepted as the honest
fallback, not a bug.

### Group side: the feed sees the person the link produced

The first time a person joins through the link, the feed gains a system
message, body composed deterministically from the stored member name ("Jesse
joined"). It is written in the same database transaction as the membership
itself, so the announcement and the membership can never exist without each
other. A re-tap of the link by an existing member creates no membership and
therefore announces nothing. The founder's own creation is not a join and is
not announced.

The feed renders the system kind as its own thing: a quiet centered muted
line at the meta type size (at or above the 13px floor), distinct from both
Orbit bubbles and member bubbles. The new member sees the line too when they
land, which keeps their arrival the calm "you made it in" the record asks
for.

### What Orbit knows: nothing new, on purpose

System messages are excluded from the twenty-message reading Orbit uses to
interpret requests. Without this, a join notice would surface in Orbit's
context mislabeled as coming from "a former member" (the fallback for a
message with no author), which could actively mislead it. Orbit's behavior is
untouched by this slice; whether Orbit should know who just joined is
recorded as an open question rather than answered by accident.

The "Where Orbit decides to speak or stay quiet" section (build-notes) gains
an explicit note that the join line is deterministic system speech, not an
Orbit decision, so that list stays honest about its own scope, per its own
rot-risk rule.

### Data

One migration: the message author enum gains the SYSTEM value the June schema
design reserved for exactly this. Nothing else changes shape. The migration
goes onto the pre-deploy checklist in the same PR, per the standing rule.

## Not in this slice (each names its home)

- Friendly invite slugs: declined for MVP (this spec closes the old open
  question as declined).
- Membership gating and removed-member lockout: the access-control slice.
- The email-capture ask after the first RSVP: rides Orbit's live posting.
- Join-anomaly flags to the founder: post-MVP (§4).
- Departure announcements: never; settled.
- Any Orbit reaction to a join (a welcome message, conversational awareness
  of the new member): the open question above; not built here.
- The real Orbit face in the header: the visual-polish pass.
- Join screen changes: none; it stays as built.
- Extraction and merge eval benches: **not triggered.** The queued trigger
  fires when a slice touches the extraction or merge prompts or bumps the
  model; this slice adds a wizard step and touches neither prompt. Stated
  here so the trigger question is answered rather than left ambiguous.

## How the slice will be verified (written before any code)

Test-first units, each shown failing before the code that makes it pass:

- The join transaction writes exactly one system message on a first join and
  none on a re-tap.
- The feed renders a system message as the quiet-line kind, never as a member
  bubble (today it would fall into the member branch as "Member").
- The detection window provably excludes system rows (a pinned unit test on
  the window query and builder).
- The wizard advances to the share state on successful confirm; the share
  state renders the link, the share button, and the proceed button; "Take me
  to my group" navigates to the group home.
- The lifted share component keeps its existing tests, moved with it.

The suite baseline is recorded at slice start, before any code, cross-checked
against the group-info slice's finishing number in the decision record.

Browser walkthrough, evidence attached to the PR: create a group end to end
and watch the header count steps on every screen; land on step 3; copy the
link (clipboard branch); head into the group; join as a second person from a
separate session; see the quiet line in both sessions; re-tap the invite link
and confirm nothing is announced twice.

Named verification gaps, stated up front: the native share sheet cannot be
exercised in a desktop browser (the clipboard branch can, and the sheet
branch stays covered by the component test only, a gap carried from the
group-info slice); and the recognition bench is not rerun, because no prompt
changes in this slice and the window change is deterministic and unit-pinned.

## Debt this slice expects to open

- No system voice token exists in the design system; the quiet line ships on
  existing muted text styles. If it earns a real token, that lands in the
  visual-polish pass.
- The native-share branch remains unexercised live (standing, carried).
- A founder who refreshes on step 3 loses the wizard but not the group; the
  info page is the fallback. Accepted knowingly.
- A removed member holding the URL can still view and post (standing; owned
  by the access-control slice).
- Open question, recorded not built: should Orbit know who just joined. No
  behavior change today; it would shape future conversational context.
