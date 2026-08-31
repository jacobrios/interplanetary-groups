// src/app/api/cron/orbit/route.ts
//
// Vercel Cron endpoint for Orbit's scheduled event reconciliation, gauge
// endgame sweep, group time-change proposal endgame sweep, and the daily
// digest.
//
// Vercel invokes this as HTTP GET once per hour (see vercel.json).
// When CRON_SECRET is set, Vercel automatically sends it as
// "Authorization: Bearer <CRON_SECRET>" and this handler verifies it.
//
// Local QA: curl http://localhost:3000/api/cron/orbit
//   Works without CRON_SECRET when NODE_ENV !== "production".
//   In production, CRON_SECRET is required — returns 401 without it.
//
// DEBT: CRON_SECRET is a new required production env var (none exists today).
// Add it to Vercel environment variables before deploying. There is no
// .env.example in this project; document in the PR.
//
// The digest rides this existing hourly cron as a fourth step rather than a
// second scheduled task (recorded architecture decision, digest slice two):
// one schedule is simpler, the hourly cadence is already what the
// group-local-8pm check needs, and this same job is what keeps the
// free-tier database from pausing after a week idle. It gets its own nested
// try/catch below, deliberately separate from the outer one: a digest
// failure must never cost the results the other three sweeps already
// produced this hour, the same reasoning reconcile.ts's own per-group
// try/catch is built on, one level up.

import type { NextRequest } from "next/server"
import { reconcileScheduledEvents } from "@/lib/orbit/reconcile"
import { runGaugeEndgame } from "@/lib/orbit/endgame"
import { runProposalEndgame } from "@/lib/proposals/endgame"
import { runDailyDigest, type DigestRunResult } from "@/lib/digest/run"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest): Promise<Response> {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret) {
    // Secret is configured — enforce it regardless of environment.
    if (authHeader !== `Bearer ${cronSecret}`) {
      return new Response("Unauthorized", { status: 401 })
    }
  } else if (process.env.NODE_ENV === "production") {
    // No secret in production is a misconfiguration — refuse to run.
    console.error(
      "[orbit-cron] CRON_SECRET is not set in production. " +
        "Set it in Vercel environment variables and re-deploy."
    )
    return new Response("Unauthorized", { status: 401 })
  } else {
    // Non-production without a secret — allow through with a warning.
    console.warn(
      "[orbit-cron] CRON_SECRET is not set — running without auth (non-production only)."
    )
  }

  try {
    const results = await reconcileScheduledEvents(new Date())
    const endgame = await runGaugeEndgame(new Date())
    const proposalEndgame = await runProposalEndgame(new Date())

    // Own try/catch: a digest bug must never take down the response
    // carrying the three sweeps above, which already succeeded this hour.
    let digest: DigestRunResult[] = []
    try {
      digest = await runDailyDigest(new Date())
    } catch (err) {
      console.error("[orbit-cron] digest step failed:", err)
    }

    return Response.json({ ok: true, results, endgame, proposalEndgame, digest })
  } catch (err) {
    console.error("[orbit-cron] sweep failed:", err)
    return new Response("Internal Server Error", { status: 500 })
  }
}
