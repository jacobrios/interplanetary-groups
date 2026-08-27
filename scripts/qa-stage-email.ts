// scripts/qa-stage-email.ts
//
// Stages the email-sign-in QA walkthrough. Almost nothing in this slice can be
// reached by hand, which is the whole reason this file exists: the ask renders
// only for a viewer whose own User row is in a particular state, and the
// SECOND ask additionally needs that state to be more than seven days old.
// Without a script the owner cannot see the second ask at all, on any device,
// however long he clicks.
//
// Two groups, so the founder copy and the plain copy can be compared side by
// side rather than from memory:
//
//   [QA] Email Member  - the owner joins as an ordinary member.
//   [QA] Email Founder - the owner joins, then --seed-viewer hands him the
//                        founder seat, which is the only fact the founder
//                        sentence reads (group.founderId === viewer.id).
//
// Each group gets three seeded members, one confirmed event with a venue, and
// a feed spanning three group-local days, so the ask is measured against a
// real screen rather than against an empty one. Height is the thing the owner
// is actually judging here: EmailAskNote estimates 135 / 152 / 170px for its
// three variants against the 289.7px of chat feed measured on his own phone in
// the card-region-height slice, and that estimate has never been checked
// against a rendered screen.
//
// THE VIEWER PROBLEM, and why this script has a --seed-viewer mode: same story
// as qa-stage-polish.ts and qa-stage-pending.ts. A script cannot forge a
// Supabase session, so the browser tester becomes the viewer by really joining
// through the invite link. Once he has, this script attaches state to whichever
// membership joined last.
//
// TWO THINGS ABOUT THAT STATE THAT DECIDE THE WHOLE RUNNING ORDER, both learned
// from reading the schema rather than guessed at:
//
//   1. emailAskCount and emailAskedAt live on the USER row, not on a
//      membership. There is one of them for the owner across every group he is
//      in. So "first ask" and "second ask" cannot be true at the same moment,
//      in any two groups, for the same session. They have to be walked in
//      order, and --seed-viewer second is the step that ends the first ask
//      everywhere.
//   2. hasVerifiedEmail is a User-level fact too (email-ask.ts says so in its
//      own comment: an email belongs to the person, not to a membership).
//      Attaching one turns off every ask in the product for that person. So
//      the info page's "Email reminders are on" state is the LAST thing to
//      look at, and --seed-viewer reset is what walks it back.
//
// The founder seat and the plain seat, by contrast, ARE per group, so the first
// ask and the founder's first ask genuinely do coexist: one browser, two tabs.
//
// WHAT THIS SCRIPT DELIBERATELY DOES NOT SEED: the owner's own contribution.
// The first ask fires on "this member has done something in this group", and
// seeding that would fake the exact input under test. He posts one message,
// which is one tap and the honest trigger. --seed-viewer refuses to claim a
// state whose contribution is missing rather than manufacturing one; see
// requireContribution below.
//
// WHERE IT WRITES: whichever database `.env` points at. Run `npm run db:which`
// first, every time; this script refuses to run itself unless all three env
// sources agree on the dev-test project ref (see requireDevTest below), the
// same ref db:which checks against.
//
// This is QA tooling, deliberately outside the test suite: it writes real rows
// to a shared database and is meant to be run by hand before a browser
// walkthrough. Same precedent as qa-stage-cardstate.ts and qa-stage-polish.ts.
// It is not named *.test.ts, which is what keeps Vitest from collecting it.
//
// THE TWO-PLACES PROBLEM, found the hard way on 27 Aug 2026 and worth reading
// before touching --seed-viewer reset. An email address lives in two systems:
// this product's own ContactMethod table, and the Supabase identity itself
// (email.ts's whole job is keeping those two in step, not owning one truth).
// reset can only clear OUR half. It has no service-role key, by deliberate
// decision (the slice document: a service-role key would bypass every
// protection in the product), so it cannot touch the Supabase side at all.
//
// The failure this produced: a "reset" run left Supabase still holding a
// previously attached address while the script printed a flat claim that
// nothing was left. Every attach attempt after that reset was therefore an
// EMAIL CHANGE as far as Supabase was concerned, not a first attach, which is
// a different code path (email.ts's confirmEmailAttach against `email_change`)
// with a different failure shape if the project has "Secure email change" on:
// it needs a code confirmed from both the old and the new address and simply
// returns success with no session when only one lands. Nothing about that was
// visible from the reset output, and it cost an afternoon.
//
// This script cannot fix the underlying gap (no service role, and staying
// that way), but it can stop lying about it, and it turns out it can do a bit
// more than that. The app's own Supabase client (src/lib/supabase/server.ts)
// is useless here: it needs next/headers cookies() from a real request, which
// a script never has. But Prisma's own Postgres connection (the one
// DATABASE_URL already points at) is the SAME Postgres instance Supabase's
// auth schema lives in, and a read-only `select ... from auth.users` over
// that connection works (verified against dev-test while building this fix).
// So this script can tell the runner what Supabase actually has on file,
// without ever touching the Admin API or a service-role key: see
// readSupabaseIdentityState below. This is a narrow, deliberate, read-only
// exception to "Prisma owns the schema, the Data API stays off": it is
// diagnostic output for a human running staging tooling against dev-test, not
// a new source of truth any product code reads, and it never writes to
// auth.users. Worth a second pair of eyes before this pattern spreads anywhere
// else.
//
// Usage:
//   npm run qa:stage-email                       (re-stage both groups)
//   npm run qa:stage-email -- --seed-viewer <groupId> <state>
//
//     check     write nothing, print the live shouldOfferEmail verdict
//     founder   hand the viewer the founder seat of that group
//     second    count 1, asked ten days ago: the second and last ask
//     email-on  attach a verified email: every ask off, info row flips
//     reset     count 0, no email on OUR side. Supabase's own copy of the
//               identity is untouched; see THE TWO-PLACES PROBLEM below and
//               the supabaseIdentity block every seed-viewer call now prints.
//
// Unlike the older staging scripts, the main mode REPLACES its own prior rows
// rather than leaving a second copy behind: it deletes any previous [QA] Email
// group and its fake members first. It also resets the ask state of any real
// person who was in one of those groups, because that is almost certainly the
// owner's own session from the previous run, and a leftover count of 1 or a
// leftover verified email is exactly what would make a re-run silently show
// nothing at all.

