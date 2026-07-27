// src/app/join/[inviteToken]/page.tsx
import Link from "next/link"
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
              marginBottom: "0.75rem",
            }}
          >
            Invite link
          </p>

          {/* Orbit speaks here, unlike on the not-found and error screens: a
              real person is trying to join a real group, and a warm voice
              genuinely helps.

              A labeled note, not a bubble. CLAUDE.md allows a bubble only
              when the user's next on-screen action responds to Orbit, and
              there is nothing to reply to here, so a bubble would promise a
              conversation that cannot happen. Same treatment as the note on
              walkthrough screen 09. */}
          <div
            style={{
              backgroundColor: "var(--surface-card)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "0.75rem",
              padding: "1.25rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.625rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span
                aria-hidden="true"
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  backgroundColor: "var(--color-lime)",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.5rem",
                  fontWeight: 700,
                  color: "#0a0a0a",
                }}
              >
                O
              </span>
              <span
                style={{
                  fontSize: "var(--type-eyebrow)",
                  color: "var(--text-secondary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                A note from Orbit
              </span>
            </div>
            <p
              style={{
                fontSize: "var(--type-body)",
                lineHeight: "var(--leading-normal)",
                color: "var(--text-primary)",
                margin: 0,
              }}
            >
              This invite link isn&apos;t working. Ask whoever sent it to share
              it again and I&apos;ll get you into the group.
            </p>
          </div>

          {/* Points at /create rather than "/" so the label does exactly what
              it says. Step 1 of the wizard now has its own way out, so
              someone who would rather look around first is not trapped.
              Deliberately not teal: what this person wanted was to join a
              group, and teal would oversell a consolation prize. */}
          <Link
            href="/create"
            style={{
              display: "block",
              width: "fit-content",
              margin: "1.25rem auto 0",
              padding: "0.25rem 0.5rem",
              color: "var(--text-secondary)",
              fontSize: "var(--type-meta)",
              lineHeight: "var(--leading-normal)",
              textDecoration: "underline",
            }}
          >
            Start your own group
          </Link>
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
