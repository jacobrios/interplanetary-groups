# Group-Info Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grow `/groups/[id]/info` from the invite-link stub into the full group-info page: identity block, member list, rhythm rows with venues, member-visible invite link with share, Leave group, and the founder powers (remove member, reset invite link).

**Architecture:** One server-rendered page (single Prisma read), four small client islands for the mutating controls (share, leave confirm, manage members, reset confirm), three new lib functions carrying the write logic (leave, remove, reset), three thin server actions wrapping them. No schema change, no migration, no model calls.

**Tech Stack:** Next.js 16 (App Router, server actions), Prisma 7, Vitest (node env for lib tests against dev-test DB, jsdom per-file for component tests), inline styles on CSS custom-property tokens.

**Spec:** `docs/superpowers/specs/2026-08-10-group-info-page-design.md` — the fourteen settled decisions there are do-not-relitigate. Read it before starting.

## Global Constraints

- Work in place on `feat/group-info-page`. No worktrees (standing user-level rule).
- No em dashes or en dashes anywhere: not in Orbit-voice copy, not in code comments, not in commit messages. Commas, periods, parentheses.
- Type tokens only, from `src/app/globals.css`: `--type-display|title|heading|body|meta|label|eyebrow`, `--leading-tight|normal`. Nothing below `--type-eyebrow` (13px floor). The handoff's raw pixel sizes yield to these tokens (spec decision 1).
- Teal (`--color-teal`) is the single primary action per element; lime (`--color-lime`) is Orbit/group brand and never a button. The share button is teal. The emblem is lime.
- Card recipe: `backgroundColor: var(--surface-card)`, `border: 1px solid var(--border-subtle)`, `borderRadius: "0.75rem"`, `padding: "1.25rem"`.
- Names only, never emails, anywhere in the UI.
- Layout grows with content: min-height plus padding, no fixed heights, buttons stack when needed.
- Server actions: `"use server"` line 2, `xxxAction(_prevState, formData)` returning `{ errors?: { general?: string } }`, session re-resolved via `createClient()` + `supabase.auth.getUser()`, `revalidatePath` (and any `redirect`) called OUTSIDE and AFTER try/catch (Next uses internal throws; a catch would swallow them).
- DB tests follow `src/lib/groups/__tests__/join.test.ts` conventions exactly: `[TEST]` name prefix, `` `test-…-${Date.now()}` `` supabaseAuthIds, id-tracking arrays, `afterAll` deleting groups before users (Group.founderId is Restrict), each delete `.catch(() => {})`, then `prisma.$disconnect()`. Tests build their own fixtures; the suite must stay green from an empty database.
- Component tests: `// @vitest-environment jsdom` pragma on line 1, explicit vitest imports (globals are off), manual `afterEach(cleanup)`, server actions replaced with `vi.mock`, no `@testing-library/jest-dom` matchers.
- Vitest runs the whole suite in ~90s against the remote dev-test DB; per-file `npx vitest run <path>` is the fast loop.
- Baseline before this plan's first code: 47 files, 692 tests, all green (recorded in build-notes §11). The PR reports before and after.

## File Structure

Create:
- `src/lib/groups/initials.ts` + `src/lib/groups/__tests__/initials.test.ts` — pure emblem-initials helper.
- `src/lib/groups/leave.ts` + `src/lib/groups/__tests__/leave.test.ts` — leave-group write.
- `src/lib/groups/remove-member.ts` + `src/lib/groups/__tests__/remove-member.test.ts` — founder removes a member.
- `src/lib/groups/reset-invite.ts` + `src/lib/groups/__tests__/reset-invite.test.ts` — founder rotates the invite token.
- `src/app/actions/leave-group.ts`, `src/app/actions/remove-member.ts`, `src/app/actions/reset-invite-link.ts` — thin action wrappers.
- `src/app/groups/[id]/info/ShareInviteLink.tsx` + `src/app/groups/[id]/info/__tests__/ShareInviteLink.test.tsx`
- `src/app/groups/[id]/info/LeaveGroupButton.tsx` + `src/app/groups/[id]/info/__tests__/LeaveGroupButton.test.tsx`
- `src/app/groups/[id]/info/ManageMembers.tsx` + `src/app/groups/[id]/info/__tests__/ManageMembers.test.tsx`
- `src/app/groups/[id]/info/ResetInviteLink.tsx` + `src/app/groups/[id]/info/__tests__/ResetInviteLink.test.tsx`
- `scripts/qa-stage-groupinfo.ts` — QA fleshing script (not collected by Vitest; not wired into package.json).

Modify:
- `src/app/groups/[id]/info/page.tsx` — full rewrite of the render, same route.

Delete:
- `src/app/groups/[id]/CopyInviteLink.tsx` — its only consumer is the info page; `ShareInviteLink` absorbs its copy-fallback behavior (prefer extraction over duplicate-and-flag).

Also modify at the end: `docs/build-notes.md` (§11 completion entry), `CLAUDE.md` ("Where the build is").

---

### Task 1: Emblem initials helper

**Files:**
- Create: `src/lib/groups/initials.ts`
- Test: `src/lib/groups/__tests__/initials.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `groupInitials(name: string): string` — used by Task 9's page.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest"
import { groupInitials } from "../initials"

describe("groupInitials", () => {
  it("uses the first letters of the first two words", () => {
    expect(groupInitials("Climbing Crew")).toBe("CC")
  })

  it("uppercases", () => {
    expect(groupInitials("climbing crew")).toBe("CC")
  })

  it("uses the first two letters of a one-word name", () => {
    expect(groupInitials("badminton")).toBe("BA")
  })

  it("ignores extra words beyond the first two", () => {
    expect(groupInitials("The Sunday Morning Runners")).toBe("TS")
  })

  it("handles a single-character name", () => {
    expect(groupInitials("x")).toBe("X")
  })

  it("collapses stray whitespace", () => {
    expect(groupInitials("  Climbing   Crew  ")).toBe("CC")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/groups/__tests__/initials.test.ts`
Expected: FAIL, cannot resolve `../initials`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/groups/initials.ts
//
// The group emblem's initials, derived deterministically from the group name
// at render time. Never stored, never model-generated (spec decision 11):
// regenerating a stored value is the drift failure the "carry, don't
// regenerate" guardrail exists for, and this value is cheap enough to derive
// that storing it would only create a second copy to fall out of sync.

/**
 * First letters of the first two words, uppercased ("Climbing Crew" -> "CC").
 * A one-word name uses its first two letters ("badminton" -> "BA"); a
 * one-character name is just that character uppercased.
 */
export function groupInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase()
  }
  const only = words[0] ?? ""
  return only.slice(0, 2).toUpperCase()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/groups/__tests__/initials.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/groups/initials.ts src/lib/groups/__tests__/initials.test.ts
git commit -m "Derive the group emblem's initials deterministically"
```

---

### Task 2: Leave-group write

**Files:**
- Create: `src/lib/groups/leave.ts`
- Test: `src/lib/groups/__tests__/leave.test.ts`

**Interfaces:**
- Consumes: `prisma` from `@/lib/prisma`.
- Produces: `leaveGroup({ supabaseAuthId, groupId }): Promise<void>`, throwing `Error` with message `"NO_USER"`, `"GROUP_NOT_FOUND"`, `"FOUNDER_CANNOT_LEAVE"`, or `"NOT_A_MEMBER"`. Task 5's `leaveGroupAction` maps these to copy.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { leaveGroup } from "../leave"

describe("leaveGroup", () => {
  const groupIds: string[] = []
  const userIds: string[] = []

  afterAll(async () => {
    // Delete groups first (Group.founderId is Restrict)
    for (const id of groupIds) {
      await prisma.group.delete({ where: { id } }).catch(() => {})
    }
    for (const id of userIds) {
      await prisma.user.delete({ where: { id } }).catch(() => {})
    }
    await prisma.$disconnect()
  })

  async function makeGroupWithMember() {
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const founder = await prisma.user.create({
      data: { name: "[TEST] Leave Founder", supabaseAuthId: `test-leave-founder-${stamp}` },
    })
    const member = await prisma.user.create({
      data: { name: "[TEST] Leave Member", supabaseAuthId: `test-leave-member-${stamp}` },
    })
    const group = await prisma.group.create({
      data: {
        name: "[TEST] Leave Group",
        founderId: founder.id,
        memberships: { create: [{ userId: founder.id }, { userId: member.id }] },
      },
    })
    groupIds.push(group.id)
    userIds.push(founder.id, member.id)
    return { founder, member, group }
  }

  it("deletes exactly the caller's membership and nothing else", async () => {
    const { founder, member, group } = await makeGroupWithMember()

    await leaveGroup({ supabaseAuthId: member.supabaseAuthId, groupId: group.id })

    const gone = await prisma.membership.findUnique({
      where: { userId_groupId: { userId: member.id, groupId: group.id } },
    })
    expect(gone).toBeNull()

    // The founder's membership is untouched
    const founderRow = await prisma.membership.findUnique({
      where: { userId_groupId: { userId: founder.id, groupId: group.id } },
    })
    expect(founderRow).not.toBeNull()

    // The member's User row survives (leaving is not account deletion)
    const user = await prisma.user.findUnique({ where: { id: member.id } })
    expect(user).not.toBeNull()
  })

  it("leaves the member's history behind: an RSVP row survives the leave", async () => {
    const { member, group } = await makeGroupWithMember()
    const event = await prisma.event.create({
      data: { groupId: group.id, title: "[TEST] Climb", startsAt: new Date("2099-06-10T12:00:00Z") },
    })
    await prisma.rsvp.create({ data: { eventId: event.id, userId: member.id, status: "IN" } })

    await leaveGroup({ supabaseAuthId: member.supabaseAuthId, groupId: group.id })

    const rsvp = await prisma.rsvp.findUnique({
      where: { eventId_userId: { eventId: event.id, userId: member.id } },
    })
    expect(rsvp).not.toBeNull()
  })

  it("rejects the founder", async () => {
    const { founder, group } = await makeGroupWithMember()
    await expect(
      leaveGroup({ supabaseAuthId: founder.supabaseAuthId, groupId: group.id })
    ).rejects.toThrow("FOUNDER_CANNOT_LEAVE")
    const still = await prisma.membership.findUnique({
      where: { userId_groupId: { userId: founder.id, groupId: group.id } },
    })
    expect(still).not.toBeNull()
  })

  it("rejects a non-member", async () => {
    const { group } = await makeGroupWithMember()
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const outsider = await prisma.user.create({
      data: { name: "[TEST] Leave Outsider", supabaseAuthId: `test-leave-outsider-${stamp}` },
    })
    userIds.push(outsider.id)
    await expect(
      leaveGroup({ supabaseAuthId: outsider.supabaseAuthId, groupId: group.id })
    ).rejects.toThrow("NOT_A_MEMBER")
  })

  it("rejects an unknown session", async () => {
    const { group } = await makeGroupWithMember()
    await expect(
      leaveGroup({ supabaseAuthId: `test-leave-nobody-${Date.now()}`, groupId: group.id })
    ).rejects.toThrow("NO_USER")
  })

  it("rejects an unknown group", async () => {
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const user = await prisma.user.create({
      data: { name: "[TEST] Leave NoGroup", supabaseAuthId: `test-leave-nogroup-${stamp}` },
    })
    userIds.push(user.id)
    await expect(
      leaveGroup({ supabaseAuthId: user.supabaseAuthId, groupId: "no-such-group-id" })
    ).rejects.toThrow("GROUP_NOT_FOUND")
  })
})
```

