import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { readFileSync } from "node:fs"
const env = readFileSync(".env", "utf8")
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.match(/^DATABASE_URL="?([^"\n]+)"?/m)[1] }),
})
const groupId = process.argv[2]
const gauges = await prisma.gauge.findMany({ where: { groupId }, include: { votes: { include: { user: true } }, event: true } })
for (const g of gauges) {
  console.log(`GAUGE ${g.activity} time=${g.proposedTime} votes=${g.votes.map(v=>`${v.user.name}:${v.answer}`).join(",")} event=${g.event?.id ?? "NONE"}`)
}
const events = await prisma.event.findMany({ where: { groupId }, include: { venues: true, rsvps: { include: { user: true } } }, orderBy: { startsAt: "asc" } })
for (const e of events) {
  console.log(`EVENT "${e.title}" starts=${e.startsAt.toISOString()} gaugeId=${e.gaugeId ?? "null"} schedKey=${e.scheduledKey ?? "null"} venues=[${e.venues.map(v=>v.name)}] rsvps=${e.rsvps.map(r=>`${r.user.name}:${r.status}`).join(",")}`)
}
const msgs = await prisma.message.findMany({ where: { groupId }, orderBy: { createdAt: "asc" } })
for (const m of msgs) console.log(`MSG [${m.authorType}] ${m.body}`)
await prisma.$disconnect()
