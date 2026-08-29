// scripts/send-test-email.ts
//
// Hand-run. Sends one real email through the real seam, which is the only
// honest proof that the `updates.` pipe works. Never part of the suite: it
// costs money and hits the network, the same rule the eval benches run under.
//
// Usage: npm run email:test -- you@example.com
//
// Outside production the address must be on EMAIL_DEV_ALLOWLIST or the seam
// suppresses it, which is the guard doing its job rather than a failure.

import { sendEmail } from "../src/lib/email/send"
import { ensureUnsubscribeToken } from "../src/lib/email/unsubscribe"
import { prisma } from "../src/lib/prisma"

async function main() {
  const to = process.argv[2]
  if (!to) {
    console.error("Usage: npm run email:test -- you@example.com")
    process.exit(1)
  }

  // A real, working unsubscribe link rather than a stub, so the one email this
  // slice sends exercises the whole door including the List-Unsubscribe header.
  const method = await prisma.contactMethod.findFirst({
    where: { type: "EMAIL", value: to },
    select: { userId: true },
  })
  const token = method ? await ensureUnsubscribeToken(method.userId) : null
  const unsubscribeUrl = token
    ? `https://interplanetarygroups.com/unsubscribe/${token}`
    : undefined
  if (!token) {
    console.warn("No account holds that address, so this test sends without an unsubscribe link.")
  }

  const result = await sendEmail({
    to,
    subject: "Orbit test send",
    text: "This is a test from the digest slice. Nothing needs your answer.",
    html: "<p>This is a test from the digest slice. Nothing needs your answer.</p>",
    unsubscribeUrl,
  })

  console.log(`result: ${result}`)
  console.log(`unsubscribe link: ${unsubscribeUrl ?? "(none)"}`)
  await prisma.$disconnect()
  process.exit(result === "ok" ? 0 : 1)
}

void main()
