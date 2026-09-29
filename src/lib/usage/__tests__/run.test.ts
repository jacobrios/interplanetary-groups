// src/lib/usage/__tests__/run.test.ts
//
// The weekly usage report step wired end to end against the real dev-test
// database, in the idiom of src/lib/digest/__tests__/run.test.ts: "[TEST] "
// names, ids torn down children before parents, sendEmail mocked at module
// level so nothing leaves this process. Every run is scoped with groupIds to
// the groups this file built, because an unscoped report would read every real
// group sitting in the shared database.

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import { ContactMethodType } from "@prisma/client"

const sendEmailMock = vi.fn()
vi.mock("@/lib/email/send", () => ({
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
}))

import { runWeeklyUsageReport } from "../run"

const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
const userIds: string[] = []
const groupIds: string[] = []

afterAll(async () => {
  for (const id of groupIds) {
    await prisma.membership.deleteMany({ where: { groupId: id } }).catch(() => {})
    await prisma.group.delete({ where: { id } }).catch(() => {})
  }
  for (const id of userIds) {
    await prisma.contactMethod.deleteMany({ where: { userId: id } }).catch(() => {})
    await prisma.user.delete({ where: { id } }).catch(() => {})
  }
  await prisma.$disconnect()
})

let counter = 0
async function makeUser(label: string) {
  counter += 1
  const user = await prisma.user.create({
    data: { name: `[TEST] ${label}`, supabaseAuthId: `test-usage-run-${stamp}-${counter}` },
  })
  userIds.push(user.id)
  return user
}

async function makeGroup(name: string, founderId: string) {
  const group = await prisma.group.create({
    data: {
      name,
      founderId,
      timeZone: "UTC",
      // Pinned: collectUsage ignores anything created after its `now`, and the
      // schema default would stamp the real clock, later than REPORT_HOUR.
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      memberships: { create: [{ userId: founderId, joinedAt: new Date("2026-01-01T00:00:00.000Z") }] },
    },
  })
  groupIds.push(group.id)
  return group
}

// Monday 8am Chicago (CDT, UTC-5) is 13:00 UTC; 2026-09-28 is a Monday.
const REPORT_HOUR = new Date("2026-09-28T13:00:00.000Z")
const NOT_REPORT_HOUR = new Date("2026-09-28T14:00:00.000Z")
const OWNER_ADDRESS = `owner-${stamp}@example.com`

beforeEach(() => {
  sendEmailMock.mockReset()
  sendEmailMock.mockResolvedValue("sent")
  vi.stubEnv("USAGE_REPORT_TO", OWNER_ADDRESS)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("runWeeklyUsageReport", () => {
  it("does nothing outside Monday 8am Chicago", async () => {
    const result = await runWeeklyUsageReport(NOT_REPORT_HOUR, { groupIds: [] })

    expect(result).toEqual({ status: "not_report_hour" })
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it("does nothing when USAGE_REPORT_TO is unset or blank", async () => {
    vi.stubEnv("USAGE_REPORT_TO", "   ")

    const result = await runWeeklyUsageReport(REPORT_HOUR, { groupIds: [] })

    expect(result).toEqual({ status: "no_recipient" })
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it("sends one report to the recipient in the report hour, naming a fixture group", async () => {
    const founder = await makeUser("founder")
    const group = await makeGroup(`[TEST] Usage Climbers ${stamp}`, founder.id)

    const result = await runWeeklyUsageReport(REPORT_HOUR, { groupIds: [group.id] })

    expect(result).toEqual({ status: "sent", result: "sent" })
    expect(sendEmailMock).toHaveBeenCalledTimes(1)
    const arg = sendEmailMock.mock.calls[0][0]
    expect(arg.to).toBe(OWNER_ADDRESS)
    expect(arg.text).toContain(group.name)
  })

  it("excludes groups of the account whose verified address matches, in any case", async () => {
    const owner = await makeUser("owner")
    await prisma.contactMethod.create({
      data: {
        userId: owner.id,
        type: ContactMethodType.EMAIL,
        value: OWNER_ADDRESS.toLowerCase(),
        isVerified: true,
      },
    })
    const ownerGroup = await makeGroup(`[TEST] Owner Hidden ${stamp}`, owner.id)
    const otherFounder = await makeUser("other")
    const otherGroup = await makeGroup(`[TEST] Other Shown ${stamp}`, otherFounder.id)
    vi.stubEnv("USAGE_REPORT_TO", `  ${OWNER_ADDRESS.toUpperCase()} `)

    await runWeeklyUsageReport(REPORT_HOUR, { groupIds: [ownerGroup.id, otherGroup.id] })

    const arg = sendEmailMock.mock.calls[0][0]
    expect(arg.text).not.toContain(ownerGroup.name)
    expect(arg.text).toContain(otherGroup.name)
    expect(arg.text).toContain("Excluded 1 group")
  })

  it("does not recognise an unverified match", async () => {
    // Its own address: the previous test leaves a verified owner on OWNER_ADDRESS.
    const address = `unverified-${stamp}@example.com`
    vi.stubEnv("USAGE_REPORT_TO", address)
    const owner = await makeUser("unverified-owner")
    await prisma.contactMethod.create({
      data: { userId: owner.id, type: ContactMethodType.EMAIL, value: address, isVerified: false },
    })
    const group = await makeGroup(`[TEST] Unverified Shown ${stamp}`, owner.id)

    await runWeeklyUsageReport(REPORT_HOUR, { groupIds: [group.id] })

    const arg = sendEmailMock.mock.calls[0][0]
    expect(arg.text).toContain(group.name)
    expect(arg.text).toContain("matches no signed-in account")
  })
})
