// src/lib/metadata.ts
//
// Shared values behind the product's default Open Graph and Twitter card
// metadata (src/app/layout.tsx) and the join route's own metadata
// (src/app/join/[inviteToken]/page.tsx). One source, so the two can never
// quietly drift apart, and so the join route's dead-token fallback and its
// live-group branch can each restate the full shape without retyping the
// same strings and numbers twice.
//
// Round-1 review finding, the reason both branches need the full shape:
// Next merges `openGraph` and `twitter` as whole objects per route segment,
// not field by field, so a segment that sets its own `openGraph` replaces
// the parent's entirely rather than filling gaps in it. A branch that only
// sets `{ title, description }` therefore loses the image and card type
// the root layout declared, silently. Restating the complete shape here
// keeps that from happening again and keeps the two branches provably
// identical wherever they are supposed to be.
//
// The width and height match the actual generated file at
// src/app/opengraph-image.png (scripts/build-brand-assets.ts writes it at
// exactly 1200x630). They are declared here rather than read off the file
// at request time because Open Graph metadata must be static and
// synchronous, and Next itself renders the identical read of this same
// disk file whenever a segment leaves the file-convention image
// untouched — this constant is what the fallback path uses to be
// self-contained too, per the two-copies-of-the-truth risk noted above.
export const SITE_TITLE = "Interplanetary Groups"
export const SITE_DESCRIPTION =
  "Casual plans shouldn't need a wedding planner. Orbit picks a day, asks the group, and keeps track of who's in."

export const OG_IMAGE = { url: "/opengraph-image.png", width: 1200, height: 630 }
