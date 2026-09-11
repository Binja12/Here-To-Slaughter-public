// ---------------------------------------------------------------------------
// Writes a WebP twin next to every PNG under client/public, as
// "<name>.png.webp". The repo keeps only the PNG masters (the twins are
// git-ignored); the Dockerfile runs this while building the client image and
// nginx hands the twin to any browser that accepts WebP (docker/nginx.conf),
// so the URLs in the client never change and `npm start` needs nothing.
//
// Same pixels, different encoder: a painted 4 MB scan comes out around a
// tenth of the size with no visible loss, and no layout math depends on the
// file size. Resolution is deliberately untouched — the board stage scales to
// the viewport, and on a 4K screen the heroes frame renders wider than its
// 2172px source already.
//
// Incremental: a twin newer than its PNG is left alone, so re-running after
// one redraw only re-encodes that one card.
//   node scripts/optimize-art.mjs            # default quality 82
//   ART_WEBP_QUALITY=90 node scripts/optimize-art.mjs
// ---------------------------------------------------------------------------

import { readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, '..', 'client', 'public');
const QUALITY = Number(process.env.ART_WEBP_QUALITY ?? 82);
const WORKERS = Math.max(1, Math.min(4, os.cpus().length >> 1));

async function* pngs(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* pngs(full);
    else if (/\.png$/i.test(entry.name)) yield full;
  }
}

const jobs = [];
for await (const png of pngs(PUBLIC)) jobs.push(png);

const totals = { files: 0, skipped: 0, before: 0, after: 0 };

async function convert(png) {
  const webp = `${png}.webp`;
  const source = await stat(png);
  try {
    if ((await stat(webp)).mtimeMs >= source.mtimeMs) {
      totals.skipped++;
      return;
    }
  } catch {
    // no twin yet
  }
  const info = await sharp(png).webp({ quality: QUALITY, effort: 4 }).toFile(webp);
  totals.files++;
  totals.before += source.size;
  totals.after += info.size;
}

async function worker() {
  for (let png = jobs.shift(); png; png = jobs.shift()) await convert(png);
}

await Promise.all(Array.from({ length: WORKERS }, worker));

const mb = (bytes) => (bytes / 1048576).toFixed(1);
console.log(
  `optimize-art: ${totals.files} PNG -> WebP at q${QUALITY}` +
    ` (${mb(totals.before)} MB -> ${mb(totals.after)} MB), ${totals.skipped} already current`,
);
