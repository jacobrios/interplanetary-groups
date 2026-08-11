# Joining Arc Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Onboarding ends with a real step 3 that hands the founder the invite link, and a first join through that link writes a quiet "Jesse joined" system line into the group feed inside the same transaction as the membership.

**Architecture:** The Message author enum gains the reserved SYSTEM value via one migration. The join transaction switches its membership upsert to `createMany(skipDuplicates)` so a first join is atomically distinguishable from a re-tap, and writes the announcement only on a first join. Orbit's detection window fetch moves into a small lib function that excludes SYSTEM rows. On the founder side, `createGroupAction` stops redirecting and returns `{ groupId, inviteToken }`; the client wizard gains a `"share"` state rendering a new `Step3Share`, and every wizard step gets a new shared `WizardHeader` (Orbit avatar + "Step N of 3").

**Tech Stack:** Next.js 16 (App Router, server actions), Prisma 7 (driver adapter, CLI-generated migrations), Vitest (integration tests hit the dev-test database; component tests use the existing idiom in `src/app/groups/[id]/__tests__/`), Supabase auth only.

**Spec:** `docs/superpowers/specs/2026-08-11-joining-arc-design.md` — read it first. Design source: `docs/design/joining-arc-handoff/` (build-time decisions override it; known overrides listed in its `HANDOFF-NOTES.md`).

## Global Constraints

- **Two databases, never crossed:** run `npm run db:which` before any migration or seed; it must print the dev-test ref and exit zero. Never read `.env` for this.
- **Work in place on `feat/joining-arc`.** No worktrees (standing owner rule).
- **TDD:** every new test is written first and shown failing before the code that passes it.
- **Migrations are created only by `npx prisma migrate dev`** — hooks block direct edits to migration files. Prisma 7 does not auto-run `prisma generate`; run it after migrating.
- **The suite must stay green from an empty database:** tests build their own fixtures; prefix seeded names with `[TEST]` and clean up in `afterAll` (see `src/lib/groups/__tests__/join.test.ts` for the idiom).
- **Copy is exact.** Announcement body: `` `${user.name} joined` ``. Orbit's share-step line (em dash deliberately removed from the mockup's): "Here's your invite link. Send it to anyone you want. They just tap to join, and you can share it again anytime from inside your group. Ready? Head in below." Step-2 confirm label: "Looks right, set up invites". Step-3 proceed: "Take me to my group". Caption: "You can invite people now or anytime later". Eyebrow: "Group invite link" (rendered uppercase by CSS). Header: "Orbit" over "Step {N} of 3" (uppercased by CSS). No em dashes in any Orbit-voice copy.
- **Color and type rules:** teal (`--color-teal`) marks at most one primary action per element (the share button). Lime is never an action. The system line renders at `--type-meta` (15px, above the 13px floor), centered, `--text-secondary`, no bubble, no avatar.
- **Commit style:** sentence-case subject describing the change, body explaining why in product language, ending with both lines: `Co-Authored-By: Claude <noreply@anthropic.com>` and `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Next.js 16 / Prisma 7 conventions have shifted from training data.** If unsure, read `node_modules/next/dist/docs/` before writing Next-specific code.

---

### Task 1: Record the suite baseline

**Files:**
- Modify: `docs/build-notes.md` (§11, append a new entry stub at the section's end)

**Interfaces:**
- Produces: the baseline numbers Task 9's full §11 entry and the PR body will cite.

- [ ] **Step 1: Confirm the database**

Run: `npm run db:which`
Expected: prints the dev-test ref `pxbewardwvoyqqcvogel`, exit 0. If not, STOP and ask the owner.

- [ ] **Step 2: Run the full suite**

Run: `npm test`
Expected: all green. Note the exact file and test counts from the summary line.

- [ ] **Step 3: Cross-check against the previous slice's finishing number**

Open `docs/build-notes.md`, find the group-info slice's §11 entry (the most recent), and its "suite after" numbers. They must match Step 2's counts. If they do not, record the discrepancy verbatim in the new entry stub and flag it in the session; do not silently absorb it.

- [ ] **Step 4: Append the entry stub to §11**

At the end of §11 in `docs/build-notes.md`, append (with real numbers in place of N/M):

```markdown
### The joining arc: the share moment and the join announcement (started 11 Aug 2026)

