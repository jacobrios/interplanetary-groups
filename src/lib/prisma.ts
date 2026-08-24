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
  // NEITHER query parameter on DATABASE_URL does anything on this stack, and the
  // pre-deploy checklist claims both of them do:
  //
  //   connection_limit — a Prisma query-engine setting. Prisma 7 ships no bundled
  //     engine, so this project uses the pg driver adapter, and pg-connection-string
  //     copies unrecognised parameters onto the config verbatim where nothing reads
  //     them. Audit finding F-6-9.
  //   pgbouncer — same story, same grep: absent from @prisma/adapter-pg, from the
  //     client runtime, and from pg. What it was supposed to buy (no prepared
  //     statements, which transaction-mode pooling cannot carry) is already true by
  //     default: the adapter names a statement only when a `statementNameGenerator`
  //     is supplied, and none is. So the safety is real and the flag is not what
  //     provides it. Removing it changes nothing; adding a statementNameGenerator
  //     later would break pooling regardless of what the URL says.
  //
  // Ten is chosen, not inherited. The hottest read path fans OUT rather than
  // running sequentially: the group home issues up to CARD_REGION_CAP (5)
  // concurrent rsvp lookups in one Promise.all, so any ceiling below six throttles
  // the most-viewed screen in the product on every render, and Fluid Compute lets a
  // single instance serve several such renders at once. Against that, capping below
  // the pg default buys headroom only in a traffic spike large enough to need many
  // instances, which the audit graded low risk for this product. The honest summary:
  // no cap below the default is warranted here, and this line exists to say so in
  // the place the next reader will look.
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 10 })
  return new PrismaClient({ adapter })
}

// Reuse the existing client across hot reloads in development to avoid exhausting
// the Supabase connection pool (Supavisor has per-project connection limits).
export const prisma = global.prismaGlobal ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") {
  global.prismaGlobal = prisma
}