import { prisma } from "../src/lib/prisma"
import { createEvent } from "../src/lib/events/create"
import { zonedWallTimeToUtc, getLocalParts } from "../src/lib/orbit/occurrence"
import { loadEmailAskInputs } from "../src/lib/auth/email-ask"
import { shouldOfferEmail } from "../src/lib/auth/email-offer"
import { judge } from "./db-which"
import { MessageAuthor, RsvpStatus } from "@prisma/client"

const TZ = "America/Denver"
const BASE_URL = "http://localhost:3000"

const MEMBER_GROUP_NAME = "[QA] Email Member"
const FOUNDER_GROUP_NAME = "[QA] Email Founder"
const GROUP_NAMES = [MEMBER_GROUP_NAME, FOUNDER_GROUP_NAME]

/** Every fake user this script creates carries this prefix, so cleanup can find them. */
const FAKE_AUTH_PREFIX = "qa-emailask-"

/** The same ref db:which checks against (CLAUDE.md, "Two databases, never crossed"). */
const EXPECTED_DEV_TEST_REF = "pxbewardwvoyqqcvogel"

/** Comfortably past shouldOfferEmail's seven-day bar, so a slow QA session cannot slide under it. */
const SECOND_ASK_BACKDATE_DAYS = 10
const SECOND_ASK_BACKDATE_MS = SECOND_ASK_BACKDATE_DAYS * 24 * 60 * 60 * 1000

type ViewerState = "check" | "founder" | "second" | "email-on" | "reset"
const VIEWER_STATES: ViewerState[] = ["check", "founder", "second", "email-on", "reset"]

/**
 * Refuses to run unless the checkout points at dev-test, on all three env
 * sources. This script writes real rows to a shared database and has no way to
 * know which project `.env` points at other than asking, so it asks before
 * doing anything else.
 */
