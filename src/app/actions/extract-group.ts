// src/app/actions/extract-group.ts
//
// Step 1 of onboarding: extract the founder's description into a normalized
// profile, or classify what's missing. No group is created here — creation
// happens in createGroupAction after the founder confirms the playback.
//
// An askable gap becomes an "incomplete" state carrying everything the gap
// step renders and the merge call sends back up. nothing_schedulable stays
// its own "unusable" state: with no partial card to anchor a conversation,
// the static Step 1 treatment is deliberately kept for it.

"use server"

import { extractGroupProfile } from "@/lib/orbit/extract"
import { normalizeExtraction } from "@/lib/orbit/normalize"
import { readClarifyingQuestion, resolveGapQuestion, type GapAskable } from "@/lib/orbit/gap"
import type { StoredRhythm } from "@/lib/orbit/rhythm"

/** Everything the gap step needs: card state, the render-ready question
 * (validated model prose or the fire-exit template), and the merge call's
 * round-trip payload. */
export interface GapPayload {
  missing: GapAskable
  question: string
  groupName: string | null
  rhythms: StoredRhythm[]
  candidateTimeLocal: string | null
}

export type ExtractGroupState =
  | { status: "idle" }
  | { status: "error" }
  | { status: "unusable" }
  | { status: "incomplete"; gap: GapPayload }
  | { status: "ready"; profile: { groupName: string; rhythms: StoredRhythm[] } }

export async function extractGroupAction(
  _prev: ExtractGroupState,
  formData: FormData
): Promise<ExtractGroupState> {
  const description = (formData.get("description") as string | null)?.trim() ?? ""
  if (!description) return { status: "error" }

  let raw: unknown
  try {
    raw = await extractGroupProfile(description)
  } catch (err) {
    // Every extraction failure is the same soft-retry state: the founder
    // stays on Step 1 with their text intact.
    console.error("[onboarding] extraction failed:", err)
    return { status: "error" }
  }

  const normalized = normalizeExtraction(raw)
  if (normalized.status === "ready") {
    return {
      status: "ready",
      profile: { groupName: normalized.groupName, rhythms: normalized.rhythms },
    }
  }

  if (normalized.missing === "nothing_schedulable" || normalized.rhythms.length === 0) {
    return { status: "unusable" }
  }

  return {
    status: "incomplete",
    gap: {
      missing: normalized.missing,
      question: resolveGapQuestion(normalized.missing, readClarifyingQuestion(raw)),
      groupName: normalized.groupName,
      rhythms: normalized.rhythms,
      candidateTimeLocal: normalized.candidateTimeLocal,
    },
  }
}
