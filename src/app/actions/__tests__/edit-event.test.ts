// src/app/actions/__tests__/edit-event.test.ts
//
// The thin action behind the plan's Edit form. Session, database and the
// submit seam are all mocked: what is under test is only what this action
// owns, which is handing the form's fields (including the values the form
// was opened with) to submitEventEdit, and refreshing the page whenever
// something was actually saved, even if a later step then failed.
import { beforeEach, describe, expect, it, vi } from "vitest"

const { revalidatePath, getUser, userFindUnique, eventFindUnique, submitEventEdit } = vi.hoisted(
  () => ({
    revalidatePath: vi.fn(),
    getUser: vi.fn(),
    userFindUnique: vi.fn(),
    eventFindUnique: vi.fn(),
    submitEventEdit: vi.fn(),
  })
)

vi.mock("next/cache", () => ({ revalidatePath }))
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: userFindUnique },
    event: { findUnique: eventFindUnique },
  },
}))
vi.mock("@/lib/events/submit-edit", () => ({ submitEventEdit }))

import { editEventAction } from "../edit-event"

function form(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

const FIELDS = {
  eventId: "evt_1",
  title: "Doubles",
  place: "Court 5",
  dateLocal: "2099-06-13",
  timeLocal: "10:00",
  origTitle: "Tennis",
  origPlace: "",
  origDateLocal: "2099-06-13",
  origTimeLocal: "09:00",
}

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: "auth_1" } } })
  userFindUnique.mockResolvedValue({ id: "usr_1", name: "Casey" })
  eventFindUnique.mockResolvedValue({ groupId: "grp_1" })
})

describe("editEventAction", () => {
  it("passes the values the form was opened with through as the original", async () => {
    submitEventEdit.mockResolvedValue({ status: "ok", edited: true, proposed: true })
    await editEventAction({}, form(FIELDS))

    expect(submitEventEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "evt_1",
        title: "Doubles",
        place: "Court 5",
        dateLocal: "2099-06-13",
        timeLocal: "10:00",
        original: { title: "Tennis", place: "", dateLocal: "2099-06-13", timeLocal: "09:00" },
      })
    )
  })

  it("refreshes the plan and the group home after a partial save, and still reports the error", async () => {
    submitEventEdit.mockResolvedValue({
      status: "error",
      message: "Your other changes are saved, but someone just changed the time.",
      edited: true,
    })
    const state = await editEventAction({}, form(FIELDS))

    expect(state.errors?.general).toBe(
      "Your other changes are saved, but someone just changed the time."
    )
    expect(revalidatePath).toHaveBeenCalledWith("/events/evt_1")
    expect(revalidatePath).toHaveBeenCalledWith("/groups/grp_1")
  })

  it("refreshes nothing when the save was refused outright", async () => {
    submitEventEdit.mockResolvedValue({
      status: "error",
      message: "Someone else just changed this plan, take another look.",
    })
    const state = await editEventAction({}, form(FIELDS))

    expect(state.errors?.general).toBe("Someone else just changed this plan, take another look.")
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
