import { defineConfig } from "vitest/config"
import { config } from "dotenv"

// Load .env synchronously at config time so DATABASE_URL is in process.env
// before any test file imports src/lib/prisma.ts (which reads it at module load).
config()

export default defineConfig({
  test: {
    environment: "node",
  },
})