function requireDevTest(): void {
  const verdict = judge(process.env, EXPECTED_DEV_TEST_REF)
  if (verdict.ok) return
  console.error(`STOP: this checkout is NOT confirmed to be dev-test.`)
  for (const p of verdict.problems) console.error(`  - ${p}`)
  console.error(`Run npm run db:which and resolve it before running this script.`)
  process.exit(1)
}

/**
 * The live verdict, read through the real production functions rather than
 * re-derived here. This is the one thing a staging script can prove without a
 * browser: that the rows it just wrote actually satisfy the rule the screen
 * reads. A seeded state that does not produce an ask is worse than no staging
 * at all, because it sends the owner looking for a bug that is in the fixture.
 */
async function verdictFor(userId: string, groupId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { emailAskCount: true, emailAskedAt: true },
  })
  const inputs = await loadEmailAskInputs({ userId, groupId })
  const now = new Date()
  return {
    emailAskCount: user.emailAskCount,
    emailAskedAt: user.emailAskedAt?.toISOString() ?? null,
    latestContributionAt: inputs.latestContributionAt?.toISOString() ?? null,
    hasVerifiedEmail: inputs.hasVerifiedEmail,
    shouldOfferEmail: shouldOfferEmail({
      user,
      latestContributionAt: inputs.latestContributionAt,
      hasVerifiedEmail: inputs.hasVerifiedEmail,
      now,
    }),
  }
}

/** A real Supabase auth id is a UUID. Anything else is one of this script's own fake users. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type SupabaseIdentityState =
  | {
      known: true
      hasConfirmedEmail: boolean
      hasPendingEmailChange: boolean
      isAnonymous: boolean
      meaning: string
    }
  | { known: false; reason: string }

/**
 * What Supabase's own copy of this identity actually holds, read straight off
 * `auth.users` over the same Postgres connection Prisma already uses (see THE
 * TWO-PLACES PROBLEM above for why this is safe and why it is not a general
 * pattern to reach for elsewhere). Never prints the address itself, only
 * whether one is there: this is diagnostic state, not a reason to put an
 * email address in a script's stdout.
 *
 * The two booleans are genuinely different situations. `email` is set once
 * Supabase has a CONFIRMED address on the identity; `email_change` is set
 * while a code has been requested but not yet confirmed, and can be true or
 * false independent of `email`. Both matter to the runner because both make
 * the next attach a CHANGE rather than a first attach.
 */
async function readSupabaseIdentityState(supabaseAuthId: string | null): Promise<SupabaseIdentityState> {
  if (!supabaseAuthId || !UUID_RE.test(supabaseAuthId)) {
    return { known: false, reason: "supabaseAuthId is not a UUID, so this cannot be a real Supabase identity." }
  }

  try {
    const rows = await prisma.$queryRawUnsafe<{ email: string | null; email_change: string | null; is_anonymous: boolean }[]>(
      `select email, email_change, is_anonymous from auth.users where id = $1::uuid`,
      supabaseAuthId
    )
    const row = rows[0]
    if (!row) {
      return { known: false, reason: "no matching auth.users row. Unexpected for a viewer who has joined through the app." }
    }

    const hasConfirmedEmail = row.email !== null && row.email !== ""
    const hasPendingEmailChange = row.email_change !== null && row.email_change !== ""

    let meaning: string
    if (hasConfirmedEmail) {
      meaning =
        "Supabase already has a confirmed address on this identity. The next attach attempt in the UI " +
        "will be read as an EMAIL CHANGE, not a first attach. If Secure email change is on for this " +
        "project, that needs a code confirmed from BOTH the old and the new address; if it is off, the " +
        "new address's code alone confirms it."
    } else if (hasPendingEmailChange) {
      meaning =
        "Supabase has an unconfirmed email change pending on this identity (a code was requested and " +
        "never confirmed). The next attach attempt will still be read as a change, not a first attach, " +
        "until that pending change is confirmed or expires on its own."
    } else {
      meaning = "Supabase side is clean: no confirmed address and no pending change. The next attach will be a first attach."
    }

    return { known: true, hasConfirmedEmail, hasPendingEmailChange, isAnonymous: row.is_anonymous, meaning }
  } catch (err) {
    return { known: false, reason: `could not read auth.users: ${err instanceof Error ? err.message : String(err)}` }
  }
}

