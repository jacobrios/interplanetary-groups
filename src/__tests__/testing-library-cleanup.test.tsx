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
    expect(document.querySelectorAll("[data-cleanup-probe]")).toHaveLength(0)
  })
})
