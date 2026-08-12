// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest"
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
  afterEach(() => {
    // Return the runtime's default zone to whatever it was before this
    // test's vi.stubEnv call, so no other test in the file (or file run
    // after this one) inherits a stubbed TZ.
    vi.unstubAllEnvs()
  })

  it("groups a message by the group's timeZone prop, not the runtime's default (viewer) zone", () => {
    // jsdom has no scrollIntoView; the feed calls it on mount.
    Element.prototype.scrollIntoView = vi.fn()

    // The regression this guards against is MessageFeed silently falling
    // back to the viewer's own zone instead of reading the timeZone prop.
    // A fixture instant alone can't prove that: for 2020-01-01T23:30:00Z,
    // every zone at UTC+1 or later already reads the same calendar day
    // (Jan 2) as the group's Asia/Tokyo, so a fallback-to-viewer-zone bug
    // would pass silently on most of the world's machines and CI runners.
    // Stubbing the runtime's default TZ to a zone on the far side of the
    // date line from Tokyo makes the test's power independent of where it
    // actually runs: Pacific/Midway (UTC-11) reads this same instant as
    // Jan 1, so only a component that genuinely reads the timeZone prop
    // (not the runtime default) can print "Thu, Jan 2" here.
    vi.stubEnv("TZ", "Pacific/Midway")
    // Confirm the stub actually changed what the runtime treats as its
    // default zone, rather than assuming vi.stubEnv reached Node's TZ
    // handling (Intl's default-zone resolution reads process.env.TZ,
    // confirmed by hand against this Vitest/Node combination; see the
    // fix-wave-1 report for the throwaway script that checked it).
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("Pacific/Midway")

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
