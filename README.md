# Interplanetary Groups

**An AI coordinator for casual recurring groups, so nobody has to be the organizer.**

The group is the persistent thing. Events are activations of it.

> ### Live at [interplanetarygroups.com](https://interplanetarygroups.com)
>
> Deployed 25 August 2026, on its own domain since 26 August. The front door lets you start a group and walk the whole arc; everything past that is invite-only by design, so a group's page is never reachable by anyone holding a URL. It is a real product with a small real audience, still under active construction. What is deliberately unbuilt is listed under [Where it stands](#where-it-stands).

---

## The problem

Casual groups pick between two bad options. Low-effort coordination ("show up if you want") means nobody shows up. High-effort coordination (polls, forms, a group text with forty replies) feels like planning a wedding for a casual Sunday. Both fail for the same reason: someone always has to be the organizer, and that person burns out or never volunteers in the first place. So most plans never happen, and groups slowly stop doing things together.

Interplanetary Groups gives that job to an AI coordinator named Orbit. People say what they want in plain language. Orbit checks in, gauges interest, proposes a concrete plan, and produces a clean event page. The organizer role dissolves.

I'm building this with a local investor who wants the product to exist. That sets the bar: the decisions recorded in this repo are about what a real product should do, not what makes a demo look finished.

---

## What it does

**Setup is a conversation, not a form.** A founder describes their group the way they'd text a friend ("we're a climbing crew of 8, we go Monday and Wednesday mornings at 8"). Orbit extracts the rhythm, plays back what it understood, asks about anything genuinely missing, and creates the group with its first event already on the calendar. The last step hands them the invite link to share.

**One link joins people to the group, never to an event.** No app download, no password, no account setup. A name is the only identity needed to participate. When someone joins, the feed gains one quiet line saying so.

**Anyone can start something.** When a member floats an idea in chat, Orbit proposes a specific day and time with one-tap responses and a running tally. Three yeses and it creates the event in that same tap, inheriting the group's usual venue when the activity matches. The votes carry through as RSVPs, so nobody answers twice.

**An idea has an ending as well as a beginning.** A stalled idea earns exactly one nudge the evening before its day, then closes. If the day was the only thing blocking it, and enough people wanted it, Orbit asks what day would work instead, hears the answer, and opens a fresh gauge on that day with the original's time carried over. If nobody answers, it guesses once, a week later, and then lets it go.

**Plans can move, but not on one person's word.** A member asking to change an event's time in plain language opens a vote to the whole group. The plan moves only when the new time clears the same three-yes bar and beats the number of people still in on the old one. A vote that stalls gets closed and said so, rather than sitting there invisible.

**The plan can leave the app.** An event page hands a member's own calendar the title, time, meeting spot and address.

**Coming back works.** A member can attach an email and sign in from any device with a typed code. Orbit asks for that email at most twice per person, ever, and the counter counts declines rather than appearances, so ignoring the ask is not answering it.

