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
