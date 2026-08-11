// src/lib/orbit/unavailable-copy.ts
//
// Owner-approved copy for the two honest unavailable flavors (spec: Approved
// copy, 11 Aug 2026). "credits" is shown only when the provider genuinely
// reported a dry balance; "trouble" covers outages, overload, and connection
// failures. Orbit's voice rules apply: plain, warm, no em dashes.

import type { ModelFailureReason } from "./model-errors"

/** Onboarding (step 1 and the follow-up question step): the founder stays on
 * their step with their text preserved; this replaces the generic retry line. */
export const UNAVAILABLE_COPY: Record<ModelFailureReason, string> = {
  credits:
    "I hit a wall: this prototype ran out of the model credits I run on, and they're being topped up. Your description is safe right here. Try again in a little while.",
  trouble:
    "I'm having trouble thinking right now. It's not you, the service I run on is acting up. Give it a minute and try again.",
}

/** The quiet line only the sender sees after their message posted but Orbit
 * could not read it. Nothing is stored; nothing enters the group's history. */
export const CHAT_NOTE_COPY: Record<ModelFailureReason, string> = {
  credits:
    "Your message went through. But heads up: this prototype ran out of model credits, so I might miss ideas until they're topped up.",
  trouble:
    "Your message went through. But heads up: I'm having trouble thinking right now, so I might miss ideas for a few minutes.",
}
