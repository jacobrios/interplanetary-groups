# App-wide navigation: a front door and a way back

*Design spec. 27 July 2026. Settled with the product owner before any code, in a decisions-only session; this document records those decisions and the scope they define. The implementation plan (`docs/superpowers/plans/`) is written from this document; where the two differ, this one is the intent.*

---

## What this slice is

The product has no shared chrome. `src/app/layout.tsx` renders bare `{children}`, there are no nested layouts, and so navigation has been hand-written per screen. Any screen whose author did not write a header simply has none. Of six routes, exactly two navigate correctly. `next/link` is imported once in the entire codebase.

This slice builds the shared chrome that was never there, and then uses it to close every dead end at once: a real front door at `/`, a way back from event detail and from create step one, a way out of a bad invite link, and the two missing route boundaries so a wrong id or a crash lands somewhere with an exit instead of Next's unbranded default.

It is one problem, not five. The five symptoms have one structural cause, and fixing them individually would mean bolting a link onto each screen and leaving the cause in place. Found by the product owner during QA of spark part two, then audited across the whole app; the full audit is recorded in build-notes §8 under "Navigation is missing on most screens."

## What the design already answers, and what it does not

The expectation going in was that the mockups predate these screens and would be silent. They are not, and building on the assumption would have meant inventing decisions that were already made. All five design crops were rendered (not grepped, not assumed) before this spec was written.

The mockups answer four of the six screens:

- **Screen 09, event detail** carries a header reading `‹ Climbing Crew`: back chevron, group name, left-aligned, one line, no avatar. The screen that stranded the owner was drawn *with* a way back. This is an unbuilt decision, not a new one.
- **Screen 10, group info** carries the identical header. What shipped instead reads `‹ Back` with the group name centered, so the built screen deviates from its own design.
- **Screens 01 to 04, the create wizard** carry Orbit's avatar, the word "Orbit," and a `STEP N OF 3` subline. Step 1 has no back chevron; steps 2 and 3 have one, sitting to the left of the avatar. The design shares the step-1 gap rather than solving it.
- **Screen 05, the join screen** deliberately carries no header at all. A stranger arriving from a link gets no chrome.
- **Screens 06 to 08, group home** carry Orbit's avatar, `Climbing Crew ›`, and a subline reading `8 members · group info & invite link`.

Genuinely undesigned, and therefore decided here: `/`, page-not-found, the error screen, and the bad-invite-link state.

**The structural read that follows from the mockups.** There are two header shapes and they split on hierarchy. A *root* header (a mark, a title, a subline, no back) belongs to group home and to the create wizard. A *child* header (`‹ parent name`) belongs to event detail and group info. That grammar is inherited from the design, not invented for this slice.

## Settled decisions

**Back is a fixed parent link, never browser-history back.** The design draws a named parent (`‹ Climbing Crew`), not a generic arrow, and history-back is unpredictable in exactly the case that matters: arrive at an event from a shared link and history-back throws you out of the product entirely. Event detail always goes to its own group's home.

**The shared piece owns the bar, not the content.** One component owns only the rules of the header bar: its breathing room, the hairline beneath it, that it does not scroll away with the page, and that it grows with whatever is placed inside it. It has no title slot, no trailing-action slot, and no opinion about what opens group info.

The rejected alternative was a single configurable header that knows each screen and switches on a variant. It has fewer call-site lines and it would have to know about group info links, invite-link sublines, wizard step counts, and which screens have none of those. Every future screen's exception would land inside one file. It is also the version most likely to swallow the group home's title chevron, because the chevron would become a thing the header does rather than a thing the group home does. Holding the boundary at "the bar, and nothing else" is what makes that structurally impossible instead of merely discouraged.

**No header goes into the root layout, and no screen has chrome imposed on it.** Each screen opts in. The join screen keeps exactly zero header, as drawn, and so does the front door. This is also what keeps the bar from costing real estate it has not earned: it owns no height, so event detail's header is as tall as its one line of text plus padding, and the group home's is taller only because it holds two lines of its own content. This follows the standing rule from the visual-language phase, that layout grows with content and never clips, using min-height plus padding rather than fixed heights (§7).

