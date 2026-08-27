// @vitest-environment jsdom
//
// THE GUARD FOR: "An email is never shown to the group or to any other member;
// it is always shown to its owner, on the group info page, and nowhere else.
// Member lists are names only." (CLAUDE.md, data model rules, amended
// 27 August 2026.)
//
// WHY THE RULE EXISTS, because this is what decides whether a future change is
// a fix or a break: the email is given to Orbit, not to the group. A member
// hands it over to get reminders and to get back in from another device.
// Displaying it to the group repurposes it into something they never agreed
// to. Until this slice the rule was free, because the product held no
// addresses. It holds them now, so the rule needs a guard.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE TWO LEGITIMATE ADDRESSES ON SCREEN. Read this before "fixing" anything.
// ─────────────────────────────────────────────────────────────────────────────
// THE ECHO. The address the member JUST TYPED INTO THIS BROWSER, handed
// straight back to them so they know which inbox to open ("A code was sent to
// jesse@example.com"). That string is their own keystrokes. It is never
// fetched, never read back from storage, and never seen by anyone else.
//
// THE OWNER'S OWN ROW, added 27 August 2026 and the reason the rule moved.
// The group info page shows the viewer the address the product holds for
// THEM, read back from storage, on the one row that also offers to change it.
// The old wording forbade this, and following it literally is what shipped a
// "Change email" control with nothing on screen saying which address was
// being changed. The rule's stated reasoning is about THE GROUP seeing an
// address; a row only its owner can see is not that. So the rule narrowed,
// and this file narrowed with it rather than being deleted.
//
// Forbidden is everything else, and the shape of "everything else" is the
// point: an address read back from storage and shown to ANYBODY BUT ITS
// OWNER, on any surface, by any route. Concretely, and these are what the
// assertions below are aimed at:
//
//   - an address on the group home, the feed, event detail, the roster, or
//     the sheet, for anyone at all;
//   - an address fetched for a member OTHER than the viewer, which is the
//     shape a leak would take on the info page specifically, because that
//     page renders a member list and already holds every member's user row.
//
// That second one is the property this file protects most carefully, because
// it is the one that keeps the rule's original reasoning true. The address is
// fetched by a function that takes one user id, it is called in exactly one
// place, and it is called there with the VIEWER's id. All three are asserted
// against the real source in layer 2.
//
// The distinction is not decoration. Both legitimate cases are POSITIVE
// CONTROLS in this file: they render an address on purpose and prove the
// detector fires on it. Delete either and the negative assertions around them
// stop meaning anything, because a detector that finds nothing anywhere is
// indistinguishable from a detector that is broken.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THIS FILE CAN AND CANNOT REACH, stated because the gap is real.
// ─────────────────────────────────────────────────────────────────────────────
// The brief names five surfaces: the group home, group info, event detail, the
// roster, and the feed. Four of the five are server components that talk to the
// database, and this repo can test a component but cannot render a
// server-rendered screen. So the guard is built in two independent layers, and
// neither one alone would be honest:
//
//   LAYER 1 (render). Every client component those surfaces are built out of
//   that can be rendered here, rendered, with the whole DOM scanned for an
//   address-shaped string. This catches an address printed into a component.
//   It cannot catch an address a server page fetched and handed down, because
//   the fixtures here are ours, not the page's.
//
//   LAYER 2 (storage). The reason no page CAN hand one down. It used to rest
//   on "the address is never read back out of the database, anywhere." That
//   is no longer true, and narrowing it rather than deleting it is the whole
//   job of this layer now. It rests on four facts instead, each asserted
//   against the real source and the real schema:
//
//     1. There are exactly TWO ContactMethod reads in the product, both in
//        src/lib/auth/email-ask.ts. One selects only the row id and can
//        therefore return a boolean and nothing else. Only the other can see
//        an address.
//     2. The one that can see an address takes a single user id and scopes
//        its query to it, so it cannot be handed a roster.
//     3. It has exactly one call site in the whole product, the group info
//        page, and the argument there is the viewer's own id, taken from the
//        session. Any second call site reddens this file and gets a decision
//        rather than a default.
//     4. The User row the pages fetch whole still has no address column, so
//        `include: { user: true }` still cannot carry one, and the
//        contactMethods relation is still pulled nowhere.
//
// What remains protected only structurally, with no test on it. Named here
// rather than left for a reader to work out, because a guard trusted past what
// it reaches is worse than no guard:
//
//   - The JSX of the three server pages themselves. Nothing in this file
//     renders them. Layer 2 is what makes that acceptable, because a page
//     cannot print what it cannot obtain, but it is a structural argument
//     rather than a rendered screen.
//
//   - THE ROSTER, which is one of the five surfaces the brief names. Nothing
//     here renders it: RosterSection is defined inside the event-detail server
//     page (src/app/events/[id]/page.tsx), so it cannot be imported and
//     rendered on its own. What holds it up instead is the shape of the data
//     it is built from, src/lib/events/roster.ts, whose RosterMember is
//     { id, name } and nothing else, plus layer 2. Structural, not rendered.
//
//   - The two card-region and event-detail tests below reach less than their
//     names suggest. EventCard, IdeaCard and RsvpControls are handed only ids,
//     enums, dates and pre-composed strings; no prop on any of them can carry
//     a user object, so an address cannot arrive through them by the route a
//     real leak would take. They can only redden on an address hardcoded
//     inside the component. They are kept as cheap breadth, and as the tripwire
//     for the day one of them grows a prop that does carry a person.
//
// Deliberately out of scope: an address a member types into the group chat as
// a message. That is their own words in a shared feed, not the product
// repurposing something it was given in confidence, and the rule is not about
// it. If a fixture in this file ever puts an address in a message body, that
// is a broken fixture, not a caught bug.

