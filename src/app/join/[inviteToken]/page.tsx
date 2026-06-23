// src/app/join/[inviteToken]/page.tsx
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth/current-user"
import JoinForm from "./JoinForm"

interface Props {
  params: Promise<{ inviteToken: string }>
}

export default async function JoinPage({ params }: Props) {
  const { inviteToken } = await params
  const group = await prisma.group.findUnique({ where: { inviteToken } })

  if (!group) {
    return (
      <main
        style={{
          minHeight: "100dvh",
          backgroundColor: "var(--surface-page)",
          color: "var(--text-primary)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem 1.5rem",
          fontFamily: "var(--font-geist-sans, system-ui, sans-serif)",
        }}
      >
        <div style={{ width: "100%", maxWidth: "28rem" }}>
          <p
            style={{
              fontSize: "var(--type-eyebrow)",
              lineHeight: "var(--leading-normal)",
              color: "var(--text-secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: "0.5rem",
            }}
          >
            Invite link
          </p>
          <p
            style={{
              fontSize: "var(--type-body)",
              lineHeight: "var(--leading-normal)",
              color: "var(--text-secondary)",
            }}
          >
            This invite link isn&apos;t valid. Ask whoever sent it to share it again.
          </p>
        </div>
      </main>
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
