# Lane 2, second pass: Can someone see or do what they should not?

Read-only audit, 22 Aug 2026. This is a SECOND reader on lane 2. Round one's
findings (F-2-1 invite-token generator, F-2-2 unauthenticated paid model calls)
and its appendix items A-2-1 to A-2-5 are NOT re-reported here. Where something I
found resembles one of them, I say how it differs.

Numbering continues round one's sequence (findings F-2-3 onward, appendix A-2-6
onward) so nothing collides with what is already registered.

Angles round one did not take, which is where I spent the pass:
1. Next.js caching and route-segment config (does any members-only render get
   cached or served statically?).
2. Client-supplied flags that steer a server decision (not ids, which round one
   covered, but booleans and counters).
3. Input size limits on every write path, not just the two model calls.
4. Server-action re-invocation: an action that is safe once but not safe twice.
5. iCalendar text injection through stored group content.
6. Whether an error object can carry the prompt or the model's output into a log.

---

## Coverage

Read in full this pass:

- src/proxy.ts
- src/lib/supabase/env.ts
- src/lib/supabase/server.ts
- src/lib/supabase/proxy-session.ts
- src/lib/auth/membership.ts
- src/lib/auth/current-user.ts
- src/app/actions/create-group.ts
- src/app/actions/detect-intent.ts
- src/app/actions/extract-group.ts
- src/app/actions/gauge-vote.ts
- src/app/actions/join-group.ts
- src/app/actions/leave-group.ts
- src/app/actions/merge-gap.ts
- src/app/actions/proposal-answer.ts
- src/app/actions/proposal-vote.ts
- src/app/actions/remove-member.ts
- src/app/actions/reset-invite-link.ts
- src/app/actions/rsvp.ts
- src/app/actions/send-message.ts
- src/app/api/cron/orbit/route.ts
- src/app/events/[id]/calendar.ics/route.ts
- src/app/events/[id]/page.tsx
- src/app/groups/[id]/page.tsx
- src/app/groups/[id]/info/page.tsx
- src/app/join/[inviteToken]/page.tsx
- src/app/join/[inviteToken]/JoinForm.tsx
- src/app/create/page.tsx
- src/app/page.tsx
- src/app/layout.tsx
- src/app/error.tsx
- src/app/not-found.tsx
- src/lib/groups/join.ts
- src/lib/groups/provision.ts
- src/lib/groups/leave.ts
- src/lib/groups/remove-member.ts
- src/lib/groups/reset-invite.ts
- src/lib/messages/create.ts
- src/lib/messages/day-groups.ts
- src/lib/events/rsvp.ts
- src/lib/events/ics.ts
- src/lib/events/move.ts
- src/lib/gauges/create.ts
- src/lib/gauges/vote.ts
- src/lib/gauges/day-comment.ts
- src/lib/proposals/create.ts
- src/lib/proposals/promote.ts
- src/lib/proposals/consensus.ts
- src/lib/orbit/fetch-window.ts
- src/lib/orbit/extract.ts
- src/lib/orbit/model-errors.ts
- src/lib/orbit/window.ts
- src/lib/groups/timezone.ts
- src/app/groups/[id]/GroupHome.tsx
- src/components/ShareInviteLink.tsx
- src/components/MembersOnlyWall.tsx
- src/components/OrbitNoteScreen.tsx
- prisma/schema.prisma
- next.config.ts, vercel.json, package.json, vitest.config.ts

Assigned but not read line-by-line: none of the lane's named files. I did not read
the ~60 test files, the QA staging scripts under `scripts/`, or the eval harnesses;
they are not runtime access surfaces.

Evidence commands run: `npx tsc --noEmit`, `npm run lint`, and read-only greps
(`grep -rn "export const dynamic\|revalidate\|use cache\|generateMetadata\|
generateStaticParams" src`, `grep -rn "console\." src`, `grep -rn "slice(0,\|
maxLength\|MAX" src/app/actions`). No dev server, no migrations, no seed scripts,
no eval benches.

---

## Findings