import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, fireEvent, screen } from "@testing-library/react"
import { MessageAuthor } from "@prisma/client"
import GroupHome from "../groups/[id]/GroupHome"
import EventCard from "../groups/[id]/EventCard"
import IdeaCard from "../groups/[id]/IdeaCard"
import MessageFeed from "../groups/[id]/MessageFeed"
import EmailStatusRow from "../groups/[id]/info/EmailStatusRow"
import RsvpControls from "@/components/RsvpControls"
import type { IdeaItem } from "@/lib/pending/derive"
import type { AttachRequestResult, ConfirmAttachResult } from "@/lib/auth/email"

// Every server action any of these trees reaches. Mocked so the render is a
// render and nothing here touches the database.
vi.mock("@/app/actions/send-message", () => ({ sendMessageAction: vi.fn(async () => ({})) }))
vi.mock("@/app/actions/detect-intent", () => ({ detectIntentAction: vi.fn(async () => null) }))
vi.mock("@/app/actions/rsvp", () => ({ rsvpAction: vi.fn(async () => ({})) }))
vi.mock("@/app/actions/gauge-vote", () => ({ gaugeVoteAction: vi.fn(async () => ({})) }))
vi.mock("@/app/actions/proposal-vote", () => ({ proposalVoteAction: vi.fn(async () => ({})) }))
vi.mock("@/app/actions/email-ask", () => ({
  dismissEmailOfferAction: vi.fn(async () => ({ ok: true })),
  requestEmailAttachAction: vi.fn(
    async (): Promise<{ result: AttachRequestResult }> => ({ result: "ok" })
  ),
  confirmEmailAttachAction: vi.fn(
    async (): Promise<{ result: ConfirmAttachResult }> => ({ result: "ok" })
  ),
}))

afterEach(cleanup)

// ─── The detector ────────────────────────────────────────────────────────────

const ADDRESS_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

/**
 * The one address-shaped string the detector ignores, and only this exact one.
 *
 * It is the example placeholder sitting in an EMPTY email field on the three
 * screens that ask for one (EmailAttachFlow, SignInPanel, JoinSignIn). It is
 * static copy, it is nobody's address, and it is literally what "no address
 * here" looks like. Found by this guard on its first run, which is a small
 * piece of evidence that the detector works.
 *
 * Excluded as an exact literal rather than by loosening the pattern, on
 * purpose: every other address-shaped string on screen is still caught,
 * including any other example address somebody adds later, which is the point
 * at which they should have to come back and think about it here.
 */
const PLACEHOLDER_EXAMPLE = "you@example.com"

