// src/lib/health/__tests__/check.test.ts
//
// Pure: no database, no network. Every probe here is injected, which is what
// lets these tests assert the runner's contract rather than the schema's.
// The real probes are deliberately untested — see the comment above
// realProbes in check.ts for why.

import { describe, it, expect, vi } from "vitest"
import { runHealthCheck, describeError, type Probe } from "../check"

function ok(name: Probe["name"]): Probe {
  return { name, run: async () => {} }
}

describe("runHealthCheck", () => {
  it("reports ok and lists the steps it ran, in order", async () => {
    const verdict = await runHealthCheck(new Date(), [ok("user_row"), ok("membership_row")])

    expect(verdict.ok).toBe(true)
    if (!verdict.ok) throw new Error("unreachable")
    expect(verdict.ranSteps).toEqual(["user_row", "membership_row"])
    expect(verdict.skipped).toEqual([])
  })

  it("names the probe that threw, and nothing about the ones that passed", async () => {
    const verdict = await runHealthCheck(new Date(), [
      ok("user_row"),
      { name: "membership_row", run: async () => { throw new Error("column does not exist") } },
    ])

    expect(verdict.ok).toBe(false)
    if (verdict.ok) throw new Error("unreachable")
    expect(verdict.failedStep).toBe("membership_row")
    expect(verdict.detail).toContain("column does not exist")
    expect(verdict.detail).not.toContain("user_row")
  })

  it("stops at the first failure so a later probe never runs", async () => {
    const third = vi.fn(async () => {})

    await runHealthCheck(new Date(), [
      ok("user_row"),
      { name: "membership_row", run: async () => { throw new Error("boom") } },
      { name: "group_home_data", run: third },
    ])

    expect(third).not.toHaveBeenCalled()
  })

  it("records a skipped probe without failing the run", async () => {
    const verdict = await runHealthCheck(new Date(), [
      ok("user_row"),
      { name: "group_home_data", run: async () => "skip" as const },
    ])

    expect(verdict.ok).toBe(true)
    if (!verdict.ok) throw new Error("unreachable")
    expect(verdict.ranSteps).toEqual(["user_row"])
    expect(verdict.skipped).toEqual(["group_home_data"])
  })

  it("survives a probe that rejects with something that is not an Error", async () => {
    const verdict = await runHealthCheck(new Date(), [
      { name: "user_row", run: async () => { throw "just a string" } },
    ])

    expect(verdict.ok).toBe(false)
    if (verdict.ok) throw new Error("unreachable")
    expect(verdict.detail).toContain("just a string")
  })
})

describe("describeError", () => {
  it("names the error class and its message", () => {
    expect(describeError(new TypeError("nope"))).toBe("TypeError: nope")
  })

  it("truncates at 500 characters, because this string is sent off the machine", () => {
    expect(describeError(new Error("x".repeat(600))).length).toBe(500)
  })

  it("handles a thrown non-Error without throwing itself", () => {
    expect(describeError(undefined)).toContain("undefined")
  })
})
