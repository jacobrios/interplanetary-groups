# Lane 6: What breaks or costs money the day it is live?

Read-only pass over the repo as the thing that has to survive first contact with
Vercel and with real traffic. Written as I went.

## Coverage

Read in full:

- next.config.ts
- vercel.json
- prisma.config.ts
- package.json
- tsconfig.json
- eslint.config.mjs
- vitest.config.ts
- .env.example
- .gitignore
- src/lib/prisma.ts
- src/lib/supabase/env.ts
- src/lib/supabase/server.ts
- src/lib/supabase/proxy-session.ts
- src/proxy.ts
- src/app/api/cron/orbit/route.ts
- src/app/error.tsx
- src/app/not-found.tsx
- src/app/layout.tsx
- src/app/page.tsx
- src/lib/nav/front-door.ts
- src/lib/auth/current-user.ts
- src/lib/auth/membership.ts
- src/lib/orbit/reconcile.ts
- src/lib/orbit/endgame.ts
- src/lib/proposals/endgame.ts
- src/lib/orbit/extract.ts
- src/lib/orbit/model-errors.ts
- src/lib/orbit/fetch-window.ts
- src/lib/events/upcoming-list.ts
- src/lib/gauges/read.ts
- src/lib/proposals/read.ts
- src/app/groups/[id]/page.tsx
- src/app/groups/[id]/GroupHome.tsx
- src/app/actions/send-message.ts
- src/app/actions/detect-intent.ts
- docs/build-notes.md §11 "Before first Vercel deploy" checklist (all 11 items)

Also read in full (the rest of the Prisma-query surface and the model path):

- src/app/events/[id]/page.tsx
- src/app/events/[id]/calendar.ics/route.ts
- src/app/groups/[id]/info/page.tsx
- src/app/join/[inviteToken]/page.tsx
- src/app/actions/create-group.ts
- src/app/actions/join-group.ts
- src/app/actions/gauge-vote.ts
- src/app/actions/proposal-vote.ts
- src/app/actions/extract-group.ts
- src/app/actions/leave-group.ts
- src/lib/groups/provision.ts
- src/lib/messages/create.ts
- src/lib/events/move.ts
- src/lib/proposals/promote.ts
- src/lib/gauges/promote.ts
- src/lib/gauges/open-ask.ts
- src/app/create/OnboardingWizard.tsx (lines 40-80 only, for the lint error)
- README.md (the two-database / DIRECT_URL section)
- AGENTS.md
- node_modules/@prisma/adapter-pg/dist/index.js, node_modules/pg-pool/index.js,
  node_modules/pg-connection-string/index.js (to verify F-6-9)
- node_modules/next/dist/docs/01-app/03-api-reference/05-config/03-eslint.md
  (to verify whether lint errors block a build)

Read by targeted grep rather than in full, because the question I had of them was
narrow (unbounded queries, error paths, transaction shape) and each answered it in
its first thirty lines:

- src/lib/events/rsvp.ts, src/lib/events/create.ts
- src/lib/groups/join.ts, leave.ts, remove-member.ts, reset-invite.ts
- src/lib/gauges/vote.ts, create.ts, day-comment.ts
- src/lib/proposals/create.ts
- src/app/actions/rsvp.ts, proposal-answer.ts, merge-gap.ts, remove-member.ts,
  reset-invite-link.ts
- src/lib/orbit/endgame.ts (read in full across four targeted ranges covering
  runGaugeEndgame, handleOne, handleBump, handleRevive and handleClose; the
  copy-building helpers were not read, being out of lane)

Assigned to my lane and NOT read, with the reason:

- Every file under `src/components/`, the card and chat components, and the
  onboarding step components other than `OnboardingWizard.tsx`. They issue no
  Prisma queries and hold no deploy or cost surface; presentation is lanes 1-3.
- `prisma/schema.prisma` beyond the first 40 lines and the `Message.body` /
  `Group.description` column types. Schema correctness is lane 4's.
- All `__tests__` directories, `evals/`, and `scripts/qa-stage-*.ts`. None ships.
- `src/app/globals.css`, `postcss.config.mjs`. No runtime or cost surface.

---

## Findings

### F-6-1: The hourly Orbit job can be stopped dead by one bad group, and everything after it in the same tick silently does not run