/**
 * Every address-shaped string anywhere in a rendered tree.
 *
 * innerHTML rather than textContent because an address can hide in an
 * attribute (a title, an aria-label, a mailto href) and still be on screen or
 * read aloud.
 *
 * ~~Input values are collected separately because React sets the DOM property
 * on a controlled input without reflecting it into the attribute, so innerHTML
 * alone would miss a prefilled field, which is precisely the shape a
 * "helpfully remember their address" change would take.~~
 *
 * WRONG, struck 27 Aug 2026, and the correction matters more than the original
 * claim did. React DOES reflect a controlled input's value into the serialized
 * markup, so for a React-rendered field THE TWO ARMS AGREE: innerHTML alone
 * already catches a prefilled address, and the field-value arm is redundant
 * there rather than load-bearing. Do not cite this helper as proof that a
 * prefilled field needs the second arm to be caught; it does not.
 *
 * What the field-value arm is actually for, which is narrower: the one case
 * where the arms genuinely disagree, a value set as a DOM property with no
 * corresponding attribute. That never reaches the markup, and it is the shape
 * a value set through a ref, or by a future React, would take. The test named
 * "finds a field value that never reaches the markup" builds exactly that case
 * and asserts both halves, so the relationship is evidence in this file rather
 * than a claim in this comment. The test named "also sees an address sitting
 * in the field itself" is where the strike above was discovered, by asserting
 * the false version and watching it go red.
 *
 * Referenced by name and never by number: the tests here are not numbered, and
 * an ordinal in a comment goes silently wrong the first time somebody inserts
 * a case above it. That already happened once while writing this correction.
 */
function addressesOnScreen(container: HTMLElement): string[] {
  const fieldValues = Array.from(container.querySelectorAll("input, textarea"))
    .map((el) => (el as HTMLInputElement | HTMLTextAreaElement).value)
    .join(" ")
  const found = `${container.innerHTML} ${fieldValues}`.match(ADDRESS_PATTERN) ?? []
  return found.filter((address) => address !== PLACEHOLDER_EXAMPLE)
}

// ─── Fixtures ────────────────────────────────────────────────────────────────
//
// Shaped as the server pages hand them over. No fixture holds an address: the
// point is that nothing on these surfaces has one to print, so any address the
// detector finds arrived from the component's own code.

const MESSAGES = [
  {
    id: "m1",
    authorType: MessageAuthor.MEMBER,
    authorId: "u1",
    authorName: "Jesse",
    body: "anyone up for beers thursday",
    createdAt: new Date("2026-08-26T18:00:00Z"),
  },
  {
    // A message from SOMEBODY ELSE, and the fixture list is wrong without it.
    // The feed draws the viewer's own messages without a name label, so a list
    // holding only the viewer's own never renders the branch that prints a
    // member's identity, which is the branch an address would ride in on. The
    // first red run of this file passed with an address printed right next to
    // that label, and this is the fixture that closed it.
    id: "m1b",
    authorType: MessageAuthor.MEMBER,
    authorId: "u2",
    authorName: "Sam",
    body: "in for that",
    createdAt: new Date("2026-08-26T18:00:30Z"),
  },
  {
    id: "m2",
    authorType: MessageAuthor.ORBIT,
    authorId: null,
    authorName: null,
    body: "Love it. Beers this Thursday? If three are in, I'll set it up.",
    createdAt: new Date("2026-08-26T18:01:00Z"),
  },
  {
    id: "m3",
    authorType: MessageAuthor.SYSTEM,
    authorId: null,
    authorName: null,
    body: "Sam joined",
    createdAt: new Date("2026-08-26T18:02:00Z"),
  },
]

const EVENT = {
  id: "e1",
  title: "Climbing",
  startsAt: new Date("2026-08-27T19:00:00-06:00"),
  endsAt: null,
  venues: [{ displayLabel: "Movement", name: "Movement Baker" }],
}

const IDEA: IdeaItem = {
  key: "g1",
  title: "Beers",
  whenLine: "Thu 7pm",
  sortMs: 0,
  chips: {
    id: "g1",
    orbitMessageId: "m2",
    tallyLine: "2 in · one more makes it happen",
    labels: { in: "I'm in", out: "Next time", notThatDay: "Yes, can't Thu" },
    viewerAnswer: null,
  },
}

