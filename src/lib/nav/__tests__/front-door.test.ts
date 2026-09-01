import { describe, expect, it } from "vitest"
import { resolveFrontDoor } from "@/lib/nav/front-door"

describe("resolveFrontDoor", () => {
  it("shows the front door when there is no membership at all", () => {
    expect(resolveFrontDoor([])).toEqual({ kind: "front-door" })
  })

  it("sends a member of one group straight into that group", () => {
    const result = resolveFrontDoor([
      { groupId: "group-a", joinedAt: new Date("2026-07-01T00:00:00Z") },
    ])
    expect(result).toEqual({ kind: "group", groupId: "group-a" })
  })

  it("sends a member of several groups to the list instead of guessing one", () => {
    const result = resolveFrontDoor([
      { groupId: "older", joinedAt: new Date("2026-06-01T00:00:00Z") },
      { groupId: "newest", joinedAt: new Date("2026-07-20T00:00:00Z") },
      { groupId: "middle", joinedAt: new Date("2026-07-02T00:00:00Z") },
    ])
    expect(result).toEqual({ kind: "groups" })
  })

  it("does not mutate the array it was given", () => {
    const memberships = [
      { groupId: "older", joinedAt: new Date("2026-06-01T00:00:00Z") },
      { groupId: "newest", joinedAt: new Date("2026-07-20T00:00:00Z") },
    ]
    const snapshot = memberships.map((m) => m.groupId)
    resolveFrontDoor(memberships)
    expect(memberships.map((m) => m.groupId)).toEqual(snapshot)
  })
})
