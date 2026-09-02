// src/lib/digest/__tests__/compose.test.ts
//
// Pure, DB-free tests for the digest's email composer. Fixtures are plain
// NeedsYouItem / YouMissedResult objects, the exact shape
// deriveNeedsYouItems and deriveYouMissed already return, mirroring
// lib/digest/__tests__/needs-you.test.ts and
// lib/digest/__tests__/you-missed.test.ts. Nothing here touches Prisma,
// Resend, or the network.
//
// Naming note on the discriminating tests below: decision 7 groups by the
// WORD the product uses ("RSVP" vs "vote"), not by the NeedsYouKind string.
// An implementation that grouped by "do all items share one literal `kind`
// value" would wrongly call an idea-plus-time-change mix "things" (two
// different kind strings) instead of "votes" (one product word), and would
// wrongly carry a single-kind label into the combined subject instead of
// dropping to "thing(s)". Both wrong shapes are covered explicitly.

import { describe, expect, it } from "vitest"
import { composeDigestEmail } from "@/lib/digest/compose"
import type { NeedsYouItem } from "@/lib/digest/needs-you"
import type { YouMissedResult } from "@/lib/digest/you-missed"
import type { CancellationLine } from "@/lib/digest/cancellations"

const GROUP_ID = "grp1"
const GROUP_NAME = "Climbing Crew"
const ORIGIN = "https://interplanetarygroups.com"
const TOKEN = "unsub-token-abc"

function eventItem(over: Partial<NeedsYouItem> = {}): NeedsYouItem {
  return {
    kind: "event",
    key: "e1",
    title: "Saturday morning climb",
    whenLine: "Sat, Aug 30 · 9am",
    label: "Needs your RSVP",
    url: "/events/e1",
    ...over,
  }
}

function ideaItem(over: Partial<NeedsYouItem> = {}): NeedsYouItem {
  return {
    kind: "idea",
    key: "g1",
    title: "Beers",
    whenLine: "Sat 8pm",
    label: "Needs your vote",
    url: `/groups/${GROUP_ID}`,
    ...over,
  }
}

function timeChangeItem(over: Partial<NeedsYouItem> = {}): NeedsYouItem {
  return {
    kind: "timeChange",
    key: "p1",
    title: "Monday morning climb",
    whenLine: "Move to 9am",
    label: "Needs your vote",
    url: "/events/e2",
    ...over,
  }
}

function missed(count: number, lines: YouMissedResult["lines"] = []): YouMissedResult {
  return { count, lines }
}

function baseInput(over: Partial<Parameters<typeof composeDigestEmail>[0]> = {}) {
  return {
    groupId: GROUP_ID,
    groupName: GROUP_NAME,
    needsYou: [] as NeedsYouItem[],
    youMissed: null as YouMissedResult | null,
    cancellations: [] as CancellationLine[],
    siteOrigin: ORIGIN,
    unsubscribeToken: TOKEN,
    ...over,
  }
}

describe("composeDigestEmail — both blocks empty", () => {
  it("returns null rather than an empty email", () => {
    const out = composeDigestEmail(baseInput())
    expect(out).toBeNull()
  })

  it("returns null when needsYou is empty and youMissed is explicitly null", () => {
    const out = composeDigestEmail(baseInput({ needsYou: [], youMissed: null }))
    expect(out).toBeNull()
  })
})

