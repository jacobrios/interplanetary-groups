// src/lib/__tests__/site-url.test.ts
//
// metadataBase needs an absolute URL, and Next throws a build error if a
// relative metadata path is used without one. This reads the host Vercel
// already sets rather than adding an env var somebody has to remember to
// set at deploy time (which would be a second, driftable answer to "what
// host are we" — the .ics route already answers it from the request).
import { describe, it, expect, afterEach } from "vitest"
import { siteUrl } from "../site-url"

const KEYS = ["VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL", "PORT"] as const
const saved: Record<string, string | undefined> = {}

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
    delete saved[k]
  }
})

function setEnv(k: (typeof KEYS)[number], v: string | undefined) {
  saved[k] = process.env[k]
  if (v === undefined) delete process.env[k]
  else process.env[k] = v
}

describe("siteUrl", () => {
  it("prefers the stable production host over the per-deployment one", () => {
    setEnv("VERCEL_PROJECT_PRODUCTION_URL", "interplanetary-groups.vercel.app")
    setEnv("VERCEL_URL", "interplanetary-groups-abc123.vercel.app")
    expect(siteUrl().toString()).toBe("https://interplanetary-groups.vercel.app/")
  })

  it("falls back to the per-deployment host on a preview build", () => {
    setEnv("VERCEL_PROJECT_PRODUCTION_URL", undefined)
    setEnv("VERCEL_URL", "interplanetary-groups-abc123.vercel.app")
    expect(siteUrl().toString()).toBe("https://interplanetary-groups-abc123.vercel.app/")
  })

  it("falls back to localhost when neither is set, so a local build still works", () => {
    setEnv("VERCEL_PROJECT_PRODUCTION_URL", undefined)
    setEnv("VERCEL_URL", undefined)
    setEnv("PORT", undefined)
    expect(siteUrl().toString()).toBe("http://localhost:3000/")
  })

  it("never returns a URL with a scheme already attached twice", () => {
    setEnv("VERCEL_PROJECT_PRODUCTION_URL", "https://interplanetary-groups.vercel.app")
    expect(siteUrl().toString()).toBe("https://interplanetary-groups.vercel.app/")
  })
})
