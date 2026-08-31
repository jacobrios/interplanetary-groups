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

// The note's first two sentences say who this screen is for and why; the
// third is the actual door back in. Split out for the bold treatment below.
const WHY_INVITE_ONLY =
  "This group is invite-only. If you know someone in it, ask them for the invite link, it'll bring you right in. "

// Bolded as of 31 Aug 2026 (owner QA on PR #91): as one flat paragraph this
// sentence was easy to skim past, and it is the one that actually gets a
// returning member back in as themselves instead of duplicating them.
// Styled to match, not a bare <strong>: JoinForm.tsx already uses this exact
// treatment (brighter --text-primary plus fontWeight 700) to make "Joining
// as {name}" stand out inside a --text-secondary paragraph, so this reuses
// it rather than introducing a second way of marking emphasis. A plain
// <strong> would only bump weight and leave the color unchanged, reading
// less distinct against the rest of the note.
const SIGN_IN_DOOR = "Been here before? You can sign in with your email."

export default function MembersOnlyWall() {
  return (
    <OrbitNoteScreen
      note={
        <>
          {WHY_INVITE_ONLY}
          <span style={{ color: "var(--text-primary)", fontWeight: 700 }}>{SIGN_IN_DOOR}</span>
        </>
      }
      linkHref="/signin"
      linkLabel="Sign in"
      // "Sign in" is the real action on this screen (CLAUDE.md: teal marks
      // a weight that genuinely matters); "Start your own group" stays the
      // quiet secondary link below, since starting a second group really
      // is secondary here.
      linkVariant="button"
      secondaryLinkHref="/create"
      secondaryLinkLabel="Start your own group"
    />
  )
}
