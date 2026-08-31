// src/app/api/unsubscribe/[token]/route.ts
//
// The one-click half that `/unsubscribe/[token]` could never provide, because
// that path is a Next.js page route, and a page route and a route handler
// cannot share a path: a POST there returns the page's own HTML and writes
// nothing. This route handler exists at a different path for exactly that
// reason, and send.ts's List-Unsubscribe header now points here instead.
//
// No session is required and none is checked, on the same reasoning
// src/app/actions/unsubscribe.ts already carries: the token IS the
// authorisation, and the population this exists for is a mail client or a
// person holding a mail app on a device with no session at all.
//
// POST is silent for an unknown token and for somebody already opted out,
// exactly as unsubscribeByToken already is: a stranger holding a guessed
// token must not be able to tell a real token from a fake one by the
// response, so this never returns anything other than an empty 200.
//
// GET exists only for a human who follows the header's URL in a browser; it
// redirects to the real page, which has the button and the confirmation.

import { NextResponse, type NextRequest } from "next/server"
import { unsubscribeByToken } from "@/lib/email/unsubscribe"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> }
): Promise<Response> {
  const { token } = await context.params
  try {
    await unsubscribeByToken(token, new Date())
  } catch (err) {
    // Logged before returning, for the reason send.ts names: the production
    // deploy cost two hours because create-group.ts threw its error away.
    // Still 200: a mail client's one-click POST has nowhere to show a
    // failure, and a stranger's guessed token must learn nothing regardless.
    console.error("[unsubscribe-route] recording an opt-out failed", err)
  }
  return new Response(null, { status: 200 })
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
): Promise<Response> {
  const { token } = await context.params
  return NextResponse.redirect(new URL(`/unsubscribe/${token}`, request.url), 302)
}
