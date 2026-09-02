// src/lib/digest/compose.ts
//
// The digest's email itself: subject, plain text, and HTML, composed from
// the two blocks tasks 4 and 5 already decided. Pure, following
// lib/digest/needs-you.ts and lib/digest/you-missed.ts before it: decided
// rows go in, a finished email (or nothing) comes out. Nothing here queries
// Prisma, calls Resend, or reads process.env, so a digest job and any hand-run
// proof script can never disagree about what a member would have received.
//
// COLOUR-TOKEN CARVE-OUT (read before "fixing" the literal hex/rgb values
// below). CLAUDE.md forbids hardcoded colour in favour of the design tokens
// in src/app/globals.css, and everywhere else in this codebase that rule
// holds. Email is the one place it cannot: mail clients do not read CSS
// custom properties, and a majority of them (Gmail included) strip <style>
// blocks out of the message entirely, so a stylesheet-based build would
// render as unstyled black-on-white text in most inboxes, not a themed page.
// The literal hex/rgb values inlined into every element's `style` attribute
// below are therefore the correct choice for this file specifically, not an
// oversight of the token rule; they were hand-picked to echo the product's
// dark palette (see src/app/globals.css) without depending on it rendering.
//
// Subject-line grouping (decision 7, settled with the owner 29 Aug 2026):
// the product has two words for "something is waiting on you" -- "RSVP" and
// "vote" -- and three backend rows (Rsvp, GaugeVote, ProposalVote) map onto
// only two of them: an idea vote and a time-change vote are both "a vote" to
// a member, even though NeedsYouItem carries three different `kind` strings
// ("event", "idea", "timeChange") to keep those three backend shapes
// distinguishable upstream. Grouping by the literal `kind` string instead of
// by the product word would wrongly call an idea-plus-time-change mix
// "things" (two different kind strings) rather than "votes" (one product
// word), which is why needsYouKindLabel below reduces to two buckets before
// asking whether they differ, never comparing kind strings directly. The
// combined subject (both blocks present) drops the specific label
// altogether and always says "thing(s)", deliberately, to keep the front of
// the subject short enough that the message count still has a chance of
// surviving truncation on a phone's notification or inbox-list row.
//
// The group name always leads the subject. Not a style preference: on a
// phone it is often all that survives truncation, and it is what tells a
// member opening this in a crowded inbox that it is not junk -- which
// matters more than usual, given this product's first-ever real send landed
// in Gmail's spam folder (see the digest-plumbing slice).

import type { NeedsYouItem } from "@/lib/digest/needs-you"
import type { YouMissedLine, YouMissedResult } from "@/lib/digest/you-missed"
import { FORMER_MEMBER_LABEL } from "@/lib/people/former-member-label"

export interface ComposeDigestInput {
  groupId: string
  groupName: string
  /** Already decided by deriveNeedsYouItems; may be empty. */
  needsYou: NeedsYouItem[]
  /** Already decided by deriveYouMissed; null means nothing was missed. */
  youMissed: YouMissedResult | null
  /**
   * Absolute origin ("https://interplanetarygroups.com"), no trailing
   * slash. Passed in rather than read from process.env or src/lib/site-url.ts,
   * so this module stays a pure function of its inputs like its two
   * siblings; the caller (task 8's job) is the one place that is allowed to
   * know how the running environment resolves its own host.
   */
  siteOrigin: string
  /**
   * The token from ensureUnsubscribeToken, resolved by the caller before
   * calling in. Deliberately NOT resolved in here: ensureUnsubscribeToken
   * reads and writes Prisma, and calling it from this module would make
   * "decided rows in, an email out" no longer true -- every future test of
   * subject or body composition would need a database. The caller (task 8)
   * already has to resolve one token per member per send regardless of
   * where the call happens, so passing it in costs nothing and keeps this
   * module synchronous and DB-free like needs-you.ts and you-missed.ts.
   */
  unsubscribeToken: string
}

export interface ComposedDigestEmail {
  subject: string
  text: string
  html: string
  /** Also the value send.ts's `unsubscribeUrl` input should receive, so the
   *  List-Unsubscribe header and the body's own visible link never disagree
   *  about where a click goes. */
  unsubscribeUrl: string
}

/** How many characters of a quoted "you missed" line survive before it is
 *  truncated with an ellipsis. Chosen to read as roughly one line's worth
 *  in a narrow-column email body, comfortably under the point most mail
 *  clients wrap a body line at phone width. */
