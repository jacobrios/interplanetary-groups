// scripts/send-test-digest.ts
//
// Hand-run, never in the suite, same rule as scripts/send-test-email.ts and
// the eval benches: it costs money and hits the network, and it decides
// something worth deciding by looking at a real inbox rather than trusting a
// green test. Read scripts/send-test-email.ts first; this is the same shape
// applied to a real digest instead of a canned test message.
//
// Usage:
//   npm run digest:test -- <to> <groupNameOrId> <memberNameOrId>
//
// Example:
//   npm run digest:test -- you@example.com "Midweek Climbers" Maya
//
// WHAT "REAL" MEANS HERE. This does not fabricate a NeedsYouItem or a
// YouMissedResult that merely resembles the product's own output. It runs
// the exact same pieces src/lib/digest/run.ts's processOneGroup /
// processOneMember assemble for the daily job -- findLiveGauges,
// findLiveProposals, deriveNeedsYouItems, deriveYouMissed,
// composeDigestEmail -- against whatever the named member's real group
// actually holds right now, and sends whatever that produces. The one
// difference from run.ts, and it is deliberate: <to> is who the message is
// delivered to, which does not have to be the named member's own stored
// address (most rows in dev-test have none, or a fake .invalid one from
// earlier QA). This script answers "what would this member's digest look
// like, and can we prove it reaches a real inbox," not "did the daily job
// run for this member today," so three of run.ts's own gates are
// deliberately not applied:
//
//   - DIGEST_LOCAL_HOUR (only run in the hour the group's clock reads 8pm):
//     that is the CRON's OWN schedule, not a fact about whether the
//     content is real. A hand-run script has no "hour" to wait for.
//   - isDigestEligibleToday's once-a-day guard and its digestOptOutAt
//     check: both answer "may THIS member be sent one today," which stops
//     applying the moment the deliverable is redirected to a different
//     inbox. The opt-out state is still read and printed, as information,
//     never as a reason to refuse -- refusing would make this the one tool
//     that cannot show the owner what an opted-out member's digest would
//     have looked like.
//   - the once-sent stamp (Membership.lastDigestSentAt is never written by
//     this script). Stamping it would make a diagnostic run compete with
//     the real cron for whether this member gets mailed tomorrow, on a
//     shared dev-test database other things read. sendEmail is still the
//     real function, with its real EMAIL_DEV_ALLOWLIST guard; nothing about
//     delivery itself is faked.
//
// isNeedsYouGateOpen (which items besides "you missed" are actually
// newsworthy today) IS applied faithfully: skipping it would show items
// production would suppress, which is exactly the kind of daylight this
// script exists to close, not open.
//
// Never logs an address fetched from the database (CLAUDE.md, "never log
// an email address"). The one address this script prints is <to>, which
// the runner supplied on the command line and is telling the script to
// mail; that is the deliberate, narrow exception the task called for, not a
// gap in the rule. Whether the named member has a verified address on file
// is reported as yes/no only, never as the value.

import { prisma } from "../src/lib/prisma"
import { ContactMethodType, MessageAuthor, ProposalKind, RsvpStatus } from "@prisma/client"
import type { EventCardData } from "../src/app/groups/[id]/EventCarousel"
import { findLiveGauges } from "../src/lib/gauges/read"
import { findLiveProposals } from "../src/lib/proposals/read"
import { deriveNeedsYouItems } from "../src/lib/digest/needs-you"
import { deriveYouMissed, type YouMissedMessage } from "../src/lib/digest/you-missed"
import { isNeedsYouGateOpen } from "../src/lib/digest/schedule"
import { composeDigestEmail } from "../src/lib/digest/compose"
import { sendEmail } from "../src/lib/email/send"
import { ensureUnsubscribeToken } from "../src/lib/email/unsubscribe"
import { judge } from "./db-which"

// Same value db-which.ts carries, duplicated rather than imported for the
// same reason scripts/qa-stage-email.ts and scripts/qa-stage-cardstate.ts
// both already duplicate it: db-which.ts only exports it as a CLI default,
// not as a shared constant.
const EXPECTED_DEV_TEST_REF = "pxbewardwvoyqqcvogel"

