import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { readFileSync } from "node:fs"
const env = readFileSync(".env", "utf8")
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.match(/^DATABASE_URL="?([^"\n]+)"?/m)[1] }),
})
const groupId = process.argv[2]
const g = await prisma.gauge.findFirst({ where: { groupId }, orderBy: { createdAt: "desc" } })
console.log("gauge:", g.id, "| activity:", g.activity, "| proposedDate:", g.proposedDate.toISOString(), "| proposedTime:", g.proposedTime)
const names = process.argv.slice(3)
for (const name of names) {
  const u = await prisma.user.findFirst({ where: { name, memberships: { some: { groupId } } } })
  await prisma.gaugeVote.create({ data: { gaugeId: g.id, userId: u.id, answer: "IN" } })
  console.log(`voted IN: ${name}`)
}
await prisma.$disconnect()