**One email, at most once a day, and only when there is something to say.** The digest carries two blocks: what needs you (an idea you have not voted on, an event you have not RSVP'd to, a time-change vote you have not answered), and what you missed since you last opened the group. Both blocks empty sends nothing, which is what makes a daily cadence safe. One click stops it for good.

---

## Designs

> **These are design mockups, not screenshots of the running application.** They show intended behavior, including some the build has deliberately moved past. For what actually works today, read [Where it stands](#where-it-stands), or open [the live site](https://interplanetarygroups.com).

![Onboarding: Orbit asks about a missing climb time, and the invite link screen](docs/design/walkthrough-screens/screens-03-04.png)

![The spark: Orbit gauges interest in a chat idea, then creates the event when the third person is in](docs/design/walkthrough-screens/screens-07-08.png)

---

## How Orbit decides things

Orbit is an agent: tools, context, and guardrails about when to act, when to ask, and when to stay quiet. The guardrails are the interesting part, and most of them exist because something went wrong first.

**Model output is a claim, not a fact.** Every structured extraction passes through a normalization boundary (`src/lib/orbit/normalize.ts`) before any user-facing behavior keys off it. Nothing branches on a raw model response. This is not theoretical hygiene: extraction once reported a field as missing that the schema never required, which would have sent Orbit to ask the founder a clarifying question about something the product had no reason to know. There is now a second boundary of the same kind for the auth service (`src/lib/auth/email.ts`), and it is the stronger of the two: each screen's error map is typed so that a new failure result is a compile error at every call site rather than a member staring at a blank line.

**Stored state is carried, never regenerated.** When Orbit merges a new answer into an existing group profile, untouched fields are copied verbatim rather than re-derived. Without that rule, a single clarifying question caused the stored activity label to drift from `CLIMBING` to `CLIMB`, because the model re-read the original description instead of respecting what was already saved.

**Propose something concrete, then absorb corrections.** Orbit names a day and a venue rather than handing the group a grid of options to sort out. A poll is the organizer's job pushed back onto everyone; a specific proposal is something people can just answer.

**Ask when it matters, guess never, and let some things stay empty.** A missing meeting time blocks scheduling, so Orbit asks. A missing venue does not, so it never blocks anything, at any point in the product.

**Three yeses, and a rule about who counts.** The person who floated the idea is counted automatically only when they named the day Orbit is proposing, because in that case their message already was the yes. When Orbit picked the day itself, they vote like everyone else. A threshold reached after the proposed start time creates nothing.

**When nobody said a time, say where the time came from.** A stated time always wins. Failing that, am/pm is read from the activity, so "beers at 8" is evening and "breakfast at 8" is morning. When the hour is stated but genuinely ambiguous, Orbit flips a real coin, keeps the hour, lands on evening, and discloses that it guessed. All the fallbacks live in one module and are marked as placeholders for a later slice that learns from overrides.

**Silence is a feature, but never in reply to a direct ask.** Tapping a response updates a tally; it never posts a message. Orbit pings the group only when doing so changes an outcome. That governs Orbit speaking up on its own initiative, and it does not govern replies: a member plainly asking Orbit for something gets a question back rather than nothing. That distinction is an amendment, made after QA found direct requests dying in silence, and the fix had to be made in two places that disagreed, the code and the prompt.

**Orbit reads the conversation, not just the message.** Detection sees the last twenty messages including Orbit's own, each timestamped, so a bare follow-up lands on the plan the group was just discussing and a newer proposal supersedes the one before it. Join announcements are excluded from that window, so somebody joining can never be read as somebody asking for something.

**Orbit is not a user.** It speaks through an author enum with no person record behind it, which is why it can never accidentally appear in a member list or an attendance count.

**Every place Orbit speaks or stays quiet is written down in one list.** Adding a new such decision means adding a line to it. The list exists because the 29 July recognition bug was two copies of the same rule, in code and in prompt prose, quietly disagreeing.

**A group is invite-only, and the link is the only door.** Someone who holds a group's URL without being in the group sees a note from Orbit telling them to ask a member for the invite link, and nothing else: not the group's name, not who is in it, not a word of the chat. Every write refuses a non-member on the server too, so a stale browser tab left open by someone who has since left cannot post, RSVP, or cast the vote that creates an event.

**An address belongs to its owner, not to the group.** A member's email is shown on exactly one screen, to exactly the viewer whose address it is, and is never fetched over a roster. Three server-rendered pages pull whole user rows and are safe only because that table carries no email column, so a test now reads the schema and fails the day somebody adds one.

**When Orbit cannot think, it says so plainly.** A model call that fails because the prototype ran out of credits is told apart from one that fails because the service is down, and each gets its own honest wording. In onboarding the founder keeps their text and can retry; in chat the message posts as normal and only the sender sees a quiet line saying Orbit might miss ideas until it is fixed. The reason shown is never a guess.

---

## Three things that went wrong, and what they changed

**Losing a session did not lock anyone out. It duplicated the person.** The old version of this file said a member who cleared their cookies met the invite-only screen until they tapped the link again. They did not. They tapped the link, had no session, and joined as a second member: the group held two of them, their earlier answers belonged to an identity nobody could reach, and every count quietly stopped being true, in the one product whose entire claim is accurate attendance. Nothing showed an error. That is what moved email sign-in ahead of everything else, and the fix went upstream of the problem rather than into a merge routine, because a safe merge of two identities costs more than closing the door that makes them.

**The site was down for four days for every signed-in member, and looked perfectly healthy.** A migration shipped without being applied to production, so any page reading a user row threw. A logged-out visitor saw a working front door the whole time, because the front door, the invite screen and the sign-in screen never read that table. It was found by luck, when the next slice happened to have a migration of its own and somebody ran a read-only status check before merging. Two things came out of it: a deploy obligation now goes on a running list the day it is created, not the day it is remembered, and site health monitoring is queued with a constraint attached, since a monitor that merely pings the site would have read green for all four days.

**A recorded explanation turned out to be wrong, and the work built on it was still right.** Gmail showed no unsubscribe control on the first digest, and the record blamed a missing header. The header was added; Gmail still shows nothing, and the delivered message provably carries it inside the signed header list. So the recorded cause is falsified rather than merely unproven, and the current explanation is a working guess that nobody outside Google can verify. The header stays, for three reasons that never depended on the guess: the mailbox providers' own bulk-sender rules require it, other clients honour it, and the product's own "Stop these emails" link is the exit that always works.

---

## Where it stands

**Working end to end**

- Founder onboarding in three steps: free-text description, structured extraction, a conversational loop for a missing day or time, optional meeting spot, playback, confirmation that creates the group with its first scheduled event and its timezone in one transaction, and the invite link to share
- Invite links and joining, with existing sessions routed in rather than duplicated, and a quiet join line in the feed
- Group home: a card region of upcoming plans over a live chat feed, with unanswered ideas appearing as their own cards mingled with confirmed plans in date order, five at most
- A card-state grammar where teal marks what needs the viewer and never leans an open question, and status is never carried by hue alone
- RSVPs, with counts derived from rows rather than stored, and a roster grouped into In / Out / Haven't replied
- Event detail, group info, and a front door that routes a session with a group straight in
- The spark: interest gauges from chat, one-tap responses, a live tally, and event creation on the third yes, with the gauge answers carrying through as RSVPs
- The gauge endgame: one bump the evening before, a close two hours before the proposed start, and a goodbye only for an idea somebody actually said yes to
- The wrong-day retry: an idea the day alone blocked gets asked what day would work, then guessed once a week later, and the answer to that question is heard and acted on
- Day comments on a live gauge: naming a better day while a vote is running is counted as a vote and remembered as the retry's answer
- Change requests on time: someone asks to move a plan in chat, Orbit reads it, the group votes, and the plan moves only once the new time clears the bar and beats the time it would replace. A stalled vote is closed and said so
- Add to calendar: an event page hands a member's own calendar the plan, its meeting spot and its street address
- The group info page: who is in, when and where the group meets, the invite link with a share button, and the group's only self-service actions (leave, remove a member, reset the link)
- A members-only wall on every read surface and every write path, enforced on the server
- Email sign-in: attach an address, come back as yourself from any device with a typed eight-digit code
- The digest: two blocks, at most one email a day per member per group, sent in the hour the group's own clock reads 8pm, with one-click unsubscribe
- An hourly scheduled job that creates the next recurring occurrence, runs both endgame sweeps, and sends the digest
- Brand assets and a link preview, so a texted invite arrives as a card naming the group rather than as a bare URL

**Next**

The message-latency fix. A six-message group takes three to four seconds to send, because the app reloads the whole chat history and re-renders twice per send, so the chat gets slower the more the group talks. After that, a decision about whether notifications are worth a home-screen web push, a thin native shell, or neither.

**Known gaps, deliberately**

- Orbit reads a correction to an event's **time** and nothing else. A wrong venue, day, or cadence gets an honest decline in chat and has no path to being fixed there. A founder who spots a wrong detail after creation has no fix path anywhere. Those are their own slices.
- A member who attached an email comes back as themselves. A member who never attached one still rejoins through the invite link as a second person, with every count quietly wrong, because nothing about them was ever recorded. Attaching is optional forever, so that population never empties. Duplicates that already exist are not merged, by decision; removing the extra member is the cleanup.
- There is no way into a second group from inside the app, and a session belonging to several groups is sent to the most recent one. The multi-group home is out of scope; the missing entry point is not, and is queued separately.
- No send log lives in this project's own database, so if a member says they never got an email, the only record is the mail service's dashboard. The digest's sending subdomain is new and has no reputation yet, so early messages may be filtered.
- Nothing in the product reports that it is broken.

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
| Email | Resend, on two separate sending subdomains so a digest that collects complaints can never drag login-code delivery down with it |
| Testing | Vitest, plus two graded model benches that run outside the suite |
| Hosting | Vercel, with an hourly cron carrying the recurring-event job, both endgame sweeps, and the digest |

**The AI layer is deliberately boring.** Orbit extracts structured fields (days, times, cadence, activity), and deterministic code composes what you actually see on screen. The model writes free prose only for its own chat messages, and even then within constrained formats. This keeps display copy stable and testable, and it produces the structured data that reminders, the calendar button, and check-ins need anyway. Everything Orbit does lives under `src/lib/orbit/`, one module per job. Nothing in the digest calls a model at all.

**Testing.** 1,374 tests across 126 files, covering the normalization boundary, gauge thresholds, RSVP and roster derivation, timezone handling, recurring-event generation, the membership wall, and the digest's send rules. Model calls are not mocked into always-succeeding shapes; the tests exercise what happens when extraction returns something wrong, because that is the case that matters.

**Model behavior gets a different kind of evidence.** A passing unit test cannot tell you whether Orbit recognizes a request, so the suite tests the deterministic seam and never calls a model. Two hand-run benches do that instead, grading realistic cases through the real production path and scoring each as a rate over repeated runs, because one clean walkthrough is not evidence. `npm run eval:detect` grades 33 cases on what Orbit must recognize, what it must stay quiet about, and a bucket of deliberately ambiguous ones. `npm run eval:onboarding` grades 14 cases on rhythm extraction and the gap-ask merge. Both are kept provably outside the test runner, because they cost money and hit the network, and a bench that can masquerade as the suite is worse than no bench.

---

## Running it locally

You'll need a Postgres database (this project uses Supabase), a Supabase project for auth, and an Anthropic API key.

```bash
cp .env.example .env     # then fill in your own values, BEFORE npm install
npm install              # its postinstall step runs prisma generate for you
npx prisma migrate deploy
npm run dev
```

**The `.env` copy comes first, and that order is load-bearing.** `npm install`
runs `prisma generate` as a postinstall step, `prisma.config.ts` resolves
`DIRECT_URL` the moment it loads, and a fresh clone has no `.env` because it is
gitignored. Installing first therefore fails with `Cannot resolve environment
variable: DIRECT_URL` from a step you did not ask for. Copy the file first and the
install generates the client on its own, which is also what the Vercel build
relies on.

**Two database URLs, and they are not interchangeable.** `DATABASE_URL` is the pooled connection the app uses at runtime through the Prisma driver adapter. `DIRECT_URL` is the unpooled one the Prisma CLI uses for migrations, and it's read by `prisma.config.ts` rather than by the schema. Both can point at the same database. Leaving `DIRECT_URL` out is not a quiet degradation: every Prisma CLI command fails to start, including `prisma generate`, which otherwise never touches a database.

**Email fails closed outside production.** A send from a non-production environment goes only to an address named in `EMAIL_DEV_ALLOWLIST`, and an unset allowlist sends nothing at all. That is the intended default rather than a bug: a development database holds QA rows carrying real addresses, so a local run of a half-built feature must not be one command away from mailing a real person.

`npm test` runs against a real database rather than mocks, so it needs the same `.env` in place with migrations already applied.

```bash
npm test        # full suite
npm run lint
```

---

## Where the thinking lives

Most of the work on this project is not in the diffs. The code is the cheapest part and it is the part that gets rewritten; what does not get rewritten is the record of what was decided, what was rejected, and what a mistake cost. This repo keeps all three, and they are the thing worth reading.

The code was written with AI assistance, working from the standing brief and slice documents in this repo under my direction.

- **[CLAUDE.md](CLAUDE.md)** is the standing context: product north stars, Orbit's guardrails, the load-bearing data model rules, and the UI and copy system. It's written to be operative, so it states rules rather than explaining them.
- **[docs/build-notes.md](docs/build-notes.md)** is the decision record: the reasoning, the alternatives rejected, and the lineage behind each choice. Section 11 holds one entry per build slice, including what went wrong and what that changed. Corrections are dated annotations rather than edits, so the file shows what happened rather than only what it currently claims.
- **[docs/superpowers/specs/](docs/superpowers/specs/)** holds the document written before each slice was built: the decisions already settled, the non-goals and where each one belongs instead, how the slice would be verified, and the debt it was expected to open. Reading one beside the slice's build-notes entry shows intended against shipped.
- **[docs/audits/](docs/audits/)** holds the whole-codebase audit run before the first deploy, and its findings.
- **[docs/runbooks/](docs/runbooks/)** holds the procedures that touch production.

Slices are built one at a time, each one shippable on its own, each ending in a written record of what it decided along the way, including the decisions made in passing that would otherwise resurface later as mysteries.