### F-2-3: The join form tells the server whether you already have an account, and the server believes it, so a person can end up in the group with no name at all

- **file:line** — src/app/actions/join-group.ts:23-28, against src/lib/groups/join.ts:45-46 and :63-71
- **consequence** — When someone taps an invite link, the join screen either asks
  for their name or says "Joining as Sam", and it decides which by looking at
  whether they already have an account. That decision is then sent to the server
  as a hidden field, and the server trusts it instead of re-checking. If the
  person's session goes away between opening the join page and tapping Join (a
  cleared cookie, an expired anonymous session, a phone that restored a stale
  page), the server skips the "your name is required" check, creates them a
  brand-new blank account, and puts them in the group. The group's chat then
  shows a join line that reads as a bare " joined" with nobody's name in it, the
  roster carries a nameless person, and that person counts toward the three-yes
  bar on every idea. Nothing in the product can fix it afterwards: there is no
  way to set your name once you are in, and re-opening the invite link does not
  help, because the join path reuses an existing account and never touches its
  stored name. The window that triggers it is narrow, which is why this is queued
  rather than urgent; the reason it is worth the queue slot anyway is that the
  damage is permanent and visible to the whole group, and the fix is to run a
  check the server can already answer for itself.
- **evidence** — `src/app/actions/join-group.ts:20-28`:
  ```
  const memberName = (formData.get("memberName") as string | null)?.trim() ?? ""
  // "1" means the user already has a session and an existing User row; name comes
  // from that row, so the form field is empty and name validation is skipped.
  const hasSession = (formData.get("hasSession") as string | null) ?? ""

  // Validate required fields — name is only required for first-time visitors
  if (!hasSession && !memberName) {
    return { errors: { memberName: "Your name is required." } }
  }
  ```
  `hasSession` is written by the client at
  `src/app/join/[inviteToken]/JoinForm.tsx:253`:
  `<input type="hidden" name="hasSession" value={currentName ? "1" : ""} />`.
  The server then resolves the session at `:34-48` and, finding none, mints a
  fresh anonymous user (`signInAnonymously()`), and passes the empty
  `memberName` through to `joinGroupByInvite`, which at
  `src/lib/groups/join.ts:45-46` does
  `if (!user) user = await tx.user.create({ data: { name: memberName, supabaseAuthId } })`
  with no name check of its own, then at `:63-71` writes
  `body: \`${user.name} joined\`` into the feed. The server already knows the
  true answer by line 48 (`user` is non-null or not); the guard is simply run
  ten lines too early, against the client's word instead of the server's own.
  No other action in the product takes a boolean from the client this way: every
  other one re-resolves the fact server-side.
- **severity** — queue
- **confidence** — certain that the code path exists and produces an empty name
  (I traced it line by line and confirmed nothing downstream rejects an empty
  name: `RosterAvatar` at `src/app/events/[id]/RosterAvatar.tsx:39` uses
  `word[0] ?? ""`, so it renders a blank circle rather than crashing). Unsure how
  often the accidental trigger fires in the wild, which I could not measure
  without running the app. Deliberately triggering it gains an attacker very
  little that holding the invite link does not already give them, which is the
  main reason this is `queue` and not `fix-now`.
- **How this differs from anything registered** — Round one's clean-bill note says
  "every write path re-checks membership server-side" and "never trusts a
  client-passed id." That is true of ids. This is not an id, it is a boolean
  assertion about the caller's own auth state, and it is the one place the server
  takes the client's word for something it can check itself.

### F-2-4: A chat message has no length limit, and every long message is re-sent to the paid AI on the next twenty messages

