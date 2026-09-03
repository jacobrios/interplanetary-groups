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