Note the RSVP compound key: `Rsvp` has `@@unique([eventId, userId])`, Prisma name `eventId_userId`. If the first run errors on that key name, check `prisma/schema.prisma`'s Rsvp model and use the generated name it shows.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/groups/__tests__/leave.test.ts`
Expected: FAIL, cannot resolve `../leave`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/groups/leave.ts
import { prisma } from "@/lib/prisma"

interface LeaveInput {
  supabaseAuthId: string
  groupId: string
}

/**
 * A member leaves a group: one membership-row delete, nothing else touched.
 *
 * The product self-heals around the delete (spec decision 7): every tally,
 * roster, and consensus bar already filters to current members, and the
 * departed member's history (messages, RSVPs) stays visible on purpose.
 *
 * The founder cannot leave (spec decision 3): a founder-less group would
 * strand the founder powers, and a real exit story (transfer or dissolve)
 * is its own future slice. The UI never shows the founder a Leave button;
 * this guard is the server-side backstop.
 *
 * Runs in a transaction so the guards and the delete read one consistent
 * snapshot; the caller (the action) maps thrown codes to user copy.
 */
export async function leaveGroup({ supabaseAuthId, groupId }: LeaveInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { supabaseAuthId } })
    if (!user) throw new Error("NO_USER")

    const group = await tx.group.findUnique({ where: { id: groupId } })
    if (!group) throw new Error("GROUP_NOT_FOUND")

    if (group.founderId === user.id) throw new Error("FOUNDER_CANNOT_LEAVE")

    const membership = await tx.membership.findUnique({
      where: { userId_groupId: { userId: user.id, groupId } },
    })
    if (!membership) throw new Error("NOT_A_MEMBER")

    await tx.membership.delete({ where: { id: membership.id } })
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/groups/__tests__/leave.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/groups/leave.ts src/lib/groups/__tests__/leave.test.ts
git commit -m "Let a member leave a group with one self-healing row delete"
```

---

### Task 3: Remove-member write

**Files:**
- Create: `src/lib/groups/remove-member.ts`
- Test: `src/lib/groups/__tests__/remove-member.test.ts`

**Interfaces:**
- Consumes: `prisma` from `@/lib/prisma`.
- Produces: `removeMember({ supabaseAuthId, groupId, targetUserId }): Promise<void>`, throwing `"NO_USER"`, `"GROUP_NOT_FOUND"`, `"NOT_FOUNDER"`, `"CANNOT_REMOVE_FOUNDER"`, or `"TARGET_NOT_MEMBER"`. Task 5's `removeMemberAction` maps these to copy.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { removeMember } from "../remove-member"

describe("removeMember", () => {
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

  async function makeGroup() {
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const founder = await prisma.user.create({
      data: { name: "[TEST] Remove Founder", supabaseAuthId: `test-remove-founder-${stamp}` },
    })
    const member = await prisma.user.create({
      data: { name: "[TEST] Remove Member", supabaseAuthId: `test-remove-member-${stamp}` },
    })
    const group = await prisma.group.create({
      data: {
        name: "[TEST] Remove Group",
        founderId: founder.id,
        memberships: { create: [{ userId: founder.id }, { userId: member.id }] },
      },
    })
    groupIds.push(group.id)
    userIds.push(founder.id, member.id)
    return { founder, member, group }
  }

  it("lets the founder remove a member, deleting exactly that membership", async () => {
    const { founder, member, group } = await makeGroup()

    await removeMember({
      supabaseAuthId: founder.supabaseAuthId,
      groupId: group.id,
      targetUserId: member.id,
    })

    const gone = await prisma.membership.findUnique({
      where: { userId_groupId: { userId: member.id, groupId: group.id } },
    })
    expect(gone).toBeNull()

    // Founder membership untouched; removed user's User row survives
    const founderRow = await prisma.membership.findUnique({
      where: { userId_groupId: { userId: founder.id, groupId: group.id } },
    })
    expect(founderRow).not.toBeNull()
    expect(await prisma.user.findUnique({ where: { id: member.id } })).not.toBeNull()
  })

  it("rejects a non-founder caller", async () => {
    const { member, group } = await makeGroup()
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const second = await prisma.user.create({
      data: { name: "[TEST] Remove Second", supabaseAuthId: `test-remove-second-${stamp}` },
    })
    userIds.push(second.id)
    await prisma.membership.create({ data: { userId: second.id, groupId: group.id } })

    await expect(
      removeMember({
        supabaseAuthId: second.supabaseAuthId,
        groupId: group.id,
        targetUserId: member.id,
      })
    ).rejects.toThrow("NOT_FOUNDER")

    // Target untouched
    const still = await prisma.membership.findUnique({
      where: { userId_groupId: { userId: member.id, groupId: group.id } },
    })
    expect(still).not.toBeNull()
  })

  it("rejects removing the founder", async () => {
    const { founder, group } = await makeGroup()
    await expect(
      removeMember({
        supabaseAuthId: founder.supabaseAuthId,
        groupId: group.id,
        targetUserId: founder.id,
      })
    ).rejects.toThrow("CANNOT_REMOVE_FOUNDER")
  })

  it("rejects a target who is not a member", async () => {
    const { founder, group } = await makeGroup()
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const outsider = await prisma.user.create({
      data: { name: "[TEST] Remove Outsider", supabaseAuthId: `test-remove-outsider-${stamp}` },
    })
    userIds.push(outsider.id)
    await expect(
      removeMember({
        supabaseAuthId: founder.supabaseAuthId,
        groupId: group.id,
        targetUserId: outsider.id,
      })
    ).rejects.toThrow("TARGET_NOT_MEMBER")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/groups/__tests__/remove-member.test.ts`
Expected: FAIL, cannot resolve `../remove-member`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/groups/remove-member.ts
import { prisma } from "@/lib/prisma"

interface RemoveMemberInput {
  supabaseAuthId: string // the caller's session; must resolve to the founder
  groupId: string
  targetUserId: string
}

/**
 * The founder removes a member: one membership-row delete (spec decision 7,
 * same self-healing shape as leaveGroup). The caller is re-resolved from the
 * session and checked against founderId server-side; client identity is
 * never trusted (spec decision 6).
 *
 * Removal is not a lock (spec decision 8): the removed member's history
 * stays, and until the access-control slice they can still view the group.
 * Remove-then-reset is the designed keep-them-out path (spec decision 9).
 */
