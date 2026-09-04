// src/lib/deploy/__tests__/should-reload.test.ts
//
// The decision itself, away from the browser. Every test names the one input
// it is changing against a baseline that WOULD reload, so a test that passes
// because some unrelated rule blocked it is not possible: the baseline is
// asserted to reload in the very first test below.

import { describe, it, expect } from "vitest"
import {
  decideReload,
  MAX_RELOADS_PER_TAB,
  type ReloadInputs,
} from "../should-reload"

// A tab that booted on an old build, sitting idle on a new one, with nothing
// spent. Every case below is this with exactly one field changed.
const READY: ReloadInputs = {
  bootedId: "dpl_old",
  currentId: "dpl_new",
  composerHasText: false,
  sendInFlight: false,
  modalOpen: false,
  focusInTextField: false,
  alreadyReloadedFor: null,
  reloadCount: 0,
}

describe("decideReload", () => {
  it("reloads when the live deployment differs and the member is idle", () => {
    expect(decideReload(READY)).toEqual({ reload: true, reason: "new-deployment" })
  })

  // Rule 1, both halves. The null cases are not hypothetical: currentId is
  // null on every local run and after every failed or malformed fetch, and
  // reading either of those as "a new deployment exists" would reload a
  // member's tab on a loop for a deployment that does not exist.
  it("does nothing when the live deployment id is unknown", () => {
    expect(decideReload({ ...READY, currentId: null })).toEqual({
      reload: false,
      reason: "detection-off",
    })
  })

  it("does nothing when this tab does not know which build rendered it", () => {
    expect(decideReload({ ...READY, bootedId: null })).toEqual({
      reload: false,
      reason: "detection-off",
    })
  })

  it("does nothing when the tab is already on the live deployment", () => {
    expect(decideReload({ ...READY, currentId: "dpl_old" })).toEqual({
      reload: false,
      reason: "same-deployment",
    })
  })

  // Rule 2. The draft itself survives a reload (GroupHome parks it in
  // sessionStorage), so what these two protect is the send in progress and
  // the member's train of thought. The open sheet and the keyboard, which an
  // earlier version of this comment credited to these two checks, belong to
  // modalOpen and focusInTextField below.
  it("waits while there is text in the composer", () => {
    expect(decideReload({ ...READY, composerHasText: true })).toEqual({
      reload: false,
      reason: "member-busy",
    })
  })

  it("waits while a send is still in flight", () => {
    expect(decideReload({ ...READY, sendInFlight: true })).toEqual({
      reload: false,
      reason: "member-busy",
    })
  })

  // Rule 2 is a WAIT and not a refusal: the member gets the fix the moment
  // they stop. Without this, "wait" could be implemented as "never again"
  // and every other test in this file would still pass.
  it("stops waiting the moment the composer is cleared", () => {
    const busy = { ...READY, composerHasText: true }
    expect(decideReload(busy).reload).toBe(false)
    expect(decideReload({ ...busy, composerHasText: false }).reload).toBe(true)
  })

  // ── Busy is the whole screen, not just the composer ──────────────────────
  //
  // The failure these two exist for, and it is realistic rather than
  // theoretical: a member opens the email sheet, submits their address,
  // switches to their mail app for the one-time code, and comes back. Coming
  // back is EXACTLY when this check fires (the focus listener). With busy
  // meaning "the chat composer has text", nothing here is busy, the tab
  // reloads, and the sheet, the step it was on and the typed address are all
  // gone — leaving a member with a code in their inbox and nowhere to type
  // it, in the sign-in flow an entire earlier slice was built for.
  it("waits while a modal is open over the screen", () => {
    expect(decideReload({ ...READY, modalOpen: true })).toEqual({
      reload: false,
      reason: "modal-open",
    })
  })

  it("waits while the member's cursor is sitting in a text field", () => {
    expect(decideReload({ ...READY, focusInTextField: true })).toEqual({
      reload: false,
      reason: "typing-elsewhere",
    })
  })

  // Both are WAITS, like rule 2 and unlike rules 3 and 4: closing the sheet
  // or tapping away releases the tab on the very next check. Without this,
  // either could be implemented as a permanent refusal and every other test
  // in this file would still pass.
  it("stops waiting the moment the modal closes and the field is left", () => {
    const busy = { ...READY, modalOpen: true, focusInTextField: true }
    expect(decideReload(busy).reload).toBe(false)
    expect(
      decideReload({ ...busy, modalOpen: false, focusInTextField: false }).reload
    ).toBe(true)
  })

  // ── Rule 3, the anti-loop guard ──────────────────────────────────────────
  // The one failure here that would be worse than the bug this slice fixes.
  // If a reload lands on a build that still reports a different id, nothing
  // in the browser stops this firing every minute for the life of the tab.
  it("never reloads twice for the same deployment id", () => {
    expect(decideReload({ ...READY, alreadyReloadedFor: "dpl_new" })).toEqual({
      reload: false,
      reason: "already-reloaded",
    })
  })

  // The other half of the same guard, and the reason the test above cannot
  // pass for the wrong reason: it is specifically the CURRENT id being
  // matched that blocks, not merely "this tab has reloaded before". A tab
  // that reloaded for an earlier deployment must still get the next one.
  it("still reloads for a deployment it has not reloaded for before", () => {
    expect(
      decideReload({ ...READY, alreadyReloadedFor: "dpl_older", reloadCount: 1 })
    ).toEqual({ reload: true, reason: "new-deployment" })
  })

  // ── Rule 4, the cap ──────────────────────────────────────────────────────
  // Belt to rule 3's braces, against the case rule 3 cannot see: ids that
  // keep changing because something upstream is misconfigured, where every
  // check is honestly a new deployment and the loop is real anyway.
  it("stops for good once the per-tab cap is reached", () => {
    expect(
      decideReload({ ...READY, alreadyReloadedFor: "dpl_older", reloadCount: MAX_RELOADS_PER_TAB })
    ).toEqual({ reload: false, reason: "reload-cap-reached" })
  })

  it("still reloads on the last allowance below the cap", () => {
    expect(
      decideReload({
        ...READY,
        alreadyReloadedFor: "dpl_older",
        reloadCount: MAX_RELOADS_PER_TAB - 1,
      }).reload
    ).toBe(true)
  })

  // A count past the cap can only arrive from a corrupted or hand-edited
  // store; it must read as spent, never wrap around into allowed.
  it("treats a count past the cap as spent", () => {
    expect(
      decideReload({ ...READY, reloadCount: MAX_RELOADS_PER_TAB + 5 }).reload
    ).toBe(false)
  })

  // The corrupted count that walks straight past a `>=` cap, which is the one
  // shape the comment on rule 4 used to claim was covered and was not:
  // -100 >= 3 is false, so the cap lets it through, the tab reloads, the count
  // is written back as -99, and every later check does the same. A hand-edited
  // store therefore bought an UNBOUNDED reload loop, which is the single worst
  // outcome this whole slice guards against.
  it("treats a negative count as spent rather than as unlimited allowance", () => {
    expect(decideReload({ ...READY, reloadCount: -100 })).toEqual({
      reload: false,
      reason: "reload-cap-reached",
    })
  })

  // Same class, different spelling: sessionStorage holds strings, so a
  // corrupted value can parse to NaN, and NaN fails EVERY numeric comparison,
  // including `>=`. Nothing about a count nobody can read should be treated as
  // permission to reload.
  it("treats a count that is not a number at all as spent", () => {
    expect(decideReload({ ...READY, reloadCount: Number.NaN })).toEqual({
      reload: false,
      reason: "reload-cap-reached",
    })
  })
})
