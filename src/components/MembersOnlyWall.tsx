// src/components/MembersOnlyWall.tsx
//
// The wall a non-member (or a signed-out member) sees in place of any group
// surface. Deliberately reveals nothing about the group: no name, no member
// count, no confirmation beyond the screen itself that the URL is real.
//
// The real way back for a member who lost their session is /signin (built
// 27 Aug 2026): a typed email code, not a link, that upgrades their existing
// identity in place. It is the screen's primary onward door. "Start your own
// group" stays as a quieter secondary link for a genuine stranger who never
// belonged to this group in the first place, for whom starting one really is
// a next step; it is deliberately no longer the primary way out, because
// offering it first to a returning member is what used to invite them to
// duplicate themselves into a second group.
//
// Says nothing stronger than "you can sign in" to the person reading it:
// many members never attach an email (it is optional forever), so this note
// never promises a door that a given visitor may not actually have.

import OrbitNoteScreen from "./OrbitNoteScreen"

export default function MembersOnlyWall() {
  return (
    <OrbitNoteScreen
      note="This group is invite-only. If you know someone in it, ask them for the invite link, it'll bring you right in. Been here before? You can sign in with your email."
      linkHref="/signin"
      linkLabel="Sign in"
      secondaryLinkHref="/create"
      secondaryLinkLabel="Start your own group"
    />
  )
}