- **file:line** — src/app/actions/send-message.ts:48 and src/lib/messages/create.ts:37-58, with the amplification at src/lib/orbit/fetch-window.ts:19-29
- **consequence** — Anything a member types into the group chat is stored and
  shown exactly as sent, with no cap on how long it can be. Two things follow.
  First, the group home renders every message ever posted in one pass, so one
  enormous message makes that screen slow or unusable for everyone in the group,
  and nobody can delete it. Second, and more expensive: Orbit re-reads the last
  twenty messages every single time anyone posts anything, and sends them to the
  paid AI. So one huge message is not paid for once, it is paid for on the next
  twenty sends by anybody in that group. A member who wanted to run up the bill
  could do it deliberately; a member who pastes a long article into chat does it
  by accident. Every other text field in onboarding is capped; this one, the only
  one that repeats into the AI bill, is not.
- **evidence** — `src/app/actions/send-message.ts:48`:
  `const body = (formData.get("body") as string | null) ?? ""`, checked only for
  emptiness at `:54` (`if (!body.trim())`). `src/lib/messages/create.ts:37-58`
  rejects a blank body and stores `body: body.trim()` with no `.slice(...)`.
  Compare the capped siblings: `create-group.ts:33,42`
  (`const DESCRIPTION_MAX = 2000` … `.trim().slice(0, DESCRIPTION_MAX)`) and
  `merge-gap.ts:32-33,65-66` (`DESCRIPTION_MAX = 2000`, `ANSWER_MAX = 500`).
  The amplification is `src/lib/orbit/fetch-window.ts:19-29`, which takes
  `WINDOW_MESSAGES - 1` prior message bodies verbatim, and
  `src/app/actions/detect-intent.ts:141-146`, which passes that block into
  `detectIntentClaim` on every member send.
- **severity** — queue
- **confidence** — certain
- **How this differs from F-2-2** — F-2-2 is about the two onboarding model calls
  being reachable with no session at all. This is a different surface (the chat
  send path, which *is* authenticated and membership-gated), a different
  mechanism (the cost repeats across twenty later calls rather than being paid
  once), and it also persists: the text stays in the group's feed and in Orbit's
  reading window until twenty messages push it out. Capping the onboarding
  description would not touch it.

### F-2-5: Orbit's reading of a message can be re-triggered as many times as the sender likes, each time at a cost, and some of Orbit's replies will be posted again

- **file:line** — src/app/actions/detect-intent.ts:57 (the action takes a bare message id and has no once-per-message guard), with the un-deduplicated writes at :216-222, :324-331, and src/lib/gauges/day-comment.ts:55-57
- **consequence** — After you send a chat message, the app asks Orbit to read it.
  That request can be repeated for the same message, by the person who sent it,
  as often as they like, and each repeat is a fresh paid AI call. Most of what
  Orbit does is protected against being done twice (it cannot open the same idea
  poll or the same time-change question more than once), but two of its answers
  are not: the honest "I can't do that yet" reply and the "which plan do you
  mean?" question are posted straight into the group chat with nothing stopping a
  second copy. So a member can make Orbit repeat itself in the feed, which reads
  as the product being broken, and can run the AI bill up with no ceiling.
  Nothing anywhere counts or limits how many times this happens.
- **evidence** — `src/app/actions/detect-intent.ts:57`:
  `export async function detectIntentAction(messageId: string)`. The guards it
  applies are that the message exists, is a MEMBER message, is the caller's own
  (`:73-75`), and that the caller is a member (`:78-80`). There is no check for
  "this message has already been read." The paid call at `:141`
  (`await detectIntentClaim(...)`) runs before any deduplication. The two
  protected writes carry idempotency keys — `createGauge` returns
  `{ status: "skipped", reason: "already_gauged" }` on the unique
  `sourceMessageId` (`src/lib/gauges/create.ts:99-101`), and
  `createGroupProposal` / `createChangeProposal` do the same on
  `@@unique([sourceMessageId, kind])` (`src/lib/proposals/create.ts:56-61`,
  `:160-164`) — but the two `createMessage` branches do not:
  `detect-intent.ts:216-222` (`plan.action === "which"` → `createMessage({...
  authorType: MessageAuthor.ORBIT ... body: plan.question })`) and `:324-331`
  (`plan.action === "reply"` → the same shape with `plan.body`). Neither takes a
  key, and `src/lib/messages/create.ts:53-60` writes unconditionally. A third
  path has the same shape: `recordDayComment`
  (`src/lib/gauges/day-comment.ts:36-58`) upserts the vote and updates the gauge
  idempotently, then unconditionally `tx.message.create`s Orbit's reply, so a
  repeat run leaves one vote and two identical Orbit replies. The schema
  comment at `prisma/schema.prisma:208-213` states the design intent plainly:
  the unique constraint "already covers the duplicate *harm* (two Orbit messages
  for one idea)" while deliberately not covering "a rare duplicate *cost*". That
  reasoning holds for the gauge path; it was never extended to the two reply
  paths, which produce exactly the harm it names.