- **file:line** — `src/lib/orbit/reconcile.ts:130`, with `src/app/api/cron/orbit/route.ts:50-56`
- **consequence** — Orbit's once-an-hour wake-up does three jobs in a fixed order:
  create the next recurring plan, close out ideas that stalled, and close out
  time-change votes that stalled. If the first job hits an unexpected problem on
  any single group, it stops there. Not only does that group miss its plan, but
  every group after it in the list misses its plan too, and the other two jobs
  never run at all that hour for anybody. The visible symptoms are exactly the
  ones the product spent slices closing: an idea that never gets its last-call or
  its goodbye, and a time-change vote that never ends. Nothing tells the owner
  this happened except a line in the Vercel log, and the next hour tries again
  from the same first group, so a persistent problem in one group can keep the
  whole product's scheduled behaviour switched off indefinitely.
- **evidence** — `reconcile.ts` processes groups in a `for` loop and catches only
  the one expected error:

  ```
  if ((err as { code?: string }).code === "P2002") {
    results.push({ groupId, status: "skipped", reason: "duplicate" })
    continue
  }
  // Any other error is unexpected — re-throw so the cron handler can log it
  throw err
  ```

  The throw escapes the loop, so groups later in `prisma.group.findMany()` are
  never reached. The cron handler runs the three sweeps as three sequential
  awaits inside one `try`:

  ```
  const results = await reconcileScheduledEvents(new Date())
  const endgame = await runGaugeEndgame(new Date())
  const proposalEndgame = await runProposalEndgame(new Date())
  ```

  so a throw from the first `await` skips the other two entirely and returns 500.
  The contrast is the tell: both endgame sweeps already do the right thing and
  wrap each item, e.g. `endgame.ts:146-150`
  (`try { results.push(await handleOne(gauge, now)) } catch (err) { console.error(...) }`)
  and `proposals/endgame.ts:83-87`. Reconcile is the one sweep that does not, and
  it is the one that runs first.
- **severity** — fix-now
- **confidence** — certain

### F-6-2: The group home loads every message the group has ever sent, on every render, with no limit

- **file:line** — `src/app/groups/[id]/page.tsx:101-105`
- **consequence** — Opening a group loads its entire chat history from the
  database and ships all of it to the phone, however long it is. Worse, sending
  one message causes this to happen twice: once when the message posts and again
  a beat later when Orbit finishes reading it. A young group will not notice. A
  group that has been chatting for a few months will find the screen getting
  slower every week, on the exact interaction people use most, and the person who
  notices first is the one on a weak phone signal. This also costs money in two
  places at once: database egress and Vercel function time, both of which grow
  with the length of the conversation rather than with how many people are using
  the product.
- **evidence** — The query has no `take`, no cursor, and no date window:

  ```
  const rawMessages = await prisma.message.findMany({
    where: { groupId: group.id },
    orderBy: { createdAt: "asc" },
    include: { author: true },
  })
  ```

  Every row is then mapped into `FeedMessage[]` (`page.tsx:204-211`) and passed as
  a prop to the `GroupHome` client island (`page.tsx:279`), so the whole history is
  also serialised into the page payload sent to the browser. The double-render per
  send is `send-message.ts:96` (`revalidatePath(\`/groups/${groupId}\`)`) followed by
  `detect-intent.ts:387` (`revalidatePath(\`/groups/${touchedGroupId}\`)`), both
  triggered from one `handleSubmit` in `GroupHome.tsx:106-133`. For contrast, every
  other message read in the codebase IS bounded: `fetch-window.ts:26-27` takes
  `WINDOW_MESSAGES - 1`, and the card region caps at `CARD_REGION_CAP`. This one
  query is the exception. At 500 messages and 20 members this is 500 rows plus a
  joined author per open, and 1,000 rows per message sent.
- **severity** — queue
- **confidence** — certain

### F-6-3: `npm run lint` can never pass, because it lints vendored design-handoff files that are not product code

- **file:line** — `eslint.config.mjs:9-15` (the `globalIgnores` list), against
  `docs/design/group-info-handoff/design-canvas.jsx`,
  `docs/design/joining-arc-handoff/design-canvas.jsx`,
  `docs/design/joining-arc-handoff/walkthrough-frames-1.jsx`
- **consequence** — The project's own code-quality check is permanently red, so it
  has stopped being a signal. 13 of its 15 errors come from design files that were
  handed over by a design tool and are not part of the running product. The two
  that ARE in real product code are buried in that noise, and any future real
  error will be too. A check that is always red is the same as no check.
