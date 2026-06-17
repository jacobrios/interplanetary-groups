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
- **Spontaneous mode:** Orbit listens passively, gauges interest with chips when someone floats an idea, and only creates an event at the three-person threshold (including the initiator). Below threshold, ideas scroll away with no residue.
- **The one-bump rule.** A buried gauge that is still viable (close to threshold) earns at most one fresh bump, then dies gracefully. Never pinned, never bannered.
- **Auto-seed RSVPs.** People who said yes during gauging are seeded as "in" on the created event. Never ask twice.
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
- **One onboarding bubble-tail exception.** The Step 1 bubble drops its avatar, shifts to the left margin, and keeps a small tail pointing up at the header; it is the only tailed bubble in the product. Implementation is a one-off: either an SVG bubble shape (a single stroked path with the base segment left unstroked) or a stacked two-triangle CSS approach. Present in the current gallery.
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
- **The carousel** orders soonest-first; peek-and-dots chrome appears only with two or more cards.
- **Header grammar:** the Orbit logo top-left is the home button (anticipating multi-group); the group title with chevron opens group info. The Orbit-generated group emblem lives on the info page and the future multi-group home, not in the header.
- **Event cards are tappable previews** into the detail page; the detail page is where the confirmed RSVP state and the full roster live.
- **The event detail page is a stack of cards**, so new sections (a LOGISTICS card for travel-style events, per-person details on roster rows) slot in additively without redesign.

### Card-versus-chat balance (one firm rule, one open question)

- **Firm:** the event card stays pinned at the top as the constant next-event reminder; the chat feed is its own scroll region below it, above a pinned input. The chat body stays at `--type-body` (17px) and is never shrunk to fit. The apparent chat overflow in the mockups is only the fixed presentation frame, not a real layout problem.
- **Open question, deliberately not settled.** The real problem is that the pinned card takes up a lot of vertical space (the RSVP buttons especially), leaving less room for chat than ideal. Fall in love with that problem, not a particular fix. One candidate solution: collapse the card into a condensed state once the viewer has set their own RSVP (in or out), since RSVP is per-person, and give the freed space to chat. This condensed state is not designed and not drawn in the walkthrough, and what it keeps visible (title and time only, whether it still offers a quick "change" affordance or routes to the detail page) is undecided. The default is to ship the full pinned card as drawn and add nothing here unless the live app proves the card actually crowds the chat. Do not build the condensed card preemptively; this is a complexity-must-justify-itself call (§1), and a better solution than a condensed card may exist.

## 8. Fast-follow & post-MVP register (one place for scope conversations)

- Multi-group home screen (backend ready day one; Orbit logo already positioned as home button).
- Multi-venue event UI (data model ready day one).
- Logistics card and per-person roster details on the event page (the travel case; purely additive). Full travel support likely also wants nested events (container weekend, child events with independent RSVPs), enabled later by a nullable parent reference; semantics already locked in §2.
- Multimodal logistics input (forwarded emails, screenshots parsed by Orbit).
- Subscribable per-group calendar feed.
- Opt-out attendance preferences (the summer-schedule scenario).
- Join-anomaly flags to the founder.
- Web push notifications (PWA path), kept judicious regardless of channel.
- Photo avatars.

## 9. Engineering process

- **Stack:** Next.js, Supabase (database + auth), Prisma, Vitest, Vercel. RAG and MCP are the AI differentiators.
- **Setup checklist:** CLAUDE.md before building; Superpowers plugin installed; Git from day one with deliberate commit history; evals baked in early, not retrofitted; subagent code reviewer (read-only tools) before commits, config checked into the repo; PostToolUse hook to auto-run tests after edits; PreToolUse hook protecting migration files and env configs.
- **Design-source workflow.** Content and copy changes go through Claude Design in the live source, never by hand-editing the standalone export. The standalone walkthrough is rebuilt from the live gallery after any change, so source and export always agree, and there is exactly one standalone, one source of truth. Screenshots shared into a planning thread are source of truth as far as static images can convey; interaction states they cannot show are tracked as explicit open items rather than inferred.

## 10. Long-range vision (not planned, not architected for)

Recorded so it isn't lost, and so nobody designs the MVP around it. These are directional, not roadmapped, and the data model deliberately does not bend to accommodate them.

- **Multi-platform, two-way messaging** (the investor's platform vision): let a member interact with Orbit from whatever channel they already use, coordinating across SMS, email, and chat platforms like WhatsApp and Facebook Messenger, rather than only the web app.
  - **Feasibility is better than first assumed.** A Twilio-type gateway (Twilio's Conversations API plus SendGrid for email) genuinely unifies SMS, MMS, WhatsApp, Facebook Messenger, RCS, and email behind one API, so this is not the integration-sprawl headache it might look like. Most of the per-channel wiring is absorbed by the provider.
  - **The real burden shifts rather than disappears, to two things.** First, per-channel approvals: WhatsApp and Messenger each route through their own business-platform onboarding behind the unified API, and WhatsApp's constraints are Meta's policy (no freely initiated messages, pre-approved templates required, a 24-hour reply window), which persist regardless of provider. Second, per-message economics: outbound SMS and WhatsApp are usage-priced, which is a direct, recurring cost a free-for-basic, no-VC product has to absorb at any volume.
  - **It does not cover iMessage,** where a lot of US casual groups actually live.
  - **Sequencing if ever pursued:** email and SMS first (cheap and easy), validate the cross-channel interaction model, then treat the closed chat platforms as a separate and much larger question. Anything here stays bound by the anti-clutter and judicious-notification principles in sections 1 and 6; reaching more channels must never become a license to send more.
