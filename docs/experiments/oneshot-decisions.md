# One-shot experiment decision log

*Preserved verbatim from the sealed one-shot experiment (July 2026), where this app was cloned into an isolated sandbox and its remaining features were built in a single pass with human review gates removed. This log was written live as that build ran and has not been edited or tidied.*

*The code it describes is not trusted and was never merged. This file is kept for its reasoning, not its conclusions. It is especially relevant as input to the founder onboarding slice, where it recorded calls on four questions that slice still has open: whether the share step is in scope, how a missing activity time is handled, timezone sequencing, and whether the group name is derived from the founder's description or typed. Treat every judgment in here as a starting point to be re-decided, not a decision already made.*

*Context: build-notes.md §11, "Sealed one-shot experiment (July 2026)".*

# DECISIONS.md · Interplanetary Groups

Live decision log for the gstack one-shot build. Entries are appended as decisions are made, not reconstructed at the end. For each: the decision, alternatives rejected, a one-line why, and how much deliberation it got (quick default vs. considered call).

---

## Onboarding

### Group name derived from description, not typed
**Decision:** Orbit extracts the group name from the founder's free-text description. There is no explicit "group name" text field.  
**Rejected:** A separate "Group name" text input (the current stub has this).  
**Why:** The designed flow in mockup-1 Step 1 is description-only with the founder's name. Typing a name separately would add a step that Orbit can handle. Matches the "Orbit handles the organizing burden" thesis.  
**Deliberation:** Quick default — this is clearly the designed intent from the mockup.

---

### Share step (Step 3) is in scope
**Decision:** After group creation, route to a `/create/share` page that shows the invite link prominently as the third step of onboarding.  
**Rejected:** Putting the share link directly on the group home. Considered: redirecting to `/groups/${id}?welcome=1` with a banner.  
**Why:** The mockup shows Step 3 explicitly as "Share the invite link" — a full dedicated screen. The share moment is a product milestone for the founder; it deserves its own step.  
**Deliberation:** Quick call — it's in the mockup.

---

### Timezone captured from browser in Step 1
**Decision:** `Intl.DateTimeFormat().resolvedOptions().timeZone` is read in the browser during Step 1 and passed as a hidden form field to the extraction call.  
**Rejected:** Asking the founder to pick a timezone explicitly; inferring from description.  
**Why:** Browser-inferred timezone is accurate for 99% of cases, requires zero founder input, and must be known to display the playback card correctly in Step 2. Asking explicitly would add friction for no gain.  
**Deliberation:** Quick default.

---

### Missing time/day → single gap-ask before proceeding
**Decision:** If Anthropic extraction returns `missingFields: ["timeLocal"]` or `["daysOfWeek"]`, the wizard stays on Step 1 and shows a focused clarifying prompt ("What time do you usually meet?" or "What days?"). The founder answers in the same text area and we re-extract.  
**Rejected:** Proceeding without a schedule (create group with no rhythm). Build-notes §5 says "ask if missing, don't guess" — this is a hard guardrail.  
**Why:** A group with no schedule gets no Orbit-created events on day one. The product's value (the home is alive on day one) depends on having a rhythm.  
**Deliberation:** Considered — the guardrail is explicit in build-notes §5.

---

### Onboarding is a single-page client wizard (no multi-route)
**Decision:** All three steps live at `/create`, managed by React `useState` for the current step. The group is created (server action) at the end of Step 2; Step 3 renders at `/create/share/[groupId]`.  
**Rejected:** Multi-route wizard at `/create/step-1`, `/create/step-2`, etc. Considered: URL state via searchParams.  
**Why:** Client state avoids back-button complexity and URL state management while keeping the wizard coherent. The share page needs its own URL because it's a shareable moment the founder lands on from the group home.  
**Deliberation:** Quick default.

---

### Extraction uses claude-haiku-4-5 (not claude-sonnet-4-6)
**Decision:** The Anthropic extraction call for onboarding uses `claude-haiku-4-5-20251001`.  
**Rejected:** claude-sonnet-4-6 (higher accuracy but 3-5x cost and latency).  
**Why:** Structured extraction from a short description is well within Haiku's capability. The onboarding prompt is simple and deterministic. Can upgrade if quality proves insufficient.  
**Deliberation:** Quick default.