export async function removeMember({
  supabaseAuthId,
  groupId,
  targetUserId,
}: RemoveMemberInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const caller = await tx.user.findUnique({ where: { supabaseAuthId } })
    if (!caller) throw new Error("NO_USER")

    const group = await tx.group.findUnique({ where: { id: groupId } })
    if (!group) throw new Error("GROUP_NOT_FOUND")

    if (group.founderId !== caller.id) throw new Error("NOT_FOUNDER")
    if (targetUserId === group.founderId) throw new Error("CANNOT_REMOVE_FOUNDER")

    const membership = await tx.membership.findUnique({
      where: { userId_groupId: { userId: targetUserId, groupId } },
    })
    if (!membership) throw new Error("TARGET_NOT_MEMBER")

    await tx.membership.delete({ where: { id: membership.id } })
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/groups/__tests__/remove-member.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/groups/remove-member.ts src/lib/groups/__tests__/remove-member.test.ts
git commit -m "Let the founder remove a member server-side"
```

---

### Task 4: Reset-invite-token write

**Files:**
- Create: `src/lib/groups/reset-invite.ts`
- Test: `src/lib/groups/__tests__/reset-invite.test.ts`

**Interfaces:**
- Consumes: `prisma` from `@/lib/prisma`; Node's built-in `crypto.randomUUID()`.
- Produces: `resetInviteToken({ supabaseAuthId, groupId }): Promise<string>` returning the new token, throwing `"NO_USER"`, `"GROUP_NOT_FOUND"`, or `"NOT_FOUNDER"`. Task 5's `resetInviteLinkAction` maps these.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { resetInviteToken } from "../reset-invite"

describe("resetInviteToken", () => {
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

  async function makeGroup() {
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const founder = await prisma.user.create({
      data: { name: "[TEST] Reset Founder", supabaseAuthId: `test-reset-founder-${stamp}` },
    })
    const group = await prisma.group.create({
      data: {
        name: "[TEST] Reset Group",
        founderId: founder.id,
        memberships: { create: [{ userId: founder.id }] },
      },
    })
    groupIds.push(group.id)
    userIds.push(founder.id)
    return { founder, group }
  }

  it("rotates the token: old value gone, new value resolves, group id unchanged", async () => {
    const { founder, group } = await makeGroup()
    const oldToken = group.inviteToken

    const newToken = await resetInviteToken({
      supabaseAuthId: founder.supabaseAuthId,
      groupId: group.id,
    })

    expect(newToken).not.toBe(oldToken)
    expect(newToken.length).toBeGreaterThan(10)

    // The old token no longer resolves to any group
    expect(await prisma.group.findUnique({ where: { inviteToken: oldToken } })).toBeNull()

    // The new token resolves to the same group
    const byNew = await prisma.group.findUnique({ where: { inviteToken: newToken } })
    expect(byNew?.id).toBe(group.id)
  })

  it("rejects a non-founder", async () => {
    const { group } = await makeGroup()
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const member = await prisma.user.create({
      data: { name: "[TEST] Reset Member", supabaseAuthId: `test-reset-member-${stamp}` },
    })
    userIds.push(member.id)
    await prisma.membership.create({ data: { userId: member.id, groupId: group.id } })

    const before = group.inviteToken
    await expect(
      resetInviteToken({ supabaseAuthId: member.supabaseAuthId, groupId: group.id })
    ).rejects.toThrow("NOT_FOUNDER")

    // Token untouched
    const after = await prisma.group.findUnique({ where: { id: group.id } })
    expect(after?.inviteToken).toBe(before)
  })

  it("rejects an unknown group", async () => {
    const { founder } = await makeGroup()
    await expect(
      resetInviteToken({ supabaseAuthId: founder.supabaseAuthId, groupId: "no-such-group" })
    ).rejects.toThrow("GROUP_NOT_FOUND")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/groups/__tests__/reset-invite.test.ts`
Expected: FAIL, cannot resolve `../reset-invite`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/groups/reset-invite.ts
import { randomUUID } from "crypto"
import { prisma } from "@/lib/prisma"

interface ResetInviteInput {
  supabaseAuthId: string // the caller's session; must resolve to the founder
  groupId: string
}

/**
 * Issues a fresh invite token, killing the old link everywhere it has been
 * shared (spec decision 9: remove-then-reset is the keep-them-out path).
 *
 * The schema's @default(cuid()) only fires at row creation, so rotation
 * generates its own value. randomUUID() is used rather than a cuid: the only
 * property the token needs is unguessable uniqueness, and the join route
 * treats it as an opaque string (an old-format token simply stops matching,
 * which is exactly the designed behavior of a reset).
 *
 * The group's own id never changes (settled at data-foundation: identity and
 * invitation are separate fields precisely so this rotation is possible).
 */
export async function resetInviteToken({
  supabaseAuthId,
  groupId,
}: ResetInviteInput): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const caller = await tx.user.findUnique({ where: { supabaseAuthId } })
    if (!caller) throw new Error("NO_USER")

    const group = await tx.group.findUnique({ where: { id: groupId } })
    if (!group) throw new Error("GROUP_NOT_FOUND")
    if (group.founderId !== caller.id) throw new Error("NOT_FOUNDER")

    const newToken = randomUUID()
    await tx.group.update({ where: { id: groupId }, data: { inviteToken: newToken } })
    return newToken
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/groups/__tests__/reset-invite.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/groups/reset-invite.ts src/lib/groups/__tests__/reset-invite.test.ts
git commit -m "Let the founder rotate the invite token"
```

---

### Task 5: The three server actions

**Files:**
- Create: `src/app/actions/leave-group.ts`
- Create: `src/app/actions/remove-member.ts`
- Create: `src/app/actions/reset-invite-link.ts`

**Interfaces:**
- Consumes: `leaveGroup` (Task 2), `removeMember` (Task 3), `resetInviteToken` (Task 4); `createClient` from `@/lib/supabase/server`.
- Produces, for the Task 6 to 8 client islands:
  - `leaveGroupAction(_prevState: LeaveGroupState, formData: FormData): Promise<LeaveGroupState>` — formData field `groupId`; on success revalidates and `redirect("/")`s, so it only returns on error.
  - `removeMemberAction(_prevState: RemoveMemberState, formData: FormData): Promise<RemoveMemberState>` — formData fields `groupId`, `targetUserId`.
  - `resetInviteLinkAction(_prevState: ResetInviteLinkState, formData: FormData): Promise<ResetInviteLinkState>` — formData field `groupId`.
  - Every state type is `{ errors?: { general?: string } }`.

Per the repo convention there are no direct action tests; the logic lives in the Task 2 to 4 libs, which are tested. The actions are thin mapping layers.

- [ ] **Step 1: Write `src/app/actions/leave-group.ts`**

```ts
// src/app/actions/leave-group.ts
"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { leaveGroup } from "@/lib/groups/leave"

export interface LeaveGroupState {
  errors?: {
    general?: string
  }
}

/**
 * Server action: the viewer leaves a group.
 *
 * Same auth model as every mutating action: the session is re-verified
 * server-side and the user re-resolved from it. The founder guard lives in
 * the lib (the UI also never shows the founder a Leave button; this is the
 * backstop). Departures are silent in the feed by design (spec decision 2).
 *
 * On success this redirects to "/" (the front door routes the ex-member to
 * their other group or the pitch), so it only ever RETURNS on failure.
 */
export async function leaveGroupAction(
  _prevState: LeaveGroupState,
  formData: FormData
): Promise<LeaveGroupState> {
  const groupId = (formData.get("groupId") as string | null)?.trim() ?? ""
  if (!groupId) {
    return { errors: { general: "Couldn't find that group. Refresh and try again." } }
  }

  const supabase = await createClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) {
    return { errors: { general: "You need to be signed in to leave." } }
  }

  try {
    await leaveGroup({ supabaseAuthId: authUser.id, groupId })
  } catch (err) {
    const code = err instanceof Error ? err.message : ""
    if (code === "FOUNDER_CANNOT_LEAVE") {
      return { errors: { general: "As the founder, you can't leave your own group yet." } }
    }
    if (code === "NOT_A_MEMBER" || code === "NO_USER") {
      return { errors: { general: "You're not a member of this group." } }
    }
    console.error("[leave-group] failed", err)
    return { errors: { general: "Couldn't save that, try again." } }
  }

  // CRITICAL: revalidatePath and redirect must be called outside and after
  // try/catch. Both use internal throw mechanisms in Next.js and would be
  // swallowed if placed inside the catch block.
  revalidatePath(`/groups/${groupId}`)
  revalidatePath(`/groups/${groupId}/info`)
  redirect("/")
}
```

- [ ] **Step 2: Write `src/app/actions/remove-member.ts`**

```ts
// src/app/actions/remove-member.ts
"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { removeMember } from "@/lib/groups/remove-member"

export interface RemoveMemberState {
  errors?: {
    general?: string
  }
}

/**
 * Server action: the founder removes a member (spec decisions 6 and 7).
 * The founder check lives in the lib; this wrapper only resolves the session
 * and maps thrown codes to copy. Removal is silent in the feed (decision 2).
 */
export async function removeMemberAction(
  _prevState: RemoveMemberState,
  formData: FormData
): Promise<RemoveMemberState> {
  const groupId = (formData.get("groupId") as string | null)?.trim() ?? ""
  const targetUserId = (formData.get("targetUserId") as string | null)?.trim() ?? ""

  if (!groupId || !targetUserId) {
    return { errors: { general: "Couldn't save that, try again." } }
  }

  const supabase = await createClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) {
    return { errors: { general: "You need to be signed in for that." } }
  }

  try {
    await removeMember({ supabaseAuthId: authUser.id, groupId, targetUserId })
  } catch (err) {
    const code = err instanceof Error ? err.message : ""
    if (code === "NOT_FOUNDER" || code === "NO_USER") {
      return { errors: { general: "Only the founder can remove members." } }
    }
    if (code === "CANNOT_REMOVE_FOUNDER") {
      return { errors: { general: "The founder can't be removed." } }
    }
    if (code === "TARGET_NOT_MEMBER") {
      return { errors: { general: "They're not a member anymore." } }
    }
    console.error("[remove-member] failed", err)
    return { errors: { general: "Couldn't save that, try again." } }
  }

  // CRITICAL: revalidatePath must be called outside and after try/catch.
  revalidatePath(`/groups/${groupId}`)
  revalidatePath(`/groups/${groupId}/info`)
  return {}
}
```

- [ ] **Step 3: Write `src/app/actions/reset-invite-link.ts`**

```ts
// src/app/actions/reset-invite-link.ts
"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { resetInviteToken } from "@/lib/groups/reset-invite"

