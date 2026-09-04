# A deployed fix reaches tabs that are already open

Slice branch: `deploy-reaches-open-tabs`, cut from `main` at `7b72e3d`.
Test-suite baseline on `main` at `7b72e3d`: **1808 passing across 152 files, 0 failing.**
No pre-existing failures to carry.

---

## Front section

**Settled, do not relitigate.** Version-skew detection is *already live in production* and needs no
config change: Vercel injects the deployment id automatically (`<html data-dpl-id="dpl_4ifC…">` and
`x-nextjs-deployment-id` are both present on the live site), and setting `deploymentId` by hand is the
only way to create the constant-reload failure this slice must avoid. On mismatch Next already calls
`location.replace()` render-phase, so `LiveRefresh`'s 10s poll already delivers a new build to an open
group home. The gap is that the reload destroys the member's half-typed message. The fix is to make the
reload harmless (persist the composer draft), **not** to defer it: the reload happens inside Next's own
render and cannot be intercepted, so deferring it would mean pausing chat sync while somebody types,
regressing the chat-sync slice that landed the same day.

**Non-goals.** Reaching screens other than the group home (owner's call; belongs to whichever slice
gives event detail its own polling). Preserving scroll position across the reload (belongs to a feed
slice, if ever). Excluding `.claude/worktrees/**` from `tsconfig.json` (queued debt, below).

**Verification.** Draft persistence gets unit tests, each mutation-proved. The reload itself gets **no
test** and cannot have one: no test in this repo can reproduce a deployment-id mismatch across two
builds. It is proved by a local two-build run through the real production path, and honestly, only by
deploying twice, in production.

**Debt expected.** Draft is per tab and clears with session storage; scroll position is still lost.

---

## Background: what was established before any code, and why it inverts the request

The task as brought in said Next's version-skew protection "exists and is not turned on," on the
evidence that `next.config.ts` sets neither `deploymentId` nor `generateBuildId`. That reasoning is
sound and the conclusion is wrong, because Vercel supplies the identifier itself. Three pieces of
production evidence, gathered before any design work:

1. `curl https://interplanetarygroups.com/ | grep data-dpl-id` returns
   `data-dpl-id="dpl_4ifCNzig3vgp6zVZDqEuBgPQ83wu"`. Next only emits that attribute when a deployment
   id is configured (the transform is `server/app-render/stream-ops.node.js:411`; the conditional that makes it apply only when a deployment id is set is `server/stream-utils/node-web-streams-helper.js:769`), so one is configured — by the
   platform, at build time, via `NEXT_DEPLOYMENT_ID`. Vercel's docs match: projects created after
   19 Nov 2024 on Next.js 14.1.4+ get Skew Protection with zero configuration.
2. Every RSC response carries `x-nextjs-deployment-id: dpl_4ifC…`. That header is
   `NEXT_NAV_DEPLOYMENT_ID_HEADER` (`lib/constants.js:274`), and it is set *only* when a deployment id
   is configured (`build/templates/app-page-runtime.js:1046-1048`). Its presence is a second,
   independent confirmation.
3. A request carrying a deliberately bogus `x-deployment-id` header returns **200, served by the
   current deployment, reporting the current id** — not the 404 Vercel's docs describe for an expired
   pin, and not a pin to an older deployment. So requests from an old tab are **not** routed back to
   the old build; they reach the new one, and the mismatch is therefore detectable.

Point 3 is the one that matters most and is the one that could most easily have gone the other way.
Vercel's Skew Protection exists to *pin* old clients to the old deployment so they keep working, which
is the opposite of what this slice wants. If routing were pinning us, the poll would never see a new
deployment id and no reload would ever fire. It is not pinning us.

### What Next does with the mismatch, traced end to end

Two independent source traces (Next 16.3.2, the compiled `dist` that actually runs) agree, and the
second was launched specifically to try to falsify the first. `router.refresh()` reaches the check:

```
app-router-instance.js  refresh() -> dispatchAppRouterAction({type: ACTION_REFRESH})
  -> router-reducer/reducers/refresh-reducer.js  refreshDynamicData()
  -> segment-cache/navigation.js  navigateToKnownRoute()
  -> router-reducer/ppr-navigations.js:1111  fetchMissingDynamicData() -> fetchServerResponse()
```

and inside `fetchServerResponse`, at `router-reducer/fetch-server-response.js:175-178`:

```js
if ((res.headers.get(NEXT_NAV_DEPLOYMENT_ID_HEADER) ?? flightResponse.b) !== getNavigationBuildId()) {
    // The server build does not match the client build.
    return doMpaNavigation(res.url);
}
```

