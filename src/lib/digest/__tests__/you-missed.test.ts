// src/lib/digest/__tests__/you-missed.test.ts
//
// Pure, DB-free tests for the digest's "you missed" block. Fixtures are
// plain objects cast to the Message-plus-author shape the real caller would
// hand in; nothing here touches Prisma or the network, mirroring
// lib/digest/__tests__/needs-you.test.ts.

import { describe, expect, it } from "vitest"
import { MessageAuthor } from "@prisma/client"
import { deriveYouMissed, type YouMissedMessage } from "@/lib/digest/you-missed"

const VIEWER = "user-viewer"
const JOINED_AT = new Date("2026-08-01T00:00:00.000Z")

function message(over: Partial<YouMissedMessage> = {}): YouMissedMessage {
  return {
    id: "m1",
    groupId: "grp1",
    authorType: MessageAuthor.MEMBER,
    authorId: "user-sam",
    body: "beers Friday?",
    createdAt: new Date("2026-08-20T12:00:00.000Z"),
    author: { id: "user-sam", name: "Sam" },
    ...over,
  } as unknown as YouMissedMessage
}

describe("deriveYouMissed", () => {
  it("returns null when nothing was posted after the read position", () => {
    const out = deriveYouMissed({
      messages: [],
      lastSeenAt: new Date("2026-08-20T00:00:00.000Z"),
      lastDigestSentAt: null,
      joinedAt: JOINED_AT,
      viewerId: VIEWER,
    })
    expect(out).toBeNull()
  })

  it("counts and quotes a message posted after the read position", () => {
    const out = deriveYouMissed({
      messages: [message({ createdAt: new Date("2026-08-21T00:00:00.000Z") })],
      lastSeenAt: new Date("2026-08-20T00:00:00.000Z"),
      lastDigestSentAt: null,
      joinedAt: JOINED_AT,
      viewerId: VIEWER,
    })
    expect(out).not.toBeNull()
    expect(out?.count).toBe(1)
    expect(out?.lines).toEqual([{ authorName: "Sam", body: "beers Friday?" }])
  })

  it("read position is the later of lastSeenAt and lastDigestSentAt: lastSeenAt more recent", () => {
    // lastSeenAt (Aug 22) is later than lastDigestSentAt (Aug 18), so a
    // message on Aug 20 -- after the digest, before the member opened the
    // group -- was already seen and must not count as missed.
    const out = deriveYouMissed({
      messages: [message({ createdAt: new Date("2026-08-20T00:00:00.000Z") })],
      lastSeenAt: new Date("2026-08-22T00:00:00.000Z"),
      lastDigestSentAt: new Date("2026-08-18T00:00:00.000Z"),
      joinedAt: JOINED_AT,
      viewerId: VIEWER,
    })
    expect(out).toBeNull()
  })

  it("read position is the later of lastSeenAt and lastDigestSentAt: lastDigestSentAt more recent", () => {
    // Reversed: lastDigestSentAt (Aug 22) is later than lastSeenAt (Aug 18),
    // so the same Aug 20 message was already covered by the last digest and
    // must not count as missed either. Proves the rule picks the later
    // field regardless of which one it is, not just "prefer lastSeenAt".
    const out = deriveYouMissed({
      messages: [message({ createdAt: new Date("2026-08-20T00:00:00.000Z") })],
      lastSeenAt: new Date("2026-08-18T00:00:00.000Z"),
      lastDigestSentAt: new Date("2026-08-22T00:00:00.000Z"),
      joinedAt: JOINED_AT,
      viewerId: VIEWER,
    })
    expect(out).toBeNull()
  })

  it("a message after the later date still counts, in either ordering", () => {
    // Same two orderings as above, but the message now lands after the
    // later field, so it should count in both. Guards against a version of
    // the rule that accidentally always used the earlier date instead.
    const seenLater = deriveYouMissed({
      messages: [message({ createdAt: new Date("2026-08-23T00:00:00.000Z") })],
      lastSeenAt: new Date("2026-08-22T00:00:00.000Z"),
      lastDigestSentAt: new Date("2026-08-18T00:00:00.000Z"),
      joinedAt: JOINED_AT,
      viewerId: VIEWER,
    })
    expect(seenLater?.count).toBe(1)

    const digestLater = deriveYouMissed({
      messages: [message({ createdAt: new Date("2026-08-23T00:00:00.000Z") })],
      lastSeenAt: new Date("2026-08-18T00:00:00.000Z"),
      lastDigestSentAt: new Date("2026-08-22T00:00:00.000Z"),
      joinedAt: JOINED_AT,
      viewerId: VIEWER,
    })
    expect(digestLater?.count).toBe(1)
  })

  it("a never-opened, never-digested member falls back to joinedAt", () => {
    const beforeJoin = deriveYouMissed({
      messages: [message({ createdAt: new Date("2026-07-31T00:00:00.000Z") })],
      lastSeenAt: null,
      lastDigestSentAt: null,
      joinedAt: JOINED_AT,
      viewerId: VIEWER,
    })
    expect(beforeJoin).toBeNull()

    const afterJoin = deriveYouMissed({
      messages: [message({ createdAt: new Date("2026-08-02T00:00:00.000Z") })],
      lastSeenAt: null,
      lastDigestSentAt: null,
      joinedAt: JOINED_AT,
      viewerId: VIEWER,
    })
    expect(afterJoin?.count).toBe(1)
  })

  it("excludes ORBIT messages from both the count and the lines", () => {
    const out = deriveYouMissed({
      messages: [
        message({
          id: "orbit1",
          authorType: MessageAuthor.ORBIT,
          authorId: null,
          author: null,
          body: "Climbing Tuesday? Tap in if you're up for it.",
          createdAt: new Date("2026-08-21T00:00:00.000Z"),
        }),
      ],
      lastSeenAt: new Date("2026-08-20T00:00:00.000Z"),
      lastDigestSentAt: null,
      joinedAt: JOINED_AT,
      viewerId: VIEWER,
    })
    expect(out).toBeNull()
  })

  it("excludes SYSTEM join lines from both the count and the lines", () => {
    const out = deriveYouMissed({
      messages: [
        message({
          id: "sys1",
          authorType: MessageAuthor.SYSTEM,
          authorId: null,
          author: null,
          body: "Jesse joined",
          createdAt: new Date("2026-08-21T00:00:00.000Z"),
        }),
      ],
      lastSeenAt: new Date("2026-08-20T00:00:00.000Z"),
      lastDigestSentAt: null,
      joinedAt: JOINED_AT,
      viewerId: VIEWER,
    })
    expect(out).toBeNull()
  })

  it("excludes the viewer's own messages: they are never missed to themselves", () => {
    const out = deriveYouMissed({
      messages: [
        message({
          id: "own1",
          authorId: VIEWER,
          author: { id: VIEWER, name: "Me" },
          createdAt: new Date("2026-08-21T00:00:00.000Z"),
        } as never),
      ],
      lastSeenAt: new Date("2026-08-20T00:00:00.000Z"),
      lastDigestSentAt: null,
      joinedAt: JOINED_AT,
      viewerId: VIEWER,
    })
    expect(out).toBeNull()
  })

  it("returns fewer than three lines when fewer than three were missed", () => {
    const out = deriveYouMissed({
      messages: [
        message({ id: "m1", createdAt: new Date("2026-08-21T00:00:00.000Z"), body: "one" }),
        message({ id: "m2", createdAt: new Date("2026-08-22T00:00:00.000Z"), body: "two" }),
      ],
      lastSeenAt: new Date("2026-08-20T00:00:00.000Z"),
      lastDigestSentAt: null,
      joinedAt: JOINED_AT,
      viewerId: VIEWER,
    })
    expect(out?.count).toBe(2)
    expect(out?.lines).toEqual([
      { authorName: "Sam", body: "one" },
      { authorName: "Sam", body: "two" },
    ])
  })

  it("caps lines at the newest three, newest last, while the count reflects everything missed", () => {
    const out = deriveYouMissed({
      messages: [
        message({ id: "m1", createdAt: new Date("2026-08-21T00:00:00.000Z"), body: "one" }),
        message({ id: "m2", createdAt: new Date("2026-08-22T00:00:00.000Z"), body: "two" }),
        message({ id: "m3", createdAt: new Date("2026-08-23T00:00:00.000Z"), body: "three" }),
        message({ id: "m4", createdAt: new Date("2026-08-24T00:00:00.000Z"), body: "four" }),
        message({ id: "m5", createdAt: new Date("2026-08-25T00:00:00.000Z"), body: "five" }),
      ],
      lastSeenAt: new Date("2026-08-20T00:00:00.000Z"),
      lastDigestSentAt: null,
      joinedAt: JOINED_AT,
      viewerId: VIEWER,
    })
    expect(out?.count).toBe(5)
    expect(out?.lines.map((l) => l.body)).toEqual(["three", "four", "five"])
  })

  it("caps at three lines even when the input arrives out of chronological order", () => {
    // Guards against a version of the rule that trusted input ordering
    // instead of sorting: shuffled input, same five messages as above.
    const out = deriveYouMissed({
      messages: [
        message({ id: "m4", createdAt: new Date("2026-08-24T00:00:00.000Z"), body: "four" }),
        message({ id: "m1", createdAt: new Date("2026-08-21T00:00:00.000Z"), body: "one" }),
        message({ id: "m5", createdAt: new Date("2026-08-25T00:00:00.000Z"), body: "five" }),
        message({ id: "m3", createdAt: new Date("2026-08-23T00:00:00.000Z"), body: "three" }),
        message({ id: "m2", createdAt: new Date("2026-08-22T00:00:00.000Z"), body: "two" }),
      ],
      lastSeenAt: new Date("2026-08-20T00:00:00.000Z"),
      lastDigestSentAt: null,
      joinedAt: JOINED_AT,
      viewerId: VIEWER,
    })
    expect(out?.lines.map((l) => l.body)).toEqual(["three", "four", "five"])
  })
})
