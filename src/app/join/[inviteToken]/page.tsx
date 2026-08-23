// src/app/join/[inviteToken]/page.tsx
import type { Metadata } from "next"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth/current-user"
import { parseStoredRhythms } from "@/lib/orbit/rhythm"
import { formatRhythmRow } from "@/lib/orbit/playback"
import JoinForm from "./JoinForm"
import OrbitNoteScreen from "@/components/OrbitNoteScreen"

interface Props {
  params: Promise<{ inviteToken: string }>
}

// The shared invite link's preview card. Orbit's voice, and it never
// distinguishes a dead token from a live one: a preview that said "invalid
// invite" would turn every mis-typed link into a probe. A failure here must
// never take the page down, so the lookup is best-effort.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { inviteToken } = await params

  const group = await prisma.group
    .findUnique({ where: { inviteToken }, select: { name: true } })
    .catch(() => null)

  if (!group) {
    return { title: "Interplanetary Groups" }
  }

  const title = `Join ${group.name}`
  const description =
    "You've been invited. No app to download, no password. You'll land right in the group."

  return {
    title,
    description,
    openGraph: { title, description },
    twitter: { title, description },
  }
}

export default async function JoinPage({ params }: Props) {
  const { inviteToken } = await params
  // One query, extended (visual-polish slice, task 2): the join screen now
  // shows what someone is joining before they join it, so it needs the
  // member count and the stored rhythms alongside the group row already
  // fetched here. _count needs an explicit include; recurringActivities is
  // already a scalar column returned by the unfiltered findUnique below.
  const group = await prisma.group.findUnique({
    where: { inviteToken },
    include: { _count: { select: { memberships: true } } },
  })

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
        note="This invite link isn't working. Ask whoever sent it to share it again and I'll get you into the group."
        linkHref="/create"
        linkLabel="Start your own group"
      />
    )
  }

  const user = await getCurrentUser()

  // Rhythm rows, reused verbatim from the group-info page (formatter-
  // composed, venue appended the same way) rather than a second formatter.
  //
  // Disclosure note (owner, 21 Aug, recorded here so it is not
  // rediscovered): this shows the group's rhythms and member count to
  // someone who is not yet a member. That is intended — the invite link is
  // the credential, and telling someone what they are joining is this
  // screen's whole job. It does not loosen the members-only wall, which
  // governs the group's own surfaces once someone has joined.
  const rhythms = parseStoredRhythms(group.recurringActivities) ?? []
  const rhythmRows = rhythms.map((r) => {
    const row = formatRhythmRow(r)
    return {
      label: row.label,
      value: r.venueName ? `${row.value} · ${r.venueName}` : row.value,
    }
  })

  return (
    <JoinForm
      groupName={group.name}
      inviteToken={inviteToken}
      currentName={user?.name ?? null}
      memberCount={group._count.memberships}
      rhythmRows={rhythmRows}
    />
  )
}
