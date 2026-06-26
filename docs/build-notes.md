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
- **(Process, not product) Extract a user-level `~/.claude/CLAUDE.md` at project end.** Lift the portable rules out of this project's CLAUDE.md and §9 process notes into a machine-wide config that applies to every future project: the build-agent working rules (the Karpathy-derived clauses, calibrated to "prescriptive on the what, open on the how"), the Claude Code setup checklist (hooks, Superpowers flow, subagent reviewer, commit-at-verified-states), the code-quality bar (production-readable, built for engineer review), and the communication preferences (no em or en dashes, confidence tags, one terminal command per fenced block). Project-specific things (the seven-model schema, Supabase-auth-only, Orbit) stay at the project level. Test for each rule: "would this be true on my next project too?", and move the yes ones up.

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

## 11. Build log (implementation decisions)

*Build phase, begun June 2026. Entries here are decisions made while implementing, ADR-style, one per build slice. They realize and extend the product-design decisions in sections 1 to 10; they do not replace them.*

### Before first Vercel deploy — prerequisites checklist

Two High-priority tech-debt items from separate slice entries both come due at the moment of the first production deploy. Check both before pushing.

1. **Set `CRON_SECRET` in the Vercel dashboard** (Environment Variables → Production).
   *Why it blocks deploy:* the Orbit cron endpoint (`/api/cron/orbit`) returns 401 by design in production when the secret is absent. The value is a randomly generated secret; never commit it to the repo.
   *Detail:* Orbit scheduled-event slice §11 — "CRON_SECRET is a new required production env var."

2. **Wire `prisma generate` into the build** (e.g. add `"prisma generate"` as a Vercel build command prefix, or add a `postinstall` script in `package.json`).
   *Why it blocks deploy:* Prisma 7 does not auto-generate the client on install. After the Orbit slice the schema includes the `Group.timeZone` column and the `MessageAuthor.ORBIT` enum — a stale generated client will fail at runtime the first time either is touched.
   *Detail:* Data-foundation slice §11 — "`prisma generate` does not auto-run in Prisma 7."

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

### Feel-pass register (items deferred from group-home work)

Items below are deliberate deferrals, not bugs. Each is recorded here so it is not lost when the end-of-build polish pass opens.

- **RSVP button cursor lag (feel pass).** After tapping I'm in / Can't make it on the home card or event detail, the button stays disabled for the full server round-trip, so the cursor shows the not-allowed state for roughly 0.5 to 1 second before returning to normal. The optimistic visual flip is instant; only the button's disabled-during-write state lingers. Deferred to the end-of-build feel pass. Any fix must stay a feel change and must not loosen the double-tap protection on the shared RSVP write path.

- **No back-navigation from event detail to group home (small follow-on).** The event detail page predates the group home and has no affordance to return to it; the browser back button is the only way back. Add a back affordance that routes to the event's group home (derivable from the event, so it also works for a direct link, not just history). Its own small slice or part of the polish pass.

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

- **`@@unique([groupId, startsAt])`** means a group cannot hold two distinct events at the identical start instant. Acceptable for MVP scheduled mode; revisit when spark / the plural-rhythm design needs it (e.g. scope uniqueness to a future `source` field, or use a different idempotency key). Medium.
- **`rhythms[0]` only.** Multiple concurrent rhythms per group (climbs + beers) and a multi-card carousel are deferred. Single upcoming occurrence per group is an explicit product decision for this slice. Low.
- **Zero-dependency `Intl`-based timezone conversion.** `zonedWallTimeToUtc` has a latent failure mode for `timeLocal` values below roughly `05:00` in large-negative-offset zones (the first-pass candidate can land on the prior local day). MVP rhythms are daytime-only so this never fires; the code carries a DEBT comment. If timezone-agnostic scheduling is ever exposed to arbitrary user input, replace with an iteration-based approach or a date library. Low.
- **Event and announcement are not in one transaction.** A crash between `createEvent` and `createMessage` leaves an event with no announcement; the upcoming-event guard prevents a retry. Low risk at once-per-day cron; revisit by threading a transaction through both calls if it matters. Low.
- **`CRON_SECRET` is a new required production env var** (none existed before this slice). Must be set in Vercel environment variables before deploying. There is no `.env.example` in this project; documented in the PR. High (blocks a working deploy).
- **Synthetic members now start with no RSVPs.** The seeded RSVPs belonged to the retired fixture event. A freshly auto-created scheduled event legitimately starts all-pending per §5 (auto-seeded RSVPs are a gauging-mode behavior); the roster demo is less rich but honest. Retires when onboarding lands. Low.
- **Cron reconcile runs against the single shared dev database** (pre-existing debt from data-foundation §11). Low.
- **`announce.ts` shares the parked UTC-display assumption.** `buildAnnouncement` formats weekday and time using UTC (same root cause as the parked `format.ts` display debt). For the demo group (`timeZone = "UTC"`) this produces correct copy. For any non-UTC group the announcement would name the wrong day and wrong hour from the member's perspective. Fix `announce.ts` in lockstep with `format.ts` when the UTC-display fix lands — both must convert to group-local at the same time to avoid card/announcement divergence. Low (dormant while demo group is UTC).
- **`durationMinutes` is parsed but not wired to `endsAt`.** `GroupRhythm.durationMinutes` exists and `createEvent` accepts `endsAt`, but `reconcile.ts` creates events with no end time. Deliberate MVP shortcut: single-instant events are sufficient for scheduled mode. Wire it when the event detail needs a displayed end time. Low.
