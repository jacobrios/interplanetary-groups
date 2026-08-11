# Share-Readiness Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membership becomes a real boundary (views, writes, and the calendar file), and Orbit tells the truth about why a model call failed (out of credits vs service trouble vs didn't understand).

**Architecture:** One shared `isGroupMember` check used by the three group screens, the calendar route, and every write action; membership enforcement also pushed into the DB-testable lib write functions (`createMessage`, `setRsvp`, `castVote`) so no caller can forget it. One pure error classifier (`classifyModelCallError`) at the single seam all model calls flow through (`callExtractionModel`), surfacing a typed `ModelUnavailableError` with `reason: "credits" | "trouble"` that the three action result types carry to the UI.

**Tech Stack:** Next.js 16 (App Router, server actions), Prisma 7 against the dev-test Supabase DB, Vitest (node env for DB tests, `// @vitest-environment jsdom` + @testing-library/react for components), @anthropic-ai/sdk.

**Spec:** `docs/superpowers/specs/2026-08-11-share-readiness-design.md` — read it before starting. Its "Settled decisions" section is do-not-relitigate.

## Global Constraints

- Run `npm run db:which` before the first suite run; it must print the dev-test ref `pxbewardwvoyqqcvogel` and exit 0. Never point at any other database.
- Suite baseline at slice start (already recorded in build-notes §11): 62 files, 752 tests, all green, zero skipped. Every task below leaves the suite green.
- TDD: write each failing test, run it, watch it fail, then implement. `npx vitest run <path>` runs one file.
- DB-test idiom (copy `src/lib/groups/__tests__/leave.test.ts`): real dev-test DB, self-built fixtures with `[TEST]` name prefixes and unique `supabaseAuthId` stamps, `afterAll` cleanup deleting groups before users, `prisma.$disconnect()` at the end.
- Copy strings are owner-approved verbatim (spec "Approved copy" section). No em dashes and no en dashes anywhere in Orbit copy or in code comments. Orbit voice: plain, warm.
- Refusal copy for writes follows the existing precedent string "Only members can vote on this." (proposal-vote): soft, short, factual.
- Commit messages: plain product-language sentences (repo convention, e.g. "Put the add-to-calendar pill on the event screen"), no `feat:` prefixes. End every commit body with the Claude co-author line used throughout this repo.
- `ModelFailureReason` must only ever reach client components via `import type` (the runtime module imports the Anthropic SDK, which must never enter a client bundle).
- Do not create worktrees; work in place on `feat/share-readiness`.

---

### Task 1: Shared membership check

**Files:**
- Create: `src/lib/auth/membership.ts`
- Test: `src/lib/auth/__tests__/membership.test.ts`

