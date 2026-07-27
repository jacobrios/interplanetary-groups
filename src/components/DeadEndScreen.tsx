// src/components/DeadEndScreen.tsx
//
// The layout shared by the not-found and error boundaries: a centered
// column, a heading, a line of explanation, and an action row.
//
// Orbit is deliberately absent from both. Orbit's presence in this product
// means something is being handled for you, and Orbit did not break a
// mistyped URL; putting its face on a crash makes it look less competent
// than it is (spec: "Orbit speaks on the bad invite link and stays off the
// technical failures"). Warmth lives in the copy instead.

export default function DeadEndScreen({
  heading,
  body,
  children,
}: {
  heading: string
  body: string
  children: React.ReactNode
}) {
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
        <h1
          style={{
            fontSize: "var(--type-title)",
            lineHeight: "var(--leading-tight)",
            fontWeight: 700,
            marginBottom: "0.5rem",
          }}
        >
          {heading}
        </h1>
        <p
          style={{
            fontSize: "var(--type-body)",
            lineHeight: "var(--leading-normal)",
            color: "var(--text-secondary)",
            marginBottom: "1.5rem",
          }}
        >
          {body}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {children}
        </div>
      </div>
    </main>
  )
}
