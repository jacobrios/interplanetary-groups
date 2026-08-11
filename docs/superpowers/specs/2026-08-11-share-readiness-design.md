# Share-readiness hardening: design (11 Aug 2026)

The slice that makes the first shared link safe to hand to a real group. Two
halves: membership becomes a real boundary (viewing and writing), and Orbit
learns to say honestly why it is unavailable instead of failing into generic
retry copy or silence. Brainstormed and approved section by section with the
owner on 11 Aug 2026; branch `feat/share-readiness`.

## Why now

The first public link goes to an investor expected to pressure-test with a
real group. Two failure classes become real-use-visible at that moment: a
non-member holding a group URL can act on a group they are not in (including
casting the yes that creates a real event), and a dry prepaid model balance
turns Orbit into either an infinite "try again" loop (onboarding) or silence
(chat) with no explanation anywhere.

## Premise corrections found during investigation

Recorded so the register's framing does not outlive the facts:

- **The two "false docstrings" named in the slice scope were already fixed**
  on 30 July 2026 (commit `936075c`). Both now honestly say no membership
  check exists. This slice makes the code match what the comments already
  admit; the comments get updated again to describe the new checks.
- **The register understates the gauge problem.** A non-member's RSVP is
  silently dropped (row written, derived counts ignore it), but a
  non-member's yes on an idea gauge genuinely counts toward the three-yes
  bar and can be the tap that creates a real event. The pending strip also
  hands non-members live voting chips, including on group time-change votes
  where the chat feed correctly degrades to a read-only tally.
- **Exactly one write path checks membership today** (the group time-change
  vote). Posting, RSVPs, gauge votes, confirming Orbit's clarifying
  question, and the chat path feeding detection all check only "has a
  session."
- **Someone who leaves or is removed from a group keeps reading it forever**
  under the registered writes-only scope: they hold the URL, and resetting
  the invite link only rotates the join door, not the reading. This finding
  is what changed the scope below.

## Settled decisions (do not relitigate)

1. **Viewing is gated in this slice, not just writes.** Group home, event
   detail, and group info become member-only. This deliberately supersedes
   the triage-round-two scoping ("viewing stays ungated by design"), by the
   owner's decision on 11 Aug 2026, for privacy: without it, anyone holding
   a group URL, including people the group removed, reads a real group's
   chat, real names, and plans indefinitely. The register's access-control
   item shrinks accordingly; what remains there is anything beyond the wall
   (see not-in-this-slice).
2. **The wall screen is the path in.** Non-members (no session, or a
   session that is not a member of this group) get a branded screen using
   Orbit's note treatment (the bad-invite-link screen's pattern): this
   group is invite-only, ask someone in it for the invite link. Plus the
   existing "Start your own group" exit so it is never a dead end. The
   wall reveals nothing about the group: no name, no member count, no
   confirmation the URL is even real beyond the screen itself. The same
   screen serves both kinds of stranger, and it is also what a member with
   a lost session sees; "ask for the invite link" is their honest way back
   in until email sign-in exists.
3. **Every member-facing write refuses non-members server-side,** through
   one shared membership check used by all of them: posting, RSVPs, idea
   gauge votes, group time-change votes (already gated; moves onto the
   shared check), answering Orbit's clarifying question, and the
   chat-message path that feeds detection. The wall does not make this
   redundant: a removed member's stale open tab still holds live buttons,
   and the server refusing is what actually protects counts and event
   creation.
