// src/app/robots.ts
//
// The front door is the only page written to be found by a stranger. A group
// URL, an event URL, an invite link and an unsubscribe link are all
// credentials or contain one, and none of them belongs in a search result.
//
// This is NOT access control. robots.txt is a request that well-behaved
// crawlers honour, and nothing more. The membership wall
// (src/lib/auth/membership.ts) is what actually keeps non-members out.
//
// Link unfurlers ignore robots.txt by design, which is why the invite link's
// preview (src/app/join/[inviteToken]/page.tsx) still works.
import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/groups/", "/events/", "/join/", "/create", "/unsubscribe/"],
    },
    // Deliberately no `sitemap` key: this product has no /sitemap.xml, and a
    // file whose whole job is telling crawlers what is true should not open by
    // pointing at something that is not there.
  }
}
