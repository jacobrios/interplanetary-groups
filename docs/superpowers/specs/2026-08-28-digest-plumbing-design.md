# The digest, slice one: the plumbing

Slice branch: `digest`. Opened 28 August 2026.

**Status: shape approved by the owner, 28 August 2026. No code written.**

---

## Front section (for the owner)

### Settled, do not relitigate

A digest, never an email per message, on any channel, at any stage. It sends
from `updates.`, not `account.`, so spam complaints can never reach login-code
deliverability. One email per group to start, per person later. Code composes
it; Orbit does not write it. Once a day, evening, group-local. Nothing to say
means nothing sent. Two send rules, both pure date arithmetic: the day a person
created the thing (ideas and time-change asks only, never an auto-created
recurring event), and three days before it happens (everything with a date).
**Reversed on 28 August 2026 by the owner: an unsubscribe link is built.** The
per-channel preference model stays declined. Full shape in the section below.

**Baseline, recorded before any code:** 113 files / 1237 tests, green, zero
skipped, matching main at `72013b1`.

### Not in this slice

The digest's content, its copy, and its cron (slice two). The unread divider and
scroll restoration, WhatsApp-style (its own queued slice; the digest does not
need it). One email per person across groups (later, once a second group is
reachable). Event-triggered mail for time-boxed moments (sibling slice, where
the double-notify tension also lives). Per-channel notification preferences
(declined, and no seat built for them).

### How this slice will be verified

Automated: the send seam's result mapping against a mocked Resend client, every
branch including refusal and network failure; the non-production send guard
refusing an address that is not allowlisted, proven by making it fail first; the
read-position write; the unsubscribe write, plus a test pinning that opting out
never changes `isVerified`, because login codes must survive it. By hand, in a
browser: the unsubscribe page and its confirmation. **By hand, needing a real
inbox, and this is the slice's whole point:** one real email, sent by a hand-run
script through the real seam to the owner's real address. Deliberately not in
the suite: it costs money and hits the network, same rule as the eval benches.

### Debt this slice is expected to open

**No send log.** Nothing in our database will record that an email was sent. The
two send rules are pure functions of stored dates and need no memory, which is
what makes this affordable; the cost is that when somebody says "I never got
it", the only evidence is Resend's dashboard. Recommend accepting: a send log is
cheap to add later and expensive to design blind.

**`updates.` starts with no sending reputation**, so the first digests may land
in spam. Unavoidable, and exactly what the subdomain split was for.

**The unsubscribe token never rotates**, so forwarding a digest hands over the
ability to unsubscribe that person. Recommend accepting: blast radius is one
person's digest.

**A new deploy-time obligation:** the `updates.` sending domain, its DNS, and
`RESEND_API_KEY` in Vercel.

---

## The digest's settled shape, recorded here because slice two inherits it

None of this is built in slice one. It is written down because slice one's
seams are shaped by it, and because it was settled in conversation and would
otherwise live only in chat.

**Two blocks in one email.**

*Block A, "needs you."* An idea you have not voted on, a confirmed event you
have not RSVP'd to, a time-change vote you have not answered. **Sends whether or
not you opened the app**, by the owner's instruction: this is the only
notification channel the product has, and the whole point is to pull people
back. Built on `src/lib/cards/region.ts`, the ladder that already draws NEEDS
YOUR RSVP and NEEDS YOUR VOTE on the cards, so the email and the group home can
never disagree about what is waiting for you.

*Block B, "you missed."* The message count since you last opened the group, the
last few lines, and a link in for the rest. **Suppressed entirely if you have
opened the group since the newest message.**

**Both blocks empty means no email.** That single rule is what makes a daily
cadence safe.

**The two send rules, and why rule one excludes recurring events.** Rule one is
"the day it was created", and it applies only to things a person did: an idea
floated, a time change asked for. Rule two is "three days before it happens",
and it applies to everything with a date. The exclusion was the owner's call
after a fact was checked rather than assumed: `upcoming-list.ts:39` matches on
`startsAt >= now`, so the next Saturday climb is created on Saturday, about an
hour after the current one starts. Rule one applied to it would email the group
that same evening asking them to RSVP for a climb six days out, on the one day
nobody needs reminding that this group climbs. Rule one means "a human did
something, go weigh in"; an event Orbit scheduled is not news.

**What that costs a member.** A group with a weekly climb and nothing else
happening gets one email a week, on Wednesday. An idea floated Monday for
Thursday produces one email, not two, because creation day and three-days-before
are the same evening.

**A dead item is never emailed.** An idea floated at 6pm for tonight may have
closed or become a real event by the 8pm send. Only items still open and
answerable at send time are included.

**Time-change votes need no special case**, checked rather than assumed: they do
not expire on a timer, they stay open until the event starts
(`proposals/endgame.ts`), so both rules apply to them normally.

---

## Two recorded premises this slice corrects

Both were checked against the repo, and both were listed as binding constraints
at the slice's start.

**1. Supabase's 30-emails-an-hour ceiling does not bind the digest.** Supabase
Auth sends only its own auth templates; there is no generic send. The repo has
no Resend dependency and no `RESEND_API_KEY` today, because Resend is purely the
SMTP relay behind Supabase Auth. So the digest must call Resend directly, which
means build-notes' "After launch" item 6, trigger 1, is disarmed: raising
Supabase's hourly limit *before the digest ships* protects login codes only, and
the digest was never going to spend that budget. **Trigger 2 stands unchanged**:
Resend's free tier is 100 a day and 3,000 a month, shared with login codes
because both leave the same Resend account, and it binds around 80 members on a
daily digest. That is a billing decision, not an engineering one.

**2. "Configure it on both Supabase projects" does not bite here.** Nothing
about the digest is a Supabase setting. Resend sending domains are
account-level, so one setup serves dev-test and production both. The only
two-environment item is the API key, in local `.env` and in Vercel.

---

## Implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the product a per-member read position and the ability to put non-auth mail in an inbox, ending with one real email delivered through the real seam.

**Architecture:** Two nullable-column migrations with no backfill; one new normalized service seam (`src/lib/email/send.ts`) modelled on `src/lib/auth/email.ts`; one client-fired server action that records when a member opened a group; one public route for unsubscribing. No cron, no digest content, no scheduled sending anywhere in this slice.

**Tech stack:** Next.js 16 (App Router, server actions), Prisma 7, Vitest 4, Resend SDK.

### Global constraints

