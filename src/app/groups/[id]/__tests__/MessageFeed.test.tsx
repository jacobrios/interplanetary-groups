// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { MessageAuthor } from "@prisma/client"
import MessageFeed, { type FeedMessage } from "../MessageFeed"

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

describe("MessageFeed former-member label", () => {
  it("labels a deleted member's surviving message 'Former member', not 'Member'", () => {
    // A message whose author row is gone reads exactly this way once
    // page.tsx joins it: authorType MEMBER (deletion never changes the
    // type), authorId null (the FK was SetNull), authorName null (there is
    // no user row left to read a name from). This is the real shape a
    // deleted person's surviving chat message takes, not a shortcut.
    Element.prototype.scrollIntoView = vi.fn()

    render(
      <MessageFeed
        viewerId={null}
        timeZone="America/Chicago"
        messages={[
          {
            id: "m-deleted-author-1",
            authorType: MessageAuthor.MEMBER,
            authorId: null,
            authorName: null,
            body: "climbing this weekend?",
            createdAt: new Date(),
          },
        ]}
      />
    )

    expect(screen.getByText("Former member")).toBeTruthy()
    expect(screen.queryByText("Member")).toBeNull()
  })
})

describe("MessageFeed auto-scroll does not hijack a scrolled-up reader (LiveRefresh polling fix)", () => {
  // jsdom's layout metrics are always 0, so "near the bottom" has to be
  // faked on the actual scroll container node rather than produced by real
  // layout. The scroll container is the component's single top-level
  // element, so RTL's own wrapper div's first child is it.
  function setScrollMetrics(
    el: HTMLElement,
    metrics: { scrollTop: number; scrollHeight: number; clientHeight: number }
  ) {
    Object.defineProperty(el, "scrollTop", { value: metrics.scrollTop, configurable: true })
    Object.defineProperty(el, "scrollHeight", { value: metrics.scrollHeight, configurable: true })
    Object.defineProperty(el, "clientHeight", { value: metrics.clientHeight, configurable: true })
  }

  function memberMessage(id: string, authorId: string): FeedMessage {
    return {
      id,
      authorType: MessageAuthor.MEMBER,
      authorId,
      authorName: "Someone",
      body: `body ${id}`,
      createdAt: new Date(),
    }
  }

  it("before this slice, every message-count change scrolled unconditionally: now a scrolled-up reader is left alone when someone else posts", () => {
    Element.prototype.scrollIntoView = vi.fn()
    const initial = [memberMessage("m1", "u-other")]

    const { container, rerender } = render(
      <MessageFeed viewerId="v-viewer" timeZone="America/Chicago" messages={initial} />
    )
    const scrollEl = container.firstElementChild as HTMLElement

    // The mount always scrolls (first-mount branch); clear that call so the
    // assertion below is about the SECOND change only.
    ;(Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).mockClear()

    // Simulate the viewer having scrolled up to reread earlier history: 1500px
    // of unread content sits below them, well past the near-bottom threshold.
    setScrollMetrics(scrollEl, { scrollTop: 0, scrollHeight: 2000, clientHeight: 500 })
    fireEvent.scroll(scrollEl)

    rerender(
      <MessageFeed
        viewerId="v-viewer"
        timeZone="America/Chicago"
        messages={[...initial, memberMessage("m2", "u-other")]}
      />
    )

    // Mutation-proven: deleting the isNearBottomRef/isOwnNewMessage guard and
    // scrolling unconditionally on every messages.length change (the
    // pre-fix behavior) turns this assertion red.
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled()
  })

  it("still follows the tail when the viewer is already at the bottom", () => {
    Element.prototype.scrollIntoView = vi.fn()
    const initial = [memberMessage("m1", "u-other")]

    const { container, rerender } = render(
      <MessageFeed viewerId="v-viewer" timeZone="America/Chicago" messages={initial} />
    )
    const scrollEl = container.firstElementChild as HTMLElement
    ;(Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).mockClear()

    // At the live edge: scrollTop already sits at scrollHeight - clientHeight.
    setScrollMetrics(scrollEl, { scrollTop: 1500, scrollHeight: 2000, clientHeight: 500 })
    fireEvent.scroll(scrollEl)

    rerender(
      <MessageFeed
        viewerId="v-viewer"
        timeZone="America/Chicago"
        messages={[...initial, memberMessage("m2", "u-other")]}
      />
    )

    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it("still scrolls for the viewer's own new message even while scrolled up", () => {
    Element.prototype.scrollIntoView = vi.fn()
    const initial = [memberMessage("m1", "u-other")]

    const { container, rerender } = render(
      <MessageFeed viewerId="v-viewer" timeZone="America/Chicago" messages={initial} />
    )
    const scrollEl = container.firstElementChild as HTMLElement
    ;(Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).mockClear()

    // Scrolled up, same as the first test in this block.
    setScrollMetrics(scrollEl, { scrollTop: 0, scrollHeight: 2000, clientHeight: 500 })
    fireEvent.scroll(scrollEl)

    // But this time the new message is the viewer's own send, which must
    // scroll regardless of scroll position — a member who just sent a
    // message expects to see it land.
    rerender(
      <MessageFeed
        viewerId="v-viewer"
        timeZone="America/Chicago"
        messages={[...initial, memberMessage("m2", "v-viewer")]}
      />
    )

    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1)
  })

  // The gap found in re-review: a brand-new group's home genuinely starts
  // with messages=[], which renders the placeholder branch above with NO
  // scroll container and NO bottom sentinel at all. The scroll-metrics
  // listener has to survive that transition (empty at mount, populated once
  // the first message lands) or it never attaches for the life of the
  // component instance, which is exactly what a `useRef` container ref paired
  // with a `[]`-deps effect does: the effect runs once, reads a null ref
  // because the scrollable div does not exist yet, and never runs again.
  it("still leaves a scrolled-up reader alone after the feed starts empty and messages arrive later", () => {
    Element.prototype.scrollIntoView = vi.fn()

    const { container, rerender } = render(
      <MessageFeed viewerId="v-viewer" timeZone="America/Chicago" messages={[]} />
    )

    // First message ever: the empty-state placeholder is replaced by the
    // real scroll container for the first time. This is also where a buggy
    // callback ref would fail to attach, so the very next scroll simulation
    // has to land on a live listener.
    rerender(
      <MessageFeed
        viewerId="v-viewer"
        timeZone="America/Chicago"
        messages={[memberMessage("m1", "u-other")]}
      />
    )

    const scrollEl = container.firstElementChild as HTMLElement
    ;(Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).mockClear()

    // Viewer scrolls up to reread, same as the earlier populated-start test.
    setScrollMetrics(scrollEl, { scrollTop: 0, scrollHeight: 2000, clientHeight: 500 })
    fireEvent.scroll(scrollEl)

    // Someone else posts while the viewer is scrolled up.
    rerender(
      <MessageFeed
        viewerId="v-viewer"
        timeZone="America/Chicago"
        messages={[memberMessage("m1", "u-other"), memberMessage("m2", "u-other")]}
      />
    )

    // Mutation-proven: reverting the callback ref to a `useRef` container ref
    // plus a `[]`-deps effect turns this red. On that shape the effect's one
    // run happens while messages=[] (no container in the DOM yet), so it
    // reads a null ref and never runs again; the scroll listener never
    // attaches, isNearBottomRef stays stuck at its initial `true`, and this
    // assertion sees scrollIntoView called instead of skipped.
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled()
  })
})
