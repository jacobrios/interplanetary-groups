// src/lib/orbit/__tests__/extract.test.ts
//
// Contract tests on the extraction constants — not the API call, which
// returns `unknown` by design and is exercised only through normalize.ts.
// These matter because EXTRACTION_SCHEMA uses additionalProperties: false
// with an explicit required list: a field missing from `required` is a
// field structured outputs lets the model silently omit, which sanitize
// would null — and the feature would quietly never extract.

import { describe, it, expect } from "vitest"
import { EXTRACTION_SCHEMA, FIELD_RULES } from "../extract"

describe("extraction contract — venueName", () => {
  it("rhythm items require venueName so the model can never silently omit it", () => {
    const items = EXTRACTION_SCHEMA.properties.rhythms.items
    expect(items.required).toContain("venueName")
    expect(items.properties.venueName).toEqual({ type: ["string", "null"] })
  })

  it("FIELD_RULES defines venueName and anchors the activity/venue split to the shared example", () => {
    // The activity rule drops location words and the venueName rule captures
    // them; both cite "climbing at the gym" so the split can never drift.
    // The FIELD_RULES half of this test passes before the change (declared
    // pin: it guards the existing example the new rule anchors to).
    expect(FIELD_RULES).toMatch(/venueName:/)
    expect(FIELD_RULES).toMatch(/climbing at the gym/i)
  })
})