`doMpaNavigation` returns a plain string, which `ppr-navigations.js:1117-1126` turns into
`{exitStatus: 2}` (HardRetry), which `finishNavigationTask` (`:987-1001`) turns into
`dispatchRetryDueToTreeMismatch(isHardRetry = true, …)`, which dispatches `ACTION_SERVER_PATCH` with
`mpa: true` and `seed: null`, which `server-patch-reducer.js:26-30` short-circuits to
`completeHardNavigation`, which sets `pushRef.mpaNavigation = true`, which
**`app-router.js:214-231`** consumes:

```js
if (pushRef.mpaNavigation) {
  if (globalMutable.pendingMpaPath !== canonicalUrl) {
    if (pushRef.pendingPush) { location.assign(canonicalUrl) }
    else { location.replace(canonicalUrl) }        // <- app-router.js:221
    globalMutable.pendingMpaPath = canonicalUrl
  }
  throw unresolvedThenable
}
```

For a timer-driven refresh `navigateType` is `'replace'` (`refresh-reducer.js:75`, because
`pushRef.pendingPush` is false when idle), so it is `location.replace(sameUrl)` — a genuine full page
load. It fires **render-phase, not in an effect**, with no user interaction, no click, no guard for tab
visibility, and no guard for unsaved state. AppRouter then throws `unresolvedThenable` so nothing
renders against the stale tree; the member sees the old content for one network round trip and then the
page reloads. No error boundary, no Suspense fallback, no console error.

One branch was checked specifically because it could have silently swallowed all of the above:
`segment-cache/cache.js:2250` catches the same mismatch, comments "Treat as a 404," and merely returns
`null`. It is **not on the refresh path**, and the proof is short: on a refresh the mismatch is caught
inside `fetchServerResponse` at `:175`, which returns a plain string, so `ppr-navigations.js:1117`
short-circuits to the MPA path **before any cache write is attempted at all**.

*(Corrected after independent review, before merge, because the first version of this paragraph offered
a proof that does not hold. It said "all five of its call sites are in the prefetch subsystem or gated
behind `routeCacheEntry !== null`." There are **six** call sites, not five: `cache.js:2155`, `:2231`,
`:2610`, `segment-cache/navigation.js:311`, `router-reducer/create-initial-router-state.js:106`, and
`ppr-navigations.js:1152` -- and only the last is `routeCacheEntry`-gated, while `navigation.js:311` is
a navigation rather than a prefetch and `create-initial-router-state.js:106` is a hydration write. The
conclusion survives on the short-circuit above, which was always the argument that carried it. Recorded
rather than quietly rewritten: this project treats a claimed proof that is not the proof that holds as
a defect equal to a code bug.)*

### Therefore

**A deployed fix already reaches an open group home, within about ten seconds.** No code is needed to
make that true. What is needed is (a) proof that it is true, because it has never been observed, and
(b) protection for the one thing the reload destroys.

### Why the owner's own risk was already live, not hypothetical

The task brought in the concern that "a member could be mid-message when it fires," to be designed
against. It is not a risk to be introduced by this slice; it has been shipping since `LiveRefresh`
landed on 4 Sept 2026 (`34d7043`), unguarded. `location.replace` discards the `<textarea>`'s value like
any other component state.

### Why deferring the reload was considered and rejected

The owner's first instinct, and mine, was to defer the reload until the member is idle. Pricing it
killed it. The reload is dispatched by Next's own router in response to the refresh's own response;
there is no callback, no event, and no state we own between the mismatch and `location.replace`. The
*only* lever is whether the refresh fires at all. So "defer while typing" necessarily means "stop
polling while the composer has text," which pauses live chat sync mid-typing and leaves a member who
wanders off with text in the box seeing no new messages and receiving no fix, indefinitely. That is a
direct regression against the chat-sync slice from the same day. Making the reload harmless costs less
and protects more: the draft then also survives a manual reload, a crash, and an iOS tab eviction.

### The risk this slice must reason about explicitly: could this reload constantly?

Named in the request, and correctly. A misconfigured deployment id that never matches would reload
every tab every ten seconds forever, which is far worse than the bug. Four reasons it does not happen
here, in descending strength:

1. **This slice changes no configuration at all.** It does not set `deploymentId`, does not set
   `generateBuildId`, does not add middleware, and does not set a `__vdpl` cookie. The identifier
   continues to come from Vercel, where the build-time and serve-time values are the same value by
   construction. The one documented way to break that is `vercel build` + `vercel deploy --prebuilt`,
   which this project does not use.
