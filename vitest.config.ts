import { defineConfig } from "vitest/config"
import { config } from "dotenv"
import path from "path"

// Load .env synchronously at config time so DATABASE_URL is in process.env
// before any test file imports src/lib/prisma.ts (which reads it at module load).
config()

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    // Most of this suite drives sequential Prisma round-trips against the
    // remote dev-test Supabase, and vitest's 5000ms default is sized for tests
    // that talk to something on the same machine. Measured on the proposals
    // promote file, each DB test lands between 4.2s and 5.4s, so the default
    // cut through the middle of that spread and files failed on the clock, not
    // on assertions (proposals/promote in PR #43, gauges/promote on 4 Aug).
    // 30s is roughly five times the observed worst case: headroom for remote
    // latency spiking on a bad network moment, still short enough that a
    // genuine hang surfaces in half a minute instead of stalling the suite.
    testTimeout: 30_000,
  },
})
