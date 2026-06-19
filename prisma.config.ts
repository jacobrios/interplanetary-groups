import "dotenv/config"
import { defineConfig, env } from "prisma/config"

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // DIRECT_URL is the non-pooled direct connection used by the Prisma CLI.
    // The pooled DATABASE_URL is used at runtime via the driver adapter in src/lib/prisma.ts.
    url: env("DIRECT_URL"),
  },
})
