// src/app/groups/[id]/MessageFeed.tsx
"use client"

// Pure display component for the scrollable chat feed.
// Receives its message list as a prop — the optimistic state is managed by
// the parent GroupHome island, which passes either the server-derived list
// or an optimistically-extended version.
//
// Chat voice system per build-notes §7:
// - Orbit: lime avatar (no name label), --surface-raised fill.
// - Other member: name label (no avatar), outlined low-fill bubble.
// - Viewer (self): right-aligned, --surface-self (strongest neutral, not teal,
//   not lime).
// - System ("Jesse joined"): centered quiet line, no bubble, no avatar.
// - No bubble tails anywhere in the feed (only the onboarding Step 1 bubble
//   gets a tail — see §7 "one onboarding bubble-tail exception").
// - Chat body stays at --type-body (17px), never shrunk (§7 firm rule).

import { MessageAuthor } from "@prisma/client"
import { Fragment, useRef, useEffect } from "react"
import GaugeChips, { GaugeTally, type FeedGauge } from "./GaugeChips"
import ProposalChips, { type FeedProposal } from "./ProposalChips"
import GroupProposalChips, { type FeedGroupProposal } from "./GroupProposalChips"
import { OrbitBubble } from "@/components/OrbitBubble"
import { groupMessagesByDay } from "@/lib/messages/day-groups"
import { FORMER_MEMBER_LABEL } from "@/lib/people/former-member-label"

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
   * The group's own IANA timezone (stored on the group row, threaded down
   * from page.tsx). Day dividers render in this zone, never the viewer's —
   * the feed is a shared surface and "Today" must mean the same day to
   * everyone in the group's own terms (CLAUDE.md time rules).
   */
  timeZone: string
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
  /**
   * Live group consensus proposals, keyed to the Orbit message each one
   * renders under. Unlike the asker-only proposals above, these are composed
   * for every viewer, and the render is member-gated: a non-member sees
   * Orbit's question with no answer of their own. (The tally line that used
   * to render for a non-member was deleted whole in the event-copy pass.)
   */
  groupProposals?: FeedGroupProposal[]
  /** Whether the viewer is a member of this group, gating the vote chips. */
  viewerIsMember?: boolean
}

