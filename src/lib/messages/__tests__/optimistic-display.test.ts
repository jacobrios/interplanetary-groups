import { describe, expect, it } from "vitest"
import { MessageAuthor } from "@prisma/client"

import { applySettledSends, type SettledSend } from "../optimistic-display"
import type { FeedMessage } from "@/app/groups/[id]/MessageFeed"

function optimistic(id: string, body: string): FeedMessage {
  return {
    id,
    authorType: MessageAuthor.MEMBER,
    authorId: "u1",
    authorName: "Alex",
    body,
    createdAt: new Date("2026-08-31T12:00:00Z"),
    isPending: true,
  }
}

function confirmed(id: string, body: string): FeedMessage {
  return { ...optimistic(id, body), isPending: false }
}

const settled = (optimisticId: string, serverId: string): SettledSend => ({
  optimisticId,
  serverId,
})

describe("applySettledSends", () => {
  it("clears the sending state on an entry whose send has landed", () => {
    // MessageFeed draws isPending at 0.65 opacity, which reads as "not sent
    // yet". Once the server has the message that is a lie, and it used to
    // persist for as long as Orbit's model call took.
    const out = applySettledSends([optimistic("o1", "hello")], [settled("o1", "m1")])
    expect(out.map((m) => m.isPending)).toEqual([false])
  })

  it("drops the optimistic entry once the confirmed row for it has arrived", () => {
    // The duplicate, closed rather than accepted. While the send's transition is
    // still open, useOptimistic layers its entry on top of the base list, so
    // after revalidation delivers the real row the member can see their own
    // message TWICE. Keyed on the server id the send returned, never on body
    // text: a member legitimately sending "ok" twice must keep both.
    const out = applySettledSends(
      [confirmed("m1", "hello"), optimistic("o1", "hello")],
      [settled("o1", "m1")]
    )
    expect(out.map((m) => m.id)).toEqual(["m1"])
  })

  it("keeps a genuine repeat of the same words", () => {
    // The reason this matches on id rather than on body.
    const out = applySettledSends(
      [confirmed("m1", "ok"), optimistic("o2", "ok")],
      [settled("o2", "m2")]
    )
    expect(out.map((m) => m.id)).toEqual(["m1", "o2"])
    expect(out.map((m) => m.isPending)).toEqual([false, false])
  })

  it("leaves an entry still in flight alone", () => {
    const out = applySettledSends([optimistic("o1", "hello")], [])
    expect(out.map((m) => m.isPending)).toEqual([true])
  })

  it("settles only the entries named, when several are in flight at once", () => {
    // Reachable because the input is no longer disabled: a member can have two
    // sends outstanding, and the first landing must not make the second look
    // sent.
    const out = applySettledSends(
      [optimistic("o1", "first"), optimistic("o2", "second")],
      [settled("o1", "m1")]
    )
    expect(out.map((m) => [m.body, m.isPending])).toEqual([
      ["first", false],
      ["second", true],
    ])
  })

  it("returns the same array when nothing has settled, so React sees no change", () => {
    // Identity matters: this runs on every render of the feed, and handing
    // MessageFeed a fresh array each time would defeat any future memoisation
    // and churn the list for no reason.
    const messages = [optimistic("o1", "hello")]
    expect(applySettledSends(messages, [])).toBe(messages)
  })

  it("leaves confirmed server messages untouched", () => {
    const messages = [confirmed("m1", "already real")]
    expect(applySettledSends(messages, [settled("o9", "m9")])).toBe(messages)
  })
})
