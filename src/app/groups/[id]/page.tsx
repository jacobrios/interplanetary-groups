// src/app/groups/[id]/page.tsx
import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import CopyInviteLink from "./CopyInviteLink"

interface Props {
  params: Promise<{ id: string }>
}

export default async function GroupPage({ params }: Props) {
  const { id } = await params
  const group = await prisma.group.findUnique({ where: { id } })

  if (!group) notFound()

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
          Your group is ready
        </p>
        <h1
          style={{
            fontSize: "var(--type-display)",
            lineHeight: "var(--leading-tight)",
            fontWeight: 700,
            marginBottom: "2rem",
          }}
        >
          {group.name}
        </h1>

        <div
          style={{
            backgroundColor: "var(--surface-card)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "0.75rem",
            padding: "1.25rem",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
          }}
        >
          <div>
            <p
              style={{
                fontSize: "var(--type-label)",
                color: "var(--text-secondary)",
                marginBottom: "0.375rem",
              }}
            >
              Invite link
            </p>
            <p
              style={{
                fontSize: "var(--type-body)",
                color: "var(--text-primary)",
                wordBreak: "break-all",
              }}
            >
              {/* Path only — CopyInviteLink builds the full URL client-side */}
              /join/{group.inviteToken}
            </p>
          </div>

          <CopyInviteLink inviteToken={group.inviteToken} />
        </div>

        <p
          style={{
            fontSize: "var(--type-meta)",
            color: "var(--text-secondary)",
            marginTop: "1.25rem",
          }}
        >
          Share this link with the people you want to invite. Anyone with the link
          can join.
        </p>
      </div>
    </main>
  )
}
