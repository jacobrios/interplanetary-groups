# Interplanetary Groups · Build Notes
*Visual-language phase, v2. Source document for the spec and CLAUDE.md. Decisions recorded here were made during product design (wireframe phase May to June 2026, visual-language phase June 2026) and should not be re-derived during the build.*

---

## 1. Product principles (the rules that settle arguments)

- **Group-first architecture.** The group is the persistent entity; events are activations of it. The invite link joins people to the group, never to an event.
- **The organizer role dissolves after creation.** One person bootstraps the group; after that, anyone can initiate and Orbit carries the coordination burden. No admin console, no role hierarchy beyond minimal founder powers.
- **One conversation surface.** The group feed is the only chat. No private Orbit DMs in the MVP. Consequence: all change requests and Orbit interactions are public by default, so governance transparency is structural, not policy.
- **A card means a confirmed plan.** Day and time are constitutive of an event (no card without them); venue is a refinable detail (can ship penciled-in). Ideas never get cards; they live and die in the feed.
- **Momentum through defaults.** Orbit's default is to propose concrete things (a specific day, a specific venue) and absorb overrides, rather than polling the group. It does not poll on its own initiative. The exception is an explicit member request to help find a mutual time: that escalates Orbit into active coordination (it may gather availability), but it still converges to a concrete proposed time rather than handing back a poll grid for the group to resolve. How many requests trigger this (one member asking vs. two or more, which resembles the spontaneous-interest signal) is a post-launch tuning knob, not a fixed rule.
- **Experience before PII.** Users see and use the product before being asked for anything personal. This principle decided auth and should decide future debates.
- **Anti-clutter is the brand.** The founding complaint was SMS noise. Every notification, nudge, and Orbit message must justify itself against this.
- **Subtract before you add.** Two touchstones guide every scope call here: "Perfection is achieved not when there is nothing left to add, but when there is nothing left to take away" (Saint-Exupéry), and "fall in love with the problem, not the solution." The first is why complexity must justify itself against the problem. The second is why decisions in this document are recorded as the problem to be solved with the reasoning behind them, not just the chosen fix: it leaves room to find a better solution than the first one we reach for, and it guards against building for a problem that may not turn out to be real.

## 2. Data model

- **Many-to-many user-to-group from day one.** Events, RSVPs, and Orbit's context all scoped per group. The multi-group home screen is a fast-follow, not MVP; the backend must be ready so it is additive, not a retrofit.
- **Events store a start datetime and an optional end.** Multi-day gatherings (a graduation weekend) are a date range, not a point in time. Cheap foresight now; avoids a retrofit later.
- **Event location is a set of venue options** (usually a set of one). RSVPs carry an optional venue field. Multi-venue events ("who's going to which gym") become a UI fast-follow: the roster's IN group subdivides by venue ("IN AT ABP · 2"), the confirmed band reads "You're in at Crux", the status line extends. MVP UI stays single-location. A venue also carries an optional short display label: Orbit suggests one once at creation (a Level 1 prompt use), stored on the venue and editable, never regenerated per render. It keeps the card and chips terse without re-calling the model on every render, and feeds the same brevity discipline as the counts-only card (§7).
- **RSVP is per-person status (in / out / pending), never a bare count.** Counts are derived, not stored as the model.
- **An RSVP attaches to exactly one event, and attendance never inherits from a parent.** The travel case decomposes into a container event (the weekend, a date range), child events with their own RSVP sets (ceremony, dinner), and per-person logistics. Flights and hotel rooms are NOT events; they are per-person details with no attendance semantics. No nesting in the MVP schema: a nullable parent-event reference is a cheap, non-breaking migration later (unlike relationship-shape changes, which is why many-to-many and venue options got day-one foresight and this does not). The semantic rule above is the only thing that must hold from day one, so no shortcut (e.g. a weekend-level RSVP implying dinner attendance) forecloses nesting later.

## 3. Identity & auth

- **Anonymous session on entry** (founder at creation, member at join), upgraded later to a real account by attaching an email, then magic-link sign-in from any device. Supabase anonymous sign-in supports this pattern. *(Verify current implementation at build.)*
- **Names:** the founder gives theirs in onboarding Step 1 (required field); members give theirs on the join screen. A name is the only identity required to participate.
- **The email ask is Orbit's job, post-join, triggered by the user's first RSVP**, with a concrete reason attached (reminders, plus get back in from any device). Founder copy carries one extra clause: losing the session means losing founder powers, so "it also means you'll never lose access to your group."
- **Session fragility risks, which make the email ask early rather than lazy:** cleared browser data, in-app browsers (separate storage from Safari), and iOS Safari's roughly 7-day script-writable storage cap. *(Verify current policy at build.)*
- **Invite-link taps must check for an existing session first** and route members into the group, or the app manufactures duplicate accounts itself.
- **Duplicate-member recovery is social:** the founder deletes the ghost. Acceptable at casual scale.
- **Emails are never displayed anywhere in the UI**, even after capture. Member lists are names only.

## 4. Membership & governance

- **One share link per group, no per-inviter attribution.** Trust comes from the human channel the link travels through.
- **Joins are announced in the feed** ("Jesse joined") as quiet system messages. Social detection over gatekeeping: the group polices itself because it can see itself. No approval queues; they would rebuild the organizer burden.
- **Founder powers: remove member, reset invite link.** These live as a founder-only state of the group info page, not a separate admin surface.
- **Anyone can ask Orbit to change group details.** The guardrail is transparency plus triage: small factual changes get announce-and-easy-revert ("say the word and I'll put it back"); rhythm-altering changes get the interest-gauge pattern before taking effect. Orbit's judgment decides which tier.
- **Leaving is low-drama:** confirm copy is warm ("You can always rejoin with the invite link"), destructive-styled at high fidelity, never buried. We don't bury exits.
- **Post-MVP:** Orbit privately flags join anomalies (several joins in quick succession) to the founder.

## 5. Orbit's behavioral rules (the agentic layer)

The architecture is tools (what Orbit can do) + context/RAG (what Orbit knows) + guardrails (when it acts, asks, or stays quiet).

- **Nudge sparingly.** Orbit pings the group only when it moves the needle (turnout genuinely uncertain). Exact thresholds are post-launch tuning. Reminders point to the card; responses never flood the feed.
- **Scheduled mode auto-creates the next occurrence** from the rhythm learned at onboarding, so the home is alive on day one. Vercel Cron drives scheduled triggers.
- **Spontaneous mode:** Orbit listens passively, gauges interest with chips when someone floats an idea, and only creates an event at the three-person threshold. The initiator counts toward that three, but by voting like everyone else; the only exception is when they named the proposed day themselves, which already is their yes. Below threshold, ideas scroll away with no residue.
- **The one-bump rule.** A buried gauge that is still viable (close to threshold) earns at most one fresh bump, then dies gracefully. Never pinned, never bannered.
- **Auto-seed RSVPs.** People who said yes during gauging are seeded as "in" on the created event. Never ask twice. This governs a yes already given; floating an idea is not itself a yes, so the person who raised it is not seeded on that basis.
- **Interest without a viable date is stashed as context** and resurfaced when the calendar opens up. Enthusiasm is parked, not lost.
- **Concrete-first proposals.** Orbit proposes a specific day at gauge time (anchoring beats open-ended polling) and pencils a venue at lock time. Venue suggestions must key off the group's actual spots from context, not generic geography.
- **Override learning.** Track which defaults get rejected. A group that shoots down Friday three times stops getting Friday proposals. Overrides are training data.
- **Natural-language intent detection.** "See you on Monday" in chat is an RSVP signal: act on clear intent, ask when ambiguous ("sounds like you're in, want me to mark you?"). Chip taps and free-text replies feed the same tally.
- **Ask-if-missing.** Gaps in the group description (climb time, first-event location) trigger a clarifying question, never a guess. The founder's name is not in this category (captured as a form field in Step 1).
- **The group-naming nudge:** a day or two in, Orbit prompts the group to pick a fun name together. First demonstration of Orbit driving engagement beyond logistics.
- **Post-MVP, the opt-out preference system:** "assume I'm in unless I say otherwise" per member, grounded in explicit user statements, never inferred. Deferred for its edge-case surface.
- **Post-MVP, multimodal logistics input:** a member forwards a confirmation email or uploads a screenshot in the feed, and Orbit parses it into structured logistics on the event page. This is the unlock for the travel use case.

## 6. Notifications & reminders

- **MVP: no web push.** Optional email enables quiet, event-level nudges and digests. Never per-message notifications, at any stage, on any future channel. This traces directly to the founding complaint.
- **Add to calendar is the MVP reminder workaround:** a one-way ICS snapshot; deletions don't sync back and nobody expects them to. Post-MVP: a subscribable per-group calendar feed that auto-updates.
- *(Verify at build: iOS web push requires PWA home-screen install; platform rules shift.)*

## 7. UI, copy & visual language

*Color, type, and layout decisions from the visual-language phase (June 2026) are folded in here. Where a decision is visible in the walkthrough, the walkthrough is the reference, as far as static screenshots can convey it.*

### Color

- **Teal is the single primary action; lime is Orbit's brand.** Exactly one teal action per screen (Continue, Share invite link, Join, I'm in, Add to calendar). Lime is Orbit's identity: its avatar, brand moments, and gap-prompt cues (the lime "what time?" prompt on the Step 2 variant). Lime never marks a primary action and never appears as a plain button. These are the two fixed chromatic decisions because each carries meaning; everything else is a neutral or a brightness step. *(This supersedes the earlier wireframe-phase note that called lime the primary action. The lime self-bubble concern still holds: a member or viewer bubble must not read as a button or as Orbit.)*
- **A card's own action is teal in one of two forms:** a full teal footer band on simple confirmation cards (the onboarding playback card, "Looks right, set up invites"), or a teal primary button plus an outlined secondary on the event card ("I'm in" / "Can't make it"). Never a lime band.
- **Dark is the default theme,** designed dark-first across all ten screens.
- **Status by brightness plus icon or label, never by hue.** The roster uses a checkmark for IN and grouped text labels (IN / OUT / HAVEN'T REPLIED); RSVP buttons use fill and outline. No state depends on color alone. This is load-bearing because the product owner is red/green colorblind, and it is why status is never carried by a red/green pairing.

### Type & sizing

- **One locked type scale, applied across all ten screens.** Sizes in rem (so they honor the device text setting), unitless line-heights. Size tokens are `--type-*`, line-height tokens are `--leading-*`, deliberately separate from the `--text-*` color tokens so a size change never touches color. Token values are listed in CLAUDE.md.
- **Role mapping that emerged:** group identity name at display; event-detail title at title; preview-card title and home header at heading; body and chat at body (a raised 17px base for readability); primary and share CTAs at body; compact in-card buttons (RSVP, add to calendar, leave) at label; metadata, status, and Orbit's reference note at meta; uppercase eyebrows at the floor (13px, nothing smaller anywhere).
- **Layout grows with content, never clips,** proven on the event card at default and enlarged text sizes: min-height plus padding instead of fixed heights, containers that grow with their text, buttons that stack when they cannot sit side by side. Metadata and status wrap with each separator dot bound to the end of its item, so a wrapped line always starts with a word.

### Chat voice & avatars

- **Chat voice system,** distinguished by structure and weight, not hue. Orbit speaks as its avatar with no name label, in a soft muted fill. Members speak as a name label with no avatar, in an outlined low-fill bubble. The viewer is right-aligned in the strongest fill, which must not be the teal primary-action color (a teal self-bubble would read as a button) and is not lime (which reads as Orbit). The asymmetry makes AI and humans distinguishable at a glance.
- **Bubbles for dialogue, notes for reference.** A bubble requires that the user's next action on the screen responds to Orbit. On reference pages, Orbit leaves a labeled note, never a bubble.
- **One onboarding bubble-tail exception.** The Step 1 bubble drops its avatar, shifts to the left margin, and keeps a small tail pointing up at the header; ~~it is the only tailed bubble in the product.~~ **Amended 20 Aug 2026 (polish slice two, owner's phone QA):** it is no longer the only one. The rule is now stated as a condition rather than a screen: a wizard bubble sitting *directly under the header* takes this treatment, which covers step 1 and step 2's opening bubble, both rendering through the shared `TailedOrbitBubble`. The gap-ask is excluded, because its bubble sits below the playback card rather than under the header. Reasoning in the postscript to the polish-slice-two §11 entry. Implementation is a one-off: either an SVG bubble shape (a single stroked path with the base segment left unstroked) or a stacked two-triangle CSS approach. Present in the current gallery.
- **Avatars are deterministic generated doodles** (Interplanetary celestial theme; the same name always yields the same doodle); photos are not in the MVP. Avatars live on the event detail page, not the compact card.

### Copy generation

- **Generated display copy is structured-extract-then-format.** Orbit extracts structured fields (days, time, part of day, cadence) from what a member types, and the UI composes the compact display string deterministically. Orbit writes free prose only for its own chat nudges, and even then it is constrained by format, length, and worked examples. This guarantees brevity and consistency, and it yields the structured data that reminders, the add-to-calendar button, and Orbit's check-ins all need. The AI implementation level here is Level 1 (prompt engineering), not RAG.
- **Dynamic card row labels** (CLIMBS, BEERS) are generated from the group's own language, capped at a word or two, with sensible fallbacks. WHO stays stable.
- **Dynamic chip labels** are composed per situation ("Yes, can't Fri" becomes "Yes, can't Sat"), with a max length; rows wrap, never truncate mid-label.
- **Three-letter weekday abbreviations** in schedule and rhythm copy ("Mon & Wed mornings @ 8am"), both as a display rule and as something Orbit follows when it generates copy. The old em-dash in the schedule copy is gone.
- **Soft declines everywhere.** "Next time," never "Pass" or a bare "No." A copy rule across the whole product; honest tallies depend on socially comfortable exits.

### Cards, status & real estate

- **People, not counts, where identity matters.** The event detail roster shows who, by name, grouped IN / OUT / HAVEN'T REPLIED (the "WHO'S COMING" title was dropped for tightness). The compact preview card is counts-only ("4 In · 1 Out · 4 TBD": In always shown, Out only when at least one is out, TBD is the count still to reply, no names). Why counts-only on the card: names took too much vertical space, which made the preview card too tall and left too little room for the chat below it. The named roster is the right place for identity; the card's job is the gist. *(This is why the earlier composed, name-truncating status line was dropped. It is no longer used anywhere.)*
- **Preview cards show the gist plus the primary action; the detail screen carries completeness.** Counts-only status, the short venue label (§2), and day abbreviations are all instances of one principle: brevity and real-estate discipline on the card, completeness on the detail page.
- **Separator dots** between metadata items are slightly larger and brighter than a hairline so they read as deliberate, still subordinate to the text. Known minor tradeoff: a trailing dot can push an item to wrap one step early, leaving a little empty space on the line above. Cosmetic only, not worth a JS fix in the mockup. Optional future refinement: let a long location field wrap at its internal spaces so it fills the line above.
- **The carousel** orders soonest-first; the peek of the next card appears only with two or more cards. (Amended 17 Aug 2026: this read "peek-and-dots chrome" until the dot row was deleted.)
- **Header grammar:** the Orbit logo top-left is the home button (anticipating multi-group); the group title with chevron opens group info. The Orbit-generated group emblem lives on the info page and the future multi-group home, not in the header.
- **Event cards are tappable previews** into the detail page; the detail page is where the confirmed RSVP state and the full roster live.
- **The event detail page is a stack of cards**, so new sections (a LOGISTICS card for travel-style events, per-person details on roster rows) slot in additively without redesign.

### Card-versus-chat balance (one firm rule, one open question)

- **Firm:** the event card stays pinned at the top as the constant next-event reminder; the chat feed is its own scroll region below it, above a pinned input. The chat body stays at `--type-body` (17px) and is never shrunk to fit. The apparent chat overflow in the mockups is only the fixed presentation frame, not a real layout problem.
- **Open question, deliberately not settled.** The real problem is that the pinned card takes up a lot of vertical space (the RSVP buttons especially), leaving less room for chat than ideal. Fall in love with that problem, not a particular fix. One candidate solution: collapse the card into a condensed state once the viewer has set their own RSVP (in or out), since RSVP is per-person, and give the freed space to chat. This condensed state is not designed and not drawn in the walkthrough, and what it keeps visible (title and time only, whether it still offers a quick "change" affordance or routes to the detail page) is undecided. The default is to ship the full pinned card as drawn and add nothing here unless the live app proves the card actually crowds the chat. Do not build the condensed card preemptively; this is a complexity-must-justify-itself call (§1), and a better solution than a condensed card may exist.

## 8. Fast-follow & post-MVP register (one place for scope conversations)

### Remaining before MVP complete

The slower-changing companion to the CLAUDE.md "Where the build is" paragraph: that one holds the current state and the immediate next slice, this holds the full remaining register.

**What "MVP complete" means here, because the word does double duty.** It means the walkthrough is demonstrable end to end as a portfolio piece, not that the product is ready for real users. That is the axis every item is classified against. A few items below are genuine requirements for a launched product yet invisible in a demo; they carry a **"launch, not demo"** label so they read as deliberately deferred rather than forgotten. Drafted from the repo on 23 July 2026; where an item's classification is a judgment call rather than something read off the repo, it says so.

Demo-critical (the portfolio piece is not complete without these):

- **Spark / spontaneous events** (Orbit posting live, interest gauging with chips, nudges; §5). The confirmed next slice, and the core of the demo: this is the product thesis, Orbit as an active coordinator rather than a cron job.
- **Add to calendar (.ics) button** (§6). More load-bearing than a deferred button looks: §6 makes the one-way .ics the MVP reminder workaround precisely because there is no web push, so without it a product that pitches Orbit as the thing that remembers for you has no reminder mechanism at all to demonstrate. Deferred in the event-detail slice (a dead button is worse than none); it comes back as a real export.
- **Change-request slice** (Orbit edits group details on request, announce-and-easy-revert; §4). Demonstrates Orbit's transparency-on-changes behavior, and directly resolves the venue-capture DEBT below: today a founder who skips a venue at onboarding has no way to add one later, and no group can switch venues.
- **Onboarding share moment (mockup 04).** ~~Not built. The invite link is reachable today at `/groups/[id]/info`, so founders can already invite people; what is missing is the designed dedicated screen that hands the founder their link at peak setup momentum. Stays in the demo-critical set (getting a second person in is the product's activation point, and burying the link on an info page is a real drop-off risk), but it is small and it is not a blocker. This is the same finding as the feel-pass register's missing "STEP 2 OF 3" indicator: the shipped wizard cannot say "of 3" because there is no third step. One collapsed step, two symptoms; treat them as one problem.~~ **Landed with the joining-arc slice (11 Aug 2026).** What shipped: a real third wizard step carrying the invite link, the share button, and a proceed action, plus the "STEP N OF 3" header on every step, both problems closed by the same slice as the spec predicted. Reasoning and decisions in the §11 joining-arc entry.
- **Multi-card peek-and-dots carousel.** ~~Not built.~~ **Landed with spark part two (24 July 2026), as an interim treatment.** What shipped: a CSS scroll-snap row of cards, soonest first, capped at three on display, with a peek of the next card and one dot per card. A single card still renders bare, because dots under one card imply something that is not there. What a real design handoff would change: screen 08's dots carry an active state showing which card you are on, and these do not, because tracking scroll position needs client-side state in a region that is otherwise fully server-rendered. That difference is a known question, not a defect. The reason it is interim at all is that no Claude Design handoff exists for the carousel chrome; `docs/design/` holds only reference PNGs, whose own README says they are not a build source. Agreed with the product owner before any visual code was written, rather than improvised.
- **Navigation is missing on most screens, and there is no shared chrome to inherit it from.** Found by the product owner during QA of spark part two (27 July 2026): tapping into an event has no way back to the feed except the browser's back button. Audited across the whole app afterwards, because the instinct that it was an oversight rather than one screen was right. Of six routes, exactly two navigate correctly: the group home (forward to an event, sideways to group info) and group info (the app's only back link). The other four, plus every error state, are dead ends:
  - **`/events/[id]` is the worst,** and the one the owner hit. No header, no back link, no router call anywhere in the file. It is also the most-reached screen in the product, since every card taps into it. The group's name is rendered there as inert text even though the group relation is already loaded, so a back link needs no new query.
  - **`/join/[inviteToken]` with a bad token** shows "This invite link isn't valid" and nothing else. Someone who mistypes an invite has no way into the product at all.
  - **`/create` step 1** cannot be exited; the wizard's "Edit my description" is client state on later steps only.
  - **`/` is still the stock create-next-app page,** whose only links point at nextjs.org and vercel.com. The product has no working front door.
  - **No `not-found.tsx` and no `error.tsx` exist,** so the three `notFound()` calls and any render error fall through to Next's defaults, which are also dead ends.

  The structural cause, and the reason this is one problem rather than five: `src/app/layout.tsx` renders bare `{children}` and there are no nested layouts, so navigation is hand-written per page and any screen whose author did not write a header simply has none. The two headers that exist are copy-paste duplicates down to their inlined chevron SVGs, and `next/link` is imported exactly once in the entire codebase. The fix is a shared header/back component plus the two missing route boundaries, not a link bolted onto the event page. Demo-critical: a reviewer clicking into an event and getting stuck is a visible dead end in the walkthrough.

  ~~Four of six routes are dead ends, plus both error states.~~ **Landed with the app-wide-navigation slice (27 July 2026).** What shipped: event detail and group info both carry `‹ [group name]` pointing at that group's home; the group home's Orbit logo is a real link; `/create` step 1 has a way out; a bad invite token gets a note from Orbit plus a way into the product; and a wrong id or a render error now lands on a branded screen with an exit instead of Next's default. The shared piece owns only the header bar's rules (its spacing, its hairline, that it grows with what is put inside it) and nothing about content, so it has no title slot and no opinion about what opens group info; that boundary is what keeps every future screen's exception out of one file. `/` became a session-aware front door rather than the create-next-app page: a session with a group is sent straight in, a session without one sees the product's pitch and one teal "Start your group," which is what makes "Take me home" a correct destination on all three failure screens. The whole app was then walked in a browser, screen by screen, and from every screen there is at least one route back into the product that is not the browser's back button. Two things are deliberately left standing: the group home's designed subline and Orbit's real avatar (a letter-"O" placeholder still stands in) both stay with the visual-polish pass below, and a session belonging to several groups is still sent to the most recent one, a placeholder holding a seat for the multi-group home. Reasoning in the §11 entry.
- **"Jesse joined" system announcement** (the `SYSTEM` MessageAuthor value, anticipated by the Message model but never wired; §4). ~~Demo-critical because the walkthrough includes a second person joining, and a silent feed at that moment is a visible hole.~~ **Landed with the joining-arc slice (11 Aug 2026).** What shipped: a quiet centered system line written in the same transaction as the membership itself, on a first join only; a re-tap of an already-used link announces nothing. Reasoning and decisions in the §11 joining-arc entry.
- **Full group-info page** (the `/groups/[id]/info` stub grows in place). Mockup 10 and §4 define its contents concretely, recorded here as sub-items so the register stays findable:
  - the member list (names only, per §3);
  - the standing rhythm rows (schedule plus venue, the surface that will consume `formatRhythmRow(r).value · r.venueName`);
  - the founder powers: remove member, and reset invite link (§4);
  - Leave group (warm, destructive-styled, never buried; §4).

  ~~The `/groups/[id]/info` stub grows in place.~~ **Landed with the group-info slice (10-11 Aug 2026; strikethrough added 11 Aug during the joining-arc record pass, the landing slice missed it).** What shipped: the identity block, the WHO list, every rhythm with its venue, the real invite link with a share button for members and the founder, and the founder's Manage-members and Reset-link powers, plus Leave group for members. Reasoning, decisions, and walkthrough evidence in the §11 group-info entry.
- **Share-readiness hardening (added 11 Aug 2026, triage round two; one slice, after .ics, before polish).** Two parts, both protecting the first shared link, which goes to an investor expected to pressure-test with a real group; that fact is what moved the write-gating half up from the launch bucket. (a) Membership-gate the write actions (posting, RSVPs, gauge and proposal votes): today a signed-in non-member holding a group URL can post into the feed and tap "I'm in," with the tap silently dropped from the count, the silent-drop failure this project treats as the worst kind, and it would land in front of exactly the audience the link exists to impress. Viewing stays ungated by design; a non-member gets an honest read-only state with a path in, not buttons that lie. (b) A graceful out-of-credit state: onboarding's extraction failure and Orbit's detection failure learn to tell the service being unavailable apart from not understanding the message, and say plainly, in Orbit's voice, that the prototype ran out of model credits and is being topped up; the owner wants the reason stated explicitly rather than politely vague, exact copy settled at build time. Built regardless of any provider-side low-balance notification, as the fail-safe against quiet embarrassment. **Landed 11 Aug 2026.** What shipped, and one change of scope: the write-gating half as specified, plus view-gating of the group home, event detail, group info and the calendar file, which the owner moved into this slice during its brainstorm (the deciding fact was that a removed member otherwise keeps reading the group forever). A non-member gets one Orbit note naming nothing about the group, and the invite link is their whole path in. The out-of-credit half shipped as a truthful three-way split, with the sender-only chat note and the founder's on-step onboarding copy. Reasoning, decisions, evidence and debt in the §11 share-readiness entry.
- **End-of-build visual-polish pass:** the pixel-level pass against the walkthrough, every item in the feel-pass register, and the two create-next-app scaffolding gaps recorded there (light-mode default, Arial body font). What makes the demo look finished rather than scaffolded. *Shaped 11 Aug 2026 (triage round two): three slices, not one. The strip-versus-carousel placement call comes first, because the record already warns against polishing the strip before that decision; then foundations plus the group home (dark default, Geist, avatar, subline, bubbles and chips), the screen that locks the feel; then the onboarding wizard; then the remaining screens plus the real-phone Safari pass. One narrow Claude Design round covers only the screens with no handoff: the front door, the carousel chrome, and the pending treatment if the carousel option wins.*
- **Pre-launch whole-codebase audit (added 11 Aug 2026, triage round two follow-on).** The step between the polish pass and the pre-deploy checklist: a read-only session that sweeps the entire repo with subagents and reports findings in product language, each with a fix, queue, or decline recommendation. Why it exists as its own step: per-slice reviews only ever see diffs, so this is the one pass that reads the repo the way an evaluating engineer will, whole. Read-only by design; anything it finds becomes its own decision, never an in-audit fix.
- **Dev-test database cleanup (queued 12 Aug 2026, from the share-readiness QA).** The dev-test database has accumulated many near-duplicate groups from repeated onboarding runs, including four separate groups all named "Monday Wednesday Climbers." It is only test data, so nothing in the product is wrong, but it made a QA handoff genuinely ambiguous: a link written against one session's group read as a membership bug when opened from another session's browser. Deferred deliberately until after the share-readiness PR merges, because that PR's QA script references those group ids and deleting them earlier would invalidate the record. When it runs, it should list what it would delete before deleting anything, and preserve at least one usable group per shape. Recommendation: do it as its own small chore, not attached to a feature slice. Related lesson, already fixed in code: a test that cleaned up inside its try block leaked rows on every failing run (commit `82a5634`).

Launch, not demo (real requirements for a launched product, invisible in a walkthrough, deferred on purpose):

- **Email-capture ask after the first RSVP** (§3). A genuine §3 requirement before real users: it is how a member gets reminders and gets back in from another device. Invisible in a demo, because a walkthrough never clears its own session or waits a day for a reminder. Needs a live RSVP surface with Orbit present to attach to, so it rides with Orbit's live posting (spark) whenever it is built. *Amended 11 Aug 2026 (triage round two): spark landed without it; it now rides the post-MVP email arc (fast-follow list below) instead of standing alone, because capturing emails before anything sends them collects a promise with nothing behind it.*
- **Access-control / membership gating.** No surface is membership-gated today (group home, event detail, group info all viewable by any session). **Not required for the portfolio demo; required before any real person uses the product.** CLAUDE.md points at this slice as the home for that standing gap. Labeled explicitly because leaving it unlabeled is how it stays ambiguous forever. *Amended 11 Aug 2026 (triage round two): the write-gating half moved into the MVP push (the share-readiness hardening slice in the demo-critical list above), because the first shared link goes straight to an investor's real-group pressure test, which is real use arriving at MVP time. Viewing gates and anything beyond the honest non-member state stay here.* *Superseded in part 11 Aug 2026 (share-readiness slice): the view-gating half shipped too, by the owner's decision during that slice's brainstorm. The group home, event detail, group info and the calendar file are all members-only now. What remains here is anything beyond the wall: a request-to-join flow, and any deliberate loosening of the wall itself.*
- **Group-naming nudge** (§5): a day or two in, Orbit prompts the group to pick a fun name together, the first demonstration of Orbit driving engagement beyond logistics. Launch, not demo, on the trigger: it fires a day or two after group creation, so a walkthrough cannot show it without contrivance, which is exactly what puts it in this bucket rather than demo-critical.
- **Pre-first-deploy checklist:** the five High-priority items in the §11 "before first Vercel deploy" block (CRON_SECRET, prisma generate wired into build, connection_limit=1, ANTHROPIC_API_KEY, pending migrations applied to production). A deploy gate rather than a feature, and only relevant once the thing is actually being put in front of someone. *(Correction, 11 Aug 2026: the checklist has grown to ten items; the five named here were the count when this line was drafted, left per the append-only rule. The §11 checklist itself is the source of truth.)*
- **Second-viewer freshness (registered 23 Aug 2026, from the pre-launch audit's completeness critic, confirmed by hand in the audit's 23 Aug postscript).** Every state change in the product is delivered by `revalidatePath`, which refreshes only the browser that fired the action. A search across `src/` finds no `setInterval`, no `EventSource`, no `WebSocket`, and no `visibilitychange`. So a second member sees nothing, not another member's message, not Orbit's reply, not a vote landing, not the third yes creating a plan, until they navigate or reload. In a group-chat product that is the shape of the product, not a detail. Found by the audit's completeness critic; no lane brief and no prior finding names it. Sequencing is the owner's call.

### Fast-follow & post-MVP (data model ready, MVP does not implement)

- **The email arc, first post-MVP work (decided 11 Aug 2026, triage round two).** Email capture after the first RSVP, then an email digest that brings people back to the app: the web app's substitute for native notifications, with SMS priced out for an MVP and web push already registered below. The digest's shape is an anti-clutter product question that earns its own brainstorm, and a sending service is a new external seam, which is exactly what kept it out of the MVP push. An iOS app was considered for the same need and declined for now as a much larger lift.
- **Orbit-miss observability, and a user feedback affordance (queued 11 Aug 2026, triage round two).** A periodic digest to the owner of detection failures and quiet outcomes (today they fail toward silence and nobody would know), and a place in the product for users to leave feedback. Both declined for now while everyone with access knows the owner personally; queued so they are not lost when that stops being true. The interim answer, accepted knowingly: people who know the owner complain out of band, plus an occasional skim of the server logs once the investor group is live.
- Multi-group home screen (backend ready day one; Orbit logo already positioned as home button).
- Multi-venue event UI (data model ready day one).
- Logistics card and per-person roster details on the event page (the travel case; purely additive). Full travel support likely also wants nested events (container weekend, child events with independent RSVPs), enabled later by a nullable parent reference; semantics already locked in §2.
- Multimodal logistics input (forwarded emails, screenshots parsed by Orbit).
- Subscribable per-group calendar feed.
- Opt-out attendance preferences (the summer-schedule scenario).
- Join-anomaly flags to the founder.
- Web push notifications (PWA path), kept judicious regardless of channel.
- Photo avatars.
- **(Process, not product) Extract a user-level `~/.claude/CLAUDE.md` at project end.** Lift the portable rules out of this project's CLAUDE.md and §9 process notes into a machine-wide config that applies to every future project: the build-agent working rules (the Karpathy-derived clauses, calibrated to "prescriptive on the what, open on the how"), the Claude Code setup checklist (hooks, Superpowers flow, subagent reviewer, commit-at-verified-states), the code-quality bar (production-readable, built for engineer review), the two verification rules from the timezone slice ("claims about behavior need artifacts, not assertions" and "a passing test is only evidence if it could have failed"), and the communication preferences (no em or en dashes, confidence tags, one terminal command per fenced block). Project-specific things (the seven-model schema, Supabase-auth-only, Orbit) stay at the project level. Test for each rule: "would this be true on my next project too?", and move the yes ones up.
  - **Done (23 July 2026), and the workflow it assumed changed with it.** The user-level `~/.claude/CLAUDE.md` now exists and owns the portable rules: the core operating principles, the ask-and-flag working rules, the slice-and-branch discipline, the setup checklist and safety nets, the two verification rules, and the communication preferences (no dashes, confidence tags). One rule changed on the way up rather than moving unchanged: the old Markdown-only self-merge exception is gone; the user-level rule is now "open a pull request and stop" for every PR, documentation-only ones included. The project CLAUDE.md was rewritten in the same slice (its own §11 entry) to stop restating any of these and to carry only what is true of this project; the "would this be true on my next project too?" test is what sorted them. Do not run this extraction again; it is complete.
- **(Process, not product) Get the test suite off the remote database. Queued 12 Aug 2026, with triggers rather than a date.** Nearly every test round-trips to the remote dev-test Supabase, so each one costs seconds instead of being instant; the vitest config's own comment records 4.2 to 5.4 seconds per database test, and the whole suite is 83 seconds. The fix is to give the tests a database on this machine. Measured value, *after* the 12 Aug hook split below took suite runs from once per edit to once per task: roughly 20 to 30 minutes a slice, not hours, which is why it is queued rather than next. Two triggers, either one fires it: the suite crossing about three minutes, or the first test failure that cannot be reproduced, since a shared remote database is the likeliest cause once two sessions run at once. Three things need settling before any code, which is what makes it a brainstorm rather than a task: where the test database lives (an installed Postgres or an in-process one; this machine has neither Docker nor Postgres today), whether the suite keeps using a real database at all given the standing rule that tests build their own fixtures from empty, and the collision with "two databases, never crossed" and the `db:which` guard, both written for exactly two. That last one is amended first, because it is the one unrecoverable mistake in the project.

## 9. Engineering process

*The machine-wide process rules (the setup checklist, the safety nets, the git and slice discipline, the verification and communication rules) now live in the user-level `~/.claude/CLAUDE.md`, extracted 23 July 2026. This section is kept as the record of how they were arrived at on this project, not as their current authoritative statement; where a rule reads as stale here (the stack line below predates the Supabase-auth-only and two-databases realities), the operative version lives in CLAUDE.md and the later §11 entries. Do not treat this section as a third source of truth.*

- **Stack:** Next.js, Supabase (database + auth), Prisma, Vitest, Vercel. RAG and MCP are the AI differentiators.
- **Setup checklist:** CLAUDE.md before building; Superpowers plugin installed; Git from day one with deliberate commit history; a separate dev/test database provisioned before the first slice, never a single environment shared with production; evals baked in early, not retrofitted; subagent code reviewer (read-only tools) before commits, config checked into the repo; PostToolUse hook to auto-run tests after edits; PreToolUse hook protecting migration files and env configs.
- **Design-source workflow.** Content and copy changes go through Claude Design in the live source, never by hand-editing the standalone export. The standalone walkthrough is rebuilt from the live gallery after any change, so source and export always agree, and there is exactly one standalone, one source of truth.
- **Hand the coding agent the real design source, never flattened images.** Use Claude Design's "Send to local coding agent" handoff, which transfers the actual CSS, the frame components, and the asset files (the Orbit mascot among them). Multi-screen PNG contact sheets fail twice over: individual screens are rendered too small for the agent to resolve fine detail, and any asset the agent never receives gets silently replaced with a placeholder that then looks like a deliberate design choice in the diff. Screenshots are fine for a human planning conversation. They are not a build input. (Amended after the July 2026 one-shot experiment; the earlier version of this note treated screenshots as an acceptable build source and that was wrong.)
- **Before the agent writes visual code, make it describe what it sees.** A short describe-back of the design, in its own words, checked against the real thing. This surfaces a missing asset, an unreadable source, or a misread layout while it still costs one message instead of a whole slice.
- **`docs/walkthrough.html` cannot be grepped for mockup copy; render it.** The standalone export is a JavaScript-packed file (the screen text is not present as searchable HTML), so a grep for a line of mockup copy returns nothing whether the line exists or not. A false negative reads identically to the line genuinely not existing. How it surfaced: during the venue-capture slice a plan claimed the Step 1 hint line existed in neither code nor mockup, a claim produced by grepping this file; the product owner challenged it, the file was rendered in a browser, and the line was there on screen 01. Standing rule (also in CLAUDE.md's design-sources section): any claim about mockup copy requires rendering the walkthrough, never grepping it.
- **A slice's definition of done includes what it decided in passing.** A §11 entry should answer not only "what was this slice about" but "what did this slice decide along the way," because incidental decisions are the ones that go unrecorded. The worked example is the collapsed WHO row: decided in the founder-onboarding slice, inherited silently, and only surfaced when the gap-ask slice went looking for why its card looked the way it did.

## 10. Long-range vision (not planned, not architected for)

Recorded so it isn't lost, and so nobody designs the MVP around it. These are directional, not roadmapped, and the data model deliberately does not bend to accommodate them.

- **RAG and MCP as the AI differentiation.** The intended long-range direction for what makes Orbit more than prompt engineering: retrieval over a group's own history for grounded venue and timing suggestions, and MCP for tool access. The MVP builds neither; every AI feature shipped so far is Level 1 (prompt engineering with structured extraction). This is recorded here, not in CLAUDE.md, because it is aspiration rather than a rule: CLAUDE.md once stated it as fact in the stack line ("RAG + MCP are the AI differentiators"), which read as something already built, so it was moved here where directional intent belongs. (Note the RAG references elsewhere in §11, "the gap-ask and RAG slices," point at a loosely-planned future slice; nothing in the schema or code assumes it yet.)
- **Multi-platform, two-way messaging** (the investor's platform vision): let a member interact with Orbit from whatever channel they already use, coordinating across SMS, email, and chat platforms like WhatsApp and Facebook Messenger, rather than only the web app.
  - **Feasibility is better than first assumed.** A Twilio-type gateway (Twilio's Conversations API plus SendGrid for email) genuinely unifies SMS, MMS, WhatsApp, Facebook Messenger, RCS, and email behind one API, so this is not the integration-sprawl headache it might look like. Most of the per-channel wiring is absorbed by the provider.
  - **The real burden shifts rather than disappears, to two things.** First, per-channel approvals: WhatsApp and Messenger each route through their own business-platform onboarding behind the unified API, and WhatsApp's constraints are Meta's policy (no freely initiated messages, pre-approved templates required, a 24-hour reply window), which persist regardless of provider. Second, per-message economics: outbound SMS and WhatsApp are usage-priced, which is a direct, recurring cost a free-for-basic, no-VC product has to absorb at any volume.
  - **It does not cover iMessage,** where a lot of US casual groups actually live.
  - **Sequencing if ever pursued:** email and SMS first (cheap and easy), validate the cross-channel interaction model, then treat the closed chat platforms as a separate and much larger question. Anything here stays bound by the anti-clutter and judicious-notification principles in sections 1 and 6; reaching more channels must never become a license to send more.

## Where Orbit decides to speak or stay quiet

*Written 29 July 2026, during the recognition tune-up. This is a reference list, not a rule, which is why it lives here rather than in CLAUDE.md; a one-line pointer there tells a fresh session it exists.*

**Why this section exists.** The 29 July bug (a direct ask getting silence) took a day of looking because nothing anywhere said where the speak-or-stay-quiet decision actually gets made. It is made in a prompt, in a normalize guard, and in a reply ladder, across three files, and the rule they are all supposed to implement lives in a fourth. Loosening it in one place looked complete from every angle except the one the owner hit. So: every place, in one list, with which way each leans.

**Three words are used throughout.** **Structural** means Orbit genuinely has nothing to answer. **Correct** means a real stay-quiet decision the owner has affirmed. **Open** means it deserves a decision that has not been made.

### The recognition path (where a message becomes a request, or does not)

| Where | What it does | Leans |
|---|---|---|
| `spark.ts` intent prompt, the "NOT sparks and NOT change requests" list | Reactions, logistics and availability, wishes that ask nothing, small talk. The information-only-question bullet was narrowed 29 July so a question asking for a change is no longer swept in with it. | Correct |
| `spark.ts` intent prompt, the tiebreak paragraph | Splits two doubts. Unsure anyone is asking anything: stay quiet. Unsure only what they meant, once they have plainly asked for a plan to change: say so. Rewritten 29 July; it previously said missing a real ask costs nothing. | Correct |
| `spark.ts` intent prompt, the live-proposal sentence | A message agreeing with an open group proposal is neither a spark nor a change request. The chips are the answer surface, so agreement is not left unanswered. | Correct |
| `normalizeIntent`, malformed claim | No parseable claim exists. | Structural |
| `normalizeIntent`, `isChangeRequest !== true` | Transports the prompt's verdict. Exercises no judgement of its own, so it is the prompt above that decides what reaches it. | Structural |
| `normalizeIntent`, both-intents-true | A claim saying the message is both a spark and a change request is discarded entirely, including a complete and answerable change payload. Justified by the "degrade toward silence" doctrine the 28 July amendment replaced elsewhere. | **Open** |
| `normalizeIntent`, empty `requestedFields` | Deleted 29 July. It used to convert a bare "can we move it?" into silence before the ladder saw it. | Removed |
| `spark.ts` intent prompt + `normalizeIntent`, the answer class (added 5 Aug 2026) | A short reply naming a day, while Orbit's own "what day works better?" is open, opens a revival gauge for that activity instead of dying as chatter. Speaks. Gated by a window deterministic code owns, not the model: `findOpenRetryAsk` must independently find an unanswered ask, the window shuts the moment any same-activity gauge exists (a member's answer or Orbit's own guess), and a 48-hour cap catches a sweep outage. An answer claim arriving outside the window is discarded whatever the model says. | Correct |
| `normalizeIntent`, answer-beats-change precedence (added 5 Aug 2026) | Inside that window, an answer reading outranks a change reading, because Orbit's own question is the loudest context on screen and a bare day reply in its shadow is an answer, not a plan edit. Wrong precedence would read as Orbit hijacking a plan-edit request into a revival; the must-stay-quiet bench cases bound that risk without eliminating it. Deliberately not a widening of the both-true discard above, which is still its own queued slice. | Correct |
| `spark.ts` intent prompt + `normalizeIntent`, the day-comment class (added 10 Aug 2026) | A message naming a better day while a gauge is live records a vote and earns exactly one reply, announcing the inferred vote and the noted day, because Orbit acted on an inference nobody tapped. Speaks. Gated the way the answer class is: deterministic code must find a live gauge before the question is put to the model, and a claimed day comment with no live gauge is discarded whatever the model says. Inside the situation the day-comment reading outranks the change reading, which is what stops the wrong decline. Stays quiet three ways: the reading names no single day, it names the gauged day itself (that is verbal attendance, still written-but-unbuilt), or it names an activity matching no live gauge. | Correct |
| `day-comment-plan.ts`, two ideas gauging at once (added 10 Aug 2026) | A comment that does not make clear which live idea it means gets a question naming them, never a guess and never silence. Speaks. Unit-tested only; no bench case, never exercised in the browser. | Correct |
| `detect-intent.ts`, `intent.kind === "none"` | The single sink where every unrecognized message becomes visible silence. Everything above decides what lands here. | Structural |

### The reply ladder (where a recognized request becomes an answer)

`change-plan.ts` has **no silent exits**. Every rung returns a reply, a question, a move, or a proposal. This is the half that was rebuilt on 28 July and it is fully post-amendment. The `{ action: "quiet" }` variant is still declared in its type union and is constructed nowhere in `src/`; it is part-one residue, and the branch that handles it in `detect-intent.ts` is dead.

### The spark path (out of the recognition lane, listed for completeness)

| Where | What it does | Leans |
|---|---|---|
| `normalizeSpark`, malformed claim or the model's own no | No usable spark claim. | Structural |
| `normalizeSpark`, no activity | A spark with no activity has nothing to gauge. | Correct |
| `detect-intent.ts`, a gauge for that activity is already live | A second gauge is exactly the unprompted clutter the brand rule governs. | Correct |
| `detect-intent.ts`, the activity is already on the calendar | Same. | Correct |
| `detect-intent.ts`, the proposed start is already past | The gauge's own copy promises to set the thing up, and it cannot. | Correct |

### The endgame path (added 4 Aug 2026)

| Where | What it does | Leans |
|---|---|---|
| endgame.ts, bump fires on the eve | The one bump, chattier-posture act one. Speaks. | Correct |
| endgame.ts, born_today guard | No bump for an idea the group has not had time to miss. | Correct |
| endgame.ts, still_newest guard | No bump when nothing has buried the gauge. | Correct |
| endgame.ts, closed_with_note | A goodbye when at least one person had committed. Speaks. | Correct |
| endgame.ts, closed_silently | Zero-yes gauges still die without residue. | Correct |
| detect-intent.ts, urgency clause on a late-born gauge | Speaks with the clock named. | Correct |
| `endgame.ts`, already_at_bar guard | A gauge already holding three member yeses with no event is a missed promotion, not a missing bump; bumping it would render broken copy and nag a group that already decided. Stays quiet. | Correct |
| `endgame.ts`, retry ask at close | A day-blocked idea that would have cleared the bar closes with a question instead of a goodbye. Speaks. Chattier-posture act two. | Correct |
| `endgame.ts`, retry guess next evening | One same-weekday-next-week guess when nobody answered the ask, posted as a real gauge. Speaks. | Correct |
| `endgame.ts`, guess gauge routing | Orbit's own guess never earns a second ask or guess, however it dies; only humans reset the cycle. Stays quiet. | Correct |
| `endgame.ts`, activity-exact answered check | A pivot to a different activity does not cancel the guess; the votes were for this activity. Speaks. Watch-item. | Correct |
| `endgame.ts`, suggested revival at a day-blocked close (added 10 Aug 2026) | A day somebody named while the gauge was live replaces the retry ask: Orbit opens that day's gauge instead of asking a question already answered. Speaks. One message either way, so Orbit's total volume is unchanged. Orbit's own guess gauge earns this too, because a person naming a day is a human resetting the clock. | Correct |
| `proposals/endgame.ts`, lapsed close (added 18 Aug 2026) | A group time-change vote that ran out of time unanswered closes with one soft line naming the time the plan is staying at. Speaks. The asker was owed an answer, and since the tally and the card notice were both deleted, silence would leave a stalled vote with no ending anywhere. | Correct |
| `proposals/endgame.ts`, moot close (added 18 Aug 2026) | A vote overtaken because the plan moved by some other path records SUPERSEDED and says nothing. Stays quiet. The read layer already retired the question silently the instant the plan moved; this only adds the bookkeeping row. | Correct |
| `proposals/endgame.ts`, a close landing after the event started | The hourly cron means a close can land up to an hour late, occasionally after the event's own start. It still posts. Never-leave-a-direct-ask-hanging outranks anti-clutter here: the asker is owed an answer even a little late. Speaks. | Correct |

### Everything else that ends in silence

| Where | What it does | Leans |
|---|---|---|
| `detect-intent.ts`, no user / no message / Orbit's own message / a non-sender triggered it | Preconditions. There is no ask and no one to answer. | Structural |
| `detect-intent.ts`, a write lost its race (gauge, move, either proposal) | Another path already owns the visible outcome, or the plan under the computed answer changed. | Structural |
| `detect-intent.ts`, the `catch` at the end of the action | A thrown error during detection is swallowed to silence. Arguably wrong under the never-silent rule, arguably right, since a failed model call has nothing honest to say. | **Open** |

### Doctrine wording that still describes the old default

Not decision points, but they are what a future reader will reason from, so they are listed with the decisions rather than separately: `spark.ts` module header ("when unsure, stay quiet", written for the spark arm and now reading as if it governs the change arm too), the `normalizeIntent` doc comment ("degrade toward silence"), `detect-intent.ts`'s header ("everything else stays silent"), `change-plan.ts`'s note that it depends on the model's conservative tiebreak as its false-positive guard, and `CLAUDE.md`'s "when in doubt, stay quiet", which the 28 July amendment scopes but does not textually qualify.

> A checklist is only true the day it is written. Any slice that adds a new speak-or-stay-quiet decision adds its line here. Without that, this rots into something worse than nothing: a list that looks complete and is not.

### Declined for MVP: Orbit answering read-only questions, and Orbit declining off-topic ones (10 Aug 2026)

A dated postscript recording a decision NOT to build, so a future reader does not mistake the silence for an oversight.

**What was considered.** Two behaviors, raised together because they are one seam (a member speaks to Orbit and gets nothing back): Orbit answering read-only questions about the group's own plans ("what's open?", "what's next?"), and Orbit giving a graceful decline when someone asks it something outside the product ("what's the weather?", "can you check my stocks?"). The read-only half had been the standing next-slice candidate since the answer-seam slice.

**The decision: neither, for MVP. Orbit stays silent on both.** The owner's product reasoning: the pending strip shipped in the pending-surface slice already gives unanswered items a second home, which is most of what "what's open?" was for, making the answer a nice-to-have rather than an MVP need. He named the off-topic case himself and then closed it the same way: silence is a fine answer when someone pokes Orbit about the weather.

**The engineering reasoning, which pointed the same way rather than against it.** Every class added to the recognizer competes for attention with the four that carry the product (spark, change request, answer to an open day question, day comment), and each one is paid for in must-stay-quiet bench cases; this slice's single addition already required a careful full-board re-measurement to prove nothing regressed. Nothing compounds by waiting: flipping the prompt's existing instruction costs the same later as now, and there is no coupling that makes now cheaper. Worth recording that the silence on read-only questions is not a coverage gap but an explicit instruction: the intent prompt lists "questions that only ask for information about an existing plan" among the things that are NOT requests.

**What was NOT decided, and would need settling if this ever comes back.** The design crux is telling "addressed to Orbit" apart from "merely mentions something Orbit cannot do", because the failure mode is Orbit interjecting "I can't check the weather" into two members grumbling about the rain, which is worse than the silence it replaced. The shape proposed at the time, unbuilt: answer an on-topic question about the group's own plans whether or not Orbit is named, but fire an off-topic decline only when Orbit is addressed directly. Also unbuilt and worth keeping in mind: the risk of Orbit becoming a toy people poke, which turns a shared feed into a chatbot demo.

CLAUDE.md's "never leave a direct ask hanging" bullet was scoped in the same change, so a future session cannot read it as covering these two cases and quietly undo this decision. That scoping exists because the 29 July recognition bug was precisely one rule living in two places and the two disagreeing.

### Model-behavior eval coverage: two of three behaviors have no bench (queued 10 Aug 2026)

Queued by the owner after he asked whether evals get updated in every slice that needs it. They do for recognition, and asking the question is what surfaced that "where it needs it" had quietly come to mean recognition only.

The product makes three kinds of model call, and one is benched:

- `src/lib/orbit/spark.ts` (INTENT_SYSTEM_PROMPT, intent recognition): 33 graded cases in `evals/detect/`, scored as rates over N runs, and updated in every slice that changed recognition. Healthy.
- `src/lib/orbit/extract.ts` (SYSTEM_PROMPT, onboarding rhythm extraction): no bench. Last changed 23 July 2026.
- `src/lib/orbit/merge.ts` (MERGE_SYSTEM_PROMPT, gap-ask merge): no bench. Last changed 22 July 2026.

Both unbenched behaviors predate the bench, which was built on 29 July out of the recognition failure and was only ever pointed at the behavior that had failed. `scripts/try-extract.ts` and `scripts/try-merge.ts` exist, but they only print output for a human to read: under the standing rule they are the named hand-run tier, not evidence, because they grade nothing and score no rate.

**Why this is worth protecting rather than shrugging at.** The merge behavior has already failed in exactly the way a bench catches. Across a gap-merge round the activity label drifted from CLIMBING to CLIMB, because the model re-derived a value it should have carried; that failure is what produced the CLAUDE.md guardrail "stored state is not display; carry it, do not regenerate it". Nothing in the project today would notice it coming back. Onboarding extraction is the higher-stakes of the two: it is pre-auth, it is a founder's first impression of the product, and it feeds the server-side completeness gate that decides whether a group can be created at all. And all three behaviors run through one pinned model, so a version bump lands on all three while only one of them can report the damage.

**The commitment is trigger-based rather than dated, because nothing is broken today.** Neither prompt has been touched in weeks and neither is scheduled to change, so the gap currently costs nothing; it goes live the moment one of them is edited or the model version moves.

1. Benches for extraction and merge are the FIRST task of whichever slice next touches onboarding.
2. A model version change requires all three behaviors benched before it lands.

Recommendation recorded at queue time: queue, not fix now. The cost of the gap is zero until the trigger fires, and the trigger is identifiable, so paying for the benches now would buy nothing that waiting does not.

**The join announcement is not on this list, on purpose (11 Aug 2026).** The
"Jesse joined" feed line (joining-arc slice) is deterministic system speech:
no model, no judgment, no Orbit voice, written in the same transaction as the
membership itself. This list catalogs places where *Orbit* decides; a SYSTEM
message decides nothing. Recorded here so its absence reads as scoping, not
rot. The adjacent real decision is recorded in the joining-arc §11 entry:
SYSTEM rows are excluded from the detection window, so Orbit does not know
who joined, and whether it should is an open question.

**Closed 20 Aug 2026 (titles-stop-naming-weekdays slice).** The trigger fired
exactly as written: a slice changed both onboarding prompts, so both benches
were its first tasks. `npm run eval:onboarding` grades nine cases (six
extraction, three merge) through the real production path, per assertion
rather than per case, and its before-and-after numbers are in that slice's §11
entry. (Annotated 20 Aug 2026, narrow-weekday-rule slice, review-fix pass: the
case count above is the count at this entry's own close and is left as
written; two later changes the same day, the bench widening and the
narrow-weekday-rule fix, grew it to thirteen, and a code-review pass on that
same branch added one more day-prominent multi-day case on top of that, for
fourteen, eleven extraction and three merge. Current count lives in
CLAUDE.md's running summary, not here.) All
three model behaviors are benched now, so commitment 2 above (a
model version change requires all three benched before it lands) is satisfiable
for the first time. The queue-not-fix-now recommendation recorded above proved
right: the gap cost nothing until the day it was paid for.

## 11. Build log (implementation decisions)

*Build phase, begun June 2026. Entries here are decisions made while implementing, ADR-style, one per build slice. They realize and extend the product-design decisions in sections 1 to 10; they do not replace them.*

### Before first Vercel deploy — prerequisites checklist

Seven High-priority items come due at the moment of the first production deploy. Check all seven before pushing.

1. **Set `CRON_SECRET` in the Vercel dashboard** (Environment Variables → Production).
   *Why it blocks deploy:* the Orbit cron endpoint (`/api/cron/orbit`) returns 401 by design in production when the secret is absent. The value is a randomly generated secret; never commit it to the repo.
   *Detail:* Orbit scheduled-event slice §11 — "CRON_SECRET is a new required production env var."

2. **Wire `prisma generate` into the build** (e.g. add `"prisma generate"` as a Vercel build command prefix, or add a `postinstall` script in `package.json`).
   *Why it blocks deploy:* Prisma 7 does not auto-generate the client on install. After the Orbit slice the schema includes the `Group.timeZone` column and the `MessageAuthor.ORBIT` enum — a stale generated client will fail at runtime the first time either is touched.
   *Detail:* Data-foundation slice §11 — "`prisma generate` does not auto-run in Prisma 7."
   *Amended 23 Aug 2026 (pre-deploy-fixes slice, final review): do item 15 before this one. `prisma generate` cannot start at all without `DIRECT_URL` set, so wiring it into the build without that variable in place makes the first production build fail at the step this item creates.*

3. **Add `connection_limit=1` to the production `DATABASE_URL`.**
   *Why it blocks deploy:* Vercel runs each serverless function as its own short-lived process, and each one opens its own Prisma connection pool. Without a per-connection cap, concurrent traffic can exhaust Supabase's connection ceiling and produce intermittent "too many connections" errors that never appear in local testing because local testing is never concurrent.
   *Amended 23 Aug 2026 (pre-deploy-fixes slice, final review): read this as **set `DATABASE_URL` in the Vercel dashboard** (Environment Variables → Production), **with `connection_limit=1` on it**, rather than as a tweak to a value that is already there. The original wording presumed the variable existed, and nothing else on this list ever says to create it, so a person working through the list literally sets four named variables and no database URL at all. `src/lib/prisma.ts:10` throws "DATABASE_URL environment variable is not set" on the first request to any page, which is the same whole-site-down shape as item 12, not one degraded feature.*
   *Detail:* `pgbouncer=true` and `connection_limit=1` do different jobs and both are needed. `pgbouncer=true` tells Prisma it is talking to a transaction-mode pooler and to stop using prepared statements (correctness). `connection_limit=1` caps what each function instance opens (pool exhaustion). Setting one without the other leaves the other failure mode live.

4. **Set `ANTHROPIC_API_KEY` in the Vercel dashboard** (Environment Variables → Production).
   *Why it blocks deploy:* founder onboarding's extraction call requires it. Without it, every onboarding attempt fails soft on Step 1 and no group can be created through the designed flow.
   *Detail:* Founder-onboarding slice §11. Server-side only; the key never reaches the browser.

5. **Apply pending migrations to the production database** (currently `add_group_description` and everything before it).
   *Why it blocks deploy:* the confirm action writes `Group.description`; a production database without the column fails every group creation.
   *Detail:* Migrations to date have been applied to the dev-test project only (two-databases rule).

6. **Cron cadence changed daily → hourly for the gauge endgame (`vercel.json`).**
   *Why it blocks deploy:* verify the Vercel plan tier supports hourly cron (Hobby caps at daily). If capped: either upgrade, or keep `vercel.json` daily and point an external scheduler (with the CRON_SECRET bearer header) at `/api/cron/orbit` hourly.
   *Detail:* the bump/close land within the hour of their target moments; that precision is the accepted product behavior.

7. **Apply migration `20260804190626_wrong_day_retry_markers` to the production database** (two nullable Gauge marker columns, plus `Gauge.sourceMessageId` becoming nullable).
   *Why it blocks deploy:* the wrong-day-retry slice writes and reads `Gauge.retryAskMessageId` and `Gauge.retryGuessOfGaugeId`, and creates guess gauges with no source message; a production database without this migration fails on both.
   *Detail:* wrong-day-retry slice, Task 2.

8. **Apply migration `20260810204408_gauge_day_suggestion` to the production database** (four nullable Gauge columns holding the day a member named, one unique index on the naming message, two foreign keys that null out rather than cascade).
   *Why it blocks deploy:* the day-comment slice writes the remembered day, who named it, and the message that named it onto the gauge row, and reads them back at close to decide whether to revive. A production database without this migration fails every day comment, and it fails quietly inside detection's catch-and-log block, so the only visible symptom would be Orbit going silent for no stated reason.
   *Detail:* day-comment slice, Task 2. Applied to dev-test only, per the two-databases rule.

*Correction, 10 Aug 2026 (day-comment slice): eight items now, not seven. The count in the line above is left as written, per the append-only rule; read it as "check all of them".*

9. **Put a spending ceiling on pre-auth model calls before the product is reachable at a public URL.**
   *Why it blocks deploy:* every model call in the product (onboarding extraction, the gap-ask merge, chat intent detection) is reachable by an anonymous session with no sign-in, because no surface is membership-gated and identity is anonymous-first by design. A deployed URL with no ceiling is an open door to unbounded API spend that no user account limits. The ceiling can be a provider-side spend limit, an app-side cap, or both; which one is a decision for the deploy moment, not for this line.
   *Detail:* elevated from debt to checklist item at the pre-MVP triage pass, 10 Aug 2026 (triage entry, below in §11).
   *Amended 11 Aug 2026 (triage round two): satisfied for MVP by the provider-side hard cap already in place (prepaid credit with auto-reload off), confirmed at the deploy moment rather than built; no rate-limiting code. The cap converts cost risk into downtime risk, accepted for a portfolio piece, and the hardening slice's graceful out-of-credit screen is the face of that downtime.*

*Correction, 10 Aug 2026 (pre-MVP triage pass): nine items now. Same reading as above: check all of them.*

10. **Apply migration `20260811150701_add_system_message_author` to the production database** (adds `SYSTEM` to the `MessageAuthor` enum, nothing else changes shape).
    *Why it blocks deploy:* the join announcement (joining-arc slice) writes a `MessageAuthor.SYSTEM` message inside the join transaction. A production database without this migration fails every first join, and it fails inside a transaction that also writes the membership row, so the person would not even get into the group.
    *Detail:* joining-arc slice, Task 2. Applied to dev-test only, per the two-databases rule.

*Correction, 11 Aug 2026 (triage round two): ten items now. Same reading as above: check all of them.*

*Correction, 11 Aug 2026 (joining-arc slice): ten items now. Same reading as above: check all of them.*

11. **Apply migration `20260818190840_proposal_lapsed_answer` to the production database** (adds `LAPSED` to the `ProposalAnswer` enum, nothing else changes shape).
    *Why it blocks deploy:* the time-change endgame sweep writes `answer: LAPSED` on every stalled group vote it closes, on the hourly cron. A production database without this migration fails that write on every sweep, and it fails inside the same transaction that posts Orbit's closing message, so the visible symptom is that a stalled time change simply never ends, which is the exact gap the slice exists to close.
    *Detail:* time-change-ending slice, Task 1. Applied to dev-test only, per the two-databases rule. Additive enum value: safe to apply ahead of the code, and it must be, since a deploy of the code against an older database would fail on the first sweep.

*Correction, 18 Aug 2026 (time-change-ending slice): eleven items now. Same reading as above: check all of them.*

12. **Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in the Vercel dashboard** (Environment Variables → Production) **before the build runs, not merely before the first visitor.**
    *Why it blocks deploy:* `src/lib/supabase/env.ts:4` throws by name when either is missing, so every page of the site fails on its first request. The checklist read as complete without them, which is the dangerous shape: the deploy goes green and the site is entirely down. Because both are `NEXT_PUBLIC_`, they are inlined at build time, so setting them after a green build does nothing until the next build. That timing distinction is the whole reason this is a checklist item rather than a fix-it-when-it-breaks.
    *Detail:* pre-launch audit, finding 1 (22 Aug 2026). The thrown error names the missing variable, so diagnosis is fast once somebody looks.

13. **Turn on anonymous sign-ins in the production Supabase project** (Authentication → Sign In / Providers → Anonymous sign-ins).
    *Why it blocks deploy:* every identity in the product starts as an anonymous session, and both doors mint one (`src/app/actions/create-group.ts:70`, `src/app/actions/join-group.ts:38`). Production is a different Supabase project from the one everything was built against, and this is a dashboard switch that does not carry over. With it off, the founder completes the entire onboarding wizard and gets "Could not create a session. Please try again." forever, and so does everyone who opens the invite link. The message points at nothing, which is what makes this expensive to diagnose and cheap to prevent.
    *Detail:* pre-launch audit, finding 2 (22 Aug 2026). Anonymous-first identity is a founding decision, build-notes §3.

*Correction, 23 Aug 2026 (pre-deploy-fixes slice): thirteen items now. Same reading as above: check all of them. Both additions come from the pre-launch audit's fix-before-deploy findings, and both take the whole site down rather than degrading one feature, which is a class the first eleven items did not contain.*

14. **Run `prisma migrate deploy` against the production database, never `prisma migrate dev`.** All 14 migrations apply in one run, in order, against a database with no `_prisma_migrations` table yet.
    *Why it blocks deploy:* `migrate deploy` is built for exactly this case, an empty database with no migration history: it creates its own bookkeeping table and applies every pending migration without asking anything. `migrate dev` is the local development command and can prompt to reset (wipe) whatever database it is pointed at when it sees drift; that prompt has no place anywhere near the production database, and this project's day-to-day habit is typing `migrate dev` against dev-test, which is exactly what makes the wrong command a real risk rather than a theoretical one.
    *Detail:* pre-deploy migration read, Task 9 (23 Aug 2026). The read also confirmed the other five checklist entries about migrations (5, 7, 8, 10, 11) together cover the full set of 14; the four named individually were chosen because each has a distinct silent-failure shape worth calling out, not because the other nine are somehow optional.

    *Amended 23 Aug 2026 (pre-deploy-fixes slice, final review): the item named the safe command but not the safe method, and the method is the dangerous half. Point the CLI at production with a one-off inline override on that single command, `DIRECT_URL="<production session-pooler URL>" npx prisma migrate deploy`, rather than by editing `.env`, so nothing in the checkout still points at production the moment the command exits. Then run `npm run db:which` immediately, before touching anything else, and confirm it prints the dev-test ref. Why the method matters more than the command name: the Prisma CLI reads `DIRECT_URL` out of `.env` (`prisma.config.ts:1` loads it), and `.env` is also what the test suite reads. This project's tests are integration tests that create and delete real records, so an `.env` edited to production and not reverted means the next `npm test` writes rows into the production database and then deletes them again. That is the one rule in this project with no undo, "two databases, never crossed" (CLAUDE.md), broken by a step that felt like it was over.*

*Correction, 23 Aug 2026 (pre-deploy-fixes slice, migration read): fourteen items now. Same reading as above: check all of them.*

15. **Set `DIRECT_URL` in the Vercel dashboard** (Environment Variables → Production), **before running the build that item 2 sets up.**
    *Why it blocks deploy:* `prisma.config.ts:13` resolves `env("DIRECT_URL")` eagerly, the moment the config file loads, so every Prisma CLI command fails to start without it. That includes `prisma generate`, which otherwise never touches a database at all. Item 2 wires `prisma generate` into the Vercel build, so with this variable missing the very first production build fails at the step item 2 creates, and no version of the site ever reaches anyone. Nothing else on this list mentioned the variable.
    *Detail:* this one is read at **build** time, by the Prisma CLI, not at request time by the app, which is what makes its failure shape different from items 3 and 12: a build that never goes green rather than a site that deploys and then breaks on the first visitor. The value is the Supabase **session** pooler URL (port 5432), a different connection string from `DATABASE_URL`'s transaction pooler (port 6543); the data-foundation slice below explains why the project carries both and why the literal "direct" host is not used. `README.md` already states the same consequence for a local checkout: "Leaving `DIRECT_URL` out is not a quiet degradation: every Prisma CLI command fails to start, including `prisma generate`, which otherwise never touches a database." Pre-deploy-fixes slice, final review (23 Aug 2026).

*Correction, 23 Aug 2026 (pre-deploy-fixes slice, final review): fifteen items now. Same reading as above: check all of them. Read item 15 before item 2, despite the numbering; the append-only rule keeps the numbers where they are, and item 2 now carries a pointer to it.*

### Data-foundation slice (18 to 19 June 2026)

Stood up the data layer: Prisma wired to the Supabase Postgres database, the seven-model schema from section 2 implemented, first migration applied, one Vitest smoke test passing against the live dev database. Committed and pushed.

- **Prisma 7, with CLI config in `prisma.config.ts`.** Prisma 7 moved the database URL out of `schema.prisma`'s datasource block into a root `prisma.config.ts`, where the CLI reads `DIRECT_URL` for migrations. This deviated from the original spec, which assumed the older `datasource { url, directUrl }` shape; the current installed version (7.8.0) required the change.
- **Driver adapter required.** Prisma 7 ships no bundled query engine, so the client is built with a `PrismaPg` adapter (`@prisma/adapter-pg` + `pg`) wrapping the pooled connection. All three packages are listed in `next.config.ts` `serverExternalPackages` so Turbopack does not bundle them.
- **Generator is `prisma-client-js`, not the Prisma 7 default `prisma-client`.** The new provider has a module-resolution bug with Next.js 16 + Turbopack; the previous generator sidesteps it. Deliberate and reversible (tech debt below).
- **Two connection strings, both IPv4-safe.** `DATABASE_URL` is the Supabase transaction pooler (port 6543, `pgbouncer=true`), used by the client at runtime through the adapter. `DIRECT_URL` is the Supabase session pooler (port 5432), used only by the Prisma CLI for migrations. We deliberately did not use Supabase's literal "direct" connection (`db.[ref].supabase.co`) for `DIRECT_URL`: that host is IPv6-only and fails migrations on an IPv4-only network, whereas the session pooler works on both. Both live in `.env` (not `.env.local`, because the Prisma CLI reads `.env` by default and Next.js reads it too); `.env` is git-ignored.
- **Supabase Data API disabled; Prisma owns the schema.** At project creation we turned off the auto-generated REST/GraphQL Data API and the "auto-expose new tables" grant, and declined Supabase's GitHub auto-deploy integration. Rationale: we do not use supabase-js, and a single owner of schema (Prisma migrations) avoids a competing source of truth. This does not affect Supabase Auth (section 3's anonymous-session plan), which is a separate service. Reversible if we ever want supabase-js, which would also require adding RLS policies, since ORM-created tables do not get row-level security automatically.
- **Prisma client singleton.** One client reused across hot reloads in development (Supabase's pooler has per-project connection limits), a fresh one per process in production, with a startup guard that fails fast if `DATABASE_URL` is missing.
- **How section 2's data model was realized in Prisma.** IDs are `cuid()`. Edited tables carry `createdAt` and `updatedAt`. `Rsvp.respondedAt` uses `@updatedAt` plus a database-level default, so it is always set; note this tracks the latest response, not the first, an accepted tradeoff. Cascade rules: deleting a group or event cascades to its children; deleting a venue nulls the optional venue choice on affected RSVPs; `Group.founderId` is `Restrict`, so a user who founded a group cannot be deleted until the group is handled. That last point is a build-discovered constraint: account deletion (a later concern, given anonymous sessions per section 3) will need to reassign or remove founded groups rather than be blocked. `recurringActivities` is stored as `Json?` on Group, not a first-class table (tech debt below).
- **Invite link is a rotatable token, not the raw group id.** `Group.inviteToken` is a unique, auto-generated `cuid()` kept separate from the group id. This lets the §4 "reset invite link" founder power issue a fresh link later by assigning a new token, without changing the group's identity (which would break every existing reference). Same additive-foresight pattern as many-to-many and venue options: the field exists from day one, so reset is a UI fast-follow rather than a retrofit.

**Tech debt opened in this slice** (also carried in the commit message):
- `prisma-client-js` generator: migrate to `prisma-client` once the Next.js 16 Turbopack fix lands. Low; a one-line generator change plus import-path updates.
- `recurringActivities` as `Json?`: promote to a table if Orbit needs to query or notify per-activity. Low; additive migration.
- Smoke test runs against the live dev database: stand up a dedicated test database before wiring CI. Medium.
- `prisma generate` does not auto-run in Prisma 7: wire it into the build or a `postinstall` step before the first Vercel deploy, or a deploy will ship a stale client. High.

**Pending setup (from the section 9 checklist).** The Claude Code hooks are not yet configured: a PostToolUse hook to auto-run tests after edits, and a PreToolUse hook to block direct edits to migration files and `.env`. Worth adding before the next slice that touches the schema, so an applied migration or a secret cannot be edited by accident.

**Process note.** Built with the Superpowers subagent-driven flow: plan, then per-task implement-and-review, then a whole-branch review, fix, and re-review. The whole-branch review caught four real issues (a missing `Rsvp.eventId` index, the `respondedAt` database default, the `DATABASE_URL` startup guard, and `@prisma/adapter-pg` missing from `serverExternalPackages`); all four were fixed and re-reviewed clean. This slice was committed directly on `main`; from the next slice on, each gets its own short-lived feature branch so the work lands through a pull request.

### Founder-auth slice (June 2026)

Built the founder half of the anonymous-session flow from §3: a person visits a create-group screen, enters their name and a group name, and that single act mints their anonymous session and stands up their group. The flow runs end to end, from an empty form to a real, addressable group page showing a copyable invite link, and is the first user-facing vertical in the product. Built on its own short-lived feature branch, reviewed (per-task plus a whole-branch pass), tested against the live dev database, verified by hand in the browser, and landed as a pull request. The throughline of the slice was choosing the smallest real thing that would exercise the whole auth path honestly, rather than building auth plumbing in isolation or the full designed onboarding all at once.

- **Bundled auth with a minimal create-group flow, rather than building auth on its own.** A Supabase anonymous session only gets created when a person takes a real action, and per §3 that action is "founder creates a group." Building pure auth would have meant firing the session machinery from a throwaway test trigger and then rewiring it into the real flow a slice later, which is motion that produces nothing demonstrable and reads as wheel-spinning. Bundling gave auth a genuine home and an end-to-end test through actual product behavior. The counterweight was scope discipline: the create-group screen here is a deliberate functional stub (two fields and a button), explicitly not the designed onboarding (Orbit's bubble, the rhythm capture, the playback card from §7), which remains its own later slice. Recorded plainly so the spare screen reads as an intentional boundary, not unfinished work.
- **The anonymous session is minted server-side, inside the create-group action; the form is purely presentational.** When the founder submits, the server decides whether to mint a session and writes the records; the client form just collects two fields and hands them off. We went this way because the session and the database writes belong together as one trusted server-side step: the browser never holds the logic that creates identity or provisions a group, which keeps the security-sensitive part in one place and matches the principle that every server action confirms the user itself rather than trusting anything the client asserts. The tradeoff is that the riskiest piece of the whole slice, whether the session cookie actually persists when set from inside the action, is not something an automated test exercises; it was proven instead by a manual browser check, which is the honest verification for it.
- **Mint only after checking for an existing session first (the duplicate-ghost guard).** Before creating anything, the action looks for a session already in play; if one exists, it reuses that person as the founder instead of minting a second anonymous identity. This is the guard §3 calls out as the thing that otherwise lets the app manufacture duplicate accounts. In the founder path a session usually is not present yet, so the guard rarely fires here, but it was built now for two reasons: it is the same guard the member-join slice leans on against invite-link taps, where it matters most, and establishing it early means the pattern is consistent rather than retrofitted. We chose this in-product check over leaning on social cleanup (the founder-deletes-the-ghost recovery from §3), which remains the acceptable fallback at casual scale but should not be the first line of defense.
- **User, Group, and founder Membership are written in one atomic transaction.** The three records are created together or not at all, so a failed write can never leave a half-made group, a founder with no membership, or a group with no founder. The reason is that these three are a single logical fact ("this person founded this group"), and §1's group-first model treats membership as the thing the roster is built from, so the founder must be a member from the very first moment, not a special case bolted on. Writing them separately would have invited partial states that every later slice would then have to defend against. The transaction makes the invariant true by construction instead of by vigilance.
- **No schema change was needed, which validated earlier foresight.** The slice rode entirely on fields the data-foundation slice already put in place: User.supabaseAuthId (unique, nullable) to link our user to the Supabase identity, and Group.inviteToken (unique, auto-generated) for the invite link. The day-one decision to include those fields is why this slice was purely additive code rather than a migration plus code, a concrete payoff of the "make relationship-shape decisions early, defer cheap additive ones" discipline from §2 and §11.
- **Supabase is used for auth only; data stays in Prisma.** Consistent with the data-foundation decision to disable the Supabase Data API, the only thing Supabase does in this slice is mint and read the anonymous session. All reads and writes go through Prisma. This was held as a hard line because the most common online patterns reach for the Supabase client to touch data, which would quietly reintroduce the competing source of truth we deliberately removed. The single thread between the two systems is the supabaseAuthId pointer, and nothing else crosses over.
- **Adopted Supabase's newer key naming from the start.** Used the publishable key (browser-safe) plus the project URL, and deliberately did not add the secret key, since minting and reading an anonymous session does not need it and keeping fewer secrets around is the safer default. The older anon/service_role keys are on a deprecation path, so starting on the new names avoids building onto something already being sunset.

**Deliberately deferred in this slice** (each flagged so it reads as a choice, not an oversight):
- **The email-upgrade path is not built.** Its trigger is the user's first RSVP (§3), and RSVPs do not exist until the event vertical, so wiring the upgrade now would have no real trigger to attach to. The capability is understood and the data model already supports it; it waits for the slice that gives it a reason to fire. The session fragility this addresses (cleared storage, in-app browsers, the iOS storage cap) is the accepted tradeoff of "experience before PII," not a defect to fix here.
- **The group page is ungated.** Any session can currently view any group page. Real access control (confirming the viewer is a member) belongs to the slice that builds the actual group surface; gating a stub would be premature.
- **The invite link does not resolve yet.** The founder can copy a /join/<token> link, but the route does not exist until the member-join slice, so the link is display-and-copy only for now. The URL shape is committed so that slice is purely additive. A related open item: the token is a long, opaque string, and whether to surface a friendlier invite-link format is a real product decision to settle when member-join makes the link live, rather than guessed at now.
- **Two helpers were built ahead of their consumers; both are now resolved.** `getCurrentUser` was consumed by the member-join slice (the join page pre-fills a returning session's name; the viewer-aware `/groups/[id]` uses it to distinguish founder from member). The browser-side Supabase client was reviewed and pruned as unused: the server-side-everything pattern proved sufficient for every action and page added so far, and no slice ever needed a client-side escape hatch, so the file was deleted rather than left as an invitation to reach for it.
- **Captcha on anonymous sign-in was skipped.** Supabase recommends it to stop bots mass-creating ghost accounts. For an unlaunched portfolio MVP the risk is low, so it is noted as a production-readiness item rather than built now.

### Member-join slice (22 to 23 June 2026)

Delivered the invite-link join flow: `/join/<inviteToken>` resolves a group, mints an anonymous Supabase session server-side if there isn't one (the same pattern as the founder create-group action), finds or creates a User row, and upserts a Membership on the `(userId, groupId)` unique. New visitors enter a name; returning sessions see their name pre-filled read-only, because name is global across all of a user's groups and letting someone edit it on the join form would silently rename them everywhere. Members land on a thin "You're in" confirmation. All nine tests pass across three test files; QA'd against all five paths (new visitor, existing session, founder revisit, re-tap, invalid token).

- **Duplicate-prevention is two layers, both intentional.** The server action calls `getUser()` before `signInAnonymously()`, so a returning tap reuses the existing anonymous session rather than minting a second account. The lib function then upserts the Membership on `@@unique([userId, groupId])`, so a re-tap is a harmless no-op and the constraint is the safety net for any race. The explicit session check is the primary guard; the unique constraint is the backstop. Both stay; removing either breaks the promise.

- **The member lands on the real `/groups/[id]` route, made minimally viewer-aware, not a throwaway stub.** The alternative was a short-lived `/join/success` or `/welcome` page that would be dead code the moment the real group page shipped. The chosen approach: a single additive conditional on `/groups/[id]` that shows "You're in" to non-founders and leaves the founder's "Your group is ready" share moment byte-for-byte unchanged. The member ends up at the group's canonical URL from day one, viewer-awareness is the first inch of something that page needs anyway, and the diff is additive. When the real group page ships, the "You're in" branch grows in place rather than being replaced.

- **Not-found handling is split by surface on purpose.** A bad invite token renders a calm, branded inline state — "This invite link isn't valid. Ask whoever sent it to share it again." — rather than a 404. A bad group ID on `/groups/[id]` keeps the standard `notFound()`. The distinction is intent: a typo'd invite link from a friend deserves warmth; a direct URL to a nonexistent group ID is a genuine dead end with no soft landing to offer.

**Deferred as sequencing choices, not omissions:**
- Real group page (event card, feed, pinned input): the viewer-aware `/groups/[id]` is an interim member landing only. The full page belongs to a later feed slice.
- "Jesse joined" feed announcement (section 4): there is no Message or feed model in the schema yet, so the announcement belongs to the slice that introduces one.
- Member-facing invite surfacing: deferred to the group-info page, which already carries the share link for founders by design. The first-arrival moment should be a calm "you made it in," not an immediate ask to recruit others.

### Event-detail slice (23 June 2026)

Delivered the event detail page at `/events/[id]`: a server-rendered page that reads the event, its venue(s), all group members, and all RSVPs in one Prisma query, derives the IN / OUT / HAVEN'T REPLIED roster buckets on the server, and renders the complete page before any JavaScript runs on the client. The RSVP write is a reusable `setRsvp` lib function (upsert on the `@@unique([eventId, userId])` compound key) driven by a server action and a colocated client form using `useActionState`. All three roster buckets are populated via a fixture seed script. 12 tests pass across 4 test files; QA'd browser-side after seeding (all buckets visible on load; "I'm in" / "Can't make it" write and update correctly; re-tap updates not duplicates; page re-renders server-side after each RSVP with no client loading flash).

- **"HAVEN'T REPLIED" is the absence of an `Rsvp` row, never stored.** The `RsvpStatus` enum is `IN` / `OUT` only — confirmed against the schema. A member with no row for this event is HAVEN'T REPLIED; a member with an IN row is IN; OUT row is OUT. Counts fall out of these three buckets. Nothing about "pending" or counts is ever written to the database. This matches the §2 data-model decision and is enforced in the lib function (upsert; no third status value) and the server action (validates `status` is `IN` or `OUT` before passing to the lib).

- **Route is flat `/events/[id]`, not nested under `/groups/[id]/events/[eventId]`.** An event belongs to exactly one group via a FK; the group id in the URL would be redundant and introduce a mismatch edge case (URL group id vs. event's actual `groupId` FK). The group context needed for the page (name for the eyebrow, memberships for the roster) is reached through the event relation rather than the URL.

- **`setRsvp` is a standalone lib function, not inlined into the page action.** The home-screen quick-RSVP card (a later slice) needs the same write. Extracting it into `src/lib/events/rsvp.ts` now means the later slice is purely additive: import and call, no refactor. The function is TDD'd (test written first, watched fail, then implemented; 3 integration tests against the live dev DB).

- **The RSVP action does not mint an anonymous session, unlike the join and create-group actions.** A user without a session has no group membership; letting them RSVP would write a row detached from any roster and misrepresent the "who's coming" picture. The page omits the RSVP control for unauthenticated viewers entirely. This is a deliberate behavioral divergence from the other actions, noted in both the action file and this entry.

- **RSVP button treatment: teal primary "I'm in" + outlined secondary "Can't make it".** The original slice brief described lime as the primary color and two co-primary equal-weight buttons; this contradicts CLAUDE.md (teal is the single primary per screen; lime is Orbit-brand only, never an action). CLAUDE.md takes precedence over a brief restatement of design rules, so the standing convention was kept and the brief's language treated as an inversion. Active state is indicated by a checkmark prefix on the active button (✓ I'm in / ✓ Can't make it) — never by color alone, satisfying the §7 accessibility rule (red/green colorblind product owner).

- **Placeholder avatar: deterministic initials on a hue seeded from the member's name.** Same name always produces the same color; the avatar color encodes identity, not status, so it does not conflict with the §7 "status by brightness plus icon or label, never by hue" rule. The designed celestial-doodle avatar is a deliberate fast-follow.

**Tech debt opened in this slice** (also carried in the commit message):

- Fixture seed script (`scripts/seed-fixture-event.ts`): deliberate bridge until Orbit's event-creation slice lands. Lands in the single real dev database (no separate test DB yet — see data-foundation §11 tech debt). Must be removed before launch. Medium.
- Dates displayed in UTC, no timezone awareness: the page formats `startsAt`/`endsAt` as UTC times. Correct per-user display requires storing an event timezone and reading the viewer's locale, which belongs to a later slice. Low.

**Deliberately deferred in this slice** (each flagged so it reads as a choice, not an oversight):

- **No event creation.** Events are created by Orbit (scheduled and spontaneous) in later slices. The fixture seed is the bridge.
- **No chat feed, no Message model, no pinned input.** That is the feed slice.
- **No "Add to calendar" button.** A proper calendar export (an `.ics` with correct timezone handling for Apple, Google, and Outlook) is its own small slice. A dead button is worse than no button; the page is coherent without it.
- **Single-venue UI.** The model supports a set of venues per event; the page shows `venues[0]`. Multi-venue UI is a fast-follow (§8).
- **Email-capture ask omitted.** Per §3, Orbit asks for an email after the user's first RSVP. Orbit has no chat surface on this screen yet, so the ask waits for the slice that gives it a place to appear.
- **Page is ungated.** Any session can view any event page. Membership-gating (confirming the viewer is a member of the event's group) belongs to the slice that builds access control across surfaces — consistent with how the group page was handled in prior slices.

### Optimistic-RSVP slice (23 June 2026)

Wired `useOptimistic` into `RsvpControls` so the RSVP buttons flip the moment the user taps, before the server responds. This resolves the "tap feels slow" item flagged during event-detail QA. No schema change, no new screens, no change to `setRsvp` or the server action's write.

- **`useOptimistic` for display, `revalidatePath` as truth.** `optimisticStatus` (derived from `currentStatus`, the server-rendered prop) flips instantly inside a `useTransition`. On success the action calls `revalidatePath`, the server component re-renders, and `currentStatus` updates to match; the optimistic and real values agree with no flicker. On failure the action returns an error and skips `revalidatePath`, so `currentStatus` stays unchanged; `useOptimistic` reverts to its base automatically once the transition settles.

- **Rollback and notify on failure is a hard product requirement.** RSVP accuracy is the whole value of this product. A silently-wrong button (showing IN after a failed write) would misrepresent who is coming and corrode trust. The rollback path is the only acceptable outcome on failure: the button snaps back to the real previous status and a soft message appears ("Couldn't save that, try again."). No em or en dashes in the message copy, per CLAUDE.md §copy. The user always sees a state they can trust.

- **`useActionState` replaced by `useTransition` + `useOptimistic` + `useState`.** The brief named `useActionState` as the expected companion; it was swapped for the trio because `useActionState`'s dispatch is not awaitable in the standard way, which means an optimistic value set before the dispatch can revert before the write completes — the silently-wrong state we must not ship. The documented Next.js pattern (forms guide, §"Optimistic updates") awaits the server function directly inside `startTransition`; `useTransition` provides the same `isPending` that `useActionState` did, and one `useState` holds the error the action returns. The server action (`rsvpAction`) is reused verbatim; only the client wiring changed.

- **Double-tap safety.** Both buttons are disabled while `isPending` is true, so a rapid second tap cannot start a conflicting in-flight write. The screen always reflects a coherent state.

- **Accessibility treatment unchanged.** Active state is still the checkmark prefix (✓ I'm in / ✓ Can't make it) keyed off `optimisticStatus`. The teal/outlined button assignment is unchanged. Status is never communicated by color alone.

**No component test added.** The vitest environment is `node`-only; adding jsdom and React Testing Library to assert a `useOptimistic` revert would be disproportionate and brittle (the brief explicitly cautions against forcing a brittle UI test). The rollback rests on `useOptimistic`'s documented revert-to-base semantics and is verified manually. The existing `setRsvp` integration tests, which cover the unchanged write path, still pass.

### Group-home-chat slice (24 June 2026)

Replaced the `/groups/[id]` placeholder landing with the real group home (walkthrough frame 06) and introduced the chat backend for the first time. The page now renders a pinned compact event card (counts-only status, 3-letter weekday abbrev, tappable link to detail), a scrollable chat feed with a pinned input, and a group-info stub at `/groups/[id]/info` that preserves invite-link reachability. Members can send messages that persist and appear optimistically. Orbit's presence is fixture-seeded welcome messages; zero model calls were made in this slice. The feed is the hard prerequisite for the Orbit-goes-live next slice. 28 new tests added across 4 new test files (format, roster, upcoming, messages); full suite is 40/40. TypeScript build clean.

- **Message model: explicit `MessageAuthor { MEMBER, ORBIT }` enum + nullable `authorId`, not a seeded Orbit user.** Orbit is deliberately not a `User`/`Membership` row; keeping it out of the people graph means it can never appear in rosters, counts, or member lists (which would corrupt RSVP tallies and violate "member lists are names only"). A nullable `authorId` (`null` for ORBIT, set for MEMBER) mirrors the existing `Rsvp.venueId` nullable-FK + `onDelete: SetNull` pattern. The enum is self-documenting — no reader has to infer "null author = Orbit" — and a future `SYSTEM` value cleanly absorbs the deferred "Jesse joined" system announcement without another migration.

- **Single source of truth for roster/counts/date formatting.** The roster derivation, counts formatting, and date/time helpers that were previously inlined in `events/[id]/page.tsx` were extracted into shared lib modules (`src/lib/events/roster.ts`, `src/lib/events/format.ts`). The event-detail page was updated to import from these modules, and the new home-screen card consumes the same functions. This is a pure, behavior-preserving extraction — nothing about what the detail page renders changed — confirmed by the full test suite staying green. No code was duplicated; the debt note in the original plan was removed by doing the work rather than logging it.

- **`rsvpAction` revalidation widened additively.** The action previously revalidated only `/events/${eventId}`. When the optional `groupId` hidden field is present (supplied only by the home-card `RsvpControls`), it also calls `revalidatePath(\`/groups/${groupId}\`)` so the card's counts reflect the change on hard reload. The event-detail caller omits `groupId`; its behavior is unchanged.

- **`RsvpControls` widened with backward-compatible `compact` and `groupId` props.** The compact prop tightens button padding for the home card; the default renders the full detail-page sizing. The event-detail page continues to pass neither prop and renders identically to before. This is the reuse the slice plan required: identical logic, smaller shell, no reinvention.

- **Optimistic chat: `useOptimistic` list-reducer pattern, not the scalar-swap RSVP pattern.** RSVP uses `useOptimistic(scalar, identity-swap)`; chat uses `useOptimistic(array, (state, msg) => [...state, msg])`, the list-append reducer documented in the Next.js 16 forms guide (§"Optimistic updates") and illustrated there with a message-thread example. `GroupHome` is the single client island that owns both `useOptimistic` and the input state — they share a common parent so the optimistic list is consistent between the feed display and the input form. The rollback on failure is the same hard requirement as RSVP: a failed send reverts the optimistic message and shows a soft error ("Couldn't send that, try again."), never leaving a silently-failed message in the feed.

- **Send arrow: contextual teal-on-type, not a second persistent primary.** The send arrow is dim (`--text-placeholder`) when the input is empty and turns teal (`--color-teal`) once the viewer has typed. This coexists with the card's persistent "I'm in" teal per the §7 send-arrow note: a contextual action (only live while composing text) is not a second persistent primary and does not violate the one-primary-action-per-screen rule.

- **Invite-link bridge: minimal `/groups/[id]/info` stub.** The prior `/groups/[id]` route was the only place the founder's invite link lived. Rather than letting the link become unreachable when the route became the home, we added a minimal stub at `/groups/[id]/info` that carries only the invite-link UI (founder-gated, as before). The header chevron routes to this stub, matching the eventual group-info grammar (§7: "the group title with chevron opens group info"). When the full group-info page ships, this stub grows in place. Preserving the founder-only gate is intentional; member-facing invite surfacing is a group-info-slice product decision.

- **No `startsAt` index existed for the soonest-upcoming-event query.** A composite `@@index([groupId, startsAt])` was added to `Event` in the same migration as the Message model to back the new `findSoonestUpcomingEvent` query efficiently.

- **Chat-bubble surface tokens added to `globals.css`.** `--surface-orbit`, `--surface-bubble-member`, and `--surface-self` satisfy the §7 "chat voice system" structural rule using on-system neutrals: provably neither teal (which reads as a button) nor lime (which reads as Orbit). Values are functional placeholders; the pixel-level visual pass against the walkthrough is a deferred polish phase.

**Tech debt opened in this slice** (carried in the commit message):

- `RsvpControls` lives under `src/app/events/[id]/` but is now consumed by the home-screen card. Noted for future relocation to a shared components directory when the next refactor opens that area.
- Chat-bubble fill tokens (`--surface-orbit`, `--surface-self`, `--surface-bubble-member`) are functional placeholders. The pixel-level pass against the walkthrough is a dedicated deferred phase.
- Fixture seed still writes to the live dev database (pre-existing debt, now also seeds messages). Retires with the fixture bridge when Orbit's event-creation and posting slices land.
- `prisma generate` is not wired into build/postinstall (pre-existing high-priority debt from data-foundation §11). After this slice the `MessageAuthor` enum is required at runtime — if the client isn't regenerated before a deploy, the enum will be missing. Wire `prisma generate` into the build step before the next Vercel deploy.

**Deliberately deferred in this slice** (each flagged so it reads as a choice, not an oversight):

- **Orbit posting live** (spark, interest gauging, nudges): next slice.
- **Condensed card after RSVP**: left unbuilt per the §7 open question; full pinned card ships; revisit only if the live app proves it crowds the chat.
- **Email-capture ask after first RSVP**: rides with Orbit's live posting.
- **Membership gating of the home**: consistent with prior ungated surfaces, until the access-control slice.
- **"Jesse joined" system announcement**: the `SYSTEM` MessageAuthor value is anticipated by the model design but not wired this slice (would require touching the join flow, out of lane).
- **Multi-card swipe carousel**: one fixture event, so single-card only; carousel chrome waits for ≥2.
- **Full group-info page**: its own slice; the stub grows in place.
- **Pixel-level visual polish** against the walkthrough: a dedicated polish phase.

**No component tests added.** Same rationale as the optimistic-RSVP slice: the vitest environment is node-only; testing useOptimistic revert in jsdom would be disproportionate and brittle. Chat optimistic behavior and the RSVP compact-card path are verified manually via the seed + dev server.

### Chat input clears on send + pinned-input layout (feel fixes, 25 June 2026)

**Two issues fixed in this slice:**

---

**Issue 1: Input text not clearing after send**

*Two-attempt history.* The initial symptom was that the input cleared ~500ms late (after the server action resolved). The first fix moved `setInputValue("")` from inside our explicit `startTransition` to just before it, on the theory that updates inside `startTransition` are deferrable. In the running app, this did not resolve the bug — the text was not clearing at all, not merely clearing late.

*Real root cause.* React 19 automatically wraps functions passed to a form's `action` prop in a `startTransition`. From the React 19 release notes: *"Functions used as actions are automatically wrapped in a Transition."* Because `handleSubmit` was used as `<form action={handleSubmit}>`, it was always running inside React's implicit outer transition — making every `setState` call inside `handleSubmit` a deferred transition update, including `setInputValue("")`, regardless of whether it was inside or outside our own explicit `startTransition` call.

*Fix.* Changed `<form action={onSubmit}>` to a plain `<form onSubmit={e => { e.preventDefault(); onSubmit(new FormData(e.currentTarget)) }}>` in `ChatInput.tsx`. A plain `onSubmit` event handler is not wrapped in a transition. `setInputValue("")` (already positioned before the explicit `startTransition`) is now a genuine urgent synchronous update and fires on the same render tick as the form submission. The explicit `startTransition` inside `handleSubmit` continues to own the async server action as before. Enter-to-send and send-button both work with the plain `onSubmit` handler (the browser fires `submit` on Enter in a single-line text input).

*Failure behavior unchanged.* The optimistic message still reverts on failure; the soft error still shows; the input does not restore typed text on failure (deliberate tradeoff — the revert + error is the signal).

---

**Issue 2: Input scrolls out of view on send (pinned-input layout)**

*Root cause.* The page root used `minHeight: "100dvh"`, which lets the flex container grow beyond the viewport as the feed fills. This triggers document-level scroll instead of feed-internal scroll. The "pinned" input bar was not actually pinned — it lived at the bottom of a growing document, drifting below the fold as messages were added.

*Fix.* Changed `minHeight: "100dvh"` to `height: "100dvh"` and added `overflow: hidden` on the root container in `page.tsx`. The page is now locked to exactly viewport height. `MessageFeed` (already `flex: 1` + `overflowY: auto`) becomes the internal scroll region; `ChatInput` (`flexShrink: 0`) stays genuinely pinned at the bottom regardless of feed length. `MessageFeed` and `ChatInput` were not modified.

---

**Addition: auto-scroll to bottom on mount and on send**

After the pinned-input fix made the feed its own internal scroll region, newly appended messages landed below the fold. Fixed in `MessageFeed.tsx`: a `bottomRef` sentinel `<div>` at the end of the message list, with `useEffect(() => { bottomRef.current?.scrollIntoView() }, [messages.length])`. Fires on mount (feed opens at the most recent messages) and whenever the message count changes (viewer's optimistic append is immediately visible). Dependency is `messages.length` (a primitive) not `messages` (new array reference every render), so the effect only fires when messages are actually added or removed. When the feed is empty the sentinel is not rendered; the `?.` guard makes the effect a no-op. Deliberate choice: no "only scroll if near the bottom" smart-scroll logic — that earns its complexity only with substantial scroll history and is not needed at MVP.

### Feel-pass register (items deferred from earlier slices)

Items below are deliberate deferrals, not bugs. Each is recorded here so it is not lost when the end-of-build polish pass opens. (Header originally read "from group-home work"; widened when onboarding items joined the list.)

- **RSVP button cursor lag (feel pass).** After tapping I'm in / Can't make it on the home card or event detail, the button stays disabled for the full server round-trip, so the cursor shows the not-allowed state for roughly 0.5 to 1 second before returning to normal. The optimistic visual flip is instant; only the button's disabled-during-write state lingers. Deferred to the end-of-build feel pass. Any fix must stay a feel change and must not loosen the double-tap protection on the shared RSVP write path.

- ~~**No back-navigation from event detail to group home (small follow-on).** The event detail page predates the group home and has no affordance to return to it; the browser back button is the only way back. Add a back affordance that routes to the event's group home (derivable from the event, so it also works for a direct link, not just history). Its own small slice or part of the polish pass.~~ **Landed with the app-wide-navigation slice (27 July 2026)**, as its own slice rather than a polish item, because it turned out to be one of five dead ends with a single structural cause. The back link points at the event's own group home rather than at browser history, exactly as this entry anticipated.

- **Gap-step card renders as a second Orbit bubble (from the gap-ask slice, July 2026).** The gap step's playback card is an avatar-bearing Orbit bubble stacked directly above the question bubble, so the screen shows two Orbit bubbles in a row and the upper one is a bare data block with no lead-in sentence. Step 2 avoids this because its single bubble opens with "Here's what I understood." §7's rule is bubbles for dialogue, notes for reference, and the card is reference. Polish-pass candidates: give the card bubble a lead-in line, or restyle the card as an avatar-less note. Behavior is correct; this is presentation only.

- **Haiku sometimes covers only half of a "both" gap (from the gap-ask slice, July 2026).** On a gap that is both a missing day and an ambiguous time, the generated question sometimes covers only one half despite the prompt's cover-every-gap rule, which splits what should be one round into two. The loop still converges before the escape hatch, so the cost is a wasted turn, not a dead end. Named candidate fix if it earns one: extend the question validator in `gap.ts` to reject any question that does not cover every open gap, falling back to the template, which covers both by construction. Deterministic, no model upgrade needed.

- **The consensus announcement's closing invitation may be inviting too much (owner note, 29 July 2026, from part-two chat QA).** "Want it back at 7pm? Say the word." rides every consensus announcement. The owner's instinct after seeing it live: right after a time just changed, an open invitation to change it again may encourage back-and-forth loops, where a little natural friction would let only someone with a genuinely strong opinion speak up on their own. Deliberately sat on rather than decided; a candidate one-line copy tweak (drop the closing sentence) for the polish pass. The disclosure and reset sentences are not in question, only the closing invitation.

- **No step indicator on Step 2 or the gap step (originated in the founder-onboarding slice, unrecorded until the gap-ask QA pass).** The mockups show a wizard header of the Orbit lockup, a back chevron, and a "STEP 2 OF 3" step indicator; the shipped flow instead reuses the "Start your group / No sign-up needed" page header on every beat. The back function is covered by the existing "Edit my description" link, but the step indicator has no equivalent anywhere in the shipped flow, and it matters most while a founder is stuck in a gap round wondering how much is left. Lineage recorded deliberately: this was decided in passing and never written down, the same pattern as the collapsed WHO row, and it is logged here so the polish pass inherits it as a known gap rather than rediscovering it.

- **Multi-day schedule copy joins every day with "&" (noticed 22 July 2026).** The Step 2 rhythm row composes multi-day schedules as "Mon & Wed & Fri at 8am" (`playback.ts` joins all day abbreviations with " & "), where §7's schedule-copy rule reads more like "Mon, Wed & Fri" (commas between items, ampersand before the last). Presentation only; the structured day data underneath is correct. Deferred to the end-of-build polish pass.

- **Two create-next-app scaffolding gaps in `globals.css` (recorded 23 July 2026, from the docs-consolidation slice).** Neither is a decision anyone made; both are leftover scaffolding for the visual-polish pass to settle rather than rediscover, the same reasoning that put the missing step indicator in this register. ***Both closed 11 Aug 2026 (polish slice one): `:root` is unconditionally dark and declares `color-scheme: dark`, the media-query fork is gone, and the body applies Geist. The whole placeholder palette was replaced by the design system's tokens in the same slice.***
  - **Light-mode default.** `:root` sets a white background (`--background: #ffffff`) and only flips to dark under `@media (prefers-color-scheme: dark)`, while CLAUDE.md states dark is the default theme and the neutrals are authored dark-first. The product renders dark for any viewer whose OS is in dark mode, which masks the gap; a light-mode OS would expose it. The polish pass makes dark the actual default rather than a media-query branch.
  - **Body font is Arial, not Geist.** `body` sets `font-family: Arial, Helvetica, sans-serif` while `--font-sans` is wired to `var(--font-geist-sans)`; the intended Geist family is loaded but not applied to the body. Presentation only; settle in the polish pass.

- **The gauge chip row wraps two-then-one on a phone (from spark part one, 23 July 2026).** At 375px the three chips need roughly 349px against about 323px of usable width, so the third drops to its own line and the row reads as an accident rather than a choice. **Deliberately left alone until the polish pass, at the product owner's call, to be felt on a real phone first rather than settled off a screenshot.** The reasoning is recorded because the obvious fix is a trap: about 40px can be clawed back by trimming the indent, tightening the padding, and shortening the third label, but that lands on exactly fitting at one screen width and one text size, and the type scale is in rem so it honors the device text setting. The first viewer with enlarged text wraps anyway, now with a row squeezed thin to avoid it, which contradicts §7's grow-with-content rule. Candidate fix if the feel confirms it: put the yes chip alone on the first row and the two quiet chips side by side beneath it, so the wrap expresses the emphasis hierarchy structurally instead of only in text brightness. It fits at 320px, degrades gracefully at larger text, and keeps the emojis and the design's own labels intact. Layout only: one file, no data, no copy, no test changes, and nothing built between now and then makes it harder. ***Closed 12 Aug 2026, felt on a real phone during polish slice one's QA, exactly as this entry intended. The owner's verdict: the row still wraps, and it is fine. The candidate fix above is declined, and so is the one-row version, because getting three chips onto one line means dropping the emojis and shortening the labels, and the owner wants the emojis kept: they give the row character. Recorded as a decision rather than a deferral, so nobody re-opens it as unfinished business; the trap this entry warned about (squeezing the row to fit at exactly one width and one text size) is now moot rather than merely unsolved.***

- **Phone QA needs the Mac's LAN address in `allowedDevOrigins` first, or every control is dead (found 12 Aug 2026, during polish slice one's QA).** Opening the dev server from a phone at `http://192.168.1.x:3000` is a different origin from `localhost`, and Next's dev server blocks its own `/_next/*` assets cross-origin by default, returning 403. The page renders, because the HTML is server-sent, and CSS-only behavior keeps working (the carousel still swipes), but React never hydrates, so every button, chip, dot and input is inert. It reads exactly like a catastrophic app bug and is not one. The fix is the LAN address in `next.config.ts`'s `allowedDevOrigins`, which already existed for the sibling-loopback QA hosts; the dev server picks the change up without a manual restart. Two things to know next time: a LAN address is a DHCP lease and changes, so the entry goes stale; and wildcards there are host patterns, so they do not cover an IP range. Worth remembering that the .ics slice's phone test passed through this unnoticed because the only thing it exercised was tapping a link, which is plain HTML.

- **The polish pass tests mobile Safari on a real phone over the local network, not in a simulator (recorded 28 July 2026, from the change-request verification round).** Every "feel it on a real phone" item in this register (the chip wrap above, enlarged-text behavior, the dark theme) gets checked by opening the running dev server from a phone on the same Wi-Fi, at the Mac's local address on port 3000. Recorded so nobody re-reaches for an iOS simulator when the pass opens: this machine has no Xcode, a simulator install would cost roughly 40 GB against 35 GB free, and for a web product a real device running real mobile Safari is stricter evidence than the simulator that imitates it.

- **The pending strip blends into its neighbors (owner note, 10 August 2026, from pending-surface QA).** On first open the strip read to the owner as part of the event details card above it rather than as its own element; it sits flat between the raised card and the chat with only hairline rules separating it, per the handoff's stay-junior treatment, and that quietness overshot into invisibility as a distinct thing. Polish-pass candidates: a slightly different surface tone, or some other treatment that separates it from both neighbors without promoting it above the card. The constraint that survives any fix: the card stays the only raised, bordered, shadowed object with the screen's only teal. Related and larger, recorded in §11's pending-surface postscript: the owner may revisit the strip's placement entirely after seeing the polish pass, in favor of pending items as cards in the top carousel; do not spend polish effort making the strip precious before that call is made. *Ruled 11 Aug 2026 (strip-placement decision record, in specs): the strip stays in place, dressed with separation geometry plus a 7% teal wash; the "screen's only teal" constraint in this item was knowingly bent by the owner who wrote it, and the carousel option is deferred post-MVP with its revisit trigger recorded. See the §11 visual-polish slice-one postscript.* ***Built 11 Aug 2026 (polish slice one): full bleed, 12px/20px padding on the feed's gutter rather than the card's, 14px of air below the card, and the tint-a wash. Whether it now reads as its own element is the owner's QA call, which is the deferred proof point the decision record named.***

- **The add-to-calendar pill has no leading calendar glyph (recorded 11 August 2026, from the .ics-slice review).** The design source's `.ed-cal` rules in `docs/design/walkthrough-screens` (and screen 09) draw a small calendar icon left of the "Add to calendar" label inside the teal pill, with 9px of gap between icon and text; what shipped is label-only. Polish-pass candidate: add the 16px glyph and the gap, matching `.ed-cal`.

- **The add-to-calendar pill has no hover or focus treatment (recorded 11 August 2026, from the .ics-slice review).** Checked against the codebase rather than assumed: no teal action anywhere has a genuine `:hover` state today; the nearest existing idiom is `RsvpControls`' `--color-teal-hover` token, used for its pending (in-flight write) color rather than mouse hover. The pill is a plain anchor with neither. Polish-pass candidate: settle one real hover/focus idiom for teal pills generally, then apply it here and to its siblings together.

### Orbit scheduled event auto-creation (26 June 2026)

Orbit now creates recurring events on a schedule rather than having them faked by a seed fixture. This is the first real event-creation path in the codebase and the first "Orbit acts autonomously" slice. Deliberately model-free: the rhythm arrives already structured (onboarding is deferred), so Orbit does only date math plus deterministic copy.

**What landed:**

- **`src/lib/orbit/rhythm.ts`** — `GroupRhythm` interface and `parseRhythm(json: unknown): GroupRhythm | null`, a defensive runtime validator for the raw `Group.recurringActivities Json?` blob. Stored as an array to honor the field's plural-by-design intent; this slice reads `rhythms[0]` only.
- **`src/lib/orbit/occurrence.ts`** — `computeNextOccurrence(rhythm, timeZone, after)` using zero-dependency `Intl`-based timezone conversion (`zonedWallTimeToUtc`) with two-pass DST refinement. Unit-tested against `America/Los_Angeles` in both PDT (15:00Z) and PST (16:00Z) to prove DST correctness.
- **`src/lib/events/create.ts`** — `createEvent({ groupId, title, startsAt, endsAt?, activityLabel?, venue? })`, the first real event-creation path, built as a clean reusable lib helper for the future spark (spontaneous-event) slice.
- **`src/lib/orbit/announce.ts`** — `buildAnnouncement(event, rhythm)`, deterministic structured-extract-then-format copy (§7): `"Next up: climbing Sun at 8am. RSVP up top."` Generated from the just-created event so it can never contradict the card. Resolves the prior QA flag where the static fixture welcome could contradict the card.
- **`src/lib/orbit/reconcile.ts`** — `reconcileScheduledEvents(now)`, the central engine: loads all groups sequentially, skips groups with no valid rhythm, skips groups with an existing upcoming event, creates one `Event` + one ORBIT `Message` for groups that need one. Catches Prisma P2002 (unique constraint) as a no-op for concurrent double-fire.
- **`src/app/api/cron/orbit/route.ts`** — Next.js 16 route handler (`GET`, nodejs runtime, force-dynamic). Secured via `CRON_SECRET` (`Authorization: Bearer` header); graceful local-QA bypass when unset in non-production.
- **`vercel.json`** — daily cron schedule (`0 13 * * *`; Vercel Hobby plan limit is once/day).
- **`scripts/seed-fixture-rhythm.ts`** (replaces `seed-fixture-event.ts`) — seeds a structured rhythm and synthetic members, deletes old fixture sentinel rows. Retires when onboarding lands.
- **Schema migration `add_group_timezone_and_unique_occurrence`** — two changes: (1) `Group.timeZone String @default("UTC")` (IANA timezone, queryable column, onboarding will write it later); (2) `Event.@@index([groupId, startsAt])` promoted to `@@unique([groupId, startsAt])` as the DB-level idempotency backstop for duplicate creation.

**Timezone and display correctness:**

`Group.timeZone` is a dedicated column (not buried in the `recurringActivities` blob) because timezone is a singular, queryable, group-level fact that the cron reads every run and onboarding will later write. The `recurringActivities` blob is plural by design (climbs, beers) while the timezone is one value for the group. For the demo group, `timeZone = "UTC"` is a deliberate seed-data choice: while `format.ts` still renders in UTC (the parked display debt), UTC makes the stored instant and the displayed hour the same number, so the card reads a correct "8am" today. This is not a logic shortcut — the `zonedWallTimeToUtc` conversion is built for real and DST-tested against `America/Los_Angeles`. Once the UTC-display fix lands, onboarding will populate a real zone and the display will convert to viewer-local.

**Tech debt opened in this slice:**

- ~~**`@@unique([groupId, startsAt])`** means a group cannot hold two distinct events at the identical start instant. Acceptable for MVP scheduled mode; revisit when spark / the plural-rhythm design needs it (e.g. scope uniqueness to a future `source` field, or use a different idempotency key). Medium.~~ **Resolved 24 July 2026 (spark part two).** Spark needed it exactly as predicted. The constraint was dropped and replaced with the per-path idempotency keys this entry anticipated: `Event.gaugeId` for sparked events, `Event.scheduledKey` for the cron's.
- **`rhythms[0]` only.** Multiple concurrent rhythms per group (climbs + beers) and a multi-card carousel are deferred. Single upcoming occurrence per group is an explicit product decision for this slice. Low.
- **Zero-dependency `Intl`-based timezone conversion.** `zonedWallTimeToUtc` has a latent failure mode for `timeLocal` values below roughly `05:00` in large-negative-offset zones (the first-pass candidate can land on the prior local day). MVP rhythms are daytime-only so this never fires; the code carries a DEBT comment. If timezone-agnostic scheduling is ever exposed to arbitrary user input, replace with an iteration-based approach or a date library. Low.
- **Event and announcement are not in one transaction.** A crash between `createEvent` and `createMessage` leaves an event with no announcement; the upcoming-event guard prevents a retry. Low risk at once-per-day cron; revisit by threading a transaction through both calls if it matters. Low.
- **`CRON_SECRET` is a new required production env var** (none existed before this slice). Must be set in Vercel environment variables before deploying. There is no `.env.example` in this project; documented in the PR. High (blocks a working deploy).
- **Synthetic members now start with no RSVPs.** The seeded RSVPs belonged to the retired fixture event. A freshly auto-created scheduled event legitimately starts all-pending per §5 (auto-seeded RSVPs are a gauging-mode behavior); the roster demo is less rich but honest. Retires when onboarding lands. Low.
- **Cron reconcile runs against the single shared dev database** (pre-existing debt from data-foundation §11). Low.
- **`announce.ts` shares the parked UTC-display assumption.** `buildAnnouncement` formats weekday and time using UTC (same root cause as the parked `format.ts` display debt). For the demo group (`timeZone = "UTC"`) this produces correct copy. For any non-UTC group the announcement would name the wrong day and wrong hour from the member's perspective. Fix `announce.ts` in lockstep with `format.ts` when the UTC-display fix lands — both must convert to group-local at the same time to avoid card/announcement divergence. Low (dormant while demo group is UTC).
- **`durationMinutes` is parsed but not wired to `endsAt`.** `GroupRhythm.durationMinutes` exists and `createEvent` accepts `endsAt`, but `reconcile.ts` creates events with no end time. Deliberate MVP shortcut: single-instant events are sufficient for scheduled mode. Wire it when the event detail needs a displayed end time. Low.

### Sealed one-shot experiment (July 2026)

A deliberate control experiment, not a build slice. The app was cloned into an isolated sandbox (separate GitHub repo, separate Supabase project) and the entire remaining feature set was attempted in a single pass with the usual human gates removed, to test the slice-by-slice process against its opposite. The sandbox repo survives as `interplanetary-groups-oneshot` for reference. Its code is not trusted and nothing from it is merged. Its decision log is preserved at `docs/experiments/oneshot-decisions.md`.

**The core finding: one-shot features, not foundations.** One-shotting works well on an established codebase where the seams already exist and are tested, because the agent is fitting new work into proven integration points. It fails on a greenfield app because every seam is new and unverified at once. Every single failure in the experiment was a new seam, an edge case, or an unasked data-modeling question. Not one was the model failing to write code. The practical consequence for this project: keep building the skeleton deliberately until the app is real and its integration points are proven, then one-shot individual features onto that base.

**Self-reported agent output is a claim, not a fact.** The experiment produced a guardrail that was reported as enforcing and did not enforce, a chat feature reported as working that the agent could not actually run, and "matches the mockups" three separate times before it was true. The decision log was valuable precisely because every claim in it was checked. Nothing here is an argument against agent logs; it is an argument that a log is evidence to verify, not a status report to accept.

**Two cheap gates caught nearly everything.** Look at the actual rendered screen next to the design, and make the agent show that it works rather than tell you it works. Both take minutes. Together they catch the entire "looks done but isn't" class of failure, which was the dominant failure mode.

**A one-shot silently drops whatever needs a modeling decision.** The design showed a "beers once a month" row alongside the climbing rhythm. There was no field for it in the data model, so the agent quietly built everything else and omitted it, with no flag. The pattern generalizes: an agent building at speed will implement whatever has an obvious data home and skip whatever would require asking a question. When a design implies data, the question of where that data lives has to be asked explicitly, by name, before the build starts.

**A second-model audit was considered and declined.** Running an independent read-only architecture review from a different model (Codex or similar) would give genuine cross-checking, since the Superpowers reviewer is Claude reviewing Claude and shares its blind spots by construction. Declined for this project as redundant tooling on top of a review step that already exists. The residual risk is accepted knowingly: shared blind spots stay unexamined. Revisit if a review pass ever misses something structural.

**Tech debt resolved by this experiment.** The experiment's Supabase project has been renamed `interplanetary-groups-dev-test` and promoted to the project's real dev/test database. This closes the "single shared database, no separate dev/test environment" debt logged in the data-foundation slice and referenced again in the Orbit scheduled-event slice. Credentials for it are kept strictly separate from production and a production build is never pointed at it.

**Next phase intent: test bigger slices deliberately.** The goal of all of the above is faster-but-earned, not slower-forever. The gates are what make it safe to size slices up. Worth running as its own deliberate experiment on the real app once onboarding lands: a few related features in one slice, with the look-at-the-screen and show-me-it-works gates fully intact, and a comparison against the single-feature slice cadence. *Closed, 11 Aug 2026 (triage round two): overtaken by events. The slices from spark part two onward already run at this size with the gates intact, so the experiment happened without being scheduled; closed so no future session dusts it off.*

**Annotation (23 July 2026, added during the spark interest-gauge slice).** The experiment's two spark decisions were checked against the real design and the recorded rules, and neither survived. It built two chips with copy it invented; the design sheet has three, with different labels and different roles, including a "yes, but not that day" answer the experiment had no concept of. And it gave the person who floated an idea an automatic yes, which was a misreading of the never-ask-twice rule: that rule is about carrying a yes already given through to the created event, not about inventing one. The corrected rule is that they are counted only when they named the proposed day themselves. Recorded here as an annotation rather than a rewrite; the log stays a historical record of what was actually decided at the time.

### Founder-onboarding slice (21 July 2026)

The first real Anthropic API call in the product. The two-field create-group stub is replaced by the designed three-beat flow: the founder describes the group in free text, `claude-haiku-4-5` extracts structured rhythms via structured outputs, a fully-tested normalization layer turns that claim into the stored shape, deterministic code composes the playback, and confirm creates the group with its first event already on the home screen (group-scoped reconcile at creation time, fail-soft).

**What landed:**

- **`src/lib/orbit/extract.ts`** — the extraction call: `claude-haiku-4-5`, a structured-outputs JSON schema where every field is required and "not stated" must be an explicit null, return type `unknown` by design. Every failure mode throws `ExtractionError` → one soft-retry state.
- **`src/lib/orbit/normalize.ts`** — the claim-to-fact boundary (CLAUDE.md guardrail): field sanitization that degrades invalid values to "not stated," cadence whitelist (unknown → loose), primary promotion, the position-zero guarantee, and the completeness gate with targeted missing-field classification.
- **`src/lib/orbit/playback.ts`** — deterministic playback rows and the five static re-ask templates. Composed from the same normalized fields the engine consumes, so card, announcement, and created event can never disagree.
- **`src/lib/orbit/rhythm.ts` widened** — `StoredRhythm` + `parseStoredRhythms` (storage shape); `parseRhythm` (engine contract) unchanged except the mandated time-range fix (`"99:99"` no longer passes). All 30 pre-existing rhythm tests pass unchanged.
- **`reconcileScheduledEvents(now, { groupId? })`** — optional scope so creation generates one group's first event without sweeping the database.
- **`provisionFounderGroup`** gains `description` and `recurringActivities` writes (change to shipped code, called out in the PR).
- **Wizard UI** at `/create`: Step 1 with the single tailed Orbit bubble (§7 exception), labeled extraction pause in Orbit's voice, re-asks that preserve the founder's text; Step 2 playback rows inside the feed-style bubble with an inline-editable group name.
- **Schema migration `add_group_description`** — nullable `Group.description`.
- `scripts/seed-fixture-rhythm.ts` deleted per its recorded retirement plan (onboarding has landed).

**Decisions made at plan review:**

- **`suggestedGroupName` is a structured extraction field** (venue-displayLabel precedent), not free model copy: normalized (trim, strip em/en dashes, collapse whitespace, cap 50 chars) with a deterministic `"{Weekday} {Activity}"` fallback, and inline-editable on the playback row. This resolves the tension between "name derived from the description" and "no model-written user-facing copy."
- **`Group.description` column added now.** The founder's original words are irreplaceable source material for the gap-ask and RAG slices; nothing reads it yet, deliberately.
- **Editable name row is a recorded deviation** from the read-only mockup playback: rename exists nowhere else in the product yet.
- **The collapsed WHO row deviation originated here (recorded after the fact).** The shipped Step 2 card collapses the mockup's two identity rows into a single WHO row carrying the founder's name; the decision was made in this slice but went unrecorded until the gap-ask slice inherited it. The full reasoning lives in that slice's recorded deviations ("The mockup's member-count row is deliberately not built").

**Deliberate behavioral consequences:**

- **Monthly-only descriptions cannot create a group.** Weekly is the only schedulable cadence in this slice; a confidently-monthly primary gets the generic re-ask. Revisit when monthly scheduling lands.
- **No silent weekly inference.** A description with day + time but unconfident cadence gets a targeted "Is that every week?" re-ask instead of a code-level guess — guessing wrong would silently create weekly events for a monthly group (§5 ask-if-missing). The prompt instructs the model that a stated weekday implies weekly, so this re-ask should be rare.
- **Ambiguous clock times get a silent plausible reading.** A time with no am/pm and no context ("Tuesdays at 7") is currently resolved by the model to a plausible hour (observed: 19:00). This is a known gap in ask-if-missing: the ambiguity is real but nothing asks about it. Mitigated today by the playback confirmation — the founder sees "Tue at 7pm" and can go back and correct it before anything is created. **Named candidate for the gap-ask slice**, where am/pm ambiguity should become a clarifying question rather than a model judgment call.
- **The completeness gate is server-side.** The confirm action re-validates the client-held payload with `parseStoredRhythms` + `parseRhythm`; no request path creates a group without a schedulable primary at position 0.

**Tech debt opened in this slice:**

- **Unauthenticated model calls.** `/create` triggers a paid API call pre-auth with no rate limiting. Acceptable at MVP traffic; revisit before promoting the URL anywhere. Medium.
- **Prompt quality is manually verified** (`scripts/try-extract.ts` harness), not CI-covered; the interpretation seam (normalize) is what CI covers. Low.
- **`Group.description` is written but unread** — deliberate, for the gap-ask/RAG slices. Low.
- **Loose rhythms are stored and shown at playback but displayed nowhere post-onboarding** (the group info page shows no schedule today; unchanged by this slice). Low.
- **Extraction latency sits inside a server action** with only the SDK's default timeout. Fine for Haiku-scale calls; revisit if the pause ever exceeds a few seconds in practice. Low.

### Gap-ask conversational loop slice (21 July 2026)

The static onboarding gap gate becomes a conversation, and Orbit gets its first generated prose anywhere in the product. When extraction leaves the primary rhythm unschedulable, the founder now lands on the screen-03 gap step: the playback card with a lime marker on the one gap, Orbit's one-sentence question (model-written, code-validated, template fallback), and a message input. One merge call per answer returns the merged state and the next question together, so each answer costs exactly one labeled pause. Two rounds maximum, then the existing edit-description escape hatch. This closes the §11 named candidate from the onboarding slice: ambiguous clock times ("Tuesdays at 7") are now flagged in structured output and asked about, never silently resolved.

**What landed:**

- **Schema widened, shared by both calls** — per-rhythm `timeAmbiguous` (true only for a clock number with no am/pm and no settling context) and top-level `clarifyingQuestion`, which rides the same response as the state; the initial extraction carries the first question, the merge call the next. `FIELD_RULES` and the call helper are shared between `extract.ts` and the new `merge.ts` so the two prompts cannot drift on field semantics.
- **`src/lib/orbit/gap.ts`** — the pure decision seam: `validateQuestion` (one sentence, one trailing question mark, 8 to 140 chars, no dashes/newlines/sentence enders), template fallback, and `decideGapOutcome` (ready discards rider questions; two-answer cap; unshowable states escape). Fully unit-tested; the actions are plumbing over it.
- **`normalize.ts` widened** — `ambiguous_time` in the gap classification (outranks unconfident cadence; absorbed into `both` when the day is also missing so one question covers both), and the incomplete result now carries partial display state: gapped primary at position zero, cleaned name suggestion or null, and the candidate hour in its own field. Ambiguous guesses are nulled in stored shape on every path; the guess never reaches a field confirm would write.
- **`formatGapRhythmRow`** — deterministic gapped-row composition (known part + marker), with the ambiguous candidate shown bare ("Tue at 7"), deliberately without am/pm.
- **`mergeGapAction`** — server-side distrust of the client round-trip (re-parse rhythms, whitelist the gap kind, clamp the round so tampering only shortens the loop); the create-group completeness gate is unchanged and remains the only door to creation.
- **`StepGapAsk` + wizard gap step** — screen-03 UI; merge rounds run through `useTransition` with straight-line transitions; the shared `OrbitPause` keeps both pauses labeled in Orbit's voice ("working out" vs "updating" your schedule).
- **Harness**: `try-merge.ts` runs the real loop end to end; `try-extract.ts` prints the generated question and the validator's verdict.

**Decisions made at plan review (recorded deviations):**

- **Send button is teal-when-typed, never lime** — the mockup's own final dark pass remaps its send buttons off lime; lime survives only as the gap marker and row-label tint (Orbit's cue, not an action).
- **Gap-card name row is read-only** — a merge round can return a new suggestion, which would silently overwrite a mid-loop edit; renaming stays on Step 2.
- **Hint examples model answerable answers** — "we start at 7pm", not the mockup's ambiguous "we start at 7".
- **Two template sets** — `REASK_COPY` keeps description-editing phrasing for Step 1 (including the founder bailing out mid-loop); `GAP_REASK_COPY` is phrased for the message input.
- **Merge action uses `useTransition`**, not a second `useActionState` — its result drives four transitions plus round bookkeeping; straight-line updates beat a second adjust-state-during-render block.
- **The mockup's member-count row is deliberately not built.** Mockup screens 02 and 03 both show two identity rows: "Who: Climbing crew of 8" above "You: Jacob". A headcount has no home in the data model at this point in the flow: the extraction schema holds no group-size field, and before confirm the group has exactly one real member, the founder. The options were to add a headcount to extraction so the card could display a model-guessed number, or to drop the row. We dropped it, and the shipped card collapses both mockup rows into the single WHO row carrying the founder's name. Displaying "crew of 8" would be an unverified model claim rendered as fact on a card whose whole job is an accurate promise, and it would go stale the moment anyone joined; real membership counts are derivable from `Membership` rows and belong to the live group surfaces, not to onboarding. This deviation originated in the founder-onboarding slice (the shipped Step 2 card already had the collapsed WHO row) and was inherited here, unrecorded in either entry until now. Recorded because a design element implying data the model does not hold is precisely the case §11's one-shot experiment entry identifies as the signature silent-drop failure, and CLAUDE.md requires naming it rather than quietly working around it.

**Deliberate behavioral consequences:**

- **`nothing_schedulable` on the initial extraction keeps the static Step 1 treatment** — no partial card exists to anchor a conversation, so the conversational loop only opens on askable gaps. Mid-loop, a merge that loses everything schedulable escapes to describe rather than rendering an empty card.
- **A vague answer consumes its round.** Two answers maximum, no exceptions; the escape hatch explainer sends the founder back to the description.
- **The question is scoped to the primary rhythm.** Browser verification caught the model asking about a loose secondary's day; the prompt now forbids asking about non-primary rhythms — they are allowed to stay loose.
- **Unambiguous times never trigger the loop.** Harness-verified negatives: "7am", "noon", "after work around 6", "Sunday mornings at 8".
- **Stalled rounds are acknowledged honestly (QA finding, fixed in-slice).** A round whose answer moved nothing used to open with "Thanks. One more thing:" and repeat the identical question, thanking the founder for nothing at the moment they were already stuck. Movement is now computed in code (`gapAnswerMoved`, comparing the schedule-bearing fields and name suggestion across the round; derived titles and code-side bookkeeping do not count), and a stalled round opens with "No worries. Let me ask again:" instead. Applies to every gap type. With an honest lead-in, re-asking the same question is correct, so the prompt's never-repeat rule was dropped.
- **Untouched fields cannot drift through a merge (QA finding, fixed in-slice).** QA observed the rhythm label change from CLIMBING to CLIMB across a round whose answer said nothing about the activity: the model re-deriving from the description instead of carrying the prior state, and activity is stored state, not display. Two-layer fix: the merge prompt now demands character-for-character copying of untouched fields (the description is context for reading the answer only), and `enforceActivityCarryOver` enforces it in code on the raw claim before normalization, restoring a renamed activity whose schedule fields still match the same position when the answer never mentions the new wording. Schedule mismatches are left alone so a genuinely restructured list is never "corrected" by position. Unit-tested.

**Tech debt restated or opened in this slice:**

- **Unauthenticated model calls, ceiling raised.** `/create` now spends up to three or four pre-auth billable calls per visitor (one extraction plus up to two merges, plus soft retries), up from one. Same MVP-traffic acceptance rationale; revisit before promoting the URL anywhere. Medium.
- **Prompt quality remains manually verified** (`try-extract.ts`, `try-merge.ts`), not CI-covered; the interpretation and decision seams (normalize, gap) are what CI covers. Low.
- **The gap-step answer path is exercised by pure-seam tests and manual walkthrough only** — no component tests, consistent with the rest of the wizard. Low.

### Timezone capture + UTC-display fix + occurrence day-boundary fix (22 July 2026)

Three couplings that had to land together. `Group.timeZone` existed as a column but nothing wrote it, so every group carried the `"UTC"` default; meanwhile `format.ts` and `announce.ts` both rendered in UTC. The two wrongs cancelled, so the demo group read a correct-looking "8am" over a fictional stored instant. Shipping either half alone is a visible bug: real zones with UTC display name the wrong day and hour on the card and in Orbit's announcement, and the two can diverge from each other (the failure this slice most exists to prevent). So capture and display landed as one changeset. A third fix was folded in at product-owner direction for the same coupling reason (see below).

**What landed:**

- **`src/lib/groups/timezone.ts`** — `normalizeTimeZone` (client-asserted zone → validated IANA or `"UTC"` fallback, via try/catch `Intl.DateTimeFormat` construction) and `formatTimeZoneLabel` (deterministic human label from `Intl` `longGeneric`, falling back to the raw IANA string when the result is absent or a bare `GMT` offset). Pure, client-safe, mirrors the `normalize.ts` sanitize-or-fallback doctrine. Fully unit-tested.
- **Capture** — `OnboardingWizard` detects the founder's zone silently on mount (`Intl.DateTimeFormat().resolvedOptions().timeZone`), holds it in top-level wizard state alongside `founderName`, and sends it once in the `createGroupAction` payload at confirm. `createGroupAction` re-validates it (`normalizeTimeZone`) beside the existing rhythm gate and threads it through `provisionFounderGroup` → `tx.group.create`.
- **Display** — `formatEventDate`, `formatTime`, and `buildAnnouncement` gained a required `timeZone` parameter; the hardcoded UTC is gone. `reconcile.ts` passes the group's zone to `buildAnnouncement`, the lockstep point where the event instant and the words describing it derive from one zone. The pinned card and event-detail page pass `group.timeZone`.
- **Occurrence day-boundary fix** — `zonedWallTimeToUtc` now computes its offset as the full date-inclusive wall-clock delta (`Date.UTC(local…) - targetMs`) instead of an hour/minute-only delta; `getLocalParts` is exported and reused by `format.ts`.

**Settled product decisions (recorded, do not re-derive):**

- **Silent browser inference, no picker, no question.** Asking is friction with no payoff in the common case; Orbit carries this burden. The one place a wrong inference surfaces is the Step 2 playback card's quiet reference line ("Times in Central Time"): reference text, meta scale, secondary color, never teal or lime, not editable. It **always renders**, including the `null`/UTC fallback ("Times in UTC") — hiding it on the one path where detection failed would defeat its purpose (a founder in Austin seeing "Times in UTC" knows something is off; seeing no line, they don't).
- **Everything renders in the group's timezone, never viewer-local.** Forced, not chosen: Orbit's announcement is a single stored string in a shared feed and cannot be per-viewer, so a viewer-local card would contradict a group-time announcement for anyone in another zone — precisely the divergence being fixed. Group-time is also how casual groups talk ("the 8am climb" is a fact about the group).
- **No backfill, no migration.** The product is unlaunched; every existing group is dev data. A UTC group renders correctly as UTC, just unrepresentatively. The demo group is recreated through the real onboarding flow after this lands. The column's `"UTC"` default stays as a harmless fallback.

**How the captured zone survives the wizard.** It lives in the same top-level wizard state as the founder's other inputs and never round-trips `extractGroupAction` or `mergeGapAction` (both untouched by this slice). Gap merge rounds mutate only the gap/rhythm/name state; the escape back to Step 1 only changes `step`. So a founder who goes through any number of gap rounds, escapes, and re-extracts still confirms with the zone detected at mount. Browser-verified end to end: a gap-loop founder lands on Step 2 with the correct reference line on the confirm path.

**The client-asserted zone is treated as a claim, not a fact** (the CLAUDE.md guardrail, same as model output): validated server-side in `createGroupAction` before it is stored or drives anything. An unrecognized, absent, or non-string value degrades to `"UTC"` rather than failing; a founder is never blocked from creating a group over this field.

**The occurrence quirk was not dormant, and was fixed here (folded in, not deferred).** Build-notes had parked a latent `zonedWallTimeToUtc` failure for pre-dawn local times in large-negative-offset zones, documented as never firing because everything was UTC. This slice makes non-UTC zones real, so it was re-measured against the actual function (not a replica): the true envelope is `local hour < the zone's UTC offset magnitude` — wider than the parked "roughly < 05:00" note, and it contains the archetype user, a 7am Pacific morning crew. The old hour-delta-only offset ignored the date component, so any wall time below the offset landed on the previous local day (a 7am Pacific Monday climb got Sunday's event). Because capture-without-this-fix is itself a visible bug for that archetype, the same coupling logic that binds capture to display binds this fix to the slice. It stayed in scope only because it is contained: two lines inside `zonedWallTimeToUtc`, no change to the two-pass DST structure, no new helper, no date library. Swept post-fix across 10 zones × 24 hours × both 2026 US DST transitions with zero real failures (only the nonexistent 02:00 spring-forward wall time shifts, which no MVP rhythm reaches), and every existing occurrence-test anchor stays byte-identical. Verified in the browser too: a 4am-Monday rhythm (inside Chicago's summer envelope, 4 < 5) correctly created a Monday event, not the Sunday-before the old code would have produced. This resolves the parked `zonedWallTimeToUtc` DEBT; the doc comment now describes the corrected behavior.

**Decisions made in passing (judgment calls, recorded per §9):**

- **The reference line is Step 2 only, not the gap card.** The brief allowed it on the gap step if that step shared the playback component; it does not (`StepGapAsk` re-implements the chrome inline, already logged as feel-pass presentation debt), and the gap card deliberately shows a bare ambiguous time ("Tue at 7") a zone label would sit oddly beside. Step 2 is the confirm surface, which is where a wrong inference must be visible. Browser-confirmed the gap card shows no zone line.
- **Required timezone parameters, no defaults**, so the compiler forces every present and future call site to name its zone; a defaulted `"UTC"` would let the original bug quietly return. `tsc` clean after the change proved no call site was missed.
- **`getLocalParts` exported and reused** by `format.ts` rather than a second Intl wall-clock reader (prefer-extraction-over-duplication).
- **One GMT-prefix fallback rule** for labels rather than special-casing UTC — it covers UTC, `Etc/*` zones, and any zone without a generic name in one deterministic branch.

**Resolved debts (all three parked UTC-display flags):** the event-detail slice's "dates displayed in UTC," the Orbit slice's "announce.ts shares the parked UTC-display assumption," and the Orbit slice's `zonedWallTimeToUtc` day-boundary DEBT.

**Deferred to the register (not built):** any correction affordance for a wrong inference (a picker, or honoring a zone stated in the description like "8am Pacific" — the browser zone wins; extraction gains no timezone field); viewer-local display for members in other zones.

**Test churn, not new-only.** Existing assertions of UTC output for the card, event detail, and announcement were asserting the bug; they were updated (every case preserved by passing an explicit `"UTC"` argument, so composition coverage survives) and non-UTC / divergence / day-boundary cases added on top. Full suite 237 green, `tsc` clean. No test added for `createGroupAction` — server actions are deliberately untested here; `normalizeTimeZone` is the tested seam.

**QA cleanup note.** Verifying in-browser created throwaway groups in the dev-test database (a straight path, a gap round, and the 4am wrong-day case), which were then deleted. The delete filter (name + founder "Jacob") also removed one pre-existing "Sunday Climbers" group from 20 July — prior dev data, expendable per the no-backfill decision, and in the dev-test project only. Flagged because it was not created in this session.

### Venue capture at onboarding (22 July 2026)

The inverse of the silent-drop failure this register warns about: the walkthrough showed a venue on the pinned card and event detail, `createEvent` had accepted a `venue` argument since the data-foundation slice, both surfaces already rendered `venues[0]` conditionally — and no code path ever supplied one. Extraction had no location field (its prompt explicitly discarded location words), and `reconcile.ts` created events venue-less, so the design implied data the product had no way to acquire. This slice closes that path end to end, sequenced ahead of the spark slice so a future spark can pencil in the group's actual spot (§5) instead of inventing a plausible local business. The hard rule throughout: **venue never gates anything** — not the completeness gate, not the gap-ask, not group or event creation.

**What landed:**

- **Extraction** — `venueName` is a required-but-nullable per-rhythm field in the shared schema (the not-stated-is-null doctrine; with `additionalProperties: false`, a field absent from `required` is one the model may silently omit, pinned by a new contract test). The `FIELD_RULES` location handling flipped from discard to split: activity still drops location words, `venueName` captures them, both anchored to the same "climbing at the gym" example so the fields cannot drift.
- **Storage** — `venueName?: string | null` on `StoredRhythm` (and `GroupRhythm`) inside the `Group.recurringActivities` JSON. No migration; pre-slice rows parse as null via the `durationMinutes` absent-field precedent. Loose rhythms carry venues too ("beers … at Lucky Lab" stores the place on the beers rhythm), which is what lets the future spark slice inherit both the activity label and the place.
- **Merge survival** — the gap-round re-encode includes `venueName` (a field missing from CURRENT UNDERSTANDING is a field every gap round silently drops — caught at plan time, wire-tested with the call helper mocked); `enforceVenueCarryOver` restores a venue the merged claim nulled; `gapAnswerMoved` counts venue movement.
- **Event creation** — `reconcile.ts` passes `venue: { name: rhythm.venueName }` to the already-built-and-tested `createEvent` venue transaction. The pinned card's `· venue` segment and event detail's Where row light up with real data for the first time.
- **UI** — Step 2 gains a quiet standing-place affordance beneath each rhythm's value line: an inline input when a venue was captured, a tap-to-reveal "Add where you meet" link when not (see the revised treatment under settled decisions); Step 1 ships the mockup's hint line below Continue, extended to invite the spot, and the placeholder example names one.

**Settled product decisions (recorded, do not re-derive):**

- **Storage shape (open question a):** the standing place lives in the rhythm JSON; `Venue` table rows stay strictly per-event. The Venue model's required `eventId` FK with cascade delete is structurally per-event, and §4's future one-occasion switch needs the two concepts distinguishable: the change-request slice will edit an event's Venue row without touching the rhythm's standing default.
- **Snapshot semantics (the shape the change-request slice inherits):** reconcile copies the standing place into a fresh per-event Venue row at creation time (`{name}` only; displayLabel/address/url stay null, §2 label generation deferred). Changing the standing place later will not alter events already created — deliberate, and the change-request slice builds on exactly this split.
- **Step 2 treatment (open question b), tried, seen, and revised.** A quiet second line under its rhythm's row, not a standalone WHERE row. The first build made both states an always-on input (the group-name row precedent, confirmed always-on by reading the component, styled quieter at label scale). The product owner reviewed the rendered two-rhythm empty state and revised it, on the strength of a distinction the precedent argument had blurred: **the group-name row is an input holding a value Orbit produced, which is editing; an empty venue input holds nothing, which is collecting.** The card's heading promises "Here's what I understood," and an empty field is not something Orbit understood — two identical stacked placeholders were the strongest form signal on a screen whose thesis is "setup is a conversation, not a form." Final treatment: a **captured** venue keeps the inline input exactly as built (real editing, precedent holds); an **empty** venue renders a quiet tap-to-reveal text link ("Add where you meet", label scale, secondary color) that expands into the same input with focus. Reveal state is one-way and seeded indexes are computed once at mount, so clearing a captured venue mid-edit never collapses the input under the founder's cursor. **Both states stay deliberately neutral, never lime**: lime on the onboarding cards means "Orbit needs this before it can proceed," and venue never blocks, so borrowing the marker would teach founders the lime cue is sometimes ignorable.
- **Display format (settled now because the join screen and group info page will both show rhythm rows eventually):** `venueName` stays a separate structured field and never enters the composed schedule string. `formatRhythmRow` remains schedule-only; each surface appends `· {venue}` with the separator-dot grammar (mockup frame 06: "Mon Jun 15 · 8:00 AM · The climbing gym"). Reasons: event surfaces render the event's Venue row while rhythm surfaces render the standing place, and one baked string would blur that distinction; Step 2's editable input needs the raw field; future join/info rhythm rows inherit `{formatRhythmRow(r).value} · {r.venueName}` without touching the formatter. Nothing was built for those unbuilt surfaces.
- **Step 1 hint copy:** the mockup line ("Orbit reads this to set your days, send reminders, and build a shared group page.") ships verbatim in the mockup's position below Continue, with one added sentence: "Mention your usual spot too, if you have one." **Process finding (lineage):** the plan initially claimed this line existed in neither code nor mockup — a claim produced by grepping `docs/walkthrough.html`, which is a JavaScript-packed export whose copy is invisible to text search. The product owner challenged the claim, the file was rendered in a browser, and the line was there on screen 01. This is the first live instance of the artifacts-not-assertions rule encoded in PR #21 catching something: a verification claim built on the wrong kind of inspection reads identically to a true one until the artifact is demanded. Standing consequence: mockup copy claims require rendering the walkthrough, never grepping it.

**Decisions made in passing (judgment calls, recorded per §9):**

- **`VENUE_NAME_MAX = 80`**, shared by both parsers and sanitize via one exported `cleanVenueName` (the group-name 50 cap is too tight for real venue names).
- **Strict/lenient parser split, encoding "venue never gates" at each layer's blast radius.** `parseStoredRhythms` (validates our own writes at confirm) stays strict on type — a non-string `venueName` is a writer bug and rejects the array, same as `durationMinutes` — but a string is cleaned, not judged: empty degrades to null, because the Step 2 input legitimately produces empty strings and rejecting them would gate creation. `parseRhythm` (the scheduling read) is fully lenient — any unusable value degrades to null, because a null return means the group never schedules again, and no venue value may ever have that power.
- **`enforceVenueCarryOver` is a sibling of the activity guard, not an extension.** It consults no answer text (no answer legitimately *removes* a venue; one can only replace it, and latest-word-wins is honored by leaving non-null replacements alone), restores only on a same-activity match at the same position, and runs after the activity guard so a drift-restored activity lets the venue's match succeed.
- **`gapAnswerMoved` counts venue movement** — deliberate behavior change: a founder whose gap answer adds a venue but not the asked-about time gets the normal lead-in, not the stalled "No worries. Let me ask again:", which would be dishonest about an answer that did move state.
- **Declared regression pins alongside the TDD tests:** the venue-never-gates classification pins, the no-venue reconcile pin, and the FIELD_RULES shared-example pin all pass on first run by design and are labeled as pins in their commits — they exist so a future change that lets venue gate onboarding, or over-reaches in reconcile, fails loudly.

**Verification.** 267 tests green (from a recorded 237 baseline), `tsc` clean. Browser end to end on the dev server against the dev-test DB: (1) a venue-naming description captured both venues through Step 2 into a created event — pinned card "Sun, Jul 26 · 8am · Summit Gym · 0 In · 1 TBD", event detail "Where — Summit Gym", stored Venue row `{name: "Summit Gym"}` with label/address/url null, and the activity label read CLIMBING with no venue leakage; (2) a no-venue two-rhythm description produced a flow identical to pre-slice plus the venue affordance, created zero Venue rows, and stored explicit `venueName: null`; (3) the empty-state fill-in persisted through confirm to the card, detail, and a matching Venue row; (4) a gap-round description ("We climb at Summit Gym on Tuesdays" → "7pm") landed on Step 2 with the venue still seeded — the merge round-trip verified live, not just in units. **After the empty-state revision, re-verified:** the two-rhythm empty state renders two quiet "Add where you meet" links (no persistent placeholders); tapping one expands it into the focused input while the other keeps its link; a venue typed into the revealed input persisted to the rhythm JSON and the event's Venue row while the un-tapped rhythm stored null; and a venue-naming description still seeds inline inputs for both rhythms (the seeded path, new logic in the revision, shows inputs, not links).

**DEBT (deliberate, in plain language):**

- **A founder who skips the venue at onboarding has no way to add one later, and no group can switch venues, until the change-request slice (§4 announce-and-easy-revert) lands.** The Step 2 moment is currently the only venue capture point in the product. Medium; resolved by the change-request slice.
- **A venue captured on a loose rhythm is stored and shown at playback, then displayed nowhere afterward** until the spark slice can inherit it — this extends the existing "loose rhythms displayed nowhere post-onboarding" debt (gap-ask entry) to the venue field riding on them. Low.
- **Observed, not changed:** `parseRhythm` rejects on a wrong-type `durationMinutes` while `venueName` degrades to null — a strictness asymmetry that predates the never-gates rule. Left alone (stay in lane).

**QA data note.** Browser verification created four groups in the dev-test DB via the real wizard (two "Sunday Climbers" from the original pass — one venued, one not — "Saturday Yoga", and a third "Sunday Climbers" from the revision pass proving the tap-revealed input persists; the gap-round and seeded-path spot checks stopped before confirm and created nothing). Left in place as the PR's inspectable evidence; expendable dev data thereafter, deletable at the owner's discretion.

### Walkthrough crops checked in as reference (22 July 2026)

Documentation only, no code. `docs/design/walkthrough-screens/` now holds five cropped PNG exports of the walkthrough gallery, two screens per file (`screens-01-02.png` through `screens-09-10.png`), with a README stating what they are and are not.

**This does not contradict §9's "screenshots are not a build input" rule; that rule holds unchanged.** §9 governs what an agent builds visual code from, and the answer remains Claude Design's "Send to local coding agent" handoff. These crops serve the two *human* verification gates instead: the describe-back checkpoint before an agent writes visual code, and human verification of a "matches the design" claim against a rendered screen. §9 recorded that the earlier full-gallery contact sheet failed twice over, on legibility and on missing assets. Cropping to two screens per file fixes only the legibility half — the crops still carry no CSS, tokens, or assets — which is exactly why they are checked in as reference, not source.

**The walkthrough predates several shipped decisions, deliberately.** One worked example: these screens show a venue only on event surfaces (the pinned card, the event detail Where row), never on the CLIMBS/BEERS rhythm rows, because nothing captured a venue when they were drawn; the venue-capture slice (above) has since closed that path. Recorded decisions in CLAUDE.md and this file win over these screens wherever they disagree. The folder exists for the human verification gates, not as an authority on product behavior.

### CLAUDE.md consolidation around the extracted user-level file (23 July 2026)

Documentation only, no code, no schema, no tests. The project CLAUDE.md was rewritten to fit a changed setup: a user-level `~/.claude/CLAUDE.md` now holds the portable working rules (this closes the §8 extraction bullet, marked done above), and the workflow moved from two agents (a Claude.ai product manager handing framed prompts to a Claude Code engineer) to one agent holding both roles in Claude Code. So the project file's job changed: stop restating what the user-level file says, and start supplying the product framing it used to receive from elsewhere. Two files touched, CLAUDE.md and this one.

**The division of labor this slice settled (the reason the two files overlap on purpose).** CLAUDE.md carries the rule in operative form; build-notes carries the reasoning, the rejected alternatives, and the lineage. It is not duplication because CLAUDE.md loads every session while build-notes is consulted, so a rule that must always hold lives in the always-loaded file and its story lives here. Where the two disagree, CLAUDE.md is the rule. This is now stated in CLAUDE.md's header so a future reader does not "fix" the overlap by deleting one side.

**What moved out of CLAUDE.md (now owned by the user-level file, not lost).** The tech-debt-flagging rule, decision-language-in-commits, ask-and-flag-before-assuming (with its "not a mandate to stop and ask about everything" calibration), stay-in-lane, the general verify-and-flag-uncertainty rule, artifacts-not-assertions, "a passing test is only evidence if it could have failed," the branch-and-PR discipline, start-from-current-main, and the general "normalize model output" statement. Each was confirmed present in the user-level file before being cut here. Two cuts changed behavior and were made deliberately: the Markdown-only self-merge exception is deleted (the user-level "open a PR and stop, always" now governs, including this slice's own PR), and the "How the build agent should work" section is dissolved rather than kept as a reworded near-empty shell (its two genuine project-specific survivors relocated: the build-notes-§11-as-decision-record pointer to the header, and the check-the-docs-on-version-specifics behavior to a new Stack realities section). Dissolving the section resolved a real contradiction in the slice brief, which asked both to reword-not-delete the section and to use a target section order that had no such section.

**What was promoted into CLAUDE.md from this log (operative form only; the §11 entries were left untouched, they keep the reasoning).** Orbit is never a User or Membership row (group-home-chat); venue never gates anything (venue-capture); everything renders in the group's timezone, never viewer-local (timezone slice); the server-side completeness gate is the only door to group creation (founder-onboarding); and, as standing known state rather than a per-slice deferral, no surface is membership-gated, with the access-control slice named as its home. Two buried teaching examples were also lifted to where they teach best: the "beers once a month" silent drop (to the data-model rules, as the signature case of a design element with no data home) and the CLIMBING-to-CLIMB drift (to Orbit's guardrails, as the case for carrying stored state through a merge rather than regenerating it).

**Other corrections folded in.** The false stack line ("Supabase (db + auth)", "RAG + MCP are the AI differentiators") was replaced by a Stack realities section stating Supabase does auth only and Prisma owns the schema; the RAG/MCP aspiration moved to §10 where directional intent belongs. The verbatim `--type-*` / `--leading-*` token table, previously duplicated between CLAUDE.md prose and `globals.css`, was cut from CLAUDE.md in favor of a pointer to the CSS as the single source, keeping only the role-to-token mapping and the 13px floor that the CSS cannot express. The dark-theme rule now names the two create-next-app scaffolding gaps (light-mode default, Arial body) as known and deferred to the polish pass (both also registered in the feel-pass register). The project's no-em-dash rule was explicitly marked as a product-voice rule about what Orbit says, distinct from the user-level communication rule, so neither is deleted as a duplicate. A new "Where the build is" section was added at the top of CLAUDE.md to hold current build state and the next slice (spark), the one thing no file previously carried; it is rewritten at each slice boundary.

**Finding surfaced by this slice's own investigation: onboarding has no Step 3.** Checking the route rather than inferring it, `src/app/create/OnboardingWizard.tsx` has only three states (`describe`, `gap`, `playback`) and `createGroupAction` redirects on confirm straight to `/groups/[id]`. The designed share-the-invite-link screen (mockup 04) was never built. The invite link is still reachable (the `/groups/[id]/info` stub carries it), so founders can invite people; what is missing is the dedicated share moment at peak setup momentum. This is the same collapsed step the feel-pass register already noted from the other side: the shipped wizard cannot show a "STEP 2 OF 3" indicator because there is no third step. Both are now recorded as one problem in the §8 remaining-before-MVP register, kept in MVP scope (activation depends on getting a second person in) but flagged as small and not a blocker.

**Why this earns a §11 entry despite being documentation only.** Precedent exists (the walkthrough-crops entry above). More to the point, a slice is not done until its decision record is written, and this slice decided quite a lot: which rules are portable versus project-specific, the standing division of labor between the two files, and the resolution of two contradictions in its own brief (the "five slices" count, dropped as not load-bearing, and the reword-versus-remove tension on the dissolved section). Recording it is what stops the next reader from re-litigating any of it.

### Spark part one: Orbit gauges interest (23 July 2026)

The first time Orbit reacts to something a person said rather than to a clock, and the first time anything in a chat bubble is tappable. Someone floats an idea in the feed, Orbit reads it, replies proposing a specific day, and offers three one-tap answers with a running tally. **Nothing is created.** Three yeses does not produce an event yet; that is part two.

**Why it stops there.** Spark as a whole opens six integration points at once: a model call in the message path, two new tables with a new relationship, an interactive control inside a chat bubble, event creation triggered by a member's tap, a second event on the home screen, and RSVPs seeded from votes. The one-shot experiment's recorded finding is that building on unproven ground fails at exactly that concentration. This slice takes the first three. It is still a complete product experience on its own: a group can float ideas and watch interest gather. The spec is `docs/superpowers/specs/2026-07-23-spark-interest-gauge-design.md`.

**A model call on every member message, no keyword pre-filter.** About $0.0008 a message. A filter would save fractions of a cent and risk the product's headline moment, and a missed spark is the aha moment not happening. Logged as debt below, because the filter would also have been an accidental spending cap.

**Detection runs after the send, not inside it.** The message posts, the chat input stays live, and Orbit's reply arrives a beat later on its own. Mechanically this is a second `useTransition` in `GroupHome` whose pending flag is deliberately never wired to the input's `disabled`. The alternative locks the keyboard for two to three seconds on the most-used interaction in the product. This is the decision that shaped the whole slice, so it was verified by watching, not by reading: a second message was typed with no pause after the first, while the server log shows the detection call taking 3.9 seconds in its own round trip.

**A vote belongs to a proposal, not to an idea.** Saying yes to beers-on-Friday is not saying yes to beers-in-general, which is why `GaugeVote` hangs off `Gauge` (carrying the proposed date) rather than off an idea record. This is what makes part two's day-change behavior fall out instead of needing a clean-up step bolted on later.

**The person who floated the idea is counted only when they named the day themselves.** "Anyone want to play mini golf on Saturday?" is a yes to Saturday, and asking them to tap a chip confirming the day they just proposed is asking twice. "We should grab beers sometime" is a yes to nothing, because Orbit picked the day afterward. Two rules tightened as a result: the two-day notice buffer applies only to a day Orbit guesses, never to one someone stated (so "beers Friday" said on a Friday means today), and a day counts as stated only when exactly one is named, so "Friday or Saturday" falls back rather than silently picking one and counting the asker for it. **This correction also required amending CLAUDE.md and §5 above at the top of the slice**, because both stated the blunt version as settled and CLAUDE.md loads every session. The never-ask-twice rule it was over-borrowed from is intact and governs part two: a yes given during gauging carries through to the created event's RSVP.

**Orbit makes no promise in this half, and that is a deliberate deviation from the design.** The drawn copy is "...If three of you are in, I'll set it up," and the drawn tally closes with "one more makes it happen." Both are promises this half cannot keep. Shipping the promise without the delivery would put a visible lie in the feed, which is worse than shipping a smaller sentence. Both land in part two with the ability to honor them, and both are pinned out by tests so they cannot drift back in early.

**One fixed emoji on the yes chip.** The sheet draws a beer mug matched to the activity; nothing in the product maps an activity to an emoji. The rejected alternative was a small lookup table, on the grounds that a table which guesses wrong reads worse than one that never tries, and an emoji is decoration that does not justify a model call. Shipped as a fixed raised hand.

**Friday as the fallback day is an explicit placeholder.** The coming Friday, pushed a week when that is under two days out. Friday because casual social plans default to the end of the week; the buffer because a gauge needs time to collect answers. It has no data behind it and lives in one function so it stays cheap to replace with the override learning already recorded in §5, which this spec is the first home for. Genuinely a later slice: the only signal available in part one is "that day does not work," which says the guess was wrong without saying what is right, and knowing what is right comes from watching where plans actually land, which does not happen until part two creates them.

**The gauge proposes a day, not a time.** Screen 07 says "this Friday" with no clock time and that is correct; nobody needs to agree on 7pm to say they are interested. Screen 08's card does show a time, so **part two has to answer where that time comes from**, and nothing in the product currently knows what time a group grabs beers. Named here so it does not get quietly answered with "7pm because the mockup said so."

**Design positions, recorded so nobody later "fixes" them.**

- `Gauge.sourceMessageId` is unique and that is the whole idempotency story. A double-fired detection hits the constraint and comes back as a skip, the same P2002 pattern `reconcile.ts` uses. A "spark already checked" column on `Message` was deliberately not added: it would widen the migration to cover a rare duplicate *cost*, while the constraint already covers the duplicate *harm*, which is two Orbit messages for one idea.
- Both border tokens in the chip spec sheet are the same hex. The full-strength versus quiet distinction is carried entirely by text brightness, which is one `--border-subtle` on all three chips in project tokens. This also satisfies the accessibility rule directly: emphasis by brightness, never hue.
- Exact chip colours are not matched this slice. The sheet carries its own palette (`#20222d` surfaces) which differs from the shipped tokens. The chat-bubble fills are already recorded as functional placeholders awaiting the end-of-build visual pass; chips join them rather than turning this slice into a theming exercise. What is matched now is everything structural: pill shape, border weight, `--type-label` at weight 600, the wrapping row, and the brightness distinction.
- The proposed day is stored as the group-local midnight instant via the existing `zonedWallTimeToUtc`, and a gauge is live until the end of that local day. One stored instant read through the group's zone like everything else, so a gauge can never disagree with the card grammar around it.
- `callExtractionModel` gained a schema parameter defaulted to `EXTRACTION_SCHEMA`. Every existing caller is unchanged. The alternative, a second near-identical call helper, is the duplication the timezone slice already rejected once. In the same spirit, `cleanVenueName`'s trim-and-cap body was extracted to a shared `cleanShortText` so the spark activity could reuse it instead of copying it.
- Only a named weekday is extracted. "beers Friday" resolves; "beers tomorrow" does not and falls back. Deliberate limitation with a named candidate fix (pass the group-local date so the model can resolve relative days), the same shape as onboarding's ambiguous-time limitation that the gap-ask slice later closed.
- The tally renders only once at least one vote exists. A zero-state line is noise the chips already imply.
- Voting is not membership-gated, consistent with every other surface and with `setRsvp`. Covered by the standing access-control gap, not a new one.
- `createGauge` writes Orbit's message and the gauge in one transaction, which closes by construction the non-transactional gap `reconcile.ts` logged as debt for its event-plus-announcement pair. Noted there, not retrofitted, because that pair's failure window is once-a-day cron and this one is per-message.

**One thing the plan got wrong, caught by the verification gate.** The plan's task steps never seeded the initiator's vote, even though its own signed-off decisions and its own verification scenario both required it. The gap was invisible while reading code and obvious the moment a stated-day message was sent in a browser. Recorded because it is the second time the show-me-it-works gate caught something a read-through would not have.

**Verification.** 320 tests green, up from a 267 baseline recorded before any code on this branch (which itself matched the venue slice's recorded figure). `tsc` clean, lint clean.

*Looked at:* the rendered group home was compared directly against `docs/design/orbit-suggestion-chips-spec.html` side by side. Structure matches: three pills in a wrapping row indented under the bubble, one border on all three, brightness carrying emphasis, `--type-label` at weight 600, the tally line inside the bubble with its leading dot, and the labels "I'm in" / "Next time" / "Yes, can't Fri". Differences observed, all either recorded deviations or questions rather than defects: the yes emoji, the promise clause, the countdown clause, and the palette (all four recorded above); at a real 375px width the row wraps to two lines where the sheet's 430px in-context render fits three across, which is the wrapping row doing its job; and the sheet's Orbit avatar is a dark circle with a teal O where the shipped one is the lime circle, which predates this slice and was not touched by it.

*Shown:* a browser walkthrough against dev-test. "we should finally grab beers sometime" produced "Love it. Anyone in for beers on Friday, Jul 31?" with three chips and no tally. An ordinary "sounds good" produced nothing at all, no reply and no gauge row. The input stayed usable through the detection round trip. Tapping "Yes, can't Fri" moved the line to "1 wants a different day" and kept that person out of the in-count; tapping "I'm in" afterward changed the line to "Jacob is in so far" and the database held one vote row, not two. "anyone want to play mini golf on Saturday?" opened already reading "Jacob is in so far" with the yes chip checked, and its third chip read "Yes, can't Sat". At three yeses the tally read "Jacob, Maya & 1 other are in so far" with no countdown clause and **no event created**, the group still showing only its standing Climbing Sunday. A gauge whose day was pushed into the past rendered as plain history with no tally and no chips while a live one beside it kept both.

*One thing the walkthrough could not prove.* The in-app browser's synthetic clicks on the 36px send arrow were unreliable and several taps did not register, so some sends were driven by submitting the form directly. That path runs the identical React handler, and one send did land from a real click, so the behavior is verified; what is not verified is the send button's hit target on a touch screen. Worth a real-device check during the visual pass, and worth noting separately that pressing Enter in the chat input did not submit in this browser either, which predates this slice.

**Debt this slice opens.**

- **Every member message costs a model call, with no ceiling.** The pre-filter we chose not to build was also an accidental spending cap. Acceptable while the app is unlaunched and the URL is private; it needs a real answer before anyone promotes it. Medium.
- **Detection is best-effort.** Closing the tab within a couple of seconds of posting an idea means Orbit never answers it. Fails quietly rather than wrongly. Low.
- **Relative days are not understood.** "beers tomorrow" falls back to the Friday guess. Low.
- **Chip colours are not pixel-matched,** joining the chat-bubble placeholders in the end-of-build visual pass. Low.
- **Nothing stops a future client component importing `spark.ts` and dragging the Anthropic SDK into the browser bundle.** Raised by the pre-PR review. It is not a live problem (traced: no client file imports it, and the two actions it reaches are `"use server"`), and the chip component already hand-duplicates its label type specifically to avoid the import. Not closed here because both fixes have a cost this slice should not pay: adding a `server-only` dependency the repo does not have, or splitting the module. The real fix is to split the pure formatters out of `spark.ts` when part two touches it anyway. Low, but it is the kind of thing that is invisible until it is expensive. **Resolved 24 July 2026 (spark part two), exactly as prescribed:** the split landed as that slice's first code task, so every later task in it built on the clean side.
- **Inherited, not opened, and due in part two:** `Event.@@unique([groupId, startsAt])` means a sparked event cannot share an instant with the standing scheduled one. It bites when creation lands, not here.

**Pre-PR review.** A read-only reviewer read the whole diff. Four findings were applied: `revalidatePath` had drifted inside the try/catch in `detectSparkAction`, against a convention the repo states verbatim in three places (and inside a bare catch that returned a success-shaped value); that catch swallowed its error without logging, which would have left Orbit permanently mute and indistinguishable from Orbit being quiet; the detection transition could reject unhandled if the browser went offline in the beat after sending, contradicting its own fail-quietly comment; and the tally rendered names straight off the vote rows without the member filter that `deriveRoster` applies to RSVPs, which would have let any signed-in account with the group URL put its display name into that group's feed. The reviewer found nothing in timezone math, `useOptimistic` usage, server-action identity trust, client-bundle leakage, or scope creep. One finding was deliberately not taken (above), and its nits were left: the unconditional P2002 catch matches `reconcile.ts` and is unreachable from any other constraint today, and the "& N others" count keying off resolved names is pinned by a test and unreachable while `User.name` is non-nullable.

**QA data note.** Browser verification created one "Sunday Climbers" group in the dev-test database via the real wizard, with two gauges (beers and mini golf) and three vote rows, plus two seeded members named Maya and Jesse. Left in place as the PR's inspectable evidence; expendable dev data thereafter. One member message in it carries garbled concatenated text, an artifact of the browser tool's input handling, not of the product.

**Process note: the spec and plan were written in one session, then executed in a fresh one.** Brainstorming and planning read the whole of build-notes, the schema, and several source files directly into that session's own context, the exploration the user-level CLAUDE.md says to keep out of the session that will edit. Execution then opened a second session with no memory of that reading and was told explicitly to use subagents for any codebase investigation, which it did before touching the data layer, the actions, and the UI. That session ran all ten tasks, caught its own weak transaction test and proved it could fail before trusting it, and the pre-PR reviewer above still found four real issues in what came out clean. Whether a fresher context was load-bearing for any of that is not something this slice can prove on its own, only something it is consistent with. The generalizable rule, plan to disk then execute fresh, is recorded at the user level rather than here, since it is true of any project, not this one; this paragraph exists so its origin is not lost.

### Spark part two: three yeses make it real (24 July 2026)

**What it is.** The third yes creates the event. Orbit's gauge message now ends "If three of you are in, I'll set it up," and it keeps that promise in the same tap that produces the third yes: an event appears on the group home, the people who already said yes are already RSVP'd to it, and Orbit says so in the feed. Part one could gauge interest and nothing more; the product now closes the loop it opens.

**Where a sparked event's time comes from.** The gauge proposes a day, not a time, and nothing in the product knew what time a group grabs beers. Four rules settle it, in order. A time someone stated wins outright. Am/pm is read from the activity, so "beers at 8" is 8pm and "breakfast at 8" is 8am without anyone being asked. A genuine coin flip ("pickleball at 8?") keeps the stated hour, lands it in the evening, and Orbit owns up to it once: "You said 8, so I'm taking that as 8pm." Falling back to the default there would have printed a time on the card that nobody said. Nothing stated at all falls to a part-of-day default: Friday 7pm for evening ideas, Saturday 9am for morning ones. Morning ideas moved off Friday deliberately, because Friday was chosen on end-of-the-week social logic that is about evenings, and "breakfast sometime" proposed for Friday 7pm would have been wrong twice over.

All four of those numbers (Fri, Sat, 7pm, 9am) are placeholders with no data behind them. They are deliberately kept side by side in one module so the override-learning behavior in §5, which is their named successor, replaces all four at once rather than hunting them down.

**The clause that was cut.** The product owner's own sketch for Orbit's announcement included "just let me know and I'll change it." It was removed. Orbit cannot read a correction yet, and an invitation that gets silently ignored teaches people Orbit does not listen, which is more expensive than never offering. This is the same reasoning part one used to withhold the promise clause, applied to a different sentence: say only what can be honored. The change-request slice is its home, and it should land there together with the ability to act on it. For the same reason the announcement names the day and time but not the venue: naming a penciled-in spot implies a correction path that does not exist.

**Why two events may now share an instant.** `Event.@@unique([groupId, startsAt])` was inherited debt, flagged in part one as due here. With a 7pm default and any evening rhythm, a sparked event colliding with the standing one is ordinary, not exotic, and the constraint would have made the third yes fail silently at the worst possible moment. Every way of keeping it was worse than dropping it: failing quietly breaks the promise Orbit just made, nudging the event to 7:01 puts a lie on the card, and asking the group to pick another time reintroduces the coordination burden the product exists to remove. The constraint was bookkeeping, never a product rule. It is replaced by per-path idempotency keys, `Event.gaugeId` for a sparked event and `Event.scheduledKey` for the cron's, each of which prevents the duplicate that path can actually produce. Verified in the live database: a duplicate scheduled key is rejected, and a sparked event at the same instant is accepted.

**The cron guard, found by checking the code rather than reasoning about it.** Orbit's daily cron skipped any group that already had an upcoming event. The moment a sparked event could exist, that guard would have seen it and quietly stopped creating the standing occurrence, so a group that sparked beers for Friday would have got next Sunday's climb card days late with nothing anywhere signalling why. Nothing about that failure is visible until someone notices a missing card. The guard now asks the narrower question it always meant: has the schedule already put a future occurrence on the board. Recorded explicitly because this is the second time in three slices that reading the actual code, rather than reasoning about what it probably did, is what surfaced the problem.

A second, smaller thing came with it: the old guard compared against the real wall clock rather than the clock it was handed, so a test controlling `now` was not actually controlling the guard. It now reads the injected clock.

**Design positions recorded so nobody later "fixes" them.**

- **Both flavours of no seed OUT.** "Next time" and "Yes, can't Fri" both mean not coming to the event being created, which is for that day. NOT_THAT_DAY still does not count toward the bar, for the same reason.
- **The gauge closes at creation and the event card owns answers from then on.** Its message stays in the feed as history with no chips, exactly like an expired one. Two surfaces collecting the same answer would eventually disagree.
- **A threshold reached after the proposed start creates nothing.** A gauge stays live until the end of its day, so the third yes can land at 9pm on a 7pm proposal, and a card announcing the past is noise.
- **Venue inheritance matches the activity word exactly, case-insensitively.** A miss yields no venue rather than a wrong guess about where a group drinks. This is the payoff the venue-capture slice was sequenced ahead of spark for.
- **The time resolves at detection, not at creation.** Creation only ever reads a stored value, never re-derives one from the original message days later, which is the "carry it, do not regenerate it" rule.
- **Whether a gauge is closed, and whether the bar is met, are both derived and never stored,** the same rule RSVP counts follow.

**The spark.ts split, part one's named debt, paid.** Part one recorded that nothing stopped a future client component importing `spark.ts` and dragging the Anthropic SDK into the browser bundle, and that the real fix was to split the pure formatters out when part two touched the module anyway. Done first, so every later task landed on the clean side. Evidence it worked rather than merely moved: walking the transitive import graph, `spark-copy.ts` reaches four modules and cannot reach the SDK at all, while `spark.ts` still reaches it. Nothing is re-exported, because a re-export would have left the hazard where it was.

**Verification.** 380 tests green, up from a 320 baseline recorded before any code on this branch (which matched part one's recorded figure). `tsc` clean. Lint carries one pre-existing error in `OnboardingWizard.tsx` ("Calling setState synchronously within an effect"), recorded at the baseline so it is not attributed here; it is untouched by this slice. Note for future slices: `npx next lint` no longer exists in Next.js 16; the command is `npm run lint`.

Three tests were proved capable of failing rather than trusted: the same-instant test failed with a P2002 on `(groupId, startsAt)` when the old unique index was temporarily restored; the cron-guard regression test returned "skipped" instead of "created" when the guard was temporarily widened back to "any upcoming event"; and the double-fire concurrency test failed with a P2002 on `gaugeId` when the catch was removed, which also proves the two calls genuinely race rather than serialising.

*Looked at:* the rendered two-card home was compared against walkthrough screen 08. Card order (soonest first), the thin peek of the next card, the metadata line, the counts rule and the teal-plus-outlined RSVP row all match. One difference: screen 08's dots carry an active state showing which card you are on, and the shipped dots do not. That is the agreed interim treatment, below.

*Shown:* a browser walkthrough against dev-test, with a group created through the real wizard ("we climb Sundays at 8am at Summit Gym, and we grab beers at Lucky Lab once in a while", which captured both venues). "we should finally grab beers sometime" produced "Love it. Anyone in for beers on Friday, Jul 31? If three of you are in, I'll set it up." with three chips and no tally. At two yeses the tally read "Maya & Jesse are in so far · one more makes it happen". The third yes, tapped through the real chip, created an event at 2026-08-01T00:00:00Z (Jul 31 7pm Central), with Lucky Lab inherited from the group's own rhythm, all three yeses seeded as IN RSVPs with no second tap, and Orbit posting "Three of you are in, so beers is on for Fri at 7pm. It's up top now." The home then carried two cards, soonest first, with dots and a peek; the sparked card read "Fri, Jul 31 · 7pm · Lucky Lab · 3 In" with the viewer's "I'm in" already checked; and the gauge's chips were gone, its message reading as plain history.

"we should do breakfast sometime" proposed Saturday, Aug 1 and stored 09:00, its third chip reading "Yes, can't Sat". "anyone up for pickleball at 8?" produced the disclosure sentence in the feed and stored 20:00; its third yes created the event at Jul 31 8pm, not 7pm, and with no venue at all, because no rhythm matched, which is venue-never-gates working. "darts Friday at 8pm" counted the initiator immediately ("Jacob is in so far", chip checked, no countdown at one) and carried no disclosure, because 8pm is unambiguous. "sounds good" produced no reply and no gauge.

The cron was exercised through its real HTTP route with the standing occurrence moved into the past and two sparked events upcoming: it returned "created" and added Sunday's climb anyway, and a second run returned "skipped / upcoming_exists". That is the invisible regression proven fixed end to end, not merely unit-tested.

*What the walkthrough could not prove.* Three yeses from three separate signed-in sessions were not exercised; two of the three votes were seeded directly as rows and only the deciding third yes came from a real chip tap. That is the tap that matters, since it is the one that triggers creation, but multi-session voting remains unverified, as it was in part one. Synthetic clicks on the send arrow were again unreliable and some sends were driven by submitting the form directly, the same tooling artifact part one recorded; Enter still does not submit in this browser.

**A process finding worth more than the bug it caused.** Task ordering left the dev-test database unprotected for several commits. Task 1 dropped the composite unique; Task 8, six commits later, added the per-path keys that replace it. In between, every full-suite run added a duplicate scheduled event to every dev-test group with a rhythm, because the reconcile test's unscoped sweep creates real rows in groups it does not clean up. 32 junk rows accumulated and were deleted. Nothing about the final state is wrong, and the keys demonstrably hold now (a later full-suite run added zero duplicates), but the lesson generalises: a migration that removes a constraint should land with its replacement, not ahead of it. The pre-existing test-hygiene problem underneath it, that `reconcile.test.ts` sweeps every group in the shared dev-test database and cleans up only its own rows, is logged as debt below.

**Pre-PR review.** A read-only reviewer read the whole diff against `main`. It found nothing in `revalidatePath` placement, RSVP shape, Orbit identity, timezone and DST math, venue gating, em dashes in Orbit's copy, fixed heights, client-supplied id trust, or scope creep, and confirmed the spark path's single transaction is an improvement on reconcile's non-transactional pair. Nine findings were real and are fixed; each was verified against the running system before being acted on rather than taken on trust.

The one that mattered: **the narrowed cron guard originally asked for a `scheduledKey`, which no event written before this slice has.** Every pre-existing occurrence would have been invisible to the guard on the first run after the migration, and the constraint that used to catch the resulting duplicate was dropped by that same migration, so every group with a standing rhythm would have silently gained a duplicate event and a duplicate announcement. Confirmed by querying dev-test: four real future events, all in groups with rhythms, all invisible. The fix keys the guard on the ABSENCE of a `gaugeId` instead, which is right about legacy rows for free and needs no backfill migration at all; `scheduledKey` stays as the cron's write-side idempotency key. Verified after the change: those four rows are seen, and a cron run created nothing. Worth noting that the schema comment written earlier in the slice already described the gaugeId design, so the code and its own documentation had diverged, and the documentation was the correct one.

Also fixed: **closing the gauge punched a hole in the duplicate-activity guard** (detect-spark used `findLiveGauges` as its only check, so once a gauge produced its event the same activity could be gauged again and create a second identical event, now legal at the database level); **a gauge could be born unable to keep its promise** ("climb Saturday at 9?" sent Saturday at 11 resolves to a start already gone, and part two's message promises to set it up, so detection now stays quiet rather than promising the impossible); **`promoteGaugeToEvent` seeded RSVPs from a snapshot read outside its transaction**, so a vote landing in the same second could leave someone with a yes on the gauge and no RSVP on the event, asked again for an answer they already gave (votes are now re-read inside the transaction, which also refuses to create an event for a gauge that fell back below the bar); **the ambiguous-time branch ignored the normalized `partOfDay`**, so "hike at 6" with a morning activity became 6pm, which is exactly the "trust the normalized shape, not the model's self-consistency" rule; **the announcement hardcoded "Three"** even though the bar is meant to live in one place, and said a bare weekday for an event up to eight days out where `buildGaugeMessage` correctly says the date; and **same-instant events had no tie-break** in the card ordering, which this slice's own change made reachable.

One finding was **not** fixed in code and was raised as a question for the product owner rather than decided quietly: with two or three cards mounted, the screen carries two or three teal "I'm in" buttons. It was settled by amending the rule instead (see the debt section below), so the code is unchanged and CLAUDE.md is not.

**Debt this slice opens.**

- ~~**Multiple teal primary actions are now on screen at once.** CLAUDE.md says exactly one teal action per screen; the carousel mounts up to three cards, each with its own teal "I'm in".~~ **Settled 27 July 2026: the rule was amended, not the code.** The owner's read is that each card is an individual element carrying its own primary action, and that "one per screen" was too rigid a wording for a case written before multi-card surfaces existed. CLAUDE.md's colour rule now says one teal action per *element*, with "never two teal buttons on one card" as the concrete test. Recorded here because the rule changing is the notable part, not the carousel.

  The owner attached a general principle to it, which is worth more than the specific ruling: **the specs are strong opinions, weakly held.** They were written very early, before implementation surfaced real requirements, and the project is expected to keep discovering things. A rule meeting a case it did not anticipate is a question, not a violation. The obligation is to flag the tension with a recommendation rather than either obeying it into a worse product or deviating silently, and then to amend the rule once settled so the next slice inherits the refined version. This slice is the worked example: the tension was raised in the PR rather than decided quietly, and the rule moved.
- **The four undated defaults** (Fri, Sat, 7pm, 9am). No data behind any of them. They are one module and one decision to replace, and override-learning (§5) is the named successor. Medium, because a wrong default is visible to every member on the card.
- **A wrong time guess has no correction path.** If Orbit reads "at 8" as 8pm and the group meant morning, nobody can tell it otherwise; the cut "let me know and I'll change it" clause is exactly what is missing. Was already true of the scheduled path and now applies to two event sources, so it is worth more than it was. Medium, and it belongs to the change-request slice.
- **Venue inheritance is exact-word matching.** "grab drinks" against a "beers" rhythm inherits nothing. Degrades to no venue, never to a wrong one. Low.
- ~~**The reconcile test sweeps the whole shared dev-test database.** Its unscoped `reconcileScheduledEvents(NOW)` creates real events in every group with a rhythm and cleans up only the ones it tracks, so every run leaves residue in unrelated QA groups and inflates what a later walkthrough sees.~~ **Resolved 27 July 2026**, see the follow-up entry below.
- ~~**The carousel's dots have no active state.** Interim treatment, below. Low.~~ **Resolved 12 Aug 2026** by polish slice one, which gave the dots a tracked active state, and **moot as of 17 Aug 2026**, when the dot row was deleted outright (header-subline micro-PR).
- **No server-action tests** for `gauge-vote` or `detect-spark`, matching the repo's existing shape; both are proven only by the walkthrough. Low, and named so the absence reads as consistency rather than oversight.

**QA data note.** Browser verification created one "Sunday Climbers" group in dev-test via the real wizard, with four gauges (beers, breakfast, pickleball, darts), two promoted events (Beers and Pickleball), two seeded members named Maya and Jesse, and a standing Climbing Sunday whose start was deliberately moved into the past to exercise the cron. Left in place as the PR's inspectable evidence; expendable dev data thereafter. Separately, 32 duplicate 2099-dated events created by the constraint gap described above were deleted from seven dev-test groups; one such row from 21 July, predating this session, was left alone.

### Follow-up: making the test suite unable to mislead us (27 July 2026)

Not a product slice. Two fixes of the same kind, both surfaced by spark part two and deliberately held until after it merged, because both touched files that branch was editing.

**What was wrong.** Two separate ways the suite could report something untrue.

*One test was green because of the calendar.* `findSoonestUpcomingEvent` was the only date-sensitive function in the codebase that read `new Date()` internally instead of taking the instant as an argument, so its test could not control the clock and had to hardcode a date it hoped was still in the future. It hardcoded 25 July, was written on 25 June, and went red on its own on 26 July with nobody having touched any code. A one-line patch on 26 July stopped it expiring; this is the actual fix.

*The scheduling tests wrote into groups they did not own.* `reconcileScheduledEvents(NOW)` with no scope does not merely read the database, it creates a real event and a real ORBIT announcement in every group that has a rhythm. The test file cleaned up only its own fixture group, so every run left rows behind permanently. Worse, `NOW` in that file is in 2099, so the leaked events are "upcoming" forever and then suppress the real cron for whatever group they landed in.

**Why this mattered more than it looks.** During the spark part two walkthrough the residue put a phantom third card on a QA group's home screen. It took a database query to establish that it was junk rather than a product bug, and for a few minutes the verification evidence was simply wrong. The whole process here rests on browser walkthroughs and test counts being trustworthy; a test that quietly corrupts the evidence a later verification depends on is worse than no test at all. That is the reason this was worth its own change rather than being left as a known annoyance.

**What changed.** `findSoonestUpcomingEvent` now takes `now` as a required argument, matching every sibling and matching the reason `timeZone` is required in `events/format.ts`: a caller that can silently fall back to a hidden default is a caller that can silently be wrong. Its three tests inject a fixed instant, so their dates mean the same thing in 2036 as in 2026. It also gained the `createdAt` tie-break its sibling `findUpcomingEvents` got, since this slice made same-instant events legal and "the soonest" was otherwise unspecified between two of them. All ten `reconcileScheduledEvents` calls in the test file are scoped with `{ groupId }`, and the file's header now says not to remove that, with the reasoning, so it does not quietly come back.

**Evidence.** A/B against the real dev-test database, from an identical cleared starting point: with the scoping removed, one run of that single test file leaves **8** stray 2099-dated events across unrelated groups; with the scoping in place, **0**. 388 tests green, `tsc` clean.

**What this deliberately gives up.** Nothing now exercises reconcile's loop across many groups. That is accepted: the loop is trivial, the groupId-filtered path is covered by its own test, and the only honest way to exercise a whole-database sweep is a database nobody else is using. Recorded so the gap reads as a decision rather than an oversight.

**Database note.** dev-test was emptied afterwards (0 groups, 0 events, 0 users, 0 messages). The QA groups from every prior slice had been kept as inspectable PR evidence, which is worth something while a PR is open and worth nothing once it is merged. The suite was then re-run green from a completely empty database, which is its own small proof that the tests build all of their own fixtures and depend on no ambient rows. Going forward the norm is: keep QA data only while its PR is open, clear it at merge.

### App-wide navigation: a front door and a way back (27 July 2026)

**What it is.** Every screen in the product now has a way onward that is not the browser's back button. Event detail and group info carry a named link back to their group's home, the group home's Orbit logo is finally the home button CLAUDE.md has always described it as, `/create` step 1 can be left, a bad invite link gets a note from Orbit and a way into the product anyway, and a wrong id or a crash lands on a branded screen with an exit instead of Next's unbranded default. Underneath all of it sits the shared header bar the product never had. Found by the product owner during QA of spark part two: tapping into an event stranded you.

**Why this is one slice and not five.** `src/app/layout.tsx` rendered bare `{children}` and there were no nested layouts, so navigation was hand-written per screen and any screen whose author did not write a header simply had none. Five symptoms, one structural cause. Fixing them one at a time would have meant bolting a link onto each screen and leaving the cause in place, so the next screen anyone builds would start with no way back too. The full audit is in §8; `next/link` was imported exactly once in the entire codebase when this slice opened.

**The design was not silent, and assuming it would be would have meant inventing decisions already made.** The expectation going in was that the mockups predate these screens. All five relevant crops were rendered, not grepped and not assumed, before a line of the spec was written, and they answer four of the six screens. Event detail was drawn with a header reading `‹ Climbing Crew`, so the screen that stranded the owner had a way back in its own design: an unbuilt decision, not a new one. Group info was drawn with the identical header, and what had shipped read `‹ Back` with the group name centered, so the built screen deviated from its own design. The create wizard's later steps carry a back chevron and step 1 does not, so the design shares the step-1 gap rather than solving it. The join screen deliberately carries no header at all. Genuinely undesigned, and therefore decided here: `/`, page-not-found, the error screen, and the bad-invite state.

**Two header shapes, splitting on hierarchy.** A root header (a mark, a title, a subline, no back) belongs to the group home and to the create wizard. A child header (`‹ parent name`) belongs to event detail and group info. That grammar was read off the mockups rather than invented for this slice, which is why the two child screens now carry the same header down to the pixel.

**The bar owns the bar, and nothing about content.** One shared piece owns only the rules of the header bar: its breathing room, the hairline beneath it, that it does not scroll away, and that it grows with whatever is placed inside it. It has no title slot, no trailing-action slot, and no opinion about what opens group info. The rejected alternative was a single configurable header that knows each screen and switches on a variant. It has fewer lines at the call sites, and in exchange it would have to know about group-info links, invite-link sublines, wizard step counts, and which screens have none of those, so every future screen's exception lands inside one file. It is also the version that eventually swallows the group home's title chevron, because the chevron becomes a thing the header does rather than a thing the group home does. Holding the boundary at "the bar, and nothing else" makes that structurally impossible instead of merely discouraged. Nothing goes into the root layout either, so each screen opts in and the join screen keeps exactly zero header, as drawn. The one cost worth naming, because it is a decision rather than a discovery: event detail's header takes roughly 48px out of that screen's scroll area, and the alternative was the browser back button, which is what the owner found unacceptable.

**Back is a fixed parent link, never the browser's history.** The design draws a named parent, not a generic arrow, and history-back is unpredictable in exactly the case that matters: arrive at an event from a shared link and history-back throws you out of the product entirely. Event detail always goes to its own group's home, whether you came from the card or from a text message.

**`/` had to be settled first, because four dead ends resolve to it.** It is a session-aware front door: a session with a group is sent straight in, a session without one sees the pitch and one teal "Start your group." Settling it first is what makes the Orbit logo a genuine home button today, and it gives the bad-invite exit, the not-found exit, and the error exit one honest destination that is correct whether or not the visitor has ever used the product. Both alternatives fail a real person: a static landing everyone sees drops a returning member on marketing copy and makes them find their own way in, and a pure redirect with no landing drops a first-time reviewer into a form with no idea what the product is. The front door's copy holds both halves of the founding complaint rather than only the organizer half, since groups choose between coordination so casual nothing happens and coordination so heavy it feels like planning a wedding for a casual Sunday. It names Orbit before a first-time visitor knows what Orbit is, deliberately: the join screen already introduces Orbit by name to strangers the same way.

**Orbit speaks on the bad invite link and stays off the technical failures.** Orbit's presence means something is being handled for you, and Orbit did not break a mistyped URL; putting its face on a crash makes it look less competent than it is. A bad invite is different, because a real person is trying to join a real group and a warm voice genuinely helps there. Character in the writing is a separate thing from Orbit's presence, and both broken screens get it: "That page isn't here" rather than "404 Not Found," with no Orbit face and no first person. The objection being answered is to cold copy, not to unbranded copy.

**On the bad invite screen Orbit leaves a note, not a bubble, and this project's own rule is what caught it.** CLAUDE.md says a bubble is only correct when the user's next on-screen action responds to Orbit. There is nothing to reply to on that screen, so a bubble would make a promise it cannot keep; it uses the `A NOTE FROM ORBIT` treatment already drawn on screen 09. This is the same failure the rule was written to prevent (the gap-step card, still in the feel-pass register), caught here before it shipped instead of after.

**The create exit is on step 1 only, and it sits at the bottom.** Steps 2 and 3 already have a way backwards within the flow ("Edit my description"), and adding a leave-the-flow link there would hand a founder three steps into describing their group a control that silently discards all of it. Step 1, where nothing is invested, gets a way out. Placing it at the bottom as an underlined text link makes it the flow speaking its own established language, and putting it inside the step-1 component makes "step 1 only" structural rather than a conditional somebody can later get wrong. The rejected alternative was the shared bar at the top of `/create`. It cannot be driven from the page shell, because the page is server-rendered and the step lives in client state, so it would have forced the wizard to take over the page's heading and column and would have moved "Start your group" out of the shell as a side effect: a visible change to steps 2 and 3 with no navigation value. The top of that screen is also spoken for, since the design puts Orbit's avatar and `STEP N OF 3` there and the onboarding-share-moment slice has to build it. One consequence accepted rather than solved: leaving step 1 after typing a description loses that text, with no confirmation dialog.

**The teal rule needed no further change.** The amendment recorded on 27 July (one teal action per element, never two on one card) already covers this slice, and nothing here reopens it: the front door carries exactly one teal action ("Start your group"), the not-found screen exactly one ("Take me home"), and the error screen a teal primary plus an outlined secondary, which is the pattern the event card already uses. The bad-invite screen carries none on purpose, because what that person wanted was to join a group and teal would be overselling a consolation prize.

**Two smaller positions recorded so nobody later reads them as oversights.** One generic not-found page rather than a group-specific and an event-specific one: it is honest about both cases and is one file instead of three, and a later slice can split it. And there is no global-error boundary, so a crash inside the root layout itself is uncovered; that layout is a few lines of font wiring, so the case is close to theoretical, and it is recorded rather than covered.

**One decision made in passing.** Orbit's avatar on the bad-invite screen first shipped as a bare lime circle, even though the plan's own footnote said it matched the letter-"O" placeholder the rest of the product uses. The code was reconciled to the plan's stated intent rather than the other way around, so Orbit's face is consistent everywhere it appears today. It stays at 20px and stays invisible to assistive technology, because the label right beside it already reads "A note from Orbit" and a screen reader announcing the letter O first would be noise.

**Verification.** 397 tests green across 28 files, `resolveFrontDoor` covered by five unit tests written first and shown failing. The two new dev dependencies (`jsdom` and `@testing-library/react`) went in without touching the shared Vitest config, which is what makes the claim that the existing suite is unaffected provable rather than asserted: 393 tests before the install, 393 after. Lint carries the one pre-existing error in `OnboardingWizard.tsx` and eight pre-existing warnings, all of which are present on `main` too and none of which this slice touches.

*Walked:* the whole product in one pass against dev-test, with a screenshot at each stop: the front door with no session, create step 1 and its exit, the group home, into an event and back, into group info and back, the Orbit logo round-trip, an unknown group id, an unknown event id, and a bad invite token. The slice's central claim holds on every one of those screens: there is at least one route back into the product that is not the browser's back button. Both back-link taps and the logo round-trip were confirmed to be in-app transitions rather than full page reloads, using a marker planted on the window that survives the navigation. The two unknown-id screens render the identical page, confirmed by comparing the two screenshots byte for byte.

*Looked at:* event detail's and group info's rendered headers beside design crop `screens-09-10.png`, the only two screens in this slice with a design to match. Both now read `‹ [group name]`, left-aligned, one line, no avatar, nothing centered and nothing balancing them on the right, which is a full match to both screens 09 and 10. The duplicate uppercase group-name eyebrow that used to sit above the event title is gone, so the group's name appears exactly once. Everything below those two headers still differs from the mockups in ways that predate this slice and were deliberately left alone: event detail has no row icons, no map link, no add-to-calendar button and no Orbit reminder note, and group info is still the stub that defers its emblem, member list and leave button to the full group-info slice. Raised as questions, not fixed here. No "matches the design" claim is made about the front door, the two broken screens, or the create exit, because none of them has a mockup.

*What the walk could not prove.* The error screen has no natural trigger; it was exercised only by temporarily throwing inside the event page, confirming the screen rendered with both of its actions, and removing the throw (removal confirmed by a clean diff and by the string appearing nowhere in the tree). The several-groups front-door case was never seen in a browser, because no user in dev-test belongs to more than one group and the data was not contrived to fake it; it is covered by unit tests only. And the screenshots were captured at roughly 500px layout width rather than true phone width, because headless Chrome on this machine lays out at a fixed width and a narrower capture clipped content, so phone widths below 500px are unverified for these screens.

**Debt this slice opens.**

- **The multi-group placeholder.** A session belonging to several groups is sent to the most recent one. That is a guess standing in for the multi-group home, marked as one in the code, and it is the first place in the product where the many-to-many data model is visible in behavior without a screen designed for it. Low today, because nobody in dev-test has two groups; it becomes the multi-group home's problem the moment anyone does.
- **A front door with no design source.** It is the one screen here built without a mockup. The copy is settled and the layout is trivial, but it should be looked at during the visual-polish pass rather than assumed finished.
- **Nothing on the not-found page knows what you were looking for.** Someone following a stale event link is told the page isn't here, not that the event was cancelled, because the product cannot currently tell those apart. Worth knowing before anyone proposes a friendlier message, since the friendlier message is the part that needs data the product does not have.
- **The duplicated page-shell styling.** The same handful of properties (page background, text color, font stack, flex column) is copy-pasted across six files. Adjacent to everything this slice touched and not navigation, so it was recorded rather than fixed to keep the diff reviewable as one idea. Low.

**Debt this slice pays down.** The repo can now test a component. Vitest ran in a plain Node environment with no browser-like environment and no React testing library, so every test file in the project was pure logic in `src/lib`. This slice created the product's first genuinely shared UI, which is exactly the kind of code where a change in one file quietly breaks a screen nobody thought to click. The honest limit, recorded so this does not read as more than it is: it tests the small shared pieces, and it cannot test the screens, which are server-rendered and talk to the database. The browser walk remains the real proof of this slice; the component tests are the safety net for the shared pieces going forward, and the payoff is mostly in later work (group info growing into its full page, the create header, the visual-polish pass).

Deliberately not moved while the area was open: §11 invites relocating `RsvpControls` into a shared directory "when the next refactor opens that area," and this slice technically opened it by creating `src/components/`. It stayed where it is. Moving it is not navigation, and it would have put unrelated churn in a diff whose whole value is being readable as one idea.

### The README, and the setup path that never worked (27 July 2026)

**What it is.** Two changes a week apart in intent but a day apart in time. The repo's front door was still the create-next-app tutorial page, so it was replaced with a README written for someone evaluating the work (#30). Then the setup section in that new README turned out not to work, so it was fixed properly, along with a checked-in environment template (#33). Neither is a product slice; both are recorded here because the second one narrowed a safety net, and a narrowed safety net that nobody wrote down reads later as an oversight somebody should tidy up.

**Why the README exists now rather than at the end.** The product owner is talking to companies about roles this week, and an investor wants this product to exist. Those two audiences want the same thing from a repo and it is not a feature list: they want to see how decisions got made. So the README leads with the problem and with Orbit's guardrails and the reasoning behind each one, and puts the stack in a small table near the bottom. The "where the thinking lives" section pointing at CLAUDE.md and this file is doing more work for that reader than any code sample would.

**The design images carry a warning, and the warning is the decision.** Four mockup screens are included, wrapped in an explicit note that they are designs and not screenshots. This was not caution for its own sake. Four of the ten walkthrough crops display a "beers, about once a month" row, and monthly cadence is the signature no-data-home failure recorded in the one-shot experiment entry above. Including them unlabelled would have shown a hiring reader a capability the product cannot deliver. The alternatives were cropping the offending row out, which produces a doctored artifact, or shipping no visuals at all, which for a product portfolio piece is a real loss. The fence keeps the images honest and costs one sentence. When there is a hosted link, real screenshots replace them and the fence comes out.

**The setup instructions were wrong in the way that is hardest to catch: they read as working.** They said install, generate, run. Every command was plausible and the section looked complete. It dead-ended at the second command, because `prisma.config.ts` reads `DIRECT_URL` and Prisma's `env()` throws when the variable is missing. It resolves eagerly at config load, so the failure is not "migrations cannot connect," it is that the Prisma CLI cannot start at all, including `prisma generate`, which never touches a database. Worth recording precisely, because a fix prompt drafted in a separate session diagnosed this as `prisma migrate deploy` needing a direct connection. That command appears nowhere in the README, and that mechanism is not what breaks. Verifying the claim before acting on it took one command and changed what the fix says. Two further gaps surfaced from the same look: there was no instruction to apply the seven existing migrations, so a correctly configured clone still landed on an empty database, and `npm test` was listed as if it ran standalone when the smoke test creates real rows.

**A gitignore rule would have made the new template imaginary.** `.gitignore` carried `.env*`, which matches `.env.example`. Without a negation the file would have been created, looked correct on disk, and silently never committed, and the failure state is indistinguishable from success from the outside. This is the same shape as the monthly-beers drop: the thing that goes wrong is not an error, it is an absence. It is why the verification for that change was "does the file appear in the commit," not "did the write succeed."

**The edit-protection hook now allows exactly one filename, and that is not a hole.** The hook blocked writing `.env.example`, correctly by its own pattern, which cannot tell a placeholder template from a secrets file. The exception is anchored to that one name. Everything else matching an environment file, and every migration, still blocks. It is deliberately not a general "templates are fine" rule, because the next such file would then be exempt by default rather than by decision. Three things make this safe rather than merely convenient, and they are the reason it is written down: the hook guards an AI agent editing files on one machine, not a running system or anyone's access to anything; the hook itself is committed and public, so the exception was never secret; and the template holds placeholders only, audited by variable name without reading any values. The audit also confirmed no real environment file has ever been committed anywhere in this repository's history. The exception exists because the template must stay in sync when a variable is added, and a guardrail that has to be disabled by hand every time is one that eventually gets disabled permanently.

**Verification.** The `DIRECT_URL` failure was proven by probing Prisma's `env()` with a missing variable rather than inferred from the config. The hook change carries a ten-case check covering real environment files, the template, absolute paths, and migrations; the case that earns its keep is `.env.example.bak`, still blocked, which proves the exception cannot be widened by appending a suffix. The template's presence in the commit was confirmed from the commit itself, not from the filesystem. Both READMEs were read as GitHub renders them, with image loading and link resolution checked rather than assumed. Every factual claim in the README was checked against the code before it went in: the test count came from a run, the single-transaction claim from `provision.ts`, and the claim that tests exercise bad extraction output from the actual cases in `normalize.test.ts`.

**What could not be proven, and is stated as such in the pull request.** The clone-to-running-app path was never executed, because it needs a second Supabase project and a separate database. The commands are verified by reading against `prisma.config.ts`, the migrations directory, and the smoke test. Anyone with a spare Supabase project should run it once and confirm; until someone does, the section is careful reasoning rather than a tested path.

**Debt this opens.** The design mockups in the README are a placeholder for real screenshots and should be swapped when there is something hosted to screenshot, at which point the warning fence comes out with them. The README also states the product's status in prose, which means it is now a second place where "what is built" is recorded and can drift from the "where the build is" section in CLAUDE.md; the two were consistent on the day they were written and nothing keeps them that way. Low, but it is the kind of drift nobody notices until a reader points it out.

### Change request part one: Orbit can change the time (27 July 2026)

**What it is.** "Concrete-first, override-friendly" is one of Orbit's core guardrails, and only the first half existed: Orbit proposed a specific time, sometimes disclosed a coin flip, and had no way to hear that the guess was wrong. This slice builds the override half, scoped to the one field where a wrong guess is most visible and most fixable: an existing event's time. A member typing "can we do 9 instead?" in the group chat moves the plan, resets every RSVP so nobody's yes silently attaches to a time they never agreed to, and invites a revert in plain words. When Orbit is only mostly sure what was meant, it proposes its single best concrete reading and asks, with one-tap chips visible only to the person who asked. A request for something out of scope, venue, day, or the standing rhythm, gets an honest decline instead of silence, because a request that gets silently ignored teaches the group Orbit does not listen, which is the trust problem this slice exists to fix.

**The RSVP reset chose between two of the product's own precedents, and split the difference by who is asking.** Two rules already lived in this codebase and pointed opposite ways. "Never ask twice" (spark part one: gauge yeses are auto-seeded onto the event they create) says an answer someone already gave should carry forward rather than making them repeat themselves. But an RSVP is also proposal-scoped: a yes for the 8am climb is an answer about 8am, not a blanket yes to whatever time the plan eventually lands on, and carrying it forward across a real time change would be the displayed roster lying about who is coming, exactly the failure the RSVP rules exist to prevent (CLAUDE.md data-model rules). The resolution keeps both rules true for the people they were written for: every RSVP resets to "haven't replied," the absence of a row, no new status invented, except the requester's, because the person who typed "can we do 9 instead" already answered the new proposal in the same message that created it, the same precedent as the gauge initiator who names the day. Rejected: keeping all RSVPs, which is momentum bought with inaccuracy. The reset, the move, and the announcement happen inside one transaction, so nobody can read the feed mid-write and see a card that doesn't match what Orbit just said.

**The revert is textual, not a mechanism, and it needed a data home.** "Put it back" is just another change request running through the same detection, open to anyone, forever, with the same RSVP-reset rule applied, because a reverted time is exactly as much a new proposal as a moved one. A one-tap revert chip was considered and rejected: it would need its own rules for who may tap it, how long it lives, and what happens once new RSVPs arrive, landing it in the chip-wrap layout debt already on the books. For "put it back" to resolve to anything, the event has to remember where it was, so `Event.previousStartsAt` was added, nullable, overwritten on each move, named under the no-data-home rule rather than invented quietly. It remembers the last move only; the feed itself is the full history, and that limit is deliberate, not an oversight (see debt, below).

**The ask-when-ambiguous path was built now, not deferred, and chips are scoped to the person who asked.** The owner's call was to build this path now rather than defer it. When a message is probably but not clearly a change request, Orbit doesn't interrogate with open questions; it proposes its single best concrete reading and asks for a yes, reusing the proven gauge-chip shape (a `ChangeProposal` row shaped like `Gauge`, created in one transaction with Orbit's question message). The chips answer only the asker's own ambiguity, so only the asker sees them; anyone else who wants the change says so in their own words, which is the normal path anyway, and sees Orbit's question as ordinary feed history. A text reply was rejected as the confirm mechanism because it would make Orbit responsible for recognizing confirmations in free conversation, a whole new way to misread intent, where a deterministic chip tap cannot be misread.

**A bare hour now inherits the plan's own time instead of a coin flip.** Spark's coin flip existed because spark had nothing to reason from. A change request always has an existing time to read against, so "make it 9" on an 8am plan reads 9am and on a 7pm plan reads 9pm, with an explicit am or pm always winning outright. When inheritance decides an ambiguous hour, the announcement discloses it once, on the same precedent as the spark coin-flip disclosure (spark part two).

**`scheduledKey` turned out to be the cleanest decision in the slice, not the landmine it looked like.** A move leaves the key alone. The key isn't a pointer to when the event is, it's the cron's memory that this occurrence was already produced, so moving an occurrence relocates it rather than freeing its slot for the cron to fill again. Traced through: a moved-but-still-upcoming event keeps blocking the cron exactly as before; once a moved event is in the past, the cron's attempt to recreate the original slot bounces off the old key and skips, correctly, since the group already held that occurrence on its new time, and the following week heals itself with a fresh key. Rewriting or clearing the key on a move was rejected because it frees the slot, and the cron would then recreate and loudly announce the exact plan the group had just moved away from. The correct behavior currently arrives by accident, an unhandled uniqueness collision caught as a skip, so this slice writes the intention down: a doc comment on the schema field and the move path, and a reconcile test pinning both the moved-earlier skip and the next-week recovery, so a future refactor can't mistake the collision for a bug and "fix" it into the wrong behavior.

**One model call now answers three questions instead of two, because a second call wasn't worth its cost.** The existing per-message call already had to understand what a change request looks like, purely so it could say "not a spark"; this slice turns that negative class into a positive third answer (spark, change request, or neither), rather than adding a second call that would roughly double both the per-message cost and the detection latency. A second call was also structurally redundant: the only thing that could gate it is the classification the first call already performs. The model's context grew to match the question it's now asked: it sees each upcoming event the home screen shows (up to three), indexed, with title and current day and time, so it can say which plan a request is about. The recorded no-ceiling-on-model-calls debt (spark part one) stands, unchanged in kind; this slice's prompt is simply longer on every message now, not a new kind of cost.

**Two things the walkthrough found that the design spec didn't fully spell out.** The revert's disclosure sentence fires on itself: "put it back at 8" on a 9am plan returned 8am with "You said 8, and since this plan was in the morning I took that as 8am," proving the bare-hour rule applies uniformly to a revert, not only to a fresh move. And the asker-only chip visibility was verified with an anonymous session rather than a second signed-in member profile, because a browser extension needed for a second live profile wasn't connected during the walkthrough. The anonymous-session check confirmed Orbit's question rendered in the page HTML with zero chip occurrences, real evidence that the server composes chips per-viewer rather than sending them to everyone and hiding them client-side, but the enforced rule is the server-side guard in the action itself, confirmed by code review, not by this walkthrough. Recorded honestly because the gap between "proven for a second member" and "proven for a signed-out visitor plus a reviewed guard" matters if anyone leans on this evidence later.

**Verification.** Unit: the three-way intent normalize (malformed and hostile claims degrade to the ask path or to silence, never to action), bare-hour inheritance including the explicit-meridiem override, every copy composer (announcement with and without disclosure, the question, each decline), the move transaction's full semantics (RSVP rows gone, requester in, previous start written, key untouched, same-instant no-op, past-time refusal), proposal confirm and decline including the stale-baseline race, and the reconcile pin for the scheduledKey behavior above. Component: `ProposalChips` labels and its error line. The suite closed at 33 files / 437 tests and a clean `tsc` after the unit and integration work; the browser task added no code, only the evidence below. Browser, on the dev-test database, group "Tuesday Climbers" (America/Chicago): all five paths green, a bare-hour move, a textual revert, a clear move with no disclosure, an ambiguous request resolved through the chip, and a venue request answered with the honest decline; `scheduledKey` verified byte-identical across all four moves that touched it.

**Debt this slice opens.**

- **The decline copy hardcodes what Orbit cannot do yet.** "I can't change the spot yet, that's coming" becomes a lie the moment venue changes ship. Cheap to fix in the moment and easy to forget; the next change-request part must retire the corresponding decline as part of its own definition of done.
- **Detection latency now sits in front of an action, not just a gauge appearing.** The roughly four-second round trip was fine when the only outcome was a new gauge; someone who asks for a change and sees nothing happen for four seconds may re-ask. The no-op guard on a repeated identical request makes that harmless, but the wait itself is a feel issue for the polish pass.
- **`previousStartsAt` remembers only the last move.** Two moves deep, "put it back" restores the middle time, not the original. The feed keeps the real history; the column's single-slot shape is a deliberate limit, and extending it is override learning's (§5) bookkeeping to take on if it's ever needed.
- **The intent prompt now does three jobs** (spark, change request, silence) in one call. That was worth it at two jobs and worth it at three; it should be re-examined rather than assumed fine the moment a fourth intent (venue, day) arrives, since one prompt classifying four things drifts harder than several narrow ones would.

**Post-merge QA by the owner (28 July 2026): what it found, and the part-two seed.** The owner ran the five-minute manual QA against a two-plan sandbox before merging, and the second plan surfaced three behaviors the agent's own one-plan walkthrough structurally could not: they all trace to detection reading each message in isolation.

- **A bare follow-up targets the wrong plan.** After moving beers by name, "can we do 9 instead?" moved climbing: the model saw a fresh message, no conversation, and latched onto the calendar's first plan. With one plan on the calendar this cannot happen, which is exactly why the walkthrough missed it.
- **A correction dies in silence.** "sorry i meant beers, not climbing" names no time, so it normalized to nothing and Orbit said nothing, immediately after acting wrongly on the asker's behalf. Silence right after Orbit itself acted is the worst possible moment for silence.
- **An ambiguous "it" kills even the honest decline.** "can we move it to tony's?" got the venue decline in the one-plan walkthrough and silence in the two-plan sandbox: no resolvable target means the quiet path, even though the venue decline never needed the target to be known.

Three decisions came out of the QA conversation, recorded here as part two's seed:

- **The consensus rule replaces the unilateral move.** Owner-stated, agreed wording: *a time change is a proposal, not an edit; Orbit moves the plan only when the new time has at least three yeses (the asker's message counts as their yes) and more yeses than the current time has people in.* One number the product already uses (the spark threshold) plus one comparison (the new time must beat the incumbent). Chips consequently go to the whole group, yeses carry through as RSVPs on the moved plan (the gauge precedent), and "put it back" follows the same rule with no special case. Part one's machinery (the group question with chips, the tally, the safe move transaction, the carry-through) is the foundation; part two widens who holds the chips and adds the bar. The open edge, deliberately unsettled: a small group where beating the incumbent is arithmetically impossible (all three of a three-person group already in), which the spark threshold shares in miniature and which the part-two brainstorm must settle rather than inherit silently.
- **The quiet default was loosened.** The CLAUDE.md guardrail amendment of the same date: stay-quiet governs Orbit speaking up on its own; it never governs replies. A direct ask with an ambiguous part gets a verifying question, not silence. The owner's framing, worth keeping verbatim: better a little too eager to help than not at all, since the whole thesis is that no one person has to be the coordinator.
- **Orbit gets a conversational window.** Detection will read recent feed context rather than one message: up to roughly the last twenty messages, larger if cost and latency stay negligible (they should; the spend is fractions of a cent). Two things are settled about its shape: Orbit's own messages and actions belong in the window (the correction failure above is unfixable without them), and message timestamps belong in the context, because a reply can arrive twelve hours after the message it answers and a hard recency cutoff would misread that group. What counts as "what we were just talking about" is deliberately not reduced to a rule; the model reads the window and judges, which is the point of having one.

**Named but explicitly not part two: long-term group memory.** The owner's example: the group grabbed beers in July, and when beers come up again in September, Orbit suggests the spot from last time. This is the existing "venue suggestions key off the group's actual history" guardrail growing a memory, retrieval-flavored (the RAG direction §10 already records), and it stays post-MVP: the aha moment is real but the conversational window above is what fixes actual present-tense mistakes.

### Change request part two: consensus and the conversational window (28 July 2026)

**What it is.** Part one gave Orbit the power to move a plan's time alone, on one person's word, reading each chat message as if it arrived with no history. The owner's post-merge QA aimed a two-plan sandbox at that design and found exactly what a single voice and a single-message memory cost: a bare follow-up moved the wrong plan, a correction landed as silence right after Orbit had already acted wrongly, and an ambiguous "it" killed even the honest decline that never needed to know what "it" was. This slice replaces both weaknesses. A time change is now a proposal to the whole group, not an edit one person can make alone: Orbit posts the ask with chips for everyone, keeps a running tally, and moves the plan only when the group actually agrees. And before Orbit decides what any message means, it now reads the last twenty messages in the group's own conversation, including its own, with timestamps, so a follow-up lands on the plan the group was just talking about and a correction is read as a correction.

**The consensus math almost locked small groups into a time they had unanimously outgrown, and the fix was to read votes for what they actually say.** The owner's rule, agreed before the build started: a new time needs at least three yeses, the asker's own message counting as theirs, and more yeses than the old time currently has people in. That rule has a hole in a three-person group where everyone is already in on the old time: the new time can collect at most three yeses while the old time still shows three people in, so "more than the old time" can never be true, even when the whole group wants to move. The fix isn't a special case for small groups, it's reading a yes for what it is: a yes to the new time from someone already counted as in on the old one is that person switching sides, not a vote for both times at once. Their old RSVP stops counting toward the incumbent the moment they tap yes on the new one. A keep tap counts the other way, on the incumbent's side, because tapping "keep it at 8" is a fresher, more explicit statement than a days-old RSVP. With that reading, the incumbent side can always shrink to zero and the new side can always grow to the whole group, so the bar is reachable in every group, not just ones of four or more. The floor itself also flexed: three yeses, or the whole group, whichever is smaller, so a two-person group needs both people (a real behavior change from part one, which would have moved a duo's plan on one message) and a one-person group still moves on its own say, exactly part one's behavior surviving as the smallest case rather than a separate code path.

**Keep voters get no RSVP row when the plan moves anyway, on purpose, diverging from how spark seeds its own no.** Spark writes both flavors of no (an explicit decline and simple silence) as an OUT RSVP once an event is created, because a spark no is an answer about attending on a day. A keep tap in a change-request proposal isn't that: it's a comparison between two times, not a statement about showing up at all. "8 works better for me" doesn't say "I can't make 9," and writing OUT on their behalf would put words in their mouth on the one surface where accuracy is the entire product. So a keep voter goes back to honest pending when the plan moves, and Orbit's announcement says so out loud and invites them to answer again.

**Newest wins, twice over.** A second time proposed for a plan that already has a live proposal supersedes the first, so the group is never voting on a stale number once the conversation has moved past it. And a person's new change request closes their own prior open proposal, on whatever plan it was on, which is the actual mechanism behind a correction: "sorry, I meant beers, not climbing" opens the beers proposal and retracts the wrong one in the same stroke, so three stray taps can't move a plan everyone already knows was a mistake.

**Silence is now reserved for messages that aren't asking Orbit anything.** Part one's decision path resolved every incomplete reading to silence, which is exactly what the amended never-silent guardrail (28 July 2026) closed. The rewritten ladder always gives a direct ask something back: a request Orbit can't place on a plan gets a plain question naming the group's actual plans, or an honest "I don't see any plans on the calendar right now" if there are none; a request missing a time gets asked for one; a request for the time the plan already has gets told so, instead of quietly doing nothing; a non-time request (venue, day) gets its decline whether or not the target ever resolves, because the decline never needed to know the target; and a genuinely ambiguous but probable reading still gets part one's confirm-or-leave-it chips, except confirming now opens the group proposal instead of moving the plan by itself.

**The window: twenty messages, timestamps, a marked trigger, and no age cutoff.** Detection now reads the last twenty messages in the group's feed as one block: oldest first, each line stamped with a group-time timestamp and its author (a member, or Orbit), the message being interpreted marked as the one to answer, and a line up top stating the current date and time so the model can judge how stale anything in the window is. A live group proposal, if there is one, gets its own line naming which plan, what time, and who asked, which is what lets "actually, 10 works better" read as a new number on the open question rather than a stray idea. There's no cutoff on how old a message in the window can be: a reply can land twelve hours after the message it answers, and a hard recency filter would misread that as a new topic. Twenty was picked as a size that covers a real burst of planning chatter without dragging in stale intent, and it's a single tunable constant, not a rule carved anywhere permanent.

**What the walkthrough proved.** All three of the owner's original QA failures were replayed against a fresh, fully-rebuilt sandbox and passed: the bare follow-up correctly targeted the plan the group had actually been discussing (with the disclosure line explaining the bare-hour read); the correction opened the right proposal and retired the wrong one; and the ambiguous "it" got the honest venue decline with zero database writes, before or after. A full four-person consensus arc ran end to end: two yeses produced the "one more makes it happen" countdown, chip taps posted no new messages, and the third yes moved the plan in that same tap, reset every RSVP, seeded every yes as IN, sent everyone else back to pending, and posted one announcement that names no yes count at all (the copy deliberately never states a number), built from the seeded yes set read live rather than assumed. The supersede rule was exercised on both its axes live (a person's own correction retiring their prior proposal, and a newer confirmed proposal retiring someone else's still-open one on the same plan), and a revert moved cleanly back through the identical consensus rule, no special mechanism. Two honest gaps: the revert's bare-hour disclosure didn't fire in the walkthrough because the phrasing that reached Orbit read as unambiguous (already proven in the two forward-direction QA cases, not independently reproven on a revert), and a browser-automation slip garbled the revert message itself before Orbit ever saw it, so the plan's literal "put it back at 8" wording wasn't tested in true isolation.

**Verification.** The suite closed at 38 files and 514 tests, `tsc` clean, and lint holding at one pre-existing error outside this slice's files (`OnboardingWizard.tsx`, untouched by this branch) plus warnings, no new errors introduced. Browser QA ran on the dev-test database, reset to empty and rebuilt entirely through the real product: a founder onboarded, three members joined through the real invite link in three separate sessions, RSVPs and a second sparked plan staged, then all three replayed QA failures, the full consensus arc, the supersede edge, and the revert walked live end to end, described above.

**Debt this slice opens or carries forward.**

- **Reply-path idempotency.** Verify questions, declines, and the other plain-message replies still carry no idempotency key, the same exposure part one accepted for its declines, now covering more paths. One detection per send today, so the exposure is narrow, but a hypothetically repeated detection would repeat the reply. Recorded, not engineered away.
- **The intent prompt is doing three jobs on a meaningfully larger context now.** Part one's own note said this should be re-examined once a fourth intent lands; it hasn't, but the window makes today's three-job prompt noticeably heavier on every single message, which is worth watching rather than treating as free.
- **Detection latency sits in front of every reply now, not just a gauge appearing.** Same feel issue part one named, now covering the whole reply surface rather than just the original change-request paths.
- **Spark's own small-group edge is still there, by design, out of this slice's lane.** A two-person group still can't spark an event on its own; the spark threshold is still fixed at three with no whole-group floor the way consensus now has one. Recorded so it reads as a known, not an oversight.
- **The gauge-vote action has no membership check.** The new proposal-vote action added this slice does check membership before recording a vote; the review confirmed the older gauge-vote action does not, and it is flagged here for a future pass rather than fixed inside this one.
- **A dev-only config change shipped alongside the QA work, not the product.** Next 16 blocks a dev server's own resources across origins, which meant every page opened on `127.0.0.1` or a `*.localhost` host during multi-session QA never hydrated, so buttons and chips looked dead even though the server was working; `allowedDevOrigins` was added to `next.config.ts` (dev-only, per Next's own guidance) so QA could run several real member sessions side by side. No effect on the deployed product.
- **A message from a session that never joined the group can still open a group time proposal.** Detection is not membership-gated (the standing access-control gap every surface shares), so an outsider's message can open a new group proposal, and opening one retires the group's current live proposal under the newest-wins rule, even though the outsider's own yes never actually counts toward moving anything: voting and the move itself both stay member-gated. So an outsider cannot move a plan this way (the one carve-out is the existing solo-group immediate move, which part one already allowed). Inherited by the access-control slice along with the rest of the ungated surfaces, not a new gap this slice opened on its own.
- **An asker who sends two ambiguous time requests in a row can briefly hold two live verify questions at once.** Newest-wins only fires when a GROUP proposal actually opens, not at the earlier verify-question stage, so two quick ambiguous asks can each get their own verify question with chips before either is answered. The cost is chip clutter for that one asker.
- **The never-silent net has a hole upstream of the ladder, found by the owner in chat QA (29 July 2026).** "can we move it?" sent right after a consensus move got silence. Not an error (the detection ran clean in under three seconds): the model's conservative tiebreak classified a bare ask with no time and no plan as not a request at all, and the never-silent ladder only guarantees an answer once a message is recognized as a change request. Recognition itself can still eat a direct ask. Known variance, not determinism: the same phrasing may classify differently run to run. No action yet by the owner's call; candidates when it earns one include teaching the prompt that a bare "move it" style ask is a change request with everything missing (the ladder already answers that shape with a which-plan or which-time question).

- **One narrow race residual, recorded rather than engineered away.** When a confirm tap opens the group question, the stamp that closes the asker's own verify question is still an unconditional write; if that same asker's newer message were superseding it at the exact same moment, the older confirm could win and retire the newer ask. Both outcomes leave the plan itself coherent and nothing moves wrongly; the final review judged it a note, not a blocker.

### Orbit recognition tune-up: closing the hole upstream of the never-silent ladder (29 July 2026)

**What it is.** On 28 July the owner replaced Orbit's stay-quiet default with a narrower rule: a direct ask never gets silence. The next day, in ordinary use, "can we move it?" sent right after a consensus move got silence anyway. Nothing was broken and nothing was slow. The message never reached the reply ladder, because the ladder only guarantees an answer to a message already recognized as a change request, and recognition was still enforcing the rule the owner had replaced. This slice closes that gap, and builds the first thing in this repo that can measure whether it stays closed.

**The mechanism is the part worth remembering, because more care would not have caught it.** The never-silent rule exists in two places, written in two languages, for two readers. The reply ladder is code, and it was rewritten. The recognition step is a prompt, prose in a different file, and it is a second copy of the same rule. Nothing connects them. Both looked correct in isolation and the pair was wrong. That is why this slice ships a checklist ("Where Orbit decides to speak or stay quiet", above) as well as a fix: the next tune-up should start from a list rather than from a bug.

**Three holes, and one of them is different in kind from the other two.** Two were prompt prose. The intent prompt's negative list told the model that questions about an existing plan are not requests, and "can we move it?" is a question about an existing plan, so the instruction and the intent collided and the model resolved it as written. The tiebreak sentence said outright that missing something real costs nothing and interjecting is worse, which is the exact belief the amendment overturned. Both were rewritten. The third was our own code: four lines in the claim-to-fact boundary threw away any change request that named no field to change, so even on a run where the model did recognize the ask, we converted it to silence ourselves. That one is different because it failed identically on every single run; the prompt holes were variance and this was determinism, which is why it gets a real regression test rather than a rate.

**The tiebreak fix was to split one doubt into two, because they are not the same doubt.** Unsure whether anyone is asking Orbit for anything at all: stay quiet, unchanged, anti-clutter still governs that entirely. Unsure only about what someone meant, once they have plainly asked for a plan to change: say so, leave the unknown fields empty, and let the ladder ask which plan or what time. The missing pieces are exactly what the ladder exists to ask about.

**Deliberately not done: defaulting an empty field list to "time."** That would assert a claim the model never made, on the one boundary in the product whose whole job is to avoid doing that, and it would be wrong for someone who meant the venue. The guard was deleted, not replaced.

**Option A over option B, and the path between them was checked before choosing.** A makes recognition more willing to call a plan-shaped ask a change request. B would add a fourth intent class for "aimed at Orbit but unclear." A was chosen because the false positive it buys is cheap: the ladder's answer to a change request with everything missing is a question, never a move, so the worst case is one extra Orbit message asking which plan was meant. B stays open, and the checklist is where the case for it accumulates if bare asks keep dying in shapes A does not cover. The A-to-B path is additive (one schema field, one prompt section, one ladder rung and its copy), so nothing built here would be torn out.

**The bench, and why a walkthrough was never going to be enough.** Recognition is not deterministic; the same sentence can classify differently run to run, which this project had already recorded. So a single clean walkthrough is not evidence, and claiming otherwise is the standard of proof that let the bug ship in the first place. The bench is the smallest thing that can tell the difference. A case is a short setting (the plans on the calendar, a handful of prior messages with authors and relative timestamps, an optional live proposal) plus one message plus the outcome a member should experience. It runs the real prompt against the real model, then puts the answer through the same claim-to-fact boundary and the same reply ladder the product uses, so a case says "this produces a which-plan question," not merely "this classifies as a change request." It never touches the database, which is what makes it safe to run repeatedly. Twenty-two cases: ten asks Orbit must not miss, nine messages it must not answer, three with no right answer recorded only to watch which way the dial drifts. Five runs each, which distinguishes always from sometimes and nothing finer.

**The stay-quiet nine are the load-bearing half.** They are the only thing standing between this slice and a chattier Orbit. The sharpest three each sit right next to something the slice is deliberately teaching Orbit to catch: a reaction in the same feed position as the ask that started all this, a question about a plan that only wants information, and a movement verb with no plan behind it.

**Numbers, recorded rather than summarized.** Baseline, against unchanged code: must-recognize 26/50 runs and 5 of 10 cases clean; must-stay-quiet 45/45 and 9 of 9 clean; ambiguous 0/15. After all three fixes: must-recognize 50/50 and 10 of 10 clean; must-stay-quiet 45/45, unchanged, not one message moved from silence to a reply; ambiguous 5/15. Every bare ask went from dying to answered. The four cases the slice turns on (the owner's own failure, and the three sharpest stay-quiet probes) were re-run at fifteen runs rather than five, since five cannot tell always from nearly-always, and all four came back clean. What cannot be claimed: that recognition is now correct in general. Twenty-two cases at five runs measures twenty-two cases. This is a floor meant to keep rising, not proof.

**The one ambiguous case that changed sides is worth naming.** A bare ask whose referent has been trimmed out of the twenty-message window now gets a which-plan question instead of silence. That is the intended direction: the window genuinely cannot help, so asking is the honest move. The other two ambiguous cases, a member saying "I might be late again, 8 is rough" and "nobody really likes 8 do they," still classify as nothing on every run. Commentary that stops short of asking stayed on the quiet side of the line, which is where the owner put it.

**The sweep found a fourth in-lane item, and the owner sent it to its own slice.** `normalizeIntent` discards any claim where the model says a message is both a spark and a change request, including a complete and answerable change payload, justified by the same pre-amendment doctrine as the three holes. It is genuinely arguable: it is a coherence guard rather than an unsure guard, and a model that contradicts itself has arguably said nothing trustworthy. But a two-part message ("can we push climbing to 9, and we should grab beers Friday") is a plain direct ask that gets nothing back today. It was not fixed here because fixing it is not a deletion; it requires deciding which half wins on a contradictory read, which is a product decision, and nothing in the bench exercises it, so a fix would have shipped unmeasured. Queued as its own slice below.

**Verification.** Suite at 38 files and 517 tests, up by the three tests this slice added on purpose; `tsc` clean; lint holding at the one pre-existing `OnboardingWizard.tsx` error, untouched by this branch. The deterministic hole has a test that was written first, watched fail against `{ kind: "none" }`, and passes after. The two prompt holes are measured by the bench, before and after, at the numbers above. The eval files are deliberately not named `*.test.ts`, and the suite's file count was checked before and after to prove Vitest is not collecting them, which would have put paid network calls in CI.

**Queued next, from the sweep: the both-true claim.** Open questions it has to settle first. On a contradictory read, which half wins? The change half is answerable by an existing ladder; the spark half opens a gauge; acting on both is two Orbit messages for one member message, which anti-clutter does not obviously allow. Is a both-true claim evidence the model is confused, or evidence the message genuinely carried two asks? The code assumes the first and nothing has measured which it is. And the bench cannot see this today, so that slice needs two-part-message cases before it needs a fix, or it ships unmeasured.

**Debt this slice opens or carries forward.**

- **The bench covers recognition only.** Spark's own classification and the gauge path are not in it. It is built so they can be added, and that is the natural growth path rather than a separate project.
- **Five runs is a coarse instrument.** It resolves always from sometimes and nothing finer. Anything needing a real rate needs more runs than this slice bought.
- **Option B is still open,** and the checklist is where the case for it accumulates.
- **The intent prompt is still doing three jobs,** carried forward from parts one and two, flagged a third time here and not resolved.
- **A thrown error during detection is still swallowed to silence** (`detect-intent.ts`, the closing `catch`). Arguably wrong under the never-silent rule, arguably right, since a failed model call has nothing honest to say. Out of this slice's lane; on the checklist as an open question.
- **`{ action: "quiet" }` is dead code.** It is declared in the `ChangePlan` union, constructed nowhere in `src/`, and still has a branch handling it in the action. Part-one residue, left alone to keep this diff in its lane.
- **Doctrine wording across four files still describes the pre-28-July default.** Listed at the end of the checklist section. None of it is a decision point, but all of it is what a future reader reasons from, which is how this bug happened once already.

**What the owner's QA of this slice found, including two things the build did not.** Steps run in a four-person seeded sandbox on the dev-test database. The bug itself is fixed in live use: "can we move it?" with no plan and no time named got "Happy to move beers. What time were you thinking?" rather than silence. It resolved to beers, not climbing, because the last substantive message in the feed was about beers, which is part two's conversational window doing exactly its job; the bench case deliberately does not pin which rung answers, since which one is honest depends on whether the target resolved. The stay-quiet side held live on four of the five probes, and both honest declines (venue, day) still fired. Two gaps in the QA itself, recorded rather than smoothed: "9 would've been better" was never sent, and "sounds good" was sent while a group proposal was open, so it may have stayed quiet under the live-proposal rule rather than the general one. Both need one re-run in a group with nothing pending.

**A pending "Orbit is thinking" indicator was considered and rejected by the owner, and the reasoning is the part to keep.** The owner noticed detection latency only because Next's dev-tools indicator was standing in for a state the product does not have, and a dev-only tool does not exist in production. The build agent proposed a chat-feed pending state as a small next slice. The owner rejected it on anti-clutter grounds and was right: detection runs on **every** message, not only the ones aimed at Orbit, so a thinking indicator would appear when someone types "haha same". It would be noise on the majority of messages in service of the minority. The owner's read on the underlying worry: a two to three second wait for a reply is inside normal expectation for a conversation, and nobody assumes a person answers instantly. So the latency debt stands as latency, not as a missing state, and the dev indicator stays visible during QA as the builder's own instrument. Do not re-propose a per-message pending state without first solving the harder problem of knowing a message was aimed at Orbit *before* the model has read it, which is the same knowledge the recognition step exists to produce.

**Verbal RSVP is written as a guardrail and is not built, found in the same QA.** CLAUDE.md's "act on clear intent" bullet says "'See you Monday' in chat is an RSVP signal; act on it." Nothing implements it. The intent classifier answers exactly two questions about a message (is this a fresh idea, is this asking to change a plan); there is no third question about attendance, and no path from a message to an `Rsvp` row. So a member saying "yep, works for me" leaves the card reading TBD, correctly for today's build. Surfaced when the owner read a seeded feed full of agreement against a card showing four TBD and asked why. Recorded as a known gap rather than a defect, and it is a candidate slice of its own; the guardrail predates the build and had never been checked against it.

**The QA passed end to end on the second pass, and the passing run is worth stating precisely.** In a one-person sandbox: "9 would've been better" and "sounds good" both got silence, the second one now in a group with nothing pending, which clears the confound from the first pass where a live proposal could have been the reason. "move climbing to 9am" moved the plan and posted an announcement. Then "can we move it?", sent immediately after that announcement, got "Happy to move climbing. What time were you thinking?" That is the exact message, in the exact position in the feed, that produced silence on 29 July and started this slice. It is answered.

**Two access-control findings from that QA, broader than the gap already recorded.** The standing known gap says no surface is membership-gated, and it was written about *viewing*. Reading the code to answer an unrelated question showed it is not only viewing:

- **Posting, RSVPs, and gauge chips are gated on having a session, not on membership.** `GroupHome.tsx`'s `canPost` is `viewerId !== null && viewerName !== null` and never consults the `viewerIsMember` value that is computed, passed in, and used only by the feed. `send-message.ts` re-verifies the session and then writes with no membership check. So a signed-in person who is not in a group can open its home, read the entire feed with every member's name, post messages into it, and tap "I'm in" on any plan. Their RSVP row is written and then filtered out of the derived roster, so the button appears to work and the count never moves: a silent drop, which is the failure mode this project treats as the worst kind. Two docstrings assert membership checks that do not exist (`send-message.ts`: "no membership, no right to post"; `GroupHome.tsx`: "only for authenticated members"), which is the same two-copies-of-one-rule problem as the bug this slice fixed, in a different place. The one real membership gate on the page is the group-proposal chips, which correctly degrade to a read-only tally for a non-member.
- **Nothing inside the product lets anyone join a group.** The invite link renders on the group info page only for the founder; every non-founder sees "Group info coming soon." So a non-member sitting on a group home has no join button, no explanation of why they cannot take part, and no path forward. The only way in is a founder pasting a link out of band.

Both belong to the access-control slice rather than this one. They are recorded here because the existing one-line gap note reads as "viewing is open," which understates it, and because the wrong docstrings would mislead the next reader into thinking the checks are already there.

**A copy problem in the move announcement, which the owner met in the solo sandbox and which is not only a solo-sandbox artifact.** The announcement says it cleared everyone's RSVPs and to answer again up top. In a one-person group "everyone" reads oddly, and the owner's call was to let it go, on the sound reasoning that a real group is never one person. But there is a sharper version that does apply at any size: the asker's own yes is deliberately carried through onto the moved plan (change request part two), so the card showed the owner as IN at the same moment the announcement told them to answer again. The copy is right for everyone in the group except the one person it is replying to. Registered as a feel-pass item, not fixed here: it is a single string, and the fix is either addressing the asker separately or dropping the instruction to re-answer, which is a voice decision rather than a bug.

### Hook-fix pass: three safety nets, and what is still open (3 August 2026)

**Three micro-PRs in one day, all carrying the same lesson: a safety net that reports success is not the same as a safety net that works.** PR #42 made the post-edit test hook exit 2 so a broken suite actually reaches the agent that broke it rather than only the human, and made the `.env` guard ignore case, since `.ENV` and `.env` are one file on this Mac; PR #43 raised the timeout on the remote-database fixtures in `promote.test.ts`, which had been failing a coin flip's worth of runs and would otherwise have left the newly loud test hook blocking every edit regardless of what the edit did; PR #44 closed the identical case-sensitivity hole one line below #42's fix, in the Prisma migration pattern, which #42's own review found and deliberately left alone so that the `~/.claude/templates/project-safety-nets/` copy and this repo's copy could be fixed in the same change and stay byte-identical. The two hook fixes are unreachable by the test suite, because hook scripts are run by the harness and imported by nothing, so both were verified by piping the hooks the same JSON Claude Code actually sends and by confirming every check could fail against the pre-fix version first; #43 is the opposite case, a test file, verified by running it repeatedly until the flake stopped appearing. **The heading says "what is still open" on purpose, because the guard is not whole.** Two easier walk-arounds than the one just closed survive: `prisma//migrations/` and `prisma/./migrations/` both reach the real directory and both return exit 0, which one path normalization before matching would close along with case; and the hook is wired to `Edit|Write|MultiEdit` only, so any shell redirect, `sed -i`, or `tee` skips both the migration guard and the `.env` guard entirely. Recorded here rather than fixed so the record does not read as more complete than the guard is.

### Closing the hook thread: one normalization, and a test that will find the next hole (PR #45, 3 August 2026)

**What this closes.** The entry above ends by naming two walk-arounds left open. This change closes the first, declines the second on the record, and closes a third that nobody had found yet, so the thread that PRs #42 and #44 opened is finished rather than trailing. `prisma//migrations/x.sql` and `prisma/./migrations/x.sql` open the same already-applied migration this repo has on disk, `prisma/<a folder that exists>/../migrations/x.sql` is the same trick one step further, and all of them returned exit 0. (The `prisma/schema/../` spelling is worth one parenthesis of precision, since the first draft of this entry claimed more than it could: it does not resolve *in this repo*, because there is no `prisma/schema` folder for `..` to climb out of. The shape is the bypass, and a repo with such a folder is one `mkdir` away, so it is blocked and tested; it is just not something that opened a file here.) The guard now normalizes the path's separators and its `.` and `..` segments before matching, which closes all three in one move. A double slash was never exotic: any code joining a folder and a file name with a "/" produces one for free, which is why this was the easier walk-around of the two and worth more than the change that preceded it.

**The case fix from #44 is still load-bearing, and the first draft of this entry said the opposite.** The prediction recorded in #44 was that normalizing would make its one-character case fix redundant. That prediction was wrong, and this entry repeated it before the review caught it: normalizing a path collapses separators and segments, and does not touch case at all. Delete the `/i` flags today and every case hole #44 closed reopens immediately. The two mechanisms are independent and both are carrying weight. Recorded at this length because the entry directly above it argues that a safety net reporting success is not the same as one that works, and a build log confidently describing its own change backwards is that same failure wearing different clothes.

**The fix cuts both ways, and the second direction is the one to notice.** Resolving the path does not only catch more; it also stops catching something it should never have caught. `prisma/migrations/x/../../schema.prisma` writes `schema.prisma`, which this hook deliberately leaves editable because editing it is how the model legitimately evolves, and until today the guard refused it. So the guard is now more accurate rather than merely stricter. That is the honest way to describe it, and it is worth stating plainly because "we made the safety net stronger" would be a comfortable summary that is not quite true.

**The third hole, which this slice's own review found and which is the most interesting of the four.** `priſma/migrations/20260619003631_init/migration.sql`, spelled with a long s, opens the real applied migration on this machine. Not a near-miss: the same inode, checked directly rather than reasoned about. APFS compares folded, so a character that merely folds to an ASCII letter names the same file, and a regular expression comparing text sees a different word. It survived the path-shape fix above untouched, because that fix collapses separators and says nothing about characters. The guard now also folds the path with NFKC, which maps the long s back to a plain s. Then, rather than trusting that one fix covered the class, every codepoint up to U+2FFFF was substituted into each letter of `prisma/migrations` and tested against the real file: eighteen spellings reach it, and all eighteen are now refused. **This is the same defect as #42's and #44's for the third time in one day, one layer deeper each time**, which is the strongest argument in this entry for the test that follows. To be exact about what that test did and did not do: it did not find this hole, a reviewer did, and the honest claim is only that the hole is now pinned so it cannot come back, and that the next person to widen this guard has thirty worked examples to reason from instead of two regular expressions.

**A regression this change introduced and the review caught before it shipped.** Normalizing throws on a `file_path` that is not a string, where the old regular expressions quietly coerced one. An uncaught throw exits 1, and Claude Code treats only exit 2 as a block, so the guard would have failed *open* on malformed input rather than closed. Nothing a well-behaved harness sends triggers it, and that is exactly why it is worth naming: it is the failure mode where a guard looks present and is not. Fixed by coercing explicitly, so the decision to let something through is always a decision rather than a crash, and pinned by a test.

**The real change here is the second half, not the regex.** Four holes were found in a single day in one file that began the day at fifty-four lines, and every one by somebody reading regular expressions by hand: #42's review found the migration case hole, #44's review found the two path-shape ones, and this slice's review found the fold. Nothing automatic found anything, because nothing automatic existed. The file is run by the Claude Code harness and imported by nothing, so the test suite had never had an opinion about it. `.claude/hooks/protect-paths.test.ts` is that opinion: thirty paths in one table, each with the outcome it must produce and a sentence saying why it is in the table, plus six assertions on the guard's contract with the harness. It replaces a QA script that lived in a scratch folder and would not have survived the session, which is the same fate every previous verification of this file met.

**It is a black-box test on purpose.** It spawns the hook as a real child process and pipes it the same JSON shape Claude Code sends, then reads the exit code and stderr. Testing the regular expressions directly would have been faster and would have passed while the thing that actually matters was broken, because the guard's promise is not "this pattern matches"; it is "exit 2, with an explanation the agent can act on." That promise is now asserted, including that a path blocked only after normalizing says which real file it landed on, since an unexplained refusal of a path that does not look protected is its own small failure.

**Both directions are in the table, which is the part most likely to be trimmed later.** Twenty paths that must be refused and ten that must stay editable. A guard that only over-blocks is not correct either: it would make `schema.prisma` uneditable and quietly stop the model from evolving, which would be a worse day than the one this hook exists to prevent. Anyone shortening this table should take rows off both halves or neither.

**A one-line change to `tsconfig.json`, and it is load-bearing rather than tidy-up.** TypeScript's wildcard include skips folders whose names start with a dot, so a test living in `.claude/hooks/` ran under Vitest but was never type-checked, which was confirmed by listing the files the compiler actually collects rather than assumed. That mattered more here than it usually would: a row in the table missing its `blocked` field reads as `undefined`, which the assertion treats as "must allow," so a path that must be refused would have sat in the table passing and proving nothing. That failure was reproduced deliberately before the fix, by deleting the field and watching the suite stay green, and then watching the compiler catch it once `.claude/**/*.ts` was added to the include list. The alternative was moving the test away from the hook it tests, which was rejected: the thing most likely to rot is somebody editing the hook and never noticing it has a test.

**Declined, not deferred: adding `Bash` to the PreToolUse matcher.** The matcher is `Edit|Write|MultiEdit`, so a shell redirect, `sed -i`, `cp`, or `tee` still skips both guards. Closing that would mean the hook parsing arbitrary shell to work out which file a command is about to write, and a guard that parses shell badly is worse than an honest gap, because it reads as protection that is not there and invites the exact confidence it cannot support. The owner's call, made rather than postponed, so this does not come back as an open question a third time. What the guard covers is the agent's file-editing tools, not the filesystem, and that sentence is now in the template README too.

**Verification.** Suite before the branch: 517 tests, 38 files, nothing failing, matching the number standing in this log since the recognition slice. After: 553 tests, 39 files, nothing failing. The thirty-six new tests were all written before the code that makes them pass, in three rounds, and each round was watched failing before its fix. **Measured against `main` rather than against this branch's own intermediate states, eleven of the thirty-six fail:** six migration path shapes that were waved through, three folded spellings, one path that wrote the schema and was wrongly refused, and the assertion that a refusal names the real file when the path it was given hides it. The twelfth, the malformed-input case, is worth separating out rather than folding into that count, because it is the one test that passes on `main`: the fault it pins was introduced by this branch and caught inside it, so it was watched failing against the intermediate version and never against the shipped guard it replaces. Stating it the other way round would have been a quiet overcount. `tsc` clean. The repo hook and the `~/.claude` template copy hash identically, as do the two copies of the test, which now ships with the hook so the next project starts from the tested version rather than re-deriving it.

**Postscript, same day: the QA script went into the repo, because the scratch-folder version evaporated before the owner could run it.** This entry says above that the test replaces "a QA script that lived in a scratch folder and would not have survived the session." The handoff for this very PR then pointed at a scratch folder, and macOS cleaned `/private/tmp` about an hour later, so the first thing the owner saw was `No such file or directory`. It now lives at `scripts/qa-protect-paths.sh`, committed. Two things make it worth keeping rather than regenerating each time: it pulls the pre-fix hook from a **pinned commit** rather than from `main`, so the before-and-after column keeps meaning the same thing after the merge, and that column is the one check the test suite structurally cannot make. The suite proves the guard is correct today; only this proves the behavior changed, which is the difference between evidence and decoration. **The general lesson, which is not about this hook at all: a verification artifact handed to a human belongs wherever the work belongs, and a path under `/tmp` is a promise with an expiry date nobody wrote down.**

**Debt this opens, small and named.** The test spawns a Node process per row, which is about a second of suite time for thirty rows; cheap now, and the thing to watch if the table grows by an order of magnitude. The `run-tests-unless-docs.mjs` hook still has no test of its own, which is the same absence, one file over. And the guard is lexical: it reads the path as text and never touches the disk, so it does not follow symlinks. A symlink pointing at `prisma/migrations` would still get through, and that is a genuine remaining hole rather than a theoretical one, left open because closing it means a guard that hits the filesystem on every edit, which is a different kind of thing from the one this file has been.

**Postscript, 3 August 2026, on the owner's merge of PR #45: two of the three items above are settled, so neither returns as an open question.**

- **The symlink gap is declined, not deferred.** These guards exist to stop accidents, and a symlink into `prisma/migrations` takes intent. Nothing in normal use makes one, and an agent that would build one to get at a protected file is not the thing a path check defends against. Closing it would mean a guard that stats the filesystem on every edit, which is a different animal for no gain. Do not re-raise it.
- **The test for `run-tests-unless-docs.mjs` is queued, and is cheap next time that file is touched.** Not its own errand: the pattern already exists in `protect-paths.test.ts`, so whoever next opens that hook for any reason should add it in the same pass. Doing it as a standalone task costs more than it is worth; doing it alongside a change to the file costs almost nothing.

This closes the tooling thread that PRs #42, #43, #44 and #45 ran through. Next work is product.

### The gauge endgame: one bump, a clean close, and a goodbye (4 August 2026)

**What it is.** Until today a gauge was born, collected taps, and then quietly stopped mattering at the turn of its day, and nobody was told. This slice gives a floated idea a complete life: one well-timed second chance the evening before its day, a clean close while the plan can still be acted on, and a goodbye to the people who had already said yes. It builds the "one bump, then let it die" guardrail that has sat in CLAUDE.md since before there was any code, and it closes the last piece of spark that existed as written product intent and nowhere else.

**It is also the first slice built under the owner's chattier posture, stated the same morning:** err toward Orbit being a little chatty and helpful rather than silent and missing a moment that mattered. That posture is a direction marker, not an amendment to the anti-clutter north star, and it is doing real work here, because bumping a gauge that nobody answered at all is exactly the kind of message the old default would have talked itself out of. Every new place this slice lets Orbit speak has its own row in the register above ("Where Orbit decides to speak or stay quiet"), since the 29 July bug was two copies of one rule quietly disagreeing.

**Two settled decisions were amended, and both moved the same direction: an idea should stop being ambiguous while the plan can still be acted on.** Spark part one settled that a gauge stays live until the end of its proposed local day. It now closes two hours before the proposed start, after which the chips stop working and a late third yes creates nothing. The owner's reasoning: a half-committed plan must not limp into its own final hour, leaving two people at 6:45 wondering whether beers is a thing. The second amendment narrows "below-threshold ideas scroll away with no residue" to zero-yes ideas only. The confusion a closing note prevents belongs entirely to people who committed to something; a gauge nobody answered has nobody to un-confuse, so it still dies in complete silence exactly as before. Both amendments are already in CLAUDE.md's carried-forward settled list with their dates, because a rules file that still states the superseded version works against the very slice that superseded it.

**Where the bump fires, and the two guards that make it earn its place.** Around 8pm group-local on the evening before the proposed day. Evening rather than morning-of, at the owner's direction: evenings are when somebody can actually check with the person they share a life with, and it still leaves the whole next day for stragglers. Both flavours of below-bar gauge get it, the near-miss and the one nobody answered, and the copy differs by situation because the two situations are not the same conversation: "Last call on beers tomorrow: Maya & Jesse are in, one more makes it happen" for the near-miss, "In case this got buried: anyone in for mini golf tomorrow?" for the ignored one. Both are composed from stored facts, no model call, in Orbit's ordinary voice. The bump is a fresh Orbit message at the bottom of the feed carrying the same three chips and the same live tally, so it can be answered where it lands rather than by scrolling back to find the original. Two guards keep it from being noise: no bump for a gauge created earlier that same day, because the group has not had time to miss it yet, and no bump when the gauge's own message is still the newest thing in the feed, because repeating yourself into an empty room is clutter rather than help. One bump per gauge, ever, enforced rather than left to the night-before timing that already makes it nearly impossible.

**Closing, and who hears about it.** A gauge that collected at least one yes gets a single chip-less note, soft and final, inviting no reply: "Breakfast didn't come together this time. Maybe next week." A gauge with none gets nothing at all, and nothing is written to remember it by either, since the sweep's own date window ages the gauge out of every future run on its own. Reviving a closed idea needs no new machinery: somebody floats it again and the existing spark path answers, which is why nothing in this slice is about revival.

**A gauge born inside the two-hour window still opens, chips and all, and says so out loud.** It has no eve to be bumped on, it closes at the proposed start itself rather than two hours before, and its message carries one extra deterministic line naming the clock: "Heads up, this one's for today at 1pm, so get your yes in quick." The owner chose this over the simpler move of extending the stay-quiet guard to cover it, on the grounds that a spontaneous same-evening rally is the most alive moment this product serves. The line is generic rather than activity-matched, because activity-specific wit would mean model-written copy on every one of these messages, which is a new cost and a new failure surface; declined outright on the same grounds as the activity-matched emoji in spark part one, not queued.

**Zero new model calls, and Orbit's wake-up went from daily to hourly.** Bumps, closes and every new sentence are deterministic and driven by Orbit's clock, so this slice adds nothing to per-message spend. What it does add is a wider timing surface: the same cron route now runs the endgame sweep alongside the existing recurring-event reconcile, once an hour instead of once a day. Hour-level precision is accepted knowingly for a social nudge, so "around 8pm" and "about two hours before" land within the hour rather than on the minute. The cadence change is a deploy-time obligation and is item 6 of the pre-deploy checklist above, with the caveat that matters: Vercel's Hobby tier caps cron at daily, so the first deploy either upgrades the plan or keeps `vercel.json` on daily and points an external scheduler, carrying the `CRON_SECRET` bearer header, at the same route hourly.

**How this one was built, since the shape is now the house default rather than an experiment.** The spec and the implementation plan were written in a single session and committed to the slice branch before any code, so they travelled with the work and reach GitHub inside this PR. Execution was subagent-driven: a fresh implementer per task with no memory of the previous one, an independent read-only reviewer after each task treating the implementer's report as unverified claims, and a ledger on disk so the controller could see the whole run. Eight tasks, three of which needed a fix round. Then one whole-branch review by a reviewer that had written none of it, which returned ready-with-fixes, no Critical findings, six must-fix items; all six landed and passed a scoped re-review.

**Two review catches are worth remembering, because both were invisible from the product side and neither would have failed a test written by the person who wrote the code.** The first: idempotency was originally implemented by re-reading the "already bumped" marker inside the transaction and branching on it. That reads exactly like a race guard and is not one. Under READ COMMITTED, two overlapping sweeps can both read the marker as null, both create their own message, and both plain updates then succeed, because neither update's WHERE clause depends on the marker; the unique constraint never fires either, since the two racers are writing two different message ids. The fix is to create the message first and attach it with a conditional `updateMany` whose WHERE clause requires the marker still be null, throwing to roll the loser's orphaned message back out: the loser blocks on the winner's row lock, re-evaluates the condition against the winner's committed write, matches zero rows, and vanishes. Both write paths use it and both are pinned by deterministic concurrent tests. The second: the reviewer noticed that a gauge can sit at three member yeses with no event, which is what a promotion that commits its votes and then rolls back the event creation leaves behind, and that the bump copy renders broken text at three or more names. A gauge in that state has a missed promotion, not a missing bump, so it gets its own skip reason (`already_at_bar`) rather than silently reusing a neighbouring guard, and the check sits ahead of composing the body rather than after. That guard was born in review; nothing in the plan asked for it, and the register row describing it was added afterwards for the same reason.

**The plan contradicted itself, and the implementer disclosed it instead of quietly picking a side.** One task brief carried both a candidate query that filtered promoted and already-closed gauges out at the database level and a required list of skip reasons including exactly those two, which that query would have made unreachable. Widening the query and deciding gauge by gauge in application code was authorized as the resolution, and the reasoning now sits in the sweep file's own header so the next reader does not "optimize" the filter back in and silently delete two real outcomes.

**One tooling blocker, written down so the next schema slice does not rediscover it.** `prisma migrate dev` refuses to run without a TTY, and wrapping it in `script` allocates a TTY but cannot answer the prompt it then receives, so the first task stalled on what turned out to be a benign unique-constraint confirmation. The working approach is `expect`: spawn the migrate command, wait for the `(y/N)` prompt, send `y`. Before driving it, the controller verified that nothing had drifted and that no `db push` had been applied, since a stalled migration is exactly the moment somebody reaches for the shortcut that ruins a database. The migration is `20260804145211_gauge_endgame_markers`, two nullable message pointers in the established idempotency-marker pattern.

**Verification.** Baseline recorded on the branch before any code: 553 tests across 39 files, green, matching the finishing number the hook slice left in this log, with no pre-existing failure to carry. After: 576 tests across 40 files, green. Every new test was written first and watched failing before the code that makes it pass. `tsc` reports nothing in repo source (its only output is generated `.next/dev/types` noise from a running dev server), and lint holds where it has held for several slices, at the one pre-existing `OnboardingWizard.tsx` error this branch never touched, plus warnings.

**The walkthrough, stated as staged versus lived, because most of these moments cannot wait for a real evening to arrive.** Staged, in a real browser against dev-test, by running the real sweep code against a controlled clock on a scoped group: the near-miss bump rendered its last-call copy with chips and a live tally under **both** the original gauge message and the bump itself, which is the dual-surface behavior the owner approved knowingly; the ignored-idea bump rendered its gentler surfacing with chips; a breakfast gauge with one yes closed with the chip-less goodbye; a yoga gauge with zero yeses closed in total silence, no note and no residue; and both closed gauges' messages render afterwards as plain history with no chips at all. Every sweep result matched the prediction written before it ran, including the correct re-skips on a second sweep. Lived, with nothing staged: the third yes was tapped on the **bump's** own chip, and it created the event in that same tap, pinning "Beers · Wed, Aug 5 · 7pm · 3 In · 1 TBD" up top with the tapper's RSVP already checked and Maya and Jesse seeded IN with no second ask, Orbit announcing "Three of you are in, so beers is on for Wed at 7pm. It's up top now."; the gauge closed on both surfaces at once, chips and tally disappearing from the original and the bump together. Also lived: "anyone up for darts Tuesday at 1pm?" typed into the chat at 11:49am went through the real model detection and produced a gauge message ending "Heads up, this one's for today at 1pm, so get your yes in quick," with the initiator seeded IN because they named the day and their chip pre-checked. What that leaves unproven by a lived run rather than a staged one: the bump firing on a genuinely real 8pm, and a close arriving on a genuinely real clock. Both ran through the same code path with the clock passed in, which is the whole reason the clock is a parameter.

**The QA group is deliberately left in dev-test as the PR's evidence.** "Westside Climbers", four members: Priya the founder, Maya, Jesse, and Sam who joined through the real invite flow rather than being seeded. It holds one created Beers event, one live darts gauge that closes at 1pm, one live mini golf gauge, two closed gauges (breakfast with its note, yoga with nothing), and one bump each on beers and mini golf. The staging script that produces it is committed at `scripts/qa-stage-endgame.ts` and run with `npx tsx --env-file=.env scripts/qa-stage-endgame.ts`. It creates a fresh group each run, sits deliberately outside the test suite (the same precedent as `scripts/eval-detect.ts`, and it is not named `*.test.ts`, which is what keeps Vitest from collecting it), and it writes to whichever database `.env` points at, so `npm run db:which` comes first every time. It is committed rather than left in a scratch folder for the reason the hook thread learned the expensive way: a verification artifact handed to a human belongs where the work lives, and a path under `/tmp` is a promise with an expiry date nobody wrote down.

**One open question for the owner, flagged rather than decided.** Decision 9 says the closure note is posted when at least one person had said yes. It is implemented as at least one **current-member** yes, matching the member-filtered convention the threshold count and the roster already use, so a yes from somebody who has since left the group does not by itself earn the group a goodbye. That is the consistent reading and it is what shipped, but nobody actually made that call as a product decision, and if the owner wants any yes to count it is a one-line change.

**Debt this slice opens or carries forward.**

- **Two more undated numbers.** 8pm for the bump and two hours for the close join Fri, Sat, 7pm and 9am in the placeholder family, and they were deliberately put in the same module so a future override-learning slice replaces all of them as one decision rather than six. Medium visibility: unlike the fallback times, a badly timed bump is a message the whole group sees.
- **The dual answer surface while a bump is live.** The original gauge's chips and the bump's chips both stay live and both write to the same tally, so they cannot disagree in data; it is simply slightly unusual to look at. Accepted knowingly by the owner, and the walkthrough did not find it confusing. Revisit only if real QA does.
- **Hourly cron widens the timing surface the product depends on.** More runs, same failure modes, and the tier caveat above is now a deploy blocker rather than a note.
- **The cron report undercounts its own failures, and this one was forwarded and then dropped.** A gauge that throws mid-sweep is logged and skipped, and the result union has no failure variant, so the route's JSON reports fewer results than there were candidates with nothing saying why. It was found in the sweep task's review, forwarded to the cron task as a request, and not picked up there; the final review triaged it as carry rather than sending it back. Recorded plainly because "forwarded" reads like "handled" a month later, and it was not.
- **A second test file flaked on Vitest's 5 second default during this slice.** `promote.test.ts` tripped the post-edit hook once and came back 12/12 green in 9.4 seconds on a rerun. That is now two different files hitting the same ceiling against the remote database, which strengthens the already-queued suite-wide `testTimeout` item from a preference into something with a pattern behind it.
- **Small engineering minors, triaged as carry by the final review.** The candidate query hydrates full memberships and users for gauges it is about to discard, and `Gauge.proposedDate` is unindexed, both fine at MVP scale and both worth revisiting the first time the sweep runs unscoped across many groups. The newest-message lookup has no id tiebreak on identical timestamps. And the new tests are all UTC fixtures, so nothing yet pins the eve arithmetic across a timezone or a month boundary, which is the coverage a future timezone-shaped bug would want to have had.

### The wrong-day retry: an idea the day blocked gets asked, then guessed once (4 August 2026)

**What it is.** The endgame gave a floated idea an ending. It gave nothing to the idea people clearly wanted on a day that did not work: beers for Friday with two "I'm in" and one "Yes, can't Fri" closed with the same goodbye as an idea nobody liked, even though three people had said yes to beers and only the day failed. This slice gives that idea a second chance without pretending Orbit knows something it does not. At close, instead of the goodbye, Orbit says the day was the only problem and asks what day would work. Nobody answering earns exactly one deterministic guess the next evening, the same weekday one week out, posted as a real gauge with chips. If that gets nothing either, the idea is dead and Orbit never mentions it again.

**One premise correction, because the older prose in CLAUDE.md would have misled the next reader.** The open question said a no on the chips "says nothing about which day works." Half true, and the half it got wrong is what made this slice possible. The third chip ("Yes, can't Fri") already stores yes-to-the-idea, no-to-the-day, per person, so Orbit already knew *that* the day failed and for how many people. The only missing fact was *which* day would work, and the design gets that by asking the group rather than inventing it.

**The eligibility bar is would-have-cleared, and it is deliberately narrow.** A closed-short gauge earns the retry when its in-votes plus its can't-that-day votes together reach three, current members only, with at least one of them a can't-that-day. The owner chose this over any-can't-day-triggers and over a majority-of-answers variant, on the reasoning that every retry message is one the whole group sees: retries should be rare and near-certain to be about an idea people demonstrably want. "Next time" stays a soft no to the idea and counts toward nothing, so honest exits stay honest. The check runs *before* the endgame's closure outcomes, which is what lets the strongest retry case of all through: zero plain yeses and three can't-that-days is the day blocking everybody, and under the zero-yes rule it would otherwise have died in complete silence.

**Two messages, and whose call each was.** The ask closes and asks in one message rather than posting a goodbye and then a question, the owner's call, on the grounds that a goodbye followed by "so what day works?" is Orbit talking to itself: "Beers didn't happen for Monday, but three of you want it. What day works better?" The guess is the owner's call too, chosen over adjacent-day and over reusing the generic Friday placeholder: the same weekday one week after the failed day is the least presumptuous thing Orbit can say, because it keeps the one preference the group actually expressed (a Friday-shaped plan) and "can't Fri" usually means this Friday, not Fridays. Both are composed from stored facts in Orbit's ordinary voice, and the guess arrives as a real gauge, chips and live tally and all, so it can be answered where it lands.

**The amendment landed on "one bump, then let it die," and it was the slice's first task, before any code.** The amended rule keeps one bump as every gauge's allowance and adds one carve-out: a day-blocked idea that would have cleared the bar additionally gets one ask at its close and one guess the evening after, then dies. **"A gauge whose day has passed is dead" was not amended.** The CLAUDE.md open-question note had predicted this slice would have to bend it; once the ask-then-guess shape was chosen, that prediction was simply wrong, because every revival is a genuinely new gauge and the old one stays closed forever. Recorded because a rules file that still states a superseded version works against the very slice that superseded it, and because a prediction that turned out wrong is worth as much in this log as one that turned out right.

**The loop cap is decided by whose move it was, which is the whole reason this cannot ping-pong.** A member-named revival is an ordinary gauge with full rights, including earning its own retry later if it too fails wrong-day with fresh would-have-cleared votes; each new cycle is bought with fresh votes from real people. Orbit's own guess gauge is the opposite: it carries a marker saying Orbit named this day, and it never earns a second automatic cycle however it dies. No ask on its close, no further guess. Human engagement always resets the clock; Orbit alone never does. In the sweep this is one routing line placed ahead of everything else that can speak, so a guess gauge can only ever reach the ordinary close outcomes.

**Time carries across the retry by copying, not by re-deriving.** The guess gauge is created with the original gauge's stored `proposedTime` copied onto it verbatim, so "beers at 8" is still an 8pm plan when it lands a week later. This is the "stored state is not display; carry it, do not regenerate it" guardrail applied to a new place: the alternative was re-reading the original message's wording a week later and asking the model what time it meant, which is a second chance to get it wrong and a model call the slice does not need.

**Zero new model calls.** The ask and the guess are deterministic, composed from stored facts on Orbit's clock, and they ride the cron sweep that already runs hourly. A member's answer rides the per-message detection the product already pays for. Per-message spend is unchanged by this slice.

**The schema grew two nullable markers, and one existing column relaxed.** `Gauge.retryAskMessageId` and `Gauge.retryGuessOfGaugeId`, both unique, both in the established idempotency-marker pattern the endgame set: the unique constraint is the whole one-ask-and-one-guess story, enforced by the database rather than by caller discipline. `Gauge.sourceMessageId` became nullable, because a guess gauge has no member message behind it; Orbit named the day, and nobody else did. Migration `20260804190626_wrong_day_retry_markers`, on the pre-deploy checklist as item 7.

**Verification.** Baseline recorded on the branch before any code: 576 tests across 40 files, green, matching the finishing number the endgame slice left in this log, with no pre-existing failure to carry. After: 605 tests across 40 files, green, in 52 seconds. Every new test was written first and watched failing before the code that makes it pass, with one disclosed exception: one task's failing-run evidence was reconstructed after the fact rather than captured live, which the implementer disclosed in its own report and the reviewer independently reproduced against that task's commit. `tsc` reports nothing in repo source, and lint holds where it has held for several slices, at the one pre-existing `OnboardingWizard.tsx` error this branch never touched, plus warnings. Mid-slice the branch merged origin/main, which brought in the suite-wide 30 second `testTimeout` that the endgame slice had queued as debt; the flake ceiling those two files kept hitting is now gone from this branch.

**The bench found the one thing in this slice that cannot be trusted yet, which is exactly what it was built for.** Four new `eval:detect` cases cover the conversational seam a member's answer has to cross: a bare "Saturday?" and a "saturday works for me" following Orbit's ask in context (both must be heard as a fresh Saturday idea), an ambiguous "next week?" (names no single day, watched for drift, no bar), and a look-alike Orbit must not answer at all ("saturday was fun"). Twenty-six cases at five runs each. The two must-recognize cases scored **0 out of 5 and 0 out of 5**. On the bare day name, four runs of five read it as a request to change an existing plan and answered "I can't move it to another day yet"; the fifth said nothing. On "saturday works for me", all five said nothing. The look-alike held clean at 5 out of 5, and nothing regressed: the full scoreboard reads must-recognize 50/60 runs and 10/12 cases, must-stay-quiet 50/50 runs and 10/10 cases, ambiguous 5/20 runs and 1/4 cases, and every one of the ten must-recognize failures is the two new cases. Per the task's own stop condition, no prompt file was touched: prompt and recognition work is explicitly out of this slice's scope (spec decision 12 funds bench coverage only), and tuning a prompt at the end of a slice with no room left to verify it is how the 29 July bug got made.

**What that failure means for the product, stated plainly rather than buried in a bench table.** The ask-then-guess machinery is deterministic and proven: the ask fires, the guess fires, the guess is a working gauge that promotes into a real event. The *conversational answer path* is not. A member who replies to Orbit's "what day works better?" with a bare day name will, today, more often get either a wrong answer about changing a plan or nothing at all. What keeps the feature coherent anyway is the guess: an answer that *is* recognized rides the ordinary spark path and opens a new gauge, and an answer that is not still gets the deterministic guess the next evening, so the idea does not die of Orbit's deafness. That is a real degradation and not a hypothetical one, and closing it is now a named candidate for the next slice.

**The walkthrough, stated as staged versus lived.** **Staged**, by running the real sweep code against controlled clocks on one scoped group in dev-test: three gauges on yesterday's local day, swept once just after their close time (beers and breakfast qualified and got the ask; yoga, one yes and one can't-that-day, sat below the bar and got the ordinary goodbye, two messages away in the same feed), and swept again at 8:30pm group-local tonight, which is the evening after the failed day (beers guessed; breakfast reported `answered` and posted nothing, because a member had named a day and opened a fresh same-activity gauge; yoga reported `already_closed_out`). Also staged: the member's answer itself, written directly into the feed with its revival gauge rather than sent through model detection, precisely because the bench above says the model would not have heard it. Every sweep result matched the prediction written before it ran. **Lived**, with nothing staged: three people joined the group through the real invite flow in three separate browser sessions and tapped the guess gauge's chips one after another, watching the tally go from no line at all (a guess gauge seeds nobody, because Orbit named the day and Orbit is never a vote) to "Rowan is in so far" to "Rowan & Devon are in so far · one more makes it happen"; the third tap created the event in that same tap, pinning "Beers · Mon, Aug 10 · 7pm · 3 In · 4 TBD" up top with the tapper's RSVP already checked, all three gauge yeses carried through as RSVPs with no second ask, Orbit announcing "Three of you are in, so beers is on for Mon, Aug 10 at 7pm. It's up top now.", and the guess gauge's chips and tally disappearing together. Mon Aug 10 is the same weekday one week after the failed Mon Aug 3, and 7pm is the original beers gauge's stored time copied through the guess: the time-carry decision, proven on a real screen rather than in a test fixture. What remains unproven by a lived run rather than a staged one: an ask arriving on a genuinely real close time and a guess arriving on a genuinely real 8pm. Both ran through the same code path with the clock passed in, which is the whole reason the clock is a parameter. Postscript (4 Aug 2026, final-review fix wave): a guess gauge dying with no second cycle, no further ask and no further guess however it closes, was proven by tests only and never walked on a screen.

**The QA group is deliberately left in dev-test as the PR's evidence.** "Riverside Runners", America/Chicago, four seeded members plus the three who joined live. The staging script is committed at `scripts/qa-stage-retry.ts`, run with `npx tsx --env-file=.env scripts/qa-stage-retry.ts`, on the same terms as `scripts/qa-stage-endgame.ts`: a fresh group each run, deliberately outside the test suite, not named `*.test.ts`, and writing to whichever database `.env` points at, so `npm run db:which` comes first every time. It carries a second mode (`--arm-guess <gaugeId>`) that adds two seeded-member yeses to a guess gauge, for anyone who would rather not open three browser sessions to reach the third tap.

**One tooling note that cost twenty minutes and will cost the next session the same.** A stale `.next` directory left by an earlier run made every route in the app return 404, including the front door, with the layout and fonts rendering perfectly around a not-found body. Nothing in the log said why. `rm -rf .next` and a restart fixed it completely. It is not a product finding and nothing in the codebase is wrong; it is written here only because it looks exactly like a broken build for the first several minutes.

**Debt this slice opens or carries forward.**

- ~~**The answer seam is unreliable, and it is the most product-visible debt this slice creates.** Recommendation: fix next, as its own slice. It is the difference between "Orbit asked me a question and I answered it" and "Orbit asked me a question and ignored me," and the never-silent rule the product amended on 28 July exists to prevent exactly that feeling. The bench cases are already written and already failing, so the work has a red test to go green against on day one.~~ (resolved 5 Aug 2026 by the answer-seam slice, below: the two must-recognize cases went 0/5 and 0/5 to 5/5 and 5/5. It is now debt of a different shape, "recognition is a rate, not a guarantee," recorded in that entry.)
- **The guess fires inside a window about four hours wide.** The guess moment is local 20:00 through 23:59 on the evening after the failed day; miss it and the gauge ages out of the sweep's own two-day candidate window, so Orbit's question is followed by permanent silence and no second attempt. Accepted knowingly and recorded here rather than left in a code comment, because it is a product-visible outcome: a cron outage across one evening turns a promise into a dropped thread. Recommendation: queue. The cheap version is widening the guess window rather than adding retry machinery.
- **Two more undated placeholders** join the family awaiting override-learning: same-weekday-next-week, and the roughly-one-day ask-to-guess gap anchored at 8pm. Both live in the same module as Fri, Sat, 7pm, 9am, 8pm and the two-hour close, so the successor slice still replaces the whole family as one decision. Medium visibility: both are group-visible messages when wrong.
- **The activity-exact "answered" test is literal-minded.** A group that pivots to a different activity still gets the original guess the next evening, because the people who voted voted for *this* activity. Accepted knowingly, with its own register row, and worth revisiting the first time real QA reads it as pushy.
- **A closed guess gauge re-enters the close handler on each sweep** until it ages out of the candidate window. The insert is rolled back by the same conditional-update guard the endgame proved, so there is no committed effect and nothing a member could see; it only makes the cron report's reasons slightly less tidy. Found in review, triaged as carry.
- ~~**The answered-check can in principle match Orbit's own guess gauge**, since the query filters by activity and creation time and not by whether the candidate is itself a guess. In the shipped ordering nothing reaches that state, and the one-line fix (excluding guess gauges from the answered query) is written down here rather than applied at the end of a slice. Carried.~~ (fixed 4 Aug 2026, final-review fix wave: guess gauges excluded from the answered check)
- **The answered check's case-insensitive activity match was confirmed to compile to Postgres ILIKE, unescaped (4 Aug 2026, final-review fix wave).** Verified with a stub Prisma driver adapter capturing the literal query text: Prisma 7's `equals` with `mode: "insensitive"` produces `"activity" ILIKE $3`, and the parameter carrying the activity string passes through with its own `%` and `_` characters unescaped. Failure mode: an activity string containing a literal `%` or `_` broadens the answered match to also catch other activities that share the surrounding text, which fails toward a suppressed guess (a false "someone already answered") and never toward a wrong message reaching the group. Recommendation: queue, since the failure direction is silent-safe rather than silent-wrong. Fix options for whichever slice picks it up: escape `%`, `_`, and `\` before the query, or fetch the group's recent gauges and compare activities in JS instead of leaning on the database's case-insensitive equals.
- **The cron report's failure undercount, carried from the endgame, now covers four more outcomes.** The sweep grew new result kinds and the result union still has no failure variant. Unchanged here; recorded so "carried" stays visible rather than quietly becoming "handled."
- **Chat is still the only surface all of this lands on.** Six worst-case Orbit messages across roughly ten days for one idea (gauge, eve bump, close-ask, guess gauge, its eve bump, its goodbye), each one conditional on the group leaving the previous one hanging. That is the chattiest one idea has ever been, accepted knowingly as the chattier posture doing what the owner asked of it, and it makes the queued pending-events surface a stronger candidate than it was a day ago.

### The answer seam: Orbit hears the reply to its own question (5 August 2026)

**What it is.** The wrong-day retry taught Orbit to ask "what day works better?" and then proved, on its own bench, that Orbit could not hear the answer. A member replying "Saturday?" got either a wrong answer about moving some existing plan or nothing at all, in every run. Orbit asking a question and then ignoring the reply is the single worst thing an assistant can do right after speaking, and it is exactly what the never-silent amendment of 28 July exists to prevent. This slice closes that. A day reply to Orbit's open question now opens a fresh gauge for the same activity, on the day the member named, at the hour the group already agreed on, with the person who named the day counted in. Spec: `docs/superpowers/specs/2026-08-05-answer-seam-design.md`.

**Why it failed, and why the fix makes Orbit more deterministic rather than less.** Two self-inflicted rules were doing their jobs in the wrong place. The recognizer knew exactly two actionable kinds of message, a fresh idea and a change request, and "Saturday?" could not be a fresh idea because the recognizer is rightly forbidden from inventing an activity nobody named. Separately it had been taught that a named weekday usually means "move a plan to that day," so the change reading won even against an empty calendar. Nothing had ever told it that Orbit itself might have a question open. The fix hands the model exactly one new judgement ("this reply answers Orbit's open question, and the day named is Saturday") and takes everything else away from it: the activity, the time, and the fact that a question is open at all are read from stored rows by deterministic code. The model's contribution got smaller, not larger.

**The settled decisions, by number, all in the spec and none relitigated here.** A third intent class alongside spark and change (1). "An ask is open" derived from existing state with no new fields and no migration (2). The model's answer claim trusted only inside that window, and discarded outright outside it (3). Inside the window the answer reading beats the change reading (4). The new gauge inherits the failed idea's stored time, and a stated time wins (5). An answer naming no single day gets the same-weekday-next-week date the guess already uses, seeding nobody (6). Everything else is the ordinary spark path (7). Guess suppression comes free, because the answer gauge is precisely what the existing "was it answered?" check already looks for (8). Zero new model calls, so no spending-ceiling implication (9).

**Decision 5 amended a rule the previous slice had settled, and that edit was this slice's first task.** The wrong-day retry had said a member's answer "rides the existing spark path, unchanged." That is no longer true, and it was quietly wrong: the ordinary fresh-idea path would have re-derived a generic default time from a message that names no time at all, so "beers at 8" would have come back as a 7pm Saturday. The time now carries by copying the failed gauge's stored `proposedTime`, exactly the way the guess already carried it, so both revival paths follow one rule. Per the standing rules-file rule, CLAUDE.md's settled list was amended before any code was written, because a rules file that still states the superseded version works against the very slice that superseded it.

**The window is the interesting part of the design, and it belongs to code rather than to the model.** The failed gauge already carries a pointer to the ask message, so "Orbit has an unanswered day question open in this group" is derivable from rows that already exist. It opens when the ask posts and closes the moment any same-activity gauge appears, whether that gauge came from a member answering or from Orbit's own next-evening guess, which is the same answered-test the guess suppression already uses. That is what keeps the two mechanisms from ever disagreeing about whether the question was answered, and it means the window shuts itself within about a day without anyone scheduling anything. A 48-hour cap sits behind it purely so a long cron outage cannot leave a question hanging open forever. The model is told a question is open only when that check has already passed, and an answer claim arriving with no open ask is thrown away regardless of what the model said.

**The bench, before and after.** Before, on the branch with no recognition work done, the four retry-answer cases at five runs each: must-recognize 0/10 runs and 0/2 cases, must-stay-quiet 5/5 and 1/1, ambiguous 0/5 and 0/1. Case by case, `retry-answer-bare-day` 0/5, `retry-answer-day-works` 0/5, `retry-answer-next-week` 0/5, and the look-alike `retry-answer-nostalgia` clean at 5/5. That matches the wrong-day-retry slice's recorded numbers exactly, which is the point of re-running it: the red was confirmed live, not inherited from a file. After: must-recognize 10/10 and 2/2, must-stay-quiet 5/5 and 1/1, ambiguous 5/5 and 1/1, with all four cases at 5/5 individually. The full 26-case bench after the change reads must-recognize 60/60 runs and 12/12 cases, must-stay-quiet 50/50 and 10/10, ambiguous 10/20 and 2/4, against the 4 August recorded full scoreboard of 50/60 and 10/12, 50/50 and 10/10, and 5/20 and 1/4. Nothing that was passing regressed, the messages Orbit must not answer held at 50/50, and the whole must-recognize gain is the two new answer cases. The bench stays outside the test suite, as always, because it costs money and hits the network.

**Zero prompt iterations, which is worth recording because it was not the expected outcome.** The plan budgeted for tuning rounds against the bench. None were needed: the open-question context line plus the new class scored 5/5 on the first filtered run, and `INTENT_SYSTEM_PROMPT` needed no further language. The reading is that the failure was never the model being unable to make this judgement; it was the model never being told the judgement existed.

**Verification.** Baseline recorded on the branch before any code: 605 tests across 40 files, green, matching the finishing number the wrong-day-retry slice left in this log, with no pre-existing failure to carry. After: 638 tests across 41 files, green. `tsc --noEmit` reports nothing. Every new test was written first and watched failing before the code that makes it pass.

**No deploy-time obligation.** No migration, no new environment variable, no new scheduled job. The pre-deploy checklist is unchanged by this slice, which is stated here so a future reader does not go looking for the item that was never added.

**The walkthrough, stated as staged versus lived.** **Staged**, in dev-test through the real code: a group in America/Chicago with four seeded members and one beers gauge on yesterday's local day at 8pm, holding two yeses and one can't-that-day, then the real endgame sweep run against a clock five minutes after that gauge's close time. The sweep is what wrote the ask and attached it; nothing about the ask was hand-composed. The feed ended on "Beers didn't happen for Tuesday, but three of you want it. What day works better?". **Lived**, with nothing staged: a fifth person joined through the real invite link and typed into the real chat box. "saturday was fun" got nothing back, and the server log confirms detection ran its full model call and chose silence rather than skipping. "Saturday?" got "Love it. Anyone in for beers this Saturday? If three of you are in, I'll set it up.", with the three chips under it and "Jacob is in so far" as the tally, so the namer's seed landed without a second tap. Read back out of the database: beers, Sat Aug 8, 20:00 carried from the failed Tuesday gauge, seeded Jacob. Both the day and the hour are the things the slice claimed, proven on a screen rather than in a fixture. What is **not** proven by a lived run: the no-single-day path ("next week?" falling to the same-weekday-next-week date with nobody seeded), which is covered by tests and by the bench's ambiguous case but was not walked; and guess suppression, which is unchanged machinery already walked by the wrong-day-retry slice.

**The QA group is left in dev-test as the PR's evidence.** "Cedar Hill Climbers", America/Chicago, four seeded members plus the one who joined live. The staging script is committed at `scripts/qa-stage-answer.ts`, run with `npx tsx --env-file=.env scripts/qa-stage-answer.ts`, on the same terms as `scripts/qa-stage-retry.ts` and `scripts/qa-stage-endgame.ts`: a fresh group each run, deliberately outside the test suite, not named `*.test.ts`, and writing to whichever database `.env` points at, so `npm run db:which` comes first every time. It carries a `--verify <groupId>` mode that prints the newest gauge in one plain-English line (activity, day, time, whether that time was carried or stated, and who is seeded), so the walkthrough's claim is read out of the rows rather than eyeballed off a card. The guess is deliberately never staged by this script: a guess would close the ask's window the instant it posted, which would remove the very thing the walkthrough is there to test.

**Debt this slice opens or carries forward.**

- **Recognition is a rate, not a guarantee.** The bench proves a rate over N runs, never certainty, and 5/5 today is not 5/5 forever. The deterministic next-evening guess remains the net under every conversational miss, which is what keeps the feature coherent on a bad run. Recorded as the standing shape of every model-dependent seam rather than as a fault of this one. Recommendation: decline as a thing to fix; carry as a thing to remember.
- **The open-question context slot is fed by one ask type, by hand.** A future slice that adds a new kind of Orbit question has to remember to feed that slot, or its answers die exactly the way this slice's did. The register row above is the tripwire. This is the accepted cost of choosing no framework, which was the right call on one example; worth naming because the failure would be silent. Recommendation: queue nothing, revisit at the second ask type.
- **The precedence rule is one more speak-or-stay-quiet decision,** live only inside the ask's roughly one-day window. Wrong precedence would read as Orbit hijacking a plan-edit request into a revival. The must-stay-quiet bench cases bound that risk and cannot eliminate it. Its register row is what keeps it visible. Recommendation: carry, watched.
- **The queued second-member seam got more visible.** Recognizing the first answer makes the unrecognized second one stand out more than when both died equally: "Sunday better" after Saturday's gauge has opened is still nothing to Orbit, and today that person's only path is the chips and the can't-that-day vote. Queued at the owner's direction as its own slice, "day comment on a live gauge." Recommendation: queue; the pressure will come from real groups quickly.
- **The browser input tooling was unusable this session, and the walkthrough routed around it.** The harness's synthetic click and keystroke actions timed out against a hidden browser pane, so the join button and the chat send were driven by clicking the same real DOM elements through the page's own console instead. Every server action, model call, and database write in the walkthrough is genuinely the product's; what was substituted is the mouse. Recorded so a future session recognizes the symptom in one minute instead of twenty, and so the evidence above is not read as stronger than it is. Recommendation: decline, it is tooling rather than product.

Postscript, same day (5 Aug 2026): three things from the final branch review, kept here so the numbers and the spec above stay honest without anyone having to reconstruct them later. First, the two ambiguous-bucket cases still failing after this slice, `might-be-late-implies-move` and `group-grumble`, are pre-existing misses from before this slice and have nothing to do with the answer seam; naming them here means a future reader of "10/20" does not have to go dig through the bench file to learn which two cases those are or why they were never this slice's to fix. Second, two places where the spec's text and the shipped build deliberately part ways, recorded so the spec stays the honest record of intent rather than getting quietly edited to match what shipped after the fact: the spec's verification section expected `retry-answer-next-week` to grade as a spark case with no single day, and it ships graded as an answer with no single day instead, the better fit once the answer class existed to receive it; and the spec described the open-ask window as "the same answered-test the guess uses," while the shipped window is deliberately slightly wider, because Orbit's own guess gauge also has to be able to close it, with the reason spelled out in `src/lib/gauges/open-ask.ts`'s own module header rather than only here. Neither divergence changes what a member experiences. Third, the case-insensitive activity-match debt recorded above against `src/lib/orbit/endgame.ts` (an activity string containing a literal `%` or `_` can over-match through unescaped Postgres ILIKE) has a third home: `src/lib/gauges/open-ask.ts` builds its own answered check the same way, with the same `equals`/`mode: "insensitive"` shape. The failure direction there is the safe one, same as the others: an over-match reads the ask's window as already closed, so Orbit stays quiet rather than saying something wrong.

### Pending surface: slice start (10 August 2026)

Baseline before any code on `feat/pending-surface`: `npm test` → 41 files, 638 tests, all passing, zero skipped. No pre-existing failures to carry. This matches the answer-seam entry's finishing number exactly (41 files, 638 tests, all passing). Spec and design handoff are already on the branch (docs only). The slice makes no model calls, so the recognition bench is untouched; its numbers are not this slice's numbers.

### Pending surface: answer what's waiting without scrolling (10 August 2026)

**What it is.** One idea can produce six Orbit messages spread across roughly ten days, and until this slice the only place any of them lived was chat, so an unanswered ask that scrolled past was gone. This slice gives pending group decisions a second home: a collapsible strip between the pinned event card and the chat feed. Collapsed, it is one line naming what's waiting. Expanded, it opens a panel over the feed (the feed dims, never resizes) holding two kinds of row, an idea-gauge row and a time-change-proposal row, each with its kind line, its when-or-shift line, a live tally, and the same chips chat already has. Below those, a quieter "You're in on" group holds what the viewer already said yes to, still changeable with a Change affordance. Answering the last waiting item with a decline replaces the panel with a caught-up note, spoken in Orbit's voice through the newly extracted `OrbitBubble` component. When a viewer has nothing unanswered and no standing yes, the strip does not render at all, and the screen is exactly today's screen. Spec: `docs/superpowers/specs/2026-08-10-pending-surface-design.md`.

**Decisions carried from the spec and its postscript, none relitigated here.** The surface answers in place, the same chip, the same server action, the same tally as chat, never a pointer sending the viewer back to scroll. Scope is both chip-votable pending kinds, idea gauges and group time-change proposals; Orbit's open day-question stays out because it answers in prose, not chips, and gets its own row type when it earns one. The view is the tailored middle: unanswered items lead with full chips, a viewer's yeses persist in the quiet group and stay changeable (the fix for someone saying yes Monday and overscheduling by Wednesday), and a decline drops the item from that viewer's view entirely. An idea leaves the surface the instant it promotes to an event, because the card carousel already shows the viewer's RSVP on the created event; "You're in on" only ever holds still-open yeses, never past RSVPs, which is the spec's postscript overriding the design handoff's own state model. The strip sits between the pinned card and the feed and is absent entirely when nothing is pending. This slice makes no change to how often Orbit speaks in chat; the six-message chain is untouched. Nothing new is stored: the strip is a pure read over the same gauge and proposal rows chat already uses, so the strip and the chat chips can never disagree. No venue shows on any row, because no gauge stores one until promotion; showing a would-be venue early would promise something the event might not get. The region's colors and type map onto the repo's existing tokens by role rather than the handoff's literal values, with the handoff's own palette and fonts registered as input to the end-of-build visual-polish pass, alongside everything else still running on placeholder values.

**Three places the shipped build knowingly parted from the design handoff, each already decided by the owner on the day it surfaced (recorded in the spec's 10 Aug postscript).** First, tallies on the panel read the way chat's tallies already read, names and "one more makes it happen," instead of the handoff's counts-only style: one tally voice for the whole product beat matching a handoff that was drafted before the tally grammar it's describing existed. Second, a gauge row's live tally sits below its chips rather than above as the handoff drew it, because the proposal chips being reused already render their tally below, and staying consistent inside one panel outweighed matching the mockup's stacking order. Third, the handoff's 180ms fade on the transition into the caught-up note was skipped rather than reached for new animation machinery just for this one moment; the note simply appears.

**Two findings the review loop caught before merge, worth naming because they show the gates paying for themselves.** The strip's separator dot between its two counts was missing from the first pass and caught by task review before the branch ever reached a browser. The gauge rows' live tally was missing entirely, not just misplaced, and that one was only visible in the browser: the component tests could confirm a tally rendered, but only looking at the actual panel showed a viewer would see chips with no count backing them, which is exactly the failure the describe-back and browser-walkthrough gates exist to catch before a real member does.

**Verification.** Suite baseline before any code: 41 files, 638 tests, all green, zero skipped, matching the prior slice's finishing number. Suite after this slice, run as the last step before this entry: 45 files, 661 tests, all green, zero skipped. All new tests were written failing-first over the pending-set derivation and the new components, per standing rules. No model calls anywhere in this slice, so the recognition bench is untouched and carries no new numbers. No deploy-time obligation: no migration, no new environment variable, nothing added to the pre-deploy checklist.

**The browser walkthrough, staged in two phases because a session cannot be forged.** The staging script joins a real fourth member through the actual invite-link flow in a real browser tab first, then seeds that same member's viewer-side pending state with a `--seed-viewer` pass, because a script can write rows directly but cannot manufacture the session cookie a real visit produces; this two-phase shape is worth keeping as a standing pattern for any future slice that needs a real viewer identity staged ahead of a walkthrough. Verified live, 10 Aug, across two staged groups against a real anonymous session: the strip's count line reads exactly as designed, dot and all; both row kinds render correctly; tapping yes on a gauge row in the panel moves that row into the standing-yes group; a vote cast from the chat feed's own chips updates the strip's count on next render, proving the strip and the feed are two windows onto the same rows rather than two copies that could drift; the third yes tapped from inside the panel creates the event, Orbit announces it in the feed, and the event card appears on the pinned carousel, exactly as a third yes from chat already does; the caught-up note matches its designed copy character for character; and collapsing the strip after the last item clears makes it unmount rather than sit empty.

**Debt this slice opens, in product terms.** Counts and tallies on the strip and panel are only as fresh as the last time that screen rendered; a vote cast elsewhere will not update an already-open panel until it reloads. Recommendation: decline to fix until real use shows someone confused by a stale count, the same posture the spec named going in. Second, every row on the panel today is chip-answerable by design; when Orbit's prose-answered open day-question gets its own seat on this surface, that row will not fit the current chip-row shape and will need a small rework to hold it. Recommendation: queue, with this slice named as its data-shape predecessor; no action needed until that day-question slice is scheduled.

**New shared piece.** `OrbitBubble` was extracted out of the chat feed's own bubble rendering so any surface, not just chat, can speak in Orbit's voice without redrawing the same pixels; the caught-up note is its first consumer outside chat.

**Postscript, 10 August 2026, from the owner's QA run.** Two notes from the owner after running the PR's QA script, both recorded the day they landed. First, the strip visually blends into its neighbors; on first open it read as part of the event details card. Registered as a feel-pass item (see the feel-pass register) rather than fixed now; the stay-junior treatment overshot into not reading as its own element. Second, a heads-up rather than a decision: after seeing the visual polish, the owner may want to revisit the strip's placement in favor of the brainstorm's carousel option, pending items rendered as cards in the top carousel alongside real events. Assessed for switching cost while the build is fresh: the presentation is the only layer that would change. The derivation module, the vote actions, the chip components with their callbacks, and the shared Orbit bubble all carry over unchanged; the strip and panel component would retire in favor of pending-card components in the carousel, roughly a third of this slice's build effort, and nothing shipped here forecloses it. Two things the carousel version would need settled fresh: what "you're caught up" looks like when there is no panel to say it in (possibly nothing, cards simply absent), and whether mixing maybes into the confirmed-plans carousel dilutes the card region's one job, which was the product reason the carousel option lost the original placement decision; a visual treatment that keeps maybes clearly subordinate would have to answer it. A placement change would also need its own Claude Design round, since the handoff drew the strip, not cards.

### Day comment on a live gauge (10 Aug 2026)

Spec: docs/superpowers/specs/2026-08-10-day-comment-live-gauge-design.md. Entry started at slice open; completed at slice close.

**Suite baseline before any code:** 45 files, 662 tests, all green, zero skipped. This is one test above the pending-surface slice's finishing number of 45 files, 661 tests; the extra test is accounted for and is not a pre-existing failure. Commit `1e97519` ("Fix whole-branch review findings: strip overflow, caughtUp collapse, dot binding") landed after the pending-surface entry's 661 count was recorded but before that branch merged to main, and it added one test to `PendingStrip.test.tsx` pinning the standing-yes expanded gauge row's own width; file count held at 45 because the addition was inside an existing test file. Nothing failed and nothing was skipped.

**Task 4 (bench cases, failing baseline) done.** Seven cases landed in `evals/detect/cases.ts` (four must-recognize, three must-stay-quiet), with `normalizeIntent` gaining a no-op fourth parameter and `IntentContext` a no-op `liveGaugeLines` field, exactly as the spec called for, so nothing about how Orbit decides changed yet. `npx vitest run` held at 45 files, 668 tests, all green (up from the Task 1 baseline of 662; the six new tests are this slice's earlier tasks, none of them this one). `npm run eval:detect -- 5 daycomment` pre-fix baseline: daycomment-day-better 0/5, daycomment-cant-that-day 0/5, daycomment-with-time 0/5, daycomment-as-change 0/5, all four misreading as `none` (not `change`) on every run, meaning the model reads a day comment beside a live gauge as commentary or a wish today rather than a change request; daycomment-no-gauge 5/5, daycomment-nostalgia 5/5, daycomment-same-day 5/5, all three must-stay-quiet cases holding clean. Nothing unexpectedly passed, so the bench can honestly prove the Task 5 fix.

**Correction, review fix round 1 (10 Aug 2026): the `daycomment-as-change` baseline above was not the pin the plan needs.** Review caught it: that case's calendar was empty, so the runner's own "This group has nothing on its calendar right now" line and the system prompt's own definition of a change request (a plan "already on the group's calendar") both steered the model away from ever claiming a change, which is why it read as `none` on all 5 runs rather than exercising the wrong-reply path. Fixed by giving the case a real calendar plan for a different activity (`{ title: "Climbing", label: "climbing", minutesFromNow: 60 * 40 }`) alongside the live beers gauge, so the model has a plan it can wrongly target. Re-measured: `npx vitest run` held at 45 files, 668 tests, all green. `npm run eval:detect -- 5 daycomment` corrected baseline: daycomment-day-better 0/5 (4 runs `none`, 1 run misread as `change`), daycomment-cant-that-day 0/5 (`none` x5), daycomment-with-time 0/5 (`none` x5), daycomment-as-change 0/5, now correctly misreading as a change request on all 5 runs, and the reply text the ladder actually produced is the exact wrong decline the plan names: "I can't move it to another day yet. I can change the time if that helps." The must-stay-quiet cases held: daycomment-no-gauge 5/5, daycomment-nostalgia 5/5, daycomment-same-day 5/5. The wrong-reply pin now genuinely reproduces the failure the slice exists to fix, rather than merely re-proving the classifier stays quiet with nothing to misfire onto.

**Task 5 (the fourth reading: schema fields, prompt, normalize arm) done.** `normalizeIntent` gained a day-comment arm, gated on the caller-supplied `hasLiveGauge` exactly as the answer arm is gated on `hasOpenAsk`: a claimed day comment with no live gauge is discarded whatever the model says, and inside the situation the day-comment reading outranks the change reading, added after the answer arm and before the both-true (isSpark && isChangeRequest) discard, touching neither. `INTENT_SCHEMA` gained five required fields (`isDayComment`, `dayCommentActivity`, `dayCommentDayOfWeek`, `dayCommentTime`, `dayCommentTimeAmbiguous`) and `INTENT_SYSTEM_PROMPT` gained the DAY COMMENT class bullet, one sentence in the "two different kinds of doubt" paragraph preferring DAY COMMENT over CHANGE REQUEST inside the situation, and a day-comment fields block mirroring the answer fields block. New failing-then-passing normalize tests (4 cases) pinned: the live-gauge gate, discarding a day comment naming no single day, the day-comment-outranks-change precedence both inside and outside the situation, and time validation with ambiguity tied to a time that exists. `npx vitest run` held at 45 files, 672 tests, all green (up from 668; the four new tests are this task's).

While wiring the bench to prove the fix, found and fixed a gap in the eval harness itself, not in Orbit's behavior: `evals/detect/run.ts`'s `runOnce` had no early return for the `dayComment` intent kind, so it fell through into the change-handling branch and threw (`Cannot read properties of undefined (reading 'targetEventIndex')`) on every run, before the model's answer could even be graded. This was scaffolding Task 4 left unfinished (the `Outcome` type, `describe`, and `grade` all already handled `dayComment`; only the early return in `runOnce` was missing), not a normalize guard or a bench case, so fixing it changes no behavior the product ships. One line added: `if (intent.kind === "dayComment") return { kind: "dayComment", dayOfWeek: intent.dayComment.dayOfWeek }`.

`npm run eval:detect -- 5 daycomment` post-fix, first and only run (no prompt tuning needed): daycomment-day-better 5/5, daycomment-cant-that-day 5/5, daycomment-with-time 5/5, daycomment-as-change 5/5, all four must-recognize cases clean; daycomment-no-gauge 5/5, daycomment-nostalgia 5/5, daycomment-same-day 5/5, all three must-stay-quiet cases held. Scoreboard: `must-recognize: 20/20 runs, 4/4 cases clean`, `must-stay-quiet: 15/15 runs, 3/3 cases clean`, no failures printed. For daycomment-as-change specifically, confirmed the wrong decline ("I can't move it to another day yet. I can change the time if that helps.") is gone: the case now grades as `dayComment` on every run, so the change-request reply ladder that produced that line is never reached.

**Task 10 (QA staging script and the full verification pass) done.** New file `scripts/qa-stage-daycomment.ts`, copying `qa-stage-answer.ts` and `qa-stage-retry.ts`'s structure (header story, dev-test guard, `[QA]` naming, printed ready-to-click links). It seeds a `[QA] Day Comment` group in America/Los_Angeles with four named members and one live beers gauge two days out at 19:00, carrying one seeded IN vote and one seeded NOT_THAT_DAY vote, the seeded half of the wrong-day-retry "would have cleared" bar; the walkthrough's own day comment supplies the human half live rather than the script seeding all of it, so the walkthrough exercises the real vote-on-comment path rather than only the revival. It also adds a runtime dev-test guard (`requireDevTest`, built on `db-which.ts`'s own `judge` function) that the two earlier qa-stage scripts document in a header comment but never enforce in code; this one refuses to run rather than only warning. Supports `--verify <groupId>` (reads back the target gauge's stored suggestion and the newest gauge's shape, mirroring `qa-stage-answer.ts --verify`) and `--close <groupId>` (runs the real `runGaugeEndgame`, always scoped with `{ groupId }`, against a clock derived from the gauge's own `gaugeClosesAt`).

**The walkthrough surfaced a real bug in the shared dev server, not in the shipped code.** The first three attempts to post "Sunday works better" through the browser produced no reply and wrote nothing to the database, even though calling the exact same production functions (`detectIntentClaim`, `normalizeIntent`, `planDayComment`) directly against the same message, via a throwaway diagnostic script, correctly classified it and returned a `record` plan. A control test (a fresh spark message, "anyone want to play bowling next tuesday at 7") worked through the same browser session and created a gauge, which ruled out session auth and model connectivity as the cause and narrowed it to something specific to the day-comment write path. Root cause: the dev server on port 3000 had been running since 12:45pm, but `prisma generate` re-ran at 3:44pm during this task's own earlier work, regenerating `node_modules/.prisma/client` with the day-comment schema fields (`suggestedDayOfWeek` and its siblings, added by Task 2's migration). Node does not hot-reload `node_modules`, so the long-running process kept using its in-memory snapshot of the old client, and `recordDayComment`'s writes to the new columns were silently failing inside `detectIntentAction`'s catch-and-log-quiet block. Restarting the dev server (which loads the current `node_modules/@prisma/client` on process start) fixed it immediately; the next attempt against a freshly-seeded group worked on the first try. This is a process-hygiene finding, not a code defect: any time `prisma generate` runs against a schema change while a dev server is already up, that server needs a restart before its Prisma-touching code paths can be trusted. Recorded here because it cost real debugging time and could recur on a future slice.

**The full walkthrough, once a clean server and a clean group were in place.** Joined as a fifth member ("Jacob", an anonymous session reused from an earlier task) through the invite link. Typed "Sunday works better" in the group feed; it landed, and within seconds Orbit replied "Got it, Wednesday doesn't work for you. Sunday's noted in case this one doesn't come together." and the gauge's tally line updated from "Ravi is in so far · 1 wants a different day" to "Ravi is in so far · 2 want a different day", with the "Yes, can't Wed" chip now showing selected. `--verify` read back "Target gauge suggestion: Sunday · time (none stated, carries the original) · named by Jacob · message: \"Sunday works better\"" and "Newest gauge: beers · Wed Aug 12 · 19:00 · seeded voters: Ravi · sourceMessageId: set · retryGuessOfGaugeId: null", matching the browser exactly. `--close` ran the real sweep and returned `{"action": "revived"}` for the gauge. Reloading the group home showed the revival: "Beers didn't happen for Wednesday, but Sunday came up as a better day. Anyone in for beers this Sunday? If three of you are in, I'll set it up.", with "Jacob is in so far" and the "I'm in" chip pre-checked, and the pending strip's "You're in on" section carrying the new row ("beers, Sun 7pm, You're in, Change"). Everything in this paragraph was observed directly in the rendered app, not inferred from code.

**Screenshots.** Captured and reviewed inline during the session (the reply and tally tick; the revival message with its chips and the pending-strip row), but could not be saved as standalone PNG files: the browser tool used for this walkthrough has no "save to disk" action, and this environment exposes no accessible local cache of its rendered frames. The exact page text quoted above, plus the `--verify`/`--close` command output, stands as the recorded evidence in place of image files.

**Step 3, full bench regression (`npm run eval:detect -- 5`, one run, all 33 cases, 165 model calls).** Scoreboard: `must-recognize: 80/80 runs, 16/16 cases clean`; `must-stay-quiet: 65/65 runs, 13/13 cases clean`; `ambiguous: 10/20 runs, 2/4 cases clean`. This reconciles exactly against the recorded reference numbers: the answer-seam entry's 26-case full-bench reading (5 Aug 2026) was must-recognize 60/60 and 12/12, must-stay-quiet 50/50 and 10/10, ambiguous 10/20 and 2/4; this slice's own 7 cases landed at must-recognize 20/20 and 4/4, must-stay-quiet 15/15 and 3/3 (Task 5, above). 60+20=80, 12+4=16, 50+15=65, 10+3=13, and the ambiguous bucket holds no day-comment cases, so 10/20 and 2/4 carries over unchanged. The two ambiguous failures (`might-be-late-implies-move` 0/5, `group-grumble` 0/5) are the same two named as pre-existing in the answer-seam entry's postscript. Nothing moved, in either direction, across all 33 cases.

**Step 4, final suite and typecheck.** `npx vitest run`: 47 files, 691 tests, all green, unchanged from Task 9's finishing number (this task adds no new automated tests; the staging script is QA tooling, excluded from Vitest collection the same way its two precedents are). `npx tsc --noEmit`: clean, exit 0.

**What this task leaves running, for the owner's own click-through.** A dev server on port 3000, started fresh by this task (the earlier stale process was killed once its Prisma Client was diagnosed as the cause above). The `[QA] Day Comment` group is left in dev-test, already exercised through comment, verify, and close; a fresh cycle on a new group is available by re-running the script with no arguments.

**Clarifying line, added during fix round 1 review of this task.** The stale process killed above did not belong to this task; it belonged to a different, live chat session sharing this same checkout (this repo runs dev servers in place, never in worktrees, so more than one open session can be pointed at the same directory at once). The durable lesson is therefore two-fold, not one: a dev server needs a restart after any schema-changing `prisma generate`, and killing a dev server on this machine can carry a cost outside your own work, because it may belong to someone else's open session. Both should be weighed before killing one, not only the first.

**What shipped, as a member experiences it.** The Saturday beers gauge is live, and Dana types "Sunday works better" in the feed instead of tapping a chip. Orbit now hears her. Her vote lands as can't-that-day, the same answer the third chip records, so the tally ticks exactly as it would have if she had tapped it; the gauge quietly remembers Sunday and that Dana named it; and Orbit answers once, "Got it, Saturday doesn't work for you. Sunday's noted in case this one doesn't come together." That reply deliberately promises nothing, because whether Sunday ever happens depends on a bar Dana cannot see from where she is sitting. If Saturday clears the bar anyway, the event is created as always and the Sunday note evaporates unused. If the gauge closes blocked by its day, and would have cleared the bar without that blocker, Orbit skips asking the group what day works, because somebody already told it, and opens the Sunday gauge on the spot: same activity, the Saturday gauge's own time carried over, Dana counted in, full chips and a live tally, and every right a member-named gauge has. A day comment on one of Orbit's own week-later guesses earns that same revival. An idea nobody committed to still dies exactly as it did before this slice.

**The decisions, and why each went the way it did.** Numbered against the spec's settled list.

- **A day comment votes now and shapes the retry later; it never touches the live gauge's day (spec 1).** The obvious alternative was to open the Sunday gauge the moment Dana said it. The owner declined that, and the reason is the product's own arithmetic: one member's preference must not reset or split a vote other people have already answered, and two live gauges for one idea is exactly the clutter the brand rule exists to prevent. The information keeps perfectly well, and it is only ever needed if Saturday fails.
- **The vote records as can't-that-day, unless the member is already in (spec 2).** Naming a different day is re-engaging with the idea, so a member with no vote, an existing can't-that-day, or a soft "next time" all land on can't-that-day. A member who explicitly tapped "I'm in" keeps their yes, because an inference must never overwrite something a person did on purpose; their named day is still remembered either way.
- **One reply per comment, and only one (spec 3).** A chip tap is its own feedback and needs no sentence back. A sentence typed to Orbit is different, and here Orbit is additionally acting on an inference by recording a vote nobody tapped, which the transparency guardrail says has to be said out loud. So exactly one short reply per comment, and never a message per later tally change.
- **A remembered day means skip the ask (spec 4).** The "what day works better?" question exists for exactly one purpose, obtaining the day. Asking it after a member has already volunteered the answer would make Orbit look like it had not been listening, which costs more trust than the extra message could buy. Nothing about the eligibility bar moved: the would-have-cleared test still runs first, unchanged.
- **A day comment on Orbit's own guess gauge earns it a revival (spec 6).** The loop cap keys on whose move it was, and only a human resets the clock; a member naming a day mid-gauge is a human move, so it does. No runaway is possible, because every further cycle needs a fresh person naming a fresh day, and Orbit alone still never goes twice.
- **The remembered day lives on the gauge row, latest wins (spec 7).** One suggested weekday, an optional stated time, who named it, and the message that named it, all overwritten together by a newer comment. Chosen over storing a day per vote because the retry only ever needs one answer, and "the newest proposal supersedes" is already this product's standing tie-break. A future "most requested day" feature would need more stored than this; recommendation, decline it until something real asks for it, since nothing gets worse by never building it.

**The wrong-reply evidence, and the honest fact that this story changed mid-slice.** The spec opens by claiming Orbit sometimes answers a day comment with a decline about a plan nobody mentioned: "I can't move it to another day yet. I can change the time if that helps." That claim came from reading the code during exploration, not from watching it happen. It was worth writing down, but it was not yet evidence. The first bench case written to pin it (`daycomment-as-change`) used a group with an empty calendar, and the model never took the path at all: it stayed silent on all five runs, because both the runner's own "nothing on the calendar right now" line and the prompt's definition of a change request as a plan already on the calendar steered it away from ever claiming one. Review caught the hole. The fixture was corrected to look like a real group, one climbing plan on the calendar alongside the live beers gauge, which is how a group actually looks, and the misread then reproduced on 5 of 5 runs, producing that decline verbatim. So the wrong reply is real and is now pinned. The record should be equally clear that silence remains the more common failure of the two: the other three must-recognize cases read as nothing at all on 5, 5, and 4 of 5 runs, one of them producing the decline once. This is what a spec claim looks like when it is tested rather than assumed. It survived, but only after the test was rebuilt to be capable of failing.

**Two controller rulings, one of them made in the owner's absence.**

- **Ruling 1, accepted as it stands: a status string in the cron route's own output changed.** A guess gauge that had already closed with a note, whose only yes-voter later leaves the group, now reports its outcome to the cron log as "already closed out" where it used to say "closed silently". No write differs, nothing a member could ever see differs, and the new wording is the more accurate of the two. Recorded here as a deliberate divergence rather than as a fix, because it is a touch to already-shipped behavior that no task asked for.
- **Ruling 2, decided without the owner and flagged for him: what happens when the sweep runs late.** Two settled decisions collided. A member day comment on one of Orbit's own guess gauges, plus a cron outage long enough for the named day itself to pass, would have handed that guess gauge the generic "what day works better?" ask, which a later sweep turns into a guess of a guess: two more Orbit moves off one comment it could no longer honor, contradicting both "a guess gauge never earns its own ask or guess" and "Orbit alone never goes twice". The ruling: on an ordinary gauge the fallback ask stays, because Orbit had an ask coming to it anyway; on a guess gauge the fallback is the plain close. The reasoning is the same loop cap that granted the revival in the first place. A member's entire contribution on that path is one specific day, so once that day has passed there is no member-named revival left to carry full rights. This is an edge case decided in the owner's absence and surfaced to him in the PR's open questions.

**Watch-items, dated 10 Aug 2026.**

- **The exact-match activity degrade.** When a comment names the activity it is talking about, deterministic code matches that name against the live gauges by exact text, lowercased. A name matching nothing goes quiet rather than guessing, which is the safe direction, but the miss shape is small and human: "beer" against a "beers" gauge, or "climb" against "climbing". Nobody has hit it yet in real use. Watch for it; if it earns a fix, the fix is fuzzier matching or handing the choice back to the model, and neither is worth building on speculation.
- **The delayed-sweep slip.** Everything about the revival is resolved at close time, so a sweep delayed past the named day cannot open a gauge whose start has already gone. An ordinary gauge in that state falls back to the generic ask, and the guess that may follow uses same-weekday-next-week rather than the day the member actually named, so a long enough outage silently downgrades a specific human answer into Orbit's own arithmetic. A guess gauge in that state closes plainly (ruling 2 above). The trigger is a cron outage measured in days, which has not happened; it is written down because it would be invisible if it did.

**Honest gaps.**

- **The two-ideas-at-once question is unit-tested only.** When two different ideas are gauging at once and a comment does not make clear which it means, Orbit asks which one (spec 9). That path is covered by unit tests in `day-comment-plan.test.ts` and by nothing else: no bench case, and it was never exercised in the browser. The spec named this risk before any code was written and it played out exactly as predicted, because staging two simultaneous gauges plus a genuinely ambiguous sentence is expensive for the confidence it buys. The walkthrough evidence above must not be read as covering it.
- **No image files stand behind the visual claims,** for the reason recorded in the "Screenshots" paragraph above: rendered page text and direct database reads are the evidence, not PNGs.
- **The remembered day is invisible outside Orbit's one reply.** A member who scrolled past that message cannot see what Orbit is holding. Accepted knowingly; the fix belongs to a later surface pass, not here. Recommendation: queue, and only act on it if somebody is actually confused.

**Verification, gathered in one place.** Suite before this slice: 45 files, 662 tests, all green, zero skipped. Suite after: 47 files, 691 tests, all green, zero skipped, with `npx tsc --noEmit` clean. Recognition bench, the four cases Orbit must now recognize: 0/5, 0/5, 0/5 and 0/5 before the fix (measured against the corrected fixtures), 5/5 on all four after it, with zero prompt tuning rounds. The three look-alikes Orbit must stay quiet about held at 5/5 each, before and after. Full 33-case regression once everything had landed, one run of 165 model calls: must-recognize 80/80 runs and 16/16 cases, must-stay-quiet 65/65 and 13/13, ambiguous 10/20 and 2/4, those two ambiguous failures being the same pre-existing pair named in the answer-seam entry. Nothing moved in either direction. The bench is deliberately not part of the test suite, because it costs money and hits the network.

**Cost, and the deploy-time obligation.** The detection prompt grew by one live-gauge context line and five schema fields on the same cheap model, so per-message cost rises by fractions of a cent; no spending-ceiling implication worth acting on, stated for the record. Migration `20260810204408_gauge_day_suggestion` is item 8 of the pre-deploy checklist above, and this slice is dead in production without it.

**Postscript, whole-branch review (10 Aug 2026): one bug the revival could have shown a group, and one claim in the spec that was too broad.**

*The bug, in product terms.* The revival was willing to open a second card for a plan the group had already restarted on its own. A gauge closes at its own close time, but the sweep that revives it runs hourly, so there is a gap of up to an hour (longer if the cron is down) where the idea is closed and nobody has revived it yet. That gap is exactly when people are talking about the plan falling through, and a member saying "let's just do beers tomorrow then" now opens a real beers gauge, because the original is no longer live and nothing is blocking a fresh one. The sweep would then revive as well, and the group would be left with two beers cards for the same Sunday, two sets of chips, two tallies, both of them on the pending strip, with their yeses split between them so neither reaches three. Fixed: before reviving, Orbit checks whether a gauge for the same activity is already asking the group, and stays out of the way when one is. The sibling behavior (Orbit's own week-later guess) already had this check and the revival simply never got one. Liveness is the test rather than "created after some marker", because on this path there is no Orbit question to measure against; the honest question is whether the group is being asked about this activity right now. A gauge already promoted to a real event counts as live for this purpose too: the plan existing on the calendar is at least as good a reason not to open a second card for it. Recorded as a decision, not just a fix: **a member-named revival never opens while a same-activity gauge is still asking the group (10 Aug 2026, whole-branch review).**

*The waste, fixed alongside it.* A revived original left no marker of its own, so every sweep for up to two days retried the whole revival write and let the database reject it. Nothing a member could see, and correctness never depended on it (the naming message can only ever anchor one gauge, which is what actually makes a second revival impossible), but it wrote and rolled back an Orbit message every hour for no reason. The revival now checks first and skips, matching how the week-later guess already behaved.

*The spec claim that was too broad, corrected rather than rewritten.* The spec says in two places that this slice's window and the older "what day works better?" window cannot overlap. That is true only when both are about the same activity. For the same activity it holds exactly as written. Across different activities they can overlap: Orbit can be waiting up to 48 hours for an answer about climbing while a beers gauge is live, and nothing prevents that. In that overlap the older reading wins, purely because it is checked first, so a member replying "Sunday works better" about beers could open a climbing gauge for Sunday while the beers comment is dropped. Which of the two readings should win in that case has never been decided as a product question; today it falls out of the model's own answer on one flag. No behavior changed for this correction, and no bench case covers the overlap. A bench case for it and a decided precedence between the two readings are both queued, not built. The correction is appended beside the original claim in the spec (`docs/superpowers/specs/2026-08-10-day-comment-live-gauge-design.md`, "Correction (10 Aug 2026, whole-branch review)"), which still stands where it was written.

### Pre-MVP triage pass (10 Aug 2026)

The triage pass over the §8 remaining register ran on 10 Aug 2026 and set the path to MVP complete. Recorded here at the start of the group-info slice, riding its branch, because the session that ran the triage is the only one that reliably knows its outcome.

**The decided order, do-not-relitigate:**

1. **The full group-info page** (this slice, next). The `/groups/[id]/info` stub grows in place into the surface §4 and mockup 10 define: the member list (names only, never emails), the standing rhythm rows with venues, the founder powers (remove member, reset invite link), and Leave group (warm, destructive-styled, never buried). The invite link becomes visible to members rather than founder-only; today a non-founder sees "Group info coming soon."
2. **The joining arc**, one slice: the onboarding share moment (mockup 04) plus the "Jesse joined" system announcement. The two halves of the same product moment (handing the founder the link, and the group seeing the person it produced), so they travel together.
3. **The .ics add-to-calendar button**, its own small slice.
4. **The end-of-build visual-polish pass**, closing the feel-pass register and the scaffolding gaps.

**Two owner decisions made at triage, recorded so they stop reading as open questions:**

- **Ruling 2 of the day-comment slice is ratified as shipped.** A guess gauge caught by a delayed sweep closes plainly, never earning an ask or a guess of its own. What was decided by the build controller in the owner's absence and surfaced in the PR's open questions is now the owner's own decision, on the same reasoning: once the member's named day has passed, there is no member-named revival left to carry full rights.
- **The goodbye's current-members-only reading is confirmed as the product decision.** A departed member's yes does not earn the group a closing note. The goodbye exists for people still in the room who had said yes; a yes from someone who has since left is not owed a message the remaining group never asked for.

**One elevation:** a spending ceiling on pre-auth model calls moved from standing debt to item 9 of the pre-deploy checklist (top of this section). It is a deploy gate, not a slice: nothing about it needs building until the product is about to be reachable at a public URL.

### The full group-info page (10 Aug 2026)

Entry started at slice open; spec path to be added when the design is written.

**Suite baseline before any code:** 47 files, 692 tests, all green, zero skipped. This is one test above the day-comment slice's finishing number of 47 files, 691 tests; the extra test is accounted for and is not a pre-existing failure. Commit `d49e720` ("Keep the revival out of the way when the group beat it to it", the day-comment whole-branch review fix) landed after that entry's 691 count was recorded but before the branch merged to main, and it added one test to `src/lib/orbit/__tests__/endgame.test.ts`; file count held at 47 because the addition was inside an existing test file. Nothing failed and nothing was skipped.

**Spec:** `docs/superpowers/specs/2026-08-10-group-info-page-design.md`, fourteen settled decisions plus the debt list, written from the 10 Aug 2026 brainstorm and Section 1's approved addition on invite-link visibility.

**What shipped, as a member experiences it.** The `/groups/[id]/info` stub is gone. Any session can open the page and see the group's identity (lime emblem with deterministic initials, name, member count), the WHO list in founder-first-then-join-order, and every stored rhythm with its venue when it has one. A member or the founder additionally sees the real invite link in a pill with a teal "Share invite link" button (native share sheet where the browser offers one, clipboard copy with the existing "Copied!" feedback otherwise); a member alone also sees an outlined "Leave group" button at the bottom, warmly confirmed and never buried, which never renders for the founder. The founder sees the same page plus two quiet text links, never teal: "Manage members" flips the WHO card into a stacked list with a per-row remove affordance (the founder's own row has none), and "Reset link" rotates the invite token, killing the old link everywhere it has been shared. Every other change to the group still goes through Orbit in chat, and the page says so in a hint line.

**The decisions as built.**
- **Departures are silent, both kinds.** Leaving and removal post nothing to the feed. The WHO list is the only record, which also kept the joining arc's system-message plumbing out of this slice.
- **The founder cannot leave.** No Leave button renders on the founder's own view. A real founder exit (transfer or dissolve) is a future decision, not this one.
- **Removal and leaving are the same one-row delete, and the product self-heals for free.** Every tally, roster, consensus bar, and goodbye already counted current members only, so removing someone updates counts and gauge tallies with no extra write. The departed member's chat history and old RSVPs stay visible, as a group would expect to still see them.
- **Reset is the keep-them-out mechanism.** Since removal alone does not revoke a link someone already has, reset-then-remove is the designed pair: a fresh token kills the old link immediately, everywhere.
- **The invite link is visible to members, not to everyone.** A non-member session gets the identity block, the WHO/rhythm card, and the hint line only; no invite pill, no share button, no Leave. Showing the link to any holder of the URL would have turned every group page into a public invite, which is more than triage decided.
- **The Manage-members state is our own design**, not something the Claude Design handoff drew; noted as debt below.

**Walkthrough evidence, and its honest limits.** Full evidence in `.superpowers/sdd/2026-08-10-group-info-page/walkthrough-evidence.md`, gathered 10-11 Aug 2026 on dev-test against a real onboarded group plus `scripts/qa-stage-groupinfo.ts` seeding three more members and a live gauge. Observed directly in the rendered app: the founder view with no Leave button and exactly three Remove affordances for four members; removing Theo self-healing the WHO list, the member count, and the gauge tally line (which disappeared entirely once his was the only yes); reset producing a new token in the pill, the old link 404ing into the existing bad-invite screen, the new link opening the join form; a fresh member session seeing the invite pill and share button for the first time (the stub previously read "Group info coming soon" for anyone but the founder); a full leave-and-rejoin round trip proving the confirm copy's promise ("you can always rejoin") true, landing on the front door and then back in; and a non-member session seeing only the identity block, the WHO/rhythm card, and the hint, with no invite, share, Leave, or founder affordances. Two things the evidence does not cover: the copied clipboard value could not be read back in the browser pane (read permission denied), so the exact-URL claim rests on the ShareInviteLink component test rather than the live walkthrough; and the native share-sheet branch was never exercised, because `navigator.share` is undefined in the desktop pane used, so only the clipboard fallback ran live. The pane's accessibility tree also went empty intermittently while backgrounded, forcing some clicks by screenshot coordinate; that is a QA-process quirk, not a product finding.

**Suite and typecheck, before and after.** Before: 47 files, 692 tests, all green. After this slice: 55 files, 727 tests, all green, zero skipped, with `npx tsc --noEmit` clean.

**Debt opened or left standing.**
- **Founder exit has no path.** Transfer or dissolve is a future decision; until it exists, founder account deletion also stays blocked by the same schema constraint. Recommendation: queue, not urgent, because no founder has needed to leave yet.
- **Removal is not a lock, until the access-control slice.** A removed or departed member holding the URL can still view the group and post in chat; removal only takes them out of every count, roster, this page, and front-door routing. Accepted standing state, not a defect of this slice; its fix is the access-control slice's job.
- **The Manage-members state is our design, not Claude Design's.** The handoff never drew a stacked-list-with-remove state. Recommendation: queue a design pass in the end-of-build visual-polish sweep rather than treat it as wrong today.
- **Watch-item, cosmetic:** a group name that starts with punctuation yields punctuation initials (the seeded QA group "[QA] Group Info" rendered "[G"). Real group names are unaffected by this in practice; recommendation is decline unless it actually shows up on a live group.

No migration, no model call, and no new pre-deploy checklist item came out of this slice.

### The joining arc: the share moment and the join announcement (started 11 Aug 2026)

Slice started from main at db5b37d. Suite baseline before any code: 55 files,
727 tests, all green, matching the group-info slice's finishing number. Spec:
docs/superpowers/specs/2026-08-11-joining-arc-design.md. The rest of this
entry is written at slice close.

**Two halves, one moment.** The founder side (a third wizard step that hands
over the invite link at peak setup momentum) and the group side (a quiet
"Jesse joined" line in the feed) shipped as one slice because they are the
same product moment seen from both ends: handing out the link only matters if
the group notices what comes back. Per the 10 Aug 2026 pre-MVP triage, both
were already marked demo-critical; today's build had the founder land in
their new group alone with the link buried on the info page, and every join
was silent.

**What shipped, as each side experiences it.** A founder finishing onboarding
now sees "STEP N OF 3" and Orbit's header on every wizard screen, including a
new step 3: the group's name on a card, the real invite link in a pill, a
teal "Share invite link" button, Orbit's bubble explaining what to do with
it, and an outlined "Take me to my group" that lets them in. A person who
taps that link and joins for the first time makes the feed grow a centered,
muted, bubble-free line reading "Jesse joined," visible to everyone already
there and to the new member the moment they land. A re-tap of the same link
by someone already in the group changes nothing and announces nothing.

**The decisions as settled with the owner in this slice's brainstorm, and why.**
- **The wizard header rebuild rides in this slice, not a separate one.** The
  missing step indicator and the missing share step were one problem wearing
  two symptoms; shipping the step without the counter would have shipped a
  flow that cannot count its own steps.
- **The join line is a quiet centered line, not a bubble.** A bubble promises
  a reply, and nobody replies to a join notice; the room noticing is the
  whole message.
- **The invite link stays an opaque token.** Friendly slugs were declined for
  MVP because the share button already means nobody retypes the URL by hand;
  this closes the founder-auth slice's old open question about link
  friendliness as a deliberate no, not an oversight.
- **The share screen is a real third wizard step**, not a banner or a
  separate route. Both alternatives had already been rejected once before (the
  banner in the one-shot experiment, standalone join-success and welcome
  routes as future dead code), so re-litigating either here would have been
  re-opening closed decisions rather than making a new one.
- **Step 3 has no back chevron.** The group already exists by the time
  someone reaches this screen; a back arrow would imply the creation could
  still be undone, which would be a lie. A recorded, deliberate departure
  from the mockup, which draws one.
- **Step 2's confirm button now reads "Looks right, set up invites."** True
  again now that confirming leads into the share step instead of ending the
  flow.
- **The wizard header uses the same letter-O placeholder every other Orbit
  appearance uses.** The real mascot face is queued for the end-of-build
  visual-polish pass; this slice only made sure its asset lives in the repo
  (`orbit-mark.js`) so that pass has something to swap in.

**How first-join is told apart from a re-tap.** The join writes the
membership with `createMany({ skipDuplicates: true })` rather than a plain
create, specifically so a second person tapping an already-used link, or the
same person tapping it twice, can never abort the transaction: the database
maps the duplicate to a harmless no-op instead of an error, and the write's
own returned count (1 for a genuine first join, 0 for a re-tap) is what
decides whether the "Jesse joined" line gets written, with no separate lookup
needed to ask the question. The announcement rides inside the same
transaction as the membership itself, so the two can never exist without
each other. Small engineering choice, but it is the reason a race between two
people tapping the same link at the same moment cannot corrupt or double up
the record.

**What Orbit is deliberately kept blind to.** The twenty-message window Orbit
reads to interpret requests now excludes SYSTEM rows. Without the exclusion,
a join line would have reached Orbit's context mislabeled as coming from "a
former member" (the window's existing fallback for a message with no author),
which could have actively misled it rather than just being noise. Nothing
about how Orbit behaves changed in this slice; whether Orbit should know who
just joined, and could say something about it, is recorded as an open
question rather than answered by accident.

**Debt opened or left standing.**
- **No system voice has a design token yet.** The join line ships on
  existing muted text styles. Recommendation: queue for the visual-polish
  pass rather than invent a token now for a single use.
- **The native share sheet is still unexercised live**, standing debt carried
  from the group-info slice; the clipboard fallback is what a desktop browser
  can actually prove.
- **A founder who refreshes or abandons the tab on step 3 loses the wizard,
  not the group.** The group already exists; their invite link is still on
  the info page. Accepted knowingly as the honest fallback rather than built
  around.
- **Open question, recorded and not built:** should Orbit know who just
  joined. No behavior changes today; answering it later would shape Orbit's
  future conversational context, not this slice's.

**Deploy obligation.** One migration, `20260811150701_add_system_message_author`
(adds `SYSTEM` to the `MessageAuthor` enum, nothing else changes shape), is
now pre-deploy checklist item 10 (above in §11): the join announcement is
dead in production without it, and it fails inside the same transaction that
creates the membership, so an unmigrated production database would fail the
join itself, not just the announcement.

**Suite and verification.** Baseline at slice start: 55 files, 727 tests, all
green, matching the group-info slice's finishing number. After this slice:
59 files, 735 tests, all green, zero skipped. Every new test in this slice
was written and shown failing before the code that made it pass. The
recognition bench (`npm run eval:detect`) was not rerun: this slice touches
neither the extraction nor the intent-recognition prompt, only a wizard step
and a deterministic window query, so there was nothing for the bench to
re-measure. Walkthrough evidence is appended to this entry by the next task.

**Walkthrough evidence (11 Aug 2026).** Run on dev-test (db:which confirmed
`pxbewardwvoyqqcvogel` on all three sources before starting), against a group
built live through the real product, no seeding script. Founder "Jordan"
onboarded through the real extraction model with "We're a climbing crew of 8.
We usually go Monday and Wednesday mornings at 8am." (no gap round
triggered): step 1 showed "STEP 1 OF 3" with the "Never mind, take me back"
exit; step 2 showed "STEP 2 OF 3" and the confirm button read exactly "Looks
right, set up invites"; step 3 rendered the name card ("Monday Wednesday
Climbers"), the uppercase "GROUP INVITE LINK" eyebrow, the real
`/join/<token>` URL, the teal "Share invite link" button, Orbit's bubble with
no em dash, the outlined "Take me to my group," the caption, "STEP 3 OF 3" in
the header, and no back chevron, a full match to the brief. Clicking the
share button on the desktop pane hit the clipboard branch and showed
"Copied!" before reverting. "Take me to my group" landed on the group home
with the pinned event card and Orbit's "Next up" note.

The second session followed the pattern from the change-request-part-two
walkthrough, where this two-origin technique was first used: a second browser
tab pointed at `127.0.0.1:3000` instead of `localhost:3000`, a distinct
origin and therefore a distinct cookie jar on the same dev server
(`allowedDevOrigins` in `next.config.ts` already carries this pattern from
that earlier QA). Opening the real invite URL there showed the join screen
for "Monday Wednesday Climbers"; joining as "Jesse" landed on the group home
with a centered, bubble-free "Jesse joined" line in the feed and the TBD
count moved from 1 to 2. Reloading the founder's own session showed the same
line, confirming it is a shared feed write, not a per-viewer artifact.
Re-opening the same invite URL as Jesse (session remembered, so the join
screen read "Joining as Jesse" with no name field) and tapping join again
left the feed unchanged: still exactly one "Jesse joined" line, TBD count
still 2, proving the `skipDuplicates` re-tap path holds live and not just in
tests. Jesse then sent "can we do climbing at 9 instead of 8?" in the group
chat; Orbit replied normally with a group time-change proposal ("Jesse wants
climbing this Wed at 9am instead of 8am. Works for you?"), chips, Jesse's own
chip pre-checked, and a live tally, proving detection survives a SYSTEM row
sitting in the twenty-message window it now excludes.

**Not exercised, named honestly:** the native share sheet (`navigator.share`
is undefined in the desktop browser pane used for this walkthrough, so only
the clipboard branch could run live, the same gap the group-info slice
recorded). Everything else in the Task 10 checklist was observed directly in
the rendered app, not inferred from code reading. The sandbox was left as-is
afterward (standing convention): "Jordan" founder, "Jesse" member, one live
group time-change proposal on Climbing Monday.

*Postscript, 11 Aug 2026 (fix wave, code review):* removing the `/create`
page's own h1 as part of this slice's header redesign also removed the "No
sign-up needed. You can add an email later to keep access." reassurance that
used to live on that page header; it now appears only on the join screen, not
anywhere in the founder's own onboarding. This was a plan-sanctioned
consequence of the header redesign, not an oversight caught late. Whether the
reassurance should return somewhere in onboarding is an open question for the
owner.

*Postscript, 11 Aug 2026 (owner QA, pre-merge):* the owner asked, after
running the QA script, whether step 3 could get a back chevron to step 2 so a
founder who spots a mistake could reach "Edit my description." Considered and
declined together, because it is not the small change it looks like: the
group already exists by step 3, and step 2's screen was built for the moment
before creation, so every control on it would lie (edits go nowhere, the
confirm button would create a duplicate group, and the edit-description path
would create a third). Making the trip back honest means teaching the wizard
to edit an existing group, which is a real feature, not navigation. The
underlying need is real and is queued post-MVP as "founder can fix group
details after creation," whose natural home is the info page or Orbit's chat
once change requests widen, not the wizard. Recorded so "why is there no back
on step 3" never resurfaces as a mystery.

### The .ics add-to-calendar button (started 11 Aug 2026)

Slice started from main at 3d40d75. Suite baseline before any code: 59
files, 736 tests, all green. Spec:
docs/superpowers/specs/2026-08-11-ics-calendar-button-design.md. The rest
of this entry is written at slice close.

**Cross-check discrepancy, recorded rather than absorbed.** The joining-arc
entry above states its finishing number as "59 files, 735 tests." The fresh
count taken here, on the merged `3d40d75` itself, is 59 files, 736 tests,
one test higher. The likely explanation, found by reading the commit
history rather than assumed: the joining-arc entry's suite line was written
at commit `4725db3` (735 tests), but the branch that actually merged as
`3d40d75` includes a later commit, `60ac249` ("Fix eve-bump SYSTEM-row leak
and mid-create back navigation"), whose commit message says the fix is
"Covered by a new failing-first test in endgame.test.ts", one new test
never folded back into the §11 entry's recorded number. This baseline (59
files, 736 tests) is the real, current, all-green count as of this slice's
start and is what later slices should cross-check against; the joining-arc
entry's "735" is now a known-stale number, left as-is above per the
append-only rule rather than rewritten.

**Why this button is the product's reminder.** §6 settled long ago that the
MVP has no web push, so the one-way calendar snapshot is the whole of how
Interplanetary Groups says "Orbit remembers for you" outside the app. The
event-detail slice drew the button and deliberately did not wire it, on the
reasoning that a dead button is worse than none; this slice is that deferral
coming back as a real export. It is item 3 of the 10 Aug 2026 pre-MVP triage
order, which is not re-derived here.

**What shipped, as a member experiences it.** On an event's detail screen,
below the details card and above the roster, there is now a full-width teal
"Add to calendar" pill. Tapping it on a phone opens the phone's own
add-to-calendar flow; clicking it on a desktop downloads a calendar file.
The entry carries the plan's title, its day and time, the meeting spot, and
a line pointing back at the event page for details and RSVPs. The pill is
label-only; the design source's small leading calendar glyph (`.ed-cal` in
the prior handoffs' `walkthrough.css`) was not built and is registered in
the feel-pass register above for the polish pass to pick up, rather than
silently dropped. Nothing about
the member is in the file: no names, no emails.

**The decisions as settled with the owner in this slice's brainstorm, and why.**
- **Event detail only, not the home card.** The home event card stays the
  gist, with its two-button footer; adding a plan to a calendar is a
  completeness action, so it lives on the completeness screen. This
  supersedes a type-rules line in CLAUDE.md that had imagined the button as
  a compact in-card control; that line was amended in this slice rather than
  left to contradict what shipped.
- **Teal, in a region of its own.** The two design handoff files disagreed
  with each other: one called this the event screen's single teal primary,
  the other grouped it with the outlined secondaries. The primary treatment
  won, because the product's only reminder mechanism should not read as an
  afterthought. This is legal under the per-element teal rule as amended on
  27 July, since the pill is its own region and the details card keeps its
  own teal "I'm in."
- **One hour when an event has no stored end.** A stored end time always
  wins; only an event that never got one falls back. The owner chose one
  hour over the agent's two-hour recommendation, on the grounds that one
  hour is the calendar convention people already expect to see blocked.
- **Composed fresh at tap time, on the server.** The button is a plain link
  to an endpoint that builds the file per request from the stored plan, so a
  member who taps after the group voted to move the time gets the moved
  time, with nothing cached in between. Building the file in the browser was
  rejected because phone browsers handle that unreliably and phones are
  where this product lives; per-vendor "Add to Google Calendar" links were
  rejected because the record already chose one calendar snapshot rather
  than a row of branded buttons.
- **A personal calendar showing the member's own local time is correct, not
  drift.** Recorded explicitly so a future reader does not "fix" it. The
  everything-renders-in-group-time rule governs the app's shared surfaces,
  where one stored string has to serve every viewer at once. A calendar
  entry is not a shared surface: it is the member's own device telling them
  when to show up, for one absolute moment, wherever they happen to be.
- **The stored venue address gets its first surface anywhere in the
  product**, appended after the venue's short label, because a calendar
  location's whole job is letting the phone offer directions. It is still
  rendered nowhere else in the app.
- **Visible to every viewer**, session or not, member or not, matching the
  standing ungated state rather than inventing a gate for one endpoint.

**A decision made during the build that the spec did not anticipate.** The
calendar file originally announced itself as a published invitation but
carried no revision marker, which meant a strict calendar app could look at
a re-download and decide it was not newer than what it already had, leaving
a member staring at a stale time. Since the whole promise of the stable
entry identity is that a re-tap after a change *replaces* the old entry
instead of duplicating it, the announcement was dropped and each file is now
stamped with the event's own last-changed time, so the second copy carries
everything a calendar app needs to recognize it as a newer version of the
same plan rather than a separate one. That pair, a steady identity plus a
freshness marker, is what most calendar apps go on when they decide to
replace instead of duplicate. What this slice can honestly claim stops
there: the file is correct, and no specific Apple, Google, or Outlook
behavior was verified, because none of it can be exercised from this
machine. Recorded as a decision with its reasoning, not as a bug fix,
because it is the mechanism the re-tap promise rests on.

**Declined, each naming its home.**
- **A calendar button on the home event card:** declined by the placement
  decision above.
- **Built-in reminder alarms inside the entry:** declined. The member's own
  calendar defaults govern when their phone buzzes; overriding them would be
  our clutter in their pocket, which is the opposite of the anti-clutter
  north star.
- **Recurring-series export:** declined. Each stored event is one
  occurrence, and the series lives in Orbit's rhythm; exporting a series
  belongs to the post-MVP subscribable feed (§8).
- **Membership gating of the endpoint:** the access-control slice.
- **Friendly per-vendor links:** settled above.

**Debt opened or left standing.**
- **A saved entry goes stale if the group later moves the plan.** The feed
  announcement is the correction channel and a re-tap replaces the entry.
  This is the standing §6 limitation restated, not new debt; its successor
  is the post-MVP subscribable feed. Recommendation: queue with the feed,
  not before.
- **The stored venue address now has a surface but still no edit path
  behind it.** A wrong address saved at creation can, from today, mislead a
  phone's directions rather than just sitting unread in the database. This
  joins the standing venue-correction gap rather than opening a new one.
  Recommendation: queue, and let it add weight to whenever venue correction
  gets its slice.
- **No migration, no model call, and no new environment variable.** Nothing
  joins the pre-deploy checklist, and this slice costs nothing per use to
  run.

**Suite and verification.** Baseline at slice start: 59 files, 736 tests,
all green (with the cross-check discrepancy above recorded rather than
absorbed). After this slice: 62 files, 750 tests, all green. Every new test
was written and shown failing before the code that made it pass, with one
named exception: two of the composer's tests (see the review finding below)
were rewritten during review against code that already passed, since the
review found the tests themselves, not yet-unbuilt behavior, to be the
defect. The recognition bench (`npm run eval:detect`) was not rerun and was not
triggered: no prompt changed and no model call was added, so there was
nothing for it to re-measure. Walkthrough evidence is appended to this entry
by the next task.

**One review finding worth keeping as a lesson.** Two of the calendar
composer's tests, as first written, could not have failed against the bugs
they existed to catch: one checked that a backslash gets escaped using input
that contained no backslash, and another checked a long line's wrapping
against a run of identical characters, which a duplication bug would have
satisfied just as well as correct code. Both were caught in review and
rewritten to be capable of failing. A clean concrete instance of this
project's rule that a passing test is only evidence if it could have failed,
and a reminder that the failure mode is usually a test that is *almost*
right rather than one nobody wrote.

**Browser walkthrough, 11 Aug 2026.** Run against the real dev server on the
dev-test database, with one event staged for it
(`scripts/qa-stage-ics.ts`, new: a "[QA] ICS" group whose event carries a
venue with both a display label and a street address, and no stored end
time, because no existing QA row exercised either the address or the
fallback). What was seen, not inferred:

- The event screen renders the teal "Add to calendar" pill full-width
  between the details card and the roster, with the details card keeping its
  own teal "I'm in" above it. Two regions, one teal action each, which is
  the per-element reading of the color rule working as intended rather than
  a violation. Screenshotted at phone width in the dark theme.
- The pill is a real anchor to `/events/<id>/calendar.ics` with no click
  handler, so it degrades to an ordinary link.
- Fetching that URL returns HTTP 200 with `text/calendar; charset=utf-8` and
  no `Content-Disposition`, and the body is a complete calendar object: all
  sixteen lines end CRLF, timestamps are UTC `Z` times, the summary and the
  location escape their commas, and the description line wraps at the
  75-octet limit with its continuation carrying a leading space. The whole
  file is 458 bytes.
- The staged event has no stored end time and its entry blocks exactly one
  hour (18:30 to 19:30 UTC), which is the fallback the owner chose.
- Its location line reads
  `LOCATION:Movement\, 1622 W Belmont Ave\, Chicago\, IL`, the escaped bytes
  as they appear in the file (the adjacent bullet on comma-escaping applies
  here too): the venue's short display label rather than its stored legal
  name, with the street address appended. This is the stored address's first appearance
  anywhere in the product, seen working.
- A venue-less event's file omits the location line entirely rather than
  emitting an empty one, and takes the same one-hour fallback.
- An unknown event id returns 404 rather than an error page or a malformed
  file.
- Neither file contains a name, an email, an attendee, or an organizer.
- Enlarged text does not clip the pill: at a 24px root font size it grows
  from 44px to 66px and the label still fits, measured on the live element
  rather than eyeballed. This one is checked because clipping at enlarged
  text is a recorded past failure in this project.

**What the walkthrough could not reach, stated plainly.** No phone was
involved, so the tap-to-add flow a member would actually use is unverified,
and no Apple, Google, or Outlook import was exercised; the file's
correctness is established by its contents and its unit tests, not by any
calendar application's behavior. The optional phone step in the PR's QA
script is what closes that gap, and it belongs to the owner. The QA rows are
left in the dev-test database as inspectable evidence, expendable
thereafter.

### Pre-MVP triage, round two (11 Aug 2026)

The owner revisited the 10 Aug triage list the next day, with group info, the joining arc, and the .ics button landed, and made a second round of decisions in the same triage session. Recorded here riding the .ics branch, the branch open when the decisions were made; the amendments this entry summarizes were made in place in the same commit (deploy-checklist item 9, the §8 registers, the sealed one-shot entry, and CLAUDE.md's next-slice pointer).

**One slice added to the MVP push: share-readiness hardening, after .ics, before polish.** Full definition in the §8 demo-critical register. The deciding fact was new: the first public link goes to an investor the owner works with, who is expected to pressure-test the product with a real group. That is real use arriving the moment MVP exists, which moved the write-gating half of access control up from the launch bucket (a non-member's silently dropped "I'm in" is the product's worst failure mode, and it would fire in front of exactly that audience) and created the graceful out-of-credit state (a job evaluator finding a dead app because a prepaid credit ran dry is an avoidable first impression; the screen says why, explicitly, in Orbit's voice).

**The spending-ceiling checklist item was reframed rather than built.** The owner already runs a provider-side hard cap: prepaid credit with auto-reload off. That satisfies item 9 with no rate-limiting code; the annotation on the item records it. The owner will also check the provider console for a low-balance email notification, which may exist (unverified at decision time); the graceful screen is built either way, as the fail-safe.

**Captcha on anonymous sign-in: declined for MVP.** A portfolio reviewer hitting a captcha as their first interaction is a worse product moment than the risk it prevents, and the billing hard cap already bounds a bot's damage to downtime rather than money. Revisit if the credit ever drains unexpectedly. This amends the founder-auth entry's production-readiness note by decision rather than by edit.

**Notifications have their answer: the email arc, first post-MVP work.** Capture, then digest, as one story; definition in the §8 fast-follow register. Email capture therefore does not precede MVP: with nothing sending, capture would collect a promise with nothing behind it.

**Post-MVP queue, confirmed or added.** The recognition-precedence slice (the both-true discard, the cross-activity window overlap, and bench cases for both plus the untested two-ideas question) stays a fast follow rather than squeezing into the MVP push; the owner is eager to share and nothing about it compounds by waiting. Verbal RSVP stays queued, with the coupling question answered: it touches the classifier and the RSVP write path, polish touches neither, so it costs the same after polish as before. Orbit-miss observability and a feedback affordance enter the register, declined for now. The eval benches for extraction and merge stay trigger-queued, unchanged, with one clarification worth keeping: the benches are development-time instruments, and what stands between the model and the live demo is the runtime pair already built, the normalize boundary and the guardrails, so the missing benches do not make the demo less safe.

**Closed and declined.** The sealed one-shot entry's "test bigger slices deliberately" intent is closed as overtaken by events (annotated there). The engineering tidiness tail from the first triage round (account-deletion handling, durationMinutes wired to endsAt, the Prisma generator migration, promoting recurringActivities to a table, relocating RsvpControls, the page-shell dedup) is declined as standalone work; each item rides whichever slice next opens its file. The watch-items stay watch-only, unchanged.

**Postscript, 11 Aug 2026 (QA): the teal rule was rewritten, and the phone
step went unrun.**

*The teal rule.* This slice's QA put a teal "Add to calendar" on a screen
that already carried a teal "I'm in", and the rule as written
("the single primary action per *element*") allowed it only because the two
sit in different regions. The owner's read on seeing it: the technicality
was doing the work the rule should have been doing itself. Both actions
really are important, and a rule that has to be argued around on every
screen is written wrong. So teal is now defined by weight rather than by
count: it marks an action that genuinely matters, more than one may appear
when more than one is genuinely important, and what it must never mark is a
secondary or incidental action ("Edit my description", back and exit links).
Sparing use is still the point, because the entire signal is that a teal
button is worth reading; a screen where most things are teal has said
nothing. CLAUDE.md carries the new rule with its dated amendment note above
the July one, both kept, since the lineage is the useful part: this is the
second time the rule was too rigid rather than the code being wrong, and
that pattern is the actual finding. The owner also named the general
principle out loud, which is worth recording because it governs future
screens rather than this one: this decision was made at the very beginning,
and early rules are strong opinions weakly held.

*The phone step ran after all, and it found something.* An earlier draft of
this postscript said the step went unrun; that was true for about an hour
and is corrected here rather than above, per the append-only rule. The owner
reached the dev server from an iPhone over the local network. Safari refused
outright, because its secure-connections setting will not open a plain
`http://` address and a dev server has no certificate; Chrome on iOS opened
it without complaint. So the gap named earlier in this entry is now closed
in part, and what closed it was not the answer anyone expected.

**iOS offered to subscribe to the URL, not to import the event.** The sheet
read "Subscribe to Calendar" and showed the address. That is iOS treating
any web address returning calendar data as a live feed it can attach to the
Calendar app and re-check over time, and it follows from a decision this
slice made deliberately: no `Content-Disposition` header, so a phone is free
to act on the file rather than being forced to download it.

Three consequences, in order of how much they matter:

- **The obvious hoped-for reading is wrong, and worth stating plainly so
  nobody carries it forward.** The owner's first thought on seeing the sheet
  was that this might accumulate every plan he says yes to. It cannot. The
  file holds exactly one event and no recurrence rule, and the address is
  that one event's own address, so the subscription is a calendar containing
  one plan forever.
- **A subscription may quietly soften the staleness limitation this slice
  shipped with.** A subscribed feed gets re-fetched, so a plan the group
  later moves could correct itself on the member's phone without a second
  tap, which is exactly what "a saved entry never updates itself" says will
  not happen. Unverified: it needs a deployed URL and a real time change to
  watch. Worth checking at the first deploy rather than assuming, in either
  direction.
- **It exposes a clutter risk that argues for the queued feed.** If every tap
  attaches its own subscribed calendar, a member who adds five plans
  collects five calendars in their Calendar app. That is precisely the noise
  this product exists to oppose. The subscribable per-group feed already
  recorded as the post-MVP successor (§6, §8) is the shape that gets the
  auto-updating upside without the clutter: one subscription per group, not
  one per plan. The owner's instinct on the phone went straight to that
  feature before knowing it was already queued, which is the strongest
  signal yet for building it.

The narrower original question, whether a phone does anything sensible when
a member taps the button, is answered yes. The subscription it creates
during local QA points at a laptop on a home network and should be deleted
after testing; it is a dead address anywhere else.

*Post-MVP note from the same QA: the downloaded file has a generic name.* On
desktop the download works well and lands as `calendar.ics`, which says
nothing about which plan it holds. A descriptive name would be friendlier.
The reason it is generic is that the name comes from the route's own final
path segment, and the fix is a `Content-Disposition` header carrying a
filename built from the event. Recorded rather than done, and with a
caution attached: that header is exactly the thing this slice deliberately
omitted so phones stay free to subscribe or add rather than being forced
into a download. Anyone taking this on should treat "does the phone still
behave" as the acceptance test, not the filename alone. Low priority, no
product harm today.

### Share-readiness hardening: slice start (11 Aug 2026)

Slice started from main at 4c019c6, on branch `feat/share-readiness`. Suite
baseline before any code: 62 files, 752 tests, all green, zero skipped. This
is two tests above the .ics slice's recorded finishing number of 62 files,
750 tests; the difference is accounted for and is not a pre-existing
failure. Commit `7038ddf` ("Fix ics-slice review findings: sequence
overflow, stray CR, no-store, padding") landed after that entry's 750 count
was recorded but before the branch merged to main, and it added two tests
inside existing test files (`ics.test.ts` and the calendar route's test),
so the file count held at 62. Nothing failed and nothing was skipped.

### Share-readiness hardening: membership becomes real, and Orbit fails honestly (11 Aug 2026)

The slice that makes the first shared link safe to hand to a real group. Spec:
`docs/superpowers/specs/2026-08-11-share-readiness-design.md`; plan:
`docs/superpowers/plans/2026-08-11-share-readiness.md`. Both rode this branch
from the start, per the standing rule.

**What shipped, in product terms.** A group is now invite-only in the way
people already assumed it was. Someone holding a group's URL who is not in
that group sees one note from Orbit ("This group is invite-only. If you know
someone in it, ask them for the invite link, it'll bring you right in") and
nothing else: not the group's name, not its member count, not a word of the
chat. The same is true of the event page, the group info page, and the
calendar file. Underneath, every write refuses a non-member on the server:
posting, RSVPs, idea-gauge votes, group time-change votes, answering Orbit's
clarifying question, and Orbit acting on a message at all. Separately, when
Orbit's model calls fail, the product now tells the truth about why: out of
credits, or the service having trouble, never one blamed for the other, and
never the old generic "that didn't go through" that a founder could retry
against forever.

**Three premise corrections found by investigation, recorded because the
register's framing outlived the facts.** First, the two docstrings the slice
scope said falsely claimed membership checks exist had already been corrected
on 30 July (commit `936075c`); both honestly admitted the gap, so this slice
made the code match the comments rather than the reverse. Second, the register
understated the gauge problem: a non-member's RSVP was the known silent drop,
but a non-member's yes on an idea gauge genuinely counted toward the three-yes
bar and could be the tap that created a real event for a group they were never
in, and the pending strip handed non-members live voting chips including on
group time-change votes that the chat feed correctly showed read-only. Third,
exactly one write path in the whole product checked membership before this
slice (the group time-change vote); everything else checked only "has a
session."

**The scope grew once, by the owner's decision, and this supersedes the
triage-round-two scoping.** That triage said "viewing stays ungated by
design." The owner reversed it during this slice's brainstorm on the privacy
argument, and the deciding fact was not the stranger with a forwarded URL but
the person who leaves or is removed: they keep the URL, and rotating the
invite link only changes the join door, not the reading, so they would have
read a real group's chat and real names indefinitely. What remains at the §8
access-control item is anything beyond the wall: a request-to-join flow, and
any loosening of the wall itself. The cost accepted with eyes open: a member
who loses their session (cleared cookies, a new device) meets the wall until
the email arc ships, and their way back in is the invite link.

**Decisions worth keeping, none relitigated after the spec.**
- The wall reveals nothing about the group's name, members, or contents,
  deliberately. Whether a group exists at all is still distinguishable: an
  unknown id 404s to the branded not-found screen and a real group shows the
  wall. That is the deliberate tradeoff, not an oversight, because a member
  who mistypes a URL deserves the not-found screen rather than a wall that
  looks identical to a group that is really there.
- The wall doubles as the path in. There is no request-to-join flow, because
  the invite link is the product's only door and always has been.
- Server refusal is not made redundant by the wall. A removed member's stale
  open tab still holds live buttons, and the server refusing is what actually
  protects the counts and event creation.
- The calendar file is member-gated too, because it carries the venue's street
  address. The in-app button still works (the tap carries the member's own
  session); a calendar app re-fetching the saved URL on its own is refused.
  Named as a real tradeoff rather than discovered later: the feed announcement
  remains the correction channel, and the registered subscribable feed is the
  successor that would dissolve it.
- Promotion now counts current members only, matching what proposals promote
  and the endgame sweep already did. This closes the leaving-member case as
  well as any pre-gate row.
- The failure reason shown to a person is never false: "credits" only when the
  provider genuinely reports a dry balance, "trouble" for outages, overload,
  rate limits, auth trouble and connection failures, and the old generic copy
  for our own malformed requests, which are our bug and not an outage.
- The chat disclosure goes to the sender alone, in their own browser, stored
  nowhere. Chosen over a once-per-outage feed post and a standing banner: it
  was both the owner's preference and, contrary to first instinct, the least
  machinery, because the send flow already returns a private result to the
  sender while the alternatives need outage bookkeeping or a stored health
  state.
- No recovery pass. Orbit does not go back and re-read what it missed while
  down; a missed idea stays missed, and the registered Orbit-miss
  observability item is where anything smarter would live.
- The extraction and merge eval benches were NOT triggered. This slice touches
  onboarding's failure screens but changes no prompt, no model, and no reading
  of a model's answer; the classification happens when the model never answered
  at all. Verified rather than asserted: `git diff main` shows no change to
  `spark.ts`, `merge.ts`, or any prompt string or model constant in
  `extract.ts`. The standing trigger survives intact for the next slice that
  touches those prompts.

**Suite and verification.** Baseline at slice start: 62 files, 752 tests, all
green (the two-test delta from the .ics slice's recorded 750 traced to that
slice's post-count review commit, recorded above). After: 73 files, 776 tests,
all green, zero skipped. `tsc` clean. Every new test was written and shown
failing before the code that made it pass.

Browser walkthrough on the dev-test database, group "Monday Wednesday
Climbers": as a member, the group home, event detail and group info render
exactly as before and the calendar file returns 200 with real content; with no
session, all three screens render the wall with no group name, chat, or member
count in the response body, and the calendar file returns 403 with a twelve
byte body; as a signed-in non-member (a second session created by running
onboarding for real, which also proved the happy path is untouched), the same
walls and the same 403. An unknown group id still 404s to the branded
not-found screen rather than the wall, and an unknown event's calendar file
still 404s.

The unavailable path was driven end to end against the real Anthropic client
with a deliberately invalid key: the real 401 came back classified as
`ModelUnavailableError` with reason "trouble", and both `extractGroupAction`
and `mergeGapAction` returned `{status:"unavailable",reason:"trouble"}`. This
was done with a hand-run script rather than a second dev server, because
Next.js 16 refuses a second dev server from the same directory and port 3000
belonged to a concurrent session's server that was not ours to kill. What that
run does not cover is the browser rendering of those two states, which is
covered by component tests instead.

**The honest gap, named before the work started and still true.** The credits
flavor was never reproduced against the live provider, because that would mean
draining the account. Its trigger is pinned by a test replaying the provider's
documented dry-balance 400, and the review independently traced the SDK's
request path to confirm the message the classifier matches on is really where
that string lands on a real 400, rather than an artifact of a hand-built error
object. The screens themselves are proven by component tests.

**Two findings from the build worth remembering.**
- A pre-existing test was relying on the bug. `promote.test.ts`'s venue
  inheritance case cleared the three-yes bar using voters who were never
  members of the group, so tightening promotion broke it. The fixture gained
  real memberships and the assertion was left alone. Worth noting because it
  is the second time this project has found a test encoding a behavior nobody
  chose.
- The per-task reviews were not running `tsc`, and a type error rode two tasks
  before a later implementer surfaced it (fixed in `65bb942`). The lesson is
  about the review recipe rather than the code: a green suite is not a green
  branch when the suite runs through a transpiler that does not typecheck.

**A correction to the record, since the append-only rule means fixing it in
place is not an option.** Earlier entries describe "one pre-existing lint
error" in `OnboardingWizard.tsx`. The real baseline on main is fifteen errors:
that one, one in `ResetInviteLink.tsx`, and thirteen inside the
`docs/design/*.jsx` handoff files, which are design artifacts rather than
product source. The `OnboardingWizard.tsx` error is pre-existing and sits in
a region of that file this branch did not touch (this branch does edit
`OnboardingWizard.tsx` elsewhere, for the unavailable-copy wiring). Future
slices should compare against fifteen, not one.

**Deploy-time obligations: none.** No migration, no new environment variable,
no new model call, nothing added to the pre-deploy checklist. Checklist item
9's note that "the hardening slice's graceful out-of-credit screen is the face
of that downtime" is now satisfied.

**Debt this slice knowingly carries.**
- A member who loses their session meets the wall until email sign-in exists.
  Path back: the invite link. On a genuinely fresh device this still re-adds
  them as a second copy of themselves, the standing identity gap, unchanged
  here but easier to bump into now.
- A calendar app re-fetching its saved .ics URL is refused. Recommendation:
  carry, revisit if the subscribable feed is ever built.
- Only the sender learns Orbit is down; readers and non-senders are not told.
  Accepted by design; the observability item is the home of anything broader.
- Membership is read once before the promotion transaction opens rather than
  again inside it, so someone removed in that millisecond window still counts
  toward a promotion and gets an RSVP. Surfaced by review, recommendation
  queue rather than fix: the window is milliseconds, the product is a casual
  group coordinator, and removal already self-heals everywhere else.

### Visual-polish slice one: the strip-placement call and the design rounds (11 Aug 2026)

Postscript recording decisions settled outside the repo while the
share-readiness slice held the checkout. The full decision record rides this
branch as `docs/superpowers/specs/2026-08-11-strip-placement-call-decision.md`;
this entry is the §11 lineage pointer it names. Settled in a parallel
brainstorm, then carried through two Claude Design rounds to an approved
handoff the same day. All of it is owner-ruled and closed; do not relitigate.

The calls, in short: the pending strip stays where it is (the QA complaint was
visibility, not placement; the carousel option is deferred post-MVP with its
revisit trigger recorded, not deleted). The chosen treatment is separation
geometry per handoff item 03 plus a 7% translucent wash of the action teal
(`tint-a`, `rgba(24,188,203,.07)`; the stronger 13% `tint-b` was drawn,
compared by eye, and not chosen). That wash knowingly bends the pending-surface
QA note's "the card holds the screen's only teal" constraint, by the owner who
wrote it; CLAUDE.md's teal rule carries the matching dated note, and the
feel-pass register item carries a dated annotation. The front door keeps its
shipped copy in the item-01 layout plus the handoff's invite note (deliberately
not a button; the round-one claims list and second lede were cut). The carousel
chrome is approved as drawn (active dot as a wider brighter pill, hue-free;
22px undimmed peek; three-card cap; a single card stays bare). The finish layer
is declined for MVP, with two salvaged functional fixes: tabular numerals on
all tallies and the grounded-composer scrim; animations stay out entirely.
`docs/design/design-polish-rd-2` is the sole build source (`finish-layer.css`
never loads; load order per its README); `design-polish-rd-1` stays as lineage
of the declined pilot and is not a build input. The open question of whether
the dead-end screens and group-info founder states should join the design round
resolved itself by events: the round completed without them, and they get
tidied with existing tokens in this pass, no design round.

Two record inconsistencies carried from the screen-inventory sweep, named so
they are not rediscovered: the joining-arc-era note near the `.ed-cal`
feel-pass items attributes those CSS rules to the PNG reference folder, but
they live in the handoff bundles' walkthrough.css; and the wizard's OrbitPause
loading state was never drawn by anyone, which nobody has ruled on yet.

### Visual-polish slice one: slice start (11 Aug 2026)

Slice started from main at 77d0148, on branch `feat/visual-polish-1`. Suite
baseline before any code: 73 files, 778 tests, all green, zero skipped. This
is two tests above the share-readiness entry's recorded finishing number of
73 files, 776 tests; the difference is accounted for and is not a
pre-existing failure. Commit `dfbf4cb` ("Fix the share-readiness review
findings") landed on that branch after its entry's count was recorded and
added two copy-pinning tests inside existing test files, its own message
confirming 778; the file count held at 73. Nothing failed and nothing was
skipped. The lint baseline carried from the share-readiness correction is
fifteen errors on main, none of them this slice's to fix silently.

### Visual-polish slice one: the product gets its real face (11-12 Aug 2026)

The slice that turns a scaffolded-looking prototype into something that reads as
designed. Spec: `docs/superpowers/specs/2026-08-11-visual-polish-1-design.md`;
plan: `docs/superpowers/plans/2026-08-11-visual-polish-1.md`; the owner's
placement and design-round rulings:
`docs/superpowers/specs/2026-08-11-strip-placement-call-decision.md`. All three
rode this branch from the start.

**What shipped, in product terms.** The app now wears the design system rather
than an approximation of it. Dark is the real default instead of a media-query
branch, Geist is applied from the body down instead of Arial, and Orbit has its
actual face: one shared mark component (lime planet, moon on an orbit path)
replaced seven separate hand-drawn letter-"O" circles. On the group home, the
header says who the group is (heading-weight name plus the designed "N members ·
group info & invite link" subline, built for the first time), the carousel got
its finished chrome with a real 22px peek and a dot that tracks the snapped card,
the pending strip reads as its own full-bleed element carrying the owner's 7%
teal wash, the feed marks its days in the group's timezone, the three chat voices
match the boards, the event card carries its finished shell with the counts on
their own steady line, and the composer is grounded by a scrim.

**The premise that changed mid-slice, and it was the big one.** The plan assumed
this slice would flip a light default, apply a font, and dress a screen. The
investigation found something larger: the app's color tokens were never the
design's. `globals.css` said so itself, in a comment calling its values
"functional placeholders" pending exactly this pass, and they matched neither the
handoff nor the walkthrough. The owner approved the round-two boards by eye,
rendered in the real palette, so shipping any other values would have un-approved
the design. The slice therefore adopted the design system's palette wholesale,
names and values, and swept every consumer onto it. Consequence accepted on
purpose: every screen outside the group home now renders in the new palette and
typeface before its own polish slice, an interim mixed-fidelity state that slices
two and three resolve.

**The find that justified the whole review discipline: the design file has three
stacked override blocks, not one.** `walkthrough.css` carries a wireframe base, a
"DARK IDENTITY role overrides" block, a "CONTRAST + CONSISTENCY PASS", and a
"REFINEMENT PASS (targeted)", and by plain cascade the last one wins. Every task
brief in the plan was written against the first override block. A reviewer caught
this on the composer, which triggered a full-cascade audit of the whole group
home, which found four more misses: chips inside the pending panel carrying the
feed's 37px indent when the panel's own rule says flush (visible at a glance),
Orbit's bubble and the viewer's own bubble missing the hairline the contrast pass
adds to raised surfaces, and the "Can't make it" border half a pixel thin. All
fixed. The lesson worth keeping: a design handoff is a cascade, not a list of
values, and reading only the block someone pointed you at is reading the wrong
file.

**A happy discovery inside that find.** The owner had overruled the board on the
send button, ruling that sending a message is an action that genuinely matters
and so keeps its teal. The refinement pass, the file's actual last word, already
drew a two-state send button with an `.active` class. The owner's instinct and
the design's final pass agreed; only the plan's reading of the board was wrong.

**Decisions made along the way, recorded because they will otherwise resurface.**
- The palette adoption is wholesale, names included, so slices two and three port
  values without a translation table. The pending-surface slice had already had
  to document an ad-hoc mapping, which was this debt surfacing once already.
- Geist stays the product's one typeface. The boards render in Hanken Grotesk and
  Inter, which are prototype fonts the app never loaded; weights and sizes port,
  the family does not. Named as an owner question in the PR.
- The group name wraps rather than clipping. The design's CSS says `nowrap`, but
  it was drawn with one short placeholder name and the page root clips overflow,
  so a long name or an enlarged text size had no graceful outcome. The standing
  "layout grows with content, never clips" rule won, per "recorded decisions win
  over the walkthrough."
- Day dividers label older days as a three-letter weekday plus short date ("Mon,
  Jul 27"); the boards only ever drew "Today".
- The dots stay chrome rather than a control surface: swipe is the interaction,
  and tapping a dot to jump was declined for now.
- Nested fields moved to `--surface-base`. Collapsing three old surface tokens
  into one `--surface-raised` made onboarding's inputs the same color as the
  bubble holding them, so a field read as an outline drawn on a card. The design
  already answers this by putting nested pills on the base surface.
- The dead `#0a0a0a` literal was swept. It was the old `--surface-page`, left
  behind as a hardcoded label color on ten teal buttons after the rename, since a
  literal is invisible to a token grep. `--lime-ink` found its first consumer in
  the same sweep.

**Suite and verification.** Baseline at slice start: 73 files, 778 tests, all
green. After: 77 files, 801 tests, all green, zero skipped. `tsc` clean. Lint held
at the recorded 15-error main baseline with nothing added. Every task ran a
browser check against the dev-test database as it landed, and the slice closes
with a whole-screen side-by-side against the rendered design board.

**Two tests worth naming, because both are cases of the project's own "a passing
test is only evidence if it could have failed" rule biting.** The day-divider
timezone tests were first written with fixtures in America/Chicago, which is this
machine's own zone: a reviewer proved that a regression reading the viewer's zone
instead of the group's produced byte-identical output, so the test could not fail
for the bug it existed to catch. Re-fixtured to Asia/Tokyo and Pacific/Honolulu
and proven by deliberately regressing the code, watching them fail, and
restoring. The same class of hole then turned up in the MessageFeed render test
and was closed the same way. Separately, the "Yesterday" label was computed by
subtracting 24 hours from now, which is wrong for about an hour twice a year when
those hours straddle a daylight-saving transition; a reviewer built failing
inputs in both directions and it now steps back one calendar day in the group's
own zone instead.

**Debt this slice knowingly carries.**
- Screens outside the group home wear the new palette and typeface without their
  own polish pass. Deliberate; slices two and three resolve it.
- The wizard has two bubble grammars: `Step3Share` renders through the shared
  `OrbitBubble` and took the design's bottom-left notch, while `Step2Playback`
  and `StepGapAsk` keep the old top-left one. Slice two.
- The three chip components remain three near-identical copies. Deliberately not
  refactored: that is a structural change outside this slice's lane.
- ~~`#f87171` stays untokenized as the error color, traced to before the palette
  existed and outside the handoff's scope.~~ Partly resolved 18 Aug 2026 (polish
  slice two): the color is now the `--danger` token and the wizard's two usages
  read it. Thirteen literal occurrences remain in six files outside the wizard
  (`JoinForm`, `ChatInput`, `ManageMembers`, `ResetInviteLink`, `LeaveGroupButton`,
  `choice.tsx`), left untouched as out of that slice's lane.
- `--font-geist-mono` stays loaded and unused; a one-line cleanup for whichever
  slice next touches `layout.tsx`.
- A date-line zone that historically skipped a calendar day (Kiritimati 1994,
  Samoa 2011) can still miss a "Yesterday" across that one transition. No product
  reach; recorded rather than fixed.
- Collapsing the pending strip after clearing its last item leaves a few pixels
  of orphaned spacing, because the page's padding is computed server-side and
  never re-evaluated. Narrow interaction path.
- No test pins the `stripAbove` padding or the chip components' new
  `indentPastAvatar` margin; both are style-only branches.

**Deploy-time obligations: none.** No migration, no environment variable, no
model call added.

**Postscript, 12 August 2026, from the owner's QA run.** Three things, recorded
the day they landed.

*First, and it is a product-correctness finding rather than a polish one: the
event card's RSVP pair reads as a dark pattern.* In the unanswered state "I'm in"
is a solid teal button and "Can't make it" is an outline, so the card looks like
the member has already said yes before they have touched anything. Answering
"Can't make it" does not move the teal; the only thing that changes is a
checkmark appearing. The owner's own comparison, and it is the right one: the
gauge chips get this correct. All chips start visually equal, and choosing one
adds a checkmark and a small fill shift, so which one you picked is unambiguous
and nothing is pre-selected. The card instead colors one of two symmetrical
answers, which reads as a recommendation. Named plainly because RSVP accuracy is
this product's entire value proposition, and a control that leans on the answer
corrupts the number the product exists to get right. Two notes on lineage, since
neither is obvious. This is not new: the teal "I'm in" predates the polish pass.
But this slice made the confusing half slightly worse, because the selected
"Can't make it" used to carry a fill that the palette adoption had rendered
identical to the card behind it, and the fix for that invisibility was to make it
transparent, leaving the checkmark as the only selected signal. And there is a
rule tension worth stating for whoever picks this up: CLAUDE.md says teal marks
"an action that genuinely matters", but here it is not marking importance, it is
marking one of two equally valid answers, which is a different job than the rule
authorizes. Queued for its own brainstorm at the owner's call, not fixed here.

*Second, the carousel-placement trigger fired, earlier than the record expected
it to.* The strip-placement decision record deferred the carousel option
post-MVP with a named revisit trigger: "the dressed strip still reading wrong
after launch." Seeing it dressed on a real phone was enough. The owner's call is
to retire the strip and render pending items as cards in the top carousel
alongside confirmed events, distinguishing the two states in the card's own top
right with a short label ("confirmed", "still waiting", exact copy unsettled).
The two questions the record said would have to be answered fresh are now live
and belong to that brainstorm: what "you're caught up" looks like with no panel
to say it in, and whether mixing maybes into the confirmed-plans carousel dilutes
the card region's one job. The switching-cost assessment from the pending-surface
postscript still holds and is the reason this is not a rewrite: the derivation
module, the vote actions, the chip components and their callbacks, and the shared
Orbit bubble all carry over; the strip and panel components retire. Worth adding
to that assessment now that the carousel itself has been rebuilt: the finished
chrome from this slice (peek geometry, the scroll-derived active dot, the
three-card cap) is exactly what a mixed carousel needs, so this slice's carousel
work is not lost by the change, only its strip work is. The polish spent on the
strip is knowingly written off; reverting it would cost more than leaving it.

*Third, the five open questions this slice raised were all answered "fine as
built":* Geist stays the product's one typeface, Orbit's header mark stays at
28px rather than the board's 30, older day dividers keep the weekday-plus-date
format, the undrawn selected-chip treatment stays as shipped, and the header
keeps its centered name rather than the board's left alignment. Recorded so none
of them reopens by default in slice two.

*Still unanswered, and it needs a phone:* whether the three-chip gauge row's
two-then-one wrap reads as an accident or as fine. It has been deferred since
spark part one specifically to be felt on a real device rather than judged from a
screenshot, and this QA run was the first real chance. It stays open.

## §11 entry: card state grammar (opened 12 Aug 2026)

Slice branch `feat/card-state-grammar`, cut from main at 3e4c749. Spec and design
round in docs/superpowers/specs/ (2026-08-12-card-state-grammar-*). Test-suite
baseline at slice start, before any code: 77 files / 801 tests, all passing,
matching polish slice one's finishing number. No pre-existing failures to carry.

**What the slice was, in one line.** Two changes to the group home's card
region that turned out to be the same question wearing two hats: how a card
tells you what state it is in. The event card's answer pair stopped leaning on
"yes", and the ideas a group is still voting on moved out of a drawer and into
the card region beside the real plans.

**Why now: two findings from the owner's 12 Aug QA run, both recorded in the
postscript directly above this entry.**

*The first was a product-correctness finding rather than a polish one.* The
event card's answer pair read as a dark pattern. Before the member touched
anything, "I'm in" was a solid teal button and "Can't make it" was a plain
outline, so the card looked as though they had already said yes. Answering
"Can't make it" did not move the color; a small checkmark was the only thing
that changed. That matters more in this product than in most, because RSVP
accuracy is the whole value proposition: a control that leans on one answer
corrupts the single number the product exists to get right.

*The second was a trigger firing early.* The strip-placement record (11 Aug)
had deferred the carousel option post-MVP behind a named trigger, "the dressed
strip still reading wrong after launch". Seeing it dressed on a real phone was
enough; launch never came into it. That record now carries a dated postscript
saying so.

**The fix for the first, and the rule it forced.** Unanswered, both answers now
carry the same teal outline and neither is filled, so the teal marks the
question instead of one of the answers. Answering fills whichever option the
member chose, in teal, with a checkmark, and quiets the other. A filled "Can't
make it" is honest rather than odd: it is the member's own settled answer, not
a recommendation. Nothing here is told by color alone (outline, fill and
checkmark each carry it), which is what keeps it readable for a red/green
colorblind member. The group home's card and the event's own screen share one
control, so both changed in the same move and cannot drift apart later.

That forced an amendment to the standing teal rule, which had said teal marks
"an action that genuinely matters". Here teal was not marking importance at
all; it was marking one of two equally valid answers, which is a different job
than the rule authorized. The amended rule now in CLAUDE.md: teal never leans
an open question, and only an answer the member chose may hold the teal fill.
The owner added the second half of it during the design review, that a label
naming your own move is teal while a label naming other people's move stays
grey, so scanning the card region for teal is scanning for what needs you. The
cost accepted knowingly: an unanswered plan now says "this needs you" twice,
once in its label and once in its borders. One message repeated was preferred
over a special case that would grey the label only where the borders exist.

Scoped deliberately, and worth stating because the two grammars now differ on
purpose: the chips stay grey everywhere. Chips are the poll on a maybe; the
answer pair is the ask on a real plan. The difference does honest work, because
a plan waiting on you outranks a maybe waiting on you, and now it looks that
way. The consequence, accepted knowingly: a group home where everything is
answered shows no teal at all until the member types something.

**The fix for the second.** The strip, the panel it opened, the dimming behind
it, and all of its caught-up machinery are gone. An idea the group is voting on
is a card now, sitting in the top card region with the confirmed plans:

- *Order.* One list, sorted purely by when the thing would happen, with a
  same-instant tie going to the confirmed plan. The owner ruled against putting
  confirmed plans first: the soonest item is the most actionable thing on the
  screen precisely when it is still a maybe, and burying it behind a later
  confirmed plan hides the vote it needs. The dilution worry (the product
  reason this option originally lost) is answered by how the cards look rather
  than by where they sit.
- *How many.* Five cards, confirmed and pending together, up from three. This
  is the owner's answer to what happens when the region fills, chosen instead
  of guaranteeing slots to each kind: at five, the next confirmed plan only
  falls off behind five earlier maybes, which real groups do not produce.
  Anything past five is simply not in the region; chat still carries every
  item, as it always did, and chat was always the primary surface.
- *How a maybe stays a maybe.* An idea card is quieter by structure and never
  by color: a flat shell, one hairline, no shadow, a smaller title, and no
  chevron, since there is no detail screen behind an idea. Its title is the
  activity plus a question mark ("Beers?"), the owner's call, because the mark
  says "not settled yet" in one character, in Orbit's own warmth, and without
  repeating what the label already says. Its when-line ends in a fixed "Place
  TBD", also the owner's call, because an empty spot where a place should be
  reads as a bug while "Place TBD" reads as a promise. That is constant copy,
  not stored data, so the standing decision that no idea holds a venue before
  it becomes a plan is untouched.
- *What a card still needs.* A short label in each card's top right names the
  card's highest outstanding need, the viewer's own before anyone else's:
  needs your RSVP, then needs your vote, then needs other votes, then nothing
  at all. A card that needs nothing goes bare, and the bare state reads as a
  small reward. "Needs other votes" is the owner's wording, replacing the
  design's "needs more votes", because it says whose move it is: you have done
  your part.
- *An open time-change vote.* It shows on its own plan's card as one recessed
  line ("Time change proposed · Move to 8pm?") that opens the plan's screen,
  where the vote itself lives, placed just above "Add to calendar" because it
  changes the very time that button would save. This bends the pending-surface
  slice's answer-in-place decision by exactly one tap, knowingly and by name:
  chat still carries chips you can answer without going anywhere.
- *Height.* Every card's shell now runs the full height of the region with its
  answer row anchored at the bottom, so slack sits inside a card as breathing
  room instead of below it as dead grey. This dissolved the taller-card problem
  that had made the first proposal treatment (a full band across the card) too
  expensive: a band on one card lengthened every card and shortened the chat
  window underneath.
- *Caught up.* The panel's "you're caught up" note retires with the panel it
  lived in, and nothing replaces it. Cards need no empty state: the card
  disappearing and the region simplifying are the feedback. Recorded here
  because a deliberate silence and an oversight look identical later.

**A copy ruling worth keeping as lineage, because it will be tempting to
undo.** The design boards wrote the time-change question as "Sam can't do 7.
Move Fri beers to 8pm?" The owner rejected it for two independent reasons.
First, the product does not store why anyone asked for a change, so any reason
in that sentence would be invented. Second, naming a person's constraint turns
"what time works?" into "how do we accommodate Sam?", which produces rounds of
people-pleasing instead of a clean answer about the time. Ask surfaces stay
objective and impersonal, composed only from what is actually stored. Voter
names still appear in tallies, which is different: a vote is a public action,
and reporting who voted is transparency, not pressure. Chat's already-shipped
ask still names the asker as plain attribution; softening that is the owner's
optional future call, recorded and not done.

**Where the build deliberately departs from the design boards, so a later
rendered-versus-design check does not read these as misses.** Five places, each
the owner's ruling: the boards cap the region at three cards and the recorded
decision is five; the boards invent a counts-only tally voice and new chip
words, and the product's shipped tally voice and shipped chip words win; the
boards' "needs more votes" becomes "needs other votes"; the boards render every
label in the same quiet grey, and the owner's teal-for-your-own-move rule
supersedes that; and the boards' bare "Beers" becomes "Beers?". Adopted from
the boards beyond what was asked for: the label ladder itself, the recessed
anatomy of the proposal line, and the stretch-and-anchor rule for card height.
Two design rounds fed the slice and both are committed on this branch:
`docs/design/design_handoff_round5/` (the answer pair, the idea card, the mixed
region) and `docs/design/design_handoff_round6/` (the proposal treatment and
the height rule).

**One structural decision, recorded because §11 is its only permanent home.**
Four near-identical copies of the same tap-to-answer control were shipping side
by side, and restyling the answer pair would have made a fifth. This slice
replaced all four with one shared control, so the same control now behaves the
same way everywhere it appears and the copies cannot drift apart. The product
reason: this slice is about a state grammar staying coherent, and one control is
how a grammar stays one; four hand-kept copies drift the first time somebody
remembers to change three of them. The answer pair moved into the product's
shared set in the same move, out of the one screen it had been flagged as
misfiled under, which is also what let it be tested at all.

**Suite and verification.** Baseline at slice start: 77 files, 801 tests, all
green. After: 83 files, 835 tests, all green. The answer pair had no test
coverage at all before this slice and now has its own, which closes a gap that
existed while the control was shipping the wrong behavior. What retires with
the strip: the strip's own tests and its gate helper's tests.

**No model behavior was touched.** No prompt changed, no new model call, no
marginal cost per group. The recognition bench is therefore not owed a run by
this slice, stated so its absence from the PR reads as correct rather than
skipped. Deploy-time obligations: none. No migration, no environment variable,
no model call.

**Walkthrough evidence (12 Aug 2026).** Run on dev-test (`npm run db:which`
confirmed project ref pxbewardwvoyqqcvogel on all three sources before anything
was written). A fresh group was staged through a throwaway script that never
entered the repo: one confirmed Saturday event with a venue, one open "beers"
idea proposed for the Friday before it (so the mixed date order in the rail
would actually be visible), and one open group time-change vote on the
Saturday event. Multiple real, separately-cookied member sessions joined
through the invite link against the same running dev server and drove every
check below; the interactive preview pane handled the first join and a couple
of early checks, then repeatedly stopped repainting on the carousel's swipe
gesture, so the remaining sessions and every screenshot were driven through a
second, independently automated real browser instead pointed at the same
server. Nothing below was staged or faked; it was clicked, typed, and read
back from the live page.

Seen directly, matching the spec: the unanswered event card showed "I'm in"
and "Can't make it" with the same teal outline on both, a teal "NEEDS YOUR
RSVP" top right, and no checkmark anywhere. Tapping "Can't make it" filled
that side solid teal with a checkmark and dropped "I'm in" to a quiet
outline. The idea card sat ahead of the Saturday event in the rail exactly
as staged, visibly flatter than the confirmed card (no shadow, a single
hairline), titled "Beers?", reading "Fri 7pm · Place TBD," with a teal
"NEEDS YOUR VOTE." Voting yes on it moved that label to a grey "NEEDS OTHER
VOTES," and the running tally line ("Sam is in so far," then "Sam & Robin
are in so far · one more makes it happen") read identically on the card and
under Orbit's own message in the chat feed, confirming both surfaces are
reading the same rows rather than two separate counts. A third yes, cast
from a third member's own session, converted the idea into a real event in
place: reloading that member's screen showed "Beers" as a genuine event
card with a real RSVP already recorded for them from their gauge vote, and
the chat feed carried exactly one Orbit line announcing it, never more.

The confirmed event's card carried the recessed one-line notice ("Time
change proposed · Move to 11am?"); tapping it landed on the event's own
screen with the vote sitting between the details card and "Add to
calendar," exactly the placement the spec calls for, using the shipped
chip copy ("11am works" / "Keep 10am"). Voting there put a checkmark on the
chosen chip and the same names-voice tally showed back up on the group
home. Answering the RSVP and then the vote walked the card's own label down
the ladder, RSVP to vote to other votes, confirmed once the page had fully
settled. The event detail screen showed the identical RSVP pair with no
label above it at all, as specified. Measuring the two card shells directly
(not just by eye) showed them at the same height, pixel for pixel, with the
shorter idea card's leftover room absorbed inside its own border rather
than left as grey space beneath it. The pending strip never appeared
anywhere on the group home, checked both visually and by a direct text
search of the page for its old wording. No console or page errors turned up
in any session.

One honest wrinkle, not a defect: on a few of the very first post-tap
screenshots, the app's own "Rendering…" dev indicator was still showing and
a card's need-label briefly still read its pre-tap value, even though the
button that was actually tapped had already flipped to its settled look.
Every one of those labels was confirmed correct moments later once the
indicator cleared and the page had a beat to catch up, and the settled
reading is what is described above throughout. Worth a quick recheck
against a production build before calling that fully closed, since dev-mode
compile pauses do not exist there.

Rendered screens were opened side by side against
`round6-design-reference.html`'s boards 01, 03, and 06 (the footer notice,
the detail-screen vote placement, and the stretch rule), read in full.
Everything matched, including board 06's own description of the stretch
rule ("cards stretch to the region's height... leftover space lives inside
a card's border") against the measured equal heights above, except the five
departures already written down and approved in spec decision 13: a cap of
five cards instead of three, the shipped tally and chip wording in place of
the boards' invented copy, "NEEDS OTHER VOTES" instead of "NEEDS MORE
VOTES," teal instead of grey on the viewer's own labels, and "Beers?"
instead of a bare "Beers." `round5-design-reference.html` was not opened
this pass; round 6 carries the same boards in their superseding, shipped
form, so it was read instead.

**Not verified.** A decline ("Next time") clearing an idea card out of that
viewer's own rail was not exercised in this pass; treat it as unverified
rather than assumed to work. The group time-change vote was only shown
accepting a vote and updating its tally, not actually clearing its bar and
moving the plan; nobody in the staged group had an existing RSVP on the old
time to switch, which is what that path needs to be representative, and
staging it was not worth the added seed complexity this pass. The native
share sheet and a true phone-width layout were both out of scope for this
pass (already flagged elsewhere as open); screenshots throughout were taken
at a 480px-wide layout, not a real device width.

**Debt this slice knowingly carries.**
- *Hidden overflow has no count anywhere.* More than five items and the rest of
  the maybes are not in the region at all, and the strip's old summary line
  ("2 waiting on you") is gone with it. Accepted at five. Revisit triggers: a
  real group regularly holding more than five live items at once, or the next
  confirmed plan ever falling off the region behind five earlier maybes.
- *A time-change vote on a plan whose card sits outside the top five is not
  noticed from the card region.* Softened by the round-6 decision, since the
  vote now also sits on the plan's own screen, so chat and that screen both
  carry it; only the region's one-line notice is missed. Same acceptance, same
  trigger as above.
- *The group home now looks up more details per card than it used to,* because
  the region holds five cards where it held three. The shape of the work was
  already there and did not change; there is simply a little more of it, on a
  screen with a handful of cards. Recorded rather than fixed, because nothing
  gets worse by leaving it.
- *One dead fallback left in the plan's own screen,* a leftover from before the
  members-only wall existed: the screen still carries a "if there is no viewer"
  path that the wall makes unreachable. Harmless, and named so a future reader
  does not mistake it for a live case.
- *The polish spent on the strip is written off knowingly.* Its separation
  geometry and its teal wash were built one day and deleted the next; reverting
  the palette work around them would have cost more than letting them go. The
  large deletions in this slice's diff are intended.
- *Inherited and unchanged:* Orbit's open day-question still has no surface
  outside chat, and a wrong venue still has no fix path anywhere.

**Postscript (12 Aug 2026, pre-merge review fix wave): the verification
section overclaimed two of its test items, corrected here rather than in
place.** The spec's verification section (item 3) listed "promotion moving
an item from pending to confirmed" and "both empty-state branches" as pure-
function tests this slice would add. Neither exists, and the independent
whole-branch review caught it before merge. What is actually true, plainly:

- *Promotion.* There is no unit test for a pending idea moving to a confirmed
  event, because there is no pure function that makes that move. Promotion
  happens by database write elsewhere (the gauge's event gets created), and
  the card region simply stops being told about a promoted idea: the query
  behind it already excludes any gauge that has produced its event. There was
  nothing at the pure-function layer to pin. The behavior is real and was
  seen working in the browser walkthrough above (the third yes converting the
  idea card into a genuine event card, one Orbit announcement, nothing more),
  so it is covered by that walkthrough and by nothing else.
- *The empty-state branches.* One of the two was already covered before this
  postscript: the composition helper returning nothing when there are no
  events and no ideas at all. The fix wave added a second unit test next to
  it, for the helper composing correctly from ideas alone when no event has
  been confirmed yet, which pins real, checked behavior. What neither that
  test nor the original walkthrough reaches is the group home page's own
  choice of what to show in that moment (the quiet empty-state box versus the
  card carousel): that branch lives in the server-rendered page, which this
  repo cannot unit test, and every walkthrough pass to date staged at least
  one confirmed event alongside the idea, so the ideas-only screen was never
  actually looked at either. That specific view is covered by neither a test
  nor a walkthrough and is carried forward as a genuine, named gap rather
  than a passed check.

**Postscript, 12 August 2026, from the owner's QA run on the merged slice (PR #62).** Four
notes, recorded the day they landed. This postscript was written after the merge rather than
before it, which is the wrong order and is itself recorded below.

*First, the chat feed and the card region do not separate from each other well enough.* The
owner's words: it all blends, and scrolling makes the feed look like it slides underneath the
card rather than stopping at a boundary. It applies to both card kinds, and it reads worse on
the idea card, whose flatter shell was chosen precisely so a maybe would not read as a plan;
that quietness now costs it a clear edge against the feed behind it. This is the same family
of complaint as the pending strip blending into its neighbours (10 Aug 2026), and the same
lesson: an element that is deliberately quiet still has to announce where it ends. Queued as
its own slice, not fixed here. The constraint any fix inherits: the region must still read at
a glance as the constant next-plan reminder, and the idea card must stay subordinate to a
confirmed one.

*Second, a promoted plan does not fall back when its count drops below the bar, and that is
the settled behaviour rather than a defect.* The owner tapped the third yes on a beers idea,
which created the event in that tap, then changed their own answer to "can't make it", leaving
two in. They expected the plan to return to being an idea. It did not, and it should not: the
three yeses close the gauge and write a real event, so the later tap is an RSVP on an existing
plan rather than the withdrawal of a vote. A plan does not evaporate because one person backed
out while the others are still going. What is genuinely new is that the card region now
announces a card's state clearly enough that this one-way door became visible for the first
time; the door itself predates this slice. Raised by the build agent as a product question
rather than a bug, and the owner agreed on 12 Aug 2026 that one-way promotion is the better
behaviour. Recorded so nobody re-opens it as a defect later.

*Third, a declined idea card disappearing for that viewer is working as designed, and the way
back is the chat.* The owner tapped "can't make it" on the beers idea, the card left their
carousel, and they then found they could still change the answer from the chips in the feed.
That is exactly the intended shape (a decline drops the item from that viewer's card region;
the vote is stored and stays changeable where it was first asked), and the owner explicitly
chose to leave it alone. Recorded because the discoverability question they raised on the way
to that discovery is real: nothing on the card region tells you the chips in chat are the way
back. Not queued, deliberately; noted so a future reader does not mistake the silence for an
oversight.

*Fourth, a process note about this postscript itself.* The standing rule is that a slice is not
done until its record is written, and the build agent surfaced these four notes only after
merging rather than before, on the owner's merge signal. The owner's correction, accepted: the
record belongs on the branch, inside the pull request being reviewed, so a merge signal should
be met with "this needs one commit first" rather than acted on and annotated afterwards. The
cost this time was small, one extra docs-only pull request; the cost when it is not small is a
finding that exists in a conversation nobody can search.

## §11 entry: the test gate splits in two (12 Aug 2026)

*A micro-PR, not a slice. Recorded here because it changes how every future slice is verified,
which is exactly the kind of decision a future reader will ask "why was it done this way" about.*

**What prompted it.** The owner reported that execution runs had gone from about an hour and a
half to between two and four hours over two days, and asked whether a process change had caused
it. Measured from the session transcripts, per code-file edit round trip: 9 to 15 seconds across
21 to 28 July, 38 seconds on 4 Aug, 57 on 10 Aug, 90 on 11 Aug, 85 on 12 Aug. Total time spent
waiting on edits: about 0.25 hours a day in late July against 5.6 hours on 12 Aug. The cause was
not a process change. The post-edit hook ran the whole suite after every non-docs edit, the suite
grew from 45 files to 84 as the product grew, and it is network-bound against the remote dev-test
database, so it went from about 12 seconds to 83. Two hypotheses were tested and rejected with
evidence: same-session execution (coordinator context averaged 259 to 284k tokens in late July
against 267 to 296k now, flat) and slice size (7 to 16 tasks throughout, no trend).

**The decision: narrow per edit, whole per task.** The post-edit hook now runs only the tests that
reach the edited file. The full suite moved to a new SubagentStop hook, so it runs once when a
task's agent finishes rather than once per edit, which is roughly 20 runs a slice instead of 200.

**What was settled along the way, in the order the questions came up.**

- **A read-only agent finishes free.** The two hooks share a stamp: the per-edit hook marks that a
  source file changed, the stop hook runs the suite only when a change is waiting. A reviewer or
  explorer that edited nothing has nothing unverified behind it. This was the owner pulling a
  "later, if it bites" refinement forward, and it roughly halves the per-task column.
- **Every ambiguous case resolves toward running.** Missing state, unreadable state, and a
  same-millisecond tie all run. The one case that correctly skips is "no edit was ever recorded."
  The rule is that losing the state can only ever cost a redundant run, never a skipped one.
- **The run is stamped with the time it started, not the time it finished.** An edit landing while
  the suite was running is not covered by that run, and the finish time would swallow it.
- **The stamp lives in the system temp directory, keyed by a hash of the project path.** Nothing
  enters the repo, so there is no .gitignore to keep in step, and a cleared temp directory fails
  safe by the rule above.
- **An edit whose narrow run failed is still marked.** Narrow is not proof either way.
- **A garbled tool call falls back to the whole suite.** The old hook always ran everything, so an
  unreadable payload degraded safely for free; narrowing takes that away, so it is now explicit.
- **The stop hook does not block twice.** When the harness reports a stop hook is already holding
  the agent, a second block risks a loop it cannot escape. The debt stays on the stamp and the PR
  gate is the backstop, since the suite's before and after numbers go in the PR body regardless.

**Two things found on the way, both worth more than the speedup.**

*The project's copy of the post-edit hook still had the working-directory bug.* The user-level
template was corrected earlier the same day; this repo's copy was not, so the runner rooted itself
wherever the session's shell was standing. Standing in a source folder, it ran the tests under
that folder, passed, and reported the suite green having run 5 of 801. A gate that reports success
without doing its job is worse than no gate. Folded into this change, and the fix now lives in a
shared `project-root.mjs` because both hooks need it.

*The first draft of the tests drove the live gate instead of a fake one.* `CLAUDE_PROJECT_DIR` is
set inside the running session, so the temp-project cases resolved to this repo and read and wrote
the real stamp. The failure was loud (results inverted) rather than silent, and the fix is that
every case pins that variable to its own throwaway project. Worth recording because the same trap
is waiting for any future test of a hook that reads the environment.

**Verification.** Suite before, on main: 84 files, 842 tests, green. After: 87 files, 873 tests,
green, `tsc` clean, lint held at the recorded 15-error main baseline with nothing added and no
problems in the new files. All 31 new tests were watched failing first, for the right reason.
Both hooks were then driven end to end exactly as the harness drives them, against this repo:
a real source-file edit ran 2 files and 17 tests in 4.2 seconds where it used to run 83; a
subagent finish with that edit waiting ran all 87 files in 83 seconds and cleared the debt; a
second finish with nothing waiting exited in 0.2 seconds without running anything.

**One flake, named rather than smoothed over.** The first baseline run on main came back with 8
failures across 6 files, and did not reproduce: three subsequent full runs were green. The
failing run also took 122 seconds against the usual 68 to 83, which points at contention on the
shared remote dev-test database rather than at the code. It is left here undiagnosed on purpose,
as the first observed instance of the risk that the queued §8 database item exists to remove.

**Debt this opens, deliberately.** A narrow run cannot see a break in a file the edited one never
imports; the task-boundary full run is what covers that, so a break now surfaces at the end of a
task rather than at the end of an edit. Parallel agents share one stamp, which is safe because the
comparison is monotonic (a later finish always runs when an edit followed the last run) but does
mean two agents finishing together can both run the suite. Outside this repo and not done here:
the user-level template still carries the whole-suite version, and the user-level rule still reads
"automated hooks run tests after every file edit," which this makes narrower than the truth.

### Postscript, 12 Aug 2026: what the independent review found

Five things, one of them the gate failing for a whole class of work. Recorded in full
because the entry above would otherwise read as though the first version was sound.

**The gate did not cover main-session edits at all.** The first version registered only
`SubagentStop`, so the whole suite ran when a *task's agent* finished. An edit made by the
coordinator in the main session got its narrow run and then nothing: no full-suite run was
ever triggered by that turn ending. That is not a rare path here. Micro-PRs, one-line fixes
and post-review corrections all happen outside a task agent, and this very micro-PR was
written that way, so every edit in it had only the narrow run until the review said so. The
hook is now registered for `Stop` as well as `SubagentStop`. The cost is paid only by turns
that changed code, because a turn that edited nothing still exits in about a fifth of a
second. The requirement in the entry above was written as "caught at the end of the task,"
which quietly assumed every edit belongs to a task; it should have read "the end of the task
or turn," and that wording error is what the implementation faithfully reproduced.

**An unreadable stamp counted as no stamp, and skipped.** `readStamp` collapsed every read
failure into "absent," and absent is the single input allowed to skip the suite. A stamp
present but unreadable therefore read as "nothing was ever edited" and the gate would have
gone green permanently. Now only `ENOENT` means absent; every other error means run. The
module's header had claimed this behavior since it was written, which is worth noting on its
own: the comment was right and the code was wrong, and only a reader comparing them caught it.

**A stamp that could not be written killed both halves at once.** `markEdited` was uncaught,
so a failure to write exited 1 rather than 2, which the harness shows the human while the
agent carries on unaware, and the narrow run never happened either. It is now caught, and a
failed write widens that edit to the whole suite immediately, since the end-of-task run will
never learn the edit happened.

**Giving up quietly looked exactly like passing.** When the harness reports a stop hook is
already holding an agent, this hook declines to block a second time, which is still the right
call. It did that silently, and exit 0 with nothing printed is indistinguishable from a green
suite to both the agent and the human. It now says so on stderr.

**What the narrow run actually selects, measured rather than assumed.** The entry above
described the gap as "a break in a file the edited one never imports," which understates it.
Measured in this repo: `src/lib/events/ics.ts` selects 2 files and 17 tests, a component
selects its 9 dependents, a test file edited directly does run itself, and
`prisma/schema.prisma`, `src/app/globals.css` and any not-yet-existing file select **nothing
at all**, which `--passWithNoTests` turns into a green exit. Whole categories of file get no
per-edit signal, `schema.prisma` among them, and that file is deliberately left editable by
`protect-paths.mjs` and has the largest blast radius in the repo. This is covered by the
task-or-turn run and not otherwise, which is precisely why the missing `Stop` registration
mattered more than it first appeared: a schema edit in the main session had no automated
verification whatsoever. Special-casing known-global files straight to the whole suite was
considered and declined for now, because the turn boundary already covers them and a list of
special files is a thing that goes stale silently.

Also fixed, smaller: the project root is normalized before it is hashed, since two spellings
of one directory produce two stamp keys and that fails toward skipping; the fallback branch
returned an unnormalized path; the tests left about twenty temporary directories behind per
run; and the QA script now prints every hook's exit code and ends with a step that drives a
deliberately failing test to show a real exit 2, because the old script demonstrated speed
while never once demonstrating that a failure comes back. One assumption was also promoted
from faked to tested: an integration test now shells out to the real runner and asserts that
`related` genuinely selects a source file's tests, so a future upgrade changing those
semantics cannot pass every unit test while the gate quietly covers nothing.

Not accepted, with reasoning: the reviewer suggested climbing from the edited file's own
directory before consulting the session's project directory, which would be more correct for
a cross-project edit. Left as a comment in `project-root.mjs` rather than built, because
cross-project edits are rare, they require the owner's explicit yes under the standing rules,
and widening this hook's notion of "which project" is not a change to make inside a
performance fix.

### Micro-PR, 13 Aug 2026: the gate stops calling a runner that never ran a failure

Three hook files adopted verbatim from `~/.claude/templates/project-safety-nets/`, closing the
drift the session-start check had been reporting. The substance is one distinction the old
wording collapsed: both test hooks read any nonzero exit as "the tests failed," but a runner
that never starts also exits nonzero, so an exit code meaning *no result* was being read out
loud as *a bad result*. The template's wording says "did not come back clean" and tells the
reader to check whether the runner started. `project-root.mjs` gained the template's eight-line
note recording a third measured way that hook can fail silently: rooted in a different project,
it runs that project's suite and reports it green as verification of an edit here.

**The decision worth keeping is not the wording, it is what happens to a finding inside adopted
text.** The independent review found three problems in these files, and none was fixed. All
three are present in the template byte for byte, so fixing any of them here would recreate the
drift this change closes, and the template lives outside this repo, where a write needs the
owner's explicit yes. They were reported upward instead. Recorded so the next adoption does not
relitigate it: **a finding in template-inherited text is escalated to the template, never
patched locally.** Byte-identity is the whole mechanism, and a locally-improved copy is
indistinguishable from an un-adopted one to the drift check that has to police it.

The three, so they are not lost: `project-root.mjs` now points at "the npm note in README.md",
which exists in the template's README and not in this repo's, so the pointer dangles here, and
the paragraph's "a project that adapted this hook to run through its package manager" describes
b1-coach rather than this repo, which spawns the runner directly. `full-suite-on-subagent-stop.mjs`
kept a second message on the already-held-once path still saying the suite "is still failing",
the exact framing this change removed, on precisely the path where the overclaim bites hardest.
And "the tests covering this file" stays inaccurate on the fallback path, where an empty file
path runs the whole suite; pre-existing, and the rewrite carried it along.

**Verification.** Suite before, on main: 87 files, 880 tests, green, zero skipped, no
pre-existing failure. Suite after: the same 87 and 880, which is the expected result and not a
missing check, because the change is two string literals and a comment inside code the runner
never imports. No test asserts on these strings and none was added: a string-equality test on an
error message is brittle and buys nothing, by the owner's call. The evidence is instead both
hooks driven as real subprocesses, fed the JSON Claude Code actually sends, against a
deliberately failing test file created and removed outside the commit: the per-edit hook exited
2 and printed the new wording, and the task-finish hook exited 2 and printed its own. The
session-start drift check then ran silent at exit 0 across all three files, and no
`safety-net-exceptions.json` exists anywhere, so the silence means the files match rather than
that a difference was recorded.

**Postscript, same day: finding two was fixed after all, upstream, and it cost a test
assertion.** The entry above records three review findings escalated rather than patched, and
says the decision worth keeping is that a finding in template-inherited text goes to the
template. The owner then sent finding two back the other way: fix it in the template first,
then adopt. That is the rule working rather than an exception to it, and it is recorded here
because the entry above would otherwise read as though all three were left alone.

**The fix could not be message-only, which was not visible when the finding was written.**
`full-suite-on-subagent-stop.test.ts` asserted `toMatch(/still failing/i)` against that very
message, so the wording could not be corrected without the test going red, and the drift check
compares each hook's `.test.ts` sibling as well as the hook itself, so the test had to move in
both places or the check would report drift on a second file. The assertion now requires only
that the message is non-empty. That is not a weakening: the test's own comment says its purpose
is that the hook must not give up *silently*, since exit 0 with nothing printed is
indistinguishable from a green suite, and a phrase regex over-specified that purpose while
pinning the exact framing this work existed to remove. **The general form, worth keeping: a test
on a human-facing message asserts that it speaks, not what it says**, unless the wording carries
a guarantee somebody depends on. This is the same instinct as the owner's standing call that a
string-equality test on an error message is brittle and buys nothing; the test predates it.

**Scope note, declared rather than absorbed quietly.** The owner scoped this micro-PR as hooks
only, no product code and no test code. The test file is test code, and it changed. It changed
because the message could not be fixed otherwise, not because the scope was loose, and the
change removes a brittle assertion rather than adding one, which serves the reason the fence was
put up. Findings one and three remain unfixed on the reasoning in the entry above.

**Verification of this part.** The suite held at 87 files, 880 tests, green: an assertion was
changed, none added. The relaxed assertion was proven still capable of failing by blanking the
message and watching it go red, then restoring. The already-holding path was then driven as a
real subprocess with `stop_hook_active: true` and a failing test in the tree, printing the new
message and exiting 0, which is correct on that path because it lets go rather than looping. All
nine files the drift check compares are byte-identical to the template, and the check runs
silent. The template change was committed and pushed to the `~/.claude` backup in the same
session, with its own dated postscript in that template's README.

**Postscript addendum, same day: a fourth finding, recorded and not fixed.** The review of the
follow-on fix found something worth more than the wording it was asked about. `suite-stamp.mjs`
says in its header that a cleared temp directory "fails safe by the rule above: the run stamp
disappears alongside the edit stamp, and the next finish runs." It does not. With both stamps
gone, `needsFullRun` reads the edit stamp as absent and returns false, and absent is the one
input allowed to skip the suite, so the next finish **skips**. In the window after a temp sweep,
an outstanding full-suite debt is silently dropped; the next edit re-arms it, so the window is
small, but the comment states the opposite of what the code does. That is the same shape as the
bug the 12 August review caught in `readStamp` ("the comment was right and the code was wrong,
and only a reader comparing them caught it"), which makes it the second time this module's
prose and behavior have disagreed. `suite-stamp.mjs` is byte-identical to the template, so by
the rule this slice just set, it goes upstream rather than into this patch, and it is the
owner's call rather than this session's. Two smaller ones left alone the same way: the message
says "the next task finish" though the hook is registered for plain turn finishes too, and
"this gate has already held this agent once" reads a flag the harness sets when any stop hook
blocked, which cannot count.

## §11 entry: the chat-feed boundary (13-14 Aug 2026)

*The group home's one unmarked seam, and the card that had no fill. Both came out of
the owner's QA run on the card-state slice (note one of the 12 Aug postscript above).*

**What was actually wrong, with values, because the complaint was vaguer than the defect.**
The screen has three horizontal seams and two were already drawn: the header ends in a
hairline, the composer sits on a scrim. Between the card region and the feed there was
`marginTop: 0.75rem` and nothing else, same background above and below. The idea card was
worse than "blending": its fill was `--surface-base`, the exact value of the page and the
chat behind it, so it was a hairline outline drawn on the chat's own floor with no fill at
all.

**The decision that shaped everything after it: this was a hole in the design, not drift
from it.** The round-4 boards separate `.gh-pinned` from `.gh-feed` with padding and
nothing more, so there was no existing source to build against. That is why the fix was
sourced from a new design round rather than settled in the repo, and why the owner ran it
rather than the build agent: a fresh instance reading only the brief can return a direction
neither party had thought of, which is the property the handoff rule exists to protect. It
did exactly that, twice (see below).

**Direction A over direction B.** A gives the idea card a fourth surface, `--surface-low`
(#1f222c); B drops the whole feed onto a plane below the page. B is the more elegant idea
and the one that makes "the feed slides underneath" literally true, but it closes one and
a half complaints to A's two: under B the idea card still leans entirely on its hairline
inside its own region. B's step was also about half A's (roughly 5 points per channel
against 10 to 14), and B would have opened a debt A does not: a second ground under the
chat is a contrast question every future chat element inherits, and polish slices two and
three would have needed to know which ground they draw on. **That debt is therefore not
incurred.** Firm seam over quiet, because a hairline says where the feed begins at rest
while the scrim is what makes a message darken as it travels up, and the motion half of
the complaint is the half a hairline cannot answer.

**The honest limit, measured rather than eyeballed, and the owner's ruling on it.** The
idea card sits 1.12:1 from a confirmed card and 1.14:1 from the page, where 3:1 is the
usual floor for two surfaces being reliably tellable apart. The cause is structural: the
palette spans 1.27:1 in total from page to brightest card, so a third rung cannot be
bigger without colliding. Dark interfaces are like this. The consequence, worth keeping
because it will resurface: **fill is the weakest of the five signals separating an idea
from a plan**, behind the controls, the shadow, the title weight, and the need label.
Direction A stops it being zero; it does not make it the differentiator. The owner saw the
number and chose to ship and revisit with the app in hand, on the reasoning that every
lever here (fill value, border weight, corner treatment) is a one-line change later.

**Why the seam is a component and not three style properties on the page.** `FeedSeam`
exists because the page is server-rendered and cannot be unit tested here, and the scrim
carries a real failure mode: it covers the feed's top 18px, which after a scroll is exactly
where the topmost gauge chip sits, so an overlay accepting pointer events would make that
chip dead while the screen still looked correct. **The load-bearing structural rule, stated
here because it is easy to get wrong and invisible when wrong: the scrim is a sibling of
the scrolling element, never a child.** Absolute positioning inside a scroller resolves
against the content box, so a scrim placed inside the feed scrolls away with the messages,
which is the opposite of marking a fixed edge. Verified live in the DOM, not only in the
unit test: the seam contains the scroller and the scroller does not contain the scrim.

**The empty-state box was drawn for the first time by anyone.** It had been an inline
`--surface-raised` block in the page, as bright as a confirmed card while saying the least
on the screen. It is now the bottom rung: no fill, a dashed hairline (the roster's "not
yet" grammar), and copy that tells a member what to do, "Nothing planned yet, float an
idea in chat," rather than promising Orbit will handle it. It moved into its own component
so the copy could be tested at all.

**Two rulings recorded so they are not re-opened.** The board drew that copy with an em
dash; the owner briefly considered inverting the product-voice rule to permit em dashes in
Orbit's own speech, then kept the rule as written, so the dash became a comma. And the
empty-state box is chrome rather than Orbit speaking, which is what the "bubbles for
dialogue, notes for reference" rule decides, so the question would not have applied to it
either way.

**What was not verified, named rather than rounded up.** The real-phone daylight pass, which
is the only thing that can answer whether a 1.14:1 step reads outdoors, and which is the
accepted cost of sourcing this from static boards. And a real pointer tap on a chip sitting
under the scrim: the browser pane's input actions time out in this environment, so the
evidence is a hit test at the exact overlapping coordinate (chip 376-416, band 386-404,
`elementFromPoint` at (108,390) returning the button rather than the scrim) plus the unit
test pinning `pointer-events: none`. That is strong evidence and it is not a tap.

**Left open for the owner:** the empty-state sentence renders `--text-faint` on
`--surface-base`, roughly 3.8:1, under the 4.5:1 AA floor for 15px text, and the copy it
replaced used `--text-secondary` at about 9:1. The board specified the token, so this is
the design being followed rather than an implementation slip, which is why it was raised
as a question rather than quietly changed.

**Tooling note, recorded because it cost time.** The Claude Design MCP connector is an
authoring workspace, not a channel for submitting a brief: its tools write files into a
design project. Running a design round still means the owner pasting the brief into the
app. Its read path is the half that earns its keep, and it is how round 7 reached the repo.

**Verification.** Test baseline 87 files / 880 tests green at slice start, matching the
previous slice's finishing number, with no pre-existing failures; 89 files / 888 tests
green at the end, `tsc` clean. Four states were looked at in a browser at 390x780: the
idea and confirmed cards at rest, the feed scrolled with a message cut at the edge, the
single idea card with no peek and nothing beside it to borrow contrast from, and the empty
region. **That third one closes a gap the card-state slice carried:** the ideas-only card
region was covered by neither a test nor a walkthrough, and it has now been seen.

**Postscript, 14 Aug 2026, from the owner's QA run on the branch (PR #66), before merge.**
Written on the branch rather than after it, per the correction recorded on 12 Aug. Six notes,
cleaned up for clarity but not for content.

*The fill worked, and it is the last thing fill will be asked to do.* The idea card now stands
out from the chat and no longer blends. But it still reads too close to a confirmed card, which
matches the 1.12:1 measurement taken before the build. **The owner's ruling: background colour
is no longer the lever to pull on this problem.** Whatever separates a maybe from a plan next
will be structural, a shape or a mark rather than a value; a carve-out on the card's top corner
was floated as one candidate and explicitly left undecided. Also worth keeping as evidence
rather than opinion: the card already carries two text signals, a teal NEEDS YOUR VOTE and a
title ending in a question mark, and neither landed. That is data about those two signals, not
an argument for a third.

*The two biggest complaints turned out to be one bug, and it is not this slice's.* The cards are
too tall, which squeezes the chat into a strip on a phone; and a promoted short card carries a
large hollow middle. Both come from one rule: every card sets `height: 100%` and the rail renders
at its tallest card's height, so the tallest card (a confirmed one carrying a venue line, a
counts line, the RSVP pair and a time-change notice) sizes every card beside it and the whole
region. That rule arrived with the card-state slice on 12 Aug, and `EventCard.tsx` even carries a
comment predicting this exact failure as its reason for keeping the time-change to a one-line
notice. The prediction was right and the mitigation was not enough. **The owner keeps equal-height
cards as the correct call** and accepts the blank middle on a short card; what must change is the
height of the whole set.

*Registered as the pre-MVP priority, ahead of everything else queued here:* **reduce the card
region's vertical height so more chat is visible on a phone.** One concrete idea from the owner:
get the idea card's three chips onto a single row. The confirmed card carrying a time-change
notice is the harder half and has no answer yet.

*The time-change override rule is endorsed; its words are not.* The rule (a change moves the plan
on at least three yeses AND more yeses than the people still in on the old time) is the behaviour
the owner wants, and keeping needs no votes because it is the default. The screen does not say
that: the tally shows both counts rising side by side, so it reads as a symmetric race to three
and puts apparent onus on the people who want no change. **A copy problem sitting on a correct
mechanism**, worth fixing whatever happens to the larger feature.

*Two things deferred to a round-2 polish pass, explicitly not pre-MVP.* First, letting a member
answer a time-change with checkboxes ("both 7 and 8 work") instead of an either/or, which the
owner wants and judged too much added complexity this close to launch. Second, the deeper
information-architecture question the QA surfaced and which is **open, not decided**: two
different things both feel "pending" to a member, a genuinely new idea and a settled plan
somebody is trying to move. They are distinct in the product's model and identical in a user's
head. Cutting time-change-on-confirmed entirely was raised as one possible answer and is not the
only one; the owner also noted the recurring-rhythm case is the strongest argument for keeping
some plans hard to move, since the cadence is the group's identity.

*One fix applied before merge.* The empty-region sentence moved from `--text-faint` to
`--text-secondary`. The round-7 board specified faint, which measures about 3.8:1 against the
page and sits under the 4.5:1 floor for text that size; the copy it replaced used secondary at
about 9:1. A test now pins the token, because a future pass matching the board pixel for pixel
would reintroduce it silently.

*Process finding, and the reason the rest of this postscript exists.* The whole QA ran on a real
phone over the LAN, and every note above came from things a desktop browser had hidden. This is
the second time a real-screen check has caught what desktop verification missed. It became a
standing rule in the user-level rules file the same day: **anything visual gets a mobile pass
before the QA script is written.**

## §11 entry: the card region gets a height budget (14 Aug 2026)

*The slice that came out of the owner's real-phone QA on PR #66. One number was the whole
deliverable: the pinned card region took 47.7% of the screen and left the chat feed 31.5%.*

**The diagnosis in the QA note was wrong, and measuring first is why we know.** The note said the
tallest confirmed card sized the region. Measured at 390px: the **idea card was 272px** and the
confirmed card 229.4px with a time-change notice, 187.4px without. The idea card was the tall one;
the confirmed card was the one wearing the hollow middle. Of the idea card's 272px, 169px was its
ask block: a chip row wrapping to two rows because "📅 Yes, can't Mon" would not fit beside the
other two, and a tally wrapping to two lines. **Both were text-length problems, not layout
problems**, which is why the fix is mostly copy.

**The owner's phone is 661 CSS pixels, not 780.** iPhone 13 Pro is 390x844, but Chrome on iOS keeps
both its bars, and because the feed is an inner scroll region, scrolling it never collapses them.
Every share figure in this entry is against 661. A desktop browser at "mobile size" reports 780 and
flatters every number by about 15%.

**Round 8 produced two approaches and both were declined.** Approach A packed the six parts tighter;
measured against the shipped card it was **identical** (187.3 against 187.4), because its padding
savings went into a 44px tap target. Approach B re-homed two parts and did work, but it was worth 21
px only when a time change was open and **zero** in the common case, because the idea card sets the
region's height either way. The round also reported the time-change notice wrapping to two lines at
a 342px card, costing 60.9px; in the shipped app at exactly 342px it is one line at 42px, and that
did not reproduce.

**The brief carried an error that cost half the round**, recorded because the lesson is not about
this round. It stated the card's natural total as 229px while separately listing the notice as an
optional 42px part; the 229 already included the notice. So "compose this card inside 204px at
baseline" asked for something the shipped card already did at 187.4px. Approach A passed a test that
was already passing. The states that needed work were the ones the brief filed under "overflow."
**A part table that does not sum to its own stated total is the tell**, and the designer caught the
smell of it independently before building.

**The owner's answer, which beat both approaches: the time change leaves the card entirely.** Three
grounds, all his. The card was a second surface pointing at a conversation that already carried the
same chips. An RSVP and a time-change vote on one card are two decisions the product already treats
as coupled, since a passed change wipes every RSVP, so the card was asking someone to answer a
question whose premise was under dispute and then throwing the answer away. And a time change is
secondary and does not earn permanent space above the fold. This dissolved the half the round was
briefed to solve rather than solving it.

**What shipped, and what each piece was worth.** Chips lost their emoji and kept every word, 87px to
40px. The card's tally took a counts form ("2 in · one more makes it happen") while Orbit's spoken
tally in chat kept its named form, 52px to 31px. (Corrected after PR #67 QA: the card first shipped
as "2 in · one more to go" and dropped its different-day clause to fit the longer phrase, since "2 in
· 1 for another day · one more makes it happen" ran past the card's 298px ceiling and a line that is
sometimes one row and sometimes two defeats the point of this slice.) Both cards' need labels left
their own rows, the confirmed
card's joining the counts line and the idea card's joining the title. The RSVP pair rose to a 44px
tap target, the round's one adopted contribution, costing 8px and free because the idea card is the
floor. The notice was deleted, not hidden.

**Measured result at 390x661: region 315px to 224.8px (47.7% to 34%), chat feed 208px to 289.7px
(31.5% to 43.8%).** Idea card 272 to 183.8, confirmed card 229.4 to 175, and the worst cases
improved too: a two-line event title from 252.4 to 198.

**Two things the reviews found that nothing else would have.** CLAUDE.md still asserted the card and
chat share "the same tally voice", which this slice deliberately made false. And `NeedLabel` was
left with a dead code path once both cards moved their labels, invisible because the only two tests
exercising it were testing the dead branch. Both fixed before merge.

**The wrap rows are the load-bearing structural detail.** Both shared rows must wrap rather than
clip, because the card root sets `overflow: hidden`: a non-wrapping overflow is silently cut off and
still looks correct in a screenshot. Verified in a browser at the real card width and again at
doubled device text, where every row wraps and every card grows.

**A false alarm worth recording so the next session does not chase it.** The dev server log filled
with `ReferenceError`s naming code the slice had deleted. They were hot-reload artifacts from
mid-edit, and the log buffer spans the whole session. Restarting the server on the finished code
returned "No server errors found". The lesson: a long-lived dev log is not evidence about current
code.

### Postscript, 14 Aug 2026: the owner's real-phone pass on this branch

Four findings, none a defect in this slice, all queued.

**The header subline goes.** "6 members · group info & invite link" is roughly 24px of a 73.5px
header, and the owner's ruling is that it is first-run information shown forever. The chevron
already signals the title is tappable. Recorded cost, accepted: the invite link is this product's
whole distribution mechanism and the header is currently the only place it is advertised, though
onboarding step 3 already puts it in front of a founder when they first need it. Its own micro-PR.

**The time-change tally line is deleted rather than reworded, and the buttons change.** The owner
found two broken references in one line: "Casey says yes" (yes to what) and "1 would keep it" (keep
what). Rewording was drafted and rejected, and the reasoning is the part worth keeping. **A gauge
tally works because the bar is simple and the news is good; a time-change tally cannot be, because
the rule is compound** (three yeses AND more yeses than the people still in on the old time, or the
whole group when it is smaller than three) **and because naming who wants to move someone else's
plan turns a scheduling question into an argument with a scoreboard.** A line that cannot be made
brief and clear is deleted, and no reassurance line replaces it: the chip's own checkmark confirms
the vote, and Orbit announces a passed change in chat while every RSVP resets. Separately, "8pm
works" reads as availability ("8pm also works for me") when the vote is actually a preference, so
the chips become **"Move to 8pm" / "Keep 7pm"**, symmetric, and echoing the question above them.

**Add to calendar moves to the top of the event screen.** Sitting below the time-change block, it
read as saving the proposed time when it saves the current one. Ordering implies scope. Putting it
inside the details card is the stronger semantic answer and was deliberately not taken: "we can
always complicate our lives later, but it is harder to uncomplicate things."

**Three-way voting stays parked.** The owner re-derived the checkbox idea (only 7pm / only 8pm /
both) and then talked himself out of it on the merits: if 8pm wins but strands the people who could
only do 7pm, the vote has optimised the wrong thing. Fixing that properly turns a preference into an
availability grid, which is a real feature. Unchanged from its 14 Aug deferral.

**And the cost this slice knowingly takes on.** With the notice off the card and the tally deleted,
a stalled time change is now completely invisible, and `ChangeProposal` has no expiry, no close and
no bump: the hourly cron runs only `reconcileScheduledEvents` and `runGaugeEndgame`. A proposal
nobody answers sits open forever. **This makes "the time change gets an ending" the next slice, and
load-bearing rather than tidy-up.** An owner proposal for a preventive "speak now if you want a
different time" nudge on every event was declined in favour of it, because it would spend a nudge on
every plan to prevent an occasional problem.

**Queued post-MVP: a detail page for a pending idea.** The owner tapped the "beers?" card, nothing
happened, and he assumed it was broken. It is by design, since an idea has no detail screen, but a
tap that does nothing beside a card that responds is a silent failure. Recorded as a candidate
answer to the idea-versus-plan distinctness question rather than only as a missing page: **"one of
these opens and one does not" is already a structural difference**, which is the kind of signal the
owner has been looking for since ruling out background colour, and a real page would carry the
explicit copy an idea card has no room for.

**Verification.** Baseline 89 files / 889 tests green at slice start, matching the previous slice's
finishing number, no pre-existing failures; **89 files / 906 tests green** at the end, `tsc` clean,
eslint clean. The final review reproduced the 889 baseline independently from the branch point
rather than taking it on trust. Six tests were removed across the branch and each was traced
individually to behaviour that no longer exists. The region and card heights are browser
measurements, not test evidence, because the page is server-rendered and cannot be tested here.

**Added 14 Aug 2026, after the entry above: the endgame slice is a close, not a close plus a nudge.**
The owner's own read, and it narrows the next slice rather than growing it. A last-call nudge before
a stalled time change closes was considered and deferred post-MVP: it opens a decision tree (how
long after the ask, how close to the event, what if the event is weeks out, does a second nudge ever
fire) that is not worth paying for something that should be the exception rather than the core use
case. **So the MVP shape of "the time change gets an ending" is: it closes, and it says so. No
bump.** Worth recording alongside it, because it will come up when the slice is written: unlike an
idea gauge, a time change already has a natural anchor for a nudge if one is ever wanted, since the
event it belongs to has its own start time. That makes the deferred question smaller than it looks,
but it is still a question, and the owner's call is that the MVP does not answer it.

**Added 14 Aug 2026: the three-vote bar does not adapt to a small group, and that is deferred
post-MVP.** `SPARK_THRESHOLD` is a hardcoded 3 and the gauge's promotion check is a flat "three or
more yeses", with no small-group handling. The time-change vote does adapt (three, or the whole
group when it is smaller than three); the gauge never got the equivalent. So in a two-person group
an idea can never become an event, while Orbit says "if three are in, I'll set it up".

**The owner's call: leave it, revisit post-MVP.** His reasoning, which is the product argument: a
group of two does not need a coordinator at all, so it is not worth designing for. The engineering
argument agrees. `reachedThreshold` receives only the votes and has no member count, so adapting the
bar means threading that through it, its call sites, the countdown, and the endgame's
would-have-cleared check, plus the copy in at least two of Orbit's messages that say "three" out
loud. And it needs a floor decided first, because the same relaxation in a one-person group would
let a founder's idea promote by themselves.

**The nuance that makes deferring safe, recorded because it is the part that could change the
answer later:** two members is a transient state every group passes through between creation and
the third join, not only a permanent small-group case. What keeps it tolerable is that the failure
is honest rather than silent, since Orbit states the bar out loud even when the group cannot meet
it. If that copy ever stops naming the number, this moves from deferred to a real gap.

---

### Micro-PR, 17 Aug 2026: the header subline goes

The group home's header carried "N members · group info & invite link" under the group name from
polish slice one until now. It is deleted, along with the `memberCount` prop that fed it and the
page's now-unused local; the comment explaining why that count is safe to read straight off the
already-fetched memberships moved down to the group-proposal tally, which is the only remaining
reader on this page.

**The owner's reasoning, which is the part worth keeping.** It is first-run information shown
forever, and he designs for the second and fifth use rather than the first. The chevron beside the
name already carries the "this opens something" signal, so the subline was spending permanent
vertical space to restate a one-time discovery. On a screen where the 14 Aug phone pass established that vertical
space is the scarce resource and the chat is what pays for it.

**Measured, and smaller than the estimate.** The 14 Aug note put the subline at "roughly 24px of a
73.5px header". Rendered at 375px wide, the header measures **73.5px with the subline and 57px
without it, a 16.5px gain**, taken by re-injecting an identical span into the live header and
re-measuring rather than by subtracting two guesses. The 73.5px total matches the phone pass
exactly, so the delta is the part that was estimated high. Still worth taking, and it is real
chat height, but the honest number is 16.5px.

**The cost, accepted rather than overlooked.** The invite link is this product's whole distribution
mechanism, and this header was the only place in the running app that advertised it. What makes the
trade acceptable is that onboarding step 3 puts the link in front of a founder at the exact moment
they first need it, and the group info page still carries it with a share button. What it does mean:
a founder who dismisses step 3 and later wants the link has to find it behind an unlabelled chevron.
Recorded as a known cost of this deletion, not as a defect, and worth revisiting if anything ever
suggests groups are failing to grow.

**What the independent review found, and the one that mattered.** Five findings, all fixed. The
serious one: **the subline was also the link's accessible name.** The chevron cannot stand in for
it, because `Chevron` is `aria-hidden` on the stated invariant that it always sits beside text
naming the destination, and after this deletion it did not. Since this link is the only route in the
whole app to the group info page, and that page is the only in-app home of the invite link, member
management and leave-group, a screen-reader user was left with "Climbing Crew, link" as the entire
signpost. Fixed with an `aria-label` on the link, which costs no pixels and so takes nothing back
from the deletion; the point of the change was vertical space, never the semantic. A test asserts
the label and was shown failing without it.

The other four: the component's own comment still carried the ~24px estimate the docs had just
corrected; CLAUDE.md said onboarding step 3 was now the "sole" place the invite link is put in front
of a founder, which the group info page's own share button contradicts (reworded to "unprompted");
`PageHeader`'s comment used "the group home's two-line header" as its example of growing with
content, and that second line was the subline (the rule it illustrates is unchanged, only the
example was stale); and the absence test was two negatives with no positive anchor, so a component
rendering nothing at all would have passed it. Nothing was left deliberately unfixed. The review
also recorded one thing not to "clean up" later: `flexDirection: column` on the info link is
load-bearing for centering even with a single child.

**Added the same day, after the owner's phone pass: the carousel's dot row goes too.** Same screen,
same purpose, so it rides this micro-PR rather than opening a third concurrent one. His read, and it
is the right one: **the next card already peeks past the right edge, so the dots restate a signal
the layout is giving anyway**, and on this screen a row is the scarce thing. Measured the same way
as the subline, by re-injecting an identical row into the live rail: the dot row costs **17px, and
the feed gains exactly 17px** when it goes. With the subline that is **33.5px of chat back** from
this one PR.

The deletion took more than a row. `CarouselRail` tracked the snapped index off scroll position so
the marker could never disagree with the card actually showing, which is why it was the only client
component in the card region; with the dots gone it holds no state, no scroll listener, no ref, and
no `snappedIndex` helper, and is a styled flex row. It also stopped being a client component, which the
first draft of this entry got wrong: it claimed the "use client" boundary was what let the
server-rendered cards pass through as children, and that is circular, since passing children through
is the workaround for being a client component rather than a reason to be one. With no hook and no
handler left, the directive was shipping a styled div to the browser to hydrate it into the same
styled div. `cardCount` went with it, down to a `peek` boolean: the count only ever existed to size
the dot row's array, and EventCarousel already derives the same fact for each card's width. Two of its
four old tests were about dots and two about the snap math those dots needed; the three now assert that no dot
row renders, that more than one card still gives a snapping scroller with a hidden scrollbar, and
that a single card neither scrolls nor snaps, which is the behaviour a swipe carousel actually owes.

**Verification.** Baseline on main before the branch: 89 files / 905 tests green, zero skipped, no
pre-existing failures. After: 89 files / 905 tests green. The two subline assertions ("8 members ·
…" and the singular "1 member · …") were replaced by one asserting the subline is absent, and the
review added one asserting the link still names its destination for assistive tech, so that file
goes up by one; `CarouselRail.test.tsx` then went from four to three when the dot row left, so the
total lands back on 905. The component test was rewritten red
first and shown failing against the old component before the deletion, so the new assertion could
have failed. `tsc --noEmit` clean. eslint reports the same two pre-existing errors as main, both in
files this change never touches (`OnboardingWizard.tsx`, `ResetInviteLink.tsx`).

**One anomaly, recorded because a red run appeared and was not real.** The first full-suite run on
this branch reported 8 failures across 4 files and took 562 seconds against a normal 175. It
overlapped the `Stop` hook's own full-suite run from the preceding turn, and the suite talks to the
shared dev-test database, so two concurrent runs collide. Two consecutive clean runs followed at
normal duration. Worth knowing: a suite run started in the turn immediately after a turn ends can
race the hook, and the resulting red is contention rather than a defect.

**A number correction, since this branch is where it surfaced.** The card-region-height entry above
records 906 tests at that slice's finish; main measures 905. Both readings are green with no
failures, so this is a one-test bookkeeping difference (most likely a test removed during that
branch's own QA-fix round after the entry was written), not a lost or broken test. The 905 measured
here is the number the next slice should cross-check against.

---

### Micro-PR, 17 Aug 2026: the event-copy pass

Four pieces of copy, one shared diagnosis: the product was saying the same thing twice on the same
screen, and the second telling was the one doing damage. Three of the four were queued by the 14 Aug
phone pass; the other two (the gauge tally's countdown and the spark message) were settled after
that entry was written and are recorded here for the first time.

**1. The time-change tally is deleted, not reworded.** It read "Casey says yes · 1 would keep it".
The 14 Aug pass caught both halves referring to something the reader cannot see (yes to what, keep
what) and the owner's ruling was deletion. The reasoning, which is what a future session needs when
it is tempted to add a tally back: **a gauge tally works because its bar is simple and its news is
good, and a time-change tally can be neither.** The rule is compound (three yeses AND more yeses
than the people still in on the old time, or the whole group when it is smaller than three), so no
brief line states it truthfully, and naming who wants to move someone else's plan turns a scheduling
question into an argument with a scoreboard. **Nothing replaces it**, deliberately: the chip's own
checkmark confirms the vote landed, and Orbit announces a passed change in the feed while every RSVP
resets.

**What went with it, because the owner asked for the trail and not just the function.**
`buildProposalTallyLine` is gone from `change-copy.ts`, replaced by a comment explaining why not to
write it again. `oneMoreClearsIt` is gone from `consensus.ts`: its only caller was that countdown
clause, and a dead exported function with its own test file reads as live code. `hasConsensus`,
`consensusFloor` and `incumbentCount` are untouched, since they decide whether a plan actually
moves. `deriveGroupProposalTally` no longer takes `memberIds` or `memberCount`, because the
member-filtered vote arithmetic existed only to feed the tally; it now composes two chip labels and
the viewer's own answer. `GroupProposalTally`, the little renderer, is gone, and with it
`MessageFeed`'s non-member branch, which had existed to show a reader who could see the group but
not vote where things stood. That branch is unreachable today (the share-readiness wall) and there
is no count left for it to show; if viewing is ever loosened, a non-member now sees Orbit's question
with no answer of their own, which is the honest shape.

**2. The chips name outcomes, not availability: "Move to 8pm" / "Keep 7pm".** "8pm works" reads as
"8pm also works for me", which is an availability answer, and this vote is a preference between two
times. A member answering one question while the product records the other is exactly the drift RSVP
accuracy cannot afford. Both labels stay soft and neither is teal, so the teal-never-leans-an-open-
question rule is unaffected.

**3. The gauge's chat tally drops its countdown: "Sam & Jordan are in so far".** Names and the
different-day clause stay. The principle is the one to carry forward, because it decides the next
argument of this kind rather than just this one: **each surface states the bar exactly once.**
Orbit's own message sits directly above this line and already says "if three are in", so the tally
repeating it was the second telling. The idea card's tally keeps "one more makes it happen" for the
mirror reason: nothing on the card states the bar anywhere else. That is why the two tally voices
diverged again a week after the card-region-height slice created them, and it is not an
inconsistency to tidy up later.

**4. Orbit's spark message shortens to "Love it. Beers this Tuesday? If three are in, I'll set it
up."** Measured at two rendered rows against three. The redundancy was asking twice: "Anyone in for
beers this Tuesday?" and "If three of you are in" are the same question. What was cut is the
repetition, not the warmth, which is why "Love it." and the promise both stay. The activity now
opens a sentence so it is capitalised, which also lines it up with the idea card's own title
("Beers?"). Untouched, and flagged rather than changed because it is out of this pass's lane: the
wrong-day revival message still says "If three of you are in, I'll set it up.", so two Orbit
messages now phrase the same promise two ways. **Open question for the owner rather than a silent
fix.**

**What the independent review found.** Ten findings, seven fixed here and three left standing on
purpose. Fixed: `deriveProposalBands` still declared `memberIds` and `memberCount` on its input
after the inner call stopped taking them, so the event page was building a Set for nobody, and a
test was documenting the dead interface as live; `MessageFeed`'s prop doc still described the
non-member tally split this change deleted; the QA staging script still told a tester to look for an
"8pm works" chip and a tally; the `ACTIVITY_MAX` comment still used the retired sentence as its
example; and `GaugeChips` still pointed at `pending-surface.css`, a stylesheet that left with the
pending panel, which is the twin of a dangling pointer this change removed from `GroupProposalChips`
(named here because it is a touch outside the change's own lane). Two of the fixes were test
quality, and both are worth recording as a pattern: **an absence assertion against a fixture that
can no longer carry the thing cannot fail.** `ProposalSection`'s new "no tally" test asserted three
missing strings against a fixture with no `tallyLine` field at all, so it was green by construction;
it now pins the section's entire rendered text. `tally.test.ts` did the same with `"tallyLine" in
tally`, and now asserts the whole key set. Also fixed: the `indentPastAvatar` prop on
`GroupProposalChips` had lost its last real consumer with the tally, since every non-default caller
also passed `rowMargin`, which overrode it; one knob replaced two.

**Left standing, deliberately.** The verification accounting in this entry was wrong in every
component while landing on the right total, and it is corrected below rather than left as written,
which is the one place the review changed a claim rather than the code. The wrong-day revival
message (`buildSuggestedRetryMessage`) still says "Anyone in for beers this Sunday? If three of you
are in", so a group whose idea fails and revives can see both phrasings of the same promise in one
feed; that is out of this pass's lane and goes to the owner as a question. And the chat question
above the new chips still ends "Works for you?", which is the availability framing the chip change
exists to remove: the chips now read "Move to 9am" under a question asking whether 9am works. The
event screen's own question ("Move Friday beers to 8pm?") already matches. **This is the finding
worth the owner's attention**, because most votes are cast in chat, and it is a one-line change that
nobody asked for, so it is surfaced rather than taken.

**Verification.** Baseline on main at branch point: 89 files / 905 tests green, zero skipped, no
pre-existing failures. After: 89 files / 899 tests. Seven removed and one added,
counted per file rather than asserted from memory: `change-copy.test.ts` 21 to 20 (the tally
builder's own test), `tally.test.ts` 6 to 4 (the empty-line case and the countdown case; the
names-and-keeps case was rewritten in place, not removed), `consensus.test.ts` 17 to 14 (all three
`oneMoreClearsIt` cases), `GroupProposalChips.test.tsx` 6 to 5 (the component rendering nothing when
the line was empty), and `ProposalSection.test.tsx` 2 to 3 (an added assertion that nothing renders
under the chips). Every changed assertion was edited first and shown red against the old code before
the implementation. `tsc --noEmit` clean; eslint carries the same two pre-existing errors as main,
in files this change never touches.

**Checked in a browser at 375px, against a freshly staged group, not asserted from tests.** Orbit's
gauge message renders as two rows ("Love it. Beers this Thursday? If three are in, I'll set it
up.") with "Sam & Jordan are in so far" under it and no countdown, while the idea card two inches
above still reads "2 in · one more makes it happen", which is the two-voices decision visible in
one screen. The time-change vote renders on the event screen as label, question and two chips and
literally nothing else (read back as "Time changeMove Trivia Night to 8pm?✓ Move to 8pmKeep 7pm"
after voting), and the same chips render in chat with no line beneath them. A vote was cast and the
checkmark is what confirmed it, which is the claim the deletion rests on.

**The model evidence, which this change needed and would not obviously have needed.** Orbit's
detection reads the last twenty feed messages, Orbit's own included, so changing the spark message
changes the context the model reasons over, and the recognition bench had that old wording hardcoded
in ten fixtures. Run 1, before touching anything: **80/80 must-recognize, 65/65 must-stay-quiet,
10/20 ambiguous**, reproducing the recorded baseline exactly, the same two ambiguous cases failing
as they have since they were written. The fixtures were then updated to the copy the product now
posts, and run 2 came back **identical on all three buckets**, same two ambiguous failures. So the
shorter message costs nothing in recognition. Worth recording as a habit rather than a one-off: a
bench fixture holding a copy of Orbit's own words is a flattened copy of the product, and a copy
change that skips the bench leaves it testing a conversation that no longer happens.

**Postscript, 17 Aug 2026: the owner's phone pass on this branch, and one thing it changed my mind
about.** He tapped "Move to 8pm" on the event screen and reported the plan had not moved. It had
not, and that is correct: the group had five members, so the floor was three, and only Casey's
auto-seeded yes plus his own were on the board. Verified against the rows rather than reasoned
about, since a QA report of "nothing happened" deserves a look at the data:
`Casey=YES, Rae=KEEP, Jacob=YES`, two against a floor of three, proposal answer still null. **The
error was mine, in the QA script, which told him to expect a move; I had computed the arithmetic
from a different staged group where a third yes already existed.**

**What that accidentally proved is worth more than the mistake.** He tapped, his vote landed, and
the screen told him nothing: not that it registered in a way he trusted, and not that the bar was
two short. He asked for a short confirmation ("thanks for your vote, we'll let you know if the time
changes") and queued it post-MVP himself. Recorded here with a recommendation attached, because this
entry is the one that deleted the tally: **the deletion is right and the confirmation gap is real,
and they are the same gap.** The tally was the only thing on that surface saying where a vote stood,
so removing it makes a one-line acknowledgement worth more than it was worth a week ago. My
recommendation is that it lands inside "the time change gets an ending" rather than post-MVP, since
that slice is already opening this exact surface and a close with no bump needs something to say
when a member votes into it. The owner's call, and his stated position is post-MVP.

---

### Micro-PR, 17 Aug 2026: "Add to calendar" moves above the time-change vote

One reorder on the event screen, queued by the 14 Aug phone pass: the calendar button now sits
directly below the details card, above the TIME CHANGE block, instead of below it. "Top of the
event screen" from the queue was read as above-the-vote rather than above-the-details-card, since
a save button ahead of the details it saves would trade one scope confusion for another; assumption
stated in chat before building.

**Postscript, 18 Aug 2026: that assumption was questioned and then ratified, so it is now a
decision, not a reading.** At PR review the owner recalled the intent as literally above the
details card. The concern raised against that placement: it makes an export action the first thing
on the screen, before the plan it exports, and it pushes the details card, which carries the RSVP
pair, one block down on every visit to promote a button most members tap once. The owner chose to
keep the as-built order (details card, then the pill, then the vote). Do not re-derive from the
phrase "top of the event screen" in the queue or the 14 Aug postscript; this postscript supersedes
that wording.

**The old order was mechanism-true and read wrong, which is the pattern worth keeping.** The
original comment placed the vote first "because a vote here amends the very time that button would
save", which is a fact about the mechanism. But ordering implies scope: sitting below the proposal,
the button read as saving the PROPOSED time, when it always builds the file fresh from the current
stored plan. The button now sits with the card whose time it actually saves, and the vote reads as
its own matter below. Putting the button inside the details card was the stronger semantic answer
and stays deliberately not taken ("we can always complicate our lives later"). Nothing about the
button's behavior changed: a tap after a passed change still carries the moved time, because the
file is built from the stored plan at each tap.

**Verification.** Baseline on main at branch start: 89 files / 899 tests green, matching the
event-copy pass's finishing number, no pre-existing failures. After: unchanged, 89 files / 899
green, `tsc` clean, because the change is a reorder of two JSX blocks in a server-rendered page the
suite cannot reach; the evidence is the rendered screen, checked at 375px against a staged group
with an open proposal: details card, then the teal pill, then TIME CHANGE, then the roster.

---

## §11 entry: the time change gets an ending (18 Aug 2026)

**The gap, in one sentence.** A group time-change vote could never end. Its chips already stopped
rendering at the right moment, because liveness is derived rather than stored, but the row stayed
unanswered forever and nobody ever heard an ending. That was tolerable while the vote carried a
tally and the confirmed card carried a notice; the card-region-height slice removed the notice and
the event-copy pass deleted the tally, and between them a stalled proposal became completely
invisible. This slice closes it and says so, once.

**What ships.** `ProposalAnswer` gains `LAPSED`, the vote that ran out of time unanswered.
`runProposalEndgame` rides the existing hourly cron beside the gauge sweep. A lapsed vote records
LAPSED and posts one soft line, "The time change didn't come together. Trivia Night is staying at
7pm.", with the answer and the message written in one transaction so a close can never half-exist.
A vote made moot, because the plan moved by some other path, records SUPERSEDED and says nothing.
Plus two riders the owner approved at the go gate: the chat question ends "Move it?" instead of
"Works for you?", and a member who has voted sees one quiet line on the event screen.

**SUPERSEDED was reused rather than a second new enum value added.** It already meant "overtaken
before the group answered", which is exactly what a moot vote is; the only difference is what did
the overtaking (a newer proposal, or the plan moving some other way). Recorded because a future
reader will find one enum value covering two shapes and wonder whether that was an oversight.

**The two silences are different and both deliberate.** A lapsed vote speaks because somebody asked
the group for something and is owed an answer, and because nothing else on any surface would say
the vote ended. A moot vote stays silent because the read layer already retired the question the
instant the plan moved, with no residue anywhere, and announcing a vote nobody could still see
would be Orbit talking about its own bookkeeping. Both have rows in the speak-or-stay-quiet
register above, as does the third decision here: a close landing after the event has already
started still posts, because the cron is hourly and never-leave-a-direct-ask-hanging outranks
anti-clutter for a question somebody actually asked.

**Why the boundary is mirrored rather than restated.** `read.ts` is the single source of truth for
when a proposal stops being answerable, and the sweep derives its own boundary as that rule's exact
complement instead of re-deriving one. The review checked the two against each other case by case,
including both `min(proposed, startsAt)` orderings and the equality edges, and found no state where
the chips are dead but the sweep never closes, or where the sweep closes something still
answerable. Tests now pin the equality instant on both sides at once: the read layer is asserted
live at one millisecond before and empty at the instant itself, so the mirror is pinned rather than
one half of it.

**The riders, and why the acknowledgement is a rendered line and never a message.** The chat
question asked "Works for you?", an availability question, above chips that answer a preference
between two times; the event screen's own question already matched, so this was one surface
disagreeing with itself. The acknowledgement ("Vote counted. If enough of the group agrees, I'll
move it and let everyone know.") renders under the chips for a viewer who has voted, and nowhere
else. It is not a chat message, because chip responses posting a message per response is exactly
what the anti-clutter guardrail forbids, and it names nobody, counts nothing, and states no bar, so
it does not smuggle back the tally the previous slice deleted on purpose.

**Three implementer decisions the slice document had not settled, all upheld by the review.** Moot
rows are swept immediately rather than waiting for the time boundary, because the read layer
retires them the instant the plan moves and the bookkeeping row has nothing to wait for; this also
keeps the lapse copy honest, since "staying at 7pm" is only ever posted when the prior time is
still the event's time. `answeredAt` uses the sweep's own `now` argument rather than a fresh
timestamp, keeping tests deterministic without mocking the clock. And there is no coarse date
window on the candidate query, unlike the gauge sweep, because the `answer: null` filter already
shrinks the set on every pass, while a window would add the gauge sweep's own failure mode: a cron
outage longer than the window strands rows unclosed forever.

**One behavior change nobody had written down, surfaced by the review.** Before this slice, a moot
proposal could theoretically revive: liveness is derived, so if the plan moved away and then back
to the original time, the question would have become answerable again. Writing SUPERSEDED forecloses
that. It matches `read.ts`'s documented semantics ("a move by any other path silently retires the
question") and is a hardening rather than a regression, but it was implicit and is now recorded.

**A correction to this slice's own document, worth keeping.** Task 1 said to record the SUPERSEDED
reuse "in the migration's comment". That instruction is wrong and was not followed: Prisma
checksums applied migrations, so editing the SQL after it is applied makes the next `migrate`
report the migration as modified. The reuse is documented in `schema.prisma`'s enum doc-comment and
here instead. Any future slice document should say schema comment, not migration comment.

**Verification.** Baseline on main at slice start: 89 files / 899 tests green, matching PR #70's
finishing number, no pre-existing failures. Finish: **90 files / 914 tests green**, `tsc --noEmit`
clean, eslint carrying only the same two pre-existing errors in files this slice never touched.
The suite grew by 15: seven sweep integration tests, two copy tests, two component tests for the
acknowledgement, and four added by the review's findings (two equality-edge, two concurrent-race).
Every sweep test is group-scoped without exception, which is not a style preference: an unscoped
sweep in a test writes real Orbit messages into every group in the shared dev-test database,
permanently, as the gauge endgame learned once already.

**The race was proven, not argued.** The most delicate code here is the close losing a race to a
confirming vote. Two tests cover it: a `Promise.all` two-sweep race mirroring the gauge precedent,
and a deterministic one that spies on the transaction to commit a CONFIRMED answer between the
sweep's candidate read and its close write. Both assert the same three things: the loser returns
`already_answered`, the winner's answer is never overwritten by LAPSED, and no orphaned Orbit
message survives the rollback. Each was shown failing against a deliberately weakened guard.

**The model evidence, and a finding that is not this slice's.** The recognition bench was re-run
because the chat question's copy changed and Orbit reads its own messages as context. Full bench on
the branch: **78/80 must-recognize, 65/65 must-stay-quiet, 10/20 ambiguous** against a standing
baseline of 80/80, 65/65, 10/20. One case regressed, `bare-ask-no-plans`, and it is not caused by
this slice: the intent prompt and the bench harness never import `change-copy.ts`, and that case
has an empty calendar with no Orbit message in its history, so the changed string cannot enter its
prompt. Confirmed by running the case on main, where it fails too (7/10 on main, 3/10 on the
branch, both far from the 5/5 it scored twice on 17 Aug; the branch-versus-main spread is within
noise at n=10). **The regression predates this slice and reads as model-side drift**, on a day when
the API returned 529 overloads repeatedly. It matters because the failing behavior is a direct ask
met with silence, which is the exact bug the 29 July recognition tune-up existed to fix. Registered
as its own investigation, not a passenger on this PR.

**Debt this slice creates or leaves standing.** The close lands on cron resolution, so it can be up
to an hour late, and occasionally after the event itself started; accepted, same precision the
gauge endgame accepts. Part-one VERIFY rows still linger unanswered forever, untouched by the
sweep; invisible either way, since their chips already die at the boundary. No bump before a close,
the owner's standing deferral from 14 Aug. And the new migration is item 11 on the pre-deploy
checklist.

**Walkthrough evidence, and one thing it corrected.** Staged two votes in one group and swept by
hand rather than waiting an hour for the cron: a live vote six days out, and one whose proposed time
had passed two hours ago while its event was still three days away, which is the ordering that
proves the boundary is `min(proposed, startsAt)` rather than the event date. After one sweep: the
dead vote recorded LAPSED with exactly one Orbit line ("The time change didn't come together. Board
games is staying at 2:41pm."), the live vote's row was untouched with its chips still working, and a
second sweep produced nothing new. The acknowledgement line renders under the chips only after the
viewer votes, on the live vote's screen. **The correction:** the first draft of the QA script told
the owner to vote on the lapsing event before sweeping, which is impossible: its chips were already
gone, because liveness is derived and they stop at the boundary on their own. That is exactly the
gap this slice exists to close, and the script now says so instead of asking for a click that cannot
happen. Also recorded so it does not read as a bug later: Orbit names the activity label rather than
the event title, so the closing line says "Board games" where the card says "Board Games", the same
idiom the gauge closure uses.

**What the final whole-branch review found, and the one that mattered.** Five findings, four fixed.
The serious one was mine and was in the QA tooling, not the product: both new scripts hand-rolled a
dev-test guard that regex-parsed `DIRECT_URL` alone, while the writes actually travel over
`DATABASE_URL`, and the file header claimed it checked all three sources when it checked one. A
mixed `.env` would have walked straight through it into production. Both now import `judge` from
`db-which.ts` like every sibling script, which is the sanctioned path and exists precisely for this.
**The lesson is not "be careful", it is "the shared guard already existed and I wrote a new one":**
under the two-databases rule, a hand-rolled check next to a sanctioned one is a defect even when it
happens to pass today. Also fixed: the new `ProposalAnswer` doc-comment said CONFIRMED was
part-one-only (a passed GROUP vote stamps it too, via move.ts) and that LAPSED is the only ending
Orbit speaks about (CONFIRMED announces the move); `qa-sweep.ts` claimed to make "the same calls the
cron route makes" while deliberately omitting reconcile; and a new test fixture had planted a fresh
copy of the retired "Works for you?" string. Left standing as a note: the `Promise.all` race test
depends on both candidate reads dispatching before either commit, which it cannot enforce, so it can
flake in principle; it mirrors the gauge sweep's accepted precedent and the deterministic spy test
next to it is the one that actually proves the guard.
---

### Micro-PR, 19 Aug 2026: the bench gets a fourth bucket, and a known gap gets accepted

**The decision, which is the owner's and not an engineering tidy-up.** `bare-ask-no-plans` scored
10/10 across two full-bench runs on 17 Aug and 12/20 on main over the two days after. The 18 Aug
reading was taken on a day the API returned 529 overloads repeatedly, so it was registered rather
than acted on, with a re-run on a calmer day as the next step. That re-run came back **5/10 on main
with the API behaving normally**, so the answer is drift, not weather: if the true rate were the
~60% now measured, a 10/10 run would happen about 0.6% of the time (0.6^10). An earlier draft of
this entry said 2%, which was a different test's number (a Fisher exact comparison of the two
samples, p is about 0.022) pasted under a sentence describing the simpler one. The correction cuts
against nothing: the smaller number argues harder for drift, which is the conclusion either way. The owner looked at what that means
for a member and accepted it.

**What was accepted, stated in member terms rather than bench terms.** About half the time, someone
typing "can we move it?" into a group with an empty calendar gets nothing back, instead of Orbit's
honest "I don't see any plans on the calendar right now." That is the second-best of the three
possible outcomes. The owner's own ranking, and the basis of the decision: the honest answer is
best, silence is tolerable, and inventing a plan would not be.

**The acceptance rests on a verified claim, not a remembered one.** Invention is structurally
unreachable on this path. `NO_PLANS_REPLY` in `change-copy.ts` is a fixed string constant, and
`change-plan.ts` reaches it by counting the group's actual stored events and finding zero. The
model's entire contribution to this path is the classification "is this a request to change a
time"; every reply body in that ladder is either a constant or composed from stored rows. The model
never holds the pen, so it cannot write a plan that does not exist. This was read out of the code
before the decision was made, because the whole acceptance depends on it.

**Two facts that made accepting defensible rather than resigned.** The drift is isolated: the other
15 must-recognize cases held at 5/5 in the same run, so this is the weakest case in the set moving,
not Orbit getting generally worse at hearing people. And the trigger is rare in real use, since it
needs an empty calendar as well as the bare ask, which is essentially a brand-new group before
anything has been scheduled.

**Why the case moved buckets, which is the part that is engineering.** Leaving it in
`must-recognize` would have left that bucket reading 78/80 permanently. **A bucket that is always
red stops being a signal:** the next session either re-runs this whole investigation from scratch or
learns that red is normal, and the second one is how a bench quietly dies. So the bench gained a
fourth bucket, `accepted`, deliberately NOT the existing `ambiguous` one: ambiguous means the input
has no right answer, and this input has a perfectly clear right answer that Orbit does not reliably
reach. Conflating the two would have hidden the distinction that matters. The case is still run,
still scored, and still printed in the failures list, so a further slide or a recovery is visible;
it simply carries no bar. `must-recognize` reads 75/75 again, and a red bar means something.

**The rule attached to the new bucket, so it cannot become a dumping ground.** On its face
`accepted` looks exactly like lowering a bar to turn a red bench green, which is why the type's own
doc comment says so out loud. Anything moved into it needs a dated build-notes entry naming who
accepted it and why. This entry is the first.

**Verification.** Suite untouched at 90 files / 914 tests green (this change touches only bench
fixtures, the bench runner's scoreboard, and docs; no product code, and the bench is deliberately
outside the test suite). `tsc --noEmit` clean. Full bench after the move: **must-recognize 75/75 with
15/15 cases clean, must-stay-quiet 65/65 with 13/13 clean, ambiguous 10/20 (the same two known
cases), accepted 4/5.** That 4/5 is a further data point on the same case rather than a target, and
it is consistent with the ~60% pooled rate.

**Revisit triggers, recorded so this is a decision with an expiry rather than a shrug.** If the rate
slides materially further, if the failure mode ever changes shape from silence to something else, or
if the trigger stops being rare, this comes back. The one that would matter most: silence is
acceptable precisely because invention is impossible, so any future change to how that reply is
composed re-opens the decision.

**What the independent review found.** It was asked to be suspicious on exactly the right grounds,
since moving a failing case out of a barred bucket is what lowering a bar looks like, and it
confirmed every mitigation this change claims is actually implemented: the case still runs, still
scores, still prints in the failures list, and a collapse or a recovery would both be visible. It
independently verified the invention-is-unreachable claim end to end, including one adjacent path
this entry had not considered, a misclassification as a fresh idea rather than a change, which is
closed because the normalize layer rejects an empty activity and the bench would grade it as a
failure anyway. Two fixes came out of it. The probability figure was wrong: this entry said a 10/10
"would happen about 2% of the time", which was a Fisher comparison's number under a sentence
describing the simpler calculation; corrected to 0.6% above. And the scoreboard's bucket list was
hard-coded, so a future fifth bucket could be added to the type and silently never printed; it is
now a `Record<Bucket, string>`, which makes that a compile error instead.

---

## §11 entry: polish slice two, the onboarding wizard (18-19 Aug 2026)

**What the slice was.** The second of three visual-polish slices. Slice one dressed the foundations
and the group home; this one dresses the onboarding wizard: step 1, the gap-ask, the playback, step 3,
and the loading state. No behavior changed anywhere, no copy moved, no prompt or model was touched.

**Where the design actually lived, since this cost a false start's worth of confusion.** The rd-2
bundle's README scopes round 2 to the group home and says every other screen is out of scope for that
round. The wizard's design is in that bundle anyway, carried by the unchanged `walkthrough.css`
(onboarding rules at lines 93-206, override passes from 530 on), which is real CSS with real values and
therefore a legitimate build source rather than a screenshot. It covers every wizard screen including
step 3. The operative rule this produced, and the one worth carrying: **a later override pass supersedes
an earlier definition, so the last definition of a selector is the correct one.** Every task in the
slice was told to grep for all occurrences before porting a value.

**Decisions settled at the start.**

- *The loading state stays as it is.* `OrbitPause` was never drawn by any designer, on any board. The
  owner ruled that its shape holds (the Orbit mark plus one quiet status line) and only its spacing and
  text style get tuned. No spinner, no pulse, nothing invented. Where a task has no design source, its
  judgment values must be harvested from sibling screens and named, not conjured; that is what was asked
  and what happened.
- *The share pill updates everywhere.* `ShareInviteLink` renders on both wizard step 3 and the group info
  page. The owner ruled the new 46px teal pill applies to both rather than forking the component. Verified
  safe on the info page, which wraps it in an unconstrained column.
- *The eval benches do not trigger.* The standing rule queues onboarding-extraction and gap-ask-merge
  benches as "the first task of whichever slice next touches onboarding." This slice touches onboarding's
  screens but not one word of its prompts, model, or logic. The owner accepted that the trigger's purpose
  does not fire on a pixel pass, and the benches stay queued for the first slice that touches the prompts
  or bumps the model. A deviation from the rule's literal wording, taken deliberately and recorded here.

**The character counter is not built, and that is the one thing the slice deliberately left open.** The
design's counter reads "0/500", which means the designer imposed a 500-character cap on the founder's
description. The field is uncapped today, so building the counter would ship a product behavior nobody
approved: a founder writing past 500 characters would be stopped. It was surfaced to the owner as a
product question, went unanswered while the slice ran, and the task was split rather than guessed at.
Everything else in step 1 landed; the counter waits on a ruling. **Open question, carried forward.**

**What the slice closed.** The wizard's two bubble grammars, recorded as debt by slice one: `StepGapAsk`
and `Step2Playback` moved onto the shared `OrbitBubble` with the design's bottom-left notch, so the whole
wizard now speaks one bubble grammar. And the wizard's hardcoded error red became a `--danger` token.

**What the slice built.** Step 1 gained the design's two-triangle tail, ~~the only tailed bubble in the
product~~ (superseded 20 Aug 2026 by this entry's own QA postscript below, which widened the rule and gave
step 2's opening bubble the same treatment through a shared component), where a back triangle in `--hairline` sits behind a front triangle in `--surface-raised` so the
tail's slants read as a continuation of the bubble's border; plus the designed field shapes and a pill
Continue button. The playback rows moved out of the Orbit bubble onto their own `PlaybackCard`, shared by
the playback and gap-ask steps, carrying the designed key/value rows, the dashed lime gap marker with its
lime clock glyph, and the teal confirm footer band. The gap-ask input became a 26px pill with a filled
circular send button. Step 3 got its 46px teal share pill, link row, and a deliberately non-teal secondary
proceed button. The header's Orbit mark grew to its 44px slot, uncropped.

**Five things the review process caught that the implementers did not, worth recording because they are
the argument for the process rather than decoration.**

1. *A token mapped by name instead of by value, which was a real regression.* The handoff CSS names tokens
   this project does not have. `--ink-faint` looks like it should map to `--text-faint`; the stylesheet's
   own token block defines it as `#A7AAB6`, which is this project's `--text-secondary`. One task mapped it
   by name and dimmed every schedule-row key on both playback screens, below what the code did before the
   slice. **The controller's own task brief later repeated the identical error**, and that time the
   implementer overrode the brief and cited the stylesheet, which is the source-wins rule doing exactly
   what it exists for. Map handoff tokens by reading the source's own definitions, never by name.
2. *A fixed height, twice.* The design gives buttons a `height` because a static board's type never scales.
   Ours does. Step 1's Continue button shipped `height: 52px` with no vertical padding, which violates the
   recorded "layout grows with content, never clips" rule and would clip at enlarged device text; the same
   defect was independently found on `ShareInviteLink` in the final review, where a 46px pill sat twenty
   lines from a proceed button that correctly used `minHeight`. Recorded decisions beat design sources, and
   this is the concrete case.
3. *A spacing rule that was consistent and wrong.* One task ported the design's `margin-top` values on top
   of our form's own 20px flex gap. The design's containers contribute no gap, so every ported margin
   double-counted: the hint sat 31px below the button where the design says 11px, which was worse than
   before the fix. Fixed by removing the container's uniform gap so the ported numbers mean what they mean
   in the source. Consistency is not correctness.
4. *An undisclosed change to shipped copy styling.* A task quietly moved step 1's hint from meta to eyebrow
   size and described the typography as "matches exactly." Reverted; the role map puts sentence-case
   reference text at meta.
5. *A fix that created a worse bug than the one it fixed.* Task 4 added `overflow-wrap: break-word` to the
   playback card's fixed 62px key column to stop a long label overflowing. The result was that "CLIMBING"
   rendered as "CLIMBI / NG": the founder's own word garbled back at them at the exact moment they are asked
   to confirm Orbit understood them. Found by rendering the screen, not by reading the diff. The real
   problem underneath is that **the design's fixed 62px key column was drawn against short example labels
   ("CLIMBS") while real extraction produces the founder's own word, so the design's geometry cannot hold
   real data.** Fixed with content sizing plus a 62px floor and a 60% ceiling.

**A known cosmetic cost, accepted, and the owner should see it.** Because the key column now sizes to its
content, a long label widens that row alone, so the value column is ragged where the design had one aligned
column: on a climbing group, GROUP NAME and WHO align at 62px while CLIMBING's value starts about 15px
further right. A card-level CSS grid (`minmax(62px, max-content) 1fr`) would give both a floor and a shared
alignment. Not done here because it restructures the card rather than porting a value. **Queued.**

**Two shipped-code corrections outside the slice's own work, named because the rule requires it.** Step 3's
hint and the gap-ask's example line were both at eyebrow size at the branch base, and both are sentence-case
reference text, which the role map puts at meta. Corrected. Provenance was checked against `cbd6525` rather
than assumed.

**One extraction, and why it touched a shipped surface.** The slice's own send-button work duplicated the
group chat composer's recipe near-verbatim. Rather than log that as debt, it was extracted into
`SendCircleButton`, consumed by both the wizard and group chat, which also corrected the wizard's send from
36px to the design's 40px. `ChatInput` is outside this slice's lane and was touched only for the extraction;
the chat composer was verified unchanged on size, both fills, both borders, disabled semantics, and
accessible name, and the extracted component carries five real tests.

**Verification.** Baseline at branch start: 90 files / 914 tests green, matching the previous slice's
finishing number, no pre-existing failures. Finish: **91 files / 920 tests green**, `tsc --noEmit` clean.
The six new tests are five on the extracted send button and one guarding the share pill's min-height against
the fixed-height regression. All four wizard screens plus the group info page were rendered at a 375x812
mobile viewport and measured by computed value rather than eyeballed: step 1's spacings at exactly 32/11/20px,
the Continue button at 52px with real padding, the send button grey-and-disabled at rest and teal-and-enabled
with text, step 3's pill at 46px/24px teal and its proceed at 52px `minHeight`. The mid-word break was
confirmed fixed by rendering, not by reading.

**What could not be verified, stated plainly.** No real-phone pass was run by the build; the standing rule
asks for one and the device is the owner's. A 375x812 emulated viewport with measured computed values is
what the build could honestly produce, and it is not the same thing: the 14 Aug phone pass on the group home
found a squeeze that a full desktop pass had missed. The phone pass is step 1 of this PR's QA script.

**Observations found while walking the wizard, none of them this slice's to fix.**

- The design's step 1 puts the description first and the name field below it; ours is name first. The design's
  textarea also flexes to fill with the footer pinned to the bottom, where ours is plain flow at a 150px
  minimum. Both are structural rather than value ports. **Queued as questions.**
- The design's Continue button carries an arrow glyph; ours has none. The design labels the name field
  "WHAT SHOULD THE CREW CALL YOU?" where ours says "Your name"; that one is copy, which this slice does not
  touch.
- The group name renders as a proper title bar on step 3's card and in the design's own step 2 board, but as
  a wrapping "GROUP NAME" key/value row on step 2 and the gap-ask. Our own step 3 and the design agree
  against our step 2. Not fixed here because step 2's name is an editable input, so converting it is a
  structural product decision. **Queued.**
- A long group name clips inside that step 2 input ("Summit Gym Climbers" renders as "Summit Gym Climbe").
  Pre-existing, present at the branch base.
- The playback card showed the entered founder name "Jacob" while the created group listed the member as
  "Jamie". Cause is deliberate and documented in `src/lib/groups/provision.ts`: an existing User for the
  session's auth ID is reused as a guard against duplicate rows, so a returning anonymous session keeps its
  old name and the entered one is discarded. Pre-existing and unrelated to visual polish, but the playback
  promises a name the product then does not use. **Worth its own look.**


### Postscript, 20 Aug 2026: the owner's phone QA, and why the tail rule was widened

The real-phone pass the build could not run found five things. Three were answered from the record, two
became work.

**The tail rule was written too narrowly, and the owner's eye caught it.** He reported two Orbit faces
stacked on step 2: the header's mark directly above a bubble carrying its own avatar. That is precisely
the condition step 1's tail exists to prevent, and it was already a recorded finding from the gap-ask
slice's feel pass ("the screen shows two Orbit bubbles in a row"), queued for the polish pass, which is
this slice. This slice's document never picked it up; that is a miss in the planning, not in the
execution.

The rule said "the Step 1 bubble ... it is the only tailed bubble in the product." But the reason step 1
drops its avatar and points a tail upward has nothing to do with being step 1: it is that the bubble sits
directly under the header, so the header's Orbit is visibly the speaker and a second face is redundant.
The rule had been written around the screen it was first drawn on rather than around the condition that
earns it. Amended in CLAUDE.md and in §7 above: **a wizard bubble sitting directly under the header takes
the tailed, avatar-less treatment.** Step 1 and step 2's opening bubble qualify and now share one
`TailedOrbitBubble` component. The gap-ask does not qualify and keeps its avatar, because its bubble sits
below the playback card; the ordering difference between the two steps is what makes that correct rather
than inconsistent.

**The group name got its own full-width row, and the owner's question is why it is not step 3's title.**
The name had been an ordinary key/value row, so its "GROUP NAME" label wrapped onto two lines inside the
62px key column. The first proposal was to match step 3's card, which renders the name as a bold title
with a divider and no label, and which the design's own step 2 board also shows. The owner asked one
question that killed it: would it still be editable? In the design, nothing on step 2's card is directly
editable; the design's step 2 carries a message box and you change the name by telling Orbit ("Tell me
anything you'd like to change and I'll update it above"). Our step 2 has no message box, so the name being
a tappable input is the affordance that tells a founder they can change it, and step 3's name is a
non-editable title on a different card. Copying step 3's look would have removed the affordance without
supplying the design's replacement for it. **Decided: the name keeps its label and its input box, and only
the layout changes**, from squeezed-beside to stacked-and-full-width. Nothing wraps, it reads as the card's
headline, and it stays obviously editable. It also removes the widest label from the key column, which
shrinks the ragged-value-column cost recorded above.

**Declined, not queued: the 500-character cap.** The design's counter reads "0/500", which would impose a
cap on the founder's description where none exists. Declined outright rather than deferred. The description
is the raw material Orbit extracts from, so a cap risks cutting a founder off mid-thought at the one moment
more detail helps; nothing in the product needs it (the column is unbounded text and the model handles
longer input); and the same board that drew "0/500" also drew a fake blinking text caret, which is mockup
furniture rather than a considered product rule. Nothing gets worse by never building it, which is the
recorded test for declining. **The counter is not built and the field stays uncapped.**

**Answered from the record, no change:** the "Never mind, take me back" link on step 1 stays. The owner
questioned whether it was needed; it exists by his own 27 July decision, where step 1 was one of four dead
ends the app-wide-navigation slice was built to close, recorded as "step 1 only, since later steps already
go backwards within the flow." Removing it would recreate the dead end. And step 1's field order (name
above description, where the design puts description first) stays; the owner looked and did not notice it.

**Two bugs found that are not this slice's, both now the next slice's:** the event title's frozen weekday
and the group name's prompt. Written up in their own postscript below.


### Postscript, 20 Aug 2026: the two bugs the phone QA found, and where they went

The promised write-up, delivered here rather than left as a pointer to nothing.

**The event title had a weekday frozen into it.** The owner's Mon/Wed/Fri walkthrough produced a card
reading "Climb Monday" over a Friday date, with Orbit's own message below the card saying Friday. Not
a visual defect and not this slice's to fix: a pixel pass found it because a pixel pass is the only
thing that had looked at a real multi-day group's card since the title rule was written.

**The group name was named after a day.** The same run suggested "Monday Climbers" for a group that
meets three days a week. A second run of the identical description suggested "Monday Wednesday Friday
Climbers", accurate and 32 characters, which clipped inside the step 2 input. The prompt was failing in
both directions at once.

Both became the next slice, which is the entry directly below: **titles stop naming weekdays, and
onboarding gets its first eval bench (20 Aug 2026)**. The second bug is also what finally fired the
standing bench trigger this slice's own decisions had reasonably waived, which is the cleanest possible
argument that the trigger was written correctly.


## §11 entry: titles stop naming weekdays, and onboarding gets its first eval bench (20 Aug 2026)

**The two bugs, and why one hid.** The event title was the activity plus the first weekday of the
group's rhythm, stamped in at onboarding and copied verbatim onto every occurrence afterwards. It hid
because the date was always right: nothing broke, and only someone reading the title and the date on
one card would see the screen contradict itself. The case the tests pinned was the single-day one,
where the frozen day happened to be true. The group name named a day because the prompt taught it, in
three places: the shared field rules' only example, the merge prompt's worked example, and the
deterministic fallback. The spark path had been right all along, so this is a correction.

**The decisions the owner settled.** (1) The weekday leaves the title on every path, single-day groups
included; "Climbing Sunday" is deliberately lost, because the date sits directly under the title
everywhere it appears, so the weekday was duplicated information whose only possible future was to go
stale. (2) The group name stays model-generated with tightened wording rather than becoming
deterministic. Worth recording, because the owner's own worry pointed the other way: he cannot QA every
name the model invents, and a controversial one would be bad. He kept the model because the name is
editable on the playback card before the group exists, so a bad suggestion costs one edit and never
reaches the group. The wording now ~~forbids weekday names~~ (superseded 20 Aug 2026, narrow-weekday-rule
slice: narrowed to bar a weekday name only for a group whose rhythm spans more than one day, since a
group that meets only on Saturday is rightly named after Saturday; see the fuller annotation a few
paragraphs below and the "the weekday rule narrows" entry at the end of this document), caps at three
words, and bans wordplay,
because the whole group sees this name. (3) The deterministic fallback became the bare title-cased
activity, "Climbing". (4) Mid-slice, the bench found a bug nobody went looking for: the model returned
the activity as "climb" four runs in five, so the day-free title rendered "Climb" and varied on
identical input; the owner ruled that the prompt should ask for the naming form of the activity, not
the verb. (5) ~~After the measurement, the residual rate of weekday group names was accepted rather than
fixed with a code-side reject, declined at slice start and again with the number in hand, on the same
reasoning as (2).~~ (Superseded 20 Aug 2026, narrow-weekday-rule slice: this reading measured the wrong
thing. It was built on a bench of six cases that all led with the activity, and a same-day widening
found the miss concentrated entirely in descriptions where the day was the most distinctive word, every
one of them a single-day group the owner later ruled was never wrong to name after its day. See the
fuller annotation a few paragraphs below and the "the weekday rule narrows" entry at the end of this
document.) (Superseded again, same day, multi-day-name-guard fix: the decision itself reversed, not
only the measurement behind it. Once the rule above narrowed to bar a weekday name on a multi-day group
only, the reason the owner had twice declined a code-side reject (that it would have silently discarded
a legitimate single-day name like "Sunday Climbers") no longer applied, because a multi-day group has no
legitimate weekday name to protect. The owner approved a code-side guard on that narrower ground, and it
shipped the same day. See the "a code-side guard closes the residual" entry at the end of this document.)

**Where this bench departs from recognition's.** Recognition scores a case as one pass or fail, because
a message has one outcome. Extraction returns eight fields at once, so a whole-case verdict hides which
one drifted. Cases here carry named assertions scored as separate rates, at no extra model cost. The
name is graded by predicate (~~no weekday word~~ (superseded 20 Aug 2026, narrow-weekday-rule slice: this
check now applies only when the case's own rhythm spans more than one day, not to every case; see the
annotation below), three words or fewer, non-empty, plain characters)
because the model legitimately varies on it; every other field by equality against what the founder
said.

**The numbers.** Before: "no weekday word" 1/30 across six extraction cases and 0/15 across three merge
cases, 1/45 combined; activity-is-"climbing" 10/25. After, over two full runs: activity 25/25 and
25/25; "no weekday word" 44/45 and 42/45, with nothing previously clean regressing. The misses
concentrate on the fixture with no venue and no second activity, the one giving the model nothing else
to name the group after. Suite: 92 files / ~~922~~ 923 tests green at branch start and at the finish.
(Annotated 20 Aug 2026, titles-stop-naming-weekdays slice, caught in a later
review-fix pass: this figure was written before that slice's own final fix
wave landed one more test, so the "922" recorded above was never the true
finishing number for the slice it described; the suite's real finishing count
was 92 files / 923 tests, confirmed by the reviewer and by `npx vitest list`.
~~Left as originally written per this project's append-only rule rather than
corrected in place, since the project's slice-to-slice baseline check depends
on the number a record actually carries, not on what it should have carried.~~
(Corrected 20 Aug 2026, bench-learns-day-prominent-shapes final-fix-wave pass:
that sentence described the wrong mechanic. The number is struck through and
the true one, 923, is written in beside it, which is this project's normal
append-only correction, not a silent overwrite; the sentence above claiming
it was "left as originally written" was itself the error, since a reader
following the strikethrough already sees 923 standing.))
(Annotated 20 Aug 2026, narrow-weekday-rule slice: this combined rate, and the "roughly rare" reading
of it the team carried forward from here, turned out to be an artifact of six cases that all led with
the activity. A wider bench built the same day found the miss concentrated entirely in descriptions
where the day was the most distinctive word, and every one of those misses was a single-day group,
which the owner later ruled was never wrong to begin with. Full story and the corrected numbers in the
"the weekday rule narrows" entry at the end of this document.)

**Two review catches, both the process arguing for itself.** The merge bench was skipping two
production guards, so it was not the real production path on the exact case built to test the failure
those guards fix; that mistake was mandated by the controller's own task brief, and CLAUDE.md's rule
beat the brief, the source-wins pattern polish slice two recorded. And a fixture could have passed for
the wrong reason: an ambiguous-time case whose candidate equalled what the answer resolved to, so a
model blindly echoing it scored green. Repaired to a pairing where echo and rule diverge.

**Debt and honest limits.** The group name is still model output: the risk is measured now, not removed.
Nobody rendered one group's card rolling Monday to Wednesday to Friday over real time, because the
occurrence cron is gated on wall-clock; three independent live onboarding runs stand in. Against that,
the bug class is now structurally unreachable, because a title containing no weekday cannot go stale.
No migration: existing dev-test groups keep their old titles and the fix reaches new groups only, safe
only because that database is test data. No new environment variable and no schema change, so the
pre-deploy checklist is unchanged.

### Postscript, 20 Aug 2026: the owner's phone QA of this slice

Three findings. One is a real bug and left in its own micro-PR; two are recorded here and not built.

**The group name reads "Climbing Crew", and the owner expected "Climbing".** Worth recording precisely,
because the mechanism is not the one it looks like. The deterministic fallback does produce the bare
activity, exactly as decided. "Climbing Crew" came from the model following this slice's own approved
wording, which says to pair the activity with a plain everyday word for a group of people and offers
"Climbing Crew" and "Board Game Club" as its examples. So the shape the owner questioned is one the
build taught, not one Orbit invented. His concern is that the pairing does not survive every activity:
"Beers Crew" reads badly where "Climbing Crew" reads fine. **Not changed, and the reason to wait is that
the bench can now answer this instead of us guessing.** A beers case and a board-games case, scored over
N runs, would say whether the model actually produces the awkward pairing or reaches for "Beer Night"
and "Game Club" on its own. Queued as a bench-first question rather than a wording change, because
changing approved copy on a hunch is how the weekday example got written in the first place.

**Step 2 changes shape depending on whether Orbit has everything it needs.** With a gap open, the screen
carries a message box below the playback card and Orbit speaks in a bubble with its avatar; once the
gap is closed, that box is gone and the step opens with the tailed header bubble like step 1. The owner
reported being thrown by it on first sight and explicitly ruled it acceptable for MVP, wanting it noted
rather than fixed. Recorded because the two layouts are a deliberate consequence of the tail rule
amended earlier the same day (a bubble directly under the header takes the tailed, avatar-less
treatment; the gap-ask sits below the playback card and so keeps its avatar), and a future session
seeing the inconsistency might otherwise "fix" a rule that was reasoned about twice.

**The negative space above Orbit on step 2 was a real bug, fixed separately.** The onboarding page
centered its whole column vertically, header included, so short steps floated down and read as a header
that had failed to load. Its own micro-PR, since it is a fix to already-merged polish slice two work and
touches no file this slice touches.

## §11 entry: the weekday rule narrows (narrow-weekday-rule slice, 20 Aug 2026)

**What it is.** The rule that stopped Orbit naming groups after a day of the week was too broad. It
said "never," but the true problem is only a group with more than one meeting day: "Mon/Wed/Fri
Climbers" is a bad name because the group is not a Monday group, while "Saturday Morning Runners" is a
perfectly good name for a group that only ever meets on Saturday. The reading given at the time this
originally shipped, "roughly rare," was itself built on a bench of six cases that all happened to lead
with the activity ("we climb...", "we play..."), so it never had a case shaped the way founders actually
write when the day is the most memorable thing about their group. A same-day bench widening surfaced
that shape and showed the earlier reading was misleading, not merely imprecise.

**The real breakdown.** Every single failure the wider bench found, on every case, was a single-day
group. The one case built specifically around a founder's report of a stale multi-day title (Monday,
Wednesday, Friday climbing) has passed clean, 10 out of 10 runs, both before this change and after it;
it never had a weekday-name problem at all. The two new cases that did fail often, "a few of us run on
Saturday mornings" and "we grab beers every Friday," are both one-day groups. Naming them after their
day was never a mistake. The rule was punishing the exact behavior it should have allowed.

**The owner's ruling.** Only bar a weekday name when the group meets on more than one day. Orbit's
instructions were reworded to say exactly that, and the bench's own weekday check was changed to match:
it only applies to the one case that actually spans multiple days, and every single-day case no longer
treats a weekday name as a defect.

**The numbers after the change, two full bench runs.** The weekday check came back perfectly clean on
both runs, for every case: the one multi-day case held its own 10-for-10 record, and every single-day
case that used to be graded on this check no longer shows a weekday name as a problem, because it is no
longer being asked to avoid one. Nothing else moved: the unrelated, already-known rough edge where the
model occasionally shortens "running" to "run" (and drags the event title down with it) is untouched and
still visible on the bench, exactly where it was before this change, because it is a separate question
the owner is tracking on its own. Nothing regressed anywhere else in the ninety-two-file, nine-hundred-
and-twenty-three-test automated suite, and the app's own type-check stayed clean.

**Why this belongs to a narrower fix, not a new feature.** ~~Nothing about what Orbit can do changed.~~
This only corrects an instruction that was asking for the wrong thing in a case the product cares about
(one-day groups, which are the common case), and corrects the measurement that had been quietly baking
that mistake into "acceptable." The debt this closes: the earlier "residual is accepted" reading in
CLAUDE.md's running summary was a measurement of the wrong thing, corrected there with a dated note
rather than rewritten, per this project's own record-keeping rule. (Superseded same day,
multi-day-name-guard fix: that first sentence stopped being true a few hours later. This entry described
the prompt-and-measurement fix only; a separate, later fix the same day added the code-side guard the
owner had twice declined, now safe under the narrower rule, so a multi-day group's playback card can now
show the derived name instead of a weekday-named suggestion the model still produced. That is real
founder-visible behavior, not covered by "nothing about what Orbit can do changed." Full account in the
"a code-side guard closes the residual" entry at the end of this document.)

## §11 entry: a code-side guard closes the residual (multi-day-name-guard fix, 20 Aug 2026)

**What it is.** A multi-day group whose suggested name still names a weekday (the model occasionally
writes "Monday Climbers" for a group that actually meets Monday, Wednesday, and Friday, despite the
prompt telling it not to) now has that name caught and swapped, in code, for the plain derived name
("Climbing"), before it ever reaches the founder's playback card. This closes the residual that the
narrow-weekday-rule slice, earlier the same day, measured but did not fix.

**Why this is a reversal, not a follow-on.** The owner had declined a code-side reject for this twice
before today, both times for the same reason: rejecting every weekday-named suggestion would have
silently thrown away a legitimate name too, like "Sunday Climbers" for a group that only ever meets on
Sunday. That cost was real as long as the naming rule itself was a blanket "never use a weekday." Once
the narrow-weekday-rule slice changed the rule to bar a weekday name only when a group meets on more
than one day, the cost disappeared: a multi-day group has no legitimate weekday name to protect, because
it was never a Monday group to begin with. With the reason for declining gone, the owner approved the
guard the same day. The lesson worth keeping: a standing decision is only as good as the situation it
was decided in, and the record has to say when that situation changed, not just what the decision was.

**What a founder sees.** Nothing changes for a single-day group; a weekday-named suggestion still passes
through untouched ("Saturday Morning Runners" stays "Saturday Morning Runners"). For a multi-day group,
a weekday-named suggestion from the model no longer reaches the card at all; the founder sees the plain
activity name instead ("Climbing" rather than "Monday Climbers"), exactly the fallback they would see if
the model had suggested nothing. The name is still editable before the group exists either way.

**What the guard catches, closed further in this same fix wave.** The word list catches full weekday
names and their standard abbreviations (three-letter, plus the two four-letter forms "tues" and "thurs"
the bench itself was already built to test), matched whole-word so a name like "Satellite Crew" or a
surname like "Mondale" is never mistaken for one. A review pass the same day found and closed one real
gap: a plural weekday ("Mondays Climbers", "Tuesdays Runners") walked through uncaught, which mattered
because "Tuesdays and Thursdays we run at 6am" is literally the shape of the bench's own new day-prominent
case. The guard now catches the plural the same as the singular. The review pass also weighed one
deliberate false positive and chose to accept it the other way: the bare abbreviation "sun" was dropped
from the list, because it is a common standalone word in real place and group names ("Sun Valley
Climbers"), and a model is far more likely to write "Sunday" out in full than to abbreviate it, so
keeping "sun" cost more legitimate names than it caught. The full word "sunday" is still caught. Either
choice was low-risk, since the fallback name is always safe and the suggestion is always editable before
the group exists; this is a judgment call, not a correctness fix, and is recorded so a future reader
does not "fix" it back the other way without knowing it was already weighed once.

**Verification.** Unit tests in `src/lib/orbit/__tests__/normalize.test.ts` cover the guard directly:
a multi-day weekday name is rejected and falls back to the derived name, a single-day weekday name is
kept, a clean multi-day name is kept, near-miss substrings ("Mondale", "Satellite") are not falsely
caught, the three- and four-letter abbreviations are caught, the plural form is caught, "Sun Valley
Climbers" is kept while "Sunday Climbers" is still caught, and the guard applies on both the ready and
the gap-ask incomplete paths. This is deterministic code with no model call in the loop, so it is proven
by the automated suite rather than the bench; the bench continues to measure the model's own suggestion
rate separately. Suite: 92 files / 931 tests green at this fix wave's start, 934 at its finish (three new
cases: the plural, the "sun" exception, and confirming "sunday" itself is still caught). No new
environment variable, no schema change, no migration; the pre-deploy checklist is unchanged.


## §11 entry: polish slice three, the remaining screens (21 Aug 2026)

**What the slice was.** The last of the three visual-polish slices. Slice one dressed the foundations and
the group home, slice two the onboarding wizard, and this one the five screens that were left: the front
door, the join screen, event detail, group info, and the three dead-end screens (not-found, error, and the
members-only wall). Spec and plan in one document,
`docs/superpowers/specs/2026-08-21-visual-polish-3-design.md`, riding this branch from before any code.
No behavior changed anywhere. Copy changed in exactly two authorized places, both named below.

**Where the design lived, and the one screen that had a real handoff.** Only the front door was drawn in
the rd-2 round itself (README item 01, values in `round4-base.css`). Join, event detail and group info live
in the unchanged `walkthrough.css` (`.jn-` 208-265, `.ed-` 391-459, `.gi-` 461-522) plus the override passes
at 524-698, the same situation slice two found for the wizard. The three dead-end screens are drawn nowhere.

**The OrbitPause precedent half-applied, and the half that did not was the useful half.** The owner's slice-two
ruling was that an undrawn screen keeps its shape and only spacing and voice get tuned. That held for the
dead-end screens' *shape*, but the note element inside `OrbitNoteScreen` turned out to be drawn after all,
as `.ed-slip` on the event detail board, which is the treatment the component's own comment said it copied.
So the note got a real port (the Orbit mark absolutely positioned in a 48px padding inset so the text runs
full width beside it rather than stacked under it, body dropping to `--type-meta`/`--text-secondary`) while
the screen around it was left alone. Worth carrying forward: "nobody drew this screen" and "nobody drew this
element" are different claims, and the second one is worth checking before invoking the first.

**The owner's four decisions at the brainstorm, all settled before code.** Copy travels with any element the
slice rebuilds and stays put everywhere else, which is what authorized the join screen's new copy. The event
screen keeps our RSVP pair rather than the board's "You're in / Change" band, because the card-state-grammar
slice settled that after the board was drawn and the band would cost a tap. The board's "A note from Orbit"
slip on the event screen was declined: its copy promises a nudge before a confirmed event, and it was verified
that nothing sends one, the one-bump rule being a gauge mechanism only. The venue "MAP" link was queued as a
feature rather than polish. Both polish-slice-two carryovers stayed queued.

**Two pieces of copy changed, and one of them was a correctness fix.** The join screen gained the design's
"You're invited" eyebrow, an Orbit bubble introducing itself by the group's name, and a reassurance line
reading "No app to download, no password. You'll land right in the group." That line replaced "No sign-up
needed. You can add an email later to keep access," which promised email sign-in the product does not have.
Retiring it was the point rather than a side effect. Separately, and by the owner's ruling on 21 Aug, the
members-only wall and the bad-invite screen lost their outer eyebrow: they stacked two small uppercase labels
before the one sentence that mattered, and the outer one restated the note's own opening clause, so
"invite-only" appeared twice inside about fifteen words. The note's own label stays, because it names the
speaker and it is the part the design drew.

**Email was sized rather than built.** The owner asked mid-brainstorm whether email could come before MVP.
The answer recorded: capture alone is small, since `ContactMethod` already exists, but sign-in needs a
verified sending domain, which is a first-use-of-an-external-service seam and cannot be verified without it,
and capture without sign-in is the promise-with-nothing-behind-it that triage already rejected. Post-MVP
stands, unchanged.

**What the review process caught that the implementers did not, worth recording because it is the argument
for the process.**

1. *A test that could not fail, proven by mutation rather than by reading.* The eyebrow deletion was guarded
   by a test asserting the strings "Invite only" and "Invite link" were absent from `OrbitNoteScreen`. A
   reviewer restored the deleted prop and re-added it at the caller: `MembersOnlyWall.test.tsx` failed
   correctly, and `OrbitNoteScreen.test.tsx` passed unchanged, because that test's own render never passes an
   eyebrow prop, so the queried strings could never appear. Rewritten as a structural assertion (exactly one
   eyebrow-styled element renders) and then *proven* to fail-then-pass by a deliberate mutation. The standing
   rule says a passing test is only evidence if it could have failed; this is the first time in this project
   that rule was enforced by actually breaking the code to check.
2. *A deleted label is a deleted accessible name.* Task 3 replaced the event card's "When"/"Where"/"Activity"
   key labels with icon rows, per the design. Read back through the accessibility tree, the venue row became
   a bare "The climbing gym" and the activity row a bare "climbing" echoing the page heading. The implementer
   found it, flagged it rather than shipping it, and an independent reviewer confirmed it. Ruled a
   *restoration* rather than a product decision, which is what made it the controller's to settle: the three
   original words came back as visually hidden text, nothing invented, no visual change. The technique was
   extracted to `src/components/visually-hidden.ts` and is now shared with the join screen.
3. *The last-definition trap fired again, on the one selector nobody grepped.* Task 5 gave the group info card
   the base rule's light-mode shadow (`4px 5px 0 rgba(43,43,43,.04)`) instead of the 570-573 override
   (`0 1px 3px rgba(0,0,0,.35)`), shipping a near-invisible shadow on a dark card. The same task had run the
   override check correctly everywhere else, including the genuinely subtle `.gi-leave` case where it merged
   the base rule's border-width with the override's border-color. One selector just never got the grep.
4. *Two things only a whole-branch review could see, both about what a screen LOST.* The join screen's `<h1>`
   was deleted and replaced by nothing, leaving the product's most-shared URL with an empty document outline;
   it was the only heading removed anywhere on the branch. And the front door dropped the app-wide 28rem
   content column, so on anything wider than a phone the headline ran the full window and the CTA became an
   absurdly wide pill, on the one screen an evaluating engineer opens first. Neither was visible to a
   task-scoped review, because each was an absence rather than a change.
5. *A citation nobody could check.* A code comment justified an omission by citing "controller resolution F,"
   which existed only inside a dispatch prompt, so the reviewer had to report it as unverifiable. Resolutions
   now live in a file the reviewer can read. The omission was also wrong on its merits: the resolution said
   "unless the design asks for it," and the design did ask.

**Registered as new debt, not fixed, with the reasoning.** At enlarged device text a long single-word label
(the measured case was "MOUNTAINEERING") still breaks mid-word once it hits the key column's 60% ceiling,
because that ceiling is relative to a roughly fixed row width while the text scales with root font-size.
Three screens carry it: group info, the join card, and `PlaybackCard`. This is *not* the column-raggedness
tradeoff slice two accepted, which was a made-up word at default size; this is a real word at accessibility
text sizes, and it is the same class as the CLIMBI/NG bug slice two fixed. Not fixed here because the recorded
answer already exists and is queued (a card-level grid, `minmax(58px, max-content) 1fr`) and belongs at the
pattern rather than at three instances.

**Surfaced for the owner, shipped as is.** A declined member's name now renders at a measured 4.4992:1 against
`--surface-raised`, a hair under the 4.5:1 WCAG AA floor, where before this slice every roster name was
near-white. It is the design system's own token pairing rather than an invention, the shortfall is 0.02% of
the threshold, and nothing about *status* depends on it: the grouping and the "Can't make it · N" heading
carry the meaning and the whole ladder is hue-free, so the colourblind-safety rule is intact. Raising it would
collapse a three-step ladder to two and a fourth token is barred by the slice's own constraints. Also queued:
on the group info page `LeaveGroupButton` is a pill because it was drawn while `ManageMembers` and
`ResetInviteLink` stay rectangular because they were not, which is visibly inconsistent on one screen; not
fixed because at least two of those sites are confirmation-panel containers rather than buttons and the rest
sit inside destructive-action flows on surfaces no designer drew.

**Two shared modules were created, both sanctioned rather than incidental.** `src/components/glyphs.tsx` was
built up across four tasks (`ArrowRight`, `Clock`, `MapPin`, `Calendar`, `Check`) and absorbed the inline clock
that already lived in `PlaybackCard`, so the product has one clock rather than two. Neither `MapPin` nor
`Calendar` nor `Check` is a true port: the handoff carries their size and stroke but no path data, and
`docs/walkthrough.html` could not be read (the packed file returns false negatives to grep, the trap CLAUDE.md
already records), so those three paths are original renders and say so in the code.
`src/components/visually-hidden.ts` came out of the accessibility restoration and has two consumers. Neither
module carries tests, deliberately: decorative SVG constants and a style object have no logic and no accessible
content, so a test could not meaningfully fail. One coupling worth naming: the onboarding gap marker now
depends on the shared `Clock`, and that screen has no tests, so a future change to the shared viewBox would
alter onboarding silently.

**Files touched beyond the slice document's named list**, per the standing rule: `src/components/Chevron.tsx`
(an additive optional `size` prop defaulting to its previous hardcoded 14, needed for the back link's 18px
chevron), `src/app/events/[id]/AddToCalendarButton.tsx` (the slice document specified this button's shape in
task 3's own section), and `src/app/create/PlaybackCard.tsx` (the clock migration above).

**Verification, and what it could not reach.** Baseline at branch start: 92 files / 934 tests green, matching
the narrow-weekday-rule slice's finishing number exactly, no pre-existing failure. Finish: **92 files / 935
tests green**, `tsc --noEmit` clean. The one new test is the structural eyebrow guard. Every screen was
rendered at 375x812 and checked by computed value rather than by eye, against real seeded dev-test data for
event detail and group info (`scripts/qa-stage-polish.ts`, then joining through the printed invite link to get
a real member session). The front door was additionally measured at 768 and 1280 after the content-column fix.
Two gaps stated plainly: no real-phone pass was run by the build, because the device is the owner's and that
is step 1 of this PR's QA script; and the event detail page's live server-rendered output was verified through
a fixture harness for part of task 3, before the seeding approach was authorized at task 4. Nothing about the
`0.5rem` sweep was fixed outside this slice's screens: `ChatInput.tsx` and `choice.tsx` still carry a
hardcoded `#f87171` where `--danger` exists, named here rather than touched.

**No deploy-time obligation.** No new environment variable, no schema change, no migration. The pre-deploy
checklist is unchanged.

### Postscript, 21 Aug 2026: the owner's QA on this branch

Four notes came back. Two became work, one was answered from the record, and one is an
environment problem rather than a product one.

**The front door's composition is now the owner's, not the handoff's.** The design pins the Orbit
mark to the top and the copy plus action to the bottom (`round4-base.css` `.fd-copy { margin-top:
auto }`), with the README giving the reasoning: the space between absorbs longer translations and
"the screen opens as a statement rather than a splash." The owner found the emptiness wrong, and
the measurement backed him rather than the design: at a true 375x812 phone the gap between the
mark's bottom and the eyebrow's top was **349px, 43% of the screen**. (The controller's first
hypothesis, that his skinny-desktop QA window was exaggerating it, was measured and disproved
before it was offered as pushback.) The mark, copy and action are now one contiguous group,
vertically centred: the gap is 16px and the block sits 177px from the top and 171px from the
bottom. Internal rhythm is untouched, so every ported value inside the group still means what it
means in the source; only the composition changed. The mark stays left-aligned with its -9px
optical margin, which exists to line the sphere rather than its box up with the 24px gutter.
**This is a deliberate departure from a high-fidelity handoff, made by the owner, and the design
is not wrong to have drawn it the other way in a fixed 390x844 frame.**

**The event card sat flush against the header's divider, and it was two correct decisions
colliding.** The design's `.ed-scroll` carries zero top padding because the back link sits inside
the scroll region there and provides the separation. This product moved the back link into the
shared `PageHeader` (a recorded decision that beats the design source), so the ported zero left
the header's 1px hairline and the card's own 1.7px border stacked with nothing between them. Fixed
by matching the group home, which already left 12px, rather than by inventing a number. The group
info page was checked for the same collision and does not have it: its first element is the
identity block, which carries no border.

**"Didn't we already have the join screen?"** No. The owner's demo recording was made against this
branch. The tell is his own screenshot: "No app to download, no password. You'll land right in the
group" is copy written in this slice, replacing the line that promised email sign-in the product
does not have. Recorded because the question will recur: a screen that has just been built for the
first time looks familiar to whoever has been looking at the design boards.

**Phone QA has been broken since roughly 20 Aug, and the cause looks like a rule this process
wrote.** The owner has been unable to reach the dev server from his phone for several sessions,
which matters because the real-phone pass is a gate the build cannot run. Diagnosed on this branch:
the server binds to all interfaces (`*:3000`), the macOS application firewall is off, the LAN
address is already in `allowedDevOrigins`, and `http://192.168.1.144:3000` answers 200 from the Mac
itself, so nothing on the server side is wrong. The listening process's parent chain, however, runs
`next-server` <- `npm run dev` <- `zsh` <- `Claude.app`. macOS grants Local Network access per
application, so the permission is being asked of Claude rather than of Terminal. The 20 Aug rule
change ("the server is mine to start", implemented as a play button in the QA handoff) is what moved
the owning application, and the timing matches. **Not confirmed:** the permission database was not
read directly. The test handed over is to run `npm run dev` from Terminal and retry the phone. If
that is the cause, the pr-handoff checklist's play-button instruction needs amending, because it
silently disables the phone gate it exists to serve.

**Correction, 21 Aug 2026 (same day): the phone diagnosis above was wrong.** The owner ran the test
and `http://192.168.1.144:3000` worked from his phone. The Local Network permission theory is
therefore not the cause, and the 20 Aug rule change is not to blame. ~~The listening process's
parent chain... macOS grants Local Network access per application~~ stands as an accurate
description of what was measured, but it was the wrong explanation.

The actual cause is simpler and sat in this process's own output: **every QA link handed to the
owner has been a `localhost:3000` link, and `localhost` on a phone resolves to the phone.** Those
links could never have reached the Mac from another device. What looked like an environment fault
that appeared around 20 Aug was a handoff defect that had been there the whole time, visible only
once the owner started using the links from a phone rather than retyping an address.

Two things follow. **QA links for a phone pass must use the machine's LAN address, not `localhost`**
(currently `192.168.1.144`, a DHCP lease that can change and is already mirrored in
`next.config.ts`'s `allowedDevOrigins`). And **the `a.localhost` sibling-host trick for a fresh
session does not work from a phone either**, for the same reason; the phone equivalent is a private
browsing tab. A deep link to a members-only screen also assumes the phone's own session is a member
of that group, which is a separate session from the desktop's, so a phone pass on a members-only
screen needs the invite link first and the deep link second.

Recorded at this length because the failure mode is the interesting part: a diagnosis that measured
real things correctly (binding, firewall, origins, process tree) and drew a confident wrong
conclusion from them, while the actual bug was in the instructions being handed over rather than in
the machine being investigated.