4. **The calendar (.ics) endpoint is member-gated too.** It carries the
   venue street address. The tap-the-button flow keeps working (the tap
   happens in the member's signed-in browser); a calendar app re-fetching
   the saved URL on its own gets refused. That re-fetch was never promised,
   the feed announcement remains the correction channel, and the address of
   a real group's meeting spot outweighs it. Owner approved with the
   tradeoff named.
5. **Model failures split three ways, and the reason shown is never
   false.** (a) "Didn't understand you": unchanged, all existing paths.
   (b) "Out of credits": shown only when the provider genuinely reports a
   dry balance (that error is distinctly identifiable). (c) "Service
   trouble": outages, overload, connection failures, and anything else. A
   provider outage is never blamed on credits, and vice versa.
6. **Onboarding failure keeps the founder on their step with their text
   preserved** (the existing soft-retry contract), with cause-specific copy
   replacing today's one-size "didn't go through" line for the two
   unavailable flavors. Retry stays available; once credits are topped up
   the same tap just works.
7. **Chat discloses quietly, to the sender only.** The member's message
   always posts; what is lost is only Orbit's chance to notice an idea in
   it. A small non-bubble line near the input, visible only to the sender,
   says so in Orbit's voice. Nothing is stored, nothing enters the group's
   history, repeat sends behave the same. Chosen over a once-per-outage
   feed post and over a standing banner as both the owner's preference and
   the least machinery: the send flow already returns a private result to
   the sender's browser, while the other options need outage bookkeeping or
   a stored health state.
8. **No recovery pass.** Orbit does not go back and re-read messages it
   missed while down; a missed idea stays missed. The registered
   Orbit-miss observability item is where anything smarter lives.
9. **The extraction/merge bench trigger does not fire.** This slice touches
   onboarding's failure screens but changes no prompt, no model, and no
   reading of model answers; the failure classification happens when the
   model never answered at all. Owner ratified this reading. The trigger
   stands for the next slice that touches those prompts or the model
   version.
10. **Copy is approved as drafted below,** with one last look at spec
    review. Orbit's voice rules apply (plain, warm, no em dashes).

## Approved copy

- Onboarding, out of credits: "I hit a wall: this prototype ran out of the
  model credits I run on, and they're being topped up. Your description is
  safe right here. Try again in a little while."
- Onboarding, service trouble: "I'm having trouble thinking right now.
  It's not you, the service I run on is acting up. Give it a minute and
  try again."
- Chat note, out of credits: "Your message went through. But heads up:
  this prototype ran out of model credits, so I might miss ideas until
  they're topped up."
- Chat note, service trouble: "Your message went through. But heads up:
  I'm having trouble thinking right now, so I might miss ideas for a few
  minutes."
- Wall screen (Orbit note treatment): "This group is invite-only. If you
  know someone in it, ask them for the invite link, it'll bring you right
  in." Plus the existing "Start your own group" path.

## Build shape

One shared "is this viewer a member of this group?" check that the three
group screens and every write action use, replacing today's ad hoc one-off
reads, so no future surface can forget the question. One shared failure
classifier at the single seam all model calls already flow through
(`callExtractionModel`), mapping provider errors to
credits / trouble / bad-answer, carried through the three action result
shapes to the UI. The claim-to-fact boundary (`normalize.ts`) is untouched:
it only ever sees successful answers, and that stays true.

No database changes, no new model calls, no new environment variables, no
migration, nothing added to the pre-deploy checklist. Pre-deploy checklist
item 9's note that "the hardening slice's graceful out-of-credit screen is
the face of that downtime" is satisfied by this slice.

## Not in this slice (and where each belongs)

- **Any request-to-join flow.** The wall's answer is the invite link,
  period. Home: the access-control item in the §8 register (what remains
  of it), or never.
- **Email sign-in / getting back in from a new device.** Home: the email
  arc, first post-MVP work (§8 register). The wall makes that arc's value
  more visible; it does not change its order.
- **Telling the group afterwards what Orbit missed while down, or any
  owner-facing failure digest.** Home: the registered Orbit-miss
  observability item (§8).
- **Provider balance alerting.** Home: the provider-side low-balance
  notification named in pre-deploy checklist item 9; this slice is the
  fail-safe for when that is missed.
- **Extraction and merge eval benches.** Home: first task of the next
  slice that touches those prompts or their reading of answers, and
  mandatory before any model version change (standing trigger, §8).
- **Guest read-only states.** Dissolved by the wall; if view gating is
  ever deliberately loosened, that design conversation reopens at the
  access-control item.
- **Subscribable per-group calendar feed** (what would make the .ics
  re-fetch refusal moot). Home: §8 fast-follow register, unchanged.

## Verification plan (written before any code)

Suite baseline at slice start, already recorded in §11: 62 files, 752
tests, all green, zero skipped (the two-test delta from the .ics slice's
750 traced to its post-count review commit).

- **Deterministic tests, written failing first:** the shared membership
  check itself; each write action refusing a non-member (and the calendar
  endpoint refusing); the failure classifier mapping each provider error
  shape (dry balance, overload, connection failure, garbled answer) to the
  right state; the wall screen and the chat note as components. None of
  these touch the model. The screens themselves are server-rendered and
  untestable in the suite (standing repo limitation), so page wiring is
  proven in the browser instead.
- **Browser walkthrough on the dev-test database:** two browsers side by
  side, one member, one stranger. The stranger hits walls on all three
  screens and the calendar URL; the member's experience is unchanged
  end to end; leaving the group in one browser makes the wall appear on
  refresh. For the unavailable flavors: break the API key locally and see
  the "service trouble" copy live in onboarding and in the chat note.
- **The honest gap, named up front:** the real dry-balance error cannot be
  triggered on demand without actually draining the account. Its mapping
  is pinned by a test replaying the provider's documented dry-balance
  error exactly, and the credit-flavor screens are shown by component
  tests, not by a live drained account.

## Debt this slice knowingly opens or carries

- **A member who loses their session hits the wall** until the email arc
  ships. Path back: the invite link (existing-session reuse on join
  mostly makes this clean; a truly fresh device re-adds them as a second
  copy of themselves, the standing identity gap, unchanged by this
  slice but easier to bump into).
- **A calendar app that re-fetches its saved .ics URL gets refused.**
  Accepted with the tradeoff named; softens when email sign-in exists and
  dissolves if the subscribable feed ships.
- **Only the sender learns Orbit is down.** Readers and non-senders are
  not told. Accepted by design (anti-clutter); the observability item is
  the future home of anything broader.
- **A removed member's stale open tab degrades to server refusals** on
  whatever buttons it still shows; existing per-chip error lines carry
  the message. Any roughness in how that looks is a polish-pass item, not
  a correctness gap.
