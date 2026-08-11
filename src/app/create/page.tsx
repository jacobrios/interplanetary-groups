// src/app/create/page.tsx
//
// Founder onboarding entry: a thin server shell around the client wizard.
// All four onboarding beats (describe → playback → confirm → share) live at
// this route in client state; the wizard now owns the top of the screen via
// WizardHeader, so this shell carries only the page frame.

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
        <OnboardingWizard />
      </div>
    </main>
  )
}
