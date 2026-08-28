// src/app/signin/page.tsx
//
// The way back in for somebody who does not have an invite link to hand.
//
// Deliberately NOT session-aware, unlike the front door. A person who is
// already signed in is one of this screen's real audiences rather than a
// mistake to redirect away: they may be holding a duplicate identity created
// by an earlier lost session, and this is where the attach flow sends them
// when they type their own address into it and are told it is already on an
// account. Bouncing a signed-in visitor to their group would close the only
// door out of that state.
//
// Nobody drew this screen. It is composed from pieces that were drawn: the
// front door's mark-then-copy stack and 28rem column, and the join screen's
// control shapes, which the panel wears. Headerless for the same reason the
// front door and the join screen are: there is nothing above this to navigate
// back to, and the panel carries its own quiet way out.

import type { Metadata } from "next"
import { OrbitMark } from "@/components/OrbitMark"
import SignInPanel from "./SignInPanel"

export const metadata: Metadata = {
  title: "Sign in",
}

export default function SignInPage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        backgroundColor: "var(--surface-base)",
        color: "var(--text-primary)",
        display: "flex",
        flexDirection: "column",
        padding: "4px 24px 0",
      }}
    >
      <div
        style={{
          flex: "1 1 auto",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          width: "100%",
          maxWidth: "28rem",
          margin: "0 auto",
          // The whole group is centered in the viewport and grows downward
          // with its content, so an error line plus an enlarged device text
          // size pushes the column taller rather than clipping the bottom.
          padding: "24px 0",
        }}
      >
        {/* Smaller than the front door's 104px hero: this screen's job is a
            form, and the mark is here to say who is speaking rather than to
            introduce the product. The negative left margin does the same job
            as the front door's, at this mark's scale rather than at the same
            value: the orbit path overflows the sphere's own box, so the offset
            optically aligns the sphere, not its box, with the page gutter, and
            it is -5px against 64px where the front door is -9px against 104px.
            Unverified in a browser like everything else on this screen. */}
        <div style={{ width: 64, height: 64, margin: "0 0 0 -5px", flex: "0 0 auto" }}>
          <OrbitMark size={64} />
        </div>

        <h1
          style={{
            fontSize: "var(--type-title)",
            fontWeight: 800,
            lineHeight: "var(--leading-tight)",
            letterSpacing: "-0.01em",
            color: "var(--text-primary)",
            margin: "14px 0 0",
            textWrap: "balance",
          }}
        >
          Welcome back.
        </h1>

        <SignInPanel />
      </div>
    </main>
  )
}
