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
        backgroundColor: "var(--surface-base)",
        color: "var(--text-primary)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        // Top-anchored, never centered. The wizard owns the top of the screen
        // through WizardHeader, and on every other screen in the product the
        // header sits against the top edge. Centering the whole column pushed
        // the header down whenever a step's content was short (the playback and
        // the gap-ask), which read to a founder as a header that failed to
        // load. The design agrees: its onboarding body is a top-down column
        // with the Orbit header row pinned and the content below it growing.
        justifyContent: "flex-start",
        padding: "2rem 1.5rem",
      }}
    >
      <div style={{ width: "100%", maxWidth: "28rem" }}>
        <OnboardingWizard />
      </div>
    </main>
  )
}
