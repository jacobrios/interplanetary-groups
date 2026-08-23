// src/lib/site-url.ts
//
// The absolute base URL for metadata. Metadata is generated where a request
// origin is not reliably available, so it reads the host Vercel sets rather
// than the request. Deliberately NOT a new environment variable: that would be
// a second answer to "what host are we" that somebody has to set by hand and
// that can silently drift from the first one (the .ics route, which reads the
// origin off the request — see src/app/events/[id]/calendar.ics/route.ts).
//
// Round-1 review finding: VERCEL_PROJECT_PRODUCTION_URL is set on preview
// deployments too, not only production, so preferring it unconditionally
// meant a preview build's own metadata always resolved to the production
// domain and a preview deployment could never show its own image before
// merge. VERCEL_ENV is the actual signal for which environment is building
// ("production", "preview", or "development"), so the choice now branches
// on it: production prefers the stable production host (VERCEL_URL churns
// on production too, one new value per push, which is wrong for a link
// somebody keeps); anything else prefers the per-deployment host, falling
// back to the production host only if the per-deployment one is somehow
// unset, and finally to localhost for a plain local build with neither.
export function siteUrl(): URL {
  const isProduction = process.env.VERCEL_ENV === "production"

  const host = isProduction
    ? (process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL ?? null)
    : (process.env.VERCEL_URL ?? process.env.VERCEL_PROJECT_PRODUCTION_URL ?? null)

  if (!host) {
    return new URL(`http://localhost:${process.env.PORT ?? 3000}`)
  }

  return new URL(host.startsWith("http") ? host : `https://${host}`)
}