---

## Spark flow

### Spark detection is Anthropic-powered (not regex-only)
**Decision:** When a MEMBER message passes a fast keyword pre-filter, an Anthropic call determines whether it's a spark (spontaneous event intent).  
**Rejected:** Pure regex matching; always calling Anthropic on every message.  
**Why:** Regex produces too many false positives/negatives for natural language intent. Always calling is expensive. The hybrid (keyword gate + Anthropic confirm) gives quality without cost on every message.  
**Deliberation:** Considered call — balancing quality and cost.

---

### Spark detection happens synchronously in the send-message action
**Decision:** The Anthropic spark-detection call runs inside the `sendMessageAction` server action, after the member's message is written. If a spark is detected, Orbit's gauge message is written before `revalidatePath`. The action takes ~2-3 seconds instead of ~500ms.  
**Rejected:** Fire-and-forget async (e.g., a separate webhook or queue). Requires WebSockets or polling for Orbit's response to appear without user refresh.  
**Why:** MVP simplicity. The optimistic member message appears instantly; the slight delay before `revalidatePath` refreshes the feed with Orbit's gauge is acceptable. No polling or WebSocket infra needed.  
**Deliberation:** Considered call — MVP simplicity over latency optimization.

---

### Gauge votes stored as GaugeVote rows (not message reactions)
**Decision:** `Gauge` and `GaugeVote` models in Prisma. Each chip tap creates a `GaugeVote` row with `@@unique([gaugeId, userId])`. Threshold is 3 IN votes (including initiator auto-vote).  
**Rejected:** Storing votes as special messages; storing votes as JSON in the gauge message.  
**Why:** Row-level storage is queryable (can derive counts), prevents double-voting via the unique constraint, and cleanly supports the auto-seed-RSVPs requirement (GaugeVote.IN → Rsvp.IN when event created).  
**Deliberation:** Quick default.

---

### Initiator auto-votes IN when gauge is created
**Decision:** When Orbit creates a gauge in response to a spark, the initiating member is automatically given a `GaugeVote` of IN. They don't need to tap the chip.  
**Why:** Build-notes §5 says "auto-seed RSVPs; never ask twice." The initiator expressed interest in their message; asking them to also tap a chip would violate this.  
**Deliberation:** Quick default — this is the spec.

---

## Timezone display fix

### format.ts signature updated to accept optional timezone
**Decision:** `formatEventDate` and `formatTime` gain an optional `timeZone: string` parameter (defaulting to `"UTC"`). All callers that have group context pass `group.timeZone`. `announce.ts` updated in lockstep.  
**Why:** Build-notes §11 flags this as CRITICAL COUPLING — timezone capture (onboarding writes `Group.timeZone`) and display fix must land in the same changeset. Shipping one without the other creates a visible calendar rendering bug.  
**Deliberation:** Quick default — the coupling is explicit in the spec.

---

## Visual polish

### Gradient page backgrounds + layered card depth
**Decision:** Page backgrounds use a subtle radial gradient (lime/teal tinted, very low opacity) over the dark base. Cards use a layered inner shadow + slightly brighter border on hover. Transitions on interactive elements (buttons, chips) use 150ms ease.  
**Rejected:** Flat-only dark (current state). Considered: full glassmorphism (too busy, violates minimalist bar).  
**Why:** The mockups show depth and richness the current flat theme doesn't match. Gradients at 3-5% opacity add presence without decoration.  
**Deliberation:** Considered — CLAUDE.md minimalist bar requires restraint. Every visual choice earns its place.

---

### No condensed event card after RSVP
**Decision:** Ship the full pinned card as drawn. Do not build the condensed post-RSVP state.  
**Why:** Build-notes §7 explicit open question: "do not build preemptively." This is a complexity-must-justify-itself call. The live app will tell us if it crowds the chat.  
**Deliberation:** Not a decision at all — following the explicit spec.

---

### Root route redirects to /create
**Decision:** `/` redirects to `/create` (the onboarding wizard). No landing page.  
**Rejected:** A marketing landing page; routing returning sessions to group home.  
**Why:** This is a portfolio MVP, not a launch product. The entry point is creating a group. A future fast-follow will detect an active session and route to group home instead; the backend is already group-aware per-session.  
**Deliberation:** Quick default.