The one cost worth naming, because it is a decision rather than a discovery: event detail's header takes roughly 48px out of that screen's scroll area. The alternative was the browser back button, which is what the owner found unacceptable during QA.

**The create wizard gets an exit on step 1 only.** Steps 2 and 3 already have a way backwards within the flow ("Edit my description"). Adding a leave-the-flow link on those steps would give a founder three steps into describing their group a control that silently discards all of it with no warning, which is worse than no exit. The design agrees: its later steps carry back-within-flow, never an exit. Step 1, where nothing is invested, gets a way out.

A consequence, accepted rather than solved: leaving step 1 after typing a description also loses that text. No confirmation dialog is being added for it.

**The create exit is a text link at the bottom of step 1, not a bar at the top, and it does not use the shared header.** This was settled while reading the code rather than in the session, and it is a change from the first draft of this spec. Three reasons, in order of weight. The create flow already has its own idiom for going backwards: "Edit my description" is a bottom-anchored underlined text link on steps 2 and 3, so a bottom-anchored exit on step 1 is the flow speaking its own established language. Placing it inside `Step1Describe`, which only renders on step 1, makes "step 1 only" structural rather than a conditional somebody can later get wrong. And the top-of-screen position on `/create` is spoken for: the design puts Orbit's avatar and `STEP N OF 3` there, which the onboarding-share-moment slice has to build, so putting a bar there now would be squatting on that slice's decision.

The alternative considered and rejected was rendering the shared bar at the top of `/create`. It cannot be done from the page shell, because the page is server-rendered and the step lives in client state, so it would have forced the wizard to take over the page's heading and column. That restructure would have moved "Start your group" out of the shell as a side effect, which is a visible change to steps 2 and 3 with no navigation value.

**`/` is a session-aware front door, not a static landing and not a bare redirect.** A session with a group is sent straight in. A session without one gets the front door. This is the decision the other four dead ends hang off, which is why it was settled first: it makes the Orbit logo a genuine home button today, and it gives the bad-invite exit, the not-found exit, and the error exit one honest destination that is correct whether or not the visitor has ever used the product.

The rejected alternatives were a static landing everyone sees (a returning member lands on marketing copy and has to find their own way in) and a pure router with no landing (a reviewer opening the deployed URL is dropped into a form with no idea what the product is, and "back to the app" from a 404 would shove them into onboarding).

**Orbit speaks on the bad invite link and stays off the technical failures.** Orbit's presence means something is being handled for you, and Orbit did not break a mistyped URL; putting its face on a crash makes it look less competent than it is. The bad invite link is different, because a real person is trying to join a real group and a warm voice genuinely helps there.

Character in the writing is separate from Orbit's presence, and both broken screens get it. The objection being answered is to cold copy, not to unbranded copy: "That page isn't here" rather than "404 Not Found," with no Orbit face and no first person.

**On the bad invite screen Orbit leaves a note, not a bubble.** CLAUDE.md's rule is that a bubble is only correct when the user's next on-screen action responds to Orbit. On this screen there is nothing to reply to, so a bubble would make a promise it cannot keep. It uses the `A NOTE FROM ORBIT` treatment already drawn on screen 09. This is the same failure the rule was written to prevent, caught here before it shipped rather than after.

## The shared pieces

Four small components and a directory to hold them, and that is the whole structural change.

- **The bar.** Owns the header bar's rules and nothing else, per the decision above.
- **The child header.** Renders `‹ label` inside that bar, taking a destination and a label. Used by event detail and group info.
- **The chevron.** One icon with a direction, replacing the two hand-inlined copies that today differ only in their path data and in which one carries a color.
- **The dead-end screen.** The centered heading, explanation, and action row shared by the not-found and error boundaries. It exists because those two screens are otherwise near-identical files, and shipping the duplication this slice is built to remove would be a poor joke.
- **A home for them: `src/components/`.** This directory does not exist yet; every component today sits beside the one screen that first needed it. This slice creates the product's first genuinely shared UI, which is what earns the directory.

