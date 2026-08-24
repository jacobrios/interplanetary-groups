// scripts/build-brand-assets.ts
//
// Renders the committed brand rasters from src/app/icon.svg, which is the one
// source of truth for the mark outside the React component. Run by hand when
// the mark changes; the outputs are committed so nothing renders at build time
// or at request time.
//
//   npx tsx scripts/build-brand-assets.ts
//
// No text is drawn into any of these. Font rendering here would depend on
// whatever fonts happen to be installed on the machine that ran the script,
// which is not a thing to make a shipped asset depend on. The words in a link
// preview come from the page's metadata instead, where the receiving app
// renders them in its own type.
import sharp from "sharp"
import { readFileSync, writeFileSync } from "fs"
import { join } from "path"

const ROOT = join(__dirname, "..")
const SVG = readFileSync(join(ROOT, "src/app/icon.svg"))

// --surface-base, globals.css. The home-screen tile is composited on an opaque
// background, so transparency is not an option the way it is for a tab icon.
const SURFACE_BASE = { r: 0x15, g: 0x16, b: 0x1e, alpha: 1 }

async function appleIcon() {
  const MARK = 150 // inset inside the 180 tile, so the mark is not edge to edge
  const mark = await sharp(SVG).resize(MARK, MARK).png().toBuffer()
  const out = await sharp({
    create: { width: 180, height: 180, channels: 4, background: SURFACE_BASE },
  })
    .composite([{ input: mark, top: (180 - MARK) / 2, left: (180 - MARK) / 2 }])
    .png()
    .toBuffer()
  writeFileSync(join(ROOT, "src/app/apple-icon.png"), out)
  console.log("wrote src/app/apple-icon.png (180x180)")
}

async function openGraphImage() {
  // 1200x630 is the size every major unfurler crops to. The mark is generous
  // because it is the only thing in the frame: no text is drawn here, so this
  // asset never depends on a font being installed.
  const MARK = 420
  const mark = await sharp(SVG).resize(MARK, MARK).png().toBuffer()
  const out = await sharp({
    create: { width: 1200, height: 630, channels: 4, background: SURFACE_BASE },
  })
    .composite([{ input: mark, top: (630 - MARK) / 2, left: (1200 - MARK) / 2 }])
    .png()
    .toBuffer()
  writeFileSync(join(ROOT, "src/app/opengraph-image.png"), out)
  console.log("wrote src/app/opengraph-image.png (1200x630)")
}

async function faviconIco() {
  // sharp cannot write .ico, but a valid ICO may hold a PNG payload directly,
  // which every browser this product targets reads. 32x32, opaque background
  // to match the other icons (a transparent tile would read dark-on-dark on
  // a light tab strip).
  const SIZE = 32
  const mark = await sharp(SVG).resize(SIZE, SIZE).png().toBuffer()
  const png = await sharp({
    create: { width: SIZE, height: SIZE, channels: 4, background: SURFACE_BASE },
  })
    .composite([{ input: mark, top: 0, left: 0 }])
    .png()
    .toBuffer()

  const header = Buffer.alloc(22)
  // ICONDIR
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: 1 = icon
  header.writeUInt16LE(1, 4) // count: one image
  // ICONDIRENTRY
  header.writeUInt8(SIZE, 6) // width
  header.writeUInt8(SIZE, 7) // height
  header.writeUInt8(0, 8) // colorCount
  header.writeUInt8(0, 9) // reserved
  header.writeUInt16LE(1, 10) // planes
  header.writeUInt16LE(32, 12) // bitCount
  header.writeUInt32LE(png.length, 14) // bytesInRes
  header.writeUInt32LE(22, 18) // imageOffset

  const out = Buffer.concat([header, png])
  writeFileSync(join(ROOT, "src/app/favicon.ico"), out)
  console.log(`wrote src/app/favicon.ico (${SIZE}x${SIZE}, ${out.length} bytes)`)
}

async function main() {
  await appleIcon()
  await openGraphImage()
  await faviconIco()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
