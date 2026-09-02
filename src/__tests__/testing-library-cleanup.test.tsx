// @vitest-environment jsdom
//
// Guards the fix for the two intermittent component-test failures registered in
// CLAUDE.md on 1 Sept 2026 (OrbitNoteScreen and UnsubscribeForm, one of them
// failing with "window is not defined" from React's scheduler).
//
// The cause was not a race between files. Testing Library ships its own
// automatic cleanup, but the block that registers it
// (node_modules/@testing-library/react/dist/index.js, `if (typeof afterEach ===
// 'function')`) only fires when the test runner has put `afterEach` on the
// global object. This repo runs vitest with `globals` off, deliberately: every
// test file imports describe/it/expect from "vitest" by name. So that check was
// always false, auto-cleanup never registered, and each `render()` left its
// tree mounted for the rest of the run.
//
// A mounted React root can still hold work in the scheduler, and React's
// scheduler prefers node's `setImmediate` when it exists
// (node_modules/scheduler/cjs/scheduler.development.js:211), which is why the
// failure surfaced as `performWorkUntilDeadline` inside `processImmediate`:
// the callback ran after the file's jsdom environment had already been torn
// down, so React DOM read a `window` that no longer existed.
//
// vitest.setup.ts now registers cleanup explicitly. This test is what proves
// it stays registered: it fails on the first assertion below if the setup file
// is removed, renamed, or dropped from `setupFiles`.
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"

describe("Testing Library cleanup runs between tests", () => {
  it("mounts a tree", () => {
    render(<p data-cleanup-probe="">mounted</p>)
    expect(document.querySelectorAll("[data-cleanup-probe]")).toHaveLength(1)
  })

  it("does not see the previous test's tree", () => {
    // Without the setup file this reads 1: the tree above is still in the
    // document, and every later render in the run piles up behind it.
    //
    // These two cases are deliberately interdependent: the second is a
    // statement about what the first left behind, so running it alone passes
    // for no reason, and the pair would stop guarding anything under
    // sequence.shuffle. Neither is configured here.
    expect(document.querySelectorAll("[data-cleanup-probe]")).toHaveLength(0)
  })
})

// The pair above holds the unmount. It cannot hold the drain, and the
// difference matters enough to say out loud rather than let the file imply
// otherwise: deleting the act()/setImmediate lines from vitest.setup.ts leaves
// every test in this repo green, including the two above, because an empty
// document proves cleanup() ran and proves nothing about what React still had
// queued. The drain is the half that addresses the actual reported failure
// ("window is not defined" from the scheduler), so it is the half most worth
// protecting and the only one with no behavioural test available.
//
// It has none because the assertion is a negative over an event that is
// intermittent by nature: a probe that queues its own setImmediate and checks
// it fired would go green whenever the runner happened to turn the event loop
// between tests, which is most of the time, and a guard that passes for the
// wrong reason is worse than no guard.
//
// So this is a structural guard and is labelled one. It reads the two files
// and asserts the wiring is still there, which catches the realistic failure
// (somebody tidies away lines whose purpose is invisible) even though it
// cannot catch a drain that is present and broken. Precedent for reading repo
// files from a test: src/app/__tests__/no-email-address-on-screen.test.tsx.
describe("the setup file still does both halves", () => {
  const root = process.cwd()
  const setup = readFileSync(join(root, "vitest.setup.ts"), "utf8")

  it("is wired into vitest's config", () => {
    const config = readFileSync(join(root, "vitest.config.ts"), "utf8")
    expect(config).toContain('setupFiles: ["./vitest.setup.ts"]')
  })

  it("unmounts what a test rendered", () => {
    expect(setup).toMatch(/\bcleanup\(\)/)
  })

  it("drains React's scheduler afterwards, inside act", () => {
    // The captured reference rather than a bare global: a test running fake
    // timers replaces globalThis.setImmediate, and the drain needs the real
    // one, which is what React's scheduler captured too.
    expect(setup).toMatch(/act\(async/)
    expect(setup).toMatch(/realSetImmediate\(/)
  })
})
