// src/app/groups/[id]/PendingStrip.tsx
"use client"

// The pending surface: a collapsed strip above the chat feed that opens into
// a panel over the feed, listing every gauge or proposal still waiting on
// this viewer's answer, plus a quieter "You're in on" memory-aid group for
// standing yeses. Built from docs/design/pending-surface-handoff/ (README
// sections 01-03, pending-surface.css as the measurement source of truth).
//
// Styled directly against the design system's own token names (no more
// ad-hoc mapping to old app-local names, retired in the visual-polish sweep).
// No teal, no lime in this region (OrbitBubble brings its own lime avatar,
// which is Orbit's mark, not an action).
//
// Quiet by design: no entrance animation, no attention badge. The 180ms fade
// the handoff mentions as a nice-to-have is skipped rather than reaching for
// an animation library.

import { useState } from "react"
import type { GaugeAnswer, ProposalVoteAnswer } from "@prisma/client"
import type { PendingData, PendingItem } from "@/lib/pending/derive"
import GaugeChips, { GaugeTally } from "@/app/groups/[id]/GaugeChips"
import GroupProposalChips from "@/app/groups/[id]/GroupProposalChips"
import { OrbitBubble } from "@/components/OrbitBubble"

const CAUGHT_UP_COPY =
  "Next time it is. That was the last thing waiting on you, so you're all set. I'll say something when the group floats a new idea."

function ClockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.3" stroke="var(--text-secondary)" strokeWidth="1.9" />
      <path
        d="M8 4.6V8l2.4 1.4"
        stroke="var(--text-secondary)"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
      style={{
        flexShrink: 0,
        transform: open ? "rotate(180deg)" : "none",
        transition: "none",
      }}
    >
      <path
        d="M4.5 6.75L9 11.25L13.5 6.75"
        stroke="var(--text-faint)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ArrowIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true" style={{ alignSelf: "center" }}>
      <path
        d="M2.5 7.5H12.5M12.5 7.5L8.5 3.5M12.5 7.5L8.5 11.5"
        stroke="var(--placeholder)"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M2.5 7.3L5.6 10.4L11.5 3.8"
        stroke="var(--text-secondary)"
        strokeWidth="2.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const eyebrowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  columnGap: "0.5em",
  fontSize: "var(--type-eyebrow)",
  letterSpacing: ".14em",
  textTransform: "uppercase",
  color: "var(--placeholder)",
  fontWeight: 700,
  lineHeight: 1.35,
}

/** One waiting row: kind line, title, when-line or shift-line, then chips. */
function WaitingRow({
  item,
  onAnswered,
}: {
  item: PendingItem
  onAnswered: (item: PendingItem, answer: string) => void
}) {
  return (
    <div style={{ padding: "10px 18px 11px", borderTop: "1px solid var(--hairline)" }}>
      <div style={eyebrowStyle}>{item.kindLine}</div>
      <div
        style={{
          fontSize: "var(--type-body)",
          lineHeight: "var(--leading-tight)",
          fontWeight: 600,
          color: "var(--text-primary)",
          marginTop: "3px",
        }}
      >
        {item.title}
      </div>

      {item.kind === "gauge" ? (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            columnGap: "0.5em",
            rowGap: "0.1em",
            marginTop: ".34em",
            fontSize: "var(--type-meta)",
            lineHeight: "var(--leading-normal)",
            color: "var(--text-secondary)",
          }}
        >
          {item.whenLine}
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "baseline",
            columnGap: ".45em",
            rowGap: ".25em",
            marginTop: ".42em",
            fontSize: "var(--type-meta)",
          }}
        >
          <span style={{ fontSize: "var(--type-eyebrow)", letterSpacing: ".12em", textTransform: "uppercase", fontWeight: 700, color: "var(--placeholder)" }}>
            NOW
          </span>
          <span style={{ color: "var(--placeholder)", textDecoration: "line-through" }}>{item.nowLabel}</span>
          <ArrowIcon />
          <span style={{ fontSize: "var(--type-eyebrow)", letterSpacing: ".12em", textTransform: "uppercase", fontWeight: 700, color: "var(--placeholder)" }}>
            NEW
          </span>
          <span style={{ color: "var(--text-primary)", fontWeight: 700 }}>{item.newLabel}</span>
        </div>
      )}

      {item.kind === "gauge" ? (
        <>
          <GaugeChips gauge={item.chips} onAnswered={(a: GaugeAnswer) => onAnswered(item, a)} />
          {/* Spec gap fix: GaugeChips renders no tally of its own (in the feed
              MessageFeed puts GaugeTally inside Orbit's bubble instead), so
              the panel row wires it in directly, below the chips. The
              handoff's README draws the tally above the chips for both row
              types, but GroupProposalChips already renders its own tally
              below its chips (chips-reuse-verbatim keeps that placement), so
              matching that here keeps the two row types consistent inside
              this panel, which wins over matching the mockup's ordering for
              gauge rows only. Recorded deviation, same spirit as the
              tally-grammar deviation already in the plan. */}
          <GaugeTally line={item.chips.tallyLine} />
        </>
      ) : (
        <GroupProposalChips proposal={item.chips} onAnswered={(a: ProposalVoteAnswer) => onAnswered(item, a)} />
      )}
    </div>
  )
}

