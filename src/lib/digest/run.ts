// src/lib/digest/run.ts
//
// Task 8: the daily job. Where the digest becomes a real product behaviour
// instead of a set of pure library functions (needs-you.ts, you-missed.ts,
// schedule.ts, compose.ts) that nothing calls yet.
//
// The failure that matters here is not a crash. It is one group's bad data
// silently costing every other group its digest, which is exactly the bug
// the pre-deploy slice fixed in Orbit's own hourly sweep
// (src/lib/orbit/reconcile.ts). This module copies that shape deliberately:
// groups are processed sequentially in a plain for loop, each wrapped in its
// own try/catch, and a failure comes back as a { status: "failed" } result
// rather than throwing past the loop. The same discipline is applied one
// level deeper than reconcile.ts needs to go: a single MEMBER's failure
// inside a group (a bad row, a thrown send) must not cost the rest of that
// group's members either, so the member loop gets its own try/catch too.
//
// Architecture (recorded, not asked about — see CLAUDE.md, "the digest"):
// this rides the EXISTING hourly cron (src/app/api/cron/orbit/route.ts) as a
// fourth step, rather than a second scheduled task. One schedule is simpler,
// the hourly cadence is already what the group-local-8pm check needs, and
// the same cron is what keeps the free-tier database from pausing after a
// week idle. The route wraps the call to runDailyDigest in its own
// try/catch too, so a digest failure can never take down reconciliation or
// either sweep that already ran this hour.

import { prisma } from "@/lib/prisma"
import { ContactMethodType, MessageAuthor, ProposalKind, RsvpStatus, EventStatus } from "@prisma/client"
import type { EventCardData } from "@/app/groups/[id]/EventCarousel"
import { getLocalParts } from "@/lib/orbit/occurrence"
import { findLiveGauges, type LiveGauge } from "@/lib/gauges/read"
import { findLiveProposals, type LiveProposal } from "@/lib/proposals/read"
import { deriveNeedsYouItems } from "@/lib/digest/needs-you"
import { deriveYouMissed, type YouMissedMessage } from "@/lib/digest/you-missed"
import { deriveCancellations, type CancellationRow } from "@/lib/digest/cancellations"
import { isDigestEligibleToday, isNeedsYouGateOpen } from "@/lib/digest/schedule"
import { composeDigestEmail } from "@/lib/digest/compose"
import { sendEmail } from "@/lib/email/send"
import { ensureUnsubscribeToken } from "@/lib/email/unsubscribe"
import { siteUrl } from "@/lib/site-url"

/**
 * The hour, group-local, this job looks for: the hour the group's own clock
 * reads 8pm (spec: "Once a day, in the hour the group's own clock reads
 * 8pm"). Numerically identical to BUMP_LOCAL_HOUR in
 * src/lib/orbit/spark-copy.ts, which is a coincidence worth naming rather
 * than a reason to import that constant: the two answer different product
 * questions (when to bump a stalled gauge vs. when to mail a digest) and
 * must stay free to diverge later without one edit silently touching the
 * other. The COMPARISON STYLE is reused from endgame.ts (getLocalParts plus
 * an exact-hour check); the CONSTANT is this module's own.
 */
const DIGEST_LOCAL_HOUR = 20

export type DigestRunResult =
  | {
      groupId: string
      status: "processed"
      /** Memberships looked at, whether or not they got an email. */
      considered: number
      sent: number
      skipped: number
    }
  | { groupId: string; status: "skipped"; reason: "not_digest_hour" }
  | { groupId: string; status: "failed"; reason: string }

type MemberOutcome =
  | "sent"
  | "skipped_no_verified_email"
  | "skipped_not_eligible"
  | "skipped_nothing_to_report"

// ── Minimal row shapes ───────────────────────────────────────────────────
//
// Hand-rolled rather than derived from Prisma's generated types, following
// src/lib/events/roster.ts's RosterMember/RsvpRecord precedent: only the
// fields this module actually reads, so a real query result (which always
// carries more columns) is still structurally assignable.

interface GroupRow {
  id: string
  name: string
  timeZone: string
}

interface MembershipRow {
  id: string
  lastSeenAt: Date | null
  lastDigestSentAt: Date | null
  joinedAt: Date
  user: {
    id: string
    digestOptOutAt: Date | null
  }
}

interface EventRow {
  id: string
  title: string
  startsAt: Date
  endsAt: Date | null
  createdAt: Date
  gaugeId: string | null
  status: EventStatus
  venues: { displayLabel: string | null; name: string }[]
}