- **evidence** — `npx eslint --format json` grouped by file gives:
  `4 docs/design/group-info-handoff/design-canvas.jsx`,
  `4 docs/design/joining-arc-handoff/design-canvas.jsx`,
  `5 docs/design/joining-arc-handoff/walkthrough-frames-1.jsx`,
  `1 src/app/create/OnboardingWizard.tsx`,
  `1 src/app/groups/[id]/info/ResetInviteLink.tsx`. Total run: `✖ 43 problems
  (15 errors, 28 warnings)`, exit code non-zero. `eslint.config.mjs` ignores only
  `.next/**`, `out/**`, `build/**`, `next-env.d.ts`; `docs/` is not ignored and the
  `.jsx` handoff files are picked up by the default file patterns. Confirmed
  separately that this does NOT block a Vercel deploy: Next.js 16 removed the
  ESLint build integration (`node_modules/next/dist/docs/01-app/03-api-reference/05-config/03-eslint.md`,
  version table: "`v16.0.0` — `next lint` and the `eslint` next.config.js option
  were removed"), so `next build` never runs ESLint. `npx tsc --noEmit` exits 0.
- **severity** — queue
- **confidence** — certain

### F-6-4: The pre-deploy checklist does not name the two Supabase environment variables, and without them every page crashes

- **file:line** — `docs/build-notes.md:338-410` (the eleven-item checklist), against
  `src/lib/supabase/env.ts:4-15` and `src/proxy.ts:4-6`
- **consequence** — The checklist is the owner's single gate before the first
  deploy, and it names four things to set in Vercel (`CRON_SECRET`,
  `ANTHROPIC_API_KEY`, the pooled `DATABASE_URL`, migrations). It never names
  `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, which are
  what identifies a visitor at all. Miss either and the failure is not partial:
  the very first request to any page, including the front door, throws before
  rendering. The owner would be looking at a checklist that says everything is
  done, at a site that is entirely down, with the cause not on the list. Same
  omission for `DIRECT_URL`, which the deploy needs at build time (see F-6-5).
- **evidence** — `getSupabaseEnv()` throws on a missing value rather than
  degrading:

  ```
  if (!url) { throw new Error("Missing env var: NEXT_PUBLIC_SUPABASE_URL. ...") }
  if (!publishableKey) { throw new Error("Missing env var: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. ...") }
  ```

  It is called from `proxy-session.ts:8`, which runs from `src/proxy.ts` on
  essentially every request (its matcher excludes only `_next/static`,
  `_next/image` and a handful of static file extensions), and from
  `supabase/server.ts:6` on every page that resolves a viewer. `.env.example` does
  list both variables, so the information exists in the repo, but the checklist
  the owner actually works from does not carry them. This is a "the checklist is
  missing something real" finding, not a "this item is not done yet" one.
- **severity** — fix-now
- **confidence** — certain

### F-6-5: The checklist's `prisma generate` item does not say that the generate step itself needs `DIRECT_URL`, so the fix for item 2 can fail on its own

- **file:line** — `docs/build-notes.md:346-348` (checklist item 2), against
  `prisma.config.ts:13` and `README.md:127`
- **consequence** — Checklist item 2 tells the owner to add `prisma generate` to
  the build. Doing exactly that, and nothing else, produces a build that fails at
  the generate step with a message about a missing database URL, which reads like
  a database problem rather than a missing setting. `DIRECT_URL` is a build-time
  requirement here, not just a migration one, and it is the only build-time
  variable in the product. Nothing on the checklist says so.
- **evidence** — `prisma.config.ts` supplies the datasource URL to every CLI
  invocation:

  ```
  datasource: {
    url: env("DIRECT_URL"),
  },
  ```

  and the project's own README already records the consequence at line 127:
  "Leaving `DIRECT_URL` out is not a quiet degradation: every Prisma CLI command
  fails to start, including `prisma generate`, which otherwise never touches a
  database." That sentence is in the README and not in the checklist. Confirmed
  the generate step is genuinely not wired today: `package.json` has no
  `postinstall`, and `"build": "next build"` with no prefix.
- **severity** — queue
- **confidence** — certain

### F-6-6: The Anthropic client is created with no timeout and no retry limit, so a slow model can turn a designed "Orbit can't think" screen into a raw platform error

- **file:line** — `src/lib/orbit/extract.ts:97`
- **consequence** — The product has a carefully built answer for when Orbit cannot
  think: the founder keeps their text, and Orbit says honestly whether it is out
  of credits or the service is having trouble. That answer only appears if the
  model call comes back with an error. If the model is instead just very slow, or
  is returning the overload errors the SDK quietly retries, the request can outlive
  the platform's own limit on how long a function may run. The founder then gets
  Vercel's generic error page instead of Orbit's honest one, at the single most
  important moment in the product, first-time onboarding. The same shape applies
  in chat, where a hung call holds a function open and bills for the wait.
- **evidence** — The client takes no options at all:

  ```
  const client = new Anthropic()
  ```

  A repo-wide grep for `new Anthropic`, `maxRetries`, and `timeout` across
  `src/lib` and `src/app` returns that one line and nothing else, so neither a
  request timeout nor a retry cap is configured anywhere. The SDK's defaults
  therefore apply (a long default timeout, and automatic retries on 429/5xx),
  which means a 529 spell is retried rather than surfaced quickly as the
  "trouble" reason that `model-errors.ts:53` is written to produce. Separately,
  no route or action in the repo exports `maxDuration`
  (`grep -rn "maxDuration" src/` returns nothing), so every server function runs
  on the platform default rather than a chosen one.
- **severity** — queue
- **confidence** — likely (the SDK defaults and Vercel's default function limit
  are both read from documentation, not exercised here; what is certain is that
  nothing in this repo sets either one)

### F-6-7: The cron route has no time limit of its own, and its work grows with the number of groups

- **file:line** — `src/app/api/cron/orbit/route.ts:23-25`
- **consequence** — The hourly job walks every group in the database, then every
  candidate idea, then every open time-change vote, one at a time. At today's
  scale that is quick. There is no ceiling declared on how long it may run, so
  when it eventually exceeds the platform's default the job is cut off partway,
  and the part that got cut is silently just not done that hour. Because the work
  is ordered (plans, then ideas, then votes) the same end of the list is dropped
  every time, so the failure would be consistent and invisible rather than random
  and noticeable.
- **evidence** — The route declares `runtime` and `dynamic` but not
  `maxDuration`:

  ```
  export const runtime = "nodejs"
  export const dynamic = "force-dynamic"
  ```

  The work per tick is `reconcile.ts:59` (`prisma.group.findMany()` — every group,
  no filter, with the file's own header noting "Fine at MVP group counts; revisit
  if group count grows large"), then per group a `hasUpcomingScheduledEvent`
  query plus up to two writes; then `endgame.ts:132` over every gauge in a
  four-day window across all groups; then `proposals/endgame.ts:71` over every
  unanswered GROUP proposal across all groups with no date window at all. All
  three loops are sequential by deliberate design, so wall-clock time is the sum.
- **severity** — queue
- **confidence** — likely (that the loops are unbounded and sequential is certain;
  what the platform default actually is, and therefore when this bites, I could
  not verify from the repo)

### F-6-8: Two of the fifteen lint errors are in real product code, and one of them is a React correctness rule

- **file:line** — `src/app/create/OnboardingWizard.tsx:58`, and
  `src/app/groups/[id]/info/ResetInviteLink.tsx:71`
- **consequence** — The wizard one is flagged by React's own rule about setting
  state directly inside a start-up effect, which is the pattern that causes an
  extra render pass. Here it is the timezone detection that runs once on mount,
  and the extra pass is cheap, so I do not believe anyone sees anything wrong
  today. It is worth naming only because it is one of the two real signals
  currently hidden inside F-6-3's noise. The second is a typographic apostrophe
  that renders correctly and is cosmetic.
- **evidence** — `OnboardingWizard.tsx:56-62`:

  ```
  const [timeZone, setTimeZone] = useState<string | null>(null)
  useEffect(() => {
    try {
      setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || null)
    } catch {
      setTimeZone(null)
    }
  }, [])
  ```

  flagged as `react-hooks/set-state-in-effect`. The file's own comment explains
  why the effect is deliberate (a render-time read would risk a hydration
  mismatch against the server render), and that reasoning is sound; the rule is
  firing on a pattern the author chose on purpose. `ResetInviteLink.tsx:71` is
  `react/no-unescaped-entities` on a raw apostrophe.
- **severity** — decline (the wizard case is a deliberate, documented choice with
  no user-visible cost; the apostrophe renders correctly. What is worth doing is
  F-6-3, which makes these two visible instead of fixing them.)
- **confidence** — certain

### F-6-9: The checklist's connection-pooling fix does not do anything, because the database driver this project uses never reads that setting

- **file:line** — `docs/build-notes.md:350-353` (checklist item 3) against
  `src/lib/prisma.ts:13`
- **consequence** — Item 3 of the pre-deploy checklist is the one that protects
  against "too many connections" errors under real traffic, and it is written as
  a deploy blocker. Following it exactly will not change anything: the setting it
  tells the owner to add is a leftover from how Prisma used to work, and this
  project deliberately moved to a different database driver in its first slice.
  So the owner ticks off a protection they do not actually have, and the failure
  it was meant to prevent stays live, showing up as intermittent errors under the
  first genuinely concurrent load, which is the demo. This is not "item 3 is not
  done yet"; it is "doing item 3 as written achieves nothing."
- **evidence** — The client is built on the driver adapter, which hands the
  connection string straight to node-postgres:

  ```
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
  ```

  In `node_modules/@prisma/adapter-pg/dist/index.js:788` the adapter does
  `new import_pg2.default.Pool(this.config)` with that config. Pool size is then
  set in `node_modules/pg-pool/index.js:89`:

  ```
  this.options.max = this.options.max || this.options.poolSize || 10
  ```

  `connection_limit` appears nowhere in `@prisma/adapter-pg` (grep returns
  nothing) and nowhere in `pg-pool`. `pg-connection-string/index.js:39-41` copies
  unrecognised query parameters onto the config object verbatim
  (`config[entry[0]] = entry[1]`), so `connection_limit=1` becomes an ignored
  property and the pool keeps its default maximum of 10 per function instance.
  The equivalent working control is `max` in the object passed to `PrismaPg`.
  build-notes' own data-foundation entry records the move to the driver adapter
  ("Prisma 7 ships no bundled query engine, so the client is built with a
  `PrismaPg` adapter"); the checklist item was written for the older shape and
  was never revisited.
- **severity** — queue (the correction is one line of documentation plus one
  line of code; the real-world risk at a portfolio MVP's traffic is low, which is
  why this is not fix-now, but the checklist should not claim a protection that
  is not there)
- **confidence** — certain

### F-6-10: Nothing tells the owner to switch on anonymous sign-in in the production Supabase project, and without it nobody can create or join a group

- **file:line** — `docs/build-notes.md:338-410` (the checklist), against
  `src/app/actions/create-group.ts:71` and `src/app/actions/join-group.ts:39`
- **consequence** — Every identity in this product starts as an anonymous
  session. Both doors into the product mint one: the founder at the moment they
  confirm their group, and every invited person at the moment they join. That
  ability is a per-project switch in the Supabase dashboard, and production is a
  different Supabase project from the one everything has been built against.
  Nothing in the repo says to turn it on. If it is off, the product is not
  degraded, it is unusable: the founder finishes the whole onboarding wizard,
  taps confirm, and gets "Could not create a session. Please try again." forever,
  and so does everyone who opens the invite link. The message names nothing that
  would lead the owner to the setting.
- **evidence** — Both entry points depend on it and both fail closed:

  ```
  // create-group.ts:70-76
  if (!user) {
    const { data, error } = await supabase.auth.signInAnonymously()
    if (error || !data.user) {
      return { error: "Could not create a session. Please try again." }
    }
  ```

  and the identical shape at `join-group.ts:38-48`. `grep -rn "signInAnonymously" src/`
  returns exactly these two call sites. The checklist's eleven items name
  `CRON_SECRET`, `prisma generate`, `connection_limit`, `ANTHROPIC_API_KEY`, five
  migrations, the cron plan tier, and the spending ceiling; no item mentions the
  production Supabase project's auth settings at all.
  `grep -n -i "anonymous sign" docs/build-notes.md` returns four hits, all of them
  design rationale (§3, and the two entries recording that captcha on anonymous
  sign-in was declined), none of them a deploy instruction. This is a
  "the checklist is missing something real" finding.
- **severity** — fix-now
- **confidence** — certain (that the code depends on it and that the checklist
  does not name it. I could not check the production project's actual dashboard
  setting, which is exactly why it belongs on the checklist)

### F-6-11: If creating the plan fails at the third yes, the idea is stuck forever and Orbit later tells the group it did not come together

- **file:line** — `src/lib/orbit/endgame.ts:260-265` (the skip), with
  `src/app/actions/gauge-vote.ts:119-` (the best-effort promote) and
  `src/lib/orbit/endgame.ts:545-555` (the goodbye)
- **consequence** — Orbit's promise in its own message is "If three are in, I'll
  set it up." The third yes both records the vote and creates the plan, in two
  separate steps. If the second step fails for any reason (a database hiccup, a
  slow moment, a lost race), the vote is kept and the plan is not created, on
  purpose, so nobody's answer is thrown away. But nothing ever tries again.
  The hourly sweep recognises this exact state and deliberately does nothing
  about it, and when the day passes the same sweep posts "Beers didn't come
  together this time. Maybe next week." to a group where three people said yes.
  So the one failure mode produces the worst possible pair: the promise broken,
  and Orbit stating out loud something that is not true. Nobody would know to
  look; there is no alert and nothing in the product shows it.
- **evidence** — The promote is best-effort by design and only logged
  (`gauge-vote.ts:115-121`, "Best-effort on purpose... Logged, because a silently
  unpromoted gauge sitting at three yeses is Orbit visibly breaking the promise
  in its own message"). The sweep then names this exact case and skips it:

  ```
  // Defensive, not expected in the normal flow: a gauge is promoted the
  // instant its third member IN vote lands, so a live, non-promoted gauge
  // should never hold 3+. It can, though, if a promotion attempt committed
  // the votes but rolled back the event (a transiently failed
  // promoteGaugeToEvent call) ...
  if (countIn(memberVotes) >= SPARK_THRESHOLD) {
    return { gaugeId: gauge.id, action: "skipped", reason: "already_at_bar" }
  }
  ```

  There is no retry anywhere: `grep -rn "promoteGaugeToEvent" src/` shows it is
  called only from `gauge-vote.ts`, never from the sweep. Once the gauge closes,
  `handleOne` reaches `isRetryEligible` (which needs at least one
  "can't that day" vote, absent here) and falls through to `handleClose`, which
  posts `buildClosureMessage(gauge.activity)` for any gauge with one or more IN
  votes (`endgame.ts:548-555`). The comment at 260-265 is the codebase's own
  statement that the state is reachable.
- **severity** — queue (it takes an upstream failure to trigger, so it is not a
  routine occurrence; but the recovery being "skip" rather than "try again" is
  the whole gap, and the fix is that the sweep calls the same promote it already
  detects the need for)
- **confidence** — certain on the mechanism; unsure how often the triggering
  failure actually occurs, which I could not measure

### F-6-12: The very first model call an anonymous stranger can reach has no limit on how much text it sends, while the second call on the same data does

- **file:line** — `src/app/actions/extract-group.ts:44-49`, against
  `src/app/actions/merge-gap.ts:32-33, 65-66`
- **consequence** — The onboarding description box is reachable by anyone with the
  URL, before any sign-in, and whatever is typed into it is sent to the model
  as-is. There is no cap on its length. The owner's chosen protection against
  runaway model spend is a hard prepaid ceiling at the provider, which by design
  turns a spending problem into an outage: when the credit is gone, Orbit stops
  working for everyone, including the group in the middle of a demo. An uncapped
  first call makes that outage reachable in a handful of requests rather than
  requiring sustained abuse, because one request can carry as much text as the
  browser will send. The give-away that this was an oversight rather than a
  choice: the very next call in the same flow caps the same field at 2,000
  characters.
- **evidence** — `extract-group.ts` trims and sends, with no `slice` and no
  length check:

  ```
  const description = (formData.get("description") as string | null)?.trim() ?? ""
  if (!description) return { status: "error" }
  ...
  raw = await extractGroupProfile(description)
  ```

  `merge-gap.ts`, which sends the same description plus the founder's answer to
  the same model, does cap both:

  ```
  const DESCRIPTION_MAX = 2000
  const ANSWER_MAX = 500
  ...
  const description = (input.description ?? "").trim().slice(0, DESCRIPTION_MAX)
  const answer = (input.answer ?? "").trim().slice(0, ANSWER_MAX)
  ```

  `create-group.ts:33,42` applies the same 2,000 cap, but only at confirm, which
  is after the model call has already happened. **How this differs from the
  registered item:** checklist item 9 (spending ceiling on pre-auth model calls,
  satisfied 11 Aug by the provider hard cap) accepts unbounded *volume* of normal
  requests. This is unbounded *size* of a single request, on one specific path,
  with the identical cap already written twenty lines away in a sibling file.
  CLAUDE.md separately records that the design's 500-character counter was
  deliberately not built because it would impose a product-level cap; that
  decision is about what the founder is told, and does not settle what the server
  is willing to forward to a paid API.
- **severity** — queue
- **confidence** — certain (that the cap is absent and present respectively; the
  practical cost per oversized request I did not measure)

### F-6-13: Nothing in the deploy checklist names which region the app and the database run in, and every write does many sequential round trips between them

- **file:line** — `docs/build-notes.md:338-410` (the checklist), against
  `src/lib/proposals/promote.ts:41-92` and `src/lib/events/move.ts:73-139`
- **consequence** — The product's writes are chatty: passing a group time-change
  vote does roughly ten separate conversations with the database, one after
  another, inside a single all-or-nothing block that gives up after a fixed few
  seconds. How long each of those takes depends entirely on how far the app sits
  from the database, and that is a deploy-time choice nobody has written down.
  Put the app in one part of the world and the database in another and the same
  code that works fine locally starts abandoning votes partway with an unhelpful
  error, only under real conditions, only on the interactions that matter most.
  It is a one-time setting, free to get right and awkward to change later, and it
  is not on the list.
- **evidence** — `promoteProposalMove` opens one transaction containing three
  reads, then `moveEventCoreInTx`, which is itself `findUnique`, `updateMany`,
  `deleteMany`, `createMany`, `message.create` and a second `updateMany`
  (`move.ts:84-136`): about ten sequential statements. No transaction anywhere in
  the repo passes options: `grep -rn 'maxWait|isolationLevel|timeout:' src/`
  (excluding tests) returns nothing across all twenty `prisma.$transaction` call
  sites, so every one runs on Prisma's built-in default time limit. That the
  round trips are already slow enough to matter is recorded by the project
  itself, in `vitest.config.ts:19-25`: "each DB test lands between 4.2s and 5.4s"
  against the remote database, which is why the test timeout was raised to 30s.
  The checklist names environment variables and migrations but no region for
  either the Vercel project or the Supabase project.
- **severity** — queue
- **confidence** — likely (the round-trip count and the absence of any transaction
  option are certain; whether the default limit is actually exceeded depends on
  the region pairing, which does not exist yet and which I therefore could not
  measure)

### F-6-14: The recurring plan and Orbit's announcement of it are written separately, so a crash between them leaves a plan nobody was told about

- **file:line** — `src/lib/orbit/reconcile.ts:91-114`
- **consequence** — When Orbit schedules the group's next standing occurrence it
  does two things: create the plan, then post the message announcing it. They are
  not tied together. A failure in the gap leaves the plan on the group's card with
  no word from Orbit in the chat, and the guard that stops duplicates then makes
  sure the announcement is never attempted again. Nobody is harmed, the plan is
  correct and RSVPable, and it is a small window; it is worth knowing because the
  product's other creation path (the spark) already does tie them together, so the
  two paths behave differently under the same failure.
- **evidence** — Two separate awaits with nothing binding them:

  ```
  const event = await createEvent({ ... })
  await createMessage({ groupId, authorType: MessageAuthor.ORBIT, authorId: null,
    body: buildAnnouncement(event, rhythm, zone) })
  ```

  The file's own header already records it (lines 15-20): "Event + announcement
  are NOT in one transaction... The scheduled-event guard
  (hasUpcomingScheduledEvent) means reconcile will skip that group on retry, so
  the orphaned event is permanent without manual intervention." That note ends
  "Low risk at once-per-day cadence," which is stale: the cron has been hourly
  since the gauge-endgame slice. By contrast `gauges/promote.ts:79-131` holds the
  event, the RSVPs and the announcement in one transaction, and
  `proposals/endgame.ts:168-182` does the same for its closing message.
- **severity** — decline (a documented, small-window, non-harmful inconsistency;
  wrapping it costs about three lines and belongs to whoever next touches this
  file, not to its own piece of work)
- **confidence** — certain

---

## Appendix (real, but no product consequence)

### A-6-1: The cron route's header comment says there is no `.env.example`, and there is one

`src/app/api/cron/orbit/route.ts:14-16` reads "There is no .env.example in this
project; document in the PR." `.env.example` exists, is committed (`git ls-files`
confirms), and carries `CRON_SECRET` with a description. Stale comment only.

### A-6-2: `.env.example` calls the cron job daily; it is hourly

`.env.example:22` — "Shared secret for the daily scheduled job." `vercel.json`
schedules `0 * * * *`. A reader setting up a fresh environment would form the
wrong idea of the cadence, but nothing behaves differently.

### A-6-3: `detect-intent.ts`'s closing comment overstates what the code guarantees

`src/app/actions/detect-intent.ts:385-388` — "Only fires when something visible
actually happened." The `revalidatePath` at 387 is unconditional; it is safe only
because every reachable path that gets there has already set `touchedGroupId`. I
traced all four intent kinds and confirmed there is no path today that reaches
line 387 with `touchedGroupId` still null. A fifth intent kind added later without
setting it would produce `revalidatePath("/groups/null")`, which is harmless but
not what the comment promises.

### A-6-4: `next.config.ts` pins a specific LAN IP address for phone QA

`next.config.ts:23` — `"192.168.1.144"` in `allowedDevOrigins`. The file's own
comment already says a DHCP lease can change and to add the new one. No
production effect (`allowedDevOrigins` is dev-only). Noted because it is the kind
of line a reviewing engineer will ask about.

---

### A-6-5: `reconcile.ts`'s header still describes the cron as daily

`src/lib/orbit/reconcile.ts:19` — "Low risk at once-per-day cadence."
`vercel.json` schedules `0 * * * *` and has since the gauge-endgame slice.
Same class of staleness as A-6-2. Referenced in F-6-14.

### A-6-6: The Anthropic SDK is correctly kept out of every client bundle

Not a finding, recorded because I checked it and it is the kind of thing that
silently regresses. `model-errors.ts` imports the Anthropic SDK and its own
header warns that client components must use `import type` only. Every
client-side importer does: `GroupHome.tsx:36`, `OrbitDownNote.tsx:10`,
`StepGapAsk.tsx:21`, and `unavailable-copy.ts:8` are all `import type`. The two
value imports (`ModelUnavailableError`) are in server actions only
(`extract-group.ts:17`, `detect-intent.ts:19`, `merge-gap.ts:27`).

### A-6-7: No secret can reach the browser through a `NEXT_PUBLIC_` variable

Also checked and clean. `grep -rn "NEXT_PUBLIC" src/` returns only
`supabase/env.ts` (the two Supabase values, both intended to be public) and
`scripts/db-which.ts`. `ANTHROPIC_API_KEY`, `DATABASE_URL`, `DIRECT_URL` and
`CRON_SECRET` are read only from server files
(`extract.ts:93`, `prisma.ts:10,13`, `prisma.config.ts:13`, `cron/orbit/route.ts:28`).

### A-6-8: No `notFound()` or `redirect()` sits inside a try/catch anywhere

Checked because it is the classic Next.js App Router crash and the codebase
comments show the team is aware of it. All five `notFound()` calls and all three
`redirect()` calls are outside any `try` block, and each `revalidatePath` call
carries a comment saying why. Clean.

### A-6-9: `findOpenRetryAsk` runs one extra query per candidate

`src/lib/gauges/open-ask.ts:31-52` does a `findMany` and then a `findFirst` per
row. Bounded twice over (one group, and only gauges whose retry ask is inside the
open-hours window), so in practice this is one or two extra queries. Named only
so a reader does not think it was missed.

---

## What I could not check

- **Whether `next build` actually succeeds.** `npm run build` is not on the
  allowed command list for this audit and it writes to `.next/`, so I did not run
  it. What I did run: `npx tsc --noEmit` exits 0, and `npm test` passes
  **92 files / 935 tests, 71.32s, exit 0**. I also confirmed from
  `node_modules/next/dist/docs/01-app/03-api-reference/05-config/03-eslint.md`
  that Next.js 16 no longer runs ESLint during `next build`, so the 15 lint errors
  in F-6-3 cannot fail the build. What remains unverified is the Prisma client
  generation step in a clean Vercel install, which is checklist item 2 and is
  genuinely not wired today (`package.json` has no `postinstall` and
  `"build": "next build"` carries no prefix) — that part is a known checklist item,
  not a finding; F-6-5 is about what the checklist fails to say about it.

- **The actual Vercel function time limit and Anthropic SDK defaults.** Both are
  read from documentation rather than exercised. What is verified from the repo is
  the absence: no `maxDuration` export anywhere in `src/`, and no `timeout` or
  `maxRetries` passed to `new Anthropic()`. F-6-6 and F-6-7 are written to that
  boundary.

- **The production Supabase project's dashboard settings.** I have no access, and
  should not. F-6-10 is a statement about what the repo's code requires and what
  the checklist does not say, not a claim about what is currently switched on.

- **Whether the promote-transaction failure in F-6-11 has ever actually occurred.**
  I can show the state is reachable (the code says so itself) and that nothing
  retries it. I cannot say how often it happens; the product has never been live.

- **Real concurrent load.** Everything about connection pooling (F-6-9) is read
  from the driver source, not measured, because measuring it needs traffic that
  does not exist yet. The claim I am confident in is narrow and checkable:
  `connection_limit` is not a setting `pg` reads.

- **`docs/walkthrough.html`.** Out of lane, and the project's own rules forbid
  grepping it. Not read.

- **`prisma/migrations/*`.** Migration contents are lane 4's; I read only the
  file list and the checklist items that reference them by name.