---

### Leave group is a stub on group info
**Decision:** "Leave group" button renders for non-founder members but has no action wired up yet. It shows only for members with an active session.  
**Rejected:** Omitting the button entirely; implementing full leave logic.  
**Why:** Out of scope for MVP (no leave mechanic defined). The button's presence is correct product shape — a member should see it — but implementing it requires decisions about what happens to their RSVPs and messages that aren't made yet. Stub now, implement as a fast-follow.  
**Deliberation:** Quick call — standard "stub visible, defer logic" pattern for out-of-scope features.

---

## Bug fixes

### Empty home after onboarding: reconcile never fired at creation time
**Root cause:** `provisionFounderGroup` saves `recurringActivities` to the group row, but nothing calls `reconcileScheduledEvents` at that point. The only caller was the daily cron endpoint (`/api/cron/orbit`), so a new group would show "No upcoming events yet" until the cron fired — in local dev, never.  
**Fix:** `createGroupAction` now calls `reconcileScheduledEvents(new Date(), { groupId: group.id })` immediately after provision, narrowed to the new group so it doesn't touch other groups. `reconcileScheduledEvents` gained an optional `{ groupId }` filter for this. The call is wrapped in a non-fatal try/catch: if it fails, the group was still created and the cron will catch up.  
**Verified:** fresh test group with Mon/Wed/Fri 8am LA timezone rhythm → reconcile created the event and Orbit's announcement in one call → group home showed the event card.

---

## Visual pass (second, against actual mockups)

### Onboarding Step 2: playback rows inside the Orbit bubble, not a separate card
**Decision:** The extracted group name and label-value pairs (WHO/CLIMBS/etc.) render as content inside the Orbit bubble, not in a separate card below it. The "Looks right, set up invites" button sits below the bubble as a standalone teal button.  
**Rejected:** Separate card with teal card-footer band (what the first pass built; looks like a settings panel rather than a conversation).  
**Why:** Mockup screen 02 clearly shows the playback rows inside the bubble. The conversation stays in one voice — Orbit surfaces the extraction, the founder confirms or goes back.

### Gauge chips: real copy, 2 options
**Decision:** Two chips only — "Stoked this exists 🎉" (IN) and "I'm out" (OUT). No MAYBE chip rendered. Vote count shown inline when > 0 ("Stoked this exists 🎉 · 3").  
**Rejected:** Three chips labeled "I'm in!" / "Maybe" / "Next time" (first pass).  
**Why:** Mockup screen 07 shows exactly 2 pills with these exact labels. MAYBE stays in the data model for potential future use; we just don't surface it as a chip.

### Event card count format: counts in secondary color, not teal
**Decision:** The count string ("4 In · 1 Out · 4 TBD") renders in `--text-secondary`. The teal primary action on the card is the "I'm in" RSVP button, not the count.  
**Rejected:** Coloring the full count string teal when inCount > 0 (first pass).  
**Why:** Mockup shows counts in gray/muted. Teal on the count competes with the teal button and misrepresents a status label as an action.

### Group info emblem: circle, not rounded rectangle
**Decision:** The group emblem renders as a 56px circle (`borderRadius: "50%"`) with a lime gradient.  
**Why:** Mockup screen 10 shows the CC emblem as a circle. The rounded rectangle came from internalized "app icon" patterns, not from the mockup.

### Group info member list: horizontal name run, no avatars
**Decision:** Members are displayed as a single paragraph of names separated by double-spaces, matching the mockup's "Jacob Jessie Maya Sam Dev Pría" inline layout. No avatars, no vertical stacking.  
**Why:** Mockup screen 10 shows a horizontal inline run. The vertical list with avatars that the first pass built was a common pattern, not the designed one. The compact inline run reads faster and scans as a crew, not a roster.

### Share page (Step 3): "Take me to my group" is a text link
**Decision:** "Take me to my group" renders as a plain tertiary text link, not an outlined secondary button.  
**Why:** Mockup screen 04 shows the share action (copy link) as the teal primary and the navigation as a quiet link below it. An outlined button competes visually with the teal CTA.

### Join page: Orbit bubble copy uses dynamic group name
**Decision:** The Orbit bubble on the join screen uses the actual group name from the database, not the hardcoded "Climbing Crew" that was left in the first build.  
**Why:** The hardcoded copy was a copy-paste artifact from the mockup's sample data. Fixed to `Hey! Keep {groupName} running so nobody has to be the organizer.`

