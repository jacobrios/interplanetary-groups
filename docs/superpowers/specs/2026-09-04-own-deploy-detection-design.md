# The product notices its own new deployment

Slice branch: `own-deploy-detection`, cut from `main` at `445c9b5`.
Test-suite baseline on `main`: **1814 passing across 153 files, 0 failing** (run on `main` at `0f084a8`;
the two commits since are documentation only). Re-run on the branch before any code lands.

---

## Front section

**Settled, do not relitigate.** Next's own version-skew reload cannot fire on this product: Vercel's
Skew Protection pins every framework-managed request back to the deployment the tab booted from, so
the poll's response always reports the id the tab already holds. Proven in production, with a
redeploy watched on a phone and a three-way probe. **A `fetch()` we write ourselves is not
framework-managed and is therefore not pinned** (proven the same way), which is the entire opening
this slice uses. The trigger is the owner's: **check on tab return and about once a minute while the
tab is visible, and reload only when it is safe**, so a member who is mid-message gets the fix the
moment they stop. Group home only. *(Widened after review: "safe" was first written as composer empty
plus no send in flight, which is the chat only. It now also covers an open modal and focus sitting in
any text field, because the email sign-in sheet holds a typed address and a code step in memory, and
returning from the mail app is exactly when a check fires.)*

**Non-goals.** Screens other than the group home (belongs to whichever slice gives them polling).
Restoring scroll position across the reload (its own problem, unsolved either way). Turning Skew
Protection off, or shortening its max age, both weighed and declined. Touching `next.config.ts`.

**Verification.** The compare-and-decide logic gets unit tests, each mutation-proved. **The endpoint
being unpinned, and the reload actually happening, are proved in production by a real redeploy,
before anything claims to work.** No local run will be offered as sufficient; that is the exact
mistake this slice exists to repair.

**Debt expected.** A per-tab reload cap that can be reached; one small request a minute per open tab.

---

## Why this slice exists, and the mistake it is repairing

The previous slice recorded that a deploy already reached an open group home. It does not, and the
correction is in `docs/build-notes.md` §11. The short version: Vercel pins each tab to its own
deployment, so the mismatch Next reacts to never occurs. **The probe that produced the wrong answer
used a deployment id that does not exist**, and nothing can be pinned to a deployment that is not
there, so the request fell through to the current build and its 200 was read as proof of no pinning.

That failure sets one non-negotiable constraint on this document: **every claim this slice makes about
Vercel must be tested against Vercel, with a probe capable of returning the answer we do not want.**
A local `next start` has no routing layer and cannot falsify anything here.

### The three facts this design stands on, all measured in production

| Request carries | Answered by |
|---|---|
| The **previous real** deployment id | **That old deployment** — pinned |
| A **bogus** id | The current deployment — fallback, and the trap |
| **No** id, which is what a plain `fetch()` sends | **The current deployment** |

Row three is the design. Additionally checked, because it would have quietly broken everything: the
production site sets **no `__vdpl` cookie**, so nothing pins our own fetch either.

---

## Task 1 — an endpoint that says which deployment is currently live

**File:** `src/app/api/deployment/route.ts` (new).

A `GET` returning the current deployment's identifier, read from `process.env.VERCEL_DEPLOYMENT_ID`,
which Vercel documents as available at both build and runtime. Shape it as JSON (`{ "id": "dpl_…" }`)
rather than bare text, so a later field can be added without breaking a deployed client that is, by
the nature of this feature, always older than the server answering it.

**Constraints, each with its reason:**

- **`Cache-Control: no-store`, and the route must be dynamic.** A cached response is a stale answer,
  and a stale answer here means either a missed deploy or, worse, a reload loop. This is the single
  most important line in the file.
- **Return `null` (200, not an error) when the variable is absent**, which is the local-development
  case. The client must read that as "detection is off", never as "a new deployment exists".
- **No database access, no auth, no session read.** It must stay a trivially cheap public endpoint,
  and it leaks nothing: a deployment id is already visible in the HTML of every page.
