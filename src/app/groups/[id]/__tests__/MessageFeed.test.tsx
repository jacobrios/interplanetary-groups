// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { MessageAuthor } from "@prisma/client"
import MessageFeed from "../MessageFeed"

describe("MessageFeed system messages", () => {
  it("renders a SYSTEM message as a quiet centered line, never as a member bubble", () => {
    // jsdom has no scrollIntoView; the feed calls it on mount.
    Element.prototype.scrollIntoView = vi.fn()

    render(
      <MessageFeed
        viewerId={null}
        timeZone="America/Chicago"
        messages={[
          {
            id: "m-sys-1",
            authorType: MessageAuthor.SYSTEM,
            authorId: null,
            authorName: null,
            body: "Jesse joined",
            createdAt: new Date(),
          },
        ]}
      />
    )

    const line = screen.getByText("Jesse joined")
    expect(line).toBeTruthy()
    // The member-branch fallback label must not appear anywhere.
    expect(screen.queryByText("Member")).toBeNull()
    // Centered, meta-size, secondary color — the quiet-line treatment.
    expect(line.style.textAlign).toBe("center")
    expect(line.style.fontSize).toBe("var(--type-meta)")
  })
})

describe("MessageFeed day dividers render in the group's own timezone", () => {
  it("groups a message by the group's timeZone prop, not the viewer's local zone", () => {
    // jsdom has no scrollIntoView; the feed calls it on mount.
    Element.prototype.scrollIntoView = vi.fn()

    // 2020-01-01T23:30:00Z is still Jan 1 in UTC, but already 08:30 the next
    // morning in Tokyo (UTC+9) — Thu Jan 2. A component that grouped by the
    // viewer's local zone (or by UTC) would print "Wed, Jan 1"; only reading
    // the group's own Asia/Tokyo zone prints "Thu, Jan 2". The date is fixed
    // and far from "now" on purpose, so the divider always falls to the
    // weekday/month/day format rather than "Today"/"Yesterday", regardless
    // of the date the suite happens to run on.
    render(
      <MessageFeed
        viewerId={null}
        timeZone="Asia/Tokyo"
        messages={[
          {
            id: "m-1",
            authorType: MessageAuthor.MEMBER,
            authorId: "u-1",
            authorName: "Jesse",
            body: "hey",
            createdAt: new Date("2020-01-01T23:30:00Z"),
          },
        ]}
      />
    )

    expect(screen.getByText("Thu, Jan 2")).toBeTruthy()
    expect(screen.queryByText("Wed, Jan 1")).toBeNull()
  })
})
