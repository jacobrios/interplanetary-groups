// src/app/api/cron/orbit/route.ts
//
// Vercel Cron endpoint for Orbit's scheduled event reconciliation.
//
// Vercel invokes this as HTTP GET once per day (see vercel.json).
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

import type { NextRequest } from "next/server"
import { reconcileScheduledEvents } from "@/lib/orbit/reconcile"

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
    return Response.json({ ok: true, results })
  } catch (err) {
    console.error("[orbit-cron] reconcileScheduledEvents failed:", err)
    return new Response("Internal Server Error", { status: 500 })
  }
}