// ── Cleanup, so a second run replaces the first ──────────────────────────────

/**
 * Deletes the previous run's groups and fake members, and puts any REAL person
 * who was in one of them back to a clean ask state ON OUR SIDE.
 *
 * That last part is the one write here that reaches outside this script's own
 * rows, and it is deliberate. The owner's session survives a re-run, so without
 * it a second pass starts with his count already at 1, or with the verified
 * email the previous pass attached, and every ask stays silently invisible.
 * Scoped to people who were members of a [QA] Email group, in dev-test only,
 * and printed in the output so it is never a surprise.
 *
 * "Clean ask state" is scoped to what this script can actually reach: see THE
 * TWO-PLACES PROBLEM up top. If a real person attached a genuine address
 * through the UI in an earlier run, that address is still on their Supabase
 * identity after this runs; this function's own supabaseIdentity readback per
 * viewer is what tells the caller that instead of leaving it to be discovered
 * the hard way.
 */
async function replacePriorRuns(): Promise<{
  groupsDeleted: number
  viewersReset: { name: string; supabaseIdentity: SupabaseIdentityState }[]
}> {
  const priorGroups = await prisma.group.findMany({
    where: { name: { in: GROUP_NAMES } },
    include: { memberships: { include: { user: true } } },
  })

  const realViewers = new Map<string, { name: string; supabaseAuthId: string | null }>()
  for (const g of priorGroups) {
    for (const m of g.memberships) {
      if (!m.user.supabaseAuthId?.startsWith(FAKE_AUTH_PREFIX)) {
        realViewers.set(m.user.id, { name: m.user.name, supabaseAuthId: m.user.supabaseAuthId })
      }
    }
  }

  for (const g of priorGroups) {
    // Cascades to memberships, events (and their venues and RSVPs), messages,
    // gauges and change proposals; the fake users themselves survive it, since
    // a User is not owned by a Group, so they are swept separately below.
    await prisma.group.delete({ where: { id: g.id } })
  }

  await prisma.user.deleteMany({ where: { supabaseAuthId: { startsWith: FAKE_AUTH_PREFIX } } })

  for (const userId of realViewers.keys()) {
    await prisma.contactMethod.deleteMany({ where: { userId, type: "EMAIL" } })
    await prisma.user.update({
      where: { id: userId },
      data: { emailAskCount: 0, emailAskedAt: null },
    })
  }

  const viewersReset = await Promise.all(
    [...realViewers.values()].map(async (v) => ({
      name: v.name,
      supabaseIdentity: await readSupabaseIdentityState(v.supabaseAuthId),
    }))
  )

  return { groupsDeleted: priorGroups.length, viewersReset }
}

// ── Main mode: build the two groups ──────────────────────────────────────────

interface SeededGroup {
  id: string
  name: string
  inviteToken: string
}