Slice started from main at db5b37d. Suite baseline before any code: N files,
M tests, all green, matching the group-info slice's finishing number. Spec:
docs/superpowers/specs/2026-08-11-joining-arc-design.md. The rest of this
entry is written at slice close.
```

- [ ] **Step 5: Commit**

```bash
git add docs/build-notes.md
git commit -m "Record the joining-arc suite baseline before any code"
```

(Include the standard body and co-author lines per Global Constraints.)

---

### Task 2: Migration — MessageAuthor gains SYSTEM

**Files:**
- Modify: `prisma/schema.prisma` (the `enum MessageAuthor` block at lines 197–200)
- Create (via CLI only): `prisma/migrations/<timestamp>_add_system_message_author/`

**Interfaces:**
- Produces: `MessageAuthor.SYSTEM` importable from `@prisma/client`, used by Tasks 3, 4, and 5.

- [ ] **Step 1: Confirm the database again**

Run: `npm run db:which`
Expected: dev-test ref, exit 0.

- [ ] **Step 2: Edit the enum in `prisma/schema.prisma`**

```prisma
enum MessageAuthor {
  MEMBER
  ORBIT
  SYSTEM
}
```

Also update the docblock above `model Message` (lines 170–171): the sentence "Future extensibility: a SYSTEM value … without another migration." becomes "SYSTEM (added Aug 2026, joining-arc slice) carries the 'Jesse joined' join announcement: authorId null, body composed deterministically at write time."

- [ ] **Step 3: Create the migration**

Run: `npx prisma migrate dev --name add_system_message_author`
Expected: a new migration folder, applied cleanly to the dev-test database.

- [ ] **Step 4: Regenerate the client**

Run: `npx prisma generate`
Expected: success; `MessageAuthor.SYSTEM` now exists in the generated types.

- [ ] **Step 5: Run the suite**

Run: `npm test`
Expected: same counts as the Task 1 baseline, all green (an enum addition breaks nothing).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "Give MessageAuthor the SYSTEM value the schema reserved"
```

---

### Task 3: The join announcement, inside the join transaction

**Files:**
- Modify: `src/lib/groups/join.ts`
- Test: `src/lib/groups/__tests__/join.test.ts` (append to the existing describe block; reuse its `groupIds`/`userIds` cleanup arrays)

**Interfaces:**
- Consumes: `MessageAuthor.SYSTEM` (Task 2).
- Produces: no signature change — `joinGroupByInvite(input): Promise<JoinResult>` still returns `{ user, group }`. The announcement is an internal effect. Messages cascade-delete with their group, so the existing cleanup already covers them.

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe("joinGroupByInvite", ...)` block (imports at top gain `import { MessageAuthor } from "@prisma/client"`):

```ts
it("announces a first join with exactly one SYSTEM message in the feed", async () => {
  const founderAuthId = `test-founder-announce-${Date.now()}`
  const founder = await prisma.user.create({
    data: { name: "[TEST] Founder Announce", supabaseAuthId: founderAuthId },
  })
  const group = await prisma.group.create({
    data: { name: "[TEST] Group Announce", founderId: founder.id },
  })
  groupIds.push(group.id)
  userIds.push(founder.id)

  const { user } = await joinGroupByInvite({
    supabaseAuthId: `test-joiner-announce-${Date.now()}`,
    memberName: "[TEST] Jesse",
    inviteToken: group.inviteToken,
  })
  userIds.push(user.id)

  const announcements = await prisma.message.findMany({
    where: { groupId: group.id, authorType: MessageAuthor.SYSTEM },
  })
  expect(announcements).toHaveLength(1)
  expect(announcements[0].body).toBe("[TEST] Jesse joined")
  expect(announcements[0].authorId).toBeNull()
})

it("does not announce a re-tap of the invite link", async () => {
  const founderAuthId = `test-founder-retap-${Date.now()}`
  const founder = await prisma.user.create({
    data: { name: "[TEST] Founder Retap", supabaseAuthId: founderAuthId },
  })
  const group = await prisma.group.create({
    data: { name: "[TEST] Group Retap", founderId: founder.id },
  })
  groupIds.push(group.id)
  userIds.push(founder.id)

  const joinerAuthId = `test-joiner-retap-${Date.now()}`
  const { user } = await joinGroupByInvite({
    supabaseAuthId: joinerAuthId,
    memberName: "[TEST] Retap Member",
    inviteToken: group.inviteToken,
  })
  userIds.push(user.id)
  await joinGroupByInvite({
    supabaseAuthId: joinerAuthId,
    memberName: "[TEST] Retap Member",
    inviteToken: group.inviteToken,
  })

  const announcements = await prisma.message.findMany({
    where: { groupId: group.id, authorType: MessageAuthor.SYSTEM },
  })
  expect(announcements).toHaveLength(1)
})

