// src/app/__tests__/manifest.test.ts
//
// The installable app's identity as the home screen and the OS app switcher
// see it. Values are pinned to what the task brief specifies verbatim, and to
// the shared SITE_TITLE/SITE_DESCRIPTION constants so this can never drift
// from the product's own name and pitch (src/lib/metadata.ts).
import { describe, it, expect } from "vitest"
import manifest from "../manifest"
import { SITE_TITLE, SITE_DESCRIPTION } from "@/lib/metadata"

describe("manifest", () => {
  const m = manifest()

  it("names the app from the shared site constants", () => {
    expect(m.name).toBe(SITE_TITLE)
    expect(m.short_name).toBe("Orbit")
    expect(m.description).toBe(SITE_DESCRIPTION)
  })

  it("starts at the front door and runs standalone", () => {
    expect(m.start_url).toBe("/")
    expect(m.display).toBe("standalone")
  })

  it("carries the product's dark tile colour as both background and theme", () => {
    expect(m.background_color).toBe("#15161e")
    expect(m.theme_color).toBe("#15161e")
  })

  it("lists the 192 and 512 PNG icons with purpose any", () => {
    const icon192 = m.icons?.find((i) => i.sizes === "192x192")
    const icon512 = m.icons?.find((i) => i.sizes === "512x512")
    expect(icon192).toMatchObject({
      src: "/icon-192.png",
      type: "image/png",
      purpose: "any",
    })
    expect(icon512).toMatchObject({
      src: "/icon-512.png",
      type: "image/png",
      purpose: "any",
    })
  })

  it("also lists the 180 Apple touch icon", () => {
    const icon180 = m.icons?.find((i) => i.sizes === "180x180")
    expect(icon180).toMatchObject({
      src: "/apple-icon.png",
      type: "image/png",
    })
  })
})