Every task's requirements implicitly include all of these.

- **Never point anything at production.** Run `npm run db:which` and confirm it prints `pxbewardwvoyqqcvogel` immediately before any `prisma migrate` command. If it prints anything else, stop and report.
- **Migrations are created with `npx prisma migrate dev --name <name>`, never by hand-editing a file in `prisma/migrations/`.** A safety-net hook blocks direct edits to migrations; if it fires, report the block naming it as Jacob-built before doing anything else.
- **Tests that touch the database use the real dev-test database and build their own fixtures**, following `src/lib/auth/__tests__/email-ask.test.ts`: names prefixed `[TEST] `, ids collected in arrays, an `afterAll` that deletes children before parents and calls `prisma.$disconnect()`. The suite must run green from an empty database, so never read a row a test did not create.
- **Add no new test dependencies.** Clicks use `fireEvent` from `@testing-library/react`, following `src/app/groups/[id]/info/__tests__/ResetInviteLink.test.tsx`; `@testing-library/user-event` is not installed and this slice does not install it. There is no `jest-dom`, so assert with `toBeTruthy()` on a found element rather than `toBeInTheDocument()`.
- **Component tests carry `// @vitest-environment jsdom` on line 1** (the config default is `node`) and use `@testing-library/react`, following `src/components/__tests__/BackLink.test.tsx`.
- **The `@/` alias resolves to `src/`.**
- **No em-dashes or en-dashes in any user-facing copy.** Commas, semicolons, parentheses. Orbit's voice is plain and warm, roughly a 7th-to-8th-grade reading level.
- **Colour comes from the tokens in `src/app/globals.css`**, never hardcoded hex. Teal (`--action`) marks an action that genuinely matters; lime (`--lime`) is Orbit's brand and never a button. Nothing renders below the 13px eyebrow floor (`--type-eyebrow`).
- **Every service-error branch logs the underlying error before returning.** Never log an email address.
- **Run the full suite before each commit**, and record the file/test counts in the PR. Baseline: 113 files / 1237 tests, green, zero skipped.

---

## Task 1: Correct the record

Docs only, no code, no tests. It is first because the standing rule says a slice whose decision invalidates a recorded one makes that edit its first task: these files load every session, and a wrong version works against the very slice that disproved it.

**Files:**
- Modify: `docs/build-notes.md` (three places, all append-only)

**Interfaces:** Produces nothing consumed by later tasks.

- [ ] **Step 1: Amend the unsubscribe decision**

In `docs/build-notes.md`, find the email sign-in slice's section "What was settled with the owner before the build, compressed", and the sentence beginning "**Unsubscribe: build nothing, and deliberately build no seat**". Strike that clause with `~~ ~~` and append, inline, dated:

