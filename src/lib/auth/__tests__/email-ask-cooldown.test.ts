// @vitest-environment jsdom
//
// src/lib/auth/__tests__/email-ask-cooldown.test.ts
//
// This file is the only place, besides the module itself, that is allowed to
// know the cookie's name and shape. Every assertion below either drives the
// module's public functions or, for the writer's attributes (path, max-age,
// SameSite, Secure), spies on the document.cookie setter and reads the string
// assigned, because jsdom (like a real browser) hands back only the name and
// value pair on read; the attributes are write-only from JavaScript's side.

import { afterEach, describe, expect, it, vi } from "vitest"
import {
  EMAIL_ASK_SHOWN_COOKIE,
  emailAskCookieIsFresh,
  markEmailAskShown,
  parseEmailAskShown,
} from "../email-ask-cooldown"
import { ASK_COOLDOWN_MS } from "../email-offer"

// jsdom's default document URL is http://localhost:3000, so protocol is
// "http:" unless a test stubs `location` itself. Clearing document.cookie
// between tests keeps the jsdom cookie jar (which the writer and
// emailAskCookieIsFresh both read through the real document) from leaking a
// cookie set by one test into the next; jsdom has no built-in reset for it.
afterEach(() => {
  document.cookie = `${EMAIL_ASK_SHOWN_COOKIE}=; path=/; max-age=0`
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("parseEmailAskShown: every unreadable case resolves to null", () => {
  // The direction matters and is asserted by every case in this block: null
  // means "not snoozed," which means the sheet shows. A parser that failed
  // the other way would silence the ask permanently on a corrupted cookie,
  // with nothing on screen ever saying why.

  it("returns null for undefined (the cookie was never set)", () => {
    expect(parseEmailAskShown(undefined)).toBeNull()
  })

  it("returns null for the empty string", () => {
    expect(parseEmailAskShown("")).toBeNull()
  })

  it("returns null for a non-numeric string", () => {
    expect(parseEmailAskShown("not-a-number")).toBeNull()
  })

  it("returns null for the literal string NaN", () => {
    expect(parseEmailAskShown("NaN")).toBeNull()
  })

  it("returns null for a non-finite number", () => {
    expect(parseEmailAskShown("Infinity")).toBeNull()
  })

  it("returns null for zero", () => {
    expect(parseEmailAskShown("0")).toBeNull()
  })

  it("returns null for a negative number", () => {
    expect(parseEmailAskShown("-1")).toBeNull()
  })

  it("returns the corresponding Date for a valid positive epoch-ms string", () => {
    const ms = new Date("2026-09-03T12:00:00.000Z").getTime()
    const result = parseEmailAskShown(String(ms))
    expect(result).toEqual(new Date(ms))
  })
})

describe("emailAskCookieIsFresh: presence-based, not clock-based", () => {
  it("returns false when document is undefined, so it is safe on the server", () => {
    const realDocument = globalThis.document
    // @ts-expect-error deliberately removing the global to prove the
    // server-safety branch, not a real browser state.
    delete globalThis.document
    try {
      expect(emailAskCookieIsFresh()).toBe(false)
    } finally {
      globalThis.document = realDocument
    }
  })

  it("returns false when the cookie is absent", () => {
    expect(emailAskCookieIsFresh()).toBe(false)
  })

  it("returns true when the cookie is present, whatever its value", () => {
    document.cookie = `${EMAIL_ASK_SHOWN_COOKIE}=1`
    expect(emailAskCookieIsFresh()).toBe(true)
  })
})

describe("markEmailAskShown: the writer", () => {
  it("writes a cookie that reads back and round-trips through the parser to the same instant", () => {
    const now = new Date("2026-09-03T08:30:00.000Z")
    markEmailAskShown(now)

    const match = document.cookie
      .split("; ")
      .find((pair) => pair.startsWith(`${EMAIL_ASK_SHOWN_COOKIE}=`))
    expect(match).toBeDefined()

    const rawValue = match!.split("=")[1]
    expect(parseEmailAskShown(rawValue)).toEqual(now)
  })

  it("sets path=/, max-age from ASK_COOLDOWN_MS, and SameSite=Lax, with Secure absent on http:", () => {
    const setter = vi.spyOn(document, "cookie", "set")
    const now = new Date("2026-09-03T08:30:00.000Z")

    markEmailAskShown(now)

    expect(setter).toHaveBeenCalledTimes(1)
    const assigned = setter.mock.calls[0][0]
    expect(assigned).toContain(`${EMAIL_ASK_SHOWN_COOKIE}=${now.getTime()}`)
    expect(assigned).toContain("path=/")
    expect(assigned).toContain(`max-age=${ASK_COOLDOWN_MS / 1000}`)
    expect(assigned).toContain("SameSite=Lax")
    expect(assigned).not.toContain("Secure")
  })

  it("adds Secure when the page is served over https:", () => {
    vi.stubGlobal("location", { protocol: "https:" })
    const setter = vi.spyOn(document, "cookie", "set")
    const now = new Date("2026-09-03T08:30:00.000Z")

    markEmailAskShown(now)

    const assigned = setter.mock.calls[0][0]
    expect(assigned).toContain("Secure")
  })
})
