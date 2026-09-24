// src/app/actions/__tests__/update-group-details.test.ts
//
// The thin action behind the founder's group-details form. Session and the
// lib save are mocked: what is under test is only what this action owns,
// which is parsing the form, mapping the lib's refusals to copy, and
// refreshing the pages the save touched.
import { beforeEach, describe, expect, it, vi } from "vitest"

const { revalidatePath, getUser, updateGroupDetails } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  getUser: vi.fn(),
  updateGroupDetails: vi.fn(),
}))

vi.mock("next/cache", () => ({ revalidatePath }))
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}))
vi.mock("@/lib/groups/update-details", () => ({ updateGroupDetails }))

import { updateGroupDetailsAction } from "../update-group-details"
import { DETAILS_GENERIC } from "@/lib/groups/details-edit"

function form(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

const RHYTHMS = [{ activity: "tennis", daysOfWeek: [6], timeLocal: "09:00", venueName: "Court 5" }]

const FIELDS = {
  groupId: "grp_1",
  payload: JSON.stringify({ name: "Racket Club", rhythms: RHYTHMS }),
  planChoice: "update",
  planEventId: "evt_1",
  planStartsAt: "2099-06-13T14:00:00.000Z",
}

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: "auth_1" } } })
  updateGroupDetails.mockResolvedValue({ status: "ok" })
})

describe("updateGroupDetailsAction", () => {
  it("asks a signed-out visitor to sign in and saves nothing", async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const state = await updateGroupDetailsAction({}, form(FIELDS))
    expect(state.errors?.general).toBe("You need to be signed in for that.")
    expect(updateGroupDetails).not.toHaveBeenCalled()
  })

  it("maps a non-founder refusal to the founder-only message", async () => {
    updateGroupDetails.mockRejectedValue(new Error("NOT_FOUNDER"))
    const state = await updateGroupDetailsAction({}, form(FIELDS))
    expect(state.errors?.general).toBe("Only the founder can change group details.")
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("returns the generic error for a payload that is not JSON", async () => {
    const state = await updateGroupDetailsAction({}, form({ ...FIELDS, payload: "{not json" }))
    expect(state.errors?.general).toBe(DETAILS_GENERIC)
    expect(updateGroupDetails).not.toHaveBeenCalled()
  })

  it("returns the generic error when rhythms is not an array", async () => {
    const state = await updateGroupDetailsAction(
      {},
      form({ ...FIELDS, payload: JSON.stringify({ name: "X", rhythms: "tennis" }) })
    )
    expect(state.errors?.general).toBe(DETAILS_GENERIC)
    expect(updateGroupDetails).not.toHaveBeenCalled()
  })

  it("hands the form's fields to the save and refreshes the info page, the home and the plan", async () => {
    const state = await updateGroupDetailsAction({}, form(FIELDS))
    expect(state).toEqual({})
    expect(updateGroupDetails).toHaveBeenCalledWith(
      expect.objectContaining({
        supabaseAuthId: "auth_1",
        groupId: "grp_1",
        name: "Racket Club",
        rhythms: RHYTHMS,
        planChoice: "update",
        openedPlan: { eventId: "evt_1", startsAt: "2099-06-13T14:00:00.000Z" },
      })
    )
    expect(revalidatePath).toHaveBeenCalledWith("/groups/grp_1/info")
    expect(revalidatePath).toHaveBeenCalledWith("/groups/grp_1")
    expect(revalidatePath).toHaveBeenCalledWith("/groups")
    expect(revalidatePath).toHaveBeenCalledWith("/events/evt_1")
  })

  it("passes no plan choice and no opened plan when the form asked no question", async () => {
    await updateGroupDetailsAction(
      {},
      form({ ...FIELDS, planChoice: "", planEventId: "", planStartsAt: "" })
    )
    expect(updateGroupDetails).toHaveBeenCalledWith(
      expect.objectContaining({ planChoice: null, openedPlan: null })
    )
    expect(revalidatePath).toHaveBeenCalledTimes(3)
  })

  it("refreshes /groups too, so a rename shows up in the group list", async () => {
    await updateGroupDetailsAction({}, form(FIELDS))
    expect(revalidatePath).toHaveBeenCalledWith("/groups")
  })

  it("reports the save's own error, such as a stale plan", async () => {
    updateGroupDetails.mockResolvedValue({
      status: "error",
      message: "Someone just changed the next plan. Take another look.",
    })
    const state = await updateGroupDetailsAction({}, form(FIELDS))
    expect(state.errors?.general).toBe("Someone just changed the next plan. Take another look.")
  })
})