> (Reversed 28 August 2026 by the owner, in the digest slice's brainstorm, on deliverability grounds: "we definitely need an unsubscribe link or if not we're going to get marked as spam." He is right, and the original wording collapsed two different things. **A preference model is a settings screen** choosing which kinds of mail you get; that stays declined, and no seat is built for it. **An unsubscribe link is one door** that stops digests and touches nothing else. The digest slice builds the door. Without it the only available "stop this" is the spam button, which damages `updates.`'s sending reputation, which is the exact harm the subdomain split exists to prevent.)

- [ ] **Step 2: Correct the sending-limit arithmetic**

In §8's "After launch, running deploy-time obligations", at the end of item 6, append a dated postscript:

> ***Corrected 28 August 2026, in the digest slice's brainstorm, and trigger 1's premise was wrong.*** **Supabase's hourly email ceiling does not bind the digest and never could.** Supabase Auth sends only its own auth templates; there is no generic send. The repo has no Resend dependency and no `RESEND_API_KEY`, because Resend is purely the SMTP relay behind Supabase Auth. So the digest calls Resend directly, and it spends none of Supabase's 30 an hour. **Trigger 1 is therefore disarmed as written:** raising that limit protects login codes and nothing else, so it is no longer a prerequisite for the digest shipping. **Trigger 2 stands unchanged and is now the one that binds:** Resend's free tier is 100 a day and 3,000 a month, shared with login codes because both leave the same Resend account. Trigger 3, the abuse trigger, is untouched. *Also corrected: "anything configured for this slice must be done on both Supabase projects" does not apply here, because nothing about the digest is a Supabase setting and Resend sending domains are account-level.*

- [ ] **Step 3: Point the email-arc register entry at this document**

In §8's fast-follow list, on the entry beginning "**The email arc, first post-MVP work**", append: `**The digest's shape was settled 28 August 2026**; see docs/superpowers/specs/2026-08-28-digest-plumbing-design.md. Slice one is the plumbing (read position, Resend seam, unsubscribe door); slice two is the digest itself.`

- [ ] **Step 4: Commit**

```bash
git add docs/build-notes.md
git commit -m "Correct three records the digest slice disproved"
```

---

## Task 2: The read position

**Files:**
- Modify: `prisma/schema.prisma` (the `Membership` model)
- Create: `prisma/migrations/<generated>_membership_last_seen/migration.sql` (by CLI, never by hand)
- Create: `src/lib/groups/seen.ts`
- Create: `src/lib/groups/__tests__/seen.test.ts`
- Create: `src/app/actions/group-seen.ts`
- Create: `src/app/groups/[id]/SeenMarker.tsx`
- Create: `src/app/groups/[id]/__tests__/SeenMarker.test.tsx`
- Modify: `src/app/groups/[id]/GroupHome.tsx` (render `SeenMarker`)

**Interfaces:**
- Consumes: `isGroupMember(userId, groupId)` from `@/lib/auth/membership`; `getCurrentUser()` from `@/lib/auth/current-user`.
- Produces: `markGroupSeen({ userId, groupId, now }): Promise<boolean>` and `markGroupSeenAction(groupId): Promise<void>`. Slice two reads `Membership.lastSeenAt` directly.

**Why `Membership` and not `User`:** it is a fact about a person *in a group*, and many-to-many has been load-bearing since day one. A null means "never opened", which slice two reads as "everything is unseen".

**What "seen" honestly means, so slice two does not overclaim:** the feed scrolls to the newest message on mount (`MessageFeed.tsx:104`), with no unread divider and no saved position. `lastSeenAt` therefore records that the member opened the group, not that they read every message above the fold. It errs toward *under*-notifying, which is the safe direction and the reason this cheap column is enough.

- [ ] **Step 1: Add the column to the schema**

In `prisma/schema.prisma`, inside `model Membership`, after the `joinedAt` line:

```prisma
  /// When this member last opened this group's home. Null means never.
  /// Records that they opened the group, not that they read every message:
  /// the feed has no unread divider and no saved position, so this errs
  /// toward assuming they saw more than they did, which keeps the digest
  /// quiet rather than noisy. Written by markGroupSeen (src/lib/groups/seen.ts).
  lastSeenAt DateTime?
```

- [ ] **Step 2: Confirm the database, then generate the migration**

```bash
npm run db:which
```

Expected: `DEV-TEST (expected). Project ref pxbewardwvoyqqcvogel matches on all three sources.` Stop if it says anything else. Then:

```bash
npx prisma migrate dev --name membership_last_seen
```

- [ ] **Step 3: Write the failing test**

Create `src/lib/groups/__tests__/seen.test.ts`. Follow the fixture pattern in `src/lib/auth/__tests__/email-ask.test.ts`: a `stamp`, `userIds`/`groupIds` arrays, and an `afterAll` deleting memberships, then groups, then users, then `$disconnect()`.

```ts
describe("markGroupSeen", () => {
  it("records the timestamp for a member", async () => {
    const user = await makeUser("member")
    const group = await makeGroup("seen", user.id, [user.id])
    const now = new Date("2026-08-28T19:00:00Z")

    const ok = await markGroupSeen({ userId: user.id, groupId: group.id, now })

    expect(ok).toBe(true)
    const membership = await prisma.membership.findUnique({
      where: { userId_groupId: { userId: user.id, groupId: group.id } },
    })
    expect(membership?.lastSeenAt?.toISOString()).toBe(now.toISOString())
  })

  it("refuses a non-member and writes nothing", async () => {
    const founder = await makeUser("founder")
    const stranger = await makeUser("stranger")
    const group = await makeGroup("closed", founder.id, [founder.id])

    const ok = await markGroupSeen({
      userId: stranger.id,
      groupId: group.id,
      now: new Date(),
    })

    expect(ok).toBe(false)
    const rows = await prisma.membership.findMany({ where: { groupId: group.id } })
    expect(rows).toHaveLength(1)
    expect(rows[0].lastSeenAt).toBeNull()
  })

  it("overwrites on a later visit", async () => {
    const user = await makeUser("returner")
    const group = await makeGroup("returned", user.id, [user.id])
    const first = new Date("2026-08-28T10:00:00Z")
    const second = new Date("2026-08-28T20:00:00Z")

    await markGroupSeen({ userId: user.id, groupId: group.id, now: first })
    await markGroupSeen({ userId: user.id, groupId: group.id, now: second })

    const membership = await prisma.membership.findUnique({
      where: { userId_groupId: { userId: user.id, groupId: group.id } },
    })
    expect(membership?.lastSeenAt?.toISOString()).toBe(second.toISOString())
  })
})
```

- [ ] **Step 4: Run it and watch it fail**

```bash
npx vitest run src/lib/groups/__tests__/seen.test.ts
```

Expected: FAIL, `markGroupSeen` is not exported from `../seen`.

- [ ] **Step 5: Implement**

Create `src/lib/groups/seen.ts`:

```ts
// src/lib/groups/seen.ts
//
// When a member last opened a group. Written on every group-home render,
// read by nothing yet: the digest slice is what consumes it.
//
// The membership check is form (c) from src/lib/auth/membership.ts's list, a
// plain scoped update with no transaction of its own. There is no write-time
// atomicity need here: the worst a race can do is write two timestamps a
// millisecond apart, and the later one is as true as the earlier one.
//
// Scoping the update by the compound key rather than checking first is what
// makes the non-member refusal free: an update that matches no row writes
// nothing, so a stranger cannot record a read position on a group they are
// not in, and cannot learn from the result whether the group exists.

import { prisma } from "@/lib/prisma"

interface MarkGroupSeenInput {
  userId: string
  groupId: string
  now: Date
}

/** True when a membership row was updated; false when the caller is not a member. */
export async function markGroupSeen({
  userId,
  groupId,
  now,
}: MarkGroupSeenInput): Promise<boolean> {
  const { count } = await prisma.membership.updateMany({
    where: { userId, groupId },
    data: { lastSeenAt: now },
  })
  return count > 0
}
```

- [ ] **Step 6: Run it and watch it pass**

```bash
npx vitest run src/lib/groups/__tests__/seen.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 7: Write the server action**

Create `src/app/actions/group-seen.ts`:

```ts
"use server"

// Records that the caller opened this group, fired once from the group home
// on mount.
//
// Returns nothing, deliberately. There is no user-visible outcome and no
// recovery a member could take, so a result would only invite a caller to
// branch on something that should never change what is on screen. A failure
// is logged and swallowed: the cost of a missed write is one digest that says
// slightly more than it needed to, which is the safe direction.
//
// No revalidatePath, for the same reason the email-ask writes have none:
// nothing on the page depends on this value.

import { getCurrentUser } from "@/lib/auth/current-user"
import { markGroupSeen } from "@/lib/groups/seen"

export async function markGroupSeenAction(groupId: string): Promise<void> {
  try {
    const user = await getCurrentUser()
    if (!user) return
    await markGroupSeen({ userId: user.id, groupId, now: new Date() })
  } catch (err) {
    console.error("[group-seen] recording a read position failed", err)
  }
}
```

- [ ] **Step 8: Write the failing component test**

Create `src/app/groups/[id]/__tests__/SeenMarker.test.tsx`:

```tsx
// @vitest-environment jsdom
//
// The action is mocked: what is under test is that the marker fires it exactly
// once per mount with the group it was given, not what the action does, which
// has its own database tests next door.

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"

const markGroupSeenAction = vi.fn(() => Promise.resolve())
vi.mock("@/app/actions/group-seen", () => ({ markGroupSeenAction }))

import SeenMarker from "../SeenMarker"

afterEach(() => {
  cleanup()
  markGroupSeenAction.mockClear()
})

describe("SeenMarker", () => {
  it("records the read position once, for the group it is given", async () => {
    render(<SeenMarker groupId="grp_1" viewerId="usr_1" />)
    expect(markGroupSeenAction).toHaveBeenCalledTimes(1)
    expect(markGroupSeenAction).toHaveBeenCalledWith("grp_1")
  })

  it("stays silent when nobody is signed in", () => {
    render(<SeenMarker groupId="grp_1" viewerId={null} />)
    expect(markGroupSeenAction).not.toHaveBeenCalled()
  })

  it("renders nothing", () => {
    const { container } = render(<SeenMarker groupId="grp_1" viewerId="usr_1" />)
    expect(container.firstChild).toBeNull()
  })
})
```

- [ ] **Step 9: Run it and watch it fail**

```bash
npx vitest run src/app/groups/\[id\]/__tests__/SeenMarker.test.tsx
```

Expected: FAIL, cannot resolve `../SeenMarker`.

- [ ] **Step 10: Implement the marker**

Before writing it, read the server-actions guidance in `node_modules/next/dist/docs/` per `AGENTS.md`. The shape below keeps the write off the render path, which is why it is a client effect rather than a call inside the page's server component: a write during render can re-run, and Next 16 discourages it. **If the docs point somewhere better, take that and say so in the PR rather than following this blindly.**

Create `src/app/groups/[id]/SeenMarker.tsx`:

```tsx
"use client"

// Renders nothing. Its only job is to tell the server the viewer opened this
// group, once per mount.
//
// A component rather than an effect inside GroupHome so it has its own test
// seam and so GroupHome, which already carries the optimistic message list,
// does not grow a second unrelated responsibility.

import { useEffect, useRef } from "react"
import { markGroupSeenAction } from "@/app/actions/group-seen"

interface Props {
  groupId: string
  /** Null for a signed-out viewer, who has no read position to record. */
  viewerId: string | null
}

export default function SeenMarker({ groupId, viewerId }: Props) {
  const fired = useRef(false)

  useEffect(() => {
    if (!viewerId || fired.current) return
    fired.current = true
    void markGroupSeenAction(groupId)
  }, [groupId, viewerId])

  return null
}
```

- [ ] **Step 11: Run it and watch it pass**

```bash
npx vitest run src/app/groups/\[id\]/__tests__/SeenMarker.test.tsx
```

Expected: PASS, 3 tests.

- [ ] **Step 12: Mount it in the group home**

In `src/app/groups/[id]/GroupHome.tsx`, import `SeenMarker` alongside the other local imports and render `<SeenMarker groupId={groupId} viewerId={viewerId} />` as the first child of the component's returned tree. Both props already exist on `Props`; add nothing.

- [ ] **Step 13: Run the full suite and commit**

```bash
npm test
```

Expected: 1237 tests passing plus the 6 added, zero failures. Then:

```bash
git add prisma/schema.prisma prisma/migrations src/lib/groups src/app/actions/group-seen.ts "src/app/groups/[id]/SeenMarker.tsx" "src/app/groups/[id]/__tests__/SeenMarker.test.tsx" "src/app/groups/[id]/GroupHome.tsx"
git commit -m "The app learns when you last opened a group"
```

---

## Task 3: The Resend sending seam

**Files:**
- Modify: `package.json` (add `resend`)
- Create: `src/lib/email/send.ts`
- Create: `src/lib/email/__tests__/send.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `sendEmail(input: SendEmailInput): Promise<SendResult>`, where

```ts
export interface SendEmailInput {
  to: string
  subject: string
  text: string
  html: string
  /** Absolute URL of the recipient's unsubscribe page; sets the List-Unsubscribe headers. */
  unsubscribeUrl?: string
}
export type SendResult =
  | "ok"
  | "invalid_address"
  | "rate_limited"
  | "service_error"
  | "suppressed_dev"
```

Task 5's script consumes this. Slice two consumes it for every digest.

**This file is deliberately the sibling of `src/lib/auth/email.ts`**, which build-notes calls the stronger of the product's two claim-to-fact boundaries. Copy its mechanism, not just its spirit: a normalized discriminated result, never a raw service response, so no caller ever branches on Resend's own shape. `suppressed_dev` is a **success**, not a failure: it means the guard did its job. No caller may treat it as an error or retry on it.

- [ ] **Step 1: Add the dependency**

```bash
npm install resend
```

The alternative considered, and worth one line in the PR: a bare `fetch` to Resend's REST API with no dependency at all. The SDK wins on typed errors, and this seam is thin enough that swapping later is contained to one file.

- [ ] **Step 2: Write the guard test first, because it is the one that must be seen to fail**

Create `src/lib/email/__tests__/send.test.ts`. Start with only the guard describe block:

```ts
// src/lib/email/__tests__/send.test.ts
//
// The Resend client is mocked throughout: this file must never send anything.
// What is under test is the seam's own contract, the mapping from a service
// reply to a normalized result, and the non-production guard.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const sendMock = vi.fn()
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock }
  },
}))

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  vi.resetModules()
  sendMock.mockReset()
  process.env.RESEND_API_KEY = "test-key"
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