- **severity** — queue
- **confidence** — certain that the two reply branches have no idempotency key
  and that the model call precedes every guard. `unsure` whether a non-malicious
  double-fire happens in practice: the only in-app caller
  (`src/app/groups/[id]/GroupHome.tsx:125`) fires once per successful send, so
  reaching this needs someone calling the server action outside the UI.
- **How this differs from F-2-2** — F-2-2 is the unauthenticated onboarding
  calls. This one is authenticated and membership-gated, and its distinctive part
  is not the cost but the duplicate Orbit messages, which F-2-2 has no version of.

### F-2-6: A person joining through an invite link can put any amount of text into their name, and it lands in someone else's group with no way to edit it

- **file:line** — src/app/actions/join-group.ts:20 (no cap on `memberName`), rendered at src/lib/groups/join.ts:69, src/app/groups/[id]/info/page.tsx:267, src/app/events/[id]/page.tsx:488
- **consequence** — The name someone types on the join screen is stored exactly as
  submitted, with no limit on its length, and it then appears in the group chat's
  "X joined" line, in the roster on every event page, in the WHO row on the group
  info page, and in Orbit's own tally lines ("Sam & Jordan are in so far"). A
  joiner who pastes something enormous, or crafts one deliberately, degrades those
  screens for everybody in a group that is not theirs. The founder's only recourse
  is to remove them; there is no way to correct a member's name, and no way for
  the member to correct it either. The same field is also what Orbit's AI reads,
  so the text travels into the model prompt as an author name.
- **evidence** — `src/app/actions/join-group.ts:20`:
  `const memberName = (formData.get("memberName") as string | null)?.trim() ?? ""`
  — trimmed, never `.slice(...)`. It flows to
  `src/lib/groups/join.ts:46` (`tx.user.create({ data: { name: memberName ... } })`)
  and `:69` (`body: \`${user.name} joined\``). The wizard's own gap-merge path
  caps a *group* name at 50 characters
  (`src/app/actions/merge-gap.ts:75`: `.trim().slice(0, 50)`), so the codebase
  already holds the opposite convention one file over. The name is also read into
  Orbit's prompt via `src/lib/orbit/fetch-window.ts:31`
  (`authorName: m.author?.name ?? null`).
- **severity** — queue
- **confidence** — certain
- **How this differs from round one's A-2-3** — A-2-3 covers the *founder's* own
  name and *group* name being uncapped, and correctly calls it self-inflicted and
  confined to that founder's own group. This is a different field on a different
  action, and the direction of harm is reversed: a joiner degrades a group that
  belongs to someone else, and the group's owner cannot fix it.

---

## What came back clean (stated because it is the point of a second pass)

- **No caching hole.** Every members-only surface is dynamic. `grep` for
  `export const dynamic`, `export const revalidate`, `'use cache'`,
  `generateStaticParams` and `generateMetadata` across `src/` returns only
  `force-dynamic` on the two route handlers
  (`src/app/api/cron/orbit/route.ts:24`, `calendar.ics/route.ts:21`) and no
  segment config on any page. Every page calls `getCurrentUser()`, which reads
  `cookies()` (`src/lib/supabase/server.ts:7`), so each is dynamic by
  construction; none can be pre-rendered or shared between viewers. There is no
  `generateMetadata` anywhere, so no group name leaks into a page title for a
  non-member. The `.ics` response sets `Cache-Control: no-store` explicitly
  (`calendar.ics/route.ts:67`).
