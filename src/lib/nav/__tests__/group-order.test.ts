import { describe, expect, it } from "vitest"
import { orderGroupsByRecentlyOpened } from "@/lib/nav/group-order"

describe("orderGroupsByRecentlyOpened", () => {
  it("orders opened groups by lastSeenAt, most recent first", () => {
    const result = orderGroupsByRecentlyOpened([
      { groupId: "middle", joinedAt: new Date("2026-01-01"), lastSeenAt: new Date("2026-08-10") },
      { groupId: "oldest", joinedAt: new Date("2026-01-01"), lastSeenAt: new Date("2026-07-01") },
      { groupId: "newest", joinedAt: new Date("2026-01-01"), lastSeenAt: new Date("2026-08-30") },
    ])
    expect(result.map((g) => g.groupId)).toEqual(["newest", "middle", "oldest"])
  })

  it("orders never-opened groups by joinedAt, most recent first", () => {
    const result = orderGroupsByRecentlyOpened([
      { groupId: "middle", joinedAt: new Date("2026-07-15"), lastSeenAt: null },
      { groupId: "oldest", joinedAt: new Date("2026-06-01"), lastSeenAt: null },
      { groupId: "newest", joinedAt: new Date("2026-08-20"), lastSeenAt: null },
    ])
    expect(result.map((g) => g.groupId)).toEqual(["newest", "middle", "oldest"])
  })

  it("puts every opened group ahead of every never-opened group, regardless of dates", () => {
    // "never-opened" carries a joinedAt more recent than the opened group's
    // lastSeenAt, so an implementation that sorts by date alone (ignoring
    // the opened/never-opened bucket) would put it first and fail here.
    const result = orderGroupsByRecentlyOpened([
      { groupId: "never-opened-but-newer", joinedAt: new Date("2026-08-25"), lastSeenAt: null },
      { groupId: "opened-but-older", joinedAt: new Date("2026-01-01"), lastSeenAt: new Date("2026-02-01") },
    ])
    expect(result.map((g) => g.groupId)).toEqual(["opened-but-older", "never-opened-but-newer"])
  })

  it("breaks a lastSeenAt tie by joinedAt, most recent first", () => {
    const tie = new Date("2026-08-01")
    const result = orderGroupsByRecentlyOpened([
      { groupId: "joined-earlier", joinedAt: new Date("2026-01-01"), lastSeenAt: tie },
      { groupId: "joined-later", joinedAt: new Date("2026-06-01"), lastSeenAt: tie },
    ])
    expect(result.map((g) => g.groupId)).toEqual(["joined-later", "joined-earlier"])
  })

  it("breaks a joinedAt tie nested inside a lastSeenAt tie by groupId ascending", () => {
    const lastSeenTie = new Date("2026-08-01")
    const joinedTie = new Date("2026-01-01")
    const result = orderGroupsByRecentlyOpened([
      { groupId: "zeta", joinedAt: joinedTie, lastSeenAt: lastSeenTie },
      { groupId: "beta", joinedAt: new Date("2026-06-01"), lastSeenAt: lastSeenTie },
      { groupId: "alpha", joinedAt: joinedTie, lastSeenAt: lastSeenTie },
    ])
    // All three share lastSeenAt. "beta" has a later joinedAt so it leads;
    // "alpha" and "zeta" share both lastSeenAt and joinedAt, so groupId
    // (ascending) is what puts alpha before zeta.
    expect(result.map((g) => g.groupId)).toEqual(["beta", "alpha", "zeta"])
  })

  it("does not mutate the array it was given", () => {
    const memberships = [
      { groupId: "older", joinedAt: new Date("2026-06-01"), lastSeenAt: null },
      { groupId: "newest", joinedAt: new Date("2026-07-20"), lastSeenAt: new Date("2026-08-01") },
    ]
    const snapshot = memberships.map((m) => m.groupId)
    orderGroupsByRecentlyOpened(memberships)
    expect(memberships.map((m) => m.groupId)).toEqual(snapshot)
  })

  it("carries extra fields through untouched, for callers passing richer rows", () => {
    const result = orderGroupsByRecentlyOpened([
      { groupId: "a", joinedAt: new Date("2026-01-01"), lastSeenAt: null, name: "Climbing Crew" },
      { groupId: "b", joinedAt: new Date("2026-02-01"), lastSeenAt: null, name: "Book Club" },
    ])
    expect(result[0]).toEqual({
      groupId: "b",
      joinedAt: new Date("2026-02-01"),
      lastSeenAt: null,
      name: "Book Club",
    })
  })
})