const MESSAGE = {
  subject: "Your group this evening",
  text: "Beers on Tuesday needs your answer.",
  html: "<p>Beers on Tuesday needs your answer.</p>",
}

describe("the non-production send guard", () => {
  it("suppresses an address that is not on the allowlist, and never calls the service", async () => {
    process.env.VERCEL_ENV = "development"
    process.env.EMAIL_DEV_ALLOWLIST = "owner@example.com"
    const { sendEmail } = await import("../send")

    const result = await sendEmail({ to: "areal@member.com", ...MESSAGE })

    expect(result).toBe("suppressed_dev")
    expect(sendMock).not.toHaveBeenCalled()
  })

  it("suppresses everything when the allowlist is unset", async () => {
    process.env.VERCEL_ENV = "development"
    delete process.env.EMAIL_DEV_ALLOWLIST
    const { sendEmail } = await import("../send")

    expect(await sendEmail({ to: "owner@example.com", ...MESSAGE })).toBe("suppressed_dev")
    expect(sendMock).not.toHaveBeenCalled()
  })

  it("sends to an allowlisted address, matching case-insensitively and ignoring spaces", async () => {
    process.env.VERCEL_ENV = "development"
    process.env.EMAIL_DEV_ALLOWLIST = " owner@example.com , other@example.com "
    sendMock.mockResolvedValue({ data: { id: "msg_1" }, error: null })
    const { sendEmail } = await import("../send")

    expect(await sendEmail({ to: "Owner@Example.com", ...MESSAGE })).toBe("ok")
    expect(sendMock).toHaveBeenCalledTimes(1)
  })

  it("does not apply the guard in production", async () => {
    process.env.VERCEL_ENV = "production"
    delete process.env.EMAIL_DEV_ALLOWLIST
    sendMock.mockResolvedValue({ data: { id: "msg_1" }, error: null })
    const { sendEmail } = await import("../send")

    expect(await sendEmail({ to: "anyone@example.com", ...MESSAGE })).toBe("ok")
    expect(sendMock).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 3: Run it and watch it fail**

```bash
npx vitest run src/lib/email/__tests__/send.test.ts
```

Expected: FAIL, cannot resolve `../send`. **This failure is the evidence that the guard test can fail; record that it was seen.** A guard test that has never been observed failing is not evidence of anything, which is the lesson the visual-polish-3 eyebrow guard cost.

- [ ] **Step 4: Implement the seam**

Create `src/lib/email/send.ts`:

```ts
// src/lib/email/send.ts
//
// The one place the app talks to Resend, and the deliberate sibling of
// src/lib/auth/email.ts. Same discipline, for the same reason: a service reply
// is a claim about what happened, and the product decides what that claim
// means exactly once, here. No caller anywhere branches on Resend's own shape.
//
// Login codes do NOT come through this file. They leave through Supabase Auth,
// which relays via Resend's SMTP on the `account.` subdomain. This file is the
// `updates.` channel and carries nothing transactional, which is the whole
// point of the split: a digest that collects spam complaints can never drag
// login-code deliverability down with it.
//
// Every service_error branch logs the underlying error before returning. That
// is not defensive habit: the production deploy cost two hours because
// create-group.ts:73 threw Supabase's error away. The address itself is never
// logged; it is the member's, given to Orbit rather than to the group.

import { Resend } from "resend"

/**
 * A product decision, not a deployment one, which is why it is a constant and
 * not an env var: an env var would let the two environments silently disagree
 * about who this mail is from.
 */
const FROM = "Orbit <orbit@updates.interplanetarygroups.com>"

export interface SendEmailInput {
  to: string
  subject: string
  text: string
  html: string
  /** Absolute URL of the recipient's unsubscribe page. Sets the List-Unsubscribe headers. */
  unsubscribeUrl?: string
}

export type SendResult =
  | "ok"
  | "invalid_address"
  | "rate_limited"
  | "service_error"
  /** The guard below refused to send outside production. A success, never an error. */
  | "suppressed_dev"

/**
 * Whether this address may be mailed from this environment.
 *
 * The dev-test database holds QA rows carrying real addresses, so a local run
 * is one command away from mailing a real person from a half-built feature.
 * Outside production, only an address named in EMAIL_DEV_ALLOWLIST is sent to;
 * an unset allowlist means nothing sends at all. This runs before the API key
 * is even read, so a misconfigured local environment fails closed.
 */
function allowedInThisEnvironment(to: string): boolean {
  if (process.env.VERCEL_ENV === "production") return true
  const allowlist = (process.env.EMAIL_DEV_ALLOWLIST ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
  return allowlist.includes(to.trim().toLowerCase())
}

export async function sendEmail(input: SendEmailInput): Promise<SendResult> {
  if (!allowedInThisEnvironment(input.to)) {
    console.warn(
      "[email-send] suppressed outside production: recipient is not on EMAIL_DEV_ALLOWLIST"
    )
    return "suppressed_dev"
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error("[email-send] RESEND_API_KEY is not set")
    return "service_error"
  }

  try {
    const { error } = await new Resend(apiKey).emails.send({
      from: FROM,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      headers: input.unsubscribeUrl
        ? {
            // Lets a mail client offer its own unsubscribe control, so a member
            // who wants out reaches for that instead of the spam button. Costs
            // nothing and is most of what protects `updates.`'s reputation.
            "List-Unsubscribe": `<${input.unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          }
        : undefined,
    })

    if (!error) return "ok"

    // Resend's error names are the claim; these three are the only ones the
    // product distinguishes, and everything else is honestly a service error
    // rather than something guessed at.
    if (error.name === "validation_error") {
      console.error("[email-send] the service rejected the request as invalid:", error.message)
      return "invalid_address"
    }
    if (error.name === "rate_limit_exceeded" || error.name === "daily_quota_exceeded") {
      console.error("[email-send] the service refused on a limit:", error.name)
      return "rate_limited"
    }
    console.error("[email-send] the service failed:", error.name, error.message)
    return "service_error"
  } catch (err) {
    console.error("[email-send] the request to the service threw:", err)
    return "service_error"
  }
}
```

- [ ] **Step 5: Run the guard tests and watch them pass**

```bash
npx vitest run src/lib/email/__tests__/send.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 6: Add the result-mapping tests**