const MAX_QUOTE_CHARS = 100

/** "1 RSVP" / "2 RSVPs", "1 vote" / "2 votes", etc. Never "1 RSVPs". */
function pluralize(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`
}

/**
 * The product word for a group of needs-you items, reduced from the three
 * NeedsYouKind strings to the two words the rest of the product already
 * uses ("Needs your RSVP" / "Needs your vote" on the group home) before
 * asking whether the group is uniform. "idea" and "timeChange" are both
 * "vote"; only "event" is "RSVP"; a group containing both an RSVP-kind item
 * and a vote-kind item is neither, on its own -- see buildSubject, which
 * only calls this in the needs-you-only situation and drops to "thing" in
 * the combined one regardless of what this would return.
 */
function needsYouKindLabel(items: NeedsYouItem[]): "RSVP" | "vote" | "thing" {
  const hasRsvp = items.some((item) => item.kind === "event")
  const hasVote = items.some((item) => item.kind === "idea" || item.kind === "timeChange")
  if (hasRsvp && hasVote) return "thing"
  return hasRsvp ? "RSVP" : "vote"
}

function buildSubject(groupName: string, needsYou: NeedsYouItem[], youMissed: YouMissedResult | null): string {
  const needsCount = needsYou.length
  const missedCount = youMissed?.count ?? 0
  const needsVerb = needsCount === 1 ? "needs" : "need"

  if (needsCount > 0 && missedCount > 0) {
    const thingWord = pluralize(needsCount, "thing")
    const messageWord = pluralize(missedCount, "message")
    return `${groupName}: ${needsCount} ${thingWord} ${needsVerb} you, plus ${missedCount} new ${messageWord}`
  }

  if (needsCount > 0) {
    const label = needsYouKindLabel(needsYou)
    const word = pluralize(needsCount, label)
    return `${groupName}: ${needsCount} ${word} ${needsVerb} you`
  }

  // Reached only when youMissed is non-null (both-empty is handled by the
  // caller-facing composeDigestEmail before this is ever called).
  const messageWord = pluralize(missedCount, "message")
  return `${groupName}: ${missedCount} new ${messageWord}`
}

function absoluteUrl(origin: string, path: string): string {
  return `${origin}${path}`
}

/**
 * A quoted "you missed" line, collapsed to one line and cut to
 * MAX_QUOTE_CHARS. Cuts at the last whole word inside the limit so a
 * truncated line never ends mid-word; only a single word longer than the
 * whole limit (no space to fall back to) is ever cut mid-word, which is the
 * "if avoidable" the product rule allows for.
 */
function truncateQuote(body: string): string {
  const oneLine = body.replace(/\s+/g, " ").trim()
  if (oneLine.length <= MAX_QUOTE_CHARS) return oneLine
  const cut = oneLine.slice(0, MAX_QUOTE_CHARS)
  const lastSpace = cut.lastIndexOf(" ")
  const safe = lastSpace > 0 ? cut.slice(0, lastSpace) : cut
  return `${safe}…`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

// ── Plain text body ──────────────────────────────────────────────────────

function buildText(input: ComposeDigestInput, groupUrl: string, unsubscribeUrl: string): string {
  const parts: string[] = []

  if (input.needsYou.length > 0) {
    parts.push("Needs you:")
    for (const item of input.needsYou) {
      parts.push(`- ${item.title} · ${item.whenLine} (${item.label})`)
      parts.push(`  ${absoluteUrl(input.siteOrigin, item.url)}`)
    }
  }

  if (input.youMissed) {
    if (parts.length > 0) parts.push("")
    const messageWord = pluralize(input.youMissed.count, "message")
    parts.push(`You missed ${input.youMissed.count} new ${messageWord} in ${input.groupName}:`)
    for (const line of input.youMissed.lines) {
      parts.push(`- ${lineLabel(line)}: ${truncateQuote(line.body)}`)
    }
  }

  parts.push("")
  parts.push(`Open ${input.groupName}: ${groupUrl}`)
  parts.push("")
  parts.push(`Stop these emails: ${unsubscribeUrl}`)

  return parts.join("\n")
}

function lineLabel(line: YouMissedLine): string {
  return line.authorName ?? FORMER_MEMBER_LABEL
}

// ── HTML body ────────────────────────────────────────────────────────────
//
// Every value below is a literal hex/rgb, not a var(--token); see the
// header comment for why that is correct here rather than a shortcut.

const BG = "#14161c" // echoes --surface-base
const CARD_BG = "#1f222c" // echoes --surface-low
const TEXT_PRIMARY = "#f3f4f6"
const TEXT_SECONDARY = "#a7aab6"
const TEAL = "#18bccb" // echoes --action
const HAIRLINE = "#2a2d38"

function buildHtml(input: ComposeDigestInput, groupUrl: string, unsubscribeUrl: string): string {
  const sections: string[] = []

  if (input.needsYou.length > 0) {
    const rows = input.needsYou
      .map((item) => {
        const url = absoluteUrl(input.siteOrigin, item.url)
        return `
          <tr>
            <td style="padding:12px 16px;background:${CARD_BG};border-radius:8px;">
              <a href="${escapeHtml(url)}" style="color:${TEXT_PRIMARY};text-decoration:none;font-weight:600;font-size:16px;">${escapeHtml(item.title)}</a>
              <div style="color:${TEXT_SECONDARY};font-size:14px;margin-top:2px;">${escapeHtml(item.whenLine)} &middot; ${escapeHtml(item.label)}</div>
            </td>
          </tr>
          <tr><td style="height:8px;line-height:8px;font-size:0;">&nbsp;</td></tr>`
      })
      .join("")
    sections.push(`
      <tr>
        <td style="padding:0 0 8px 0;color:${TEXT_PRIMARY};font-size:15px;font-weight:600;">Needs you</td>
      </tr>
      <tr>
        <td>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>
        </td>
      </tr>`)
  }

  if (input.youMissed) {
    const messageWord = pluralize(input.youMissed.count, "message")
    const lines = input.youMissed.lines
      .map(
        (line) =>
          `<div style="margin-top:6px;color:${TEXT_SECONDARY};font-size:14px;"><strong style="color:${TEXT_PRIMARY};">${escapeHtml(lineLabel(line))}:</strong> ${escapeHtml(truncateQuote(line.body))}</div>`
      )
      .join("")
    sections.push(`
      <tr><td style="height:20px;line-height:20px;font-size:0;">&nbsp;</td></tr>
      <tr>
        <td style="padding:0 0 8px 0;color:${TEXT_PRIMARY};font-size:15px;font-weight:600;">
          You missed ${input.youMissed.count} new ${messageWord} in ${escapeHtml(input.groupName)}
        </td>
      </tr>
      <tr>
        <td style="padding:12px 16px;background:${CARD_BG};border-radius:8px;">
          ${lines}
        </td>
      </tr>`)
  }

  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BG};padding:24px 0;">
  <tr>
    <td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;width:100%;">
        <tr>
          <td style="padding-bottom:16px;color:${TEXT_PRIMARY};font-size:18px;font-weight:700;">${escapeHtml(input.groupName)}</td>
        </tr>
        ${sections.join("")}
        <tr><td style="height:20px;line-height:20px;font-size:0;">&nbsp;</td></tr>
        <tr>
          <td style="padding-top:16px;border-top:1px solid ${HAIRLINE};">
            <a href="${escapeHtml(groupUrl)}" style="color:${TEAL};font-size:15px;font-weight:600;text-decoration:none;">Open ${escapeHtml(input.groupName)} &rarr;</a>
          </td>
        </tr>
        <tr>
          <td style="padding-top:16px;color:${TEXT_SECONDARY};font-size:12px;">
            <a href="${escapeHtml(unsubscribeUrl)}" style="color:${TEXT_SECONDARY};text-decoration:underline;">Stop these emails</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`.trim()
}

/**
 * Compose the whole digest email, or null when there is nothing to send.
 * Both blocks empty is checked FIRST and returns null before any other work
 * runs, so a caller that forgets the rule (task 8's own job, restated here
 * on purpose) still cannot produce an empty digest by calling this module:
 * there is no code path in here that reaches a subject or a body without at
 * least one block having content.
 */
export function composeDigestEmail(input: ComposeDigestInput): ComposedDigestEmail | null {
  if (input.needsYou.length === 0 && input.youMissed === null) return null

  const groupUrl = absoluteUrl(input.siteOrigin, `/groups/${input.groupId}`)
  const unsubscribeUrl = absoluteUrl(input.siteOrigin, `/api/unsubscribe/${input.unsubscribeToken}`)

  return {
    subject: buildSubject(input.groupName, input.needsYou, input.youMissed),
    text: buildText(input, groupUrl, unsubscribeUrl),
    html: buildHtml(input, groupUrl, unsubscribeUrl),
    unsubscribeUrl,
  }
}
