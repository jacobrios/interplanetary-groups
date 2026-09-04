// src/app/create/page.tsx
//
// Founder onboarding entry: a thin server shell around the client wizard.
// All four onboarding beats (describe → playback → confirm → share) live at
// this route in client state; the wizard now owns the top of the screen via
// WizardHeader, so this shell carries only the page frame.
//
// Reads the session here, once, so the wizard can tell a returning founder
// from a first-time one. `getCurrentUser()` returns null for both "no
// session" and "session with no User row yet", which is exactly the same
// "we don't know this person's name" case Step1Describe already needs to
// treat as first-time (onboarding-nav slice,
// docs/superpowers/specs/2026-09-04-onboarding-nav-design.md). Debt: this
// name is fetched purely to display it; if the wizard ever needs a second
// thing from the session, this wants a small viewer object rather than a
// second scalar prop threaded the same way.

import OnboardingWizard from "./OnboardingWizard"
import { getCurrentUser } from "@/lib/auth/current-user"

export default async function CreateGroupPage() {
  const viewer = await getCurrentUser()

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
        <OnboardingWizard knownName={viewer?.name ?? null} />
      </div>
    </main>
  )
}