Append to the same file:

```ts
describe("the result mapping", () => {
  beforeEach(() => {
    process.env.VERCEL_ENV = "production"
  })

  it("returns ok when the service accepts", async () => {
    sendMock.mockResolvedValue({ data: { id: "msg_1" }, error: null })
    const { sendEmail } = await import("../send")
    expect(await sendEmail({ to: "a@b.com", ...MESSAGE })).toBe("ok")
  })

  it("maps a validation error to invalid_address", async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { name: "validation_error", message: "invalid to field" },
    })
    const { sendEmail } = await import("../send")
    expect(await sendEmail({ to: "nonsense", ...MESSAGE })).toBe("invalid_address")
  })

  it("maps both limit refusals to rate_limited", async () => {
    const { sendEmail } = await import("../send")
    for (const name of ["rate_limit_exceeded", "daily_quota_exceeded"]) {
      sendMock.mockResolvedValue({ data: null, error: { name, message: "slow down" } })
      expect(await sendEmail({ to: "a@b.com", ...MESSAGE })).toBe("rate_limited")
    }
  })

  it("maps an unrecognised service error to service_error", async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { name: "internal_server_error", message: "boom" },
    })
    const { sendEmail } = await import("../send")
    expect(await sendEmail({ to: "a@b.com", ...MESSAGE })).toBe("service_error")
  })

  it("maps a thrown network failure to service_error rather than escaping", async () => {
    sendMock.mockRejectedValue(new Error("ECONNRESET"))
    const { sendEmail } = await import("../send")
    await expect(sendEmail({ to: "a@b.com", ...MESSAGE })).resolves.toBe("service_error")
  })

  it("returns service_error when the API key is missing, without calling the service", async () => {
    delete process.env.RESEND_API_KEY
    const { sendEmail } = await import("../send")
    expect(await sendEmail({ to: "a@b.com", ...MESSAGE })).toBe("service_error")
    expect(sendMock).not.toHaveBeenCalled()
  })

  it("sets both List-Unsubscribe headers when given a URL, and neither when not", async () => {
    sendMock.mockResolvedValue({ data: { id: "msg_1" }, error: null })
    const { sendEmail } = await import("../send")

    await sendEmail({ to: "a@b.com", ...MESSAGE, unsubscribeUrl: "https://x.test/u/tok" })
    expect(sendMock.mock.calls[0][0].headers).toEqual({
      "List-Unsubscribe": "<https://x.test/u/tok>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    })

    await sendEmail({ to: "a@b.com", ...MESSAGE })
    expect(sendMock.mock.calls[1][0].headers).toBeUndefined()
  })

  it("never logs the address", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    sendMock.mockResolvedValue({
      data: null,
      error: { name: "internal_server_error", message: "boom" },
    })
    const { sendEmail } = await import("../send")

    await sendEmail({ to: "secret@member.com", ...MESSAGE })

    const logged = [...warn.mock.calls, ...error.mock.calls].flat().join(" ")
    expect(logged).not.toContain("secret@member.com")
    warn.mockRestore()
    error.mockRestore()
  })
})
```

