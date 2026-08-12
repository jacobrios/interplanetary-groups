import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Prevents Next.js/Turbopack from bundling Prisma and pg, which would break
  // Prisma's runtime module resolution. These are loaded from node_modules at runtime.
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
  // Dev-only: lets QA walkthroughs run several signed-in members at once by
  // serving the app on sibling loopback hosts, one browser cookie jar each.
  // Without this, Next blocks its dev resources cross-origin and those pages
  // never hydrate, so buttons and chips are dead. No effect on production.
  //
  // The private-network entries are what make phone QA possible at all: opening
  // the dev server from a phone at the Mac's LAN address is a different origin,
  // so without them every JS-driven control on the phone is dead while CSS-only
  // scrolling still works, which reads exactly like an app bug and is not one.
  // A LAN address is a DHCP lease and can change; add the new one here when it
  // does. (Wildcards are host patterns, so they do not cover IP ranges.)
  allowedDevOrigins: [
    "127.0.0.1",
    "a.localhost",
    "b.localhost",
    "c.localhost",
    "192.168.1.144",
  ],
}

export default nextConfig
