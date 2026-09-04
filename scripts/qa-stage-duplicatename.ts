// scripts/qa-stage-duplicatename.ts
//
// Stages the join-time duplicate-name QA walkthrough.
//
// The thing under test is a refusal, so the state it needs is small: one group
// with one member whose name a tester can then collide with on purpose. What
// this script is really for is the SECOND half of the walkthrough, which is the
// part automated verification could not honestly reach.
//
// WHY THE SECOND HALF MATTERS MORE THAN THE FIRST. The collision copy tells the
// person "if that's you, sign in instead." Reaching the sign-in panel THROUGH a
// collision is a genuinely new state in this product: joinGroupAction mints an
// anonymous Supabase session (join-group.ts) BEFORE the duplicate check throws,
// so the invite screen's sign-in door is now reachable while already holding a
// session, which it never was before this slice. Reading supabase-js, verifyOtp
// replaces the session cookie and this works. That is confident, not certain,
// and a wrong answer means the product tells somebody to do something that then
// does not work. Only a real code round trip settles it, which is why
// --collide-with-me exists.
//
// Modes:
//   1. (default)                  creates the group with a seeded member named
//                                 "Mike" and prints the invite link. Enough for
//                                 the refusal, the copy, and differentiating.
//                                 The sign-in door will open, but signing in as
//                                 "Mike" is not possible: that seeded person has
//                                 no email and never will.
//   2. --collide-with-me <email>  the collision target becomes the real dev-test
//                                 person who already owns that verified address,
//                                 under their own stored name. Now "if that's
//                                 you, sign in instead" is literally true and the
//                                 full round trip can be walked: collide, tap
//                                 sign in, receive a code, land in the group as
//                                 yourself rather than as a second copy.
//                                 Refuses rather than inventing an identity if
//                                 no verified address matches, because a forged
//                                 one would fake the exact input under test.
//
// ADDITIVE ONLY: every mode only creates rows. Nothing here deletes, truncates,
// or touches a row it did not create, because other sessions run concurrently
// against this same dev-test database.
//
// WHERE IT WRITES: whichever database `.env` points at. Run `npm run db:which`
// first, every time; this script also refuses to run itself unless all three env
// sources agree on the dev-test project ref (see requireDevTest below).
//
// QA tooling, deliberately outside the test suite: it writes real rows to a
// shared database and is meant to be run by hand before a browser walkthrough.
// Not named *.test.ts, which is what keeps Vitest from collecting it.

import { networkInterfaces } from "node:os"
import { prisma } from "../src/lib/prisma"
import { judge } from "./db-which"

/** The same ref db:which checks against (CLAUDE.md, "Two databases, never crossed"). */
const EXPECTED_DEV_TEST_REF = "pxbewardwvoyqqcvogel"

function requireDevTest(): void {
  const verdict = judge(process.env, EXPECTED_DEV_TEST_REF)
  if (verdict.ok) return
  console.error(`STOP: this checkout is NOT confirmed to be dev-test.`)
  for (const p of verdict.problems) console.error(`  - ${p}`)
  console.error(`Run npm run db:which and resolve it before running this script.`)
  process.exit(1)
}

const GROUP_NAME = "[QA] Duplicate Name Check"

// A plain first name with no [QA] prefix, deliberately: the collision copy
// interpolates it into a sentence a person reads ("There's already a Mike in
// this group"), and a bracketed fixture name would make that sentence unreadable
// as product copy, which is one of the things being judged here.
const SEEDED_MEMBER_NAME = "Mike"

/**
 * The LAN address, not localhost. On a phone, localhost is the phone; every QA
 * link handed over has to work from both the laptop and the device
 * (~/.claude/checklists/pr-handoff.md). Falls back to localhost with a warning
 * rather than guessing, since a wrong address reads as an app bug.
 */
function lanBase(port: number): string {
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === "IPv4" && !a.internal) return `http://${a.address}:${port}`
    }
  }
  console.warn(`  (no LAN address found; links below use localhost and will NOT work from a phone)`)
  return `http://localhost:${port}`
}

