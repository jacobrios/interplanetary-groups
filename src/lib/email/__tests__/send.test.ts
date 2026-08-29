// src/lib/email/__tests__/send.test.ts
//
// The Resend client is mocked throughout: this file must never send anything.
// What is under test is the seam's own contract, the mapping from a service
// reply to a normalized result, and the non-production guard.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }))
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock }
  },
}))

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  vi.resetModules()
  sendMock.mockReset()
  process.env.RESEND_API_KEY = "test-key"
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

const MESSAGE = {
  subject: "Your group this evening",
  text: "Beers on Tuesday needs your answer.",
  html: "<p>Beers on Tuesday needs your answer.</p>",
}

describe("the non-production send guard", () => {
  it("suppresses an address that is not on the allowlist, and never calls the service", async () => {
    process.env.VERCEL_ENV = "development"
    process.env.EMAIL_DEV_ALLOWLIST = "owner@example.com"
    const { sendEmail } = await import("../send")

    const result = await sendEmail({ to: "areal@member.com", ...MESSAGE })

    expect(result).toBe("suppressed_dev")
    expect(sendMock).not.toHaveBeenCalled()
  })

  it("suppresses everything when the allowlist is unset", async () => {
    process.env.VERCEL_ENV = "development"
    delete process.env.EMAIL_DEV_ALLOWLIST
    const { sendEmail } = await import("../send")

    expect(await sendEmail({ to: "owner@example.com", ...MESSAGE })).toBe("suppressed_dev")
    expect(sendMock).not.toHaveBeenCalled()
  })

  it("sends to an allowlisted address, matching case-insensitively and ignoring spaces", async () => {
    process.env.VERCEL_ENV = "development"
    process.env.EMAIL_DEV_ALLOWLIST = " owner@example.com , other@example.com "
    sendMock.mockResolvedValue({ data: { id: "msg_1" }, error: null })
    const { sendEmail } = await import("../send")

    expect(await sendEmail({ to: "Owner@Example.com", ...MESSAGE })).toBe("ok")
    expect(sendMock).toHaveBeenCalledTimes(1)
  })

  it("does not apply the guard in production", async () => {
    process.env.VERCEL_ENV = "production"
    delete process.env.EMAIL_DEV_ALLOWLIST
    sendMock.mockResolvedValue({ data: { id: "msg_1" }, error: null })
    const { sendEmail } = await import("../send")

    expect(await sendEmail({ to: "anyone@example.com", ...MESSAGE })).toBe("ok")
    expect(sendMock).toHaveBeenCalledTimes(1)
  })
})

describe("the result mapping", () => {
  beforeEach(() => {
    process.env.VERCEL_ENV = "production"
  })

  it("returns ok when the service accepts", async () => {
    sendMock.mockResolvedValue({ data: { id: "msg_1" }, error: null })
    const { sendEmail } = await import("../send")
    expect(await sendEmail({ to: "a@b.com", ...MESSAGE })).toBe("ok")
  })

  it("maps a validation error to invalid_address", async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { name: "validation_error", message: "invalid to field" },
    })
    const { sendEmail } = await import("../send")
    expect(await sendEmail({ to: "nonsense", ...MESSAGE })).toBe("invalid_address")
  })

  it("maps both limit refusals to rate_limited", async () => {
    const { sendEmail } = await import("../send")
    for (const name of ["rate_limit_exceeded", "daily_quota_exceeded"]) {
      sendMock.mockResolvedValue({ data: null, error: { name, message: "slow down" } })
      expect(await sendEmail({ to: "a@b.com", ...MESSAGE })).toBe("rate_limited")
    }
  })

  it("maps an unrecognised service error to service_error", async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { name: "internal_server_error", message: "boom" },
    })
    const { sendEmail } = await import("../send")
    expect(await sendEmail({ to: "a@b.com", ...MESSAGE })).toBe("service_error")
  })

  it("maps a thrown network failure to service_error rather than escaping", async () => {
    sendMock.mockRejectedValue(new Error("ECONNRESET"))
    const { sendEmail } = await import("../send")
    await expect(sendEmail({ to: "a@b.com", ...MESSAGE })).resolves.toBe("service_error")
  })

  it("returns service_error when the API key is missing, without calling the service", async () => {
    delete process.env.RESEND_API_KEY
    const { sendEmail } = await import("../send")
    expect(await sendEmail({ to: "a@b.com", ...MESSAGE })).toBe("service_error")
    expect(sendMock).not.toHaveBeenCalled()
  })

  it("sets both List-Unsubscribe headers when given a URL, and neither when not", async () => {
    sendMock.mockResolvedValue({ data: { id: "msg_1" }, error: null })
    const { sendEmail } = await import("../send")

    await sendEmail({ to: "a@b.com", ...MESSAGE, unsubscribeUrl: "https://x.test/u/tok" })
    expect(sendMock.mock.calls[0][0].headers).toEqual({
      "List-Unsubscribe": "<https://x.test/u/tok>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    })

    await sendEmail({ to: "a@b.com", ...MESSAGE })
    expect(sendMock.mock.calls[1][0].headers).toBeUndefined()
  })

  it("never logs the address itself, on a generic error and on the validation branch", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const { sendEmail } = await import("../send")

    sendMock.mockResolvedValue({
      data: null,
      error: { name: "internal_server_error", message: "boom" },
    })
    await sendEmail({ to: "secret@member.com", ...MESSAGE })

    // The validation branch is the highest-risk one: it logs error.message
    // verbatim, so this proves our own code adds nothing, using a message
    // that (unlike a real Resend reply might) does not itself contain the
    // address. What a real echoed address would do is covered separately,
    // below, as a documented residual rather than asserted away here.
    sendMock.mockResolvedValue({
      data: null,
      error: { name: "validation_error", message: "invalid to field" },
    })
    await sendEmail({ to: "secret@member.com", ...MESSAGE })

    const logged = [...warn.mock.calls, ...error.mock.calls].flat().join(" ")
    expect(logged).not.toContain("secret@member.com")
    warn.mockRestore()
    error.mockRestore()
  })

  it("documents the residual risk: a validation message that echoes the address reaches the log", async () => {
    // This is the known limitation named in send.ts's header, pinned rather
    // than hidden: our code never puts input.to into a log call itself, but
    // the validation branch logs error.message verbatim, and Resend's real
    // validation errors for a malformed `to` field can echo the offending
    // address back in that message. This test is not catching a bug; it is
    // proving the caveat is true so nobody "fixes" it into a false guarantee.
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    sendMock.mockResolvedValue({
      data: null,
      error: { name: "validation_error", message: "invalid to field: secret@member.com" },
    })
    const { sendEmail } = await import("../send")

    await sendEmail({ to: "secret@member.com", ...MESSAGE })

    const logged = error.mock.calls.flat().join(" ")
    expect(logged).toContain("secret@member.com")
    error.mockRestore()
  })
})