/** The group home's whole client tree, with Orbit's email ask showing. */
function renderGroupHome() {
  // jsdom has no scrollIntoView; the feed calls it on mount.
  Element.prototype.scrollIntoView = vi.fn()
  return render(
    <GroupHome
      groupId="g1"
      initialMessages={MESSAGES}
      viewerId="u1"
      viewerName="Jesse"
      timeZone="America/Denver"
      gauges={[]}
      proposals={[]}
      groupProposals={[]}
      viewerIsMember
      // hasVerifiedEmail MUST be false here, and the reason is the whole point
      // of this fixture rather than a detail. shouldOfferEmail's first line is
      // `if (hasVerifiedEmail) return null`, and EmailAskNote returns null on a
      // null offer. GroupHome's guard is `{emailAsk && <EmailAskNote .../>}`,
      // which tests the OBJECT, not the offer, so a truthy object with
      // hasVerifiedEmail true mounts the component and renders nothing at all.
      // This fixture shipped that way in the first round: the file claimed the
      // email-aware component was under the detector while the detector was
      // scanning an empty div. False here, with a contribution yesterday and no
      // asks yet, is what makes shouldOfferEmail return "first" and put Orbit's
      // ask on the screen where it can actually be scanned.
      emailAsk={{
        groupName: "Climbing Crew",
        // viewerIsFounder was removed from this fixture on 27 Aug 2026 because
        // the prop itself is gone: the founder's extra sentence was deleted and
        // nothing else on this path needed to know. Not a weakening of the
        // guard, and nothing else in this file changed: the detector, the
        // positive controls and every assertion are untouched, and the ask
        // still renders under them (the "Not now" check below proves it).
        askState: { emailAskCount: 0, emailAskedAt: null },
        latestContributionAt: new Date("2026-08-25T18:00:00Z"),
        hasVerifiedEmail: false,
        now: new Date("2026-08-26T18:00:00Z"),
      }}
    />
  )
}

// ─── Layer 1: nothing rendered prints an address ─────────────────────────────

describe("no address reaches a rendered surface", () => {
  it("the group home: the feed, Orbit's email ask, and the composer", () => {
    const { container } = renderGroupHome()
    // Proof that the thing this test names is actually on the screen, and not
    // a boolean away from being an empty div. Without this line the assertion
    // below passes just as happily over a mounted-but-silent EmailAskNote,
    // which is exactly how the first round of this file shipped.
    // Matched on the dismiss control rather than on the ask's copy, on
    // purpose. A copy match would itself break the moment somebody edits the
    // sentence, including by printing an address into it, and would then fire
    // FIRST and hide the very assertion below that is supposed to catch that.
    // The button is structural: it exists whenever the ask rendered at all,
    // and it survives any change to what the ask says.
    expect(screen.getByRole("button", { name: "Not now" })).toBeDefined()
    expect(addressesOnScreen(container)).toEqual([])
  })

  it("the feed on its own, across all three author voices", () => {
    Element.prototype.scrollIntoView = vi.fn()
    const { container } = render(
      <MessageFeed messages={MESSAGES} viewerId="u1" timeZone="America/Denver" />
    )
    expect(addressesOnScreen(container)).toEqual([])
  })

  it("the card region: a confirmed plan and an idea", () => {
    const { container } = render(
      <>
        <EventCard
          event={EVENT}
          groupId="g1"
          timeZone="America/Denver"
          inCount={3}
          outCount={1}
          pendingCount={5}
          viewerStatus={null}
          viewerHasSession
        />
        <IdeaCard item={IDEA} />
      </>
    )
    expect(addressesOnScreen(container)).toEqual([])
  })

  it("event detail's RSVP pair, answered and unanswered", () => {
    const { container } = render(
      <>
        <RsvpControls eventId="e1" currentStatus={null} groupId="g1" />
        <RsvpControls eventId="e1" currentStatus="IN" groupId="g1" />
      </>
    )
    expect(addressesOnScreen(container)).toEqual([])
  })

  it("group info's email row, for a member with no address on file", () => {
    // Nothing to show and nothing to leak. Kept because it is the state every
    // member is in until they attach one, so it is the row most people see.
    const { container } = render(<EmailStatusRow emailAddress={null} />)
    expect(addressesOnScreen(container)).toEqual([])
  })

  it("group info's email row expanded, before anything is typed", () => {
    // The address deliberately leaves the screen while the flow is open: the
    // collapsed row is replaced by the box, and nothing prefills the field.
    // This is where a "helpfully remember their address" change would land,
    // and it is why the detector reads input values and not just text. It
    // still asserts an empty screen even though the row above now prints an
    // address, which is what makes it a real assertion here rather than a
    // restatement of the collapsed case.
    const { container } = render(<EmailStatusRow emailAddress="jesse@example.com" />)
    fireEvent.click(screen.getByRole("button", { name: "Change email" }))
    expect(addressesOnScreen(container)).toEqual([])
  })
})

