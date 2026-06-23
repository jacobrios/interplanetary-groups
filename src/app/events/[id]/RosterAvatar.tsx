// src/app/events/[id]/RosterAvatar.tsx

interface Props {
  name: string
  size?: number
}

/**
 * Deterministic placeholder avatar: initials on a hue seeded from the member's name,
 * so the same name always looks the same across renders and sessions.
 *
 * Avatar color encodes IDENTITY, not status — it does not violate the no-color-alone
 * status rule (§7: "Status by brightness plus icon or label, never by hue").  Status
 * is conveyed entirely by section grouping and text labels in the roster.
 *
 * Tech debt: the designed avatar is a celestial doodle generated per member (build-notes
 * §11, event-detail slice).  This placeholder ships first; the richer avatar is a
 * deliberate fast-follow once the visual design is finalised.
 */
export default function RosterAvatar({ name, size = 32 }: Props) {
  const hue = nameToHue(name)
  // Muted saturation, mid-dark lightness — readable on --surface-card (#141414).
  const bg = `hsl(${hue}, 32%, 38%)`

  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => (word[0] ?? "").toUpperCase())
    .join("")

  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: "50%",
        backgroundColor: bg,
        color: "var(--text-primary)",
        fontSize: "var(--type-eyebrow)",
        fontWeight: 600,
        flexShrink: 0,
        userSelect: "none",
      }}
    >
      {initials || "?"}
    </span>
  )
}

/**
 * Maps a name string to a hue (0–359) deterministically.
 * Uses a simple weighted char-code sum so adjacent characters contribute different weights,
 * producing good spread for short names.
 */
function nameToHue(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash + name.charCodeAt(i) * (i + 1)) % 360
  }
  return hash
}
