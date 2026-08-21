// scripts/eval-onboarding.ts
//
// The onboarding eval bench: rhythm extraction and the gap-ask merge, the two
// model calls that stand between a founder's free text and the group the
// product creates. Not part of CI: it costs money and hits the network,
// following the same precedent as scripts/eval-detect.ts. Run it deliberately,
// before and after any change to the extraction prompt, the field rules, or
// the normalize layer.
//
// Usage: npm run eval:onboarding                 (5 runs per case, every case)
//        npm run eval:onboarding -- 3            (3 runs per case)
//        npm run eval:onboarding -- 5 extract    (only the extraction family)
//        npm run eval:onboarding -- 5 merge      (only the merge family)

import { config } from "dotenv"
config()

/** How many cases are in flight at once. Keeps a full run near a minute. */
const CONCURRENCY = 5

async function main() {
  const runs = Number(process.argv[2] ?? 5)
  const filter = process.argv[3] ?? ""
  if (!Number.isInteger(runs) || runs < 1) {
    console.error("usage: npm run eval:onboarding -- [runs] [id-filter]")
    process.exit(1)
  }

  // Imported after dotenv so ANTHROPIC_API_KEY is present.
  const { CASES } = await import("../evals/onboarding/cases")
  const { runCase } = await import("../evals/onboarding/run")

  const selected = CASES.filter((c) => c.id.includes(filter))
  if (selected.length === 0) {
    console.error(`no cases match "${filter}"`)
    process.exit(1)
  }

  const assertionCount = selected.reduce((n, c) => n + c.assertions.length, 0)
  console.log(`${selected.length} cases x ${runs} runs = ${selected.length * runs} model calls`)
  console.log(`${assertionCount} assertions, each scored over every run\n`)

  const results = []
  for (let i = 0; i < selected.length; i += CONCURRENCY) {
    const chunk = selected.slice(i, i + CONCURRENCY)
    results.push(...(await Promise.all(chunk.map((c) => runCase(c, runs)))))
    console.log(`  ...${Math.min(i + CONCURRENCY, selected.length)}/${selected.length}`)
  }

  console.log("\n=== SCOREBOARD ===")
  let passed = 0
  let total = 0
  for (const r of results) {
    const clean = r.assertions.filter((a) => a.passes === a.runs).length
    console.log(`\n${r.id}  (${clean}/${r.assertions.length} assertions clean)`)
    const width = Math.max(...r.assertions.map((a) => a.name.length))
    for (const a of r.assertions) {
      passed += a.passes
      total += a.runs
      const mark = a.passes === a.runs ? "  " : "x "
      console.log(`  ${mark}${a.name.padEnd(width)}  ${a.passes}/${a.runs}`)
    }
  }
  console.log(`\ntotal: ${passed}/${total} assertion-runs passed`)

  // Every assertion below full marks prints what was actually produced on each
  // failing run, so a red line can be read without paying for a second run.
  const bad = results.flatMap((r) =>
    r.assertions.filter((a) => a.passes < a.runs).map((a) => ({ case: r, assertion: a }))
  )
  if (bad.length === 0) {
    console.log("\nNo failures.")
    return
  }
  console.log(`\n=== FAILURES (${bad.length} assertions) ===`)
  for (const b of bad) {
    console.log(`\n[${b.case.id}] ${b.assertion.name}  ${b.assertion.passes}/${b.assertion.runs}`)
    console.log(`  ${b.case.description}`)
    for (const f of [...new Set(b.assertion.failures)]) {
      const n = b.assertion.failures.filter((x) => x === f).length
      console.log(`  x${n} ${f}`)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
