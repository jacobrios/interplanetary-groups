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
// The several-groups case lives in resolveFrontDoor and is a designed
// behavior (owner's call, 1 Sept 2026, second-group-entry-point slice): it
// no longer guesses at a group, it sends a several-group visitor to the
// group list instead.
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
        select: { groupId: true },
      })
    : []

  const destination = resolveFrontDoor(memberships)

  // redirect() throws to unwind the render, so it must not sit inside a
  // try/catch. It does not here; keep it that way.
  if (destination.kind === "group") {
    redirect(`/groups/${destination.groupId}`)
  }
  if (destination.kind === "groups") {
    redirect("/groups")
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
          screen's shape depends on; <main> keeps owning the full-bleed
          background and its own 4px/24px/0 padding.

          Owner's QA call (21 Aug 2026): the handoff's marginTop: auto on
          the copy block (round4-base.css .fd-copy) left a 349px / 43%
          empty gap on a 375x812 phone between the mark and the eyebrow.
          The mark, copy block and footer now read as one contiguous group,
          centered vertically in the viewport via justifyContent: "center"
          below, rather than the mark pinned to the top and the rest pinned
          to the bottom. The internal rhythm (mark's own margin, eyebrow's
          16px, headline's 9px, lede's 12px, footer's 22px 0 4px) is
          unchanged; only the composition moved. */}
      <div
        style={{
          flex: "1 1 auto",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          width: "100%",
          maxWidth: "28rem",
          margin: "0 auto",
        }}
      >
        {/* The orbit path overflows the sphere's own box, so this negative
            left margin optically aligns the sphere (not the box) with the
            24px page gutter. Source: round4-base.css .fd-mark, README item 01.
            Left-aligned deliberately: the owner's "centered on the screen"
            reads as the group being vertically centered, not the mark itself
            going horizontally centered, which would throw away this optical
            alignment against the gutter. */}
        <div style={{ width: 104, height: 104, margin: "6px 0 0 -9px", flex: "0 0 auto" }}>
          <OrbitMark size={104} />
        </div>

        <div style={{ flex: "0 0 auto" }}>
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

          {/* The email-sign-in slice's door on the front page, and a sibling
              of the note above rather than a second button: the screen's one
              real action is starting a group, and neither of these notes is
              that. It exists for the member who has none of the other ways
              in, the one who cleared their cookies or moved from phone to
              laptop and has long since lost the invite link. Without it their
              only route is to be made into a second copy of themselves.

              The link is --text-secondary against the note's --text-faint so
              the tappable half is the brighter half, which is the only signal
              carrying that here; underline does the rest. */}
          <p
            style={{
              fontSize: "var(--type-eyebrow)",
              lineHeight: "var(--leading-normal)",
              color: "var(--text-faint)",
              textAlign: "center",
              margin: "6px 0 0",
            }}
          >
            Been here before?{" "}
            <Link
              href="/signin"
              style={{
                color: "var(--text-secondary)",
                textDecoration: "underline",
              }}
            >
              Sign in with your email
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