- [ ] **Step 7: Run them and watch them pass**

```bash
npx vitest run src/lib/email/__tests__/send.test.ts
```

Expected: PASS, 12 tests total in the file.

- [ ] **Step 8: Run the full suite and commit**

```bash
npm test
```

```bash
git add package.json package-lock.json src/lib/email
git commit -m "The product can put mail in an inbox that is not a login code"
```

---

## Task 4: The unsubscribe door

**Files:**
- Modify: `prisma/schema.prisma` (the `User` model)
- Create: `prisma/migrations/<generated>_digest_unsubscribe/migration.sql` (by CLI)
- Create: `src/lib/email/unsubscribe.ts`
- Create: `src/lib/email/__tests__/unsubscribe.test.ts`
- Create: `src/app/actions/unsubscribe.ts`
- Create: `src/app/unsubscribe/[token]/page.tsx`
- Create: `src/app/unsubscribe/[token]/UnsubscribeForm.tsx`
- Create: `src/app/unsubscribe/[token]/__tests__/UnsubscribeForm.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `ensureUnsubscribeToken(userId): Promise<string>` and `unsubscribeByToken(token, now): Promise<void>`. Task 5's script calls `ensureUnsubscribeToken`. Slice two calls both and reads `User.digestOptOutAt`.

**This is the slice's second migration; task 2 holds the first.** They stay separate so either task can land or be reverted without dragging the other's column with it.

**Scope, stated because the two halves differ:** digests are sent per group, but unsubscribing is per person and stops digests for **every** group they are in. That is what somebody means when they click it, and a per-group choice would be the preference model by the back door.

- [ ] **Step 1: Add the columns**

In `prisma/schema.prisma`, inside `model User`, after `emailAskedAt`:

```prisma
  /// Set when this person unsubscribed from digests. Null means subscribed.
  /// Digests only: it must never gate a login code, which is transactional and
  /// leaves through a different subdomain. Somebody who stops wanting digests
  /// still has to be able to sign in.
  digestOptOutAt    DateTime?
  /// The capability in their unsubscribe link. Generated lazily, the first time
  /// a digest is composed for them, with randomUUID() as reset-invite.ts:34
  /// does, so one link can never be guessed from another.
  unsubscribeToken  String?   @unique
```

- [ ] **Step 2: Confirm the database, then generate the migration**

```bash
npm run db:which
```

Expected: the dev-test ref. Then:

```bash
npx prisma migrate dev --name digest_unsubscribe
```

- [ ] **Step 3: Write the failing test**

Create `src/lib/email/__tests__/unsubscribe.test.ts`, following the fixture pattern from `src/lib/auth/__tests__/email-ask.test.ts` (delete `contactMethod` rows before `user` rows in `afterAll`).

```ts
describe("ensureUnsubscribeToken", () => {
  it("generates a token once and returns the same one afterwards", async () => {
    const user = await makeUser("tokened")

    const first = await ensureUnsubscribeToken(user.id)
    const second = await ensureUnsubscribeToken(user.id)

    expect(first).toHaveLength(36)
    expect(second).toBe(first)
  })

  it("gives two people different tokens", async () => {
    const a = await makeUser("a")
    const b = await makeUser("b")
    expect(await ensureUnsubscribeToken(a.id)).not.toBe(await ensureUnsubscribeToken(b.id))
  })
})

