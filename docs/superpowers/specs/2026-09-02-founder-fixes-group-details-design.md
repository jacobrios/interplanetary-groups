# Group details editing (founder fixes group details)

Designed 2 Sept 2026 and parked; resumed and redesigned 24 Sept 2026 on branch
`group-details-editing`, after the editable event card (PR #137) changed the
ground under it. The 2 Sept version is in git history; what changed and why is
in "Lineage" at the foot of this front section.

---

## Front section

**Settled with the owner, 24 Sept 2026. Do not relitigate.**

1. **The founder alone edits, on group info, in place.** A quiet "Edit group
   details" link under the card turns the card into the form, with a
   "Never mind | Save" band (the event card's pattern). Members see nothing new.
2. **Also on onboarding step 2**, per activity, behind a quiet "Change day or
   time" link.
3. **Editable:** group name, and for every activity its name, days, time and
   spot. Not cadence, not timezone.
4. **The first activity's spot stays required** at creation and cannot be
   cleared in the editor.
5. **This week's plan:** one question, "Update that one too, or leave it?".
   Spot and name apply directly, RSVPs untouched. Day or time opens the group
   vote with the founder counted yes; the founder is never marked coming.
   Not asked once the plan has started. A vote that clears its bar the
   moment it opens moves the plan at once (also fixing the event card's
   solo-group dead end, declared in the PR).
6. **Chat: one Orbit message naming the founder**, carrying the vote chips
   when it moves the plan. Silent while the founder is alone, and for a rename.
7. **Orbit's chat declines are unchanged.** No bench runs.
8. **Days use the gauge chips** as seven toggles. Mocks approved as drawn.

**Non-goals, and where they belong.** Orbit acting on day or spot changes in
chat: verbal group two. Timezone and cadence editing: their own slices.
Member editing: contradicts 1. Server-side enforcement of the required spot:
debt, below.

**Verified by.** Tests: the validator; the founder gate; the message composer
(one message, founder named, silent alone and on rename); each state of the
plan question; the founder's yes never becoming an RSVP; a vote that clears
at birth moving the plan. Not tested: the native pickers, and rendering, which
get the 375px pass and a real-phone pass.

**Debt expected.** The required spot is enforced in the browser only; only the
first activity ever schedules; no edit history; a member still cannot change
the regular schedule anywhere.

**Lineage.** 2 Sept had a separate `/edit` screen, a direct plan move, a
rewrite of Orbit's declines and a "tell Orbit" line for members. The event card
made day and time a group decision, already rewrote the declines, and the line
was deleted as untrue.

---

## Tasks

*To be written by the planning step (writing-plans) once the owner has
reviewed the front section above.*
