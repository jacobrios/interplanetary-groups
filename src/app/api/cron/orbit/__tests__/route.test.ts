// src/app/api/cron/orbit/__tests__/route.test.ts
//
// Composition only. The four sweeps, the health check and the heartbeat are
// all mocked, because what is being proven here is which verdict the route
// reports in each combination, not what any of them does. The probes' own
// evidence is scripts/qa-health.ts.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/orbit/reconcile", () => ({ reconcileScheduledEvents: vi.fn(async () => []) }))
vi.mock("@/lib/orbit/endgame", () => ({ runGaugeEndgame: vi.fn(async () => []) }))
vi.mock("@/lib/proposals/endgame", () => ({ runProposalEndgame: vi.fn(async () => []) }))
vi.mock("@/lib/digest/run", () => ({ runDailyDigest: vi.fn(async () => []) }))
vi.mock("@/lib/health/heartbeat", () => ({ reportHealth: vi.fn(async () => "reported_ok") }))
vi.mock("@/lib/health/check", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/health/check")>()),
  runHealthCheck: vi.fn(),
}))

import { GET } from "../route"
import { runHealthCheck } from "@/lib/health/check"
import { reportHealth } from "@/lib/health/heartbeat"
import { reconcileScheduledEvents } from "@/lib/orbit/reconcile"
import { runDailyDigest } from "@/lib/digest/run"

const HEALTHY = { ok: true as const, ranSteps: [], skipped: [] }
const BROKEN = { ok: false as const, failedStep: "user_row" as const, detail: "P2022" }

function call() {
  return GET(new NextRequest("http://localhost:3000/api/cron/orbit"))
}

beforeEach(() => {
  vi.mocked(runHealthCheck).mockResolvedValue(HEALTHY)
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

describe("the orbit cron's health report", () => {
  it("reports a healthy verdict when everything works", async () => {
    const response = await call()

    expect(response.status).toBe(200)
    expect(vi.mocked(reportHealth).mock.calls[0][0]).toEqual(HEALTHY)
  })

  it("reports orbit_sweeps when a sweep throws, and still answers 500", async () => {
    vi.mocked(reconcileScheduledEvents).mockRejectedValueOnce(new Error("sweep exploded"))

    const response = await call()

    expect(response.status).toBe(500)
    const reported = vi.mocked(reportHealth).mock.calls[0][0]
    expect(reported.ok).toBe(false)
    if (reported.ok) throw new Error("unreachable")
    expect(reported.failedStep).toBe("orbit_sweeps")
    expect(reported.detail).toContain("sweep exploded")
  })

  it("reports the root cause, not the symptom, when both the data path and the sweeps are broken", async () => {
    // When the data path is broken the sweeps fail too. Naming orbit_sweeps
    // here would bury the actual cause, which is the easiest rule to regress.
    vi.mocked(reconcileScheduledEvents).mockRejectedValueOnce(new Error("sweep exploded"))
    vi.mocked(runHealthCheck).mockResolvedValue(BROKEN)

    await call()

    const reported = vi.mocked(reportHealth).mock.calls[0][0]
    expect(reported).toEqual(BROKEN)
  })

  it("reports a broken data path but still answers 200, because the cron did its job", async () => {
    vi.mocked(runHealthCheck).mockResolvedValue(BROKEN)

    const response = await call()

    expect(response.status).toBe(200)
    expect(vi.mocked(reportHealth).mock.calls[0][0]).toEqual(BROKEN)
  })

  it("treats a digest failure as fail-soft and still reports healthy", async () => {
    vi.mocked(runDailyDigest).mockRejectedValueOnce(new Error("digest exploded"))

    const response = await call()

    expect(response.status).toBe(200)
    expect(vi.mocked(reportHealth).mock.calls[0][0]).toEqual(HEALTHY)
  })

  it("never lets an unauthorized caller touch the heartbeat", async () => {
    // Otherwise anyone holding the URL could forge a green light.
    vi.stubEnv("CRON_SECRET", "a-secret")

    const response = await call()

    expect(response.status).toBe(401)
    expect(reportHealth).not.toHaveBeenCalled()
  })
})