- **No iCalendar injection.** A group's title, venue name and street address all
  reach the calendar file, and all three go through `escapeText`
  (`src/lib/events/ics.ts:25-31`), which escapes backslash, semicolon, comma and
  every newline form per RFC 5545 §3.3.11. A crafted venue name cannot inject a
  second property, an ATTENDEE, or a second VEVENT into a member's calendar.
- **No prompt or model output can reach a log.** Every failure path builds its
  message from the provider's own status and message, never from the request
  (`src/lib/orbit/model-errors.ts:40-58`), and the JSON-parse failure throws the
  fixed string `"response was not valid JSON"` rather than the text
  (`src/lib/orbit/extract.ts:129-131`). None of the eighteen `console.*` calls
  passes a message body, a token, or a prompt.
- **Proposal promotion counts current members only.** The transaction re-reads
  memberships and filters both votes and RSVPs through them
  (`src/lib/proposals/promote.ts:45-71`), so a removed member's stored vote
  cannot move a plan.
- **The proxy covers every app route.** `src/proxy.ts:9-18` excludes only
  `_next/static`, `_next/image`, the three metadata files, and image extensions;
  no application path escapes session refresh.
- **The invite token never reaches anywhere it should not.** I enumerated every
  reference (`grep -rn "inviteToken" src`, 31 hits outside tests) and each one is
  either the join route resolving it, the group-info page rendering it behind the
  members-only wall, step 3 handing it to the founder who just created the group,
  or `ShareInviteLink` building the URL in the browser. It appears in no
  `console.*` call, in no server-action return value except
  `createGroupAction`'s to the founder, and in no part of the `.ics` file. The
  join page is a plain GET that joins nobody; joining requires the form POST, so
  a link preview or a crawler cannot consume an invite.
- **The session is validated, never assumed.** Both the proxy
  (`proxy-session.ts:38`) and `getCurrentUser` (`current-user.ts:16`) use
  `getUser()`, not `getSession()`, so a forged cookie does not authenticate.

---

## Appendix (real, but no product consequence)

### A-2-6: The group time-change vote is the one write that checks membership before the write rather than inside it

- **file:line** — src/app/actions/proposal-vote.ts:82 (the check) against :100-104 (the write)
- `src/lib/auth/membership.ts:5-20` documents four sanctioned forms and says form
  (b), the in-transaction check, exists "because their membership check has to be
  atomic with the write itself." `setRsvp` and `castVote` use form (b);
  `proposalVoteAction` uses form (a), a plain check before a bare
  `prisma.proposalVote.upsert`. By the file's own stated reasoning this write has
  at least as strong a claim to atomicity as a gauge vote, since it can move an
  already-scheduled plan. In practice the exposure is a member removed in the
  milliseconds between the two lines, and `promoteProposalMove` re-reads and
  member-filters everything inside its own transaction
  (`src/lib/proposals/promote.ts:45-71`), so a stale vote cannot actually move a
  plan; it would only sit as an orphaned row that every reader already filters
  out. Recommendation: decline, or fold into any future hardening pass.

### A-2-7: The cron endpoint returns its full sweep result as JSON

- **file:line** — src/app/api/cron/orbit/route.ts:53 — `return Response.json({ ok: true, results, endgame, proposalEndgame })`
- The body describes what Orbit did across *every* group in the database this
  hour. It is behind the secret whenever `CRON_SECRET` is set, and production
  refuses outright when it is not (`:35-41`), so the only caller who sees it is
  the scheduler. Worth knowing only because it means the secret protects a
  cross-group read as well as a write, which raises the cost of ever leaving it
  unset in a non-production environment that has real data in it.
  Recommendation: decline.

---

### A-2-8: A member's chat text is pasted straight into Orbit's prompt in the same shape Orbit's own lines use, so a member can forge conversation Orbit will read as real

