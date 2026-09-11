import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../client/public/', import.meta.url));
const local = (url) => path.join(root, url.slice(1));
const art = JSON.parse(await readFile(path.join(root, 'generated/online-art/manifest.json'), 'utf8'));
const music = JSON.parse(await readFile(path.join(root, 'generated/online-music/manifest.json'), 'utf8'));
const decoded = new Map();

async function verifyOriginal(original) {
  const bytes = await readFile(local(original.url));
  assert.equal(bytes.length, original.bytes, original.url);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), original.sha256, original.url);
}

for (const entry of Object.values(art.assets)) {
  await verifyOriginal(entry.original);
  const originalMeta = await sharp(local(entry.original.url)).metadata();
  for (const image of [entry.fullSizeWebp, ...entry.variants]) {
    if (!decoded.has(image.url)) {
      const input = local(image.url);
      const info = await sharp(input).metadata();
      // Decode the full file, not just its header, to catch damaged outputs.
      await sharp(input).raw().toBuffer();
      assert.equal(info.format, 'webp', image.url);
      assert.equal((await stat(input)).size, image.bytes, image.url);
      assert.equal(info.width, image.width, image.url);
      assert.equal(info.height, image.height, image.url);
      if (originalMeta.hasAlpha && !info.hasAlpha) {
        assert.ok((await sharp(local(entry.original.url)).stats()).isOpaque, `Transparency lost: ${image.url}`);
      }
      assert.ok(image.width <= entry.original.width && image.height <= entry.original.height, image.url);
      const expectedHeight = entry.original.height * image.width / entry.original.width;
      assert.ok(Math.abs(image.height - expectedHeight) <= 1, `Aspect ratio: ${image.url}`);
      decoded.set(image.url, info);
    }
    if (image.stagePixelHeight && entry.largestViewAt1080 && image.width < entry.original.width) {
      const scale = image.stagePixelHeight / 1080;
      assert.ok(image.width >= entry.largestViewAt1080.width * scale, `Zoom width: ${image.url}`);
      assert.ok(image.height + 1 >= entry.largestViewAt1080.height * scale, `Zoom height: ${image.url}`);
    }
  }
  // The biggest export the catalog holds — the master's own size for an image
  // with no display bound (backgrounds), the single profile for the rest.
  const biggest = entry.variants[entry.variants.length - 1];
  assert.equal(entry.fullSizeWebp.url, biggest.url, entry.original.url);
  assert.ok(entry.fullSizeWebp.width <= entry.original.width, entry.original.url);
  if (!entry.largestViewAt1080) {
    assert.equal(entry.fullSizeWebp.width, entry.original.width, entry.original.url);
  }
}

let segments = 0;
for (const track of Object.values(music.tracks)) {
  await verifyOriginal(track.original);
  let end = 0;
  for (const [index, segment] of track.segments.entries()) {
    assert.equal(segment.index, index);
    assert.ok(Math.abs(segment.startSeconds - end) < 0.001, 'Missing or overlapping segment time');
    assert.ok(segment.endSeconds > segment.startSeconds);
    assert.ok(segment.durationSeconds > 0 && segment.durationSeconds < music.segmentSeconds + 2);
    assert.equal((await stat(local(segment.url))).size, segment.bytes);
    end = segment.endSeconds;
    segments++;
  }
  assert.ok(Math.abs(end - track.original.durationSeconds) < 0.1, 'Incomplete soundtrack');
}
console.log(`Verified ${Object.keys(art.assets).length} original PNGs, ${decoded.size} decoded WebP exports, ${Object.keys(music.tracks).length} original music files and ${segments} segments. Originals unchanged; zoom envelopes covered up to source resolution.`);
