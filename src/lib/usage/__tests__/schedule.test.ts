// src/lib/usage/__tests__/schedule.test.ts
//
// The Monday-8am-Chicago rule, on both sides of daylight saving. Every
// instant is pinned; nothing reads the real clock.

import { describe, expect, it } from "vitest"
import { isUsageReportHour } from "../schedule"

describe("isUsageReportHour", () => {
  it("is true at 8:00 CDT on a Monday", () => {
    expect(isUsageReportHour(new Date("2026-09-28T13:00:00.000Z"))).toBe(true)
  })
  it("is true at 8:59 CDT on a Monday", () => {
    expect(isUsageReportHour(new Date("2026-09-28T13:59:00.000Z"))).toBe(true)
  })
  it("is false at 7:59 CDT on a Monday", () => {
    expect(isUsageReportHour(new Date("2026-09-28T12:59:00.000Z"))).toBe(false)
  })
  it("is false at 9:00 CDT on a Monday", () => {
    expect(isUsageReportHour(new Date("2026-09-28T14:00:00.000Z"))).toBe(false)
  })
  it("is false at 8:00 CDT on a Tuesday", () => {
    expect(isUsageReportHour(new Date("2026-09-29T13:00:00.000Z"))).toBe(false)
  })
  it("is false at 8:00 CDT on a Sunday", () => {
    expect(isUsageReportHour(new Date("2026-09-27T13:00:00.000Z"))).toBe(false)
  })
  it("is true at 8:00 CST on a winter Monday", () => {
    expect(isUsageReportHour(new Date("2026-12-07T14:00:00.000Z"))).toBe(true)
  })
  it("is false at 7:00 CST on a winter Monday", () => {
    expect(isUsageReportHour(new Date("2026-12-07T13:00:00.000Z"))).toBe(false)
  })
  // The changeover Mondays. A hardcoded UTC offset would fail one of each pair.
  it("is true at 8:00 CST on the Monday after fall back, and false an hour later", () => {
    expect(isUsageReportHour(new Date("2026-11-02T14:00:00.000Z"))).toBe(true)
    expect(isUsageReportHour(new Date("2026-11-02T13:00:00.000Z"))).toBe(false)
  })
  it("is true at 8:00 CDT on the Monday after spring forward, and false an hour later", () => {
    expect(isUsageReportHour(new Date("2026-03-09T13:00:00.000Z"))).toBe(true)
    expect(isUsageReportHour(new Date("2026-03-09T14:00:00.000Z"))).toBe(false)
  })
})