describe("unsubscribeByToken", () => {
  it("records the opt-out", async () => {
    const user = await makeUser("leaver")
    const token = await ensureUnsubscribeToken(user.id)
    const now = new Date("2026-08-28T19:00:00Z")

    await unsubscribeByToken(token, now)

    const after = await prisma.user.findUnique({ where: { id: user.id } })
    expect(after?.digestOptOutAt?.toISOString()).toBe(now.toISOString())
  })

  it("LEAVES THE ADDRESS VERIFIED, so login codes still work", async () => {
    const user = await makeUser("still-signs-in")
    await prisma.contactMethod.create({
      data: { userId: user.id, type: "EMAIL", value: `t-${stamp}@example.com`, isVerified: true },
    })
    const token = await ensureUnsubscribeToken(user.id)

    await unsubscribeByToken(token, new Date())

    const method = await prisma.contactMethod.findFirst({ where: { userId: user.id } })
    expect(method?.isVerified).toBe(true)
  })

  it("is idempotent: a second click keeps the first timestamp", async () => {
    const user = await makeUser("double-clicker")
    const token = await ensureUnsubscribeToken(user.id)
    const first = new Date("2026-08-28T19:00:00Z")

    await unsubscribeByToken(token, first)
    await unsubscribeByToken(token, new Date("2026-08-29T19:00:00Z"))

    const after = await prisma.user.findUnique({ where: { id: user.id } })
    expect(after?.digestOptOutAt?.toISOString()).toBe(first.toISOString())
  })

  it("does nothing and throws nothing for an unknown token", async () => {
    await expect(unsubscribeByToken("not-a-real-token", new Date())).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 4: Run it and watch it fail**

```bash
npx vitest run src/lib/email/__tests__/unsubscribe.test.ts
```

Expected: FAIL, cannot resolve `../unsubscribe`.

- [ ] **Step 5: Implement**

Create `src/lib/email/unsubscribe.ts`:

```ts
// src/lib/email/unsubscribe.ts
//
// One door: it stops digests and touches nothing else.
//
// The rule this file exists to hold up, and the one way it could quietly break
// the slice that shipped last week: unsubscribing NEVER touches
// ContactMethod.isVerified. Login codes are transactional, they leave through
// the `account.` subdomain, and somebody who stops wanting digests must still
// be able to sign in as themselves. The opt-out lives on User for that reason:
// it is a decision about a person, readable without loading their address.
//
// Per person, not per group. Digests are sent per group, but one click stops
// all of them, because that is what somebody means when they click it, and a
// per-group choice would be the declined preference model by the back door.

import { randomUUID } from "crypto"
import { prisma } from "@/lib/prisma"

/** The token in this person's unsubscribe link, generated on first need. */
export async function ensureUnsubscribeToken(userId: string): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { unsubscribeToken: true },
  })
  if (existing?.unsubscribeToken) return existing.unsubscribeToken

  const token = randomUUID()
  await prisma.user.update({ where: { id: userId }, data: { unsubscribeToken: token } })
  return token
}

/**
 * Records the opt-out. Silent for an unknown token, and silent for somebody
 * who already opted out: the scoped updateMany writes nothing in both cases,
 * which is also why a second click cannot overwrite the first timestamp. The
 * page shows the same confirmation either way, so a stranger holding a
 * guessed token learns nothing from the difference.
 */
export async function unsubscribeByToken(token: string, now: Date): Promise<void> {
  await prisma.user.updateMany({
    where: { unsubscribeToken: token, digestOptOutAt: null },
    data: { digestOptOutAt: now },
  })
}
```

- [ ] **Step 6: Run it and watch it pass**

```bash
npx vitest run src/lib/email/__tests__/unsubscribe.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 7: Write the server action**

Create `src/app/actions/unsubscribe.ts`:

```ts
"use server"

// The write behind the unsubscribe page's button.
//
// It is a POST and not a link click, deliberately: mail clients and security
// scanners prefetch links, so a GET that mutated would unsubscribe people who
// never clicked. The page renders on GET and writes only here.
//
// No session is required and none is checked. The token IS the authorisation,
// which is the only thing that can work: the person clicking arrives from
// their mail app, frequently on a device holding no session at all, and that
// is exactly the population this door exists for.

import { unsubscribeByToken } from "@/lib/email/unsubscribe"

export async function unsubscribeAction(token: string): Promise<void> {
  try {
    await unsubscribeByToken(token, new Date())
  } catch (err) {
    console.error("[unsubscribe] recording an opt-out failed", err)
  }
}
```

- [ ] **Step 8: Write the failing component test**

Create `src/app/unsubscribe/[token]/__tests__/UnsubscribeForm.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react"

const unsubscribeAction = vi.fn(() => Promise.resolve())
vi.mock("@/app/actions/unsubscribe", () => ({ unsubscribeAction }))

import UnsubscribeForm from "../UnsubscribeForm"

afterEach(() => {
  cleanup()
  unsubscribeAction.mockClear()
})

describe("UnsubscribeForm", () => {
  it("writes nothing until the button is pressed", () => {
    render(<UnsubscribeForm token="tok_1" />)
    expect(unsubscribeAction).not.toHaveBeenCalled()
  })

  it("records the opt-out and confirms it", async () => {
    render(<UnsubscribeForm token="tok_1" />)
    fireEvent.click(screen.getByRole("button", { name: "Stop sending me these" }))

    await waitFor(() => expect(unsubscribeAction).toHaveBeenCalledWith("tok_1"))
    // The rendered copy uses a curly apostrophe (&rsquo;), so the match
    // deliberately avoids one rather than quietly failing on it.
    expect(await screen.findByText(/unsubscribed\. Orbit/)).toBeTruthy()
  })

  it("says that sign-in codes keep working", async () => {
    render(<UnsubscribeForm token="tok_1" />)
    fireEvent.click(screen.getByRole("button", { name: "Stop sending me these" }))
    expect(await screen.findByText(/sign-in codes still work/)).toBeTruthy()
  })

  it("uses no dashes in its copy, per the product voice rule", () => {
    const { container } = render(<UnsubscribeForm token="tok_1" />)
    expect(container.textContent).not.toMatch(/[—–]/)
  })
})
```

- [ ] **Step 9: Run it and watch it fail**

```bash
npx vitest run "src/app/unsubscribe/[token]/__tests__/UnsubscribeForm.test.tsx"
```

Expected: FAIL, cannot resolve `../UnsubscribeForm`.

- [ ] **Step 10: Implement the form and the page**

Copy in Orbit's voice: plain, warm, no dashes. No survey, no "are you sure", no alternatives offered. That is the anti-clutter brand applied to the exit as well as the entrance. Colours from the tokens; the button is the screen's one real action, so it takes `--action`.

Create `src/app/unsubscribe/[token]/UnsubscribeForm.tsx`:

```tsx
"use client"

import { useState, useTransition } from "react"
import { unsubscribeAction } from "@/app/actions/unsubscribe"

export default function UnsubscribeForm({ token }: { token: string }) {
  const [done, setDone] = useState(false)
  const [pending, startTransition] = useTransition()

  if (done) {
    return (
      <p style={{ fontSize: "var(--type-body)", color: "var(--text-primary)" }}>
        You&rsquo;re unsubscribed. Orbit won&rsquo;t email you group updates any more. Your
        sign-in codes still work, so you can always get back into your group.
      </p>
    )
  }

  return (
    <>
      <p style={{ fontSize: "var(--type-body)", color: "var(--text-primary)" }}>
        Orbit sends a short update when something in your group needs you. Stopping it
        won&rsquo;t affect your sign-in codes, and you can still open your group any time.
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await unsubscribeAction(token)
            setDone(true)
          })
        }
        style={{
          fontSize: "var(--type-label)",
          background: "var(--action)",
          color: "var(--action-ink)",
          border: "none",
          borderRadius: 999,
          padding: "14px 22px",
          minHeight: 44,
          width: "100%",
          cursor: "pointer",
        }}
      >
        Stop sending me these
      </button>
    </>
  )
}
```

Create `src/app/unsubscribe/[token]/page.tsx`. It renders and writes nothing; it does not look the token up, so an unknown token reaches the same screen as a real one and a stranger learns nothing from the difference.

```tsx
import UnsubscribeForm from "./UnsubscribeForm"

export const metadata = { title: "Unsubscribe" }

export default async function UnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return (
    <main style={{ maxWidth: 420, margin: "0 auto", padding: "48px 20px" }}>
      <UnsubscribeForm token={token} />
    </main>
  )
}
```

Next 16 types `params` as a Promise; if the version in this repo disagrees, follow `node_modules/next/dist/docs/` rather than this snippet, and say so in the PR.

- [ ] **Step 11: Run it and watch it pass**

```bash
npx vitest run "src/app/unsubscribe/[token]/__tests__/UnsubscribeForm.test.tsx"
```

Expected: PASS, 4 tests.

- [ ] **Step 12: Run the full suite and commit**

```bash
npm test
```

```bash
git add prisma/schema.prisma prisma/migrations src/lib/email src/app/actions/unsubscribe.ts src/app/unsubscribe
git commit -m "One door out of the digest, and it never touches your sign-in"
```

---

## Task 5: The proof, and the checklist

**Files:**
- Create: `scripts/send-test-email.ts`
- Modify: `package.json` (`email:test` script)
- Modify: `docs/build-notes.md` (§8 "After launch" list)
- Modify: `CLAUDE.md` ("Where the build is")

**Interfaces:**
- Consumes: `sendEmail` (task 3), `ensureUnsubscribeToken` (task 4).
- Produces: the evidence pasted into the PR. This is the only thing in the slice that proves the pipe works end to end.

- [ ] **Step 1: Write the script**

Create `scripts/send-test-email.ts`. Deliberately outside the test runner, same reasoning and same shape as `eval:detect` and `eval:onboarding`: it costs money and hits the network.

```ts
// scripts/send-test-email.ts
//
// Hand-run. Sends one real email through the real seam, which is the only
// honest proof that the `updates.` pipe works. Never part of the suite: it
// costs money and hits the network, the same rule the eval benches run under.
//
// Usage: npm run email:test -- you@example.com
//
// Outside production the address must be on EMAIL_DEV_ALLOWLIST or the seam
// suppresses it, which is the guard doing its job rather than a failure.

