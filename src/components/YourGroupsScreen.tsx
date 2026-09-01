"use client"

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
// This file is a client component solely for the scroll-fade cue below; the
// rest of it would happily be server-rendered.

import { useEffect, useRef, useState } from "react"
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
  const scrollRef = useRef<HTMLDivElement>(null)
  const [overflowing, setOverflowing] = useState(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    // The one honest test for "is there more to see": how much scrollable
    // distance remains below the visible viewport. A row-count guess (the
    // design's own "past roughly seven rows" prose) can't be honest, because
    // row height moves with device text size — three rows already fill a
    // screen at large text — so a fixed count would show the cue with
    // nothing below it, or hide it when there's more. The 1px tolerance
    // absorbs sub-pixel rounding right at the true end of a scroll.
    function checkOverflow() {
      if (!el) return
      setOverflowing(el.scrollHeight - el.scrollTop - el.clientHeight > 1)
    }

    checkOverflow()
    el.addEventListener("scroll", checkOverflow)
    return () => el.removeEventListener("scroll", checkOverflow)
    // Re-checks whenever the list Task 4 hands us changes shape, not only at
    // mount: a shorter or taller list can flip whether it overflows at all.
  }, [groups])

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

      <div
        style={{
          // Task 4 owns whether this region can ever actually overflow: flex
          // 1 1 auto with minHeight 0 only lets it shrink to fill LEFTOVER
          // space inside a bounded flex column. Without Task 4 giving the
          // screen's own root a real height (e.g. 100dvh), there is no
          // bottom edge for this region to overflow against, and nothing in
          // this file can manufacture one.
          flex: "1 1 auto",
          minHeight: 0,
          position: "relative",
        }}
      >
        <div
          ref={scrollRef}
          data-testid="your-groups-scroll-region"
          style={{
            position: "absolute",
            inset: 0,
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

        {/* The scroll cue itself, painted as a real overlay IN FRONT of the
            rows (a later sibling of the scroll region, both absolutely
            positioned within the same relative wrapper), never as a
            background layer sitting behind them — a background layer can
            never fade an opaque row (--surface-raised) painted on top of it.
            Pinned to the wrapper's own bottom edge rather than living inside
            the scrolling element, so it stays glued to the visible viewport
            edge regardless of scroll position, the same way the design's own
            ::after overlay did. `transparent` rather than a literal
            rgba-of-surface-base: alpha 0 has no visible colour to hardcode,
            so this never has to track --surface-base's hex if that token
            changes. `overflowing` (real scrollHeight/scrollTop/clientHeight
            arithmetic above) is the only thing that toggles it — never a row
            count. */}
        <div
          aria-hidden="true"
          data-testid="your-groups-scroll-fade"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 58,
            pointerEvents: "none",
            background: "linear-gradient(180deg, transparent, var(--surface-base))",
            opacity: overflowing ? 1 : 0,
            transition: "opacity 120ms ease",
          }}
        />
      </div>
    </div>
  )
}
