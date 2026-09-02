import { describe, it, expect } from "vitest"
import { buildConversationWindow, WINDOW_MESSAGES } from "../window"

const TZ = "America/Chicago"
// 2026-07-28T23:12:00Z is Tue Jul 28, 6:12pm in Chicago (CDT, UTC-5).
const now = new Date("2026-07-28T23:12:00Z")

const msg = (body: string, iso: string, name: string | null = "Sam") => ({
  authorName: name,
  isOrbit: name === null,
  body,
  createdAt: new Date(iso),
})

describe("buildConversationWindow", () => {
  it("renders the now-anchor, oldest-first lines, and marks the trigger", () => {
    const out = buildConversationWindow(
      [
        msg("can we move beers to 9?", "2026-07-28T23:10:00Z"),
        msg("Done. Beers is moving to 9pm.", "2026-07-28T23:11:00Z", null),
        msg("sorry i meant beers, not climbing", "2026-07-28T23:12:00Z"),
      ],
      TZ,
      now
    )
    expect(out).toContain("Right now it is Tue Jul 28, 6:12pm (group time).")
    expect(out).toContain("[Tue Jul 28, 6:10pm] Sam: can we move beers to 9?")
    expect(out).toContain("[Tue Jul 28, 6:11pm] Orbit: Done. Beers is moving to 9pm.")
    expect(out).toContain(">>> [Tue Jul 28, 6:12pm] Sam: sorry i meant beers, not climbing")
    // Only the trigger is marked.
    expect(out.match(/>>>/g)).toHaveLength(1)
    // Oldest first: the 6:10 line comes before the 6:11 line.
    expect(out.indexOf("6:10pm")).toBeLessThan(out.indexOf("6:11pm"))
  })

  it("timestamps carry the date, so a twelve-hour-old reply reads as such", () => {
    const out = buildConversationWindow(
      [
        msg("who's in for beers thursday?", "2026-07-28T03:00:00Z"),
        msg("me, and let's do 9", "2026-07-28T23:12:00Z"),
      ],
      TZ,
      now
    )
    expect(out).toContain("[Mon Jul 27, 10pm] Sam: who's in for beers thursday?")
  })

  it("a single message renders as the marked trigger alone", () => {
    const out = buildConversationWindow([msg("hey", "2026-07-28T23:12:00Z")], TZ, now)
    expect(out).toContain(">>> [Tue Jul 28, 6:12pm] Sam: hey")
  })

  it("the knob is twenty", () => {
    expect(WINDOW_MESSAGES).toBe(20)
  })

  it("labels a member message whose author row is gone 'Former member', matching the product's own label rather than a separate prompt-only phrase", () => {
    // Deliberately not the msg() helper above, whose name === null shorthand
    // means Orbit. A deleted person's surviving message is a real member
    // message (isOrbit: false) with a null authorName, the shape
    // fetch-window.ts produces once the author row is gone.
    const out = buildConversationWindow(
      [
        {
          authorName: null,
          isOrbit: false,
          body: "climbing this weekend?",
          createdAt: new Date("2026-07-28T23:12:00Z"),
        },
      ],
      TZ,
      now
    )
    expect(out).toContain("Former member: climbing this weekend?")
  })
})