import { sendEmail } from "../src/lib/email/send"
import { ensureUnsubscribeToken } from "../src/lib/email/unsubscribe"
import { prisma } from "../src/lib/prisma"

async function main() {
  const to = process.argv[2]
  if (!to) {
    console.error("Usage: npm run email:test -- you@example.com")
    process.exit(1)
  }

  // A real, working unsubscribe link rather than a stub, so the one email this
  // slice sends exercises the whole door including the List-Unsubscribe header.
  const method = await prisma.contactMethod.findFirst({
    where: { type: "EMAIL", value: to },
    select: { userId: true },
  })
  const token = method ? await ensureUnsubscribeToken(method.userId) : null
  const unsubscribeUrl = token
    ? `https://interplanetarygroups.com/unsubscribe/${token}`
    : undefined
  if (!token) {
    console.warn("No account holds that address, so this test sends without an unsubscribe link.")
  }

  const result = await sendEmail({
    to,
    subject: "Orbit test send",
    text: "This is a test from the digest slice. Nothing needs your answer.",
    html: "<p>This is a test from the digest slice. Nothing needs your answer.</p>",
    unsubscribeUrl,
  })

  console.log(`result: ${result}`)
  console.log(`unsubscribe link: ${unsubscribeUrl ?? "(none)"}`)
  await prisma.$disconnect()
  process.exit(result === "ok" ? 0 : 1)
}

void main()
```

- [ ] **Step 2: Register it**

In `package.json` scripts, after `eval:onboarding`:

```json
    "email:test": "tsx --env-file=.env scripts/send-test-email.ts",
```

- [ ] **Step 3: Verify the guard refuses first, which is the safer half of the proof**

With `EMAIL_DEV_ALLOWLIST` unset in `.env`:

```bash
npm run email:test -- someone@example.com
```

Expected: `result: suppressed_dev`, nothing sent, exit code 1. **Record this output for the PR.** It is the evidence that a local run cannot mail a real person.

- [ ] **Step 4: Send one real email**

This step needs the deploy-time obligations below done first, and it is the owner's to run or to watch. Set `EMAIL_DEV_ALLOWLIST` to the owner's own address in `.env`, then:

```bash
npm run email:test -- <the owner's address>
```

Expected: `result: ok`, and the message arrives. **Record the output and confirm arrival for the PR.** If it lands in spam, say so plainly rather than only reporting `ok`: a new sending subdomain with no reputation is expected to, and that is a real finding rather than a failure.

- [ ] **Step 5: Append the deploy-time obligations**

To §8's "After launch, running deploy-time obligations" in `docs/build-notes.md`, as new numbered items, per the rule that a slice creating an obligation records it in the same PR:

> 7. **Add `updates.interplanetarygroups.com` as a sending domain in Resend, and verify its DNS.** Nothing sends until it verifies. Expect Vercel to write the DNS records itself, because the domain was bought through Vercel and that is what happened with `account.` on 26 Aug; check rather than assume.
> 8. **Set `RESEND_API_KEY` in Vercel's production environment variables.** The same Resend account already relays login codes, so this is a key on an existing account rather than a new service.
> 9. **Set `EMAIL_DEV_ALLOWLIST` in the local `.env`** to the owner's own address. Deliberately absent in production, where the guard does not apply. Unset means nothing sends locally, which is the intended fail-closed default.
>
> *Deliberately NOT on this list, recorded so nobody adds it later out of superstition:* **nothing needs configuring in either Supabase project, and raising Supabase's hourly email limit is not a prerequisite for the digest.** The digest calls Resend directly and spends none of Supabase's allowance. See item 6's 28 August correction.

- [ ] **Step 6: Update the current-state section**

In `CLAUDE.md`'s "Where the build is", add a paragraph in the house voice recording what is now true: the app records when a member last opened a group and nothing reads it yet; the product can send mail that is not a login code, through `updates.`, with a guard that stops a local run mailing a real person; there is one unsubscribe door, per person, that never touches sign-in; and the digest itself, its content and its cron, is slice two. Name the debt: no send log, so nothing in our own database records that an email went out.

- [ ] **Step 7: Run the full suite and commit**

```bash
npm test
```

```bash
git add package.json scripts/send-test-email.ts docs/build-notes.md CLAUDE.md
git commit -m "One real email, and the obligations it creates"
```