export interface ResetInviteLinkState {
  errors?: {
    general?: string
  }
}

/**
 * Server action: the founder rotates the invite link (spec decision 9).
 * The page re-renders with the new token via revalidatePath; the action
 * does not return the token to the client, the refreshed page carries it.
 */
export async function resetInviteLinkAction(
  _prevState: ResetInviteLinkState,
  formData: FormData
): Promise<ResetInviteLinkState> {
  const groupId = (formData.get("groupId") as string | null)?.trim() ?? ""
  if (!groupId) {
    return { errors: { general: "Couldn't save that, try again." } }
  }

  const supabase = await createClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) {
    return { errors: { general: "You need to be signed in for that." } }
  }

  try {
    await resetInviteToken({ supabaseAuthId: authUser.id, groupId })
  } catch (err) {
    const code = err instanceof Error ? err.message : ""
    if (code === "NOT_FOUNDER" || code === "NO_USER") {
      return { errors: { general: "Only the founder can reset the link." } }
    }
    console.error("[reset-invite-link] failed", err)
    return { errors: { general: "Couldn't save that, try again." } }
  }

  // CRITICAL: revalidatePath must be called outside and after try/catch.
  revalidatePath(`/groups/${groupId}/info`)
  return {}
}
```

- [ ] **Step 4: Typecheck and run the suite**

Run: `npx tsc --noEmit` then `npx vitest run src/lib/groups`
Expected: tsc clean; groups tests all pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/leave-group.ts src/app/actions/remove-member.ts src/app/actions/reset-invite-link.ts
git commit -m "Wrap leave, remove, and reset in gated server actions"
```

---

### Task 6: ShareInviteLink island

**Files:**
- Create: `src/app/groups/[id]/info/ShareInviteLink.tsx`
- Test: `src/app/groups/[id]/info/__tests__/ShareInviteLink.test.tsx`

**Interfaces:**
- Consumes: nothing from other tasks (pure client behavior).
- Produces: `<ShareInviteLink inviteToken={string} groupName={string} />` — used by Task 9's page. Absorbs and replaces `CopyInviteLink` (deleted in Task 9).

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
//
// The one contract under test: the same button shares where the browser can
// share and copies where it cannot (spec decision 10). navigator.share and
// navigator.clipboard do not exist in jsdom, which makes the fallback branch
// the natural default here and the share branch an explicit stub.

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react"
import ShareInviteLink from "../ShareInviteLink"

afterEach(() => {
  cleanup()
  // Remove any share/clipboard stubs a test installed
  delete (navigator as unknown as Record<string, unknown>).share
  delete (navigator as unknown as Record<string, unknown>).clipboard
  vi.restoreAllMocks()
})

describe("ShareInviteLink", () => {
  it("renders the teal share label", () => {
    render(<ShareInviteLink inviteToken="tok-1" groupName="Climbing Crew" />)
    expect(screen.getByRole("button", { name: "Share invite link" })).toBeDefined()
  })

  it("uses navigator.share with the full join URL when the browser has it", async () => {
    const share = vi.fn(async () => {})
    Object.defineProperty(navigator, "share", { value: share, configurable: true })

    render(<ShareInviteLink inviteToken="tok-2" groupName="Climbing Crew" />)
    fireEvent.click(screen.getByRole("button", { name: "Share invite link" }))

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1))
    const arg = share.mock.calls[0][0] as { url?: string }
    expect(arg.url).toContain("/join/tok-2")
  })

  it("falls back to clipboard copy with Copied! feedback when share is absent", async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    })

    render(<ShareInviteLink inviteToken="tok-3" groupName="Climbing Crew" />)
    fireEvent.click(screen.getByRole("button", { name: "Share invite link" }))

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(writeText.mock.calls[0][0]).toContain("/join/tok-3")
    expect(await screen.findByRole("button", { name: "Copied!" })).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/groups/[id]/info/__tests__/ShareInviteLink.test.tsx"`
Expected: FAIL, cannot resolve `../ShareInviteLink`.

- [ ] **Step 3: Write the implementation**

```tsx
// src/app/groups/[id]/info/ShareInviteLink.tsx
"use client"

import { useState } from "react"

interface Props {
  inviteToken: string
  groupName: string
}

/**
 * One teal button, two behaviors (spec decision 10): the native share sheet
 * where the browser has one (phones), clipboard copy with "Copied!" feedback
 * where it does not (desktop). Successor to CopyInviteLink, whose copy
 * behavior this absorbs; the full URL is built client-side from
 * window.location.origin, same as before, so the server never needs to know
 * its own host.
 */
export default function ShareInviteLink({ inviteToken, groupName }: Props) {
  const [copied, setCopied] = useState(false)

  async function handleShare() {
    const url = `${window.location.origin}/join/${inviteToken}`
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: groupName, url })
      } catch {
        // Dismissed the sheet or share failed; nothing to clean up.
      }
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked (permissions or non-secure context). The link text
      // is visible on the page to copy manually; same accepted fallback as
      // the old CopyInviteLink.
    }
  }

  return (
    <button
      onClick={handleShare}
      style={{
        width: "100%",
        padding: "0.75rem 1.5rem",
        backgroundColor: "var(--color-teal)",
        color: "#0a0a0a",
        fontSize: "var(--type-body)",
        fontWeight: 600,
        border: "none",
        borderRadius: "0.5rem",
        cursor: "pointer",
      }}
    >
      {copied ? "Copied!" : "Share invite link"}
    </button>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/app/groups/[id]/info/__tests__/ShareInviteLink.test.tsx"`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add "src/app/groups/[id]/info/ShareInviteLink.tsx" "src/app/groups/[id]/info/__tests__/ShareInviteLink.test.tsx"
git commit -m "Share the invite link natively with a copy fallback"
```

---

### Task 7: LeaveGroupButton island

**Files:**
- Create: `src/app/groups/[id]/info/LeaveGroupButton.tsx`
- Test: `src/app/groups/[id]/info/__tests__/LeaveGroupButton.test.tsx`

**Interfaces:**
- Consumes: `leaveGroupAction`, `LeaveGroupState` from `@/app/actions/leave-group` (Task 5).
- Produces: `<LeaveGroupButton groupId={string} groupName={string} />` — used by Task 9's page, members only.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
//
// The contract: leaving takes two deliberate taps. The first tap must never
// call the action; the confirm is warm ("You can always rejoin"); Never mind
// backs out; the confirm tap calls the action with the right groupId; an
// action error is surfaced.

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react"
import LeaveGroupButton from "../LeaveGroupButton"

const leaveMock = vi.fn(async (..._args: unknown[]): Promise<{ errors?: { general?: string } }> => ({}))
vi.mock("@/app/actions/leave-group", () => ({
  leaveGroupAction: (...args: unknown[]) => leaveMock(...args),
}))

afterEach(() => {
  cleanup()
  leaveMock.mockClear()
  leaveMock.mockImplementation(async () => ({}))
})

describe("LeaveGroupButton", () => {
  it("does not call the action on the first tap; it asks first", () => {
    render(<LeaveGroupButton groupId="g1" groupName="Climbing Crew" />)
    fireEvent.click(screen.getByRole("button", { name: "Leave group" }))

    expect(leaveMock).not.toHaveBeenCalled()
    expect(screen.getByText("Leave Climbing Crew?")).toBeDefined()
    expect(screen.getByText("You can always rejoin with the invite link.")).toBeDefined()
  })

  it("backs out on Never mind without calling the action", () => {
    render(<LeaveGroupButton groupId="g1" groupName="Climbing Crew" />)
    fireEvent.click(screen.getByRole("button", { name: "Leave group" }))
    fireEvent.click(screen.getByRole("button", { name: "Never mind" }))

    expect(leaveMock).not.toHaveBeenCalled()
    expect(screen.queryByText("Leave Climbing Crew?")).toBeNull()
    expect(screen.getByRole("button", { name: "Leave group" })).toBeDefined()
  })

  it("calls the action with the groupId on confirm", async () => {
    render(<LeaveGroupButton groupId="g-42" groupName="Climbing Crew" />)
    fireEvent.click(screen.getByRole("button", { name: "Leave group" }))
    // Inside the confirm, the destructive button repeats the label
    fireEvent.click(screen.getByRole("button", { name: "Leave group" }))

    await waitFor(() => expect(leaveMock).toHaveBeenCalledTimes(1))
    const formData = leaveMock.mock.calls[0][1] as FormData
    expect(formData.get("groupId")).toBe("g-42")
  })

  it("surfaces the action's error copy", async () => {
    leaveMock.mockImplementation(async () => ({
      errors: { general: "You're not a member of this group." },
    }))
    render(<LeaveGroupButton groupId="g1" groupName="Climbing Crew" />)
    fireEvent.click(screen.getByRole("button", { name: "Leave group" }))
    fireEvent.click(screen.getByRole("button", { name: "Leave group" }))

    expect(await screen.findByText("You're not a member of this group.")).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/groups/[id]/info/__tests__/LeaveGroupButton.test.tsx"`
Expected: FAIL, cannot resolve `../LeaveGroupButton`.

- [ ] **Step 3: Write the implementation**

