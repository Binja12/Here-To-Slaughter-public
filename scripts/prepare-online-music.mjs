import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../', import.meta.url));
const root = path.join(repo, 'client', 'public');
const output = path.join(root, 'generated', 'online-music');
const segmentSeconds = 60;

async function executable(name) {
  if (process.env[name.toUpperCase() + '_PATH']) return process.env[name.toUpperCase() + '_PATH'];
  if (process.platform === 'win32') {
    const local = path.join(repo, '.codex', 'tools', 'ffmpeg');
    try {
      const entries = await readdir(local, { recursive: true });
      const match = entries.sort().find((file) => path.basename(file) === `${name}.exe`);
      if (match) return path.join(local, match);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return name;
}

const ffmpeg = await executable('ffmpeg');
const ffprobe = await executable('ffprobe');
function run(tool, args) {
  return execFileSync(tool, args, { encoding: 'utf8', windowsHide: true, maxBuffer: 128 * 1024 * 1024 });
}
const ffmpegVersion = run(ffmpeg, ['-version']).split(/\r?\n/)[0];
function probe(file) {
  const result = JSON.parse(run(ffprobe, ['-v', 'error', '-select_streams', 'a:0',
    '-show_entries', 'format=duration:stream=codec_name,sample_rate,channels', '-of', 'json', file]));
  if (result.streams.length !== 1 || !Number.isFinite(Number(result.format.duration))) {
    throw new Error(`Cannot read audio duration/stream: ${file}`);
  }
  return { ...result.streams[0], durationSeconds: Number(result.format.duration) };
}

function packetHashes(file) {
  const result = run(ffprobe, ['-v', 'error', '-select_streams', 'a:0', '-show_packets',
    '-show_data_hash', 'sha256', '-show_entries', 'packet=data_hash', '-of', 'csv=p=0', file]);
  return result.match(/SHA256:[a-f0-9]{64}/g) ?? [];
}

const tracks = {};
await mkdir(output, { recursive: true });
for (const folder of ['music', 'sound effects']) {
  for (const name of (await readdir(path.join(root, folder))).sort()) {
    if (!name.toLowerCase().endsWith('.mp3')) continue;
    const file = `${folder}/${name}`;
    const source = path.join(root, file);
    const info = probe(source);
    if (info.durationSeconds <= segmentSeconds) continue;
    if (info.codec_name !== 'mp3') throw new Error(`Expected MP3 audio: ${file}`);
    const original = await readFile(source);
    const sha256 = createHash('sha256').update(original).digest('hex');
    const version = createHash('sha256').update(`${sha256}:${segmentSeconds}:${ffmpegVersion}:copy-v2`).digest('hex').slice(0, 16);
    const dir = path.join(output, file, version);
    await mkdir(dir, { recursive: true });
    // One segment-muxer pass preserves packet order across every cut. Seeking
    // separately for each part risks overlap or dropped frames at the boundary.
    // An exact 15-minute MP3 can include an extra encoder-padding frame. Keep
    // sub-second tails with the preceding part: a one-frame MP3 may not demux.
    const cuts = [];
    for (let time = segmentSeconds; time < info.durationSeconds - 1; time += segmentSeconds) cuts.push(time);
    const segmentation = cuts.length ? ['-segment_times', cuts.join(',')] : ['-segment_time', String(segmentSeconds + 2)];
    run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', source,
      '-map', '0:a:0', '-c:a', 'copy', '-map_metadata', '-1', '-f', 'segment',
      ...segmentation, '-reset_timestamps', '1',
      '-segment_list', path.join(dir, 'segments.csv'), '-segment_list_type', 'csv',
      path.join(dir, 'part-%03d.mp3')]);
    const rows = (await readFile(path.join(dir, 'segments.csv'), 'utf8')).trim().split(/\r?\n/);
    const originalPackets = packetHashes(source);
    const copiedPackets = [];
    const segments = [];
    for (const [index, row] of rows.entries()) {
      const [part, start, end] = row.split(',');
      const target = path.join(dir, part);
      const partInfo = probe(target);
      copiedPackets.push(...packetHashes(target));
      segments.push({
        index, url: `/generated/online-music/${file}/${version}/${part}`,
        startSeconds: Number(start), endSeconds: Number(end),
        durationSeconds: partInfo.durationSeconds, bytes: (await stat(target)).size,
      });
    }
    if (!originalPackets.length || originalPackets.length !== copiedPackets.length ||
        originalPackets.some((hash, index) => copiedPackets[index] !== hash)) {
      throw new Error(`Audio packets differ after splitting: ${file}`);
    }
    if (createHash('sha256').update(await readFile(source)).digest('hex') !== sha256) {
      throw new Error(`Original changed during preparation: ${file}`);
    }
    tracks[`/${file}`] = {
      original: { url: `/${file}`, bytes: original.length, sha256, ...info },
      loop: true, segmentSeconds, packetCount: originalPackets.length, segments,
    };
    console.log(`${file}: ${info.durationSeconds.toFixed(2)}s -> ${segments.length} parts; first ${(segments[0].bytes / 1048576).toFixed(2)} MiB; all ${originalPackets.length} audio packets preserved`);
  }
}
await writeFile(path.join(output, 'manifest.json'), JSON.stringify({
  schemaVersion: 1, ffmpegVersion, segmentSeconds,
  playback: 'Play segments in index order, then return to index 0. Cuts follow MP3 packet boundaries; seamless browser transitions still require playback integration.',
  tracks,
}, null, 2) + '\n');
