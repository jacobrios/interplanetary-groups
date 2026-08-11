// src/app/groups/[id]/info/page.tsx
//
// The full group-info page (walkthrough screen 10, grown in place from the
// invite-link stub per the group-info slice). The group's reference page:
// identity, members, standing rhythm, invite link, leave. Changing group
// details happens by telling Orbit in the chat, and the page says so.
//
// Visibility (spec decisions 3 to 5):
//   member          identity · invite+share · card · hint · Leave
//   founder         identity · invite+share+reset · card(+manage) · hint, NO Leave
//   non-member      identity · card · hint (no invite, no share, no Leave)
// Viewing stays ungated (standing access-control gap, by design); every
// mutation re-verifies membership/founder server-side in its own action.
//
// Design source: docs/design/group-info-handoff/wireframes/group-info.html.
// Deliberate deviations recorded in the spec (decision 1): real token URL,
// formatter-composed rhythm rows, shared header chrome, and the locked
// type scale over the wireframe's raw pixel sizes.

import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth/current-user"
import { parseStoredRhythms } from "@/lib/orbit/rhythm"
import { formatRhythmRow } from "@/lib/orbit/playback"
import { groupInitials } from "@/lib/groups/initials"
import PageHeader from "@/components/PageHeader"
import BackLink from "@/components/BackLink"
import ShareInviteLink from "./ShareInviteLink"
import LeaveGroupButton from "./LeaveGroupButton"
import ManageMembers from "./ManageMembers"
import ResetInviteLink from "./ResetInviteLink"

interface Props {
  params: Promise<{ id: string }>
}

export default async function GroupInfoPage({ params }: Props) {
  const { id } = await params

  // Single read: group + memberships with user names, join order.
  const group = await prisma.group.findUnique({
    where: { id },
    include: {
      memberships: { include: { user: true }, orderBy: { joinedAt: "asc" } },
    },
  })
  if (!group) notFound()

  const viewer = await getCurrentUser()
  const isFounder = viewer?.id === group.founderId
  const isMember =
    viewer !== null && group.memberships.some((m) => m.userId === viewer.id)

  // WHO ordering (spec decision 12): founder first, then join order. The
  // query already sorts by joinedAt; this hoists the founder to the front.
  const orderedMembers = [
    ...group.memberships.filter((m) => m.userId === group.founderId),
    ...group.memberships.filter((m) => m.userId !== group.founderId),
  ].map((m) => ({ id: m.user.id, name: m.user.name }))

  const memberCount = orderedMembers.length

  // Rhythm rows (spec decision 13): formatter-composed, venue appended.
  const rhythms = parseStoredRhythms(group.recurringActivities) ?? []
  const rhythmRows = rhythms.map((r) => {
    const row = formatRhythmRow(r)
    return {
      label: row.label,
      value: r.venueName ? `${row.value} · ${r.venueName}` : row.value,
    }
  })

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
      <PageHeader>
        <BackLink href={`/groups/${group.id}`} label={group.name} />
      </PageHeader>

      <div
        style={{
          padding: "1.5rem 1rem 2rem",
          width: "100%",
          maxWidth: "28rem",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "1.5rem",
          flex: "1 1 auto",
        }}
      >
        {/* ── Identity block (handoff: emblem, name, count) ─────────────── */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            gap: "0.75rem",
          }}
        >
          {/* Lime emblem: group brand moment, not an action (lime is never a button) */}
          <div
            aria-hidden="true"
            style={{
              width: "4.5rem",
              height: "4.5rem",
              borderRadius: "50%",
              backgroundColor: "var(--color-lime)",
              color: "#0a0a0a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "var(--type-title)",
              fontWeight: 700,
              letterSpacing: "0.02em",
            }}
          >
            {groupInitials(group.name)}
          </div>
          <h1
            style={{
              fontSize: "var(--type-display)",
              fontWeight: 700,
              lineHeight: "var(--leading-tight)",
              letterSpacing: "-0.01em",
            }}
          >
            {group.name}
          </h1>
          <p style={{ fontSize: "var(--type-meta)", color: "var(--text-secondary)" }}>
            {memberCount} {memberCount === 1 ? "member" : "members"}
          </p>
        </div>

        {/* ── Invite link: members and founder only (spec decision 5) ───── */}
        {isMember && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <p
              style={{
                fontSize: "var(--type-eyebrow)",
                lineHeight: "var(--leading-normal)",
                color: "var(--text-secondary)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Group invite link
            </p>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.625rem",
                border: "1px solid var(--border-subtle)",
                borderRadius: "0.625rem",
                backgroundColor: "var(--surface-input)",
                padding: "0.75rem",
              }}
            >
              {/* Globe glyph from the handoff, decorative */}
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--text-secondary)"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ width: "1rem", height: "1rem", flexShrink: 0 }}
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
              </svg>
              <span
                style={{
                  fontSize: "var(--type-meta)",
                  color: "var(--text-primary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {/* Path only; ShareInviteLink builds the full URL client-side */}
                /join/{group.inviteToken}
              </span>
            </div>
            <ShareInviteLink inviteToken={group.inviteToken} groupName={group.name} />
            {isFounder && <ResetInviteLink groupId={group.id} />}
          </div>
        )}

        {/* ── The card: WHO + rhythm rows ───────────────────────────────── */}
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
          <InfoRow label="Who">
            {isFounder ? (
              <ManageMembers
                groupId={group.id}
                founderId={group.founderId}
                members={orderedMembers}
              />
            ) : (
              <span>
                {orderedMembers.map((m, i) => (
                  <span key={m.id}>
                    {i > 0 && (
                      <span style={{ color: "var(--text-placeholder)" }}>{" · "}</span>
                    )}
                    {m.name}
                  </span>
                ))}
              </span>
            )}
          </InfoRow>

          {rhythmRows.map((row) => (
            <InfoRow key={row.label} label={row.label}>
              <span>{row.value}</span>
            </InfoRow>
          ))}
        </div>

        <p
          style={{
            fontSize: "var(--type-meta)",
            color: "var(--text-secondary)",
            textAlign: "center",
          }}
        >
          Want to change something? Just tell Orbit in the chat.
        </p>

        {/* ── Leave: members only, never the founder (spec decision 3) ──── */}
        {isMember && !isFounder && (
          <div style={{ marginTop: "auto" }}>
            <LeaveGroupButton groupId={group.id} groupName={group.name} />
          </div>
        )}
      </div>
    </main>
  )
}

// ── Sub-component (server-only) ─────────────────────────────────────────────

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: "0.75rem", alignItems: "baseline" }}>
      <span
        style={{
          flex: "0 0 4.5rem",
          fontSize: "var(--type-eyebrow)",
          lineHeight: "var(--leading-normal)",
          color: "var(--text-secondary)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </span>
      <div
        style={{
          flex: "1 1 auto",
          minWidth: 0,
          fontSize: "var(--type-body)",
          lineHeight: "var(--leading-normal)",
          color: "var(--text-primary)",
        }}
      >
        {children}
      </div>
    </div>
  )
}