async function main(): Promise<void> {
  requireDevTest()

  const argv = process.argv
  const portIndex = argv.indexOf("--port")
  const port = portIndex !== -1 && argv[portIndex + 1] ? Number(argv[portIndex + 1]) : 3100
  const collideIndex = argv.indexOf("--collide-with-me")
  const collideEmail = collideIndex !== -1 ? argv[collideIndex + 1]?.trim().toLowerCase() : undefined

  if (collideIndex !== -1 && !collideEmail) {
    console.error(`--collide-with-me needs an email address after it.`)
    process.exit(1)
  }

  const stamp = Date.now()

  // Who the joiner will collide with. Either a real person who can actually
  // sign in, or a seeded one who cannot.
  let collisionUserId: string
  let collisionName: string
  let signInIsReal: boolean

  if (collideEmail) {
    const contact = await prisma.contactMethod.findFirst({
      where: { type: "EMAIL", value: collideEmail, isVerified: true },
      select: { user: { select: { id: true, name: true } } },
    })
    if (!contact) {
      console.error(`No dev-test person holds a VERIFIED email matching ${collideEmail}.`)
      console.error(``)
      console.error(`This script will not invent one: a forged identity would fake the exact`)
      console.error(`input under test (whether a real sign-in gets through the new check).`)
      console.error(`Attach that address to yourself in the product first, on the group info`)
      console.error(`page of any dev-test group, then re-run this.`)
      process.exit(1)
    }
    collisionUserId = contact.user.id
    collisionName = contact.user.name
    signInIsReal = true
  } else {
    const seeded = await prisma.user.create({
      data: { name: SEEDED_MEMBER_NAME, supabaseAuthId: `qa-dupname-member-${stamp}` },
    })
    collisionUserId = seeded.id
    collisionName = seeded.name
    signInIsReal = false
  }

  // A separate founder, so the collision target is an ordinary member rather
  // than the founder. The founder-collision case is covered by a test
  // (join.test.ts) and is not what the browser pass is for.
  const founder = await prisma.user.create({
    data: { name: "Priya", supabaseAuthId: `qa-dupname-founder-${stamp}` },
  })

  const group = await prisma.group.create({
    data: {
      name: GROUP_NAME,
      founderId: founder.id,
      // The founder's own membership is written here the way
      // provisionFounderGroup writes it, so the roster this check reads is the
      // shape production produces.
      memberships: { create: [{ userId: founder.id }, { userId: collisionUserId }] },
    },
  })

  const base = lanBase(port)

  console.log(``)
  console.log(`Staged: ${GROUP_NAME}`)
  console.log(`  founder            Priya`)
  console.log(`  collision target   ${collisionName}${signInIsReal ? "  (real, can sign in)" : "  (seeded, cannot sign in)"}`)
  console.log(``)
  console.log(`Invite link (open in a PRIVATE tab — the check only shows the name field to a`)
  console.log(`visitor with no session):`)
  console.log(`  ${base}/join/${group.inviteToken}`)
  console.log(``)
  console.log(`Walk:`)
  console.log(`  1. Type "${collisionName.toLowerCase()}" (lowercase on purpose) and submit.`)
  console.log(`     Expect a refusal naming "${collisionName}" in its stored casing.`)
  console.log(`  2. Tap "sign in" INSIDE the error sentence. The sign-in panel should open.`)
  if (signInIsReal) {
    console.log(`  3. Enter ${collideEmail}, receive the code, type it.`)
    console.log(`     Expect: you land in ${GROUP_NAME} as ${collisionName}, and the member`)
    console.log(`     count stays 2. This is the step nothing automated could reach.`)
  } else {
    console.log(`  3. Signing in is NOT testable in this mode: "${collisionName}" has no email.`)
    console.log(`     Re-run with --collide-with-me <your dev-test email> to walk that half.`)
  }
  console.log(`  4. Come back with "I'm new here", submit "${collisionName} R", and expect to`)
  console.log(`     join. The feed's join line should read "${collisionName} R joined".`)
  console.log(``)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
