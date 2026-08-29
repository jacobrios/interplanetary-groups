// src/app/actions/__tests__/unsubscribe.test.ts
//
// The write behind the unsubscribe page's button. The database is mocked: what
// is under test is the contract this action makes with the one screen that
// reads it, which is the thing that was missing when the screen confirmed an
// opt-out that had not been recorded.
//
// The deliberate asymmetry with its sibling next door: markGroupSeenAction
// returns nothing because no pixel depends on it, and this one returns a
// result because the screen's entire job is to report the outcome.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { unsubscribeByToken } = vi.hoisted(() => ({ unsubscribeByToken: vi.fn() }))
vi.mock("@/lib/email/unsubscribe", () => ({ unsubscribeByToken }))

import { unsubscribeAction } from "../unsubscribe"

let errorLog: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {})
  unsubscribeByToken.mockResolvedValue(undefined)
})

afterEach(() => {
  errorLog.mockRestore()
})

describe("unsubscribeAction", () => {
  it("records the opt-out for the token it was handed, and says it landed", async () => {
    expect(await unsubscribeAction("tok_1")).toBe("ok")
    expect(unsubscribeByToken).toHaveBeenCalledTimes(1)
    expect(unsubscribeByToken.mock.calls[0][0]).toBe("tok_1")
  })

  it("stamps the opt-out with the current time", async () => {
    const before = Date.now()
    await unsubscribeAction("tok_1")
    const after = Date.now()

    const now = unsubscribeByToken.mock.calls[0][1] as Date
    expect(now).toBeInstanceOf(Date)
    expect(now.getTime()).toBeGreaterThanOrEqual(before)
    expect(now.getTime()).toBeLessThanOrEqual(after)
  })

  // The finding this test exists for. A swallowed failure let the screen show
  // "You're unsubscribed" over a digestOptOutAt that was still null, so the
  // member kept getting mail they believed they had stopped and the only thing
  // left to reach for was the spam button, which is what the `updates.`
  // subdomain split exists to prevent.
  it("reports a failed write instead of letting the screen claim success", async () => {
    unsubscribeByToken.mockRejectedValue(new Error("pool exhausted"))

    expect(await unsubscribeAction("tok_1")).toBe("service_error")
  })

  it("logs the underlying error rather than throwing it away", async () => {
    unsubscribeByToken.mockRejectedValue(new Error("pool exhausted"))

    await unsubscribeAction("tok_1")

    const logged = errorLog.mock.calls.flat().join(" ")
    expect(logged).toContain("[unsubscribe]")
    expect(errorLog.mock.calls.flat()).toContainEqual(
      expect.objectContaining({ message: "pool exhausted" })
    )
  })

  it("never throws, whatever the database does", async () => {
    unsubscribeByToken.mockRejectedValue(new Error("boom"))
    await expect(unsubscribeAction("tok_1")).resolves.toBe("service_error")
  })

  // An unknown or already-used token is not an error and must not read as one.
  // The library's scoped updateMany writes nothing in both cases, so the action
  // returns ok and the page shows the same confirmation either way, which is
  // what stops a stranger holding a guessed token learning anything from the
  // difference.
  it("says ok for a token that matched nobody, so a guess learns nothing", async () => {
    unsubscribeByToken.mockResolvedValue(undefined)

    expect(await unsubscribeAction("tok_nobody_has")).toBe("ok")
    expect(errorLog).not.toHaveBeenCalled()
  })
})