/** A standing-yes row: quieter typography, "Change" reveals the same chips. */
function StandingYesRow({
  item,
  open,
  onToggle,
}: {
  item: PendingItem
  open: boolean
  onToggle: () => void
}) {
  return (
    <div style={{ padding: "8px 18px 10px", borderTop: "1px solid var(--hairline)" }}>
      <div
        style={{
          fontSize: "var(--type-meta)",
          fontWeight: 600,
          color: "var(--text-secondary)",
          marginTop: 0,
        }}
      >
        {item.title}
      </div>
      <div
        style={{
          fontSize: "var(--type-label)",
          color: "var(--placeholder)",
        }}
      >
        {item.kind === "gauge" ? item.whenLine : item.newLabel}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: ".5em" }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "var(--type-label)",
            lineHeight: "var(--leading-normal)",
            fontWeight: 700,
            color: "var(--text-secondary)",
          }}
        >
          <CheckIcon />
          You&apos;re in
        </span>
        <button
          type="button"
          onClick={onToggle}
          style={{
            marginLeft: "auto",
            fontSize: "var(--type-label)",
            fontWeight: 600,
            color: "var(--text-secondary)",
            textDecoration: "underline",
            textUnderlineOffset: "3px",
            textDecorationColor: "var(--hairline)",
            cursor: "pointer",
            background: "none",
            border: "none",
            padding: 0,
            fontFamily: "inherit",
          }}
        >
          Change
        </button>
      </div>
      {open &&
        (item.kind === "gauge" ? (
          <>
            <GaugeChips gauge={item.chips} />
            <GaugeTally line={item.chips.tallyLine} />
          </>
        ) : (
          <GroupProposalChips proposal={item.chips} />
        ))}
    </div>
  )
}

