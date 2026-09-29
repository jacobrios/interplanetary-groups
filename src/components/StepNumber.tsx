// src/components/StepNumber.tsx
//
// The 24px numbered circle shared by the install steps sheet and the ask's
// closing note, so the two can never drift apart.

export default function StepNumber({ n }: { n: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        flex: "0 0 auto",
        width: 24,
        height: 24,
        borderRadius: "50%",
        backgroundColor: "var(--surface-raised)",
        border: "1px solid var(--hairline)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "var(--type-meta)",
        fontWeight: 700,
        color: "var(--text-primary)",
      }}
    >
      {n}
    </span>
  )
}
