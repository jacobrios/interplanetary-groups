# Interplanetary Groups

**An AI coordinator for casual recurring groups, so nobody has to be the organizer.**

The group is the persistent thing. Events are activations of it.

> ### 🚧 Work in progress
>
> This is an MVP under active construction, not a finished product. Onboarding and the core coordination loop work end to end; several things are deliberately unbuilt and listed under [Where it stands](#where-it-stands). There is no hosted demo yet. A Vercel link will go here when the build is far enough along to be worth clicking.

---

## The problem

Casual groups pick between two bad options. Low-effort coordination ("show up if you want") means nobody shows up. High-effort coordination (polls, forms, a group text with forty replies) feels like planning a wedding for a casual Sunday. Both fail for the same reason: someone always has to be the organizer, and that person burns out or never volunteers in the first place. So most plans never happen, and groups slowly stop doing things together.

Interplanetary Groups gives that job to an AI coordinator named Orbit. People say what they want in plain language. Orbit checks in, gauges interest, proposes a concrete plan, and produces a clean event page. The organizer role dissolves.

I'm building this with a local investor who wants the product to exist. That sets the bar: the decisions recorded in this repo are about what a real product should do, not what makes a demo look finished.

---

## What it does

**Setup is a conversation, not a form.** A founder describes their group the way they'd text a friend ("we're a climbing crew of 8, we go Monday and Wednesday mornings at 8"). Orbit extracts the rhythm, plays back what it understood, asks about anything genuinely missing, and creates the group with its first event already on the calendar.

**One link joins people to the group, never to an event.** No app download, no password, no account setup. A name is the only identity needed to participate.

**Anyone can start something.** When a member floats an idea in chat, Orbit proposes a specific day and time with one-tap responses and a running tally. Three yeses and it creates the event in that same tap, inheriting the group's usual venue when the activity matches. No traction and the idea quietly scrolls away, with nobody left holding a failed plan.

---

## Designs

> **⚠️ These are design mockups, not screenshots of the running application.** They show intended behavior, including some the build has not reached and some it has deliberately moved past. For what actually works today, read [Where it stands](#where-it-stands).

![Onboarding: Orbit asks about a missing climb time, and the invite link screen](docs/design/walkthrough-screens/screens-03-04.png)

![The spark: Orbit gauges interest in a chat idea, then creates the event when the third person is in](docs/design/walkthrough-screens/screens-07-08.png)

---

## How Orbit decides things

Orbit is an agent: tools, context, and guardrails about when to act, when to ask, and when to stay quiet. The guardrails are the interesting part, and most of them exist because something went wrong first.

**Model output is a claim, not a fact.** Every structured extraction passes through a single normalization boundary (`src/lib/orbit/normalize.ts`) before any user-facing behavior keys off it. Nothing branches on a raw model response. This is not theoretical hygiene: extraction once reported a field as missing that the schema never required, which would have sent Orbit to ask the founder a clarifying question about something the product had no reason to know.

**Stored state is carried, never regenerated.** When Orbit merges a new answer into an existing group profile, untouched fields are copied verbatim rather than re-derived. Without that rule, a single clarifying question caused the stored activity label to drift from `CLIMBING` to `CLIMB`, because the model re-read the original description instead of respecting what was already saved.

**Propose something concrete, then absorb corrections.** Orbit names a day and a venue rather than handing the group a grid of options to sort out. A poll is the organizer's job pushed back onto everyone; a specific proposal is something people can just answer.

**Ask when it matters, guess never, and let some things stay empty.** A missing meeting time blocks scheduling, so Orbit asks. A missing venue does not, so it never blocks anything, at any point in the product.

**Three yeses, and a rule about who counts.** The person who floated the idea is counted automatically only when they named the day Orbit is proposing, because in that case their message already was the yes. When Orbit picked the day itself, they vote like everyone else. A threshold reached after the proposed start time creates nothing.

**When nobody said a time, say where the time came from.** A stated time always wins. Failing that, am/pm is read from the activity, so "beers at 8" is evening and "breakfast at 8" is morning. When the hour is stated but genuinely ambiguous, Orbit flips a real coin, keeps the hour, lands on evening, and discloses that it guessed. All the fallbacks live in one module and are marked as placeholders for a later slice that learns from overrides.

**Silence is a feature.** Tapping a response updates a tally; it never posts a message. Orbit pings the group only when doing so changes an outcome. The founding complaint behind this product was notification noise, so every nudge has to justify itself.

**Orbit is not a user.** It speaks through an author enum with no person record behind it, which is why it can never accidentally appear in a member list or an attendance count.

**A group is invite-only, and the link is the only door.** Someone who holds a group's URL without being in the group sees a note from Orbit telling them to ask a member for the invite link, and nothing else: not the group's name, not who is in it, not a word of the chat. Every write refuses a non-member on the server too, so a stale browser tab left open by someone who has since left cannot post, RSVP, or cast the vote that creates an event.

**When Orbit cannot think, it says so plainly.** A model call that fails because the prototype ran out of credits is told apart from one that fails because the service is down, and each gets its own honest wording. In onboarding the founder keeps their text and can retry; in chat the message posts as normal and only the sender sees a quiet line saying Orbit might miss ideas until it is fixed. The reason shown is never a guess.

---

## Where it stands

**Working end to end**

- Founder onboarding: free-text description, structured extraction, a conversational loop for a missing day or time, optional meeting spot, playback, and confirmation that creates the group, its first scheduled event, and the founder's timezone in one transaction
- Invite links and joining, with existing sessions routed in rather than duplicated
- Group home: pinned upcoming event cards over a live chat feed
- RSVPs, with counts derived from rows rather than stored, and a roster grouped into In / Out / Haven't replied
- Event detail and group info pages
- The spark: interest gauges from chat, one-tap responses, a live tally, and event creation on the third yes, with the gauge answers carrying through as RSVPs
- Change requests on time: someone asks to move a plan in chat, Orbit reads it, and the plan moves only once the new time has three yeses and more support than the time it would replace
- A daily scheduled job that creates the next recurring occurrence before anyone has to think about it

**Next up**

- The one-bump resurface: a stalled but still viable idea earns exactly one nudge, then dies quietly

**Known gaps, deliberately**

- Orbit reads a correction to an event's **time** and nothing else. A wrong venue, day, or cadence still gets an honest decline in chat and has no path to being fixed there. Those are their own slices.
- A member who loses their session (cleared cookies, a new device) sees the invite-only screen until they tap the group's invite link again. Email sign-in, which would carry an identity across devices, is the first post-MVP work.
- A visual polish pass is pending, and some scaffolding defaults from project creation are still in place.

**Out of scope for the MVP**

Multi-group home UI, multi-venue UI, nested events, travel and logistics features, forwarded emails and screenshots as input, web push, photo avatars, and per-person attendance preferences. The data model accommodates all of them. The MVP deliberately does not implement any of them.

---

## How it's built

| | |
|---|---|
| Framework | Next.js 16, React 19, Tailwind 4 |
| Database | Postgres via Prisma 7, with a driver adapter |
| Auth | Supabase, auth only. The Data API is off and Prisma owns the schema, so there is exactly one source of truth. |
| AI | Claude via the Anthropic SDK, for structured extraction and Orbit's chat copy |
| Testing | Vitest |
| Hosting | Vercel, with a daily cron for the recurring-event job |

**The AI layer is deliberately boring.** Orbit extracts structured fields (days, times, cadence, activity), and deterministic code composes what you actually see on screen. The model writes free prose only for its own chat messages, and even then within constrained formats. This keeps display copy stable and testable, and it produces the structured data that reminders and calendar exports need anyway. Everything Orbit does lives under `src/lib/orbit/`, one module per job.

**Testing.** 517 tests across 38 files, covering the normalization boundary, gauge thresholds, RSVP and roster derivation, timezone handling, and recurring-event generation. Model calls are not mocked into always-succeeding shapes; the tests exercise what happens when extraction returns something wrong, because that is the case that matters.

---

## Running it locally

You'll need a Postgres database (this project uses Supabase), a Supabase project for auth, and an Anthropic API key.

```bash
npm install
cp .env.example .env     # then fill in your own values
npx prisma migrate deploy
npx prisma generate
npm run dev
```

**Two database URLs, and they are not interchangeable.** `DATABASE_URL` is the pooled connection the app uses at runtime through the Prisma driver adapter. `DIRECT_URL` is the unpooled one the Prisma CLI uses for migrations, and it's read by `prisma.config.ts` rather than by the schema. Both can point at the same database. Leaving `DIRECT_URL` out is not a quiet degradation: every Prisma CLI command fails to start, including `prisma generate`, which otherwise never touches a database.

`npm test` runs against a real database rather than mocks, so it needs the same `.env` in place with migrations already applied.

```bash
npm test        # full suite
npm run lint
```

---

## Where the thinking lives

Most of the work on this project is not in the diffs. If you want to see how the decisions were made:

- **[CLAUDE.md](CLAUDE.md)** is the standing context: product north stars, Orbit's guardrails, the load-bearing data model rules, and the UI and copy system. It's written to be operative, so it states rules rather than explaining them.
- **[docs/build-notes.md](docs/build-notes.md)** is the decision record: the reasoning, the alternatives rejected, and the lineage behind each choice. Section 11 holds one entry per build slice, including what went wrong and what that changed.
- **[docs/superpowers/](docs/superpowers/)** holds the spec and implementation plan written before each slice was built.

Slices are built one at a time, each one shippable on its own, each ending in a written record of what it decided along the way.
