import { beforeEach, describe, expect, it, vi } from "vitest"

const { getUser, signInAnonymously, provisionFounderGroup, reconcileScheduledEvents } = vi.hoisted(
  () => ({
    getUser: vi.fn(),
    signInAnonymously: vi.fn(),
    provisionFounderGroup: vi.fn(),
    reconcileScheduledEvents: vi.fn(),
  })
)
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser, signInAnonymously } }),
}))
vi.mock("@/lib/groups/provision", () => ({ provisionFounderGroup }))
vi.mock("@/lib/orbit/reconcile", () => ({ reconcileScheduledEvents }))

import { createGroupAction } from "../create-group"

const climbing = (venueName: string | null) => ({
  activity: "climbing",
  title: "Climbing",
  cadence: "weekly",
  daysOfWeek: [2, 4],
  timeLocal: "19:00",
  venueName,
})
const beers = {
  activity: "beers",
  title: "Beers",
  cadence: "monthly",
  daysOfWeek: null,
  timeLocal: null,
  venueName: null,
}
const input = (rhythms: unknown) => ({
  founderName: "Jacob",
  groupName: "Climbing Crew",
  description: "x",
  rhythms,
  timeZone: "America/New_York",
})

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: "auth_1" } } })
  provisionFounderGroup.mockResolvedValue({ group: { id: "grp_1", inviteToken: "tok_1" } })
  reconcileScheduledEvents.mockResolvedValue(undefined)
})

describe("createGroupAction, the main spot (decision 8)", () => {
  it("refuses a main activity with no spot and creates nothing", async () => {
    expect(await createGroupAction(input([climbing(null)]))).toEqual({
      error: "Add where you meet for climbing.",
    })
    expect(provisionFounderGroup).not.toHaveBeenCalled()
  })

  it("refuses a blank spot the same way", async () => {
    expect(await createGroupAction(input([climbing("   ")]))).toEqual({
      error: "Add where you meet for climbing.",
    })
    expect(provisionFounderGroup).not.toHaveBeenCalled()
  })

  it("creates the group when the main activity has a spot, a spotless secondary notwithstanding", async () => {
    expect(await createGroupAction(input([climbing("Movement Gowanus"), beers]))).toEqual({
      groupId: "grp_1",
      inviteToken: "tok_1",
    })
    expect(provisionFounderGroup).toHaveBeenCalledTimes(1)
  })
})

describe("createGroupAction, spontaneous activities are never stored", () => {
  it("truncates a two-row payload to just the main activity before provisioning", async () => {
    expect(await createGroupAction(input([climbing("Movement Gowanus"), beers]))).toEqual({
      groupId: "grp_1",
      inviteToken: "tok_1",
    })
    expect(provisionFounderGroup).toHaveBeenCalledTimes(1)
    const call = provisionFounderGroup.mock.calls[0][0]
    expect(call.recurringActivities).toHaveLength(1)
    expect(call.recurringActivities[0].activity).toBe("climbing")
  })

  it("does not truncate a single-row payload", async () => {
    await createGroupAction(input([climbing("Movement Gowanus")]))
    const call = provisionFounderGroup.mock.calls[0][0]
    expect(call.recurringActivities).toHaveLength(1)
  })
})
