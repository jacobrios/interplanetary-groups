// @vitest-environment jsdom
//
// THE GUARD FOR: "Emails are never displayed anywhere in the UI, even after
// capture. Member lists are names only." (CLAUDE.md, data model rules.)
//
// WHY THE RULE EXISTS, because this is what decides whether a future change is
// a fix or a break: the email is given to Orbit, not to the group. A member
// hands it over to get reminders and to get back in from another device.
// Displaying it repurposes it into something they never agreed to. Until this
// slice the rule was free, because the product held no addresses. It holds
// them now, so the rule needs a guard.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE ONE LEGITIMATE ADDRESS ON SCREEN. Read this before "fixing" anything.
// ─────────────────────────────────────────────────────────────────────────────
// There is exactly one place an address appears, and it is not a break in the
// rule: the address the member JUST TYPED INTO THIS BROWSER, echoed straight
// back to them so they know which inbox to open ("A code was sent to
// jesse@example.com"). That string is their own keystrokes. It is never
// fetched, never read back from storage, and never seen by anyone else.
//
// Forbidden is the other thing entirely: an address READ BACK FROM STORAGE and
// rendered. That is what the rule is about, and it is what every assertion
// below is aimed at.
//
// The distinction is not decoration. The "legitimate echo" test in this file
// is a POSITIVE CONTROL: it renders the echo on purpose and proves the address
// detector fires on it. Delete that test and the negative assertions around it
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
//   LAYER 2 (storage). The reason no page CAN hand one down: the address is
//   never read back out of the database, anywhere in the product, and the User
//   row the pages do fetch whole has no address on it. Those two facts are
//   asserted against the real source and the real schema, so widening either
//   one reddens this file.
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
 * read aloud. Input values are collected separately because React sets the DOM
 * property on a controlled input without reflecting it into the attribute, so
 * innerHTML alone would miss a prefilled field, which is precisely the shape a
 * "helpfully remember their address" change would take.
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
        viewerIsFounder: false,
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

  it("group info's email row: not while collapsed, and not to the address's own owner", () => {
    // hasVerifiedEmail true is the case the rule is really about. This member
    // HAS an address on file. The row still says only that reminders are on.
    const { container } = render(<EmailStatusRow hasVerifiedEmail={true} />)
    expect(addressesOnScreen(container)).toEqual([])
  })

  it("group info's email row expanded, before anything is typed", () => {
    // Expanding is where a "prefill what we already have" change would land,
    // and it is why the detector reads input values and not just text.
    const { container } = render(<EmailStatusRow hasVerifiedEmail={true} />)
    fireEvent.click(screen.getByRole("button", { name: "Change email" }))
    expect(addressesOnScreen(container)).toEqual([])
  })
})

// ─── The positive control ────────────────────────────────────────────────────

describe("the one legitimate address, which is what proves the detector works", () => {
  it("echoes back the address just typed into this browser, and the detector sees it", async () => {
    const { container } = render(<EmailStatusRow hasVerifiedEmail={false} />)
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
    const { container } = render(<EmailStatusRow hasVerifiedEmail={false} />)
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

// ─── Layer 2: no page can hand an address to a component ─────────────────────
//
// The render layer above uses our own fixtures, so it cannot see an address a
// server page fetched and passed down. These two assertions are why no page
// can: there is nothing to fetch.

const SRC = path.resolve(__dirname, "../..")
const REPO = path.resolve(__dirname, "../../..")

function read(relative: string): string {
  return readFileSync(path.join(REPO, relative), "utf8")
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

describe("the address is never read back out of storage", () => {
  it("has exactly one read of ContactMethod in the whole product, and it selects only the id", () => {
    // The whole rule rests on this. An address that is never read back cannot
    // be passed to a component, cannot be logged, and cannot be rendered by a
    // server page this repo has no way to test. A second read site is not
    // automatically a leak, but it is the moment somebody has to think about
    // it again, so it reddens here and gets a decision rather than a default.
    const files = readAllSourceFiles()
    const readOps = /\b(?:prisma|tx)\.contactMethod\.(findFirst|findUnique|findUniqueOrThrow|findFirstOrThrow|findMany|count|aggregate|groupBy)\s*\(/g

    const sites: string[] = []
    for (const [relative, source] of files) {
      for (const match of source.matchAll(readOps)) sites.push(`${relative}:${match[1]}`)
    }
    expect(sites).toEqual(["src/lib/auth/email-ask.ts:findFirst"])

    const source = read("src/lib/auth/email-ask.ts")
    const call = braceBlockAfter(source, source.indexOf("prisma.contactMethod.findFirst("))
    // Narrowed to the id on purpose: hasVerifiedEmail returns a boolean, so
    // the only thing that ever crosses out of this query is "yes" or "no".
    expect(call).toMatch(/select:\s*\{\s*id:\s*true\s*,?\s*\}/)
    expect(call).not.toMatch(/value/)
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
    const schema = read("prisma/schema.prisma")
    const user = braceBlockAfter(schema, schema.indexOf("model User"))
    const emailNamedFields = Array.from(user.matchAll(/^\s*(\w*[eE]mail\w*)\s+\S/gm)).map(
      (m) => m[1]
    )
    expect(emailNamedFields.sort()).toEqual(["emailAskCount", "emailAskedAt"])
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
