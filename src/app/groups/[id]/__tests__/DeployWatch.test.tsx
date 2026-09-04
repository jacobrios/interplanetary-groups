// @vitest-environment jsdom
//
// WHAT IS MOCKED HERE, AND WHAT DELIBERATELY IS NOT.
//
// Mocked: `fetch` (there is no server in a test) and `window.location.reload`
// (jsdom cannot navigate, and a real reload would take the test runner with
// it). Both are the outside world, not this slice's logic.
//
// NOT mocked: decideReload. The component imports and calls the real thing.
// Mocking it away would leave the wiring — which id goes into which field,
// whether the composer prop is even read, whether the sessionStorage record
// is written before the reload rather than after — completely untested, and
// that exact shape of test has burned this repo repeatedly (see
// GroupHome.tsx's note on the deleted mocked-action test that "proved" a fix
// the browser then disproved).
//
// sessionStorage is jsdom's real one, cleared between tests by
// vitest.setup.ts, so the anti-loop tests below exercise a genuine
// write-then-read across two checks rather than a stubbed store.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render } from "@testing-library/react"
import DeployWatch, {
  DEPLOYMENT_CHECK_INTERVAL_MS,
  DEPLOYMENT_CHECK_TIMEOUT_MS,
} from "../DeployWatch"
import { MAX_RELOADS_PER_TAB } from "@/lib/deploy/should-reload"

const reload = vi.fn()
let originalLocation: PropertyDescriptor | undefined

// Replaced wholesale rather than spied on: jsdom 30 defines location.reload
// as non-configurable, so vi.spyOn(window.location, "reload") throws
// "Cannot redefine property: reload". The window property itself can still
// be redefined, which is what this does, and the original descriptor is put
// back afterwards.
function stubLocation() {
  originalLocation = Object.getOwnPropertyDescriptor(window, "location")
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: { href: "http://localhost:3000/groups/g1", reload },
  })
}

function restoreLocation() {
  if (originalLocation) Object.defineProperty(window, "location", originalLocation)
}

/** A fetch that answers /api/deployment with this id. */
function respondWith(id: string | null) {
  return vi.fn(async () => ({
    ok: true,
    json: async () => ({ id }),
  }))
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    value: state,
    configurable: true,
  })
}

/** Runs one interval tick and lets the fetch promise chain settle. */
async function tick(times = 1) {
  await vi.advanceTimersByTimeAsync(DEPLOYMENT_CHECK_INTERVAL_MS * times)
}

beforeEach(() => {
  vi.useFakeTimers()
  setVisibility("visible")
  stubLocation()
})

afterEach(() => {
  reload.mockClear()
  restoreLocation()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
  setVisibility("visible")
})

