// src/components/MembersOnlyWall.tsx
//
// The wall a non-member (or a signed-out member) sees in place of any group
// surface. Deliberately reveals nothing about the group: no name, no member
// count, no confirmation beyond the screen itself that the URL is real. The
// "ask for the invite link" line is also the honest way back in for a member
// who lost their session, until email sign-in exists (post-MVP email arc).

import OrbitNoteScreen from "./OrbitNoteScreen"

export default function MembersOnlyWall() {
  return (
    <OrbitNoteScreen
      eyebrow="Invite only"
      note="This group is invite-only. If you know someone in it, ask them for the invite link, it'll bring you right in."
      linkHref="/create"
      linkLabel="Start your own group"
    />
  )
}
