import { NextRequest } from "next/server"
import { updateSession } from "@/lib/supabase/proxy-session"

export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static  (static files)
     * - _next/image   (image optimisation)
     * - favicon.ico, sitemap.xml, robots.txt, manifest.webmanifest (metadata files)
     * - public/ assets (*.png, *.svg, etc.)
     *
     * manifest.webmanifest excluded 28 Sept 2026, home-screen-web-app slice:
     * it serves a signed-out request fine either way (updateSession's own
     * auth.getUser() call never redirects; it only refreshes a session that
     * may not exist), but it is a static, unauthenticated file, so routing it
     * through a Supabase network call on every home-screen launch buys
     * nothing. Same reasoning as the other metadata files already excluded
     * above.
     */
    "/((?!_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
