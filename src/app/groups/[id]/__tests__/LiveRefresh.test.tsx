// @vitest-environment jsdom
//
// router.refresh is mocked: what is under test is when and how often this
// component decides to call it, not what a refresh does, which is Next's own
// concern. Every test uses fake timers, since the whole point of this
// component is a 10-second cadence nobody should wait out for real.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render } from "@testing-library/react"

// Mock returns the SAME object on every call, matching real next/navigation's
// own stable reference (see GroupHome.test.tsx's routerMock comment for the
// full reasoning). An object literal rebuilt per call would give this
// component's effect a new `router` identity on every re-render, tearing
// down and restarting the interval and listeners each time, which is a test
// artifact this file must not introduce.
const refresh = vi.fn()
const routerMock = { refresh }
vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}))

// react's own useTransition is mocked for the in-flight tests below, and
// ONLY for those: LiveRefresh.tsx's header explains why real isPending
// timing (verified separately, against real Next internals, in a throwaway
// probe rather than assumed) needs a genuinely suspending nested transition
// to stay pending, and this component has no Suspense-reading sibling in
// its own tree to produce one — there is nothing here for a bare
// router.refresh mock to suspend against. mockRefreshPending is a plain
// module-level variable, not React state, on purpose: startTransitionMock
// flips it to true the moment a transition starts (matching real React,
// where isPending goes true synchronously before the callback runs) and the
// tests flip it back to false themselves to say "the refresh has now
// settled" — then call `rerender` so LiveRefresh's mirroring effect (see
// refreshPendingRef in the component) actually notices the new value, the
// same way a real isPending change would trigger a real re-render.
let mockRefreshPending = false
const startTransitionMock = vi.fn((callback: () => void) => {
  mockRefreshPending = true
  callback()
})
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>()
  return {
    ...actual,
    useTransition: () => [mockRefreshPending, startTransitionMock],
  }
})

import LiveRefresh from "../LiveRefresh"

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    value: state,
    configurable: true,
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  setVisibility("visible")
  // Every test starts with no refresh outstanding. Without this reset, a
  // test that leaves mockRefreshPending at true (any in-flight test that
  // does not explicitly settle it) would leak into every later test's
  // FIRST render, since the component reads it once at mount.
  mockRefreshPending = false
})

afterEach(() => {
  refresh.mockClear()
  startTransitionMock.mockClear()
  vi.restoreAllMocks()
  vi.useRealTimers()
  setVisibility("visible")
})

