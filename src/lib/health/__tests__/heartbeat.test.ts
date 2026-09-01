// src/lib/health/__tests__/heartbeat.test.ts
//
// fetch is stubbed throughout: nothing here reaches the network. The one
// thing these tests cannot prove is that Better Stack actually raises an
// incident, which is why scripts/qa-health.ts has a --ping mode the owner
// runs by hand against a real monitor.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { reportHealth } from "../heartbeat"
import type { HealthVerdict } from "../check"

const HEALTHY: HealthVerdict = { ok: true, ranSteps: ["user_row"], skipped: [] }
const BROKEN: HealthVerdict = {
  ok: false,
  failedStep: "user_row",
  detail: "PrismaClientKnownRequestError: The column User.digestOptOutAt does not exist",
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("reportHealth", () => {
  it("does nothing at all when no heartbeat URL is configured", async () => {
    vi.stubEnv("HEALTH_HEARTBEAT_URL", "")

    expect(await reportHealth(HEALTHY)).toBe("not_configured")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("pings the base URL when healthy", async () => {
    vi.stubEnv("HEALTH_HEARTBEAT_URL", "https://uptime.betterstack.com/api/v1/heartbeat/tok")

    expect(await reportHealth(HEALTHY)).toBe("reported_ok")
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://uptime.betterstack.com/api/v1/heartbeat/tok"
    )
  })

  it("pings /fail with the reason in the body when broken", async () => {
    vi.stubEnv("HEALTH_HEARTBEAT_URL", "https://uptime.betterstack.com/api/v1/heartbeat/tok")

    expect(await reportHealth(BROKEN)).toBe("reported_failure")

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://uptime.betterstack.com/api/v1/heartbeat/tok/fail")
    expect(init.body).toContain("user_row")
    expect(init.body).toContain("digestOptOutAt")
  })

  it("does not produce a double slash when the configured URL has a trailing one", async () => {
    vi.stubEnv("HEALTH_HEARTBEAT_URL", "https://uptime.betterstack.com/api/v1/heartbeat/tok/")

    await reportHealth(BROKEN)

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://uptime.betterstack.com/api/v1/heartbeat/tok/fail"
    )
  })

  it("passes an abort signal, so a hanging monitor cannot hang the cron", async () => {
    vi.stubEnv("HEALTH_HEARTBEAT_URL", "https://uptime.betterstack.com/api/v1/heartbeat/tok")

    await reportHealth(HEALTHY)

    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
  })

  it("reports unreachable rather than throwing when the request rejects", async () => {
    vi.stubEnv("HEALTH_HEARTBEAT_URL", "https://uptime.betterstack.com/api/v1/heartbeat/tok")
    fetchMock.mockRejectedValueOnce(new Error("network down"))

    await expect(reportHealth(HEALTHY)).resolves.toBe("unreachable")
  })

  it("reports unreachable on a non-2xx response", async () => {
    vi.stubEnv("HEALTH_HEARTBEAT_URL", "https://uptime.betterstack.com/api/v1/heartbeat/tok")
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }))

    expect(await reportHealth(HEALTHY)).toBe("unreachable")
  })
})