---

## Bug investigation (Orbit flow)

### Bug 1: Gap-ask gate did not enforce the missing-field requirement
**Root cause:** `handleGapSubmit` in `src/app/create/page.tsx` called `setStep("step2")` unconditionally after re-extraction, regardless of whether `data.missingFields` was still non-empty. A vague answer ("one sec, I'm not sure") would resolve as a new extraction with `missingFields` still populated, but the wizard advanced anyway. A second bypass existed: a "Skip for now" button that called `setStep("step2")` directly, without any extraction at all.  
**Fix:** `handleGapSubmit` now checks `data.missingFields.length > 0` before advancing. If fields are still missing, it stays on the gap step and sets `gapRetry = true`, which changes Orbit's prompt from "Got it, one question" to "I need a specific time/day to set up your schedule." The "Skip for now" button was removed entirely. Per build-notes §5 hard guardrail: "ask if missing, don't guess." A group without a complete rhythm gets no Orbit-created events on day one, defeating the core product value.  
**Deliberation:** Considered — the hard guardrail is explicit in build-notes §5 and in the existing DECISIONS.md entry above.

---

### Bug 3: No first event on group home after onboarding
**Root cause:** Downstream of Bug 1. The user could bypass the gap-ask (via "Skip for now"), creating the group with `recurringActivities = null`. The `createGroupAction` fix (see "Empty home after onboarding" entry above) calls `reconcileScheduledEvents` only `if (recurringActivities)`. With no schedule, reconcile was skipped, and the group home showed "No upcoming events yet" permanently.  
**Fix:** Bug 1 fix removes the bypass entirely. A group can now only be created after extraction produces a non-empty schedule. Once that is guaranteed, the existing `if (recurringActivities)` guard in `createGroupAction` fires correctly and seeds the first event.  
**Deliberation:** Confirmed as consequential — not a separate failure.

---

### Bug 2: Group chat — full investigation, awaiting browser verification
**Claim (user-reported):** Sending a message in the group home chat "does nothing" — the input clears on Enter and no Orbit reply appears.

**Investigation:**
1. *Data layer:* `createMessage()` with a real user ID and group ID completes and the row appears in a subsequent `findMany` query. Proven via vitest integration test.  
2. *Auth layer:* `prisma.user.findUnique({ where: { supabaseAuthId } })` correctly resolves a user from a fresh anonymous Supabase session. `supabase.auth.getUser()` returns a valid user for a new anonymous session. Both proven via vitest tests.  
3. *Code audit:* `sendMessageAction` validates auth, then calls `createMessage`, then runs spark detection (non-fatal catch), then calls `revalidatePath`. `GroupHome.tsx` uses `useOptimistic` correctly — the optimistic message persists until the transition settles; reversion only happens if the action returns `{ errors: { general: ... } }`. `ChatInput.tsx` captures the form's current DOM values correctly at submit time.  
4. *Proxy middleware:* `updateSession` refreshes the session and writes new cookies to both the request (for downstream server code) and the response (for the browser). It does not redirect on invalid sessions.  
5. *Error tracing added:* `sendMessageAction` now logs `[send-message] no supabase user` and `[send-message] supabase user found but no prisma user` to the server console with the exact auth error. If auth fails in a real browser flow, the dev server terminal will surface it.

**Could not verify:** The browser extension was not connected during this session, so the full browser flow (session cookie sent with Server Action POST, feed update after `revalidatePath`) could not be observed directly.

**Most likely failure mode (if still present):** The anonymous session cookies written by `createGroupAction` (via `supabase.auth.signInAnonymously()`) are not reaching the browser correctly when the Server Action redirects. This would cause `sendMessageAction` to return the "signed in" error, the optimistic message to revert, and an error message to appear below the input in red.

**How to verify:** Open the group home, send any message, and observe (a) whether a red error appears below the input, and (b) whether `[send-message]` appears in the dev server console output. If yes to (b), the error message on that line identifies the exact failure.

**Deliberation:** Extensive — full data layer, auth layer, and code audit performed. Browser verification deferred.

---

*Entries continue to be appended live during the build.*
