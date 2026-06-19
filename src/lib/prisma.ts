import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is not set")
  }
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
  return new PrismaClient({ adapter })
}

// Reuse the existing client across hot reloads in development to avoid exhausting
// the Supabase connection pool (Supavisor has per-project connection limits).
export const prisma = global.prismaGlobal ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") {
  global.prismaGlobal = prisma
}
