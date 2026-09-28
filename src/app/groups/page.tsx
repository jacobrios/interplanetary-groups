// src/app/groups/page.tsx
//
// The "your groups" screen (second-group-entry-point slice, Task 4). Every
// number-of-groups case renders the list, including exactly one: this is the
// deliberate split from "/", which still sends a one-group member straight
// into their group on cold arrival. Tapping the Orbit mark (Task 5) always
// lands here regardless of count, because a person who tapped chose to see
// the list, so a list of one is not a tax on them. Only zero groups redirects,
// and it redirects to "/" rather than rendering an empty list here.
//
// Members-only needs no wall and no new check: the query is keyed to the
// viewer's own memberships (userId: viewer.id), so nobody can ever see a
// group they don't belong to. There is no group-scoped read here to guard.
//
// This page is what makes FAINT_SURFACES's "surface-base, assumed" entry in
// token-contrast.test.ts true rather than assumed: it is the ancestor that
// gives YourGroupsScreen its background, since that component sets none of
// its own.

import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth/current-user"
import { orderGroupsByRecentlyOpened } from "@/lib/nav/group-order"
import { YourGroupsScreen } from "@/components/YourGroupsScreen"
import VisibleViewport from "@/components/VisibleViewport"

export default async function GroupsPage() {
  const viewer = await getCurrentUser()

  const memberships = viewer
    ? await prisma.membership.findMany({
        where: { userId: viewer.id },
        select: {
          groupId: true,
          joinedAt: true,
          lastSeenAt: true,
          group: { select: { id: true, name: true } },
        },
      })
    : []

  // redirect() throws to unwind the render, so it must not sit inside a
  // try/catch. It does not here; keep it that way (src/app/page.tsx carries
  // the same warning for the same reason).
  if (memberships.length === 0) {
    redirect("/")
  }

  const ordered = orderGroupsByRecentlyOpened(memberships)

  return (
    // VisibleViewport (home-screen-web-app slice, task 2) replaces the old
    // height: 100dvh <main>; <main> itself still exists, nested one level
    // inside VisibleViewport's own div, and is still the flex container the
    // comment below is about. The comment below, about a definite height
    // being what makes YourGroupsScreen's own scroll region bounded, still
    // holds: <main> now reads height: "100%" against VisibleViewport's
    // definite (measured pixel) height rather than a literal 100dvh, so the
    // same flex-shrink chain still carries that bound down into the scroll
    // region. minHeight, not height, is still wrong on <main> for the same
    // reason it always was.
    //
    // The mechanism, confirmed with a standalone browser reproduction during
    // review rather than assumed: it is default flex-shrink, not flex-grow,
    // that carries <main>'s bound down to the scroll region. Nothing
    // between the two is flex:1-stretched to claim space; instead, once
    // <main> has a definite height, its single flex-item child —
    // YourGroupsScreen's own root <div>, which sets no "flex" of its own and
    // so gets the browser's initial flex-shrink: 1 — is allowed to shrink
    // below its content size to fit that bound. That shrink cascades one
    // level further into YourGroupsScreen's minHeight: 0 scroll region,
    // which is what finally lets it resolve a real pixel height instead of
    // growing to fit every row, and only then does overflow-y: auto have
    // anything to act on.
    <VisibleViewport
      style={{
        backgroundColor: "var(--surface-base)",
        color: "var(--text-primary)",
      }}
    >
      {/* Kept as its own <main>, nested rather than replaced by
          VisibleViewport's own <div>, so this route keeps its main-landmark
          role. height: "100%" against VisibleViewport's own measured pixel
          height is what keeps this a definite height rather than a floor,
          which is the whole thing the comment above is about. */}
      <main
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <YourGroupsScreen
          groups={ordered.map((m) => ({ id: m.group.id, name: m.group.name }))}
        />
      </main>
    </VisibleViewport>
  )
}