// The real production domain, hardcoded rather than read from
// src/lib/site-url.ts -- matching scripts/send-test-email.ts's own choice.
// site-url.ts resolves from Vercel's own env vars, which are absent on a
// laptop, so using it here would build a message full of localhost links
// instead of the ones a real inbox needs to prove out.
const SITE_ORIGIN = "https://interplanetarygroups.com"

/**
 * Refuses to run unless the checkout points at dev-test, on all three env
 * sources. This script sends real mail through a real network call; it has
 * no way to know which project `.env` points at other than asking, and
 * CLAUDE.md's "Two databases, never crossed" makes this the first thing
 * that runs, before a single query.
 */
function requireDevTest(): void {
  const verdict = judge(process.env, EXPECTED_DEV_TEST_REF)
  console.log(`Database: project ref ${verdict.ref ?? "(unresolved)"}`)
  if (verdict.ok) {
    console.log("Confirmed dev-test. Continuing.\n")
    return
  }
  console.error("STOP: this checkout is NOT confirmed to be dev-test.")
  for (const p of verdict.problems) console.error(`  - ${p}`)
  console.error("Run npm run db:which and resolve it before running this script.")
  process.exit(1)
}

function usageAndExit(): never {
  console.error('Usage: npm run digest:test -- <to> <groupNameOrId> <memberNameOrId>')
  console.error('Example: npm run digest:test -- you@example.com "Midweek Climbers" Maya')
  process.exit(1)
}

interface ResolvedGroup {
  id: string
  name: string
  timeZone: string
}

async function resolveGroup(arg: string): Promise<ResolvedGroup> {
  const byId = await prisma.group.findUnique({
    where: { id: arg },
    select: { id: true, name: true, timeZone: true },
  })
  if (byId) return byId

  const byName = await prisma.group.findMany({
    where: { name: { equals: arg, mode: "insensitive" } },
    select: { id: true, name: true, timeZone: true },
  })
  if (byName.length === 1) return byName[0]
  if (byName.length === 0) {
    console.error(`No group found matching "${arg}" (checked as an id, then as a name).`)
    process.exit(1)
  }
  console.error(`"${arg}" matches ${byName.length} groups by name. Pass a group id instead:`)
  for (const g of byName) console.error(`  ${g.id}  ${g.name}`)
  process.exit(1)
}

interface ResolvedMember {
  id: string
  name: string
}

async function resolveMember(groupId: string, arg: string): Promise<ResolvedMember> {
  const memberships = await prisma.membership.findMany({
    where: { groupId },
    select: { user: { select: { id: true, name: true } } },
  })
  const users = memberships.map((m) => m.user)

  const byId = users.find((u) => u.id === arg)
  if (byId) return byId

  const byName = users.filter((u) => u.name.toLowerCase() === arg.toLowerCase())
  if (byName.length === 1) return byName[0]
  if (byName.length === 0) {
    console.error(`No member found matching "${arg}" in this group. Members are:`)
    for (const u of users) console.error(`  ${u.id}  ${u.name}`)
    process.exit(1)
  }
  console.error(`"${arg}" matches ${byName.length} members by name. Pass a member id instead:`)
  for (const u of byName) console.error(`  ${u.id}  ${u.name}`)
  process.exit(1)
}

/** Every absolute URL appearing in the composed plain-text body, in the
 *  order it appears, deduplicated. This is the answer to the open question
 *  the task exists to settle: what did we intend to send, so the owner has
 *  something to compare a delivered message's actual links against. */
function extractUrls(text: string): string[] {
  const found = text.match(/https?:\/\/\S+/g) ?? []
  return [...new Set(found)]
}

