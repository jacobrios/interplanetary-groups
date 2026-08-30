// src/lib/digest/__tests__/run.test.ts
//
// The daily digest job wired end to end against the real dev-test database,
// following src/lib/auth/__tests__/email-ask.test.ts's fixture-and-cleanup
// idiom: names prefixed "[TEST] ", ids collected and torn down children
// before parents, prisma.$disconnect() in afterAll. sendEmail is mocked in
// every test here (module-level vi.mock) so nothing ever leaves this
// process, matching the task brief's "No test may send a real email."
//
// runDailyDigest accepts an optional opts.groupIds, mirroring
// reconcileScheduledEvents's opts.groupId for the identical reason: an
// UNSCOPED sweep against the shared dev-test database would touch every
// real group sitting in it (writing lastDigestSentAt on memberships no test
// created), so every test here scopes to the group(s) it built.

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import { MessageAuthor, ContactMethodType } from "@prisma/client"

const sendEmailMock = vi.fn()
vi.mock("@/lib/email/send", () => ({
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
}))

import { runDailyDigest } from "../run"

const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

const userIds: string[] = []
const groupIds: string[] = []

afterAll(async () => {
  for (const id of groupIds) {
    await prisma.gaugeVote.deleteMany({ where: { gauge: { groupId: id } } }).catch(() => {})
    await prisma.gauge.deleteMany({ where: { groupId: id } }).catch(() => {})
    await prisma.proposalVote.deleteMany({ where: { proposal: { groupId: id } } }).catch(() => {})
    await prisma.changeProposal.deleteMany({ where: { groupId: id } }).catch(() => {})
    await prisma.rsvp.deleteMany({ where: { event: { groupId: id } } }).catch(() => {})
    await prisma.event.deleteMany({ where: { groupId: id } }).catch(() => {})
    await prisma.message.deleteMany({ where: { groupId: id } }).catch(() => {})
    await prisma.membership.deleteMany({ where: { groupId: id } }).catch(() => {})
    await prisma.group.delete({ where: { id } }).catch(() => {})
  }
  for (const id of userIds) {
    await prisma.contactMethod.deleteMany({ where: { userId: id } }).catch(() => {})
    await prisma.user.delete({ where: { id } }).catch(() => {})
  }
  await prisma.$disconnect()
})

let counter = 0
function uid(label: string) {
  counter += 1
  return `${label}-${stamp}-${counter}`
}

async function makeUser(label: string) {
  const user = await prisma.user.create({
    data: { name: `[TEST] ${label}`, supabaseAuthId: `test-digest-run-${uid(label)}` },
  })
  userIds.push(user.id)
  return user
}

async function addVerifiedEmail(userId: string, value: string) {
  await prisma.contactMethod.create({
    data: { userId, type: ContactMethodType.EMAIL, value, isVerified: true },
  })
}

async function makeGroup(label: string, founderId: string, memberIds: string[], timeZone = "UTC") {
  const group = await prisma.group.create({
    data: {
      name: `[TEST] ${label}`,
      founderId,
      timeZone,
      memberships: { create: memberIds.map((userId) => ({ userId })) },
    },
  })
  groupIds.push(group.id)
  return group
}

async function makeMemberMessage(groupId: string, authorId: string, body: string, createdAt: Date) {
  return prisma.message.create({
    data: { groupId, authorType: MessageAuthor.MEMBER, authorId, body, createdAt },
  })
}

async function makeOrbitMessage(groupId: string, body: string, createdAt: Date) {
  return prisma.message.create({
    data: { groupId, authorType: MessageAuthor.ORBIT, authorId: null, body, createdAt },
  })
}

/** An idea gauge nobody has voted on yet, created "today" relative to
 *  `createdAt`, so schedule.ts's rule one (created today) opens the gate. */
async function makeOpenIdeaGauge(input: {
  groupId: string
  posterId: string
  createdAt: Date
  proposedDate: Date
  proposedTime?: string
}) {
  const sourceMessage = await makeMemberMessage(input.groupId, input.posterId, "beers?", input.createdAt)
  const orbitMessage = await makeOrbitMessage(input.groupId, "Beers this week? Tap in if you're up for it.", input.createdAt)
  return prisma.gauge.create({
    data: {
      groupId: input.groupId,
      sourceMessageId: sourceMessage.id,
      orbitMessageId: orbitMessage.id,
      activity: "beers",
      proposedDate: input.proposedDate,
      proposedTime: input.proposedTime ?? "20:00",
      createdAt: input.createdAt,
    },
  })
}

const NOW = new Date("2026-09-03T20:00:00.000Z") // 8pm UTC — the digest hour, group tz UTC
const NOT_DIGEST_HOUR = new Date("2026-09-03T09:00:00.000Z") // 9am UTC
const GAUGE_CREATED_TODAY = new Date("2026-09-03T10:00:00.000Z") // same UTC calendar day as NOW
const GAUGE_PROPOSED_DATE = new Date("2026-09-06T00:00:00.000Z") // a few days out, well within the live window

