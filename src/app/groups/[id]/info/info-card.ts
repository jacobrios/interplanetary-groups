// src/app/groups/[id]/info/info-card.ts
//
// The group-info page's WHO/activities card shell, lifted out of page.tsx
// verbatim (task 8, group-details-editing) so EditGroupDetails.tsx can apply
// the exact same card at rest and swap it for a form in place, without page.tsx
// and EditGroupDetails.tsx carrying two hand-copied definitions that could
// drift. Values unchanged from the inline style page.tsx used to carry.

import type { CSSProperties } from "react"

export const infoCardStyle: CSSProperties = {
  marginTop: "16px",
  backgroundColor: "var(--surface-raised)",
  border: "1.7px solid var(--hairline)",
  borderRadius: "14px",
  // .gi-card's box-shadow is redefined by the later "Surfaces · cards &
  // raised elements" pass (walkthrough.css:570-573), which wins over the
  // base rule at :482-487 (last definition wins). Matches PlaybackCard.tsx
  // and EventCard.tsx's standard dark card shadow.
  boxShadow: "0 1px 3px rgba(0,0,0,.35)",
  padding: "13px 17px 5px",
}