async function buildGroup(name: string, slug: string, stamp: number): Promise<SeededGroup> {
  const now = new Date()
  const p = getLocalParts(now, TZ)

  const founder = await prisma.user.create({
    data: { name: "Jordan", supabaseAuthId: `${FAKE_AUTH_PREFIX}${slug}-jordan-${stamp}` },
  })
  const casey = await prisma.user.create({
    data: { name: "Casey", supabaseAuthId: `${FAKE_AUTH_PREFIX}${slug}-casey-${stamp}` },
  })
  const rae = await prisma.user.create({
    data: { name: "Rae", supabaseAuthId: `${FAKE_AUTH_PREFIX}${slug}-rae-${stamp}` },
  })

  const group = await prisma.group.create({
    data: {
      name,
      founderId: founder.id,
      timeZone: TZ,
      inviteToken: `${FAKE_AUTH_PREFIX}${slug}-${stamp}`,
      memberships: { create: [founder.id, casey.id, rae.id].map((userId) => ({ userId })) },
    },
  })

  async function memberMsg(userId: string, body: string, createdAt?: Date) {
    return prisma.message.create({
      data: {
        groupId: group.id,
        authorType: MessageAuthor.MEMBER,
        authorId: userId,
        body,
        ...(createdAt ? { createdAt } : {}),
      },
    })
  }

  // One confirmed event, so the card region carries a real card and the ask is
  // measured against the screen it will actually share.
  const start = zonedWallTimeToUtc(p.year, p.month, p.day + 4, 19, 0, TZ)
  const event = await createEvent({
    groupId: group.id,
    title: "Trivia Night",
    startsAt: start,
    activityLabel: "trivia",
    venue: { name: "The Hoppy Place", address: "88 Congress Ave" },
  })
  await prisma.rsvp.create({ data: { eventId: event.id, userId: founder.id, status: RsvpStatus.IN } })
  await prisma.rsvp.create({ data: { eventId: event.id, userId: casey.id, status: RsvpStatus.IN } })
  await prisma.rsvp.create({ data: { eventId: event.id, userId: rae.id, status: RsvpStatus.OUT } })

  // A feed spanning three group-local days. Built off today's local y/m/d minus
  // 2 and minus 1 rather than a flat 48h/24h subtraction, so each instant lands
  // on the right side of a Denver midnight even when this runs near one.
  await memberMsg(founder.id, "good session, my forearms are done", zonedWallTimeToUtc(p.year, p.month, p.day - 2, 18, 30, TZ))
  await memberMsg(casey.id, "same, worth it though", zonedWallTimeToUtc(p.year, p.month, p.day - 2, 18, 35, TZ))
  await memberMsg(rae.id, "who's bringing the snacks this week?", zonedWallTimeToUtc(p.year, p.month, p.day - 1, 12, 5, TZ))
  await memberMsg(casey.id, "me, unless anyone has allergies I should know about", zonedWallTimeToUtc(p.year, p.month, p.day - 1, 12, 10, TZ))
  await memberMsg(founder.id, "we're all good, thanks casey")
  await memberMsg(rae.id, "trivia is going to be rough, I've been up since five")
  await memberMsg(casey.id, "you say that every week and then win")

  return { id: group.id, name: group.name, inviteToken: group.inviteToken }
}

// ── --seed-viewer mode ───────────────────────────────────────────────────────

/**
 * The last membership to join is the owner's real browser session: every fake
 * member was written before he ever saw the invite link. Same identification
 * qa-stage-polish.ts uses, and it fails loudly rather than seeding a fake
 * member's row and reporting success.
 */
async function findViewer(groupId: string) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: { memberships: { include: { user: true }, orderBy: { joinedAt: "asc" } } },
  })
  if (!group) throw new Error(`no group ${groupId}`)

  const last = group.memberships[group.memberships.length - 1]
  if (!last || last.user.supabaseAuthId?.startsWith(FAKE_AUTH_PREFIX)) {
    throw new Error(
      `group ${group.name} has no joined viewer yet (its newest member is one this script made). ` +
        `Open the invite link in the browser and join first, then re-run --seed-viewer.`
    )
  }
  return { group, viewer: last.user }
}

/**
 * The one thing this script will not fabricate. Both asks need the viewer to
 * have done something in the group, and the second one needs it to be more
 * recent than the ask itself. Seeding that would fake the input under test, so
 * a missing contribution stops the run with instructions instead.
 */
async function requireContribution(userId: string, groupId: string, notBefore: Date | null) {
  const { latestContributionAt } = await loadEmailAskInputs({ userId, groupId })
  if (latestContributionAt === null) {
    throw new Error(
      `the viewer has done nothing in this group yet, so no ask can render. ` +
        `Post one message in the group chat as yourself, then re-run.`
    )
  }
  if (notBefore && latestContributionAt.getTime() <= notBefore.getTime()) {
    throw new Error(
      `the viewer's newest contribution (${latestContributionAt.toISOString()}) is not newer than ` +
        `the backdated ask (${notBefore.toISOString()}), so the second ask cannot fire. Post a message and re-run.`
    )
  }
}

