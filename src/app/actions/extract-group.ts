// src/app/actions/extract-group.ts
//
// Step 1 of onboarding: extract the founder's description into a normalized
// profile, or classify what's missing. No group is created here — creation
// happens in createGroupAction after the founder confirms the playback.

"use server"

import { extractGroupProfile } from "@/lib/orbit/extract"
import { normalizeExtraction, type MissingField } from "@/lib/orbit/normalize"
import type { StoredRhythm } from "@/lib/orbit/rhythm"

export type ExtractGroupState =
  | { status: "idle" }
  | { status: "error" }
  | { status: "incomplete"; missing: MissingField }
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
  return normalized.status === "incomplete"
    ? { status: "incomplete", missing: normalized.missing }
    : {
        status: "ready",
        profile: { groupName: normalized.groupName, rhythms: normalized.rhythms },
      }
}
