// src/app/__tests__/robots.test.ts
//
// Group, event and join URLs are credentials or contain one, and none of them
// belongs in a search result. The front door is the exception: it is the only
// page written to be found by a stranger.
//
// This is NOT access control. robots.txt is a request that well-behaved
// crawlers honour; the membership wall (src/lib/auth/membership.ts) is what
// actually keeps non-members out.
import { describe, it, expect } from "vitest"
import robots from "../robots"

describe("robots", () => {
  const rules = () => {
    const r = robots().rules
    return Array.isArray(r) ? r[0] : r
  }

  it("lets crawlers see the front door", () => {
    expect(rules().allow).toBe("/")
  })

  it("keeps groups, events and invite links out of search results", () => {
    const disallow = rules().disallow
    const list = Array.isArray(disallow) ? disallow : [disallow]
    expect(list).toContain("/groups/")
    expect(list).toContain("/events/")
    expect(list).toContain("/join/")
  })

  it("does not advertise a sitemap this product does not have", () => {
    expect(robots().sitemap).toBeUndefined()
  })
})