async function seedViewer(groupId: string, state: ViewerState) {
  const { group, viewer } = await findViewer(groupId)
  const notes: string[] = []

  if (state === "founder") {
    await prisma.group.update({ where: { id: group.id }, data: { founderId: viewer.id } })
    notes.push(
      `${viewer.name} now holds the founder seat of ${group.name}. That is the only fact the founder sentence reads.`
    )
    await requireContribution(viewer.id, group.id, null)
  }

  if (state === "second") {
    const askedAt = new Date(Date.now() - SECOND_ASK_BACKDATE_MS)
    await requireContribution(viewer.id, group.id, askedAt)
    await prisma.user.update({
      where: { id: viewer.id },
      data: { emailAskCount: 1, emailAskedAt: askedAt },
    })
    notes.push(
      `Asked-at backdated to ${askedAt.toISOString()} (${SECOND_ASK_BACKDATE_DAYS} days), past the seven-day bar.`,
      `This ends the FIRST ask everywhere, in both groups: the counter lives on the person, not the membership.`
    )
  }

  if (state === "email-on") {
    await prisma.contactMethod.deleteMany({ where: { userId: viewer.id, type: "EMAIL" } })
    await prisma.contactMethod.create({
      data: {
        userId: viewer.id,
        type: "EMAIL",
        value: `qa-email-on-${Date.now()}@example.invalid`,
        isVerified: true,
      },
    })
    notes.push(
      `A verified email is attached, so EVERY ask is now off, in both groups.`,
      `The address is fake and is NOT a Supabase account, so signing in with it will honestly answer "I don't have an account with that email". Only a real attach through the UI can be signed in with.`
    )
  }

  if (state === "reset") {
    await prisma.contactMethod.deleteMany({ where: { userId: viewer.id, type: "EMAIL" } })
    await prisma.user.update({
      where: { id: viewer.id },
      data: { emailAskCount: 0, emailAskedAt: null },
    })
    notes.push(
      `OUR side is back to the top: no email, no asks spent.`,
      `That is not the whole picture. This cannot touch Supabase's own copy of the identity, ` +
        `because the app has no service-role key, by decision. Read the supabaseIdentity block below ` +
        `before assuming the next attach behaves like a first attach.`
    )
  }

  const supabaseIdentity = await readSupabaseIdentityState(viewer.supabaseAuthId)
  const memberVerdict = await verdictFor(viewer.id, group.id)
  const others = await prisma.group.findMany({
    where: { name: { in: GROUP_NAMES }, id: { not: group.id } },
    select: { id: true, name: true, founderId: true },
  })
  const elsewhere = await Promise.all(
    others.map(async (g) => ({
      group: g.name,
      viewerIsFounder: g.founderId === viewer.id,
      ...(await verdictFor(viewer.id, g.id)),
      homeUrl: `${BASE_URL}/groups/${g.id}`,
    }))
  )

  console.log(
    JSON.stringify(
      {
        mode: state,
        viewer: viewer.name,
        viewerUserId: viewer.id,
        notes,
        supabaseIdentity,
        thisGroup: {
          group: group.name,
          viewerIsFounder: (await prisma.group.findUniqueOrThrow({ where: { id: group.id }, select: { founderId: true } })).founderId === viewer.id,
          ...memberVerdict,
          homeUrl: `${BASE_URL}/groups/${group.id}`,
          infoUrl: `${BASE_URL}/groups/${group.id}/info`,
        },
        otherQaGroups: elsewhere,
        readMe:
          "shouldOfferEmail is the real production function, called here on the rows that were just written. " +
          '"first" or "second" means the ask WILL render for this viewer on that group home; null means it will not. ' +
          "supabaseIdentity is read straight off Supabase's own auth.users row, separately from anything this " +
          "script wrote: our ContactMethod table and Supabase's identity are two different places, and this " +
          "script can only ever act on the first.",
      },
      null,
      2
    )
  )
}

// ── Entry point ──────────────────────────────────────────────────────────────

