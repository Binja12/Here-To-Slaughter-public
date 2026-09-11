import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../client/public/', import.meta.url));
async function manifest(kind) {
  try { return JSON.parse(await readFile(path.join(root, `generated/online-${kind}/manifest.json`), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
const art = await manifest('art');
const music = await manifest('music');
const catalog = { images: {}, files: {}, music: {} };
for (const [url, image] of Object.entries(art?.assets ?? {})) {
  catalog.files[url] = image.original.sha256.slice(0, 16);
  catalog.images[url] = {
    full: image.fullSizeWebp.url,
    variants: image.variants.map((variant) => [variant.stagePixelHeight, variant.url]),
  };
}
for (const folder of ['music', 'sound effects']) {
  for (const name of await readdir(path.join(root, folder))) {
    if (!name.endsWith('.mp3')) continue;
    const url = `/${folder}/${name}`;
    catalog.files[url] = createHash('sha256').update(await readFile(path.join(root, folder, name))).digest('hex').slice(0, 16);
  }
}
for (const [url, track] of Object.entries(music?.tracks ?? {})) {
  catalog.music[url] = track.segments.map(({ url, startSeconds, durationSeconds }) => ({ url, startSeconds, durationSeconds }));
}
const dir = fileURLToPath(new URL('../client/src/generated/', import.meta.url));
await mkdir(dir, { recursive: true });
await writeFile(path.join(dir, 'asset-catalog.json'), JSON.stringify(catalog) + '\n');
console.log(`Asset catalog: ${Object.keys(catalog.images).length} images, ${Object.keys(catalog.music).length} segmented tracks${art && music ? '' : ' (missing prepared assets use originals)'}`);