async function main() {
  requireDevTest()

  const [to, groupArg, memberArg] = process.argv.slice(2)
  if (!to || !groupArg || !memberArg) usageAndExit()

  const group = await resolveGroup(groupArg)
  console.log(`Group:  ${group.name} (${group.id}), timezone ${group.timeZone}`)

  const member = await resolveMember(group.id, memberArg)
  console.log(`Member: ${member.name} (${member.id})`)

  const membership = await prisma.membership.findFirst({
    where: { groupId: group.id, userId: member.id },
    select: { id: true, lastSeenAt: true, lastDigestSentAt: true, joinedAt: true },
  })
  if (!membership) {
    // Cannot happen given resolveMember scoped its lookup to this group's
    // memberships, but a narrow function's own caller should not assume
    // that guarantee holds forever without saying so.
    console.error("Internal error: resolved member has no membership row in this group.")
    process.exit(1)
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: member.id },
    select: { digestOptOutAt: true },
  })
  const verifiedEmail = await prisma.contactMethod.findFirst({
    where: { userId: member.id, type: ContactMethodType.EMAIL, isVerified: true },
    select: { userId: true }, // existence only -- never select `value` here, see header note
  })
  console.log(`This member has a verified email on file: ${verifiedEmail ? "yes" : "no"} (irrelevant to this send: it always goes to <to>).`)
  if (user.digestOptOutAt) {
    console.log(
      `Note: this member opted out of digests on ${user.digestOptOutAt.toISOString()}. ` +
        `Production would never mail them; this diagnostic send ignores that gate on purpose (see header comment).`
    )
  }

  const now = new Date()

  const upcomingEvents = await prisma.event.findMany({
    where: { groupId: group.id, startsAt: { gte: now } },
    orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }],
    include: { venues: true },
  })
  const eventIds = upcomingEvents.map((e) => e.id)
  const rsvps =
    eventIds.length > 0 ? await prisma.rsvp.findMany({ where: { eventId: { in: eventIds } } }) : []
  const rsvpsByEvent = new Map<string, typeof rsvps>()
  for (const r of rsvps) {
    const list = rsvpsByEvent.get(r.eventId)
    if (list) list.push(r)
    else rsvpsByEvent.set(r.eventId, [r])
  }

  const liveGauges = await findLiveGauges(group.id, now)
  const liveProposalsAll = await findLiveProposals(group.id, now)
  const liveProposals = liveProposalsAll.filter((p) => p.kind === ProposalKind.GROUP)

  const messages: YouMissedMessage[] = await prisma.message.findMany({
    where: { groupId: group.id, authorType: MessageAuthor.MEMBER },
    include: { author: true },
    orderBy: { createdAt: "asc" },
  })

  const totalMembers = await prisma.membership.count({ where: { groupId: group.id } })

  const gateOpen = isNeedsYouGateOpen({
    now,
    timeZone: group.timeZone,
    ideas: liveGauges.map((g) => ({ createdAt: g.createdAt, proposedDate: g.proposedDate })),
    timeChangeAsks: liveProposals.map((p) => ({ createdAt: p.createdAt })),
    events: upcomingEvents.map((e) => ({
      createdAt: e.createdAt,
      startsAt: e.startsAt,
      gaugeId: e.gaugeId,
    })),
  })
  console.log(`Needs-you gate is ${gateOpen ? "OPEN" : "CLOSED"} for this group today.`)
  if (!gateOpen) {
    console.log(
      "  Closed means: nothing (idea, time-change ask, or a sparked event) was created today in this\n" +
        "  group's own timezone, and no event start or idea's proposed day lands exactly 3 group-local\n" +
        "  days from now. The 'you missed' block below is unaffected by this gate."
    )
  }

  const eventCards: EventCardData[] = upcomingEvents.map((event) => {
    const rsvpsForEvent = rsvpsByEvent.get(event.id) ?? []
    const viewerStatus = rsvpsForEvent.find((r) => r.userId === member.id)?.status ?? null
    const inCount = rsvpsForEvent.filter((r) => r.status === RsvpStatus.IN).length
    const outCount = rsvpsForEvent.filter((r) => r.status === RsvpStatus.OUT).length
    return {
      event: {
        id: event.id,
        title: event.title,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        venues: event.venues,
      },
      inCount,
      outCount,
      pendingCount: Math.max(totalMembers - inCount - outCount, 0),
      viewerStatus,
    }
  })

  const needsYou = gateOpen
    ? deriveNeedsYouItems({
        events: eventCards,
        liveGauges,
        liveProposals,
        viewerId: member.id,
        timeZone: group.timeZone,
      })
    : []

  const youMissed = deriveYouMissed({
    messages,
    lastSeenAt: membership.lastSeenAt,
    lastDigestSentAt: membership.lastDigestSentAt,
    joinedAt: membership.joinedAt,
    viewerId: member.id,
  })

  console.log(`Needs-you items: ${needsYou.length}`)
  console.log(`You-missed: ${youMissed ? `${youMissed.count} message(s)` : "nothing"}`)
  console.log("")

  if (needsYou.length === 0 && youMissed === null) {
    console.log("NOTHING TO REPORT. The composer would return null; no email will be sent.")
    console.log("")
    console.log("To make this member's digest non-empty, stage one of:")
    console.log("  - Needs you: create a gauge, a time-change ask, or a sparked event TODAY in this")
    console.log("    group (local time), or one whose start / proposed day lands exactly 3 group-local")
    console.log("    days from now, with this member not yet having answered it.")
    console.log("  - You missed: have a different member post a chat message in this group, dated")
    console.log(
      `    after this member's read position (the later of lastSeenAt and lastDigestSentAt, or ` +
        `joinedAt if both are null -- currently ${(membership.lastSeenAt ?? membership.lastDigestSentAt ?? membership.joinedAt).toISOString()}).`
    )
    await prisma.$disconnect()
    process.exit(0)
  }

  const unsubscribeToken = await ensureUnsubscribeToken(member.id)
  const composed = composeDigestEmail({
    groupId: group.id,
    groupName: group.name,
    needsYou,
    youMissed,
    siteOrigin: SITE_ORIGIN,
    unsubscribeToken,
  })

  if (!composed) {
    // Would mean this script's own "both empty" check above disagreed with
    // composeDigestEmail's identical check -- a bug in this script, not a
    // legitimate second "nothing to send" case (compose.ts's own header
    // comment makes the identical point about run.ts).
    console.error("Internal error: needsYou/youMissed were non-empty but composeDigestEmail returned null.")
    process.exit(1)
  }

  console.log("=".repeat(72))
  console.log("SUBJECT:")
  console.log(composed.subject)
  console.log("")
  console.log("BODY (plain text):")
  console.log(composed.text)
  console.log("=".repeat(72))
  console.log("")

  const urls = extractUrls(composed.text)
  console.log(`URLS IN THIS MESSAGE (${urls.length}), for comparing against what the delivered copy actually carries:`)
  for (const url of urls) console.log(`  ${url}`)
  console.log("")

  console.log(`About to send to: ${to}`)
  const result = await sendEmail({
    to,
    subject: composed.subject,
    text: composed.text,
    html: composed.html,
    unsubscribeUrl: composed.unsubscribeUrl,
  })

  console.log("")
  console.log(`SEND RESULT: ${result}`)
  switch (result) {
    case "ok":
      console.log("The service accepted the message. Check the recipient's inbox (and spam folder).")
      break
    case "suppressed_dev":
      console.log(
        "Nothing was sent. This environment is not production, and the recipient address is not on\n" +
          "EMAIL_DEV_ALLOWLIST. This is the guard working correctly, not a failure: it is what stops a\n" +
          "half-built script on a laptop from mailing a real person. To actually deliver this message,\n" +
          "add the recipient address to EMAIL_DEV_ALLOWLIST (comma-separated) or run with\n" +
          "VERCEL_ENV=production set."
      )
      break
    case "invalid_address":
      console.log("The mail service rejected the recipient address as invalid. Check it for a typo.")
      break
    case "rate_limited":
      console.log("The mail service refused this send on a rate or quota limit. Try again shortly.")
      break
    case "service_error":
      console.log("The mail service failed. See the error logged just above this line for detail.")
      break
  }

  console.log("")
  console.log("Nothing was written to lastDigestSentAt by this script (see header comment); this run")
  console.log("does not count against this member's real once-a-day digest.")

  await prisma.$disconnect()
  process.exit(result === "ok" ? 0 : 1)
}

void main()
