// src/app/events/[id]/page.tsx
import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth/current-user"
import { RsvpStatus } from "@prisma/client"
import RsvpControls from "./RsvpControls"
import RosterAvatar from "./RosterAvatar"

interface Props {
  params: Promise<{ id: string }>
}

export default async function EventPage({ params }: Props) {
  const { id } = await params

  // Single read: event + venue(s) + group members + RSVPs.
  // All data the page needs arrives before the first render — no client-side
  // loading state, no waterfall.
  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      venues: true,
      rsvps: true,
      group: {
        include: {
          memberships: {
            include: { user: true },
            orderBy: { joinedAt: "asc" },
          },
        },
      },
    },
  })

  if (!event) notFound()

  const viewer = await getCurrentUser()

  // ─── Derive roster buckets from membership + RSVP data ────────────────────
  // "HAVEN'T REPLIED" is the absence of an Rsvp row — never stored (§2, §11).
  // Counts are derived from these buckets; nothing about counts or pending is
  // written to the database.
  const rsvpByUserId = new Map(event.rsvps.map((r) => [r.userId, r.status]))

  type Member = { id: string; name: string }
  const inMembers: Member[] = []
  const outMembers: Member[] = []
  const pendingMembers: Member[] = []

  for (const { user } of event.group.memberships) {
    const status = rsvpByUserId.get(user.id)
    if (status === RsvpStatus.IN) inMembers.push(user)
    else if (status === RsvpStatus.OUT) outMembers.push(user)
    else pendingMembers.push(user)
  }

  // ─── Viewer RSVP state ────────────────────────────────────────────────────
  const viewerStatus =
    viewer ? (rsvpByUserId.get(viewer.id) ?? null) : null

  // ─── Event metadata ───────────────────────────────────────────────────────
  // Single-venue UI: show the first venue even though the model supports many.
  // Multi-venue UI is a fast-follow (build-notes §8).
  const venue = event.venues[0] ?? null
  const venueLabel = venue ? (venue.displayLabel ?? venue.name) : null

  const dateLabel = formatEventDate(event.startsAt, event.endsAt)

  return (
    <main
      style={{
        minHeight: "100dvh",
        backgroundColor: "var(--surface-page)",
        color: "var(--text-primary)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "2rem 1.5rem",
        fontFamily: "var(--font-geist-sans, system-ui, sans-serif)",
      }}
    >
      <div style={{ width: "100%", maxWidth: "28rem" }}>
        {/* Group name eyebrow */}
        <p
          style={{
            fontSize: "var(--type-eyebrow)",
            lineHeight: "var(--leading-normal)",
            color: "var(--text-secondary)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: "0.375rem",
          }}
        >
          {event.group.name}
        </p>

        {/* Event title */}
        <h1
          style={{
            fontSize: "var(--type-display)",
            lineHeight: "var(--leading-tight)",
            fontWeight: 700,
            marginBottom: "1.5rem",
          }}
        >
          {event.title}
        </h1>

        {/* ── Event details card ─────────────────────────────────────── */}
        <div
          style={{
            backgroundColor: "var(--surface-card)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "0.75rem",
            padding: "1.25rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.875rem",
            marginBottom: "1rem",
          }}
        >
          {/* Date / time */}
          <MetaRow label="When" value={dateLabel} />

          {/* Venue — shown only when present; multi-venue UI is deferred (build-notes §8) */}
          {venueLabel && <MetaRow label="Where" value={venueLabel} />}

          {/* Activity label — optional free-text tag */}
          {event.activityLabel && <MetaRow label="Activity" value={event.activityLabel} />}

          {/* RSVP controls — only when the viewer has a session */}
          {viewer && (
            <>
              <hr
                style={{
                  border: "none",
                  borderTop: "1px solid var(--border-subtle)",
                  margin: "0.125rem 0",
                }}
              />
              <RsvpControls eventId={event.id} currentStatus={viewerStatus} />
            </>
          )}
        </div>

        {/* ── Roster card ────────────────────────────────────────────── */}
        {/* Per build-notes §7: detail screen shows who, by name, grouped
            IN / OUT / HAVEN'T REPLIED.  Distinction is by grouping + text labels
            + checkmark on the IN header — never by color alone (§7 a11y rule). */}
        <div
          style={{
            backgroundColor: "var(--surface-card)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "0.75rem",
            padding: "1.25rem",
            display: "flex",
            flexDirection: "column",
            gap: "1.25rem",
          }}
        >
          {inMembers.length > 0 && (
            <RosterSection label="✓ In" members={inMembers} />
          )}
          {outMembers.length > 0 && (
            <RosterSection label="Can't make it" members={outMembers} />
          )}
          {pendingMembers.length > 0 && (
            <RosterSection label="Haven't replied" members={pendingMembers} />
          )}
          {event.group.memberships.length === 0 && (
            <p style={{ fontSize: "var(--type-meta)", color: "var(--text-secondary)" }}>
              No members yet.
            </p>
          )}
        </div>
      </div>
    </main>
  )
}

