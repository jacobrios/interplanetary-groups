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
import { OrbitMark } from "@/components/OrbitMark"
import { ArrowRight } from "@/components/glyphs"

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
        padding: "4px 24px 0",
      }}
    >
      {/* 28rem content column, matching the slice-wide convention (join,
          event detail, group info, both dead-end screens, OrbitNoteScreen,
          the onboarding wizard). This wrapper IS the flex column the
          screen's shape depends on (marginTop: auto below pins the copy
          block and footer to the bottom while the mark stays at the top);
          <main> keeps owning the full-bleed background and its own
          4px/24px/0 padding. */}
      <div
        style={{
          flex: "1 1 auto",
          display: "flex",
          flexDirection: "column",
          width: "100%",
          maxWidth: "28rem",
          margin: "0 auto",
        }}
      >
        {/* The orbit path overflows the sphere's own box, so this negative
            left margin optically aligns the sphere (not the box) with the
            24px page gutter. Source: round4-base.css .fd-mark, README item 01. */}
        <div style={{ width: 104, height: 104, margin: "6px 0 0 -9px", flex: "0 0 auto" }}>
          <OrbitMark size={104} />
        </div>

        {/* margin-top: auto pins this block (and the footer below it) to the
            bottom of the screen while the mark stays at the top; the gap
            between absorbs longer copy. Source: round4-base.css .fd-copy. */}
        <div style={{ marginTop: "auto", flex: "0 0 auto" }}>
          <p
            style={{
              fontSize: "var(--type-eyebrow)",
              lineHeight: "var(--leading-normal)",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--text-faint)",
              fontWeight: 700,
              margin: "16px 0 0",
            }}
          >
            Interplanetary Groups
          </p>

          <h1
            style={{
              fontSize: "var(--type-display)",
              fontWeight: 800,
              lineHeight: "var(--leading-tight)",
              letterSpacing: "-0.015em",
              color: "var(--text-primary)",
              margin: "9px 0 0",
              textWrap: "balance",
            }}
          >
            Casual plans shouldn&apos;t need a wedding planner.
          </h1>

          <p
            style={{
              fontSize: "var(--type-body)",
              lineHeight: "var(--leading-normal)",
              color: "var(--text-secondary)",
              margin: "12px 0 0",
              textWrap: "pretty",
            }}
          >
            But the other option is &ldquo;show up if you want,&rdquo; and
            then nobody does. Orbit picks a day, asks the group, and keeps
            track of who&apos;s in.
          </p>
        </div>

        <div style={{ flex: "0 0 auto", padding: "22px 0 4px" }}>
          <Link
            href="/create"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5em",
              minHeight: 52,
              padding: "0.5em 1.2em",
              borderRadius: 28,
              backgroundColor: "var(--action)",
              color: "var(--action-ink)",
              fontSize: "var(--type-body)",
              lineHeight: "var(--leading-normal)",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Start your group
            <ArrowRight size="1.05em" stroke="var(--action-ink)" strokeWidth={2.4} />
          </Link>

          <p
            style={{
              fontSize: "var(--type-eyebrow)",
              lineHeight: "var(--leading-normal)",
              color: "var(--text-faint)",
              textAlign: "center",
              margin: "12px 0 0",
            }}
          >
            Already invited? Open the link you were sent.
          </p>
        </div>
      </div>
    </main>
  )
}