**Interfaces:**
- Consumes: `prisma` from `@/lib/prisma`.
- Produces: `isGroupMember(userId: string, groupId: string): Promise<boolean>` — later tasks import it as `import { isGroupMember } from "@/lib/auth/membership"`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/auth/__tests__/membership.test.ts
import { describe, it, expect, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { isGroupMember } from "../membership"

describe("isGroupMember", () => {
  const groupIds: string[] = []
  const userIds: string[] = []

  afterAll(async () => {
    for (const id of groupIds) {
      await prisma.group.delete({ where: { id } }).catch(() => {})
    }
    for (const id of userIds) {
      await prisma.user.delete({ where: { id } }).catch(() => {})
    }
    await prisma.$disconnect()
  })

  it("is true for a member and false for everyone else", async () => {
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const founder = await prisma.user.create({
      data: { name: "[TEST] Membership Founder", supabaseAuthId: `test-mem-f-${stamp}` },
    })
    const outsider = await prisma.user.create({
      data: { name: "[TEST] Membership Outsider", supabaseAuthId: `test-mem-o-${stamp}` },
    })
    const group = await prisma.group.create({
      data: {
        name: "[TEST] Membership Group",
        founderId: founder.id,
        memberships: { create: [{ userId: founder.id }] },
      },
    })
    groupIds.push(group.id)
    userIds.push(founder.id, outsider.id)

    expect(await isGroupMember(founder.id, group.id)).toBe(true)
    expect(await isGroupMember(outsider.id, group.id)).toBe(false)
    expect(await isGroupMember("no-such-user", group.id)).toBe(false)
    expect(await isGroupMember(founder.id, "no-such-group")).toBe(false)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/auth/__tests__/membership.test.ts`
Expected: FAIL (module `../membership` does not exist).

- [ ] **Step 3: Implement**

```ts
// src/lib/auth/membership.ts
//
// The one answer to "is this person a member of this group?". Every gate in
// the product (screen walls, write refusals, the calendar route) reads this
// helper or the same compound-key lookup inside a transaction, so no surface
// can invent its own slightly different answer.

import { prisma } from "@/lib/prisma"

export async function isGroupMember(userId: string, groupId: string): Promise<boolean> {
  const membership = await prisma.membership.findUnique({
    where: { userId_groupId: { userId, groupId } },
    select: { id: true },
  })
  return membership !== null
}
```

- [ ] **Step 4: Run the test, expect PASS. Commit:** "Give the product one answer to who is a member"

---

### Task 2: Posting refuses non-members

**Files:**
- Modify: `src/lib/messages/create.ts`
- Modify: `src/app/actions/send-message.ts`
- Test: Create `src/lib/messages/__tests__/create-membership.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `createMessage` throws `Error("NOT_A_MEMBER")` when `authorType === MEMBER` and the author is not a member of `groupId`. ORBIT and SYSTEM messages are untouched. `sendMessageAction` maps that throw to `{ errors: { general: "Only members can post here." } }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/messages/__tests__/create-membership.test.ts
import { describe, it, expect, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { MessageAuthor } from "@prisma/client"
import { createMessage } from "../create"

describe("createMessage membership gate", () => {
  const groupIds: string[] = []
  const userIds: string[] = []

  afterAll(async () => {
    for (const id of groupIds) {
      await prisma.message.deleteMany({ where: { groupId: id } }).catch(() => {})
      await prisma.group.delete({ where: { id } }).catch(() => {})
    }
    for (const id of userIds) {
      await prisma.user.delete({ where: { id } }).catch(() => {})
    }
    await prisma.$disconnect()
  })

  async function fixture() {
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const founder = await prisma.user.create({
      data: { name: "[TEST] Msg Founder", supabaseAuthId: `test-msg-f-${stamp}` },
    })
    const outsider = await prisma.user.create({
      data: { name: "[TEST] Msg Outsider", supabaseAuthId: `test-msg-o-${stamp}` },
    })
    const group = await prisma.group.create({
      data: {
        name: "[TEST] Msg Group",
        founderId: founder.id,
        memberships: { create: [{ userId: founder.id }] },
      },
    })
    groupIds.push(group.id)
    userIds.push(founder.id, outsider.id)
    return { founder, outsider, group }
  }

  it("refuses a MEMBER message from a non-member", async () => {
    const { outsider, group } = await fixture()
    await expect(
      createMessage({
        groupId: group.id,
        authorType: MessageAuthor.MEMBER,
        authorId: outsider.id,
        body: "hello from outside",
      })
    ).rejects.toThrow("NOT_A_MEMBER")
    const count = await prisma.message.count({ where: { groupId: group.id } })
    expect(count).toBe(0)
  })

  it("still writes a member's message and Orbit's own", async () => {
    const { founder, group } = await fixture()
    const memberMsg = await createMessage({
      groupId: group.id,
      authorType: MessageAuthor.MEMBER,
      authorId: founder.id,
      body: "hello from inside",
    })
    expect(memberMsg.id).toBeTruthy()
    const orbitMsg = await createMessage({
      groupId: group.id,
      authorType: MessageAuthor.ORBIT,
      authorId: null,
      body: "Orbit speaking",
    })
    expect(orbitMsg.id).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run it, watch the first case fail** (`npx vitest run src/lib/messages/__tests__/create-membership.test.ts` — the non-member message currently writes).

- [ ] **Step 3: Implement in `src/lib/messages/create.ts`**

Add after the `EMPTY_BODY` guard, before the `prisma.message.create`:

```ts
  // Membership gate (share-readiness slice): a MEMBER message must come from
  // a current member of this group. Orbit and SYSTEM lines have no author and
  // are written by trusted server paths, so they pass through.
  if (authorType === MessageAuthor.MEMBER) {
    if (!authorId) throw new Error("NOT_A_MEMBER")
    const membership = await prisma.membership.findUnique({
      where: { userId_groupId: { userId: authorId, groupId } },
      select: { id: true },
    })
    if (!membership) throw new Error("NOT_A_MEMBER")
  }
```

Also update the function's docstring guard list to include: `- For MEMBER messages, the author must be a current member of the group ("NOT_A_MEMBER").`

- [ ] **Step 4: Map it in `src/app/actions/send-message.ts`**

In the existing catch block, add a branch beside the `EMPTY_BODY` one:

```ts
    if (msg === "NOT_A_MEMBER") {
      return { errors: { general: "Only members can post here." } }
    }
```

Rewrite the header-comment paragraph that currently starts "What this does NOT do, stated because the line above used to imply it:" to:

```ts
 * Membership gate (share-readiness slice): createMessage refuses a MEMBER
 * message whose author is not a current member of the group, and this action
 * surfaces that as an honest refusal. The page-level wall means members are
 * the only people who ever see the input, but a removed member's stale tab
 * still holds a live form, and the server refusing is what actually protects
 * the feed.
```

- [ ] **Step 5: Run the file and the full suite, expect green. Commit:** "Posting belongs to members: the feed refuses a non-member's message"

---

### Task 3: RSVP refuses non-members

**Files:**
- Modify: `src/lib/events/rsvp.ts`
- Modify: `src/app/actions/rsvp.ts`
- Test: Create `src/lib/events/__tests__/rsvp-membership.test.ts`

**Interfaces:**
- Produces: `setRsvp` throws `Error("NOT_A_MEMBER")` when the resolved user is not a member of the event's group, and `Error("NO_EVENT")` when the event does not exist. `rsvpAction` maps NOT_A_MEMBER to `{ errors: { general: "Only members can RSVP to this one." } }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/events/__tests__/rsvp-membership.test.ts
import { describe, it, expect, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { RsvpStatus } from "@prisma/client"
import { setRsvp } from "../rsvp"

describe("setRsvp membership gate", () => {
  const groupIds: string[] = []
  const userIds: string[] = []

  afterAll(async () => {
    for (const id of groupIds) {
      await prisma.event.deleteMany({ where: { groupId: id } }).catch(() => {})
      await prisma.group.delete({ where: { id } }).catch(() => {})
    }
    for (const id of userIds) {
      await prisma.user.delete({ where: { id } }).catch(() => {})
    }
    await prisma.$disconnect()
  })

  it("refuses a non-member's RSVP and leaves no row behind", async () => {
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const founder = await prisma.user.create({
      data: { name: "[TEST] Rsvp Founder", supabaseAuthId: `test-rsvpm-f-${stamp}` },
    })
    const outsiderAuthId = `test-rsvpm-o-${stamp}`
    const outsider = await prisma.user.create({
      data: { name: "[TEST] Rsvp Outsider", supabaseAuthId: outsiderAuthId },
    })
    const group = await prisma.group.create({
      data: {
        name: "[TEST] Rsvp Group",
        founderId: founder.id,
        memberships: { create: [{ userId: founder.id }] },
      },
    })
    groupIds.push(group.id)
    userIds.push(founder.id, outsider.id)
    const event = await prisma.event.create({
      data: { groupId: group.id, title: "[TEST] Climb", startsAt: new Date("2099-06-10T12:00:00Z") },
    })

    await expect(
      setRsvp({ supabaseAuthId: outsiderAuthId, eventId: event.id, status: RsvpStatus.IN })
    ).rejects.toThrow("NOT_A_MEMBER")
    const rows = await prisma.rsvp.count({ where: { eventId: event.id } })
    expect(rows).toBe(0)

    // A member's RSVP still writes.
    const { rsvp } = await setRsvp({
      supabaseAuthId: founder.supabaseAuthId,
      eventId: event.id,
      status: RsvpStatus.IN,
    })
    expect(rsvp.status).toBe(RsvpStatus.IN)
  })
})
```

- [ ] **Step 2: Run it, watch it fail** (the outsider's RSVP currently writes — the silent-drop row).

- [ ] **Step 3: Implement in `src/lib/events/rsvp.ts`**

Inside the transaction, after the `NO_USER` guard and before the upsert:

```ts
    // Membership gate (share-readiness slice): an RSVP is a statement about a
    // group's plan, so only that group's members may make one. Before this
    // guard, a non-member's row wrote and then vanished from every derived
    // count, the silent-drop failure the slice exists to close.
    const event = await tx.event.findUnique({
      where: { id: eventId },
      select: { groupId: true },
    })
    if (!event) throw new Error("NO_EVENT")
    const membership = await tx.membership.findUnique({
      where: { userId_groupId: { userId: user.id, groupId: event.groupId } },
      select: { id: true },
    })
    if (!membership) throw new Error("NOT_A_MEMBER")
```

Update the docstring's guard list accordingly (add items 4 `NO_EVENT` and 5 `NOT_A_MEMBER`).

- [ ] **Step 4: Map it in `src/app/actions/rsvp.ts`**

Change the bare `catch {` to `catch (err) {` and map:

```ts
  } catch (err) {
    if (err instanceof Error && err.message === "NOT_A_MEMBER") {
      return { errors: { general: "Only members can RSVP to this one." } }
    }
    return { errors: { general: "Couldn't save that, try again." } }
  }
```

- [ ] **Step 5: Run the file and the full suite (existing `rsvp.test.ts` fixtures must still pass — its users are members; if any fixture RSVPs without a membership, add the membership to that fixture rather than weakening the guard). Commit:** "An RSVP now requires membership, closing the silent-drop row"

---

### Task 4: Gauge votes refuse non-members

**Files:**
- Modify: `src/lib/gauges/vote.ts`
- Modify: `src/app/actions/gauge-vote.ts`
- Test: Create `src/lib/gauges/__tests__/vote-membership.test.ts`

**Interfaces:**
- Produces: `castVote` throws `Error("NOT_A_MEMBER")` when the resolved user is not a member of the gauge's group, `Error("NO_GAUGE")` when the gauge does not exist. `gaugeVoteAction` maps NOT_A_MEMBER to `{ errors: { general: "Only members can vote on this." } }`.

- [ ] **Step 1: Write the failing test** — same fixture idiom as Task 3. Build: founder (member) + outsider, a gauge via `createGauge` from `src/lib/gauges/create` (copy the message-then-createGauge pattern from `src/lib/gauges/__tests__/promote.test.ts`'s `gaugeWith` helper: create a MEMBER message by the founder, then `createGauge({ groupId, sourceMessageId, activity: "beers", proposedDate: new Date("2099-06-12T00:00:00Z"), proposedTime: "19:00", body: "..." })`). Assert:

```ts
    await expect(
      castVote({ supabaseAuthId: outsiderAuthId, gaugeId, answer: GaugeAnswer.IN })
    ).rejects.toThrow("NOT_A_MEMBER")
    const votes = await prisma.gaugeVote.count({ where: { gaugeId } })
    expect(votes).toBe(0)
    // and a member's vote still writes
    const { vote } = await castVote({ supabaseAuthId: founderAuthId, gaugeId, answer: GaugeAnswer.IN })
    expect(vote.answer).toBe(GaugeAnswer.IN)
```

Cleanup order in `afterAll`: `gaugeVote.deleteMany` → `gauge.deleteMany({ where: { groupId } })` → `message.deleteMany` → `membership.deleteMany` → group → users.

- [ ] **Step 2: Run it, watch the NOT_A_MEMBER case fail.**

- [ ] **Step 3: Implement in `src/lib/gauges/vote.ts`** — inside the transaction, after `NO_USER`:

```ts
    // Membership gate (share-readiness slice): before this guard a
    // non-member's IN genuinely counted toward the three-yes bar and could be
    // the tap that created a real event for a group they were not in.
    const gauge = await tx.gauge.findUnique({
      where: { id: gaugeId },
      select: { groupId: true },
    })
    if (!gauge) throw new Error("NO_GAUGE")
    const membership = await tx.membership.findUnique({
      where: { userId_groupId: { userId: user.id, groupId: gauge.groupId } },
      select: { id: true },
    })
    if (!membership) throw new Error("NOT_A_MEMBER")
```

- [ ] **Step 4: Map it in `src/app/actions/gauge-vote.ts`** — the `castVote` catch becomes:

```ts
  } catch (err) {
    if (err instanceof Error && err.message === "NOT_A_MEMBER") {
      return { errors: { general: "Only members can vote on this." } }
    }
    return { errors: { general: "Couldn't save that, try again." } }
  }
```

Replace the header-comment paragraph "Voting is not membership-gated, consistent with every other surface in the product. That is the standing access-control gap, not a new one." with:

```ts
 * Voting is membership-gated (share-readiness slice): castVote refuses a
 * non-member inside its transaction, because an IN here can be the tap that
 * creates a real event for the whole group.
```

- [ ] **Step 5: Run the file and full suite. Commit:** "A gauge vote now requires membership, so an outsider's yes can't create an event"

---

### Task 5: Gauge promotion counts current members only

**Files:**
- Modify: `src/lib/gauges/promote.ts`
- Test: Modify `src/lib/gauges/__tests__/promote.test.ts` (append cases; reuse its `ensureGroup` / `gaugeWith` helpers and `NOW` constant as they exist in that file)

**Interfaces:**
- Produces: `promoteGaugeToEvent` counts only current members' votes toward the threshold, seeds RSVPs only for current members, and reports the announcement's count from member votes. Signature unchanged.

This aligns gauges with the established product rule (proposals promote and the endgame sweep already filter to members): a voter who has since left, or a stray pre-gate non-member row, neither counts nor gets seeded.

- [ ] **Step 1: Append the failing tests to `promote.test.ts`**

```ts
  it("does not count a non-member's yes toward the bar", async () => {
    const gaugeId = await gaugeWith("kayaking", [GaugeAnswer.IN, GaugeAnswer.IN])
    const outsider = await prisma.user.create({
      data: { name: "[TEST] Promote Outsider", supabaseAuthId: `test-promote-out-${Date.now()}` },
    })
    userIds.push(outsider.id) // registered for afterAll cleanup only; not a member
    await prisma.gaugeVote.create({
      data: { gaugeId, userId: outsider.id, answer: GaugeAnswer.IN },
    })

    const result = await promoteGaugeToEvent(gaugeId, NOW)
    expect(result).toEqual({ status: "skipped", reason: "below_threshold" })
  })

  it("seeds RSVPs for members only when a stray non-member vote exists", async () => {
    const gaugeId = await gaugeWith("bowling", [GaugeAnswer.IN, GaugeAnswer.IN, GaugeAnswer.IN])
    const outsider = await prisma.user.create({
      data: { name: "[TEST] Promote Outsider 2", supabaseAuthId: `test-promote-out2-${Date.now()}` },
    })
    userIds.push(outsider.id)
    await prisma.gaugeVote.create({
      data: { gaugeId, userId: outsider.id, answer: GaugeAnswer.IN },
    })

    const result = await promoteGaugeToEvent(gaugeId, NOW)
    expect(result.status).toBe("created")
    if (result.status !== "created") return
    const rsvps = await prisma.rsvp.findMany({ where: { eventId: result.eventId } })
    expect(rsvps).toHaveLength(3)
    expect(rsvps.some((r) => r.userId === outsider.id)).toBe(false)
  })
```

- [ ] **Step 2: Run the file, watch both fail** (first: event gets created off the outsider's third yes; second: outsider gets an RSVP).

- [ ] **Step 3: Implement in `src/lib/gauges/promote.ts`**

1. Add memberships to the include:

```ts
      group: {
        select: {
          id: true,
          timeZone: true,
          recurringActivities: true,
          memberships: { select: { userId: true } },
        },
      },
```

2. After the `no_gauge` / `already_created` guards, filter before the threshold check:

```ts
  // Current members only, the same rule proposals promote and the endgame
  // sweep already follow: a voter who has since left neither counts nor gets
  // seeded, and removal self-heals with no extra write.
  const memberIds = new Set(gauge.group.memberships.map((m) => m.userId))
  if (!hasReachedThreshold(gauge.votes.filter((v) => memberIds.has(v.userId)))) {
    return { status: "skipped", reason: "below_threshold" }
  }
```

3. Inside the transaction, filter the re-read the same way and use the filtered list for the threshold re-check, the RSVP `createMany`, and `countIn` in the announcement:

```ts
      const votes = (
        await tx.gaugeVote.findMany({
          where: { gaugeId: gauge.id },
          select: { userId: true, answer: true },
        })
      ).filter((v) => memberIds.has(v.userId))
```

(The rest of the transaction body then reads `votes` unchanged.)

- [ ] **Step 4: Run `promote.test.ts` (all cases, old and new) and the full suite. Commit:** "Promotion counts current members only, like every other tally"

---

### Task 6: The remaining write actions refuse non-members

**Files:**
- Modify: `src/app/actions/proposal-vote.ts`
- Modify: `src/app/actions/proposal-answer.ts`
- Modify: `src/app/actions/detect-intent.ts`

**Interfaces:**
- Consumes: `isGroupMember` from Task 1.
- Produces: no new exports. `DetectIntentResult` is extended later (Task 12); this task only adds the membership refusal.

These three actions read the session cookie (`createClient` / `getCurrentUser`), so they cannot run under vitest; the shared helper is covered by Task 1's tests and the wiring is proven in the Task 14 browser walkthrough. This is the plan's known automated-coverage gap, named in the spec.

- [ ] **Step 1: `proposal-vote.ts`** — replace the inline membership lookup (the `prisma.membership.findUnique` block and its comment) with:

```ts
  // Membership, via the shared check every gate now uses. (Historically this
  // was the product's only membership-gated write; the share-readiness slice
  // made it the rule rather than the exception.)
  if (!(await isGroupMember(user.id, proposal.groupId))) {
    return { errors: { general: "Only members can vote on this." } }
  }
```

Add `import { isGroupMember } from "@/lib/auth/membership"` and remove the now-unused parts, keeping `prisma` (still used for the user lookup and upsert).

- [ ] **Step 2: `proposal-answer.ts`** — after the asker-identity guard (`proposal.askerUserId !== user.id`) add:

```ts
  // The asker may have left (or been removed from) the group since asking; a
  // non-member's confirm must not move a plan or open a group question.
  if (!(await isGroupMember(user.id, proposal.groupId))) {
    return { errors: { general: "Only members can answer this one." } }
  }
```

with the matching import.

- [ ] **Step 3: `detect-intent.ts`** — after the `message.authorId !== user.id` guard add:

```ts
    // Membership gate (share-readiness slice): Orbit only acts on members'
    // words. The memberships are already loaded on the message's group.
    if (!message.group.memberships.some((m) => m.userId === user.id)) {
      return { status: "quiet" }
    }
```

- [ ] **Step 4: `npx tsc --noEmit`, full suite green. Commit:** "Every remaining write path refuses a non-member"

---

### Task 7: The members-only wall component

**Files:**
- Create: `src/components/MembersOnlyWall.tsx`
- Test: `src/components/__tests__/MembersOnlyWall.test.tsx`

**Interfaces:**
- Produces: `export default function MembersOnlyWall(): JSX.Element` — no props. Later tasks render `<MembersOnlyWall />` from server components.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import MembersOnlyWall from "../MembersOnlyWall"

describe("MembersOnlyWall", () => {
  it("explains the invite link, names no group, and offers a way onward", () => {
    render(<MembersOnlyWall />)
    expect(screen.getByText("A note from Orbit")).toBeTruthy()
    expect(
      screen.getByText(
        "This group is invite-only. If you know someone in it, ask them for the invite link, it'll bring you right in."
      )
    ).toBeTruthy()
    const link = screen.getByRole("link", { name: "Start your own group" })
    expect(link.getAttribute("href")).toBe("/create")
  })
})
```

- [ ] **Step 2: Run it, watch it fail** (component does not exist).

- [ ] **Step 3: Implement** — copy the bad-invite-token screen's structure from `src/app/join/[inviteToken]/page.tsx` (the `!group` branch) exactly: same `<main>` shell, same eyebrow/note-card/link markup and inline styles. Differences only:
  - Eyebrow text: `Invite only` (instead of `Invite link`).
  - Note body: `This group is invite-only. If you know someone in it, ask them for the invite link, it&apos;ll bring you right in.`
  - Header comment:

```tsx
// src/components/MembersOnlyWall.tsx
//
// The wall a non-member (or a signed-out member) sees in place of any group
// surface. Deliberately reveals nothing about the group: no name, no member
// count, no confirmation beyond the screen itself that the URL is real. The
// "ask for the invite link" line is also the honest way back in for a member
// who lost their session, until email sign-in exists (post-MVP email arc).
//
// A labeled note, not a bubble (CLAUDE.md): there is nothing here to reply to.
// Same treatment and structure as the bad-invite-token screen, deliberately
// not extracted into a shared piece with it: two screens is coincidence, and
// their copy already differs.
```

  The whole component is a server-compatible plain function (no `"use client"`; `Link` from `next/link` works in both).

- [ ] **Step 4: Run the test, expect PASS. Commit:** "Build the wall a stranger meets instead of a group"

---

### Task 8: The three group screens go members-only

**Files:**
- Modify: `src/app/groups/[id]/page.tsx`
- Modify: `src/app/events/[id]/page.tsx`
- Modify: `src/app/groups/[id]/info/page.tsx`
- Modify: `src/app/groups/[id]/GroupHome.tsx` (comment only)

Server-rendered screens are untestable in this suite (standing repo limitation); this task is proven by `npx tsc --noEmit`, the suite staying green, and the Task 14 browser walkthrough.

- [ ] **Step 1: `src/app/groups/[id]/page.tsx`** — add `import MembersOnlyWall from "@/components/MembersOnlyWall"`. Directly after `const viewer = await getCurrentUser()`, add:

```ts
  // Members only (share-readiness slice): the wall replaces every non-member
  // view of this screen. An unknown id stays notFound() above; a real group
  // and a stranger meet the wall, which names nothing about the group.
  const viewerIsMember =
    viewer !== null && group.memberships.some((m) => m.userId === viewer.id)
  if (!viewerIsMember) return <MembersOnlyWall />
```

Delete the now-duplicate `const viewerIsMember = viewer ? memberIds.has(viewer.id) : false` line further down (keep passing `viewerIsMember` into `GroupHome` unchanged). Update the header comment's "Deliberately deferred" list: remove the "Membership gating" line.

- [ ] **Step 2: `src/app/events/[id]/page.tsx`** — same import; after `const viewer = await getCurrentUser()`:

```ts
  // Members only (share-readiness slice): an event page carries the roster's
  // real names and the meeting spot, so it is as private as the feed.
  const isMember =
    viewer !== null && event.group.memberships.some((m) => m.userId === viewer.id)
  if (!isMember) return <MembersOnlyWall />
```

- [ ] **Step 3: `src/app/groups/[id]/info/page.tsx`** — same import; after the existing `isMember` computation:

```ts
  if (!isMember) return <MembersOnlyWall />
```

Update the header comment's visibility table: delete the `non-member` row and the "Viewing stays ungated (standing access-control gap, by design)" sentence; replace with `Viewing is members-only (share-readiness slice); every mutation still re-verifies membership/founder server-side in its own action.`

- [ ] **Step 4: `GroupHome.tsx`** — replace the pinned-input comment block (the one beginning "Pinned input. canPost is ...") with:

```tsx
      {/* Pinned input. The page-level wall means only members ever render
          this screen, and createMessage refuses a non-member server-side
          regardless (a removed member's stale tab still holds a live form).
          canPost still checks the session because a member row without a
          session cannot author anything. */}
```

- [ ] **Step 5: `npx tsc --noEmit`, full suite, `npm run lint`. Commit:** "Group screens are members-only: strangers meet the wall"

---

### Task 9: The calendar file goes members-only

**Files:**
- Modify: `src/app/events/[id]/calendar.ics/route.ts`
- Modify: `src/app/events/[id]/calendar.ics/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `getCurrentUser`, `isGroupMember`.
- Produces: the route returns 403 `"Members only"` for no-session and non-member requests; 404 for unknown events (unchanged); 200 with the file for members.

- [ ] **Step 1: Update the test file** — add the session mock at the top (before other imports use it) and adjust fixtures:

```ts
let mockViewer: { id: string } | null = null
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: () => Promise.resolve(mockViewer),
}))
```

(add `vi` and `beforeEach` to the vitest import; `beforeEach(() => { mockViewer = null })`).

In the existing 200-case: give the founder a membership in the group fixture (`memberships: { create: [{ userId: founder.id }] }`) and set `mockViewer = { id: founder.id }` before calling `GET`. Append two failing cases (inside the same describe, reusing that test's created event by extracting the fixture into a small helper, or building a second fixture the same way):

```ts
  it("refuses a non-member with 403 and no calendar body", async () => {
    // fixture: same group/event as above; outsider user with no membership
    mockViewer = { id: outsider.id }
    const response = await GET(
      new NextRequest(`http://localhost:3000/events/${event.id}/calendar.ics`),
      { params: Promise.resolve({ id: event.id }) }
    )
    expect(response.status).toBe(403)
    expect(await response.text()).not.toContain("BEGIN:VCALENDAR")
  })

  it("refuses a session-less request with 403", async () => {
    mockViewer = null
    const response = await GET(
      new NextRequest(`http://localhost:3000/events/${event.id}/calendar.ics`),
      { params: Promise.resolve({ id: event.id }) }
    )
    expect(response.status).toBe(403)
  })
```

- [ ] **Step 2: Run the file** — the two new cases FAIL (route currently serves anyone); the 200 and 404 cases still pass.

- [ ] **Step 3: Implement in the route** — add imports `getCurrentUser` and `isGroupMember`; after the 404 guard:

```ts
  // Members only (share-readiness slice): the file carries the venue street
  // address. The in-app button tap arrives with the member's own session; a
  // calendar app re-fetching this URL on its own gets refused, a named
  // tradeoff in the spec (the feed announcement stays the correction
  // channel, and the subscribable feed is the registered successor).
  const viewer = await getCurrentUser()
  if (!viewer || !(await isGroupMember(viewer.id, event.groupId))) {
    return new Response("Members only", { status: 403 })
  }
```

Rewrite the header comment's "Public by design ..." sentence to say the endpoint is members-only as of the share-readiness slice, for the address reason above.

- [ ] **Step 4: Run the file and the full suite. Commit:** "The calendar file answers members only"

---

### Task 10: The failure classifier — credits, trouble, or our own bug

**Files:**
- Create: `src/lib/orbit/model-errors.ts`
- Modify: `src/lib/orbit/extract.ts`
- Test: `src/lib/orbit/__tests__/model-errors.test.ts`

**Interfaces:**
- Produces:
  - `export type ModelFailureReason = "credits" | "trouble"`
  - `export class ExtractionError extends Error {}` (moves here from extract.ts)
  - `export class ModelUnavailableError extends ExtractionError { readonly reason: ModelFailureReason }` with constructor `(reason, message)`
  - `export function classifyModelCallError(err: unknown): ExtractionError` (returns, never throws)
  - `extract.ts` re-exports `ExtractionError` and `ModelUnavailableError` so existing importers (scripts, evals) are untouched.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/orbit/__tests__/model-errors.test.ts
//
// Pins the mapping the graceful out-of-credit state depends on. The real
// dry-balance error cannot be triggered without draining the account, so this
// replays the provider's documented error shapes exactly (spec: the honest
// gap, named up front).
import { describe, it, expect } from "vitest"
import Anthropic from "@anthropic-ai/sdk"
import {
  classifyModelCallError,
  ExtractionError,
  ModelUnavailableError,
} from "../model-errors"

const CREDIT_MSG =
  "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."

function apiError(status: number, type: string, message: string) {
  return Anthropic.APIError.generate(
    status,
    { type: "error", error: { type, message } },
    message,
    undefined
  )
}

describe("classifyModelCallError", () => {
  it("maps the dry-balance 400 to credits", () => {
    const out = classifyModelCallError(apiError(400, "invalid_request_error", CREDIT_MSG))
    expect(out).toBeInstanceOf(ModelUnavailableError)
    expect((out as ModelUnavailableError).reason).toBe("credits")
  })

  it("maps outages, overload, rate limits, and key trouble to trouble", () => {
    for (const err of [
      apiError(529, "overloaded_error", "Overloaded"),
      apiError(500, "api_error", "Internal server error"),
      apiError(429, "rate_limit_error", "Rate limited"),
      apiError(401, "authentication_error", "invalid x-api-key"),
      Anthropic.APIError.generate(undefined, undefined, "Connection error.", undefined),
    ]) {
      const out = classifyModelCallError(err)
      expect(out).toBeInstanceOf(ModelUnavailableError)
      expect((out as ModelUnavailableError).reason).toBe("trouble")
    }
  })

  it("keeps our own bad requests and unknown errors generic", () => {
    for (const err of [
      apiError(400, "invalid_request_error", "max_tokens is too large"),
      apiError(422, "invalid_request_error", "unprocessable"),
      new Error("something local blew up"),
    ]) {
      const out = classifyModelCallError(err)
      expect(out).toBeInstanceOf(ExtractionError)
      expect(out).not.toBeInstanceOf(ModelUnavailableError)
    }
  })
})
```

- [ ] **Step 2: Run it, watch it fail** (module does not exist).

- [ ] **Step 3: Implement `src/lib/orbit/model-errors.ts`**

```ts
// src/lib/orbit/model-errors.ts
//
// The one place a failed model call is read (spec decision 5): the reason
// Orbit shows is never false. "credits" only when the provider genuinely
// reports a dry balance; "trouble" for anything where the service, not the
// founder and not our request shape, is the problem; a plain ExtractionError
// for our own malformed requests and local surprises, which keep today's
// generic retry copy.
//
// Client components must import ModelFailureReason with `import type` only:
// this module imports the Anthropic SDK, which must never enter a client
// bundle.

import Anthropic from "@anthropic-ai/sdk"

export type ModelFailureReason = "credits" | "trouble"

/**
 * Thrown for every extraction failure mode. Callers map every throw to a
 * soft-retry state; ModelUnavailableError below is the subtype that carries
 * an honest reason to show instead of the generic copy.
 */
export class ExtractionError extends Error {}

export class ModelUnavailableError extends ExtractionError {
  constructor(
    readonly reason: ModelFailureReason,
    message: string
  ) {
    super(message)
  }
}

const CREDIT_BALANCE_RE = /credit balance is too low/i

export function classifyModelCallError(err: unknown): ExtractionError {
  if (err instanceof Anthropic.APIError) {
    const message = err.message ?? ""
    if (err.status === 400 && CREDIT_BALANCE_RE.test(message)) {
      return new ModelUnavailableError("credits", "provider reports the credit balance is dry")
    }
    if (err.status === 400 || err.status === 422) {
      // Our request was malformed: a bug on our side, not an outage.
      return new ExtractionError(`extraction request failed: ${message}`)
    }
    // Connection failures (status undefined), key trouble (401/403), rate
    // limits (429), overload (529), and server errors are all, from the
    // founder's chair, the service having trouble.
    return new ModelUnavailableError("trouble", `provider unavailable (${err.status ?? "connection"}): ${message}`)
  }
  return new ExtractionError(
    `extraction request failed: ${err instanceof Error ? err.message : String(err)}`
  )
}
```

- [ ] **Step 4: Rewire `src/lib/orbit/extract.ts`**

1. Delete the local `export class ExtractionError extends Error {}` (keep its docstring by moving it onto the class in model-errors.ts, as written above).
2. Add:

```ts
import { ExtractionError, ModelUnavailableError, classifyModelCallError } from "./model-errors"

export { ExtractionError, ModelUnavailableError } from "./model-errors"
export type { ModelFailureReason } from "./model-errors"
```

3. The preflight key check becomes service trouble (a missing key is the service being down, not the founder's fault):

```ts
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ModelUnavailableError("trouble", "ANTHROPIC_API_KEY is not set")
  }
```

4. The API-call catch becomes:

```ts
  } catch (err) {
    throw classifyModelCallError(err)
  }
```

5. The three response-shape failures (`stop_reason`, no text block, bad JSON) stay plain `ExtractionError` exactly as they are.

- [ ] **Step 5: Run the new test file and the full suite (existing importers of `ExtractionError` from extract.ts keep working via the re-export). Commit:** "Teach the model seam to say why it failed: credits, trouble, or our own bug"

---

### Task 11: The approved copy, in one module

**Files:**
- Create: `src/lib/orbit/unavailable-copy.ts`

**Interfaces:**
- Produces: `UNAVAILABLE_COPY: Record<ModelFailureReason, string>` (onboarding) and `CHAT_NOTE_COPY: Record<ModelFailureReason, string>` (the sender-only chat note). Pure strings, no runtime imports beyond the type.

- [ ] **Step 1: Implement** (no test: constants with no logic; the component tests in Tasks 13 and 14 assert them rendered)

```ts
// src/lib/orbit/unavailable-copy.ts
//
// Owner-approved copy for the two honest unavailable flavors (spec: Approved
// copy, 11 Aug 2026). "credits" is shown only when the provider genuinely
// reported a dry balance; "trouble" covers outages, overload, and connection
// failures. Orbit's voice rules apply: plain, warm, no em dashes.

import type { ModelFailureReason } from "./model-errors"

/** Onboarding (step 1 and the follow-up question step): the founder stays on
 * their step with their text preserved; this replaces the generic retry line. */
export const UNAVAILABLE_COPY: Record<ModelFailureReason, string> = {
  credits:
    "I hit a wall: this prototype ran out of the model credits I run on, and they're being topped up. Your description is safe right here. Try again in a little while.",
  trouble:
    "I'm having trouble thinking right now. It's not you, the service I run on is acting up. Give it a minute and try again.",
}

/** The quiet line only the sender sees after their message posted but Orbit
 * could not read it. Nothing is stored; nothing enters the group's history. */
export const CHAT_NOTE_COPY: Record<ModelFailureReason, string> = {
  credits:
    "Your message went through. But heads up: this prototype ran out of model credits, so I might miss ideas until they're topped up.",
  trouble:
    "Your message went through. But heads up: I'm having trouble thinking right now, so I might miss ideas for a few minutes.",
}
```

- [ ] **Step 2: `npx tsc --noEmit`. Commit:** "The out-of-credit copy, approved words in one module"

---

### Task 12: The onboarding actions carry the unavailable state

**Files:**
- Modify: `src/app/actions/extract-group.ts`
- Modify: `src/app/actions/merge-gap.ts`
- Test: Create `src/app/actions/__tests__/extract-group.test.ts`
- Test: Create `src/app/actions/__tests__/merge-gap.test.ts`

**Interfaces:**
- Produces:
  - `ExtractGroupState` gains `| { status: "unavailable"; reason: ModelFailureReason }`
  - `MergeGapResult` gains `| { status: "unavailable"; reason: ModelFailureReason }`
  - both import the type via `import type { ModelFailureReason } from "@/lib/orbit/model-errors"`.

These two actions read no cookies, so they run under vitest with the model call mocked.

- [ ] **Step 1: Write the failing extract test**

```ts
// src/app/actions/__tests__/extract-group.test.ts
import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/orbit/extract", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/orbit/extract")>()
  return { ...mod, extractGroupProfile: vi.fn() }
})

import { extractGroupProfile } from "@/lib/orbit/extract"
import { ExtractionError, ModelUnavailableError } from "@/lib/orbit/model-errors"
import { extractGroupAction } from "../extract-group"

function form(description: string): FormData {
  const f = new FormData()
  f.set("description", description)
  return f
}

describe("extractGroupAction failure states", () => {
  it("maps a dry-balance failure to unavailable/credits", async () => {
    vi.mocked(extractGroupProfile).mockRejectedValueOnce(
      new ModelUnavailableError("credits", "dry")
    )
    const result = await extractGroupAction({ status: "idle" }, form("we climb sundays"))
    expect(result).toEqual({ status: "unavailable", reason: "credits" })
  })

  it("maps an outage to unavailable/trouble", async () => {
    vi.mocked(extractGroupProfile).mockRejectedValueOnce(
      new ModelUnavailableError("trouble", "overloaded")
    )
    const result = await extractGroupAction({ status: "idle" }, form("we climb sundays"))
    expect(result).toEqual({ status: "unavailable", reason: "trouble" })
  })

  it("keeps a plain failure on the generic error state", async () => {
    vi.mocked(extractGroupProfile).mockRejectedValueOnce(
      new ExtractionError("response was not valid JSON")
    )
    const result = await extractGroupAction({ status: "idle" }, form("we climb sundays"))
    expect(result).toEqual({ status: "error" })
  })
})
```

- [ ] **Step 2: Write the failing merge test**

```ts
// src/app/actions/__tests__/merge-gap.test.ts
import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/orbit/merge", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/orbit/merge")>()
  return { ...mod, mergeGapAnswer: vi.fn() }
})

import { mergeGapAnswer } from "@/lib/orbit/merge"
import { ModelUnavailableError } from "@/lib/orbit/model-errors"
import { mergeGapAction } from "../merge-gap"

const GAP_INPUT = {
  description: "we climb on sundays",
  answer: "8am",
  round: 0,
  gap: {
    missing: "time" as const,
    groupName: "Sunday Climbers",
    rhythms: [
      {
        activity: "climbing",
        title: "Climbing",
        cadence: "weekly",
        daysOfWeek: [0],
        timeLocal: null,
        venueName: null,
      },
    ],
    candidateTimeLocal: null,
  },
}

describe("mergeGapAction failure states", () => {
  it("maps a dry-balance failure to unavailable/credits, round not consumed", async () => {
    vi.mocked(mergeGapAnswer).mockRejectedValueOnce(new ModelUnavailableError("credits", "dry"))
    const result = await mergeGapAction(GAP_INPUT)
    expect(result).toEqual({ status: "unavailable", reason: "credits" })
  })

  it("keeps a plain failure on the generic error state", async () => {
    vi.mocked(mergeGapAnswer).mockRejectedValueOnce(new Error("boom"))
    const result = await mergeGapAction(GAP_INPUT)
    expect(result).toEqual({ status: "error" })
  })
})
```

- [ ] **Step 3: Run both, watch the unavailable cases fail** (today they return `{ status: "error" }`). If the merge test's input fails validation before reaching the mocked call (a `{ status: "error" }` for the wrong reason), fix the fixture against `parseStoredRhythms` in `src/lib/orbit/rhythm.ts` rather than loosening the assertion — the generic case must fail through the *catch*, which the credits case proves by expecting a different status.

- [ ] **Step 4: Implement** — in `extract-group.ts`, extend the state union and the catch:

```ts
export type ExtractGroupState =
  | { status: "idle" }
  | { status: "error" }
  | { status: "unavailable"; reason: ModelFailureReason }
  | { status: "unusable" }
  | { status: "incomplete"; gap: GapPayload }
  | { status: "ready"; profile: { groupName: string; rhythms: StoredRhythm[] } }
```

```ts
  } catch (err) {
    if (err instanceof ModelUnavailableError) {
      // The service, not the founder: honest reason, same soft-retry contract.
      console.error("[onboarding] extraction unavailable:", err)
      return { status: "unavailable", reason: err.reason }
    }
    // Every other extraction failure is the same soft-retry state: the
    // founder stays on Step 1 with their text intact.
    console.error("[onboarding] extraction failed:", err)
    return { status: "error" }
  }
```

with imports `import { ModelUnavailableError } from "@/lib/orbit/model-errors"` and `import type { ModelFailureReason } from "@/lib/orbit/model-errors"`. Mirror the same two changes in `merge-gap.ts` (union member on `MergeGapResult`, same catch shape logging `[onboarding] gap merge unavailable:`).

- [ ] **Step 5: Run both test files and the full suite. Commit:** "Onboarding's actions tell an outage apart from a bad answer"

---

### Task 13: Onboarding shows the honest copy

**Files:**
- Modify: `src/app/create/Step1Describe.tsx`
- Modify: `src/app/create/StepGapAsk.tsx`
- Modify: `src/app/create/OnboardingWizard.tsx`
- Test: Create `src/app/create/__tests__/Step1DescribeUnavailable.test.tsx`

**Interfaces:**
- Consumes: `UNAVAILABLE_COPY` from Task 11; the extended action states from Task 12.
- Produces: `StepGapAsk`'s `mergeError` prop changes from `boolean` to `MergeErrorKind | null`, where `export type MergeErrorKind = "generic" | ModelFailureReason` is exported from `StepGapAsk.tsx`.

- [ ] **Step 1: Write the failing component test**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import Step1Describe from "../Step1Describe"
import { UNAVAILABLE_COPY } from "@/lib/orbit/unavailable-copy"

vi.mock("next/link", () => ({
  default: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))

function renderWithState(extractState: Parameters<typeof Step1Describe>[0]["extractState"]) {
  render(
    <Step1Describe
      founderName="Taylor"
      onFounderNameChange={() => {}}
      description="we climb sundays"
      onDescriptionChange={() => {}}
      formAction={() => {}}
      isExtracting={false}
      extractState={extractState}
    />
  )
}

describe("Step1Describe unavailable states", () => {
  it("shows the credits copy when the balance is dry", () => {
    renderWithState({ status: "unavailable", reason: "credits" })
    expect(screen.getByText(UNAVAILABLE_COPY.credits)).toBeTruthy()
  })

  it("shows the trouble copy for an outage", () => {
    renderWithState({ status: "unavailable", reason: "trouble" })
    expect(screen.getByText(UNAVAILABLE_COPY.trouble)).toBeTruthy()
  })
})
```

(If the existing `Step3Share.test.tsx` renders `next/link` without a mock, drop the mock here too — match whatever that file needed.)

- [ ] **Step 2: Run it, watch it fail** (the bubble shows INTRO_COPY: the `unavailable` status falls through to the idle branch).

- [ ] **Step 3: Implement `Step1Describe.tsx`** — add `import { UNAVAILABLE_COPY } from "@/lib/orbit/unavailable-copy"` and extend the `bubbleCopy` chain:

```ts
  const bubbleCopy =
    bubbleOverride ??
    (extractState.status === "incomplete"
      ? REASK_COPY[extractState.gap.missing]
      : extractState.status === "unusable"
        ? REASK_COPY.nothing_schedulable
        : extractState.status === "unavailable"
          ? UNAVAILABLE_COPY[extractState.reason]
          : extractState.status === "error"
            ? ERROR_COPY
            : INTRO_COPY)
```

- [ ] **Step 4: Implement `StepGapAsk.tsx`** — add near the top:

```ts
import { UNAVAILABLE_COPY } from "@/lib/orbit/unavailable-copy"
import type { ModelFailureReason } from "@/lib/orbit/model-errors"

/** Which flavor of failure the last merge attempt hit. "generic" keeps the
 * old one-size retry line; the other two carry the honest reason. */
export type MergeErrorKind = "generic" | ModelFailureReason
```

Change the prop `mergeError: boolean` to `mergeError: MergeErrorKind | null`, and the render:

```tsx
      {mergeError && (
        <p
          style={{
            fontSize: "var(--type-meta)",
            lineHeight: "var(--leading-normal)",
            color: "#f87171",
            marginBottom: "0.75rem",
          }}
        >
          {mergeError === "generic" ? MERGE_ERROR_COPY : UNAVAILABLE_COPY[mergeError]}
        </p>
      )}
```

- [ ] **Step 5: Implement `OnboardingWizard.tsx`** — change the state and its writes:

```ts
  const [mergeError, setMergeError] = useState<MergeErrorKind | null>(null)
```

(import `type MergeErrorKind` from `./StepGapAsk`). Replace `setMergeError(false)` with `setMergeError(null)` (both occurrences: the extraction-routing branch and the top of `handleAnswerSubmit`), and the merge-result handling becomes:

```ts
      if (result.status === "error") {
        // Soft retry: draft preserved, round not consumed.
        setMergeError("generic")
        return
      }
      if (result.status === "unavailable") {
        // Same contract, honest reason (credits or trouble).
        setMergeError(result.reason)
        return
      }
```

- [ ] **Step 6: Run the new test, the whole `src/app/create` test set, `npx tsc --noEmit`, and the full suite. Commit:** "Onboarding says out loud when the prototype is out of credits"

---

### Task 14: Chat's quiet note to the sender

**Files:**
- Modify: `src/app/actions/detect-intent.ts`
- Create: `src/app/groups/[id]/OrbitDownNote.tsx`
- Modify: `src/app/groups/[id]/GroupHome.tsx`
- Test: Create `src/app/groups/[id]/__tests__/OrbitDownNote.test.tsx`

**Interfaces:**
- Produces:
  - `DetectIntentResult` becomes `{ status: "gauged" | "changed" | "asked" | "replied" | "quiet" } | { status: "unavailable"; reason: ModelFailureReason }`
  - `OrbitDownNote({ reason }: { reason: ModelFailureReason })` renders the `CHAT_NOTE_COPY` line with `role="status"`.

- [ ] **Step 1: Write the failing component test**

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import OrbitDownNote from "../OrbitDownNote"
import { CHAT_NOTE_COPY } from "@/lib/orbit/unavailable-copy"

describe("OrbitDownNote", () => {
  it("tells the sender about dry credits, as a status line", () => {
    render(<OrbitDownNote reason="credits" />)
    const note = screen.getByRole("status")
    expect(note.textContent).toBe(CHAT_NOTE_COPY.credits)
  })

  it("tells the sender about service trouble", () => {
    render(<OrbitDownNote reason="trouble" />)
    expect(screen.getByRole("status").textContent).toBe(CHAT_NOTE_COPY.trouble)
  })
})
```

- [ ] **Step 2: Run it, watch it fail. Then implement the component:**

```tsx
// src/app/groups/[id]/OrbitDownNote.tsx
//
// The quiet line only the sender sees when their message posted but Orbit
// could not read it (spec decision 7). Not a bubble (nothing to reply to),
// not an error color (the send succeeded), nothing stored: it lives in the
// sender's own client state and vanishes on reload, which matches what it
// describes, a service condition rather than a fact about the group.

import { CHAT_NOTE_COPY } from "@/lib/orbit/unavailable-copy"
import type { ModelFailureReason } from "@/lib/orbit/model-errors"

export default function OrbitDownNote({ reason }: { reason: ModelFailureReason }) {
  return (
    <p
      role="status"
      style={{
        fontSize: "var(--type-meta)",
        lineHeight: "var(--leading-normal)",
        color: "var(--text-secondary)",
        textAlign: "center",
        margin: "0 1rem 0.5rem",
      }}
    >
      {CHAT_NOTE_COPY[reason]}
    </p>
  )
}
```

- [ ] **Step 3: Extend `detect-intent.ts`** — change the result type:

```ts
export type DetectIntentResult =
  | { status: "gauged" | "changed" | "asked" | "replied" | "quiet" }
  | { status: "unavailable"; reason: ModelFailureReason }
```

(imports: `import { ModelUnavailableError } from "@/lib/orbit/model-errors"` and `import type { ModelFailureReason } from "@/lib/orbit/model-errors"`). In the action's outer catch, before the generic branch:

```ts
  } catch (err) {
    if (err instanceof ModelUnavailableError) {
      // The one failure the sender is told about: their message stands, and
      // Orbit says honestly why it might miss things (spec decisions 5-7).
      console.error("[detect-intent] model unavailable:", err)
      return { status: "unavailable", reason: err.reason }
    }
    // Soft by design: the member's message stands, and nothing is said.
    console.error("[detect-intent] detection failed", err)
    return { status: "quiet" }
  }
```

- [ ] **Step 4: Wire `GroupHome.tsx`** — add imports:

```ts
import OrbitDownNote from "./OrbitDownNote"
import type { ModelFailureReason } from "@/lib/orbit/model-errors"
```

state:

```ts
  const [orbitDown, setOrbitDown] = useState<ModelFailureReason | null>(null)
```

the detection transition becomes:

```ts
        startDetection(async () => {
          // The action is soft on the server; this catch covers the trip
          // itself. Going offline in the beat after sending must leave the
          // message standing, not surface an error boundary.
          const result = await detectIntentAction(messageId).catch(() => null)
          // The one thing the sender is told: Orbit could not read the
          // message (credits or trouble). Any successful detection clears a
          // stale note; a repeat failure keeps it current.
          if (result?.status === "unavailable") setOrbitDown(result.reason)
          else if (result) setOrbitDown(null)
        })
```

and the render gains the note directly above the input:

```tsx
      {canPost && (
        <>
          {orbitDown && <OrbitDownNote reason={orbitDown} />}
          <ChatInput
            groupId={groupId}
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleSubmit}
            isPending={isPending}
            errorMsg={errorMsg}
          />
        </>
      )}
```

- [ ] **Step 5: Run the component test, `npx tsc --noEmit`, full suite, `npm run lint`. Commit:** "The sender hears why Orbit went quiet, and nobody else has to"

---

### Task 15: Full verification

**Files:** none created; evidence gathered for the §11 entry and the PR.

- [ ] **Step 1:** `npm run db:which` (must print `pxbewardwvoyqqcvogel`), then the full suite: expect 62 + 8 new files, all green, zero skipped (record the exact numbers). `npx tsc --noEmit` clean; `npm run lint` carrying only the pre-existing `OnboardingWizard.tsx` setState-in-effect error recorded at earlier baselines, nothing new.
- [ ] **Step 2: Browser walkthrough on the dev-test database** (dev server + two browsers, one signed in as a member of a seeded group, one fresh/stranger session). Prove and screenshot:
  1. Stranger on `/groups/[id]`, `/events/[id]`, `/groups/[id]/info`: the wall, no group name anywhere.
  2. Stranger fetching `/events/[id]/calendar.ics`: 403.
  3. Member: group home, event page, info page, and the calendar button all unchanged end to end.
  4. Leave the group in one browser; refresh the group home: the wall appears.
  5. Bad group id still 404s to the branded not-found screen (wall is for real groups only).
- [ ] **Step 3: Unavailable flavors, live** — stop the dev server, set `ANTHROPIC_API_KEY` to an invalid value in the shell (never edit `.env`), restart: (a) onboarding step 1 submit shows the trouble copy with the founder's text preserved and Continue re-enabled; (b) a member's chat message posts and the trouble note appears under the input for the sender only (verify the second browser sees nothing). Restore the real key, confirm both paths work again. The credits flavor is pinned by Task 10/12/13/14 tests, not reproduced live (the spec's named gap).
- [ ] **Step 4:** The recognition bench is deliberately not run: no prompt changed and no model call was added or widened (spec decision 9; the intent prompt, extraction prompt, and merge prompt are byte-identical this slice — verify with `git diff main -- src/lib/orbit/spark.ts src/lib/orbit/extract.ts src/lib/orbit/merge.ts` showing no prompt-string changes).

---

### Task 16: Records, then the PR

- [ ] **Step 1: build-notes §11 entry** ("Share-readiness hardening", extending the slice-start stub): decisions applied from the spec, the premise corrections already recorded there, baseline 62/752 and the after numbers, the walkthrough evidence from Task 15, the named credits-not-reproduced-live gap, debt carried (lost-session wall, calendar re-fetch refusal, sender-only disclosure), and: no migration, no new env var, no new model call, nothing added to the pre-deploy checklist (checklist item 9's "face of that downtime" note is now satisfied).
- [ ] **Step 2: CLAUDE.md** — rewrite the "Where the build is" section for the slice boundary (share-readiness shipped; next per the register: the strip-versus-carousel call, then the polish slices). Rewrite the identity-section known-gap bullet (its 11 Aug amendment already says to): the three group surfaces and the calendar file are members-only; what remains at the access-control register item is anything beyond the wall. Update the register's §8 access-control item with a dated strikethrough-style note that the write-gating AND view-gating halves shipped in this slice.
- [ ] **Step 3: README** — fix the non-member paragraph (the claim that anyone with a URL can read and act; `grep -n "member" README.md` to find it) to describe the wall.
- [ ] **Step 4:** Invoke `superpowers:requesting-code-review` for the independent read-only whole-branch review; fix or consciously defer findings; record what it found in the PR body per the user-level rules.
- [ ] **Step 5:** Invoke `superpowers:finishing-a-development-branch`; open the PR (never merge). PR body: product summary, before/after suite numbers, review report, open questions, and the manual QA script per `~/.claude/checklists/pr-handoff.md` (seeded state, running server, clickable links: member session, stranger session, the wall, the 403, the trouble flavor with the broken-key recipe). Announce in chat with the same QA script.

## Automated-coverage gaps, named (for the PR body)

- The three cookie-reading actions (proposal-vote, proposal-answer, detect-intent) and the three screen walls cannot run under vitest; their gating is proven by the shared tested helper plus the Task 15 browser walkthrough.
- The credits flavor is never reproduced against the live provider; its trigger is pinned by replaying the SDK's documented error shape (Task 10) and its screens by component tests (Tasks 13-14).