2. **The document is never cached**, so a reload cannot land back on stale HTML carrying the old id:
   the live site returns `cache-control: private, no-cache, no-store, max-age=0, must-revalidate`.
3. **Vercel promotes production atomically**, so there is no window in which two different production
   deployments serve the same domain and a tab could ping-pong between them.
4. `globalMutable.pendingMpaPath` (`app-router.js:216`) dedupes repeat renders to the same URL within a
   document, and `throw unresolvedThenable` prevents any further router state committing after the
   navigation starts.

Residual, stated rather than defended: if a reload ever landed on a build that still mismatched, Next
has no cross-reload loop breaker and the tab would reload every ten seconds. Nothing in the four points
above makes that reachable, and building a guard for it would mean adding a mechanism whose own
failure modes are larger than the one it defends against. Not built. If it is ever observed, the cheap
fix is a `sessionStorage` reload-count cap, and this paragraph is the pointer.

---

## Task 1 — the composer draft survives a reload

**Files:** `src/app/groups/[id]/GroupHome.tsx`, plus a new test file.

`GroupHome.tsx:160` owns the composer's text as `const [inputValue, setInputValue] = useState("")`, and
passes it to `ChatInput` at `:469`. `ChatInput` is fully controlled (`ChatInput.tsx:96-109`), so it
needs no change and must not receive one.

**Behaviour to build.** The draft is written to `sessionStorage` as it is typed, restored when the group
home mounts, and removed when a send is dispatched.

**Design constraints, each with its reason:**

- **`sessionStorage`, not `localStorage`.** A draft belongs to the tab the member is typing in. With
  `localStorage`, a member with the group open in two tabs would have one tab's half-typed message
  appear in the other, and a draft would outlive the browsing session entirely. `sessionStorage` is
  per-tab and per-session, and it survives `location.replace` of the same document, which is exactly
  the event this slice exists for.
- **Keyed per group**, e.g. `ipg:draft:<groupId>`. A member in two groups must not carry a draft
  between them. `groupId` is already a prop on `GroupHome`.
- **Restored in an effect on mount, never during render.** The group home is server-rendered;
  reading browser storage during render would produce a hydration mismatch between the server's `""`
  and the client's restored text. The cost is that the textarea is briefly empty before the draft
  appears. Accept it and say so in a comment: a hydration error is a real bug and a one-frame empty
  box is not.
- **Every read and write wrapped in `try/catch`, and the `try` must begin before the
  `window.sessionStorage` property access**, not merely around `getItem`: the property lookup itself
  throws in a private window and wherever the browser blocks site data. A failure must leave the
  composer working with an empty draft, never break the page. *(Corrected after review: an earlier
  draft of this line justified the wrapping "per this project's standing rule". There is no such rule
  and no precedent to appeal to -- this slice is the first use of browser storage anywhere in the app.
  The practice is right on its own merits and now stands on them.)*
- **Cleared at dispatch, not at settle.** The existing send path already clears `inputValue`
  optimistically; clearing storage at the same point keeps the two in step. If a send fails the member
  loses the draft exactly as they do today, which is pre-existing behaviour this slice is not changing.
- **Do not persist the onboarding gap-ask composer.** Out of lane; different component, different
  slice, no reload risk on that screen because it does not poll.

**Tests, and the mutation proof each one owes.** Write the test first, watch it fail, then implement.
For each, break the thing it guards, confirm red, restore, confirm green — and record the mutation used
in the PR body.

1. *A draft typed into the composer is written to session storage.* Mutation: delete the write.
2. *A draft in session storage for this group is restored on mount.* Mutation: delete the restore
   effect.
3. *A draft stored under a different group's key is not restored.* Mutation: drop `groupId` from the
   key so it becomes a single global key; the test must go red.
4. *Sending clears the stored draft.* Mutation: delete the removal; the test must go red, proving a sent
   message would otherwise reappear in the box after a reload.
5. *A storage accessor that throws leaves the composer usable and empty.* Mutation: remove the
   `try/catch`; the test must go red rather than the suite erroring out ambiguously.

Test 3 deserves a note because it is the one most likely to pass for the wrong reason: assert against a
key that genuinely contains a *different* group id, and confirm the negative by first showing the same
test passing when the key matches.

**Explicitly not tested, and why.** That the reload itself fires. No test in this repo can produce two
builds with different deployment ids inside one vitest run; jsdom has no Next router, and mocking the
router would strip the very behaviour at issue. This project has been burned by exactly that shape
before (message-send-latency slice one deleted a component test that mocked the server actions and
therefore proved nothing). Task 2 is the proof instead.