export default function MessageFeed({
  messages,
  viewerId,
  timeZone,
  gauges = [],
  proposals = [],
  groupProposals = [],
  viewerIsMember = false,
}: Props) {
  const gaugeByMessageId = new Map(gauges.map((g) => [g.orbitMessageId, g]))
  const proposalByMessageId = new Map(proposals.map((p) => [p.orbitMessageId, p]))
  const groupProposalByMessageId = new Map(
    groupProposals.map((p) => [p.orbitMessageId, p])
  )
  const bottomRef = useRef<HTMLDivElement>(null)

  // Day dividers group in the GROUP's own timezone, never the viewer's (Task
  // 7, CLAUDE.md time rules): the feed is a shared surface, so "Today" must
  // mean the same calendar day to everyone reading it. `now` is only the
  // instant this render happened; the zone conversion for the label itself
  // happens entirely inside groupMessagesByDay via Intl with an explicit
  // timeZone, never a local-zone Date method.
  const dayGroups = groupMessagesByDay(messages, timeZone, new Date())

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
            color: "var(--placeholder)",
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
        padding: "4px 20px 0",
        // Row-to-row spacing is carried per-row (marginTop on each message
        // block), not by a container gap, matching the design's
        // `.gh-msgrow`/`.gh-human`/`.gh-self` margins — see below.
      }}
    >
      {dayGroups.map((group) => (
        <Fragment key={group.key}>
          {/* Centered uppercase day divider, in the group's own time (Task
              7). SYSTEM lines and optimistic messages ride inside their
              day's group in ordinary feed order; an optimistic message is
              always "Today" since it is stamped with the moment it was
              sent. */}
          <div
            style={{
              textAlign: "center",
              fontSize: "var(--type-eyebrow)",
              letterSpacing: ".12em",
              textTransform: "uppercase",
              color: "var(--text-secondary)",
              fontWeight: 700,
              padding: "12px 0 4px",
            }}
          >
            {group.label}
          </div>
          {group.messages.map((msg) => {
            // System announcements ("Jesse joined"): the room noticing, not
            // anyone speaking. Centered quiet line — no bubble, no avatar, no
            // name label (§7: bubbles are for dialogue, and nobody replies to
            // a join).
            if (msg.authorType === MessageAuthor.SYSTEM) {
              return (
                <p
                  key={msg.id}
                  style={{
                    width: "100%",
                    textAlign: "center",
                    fontSize: "var(--type-meta)",
                    lineHeight: "var(--leading-normal)",
                    color: "var(--text-secondary)",
                    // Not covered by the handoff (system lines are a product
                    // addition, not in walkthrough.css), but the row spacing
                    // that used to come from the container's flex `gap`
                    // (removed this task) still has to come from somewhere,
                    // so this keeps its prior visual spacing at the same 14px
                    // other rows now carry as their own marginTop.
                    margin: "14px 0 0",
                  }}
                >
                  {msg.body}
                </p>
              )
            }

            const isOrbit = msg.authorType === MessageAuthor.ORBIT
            const isSelf = !isOrbit && viewerId !== null && msg.authorId === viewerId
            const gauge = isOrbit ? gaugeByMessageId.get(msg.id) : undefined
            const proposal = isOrbit ? proposalByMessageId.get(msg.id) : undefined
            const groupProposal = isOrbit ? groupProposalByMessageId.get(msg.id) : undefined

            return (
              <div
                key={msg.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: isOrbit ? "flex-start" : isSelf ? "flex-end" : "flex-start",
                  opacity: msg.isPending ? 0.65 : 1,
                  // Row-to-row spacing (`.gh-human` / `.gh-self` marginTop
                  // 14px). Orbit's own 12px lives inside OrbitBubble itself
                  // (it IS the `.gh-msgrow` avatar+bubble row), so it is not
                  // duplicated here.
                  marginTop: isOrbit ? undefined : 14,
                }}
              >
                {/* Orbit: lime avatar + muted fill, no name label */}
                {isOrbit && (
                  <div style={{ width: "100%" }}>
                    <OrbitBubble>
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
                    </OrbitBubble>

                    {/* The three answers, indented under the bubble. Only a viewer
                        with a session can answer, matching the RSVP control. */}
                    {gauge && viewerId !== null && <GaugeChips gauge={gauge} />}

                    {/* The asker's one-tap answer to Orbit's change question. The
                        page only composes a proposal DTO for its asker, so
                        rendering it here is already asker-only. */}
                    {proposal && viewerId !== null && <ProposalChips proposal={proposal} />}

                    {/* Member-gated, and now nothing renders for anyone else.
                        The non-member branch used to show the standing tally
                        without the chips, so a reader who could see the group
                        but not vote still saw where things stood; the tally
                        was deleted whole in the event-copy pass, and there is
                        no count left to show. Not a live path either way: the
                        group page walls every non-member before this feed
                        renders (share-readiness slice). If viewing is ever
                        deliberately loosened, a non-member sees Orbit's
                        question with no answer of their own, which is the
                        honest shape. */}
                    {groupProposal && viewerIsMember && (
                      <GroupProposalChips proposal={groupProposal} />
                    )}
                  </div>
                )}

                {/* Other member: name label above, outlined low-fill */}
                {!isOrbit && !isSelf && (
                  <div style={{ maxWidth: "93%" }}>
                    <p
                      style={{
                        fontSize: "var(--type-eyebrow)",
                        lineHeight: "var(--leading-normal)",
                        color: "var(--text-secondary)",
                        fontWeight: 600,
                        margin: "0 0 4px 8px",
                      }}
                    >
                      {msg.authorName ?? FORMER_MEMBER_LABEL}
                    </p>
                    <div
                      style={{
                        backgroundColor: "var(--surface-base)",
                        border: "1px solid var(--hairline)",
                        borderRadius: "16px 16px 16px 5px",
                        padding: "11px 14px",
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

                {/* Self (viewer): right-aligned, strongest neutral fill. The
                    hairline border here is deliberate, not a stray leftover:
                    walkthrough.css's later "CONTRAST + CONSISTENCY PASS"
                    (around line 622) adds `1px solid var(--hairline)` to
                    every raised chat surface including `.gh-self .smsg`,
                    overriding an earlier "no border" rule by plain cascade
                    order. Do not remove it again on the strength of the
                    earlier block; the later block is the one that wins. */}
                {isSelf && (
                  <div style={{ maxWidth: "93%" }}>
                    <div
                      style={{
                        backgroundColor: "var(--surface-self)",
                        border: "1px solid var(--hairline)",
                        borderRadius: "16px 16px 5px 16px",
                        padding: "11px 14px",
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
        </Fragment>
      ))}
      {/* Bottom sentinel — scrolled into view on mount and on message-count change */}
      <div ref={bottomRef} />
    </div>
  )
}
