// src/app/events/[id]/RosterAvatar.tsx

interface Props {
  name: string
  size?: number
}

/**
 * Deterministic placeholder avatar: initials on a uniform identity-anchor
 * circle, so the same name always looks the same across renders and
 * sessions, and every avatar on the roster reads at the same brightness
 * regardless of the member's RSVP status.
 *
 * Task 4 (visual-polish-3) removed the per-name hue this component used to
 * carry. The design's refinement pass (walkthrough.css lines 685-689,
 * `.ed-av, .ed-people.dim .ed-av`) is explicit that roster avatars are
 * "uniform identity anchors, decoupled from status": every avatar sits at
 * the same background/border/glyph brightness, including in the dimmed
 * (OUT) group. That line is also the LAST of three competing `.ed-av`
 * definitions in the stylesheet (440, 603-604, 685-689) and therefore the
 * one that wins per the project's "last definition wins" rule — see
 * task-4-report.md for the other two and why they lose.
 *
 * Colour carrying no meaning does not belong on the one screen where status
 * must never be read from hue (the product owner is red/green colourblind).
 * Status is conveyed entirely by section grouping, the heading labels, and
 * — as of this task — name brightness (IN/HAVEN'T REPLIED/OUT), never by
 * the avatar.
 *
 * Tech debt, unchanged by this task: the designed avatar is a celestial
 * doodle generated per member (build-notes §11, event-detail slice). This
 * initials placeholder is the honest stand-in; the doodle stays queued.
 */
export default function RosterAvatar({ name, size = 30 }: Props) {
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
        backgroundColor: "var(--surface-raised)",
        border: "1.6px solid var(--hairline)",
        color: "var(--text-secondary)",
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
