// src/app/page.tsx
//
// The front door. Session-aware rather than a static landing or a bare
// redirect: a visitor who already belongs to a group is sent straight in, and
// only someone with no group ever sees the copy below.
//
// This is the destination the rest of the navigation slice hangs off. The
// group home's Orbit logo, the not-found screen, and the error screen all
// point here, and it has to be correct whether or not the visitor has ever
// used the product before.
//
// The several-groups case lives in resolveFrontDoor and is a placeholder for
// the multi-group home (build-notes §8), not a designed behavior.
//
// No header: nothing to navigate back to, and the join screen is headerless
// for the same reason (walkthrough screen 05).

import Link from "next/link"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth/current-user"
import { resolveFrontDoor } from "@/lib/nav/front-door"

export default async function HomePage() {
  const viewer = await getCurrentUser()

  const memberships = viewer
    ? await prisma.membership.findMany({
        where: { userId: viewer.id },
        select: { groupId: true, joinedAt: true },
      })
    : []

  const destination = resolveFrontDoor(memberships)

  // redirect() throws to unwind the render, so it must not sit inside a
  // try/catch. It does not here; keep it that way.
  if (destination.kind === "group") {
    redirect(`/groups/${destination.groupId}`)
  }

  return (
    <main
      style={{
        minHeight: "100dvh",
        backgroundColor: "var(--surface-base)",
        color: "var(--text-primary)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1.5rem",
      }}
    >
      <div style={{ width: "100%", maxWidth: "28rem" }}>
        <p
          style={{
            fontSize: "var(--type-eyebrow)",
            lineHeight: "var(--leading-normal)",
            color: "var(--text-secondary)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: "0.75rem",
          }}
        >
          Interplanetary Groups
        </p>

        <h1
          style={{
            fontSize: "var(--type-display)",
            lineHeight: "var(--leading-tight)",
            fontWeight: 700,
            marginBottom: "0.75rem",
          }}
        >
          Casual plans shouldn&apos;t need a wedding planner.
        </h1>

        <p
          style={{
            fontSize: "var(--type-body)",
            lineHeight: "var(--leading-normal)",
            color: "var(--text-secondary)",
            marginBottom: "1.75rem",
          }}
        >
          But the other option is &ldquo;show up if you want,&rdquo; and then
          nobody does. Orbit picks a day, asks the group, and keeps track of
          who&apos;s in.
        </p>

        <Link
          href="/create"
          style={{
            display: "block",
            width: "100%",
            padding: "0.75rem 1.5rem",
            backgroundColor: "var(--action)",
            color: "var(--action-ink)",
            fontSize: "var(--type-body)",
            fontWeight: 600,
            borderRadius: "0.5rem",
            textAlign: "center",
            textDecoration: "none",
          }}
        >
          Start your group
        </Link>
      </div>
    </main>
  )
}
