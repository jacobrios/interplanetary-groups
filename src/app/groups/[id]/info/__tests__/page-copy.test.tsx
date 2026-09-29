// The group info page is a server component that reads the database, so
// this suite cannot render it and cannot assert what actually lands on
// screen from the DOM. Same instrument as
// src/app/events/[id]/__tests__/CancelControls.test.tsx's source-read
// tests for a server component: it is honest but weaker, proving the line
// is gone from the source rather than proving nobody sees it.
//
// Owner's phone QA, 3 Sept 2026: "Want to change something? Just tell
// Orbit in the chat." was untrue on this specific page, since the name,
// the members, the rhythms and the venue all get an honest decline from
// Orbit here, never a change.
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

describe("group info page, the false 'tell Orbit' line", () => {
  const source = readFileSync(
    join(process.cwd(), "src/app/groups/[id]/info/page.tsx"),
    "utf8"
  )

  it("no longer tells a member to ask Orbit to change something on this page", () => {
    expect(source).not.toContain("Want to change something? Just tell Orbit in the chat.")
  })
})

// Order of the page's sections, read from source for the same reason as above.
// A server component cannot be rendered here, so this holds the sequence the
// owner settled: invite link, email, ABOUT THE GROUP, the card, ON YOUR PHONE
// (with its link), then Leave and the footer. The phone heading is InstallHintLink's
// own eyebrow so it disappears with the link; a bare heading in the page would
// orphan itself on Android.
describe("group info page, section order", () => {
  const source = readFileSync(
    join(process.cwd(), "src/app/groups/[id]/info/page.tsx"),
    "utf8"
  )
  const at = (needle: string) => {
    const i = source.indexOf(needle)
    expect(i, needle).toBeGreaterThan(-1)
    return i
  }

  it("runs invite, email, about, card, phone, leave, footer", () => {
    const order = [
      at("<ShareInviteLink"),
      at("Email for sign-in and reminders"),
      at("About the group"),
      at("<EditGroupDetails"),
      at('<InstallHintLink eyebrow="On your phone"'),
      at("<LeaveGroupButton"),
      at("<LegalFooter"),
    ]
    expect([...order].sort((x, y) => x - y)).toEqual(order)
  })

  it("does not hand-write the phone heading outside the link component", () => {
    expect(source.match(/On your phone/g)).toHaveLength(1)
  })
})
