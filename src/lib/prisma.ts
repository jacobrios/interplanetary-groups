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
  // `max` is the pool ceiling per process, and it is the ONLY thing that sets it.
  // The `connection_limit` query parameter that appears on DATABASE_URL and in
  // pre-deploy checklist item 3 is inert here: it was a Prisma query-engine
  // setting, and this project uses the pg driver adapter instead (Prisma 7 ships
  // no bundled engine). pg-connection-string copies unrecognised parameters onto
  // the config verbatim, where nothing reads them, and pg-pool then falls back to
  // its own default of 10. Audit finding F-6-9.
  //
  // Three, not the one Prisma's serverless guidance suggests: that advice predates
  // instances that serve several requests at once, and this app makes many
  // sequential round trips per write, so a ceiling of one would make concurrent
  // requests on the same instance queue behind each other. Three keeps a single
  // instance from serialising while staying far below the pooler's client ceiling
  // even at tens of simultaneous instances.
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 3 })
  return new PrismaClient({ adapter })
}

// Reuse the existing client across hot reloads in development to avoid exhausting
// the Supabase connection pool (Supavisor has per-project connection limits).
export const prisma = global.prismaGlobal ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") {
  global.prismaGlobal = prisma
}