// ─── Sub-components (server-only, no "use client") ────────────────────────────

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p
        style={{
          fontSize: "var(--type-label)",
          lineHeight: "var(--leading-normal)",
          color: "var(--text-secondary)",
          marginBottom: "0.125rem",
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: "var(--type-body)",
          lineHeight: "var(--leading-normal)",
          color: "var(--text-primary)",
        }}
      >
        {value}
      </p>
    </div>
  )
}

function RosterSection({
  label,
  members,
}: {
  label: string
  members: { id: string; name: string }[]
}) {
  return (
    <div>
      {/* Section header: eyebrow style with count */}
      <p
        style={{
          fontSize: "var(--type-eyebrow)",
          lineHeight: "var(--leading-normal)",
          color: "var(--text-secondary)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: "0.625rem",
        }}
      >
        {label}&nbsp;·&nbsp;{members.length}
      </p>

      {/* Member rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {members.map((member) => (
          <div
            key={member.id}
            style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}
          >
            <RosterAvatar name={member.name} size={28} />
            <span
              style={{
                fontSize: "var(--type-body)",
                lineHeight: "var(--leading-normal)",
                color: "var(--text-primary)",
              }}
            >
              {member.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Date formatting ─────────────────────────────────────────────────────────

/**
 * Formats event start (and optional end) as a compact display string using
 * three-letter weekday abbreviations per CLAUDE.md §copy rules.
 *
 * Times are displayed in UTC.  Timezone-aware display (the viewer's local zone)
 * is a fast-follow; storing the event timezone and surfacing it requires a schema
 * change and UI work that belongs to a later slice.
 *
 * Examples:
 *   "Sat, Jul 19 · 10am"
 *   "Sat, Jul 19 · 10am to 1pm"
 */
function formatEventDate(startsAt: Date, endsAt: Date | null): string {
  const utc = { timeZone: "UTC" } as const

  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", ...utc }).format(startsAt)
  const month = new Intl.DateTimeFormat("en-US", { month: "short", ...utc }).format(startsAt)
  const day = new Intl.DateTimeFormat("en-US", { day: "numeric", ...utc }).format(startsAt)

  const startTime = formatTime(startsAt)

  if (!endsAt) {
    return `${weekday}, ${month} ${day} · ${startTime}`
  }

  const endTime = formatTime(endsAt)
  // "to" per CLAUDE.md copy rules: no em/en dashes in user-facing copy.
  return `${weekday}, ${month} ${day} · ${startTime} to ${endTime}`
}

/** Formats a UTC time as "10am", "2:30pm", etc. */
function formatTime(date: Date): string {
  const h = date.getUTCHours()
  const m = date.getUTCMinutes()
  const ampm = h < 12 ? "am" : "pm"
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2, "0")}${ampm}`
}
