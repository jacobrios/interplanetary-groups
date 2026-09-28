// scripts/make-app-icons.ts
//
// Renders the two PWA manifest icons (192 and 512) from src/app/icon.svg,
// following the same pattern as scripts/build-brand-assets.ts: the mark is
// composited onto an opaque #15161e tile rather than shipped as transparent,
// because the home-screen icon is painted directly on the launcher's own
// background with nothing else behind it. Run by hand when the mark changes;
// the outputs are committed so nothing renders at request time.
//
//   npm run icons:make
//
// src/app/apple-icon.png (180x180) is not regenerated here: it was already
// checked (see task-4-report.md) to be an opaque #15161e tile with the mark
// inset, not the transparent PNG the task brief's fallback branch was
// written for.
import sharp from "sharp"
import { readFileSync, writeFileSync } from "fs"
import { join } from "path"

const ROOT = join(__dirname, "..")
const SVG = readFileSync(join(ROOT, "src/app/icon.svg"))

// --surface-base, globals.css. Matches manifest.ts's background_color/
// theme_color and build-brand-assets.ts's SURFACE_BASE.
const SURFACE_BASE = { r: 0x15, g: 0x16, b: 0x1e, alpha: 1 }

async function makeIcon(size: number, outPath: string) {
  const markSize = Math.round(size * 0.8)
  const mark = await sharp(SVG).resize(markSize, markSize).png().toBuffer()
  const out = await sharp({
    create: { width: size, height: size, channels: 4, background: SURFACE_BASE },
  })
    .composite([
      {
        input: mark,
        top: Math.round((size - markSize) / 2),
        left: Math.round((size - markSize) / 2),
      },
    ])
    .png()
    .toBuffer()
  writeFileSync(join(ROOT, outPath), out)
  console.log(`wrote ${outPath} (${size}x${size})`)
}

async function main() {
  await makeIcon(192, "public/icon-192.png")
  await makeIcon(512, "public/icon-512.png")
}

main()
