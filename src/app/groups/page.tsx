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
    // height, not minHeight: YourGroupsScreen's internal scroll region is
    // flex: 1 1 auto with minHeight: 0, which can only shrink to fit a
    // BOUNDED ancestor. minHeight: 100dvh (src/app/page.tsx's pattern) is a
    // floor, not a bound, so a flex child can't resolve against it and the
    // list would grow past the viewport instead of scrolling inside it. This
    // element has to both establish that bound (height) and be the flex
    // column YourGroupsScreen's own root expects to sit inside.
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