export function PendingStrip({ pending }: { pending: PendingData }) {
  const [open, setOpen] = useState(false)
  const [caughtUp, setCaughtUp] = useState(false)
  const [changeOpenKey, setChangeOpenKey] = useState<string | null>(null)
  // Rows answered with a decline leave "waiting" the instant the chip
  // resolves (README interactions: "the row leaves the Waiting on you
  // group"), rather than waiting on a server round trip the test harness
  // (and a slow network) can't guarantee lands before the next render. An
  // IN/YES answer is deliberately NOT added here: per behavior 6, that row
  // "just moves down on the next render" once real props refresh, so it
  // keeps rendering in place until then.
  const [declinedKeys, setDeclinedKeys] = useState<Set<string>>(new Set())

  const { waiting, standingYes } = pending
  const effectiveWaiting = waiting.filter((item) => !declinedKeys.has(item.key))

  // A new waiting item arriving after a caught-up note wins over the old
  // goodbye: reset the session-local flag rather than let it linger. Judged
  // against effectiveWaiting, not the raw prop, so this can't immediately
  // undo the very setCaughtUp(true) call that just fired for the last row
  // (raw `waiting` still includes that row until real props refresh).
  if (caughtUp && effectiveWaiting.length > 0) {
    setCaughtUp(false)
  }

  if (effectiveWaiting.length === 0 && standingYes.length === 0 && !caughtUp) {
    return null
  }

  function handleAnswered(item: PendingItem, answer: string) {
    const isDecline =
      (item.kind === "gauge" && (answer === "OUT" || answer === "NOT_THAT_DAY")) ||
      (item.kind === "proposal" && answer === "KEEP")
    if (!isDecline) return
    // "Last remaining waiting row" is judged against what's still effectively
    // waiting right now (accounting for earlier declines this session), not
    // the raw prop count, so two declines in the same open panel both count.
    if (effectiveWaiting.length === 1) {
      setCaughtUp(true)
    }
    setDeclinedKeys((prev) => new Set(prev).add(item.key))
  }

  const showCaughtUpLabel = caughtUp && effectiveWaiting.length === 0

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() =>
          setOpen((wasOpen) => {
            const next = !wasOpen
            // README interactions + finding 2 (fix wave 3): the caught-up note
            // is a one-time goodbye, not a label. On EVERY collapse it clears,
            // regardless of whether a standing yes remains: with no standing
            // yes, effectiveWaiting and standingYes are both empty and the
            // top-of-render gate below returns null (strip gone); with a
            // standing yes held, the strip falls back to showing just the yes
            // count instead of replaying "All caught up" indefinitely.
            if (!next && caughtUp) {
              setCaughtUp(false)
            }
            return next
          })
        }
        style={{
          display: "flex",
          alignItems: "center",
          gap: "11px",
          // Separation-treatment redesign (round4-base.css items 03/03b): the
          // interim strip was inset 16px, exactly the event card's own edges,
          // which read as a card footer. Full bleed plus the feed's own 20px
          // gutter (not the card's 16px) makes it a band belonging to the
          // screen instead, matched by page.tsx's 14px of air above and
          // MessageFeed's 6px of air below.
          width: "100%",
          margin: 0,
          padding: "12px 20px",
          borderTop: "1px solid var(--hairline)",
          borderBottom: "1px solid var(--hairline)",
          borderLeft: "none",
          borderRight: "none",
          // tint-a from the decision record (round4-base.css .pd-strip.pd-sep.tint-a):
          // a translucent wash of --action, not a fill. The owner compared it
          // by eye against the stronger tint-b and picked this one; do not
          // change the alpha.
          backgroundColor: "rgba(24,188,203,.07)",
          cursor: "pointer",
          textAlign: "left",
          fontFamily: "inherit",
        }}
      >
        <ClockIcon />
        <span
          style={{
            flex: "1 1 auto",
            minWidth: 0,
            display: "flex",
            flexWrap: "wrap",
            columnGap: ".5em",
            rowGap: ".1em",
            fontSize: "var(--type-meta)",
            lineHeight: "var(--leading-normal)",
            color: "var(--text-secondary)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {showCaughtUpLabel ? (
            "All caught up"
          ) : (
            <>
              {effectiveWaiting.length > 0 && (
                <span style={{ whiteSpace: "nowrap" }}>
                  <span style={{ color: "var(--text-primary)", fontWeight: 700 }}>{effectiveWaiting.length}</span>{" "}
                  waiting on you
                  {/* Finding 3 (fix wave 3): the dot binds to the END of the
                      item it follows (CLAUDE.md's separator-dot rule and the
                      handoff's .seg:not(:last-child)::after both put it here),
                      so a wrapped line never starts with a dot. It lives in
                      this segment's own span, not the next segment's, and only
                      when a next segment exists. */}
                  {standingYes.length > 0 && <span>{" ·"}</span>}
                </span>
              )}
              {standingYes.length > 0 && (
                <span style={{ whiteSpace: "nowrap" }}>
                  <span style={{ color: "var(--text-primary)", fontWeight: 700 }}>{standingYes.length}</span>{" "}
                  you&apos;re in on
                </span>
              )}
            </>
          )}
        </span>
        <ChevronIcon open={open} />
      </button>

      {open && (
        <>
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              height: "100dvh",
              background: "rgba(11,12,17,.74)",
              zIndex: 20,
            }}
          />
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              zIndex: 30,
              background: "var(--surface-base)",
              borderRadius: "0 0 16px 16px",
              borderBottom: "1px solid var(--hairline)",
              boxShadow: "0 22px 46px -14px rgba(0,0,0,.78)",
              maxHeight: "calc(100dvh - 240px)",
              overflowY: "auto",
            }}
          >
            {effectiveWaiting.map((item) => (
              <WaitingRow key={item.key} item={item} onAnswered={handleAnswered} />
            ))}

            {caughtUp && effectiveWaiting.length === 0 && (
              <div style={{ padding: "15px 18px 17px" }}>
                <OrbitBubble>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "var(--type-body)",
                      lineHeight: "var(--leading-normal)",
                      color: "var(--text-primary)",
                    }}
                  >
                    {CAUGHT_UP_COPY}
                  </p>
                </OrbitBubble>
              </div>
            )}

            {standingYes.length > 0 && (
              <>
                <div
                  style={{
                    ...eyebrowStyle,
                    padding: "10px 18px 0",
                    borderTop: "1px solid var(--hairline)",
                  }}
                >
                  You&apos;re in on
                </div>
                {standingYes.map((item) => (
                  <StandingYesRow
                    key={item.key}
                    item={item}
                    open={changeOpenKey === item.key}
                    onToggle={() => setChangeOpenKey((k) => (k === item.key ? null : item.key))}
                  />
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