// ─── The positive control ────────────────────────────────────────────────────

describe("the two legitimate addresses, which are what prove the detector works", () => {
  it("shows the viewer their OWN stored address on the group info row, and the detector sees it", () => {
    // THE ONE SURFACE. Read back from storage and rendered, which the old
    // rule forbade outright, and it is deliberate: this row offers to change
    // the address, and a member holding more than one address cannot answer
    // "change it from what?" without seeing it. Only its owner ever renders
    // this row, because the page fetches it for the viewer alone (layer 2).
    //
    // Its second job here is to be a positive control on the allowed
    // surface. Every empty array above would also be produced by a detector
    // that never matches; this one is an address that IS on screen, printed
    // by product code rather than typed by a fixture.
    const { container } = render(<EmailStatusRow emailAddress="jesse@example.com" />)
    expect(addressesOnScreen(container)).toEqual(["jesse@example.com"])
  })

  it("echoes back the address just typed into this browser, and the detector sees it", async () => {
    const { container } = render(<EmailStatusRow emailAddress={null} />)
    fireEvent.click(screen.getByRole("button", { name: "Add your email" }))
    fireEvent.change(screen.getByLabelText("Your email address"), {
      target: { value: "jesse@example.com" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await screen.findByLabelText("The code from your email")

    // NOT a leak, and not a test to "fix". These are the member's own
    // keystrokes handed straight back so they know which inbox to open.
    // Nothing was fetched and nobody else can see this screen.
    //
    // Its job here is to prove the assertions above could have failed: an
    // address that IS on screen is found. Without this, every empty array
    // above would also be produced by a detector that never matches anything.
    expect(addressesOnScreen(container)).toContain("jesse@example.com")
  })

  it("also sees an address sitting in the field itself, which is the detector's other arm", () => {
    const { container } = render(<EmailStatusRow emailAddress={null} />)
    fireEvent.click(screen.getByRole("button", { name: "Add your email" }))
    fireEvent.change(screen.getByLabelText("Your email address"), {
      target: { value: "jesse@example.com" },
    })

    // Asserted BEFORE the request is sent, and that is the whole reason this
    // test exists separately from the one above. EmailAttachFlow's input
    // carries key={step}, so the moment the flow reaches the code step the
    // email field is remounted holding the empty code. The address the other
    // control finds is therefore the rendered "A code was sent to ..."
    // sentence, which is markup, which means it exercises only the innerHTML
    // arm. Only here, with the typed address still standing in the field, is
    // the field-value arm the thing under test.
    expect(addressesOnScreen(container)).toContain("jesse@example.com")

    // A finding worth recording rather than hiding, because it corrects what
    // this file used to assert about its own detector. React DOES write the
    // value into the markup for this controlled input, so for a React-rendered
    // field the innerHTML arm already catches it and the field-value arm is
    // redundant here, not load-bearing. The arm still earns its place: a value
    // set as a DOM property alone never reaches the markup, which is what the
    // next test covers, and that is the shape a value set through a ref or by
    // a future React would take.
    expect(container.innerHTML).toContain("jesse@example.com")
  })

  it("finds a field value that never reaches the markup, which is the arm the test above cannot isolate", () => {
    // Not a product render. This is a positive control for the INSTRUMENT: it
    // builds the one case where the two arms genuinely disagree, an input
    // holding a value as a DOM property with no value attribute, which is what
    // querySelectorAll plus .value exists to catch.
    //
    // The failure it exists to expose is the reviewer's: if querySelectorAll
    // were ever mis-scoped, or .value came back empty under jsdom, every
    // negative assertion in layer 1 would keep passing and nothing anywhere
    // would say the arm had stopped working.
    const container = document.createElement("div")
    container.innerHTML = "<input>"
    const field = container.querySelector("input")!
    field.value = "jesse@example.com"

    // The attribute is genuinely absent, so the innerHTML arm is blind here
    // and cannot be what satisfies the assertion below.
    expect(container.innerHTML).not.toContain("jesse@example.com")
    expect(addressesOnScreen(container)).toContain("jesse@example.com")
  })
})

// ─── Layer 2: only one page can obtain an address, only for the viewer ───────
//
// The render layer above uses our own fixtures, so it cannot see an address a
// server page fetched and passed down. These assertions are why no page except
// the group info page can obtain one at all, and why the one that can obtains
// it for the viewing member and nobody else.

const SRC = path.resolve(__dirname, "../..")
const REPO = path.resolve(__dirname, "../../..")

function read(relative: string): string {
  return readFileSync(path.join(REPO, relative), "utf8")
}

/**
 * How many times a bare identifier appears in real code, comments excluded.
 *
 * Comments are stripped because the count is pinned exactly, and this file and
 * the seam it watches both discuss these functions in prose. Without the
 * strip, writing a sentence about the guard would break the guard, which is
 * the kind of test nobody keeps. Only whole-line and block comments are
 * removed, never mid-line content, so a trailing comment after real code still
 * counts: that direction fails loud, which is the safe way to be wrong here.
 */
function countIdentifier(source: string, identifier: string): number {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join("\n")
  return (code.match(new RegExp(`\\b${identifier}\\b`, "g")) ?? []).length
}

/** The body of the first balanced brace group after `openerIndex`. */
function braceBlockAfter(source: string, openerIndex: number): string {
  const start = source.indexOf("{", openerIndex)
  let depth = 0
  for (let i = start; i < source.length; i++) {
    if (source[i] === "{") depth++
    else if (source[i] === "}") {
      depth--
      if (depth === 0) return source.slice(start, i + 1)
    }
  }
  throw new Error("unbalanced braces")
}

const EMAIL_ASK = "src/lib/auth/email-ask.ts"
const INFO_PAGE = "src/app/groups/[id]/info/page.tsx"

/** The `findFirst` call block belonging to the named exported function. */
function contactMethodQueryIn(source: string, functionName: string): string {
  const fn = source.indexOf(`export async function ${functionName}(`)
  expect(fn).toBeGreaterThan(-1)
  const call = source.indexOf("prisma.contactMethod.findFirst(", fn)
  expect(call).toBeGreaterThan(-1)
  return braceBlockAfter(source, call)
}

describe("only one query can see an address, and only for one user at a time", () => {
  it("has exactly two reads of ContactMethod in the whole product, both in the auth seam", () => {
    // Most of the rule still rests on this. An address that is never read back
    // cannot be passed to a component, cannot be logged, and cannot be
    // rendered by a server page this repo has no way to test. There are now
    // two reads rather than one, because the group info page has to show a
    // member the address it is offering to change. A THIRD read site is not
    // automatically a leak, but it is the moment somebody has to think about
    // this again, so it reddens here and gets a decision rather than a
    // default.
    const files = readAllSourceFiles()
    const readOps = /\b(?:prisma|tx)\.contactMethod\.(findFirst|findUnique|findUniqueOrThrow|findFirstOrThrow|findMany|count|aggregate|groupBy)\s*\(/g

    const sites: string[] = []
    for (const [relative, source] of files) {
      for (const match of source.matchAll(readOps)) sites.push(`${relative}:${match[1]}`)
    }
    expect(sites).toEqual([`${EMAIL_ASK}:findFirst`, `${EMAIL_ASK}:findFirst`])

    // The scan above only sees Prisma's model methods, so raw SQL would walk
    // straight past it. There is none in the product today, which is what
    // makes the count above a complete statement rather than a partial one.
    // Latent when written (review, fix round 1); the day somebody adds raw SQL
    // this reddens and they have to widen the scan above rather than discover
    // later that it stopped covering everything.
    const raw = files
      .filter(([, source]) => /\$(?:query|execute)Raw(?:Unsafe)?\b/.test(source))
      .map(([relative]) => relative)
    expect(raw).toEqual([])
  })

  it("keeps the boolean read blind to the address, so the group home cannot obtain one", () => {
    // hasVerifiedEmail feeds the group home's sheet, which must never see an
    // address. Narrowed to the id on purpose: the only thing that crosses out
    // of this query is "yes" or "no", so widening the select is the change
    // that would hand the group home something to leak.
    const call = contactMethodQueryIn(read(EMAIL_ASK), "hasVerifiedEmail")
    expect(call).toMatch(/select:\s*\{\s*id:\s*true\s*,?\s*\}/)
    expect(call).not.toMatch(/value/)
  })

  it("scopes the address read to one user id, so it can never be run over a roster", () => {
    // THE ASSERTION THIS WHOLE FILE TURNS ON, along with the call-site one
    // below. The info page renders a member list and already holds every
    // member's user row, so "fetch the address" and "fetch everyone's
    // addresses" are one careless edit apart. Two things stop that: the
    // function takes a single scalar user id, so there is no list to hand it,
    // and its where clause is scoped to that id.
    const source = read(EMAIL_ASK)
    expect(source).toMatch(
      /export async function verifiedEmailAddress\(\s*userId: string,?\s*\): Promise<string \| null>/
    )
    const call = contactMethodQueryIn(source, "verifiedEmailAddress")
    expect(call).toMatch(/where:\s*\{\s*userId\s*,/)
    expect(call).toMatch(/select:\s*\{\s*value:\s*true\s*,?\s*\}/)
    // No findMany dressed up as a scoped read, and no id list smuggled in.
    expect(call).not.toMatch(/userId:\s*\{/)
    expect(call).not.toMatch(/\bin:\s*/)
  })

  it("names the address read in exactly two places in the product, and counts every mention", () => {
    // THE ASSERTION THE WHOLE FILE TURNS ON, rewritten in fix round 1 after a
    // reviewer wrote two working mutations that printed EVERY member's address
    // next to their name in the WHO row while all five of this layer's
    // assertions stayed green. Recorded in full, because the lesson is about
    // what an assertion of this shape can be trusted to do:
    //
    //   MUT A, point-free. `memberships.map((m) => m.userId).map(
    //   verifiedEmailAddress)` puts no "(" after the identifier, so the old
    //   regex, which keyed off the call parenthesis to capture the argument,
    //   never saw a call at all.
    //
    //   MUT B, a wrapper in this same seam. The old scan skipped
    //   src/lib/auth/email-ask.ts on the reasoning that the definition lives
    //   there, so a looping helper added beside the definition was invisible
    //   and the page could then call it under any name it liked.
    //
    //   MUT C, a line break. `.` does not match a newline, so a formatter
    //   wrapping a long call was enough to hide it. Nobody has to be
    //   malicious for this one.
    //
    // The fix is to stop parsing calls and start COUNTING THE NAME. Every way
    // of reaching this function has to write the identifier down somewhere,
    // whether it is called, aliased, passed to map, or wrapped, so the count
    // per file is the thing that cannot be dodged. Two in the info page (the
    // import and the call), one in the seam (the declaration itself, which is
    // what makes an internal wrapper redden), none anywhere else.
    const mentions = readAllSourceFiles()
      .map(
        ([relative, source]) =>
          [relative, countIdentifier(source, "verifiedEmailAddress")] as const
      )
      .filter(([, count]) => count > 0)
    expect(Object.fromEntries(mentions)).toEqual({ [INFO_PAGE]: 2, [EMAIL_ASK]: 1 })
  })

  it("passes the viewer's own id at the one call site, across line breaks", () => {
    // The count above proves nothing else reaches the function. This proves
    // the one thing that does reaches it with the right argument, which is the
    // actual property the rule needs. Kept as a second assertion rather than
    // as the only one: it is the argument regex that the reviewer's mutations
    // walked past, so it is no longer the thing standing between the roster
    // and a leak.
    //
    // [\s\S] rather than `.` on purpose: `.` stops at a newline, and a
    // formatter wrapping this call was one of the three ways past the old
    // version of this test.
    const page = read(INFO_PAGE)
    const args = Array.from(page.matchAll(/verifiedEmailAddress\(([\s\S]*?)\)/g)).map((m) =>
      m[1].trim()
    )
    expect(args).toEqual(["viewer.id"])

    // `viewer` is the session's own user, not a loop variable that happens to
    // be named well. Without this line the assertion above would be satisfied
    // by a `viewer` rebound inside a members.map, which is precisely the leak.
    expect(page).toMatch(/const viewer = await getCurrentUser\(\)/)
    expect(page).not.toMatch(/\.map\([^)]*\bviewer\b/)
  })

  it("projects the member list down to a name and an id before anything renders it", () => {
    // The reviewer's mutations both ended in the same place: an address folded
    // into the roster the WHO row maps over. This is the assertion that closes
    // that landing site regardless of how the address got there, and it is
    // stronger than the prop check it replaced, which could only ever catch
    // the one prop name it knew about.
    //
    // The member list is the one structure on this page that carries every
    // member rather than the viewer, so what it is allowed to hold is the
    // whole question. Two keys, both harmless, asserted as a complete set so
    // a third is a failure whatever it is called.
    const page = read(INFO_PAGE)
    const projection = braceBlockAfter(page, page.indexOf("({", page.indexOf("].map(")))
    const keys = Array.from(projection.matchAll(/(\w+):/g)).map((m) => m[1])
    expect(keys).toEqual(["id", "name"])
  })

  it("hands the address to exactly one component prop, on the one allowed surface", () => {
    // Layer 1 proves the components do not print an address. This proves no
    // page hands one to a component that would. Narrower than it looks, and
    // that is now explicit: it pins THIS prop name, so on its own it would
    // miss an address passed under another name. It is the projection
    // assertion above and the mention count above that make it complete; this
    // one is here to say that the allowed prop is passed once, on one page.
    const propSites = readAllSourceFiles().flatMap(([relative, source]) =>
      Array.from(source.matchAll(/emailAddress=\{(.*?)\}/g)).map((m) => `${relative}:${m[1]}`)
    )
    expect(propSites).toEqual([`${INFO_PAGE}:viewerEmailAddress`])

    // And the fetched address goes nowhere else on that page: it is declared,
    // and it is handed to that one prop. Two mentions, no third.
    const page = read(INFO_PAGE)
    expect(page.match(/viewerEmailAddress/g)).toHaveLength(2)
  })

  it("never pulls the contactMethods relation onto a User a page has fetched", () => {
    // The three surface pages fetch memberships with `include: { user: true }`,
    // which is the whole User row. Prisma does not follow relations unless
    // asked, so the addresses hanging off that user do not come with it. This
    // is the assertion that keeps it that way.
    const offenders = readAllSourceFiles()
      .filter(([, source]) => /contactMethods\s*:\s*(?:true|\{)/.test(source))
      .map(([relative]) => relative)
    expect(offenders).toEqual([])
  })

  it("keeps the User row itself free of an address, which is what makes include: { user: true } safe", () => {
    // The pages fetch the User whole and hand it to components. That is only
    // safe while the User row holds no address. If an email column is ever
    // added here, every one of those pages starts carrying an address into
    // the render with no other change anywhere, and nothing else in this file
    // would catch it. The two ask-accounting fields are how many times Orbit
    // asked and when; neither holds an address.
    // Pinned as the COMPLETE field list rather than by name-matching on
    // "email" (review, fix round 1). The old version scanned for fields whose
    // names contained "email", which a column called `recoveryAddress` or
    // `contact` would have walked straight past, and a leak does not have to
    // be named after the thing it leaks. A new field of any kind reddens here
    // and gets a sentence about whether the three whole-User-row pages can
    // still carry it safely. emailAskCount and emailAskedAt are how many times
    // Orbit asked and when; neither holds an address.
    const schema = read("prisma/schema.prisma")
    const user = braceBlockAfter(schema, schema.indexOf("model User"))
    const fields = Array.from(user.matchAll(/^\s+(\w+)\s+\S/gm)).map((m) => m[1])
    expect(fields).toEqual([
      "id",
      "name",
      "supabaseAuthId",
      "emailAskCount",
      "emailAskedAt",
      "createdAt",
      "updatedAt",
      "contactMethods",
      "memberships",
      "rsvps",
      "foundedGroups",
      "messages",
      "gaugeVotes",
      "proposalVotes",
      "changeProposals",
      "suggestedGauges",
    ])
    // The relation itself is fine and has to exist; what matters is that it is
    // a relation, so it only arrives when a query asks for it.
    expect(user).toMatch(/contactMethods\s+ContactMethod\[\]/)
  })
})

/** Every non-test source file under src/, as [repo-relative path, contents]. */
function readAllSourceFiles(): Array<[string, string]> {
  const out: Array<[string, string]> = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry)
      if (statSync(full).isDirectory()) {
        if (entry !== "__tests__" && entry !== "node_modules") walk(full)
      } else if (/\.tsx?$/.test(entry)) {
        out.push([path.relative(REPO, full), readFileSync(full, "utf8")])
      }
    }
  }
  walk(SRC)
  return out
}
