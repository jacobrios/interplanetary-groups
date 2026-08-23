// src/lib/site-url.ts
//
// The absolute base URL for metadata. Metadata is generated where a request
// origin is not reliably available, so it reads the host Vercel sets rather
// than the request. Deliberately NOT a new environment variable: that would be
// a second answer to "what host are we" that somebody has to set by hand and
// that can silently drift from the first one (the .ics route, which reads the
// origin off the request — see src/app/events/[id]/calendar.ics/route.ts).
//
// VERCEL_PROJECT_PRODUCTION_URL is the stable production host and is preferred.
// VERCEL_URL is per-deployment and changes every push, which is right for a
// preview build and wrong for a link somebody keeps.
export function siteUrl(): URL {
  const host =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL ?? null

  if (!host) {
    return new URL(`http://localhost:${process.env.PORT ?? 3000}`)
  }

  return new URL(host.startsWith("http") ? host : `https://${host}`)
}