async function main() {
  requireDevTest()

  const seedAt = process.argv.indexOf("--seed-viewer")
  if (seedAt !== -1) {
    const id = process.argv[seedAt + 1]
    const state = process.argv[seedAt + 2] as ViewerState | undefined
    if (!id || !state || !VIEWER_STATES.includes(state)) {
      console.error(`Usage: npm run qa:stage-email -- --seed-viewer <groupId> <${VIEWER_STATES.join("|")}>`)
      process.exit(1)
    }
    await seedViewer(id, state)
    await prisma.$disconnect()
    return
  }

  const replaced = await replacePriorRuns()
  const stamp = Date.now()
  const member = await buildGroup(MEMBER_GROUP_NAME, "member", stamp)
  const founder = await buildGroup(FOUNDER_GROUP_NAME, "founder", stamp)

  console.log(
    JSON.stringify(
      {
        replacedPriorRun: {
          groupsDeleted: replaced.groupsDeleted,
          askStateResetFor: replaced.viewersReset,
          note:
            "Any real person who was in a previous [QA] Email group has been put back to zero asks and no attached " +
            "email on OUR side. That is almost certainly your own session from the last run, and without it a " +
            "re-run shows nothing at all. It does not touch Supabase's own copy of the identity (no service-role " +
            "key, by decision): check each person's supabaseIdentity above for what is actually still there.",
        },
        groups: [
          {
            name: member.name,
            role: "you join as an ordinary member",
            inviteUrl: `${BASE_URL}/join/${member.inviteToken}`,
            homeUrl: `${BASE_URL}/groups/${member.id}`,
            infoUrl: `${BASE_URL}/groups/${member.id}/info`,
            groupId: member.id,
          },
          {
            name: founder.name,
            role: "you join, then --seed-viewer founder hands you the founder seat",
            inviteUrl: `${BASE_URL}/join/${founder.inviteToken}`,
            homeUrl: `${BASE_URL}/groups/${founder.id}`,
            infoUrl: `${BASE_URL}/groups/${founder.id}/info`,
            groupId: founder.id,
          },
        ],
        seededInEachGroup:
          "Jordan, Casey and Rae (fake QA members, not real people); Trivia Night four days out at 7pm with a venue, 2 in and 1 out; " +
          "seven chat messages across three group-local days. You have no RSVP and no message anywhere, by design.",
        walkInOrder: [
          `1. Join BOTH groups through their invite links in the same browser, then post one message in each as yourself. That message is the contribution the ask fires on, and it is deliberately not seeded for you: it is the input under test.`,
          `2. FIRST ASK (plain member): open ${MEMBER_GROUP_NAME}'s home. Orbit's ask sits above the composer. Judge the height it takes from the chat.`,
          `3. FOUNDER'S FIRST ASK: run --seed-viewer <${FOUNDER_GROUP_NAME} groupId> founder, reload that group's home. Same note plus one extra sentence about the group you started. Compare the two tabs.`,
          `4. GROUP INFO, no email: open either infoUrl. The row reads "Add your email".`,
          `5. SECOND ASK: run --seed-viewer <either groupId> second, reload either home. Different copy, a "No thanks" dismissal, and it names the group. This ENDS the first ask in both groups.`,
          `6. EMAIL ON: run --seed-viewer <either groupId> email-on, reload. Every ask is gone; the info row reads "Email reminders are on." with a "Change email" link.`,
          `7. Back to the top of OUR side any time: --seed-viewer <groupId> reset. This does not touch Supabase's own copy of the identity (no service-role key, by decision); read the printed supabaseIdentity block, since an address attached earlier through the real UI is still there and turns the next attach into an email change rather than a first attach.`,
        ],
        byHandOnly: [
          `The returning-visitor door: open either inviteUrl in a PRIVATE window (no session) and tap "I've been here before". Reaching a code needs a real address attached through the UI first, and a real inbox.`,
          `${BASE_URL}/signin needs no seeded state at all. It is deliberately not session-aware, so it renders whether you are signed in or not.`,
          `Two notes stacked above the composer (Orbit's email ask plus the "I couldn't read that" note) cannot be seeded: the second one is client state from a failed model call and nothing about it is stored. To see it, start the dev server with a dead key and send a message while an ask is showing: ANTHROPIC_API_KEY=sk-not-a-real-key npm run dev`,
        ],
        seedViewerUsage: `npm run qa:stage-email -- --seed-viewer <groupId> <${VIEWER_STATES.join("|")}>`,
      },
      null,
      2
    )
  )
  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err)
  await prisma.$disconnect()
  process.exit(1)
})