describe("composeDigestEmail — subject line, decision 7", () => {
  it("all RSVPs, plural: '2 RSVPs need you'", () => {
    const out = composeDigestEmail(baseInput({ needsYou: [eventItem(), eventItem({ key: "e2" })] }))
    expect(out?.subject).toBe("Climbing Crew: 2 RSVPs need you")
  })

  it("all RSVPs, singular: '1 RSVP needs you'", () => {
    const out = composeDigestEmail(baseInput({ needsYou: [eventItem()] }))
    expect(out?.subject).toBe("Climbing Crew: 1 RSVP needs you")
  })

  it("all votes via idea items alone: '2 votes need you'", () => {
    const out = composeDigestEmail(baseInput({ needsYou: [ideaItem(), ideaItem({ key: "g2" })] }))
    expect(out?.subject).toBe("Climbing Crew: 2 votes need you")
  })

  it("all votes via time-change items alone: '2 votes need you'", () => {
    const out = composeDigestEmail(
      baseInput({ needsYou: [timeChangeItem(), timeChangeItem({ key: "p2" })] })
    )
    expect(out?.subject).toBe("Climbing Crew: 2 votes need you")
  })

  // Discriminating: idea + timeChange are two different NeedsYouKind string
  // values but ONE product word ("vote"). A same-literal-kind check would
  // wrongly read this as "things".
  it("idea plus time-change (two different kinds, one product word): '2 votes need you'", () => {
    const out = composeDigestEmail(baseInput({ needsYou: [ideaItem(), timeChangeItem()] }))
    expect(out?.subject).toBe("Climbing Crew: 2 votes need you")
  })

  it("all votes, singular: '1 vote needs you'", () => {
    const out = composeDigestEmail(baseInput({ needsYou: [ideaItem()] }))
    expect(out?.subject).toBe("Climbing Crew: 1 vote needs you")
  })

  it("event mixed with idea: '2 things need you'", () => {
    const out = composeDigestEmail(baseInput({ needsYou: [eventItem(), ideaItem()] }))
    expect(out?.subject).toBe("Climbing Crew: 2 things need you")
  })

  it("event mixed with time-change: '2 things need you'", () => {
    const out = composeDigestEmail(baseInput({ needsYou: [eventItem(), timeChangeItem()] }))
    expect(out?.subject).toBe("Climbing Crew: 2 things need you")
  })

  it("messages only, plural: '6 new messages'", () => {
    const out = composeDigestEmail(baseInput({ youMissed: missed(6) }))
    expect(out?.subject).toBe("Climbing Crew: 6 new messages")
  })

  it("messages only, singular: '1 new message'", () => {
    const out = composeDigestEmail(baseInput({ youMissed: missed(1) }))
    expect(out?.subject).toBe("Climbing Crew: 1 new message")
  })

  it("both blocks: '2 things need you, plus 6 new messages'", () => {
    const out = composeDigestEmail(
      baseInput({ needsYou: [eventItem(), ideaItem()], youMissed: missed(6) })
    )
    expect(out?.subject).toBe("Climbing Crew: 2 things need you, plus 6 new messages")
  })

  // Discriminating: needsYou here is uniformly RSVPs (not mixed kinds), so a
  // composer that reused the needs-only kind label for the combined subject
  // would wrongly say "2 RSVPs need you, plus...". Decision 7 says the
  // combined case always drops to "thing(s)" regardless of uniformity.
  it("both blocks, needsYou uniformly RSVPs: still drops to 'things', not 'RSVPs'", () => {
    const out = composeDigestEmail(
      baseInput({ needsYou: [eventItem(), eventItem({ key: "e2" })], youMissed: missed(6) })
    )
    expect(out?.subject).toBe("Climbing Crew: 2 things need you, plus 6 new messages")
  })

  // Discriminating: same as above but needsYou uniformly votes, to rule out
  // a composer that special-cases "reuse the label unless it's RSVP".
  it("both blocks, needsYou uniformly votes: still drops to 'things', not 'votes'", () => {
    const out = composeDigestEmail(
      baseInput({ needsYou: [ideaItem(), ideaItem({ key: "g2" })], youMissed: missed(6) })
    )
    expect(out?.subject).toBe("Climbing Crew: 2 things need you, plus 6 new messages")
  })

  it("both blocks, singular needsYou: '1 thing needs you, plus 3 new messages'", () => {
    const out = composeDigestEmail(baseInput({ needsYou: [eventItem()], youMissed: missed(3) }))
    expect(out?.subject).toBe("Climbing Crew: 1 thing needs you, plus 3 new messages")
  })

  it("group name always leads the subject", () => {
    const out = composeDigestEmail(baseInput({ groupName: "Sunday Riders", youMissed: missed(2) }))
    expect(out?.subject.startsWith("Sunday Riders:")).toBe(true)
  })
})

