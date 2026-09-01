import { describe, expect, it } from "vitest"
import { resolveFrontDoor } from "@/lib/nav/front-door"

describe("resolveFrontDoor", () => {
  it("shows the front door when there is no membership at all", () => {
    expect(resolveFrontDoor([])).toEqual({ kind: "front-door" })
  })

  it("sends a member of one group straight into that group", () => {
    const result = resolveFrontDoor([{ groupId: "group-a" }])
    expect(result).toEqual({ kind: "group", groupId: "group-a" })
  })

  it("sends a member of several groups to the list instead of guessing one", () => {
    const result = resolveFrontDoor([
      { groupId: "older" },
      { groupId: "newest" },
      { groupId: "middle" },
    ])
    expect(result).toEqual({ kind: "groups" })
  })
})
