// src/app/api/deployment/route.ts
//
// Answers one question: which deployment is serving this product right now?
//
// WHY THIS ENDPOINT HAS TO EXIST AT ALL, because from the outside it looks
// like a reimplementation of something Next already does. Next has its own
// version-skew reload, and on this product it can never fire. Vercel's Skew
// Protection pins every framework-managed request — router navigations,
// server actions, router.refresh() — back to the deployment the tab booted
// from, so the deployment id in a poll's response is always the id the tab
// already holds, and the mismatch Next reacts to never occurs. Proven in
// production with a redeploy watched on a phone (docs/build-notes.md §11).
//
// A plain fetch() we write ourselves is NOT framework-managed: it carries no
// x-deployment-id header, production sets no __vdpl cookie, and it therefore
// reaches the CURRENT deployment rather than the tab's own. That single
// difference is the entire opening this route uses, and it is why this must
// stay a hand-written fetch target rather than anything Next routes for us.
//
// It leaks nothing: a deployment id is already visible in the HTML of every
// page this site serves (data-dpl-id). No database, no auth, no session
// read, deliberately — it must stay a trivially cheap public endpoint,
// because every open tab asks it about once a minute.
//
// WHY NOT A STATIC FILE. Considered, since a CDN-served asset would be
// cheaper than a function invocation. Rejected: static assets are the very
// thing Next appends `?dpl=` to, which would put this answer straight back
// inside the pinning machinery this whole design is routing around. The cost
// lever, if it is ever needed, is the check interval, not the transport.
//
// JSON rather than bare text, on purpose: by the nature of this feature the
// client asking is ALWAYS older than the server answering, so a later field
// must be addable without breaking a deployed client that cannot be updated
// first.

import { NextResponse } from "next/server"

export const runtime = "nodejs"
// Not optional, and not the same guarantee as the header below. This stops
// the answer being computed once at build time and served forever after;
// no-store stops it being held anywhere between here and the tab. A stale
// answer from either direction means a missed deploy or, far worse, a reload
// loop, because the client would keep being told a new deployment exists
// after it had already reloaded onto it.
export const dynamic = "force-dynamic"

export async function GET(): Promise<Response> {
  // Vercel supplies this at both build and runtime. Absent means we are not
  // on Vercel (local development), and the client's own rule is that absent
  // means "detection is off" — never "a new deployment exists". Null is
  // returned with a 200 rather than an error status for exactly that reason:
  // an error would be indistinguishable from a broken endpoint, and the
  // client treats both the same way (do nothing), but only one of them is
  // worth a line in anybody's logs.
  const id = process.env.VERCEL_DEPLOYMENT_ID ?? null

  return NextResponse.json(
    { id },
    {
      status: 200,
      // The single most important line in this file. See `dynamic` above.
      headers: { "Cache-Control": "no-store" },
    }
  )
}