it("announces an existing user by their stored name, never the submitted name", async () => {
  const existingAuthId = `test-existing-announce-${Date.now()}`
  const existingUser = await prisma.user.create({
    data: { name: "[TEST] Stored Name", supabaseAuthId: existingAuthId },
  })
  userIds.push(existingUser.id)

  const founderAuthId = `test-founder-stored-${Date.now()}`
  const founder = await prisma.user.create({
    data: { name: "[TEST] Founder Stored", supabaseAuthId: founderAuthId },
  })
  const group = await prisma.group.create({
    data: { name: "[TEST] Group Stored", founderId: founder.id },
  })
  groupIds.push(group.id)
  userIds.push(founder.id)

  await joinGroupByInvite({
    supabaseAuthId: existingAuthId,
    memberName: "[TEST] Submitted Name",
    inviteToken: group.inviteToken,
  })

  const announcements = await prisma.message.findMany({
    where: { groupId: group.id, authorType: MessageAuthor.SYSTEM },
  })
  expect(announcements).toHaveLength(1)
  expect(announcements[0].body).toBe("[TEST] Stored Name joined")
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/groups/__tests__/join.test.ts`
Expected: the three new tests FAIL (zero SYSTEM messages found); the four existing tests still pass.

- [ ] **Step 3: Implement**

In `src/lib/groups/join.ts`, add `MessageAuthor` to the prisma-client import and replace the `membership.upsert` block (lines 43–49) with:

```ts
    // First join vs re-tap, decided atomically: createMany(skipDuplicates)
    // maps to ON CONFLICT DO NOTHING, so a duplicate never aborts the
    // transaction (a plain create would poison it) and count tells us
    // which case this was without a second read.
    const { count } = await tx.membership.createMany({
      data: [{ userId: user.id, groupId: group.id }],
      skipDuplicates: true,
    })

    // The group sees the person the link produced (spec, joining arc): the
    // announcement rides the same transaction as the membership, so neither
    // can exist without the other, and a re-tap (count 0) announces nothing.
    // Body is composed deterministically from the stored name; authorId stays
    // null because SYSTEM is nobody, the same reasoning that keeps Orbit out
    // of rosters.
    if (count === 1) {
      await tx.message.create({
        data: {
          groupId: group.id,
          authorType: MessageAuthor.SYSTEM,
          authorId: null,
          body: `${user.name} joined`,
        },
      })
    }
```

Update the function docblock's point 3 to describe createMany-skipDuplicates instead of upsert, and add a point 4 for the announcement.

- [ ] **Step 4: Run the file's tests, then the full suite**

Run: `npx vitest run src/lib/groups/__tests__/join.test.ts` then `npm test`
Expected: all green, suite count = baseline + 3.

- [ ] **Step 5: Commit**

```bash
git add src/lib/groups/join.ts src/lib/groups/__tests__/join.test.ts
git commit -m "Announce a first join in the feed, inside the join transaction"
```

---

### Task 4: Keep the announcement out of Orbit's reading

**Files:**
- Create: `src/lib/orbit/fetch-window.ts`
- Modify: `src/app/actions/detect-intent.ts:87-106` (the `prior` fetch and `toWindowMessage`)
- Test: `src/lib/orbit/__tests__/fetch-window.test.ts`

**Interfaces:**
- Consumes: `WINDOW_MESSAGES`, `WindowMessage` from `src/lib/orbit/window.ts` (unchanged); `MessageAuthor.SYSTEM` (Task 2).
- Produces: `fetchPriorWindow(groupId: string, trigger: { id: string; createdAt: Date }): Promise<WindowMessage[]>` — the prior window, oldest first, trigger excluded, SYSTEM rows excluded.

Why this shape: the exclusion must be provable by a test. Extracting the fetch into a lib function makes the query testable against the real database without duplicating it, and leaves `window.ts` pure as designed. Without the filter, a SYSTEM row (null author, not Orbit) would render in Orbit's prompt as "A former member: Jesse joined" via the fallback at `src/lib/orbit/window.ts:40` — wrong and misleading.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/orbit/__tests__/fetch-window.test.ts
import { describe, it, expect, afterAll } from "vitest"
import { MessageAuthor } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { fetchPriorWindow } from "../fetch-window"

describe("fetchPriorWindow", () => {
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

  it("returns member and Orbit lines oldest first and excludes SYSTEM rows", async () => {
    const founder = await prisma.user.create({
      data: {
        name: "[TEST] Window Founder",
        supabaseAuthId: `test-window-${Date.now()}`,
      },
    })
    const group = await prisma.group.create({
      data: { name: "[TEST] Window Group", founderId: founder.id },
    })
    groupIds.push(group.id)
    userIds.push(founder.id)

    // Explicit createdAt values so ordering never rides on same-ms ties.
    const base = Date.now() - 60_000
    await prisma.message.create({
      data: {
        groupId: group.id,
        authorType: MessageAuthor.MEMBER,
        authorId: founder.id,
        body: "member line",
        createdAt: new Date(base),
      },
    })
    await prisma.message.create({
      data: {
        groupId: group.id,
        authorType: MessageAuthor.SYSTEM,
        authorId: null,
        body: "[TEST] Jesse joined",
        createdAt: new Date(base + 1000),
      },
    })
    await prisma.message.create({
      data: {
        groupId: group.id,
        authorType: MessageAuthor.ORBIT,
        authorId: null,
        body: "orbit line",
        createdAt: new Date(base + 2000),
      },
    })
    const trigger = await prisma.message.create({
      data: {
        groupId: group.id,
        authorType: MessageAuthor.MEMBER,
        authorId: founder.id,
        body: "trigger line",
        createdAt: new Date(base + 3000),
      },
    })

    const window = await fetchPriorWindow(group.id, trigger)

    expect(window.map((m) => m.body)).toEqual(["member line", "orbit line"])
    expect(window[0].authorName).toBe("[TEST] Window Founder")
    expect(window[1].isOrbit).toBe(true)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/orbit/__tests__/fetch-window.test.ts`
Expected: FAIL — module `../fetch-window` does not exist.

- [ ] **Step 3: Implement `src/lib/orbit/fetch-window.ts`**

```ts
// src/lib/orbit/fetch-window.ts
//
// Fetches the conversational window's prior messages for intent detection.
// Extracted from detect-intent so the query is pinned by a test; window.ts
// stays pure (rendering only) and this file owns the fetch.
//
// SYSTEM rows are excluded on purpose (joining-arc spec): a join
// announcement has a null author and is not Orbit, so window.ts's
// "A former member" fallback would mislabel it in the model's prompt.
// Orbit deliberately does not know who joined; whether it should is a
// recorded open question, not an accident of this query.

import { prisma } from "@/lib/prisma"
import { MessageAuthor } from "@prisma/client"
import { WINDOW_MESSAGES, type WindowMessage } from "./window"

export async function fetchPriorWindow(
  groupId: string,
  trigger: { id: string; createdAt: Date }
): Promise<WindowMessage[]> {
  const prior = await prisma.message.findMany({
    where: {
      groupId,
      id: { not: trigger.id },
      createdAt: { lte: trigger.createdAt },
      authorType: { in: [MessageAuthor.MEMBER, MessageAuthor.ORBIT] },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: WINDOW_MESSAGES - 1,
    include: { author: true },
  })
  return prior.reverse().map((m) => ({
    authorName: m.author?.name ?? null,
    isOrbit: m.authorType === MessageAuthor.ORBIT,
    body: m.body,
    createdAt: m.createdAt,
  }))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/orbit/__tests__/fetch-window.test.ts`
Expected: PASS.

- [ ] **Step 5: Switch detect-intent to the lib function**

In `src/app/actions/detect-intent.ts`, replace the `prior` fetch and `toWindowMessage` block (lines 87–106) with:

```ts
    // The conversational window: the 19 messages before the trigger plus the
    // trigger itself, oldest first. Fetched via fetchPriorWindow (which
    // excludes SYSTEM announcements from Orbit's reading, by spec) so the
    // trigger is always the marked last entry even under created-at ties.
    const priorWindow = await fetchPriorWindow(group.id, message)
    const conversationBlock = buildConversationWindow(
      [
        ...priorWindow,
        {
          // The trigger is always a MEMBER message (guarded above).
          authorName: message.author?.name ?? null,
          isOrbit: false,
          body: message.body,
          createdAt: message.createdAt,
        },
      ],
      group.timeZone,
      now
    )
```

Add `import { fetchPriorWindow } from "@/lib/orbit/fetch-window"` and remove the now-unused `WINDOW_MESSAGES` import (and the `WindowMessage` type import if nothing else uses it).

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: all green (the existing window-rendering tests in `src/lib/orbit/__tests__/` are untouched and still pin `buildConversationWindow`).

- [ ] **Step 7: Commit**

```bash
git add src/lib/orbit/fetch-window.ts src/lib/orbit/__tests__/fetch-window.test.ts src/app/actions/detect-intent.ts
git commit -m "Keep join announcements out of Orbit's detection window"
```

---

### Task 5: The feed renders the system line

**Files:**
- Modify: `src/app/groups/[id]/MessageFeed.tsx` (the map body starting at line 123, and the header comment's chat-voice list)
- Test: `src/app/groups/[id]/__tests__/MessageFeed.test.tsx` (new file; match the idiom of the neighboring component tests, e.g. `PendingStrip.test.tsx`)

**Interfaces:**
- Consumes: `MessageAuthor.SYSTEM` (Task 2); `FeedMessage` (unchanged — `authorType` widens automatically with the enum).
- Produces: a third rendering kind. Without it a SYSTEM row falls into the member branch and renders as a bubble labeled "Member" (the `authorName ?? "Member"` fallback at line 192).

- [ ] **Step 1: Write the failing test**

```tsx
// src/app/groups/[id]/__tests__/MessageFeed.test.tsx
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { MessageAuthor } from "@prisma/client"
import MessageFeed from "../MessageFeed"

describe("MessageFeed system messages", () => {
  it("renders a SYSTEM message as a quiet centered line, never as a member bubble", () => {
    // jsdom has no scrollIntoView; the feed calls it on mount.
    Element.prototype.scrollIntoView = vi.fn()

    render(
      <MessageFeed
        viewerId={null}
        messages={[
          {
            id: "m-sys-1",
            authorType: MessageAuthor.SYSTEM,
            authorId: null,
            authorName: null,
            body: "Jesse joined",
            createdAt: new Date(),
          },
        ]}
      />
    )

    const line = screen.getByText("Jesse joined")
    expect(line).toBeTruthy()
    // The member-branch fallback label must not appear anywhere.
    expect(screen.queryByText("Member")).toBeNull()
    // Centered, meta-size, secondary color — the quiet-line treatment.
    expect(line.style.textAlign).toBe("center")
    expect(line.style.fontSize).toBe("var(--type-meta)")
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run "src/app/groups/[id]/__tests__/MessageFeed.test.tsx"`
Expected: FAIL — the body renders inside a member bubble with a "Member" label, and the style assertions miss.

- [ ] **Step 3: Implement the third kind**

In `src/app/groups/[id]/MessageFeed.tsx`, at the very top of the `messages.map` callback (before the `isOrbit` line at 124), add:

```tsx
        // System announcements ("Jesse joined"): the room noticing, not anyone
        // speaking. Centered quiet line — no bubble, no avatar, no name label
        // (§7: bubbles are for dialogue, and nobody replies to a join).
        if (msg.authorType === MessageAuthor.SYSTEM) {
          return (
            <p
              key={msg.id}
              style={{
                width: "100%",
                textAlign: "center",
                fontSize: "var(--type-meta)",
                lineHeight: "var(--leading-normal)",
                color: "var(--text-secondary)",
                margin: 0,
              }}
            >
              {msg.body}
            </p>
          )
        }
```

Also extend the header comment's chat-voice list (lines 9–16) with one line: `// - System ("Jesse joined"): centered quiet line, no bubble, no avatar.`

- [ ] **Step 4: Run the test, then the full suite**

Run: `npx vitest run "src/app/groups/[id]/__tests__/MessageFeed.test.tsx"` then `npm test`
Expected: PASS, suite all green.

- [ ] **Step 5: Commit**

```bash
git add "src/app/groups/[id]/MessageFeed.tsx" "src/app/groups/[id]/__tests__/MessageFeed.test.tsx"
git commit -m "Render join announcements as a quiet centered feed line"
```

---

### Task 6: Lift ShareInviteLink into shared components

**Files:**
- Move: `src/app/groups/[id]/info/ShareInviteLink.tsx` → `src/components/ShareInviteLink.tsx` (git mv; do not edit the component body)
- Move: `src/app/groups/[id]/info/__tests__/ShareInviteLink.test.tsx` → `src/components/__tests__/ShareInviteLink.test.tsx` (fix its import path to `../ShareInviteLink`)
- Modify: `src/app/groups/[id]/info/page.tsx` (import path only)

**Interfaces:**
- Produces: `import ShareInviteLink from "@/components/ShareInviteLink"` with unchanged props `{ inviteToken: string; groupName: string }`. Task 8 consumes it; the info page keeps consuming it.

Why: the share step needs the exact same button, and the standing complaint about duplicated UI (build-notes §8) says move, never copy.

- [ ] **Step 1: Move the files**

```bash
git mv "src/app/groups/[id]/info/ShareInviteLink.tsx" src/components/ShareInviteLink.tsx
git mv "src/app/groups/[id]/info/__tests__/ShareInviteLink.test.tsx" src/components/__tests__/ShareInviteLink.test.tsx
```

- [ ] **Step 2: Fix the two import sites**

In `src/components/__tests__/ShareInviteLink.test.tsx`: the component import becomes `../ShareInviteLink`.
In `src/app/groups/[id]/info/page.tsx`: the import becomes `import ShareInviteLink from "@/components/ShareInviteLink"`.

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: all green, same count as after Task 5 (the moved test still runs).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Lift ShareInviteLink into shared components for the share step"
```

---

### Task 7: WizardHeader

**Files:**
- Create: `src/components/WizardHeader.tsx`
- Test: `src/components/__tests__/WizardHeader.test.tsx`

**Interfaces:**
- Consumes: `Chevron` from `src/components/Chevron.tsx` (`direction: "left" | "right"`, inherits currentColor).
- Produces: `WizardHeader({ step, onBack }: { step: 1 | 2 | 3; onBack?: () => void })` — named export. Task 8 renders it above every wizard step.

Design source: the handoff's `S2Header` (`walkthrough-frames-1.jsx:20-30`, styles `walkthrough.css:95-105`), translated into the app's inline-style idiom and tokens. The avatar is the product's letter-O placeholder (matching `OrbitBubble`), not the mascot face — spec decision.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/__tests__/WizardHeader.test.tsx
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { WizardHeader } from "../WizardHeader"

describe("WizardHeader", () => {
  it("names Orbit and counts the step", () => {
    render(<WizardHeader step={1} />)
    expect(screen.getByText("Orbit")).toBeTruthy()
    expect(screen.getByText("Step 1 of 3")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull()
  })

  it("shows a back control only when a back path exists, and wires it", () => {
    const onBack = vi.fn()
    render(<WizardHeader step={2} onBack={onBack} />)
    screen.getByRole("button", { name: "Back" }).click()
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/__tests__/WizardHeader.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

```tsx
// src/components/WizardHeader.tsx
//
// The onboarding wizard's header (handoff S2Header): Orbit's avatar and name
// with "Step N of 3" beneath, and a back chevron only where back is real.
// The avatar is the product's letter-O placeholder, same as OrbitBubble; the
// real mascot face is queued for the visual-polish pass (spec decision).

"use client"

import Chevron from "./Chevron"

interface Props {
  step: 1 | 2 | 3
  /** Present only where back is real; step 3 never passes it (the group exists). */
  onBack?: () => void
}

export function WizardHeader({ step, onBack }: Props) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        marginBottom: "1.5rem",
      }}
    >
      {onBack && (
        <button
          aria-label="Back"
          onClick={onBack}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            color: "var(--text-secondary)",
            display: "flex",
            alignItems: "center",
          }}
        >
          <Chevron direction="left" />
        </button>
      )}
      <div
        aria-label="Orbit"
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          backgroundColor: "var(--color-lime)",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "0.875rem",
          fontWeight: 700,
          color: "#0a0a0a",
        }}
      >
        O
      </div>
      <div>
        <p
          style={{
            fontSize: "var(--type-heading)",
            lineHeight: "var(--leading-tight)",
            fontWeight: 700,
            margin: 0,
          }}
        >
          Orbit
        </p>
        <p
          style={{
            fontSize: "var(--type-eyebrow)",
            lineHeight: "var(--leading-normal)",
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--text-secondary)",
            fontWeight: 600,
            margin: "0.125rem 0 0",
          }}
        >
          Step {step} of 3
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the test, then the full suite**

