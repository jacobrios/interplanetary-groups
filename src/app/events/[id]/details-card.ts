// src/app/events/[id]/details-card.ts
//
// The details card's shell and its footer band, shared by the event page
// (a plan nobody can edit: called off, or already started) and
// EditEventDetails (a plan that can be edited, which owns the whole card so
// editing can take it over: form in the body, Never mind | Save in the band;
// owner's phone QA, 24 Sept 2026). One definition, so the two paths cannot
// render two slightly different cards. A plain module, not an export from
// the client component, because a server component importing a value from a
// "use client" module gets a client reference rather than the value.
//
// Card recipe ported from walkthrough.css .ed-card + the 569-573 override
// (surface, 1.7px hairline border, 14px radius, the product's standard card
// shadow): EventCard's and PlaybackCard's own recipe. overflow:hidden is
// load-bearing: it clips the footer band's corners to the card's radius.

import type { CSSProperties } from "react"

export const detailsCardStyle: CSSProperties = {
  backgroundColor: "var(--surface-raised)",
  border: "1.7px solid var(--hairline)",
  borderRadius: "14px",
  boxShadow: "0 1px 3px rgba(0,0,0,.35)",
  overflow: "hidden",
  marginBottom: "16px",
}

export const detailsBodyStyle: CSSProperties = { padding: "15px 16px" }

// RSVP footer band (.ed-band.footer): the screen block draws it lime-tinted
// (line 419), but the refinement pass at 596-597 strips that to transparent
// with a hairline top border; the last definition wins.
export const detailsBandStyle: CSSProperties = {
  borderTop: "1.6px solid var(--hairline)",
  padding: "13px 16px",
  backgroundColor: "transparent",
}