```tsx
// src/app/groups/[id]/info/LeaveGroupButton.tsx
"use client"

import { useState, useTransition } from "react"
import { leaveGroupAction } from "@/app/actions/leave-group"

interface Props {
  groupId: string
  groupName: string
}

/**
 * The outlined Leave button at the bottom of the info page, members only
 * (the page never renders it for the founder or a non-member).
 *
 * Leaving takes two taps by design (spec, "The actions"): the first opens a
 * warm confirm in place ("You can always rejoin with the invite link", the
 * settled §4 copy), never a browser confirm() and never an instant delete.
 * The destructive confirm is outlined in the error red already used for
 * error text, with its label carrying the meaning (never color alone).
 *
 * On success the action redirects to "/" server-side, so this component
 * only handles the error return.
 */
export default function LeaveGroupButton({ groupId, groupName }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleConfirm() {
    startTransition(async () => {
      setErrorMsg(null)
      const formData = new FormData()
      formData.set("groupId", groupId)
      const result = await leaveGroupAction({}, formData)
      if (result?.errors?.general) {
        setErrorMsg(result.errors.general)
      }
      // On success the action redirected; nothing to do here.
    })
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        style={{
          width: "100%",
          padding: "0.75rem 1.5rem",
          backgroundColor: "transparent",
          color: "var(--text-secondary)",
          fontSize: "var(--type-label)",
          fontWeight: 600,
          border: "1px solid var(--border-subtle)",
          borderRadius: "0.5rem",
          cursor: "pointer",
        }}
      >
        Leave group
      </button>
    )
  }

  return (
    <div
      style={{
        backgroundColor: "var(--surface-card)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "0.75rem",
        padding: "1.25rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
      }}
    >
      <p
        style={{
          fontSize: "var(--type-body)",
          fontWeight: 600,
          color: "var(--text-primary)",
          lineHeight: "var(--leading-tight)",
        }}
      >
        Leave {groupName}?
      </p>
      <p
        style={{
          fontSize: "var(--type-meta)",
          color: "var(--text-secondary)",
          lineHeight: "var(--leading-normal)",
        }}
      >
        You can always rejoin with the invite link.
      </p>

      {errorMsg && (
        <p style={{ fontSize: "var(--type-meta)", color: "#f87171" }}>{errorMsg}</p>
      )}

      <div style={{ display: "flex", gap: "0.625rem", flexWrap: "wrap" }}>
        <button
          onClick={handleConfirm}
          disabled={isPending}
          style={{
            flex: 1,
            minWidth: "8rem",
            padding: "0.625rem 1rem",
            backgroundColor: "transparent",
            color: "#f87171",
            fontSize: "var(--type-label)",
            fontWeight: 600,
            border: "1px solid #f87171",
            borderRadius: "0.5rem",
            cursor: isPending ? "not-allowed" : "pointer",
          }}
        >
          {isPending ? "Leaving…" : "Leave group"}
        </button>
        <button
          onClick={() => {
            setConfirming(false)
            setErrorMsg(null)
          }}
          disabled={isPending}
          style={{
            flex: 1,
            minWidth: "8rem",
            padding: "0.625rem 1rem",
            backgroundColor: "transparent",
            color: "var(--text-primary)",
            fontSize: "var(--type-label)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "0.5rem",
            cursor: isPending ? "not-allowed" : "pointer",
          }}
        >
          Never mind
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/app/groups/[id]/info/__tests__/LeaveGroupButton.test.tsx"`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add "src/app/groups/[id]/info/LeaveGroupButton.tsx" "src/app/groups/[id]/info/__tests__/LeaveGroupButton.test.tsx"
git commit -m "Ask warmly before a member leaves"
```

---

### Task 8: ManageMembers and ResetInviteLink islands

**Files:**
- Create: `src/app/groups/[id]/info/ManageMembers.tsx`
- Create: `src/app/groups/[id]/info/ResetInviteLink.tsx`
- Test: `src/app/groups/[id]/info/__tests__/ManageMembers.test.tsx`
- Test: `src/app/groups/[id]/info/__tests__/ResetInviteLink.test.tsx`

**Interfaces:**
- Consumes: `removeMemberAction` from `@/app/actions/remove-member`, `resetInviteLinkAction` from `@/app/actions/reset-invite-link` (Task 5).
- Produces, for Task 9's page (founder view only):
  - `<ManageMembers groupId={string} founderId={string} members={{ id: string; name: string }[]} />` — renders the WHO row content INCLUDING the dot-separated default state, so the page renders it in place of the static names for the founder.
  - `<ResetInviteLink groupId={string} />` — the quiet link plus confirm, rendered under the share button.

- [ ] **Step 1: Write the failing ManageMembers test**

```tsx
// @vitest-environment jsdom
//
// The contract: the founder's card is calm by default (dot-separated names,
// identical to what everyone sees) plus one quiet "Manage members" link;
// manage mode lists rows; the founder's own row has no remove; removing
// takes a confirm; the confirm carries the target's id; Done exits.

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react"
import ManageMembers from "../ManageMembers"

const removeMock = vi.fn(async (..._args: unknown[]): Promise<{ errors?: { general?: string } }> => ({}))
vi.mock("@/app/actions/remove-member", () => ({
  removeMemberAction: (...args: unknown[]) => removeMock(...args),
}))

afterEach(() => {
  cleanup()
  removeMock.mockClear()
  removeMock.mockImplementation(async () => ({}))
})

const MEMBERS = [
  { id: "u-founder", name: "Nina" },
  { id: "u-theo", name: "Theo" },
  { id: "u-ravi", name: "Ravi" },
]

function renderCard() {
  return render(
    <ManageMembers groupId="g-1" founderId="u-founder" members={MEMBERS} />
  )
}

describe("ManageMembers", () => {
  it("renders dot-separated names and a quiet manage link by default", () => {
    renderCard()
    expect(screen.getByText(/Nina/)).toBeDefined()
    expect(screen.getByText(/Theo/)).toBeDefined()
    expect(screen.getByRole("button", { name: "Manage members" })).toBeDefined()
    // No remove affordances in the calm state
    expect(screen.queryByRole("button", { name: /Remove/ })).toBeNull()
  })

  it("lists rows in manage mode, with no remove on the founder's own row", () => {
    renderCard()
    fireEvent.click(screen.getByRole("button", { name: "Manage members" }))

    // Two removable members, one founder without a remove control
    expect(screen.getAllByRole("button", { name: "Remove" })).toHaveLength(2)
    expect(screen.getByRole("button", { name: "Done" })).toBeDefined()
  })

  it("requires a confirm and passes the target's id to the action", async () => {
    renderCard()
    fireEvent.click(screen.getByRole("button", { name: "Manage members" }))
    // First Remove belongs to Theo (members render in given order, founder first)
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0])

    // Confirm copy appears; nothing has been called yet
    expect(screen.getByText("Remove Theo from the group?")).toBeDefined()
    expect(screen.getByText("They can rejoin with the invite link.")).toBeDefined()
    expect(removeMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Yes, remove" }))
    await waitFor(() => expect(removeMock).toHaveBeenCalledTimes(1))
    const formData = removeMock.mock.calls[0][1] as FormData
    expect(formData.get("groupId")).toBe("g-1")
    expect(formData.get("targetUserId")).toBe("u-theo")
  })

  it("backs out of a remove on Never mind", () => {
    renderCard()
    fireEvent.click(screen.getByRole("button", { name: "Manage members" }))
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0])
    fireEvent.click(screen.getByRole("button", { name: "Never mind" }))

    expect(removeMock).not.toHaveBeenCalled()
    expect(screen.queryByText("Remove Theo from the group?")).toBeNull()
  })

  it("returns to the calm state on Done", () => {
    renderCard()
    fireEvent.click(screen.getByRole("button", { name: "Manage members" }))
    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    expect(screen.getByRole("button", { name: "Manage members" })).toBeDefined()
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull()
  })

  it("surfaces the action's error copy", async () => {
    removeMock.mockImplementation(async () => ({
      errors: { general: "Only the founder can remove members." },
    }))
    renderCard()
    fireEvent.click(screen.getByRole("button", { name: "Manage members" }))
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0])
    fireEvent.click(screen.getByRole("button", { name: "Yes, remove" }))

    expect(await screen.findByText("Only the founder can remove members.")).toBeDefined()
  })
})
```

- [ ] **Step 2: Write the failing ResetInviteLink test**

```tsx
// @vitest-environment jsdom
//
// The contract: a quiet link, a confirm naming the consequence (the old link
// stops working), the action called with the groupId only on confirm.

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react"
import ResetInviteLink from "../ResetInviteLink"

const resetMock = vi.fn(async (..._args: unknown[]): Promise<{ errors?: { general?: string } }> => ({}))
vi.mock("@/app/actions/reset-invite-link", () => ({
  resetInviteLinkAction: (...args: unknown[]) => resetMock(...args),
}))

afterEach(() => {
  cleanup()
  resetMock.mockClear()
  resetMock.mockImplementation(async () => ({}))
})