describe("DeployWatch", () => {
  it("renders nothing", () => {
    vi.stubGlobal("fetch", respondWith("dpl_old"))
    const { container } = render(
      <DeployWatch bootedId="dpl_old" composerHasText={false} sendInFlight={false} />
    )
    expect(container.firstChild).toBeNull()
  })

  // Detection off. Locally there is no deployment id at all, and a tab that
  // cannot know which build rendered it must not ask, let alone reload.
  it("never asks anything when this tab has no deployment id of its own", async () => {
    const fetchMock = respondWith("dpl_new")
    vi.stubGlobal("fetch", fetchMock)

    render(<DeployWatch bootedId={null} composerHasText={false} sendInFlight={false} />)

    await tick(5)
    setVisibility("hidden")
    document.dispatchEvent(new Event("visibilitychange"))
    setVisibility("visible")
    document.dispatchEvent(new Event("visibilitychange"))
    window.dispatchEvent(new Event("focus"))
    await vi.advanceTimersByTimeAsync(0)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })

  it("asks the unpinned endpoint on the interval and reloads onto a newer build", async () => {
    const fetchMock = respondWith("dpl_new")
    vi.stubGlobal("fetch", fetchMock)

    render(<DeployWatch bootedId="dpl_old" composerHasText={false} sendInFlight={false} />)

    expect(fetchMock).not.toHaveBeenCalled()
    await tick()

    // The URL, the no-store and the abort signal are all asserted: a cached
    // answer here is what turns this feature into a reload loop, and a
    // request with no signal is one that can never be given up on.
    expect(fetchMock).toHaveBeenCalledWith("/api/deployment", {
      cache: "no-store",
      signal: expect.any(AbortSignal),
    })
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it("leaves a tab alone when it is already on the live build", async () => {
    vi.stubGlobal("fetch", respondWith("dpl_old"))

    render(<DeployWatch bootedId="dpl_old" composerHasText={false} sendInFlight={false} />)

    await tick(3)
    expect(reload).not.toHaveBeenCalled()
  })

  // ── The anti-loop guard, the most safety-critical behaviour in this slice ─
  //
  // A reload that lands on a build still reporting a different id would fire
  // again on the next check, and again, every minute, forever. Proving the
  // negative properly means proving the CHECK still happened and the reload
  // still did not: asserting "reload called once" alone would pass just as
  // happily if the component had simply stopped checking, which is a
  // different bug wearing the same result.
  it("never reloads twice for the same deployment id, while still checking", async () => {
    const fetchMock = respondWith("dpl_new")
    vi.stubGlobal("fetch", fetchMock)

    render(<DeployWatch bootedId="dpl_old" composerHasText={false} sendInFlight={false} />)

    await tick()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(reload).toHaveBeenCalledTimes(1)

    // Three more checks, every one of them answered with the same "new"
    // deployment id — the exact condition a loop needs.
    await tick(3)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  // The real-world shape of the same guard: a genuine reload tears the whole
  // page down and builds it again, so the refusal cannot live in React state.
  // Unmount/remount stands in for that; sessionStorage is what carries it.
  //
  // HOW FAR THIS ACTUALLY REACHES, measured rather than assumed. Mutating the
  // component to keep its record in a module-level variable instead of
  // sessionStorage leaves this test GREEN, because a module survives an
  // unmount in jsdom while it would not survive a real page load. So this
  // proves the refusal outlives the COMPONENT, not that it outlives the
  // browser navigation. The latter is a property of sessionStorage itself and
  // is confirmed only by the production pass.
  it("still refuses after the page has actually been rebuilt", async () => {
    vi.stubGlobal("fetch", respondWith("dpl_new"))

    const first = render(
      <DeployWatch bootedId="dpl_old" composerHasText={false} sendInFlight={false} />
    )
    await tick()
    expect(reload).toHaveBeenCalledTimes(1)
    first.unmount()

    // The rebuilt page still boots on the OLD id — which is precisely the
    // failure this guard exists for. Without the record, this reloads again.
    render(<DeployWatch bootedId="dpl_old" composerHasText={false} sendInFlight={false} />)
    await tick(3)

    expect(reload).toHaveBeenCalledTimes(1)
  })

  // And the other half, so the guard cannot be "this tab has reloaded once,
  // never again": a genuinely different deployment must still be taken.
  it("does reload again for a different deployment id", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "dpl_two" }) })
      .mockResolvedValue({ ok: true, json: async () => ({ id: "dpl_three" }) })
    vi.stubGlobal("fetch", fetchMock)

    render(<DeployWatch bootedId="dpl_one" composerHasText={false} sendInFlight={false} />)

    await tick()
    expect(reload).toHaveBeenCalledTimes(1)
    await tick()
    expect(reload).toHaveBeenCalledTimes(2)
  })

  // Proves the count is genuinely read from storage and passed through,
  // rather than the component always handing decideReload a zero.
  it("honours the per-tab cap left behind by earlier reloads", async () => {
    window.sessionStorage.setItem("ipg:deploy:reload-count", String(MAX_RELOADS_PER_TAB))
    vi.stubGlobal("fetch", respondWith("dpl_new"))

    render(<DeployWatch bootedId="dpl_old" composerHasText={false} sendInFlight={false} />)

    await tick(3)
    expect(reload).not.toHaveBeenCalled()
  })

  // ── Waiting for the member ───────────────────────────────────────────────
  it("does not interrupt a member who is mid-message, and goes the moment they stop", async () => {
    vi.stubGlobal("fetch", respondWith("dpl_new"))

    const { rerender } = render(
      <DeployWatch bootedId="dpl_old" composerHasText={true} sendInFlight={false} />
    )

    await tick(2)
    expect(reload).not.toHaveBeenCalled()

    rerender(<DeployWatch bootedId="dpl_old" composerHasText={false} sendInFlight={false} />)
    await tick()

    expect(reload).toHaveBeenCalledTimes(1)
  })

  it("does not interrupt a send that has not settled", async () => {
    vi.stubGlobal("fetch", respondWith("dpl_new"))

    render(<DeployWatch bootedId="dpl_old" composerHasText={false} sendInFlight={true} />)

    await tick(3)
    expect(reload).not.toHaveBeenCalled()
  })

  // ── Busy is the whole screen, not just the composer ──────────────────────
  //
  // The expensive failure, and it is realistic: a member opens the email
  // sheet, submits their address, switches to their mail app for the code,
  // and comes back — which is exactly when the focus listener fires a check.
  // With busy meaning "the composer has text", the tab reloads and takes the
  // sheet, its step and the typed address with it.
  //
  // The dialog is appended to document.body by hand rather than by rendering
  // EmailAskNote, because what this component knows is a SELECTOR, not that
  // one particular sheet exists. GroupHomeDeployWatch.test.tsx renders the
  // real sheet and proves the two halves meet.
  it("waits while a modal is open over the screen, and goes once it closes", async () => {
    vi.stubGlobal("fetch", respondWith("dpl_new"))
    const dialog = document.createElement("div")
    dialog.setAttribute("role", "dialog")
    document.body.appendChild(dialog)

    try {
      render(<DeployWatch bootedId="dpl_old" composerHasText={false} sendInFlight={false} />)
      await tick(2)
      expect(reload).not.toHaveBeenCalled()
    } finally {
      dialog.remove()
    }

    await tick()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  // Focus, not text: an open keyboard over an empty field is still a member
  // in the middle of something, and this is the check that reaches the code
  // field inside that sheet.
  it("waits while the caret is in a text field, and goes once it leaves", async () => {
    vi.stubGlobal("fetch", respondWith("dpl_new"))
    const field = document.createElement("input")
    document.body.appendChild(field)

    try {
      render(<DeployWatch bootedId="dpl_old" composerHasText={false} sendInFlight={false} />)
      field.focus()
      await tick(2)
      expect(reload).not.toHaveBeenCalled()

      field.blur()
      await tick()
      expect(reload).toHaveBeenCalledTimes(1)
    } finally {
      field.remove()
    }
  })

  // A hand-edited or corrupted count used to buy an UNBOUNDED loop rather
  // than being refused: -100 is under the cap, so the tab reloaded and wrote
  // -99 back, forever. The ids change on every answer here so that the
  // same-deployment guard cannot be what stops it; only the cap can.
  it("refuses a tab whose stored reload count has been corrupted into a negative", async () => {
    window.sessionStorage.setItem("ipg:deploy:reload-count", "-100")
    let n = 0
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ id: `dpl_${n++}` }) }))
    )

    render(<DeployWatch bootedId="dpl_old" composerHasText={false} sendInFlight={false} />)

    await tick(4)
    expect(reload).not.toHaveBeenCalled()
  })

  // ── Visibility ───────────────────────────────────────────────────────────
  // Two separate guards, tested separately, the same way LiveRefresh's are:
  // this one never fires a visibilitychange event at all, so the only thing
  // that can stop the tick is the check the tick itself runs.
  it("skips a tick that lands while the tab is hidden, with no event fired", async () => {
    const fetchMock = respondWith("dpl_old")
    vi.stubGlobal("fetch", fetchMock)

    render(<DeployWatch bootedId="dpl_old" composerHasText={false} sendInFlight={false} />)
    await tick()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    setVisibility("hidden")
    await tick(3)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("stops the interval outright when the tab is hidden", async () => {
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval")
    vi.stubGlobal("fetch", respondWith("dpl_old"))

    render(<DeployWatch bootedId="dpl_old" composerHasText={false} sendInFlight={false} />)
    setVisibility("hidden")
    document.dispatchEvent(new Event("visibilitychange"))

    expect(clearIntervalSpy).toHaveBeenCalled()
  })

  it("checks immediately when the tab comes back, without waiting a minute", async () => {
    const fetchMock = respondWith("dpl_new")
    vi.stubGlobal("fetch", fetchMock)

    render(<DeployWatch bootedId="dpl_old" composerHasText={false} sendInFlight={false} />)
    setVisibility("hidden")
    document.dispatchEvent(new Event("visibilitychange"))

    setVisibility("visible")
    document.dispatchEvent(new Event("visibilitychange"))
    await vi.advanceTimersByTimeAsync(0)

    // No timer advance of a whole interval: this is the tab-return path.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  // Deliberately mirrors LiveRefresh's own focus listener and exists for the
  // same measured reason: iOS Safari returning from another app does not
  // reliably fire visibilitychange on the way back IN, though it does on the
  // way OUT — which stopped the interval. Without this, the component would
  // be permanently dead for exactly the members this product is used by.
  it("resumes on focus alone when the platform never fires visibilitychange on return", async () => {
    const fetchMock = respondWith("dpl_old")
    vi.stubGlobal("fetch", fetchMock)

    render(<DeployWatch bootedId="dpl_old" composerHasText={false} sendInFlight={false} />)

    setVisibility("hidden")
    document.dispatchEvent(new Event("visibilitychange"))
    fetchMock.mockClear()

    setVisibility("visible")
    window.dispatchEvent(new Event("focus"))
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // The interval has to come back too, not just this one check.
    await tick()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  // ── The tab return fires twice for one action ────────────────────────────
  // Returning to a backgrounded tab commonly raises visibilitychange AND
  // focus for the same single gesture. Uncoalesced that is two requests every
  // time anybody comes back to the group, which doubles this feature's whole
  // cost for nothing. Same window and same reasoning as LiveRefresh.
  it("makes one request, not two, when a tab return fires both events", async () => {
    const fetchMock = respondWith("dpl_old")
    vi.stubGlobal("fetch", fetchMock)

    render(<DeployWatch bootedId="dpl_old" composerHasText={false} sendInFlight={false} />)

    setVisibility("visible")
    document.dispatchEvent(new Event("visibilitychange"))
    window.dispatchEvent(new Event("focus"))
    await vi.advanceTimersByTimeAsync(0)

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  // And the coalescing window must not eat a legitimate later check: it is a
  // hair over one second against an interval of a minute.
  it("still checks on the next interval after a coalesced pair", async () => {
    const fetchMock = respondWith("dpl_old")
    vi.stubGlobal("fetch", fetchMock)

    render(<DeployWatch bootedId="dpl_old" composerHasText={false} sendInFlight={false} />)

    document.dispatchEvent(new Event("visibilitychange"))
    window.dispatchEvent(new Event("focus"))
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await tick()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  // ── A request that never answers ─────────────────────────────────────────
  // Without a timeout, a stalled connection leaves one request hanging per
  // minute for as long as the tab lives, and none of them ever settles. The
  // deadline is well inside the interval, so a tab never accumulates them.
  it("gives up on a check that never answers", async () => {
    const seen: RequestInit[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => {
        seen.push(init)
        return new Promise<never>(() => {})
      })
    )

    render(<DeployWatch bootedId="dpl_old" composerHasText={false} sendInFlight={false} />)
    await tick()
    expect(seen).toHaveLength(1)
    expect(seen[0].signal!.aborted).toBe(false)

    await vi.advanceTimersByTimeAsync(DEPLOYMENT_CHECK_TIMEOUT_MS)
    expect(seen[0].signal!.aborted).toBe(true)
    expect(reload).not.toHaveBeenCalled()
  })

  it("abandons a request still in the air when the member leaves the screen", async () => {
    const seen: RequestInit[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => {
        seen.push(init)
        return new Promise<never>(() => {})
      })
    )

    const { unmount } = render(
      <DeployWatch bootedId="dpl_old" composerHasText={false} sendInFlight={false} />
    )
    await tick()
    expect(seen[0].signal!.aborted).toBe(false)

    unmount()
    expect(seen[0].signal!.aborted).toBe(true)
  })

  // ── Every failure is silent ──────────────────────────────────────────────
  //
  // STRENGTHENED 4 SEPT 2026 AFTER REVIEW, and what was wrong with the two
  // originals is worth stating because it is a shape this repo keeps hitting.
  // Each asserted only `reload` was never called. Remove the try/catch these
  // guard and the exception propagates, the reload still never happens, and
  // the assertion still passes; they reddened only incidentally, through the
  // runner's unhandled-rejection handling, which is a property of vitest
  // rather than of the component. Both now assert the behaviour that is
  // actually load-bearing: a failure resolves to "do nothing THIS TICK",
  // never to "something changed", nothing is recorded, and the component is
  // still working on the next tick.
  //
  // HOW FAR THAT REACHES, measured rather than claimed: deleting the `return`
  // inside the catch turns these red, because execution then falls through
  // with no id and the tab reloads for a deployment nobody ever named.
  // Deleting the whole try/catch does NOT turn them red on assertions alone,
  // because a rejection and a caught rejection are indistinguishable from
  // outside this component. That is the honest limit of a unit test here.
  it("treats a check that cannot be made as nothing at all, and keeps checking", async () => {
    const fetchMock = vi.fn(async () => Promise.reject(new Error("offline")))
    vi.stubGlobal("fetch", fetchMock)

    render(<DeployWatch bootedId="dpl_old" composerHasText={false} sendInFlight={false} />)

    await tick()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(reload).not.toHaveBeenCalled()
    // Nothing was written either: a failed check must not spend an allowance
    // or leave a record behind.
    expect(window.sessionStorage.getItem("ipg:deploy:reloaded-for")).toBeNull()

    // The failure did not kill the component: it is still asking.
    await tick(2)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("treats an answer of the wrong shape as nothing at all, and keeps checking", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => "<!doctype html>" }))
    vi.stubGlobal("fetch", fetchMock)

    render(<DeployWatch bootedId="dpl_old" composerHasText={false} sendInFlight={false} />)

    await tick()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(reload).not.toHaveBeenCalled()
    expect(window.sessionStorage.getItem("ipg:deploy:reloaded-for")).toBeNull()

    await tick(2)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("stays silent when the endpoint answers with an error status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({ id: "dpl_new" }) })))

    render(<DeployWatch bootedId="dpl_old" composerHasText={false} sendInFlight={false} />)

    await tick(3)
    expect(reload).not.toHaveBeenCalled()
  })

  // A browser set to block site data throws on the PROPERTY access, before
  // any method is called. Failing toward silence is the only safe direction:
  // without the store there is no way to remember a reload has happened, and
  // a reload we cannot remember is a loop.
  it("stays silent when the tab cannot use session storage at all", async () => {
    vi.stubGlobal("fetch", respondWith("dpl_new"))
    const store = Object.getOwnPropertyDescriptor(window, "sessionStorage")
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get() {
        throw new Error("site data blocked")
      },
    })

    try {
      render(<DeployWatch bootedId="dpl_old" composerHasText={false} sendInFlight={false} />)
      await tick(3)
      expect(reload).not.toHaveBeenCalled()
    } finally {
      if (store) Object.defineProperty(window, "sessionStorage", store)
    }
  })

  // ── Teardown ─────────────────────────────────────────────────────────────
  it("clears the interval and both listeners on unmount", async () => {
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval")
    const removeDocListener = vi.spyOn(document, "removeEventListener")
    const removeWindowListener = vi.spyOn(window, "removeEventListener")
    const fetchMock = respondWith("dpl_new")
    vi.stubGlobal("fetch", fetchMock)

    const { unmount } = render(
      <DeployWatch bootedId="dpl_old" composerHasText={false} sendInFlight={false} />
    )
    unmount()

    expect(clearIntervalSpy).toHaveBeenCalled()
    expect(removeDocListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function))
    expect(removeWindowListener).toHaveBeenCalledWith("focus", expect.any(Function))

    await tick(3)
    document.dispatchEvent(new Event("visibilitychange"))
    window.dispatchEvent(new Event("focus"))
    await vi.advanceTimersByTimeAsync(0)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })

  // A check already in the air when the member navigates away must not
  // reload the screen they have since moved to.
  it("does not reload on an answer that arrives after unmount", async () => {
    let answer: ((value: { ok: boolean; json: () => Promise<{ id: string }> }) => void) | null = null
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<{ ok: boolean; json: () => Promise<{ id: string }> }>((resolve) => {
            answer = resolve
          })
      )
    )

    const { unmount } = render(
      <DeployWatch bootedId="dpl_old" composerHasText={false} sendInFlight={false} />
    )
    await tick()
    unmount()

    answer!({ ok: true, json: async () => ({ id: "dpl_new" }) })
    await vi.advanceTimersByTimeAsync(0)

    expect(reload).not.toHaveBeenCalled()
  })
})
