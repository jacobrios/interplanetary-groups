// scripts/eval-detect.ts
//
// The recognition eval bench. Not part of CI: it costs money and hits the
// network, following the same precedent as scripts/try-extract.ts. Run it
// deliberately, before and after any change to how Orbit decides what a
// message means.
//
// Usage: npm run eval:detect            (5 runs per case, every case)
//        npm run eval:detect -- 3       (3 runs per case)
//        npm run eval:detect -- 5 bare  (only cases whose id contains "bare")

import { config } from "dotenv"
config()

/** How many cases are in flight at once. Keeps a 20-case run near a minute. */
const CONCURRENCY = 5

async function main() {
  const runs = Number(process.argv[2] ?? 5)
  const filter = process.argv[3] ?? ""
  if (!Number.isInteger(runs) || runs < 1) {
    console.error("usage: npm run eval:detect -- [runs] [id-filter]")
    process.exit(1)
  }

  // Imported after dotenv so ANTHROPIC_API_KEY is present.
  const { CASES } = await import("../evals/detect/cases")
  const { runCase } = await import("../evals/detect/run")

  const selected = CASES.filter((c) => c.id.includes(filter))
  if (selected.length === 0) {
    console.error(`no cases match "${filter}"`)
    process.exit(1)
  }

  // One now-anchor for the whole run, so every case sees the same clock.
  const now = new Date()
  console.log(`${selected.length} cases x ${runs} runs = ${selected.length * runs} model calls\n`)

  const results = []
  for (let i = 0; i < selected.length; i += CONCURRENCY) {
    const chunk = selected.slice(i, i + CONCURRENCY)
    results.push(...(await Promise.all(chunk.map((c) => runCase(c, runs, now)))))
    console.log(`  ...${Math.min(i + CONCURRENCY, selected.length)}/${selected.length}`)
  }

  const buckets = ["must-recognize", "must-stay-quiet", "ambiguous", "accepted"] as const
  console.log("\n=== SCOREBOARD ===")
  for (const b of buckets) {
    const inBucket = results.filter((r) => r.bucket === b)
    if (inBucket.length === 0) continue
    const passes = inBucket.reduce((n, r) => n + r.passes, 0)
    const total = inBucket.reduce((n, r) => n + r.runs, 0)
    const clean = inBucket.filter((r) => r.passes === r.runs).length
    console.log(
      `${b}: ${passes}/${total} runs, ${clean}/${inBucket.length} cases clean` +
        (b === "ambiguous" ? "  (no bar, watched for drift)" : "") +
        (b === "accepted" ? "  (no bar; a known gap the owner accepted, watched for drift)" : "")
    )
  }

  const bad = results.filter((r) => r.passes < r.runs)
  if (bad.length === 0) {
    console.log("\nNo failures.")
    return
  }
  console.log(`\n=== FAILURES (${bad.length}) ===`)
  for (const r of bad) {
    console.log(`\n[${r.bucket}] ${r.id}  ${r.passes}/${r.runs}`)
    console.log(`  ${r.description}`)
    for (const f of [...new Set(r.failures)]) {
      const n = r.failures.filter((x) => x === f).length
      console.log(`  x${n} ${f}`)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
