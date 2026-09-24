// src/components/choice.tsx
//
// The product's one choice grammar, shared by every chip row and the RSVP
// pair (spec decision 12: four hand-kept copies will drift; one file is how
// a grammar stays one). Presentational only: consumers own their <form>,
// their optimistic state, and their server action.
//
// Grammar rules carried here so no consumer can restate them differently:
// - A chosen option is marked by a "✓ " prefix plus a fill shift, never by
//   color alone (the owner is red/green colorblind; hue is never the signal).
// - Chips are never teal. Teal belongs to the RSVP pair alone: both borders
//   while the ask is open (leaning toward neither answer), the chosen
//   option's fill after (CLAUDE.md teal rule as amended by this slice).

// Lifted 24 Sept 2026 alongside form-fields.ts so the group-details editor's
// own chip rendering can reuse this exact style without duplicating it.
export function choiceChipStyle(
  selected: boolean,
  quiet: boolean,
  disabled: boolean
): React.CSSProperties {
  return {
    border: "1.7px solid var(--hairline)",
    backgroundColor: selected ? "var(--surface-self)" : "transparent",
    borderRadius: "20px",
    padding: "8px 12px",
    fontSize: "var(--type-label)",
    fontWeight: 600,
    fontFamily: "inherit",
    color: quiet && !selected ? "var(--text-secondary)" : "var(--text-primary)",
    whiteSpace: "nowrap",
    cursor: disabled ? "default" : "pointer",
  }
}

export function ChoiceChip({
  name,
  value,
  label,
  selected,
  quiet,
  disabled,
}: {
  name: string
  value: string
  label: string
  selected: boolean
  quiet: boolean
  disabled: boolean
}) {
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={disabled}
      style={choiceChipStyle(selected, quiet, disabled)}
    >
      {selected ? `✓ ${label}` : label}
    </button>
  )
}

export function ChipRow({ margin, children }: { margin: string; children: React.ReactNode }) {
  return <div style={{ display: "flex", flexWrap: "wrap", gap: "7px", margin }}>{children}</div>
}

/** The quiet where-things-stand line: hairline above, dot, tabular numerals.
 *  Null on empty: "nobody has voted" is noise the chips already imply. */
export function TallyLine({
  line,
  marginTop = 9,
  marginLeft = 0,
}: {
  line: string
  marginTop?: number
  marginLeft?: number
}) {
  if (!line) return null
  return (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        marginTop,
        marginLeft,
        paddingTop: 9,
        borderTop: "1.4px solid var(--hairline)",
        fontSize: "var(--type-label)",
        lineHeight: "var(--leading-normal)",
        color: "var(--text-secondary)",
        fontWeight: 600,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <i
        aria-hidden="true"
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          backgroundColor: "var(--text-secondary)",
          flexShrink: 0,
        }}
      />
      {line}
    </span>
  )
}

export function ErrorLine({ msg, marginLeft = 0 }: { msg: string | null; marginLeft?: number }) {
  if (!msg) return null
  return (
    <p
      style={{
        fontSize: "var(--type-meta)",
        lineHeight: "var(--leading-normal)",
        color: "#f87171",
        margin: `0.5rem 0 0 ${marginLeft}px`,
      }}
    >
      {msg}
    </p>
  )
}

/** One side of the RSVP pair. ask = open question (teal border, no mark);
 *  pick = the viewer's answer (teal fill, ink, checkmark); other = the road
 *  not taken (hairline, secondary), still tappable to change the answer.
 *
 *  minHeight is a floor, never a fixed height (card-region-height slice,
 *  task 5): the compact home-card caller passes "44px" to meet the tap-
 *  target minimum, the event-detail caller passes nothing, and either way
 *  a button whose content needs more room than the floor is still free to
 *  grow, per the project's layout-never-clips rule. */
export function RsvpOption({
  value,
  label,
  state,
  disabled,
  padding,
  radius,
  minHeight,
}: {
  value: string
  label: string
  state: "ask" | "pick" | "other"
  disabled: boolean
  padding: string
  radius: string
  minHeight?: string
}) {
  const stateStyle = {
    ask: {
      backgroundColor: "transparent",
      border: "1.5px solid var(--action)",
      color: "var(--text-primary)",
      fontWeight: 600,
    },
    pick: {
      backgroundColor: "var(--action)",
      border: "1.5px solid var(--action)",
      color: "var(--action-ink)",
      fontWeight: 700,
    },
    other: {
      backgroundColor: "transparent",
      border: "1.5px solid var(--hairline)",
      color: "var(--text-secondary)",
      fontWeight: 600,
    },
  }[state]

  return (
    <button
      type="submit"
      name="status"
      value={value}
      disabled={disabled}
      style={{
        flex: 1,
        padding,
        borderRadius: radius,
        fontSize: "var(--type-label)",
        fontFamily: "inherit",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.65 : 1,
        ...(minHeight
          ? { minHeight, display: "flex", alignItems: "center", justifyContent: "center" }
          : {}),
        ...stateStyle,
      }}
    >
      {state === "pick" ? `✓ ${label}` : label}
    </button>
  )
}
