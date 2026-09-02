// src/lib/orbit/window.ts
//
// The conversational window: the recent feed rendered for the intent model.
// Pure (messages in, prompt block out) so the exact rendering is pinned by
// tests. Twenty messages counting the trigger; the constant is a revisit knob,
// deliberately in one place. No age cutoff: a reply can arrive twelve hours
// after the message it answers, which is why every line carries a timestamp
// and the block opens with a now-anchor the model can judge staleness against.

import {
  formatMonthDay,
  formatTime,
  formatWeekdayShort,
} from "@/lib/events/format"
import { FORMER_MEMBER_LABEL } from "@/lib/people/former-member-label"

export const WINDOW_MESSAGES = 20

export interface WindowMessage {
  /** Member name; null for Orbit. */
  authorName: string | null
  isOrbit: boolean
  body: string
  createdAt: Date
}

function stamp(d: Date, timeZone: string): string {
  return `${formatWeekdayShort(d, timeZone)} ${formatMonthDay(d, timeZone)}, ${formatTime(d, timeZone)}`
}

/**
 * Messages must arrive oldest first with the trigger message last; the trigger
 * line is marked with ">>>" at the start.
 */
export function buildConversationWindow(
  messages: WindowMessage[],
  timeZone: string,
  now: Date
): string {
  const lines = messages.map((m, i) => {
    const author = m.isOrbit ? "Orbit" : (m.authorName ?? FORMER_MEMBER_LABEL)
    const prefix = i === messages.length - 1 ? ">>> " : ""
    return `${prefix}[${stamp(m.createdAt, timeZone)}] ${author}: ${m.body}`
  })
  return [
    `Right now it is ${stamp(now, timeZone)} (group time).`,
    "",
    "The conversation, oldest first. The last message is the one to classify:",
    ...lines,
  ].join("\n")
}
