import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { exportWidth, largestView, STAGE_PIXEL_HEIGHTS } from './online-art-sizes.mjs';

const root = fileURLToPath(new URL('../client/public/', import.meta.url));
const output = path.join(root, 'generated', 'online-art');
const settings = { quality: 90, effort: 5, kernel: 'lanczos3', sharp: sharp.versions };
const assets = {};
let originalBytes = 0;
const profileBytes = Object.fromEntries(STAGE_PIXEL_HEIGHTS.map((height) => [height, 0]));

async function* pngs(dir) {
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    if (dir === root && entry.name === 'generated') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* pngs(full);
    else if (/\.png$/i.test(entry.name)) yield full;
  }
}

for await (const source of pngs(root)) {
  const file = path.relative(root, source).split(path.sep).join('/');
  const bytes = await readFile(source);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const metadata = await sharp(bytes).metadata();
  const { width, height } = metadata;
  const bounds = largestView(file);
  const version = createHash('sha256').update(sha256 + JSON.stringify(settings)).digest('hex').slice(0, 16);
  const dir = path.join(output, file, version);
  await mkdir(dir, { recursive: true });
  const widths = [...new Set([...STAGE_PIXEL_HEIGHTS.map((h) => exportWidth(metadata, bounds, h)), width])];
  const exports = new Map();
  for (const exportWidth of widths) {
    const name = `${exportWidth}w.webp`;
    const target = path.join(dir, name);
    try {
      await stat(target);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await sharp(bytes).resize({ width: exportWidth, withoutEnlargement: true, kernel: settings.kernel })
        .webp({ quality: settings.quality, effort: settings.effort }).toFile(target);
    }
    const info = await sharp(target).metadata();
    exports.set(exportWidth, {
      url: `/generated/online-art/${file}/${version}/${name}`,
      width: info.width, height: info.height, bytes: (await stat(target)).size,
    });
  }
  const variants = STAGE_PIXEL_HEIGHTS.map((stagePixelHeight) => {
    const image = exports.get(exportWidth(metadata, bounds, stagePixelHeight));
    profileBytes[stagePixelHeight] += image.bytes;
    return { stagePixelHeight, ...image };
  });
  assets[`/${file}`] = {
    original: { url: `/${file}`, width, height, bytes: bytes.length, sha256 },
    largestViewAt1080: bounds,
    fullSizeWebp: exports.get(width),
    variants,
  };
  originalBytes += bytes.length;
}

await writeFile(path.join(output, 'manifest.json'), JSON.stringify({
  schemaVersion: 1,
  settings,
  selection: 'stagePixelHeight = min(viewport CSS height, viewport CSS width * 9/16) * devicePixelRatio; choose the first profile >= this value; above 2160 use fullSizeWebp/original. Keep the chosen resolution during hover and overlays.',
  assets,
}, null, 2) + '\n');
console.log(JSON.stringify({ images: Object.keys(assets).length, originalBytes, profileBytes, manifest: path.join(output, 'manifest.json') }, null, 2));
