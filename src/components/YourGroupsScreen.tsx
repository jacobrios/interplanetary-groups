// src/components/YourGroupsScreen.tsx
//
// The "your groups" screen (second-group-entry-point slice, Task 3). Lives
// under src/components/ rather than the app/groups tree because it is the
// one part of this screen the repo can actually test: everything else about
// the screen is server-rendered data-fetching, which Task 4 owns.
//
// Groups arrive pre-ordered (Task 2's job); this component only renders,
// never sorts.
//
// Layout order is load-bearing and was the subject of its own design round:
// header, THEN the create control, THEN the "Your groups" eyebrow, THEN the
// list. The create control sits above the list because the owner missed it
// entirely when an earlier draft put it at the bottom. The eyebrow directly
// above the list (never above the create control) fences the list so only
// what's under "Your groups" reads as a group.
//
// A plain server component, deliberately: an earlier fix round gave it a
// client boundary (a ref, a scroll listener, state) solely to drive a
// bottom-edge fade. That fade is gone (see the note above the scroll
// region), and with it the only reason this file needed to run in the
// browser at all.

import Link from "next/link"
import { OrbitMark } from "@/components/OrbitMark"
import LegalFooter from "@/components/LegalFooter"

export interface YourGroupsScreenGroup {
  id: string
  name: string
}

export function YourGroupsScreen({
  groups,
}: {
  groups: ReadonlyArray<YourGroupsScreenGroup>
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        padding: "0 20px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 11,
          // 0.875rem top, matching PageHeader's own top padding rather than
          // the design board's 6px. Every other screen in the product wears
          // its header through PageHeader, so 6px here read as this one screen
          // sitting too close to the top edge (owner's phone pass, 1 Sept
          // 2026). This screen does not use PageHeader itself: that component
          // is sticky and pads 1rem horizontally, which would misalign the
          // Orbit mark against this screen's own 20px gutter and the rows
          // beneath it. So the value is matched, not the component.
          padding: "0.875rem 0 10px",
        }}
      >
        <OrbitMark size={28} />
        <span
          style={{
            fontSize: "var(--type-heading)",
            fontWeight: 800,
            letterSpacing: "-.01em",
            color: "var(--text-primary)",
            lineHeight: "var(--leading-tight)",
            minWidth: 0,
            textWrap: "balance",
          }}
        >
          Interplanetary Groups
        </span>
      </div>

      <div style={{ flex: "0 0 auto", padding: "12px 0 2px" }}>
        {/* No aria-label: the visible label IS "Start a new group", so an
            identical aria-label would only pin the accessible name away from
            what's on screen for no benefit. The decorative plus icon is
            aria-hidden, so the link's computed name already comes out right
            from its text content alone. */}
        <Link
          href="/create"
          style={{
            minHeight: "3.05em",
            borderRadius: 28,
            // --text-faint, not --hairline: the design board's border read as
            // too quiet to notice, which is exactly why the owner missed this
            // control the first time it shipped. Do not "correct" this back
            // to --hairline.
            border: "1.5px solid var(--text-faint)",
            background: "transparent",
            color: "var(--text-primary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: ".5em",
            fontSize: "var(--type-body)",
            lineHeight: "var(--leading-normal)",
            // 700, not the board's 600: the second of the two deliberate
            // departures from the board, for the same findability reason as
            // the border above.
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          <svg
            viewBox="0 0 24 24"
            width="1.05em"
            height="1.05em"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            aria-hidden="true"
            style={{ flex: "0 0 auto" }}
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Start a new group
        </Link>
      </div>

      {/* Fences the list below it: nothing above this label reads as a
          group, which is what makes the create control above unambiguous. */}
      <div
        style={{
          flex: "0 0 auto",
          fontSize: "var(--type-eyebrow)",
          letterSpacing: ".16em",
          textTransform: "uppercase",
          color: "var(--text-faint)",
          fontWeight: 700,
          padding: "16px 2px 10px",
        }}
      >
        Your groups
      </div>

      {/* No bottom scroll-fade here, though the design boards drew one.
          Owner-ruled deviation, 1 Sept 2026, dropped in fix round 2: the
          design's own next-card-peeking-up treatment already carries the
          "there's more below" cue, so the fade was the redundant half of a
          cue delivered twice; making it actually work (paint in front of
          opaque rows, react to real scroll position) required a client
          boundary that shipped JS, and OrbitMark with it, for a screen
          that is otherwise a handful of static links; and the
          absolutely-positioned implementation it required had a latent
          bug no test here could catch — inside an unbounded flex column
          (true until Task 4 exists) it collapsed the region to 0px and
          made the whole list invisible, not merely unscrollable. */}
      <div
        style={{
          // Task 4 owns whether this region actually scrolls: overflow-y
          // auto only takes effect once something gives this element a
          // bounded height (flex 1 1 auto with minHeight 0 lets it SHRINK
          // to fit inside a bounded flex column, but manufactures no bound
          // of its own). Give the screen's root a real height (e.g. 100dvh)
          // and this region scrolls; leave it unbounded and it simply grows
          // to fit every row instead, which is a safe degrade, not a
          // failure.
          flex: "1 1 auto",
          minHeight: 0,
          overflowY: "auto",
        }}
      >
        <ul
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            listStyle: "none",
            margin: 0,
            padding: 0,
          }}
        >
          {groups.map((group) => (
            <li key={group.id}>
              <Link
                href={`/groups/${group.id}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: ".65em",
                  background: "var(--surface-raised)",
                  border: "1px solid var(--hairline)",
                  borderRadius: 14,
                  padding: "1.05em 1.1em",
                  boxShadow: "0 1px 3px rgba(0,0,0,.35)",
                  fontSize: "var(--type-heading)",
                  lineHeight: "var(--leading-tight)",
                  textDecoration: "none",
                }}
              >
                <span
                  style={{
                    fontWeight: 800,
                    letterSpacing: "-.01em",
                    color: "var(--text-primary)",
                    minWidth: 0,
                    textWrap: "balance",
                  }}
                >
                  {group.name}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {/* The legal footer, added 2 September 2026 from the owner's QA. The
          front door already carried one and he had never seen it: "/" sends
          anybody who already has a group straight past it, so this is the
          screen a signed-in person actually lands on, and without this the
          two links are unreachable from inside the product for exactly the
          people using it.

          It lives here rather than in src/app/groups/page.tsx, which is
          where the QA note named it, and the reason is NOT testability:
          src/app/groups/__tests__/page.test.tsx mocks prisma and renders
          that route for real, so either place could have been proven. The
          reason is page.tsx's own flex chain. Its header explains at length
          that <main> has ONE flex-item child, and that this child's default
          flex-shrink is what carries the 100dvh bound down into the scroll
          region below. A second child there would falsify that comment
          rather than merely sit beside it. Placed here the footer joins the
          same column the scroll region is in, inherits the screen's 20px
          gutter, and leaves that mechanism intact. It renders on /groups
          either way, and the route test asserts that it does.

          flex 0 0 auto, deliberately: the scroll region above is
          flex 1 1 auto with minHeight 0, and a shrinkable footer would let
          the browser squeeze this instead of the list it is supposed to
          bound. Quiet, not a new section: no heading, no rule above it, and
          LegalFooter's own type is the eyebrow floor in --text-faint. */}
      <div style={{ flex: "0 0 auto", padding: "18px 0 16px" }}>
        <LegalFooter />
      </div>
    </div>
  )
}
