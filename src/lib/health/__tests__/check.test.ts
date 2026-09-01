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

  it("survives a probe that rejects with a value that cannot even be stringified", async () => {
    const verdict = await runHealthCheck(new Date(), [
      { name: "user_row", run: async () => { throw Object.create(null) } },
    ])

    expect(verdict.ok).toBe(false)
    if (verdict.ok) throw new Error("unreachable")
    expect(verdict.failedStep).toBe("user_row")
    expect(verdict.detail.length).toBeGreaterThan(0)
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

  it("surfaces a Prisma error code, which names the fault and cannot carry a row value", () => {
    class PrismaClientKnownRequestError extends Error {
      code: string
      constructor(message: string, code: string) {
        super(message)
        this.code = code
      }
    }
    const err = new PrismaClientKnownRequestError(
      "The column `User.digestOptOutAt` does not exist",
      "P2022"
    )

    expect(describeError(err)).toBe(
      "PrismaClientKnownRequestError [P2022]: The column `User.digestOptOutAt` does not exist"
    )
  })

  it("formats an error carrying no code exactly as it did before codes existed", () => {
    expect(describeError(new TypeError("nope"))).toBe("TypeError: nope")
    expect(describeError(new Error("plain"))).toBe("Error: plain")
    // A non-string code is not a code. Narrowing, not casting.
    const weird = Object.assign(new Error("plain"), { code: 42 })
    expect(describeError(weird)).toBe("Error: plain")
  })

  it("keeps BOTH ends of a long message, because a Prisma error hides its diagnosis at the back", () => {
    // Shaped like the real thing: a code frame and an absolute path at the
    // front, the actual cause at the very end. Head-only truncation keeps the
    // path and throws the cause away.
    const preamble =
      "Invalid `client.user.findFirst()` invocation in\n" +
      "/Users/someone/code/interplanetary-groups/src/lib/health/check.ts:136:26\n".repeat(8)
    const cause = "The column `User.digestOptOutAt` does not exist in the current database."
    const detail = describeError(new Error(`${preamble}\n${cause}`))

    expect(detail.length).toBeLessThanOrEqual(500)
    expect(detail).toContain("Invalid `client.user.findFirst()` invocation")
    expect(detail).toContain("does not exist in the current database.")
  })
})
