// @vitest-environment jsdom
import { afterEach, describe, it, expect } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import OrbitDownNote from "../OrbitDownNote"
import { CHAT_NOTE_COPY } from "@/lib/orbit/unavailable-copy"

afterEach(() => {
  cleanup()
})

describe("OrbitDownNote", () => {
  it("tells the sender about dry credits, as a status line", () => {
    render(<OrbitDownNote reason="credits" />)
    const note = screen.getByRole("status")
    expect(note.textContent).toBe(CHAT_NOTE_COPY.credits)
  })

  it("tells the sender about service trouble", () => {
    render(<OrbitDownNote reason="trouble" />)
    expect(screen.getByRole("status").textContent).toBe(CHAT_NOTE_COPY.trouble)
  })

  // Pins the owner-approved wording itself (spec: Approved copy, 11 Aug
  // 2026), not just the reason-to-copy mapping. The tests above would still
  // pass if this literal text drifted, as long as the component and the
  // constant drifted together.
  it("matches the owner-approved wording exactly", () => {
    expect(CHAT_NOTE_COPY.credits).toBe(
      "Your message went through. But heads up: this prototype ran out of model credits, so I might miss ideas until they're topped up."
    )
    expect(CHAT_NOTE_COPY.trouble).toBe(
      "Your message went through. But heads up: I'm having trouble thinking right now, so I might miss ideas for a few minutes."
    )
  })
})
