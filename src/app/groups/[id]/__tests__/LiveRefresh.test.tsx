// @vitest-environment jsdom
//
// router.refresh is mocked: what is under test is when and how often this
// component decides to call it, not what a refresh does, which is Next's own
// concern. Every test uses fake timers, since the whole point of this
// component is a 10-second cadence nobody should wait out for real.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render } from "@testing-library/react"

const refresh = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}))

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
})

afterEach(() => {
  refresh.mockClear()
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

  // The action's own concerns end at the server boundary; this covers the
  // trip. router.refresh() already runs inside its own React transition
  // (see this file's header pointer to app-router-instance.js), so a dropped
  // connection surfaces the same way a rejected transition promise would:
  // by reaching the nearest error boundary unless something here catches it
  // first.
  it("swallows a thrown refresh rather than letting it escape the tick", () => {
    refresh.mockImplementationOnce(() => {
      throw new Error("network dropped")
    })
    render(<LiveRefresh paused={false} />)

    expect(() => {
      vi.advanceTimersByTime(10_000)
    }).not.toThrow()
  })
})
