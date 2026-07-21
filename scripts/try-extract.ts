// scripts/try-extract.ts
//
// Manual prompt-iteration harness for the onboarding extraction call.
// Not part of CI (it costs money and hits the network) — this is the
// deliberate manual QA surface for the extraction prompt; the interpretation
// seam (normalize.ts) is fully unit-tested.
//
// Usage: npx tsx scripts/try-extract.ts "we climb Sundays at 8 and grab beers once a month"

import { config } from "dotenv"
config()

async function main() {
  const description = process.argv[2]
  if (!description) {
    console.error('usage: npx tsx scripts/try-extract.ts "<description>"')
    process.exit(1)
  }

  // Import after dotenv so ANTHROPIC_API_KEY is present at module load.
  const { extractGroupProfile } = await import("../src/lib/orbit/extract")
  const { normalizeExtraction } = await import("../src/lib/orbit/normalize")
  const { readClarifyingQuestion, validateQuestion } = await import("../src/lib/orbit/gap")

  const raw = await extractGroupProfile(description)
  console.log("RAW:", JSON.stringify(raw, null, 2))
  console.log("NORMALIZED:", JSON.stringify(normalizeExtraction(raw), null, 2))

  // The generated question and the code gate's verdict on it.
  const question = readClarifyingQuestion(raw)
  console.log("QUESTION:", JSON.stringify(question))
  console.log(
    "VALIDATED:",
    question === null ? "(none)" : (validateQuestion(question) ?? "REJECTED, template will show")
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
