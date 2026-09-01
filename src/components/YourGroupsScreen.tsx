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

import Link from "next/link"
import { OrbitMark } from "@/components/OrbitMark"

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
          padding: "6px 0 10px",
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
        <Link
          href="/create"
          aria-label="Start a new group"
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

      <div
        style={{
          flex: "1 1 auto",
          minHeight: 0,
          overflowY: "auto",
          position: "relative",
          // The scroll-shadow technique (background-attachment: local vs.
          // scroll), so the fade only paints when there is real content past
          // the visible edge, never off a row count: the design's own "past
          // roughly seven rows" prose can't be honest, because row height
          // moves with device text size (three rows already fill a screen at
          // large text), so a fixed count would show a fade with nothing
          // below it and hide one when there's more. No JS, no
          // ResizeObserver.
          //
          // Layer 1 ("cover", local attachment) is glued to the bottom of
          // the FULL scrollable content, because attachment:local sizes its
          // position against the whole overflow region, not the viewport.
          // Layer 2 ("shadow", scroll attachment) is glued to the bottom of
          // the visible scrollport, because attachment:scroll is fixed to
          // the padding box. Painted in this order, layer 1 sits over layer
          // 2 and exactly hides it whenever the content's true bottom
          // coincides with the scrollport's bottom (i.e. scrolled to the
          // end: nothing left to fade into). Scroll away from the end and
          // layer 1 slides off screen with the content while layer 2 stays
          // put, uncovering the fade.
          backgroundImage:
            "linear-gradient(rgba(21,22,30,0), var(--surface-base) 70%), " +
            "linear-gradient(180deg, rgba(21,22,30,0), var(--surface-base))",
          backgroundRepeat: "no-repeat, no-repeat",
          backgroundPosition: "0 100%, 0 100%",
          backgroundSize: "100% 58px, 100% 58px",
          backgroundAttachment: "local, scroll",
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
    </div>
  )
}