Deliberately not moved: build-notes §11 invites relocating `RsvpControls` into a shared directory "when the next refactor opens that area," and this slice technically opens it. It stays where it is. Moving it is not navigation, and it would put unrelated churn in a diff whose whole value is being reviewable as one idea.

## Screen by screen

| Screen | What changes |
|---|---|
| **`/`** | New. Session-aware: a session with a group redirects in; without one, the front door renders. No header. |
| **`/events/[id]`** | Gains `‹ [Group name]`, pointing at that event's group home. The group relation is already loaded and the group's name is already rendered there as inert text, so this needs no new database query. |
| **`/groups/[id]/info`** | Header changes from `‹ Back` with a centered name to `‹ [Group name]` left-aligned, matching design 10. A visible change to a screen that already works, made to conform to its own design. |
| **`/groups/[id]`** | Keeps its own header, now sitting inside the shared bar. The Orbit logo becomes a real link to `/`, finally making it the home button CLAUDE.md already describes. The title chevron to group info is untouched. |
| **`/create`** | Gains an exit to `/` on step 1 only, as a bottom-anchored text link matching the flow's existing "Edit my description" idiom. Does not use the shared header; see the decision above. |
| **`/join/[inviteToken]`** | Valid invite: unchanged, stays headerless as designed. Bad token: Orbit's note plus a way out. |
| **not-found** | New root-level route boundary, catching all three existing `notFound()` calls (unknown group id in two places, unknown event id in one). |
| **error** | New root-level route boundary, catching any render error. |

Two small things ride along because they are the same problem: the two internal links that today use a raw anchor and cause a full page reload become real in-app links, which is the actual point of the slice; and the browser tab stops saying "Create Next App."

**One not-found page rather than per-segment ones.** Next would allow a group-specific and an event-specific version. One generic page is honest about both cases and is one file instead of three. Noted as a deliberate choice, so a later slice can split it without wondering whether the single page was an oversight.

**No global-error boundary.** The root error boundary does not catch a crash inside the root layout itself. That layout is a few lines of font wiring, so the uncovered case is close to theoretical; it is recorded rather than covered.

## The front door