describe("LiveRefresh", () => {
  it("renders nothing", () => {
    const { container } = render(<LiveRefresh paused={false} />)
    expect(container.firstChild).toBeNull()
  })

  it("polls router.refresh() every 10 seconds while visible", () => {
    render(<LiveRefresh paused={false} />)

    vi.advanceTimersByTime(9_999)
    expect(refresh).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(refresh).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(10_000)
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  // Distinct from the "hidden stops the interval" test below: this one never
  // fires visibilitychange at all, so the only thing that can be stopping the
  // tick is the check the tick itself runs. The event-driven start/stop is a
  // separate guard covered on its own further down.
  it("does not fire a tick when the document is hidden, even with no visibilitychange event", () => {
    render(<LiveRefresh paused={false} />)

    vi.advanceTimersByTime(10_000)
    expect(refresh).toHaveBeenCalledTimes(1)

    setVisibility("hidden")
    vi.advanceTimersByTime(10_000)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it("stops the interval itself when the tab is hidden", () => {
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval")
    render(<LiveRefresh paused={false} />)

    setVisibility("hidden")
    document.dispatchEvent(new Event("visibilitychange"))

    expect(clearIntervalSpy).toHaveBeenCalled()

    // Confirms it isn't only the tick-level check (already covered above)
    // doing the work: advancing well past several would-be ticks produces
    // nothing further.
    vi.advanceTimersByTime(50_000)
    expect(refresh).not.toHaveBeenCalled()
  })

  it("refreshes immediately and resumes the interval when the tab becomes visible again", () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval")
    render(<LiveRefresh paused={false} />)
    expect(setIntervalSpy).toHaveBeenCalledTimes(1)

    setVisibility("hidden")
    document.dispatchEvent(new Event("visibilitychange"))
    expect(refresh).not.toHaveBeenCalled()

    setVisibility("visible")
    document.dispatchEvent(new Event("visibilitychange"))

    // Immediate: no timer advance needed to see it.
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(setIntervalSpy).toHaveBeenCalledTimes(2)

    vi.advanceTimersByTime(10_000)
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  // Not gated by document.visibilityState on purpose: focus exists precisely
  // for platforms where the visibility signal this member needs did not
  // fire, so tying it to the same property would reopen the gap it closes.
  it("refreshes on window focus regardless of document.visibilityState", () => {
    setVisibility("hidden")
    render(<LiveRefresh paused={false} />)

    window.dispatchEvent(new Event("focus"))
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it("fires no refresh at all while paused, including the visibility-return refresh", () => {
    render(<LiveRefresh paused={true} />)

    vi.advanceTimersByTime(30_000)
    expect(refresh).not.toHaveBeenCalled()

    setVisibility("hidden")
    document.dispatchEvent(new Event("visibilitychange"))
    setVisibility("visible")
    document.dispatchEvent(new Event("visibilitychange"))
    expect(refresh).not.toHaveBeenCalled()

    window.dispatchEvent(new Event("focus"))
    expect(refresh).not.toHaveBeenCalled()
  })

  it("clears the interval and both listeners on unmount", () => {
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval")
    const removeDocListener = vi.spyOn(document, "removeEventListener")
    const removeWindowListener = vi.spyOn(window, "removeEventListener")

    const { unmount } = render(<LiveRefresh paused={false} />)
    unmount()

    expect(clearIntervalSpy).toHaveBeenCalled()
    expect(removeDocListener).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function)
    )
    expect(removeWindowListener).toHaveBeenCalledWith(
      "focus",
      expect.any(Function)
    )

    // Behavioural confirmation, not just that the removal calls were made:
    // nothing fires after teardown, from any of the three sources.
    vi.advanceTimersByTime(50_000)
    document.dispatchEvent(new Event("visibilitychange"))
    window.dispatchEvent(new Event("focus"))
    expect(refresh).not.toHaveBeenCalled()
  })

  // Deliberately narrow, per LiveRefresh.tsx's header: router.refresh()
  // returns void, so this try/catch can only ever catch a throw that
  // happens synchronously, at the call site, before the call returns. It
  // does NOT and cannot exercise or prove anything about a dropped
  // connection during the refresh itself, which Next's own
  // fetch-server-response.js already handles internally without ever
  // producing a promise this component could observe rejecting. This test
  // proves only the synchronous case: a throw at the call site (the
  // documented real instance is dispatching before router initialization)
  // does not escape the tick and crash the interval.
  it("swallows a synchronous throw from router.refresh() at the call site", () => {
    refresh.mockImplementationOnce(() => {
      throw new Error("dispatched before router initialization")
    })
    render(<LiveRefresh paused={false} />)

    expect(() => {
      vi.advanceTimersByTime(10_000)
    }).not.toThrow()
  })

  // Realistic tab-return sequence: the tab going from hidden to visible often
  // fires visibilitychange and focus for the same one user action, each
  // independently calling refresh(). Without coalescing this is two refreshes
  // for one return to the tab.
  it("coalesces a visibilitychange and a focus firing together into one refresh", () => {
    render(<LiveRefresh paused={false} />)

    setVisibility("hidden")
    document.dispatchEvent(new Event("visibilitychange"))
    setVisibility("visible")
    document.dispatchEvent(new Event("visibilitychange"))
    // No time advance between these: this is what makes it "together".
    window.dispatchEvent(new Event("focus"))

    expect(refresh).toHaveBeenCalledTimes(1)
  })

  // Blocker found in review: handleFocus called refresh() but never
  // startInterval(). On a platform where visibilitychange fires on the way
  // OUT (hiding, which stops the interval) but not reliably on the way back
  // IN — iOS Safari returning from another app, the exact case this
  // listener's header names — that left the member with one refresh from
  // the focus event and then a permanently frozen screen: the original bug,
  // reintroduced on the one platform this listener exists to cover.
  it("resumes polling on focus alone when the platform never fires visibilitychange on return", () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval")
    render(<LiveRefresh paused={false} />)
    expect(setIntervalSpy).toHaveBeenCalledTimes(1)

    // Hidden via visibilitychange, which DOES fire on the way out and stops
    // the interval.
    setVisibility("hidden")
    document.dispatchEvent(new Event("visibilitychange"))
    refresh.mockClear()

    // Returning to visible with ONLY a focus event — no visibilitychange —
    // is the gap this listener exists for.
    setVisibility("visible")
    window.dispatchEvent(new Event("focus"))

    // Focus's own immediate refresh still fires either way; it is not what
    // this test is about.
    expect(refresh).toHaveBeenCalledTimes(1)

    // Mutation-proven: before this fix, handleFocus called refresh() only,
    // so setInterval was never called a second time here (the interval
    // stayed dead from the earlier hide), and the later tick below would
    // never land.
    expect(setIntervalSpy).toHaveBeenCalledTimes(2)

    refresh.mockClear()
    vi.advanceTimersByTime(10_000)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  // Same gap, different entry point: mounting while already hidden never
  // starts the interval at all (covered separately above), so a focus that
  // arrives with no prior visibilitychange has nothing running to fall back
  // on either.
  it("starts the interval on focus when mounted while hidden and no visibilitychange ever fires", () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval")
    setVisibility("hidden")
    render(<LiveRefresh paused={false} />)
    expect(setIntervalSpy).not.toHaveBeenCalled()

    setVisibility("visible")
    window.dispatchEvent(new Event("focus"))

    expect(refresh).toHaveBeenCalledTimes(1)
    expect(setIntervalSpy).toHaveBeenCalledTimes(1)

    refresh.mockClear()
    vi.advanceTimersByTime(10_000)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it("does not start the interval when mounted while the tab is already hidden", () => {
    // Asserting on the refresh count alone would not tell "the interval
    // never started" apart from "it started but every tick no-op'd on the
    // tick-level visibility check" (covered separately above) — both look
    // identical from the outside. Spying on setInterval itself is what pins
    // down which one this is.
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval")
    setVisibility("hidden")
    render(<LiveRefresh paused={false} />)

    expect(setIntervalSpy).not.toHaveBeenCalled()
    vi.advanceTimersByTime(30_000)
    expect(refresh).not.toHaveBeenCalled()

    // Confirms it really was "not started yet", not "started and
    // permanently broken": becoming visible now works normally.
    setVisibility("visible")
    document.dispatchEvent(new Event("visibilitychange"))
    expect(setIntervalSpy).toHaveBeenCalledTimes(1)
    expect(refresh).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(10_000)
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  // The three tests below model the in-flight guard itself (see the mock
  // comment above the useTransition mock for why a real, suspense-driven
  // isPending cannot be produced from a bare router.refresh mock in this
  // component's own test tree). `rerender` stands in for the re-render a
  // real isPending flip would trigger.
  it("fires no second refresh when a tick lands while the previous one is still in flight", () => {
    const { rerender } = render(<LiveRefresh paused={false} />)

    vi.advanceTimersByTime(10_000)
    expect(refresh).toHaveBeenCalledTimes(1)
    // startTransitionMock set mockRefreshPending true the instant that
    // refresh started (see the mock: this mirrors real React setting
    // isPending true synchronously, before the wrapped callback runs).
    // Re-rendering is what lets LiveRefresh's own mirroring effect notice
    // it, the same way a real isPending change would force a re-render.
    expect(mockRefreshPending).toBe(true)
    rerender(<LiveRefresh paused={false} />)

    // A whole extra interval period passes with the refresh still (per the
    // mock) unsettled. Not a single further call reaches router.refresh().
    vi.advanceTimersByTime(10_000)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it("fires again on the next tick once the in-flight refresh settles", () => {
    const { rerender } = render(<LiveRefresh paused={false} />)

    vi.advanceTimersByTime(10_000)
    expect(refresh).toHaveBeenCalledTimes(1)
    rerender(<LiveRefresh paused={false} />)

    vi.advanceTimersByTime(10_000)
    expect(refresh).toHaveBeenCalledTimes(1) // still blocked, in flight

    // The refresh has now landed: isPending goes back to false, and a
    // render is needed for LiveRefresh to notice, same as above.
    mockRefreshPending = false
    rerender(<LiveRefresh paused={false} />)

    vi.advanceTimersByTime(10_000)
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  // The reported case: a tab sleeps through many missed ticks while a
  // refresh never settles. It owes exactly one refresh once that refresh
  // finally does, not one per missed tick in between.
  it("yields exactly one refresh, not a burst, after a long stall while a refresh stays in flight", () => {
    const { rerender } = render(<LiveRefresh paused={false} />)

    vi.advanceTimersByTime(10_000)
    expect(refresh).toHaveBeenCalledTimes(1)
    rerender(<LiveRefresh paused={false} />)

    // Fifty missed ticks' worth of elapsed time, all while the one refresh
    // above never settles.
    vi.advanceTimersByTime(10_000 * 50)
    expect(refresh).toHaveBeenCalledTimes(1)

    mockRefreshPending = false
    rerender(<LiveRefresh paused={false} />)

    vi.advanceTimersByTime(10_000)
    expect(refresh).toHaveBeenCalledTimes(2)
  })
})
