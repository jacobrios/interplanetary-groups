// vitest.setup.ts
//
// Runs before every test file. It closes one gap, in two moves, for the jsdom
// half of the suite: unmount what a test rendered, then let React finish what
// that unmount left in flight.
//
// WHY THIS FILE EXISTS AT ALL
//
// Testing Library ships automatic cleanup and registers it itself, but only
// when the runner has put `afterEach` on the global object
// (node_modules/@testing-library/react/dist/index.js: `if (typeof afterEach ===
// 'function')`). This repo runs vitest with `globals` off, deliberately: all
// 139 test files import describe/it/expect from "vitest" by name. So that check
// has always been false, auto-cleanup has never once run, and every render()
// left its tree mounted for the rest of its file. Most component files here
// call cleanup() by hand, which is how the gap stayed invisible; five did not.
//
// Setting `globals: true` is Testing Library's own documented answer and would
// be one line, but it makes describe/it/expect ambient across a suite that
// imports them on purpose. Registering the hook here does the same job without
// changing what any test file can see.
//
// WHY THE FLUSH, WHICH IS THE HALF cleanup() ALONE DOES NOT COVER
//
// React answers a commit carrying passive effects by queueing a deferred flush
// through its scheduler, and that scheduler prefers Node's setImmediate when it
// exists (node_modules/scheduler/cjs/scheduler.development.js:211). The
// callback reads `window`. If vitest disposes the jsdom environment before it
// runs, the run reddens with "ReferenceError: window is not defined" inside
// performWorkUntilDeadline, blamed on whichever file happened to be running
// rather than the one that queued it. Draining the queue inside act() leaves
// nothing pending at teardown.
//
// That diagnosis is not new here: SeenMarker.test.tsx and UnsubscribeForm.test.tsx
// each hand-rolled this drain and both said in as many words that a global
// flush in a vitest setup file was the real fix. This is that file. Their local
// copies are harmless and were left alone.
//
// setImmediate is captured now, at setup time, rather than read when the hook
// runs: a test that installs fake timers replaces the global, and the drain
// needs the real one, since React's scheduler captured the real one too.
//
// ORDERING AND COST
//
// Registered before any hook a test file declares, so it runs after them:
// vitest unwinds afterEach hooks in reverse registration order. A file that
// restores real timers or unmounts by hand still does so first, and cleanup()
// is idempotent, so a file already calling it keeps working.
//
// The dynamic import is what lets this run in front of the whole suite rather
// than the jsdom part of it. Most files here use the node environment and talk
// to Prisma; a top-level import would make every one of them load react-dom for
// nothing. `document` is the honest test for "this file got a DOM", since the
// environment is chosen per file by a `@vitest-environment jsdom` docblock
// rather than by config.
import { afterEach } from "vitest"

const realSetImmediate = globalThis.setImmediate

afterEach(async () => {
  if (typeof document === "undefined") return
  const { act, cleanup } = await import("@testing-library/react")
  cleanup()
  await act(async () => {
    await new Promise((resolve) => realSetImmediate(resolve))
  })
})