Only visitors with no group ever see it, since anyone with a group is redirected past it. It is an uppercase eyebrow reading `INTERPLANETARY GROUPS` (the product's name has to appear somewhere, and the eyebrow is where this product puts that kind of label), the copy below, and one teal "Start your group."

> INTERPLANETARY GROUPS
>
> ### Casual plans shouldn't need a wedding planner.
>
> But the other option is "show up if you want," and then nobody does. Orbit picks a day, asks the group, and keeps track of who's in.

The copy was written to hold both halves of the founding complaint rather than only the organizer half: groups choose between coordination so casual that nothing happens and coordination so heavy it feels like planning a wedding for a casual Sunday. The headline carries the second pole and the first sentence carries the first, in the words real groups actually use. It names Orbit before a first-time visitor knows what Orbit is, which is deliberate: the join screen already introduces Orbit by name to strangers the same way, and the name doing a little work up front beats a coy "we."

Where `/` sends a session that has a group is a small piece of real branching logic, and the only part of this slice with any. One group goes to that group. Several go to the most recent, which is a placeholder for the multi-group home and is marked as one in the code; CLAUDE.md already names that screen as the fast-follow this decision is holding a seat for.

## The three broken screens

**Page not found.** No Orbit.

> **That page isn't here.**
> It might have been removed, or the link might have a typo in it.
>
> `Take me home` (teal)

**Something went wrong.** No Orbit.

> **Something broke on our end.**
> Not your fault. Try again, and if it keeps happening, give it a minute.
>
> `Try again` (teal) · `Take me home` (outlined)

"Take me home" points at `/`, so it is correct for everyone: into your group if you have one, to the front door if you do not. The same words on both screens, so it is learned once. The error screen's two actions are a teal primary plus an outlined secondary, the pattern the event card already uses.

**Bad invite link.** Orbit present, as a note.

> INVITE LINK
>
> **A NOTE FROM ORBIT**
> This invite link isn't working. Ask whoever sent it to share it again and I'll get you into the group.
>
> `Start your own group` (text link, to `/create`)

That link points at `/create` rather than `/` so the label does exactly what it says, and step 1's new exit means someone who would rather look around first can still get out. There is deliberately no teal action on this screen: what this person wanted was to join a group, and teal would be overselling a consolation prize.

## Engineering debt this slice pays down

**The repo gains the ability to test a component.** Vitest runs in a plain Node environment with no browser-like environment and no React testing library, so all 26 existing test files are pure logic in `src/lib`. This slice creates the product's first shared UI, which is exactly the kind of code where a change in one file quietly breaks a screen nobody thought to click.

Two dev dependencies (`jsdom` and `@testing-library/react`) plus a per-file environment comment in the new test files. The shared Vitest config is not touched, which is what keeps the 26 existing tests provably unaffected: the risk that argued for deferring this to its own slice does not exist once the config stays untouched.

The honest limit, recorded so this does not read as more than it is: this tests the small shared pieces. It cannot test the screens, which are server-rendered and talk to the database. The browser walk below remains the real proof of the slice, and these tests are the safety net for the shared pieces going forward. The payoff is mostly in later work: group info growing into its full page, the create header, the visual-polish pass.

## Not in this slice

- **The full designed create header** (Orbit's face, the word "Orbit," `STEP N OF 3`). The shipped wizard cannot honestly say "of 3" because the third step, the share-invite-link screen from mockup 04, was never built. Building the header here would quietly start the onboarding-share-moment slice, which is its own demo-critical register item and which has to build that header anyway. Choosing the plain exit now costs nothing except doing the rest later.
- **The group home's missing subline and Orbit's real avatar.** Both drawn, neither built; a letter-"O" div stands in for Orbit's face today. Real gaps against the design, and cosmetic, which is what the end-of-build visual-polish pass exists for. The one exception taken here is making that logo an actual link, because it is the home button and `/` will now exist for it to point at.
- **The duplicated page-shell styling.** The same six-property block (page background, text color, font stack, flex column) is copy-pasted across six files. Messy, adjacent to everything this slice touches, and not navigation. Recorded, not fixed, so the diff stays reviewable as one idea.
- **Membership gating on any of these surfaces.** A standing known gap with its own home in the access-control slice, not something this slice narrows or widens.

## How this gets verified

**Unit tested, written test-first and shown failing before the code exists.** Exactly one piece of this slice has real logic: where `/` sends you. It is extracted as a plain function in `src/lib` so it can be tested in the existing Node environment. Cases: no session goes to the front door; a session with no membership goes to the front door; a session with one membership goes to that group; a session with several goes to the most recent. Each case can genuinely fail, which is the bar.

**Component tested, using the tooling this slice adds.** The child header renders the label it is given, points at the destination it is given, and the chevron points the direction it is told to. Modest tests, and honestly labeled as modest: they are the regression net for the shared pieces, not the evidence that the slice works.

**Everything else is proven in a browser, with screenshots.** The remainder is link wiring, and clicking a link is stronger evidence than a test asserting a URL string. The walk: front door, into create, back out of create, into a group home, into an event, back to the group, into group info, back again. Then the three failure states: an unknown group id, an unknown event id, and a bad invite token. Screenshots accompany the claim rather than replacing it.

**A claim that any of this "matches the design" requires the rendered screen beside the design crop.** Two screens in this slice have a design to match (event detail's header and group info's corrected header) and the rest do not, so the claim is only made about those two.

## Debt this slice opens

**The multi-group placeholder.** A session belonging to several groups is sent to the most recent one. That is a guess standing in for the multi-group home, and it is the first place in the product where the many-to-many data model is visible in behavior without a screen designed for it.

**A front door with no design source.** It is the one screen here built without a mockup. The copy is settled and the layout is trivial, but it should be looked at during the visual-polish pass rather than assumed finished.

**Nothing in the not-found page knows what you were looking for.** A person who follows a stale event link is told the page isn't here, not that the event was cancelled, because the product cannot currently tell those apart. Worth knowing before anyone proposes a friendlier message.
