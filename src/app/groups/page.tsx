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
    // height, not minHeight: this is what makes YourGroupsScreen's own
    // scroll region (flex: 1 1 auto, minHeight: 0) actually bounded rather
    // than merely willing to shrink. minHeight: 100dvh (src/app/page.tsx's
    // pattern, for a page that scrolls as a whole) is a floor, not a bound
    // a flex descendant can resolve against, so with minHeight here the
    // chain below would just grow past the viewport instead.
    //
    // The mechanism, confirmed with a standalone browser reproduction during
    // review rather than assumed: it is default flex-shrink, not flex-grow,
    // that carries this <main>'s bound down to the scroll region. Nothing
    // between the two is flex:1-stretched to claim space; instead, once
    // <main> has a definite height, its single flex-item child —
    // YourGroupsScreen's own root <div>, which sets no "flex" of its own and
    // so gets the browser's initial flex-shrink: 1 — is allowed to shrink
    // below its content size to fit that bound. That shrink cascades one
    // level further into YourGroupsScreen's minHeight: 0 scroll region,
    // which is what finally lets it resolve a real pixel height instead of
    // growing to fit every row, and only then does overflow-y: auto have
    // anything to act on.
    <main
      style={{
        height: "100dvh",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--surface-base)",
        color: "var(--text-primary)",
      }}
    >
      <YourGroupsScreen
        groups={ordered.map((m) => ({ id: m.group.id, name: m.group.name }))}
      />
    </main>
  )
}
