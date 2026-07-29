import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Prevents Next.js/Turbopack from bundling Prisma and pg, which would break
  // Prisma's runtime module resolution. These are loaded from node_modules at runtime.
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
  // Dev-only: lets QA walkthroughs run several signed-in members at once by
  // serving the app on sibling loopback hosts, one browser cookie jar each.
  // Without this, Next blocks its dev resources cross-origin and those pages
  // never hydrate, so buttons and chips are dead. No effect on production.
  allowedDevOrigins: ["127.0.0.1", "a.localhost", "b.localhost", "c.localhost"],
}

export default nextConfig
