import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Prevents Next.js/Turbopack from bundling Prisma and pg, which would break
  // Prisma's runtime module resolution. These are loaded from node_modules at runtime.
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
  // Dev-only: lets QA walkthroughs run several signed-in members at once by
  // serving the app on sibling loopback hosts, one browser cookie jar each.
  // Without this, Next blocks its dev resources cross-origin and those pages
  // never hydrate, so buttons and chips are dead. No effect on production.
  //
  // The private-network entries are what make phone QA possible at all: opening
  // the dev server from a phone at the Mac's LAN address is a different origin,
  // so without them every JS-driven control on the phone is dead while CSS-only
  // scrolling still works, which reads exactly like an app bug and is not one.
  // A LAN address is a DHCP lease and can change; add the new one here when it
  // does. (Wildcards are host patterns, so they do not cover IP ranges.)
  allowedDevOrigins: [
    "127.0.0.1",
    "a.localhost",
    "b.localhost",
    "c.localhost",
    "192.168.1.144",
    // Added 31 Aug 2026 (message-send-latency slice), following this block's own
    // instruction to add the new lease when it changes. The 172.20.10.x range is
    // an iPhone Personal Hotspot subnet, so this is the address the Mac has while
    // tethered, which is exactly the setup a phone QA pass runs in. The older
    // entry above is kept rather than replaced: both are valid depending on which
    // network the Mac is on, and deleting one would silently break QA on that one.
    "172.20.10.2",
    // Added 23 Sept 2026 (supabase-auth-soft-fail QA): the home network's lease
    // moved from .144 to .91. Kept alongside the old one for the same reason.
    "192.168.1.91",
  ],
}

export default nextConfig
