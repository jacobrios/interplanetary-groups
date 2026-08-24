// src/lib/__tests__/site-url.test.ts
//
// metadataBase needs an absolute URL, and Next throws a build error if a
// relative metadata path is used without one. This reads the host Vercel
// already sets rather than adding an env var somebody has to remember to
// set at deploy time (which would be a second, driftable answer to "what
// host are we" — the .ics route already answers it from the request).
//
// Round-1 review finding: VERCEL_PROJECT_PRODUCTION_URL is set on preview
// deployments too, not only production, so preferring it unconditionally
// meant a preview build's metadata always resolved to the production
// domain and could never show its own image before merge. VERCEL_ENV is
// the actual signal for which environment is building, so the preference
// now branches on it: production prefers the stable production host,
// everything else (preview, development, or VERCEL_ENV unset entirely)
// prefers the per-deployment host and falls back to the production host
// only if the per-deployment one is somehow missing.
import { describe, it, expect, afterEach } from "vitest"
import { siteUrl } from "../site-url"

const KEYS = ["VERCEL_ENV", "VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL", "PORT"] as const
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
  it("uses the stable production host on a production build", () => {
    setEnv("VERCEL_ENV", "production")
    setEnv("VERCEL_PROJECT_PRODUCTION_URL", "interplanetary-groups.vercel.app")
    setEnv("VERCEL_URL", "interplanetary-groups-abc123.vercel.app")
    expect(siteUrl().toString()).toBe("https://interplanetary-groups.vercel.app/")
  })

  it("uses its own per-deployment host on a preview build, not the production domain", () => {
    setEnv("VERCEL_ENV", "preview")
    setEnv("VERCEL_PROJECT_PRODUCTION_URL", "interplanetary-groups.vercel.app")
    setEnv("VERCEL_URL", "interplanetary-groups-abc123.vercel.app")
    expect(siteUrl().toString()).toBe("https://interplanetary-groups-abc123.vercel.app/")
  })

  it("uses its own per-deployment host in local development too", () => {
    setEnv("VERCEL_ENV", "development")
    setEnv("VERCEL_PROJECT_PRODUCTION_URL", "interplanetary-groups.vercel.app")
    setEnv("VERCEL_URL", "interplanetary-groups-abc123.vercel.app")
    expect(siteUrl().toString()).toBe("https://interplanetary-groups-abc123.vercel.app/")
  })

  it("falls back to the production host on a non-production build with no per-deployment host set", () => {
    setEnv("VERCEL_ENV", "preview")
    setEnv("VERCEL_PROJECT_PRODUCTION_URL", "interplanetary-groups.vercel.app")
    setEnv("VERCEL_URL", undefined)
    expect(siteUrl().toString()).toBe("https://interplanetary-groups.vercel.app/")
  })

  it("falls back to the per-deployment host when VERCEL_ENV isn't set at all", () => {
    setEnv("VERCEL_ENV", undefined)
    setEnv("VERCEL_PROJECT_PRODUCTION_URL", "interplanetary-groups.vercel.app")
    setEnv("VERCEL_URL", "interplanetary-groups-abc123.vercel.app")
    expect(siteUrl().toString()).toBe("https://interplanetary-groups-abc123.vercel.app/")
  })

  it("falls back to localhost when nothing is set, so a local build still works", () => {
    setEnv("VERCEL_ENV", undefined)
    setEnv("VERCEL_PROJECT_PRODUCTION_URL", undefined)
    setEnv("VERCEL_URL", undefined)
    setEnv("PORT", undefined)
    expect(siteUrl().toString()).toBe("http://localhost:3000/")
  })

  it("never returns a URL with a scheme already attached twice", () => {
    setEnv("VERCEL_ENV", "production")
    setEnv("VERCEL_PROJECT_PRODUCTION_URL", "https://interplanetary-groups.vercel.app")
    expect(siteUrl().toString()).toBe("https://interplanetary-groups.vercel.app/")
  })
})