- **file:line** — src/lib/orbit/window.ts:39-43 and src/lib/orbit/spark.ts:245-256
- Each window line is built as
  `` `${prefix}[${stamp(...)}] ${author}: ${m.body}` `` with no escaping, and the
  message under test is appended after a literal `The message to classify:`
  header. A member who types a body containing a newline and a matching
  `[Mon Aug 25, 7:00 PM] Orbit: ...` line puts words in Orbit's mouth inside the
  prompt. A member name does the same, since `authorName` is stored user text
  (see F-2-6).
  I chased what this actually buys and the answer is: very little, by design.
  Every consequential branch is gated on stored rows read server-side *before*
  the model is called, not on the model's word: an "answer" claim is discarded
  unless `findOpenRetryAsk` found a real open ask
  (`detect-intent.ts:127`, `:155`), a day comment is discarded unless a
  live gauge exists (`:136`, `planDayComment`'s own guard), a change needs a
  real numbered event, and the immediate-move branch fires only when
  `consensusFloor(memberCount) === 1`, i.e. a solo group
  (`src/lib/orbit/change-plan.ts:102`). Every write uses `user.id` from the
  session, never the model's word. The only model-authored text that reaches the
  feed is `activity`, capped at 40 characters by `cleanShortText`
  (`src/lib/orbit/rhythm.ts:50-54`, `ACTIVITY_MAX = 40`). So the worst outcome is
  Orbit misclassifying a message in a chat the person can already write in
  freely. Recommendation: decline today. The line worth writing down: **the day
  any free-text field the model returns is posted to the feed without a cap and
  without a deterministic template, this stops being harmless.**

### A-2-9: No security response headers are configured

- **file:line** — next.config.ts:3-25 (no `headers()` entry)
- There is no Content-Security-Policy, no `X-Frame-Options` / `frame-ancestors`,
  and no `Referrer-Policy`. I checked what each would actually be protecting and
  found nothing currently exposed: React escapes every interpolation and there is
  no `dangerouslySetInnerHTML`, `innerHTML` or `eval` anywhere in `src/`, so
  there is no scripting surface for a CSP to backstop; the invite token sits in a
  URL path but every browser's default referrer policy already strips the path
  cross-origin, and the join screen links nowhere off-site; and clickjacking
  would need an attacker to know a group id and target an existing member of that
  group. Fonts are self-hosted by `next/font/google` at build time
  (`src/app/layout.tsx:2-13`), so no third party sees a request at all.
  Recommendation: decline for MVP, revisit if the product ever renders text it
  did not compose itself.

### A-2-10: A non-member's request still runs the full group query before it is turned away

- **file:line** — src/app/groups/[id]/page.tsx:55-71, src/app/events/[id]/page.tsx:30-54, src/app/groups/[id]/info/page.tsx:41-53
- Each page loads the group, every membership, every user (and on the event page
  every RSVP, on the info page the invite token) and only then checks whether the
  viewer is a member. None of it is rendered for a non-member and none of it can
  reach the browser, since React only serialises what the returned JSX
  references and all three return a bare `<MembersOnlyWall />`. The only cost is
  that anyone holding a real group id can make the database do the full read
  repeatedly. Group ids are not published anywhere. Recommendation: decline.

## What I could not check

- Whether a Supabase anonymous session can lapse between a page render and a form
  submit often enough for F-2-3 to fire without deliberate tampering. That needs
  a running app and a real Supabase project; I could only confirm the code path.
- Runtime behaviour of any kind. No dev server, no HTTP requests, no database
  reads; everything here is read from source.
- Whether the Anthropic SDK's error objects can carry request content in a nested
  `cause` that `console.error` would then serialise. `classifyModelCallError`
  only reads `err.status` and `err.message`, but the raw `err` is also passed to
  `console.error` at `detect-intent.ts:381`, `extract-group.ts:58` and
  `merge-gap.ts:105`. I could not confirm what a connection-level failure's
  `cause` chain contains without making a real failing call.
- Whether Vercel or any platform layer imposes a request-body size limit that
  would blunt F-2-4 and F-2-6 in practice. Nothing in `next.config.ts` or
  `vercel.json` configures one.
