import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Prevents Next.js/Turbopack from bundling Prisma and pg, which would break
  // Prisma's runtime module resolution. These are loaded from node_modules at runtime.
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
}

export default nextConfig
