import type { NextRequest } from "next/server"
import { reconcileScheduledEvents } from "@/lib/orbit/reconcile"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest): Promise<Response> {
  try {
    // Check authorization
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret) {
      // Secret is configured; enforce it
      if (authHeader !== `Bearer ${cronSecret}`) {
        return new Response("Unauthorized", { status: 401 })
      }
    } else {
      // Secret is not configured
      if (process.env.NODE_ENV === "production") {
        // Refuse to run unsecured in production
        return new Response("Unauthorized", { status: 401 })
      } else {
        // Non-production: warn and allow through
        console.warn(
          "CRON_SECRET is not set — running without auth (non-production only)"
        )
      }
    }

    // Call the reconciliation function with the current time
    const results = await reconcileScheduledEvents(new Date())

    return Response.json({ ok: true, results })
  } catch (error) {
    console.error("Cron job error:", error)
    return new Response("Internal Server Error", { status: 500 })
  }
}
