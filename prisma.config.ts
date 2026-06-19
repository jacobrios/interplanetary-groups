import "dotenv/config"
import { defineConfig, env } from "prisma/config"

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // DIRECT_URL is the Supabase session pooler (port 5432, IPv4-compatible).
    // Used by the Prisma CLI for migrations. DATABASE_URL (transaction pooler) is used
    // at runtime via the driver adapter in src/lib/prisma.ts.
    url: env("DIRECT_URL"),
  },
})