---

## Task 2 — prove the reload actually happens, locally, through the production path

No product code. This is verification, and it is the more valuable half of the slice, because the
mechanism has never been observed working.

The naive reading is that this can only be proved by deploying twice. It can be proved locally, and
through the *same* code path production uses, because Next reads `NEXT_DEPLOYMENT_ID` from the
environment into `config.deploymentId` (`server/config.js:826-829`). Setting it by hand for a local
build reproduces the production arrangement exactly: the server emits `x-nextjs-deployment-id`, the
client pins it at hydration from `<html data-dpl-id>`, and `fetch-server-response.js:175` compares the
two. Without it the local build falls back to comparing `flightResponse.b` (a fresh nanoid per build),
which exercises the same branch by a different input — weaker evidence, so do not rely on it.

**Procedure:**

1. `npm run qa:stage-chatsync` to stage a group, and keep the invite link it prints.
2. `NEXT_DEPLOYMENT_ID=dpl_localtest_one npx next build --webpack`, then start it with the same
   variable set. Webpack, not Turbopack, per this repo's standing note.
3. Open the group home in a browser at 375x812, join through the invite link, and confirm the page is
   live: `document.documentElement.dataset.dplId` is consumed and deleted by Next at boot, so instead
   confirm the id is in the served HTML with a `curl … | grep data-dpl-id`, and confirm an RSC response
   carries `x-nextjs-deployment-id`.
4. **Type text into the composer and leave it there.** This is the same run that proves task 1.
5. Rebuild and restart with `NEXT_DEPLOYMENT_ID=dpl_localtest_two`, changing nothing else.
6. Watch the untouched tab. Expected: within about ten seconds it performs a full page load by itself,
   and the typed draft is still in the composer afterwards.

**What to record in the PR body:** whether the reload fired, roughly how long it took, and whether the
draft survived. If the reload does *not* fire, that falsifies the entire premise above and the slice
stops and reports rather than working around it.

**What this does not prove, and must be said plainly.** Local `next start` is not Vercel. It does not
prove that Vercel's routing lets a stale tab reach the new deployment (though the bogus-`x-deployment-id`
probe in the Background section is direct evidence that it does), and it does not prove the timing on a
phone over a real network. The honest proof is deploying twice and watching an open tab pick up the
second one, and that is the owner's, after merge.

---

## Task 3 — the record

- **`CLAUDE.md`, "Where the build is":** a paragraph saying that a deploy already reaches an open group
  home within ten seconds, that this is Vercel's automatic deployment id plus `LiveRefresh`'s poll and
  not anything this project configured, that `next.config.ts` must **not** grow a `deploymentId`, and
  that the composer draft now survives the reload. Name the two things it does not cover: screens other
  than the group home, and scroll position.
- **`docs/build-notes.md` §11:** an entry carrying the reasoning, the three production probes, the two
  source traces with the `fetch-server-response.js:175` → `app-router.js:221` chain, why deferring was
  rejected, the four reasons a constant-reload loop is unreachable, and the local verification numbers.
  400-600 words.
- **No deploy obligation.** No migration, no new environment variable, no Vercel setting. Nothing for
  the after-launch list. Say so explicitly in the PR body so nobody goes looking.

---

## Debt this slice opens or leaves

- **The draft is per tab and per session.** Closing the tab loses it; a member on a second device sees
  nothing. Correct for a chat composer and not worth more.
- **Scroll position is still lost on reload.** A member reading back through history is bumped to the
  bottom of the feed. Unfixed, and it is the only remaining user-visible cost of the reload.
- **Screens other than the group home never pick up a deploy.** Event detail and group info do not poll,
  so a member sitting on a plan's page can hold an old build indefinitely. Owner's explicit scope call.
- **`tsconfig.json` includes `.claude/worktrees/**`.** Found while trying to run the mandated production
  build on a clean `main`: `next build` typechecks other branches' worktrees and fails with errors that
  belong to another branch. Gitignored, so Vercel is unaffected, but it makes the pre-PR build check
  unrunnable whenever concurrent work is in flight — the same class as PR #95's vitest fix, never
  applied to `tsc`. Unblocked here by removing two stale worktrees rather than by changing the config,
  at the owner's call. **Trigger, not a date: the next time a worktree blocks a build**, add
  `.claude/worktrees/**` to the `exclude` array.
- **A reload landing on a still-mismatched build would loop.** Reasoned about above and judged
  unreachable; the pointer to the cheap fix is recorded there rather than built.