Run: `npx vitest run src/components/__tests__/WizardHeader.test.tsx` then `npm test`
Expected: PASS, all green.

- [ ] **Step 5: Commit**

```bash
git add src/components/WizardHeader.tsx src/components/__tests__/WizardHeader.test.tsx
git commit -m "Build the wizard header with the designed step counter"
```

---

### Task 8: The share step

**Files:**
- Modify: `src/app/actions/create-group.ts` (return instead of redirect)
- Create: `src/app/create/Step3Share.tsx`
- Modify: `src/app/create/OnboardingWizard.tsx` (share state + headers)
- Modify: `src/app/create/page.tsx` (drop the h1/subtitle; the wizard now owns the top of the screen)
- Modify: `src/app/create/Step2Playback.tsx:278` (confirm label copy)
- Test: `src/app/create/__tests__/Step3Share.test.tsx` (new directory is fine; match the component-test idiom)

**Interfaces:**
- Consumes: `WizardHeader` (Task 7), `ShareInviteLink` from `@/components/ShareInviteLink` (Task 6), `OrbitBubble` and `Chevron` from `src/components/`.
- Produces: `createGroupAction` returns `Promise<CreateGroupResult>` where `export type CreateGroupResult = { error: string } | { groupId: string; inviteToken: string }` (exported from `src/app/actions/create-group.ts`). `Step3Share` props: `{ groupId: string; inviteToken: string; groupName: string }` (default export).

