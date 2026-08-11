import { describe, it, expect } from "vitest"
import { composeEventIcs, type IcsEventInput } from "../ics"

const NOW = new Date("2026-08-11T12:00:00Z")

function baseEvent(overrides: Partial<IcsEventInput> = {}): IcsEventInput {
  return {
    id: "evt123",
    title: "Sunday climb",
    startsAt: new Date("2026-08-16T15:00:00Z"),
    endsAt: null,
    updatedAt: new Date("2026-08-10T09:00:00Z"),
    venue: null,
    eventUrl: "http://localhost:3000/events/evt123",
    ...overrides,
  }
}

describe("composeEventIcs", () => {
  it("writes UTC start and the one-hour fallback end", () => {
    const ics = composeEventIcs(baseEvent(), NOW)
    expect(ics).toContain("DTSTART:20260816T150000Z")
    expect(ics).toContain("DTEND:20260816T160000Z")
    expect(ics).toContain("DTSTAMP:20260811T120000Z")
  })

  it("lets a stored end time win over the fallback", () => {
    const ics = composeEventIcs(
      baseEvent({ endsAt: new Date("2026-08-16T18:30:00Z") }),
      NOW
    )
    expect(ics).toContain("DTEND:20260816T183000Z")
  })

  it("carries summary, description link, and calendar envelope", () => {
    const ics = composeEventIcs(baseEvent(), NOW)
    expect(ics).toContain("BEGIN:VCALENDAR")
    expect(ics).not.toContain("METHOD:")
    expect(ics).toContain("SUMMARY:Sunday climb")
    expect(ics).toContain(
      "DESCRIPTION:Details and RSVPs: http://localhost:3000/events/evt123"
    )
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true)
  })

  it("uses CRLF line endings exclusively", () => {
    const ics = composeEventIcs(baseEvent(), NOW)
    expect(ics.includes("\r\n")).toBe(true)
    expect(ics.replace(/\r\n/g, "").includes("\n")).toBe(false)
  })

  it("keeps the UID stable across compositions", () => {
    const first = composeEventIcs(baseEvent(), NOW)
    const second = composeEventIcs(baseEvent(), new Date("2026-09-01T00:00:00Z"))
    const uidOf = (s: string) => s.match(/UID:[^\r]+/)?.[0]
    expect(uidOf(first)).toBe("UID:evt123@interplanetary-groups")
    expect(uidOf(second)).toBe(uidOf(first))
  })

  it("renders location from the label, appending a stored address", () => {
    const ics = composeEventIcs(
      baseEvent({
        venue: { label: "Movement", name: "Movement Gym LLC", address: "123 Main St" },
      }),
      NOW
    )
    expect(ics).toContain("LOCATION:Movement\\, 123 Main St")
  })

  it("falls back to the venue name and omits LOCATION when no venue", () => {
    const named = composeEventIcs(
      baseEvent({ venue: { label: null, name: "The Wall", address: null } }),
      NOW
    )
    expect(named).toContain("LOCATION:The Wall")
    const bare = composeEventIcs(baseEvent(), NOW)
    expect(bare).not.toContain("LOCATION")
  })

  it("escapes commas, semicolons, and newlines in text fields", () => {
    const ics = composeEventIcs(
      baseEvent({ title: "Beers; then pool, maybe\ndarts" }),
      NOW
    )
    expect(ics).toContain("SUMMARY:Beers\\; then pool\\, maybe\\ndarts")
  })

  it("escapes a literal backslash before semicolons and commas, not after", () => {
    // If escaping ran ";" and "," before "\", a literal backslash next to
    // either would come out double-escaped ("\\;" instead of "\;").
    const ics = composeEventIcs(
      baseEvent({ title: "Plan B\\; bring cash, snacks" }),
      NOW
    )
    // Expected SUMMARY payload, written out character by character so the
    // JS string literal itself isn't a source of confusion:
    //   Plan B \ ; bring cash , snacks
    // becomes, after backslash-first escaping:
    //   Plan B \\ \; bring cash \, snacks
    const expected = "SUMMARY:Plan B" + "\\\\" + "\\;" + " bring cash" + "\\," + " snacks"
    expect(ics).toContain(expected)
  })

  it("folds lines longer than 75 octets with a leading space", () => {
    // A repeating numbered pattern makes every position distinguishable, so
    // a fold bug that drops or duplicates a character at a fold boundary
    // changes the unfolded text rather than being masked by uniform input.
    const longTitle = Array.from({ length: 200 }, (_, i) => i % 10).join("")
    const ics = composeEventIcs(baseEvent({ title: longTitle }), NOW)
    const physicalLines = ics.split("\r\n")
    for (const line of physicalLines) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    }
    // Unfolding (CRLF + space removed) must restore the logical line exactly,
    // not merely contain it as a substring.
    const unfolded = ics.replace(/\r\n /g, "")
    const summaryLine = unfolded
      .split("\r\n")
      .find((line) => line.startsWith("SUMMARY:"))
    expect(summaryLine).toBe(`SUMMARY:${longTitle}`)
  })

  it("derives SEQUENCE from updatedAt, rising strictly when the event changes", () => {
    const earlier = composeEventIcs(
      baseEvent({ updatedAt: new Date("2026-08-10T09:00:00Z") }),
      NOW
    )
    const later = composeEventIcs(
      baseEvent({ updatedAt: new Date("2026-08-11T09:00:00Z") }),
      NOW
    )
    const sequenceOf = (s: string) => Number(s.match(/SEQUENCE:(\d+)/)?.[1])
    const uidOf = (s: string) => s.match(/UID:[^\r]+/)?.[0]

    expect(sequenceOf(later)).toBeGreaterThan(sequenceOf(earlier))
    expect(uidOf(later)).toBe(uidOf(earlier))
  })
})