interface RsvpRow {
  eventId: string
  userId: string
  status: RsvpStatus
}

/**
 * Sweep every group (or, for tests, only the groups named in
 * opts.groupIds — see reconcile.ts's identical opts.groupId for the same
 * reason: an unscoped sweep against the shared dev-test database would
 * process every real group sitting in it, mutating lastDigestSentAt on rows
 * no test created). Production calls this with no opts, exactly like the
 * cron's other three sweeps.
 *
 * @param now  The reference instant. Passed explicitly, never read from
 *             Date.now() internally, so callers (the cron handler, tests)
 *             control the clock.
 */
export async function runDailyDigest(
  now: Date,
  opts?: { groupIds?: string[] }
): Promise<DigestRunResult[]> {
  const groups: GroupRow[] = opts?.groupIds
    ? await prisma.group.findMany({
        where: { id: { in: opts.groupIds } },
        select: { id: true, name: true, timeZone: true },
      })
    : await prisma.group.findMany({ select: { id: true, name: true, timeZone: true } })

  const results: DigestRunResult[] = []

  for (const group of groups) {
    try {
      results.push(await processOneGroup(group, now))
    } catch (err) {
      // One bad group's data (an invalid timezone, a malformed row) must not
      // take the sweep down for every group after it — the exact bug
      // reconcile.ts was fixed for pre-launch. Logged, never swallowed:
      // reconcile.ts's own catch is the pattern this copies.
      console.error("[digest] group failed:", group.id, err)
      results.push({
        groupId: group.id,
        status: "failed",
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return results
}

/**
 * The verified email address for each of these users, keyed by user id.
 *
 * THE THIRD READ SITE the guard test itself names and anticipates
 * (src/app/__tests__/no-email-address-on-screen.test.tsx: "A THIRD read
 * site is not automatically a leak, but it is the moment somebody has to
 * think about this again, so it reddens here and gets a decision rather
 * than a default"). This is that decision, made deliberately rather than by
 * routing around the guard: sanctioned, and that test's own assertion was
 * updated alongside this function to name it (digest slice two, task 8).
 *
 * It is a different SHAPE of read from the other two on purpose.
 * hasVerifiedEmail and verifiedEmailAddress (src/lib/auth/email-ask.ts) are
 * both scoped to exactly one user id, because their job is answering a
 * question about the single viewer looking at a screen — CLAUDE.md's rule
 * is about an address never being shown to the group or to any other
 * member. Mailing a digest is structurally different: it necessarily reads
 * more than one member's address in the same pass, and it never renders
 * anything. What this function returns is only ever handed to sendEmail's
 * `to` field, a fire-and-forget service call, never a page, a prop, or a
 * log line — so it does not touch the rule that motivated the other two
 * functions' one-id-at-a-time shape. Scoped to the caller's own userIds
 * (one group's own membership, already fetched), never to every User row in
 * the product.
 */
async function loadVerifiedEmails(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map()
  const rows = await prisma.contactMethod.findMany({
    where: { userId: { in: userIds }, type: ContactMethodType.EMAIL, isVerified: true },
    select: { userId: true, value: true },
  })
  return new Map(rows.map((r) => [r.userId, r.value]))
}

async function processOneGroup(group: GroupRow, now: Date): Promise<DigestRunResult> {
  // getLocalParts can throw for a corrupt/invalid IANA timezone string; that
  // throw is exactly the per-group failure the outer loop's try/catch
  // exists to isolate, so it is deliberately not guarded here.
  const localHour = getLocalParts(now, group.timeZone).hour
  if (localHour !== DIGEST_LOCAL_HOUR) {
    return { groupId: group.id, status: "skipped", reason: "not_digest_hour" }
  }

  const memberships: MembershipRow[] = await prisma.membership.findMany({
    where: { groupId: group.id },
    // A narrow select, deliberately never the contact-method relation on
    // this User row — see loadVerifiedEmails below for why a member's
    // address is read as its own separate query instead.
    include: { user: { select: { id: true, digestOptOutAt: true } } },
  })
  const verifiedEmails = await loadVerifiedEmails(memberships.map((m) => m.user.id))

  // One query for the whole group, filtered per member by the pure module.
  // Bounded by the earliest read position across the group's members, so a
  // long-dormant member cannot make this unbounded.
  const earliestWatermark = memberships.reduce<Date>(
    (earliest, m) => {
      const seen = m.lastSeenAt
      const sent = m.lastDigestSentAt
      const later = seen && sent ? (seen > sent ? seen : sent) : (seen ?? sent ?? m.joinedAt)
      return later < earliest ? later : earliest
    },
    now
  )
  const cancelledEvents: CancellationRow[] = await prisma.event.findMany({
    where: {
      groupId: group.id,
      status: EventStatus.CANCELLED,
      cancelledAt: { gte: earliestWatermark },
    },
    select: {
      id: true,
      title: true,
      startsAt: true,
      cancelledAt: true,
    },
  })

  // No cap, unlike the card region: needs-you.ts's own header note says an
  // email has no real-estate constraint, so every future event is a
  // candidate, never just the soonest five.
  const upcomingEvents: EventRow[] = await prisma.event.findMany({
    where: {
      groupId: group.id,
      startsAt: { gte: now },
      // A called-off plan asks nothing of anybody. Without this the digest
      // makes a cancellation WORSE than silent: a Thursday cancellation
      // produces a Friday email telling the group to RSVP to a game that is
      // not happening.
      status: EventStatus.SCHEDULED,
    },
    orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }],
    include: { venues: true },
  })

  const eventIds = upcomingEvents.map((e) => e.id)
  const rsvps: RsvpRow[] =
    eventIds.length > 0 ? await prisma.rsvp.findMany({ where: { eventId: { in: eventIds } } }) : []
  const rsvpsByEvent = new Map<string, RsvpRow[]>()
  for (const r of rsvps) {
    const list = rsvpsByEvent.get(r.eventId)
    if (list) list.push(r)
    else rsvpsByEvent.set(r.eventId, [r])
  }

  const liveGauges = await findLiveGauges(group.id, now)
  const liveProposalsAll = await findLiveProposals(group.id, now)
  // Decision 2 (spec, digest slice two): only GROUP-kind proposals are the
  // "time-change vote" this product means to a member. A VERIFY-kind
  // proposal is Orbit's own single-person clarifying question, never on the
  // card ladder either — needs-you.ts's own header scope note draws the
  // identical line for the item list itself. Feeding a VERIFY-kind ask into
  // the gate below would open it for something the digest will never list
  // (task 4's own registered product gap), which is a needless false
  // "something happened" rather than a wrong email.
  const liveProposals = liveProposalsAll.filter((p) => p.kind === ProposalKind.GROUP)

  // Only MEMBER rows: deriveYouMissed's own filter would drop ORBIT/SYSTEM
  // rows anyway (decision 4), so filtering at the query is an efficiency
  // choice, not a second copy of that rule.
  const messages: YouMissedMessage[] = await prisma.message.findMany({
    where: { groupId: group.id, authorType: MessageAuthor.MEMBER },
    include: { author: true },
    orderBy: { createdAt: "asc" },
  })

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

  const origin = siteUrl().origin
  const totalMembers = memberships.length

  let sent = 0
  const skipReasons: Partial<Record<MemberOutcome | "error", number>> = {}

  for (const membership of memberships) {
    try {
      const outcome = await processOneMember({
        membership,
        group,
        now,
        gateOpen,
        upcomingEvents,
        rsvpsByEvent,
        totalMembers,
        liveGauges,
        liveProposals,
        messages,
        cancelledEvents,
        origin,
        verifiedEmail: verifiedEmails.get(membership.user.id) ?? null,
      })
      if (outcome === "sent") sent++
      else skipReasons[outcome] = (skipReasons[outcome] ?? 0) + 1
    } catch (err) {
      // One member's bad data or a thrown send must not cost the rest of
      // this group's members. Never log the address (see send.ts's own
      // header for why); membership/group ids are opaque cuids, not PII.
      console.error("[digest] member failed:", group.id, membership.id, err)
      skipReasons.error = (skipReasons.error ?? 0) + 1
    }
  }

  const considered = memberships.length
  const skipped = considered - sent
  const reasonSummary = Object.entries(skipReasons)
    .map(([reason, count]) => `${reason}=${count}`)
    .join(" ")
  console.log(
    `[digest] group ${group.id}: considered=${considered} sent=${sent} skipped=${skipped}` +
      (reasonSummary ? ` (${reasonSummary})` : "")
  )

  return { groupId: group.id, status: "processed", considered, sent, skipped }
}

async function processOneMember(input: {
  membership: MembershipRow
  group: GroupRow
  now: Date
  gateOpen: boolean
  upcomingEvents: EventRow[]
  rsvpsByEvent: Map<string, RsvpRow[]>
  totalMembers: number
  liveGauges: LiveGauge[]
  liveProposals: LiveProposal[]
  messages: YouMissedMessage[]
  cancelledEvents: CancellationRow[]
  origin: string
  /** From loadVerifiedEmails, keyed by user id ahead of this call — belt-
   *  and-braces (brief's own wording): a ContactMethod row only ever exists
   *  verified (src/lib/auth/email.ts), so null here just means no address
   *  is on file, not that an unverified one was filtered out silently. */
  verifiedEmail: string | null
}): Promise<MemberOutcome> {
  const {
    membership,
    group,
    now,
    gateOpen,
    upcomingEvents,
    rsvpsByEvent,
    totalMembers,
    liveGauges,
    liveProposals,
    messages,
    cancelledEvents,
    origin,
    verifiedEmail,
  } = input
  const user = membership.user

  if (!verifiedEmail) return "skipped_no_verified_email"

  const eligible = isDigestEligibleToday({
    now,
    timeZone: group.timeZone,
    lastDigestSentAt: membership.lastDigestSentAt,
    digestOptOutAt: user.digestOptOutAt,
  })
  if (!eligible) return "skipped_not_eligible"

  const eventCards: EventCardData[] = upcomingEvents.map((event) => {
    const rsvpsForEvent = rsvpsByEvent.get(event.id) ?? []
    const viewerStatus = rsvpsForEvent.find((r) => r.userId === user.id)?.status ?? null
    const inCount = rsvpsForEvent.filter((r) => r.status === RsvpStatus.IN).length
    const outCount = rsvpsForEvent.filter((r) => r.status === RsvpStatus.OUT).length
    return {
      event: {
        id: event.id,
        title: event.title,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        status: event.status,
        venues: event.venues,
      },
      inCount,
      outCount,
      pendingCount: Math.max(totalMembers - inCount - outCount, 0),
      viewerStatus,
    }
  })

  // THE BLOCK-GATING RULE (schedule.ts's own header comment; task 8's
  // reviewer was told to verify this specifically). The gate controls
  // "needs you" ONLY. "You missed" is computed unconditionally below and
  // must never be short-circuited by gateOpen — a member who missed real
  // conversation must still hear about it on a day neither send rule fired.
  const needsYou = gateOpen
    ? deriveNeedsYouItems({
        events: eventCards,
        liveGauges,
        liveProposals,
        viewerId: user.id,
        timeZone: group.timeZone,
      })
    : []

  const youMissed = deriveYouMissed({
    messages,
    lastSeenAt: membership.lastSeenAt,
    lastDigestSentAt: membership.lastDigestSentAt,
    joinedAt: membership.joinedAt,
    viewerId: user.id,
  })

  const cancellations = deriveCancellations({
    events: cancelledEvents,
    lastSeenAt: membership.lastSeenAt,
    lastDigestSentAt: membership.lastDigestSentAt,
    joinedAt: membership.joinedAt,
    timeZone: group.timeZone,
    now,
  })

  if (needsYou.length === 0 && youMissed === null && cancellations.length === 0) {
    return "skipped_nothing_to_report"
  }

  const unsubscribeToken = await ensureUnsubscribeToken(user.id)
  const composed = composeDigestEmail({
    groupId: group.id,
    groupName: group.name,
    needsYou,
    youMissed,
    cancellations,
    siteOrigin: origin,
    unsubscribeToken,
  })
  // composeDigestEmail re-checks the identical all-empty condition already
  // checked above. Reaching null here would mean this function's own check
  // disagreed with compose's, which is a bug in this function, not a
  // legitimate second "nothing to send" case — treated exactly like the
  // check above (no send, no stamp) rather than assumed impossible.
  if (!composed) return "skipped_nothing_to_report"

  await sendEmail({
    to: verifiedEmail,
    subject: composed.subject,
    text: composed.text,
    html: composed.html,
    unsubscribeUrl: composed.unsubscribeUrl,
  })

  // THE STAMP-ON-SEND RULE. Stamped only here, after sendEmail has
  // returned, and for every outcome it can return ("ok", "invalid_address",
  // "rate_limited", "service_error", "suppressed_dev" alike): all five mean
  // an attempt happened this cycle, which is the fact lastDigestSentAt
  // records. Never stamp before this line — the "nothing to report" branch
  // above already returned without writing anything, so tomorrow stays free
  // to send for a member who got nothing today.
  await prisma.membership.update({
    where: { id: membership.id },
    data: { lastDigestSentAt: now },
  })

  return "sent"
}
