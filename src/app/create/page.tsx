// src/app/create/page.tsx
//
// Founder onboarding entry: a thin server shell around the client wizard.
// All three onboarding beats (describe → playback → confirm) live at this
// route in client state; the share step is out of scope for this slice.

import OnboardingWizard from "./OnboardingWizard"

export default function CreateGroupPage() {
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
            fontSize: "var(--type-display)",
            lineHeight: "var(--leading-tight)",
            fontWeight: 700,
            marginBottom: "0.5rem",
          }}
        >
          Start your group
        </h1>
        <p
          style={{
            fontSize: "var(--type-body)",
            lineHeight: "var(--leading-normal)",
            color: "var(--text-secondary)",
            marginBottom: "1.5rem",
          }}
        >
          No sign-up needed. You can add an email later to keep access.
        </p>

        <OnboardingWizard />
      </div>
    </main>
  )
}