describe("runDailyDigest", () => {
  beforeEach(() => {
    sendEmailMock.mockReset()
    sendEmailMock.mockResolvedValue("ok")
  })

  it("skips a group whose local clock does not currently read the digest hour", async () => {
    const founder = await makeUser("HourFounder")
    await addVerifiedEmail(founder.id, `hour-${stamp}@example.test`)
    const group = await makeGroup("Hour Group", founder.id, [founder.id])

    const results = await runDailyDigest(NOT_DIGEST_HOUR, { groupIds: [group.id] })

    expect(results).toEqual([{ groupId: group.id, status: "skipped", reason: "not_digest_hour" }])
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it("a member with nothing to report gets no email, and the marker is not stamped", async () => {
    const member = await makeUser("QuietMember")
    await addVerifiedEmail(member.id, `quiet-${stamp}@example.test`)
    const group = await makeGroup("Quiet Group", member.id, [member.id])

    const results = await runDailyDigest(NOW, { groupIds: [group.id] })

    expect(results).toEqual([
      { groupId: group.id, status: "processed", considered: 1, sent: 0, skipped: 1 },
    ])
    expect(sendEmailMock).not.toHaveBeenCalled()

    const membership = await prisma.membership.findFirstOrThrow({
      where: { groupId: group.id, userId: member.id },
    })
    expect(membership.lastDigestSentAt).toBeNull()
  })

  it("a member with something waiting on them gets one email, and the marker is stamped", async () => {
    const poster = await makeUser("Poster")
    const member = await makeUser("Recipient")
    await addVerifiedEmail(member.id, `something-${stamp}@example.test`)
    const group = await makeGroup("Something Group", poster.id, [poster.id, member.id])

    await makeOpenIdeaGauge({
      groupId: group.id,
      posterId: poster.id,
      createdAt: GAUGE_CREATED_TODAY,
      proposedDate: GAUGE_PROPOSED_DATE,
    })
    // Recipient is caught up on chat as of the gauge's own messages, so the
    // idea vote is the sole reason this email goes out (keeps the assertion
    // below about "Needs you" unambiguous).
    await prisma.membership.update({
      where: { userId_groupId: { userId: member.id, groupId: group.id } },
      data: { lastSeenAt: GAUGE_CREATED_TODAY },
    })

    const results = await runDailyDigest(NOW, { groupIds: [group.id] })

    expect(results).toEqual([
      { groupId: group.id, status: "processed", considered: 2, sent: 1, skipped: 1 },
    ])
    expect(sendEmailMock).toHaveBeenCalledTimes(1)
    const call = sendEmailMock.mock.calls[0][0]
    expect(call.to).toBe(`something-${stamp}@example.test`)
    expect(call.text).toContain("Needs you:")
    expect(call.text).toContain("beers")

    const membership = await prisma.membership.findFirstOrThrow({
      where: { groupId: group.id, userId: member.id },
    })
    expect(membership.lastDigestSentAt?.toISOString()).toBe(NOW.toISOString())
  })

  it("an opted-out member gets no email even with something to report", async () => {
    const poster = await makeUser("OptOutPoster")
    const member = await makeUser("OptOutMember")
    await addVerifiedEmail(member.id, `optout-${stamp}@example.test`)
    await prisma.user.update({ where: { id: member.id }, data: { digestOptOutAt: new Date("2026-01-01T00:00:00.000Z") } })
    const group = await makeGroup("OptOut Group", poster.id, [poster.id, member.id])

    await makeOpenIdeaGauge({
      groupId: group.id,
      posterId: poster.id,
      createdAt: GAUGE_CREATED_TODAY,
      proposedDate: GAUGE_PROPOSED_DATE,
    })

    const results = await runDailyDigest(NOW, { groupIds: [group.id] })

    expect(results).toEqual([
      { groupId: group.id, status: "processed", considered: 2, sent: 0, skipped: 2 },
    ])
    expect(sendEmailMock).not.toHaveBeenCalled()

    const membership = await prisma.membership.findFirstOrThrow({
      where: { groupId: group.id, userId: member.id },
    })
    expect(membership.lastDigestSentAt).toBeNull()
  })

  it("a member with no verified address gets no email", async () => {
    const poster = await makeUser("NoAddrPoster")
    const member = await makeUser("NoAddrMember")
    // Present but unverified: proves the isVerified check, not just "no row".
    await prisma.contactMethod.create({
      data: { userId: member.id, type: ContactMethodType.EMAIL, value: `unverified-${stamp}@example.test`, isVerified: false },
    })
    const group = await makeGroup("NoAddr Group", poster.id, [poster.id, member.id])

    await makeOpenIdeaGauge({
      groupId: group.id,
      posterId: poster.id,
      createdAt: GAUGE_CREATED_TODAY,
      proposedDate: GAUGE_PROPOSED_DATE,
    })

    const results = await runDailyDigest(NOW, { groupIds: [group.id] })

    expect(results).toEqual([
      { groupId: group.id, status: "processed", considered: 2, sent: 0, skipped: 2 },
    ])
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it("an email still sends on a day neither send rule fired, when there is real missed chat (the block-gating rule)", async () => {
    const poster = await makeUser("ChatPoster")
    const member = await makeUser("ChatRecipient")
    await addVerifiedEmail(member.id, `chatty-${stamp}@example.test`)
    const group = await makeGroup("Chatty Group", poster.id, [poster.id, member.id])

    // Deliberately no gauge, no event, no time-change ask: both send rules
    // stay closed. The only thing "waiting" is a message in chat.
    await makeMemberMessage(group.id, poster.id, "we should climb this weekend", new Date("2026-09-02T12:00:00.000Z"))
    await prisma.membership.update({
      where: { userId_groupId: { userId: member.id, groupId: group.id } },
      data: { lastSeenAt: null }, // never opened: read position falls back to joinedAt
    })

    const results = await runDailyDigest(NOW, { groupIds: [group.id] })

    expect(results).toEqual([
      { groupId: group.id, status: "processed", considered: 2, sent: 1, skipped: 1 },
    ])
    expect(sendEmailMock).toHaveBeenCalledTimes(1)
    const call = sendEmailMock.mock.calls[0][0]
    expect(call.text).toContain("You missed")
    expect(call.text).not.toContain("Needs you:")

    const membership = await prisma.membership.findFirstOrThrow({
      where: { groupId: group.id, userId: member.id },
    })
    expect(membership.lastDigestSentAt?.toISOString()).toBe(NOW.toISOString())
  })

  it("one group's bad data does not stop the next group's digest", async () => {
    const badFounder = await makeUser("BadTzFounder")
    await addVerifiedEmail(badFounder.id, `badtz-${stamp}@example.test`)
    const badGroup = await makeGroup("Bad Timezone Group", badFounder.id, [badFounder.id], "Not/AZone")

    const goodPoster = await makeUser("GoodPoster")
    const goodMember = await makeUser("GoodMember")
    await addVerifiedEmail(goodMember.id, `good-${stamp}@example.test`)
    const goodGroup = await makeGroup("Good Group", goodPoster.id, [goodPoster.id, goodMember.id])
    await makeOpenIdeaGauge({
      groupId: goodGroup.id,
      posterId: goodPoster.id,
      createdAt: GAUGE_CREATED_TODAY,
      proposedDate: GAUGE_PROPOSED_DATE,
    })
    await prisma.membership.update({
      where: { userId_groupId: { userId: goodMember.id, groupId: goodGroup.id } },
      data: { lastSeenAt: GAUGE_CREATED_TODAY },
    })

    const results = await runDailyDigest(NOW, { groupIds: [badGroup.id, goodGroup.id] })

    expect(results).toContainEqual(
      expect.objectContaining({ groupId: badGroup.id, status: "failed" })
    )
    expect(results).toContainEqual({
      groupId: goodGroup.id,
      status: "processed",
      considered: 2,
      sent: 1,
      skipped: 1,
    })
    expect(sendEmailMock).toHaveBeenCalledTimes(1)
    expect(sendEmailMock.mock.calls[0][0].to).toBe(`good-${stamp}@example.test`)
  })

  it("one member's send failure does not stop the next member in the same group", async () => {
    const founder = await makeUser("IsoFounder")
    const goodEmail = `iso-good-${stamp}@example.test`
    const badEmail = `iso-bad-${stamp}@example.test`
    const goodMember = await makeUser("IsoGood")
    const badMember = await makeUser("IsoBad")
    await addVerifiedEmail(goodMember.id, goodEmail)
    await addVerifiedEmail(badMember.id, badEmail)
    const group = await makeGroup("Isolation Group", founder.id, [founder.id, goodMember.id, badMember.id])

    await makeOpenIdeaGauge({
      groupId: group.id,
      posterId: founder.id,
      createdAt: GAUGE_CREATED_TODAY,
      proposedDate: GAUGE_PROPOSED_DATE,
    })
    await prisma.membership.updateMany({
      where: { groupId: group.id, userId: { in: [goodMember.id, badMember.id] } },
      data: { lastSeenAt: GAUGE_CREATED_TODAY },
    })

    sendEmailMock.mockImplementation(async (input: { to: string }) => {
      if (input.to === badEmail) throw new Error("simulated send crash")
      return "ok"
    })

    const results = await runDailyDigest(NOW, { groupIds: [group.id] })

    expect(results).toEqual([
      { groupId: group.id, status: "processed", considered: 3, sent: 1, skipped: 2 },
    ])

    const goodMembership = await prisma.membership.findFirstOrThrow({
      where: { groupId: group.id, userId: goodMember.id },
    })
    expect(goodMembership.lastDigestSentAt?.toISOString()).toBe(NOW.toISOString())

    const badMembership = await prisma.membership.findFirstOrThrow({
      where: { groupId: group.id, userId: badMember.id },
    })
    expect(badMembership.lastDigestSentAt).toBeNull()
  })
})