describe("composeDigestEmail — body content", () => {
  it("both bodies carry every needsYou item's title, when-line, label and an absolute link", () => {
    const out = composeDigestEmail(
      baseInput({ needsYou: [eventItem(), ideaItem()] })
    )
    expect(out).not.toBeNull()
    for (const body of [out!.text, out!.html]) {
      expect(body).toContain("Saturday morning climb")
      expect(body).toContain("Sat, Aug 30 · 9am")
      expect(body).toContain("Needs your RSVP")
      expect(body).toContain(`${ORIGIN}/events/e1`)
      expect(body).toContain("Beers")
      expect(body).toContain("Needs your vote")
      expect(body).toContain(`${ORIGIN}/groups/${GROUP_ID}`)
    }
  })

  it("both bodies carry the you-missed count and quoted lines", () => {
    const out = composeDigestEmail(
      baseInput({
        youMissed: missed(6, [
          { authorName: "Sam", body: "I might be a few minutes late" },
          { authorName: "Jordan", body: "can we do 9 instead of 8?" },
        ]),
      })
    )
    expect(out).not.toBeNull()
    for (const body of [out!.text, out!.html]) {
      expect(body).toContain("6")
      expect(body).toContain("Sam")
      expect(body).toContain("I might be a few minutes late")
      expect(body).toContain("Jordan")
      expect(body).toContain("can we do 9 instead of 8?")
    }
  })

  it("labels a missed line from a deleted member's message 'Former member', not 'Someone'", () => {
    // authorName null here is the real shape of a MEMBER message whose
    // author row is gone (deriveYouMissed only ever includes MEMBER
    // messages), not a stand-in for an unrelated missing-name case.
    const out = composeDigestEmail(
      baseInput({
        youMissed: missed(1, [{ authorName: null, body: "climbing this weekend?" }]),
      })
    )
    expect(out).not.toBeNull()
    for (const body of [out!.text, out!.html]) {
      expect(body).toContain("Former member")
      expect(body).not.toContain("Someone")
    }
  })

  it("truncates a long quoted line to one line's worth with an ellipsis, not mid-word", () => {
    const longBody =
      "This is a genuinely long message about Saturday plans that goes on for quite a while so it needs truncating somewhere sensible"
    const out = composeDigestEmail(
      baseInput({ youMissed: missed(1, [{ authorName: "Sam", body: longBody }]) })
    )
    expect(out).not.toBeNull()
    for (const body of [out!.text, out!.html]) {
      expect(body).not.toContain(longBody)
      expect(body).toContain("…")
      // The truncated fragment must end on a whole word, never mid-word:
      // find the text right before the ellipsis and confirm it's a prefix
      // that ends where the original had a space (i.e. it's one of the
      // original's own words joined back together, not a chopped one).
      const match = body.match(/This is a genuinely long message[^…]*…/)
      expect(match).not.toBeNull()
      const truncatedWords = match![0].slice(0, -1).trim().split(" ")
      const originalWords = longBody.split(" ")
      for (const word of truncatedWords) {
        expect(originalWords).toContain(word)
      }
    }
  })

  it("does not truncate a short quoted line", () => {
    const out = composeDigestEmail(
      baseInput({ youMissed: missed(1, [{ authorName: "Sam", body: "sounds good" }]) })
    )
    expect(out!.text).toContain("sounds good")
    expect(out!.text).not.toContain("sounds good…")
  })

  it("carries one absolute link into the group", () => {
    const out = composeDigestEmail(baseInput({ needsYou: [eventItem()] }))
    expect(out!.text).toContain(`${ORIGIN}/groups/${GROUP_ID}`)
    expect(out!.html).toContain(`${ORIGIN}/groups/${GROUP_ID}`)
  })

  it("carries the unsubscribe link, built from the given token, pointing at the API route handler", () => {
    const out = composeDigestEmail(baseInput({ needsYou: [eventItem()] }))
    const expectedUrl = `${ORIGIN}/api/unsubscribe/${TOKEN}`
    expect(out!.unsubscribeUrl).toBe(expectedUrl)
    expect(out!.text).toContain(expectedUrl)
    expect(out!.html).toContain(expectedUrl)
    // Never the human page directly; that would make the header dishonest.
    expect(out!.text).not.toContain(`${ORIGIN}/unsubscribe/${TOKEN}`)
  })

  it("orders needs-you before you-missed in the text body", () => {
    const out = composeDigestEmail(
      baseInput({
        needsYou: [eventItem()],
        youMissed: missed(2, [{ authorName: "Sam", body: "hey" }]),
      })
    )
    const needsIdx = out!.text.indexOf("Saturday morning climb")
    const missedIdx = out!.text.indexOf("hey")
    expect(needsIdx).toBeGreaterThanOrEqual(0)
    expect(missedIdx).toBeGreaterThan(needsIdx)
  })
})

describe("composeDigestEmail, cancellations", () => {
  it("names what got called off, above the chat the member missed", () => {
    const email = composeDigestEmail(
      baseInput({
        needsYou: [],
        youMissed: null,
        cancellations: [{ title: "Tennis", whenLine: "this Tue" }],
      })
    )

    expect(email).not.toBeNull()
    expect(email!.text).toContain("Called off: Tennis this Tue")
    expect(email!.html).toContain("Tennis this Tue")
  })

  it("sends on a cancellation alone", () => {
    const email = composeDigestEmail(
      baseInput({
        needsYou: [],
        youMissed: null,
        cancellations: [{ title: "Tennis", whenLine: "this Tue" }],
      })
    )
    expect(email).not.toBeNull()
  })

  it("still sends nothing when all three blocks are empty", () => {
    const email = composeDigestEmail(
      baseInput({
        needsYou: [],
        youMissed: null,
        cancellations: [],
      })
    )
    expect(email).toBeNull()
  })

  // B-1 (review, fix round 1): the honest-subject requirement the brief
  // called out by name had no assertion at all. A cancellation-only digest
  // must not fall through to a needs-you-shaped subject, since nothing
  // needs the reader when the only block that filled the email is
  // cancellations.
  it("gets its own honest subject on a cancellation alone, singular", () => {
    const email = composeDigestEmail(
      baseInput({
        needsYou: [],
        youMissed: null,
        cancellations: [{ title: "Tennis", whenLine: "this Tue" }],
      })
    )
    expect(email?.subject).toBe("Climbing Crew: 1 plan called off")
  })

  it("gets its own honest subject on a cancellation alone, plural", () => {
    const email = composeDigestEmail(
      baseInput({
        needsYou: [],
        youMissed: null,
        cancellations: [
          { title: "Tennis", whenLine: "this Tue" },
          { title: "Climbing", whenLine: "this Sat" },
        ],
      })
    )
    expect(email?.subject).toBe("Climbing Crew: 2 plans called off")
  })
})