- **Do not make this a static file.** It was considered, since a CDN-served asset would be cheaper
  than a function invocation. Rejected for this slice: static assets are the very thing Next appends
  `?dpl=` to, which puts the answer back inside the pinning machinery this design is routing around.
  The cost lever, if it is ever needed, is the check interval, not the transport. Say so in the file.

**Tests:** returns the id when the variable is set; returns null when it is not; sets `no-store`. Each
mutation-proved. The `no-store` test matters most and is the one most likely to be written vacuously
— assert the header's actual value, not merely that a header exists.

---

## Task 2 — the decide-and-reload logic, as a pure function first

**File:** `src/lib/deploy/should-reload.ts` (new), plus tests.

Keep the decision out of the component so it can be tested honestly. Signature roughly:

```
decideReload({ bootedId, currentId, composerHasText, sendInFlight, alreadyReloadedFor, reloadCount })
  -> { reload: boolean, reason: string }
```

**The rules, and why each exists:**

1. **Either id missing or equal → do nothing.** Covers local development, a failed fetch, and the
   ordinary case.
2. **Composer has text, a send is in flight, a modal is open, or focus is in a text field → wait.**
   The owner's chosen behaviour: a member mid-message is not interrupted and gets the fix the moment
   they stop. Note the draft itself would survive a reload anyway since the previous slice; the reason
   to wait is the *rest* of the state, which nothing parks. *(The modal and focus halves were added
   after review found the first version reloaded a member out of the half-completed email sign-in
   sheet, destroying a typed address and a pending code step. The modal check is a DOM query for
   `[role="dialog"]` rather than a threaded prop, deliberately: it covers every modal nobody has
   written yet, and a new one earns the protection by being accessible rather than by remembering a
   rule. Known and accepted limit: the chip components dispatch server actions neither signal sees, and
   a reload mid-tap loses far less, since the vote either landed or it did not.)*
3. **`alreadyReloadedFor === currentId` → never again, permanently for this tab.** The critical guard.
   If a reload lands on a build that still reports a different id, nothing in the browser would stop
   this from firing every minute forever, which is worse than the bug. Persist the id we reloaded
   *for* in `sessionStorage` and refuse to reload for it twice.
4. **A hard per-tab cap (3) → stop.** Belt to rule 3's braces, against a case rule 3 cannot see, such
   as ids that keep changing because something upstream is misconfigured. Reaching the cap is
   registered debt, not an error to surface: a member who hits it is exactly where they were before
   this slice existed.

**Corrected after review, and this is the honest shape of the safety story: rules 3 and 4 are not two
independent guards, they are one.** Both the reloaded-for record and the count live in the same
`sessionStorage`, so they fail together. A read that throws is safe, because the component then does
nothing at all (fail-closed, verified). The one route to a loop that remains is a browsing context
whose writes appear to succeed but do not survive the navigation: every guard would then read empty on
every load, and the tab would reload once a minute for its life. Nothing in the suite can test that,
because jsdom cannot navigate, so the only instrument is Task 4's step 7 below. Presenting this as
three guards would have been the more comfortable sentence and the wrong one.

**Tests:** one per rule, plus the two-ids-equal case and the missing-id case, each mutation-proved.
Rule 3's test must prove the *negative* properly — that a second reload for the same id does not
happen — and must be shown red with the guard removed.

---

## Task 3 — wire it into the group home

**Files:** `src/app/groups/[id]/DeployWatch.tsx` (new), `src/app/groups/[id]/GroupHome.tsx`,
`src/app/groups/[id]/page.tsx`.

A component that renders nothing, modelled on `LiveRefresh` and `SeenMarker`, which are this
codebase's established pattern for exactly this. It must not be folded into `LiveRefresh`: that file
carries hard-won reasoning about refresh back-pressure and a serial action queue, and this concern
shares none of it.

- **The tab's own id comes from the server render**, read in the page's server component from
  `process.env.VERCEL_DEPLOYMENT_ID` and passed down as a prop. That value is the build that rendered
  this document, which is exactly the comparison we want.
- **Checks on `visibilitychange` to visible, and on an interval of 60s while visible.** Never while
  hidden: a hidden tab costs battery for a screen nobody is reading, the same rule `LiveRefresh`
  already follows and for the same reason.
