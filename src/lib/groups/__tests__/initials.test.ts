import { describe, it, expect } from "vitest"
import { groupInitials } from "../initials"

describe("groupInitials", () => {
  it("uses the first letters of the first two words", () => {
    expect(groupInitials("Climbing Crew")).toBe("CC")
  })

  it("uppercases", () => {
    expect(groupInitials("climbing crew")).toBe("CC")
  })

  it("uses the first two letters of a one-word name", () => {
    expect(groupInitials("badminton")).toBe("BA")
  })

  it("ignores extra words beyond the first two", () => {
    expect(groupInitials("The Sunday Morning Runners")).toBe("TS")
  })

  it("handles a single-character name", () => {
    expect(groupInitials("x")).toBe("X")
  })

  it("collapses stray whitespace", () => {
    expect(groupInitials("  Climbing   Crew  ")).toBe("CC")
  })
})
