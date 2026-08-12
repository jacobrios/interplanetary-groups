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
})
