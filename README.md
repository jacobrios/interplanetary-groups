# Interplanetary Groups

**An AI coordinator for casual recurring groups, so nobody has to be the organizer.**

> ### Live at [interplanetarygroups.com](https://interplanetarygroups.com)
>
> Deployed 25 August 2026, on its own domain since 26 August. The front door lets you start a group and walk the whole arc. Everything past that is invite-only by design, so a group's page is never reachable by anyone holding a URL.

---

## The problem

Casual groups pick between two bad options. Low-effort coordination ("show up if you want") means nobody shows up. High-effort coordination (polls, forms, a group text with forty replies) feels like planning a wedding for a casual Sunday. Both fail for the same reason: someone always has to be the organizer, and that person burns out or never volunteers in the first place. So most plans never happen, and groups slowly stop doing things together.

Interplanetary Groups gives that job to an AI coordinator named Orbit. People say what they want in plain language. Orbit checks in, gauges interest, proposes a concrete plan, and produces a clean event page. The organizer role dissolves.

I'm building this with a local investor who wants the product to exist. That sets the bar: the decisions recorded in this repo are about what a real product should do, not what makes a demo look finished.

---

## Where the thinking lives

Most of the work on this project is not in the diffs. What this repo keeps, alongside the code, is the record of what was decided, what was rejected, and why. That is the part worth reading.

The code was written with AI assistance, working from the standing brief and slice documents in this repo under my direction.

- **[CLAUDE.md](CLAUDE.md)** is the standing context: product north stars, Orbit's guardrails, the load-bearing data model rules, and the UI and copy system. It states rules rather than explaining them, so it can be followed.
- **[docs/build-notes.md](docs/build-notes.md)** is the decision record: the reasoning, the alternatives rejected, and the lineage behind each choice. Section 11 holds one entry per build slice. Corrections are dated annotations rather than edits, so the file shows what happened rather than only what it currently claims.
- **[docs/superpowers/specs/](docs/superpowers/specs/)** holds the document written before each slice was built: what was already settled, the non-goals and where each one belongs instead, how the slice would be verified, and the debt it was expected to open. Reading one beside its build-notes entry shows intended against shipped.
- **[docs/audits/](docs/audits/)** holds the whole-codebase audit run before the first deploy. **[docs/runbooks/](docs/runbooks/)** holds the procedures that touch production.

Work ships in vertical slices, one at a time, each one usable on its own and each ending in a written record of what it decided along the way.

---

## What it does

**Setup is a conversation, not a form.** A founder describes their group the way they'd text a friend ("we're a climbing crew of 8, we go Monday and Wednesday mornings at 8"). Orbit extracts the rhythm, plays back what it understood, asks about anything genuinely missing, and creates the group with its first event already on the calendar.

**One link joins people to the group, never to an event.** No app download, no password, no account setup. A name is the only identity needed to participate.

**Anyone can start something.** When a member floats an idea in chat, Orbit proposes a specific day and time with one-tap responses and a running tally. Three yeses and it creates the event in that same tap, inheriting the group's usual venue when the activity matches. The votes carry through as RSVPs, so nobody answers twice.

**An idea has an ending as well as a beginning.** A stalled idea earns one nudge, then closes. If the day was the only thing blocking it, Orbit asks what day would work instead, hears the answer, and opens a fresh gauge on that day at the time the group already agreed on.

**Plans move by group decision, not by one person's word.** Asking to change an event's time in plain language opens a vote. The plan moves only when the new time clears the same bar and beats the number of people still in on the old one.

**The plan reaches people outside the app.** An event hands a member's own calendar the plan, its meeting spot and its address. A digest carries what needs them and what they missed, at most once a day, and only when there is something to say.

---

## Designs

