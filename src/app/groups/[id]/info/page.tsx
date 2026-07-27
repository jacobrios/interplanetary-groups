// src/app/groups/[id]/info/page.tsx
//
// Group info stub — the minimal bridge page that keeps the invite link
// reachable after /groups/[id] became the real home screen.
//
// This stub is deliberately minimal: it carries only the invite-link UI
// (founder-gated, as before) and routes to it via the header chevron.
// The full group-info design (group emblem, member list, founder powers,
// leave button) is a deferred slice; this page grows in place rather than
// being replaced.  See §11 group-home-chat slice entry.
//
// Whether members (not just founders) should be able to surface the invite
// link here is a group-info-slice product decision; the founder-only gate
// is preserved from the prior stub intentionally.

import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth/current-user"
import CopyInviteLink from "../CopyInviteLink"
import PageHeader from "@/components/PageHeader"
import BackLink from "@/components/BackLink"

interface Props {
  params: Promise<{ id: string }>
}

export default async function GroupInfoPage({ params }: Props) {
  const { id } = await params

  const group = await prisma.group.findUnique({ where: { id } })
  if (!group) notFound()

  const viewer = await getCurrentUser()
  const isFounder = viewer?.id === group.founderId

  return (
    <main
      style={{
        minHeight: "100dvh",
        backgroundColor: "var(--surface-page)",
        color: "var(--text-primary)",
        display: "flex",
        flexDirection: "column",
        fontFamily: "var(--font-geist-sans, system-ui, sans-serif)",
      }}
    >
      {/* Back to the group home (walkthrough screen 10). The design labels
          the back link with the group's own name and centers nothing; the
          previous hand-written header read "Back" with the name centered
          beside it, which no design called for. */}
      <PageHeader>
        <BackLink href={`/groups/${group.id}`} label={group.name} />
      </PageHeader>

      <div
        style={{
          padding: "1.5rem 1rem",
          width: "100%",
          maxWidth: "28rem",
          margin: "0 auto",
        }}
      >
        {/* Invite link — founder only (same gate as the prior stub) */}
        {isFounder && (
          <div>
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

              <CopyInviteLink inviteToken={group.inviteToken} />
            </div>

            <p
              style={{
                fontSize: "var(--type-meta)",
                color: "var(--text-secondary)",
                marginTop: "1.25rem",
              }}
            >
              Share this link with the people you want to invite. Anyone with the
              link can join.
            </p>
          </div>
        )}

        {!isFounder && (
          <p
            style={{
              fontSize: "var(--type-body)",
              lineHeight: "var(--leading-normal)",
              color: "var(--text-secondary)",
            }}
          >
            Group info coming soon.
          </p>
        )}
      </div>
    </main>
  )
}