Honest test scope: the wizard's state transition itself is not unit-tested (it would mean mocking three server actions); it is covered by the Task 10 browser walkthrough, and that gap is named in the PR. Step3Share and WizardHeader are component-tested.

- [ ] **Step 1: Write the failing Step3Share test**

```tsx
// src/app/create/__tests__/Step3Share.test.tsx
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import Step3Share from "../Step3Share"

const push = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}))

describe("Step3Share", () => {
  it("shows the group, the real invite URL, the share button, and the way in", () => {
    render(
      <Step3Share groupId="g1" inviteToken="tok123" groupName="Climbing Crew" />
    )
    expect(screen.getByText("Climbing Crew")).toBeTruthy()
    // jsdom's origin is http://localhost:3000; the URL is built client-side.
    expect(screen.getByText(/\/join\/tok123$/)).toBeTruthy()
    expect(screen.getByRole("button", { name: "Share invite link" })).toBeTruthy()
    expect(screen.getByText("You can invite people now or anytime later")).toBeTruthy()

    screen.getByRole("button", { name: /Take me to my group/ }).click()
    expect(push).toHaveBeenCalledWith("/groups/g1")
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/app/create/__tests__/Step3Share.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement Step3Share**

```tsx
// src/app/create/Step3Share.tsx
//
// Onboarding Step 3 (mockup 04): hand the founder the invite link at peak
// setup momentum. The group already exists when this renders, so there is no
// back affordance (recorded deviation from the mockup, spec decision). The
// display URL and the share button both build the link client-side from
// window.location.origin, so the server never needs to know its own host.