> These are design mockups, not screenshots of the running application. They show intended behavior, including some the build has not reached and some it has deliberately moved past. For what works today, open [the live site](https://interplanetarygroups.com).

![Onboarding: Orbit asks about a missing climb time, and the invite link screen](docs/design/walkthrough-screens/screens-03-04.png)

![The spark: Orbit gauges interest in a chat idea, then creates the event when the third person is in](docs/design/walkthrough-screens/screens-07-08.png)

---

## How Orbit decides things

Orbit is an agent: tools, context, and guardrails about when to act, when to ask, and when to stay quiet. The guardrails are the interesting part, and most of them exist because something taught us they needed to.

**Model output is a claim, not a fact.** Every structured extraction passes through a normalization boundary before any user-facing behavior keys off it, so nothing branches on a raw model response. Extraction once reported a field as missing that the schema never required, which would have sent Orbit to ask the founder about something the product had no reason to know. There is a second boundary of the same kind for the auth service, typed so that a new failure result is a compile error at every call site rather than a member staring at a blank line.

**Stored state is carried, never regenerated.** When Orbit merges a new answer into an existing group profile, untouched fields are copied verbatim rather than re-derived. Without that rule, one clarifying question was enough to make the stored activity label drift from `CLIMBING` to `CLIMB`.

**Propose something concrete, then absorb corrections.** Orbit names a day and a venue rather than handing the group a grid of options to sort out. A poll is the organizer's job pushed back onto everyone; a specific proposal is something people can just answer.

**Ask when it matters, and let some things stay empty.** A missing meeting time blocks scheduling, so Orbit asks. A missing venue does not, so it never blocks anything, at any point in the product.

**Read the ambiguity out of the sentence, then say how you read it.** "Beers at 8" is evening and "breakfast at 8" is morning, because the activity settles it. When the hour alone is a genuine toss-up, Orbit keeps the hour, picks the evening, and says so out loud ("You said 8, so I'm taking that as 8pm"), because a card quietly reading 7 would contradict the person who said 8.

**Three yeses, and a rule about who counts.** The person who floated the idea is counted automatically only when they named the day Orbit is proposing, because in that case their message already was the yes. When Orbit picked the day itself, they vote like everyone else.

**Silence is a feature, and never the answer to a direct ask.** Tapping a response updates a tally; it never posts a message. Orbit speaks up on its own initiative only when it changes an outcome. That governs initiative and not replies: a member plainly asking Orbit for something gets a question back rather than nothing. Every place Orbit decides to speak or stay quiet is written down in one list, and adding a new one means adding a line to it.

**Orbit is not a user.** It speaks through an author enum with no person record behind it, which is why it can never appear in a member list or an attendance count.

**A group is invite-only, and the link is the only door.** Someone holding a group's URL without being in the group learns nothing: not the name, not who is in it, not a word of the chat. Every write refuses a non-member on the server too, so a stale tab left open by someone who has since left cannot post, RSVP, or cast the vote that creates an event. A member's email address is shown on one screen, to the person it belongs to, and is never fetched over a roster.

**When Orbit cannot think, it says so plainly.** A model call that fails because the prototype ran out of credits is told apart from one that fails because the service is down, and each gets its own honest wording. The founder keeps their text and can retry. The reason shown is never a guess.

---

## Where it stands

**Working today**

- **Onboarding**, from a plain-language description to a real group with its first event scheduled, its timezone captured, and the invite link ready to send
- **The group**, with upcoming plans pinned over a live chat feed, event pages, a roster, and an info page carrying the invite link and the group's self-service actions
- **The spark**, end to end: ideas gauged in chat, created on the third yes, and given a proper ending when they stall
- **Time changes** as a group decision, with a vote that closes rather than sitting open forever
- **Coming and going**: invite links, join announcements, a members-only wall on every read and write, and email sign-in so a member can come back as themselves from any device
- **Reaching people outside the app**: add-to-calendar, and a daily digest that sends only when there is something to say
- **An hourly job** that creates the next recurring plan, closes what has stalled, and sends the digest

**Not built yet**

- Orbit changes an event's **time** and nothing else. A wrong venue, day, or cadence gets an honest decline in chat, and each is its own future slice.
- A member who has attached an email comes back as themselves. One who never attached one is treated as a new person if they lose their session, which leaves the group with a duplicate member to tidy up. Closing that fully is queued.
- There is no way into a second group from inside the app.
- Sending a message is slower than it should be in a chatty group. That is the next thing being built.

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
| Email | Resend, on two separate sending subdomains so a digest that collects spam complaints can never affect login-code delivery |
| Testing | Vitest, plus two graded model benches that run outside the suite |
| Hosting | Vercel, with an hourly cron carrying the recurring-event job, both endgame sweeps, and the digest |

**The AI layer is deliberately boring.** Orbit extracts structured fields (days, times, cadence, activity), and deterministic code composes what you actually see on screen. The model writes free prose only for its own chat messages, and even then within constrained formats. This keeps display copy stable and testable, and it produces the structured data that reminders, the calendar button, and check-ins need anyway. Nothing in the digest calls a model at all.

**Testing, and a second kind of evidence for the model.** 1,374 tests across 126 files cover the normalization boundary, gauge thresholds, RSVP and roster derivation, timezone handling, recurring-event generation, the membership wall, and the digest's send rules. Model calls are not mocked into always-succeeding shapes; the tests exercise what happens when extraction returns something wrong, because that is the case that matters. A unit test cannot tell you whether Orbit recognizes a request, so two graded benches do that instead, running realistic cases through the real production path and scoring each as a rate over repeated runs. `npm run eval:detect` grades 33 cases on what Orbit must recognize and what it must stay quiet about; `npm run eval:onboarding` grades 14 on rhythm extraction and the gap-ask merge. Both are kept outside the test runner, because they cost money and hit the network.

---

## Running it locally

You'll need a Postgres database (this project uses Supabase), a Supabase project for auth, and an Anthropic API key.

```bash
cp .env.example .env     # then fill in your own values, BEFORE npm install
npm install              # its postinstall step runs prisma generate for you
npx prisma migrate deploy
npm run dev
```

**The `.env` copy comes first, and that order is load-bearing.** `npm install` runs `prisma generate` as a postinstall step, `prisma.config.ts` resolves `DIRECT_URL` the moment it loads, and a fresh clone has no `.env` because it is gitignored. Copy the file first and the install generates the client on its own, which is also what the Vercel build relies on.

**Two database URLs, and they are not interchangeable.** `DATABASE_URL` is the pooled connection the app uses at runtime through the Prisma driver adapter. `DIRECT_URL` is the unpooled one the Prisma CLI uses for migrations, read by `prisma.config.ts` rather than by the schema. Both can point at the same database, and every Prisma CLI command fails to start without `DIRECT_URL`, including `prisma generate`.

**Email fails closed outside production.** A send from a non-production environment goes only to an address named in `EMAIL_DEV_ALLOWLIST`, and an unset allowlist sends nothing. That is the intended default: a development database holds QA rows carrying real addresses, so a local run must never be one command away from mailing a real person.

`npm test` runs against a real database rather than mocks, so it needs the same `.env` in place with migrations already applied.

```bash
npm test        # full suite
npm run lint
```
