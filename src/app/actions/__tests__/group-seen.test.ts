// src/app/actions/__tests__/group-seen.test.ts
//
// The write behind the group home's read position. The session lookup and the
// database write are both mocked: no Supabase, no database. What is under test
// is the only part that is ours, which is what this action promises its caller
// in its own header, because this is the action whose header said "a failure
// is logged and swallowed" while half of that was untrue and nothing here
// would have noticed.
//
// The other half, the trip itself, cannot be tested from this side: it is the
// caller's catch, and it is pinned in
// src/app/groups/[id]/__tests__/SeenMarker.test.tsx.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { getCurrentUser, markGroupSeen } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  markGroupSeen: vi.fn(),
}))

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser }))
vi.mock("@/lib/groups/seen", () => ({ markGroupSeen }))

import { markGroupSeenAction } from "../group-seen"

let errorLog: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {})
  getCurrentUser.mockResolvedValue({ id: "usr_1" })
  markGroupSeen.mockResolvedValue(undefined)
})

afterEach(() => {
  errorLog.mockRestore()
})

describe("markGroupSeenAction", () => {
  it("records the read position for the signed-in caller and the group given", async () => {
    await markGroupSeenAction("grp_1")

    expect(markGroupSeen).toHaveBeenCalledTimes(1)
    expect(markGroupSeen).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "usr_1", groupId: "grp_1" })
    )
  })

  it("stamps the write with the current time rather than leaving it to the caller", async () => {
    const before = Date.now()
    await markGroupSeenAction("grp_1")
    const after = Date.now()

    const { now } = markGroupSeen.mock.calls[0][0] as { now: Date }
    expect(now).toBeInstanceOf(Date)
    expect(now.getTime()).toBeGreaterThanOrEqual(before)
    expect(now.getTime()).toBeLessThanOrEqual(after)
  })

  // A signed-out viewer has no read position to record, so this returns before
  // touching the database rather than writing a row for nobody. SeenMarker
  // already declines to call for a null viewer; this is the server half of the
  // same rule, and it is the half that holds when the client is not the one
  // asking.
  it("writes nothing when nobody is signed in", async () => {
    getCurrentUser.mockResolvedValue(null)

    await expect(markGroupSeenAction("grp_1")).resolves.toBeUndefined()
    expect(markGroupSeen).not.toHaveBeenCalled()
  })

  // The promise its header makes: a failure inside the server function never
  // reaches the caller, because nothing on screen depends on this write and an
  // escaping error would surface the group home's error boundary.
  it("swallows a failed write, and logs it rather than losing it", async () => {
    markGroupSeen.mockRejectedValue(new Error("pool exhausted"))

    await expect(markGroupSeenAction("grp_1")).resolves.toBeUndefined()
    expect(errorLog).toHaveBeenCalled()
    expect(errorLog.mock.calls.flat().join(" ")).toContain("[group-seen]")
  })

  it("swallows a failed session lookup the same way", async () => {
    getCurrentUser.mockRejectedValue(new Error("auth service down"))

    await expect(markGroupSeenAction("grp_1")).resolves.toBeUndefined()
    expect(markGroupSeen).not.toHaveBeenCalled()
    expect(errorLog).toHaveBeenCalled()
  })
})