describe("ResetInviteLink", () => {
  it("asks before resetting, naming the consequence", () => {
    render(<ResetInviteLink groupId="g-1" />)
    fireEvent.click(screen.getByRole("button", { name: "Reset link" }))

    expect(resetMock).not.toHaveBeenCalled()
    expect(screen.getByText("Reset the invite link?")).toBeDefined()
    expect(
      screen.getByText("The old link will stop working everywhere it's been shared.")
    ).toBeDefined()
  })

  it("calls the action with the groupId on confirm", async () => {
    render(<ResetInviteLink groupId="g-9" />)
    fireEvent.click(screen.getByRole("button", { name: "Reset link" }))
    fireEvent.click(screen.getByRole("button", { name: "Yes, reset it" }))

    await waitFor(() => expect(resetMock).toHaveBeenCalledTimes(1))
    const formData = resetMock.mock.calls[0][1] as FormData
    expect(formData.get("groupId")).toBe("g-9")
  })

  it("backs out on Never mind", () => {
    render(<ResetInviteLink groupId="g-1" />)
    fireEvent.click(screen.getByRole("button", { name: "Reset link" }))
    fireEvent.click(screen.getByRole("button", { name: "Never mind" }))

    expect(resetMock).not.toHaveBeenCalled()
    expect(screen.queryByText("Reset the invite link?")).toBeNull()
  })
})
```

- [ ] **Step 3: Run both to verify they fail**

Run: `npx vitest run "src/app/groups/[id]/info/__tests__/ManageMembers.test.tsx" "src/app/groups/[id]/info/__tests__/ResetInviteLink.test.tsx"`
Expected: FAIL, cannot resolve the two components.

- [ ] **Step 4: Write ManageMembers**

```tsx
// src/app/groups/[id]/info/ManageMembers.tsx
"use client"

import { useState, useTransition } from "react"
import { removeMemberAction } from "@/app/actions/remove-member"

interface Member {
  id: string
  name: string
}

interface Props {
  groupId: string
  founderId: string
  members: Member[] // founder first, then join order (the page orders them)
}

/**
 * The founder's view of the WHO row (spec decision 4): identical to what
 * everyone sees (dot-separated names) plus one quiet "Manage members" text
 * link. Manage mode flips to stacked rows with a soft Remove per member;
 * the founder's own row never gets one (spec decision 6's backstop is the
 * lib, this is the UI half). Removing takes a confirm naming the person
 * (spec, "The actions"); errors surface inline.
 *
 * Non-founders never receive this component; the page renders the static
 * names for them, so this file can stay purely a founder concern.
 */
