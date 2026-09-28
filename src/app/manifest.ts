// src/app/manifest.ts
//
// Serves /manifest.webmanifest, which is what makes "Add to Home Screen" on
// iOS (and an install prompt on Android/Chrome) produce a real app icon and a
// standalone launch rather than a bookmarked tab. name/short_name/description
// come from src/lib/metadata.ts, the same constants the root layout's Open
// Graph metadata uses, so the app's name can never drift between the tab
// title, the share-link preview, and the home-screen label.
//
// background_color and theme_color are the product's dark tile (--surface-base,
// globals.css), matching layout.tsx's `viewport.themeColor`: background_color
// paints the splash screen shown while the standalone app cold-starts, and a
// mismatch there would flash white before the real UI paints.
//
// Icons: 192 and 512 are the two sizes every installability checklist (and
// Chrome's own install-banner heuristic) actually requires, both `purpose:
// "any"` because this product has no separate maskable icon exported (a
// maskable icon needs its subject cropped to a smaller safe zone than "any"
// tolerates, and drawing that variant is out of scope for this task). The 180
// entry rides on the same apple-icon.png Safari already reads via the
// <link rel="apple-touch-icon"> Next emits automatically from the file
// convention; listing it here too costs nothing and some manifest consumers
// (desktop PWA installers) prefer the largest declared icon over the
// convention-based tag.
import type { MetadataRoute } from "next"
import { SITE_TITLE, SITE_DESCRIPTION } from "@/lib/metadata"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_TITLE,
    short_name: "Orbit",
    description: SITE_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#15161e",
    theme_color: "#15161e",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  }
}