"use client"

import { useRouter } from "next/navigation"
import ShareInviteLink from "@/components/ShareInviteLink"
import { OrbitBubble } from "@/components/OrbitBubble"
import Chevron from "@/components/Chevron"

// Product-voice rule: no em dashes (the mockup's line carried one).
const ORBIT_COPY =
  "Here's your invite link. Send it to anyone you want. They just tap to join, and you can share it again anytime from inside your group. Ready? Head in below."

interface Props {
  groupId: string
  inviteToken: string
  groupName: string
}

export default function Step3Share({ groupId, inviteToken, groupName }: Props) {
  const router = useRouter()
  // Mounted only after confirm, so window exists; the guard keeps any future
  // SSR path from crashing rather than serving this component.
  const url =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/join/${inviteToken}`

  return (
    <div style={{ width: "100%", maxWidth: "28rem" }}>
      <div
        style={{
          backgroundColor: "var(--surface-card)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "0.875rem",
          padding: "0.875rem 1rem 1rem",
          marginBottom: "1.5rem",
        }}
      >
        <p
          style={{
            fontSize: "var(--type-heading)",
            lineHeight: "var(--leading-tight)",
            fontWeight: 700,
            margin: 0,
            paddingBottom: "0.5rem",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          {groupName}
        </p>
        <p
          style={{
            fontSize: "var(--type-eyebrow)",
            lineHeight: "var(--leading-normal)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--text-secondary)",
            fontWeight: 700,
            margin: "0.75rem 0 0.5rem",
          }}
        >
          Group invite link
        </p>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            border: "1px solid var(--border-subtle)",
            borderRadius: "0.625rem",
            backgroundColor: "var(--surface-input)",
            padding: "0.6875rem 0.75rem",
            marginBottom: "0.75rem",
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-secondary)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            style={{ flexShrink: 0 }}
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
          </svg>
          <span
            style={{
              fontSize: "var(--type-label)",
              color: "var(--text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {url}
          </span>
        </div>
        <ShareInviteLink inviteToken={inviteToken} groupName={groupName} />
      </div>

      <OrbitBubble>
        <p
          style={{
            fontSize: "var(--type-body)",
            lineHeight: "var(--leading-normal)",
            color: "var(--text-primary)",
            margin: 0,
          }}
        >
          {ORBIT_COPY}
        </p>
      </OrbitBubble>

      <button
        onClick={() => router.push(`/groups/${groupId}`)}
        style={{
          width: "100%",
          marginTop: "1.5rem",
          minHeight: "3.25rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.5rem",
          backgroundColor: "transparent",
          border: "1px solid var(--border-subtle)",
          borderRadius: "1.75rem",
          color: "var(--text-primary)",
          fontSize: "var(--type-body)",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Take me to my group <Chevron direction="right" />
      </button>
      <p
        style={{
          textAlign: "center",
          fontSize: "var(--type-eyebrow)",
          lineHeight: "var(--leading-normal)",
          color: "var(--text-secondary)",
          margin: "0.5rem 0 0",
        }}
      >
        You can invite people now or anytime later
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Run the Step3Share test to verify it passes**

Run: `npx vitest run src/app/create/__tests__/Step3Share.test.tsx`
Expected: PASS.

- [ ] **Step 5: Change createGroupAction's ending**

In `src/app/actions/create-group.ts`: remove the `redirect` import; add above the function:

```ts
export type CreateGroupResult =
  | { error: string }
  | { groupId: string; inviteToken: string }
```

Change the signature to `Promise<CreateGroupResult>`, and replace the final `redirect(...)` line (97) with:

```ts
  // The wizard advances to the share step (mockup 04) instead of being
  // redirected into the group; it needs the id to proceed and the token to
  // share. Returning after the reconcile keeps first-event creation fail-soft.
  return { groupId: group.id, inviteToken: group.inviteToken }
```

Update the file's header comment (lines 1–7) so it no longer claims the action redirects.

- [ ] **Step 6: Wire the wizard**

In `src/app/create/OnboardingWizard.tsx`:

1. Header comment: the flow line becomes `describe → (extraction pause) → [gap-ask rounds] → playback → confirm → share`.
2. Imports gain `Step3Share` and `import { WizardHeader } from "@/components/WizardHeader"`.
3. Line 38: `useState<"describe" | "gap" | "playback" | "share">("describe")`.
4. After the `createError` state (line 80), add:

```ts
  // Set exactly once, by a successful confirm; the share step needs the id
  // to proceed and the token to share.
  const [created, setCreated] = useState<{ groupId: string; inviteToken: string } | null>(null)
```

5. `handleConfirm` (lines 157–176): the comment at 161 goes away; the result handling becomes:

```ts
      const result = await createGroupAction({
        founderName,
        groupName,
        description,
        rhythms: rhythms.map((r) => ({
          ...r,
          venueName: r.venueName?.trim() ? r.venueName.trim() : null,
        })),
        timeZone,
      })
      if ("error" in result) {
        setCreateError(result.error)
        return
      }
      setCreated(result)
      setStep("share")
```

6. Each returned step wraps in a fragment with the header above it. Step numbering: describe is 1, gap and playback are 2, share is 3. Back wiring: playback's header back mirrors its existing `onBack` (to describe); gap's header back mirrors its existing `onEditDescription` (to describe); describe and share pass no `onBack`:

```tsx
  if (step === "share" && created) {
    return (
      <>
        <WizardHeader step={3} />
        <Step3Share
          groupId={created.groupId}
          inviteToken={created.inviteToken}
          groupName={groupName}
        />
      </>
    )
  }

  if (step === "playback" && rhythms) {
    return (
      <>
        <WizardHeader step={2} onBack={() => setStep("describe")} />
        <Step2Playback
          ...existing props unchanged...
        />
      </>
    )
  }

  if (step === "gap" && gap) {
    return (
      <>
        <WizardHeader step={2} onBack={() => setStep("describe")} />
        <StepGapAsk
          ...existing props unchanged...
        />
      </>
    )
  }

  return (
    <>
      <WizardHeader step={1} />
      <Step1Describe
        ...existing props unchanged...
      />
    </>
  )
```

(“...existing props unchanged...” means keep the exact props already in the file at lines 178–223; only the wrapper and header are new.)

- [ ] **Step 7: The page hands the top of the screen to the wizard**

In `src/app/create/page.tsx`: delete the `<h1>` ("Start your group") and the `<p>` subtitle (lines 25–44); keep `<main>` and the max-width container exactly as they are, and update the file's header comment (the share step is no longer out of scope). The step-1 exit link and everything else inside the wizard is untouched.

- [ ] **Step 8: Confirm-button copy**

In `src/app/create/Step2Playback.tsx:278`: `"Looks right, create my group"` becomes `"Looks right, set up invites"` (the `isCreating` branch "Setting things up…" stays).

- [ ] **Step 9: Run the full suite**

Run: `npm test`
Expected: all green. If any existing test pinned the old confirm copy or the old action return type, update it to the new contract in the same commit and say so in the commit body.

- [ ] **Step 10: Commit**

```bash
git add src/app/actions/create-group.ts src/app/create src/app/create/__tests__
git commit -m "Grow onboarding a third step that hands the founder the link"
```

---

### Task 9: The record

**Files:**
- Modify: `docs/build-notes.md` (three places: pre-deploy checklist, the speak-or-stay-quiet section, the §11 joining-arc entry)
- Modify: `CLAUDE.md` ("Where the build is" section)

All append-only where the file is a record: postscripts and new lines, never rewrites of existing entries.

- [ ] **Step 1: Pre-deploy checklist**

In `docs/build-notes.md`, the numbered pre-deploy checklist (§8 area, items 1–9; item 9 is the spending ceiling at line ~339) gains:

```markdown
10. **Apply migration `<timestamp>_add_system_message_author`** (joining-arc
    slice). The join announcement is dead in production without it.
```

Use the real migration folder name from Task 2.

- [ ] **Step 2: Speak-or-stay-quiet note**

At the end of the "Where Orbit decides to speak or stay quiet" section's postscripts (after the eval-coverage postscript at ~line 276), append:

```markdown
**The join announcement is not on this list, on purpose (11 Aug 2026).** The
"Jesse joined" feed line (joining-arc slice) is deterministic system speech:
no model, no judgment, no Orbit voice, written in the same transaction as the
membership itself. This list catalogs places where *Orbit* decides; a SYSTEM
message decides nothing. Recorded here so its absence reads as scoping, not
rot. The adjacent real decision is recorded in the joining-arc §11 entry:
SYSTEM rows are excluded from the detection window, so Orbit does not know
who joined, and whether it should is an open question.
```

- [ ] **Step 3: The §11 entry**

Extend the joining-arc entry stub from Task 1 with the slice's full record, in the established §11 voice (product language, decisions with reasoning). It must cover: the two halves and why they travel together; the owner decisions from the spec's "settled" list (header rides along, quiet line treatment, opaque token closing the founder-auth open question, third-wizard-step shape, no back on step 3, confirm copy change, placeholder avatar); the createMany-skipDuplicates idempotency choice; the detection-window exclusion and its open question; the debt opened (no system voice token, native-share still unexercised live, step-3 refresh fallback); the deploy obligation (checklist item 10); and the verification numbers: suite baseline from Task 1, suite after (run `npm test` and use the real counts), tests written failing-first, bench not rerun because no prompts changed. Note the walkthrough evidence will be appended by Task 10.

- [ ] **Step 4: CLAUDE.md current state**

In `CLAUDE.md` "Where the build is": add a paragraph that the joining arc is built (share step + join announcement, with the one-sentence shape of each), and update the "Next slice" paragraph to point at the .ics calendar button per the triage order. Remove or amend any line the slice made false (e.g. the §8-sourced claim that onboarding cannot say "of 3"; the "Still missing" list does not mention the share moment, but check the whole section against reality).

- [ ] **Step 5: Commit**

```bash
git add docs/build-notes.md CLAUDE.md
git commit -m "Record the joining-arc decisions, debt, and deploy obligation"
```

---

### Task 10: Browser walkthrough (evidence, not assertion)

**Files:** none (evidence gathering; screenshots + appended §11 postscript)

Use the in-app browser against the dev server (`.claude/launch.json`; never Bash for servers). Two sessions are needed: the normal pane session (founder) and a second context for the joiner (an incognito-equivalent: a second browser tab will share cookies, so use the pane for the founder and drive the joiner through a separate profile — the established pattern from prior slices' QA; check build-notes §11 group-info walkthrough for how it was done there, and follow it).

- [ ] **Step 1:** Create a group end to end: describe → (gap if triggered) → playback. Verify the header counts "Step 1 of 3" / "Step 2 of 3" on the way and the confirm button reads "Looks right, set up invites". Screenshot each step.
- [ ] **Step 2:** Confirm. Verify step 3 renders: name card, uppercase "GROUP INVITE LINK" eyebrow, real `/join/<token>` URL, teal share button, Orbit's bubble (no em dash), outlined "Take me to my group", caption, "Step 3 of 3" header, **no back chevron**. Screenshot.
- [ ] **Step 3:** Click the share button (desktop: clipboard branch). Verify "Copied!" feedback. Named gap: the native share sheet cannot be exercised here.
- [ ] **Step 4:** "Take me to my group" lands on the group home. Screenshot.
- [ ] **Step 5:** As the second session, open the invite URL, join as "Jesse". Verify Jesse lands on the group home and the feed shows the centered quiet line "Jesse joined". Screenshot.
- [ ] **Step 6:** As the founder, reload the group home: the line is there too. Screenshot.
- [ ] **Step 7:** Re-open the invite URL as Jesse and tap join again: no second line appears.
- [ ] **Step 8:** As a member, send a chat message mentioning plans; verify Orbit still responds normally (detection unbroken with a SYSTEM row in the recent feed).
- [ ] **Step 9:** Append a dated walkthrough postscript to the §11 entry with what was verified and what could not be (native share sheet), and commit:

```bash
git add docs/build-notes.md
git commit -m "Append the joining-arc walkthrough evidence"
```

After Task 10, the finishing flow (superpowers:finishing-a-development-branch, the pr-handoff checklist at ~/.claude/checklists/pr-handoff.md, and the independent read-only review) takes over; that flow, not this plan, owns the PR body, the QA script, and the review report.
