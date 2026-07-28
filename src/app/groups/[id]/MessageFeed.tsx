// src/app/groups/[id]/MessageFeed.tsx
"use client"

// Pure display component for the scrollable chat feed.
// Receives its message list as a prop — the optimistic state is managed by
// the parent GroupHome island, which passes either the server-derived list
// or an optimistically-extended version.
//
// Chat voice system per build-notes §7:
// - Orbit: lime avatar (no name label), --surface-orbit fill.
// - Other member: name label (no avatar), outlined low-fill bubble.
// - Viewer (self): right-aligned, --surface-self (strongest neutral, not teal,
//   not lime).
// - No bubble tails anywhere in the feed (only the onboarding Step 1 bubble
//   gets a tail — see §7 "one onboarding bubble-tail exception").
// - Chat body stays at --type-body (17px), never shrunk (§7 firm rule).

import { MessageAuthor } from "@prisma/client"
import { useRef, useEffect } from "react"
import GaugeChips, { GaugeTally, type FeedGauge } from "./GaugeChips"
import ProposalChips, { type FeedProposal } from "./ProposalChips"

export interface FeedMessage {
  id: string
  authorType: MessageAuthor
  authorId: string | null
  authorName: string | null // null for Orbit
  body: string
  createdAt: Date
  /** True while the message is optimistic (not yet confirmed by the server). */
  isPending?: boolean
}

interface Props {
  messages: FeedMessage[]
  viewerId: string | null
  /**
   * Live gauges, keyed to the Orbit message each one renders under. A gauge
   * whose day has passed is simply absent, so its message stays in the feed as
   * history with no chips: no pinning, no banner, no residue.
   */
  gauges?: FeedGauge[]
  /**
   * Live change questions, keyed to the Orbit message each one renders under.
   * Composed for the asker alone (the page filters by askerUserId), so a
   * proposal appearing here already means this viewer is the one to answer.
   */
  proposals?: FeedProposal[]
}

export default function MessageFeed({ messages, viewerId, gauges = [], proposals = [] }: Props) {
  const gaugeByMessageId = new Map(gauges.map((g) => [g.orbitMessageId, g]))
  const proposalByMessageId = new Map(proposals.map((p) => [p.orbitMessageId, p]))
  const bottomRef = useRef<HTMLDivElement>(null)

  // Scroll to the bottom sentinel on mount (so the feed opens at the most
  // recent messages) and whenever the message count changes (so the viewer's
  // just-sent optimistic message is immediately visible).
  // Dependency is messages.length (a primitive) not messages (new array ref
  // every render), so the effect only fires when messages are added/removed.
  // When the feed is empty the sentinel is not rendered, bottomRef.current is
  // null, and the optional-chain makes this a no-op.
  useEffect(() => {
    bottomRef.current?.scrollIntoView()
  }, [messages.length])

  if (messages.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem 1.5rem",
        }}
      >
        <p
          style={{
            fontSize: "var(--type-meta)",
            lineHeight: "var(--leading-normal)",
            color: "var(--text-placeholder)",
            textAlign: "center",
          }}
        >
          The conversation starts here.
        </p>
      </div>
    )
  }

  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        padding: "1rem 1rem 0.5rem",
      }}
    >
      {messages.map((msg) => {
        const isOrbit = msg.authorType === MessageAuthor.ORBIT
        const isSelf = !isOrbit && viewerId !== null && msg.authorId === viewerId
        const gauge = isOrbit ? gaugeByMessageId.get(msg.id) : undefined
        const proposal = isOrbit ? proposalByMessageId.get(msg.id) : undefined

        return (
          <div
            key={msg.id}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: isOrbit ? "flex-start" : isSelf ? "flex-end" : "flex-start",
              opacity: msg.isPending ? 0.65 : 1,
              transition: "opacity 0.1s ease",
            }}
          >
            {/* Orbit: lime avatar + muted fill, no name label */}
            {isOrbit && (
              <div style={{ width: "100%" }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: "0.5rem" }}>
                  <div
                    aria-label="Orbit"
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      backgroundColor: "var(--color-lime)",
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "0.6875rem",
                      fontWeight: 700,
                      color: "#0a0a0a",
                    }}
                  >
                    O
                  </div>
                  <div
                    style={{
                      backgroundColor: "var(--surface-orbit)",
                      borderRadius: "4px 16px 16px 16px",
                      padding: "0.5rem 0.75rem",
                      maxWidth: "80%",
                    }}
                  >
                    <p
                      style={{
                        fontSize: "var(--type-body)",
                        lineHeight: "var(--leading-normal)",
                        color: "var(--text-primary)",
                        margin: 0,
                      }}
                    >
                      {msg.body}
                    </p>
                    {/* Where things stand, inside the bubble under Orbit's words. */}
                    {gauge && <GaugeTally line={gauge.tallyLine} />}
                  </div>
                </div>

                {/* The three answers, indented under the bubble. Only a viewer
                    with a session can answer, matching the RSVP control. */}
                {gauge && viewerId !== null && <GaugeChips gauge={gauge} />}

                {/* The asker's one-tap answer to Orbit's change question. The
                    page only composes a proposal DTO for its asker, so
                    rendering it here is already asker-only. */}
                {proposal && viewerId !== null && <ProposalChips proposal={proposal} />}
              </div>
            )}

            {/* Other member: name label above, outlined low-fill */}
            {!isOrbit && !isSelf && (
              <div style={{ maxWidth: "80%" }}>
                <p
                  style={{
                    fontSize: "var(--type-eyebrow)",
                    lineHeight: "var(--leading-normal)",
                    color: "var(--text-secondary)",
                    marginBottom: "0.25rem",
                  }}
                >
                  {msg.authorName ?? "Member"}
                </p>
                <div
                  style={{
                    backgroundColor: "var(--surface-bubble-member)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "4px 16px 16px 16px",
                    padding: "0.5rem 0.75rem",
                  }}
                >
                  <p
                    style={{
                      fontSize: "var(--type-body)",
                      lineHeight: "var(--leading-normal)",
                      color: "var(--text-primary)",
                      margin: 0,
                    }}
                  >
                    {msg.body}
                  </p>
                </div>
              </div>
            )}

            {/* Self (viewer): right-aligned, strongest neutral fill */}
            {isSelf && (
              <div style={{ maxWidth: "80%" }}>
                <div
                  style={{
                    backgroundColor: "var(--surface-self)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "16px 4px 16px 16px",
                    padding: "0.5rem 0.75rem",
                  }}
                >
                  <p
                    style={{
                      fontSize: "var(--type-body)",
                      lineHeight: "var(--leading-normal)",
                      color: "var(--text-primary)",
                      margin: 0,
                    }}
                  >
                    {msg.body}
                  </p>
                </div>
              </div>
            )}
          </div>
        )
      })}
      {/* Bottom sentinel — scrolled into view on mount and on message-count change */}
      <div ref={bottomRef} />
    </div>
  )
}
