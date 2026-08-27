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
// Viewing is members-only (share-readiness slice); every mutation still
// re-verifies membership/founder server-side in its own action.
//
// Design source: docs/design/group-info-handoff/wireframes/group-info.html.
// Deliberate deviations recorded in the spec (decision 1): real token URL,
// formatter-composed rhythm rows, shared header chrome, and the locked
// type scale over the wireframe's raw pixel sizes.

import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth/current-user"
import { hasVerifiedEmail } from "@/lib/auth/email-ask"
import { parseStoredRhythms } from "@/lib/orbit/rhythm"
import { formatRhythmRow } from "@/lib/orbit/playback"
import { groupInitials } from "@/lib/groups/initials"
import PageHeader from "@/components/PageHeader"
import BackLink from "@/components/BackLink"
import MembersOnlyWall from "@/components/MembersOnlyWall"
import ShareInviteLink from "@/components/ShareInviteLink"
import LeaveGroupButton from "./LeaveGroupButton"
import ManageMembers from "./ManageMembers"
import ResetInviteLink from "./ResetInviteLink"
import EmailStatusRow from "./EmailStatusRow"

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
  if (!isMember) return <MembersOnlyWall />

  // Any member, including the founder: losing a session is not a
  // founder-specific problem, and this is what stands between that member and
  // rejoining as a second person the next time they tap the invite link
  // (CLAUDE.md, "Identity, auth, and known gaps"). Shared with
  // loadEmailAskInputs (src/lib/auth/email-ask.ts) so this page and the group
  // home can never disagree about whether the same member has an email
  // attached.
  const viewerHasVerifiedEmail = viewer !== null && (await hasVerifiedEmail(viewer.id))

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
        backgroundColor: "var(--surface-base)",
        color: "var(--text-primary)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <PageHeader>
        <BackLink href={`/groups/${group.id}`} label={group.name} />
      </PageHeader>

      <div
        style={{
          padding: "0 24px 18px",
          width: "100%",
          maxWidth: "28rem",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          // No uniform gap here. Every value below carries its own margin
          // from the source (.gi-identity, .gi-seclabel, .gi-card, .gi-hint);
          // a container gap on top of those margins double-counts the
          // spacing, exactly the defect the previous slice shipped and
          // recorded ("consistency is not correctness"). Task 5 report has
          // the measured before/after.
          flex: "1 1 auto",
        }}
      >
        {/* ── Identity block (handoff: emblem, name, count) ─────────────── */}
        {/* Top padding is 0 (header-rule slice, 26 Aug 2026): with the
            content wrapper above already at zero top padding, this 10px was
            the last bit of air between the header's old bottom hairline and
            the emblem. With that hairline gone, the header's own 14px
            bottom padding is the only gap this screen needs. Bottom padding
            (4px, name-to-invite-link spacing) is unrelated and unchanged. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            padding: "0 0 4px",
          }}
        >
          {/* Lime emblem: group brand moment, not an action (lime is never a button) */}
          <div
            aria-hidden="true"
            style={{
              width: "4.5rem",
              height: "4.5rem",
              borderRadius: "50%",
              backgroundColor: "var(--lime)",
              color: "var(--lime-ink)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "var(--type-display)",
              fontWeight: 800,
              letterSpacing: "0.02em",
            }}
          >
            {groupInitials(group.name)}
          </div>
          <h1
            style={{
              fontSize: "var(--type-display)",
              fontWeight: 800,
              lineHeight: "var(--leading-tight)",
              letterSpacing: "-0.01em",
              marginTop: "12px",
            }}
          >
            {group.name}
          </h1>
          <p
            style={{
              fontSize: "var(--type-label)",
              color: "var(--text-secondary)",
              fontWeight: 600,
              marginTop: "4px",
            }}
          >
            {memberCount} {memberCount === 1 ? "member" : "members"}
          </p>
        </div>

        {/* ── Invite link: members and founder only (spec decision 5) ───── */}
        {isMember && (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <p
              style={{
                fontSize: "var(--type-eyebrow)",
                lineHeight: "var(--leading-normal)",
                color: "var(--text-secondary)",
                textTransform: "uppercase",
                letterSpacing: "0.14em",
                fontWeight: 700,
                margin: "18px 2px 7px",
              }}
            >
              Group invite link
            </p>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "9px",
                border: "1.6px solid var(--hairline)",
                borderRadius: "10px",
                // walkthrough.css names this pill in the same selector as
                // Step 3's invite-link pill (`.s3-link, .gi-linkrow`), so the
                // design treats them as one element; both now read on
                // --surface-base to match, even though this one already sat
                // directly on the page (not nested in a raised card) and so
                // didn't reproduce the fix-wave-1 collapse bug on its own.
                backgroundColor: "var(--surface-base)",
                padding: "11px 12px",
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
                  fontSize: "var(--type-label)",
                  color: "var(--text-primary)",
                  fontWeight: 500,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {/* Path only; ShareInviteLink builds the full URL client-side */}
                /join/{group.inviteToken}
              </span>
            </div>
            {/* ShareInviteLink is out of bounds (resolution B): its own
                46px teal pill is untouched. This wrapper only supplies the
                11px gap the source draws between the link row and the
                button (.gi-sharebtn margin-top), without editing the
                shared component itself. */}
            <div style={{ marginTop: "11px" }}>
              <ShareInviteLink inviteToken={group.inviteToken} groupName={group.name} />
            </div>
            {isFounder && (
              // Not drawn in the handoff (resolution D, "our own design").
              // 12px echoes the identity block's own name-to-emblem margin
              // above; nothing in the source specifies this gap.
              <div style={{ marginTop: "12px" }}>
                <ResetInviteLink groupId={group.id} />
              </div>
            )}
          </div>
        )}

        {/* ── Email reminders: any member (task 6, email-sign-in slice). No
              design mockup covers this row; the eyebrow-plus-quiet-link
              treatment mirrors the invite link section directly above it,
              since both are the page's self-service, non-Orbit actions. ── */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <p
            style={{
              fontSize: "var(--type-eyebrow)",
              lineHeight: "var(--leading-normal)",
              color: "var(--text-secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              fontWeight: 700,
              margin: "18px 2px 7px",
            }}
          >
            Email reminders
          </p>
          <EmailStatusRow hasVerifiedEmail={viewerHasVerifiedEmail} />
        </div>

        {/* ── The card: WHO + rhythm rows ───────────────────────────────── */}
        <div
          style={{
            marginTop: "16px",
            backgroundColor: "var(--surface-raised)",
            border: "1.7px solid var(--hairline)",
            borderRadius: "14px",
            // .gi-card's box-shadow is redefined by the later "Surfaces ·
            // cards & raised elements" pass (walkthrough.css:570-573), which
            // wins over the base rule at :482-487 (last definition wins).
            // Matches PlaybackCard.tsx and EventCard.tsx's standard dark
            // card shadow.
            boxShadow: "0 1px 3px rgba(0,0,0,.35)",
            padding: "13px 17px 5px",
          }}
        >
          <InfoRow label="Who" isFirst>
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
                      <span style={{ color: "var(--placeholder)" }}>{" · "}</span>
                    )}
                    {m.name}
                  </span>
                ))}
              </span>
            )}
          </InfoRow>

          {rhythmRows.map((row, i) => (
            <InfoRow key={i} label={row.label}>
              <span>{row.value}</span>
            </InfoRow>
          ))}
        </div>

        <p
          style={{
            fontSize: "var(--type-meta)",
            color: "var(--text-secondary)",
            fontWeight: 500,
            textAlign: "center",
            marginTop: "9px",
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

function InfoRow({
  label,
  children,
  isFirst,
}: {
  label: string
  children: React.ReactNode
  isFirst?: boolean
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: "12px",
        alignItems: "flex-start",
        padding: "9px 0 10px",
        // .gi-row + .gi-row draws the hairline; the first row has none.
        // Replaces the card's container gap (resolution A).
        borderTop: isFirst ? "none" : "1.4px solid var(--hairline)",
      }}
    >
      <span
        style={{
          // The stylesheet's fixed 58px key column assumes short labels
          // (WHO); a rhythm row's label is the founder's own activity word
          // uppercased and can run longer (CLIMBING, MOUNTAINEERING). Floor
          // plus content sizing, capped at 60% so a pathological label can
          // never crowd out the value column — same pattern as PlaybackCard's
          // key column ("layout grows with content, never clips").
          width: "min-content",
          minWidth: "58px",
          maxWidth: "60%",
          flex: "0 0 auto",
          overflowWrap: "break-word",
          fontSize: "var(--type-eyebrow)",
          lineHeight: "var(--leading-normal)",
          color: "var(--text-secondary)",
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          fontWeight: 700,
          paddingTop: "2.5px",
        }}
      >
        {label}
      </span>
      <div
        style={{
          flex: "1 1 auto",
          minWidth: 0,
          fontSize: "var(--type-meta)",
          lineHeight: "var(--leading-normal)",
          color: "var(--text-primary)",
          fontWeight: 500,
        }}
      >
        {children}
      </div>
    </div>
  )
}
