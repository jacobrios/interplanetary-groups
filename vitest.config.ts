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
  },
})