- **`composerHasText` and `sendInFlight` come from `GroupHome` as props**, the same way `LiveRefresh`
  takes `paused`. `GroupHome.tsx:160` already owns `inputValue`, and `sendsInFlight` already exists.
  Do not reach into either from this component.
- **Every failure is silent.** A failed fetch, a malformed body, a thrown storage accessor: all mean
  "do nothing this tick". This feature must never be able to break the group home, because a member
  cannot even report a bug from a screen that will not load.
- **`window.location.reload()`**, not `location.replace`, and no confirmation dialogue.
- Tear down the interval and the listener on unmount without exception. A dangling timer in this repo
  blocked a safety-net hook once already.

**Tests:** that the component fetches on becoming visible, does not fetch while hidden, and calls
reload only when the decision function says so. Mutation-prove each. **Do not mock the decision
function away** — that would leave the wiring untested, which is the shape of test this project has
been repeatedly burned by.

---

## Task 4 — prove it in production, and do not claim it works before this passes

No code. This is the task the previous slice got wrong and it is the reason this document exists.

1. After merge and deploy, capture the live deployment id (`curl … | grep data-dpl-id`).
2. Open the group home on a phone, leave it in the foreground, and **type a message without sending
   it**, so the wait-until-safe rule is exercised rather than assumed.
3. Redeploy from the Vercel dashboard. Capture the new id and confirm it differs.
4. **Expected: nothing happens while the text is in the composer.** That is the first result to record,
   and it is a real result, not a failure.
5. Clear the composer. **Expected: within about a minute, the tab reloads by itself.**
6. Confirm afterwards that the tab is on the new deployment, not merely that something flickered.
   Reading `data-dpl-id` from the served HTML is not enough; check something the tab itself reports.

7. **Then redeploy a SECOND time and confirm the tab reloads exactly once more, not repeatedly.** Added
   after review, and it is the only check anywhere that can catch the single point of failure named
   above: if the tab's record of what it already reloaded for does not survive a real navigation, the
   tab reloads every minute forever, and steps 1-6 pass identically whether it survives or not. Watch
   the tab for a further two minutes after that second reload settles. **Nothing further should
   happen.** If it reloads again unprompted, stop and report; that is the failure this whole guard
   exists for.

**If any step fails, the slice reports it and stops rather than working around it.** In particular, if
step 5 does not happen, the likeliest cause is that our own fetch is being pinned after all, and the
probe for that is a request carrying a **real previous** deployment id, never a synthetic one.

---

## Task 5 — the record

- **`CLAUDE.md`**, "Where the build is": what now happens and when, that it is our own mechanism rather
  than Next's, and the two things it does not cover (other screens, scroll position).
- **`CLAUDE.md`** queue paragraph: **the duplicate-name join check as the owner's next slice**, stated
  by him on 4 Sept 2026. Its full investigation and all five settled decisions are already in
  `docs/build-notes.md` under "Queue notes, 4 September 2026"; what is missing is the queue line that
  makes a session play it back. Declared out of lane in the PR body. Recorded here because this is the
  second time in one day that something was thoroughly documented in a file that is consulted and
  absent from the file that loads.
- **`docs/build-notes.md`** §11: the reasoning, the production numbers from Task 4, and the cost note.
- **No migration, no environment variable to set** (`VERCEL_DEPLOYMENT_ID` is supplied by Vercel), so
  **no deploy obligation and nothing for the after-launch list.** Say so explicitly in the PR body.

---

## Debt this slice opens

- **One small request a minute per open, visible tab.** Negligible at this product's size and on the
  Pro plan, and the lever if it ever matters is the interval, not the transport. Worth a line in the
  record so a future reader knows it was a choice.
- **The per-tab reload cap can be reached**, after which that tab behaves exactly as it did before this
  slice. Silent by design.
- **Scroll position is still lost on reload**, unchanged by this slice and now the only remaining
  user-visible cost of a reload.
- **A member who never leaves the tab and never stops typing never gets the fix.** Accepted; the
  alternative is interrupting them.
