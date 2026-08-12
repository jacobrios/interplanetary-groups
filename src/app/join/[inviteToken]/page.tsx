// src/app/join/[inviteToken]/page.tsx
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth/current-user"
import JoinForm from "./JoinForm"
import OrbitNoteScreen from "@/components/OrbitNoteScreen"

interface Props {
  params: Promise<{ inviteToken: string }>
}

export default async function JoinPage({ params }: Props) {
  const { inviteToken } = await params
  const group = await prisma.group.findUnique({ where: { inviteToken } })

  if (!group) {
    // Orbit speaks here, unlike on the not-found and error screens: a real
    // person is trying to join a real group, and a warm voice genuinely
    // helps.
    //
    // A labeled note, not a bubble (OrbitNoteScreen). CLAUDE.md allows a
    // bubble only when the user's next on-screen action responds to Orbit,
    // and there is nothing to reply to here, so a bubble would promise a
    // conversation that cannot happen. Same treatment as the note on
    // walkthrough screen 09.
    //
    // The onward link points at /create rather than "/" so the label does
    // exactly what it says. Step 1 of the wizard now has its own way out,
    // so someone who would rather look around first is not trapped.
    // Deliberately not teal: what this person wanted was to join a group,
    // and teal would oversell a consolation prize.
    return (
      <OrbitNoteScreen
        eyebrow="Invite link"
        note="This invite link isn't working. Ask whoever sent it to share it again and I'll get you into the group."
        linkHref="/create"
        linkLabel="Start your own group"
      />
    )
  }

  const user = await getCurrentUser()

  return (
    <JoinForm
      groupName={group.name}
      inviteToken={inviteToken}
      currentName={user?.name ?? null}
    />
  )
}