export default function ManageMembers({ groupId, founderId, members }: Props) {
  const [managing, setManaging] = useState(false)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleRemove(targetUserId: string) {
    startTransition(async () => {
      setErrorMsg(null)
      const formData = new FormData()
      formData.set("groupId", groupId)
      formData.set("targetUserId", targetUserId)
      const result = await removeMemberAction({}, formData)
      if (result?.errors?.general) {
        setErrorMsg(result.errors.general)
      } else {
        // Success: revalidatePath refreshes the server-rendered list; drop
        // the confirm so the refreshed row set renders clean.
        setConfirmingId(null)
      }
    })
  }

  if (!managing) {
    return (
      <span>
        {members.map((m, i) => (
          <span key={m.id}>
            {i > 0 && <span style={{ color: "var(--text-placeholder)" }}>{" · "}</span>}
            {m.name}
          </span>
        ))}
        {"  "}
        <button
          onClick={() => setManaging(true)}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            color: "var(--text-secondary)",
            fontSize: "var(--type-meta)",
            textDecoration: "underline",
            cursor: "pointer",
          }}
        >
          Manage members
        </button>
      </span>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
      {errorMsg && (
        <p style={{ fontSize: "var(--type-meta)", color: "#f87171" }}>{errorMsg}</p>
      )}

      {members.map((m) => (
        <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.75rem",
            }}
          >
            <span style={{ fontSize: "var(--type-body)", color: "var(--text-primary)" }}>
              {m.name}
            </span>
            {m.id !== founderId && confirmingId !== m.id && (
              <button
                onClick={() => setConfirmingId(m.id)}
                disabled={isPending}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  color: "var(--text-secondary)",
                  fontSize: "var(--type-meta)",
                  textDecoration: "underline",
                  cursor: isPending ? "not-allowed" : "pointer",
                }}
              >
                Remove
              </button>
            )}
          </div>

          {confirmingId === m.id && (
            <div
              style={{
                border: "1px solid var(--border-subtle)",
                borderRadius: "0.5rem",
                padding: "0.75rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              <p
                style={{
                  fontSize: "var(--type-meta)",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}
              >
                Remove {m.name} from the group?
              </p>
              <p style={{ fontSize: "var(--type-meta)", color: "var(--text-secondary)" }}>
                They can rejoin with the invite link.
              </p>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button
                  onClick={() => handleRemove(m.id)}
                  disabled={isPending}
                  style={{
                    padding: "0.375rem 0.75rem",
                    backgroundColor: "transparent",
                    color: "#f87171",
                    fontSize: "var(--type-label)",
                    fontWeight: 600,
                    border: "1px solid #f87171",
                    borderRadius: "0.5rem",
                    cursor: isPending ? "not-allowed" : "pointer",
                  }}
                >
                  {isPending ? "Removing…" : "Yes, remove"}
                </button>
                <button
                  onClick={() => setConfirmingId(null)}
                  disabled={isPending}
                  style={{
                    padding: "0.375rem 0.75rem",
                    backgroundColor: "transparent",
                    color: "var(--text-primary)",
                    fontSize: "var(--type-label)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "0.5rem",
                    cursor: isPending ? "not-allowed" : "pointer",
                  }}
                >
                  Never mind
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      <button
        onClick={() => {
          setManaging(false)
          setConfirmingId(null)
          setErrorMsg(null)
        }}
        style={{
          alignSelf: "flex-start",
          background: "none",
          border: "none",
          padding: 0,
          color: "var(--text-secondary)",
          fontSize: "var(--type-meta)",
          textDecoration: "underline",
          cursor: "pointer",
        }}
      >
        Done
      </button>
    </div>
  )
}
```

- [ ] **Step 5: Write ResetInviteLink**

```tsx
// src/app/groups/[id]/info/ResetInviteLink.tsx
"use client"

import { useState, useTransition } from "react"
import { resetInviteLinkAction } from "@/app/actions/reset-invite-link"

interface Props {
  groupId: string
}

/**
 * The quiet founder-only affordance under the invite block (spec decision 4).
 * Reset kills the old link everywhere immediately (spec decision 9), so the
 * confirm names exactly that consequence before anything happens. On success
 * revalidatePath re-renders the page and the pill shows the new URL; this
 * component only handles asking and errors.
 */
export default function ResetInviteLink({ groupId }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleReset() {
    startTransition(async () => {
      setErrorMsg(null)
      const formData = new FormData()
      formData.set("groupId", groupId)
      const result = await resetInviteLinkAction({}, formData)
      if (result?.errors?.general) {
        setErrorMsg(result.errors.general)
      } else {
        setConfirming(false)
      }
    })
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        style={{
          alignSelf: "flex-start",
          background: "none",
          border: "none",
          padding: 0,
          color: "var(--text-secondary)",
          fontSize: "var(--type-meta)",
          textDecoration: "underline",
          cursor: "pointer",
        }}
      >
        Reset link
      </button>
    )
  }

  return (
    <div
      style={{
        border: "1px solid var(--border-subtle)",
        borderRadius: "0.5rem",
        padding: "0.75rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
      }}
    >
      <p style={{ fontSize: "var(--type-meta)", fontWeight: 600, color: "var(--text-primary)" }}>
        Reset the invite link?
      </p>
      <p style={{ fontSize: "var(--type-meta)", color: "var(--text-secondary)" }}>
        The old link will stop working everywhere it's been shared.
      </p>

      {errorMsg && (
        <p style={{ fontSize: "var(--type-meta)", color: "#f87171" }}>{errorMsg}</p>
      )}

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button
          onClick={handleReset}
          disabled={isPending}
          style={{
            padding: "0.375rem 0.75rem",
            backgroundColor: "transparent",
            color: "#f87171",
            fontSize: "var(--type-label)",
            fontWeight: 600,
            border: "1px solid #f87171",
            borderRadius: "0.5rem",
            cursor: isPending ? "not-allowed" : "pointer",
          }}
        >
          {isPending ? "Resetting…" : "Yes, reset it"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={isPending}
          style={{
            padding: "0.375rem 0.75rem",
            backgroundColor: "transparent",
            color: "var(--text-primary)",
            fontSize: "var(--type-label)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "0.5rem",
            cursor: isPending ? "not-allowed" : "pointer",
          }}
        >
          Never mind
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Run both test files to verify they pass**

Run: `npx vitest run "src/app/groups/[id]/info/__tests__/ManageMembers.test.tsx" "src/app/groups/[id]/info/__tests__/ResetInviteLink.test.tsx"`
Expected: PASS, 6 + 3 tests.

- [ ] **Step 7: Commit**

```bash
git add "src/app/groups/[id]/info/ManageMembers.tsx" "src/app/groups/[id]/info/ResetInviteLink.tsx" "src/app/groups/[id]/info/__tests__/ManageMembers.test.tsx" "src/app/groups/[id]/info/__tests__/ResetInviteLink.test.tsx"
git commit -m "Give the founder quiet manage and reset affordances"
```

---

### Task 9: The page itself

**Files:**
- Modify: `src/app/groups/[id]/info/page.tsx` (full rewrite of the render; route unchanged)
- Delete: `src/app/groups/[id]/CopyInviteLink.tsx`

**Interfaces:**
- Consumes: `groupInitials` (Task 1); `ShareInviteLink` (Task 6); `LeaveGroupButton` (Task 7); `ManageMembers`, `ResetInviteLink` (Task 8); `formatRhythmRow` from `@/lib/orbit/playback`; `parseStoredRhythms` from `@/lib/orbit/rhythm`; `PageHeader`, `BackLink` from `@/components`; `prisma`, `getCurrentUser`.
- Produces: the shipped page. Nothing downstream consumes it.

- [ ] **Step 1: Rewrite the page**

```tsx
// src/app/groups/[id]/info/page.tsx
//
// The full group-info page (walkthrough screen 10, grown in place from the
// invite-link stub per the group-info slice). The group's reference page:
// identity, members, standing rhythm, invite link, leave. Changing group
// details happens by telling Orbit in the chat, and the page says so.
//
// Visibility (spec decisions 3 to 5):
//   member          identity · invite+share · card · hint · Leave
//   founder         identity · invite+share+reset · card(+manage) · hint, NO Leave
//   non-member      identity · card · hint (no invite, no share, no Leave)
// Viewing stays ungated (standing access-control gap, by design); every
// mutation re-verifies membership/founder server-side in its own action.
//
// Design source: docs/design/group-info-handoff/wireframes/group-info.html.
// Deliberate deviations recorded in the spec (decision 1): real token URL,
// formatter-composed rhythm rows, shared header chrome, and the locked
// type scale over the wireframe's raw pixel sizes.

import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth/current-user"
import { parseStoredRhythms } from "@/lib/orbit/rhythm"
import { formatRhythmRow } from "@/lib/orbit/playback"
import { groupInitials } from "@/lib/groups/initials"
import PageHeader from "@/components/PageHeader"
import BackLink from "@/components/BackLink"
import ShareInviteLink from "./ShareInviteLink"
import LeaveGroupButton from "./LeaveGroupButton"
import ManageMembers from "./ManageMembers"
import ResetInviteLink from "./ResetInviteLink"

interface Props {
  params: Promise<{ id: string }>
}

export default async function GroupInfoPage({ params }: Props) {
  const { id } = await params

  // Single read: group + memberships with user names, join order.
  const group = await prisma.group.findUnique({
    where: { id },
    include: {
      memberships: { include: { user: true }, orderBy: { joinedAt: "asc" } },
    },
  })
  if (!group) notFound()

  const viewer = await getCurrentUser()
  const isFounder = viewer?.id === group.founderId
  const isMember =
    viewer !== null && group.memberships.some((m) => m.userId === viewer.id)

  // WHO ordering (spec decision 12): founder first, then join order. The
  // query already sorts by joinedAt; this hoists the founder to the front.
  const orderedMembers = [
    ...group.memberships.filter((m) => m.userId === group.founderId),
    ...group.memberships.filter((m) => m.userId !== group.founderId),
  ].map((m) => ({ id: m.user.id, name: m.user.name }))

  const memberCount = orderedMembers.length

  // Rhythm rows (spec decision 13): formatter-composed, venue appended.
  const rhythms = parseStoredRhythms(group.recurringActivities) ?? []
  const rhythmRows = rhythms.map((r) => {
    const row = formatRhythmRow(r)
    return {
      label: row.label,
      value: r.venueName ? `${row.value} · ${r.venueName}` : row.value,
    }
  })

  return (
    <main
      style={{
        minHeight: "100dvh",
        backgroundColor: "var(--surface-page)",
        color: "var(--text-primary)",
        display: "flex",
        flexDirection: "column",
        fontFamily: "var(--font-geist-sans, system-ui, sans-serif)",
      }}
    >
      <PageHeader>
        <BackLink href={`/groups/${group.id}`} label={group.name} />
      </PageHeader>

      <div
        style={{
          padding: "1.5rem 1rem 2rem",
          width: "100%",
          maxWidth: "28rem",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "1.5rem",
          flex: "1 1 auto",
        }}
      >
        {/* ── Identity block (handoff: emblem, name, count) ─────────────── */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            gap: "0.75rem",
          }}
        >
          {/* Lime emblem: group brand moment, not an action (lime is never a button) */}
          <div
            aria-hidden="true"
            style={{
              width: "4.5rem",
              height: "4.5rem",
              borderRadius: "50%",
              backgroundColor: "var(--color-lime)",
              color: "#0a0a0a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "var(--type-title)",
              fontWeight: 700,
              letterSpacing: "0.02em",
            }}
          >
            {groupInitials(group.name)}
          </div>
          <h1
            style={{
              fontSize: "var(--type-display)",
              fontWeight: 700,
              lineHeight: "var(--leading-tight)",
              letterSpacing: "-0.01em",
            }}
          >
            {group.name}
          </h1>
          <p style={{ fontSize: "var(--type-meta)", color: "var(--text-secondary)" }}>
            {memberCount} {memberCount === 1 ? "member" : "members"}
          </p>
        </div>

        {/* ── Invite link: members and founder only (spec decision 5) ───── */}
        {isMember && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <p
              style={{
                fontSize: "var(--type-eyebrow)",
                lineHeight: "var(--leading-normal)",
                color: "var(--text-secondary)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Group invite link
            </p>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.625rem",
                border: "1px solid var(--border-subtle)",
                borderRadius: "0.625rem",
                backgroundColor: "var(--surface-input)",
                padding: "0.75rem",
              }}
            >
              {/* Globe glyph from the handoff, decorative */}
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--text-secondary)"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ width: "1rem", height: "1rem", flexShrink: 0 }}
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
              </svg>
              <span
                style={{
                  fontSize: "var(--type-meta)",
                  color: "var(--text-primary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {/* Path only; ShareInviteLink builds the full URL client-side */}
                /join/{group.inviteToken}
              </span>
            </div>
            <ShareInviteLink inviteToken={group.inviteToken} groupName={group.name} />
            {isFounder && <ResetInviteLink groupId={group.id} />}
          </div>
        )}

        {/* ── The card: WHO + rhythm rows ───────────────────────────────── */}
        <div
          style={{
            backgroundColor: "var(--surface-card)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "0.75rem",
            padding: "1.25rem",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
          }}
        >
          <InfoRow label="Who">
            {isFounder ? (
              <ManageMembers
                groupId={group.id}
                founderId={group.founderId}
                members={orderedMembers}
              />
            ) : (
              <span>
                {orderedMembers.map((m, i) => (
                  <span key={m.id}>
                    {i > 0 && (
                      <span style={{ color: "var(--text-placeholder)" }}>{" · "}</span>
                    )}
                    {m.name}
                  </span>
                ))}
              </span>
            )}
          </InfoRow>

          {rhythmRows.map((row) => (
            <InfoRow key={row.label} label={row.label}>
              <span>{row.value}</span>
            </InfoRow>
          ))}
        </div>

        <p
          style={{
            fontSize: "var(--type-meta)",
            color: "var(--text-secondary)",
            textAlign: "center",
          }}
        >
          Want to change something? Just tell Orbit in the chat.
        </p>

        {/* ── Leave: members only, never the founder (spec decision 3) ──── */}
        {isMember && !isFounder && (
          <div style={{ marginTop: "auto" }}>
            <LeaveGroupButton groupId={group.id} groupName={group.name} />
          </div>
        )}
      </div>
    </main>
  )
}

// ── Sub-component (server-only) ─────────────────────────────────────────────

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: "0.75rem", alignItems: "baseline" }}>
      <span
        style={{
          flex: "0 0 4.5rem",
          fontSize: "var(--type-eyebrow)",
          lineHeight: "var(--leading-normal)",
          color: "var(--text-secondary)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </span>
      <div
        style={{
          flex: "1 1 auto",
          minWidth: 0,
          fontSize: "var(--type-body)",
          lineHeight: "var(--leading-normal)",
          color: "var(--text-primary)",
        }}
      >
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Delete CopyInviteLink**

Run: `git rm "src/app/groups/[id]/CopyInviteLink.tsx"`
Its only consumer was this page (verified in exploration: no other import site exists); `ShareInviteLink` absorbs its copy behavior.

- [ ] **Step 3: Typecheck and full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; every test passes (baseline 692 plus this slice's new tests; zero failures, zero skips). If anything unrelated fails, stop and investigate before proceeding; the baseline says it was green.

- [ ] **Step 4: Render check in the browser**

Start the dev server (or reuse the running one; this slice changed no schema, so no restart-for-prisma concern) and load `/groups/<any dev-test group id>/info` in three states if convenient, otherwise defer to the Task 10 walkthrough. Confirm: no runtime errors in the server log, the page renders, the card grows with content.

- [ ] **Step 5: Commit**

```bash
git add "src/app/groups/[id]/info/page.tsx"
git commit -m "Grow the info stub into the full group-info page"
```

(The `git rm` from Step 2 is already staged and rides this commit.)

---

### Task 10: QA staging script and the full browser walkthrough

**Files:**
- Create: `scripts/qa-stage-groupinfo.ts`

**Interfaces:**
- Consumes: `prisma` from `../src/lib/prisma`, `judge` from `./db-which`, `createGauge` from `../src/lib/gauges/create` (same imports as `scripts/qa-stage-daycomment.ts`).
- Produces: a `--flesh <groupId>` mode used by the walkthrough below.

**Why flesh-out rather than seed-from-scratch:** the founder view can only be QA'd by a browser session that IS the founder, and a script cannot mint browser sessions. So the walkthrough creates the group through real onboarding (making the browser session the founder), and the script fleshes that group out with three seeded members and a live gauge carrying one seeded yes, which is what makes the removal's tally self-heal visible.

- [ ] **Step 1: Write the script**

```ts
// scripts/qa-stage-groupinfo.ts
//
// Fleshes out a browser-created group for the group-info walkthrough.
//
// Usage:
//   1. In the browser: create a group through real onboarding ("[QA] Group
//      Info", two rhythms, one with a venue). The browser session is the
//      founder, which is the only way a founder-view walkthrough can exist.
//   2. npm run db:which   (always, before any script that writes)
//   3. npx tsx --env-file=.env scripts/qa-stage-groupinfo.ts --flesh <groupId>
//
// What --flesh adds to the group:
//   - Three seeded members (Theo, Ravi, Elle) with fake auth ids.
//   - One LIVE gauge ("beers", two days out at 19:00) with a seeded IN vote
//     from Theo, so removing Theo in the walkthrough visibly drops the tally
//     from the group home (the self-heal the spec's decision 7 claims).
//
// WHERE IT WRITES: whichever database .env points at; requireDevTest refuses
// to run unless all three env sources agree on the dev-test ref, same as
// qa-stage-daycomment.ts (the enforced precedent).
//
// This is QA tooling, deliberately outside the test suite: it writes real
// rows to a shared database. Not named *.test.ts, which is what keeps
// Vitest from collecting it.

import { prisma } from "../src/lib/prisma"
import { createGauge } from "../src/lib/gauges/create"
import { zonedWallTimeToUtc } from "../src/lib/orbit/occurrence"
import { gaugeClosesAt } from "../src/lib/orbit/spark-copy"
import { judge } from "./db-which"
import { MessageAuthor } from "@prisma/client"

/** The same ref db:which checks against (CLAUDE.md, "Two databases, never crossed"). */
const EXPECTED_DEV_TEST_REF = "pxbewardwvoyqqcvogel"

function requireDevTest(): void {
  const verdict = judge(process.env, EXPECTED_DEV_TEST_REF)
  if (verdict.ok) return
  console.error(`STOP: this checkout is NOT confirmed to be dev-test.`)
  for (const p of verdict.problems) console.error(`  - ${p}`)
  console.error(`Run npm run db:which and resolve it before running this script.`)
  process.exit(1)
}

async function flesh(groupId: string) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: { memberships: true },
  })
  if (!group) throw new Error(`No group with id ${groupId}`)

  const stamp = Date.now()
  const theo = await prisma.user.create({
    data: { name: "Theo", supabaseAuthId: `qa-groupinfo-theo-${stamp}` },
  })
  const ravi = await prisma.user.create({
    data: { name: "Ravi", supabaseAuthId: `qa-groupinfo-ravi-${stamp}` },
  })
  const elle = await prisma.user.create({
    data: { name: "Elle", supabaseAuthId: `qa-groupinfo-elle-${stamp}` },
  })
  await prisma.membership.createMany({
    data: [theo.id, ravi.id, elle.id].map((userId) => ({ userId, groupId })),
  })

  // A live gauge with Theo's seeded yes: removing Theo should visibly drop
  // the tally on the group home (decision 7's self-heal, observed for real).
  const now = new Date()
  const target = new Date(now)
  target.setDate(target.getDate() + 2)
  const proposedDate = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`
  const startsAtUtc = zonedWallTimeToUtc(proposedDate, "19:00", group.timeZone)

  const orbitMessage = await prisma.message.create({
    data: {
      groupId,
      authorType: MessageAuthor.ORBIT,
      body: "Theo floated beers. If three of you are in, I'll set it up.",
    },
  })
  const gauge = await createGauge({
    groupId,
    orbitMessageId: orbitMessage.id,
    sourceMessageId: null,
    activityLabel: "beers",
    proposedDate,
    proposedTime: "19:00",
    startsAtUtc,
    closesAt: gaugeClosesAt(startsAtUtc, now),
    seedVoterIds: [theo.id],
  })

  console.log(`Fleshed group ${group.name} (${groupId}):`)
  console.log(`  members added: Theo, Ravi, Elle`)
  console.log(`  live gauge: beers, ${proposedDate} 19:00 ${group.timeZone}, Theo seeded IN`)
  console.log(`  gauge id: ${gauge.id}`)
  console.log(`Links:`)
  console.log(`  group home:  http://localhost:3000/groups/${groupId}`)
  console.log(`  group info:  http://localhost:3000/groups/${groupId}/info`)
  console.log(`  invite link: http://localhost:3000/join/${group.inviteToken}`)
}

async function main() {
  requireDevTest()

  const fleshAt = process.argv.indexOf("--flesh")
  if (fleshAt === -1) {
    console.error("Usage: npx tsx --env-file=.env scripts/qa-stage-groupinfo.ts --flesh <groupId>")
    process.exit(1)
  }
  const id = process.argv[fleshAt + 1]
  if (!id) throw new Error("--flesh needs a group id")
  await flesh(id)
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

Before running: check `createGauge`'s actual signature in `src/lib/gauges/create.ts` and `gaugeClosesAt`'s in `src/lib/orbit/spark-copy.ts`; the field names above follow the qa-stage-daycomment precedent but must be verified against the real exports, and adjusted to match if they differ (that adjustment is expected, not drift).

- [ ] **Step 2: Verify Vitest does not collect it**

Run: `npx vitest run scripts/ 2>&1 | tail -3`
Expected: only `db-which.test.ts` runs from scripts/; the new file is not collected (it is not named `*.test.ts`).

- [ ] **Step 3: Stage and walk through, gathering evidence**

1. `npm run db:which` (must print the dev-test ref and exit 0).
2. Browser: complete onboarding as "[QA] Group Info" with two rhythms, one carrying a venue (e.g. "climbing Mon and Wed mornings at 8 at The Boulder Barn, and beers now and then"). Note the group id from the URL.
3. Run the script's `--flesh <groupId>`.
4. **Founder walkthrough** (same browser session): open group info. Verify: emblem initials, name, "4 members"; invite pill + teal share; "Reset link" present; WHO reads founder first then Theo · Ravi · Elle with "Manage members"; rhythm rows show formatter copy with " · The Boulder Barn" on the venue rhythm; hint line; NO Leave button. Then: group home shows the beers tally including Theo; back to info, Manage members → Remove Theo → confirm; WHO drops Theo, count drops to 3; group home tally no longer counts Theo (the self-heal, observed). Then: copy the invite URL, Reset link → confirm; pill shows a new token; the OLD URL in a fresh tab lands on the bad-invite screen; the NEW URL lands on the join form.
5. **Member walkthrough** (second browser profile or private window): join via the new invite link as "Jesse". Open group info. Verify: invite pill and share ARE visible (the slice's headline change), "Manage members" and "Reset link" are NOT, Leave group IS. Desktop share fallback: click share, expect "Copied!" and the URL on the clipboard. Then Leave group → confirm copy reads "Leave [QA] Group Info?" / "You can always rejoin with the invite link." → confirm → lands on the front door. Rejoin via invite link to prove the promise true.
6. **Non-member walkthrough** (third private window, no join): open `/groups/<id>/info` directly. Verify: identity block and card render; NO invite pill, NO share, NO Leave.
7. **Visual comparison** (the spec's visual-claim rule): open `docs/design/group-info-handoff/wireframes/group-info.html` in one window and the rendered member view in another, side by side. Compare layout, hierarchy, and the four recorded deviations (they should be the ONLY differences of intent). "Matches the design" may only be claimed from this comparison; otherwise say what differs.
8. Screenshot or transcribe each verification point; this is the PR's evidence. Note anything that could not be verified and say so rather than claiming it.

- [ ] **Step 4: Commit**

```bash
git add scripts/qa-stage-groupinfo.ts
git commit -m "Stage the group-info QA walkthrough"
```

---

### Task 11: Records, current state, and finishing

**Files:**
- Modify: `docs/build-notes.md` (complete the "The full group-info page (10 Aug 2026)" §11 entry started at slice open)
- Modify: `CLAUDE.md` ("Where the build is": describe the shipped page; rewrite the "Next slice" paragraph to the joining arc, per the triage order)

- [ ] **Step 1: Complete the §11 entry**

Append to the existing entry (never rewrite it): spec path; what shipped as a member experiences it; the decisions confirmed in build (silent departures, no founder leave, manage toggle, member-only invite visibility, remove-then-reset); the walkthrough evidence from Task 10 (what was observed, quoted, and what was not covered); suite before (47 files, 692 tests) and after (actual numbers); debt opened (founder exit, removal-is-not-a-lock, undesigned manage state); and that no migration, model call, or pre-deploy item was added.

- [ ] **Step 2: Update CLAUDE.md's current-state section**

Rewrite the group-info-relevant lines of "Where the build is": the stub is gone, describe what the page now is (one short paragraph in the established style), and point the "Next slice" paragraph at the joining arc (share moment plus "Jesse joined", one slice), citing the triage order. Keep the section terse; the §11 entry carries the detail.

- [ ] **Step 3: Final verification**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean and green. Record the final counts in the §11 entry (Step 1 can be amended in the same commit if the numbers were placeholders until now).

- [ ] **Step 4: Commit**

```bash
git add docs/build-notes.md CLAUDE.md
git commit -m "Record the group-info slice's decisions and current state"
```

After this task: whole-branch review, then the PR with the QA script per `~/.claude/checklists/pr-handoff.md` (five-minute script, seeded state, running server, clickable links, review report in the body). Open the PR and stop; the merge signal is the owner's.
