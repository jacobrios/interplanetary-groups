// Seed two extra members into the QA group, mirroring part one's walkthrough.
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { readFileSync } from "node:fs"

const env = readFileSync(".env", "utf8")
const url = env.match(/^DATABASE_URL="?([^"\n]+)"?/m)[1]
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })

const groupId = process.argv[2]
for (const name of ["Maya", "Jesse"]) {
  const u = await prisma.user.create({
    data: { name, supabaseAuthId: `qa-${name.toLowerCase()}-${Date.now()}` },
  })
  await prisma.membership.create({ data: { groupId, userId: u.id } })
  console.log(`${name} -> ${u.id}`)
}
await prisma.$disconnect()
