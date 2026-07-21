// scripts/try-merge.ts
//
// Manual prompt-iteration harness for the full gap-ask loop: one real
// extraction, then one real merge call per answer, printing what the model
// claimed, what normalize made of it, and what the pure decision seam would
// do — including the exact bubble line the founder would see. Not part of
// CI (it costs money and hits the network); the decision seam itself is
// fully unit-tested.
//
// Usage: npx tsx scripts/try-merge.ts "<description>" "<answer1>" ["<answer2>"]
// e.g.:  npx tsx scripts/try-merge.ts "we climb Tuesdays at 7" "in the evening"

import { config } from "dotenv"
config()

async function main() {
  const [description, ...answers] = process.argv.slice(2)
  if (!description || answers.length === 0) {
    console.error('usage: npx tsx scripts/try-merge.ts "<description>" "<answer1>" ["<answer2>"]')
    process.exit(1)
  }

  // Import after dotenv so ANTHROPIC_API_KEY is present at module load.
  const { extractGroupProfile } = await import("../src/lib/orbit/extract")
  const { mergeGapAnswer } = await import("../src/lib/orbit/merge")
  const { normalizeExtraction } = await import("../src/lib/orbit/normalize")
  const { GAP_ROUND_INTRO, decideGapOutcome, readClarifyingQuestion } = await import(
    "../src/lib/orbit/gap"
  )

  const report = (label: string, raw: unknown, answersGiven: number) => {
    const normalized = normalizeExtraction(raw)
    const outcome = decideGapOutcome(normalized, readClarifyingQuestion(raw), answersGiven)
    console.log(`\n=== ${label} ===`)
    console.log("RAW:", JSON.stringify(raw, null, 2))
    console.log("NORMALIZED:", JSON.stringify(normalized, null, 2))
    console.log("OUTCOME:", JSON.stringify(outcome))
    if (outcome.kind === "ask") {
      console.log(
        "BUBBLE:",
        `${GAP_ROUND_INTRO[Math.min(answersGiven, 1)]} ${outcome.question}`
      )
    }
    return { normalized, outcome }
  }

  const raw = await extractGroupProfile(description)
  let { normalized, outcome } = report("EXTRACT", raw, 0)

  for (const [i, answer] of answers.entries()) {
    if (outcome.kind !== "ask") {
      console.log(`\n(loop over before answer ${i + 1}: ${outcome.kind})`)
      break
    }
    if (normalized.status !== "incomplete") break // unreachable when asking

    // Build the merge input exactly as mergeGapAction would.
    const mergedRaw = await mergeGapAnswer({
      description,
      groupName: normalized.groupName,
      currentState: normalized.rhythms,
      candidateTimeLocal: normalized.candidateTimeLocal,
      askedAbout: outcome.missing,
      answer,
    })
    ;({ normalized, outcome } = report(`MERGE ${i + 1} ("${answer}")`, mergedRaw, i + 1))
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
