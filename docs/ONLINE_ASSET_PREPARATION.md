# Online delivery assets

`npm run assets:art` creates delivery copies in
`client/public/generated/online-art`; `npm run assets:music` does the same under
`online-music`. `npm run assets:verify` checks both.

**The prepared IMAGES are committed.** `client/public/generated/online-art` is
tracked and reaches the Docker build as-is, so a build re-encodes nothing —
that used to be minutes of sharp on every build (the owner, 2026-09-08). When
art changes: run `npm run assets:art`, then `npm run assets:verify`, then commit
what the first wrote. Music still needs ffmpeg and is still made inside the
build. Originals stay at their existing public URLs and ship as fallbacks.

The frontend uses these delivery copies through `client/src/loading/` and
`client/src/audio/MusicTrack.ts`. Client start, test and build commands generate
a compact catalog inside `client/src/generated/`; it is bundled into the app
so no manifest request blocks startup. A checkout without prepared assets uses
original URLs and skips speculative image downloads.

## Loading order and connections

The login entry loads separately from the lobby and game screens. After a
500 ms settling period on login/lobby, the browser warms lobby artwork, game
frames and controls, the card library, small sound effects, then the first
gameplay music part. The game code chunk warms after lobby artwork. Only one
background asset download runs at a time; newly visible images and pending
game commands interrupt it and take precedence. Card warmup uses a fixed,
alphabetical public filename catalog, independent of shuffled decks or hidden
player state. Only already-visible board cards and the local hand get foreground
image requests. Media byte ranges preserve completed bytes when foreground work interrupts a
download (when the server advertises range support). Leaving a screen cancels
its speculative work. Hidden
tabs pause the queue; Save-Data and 2G connections skip speculative warmup.

At match entry, speculative work stops until the snapshot arrives. Visible board
images take precedence, then the remaining public game artwork resumes in the
background. Music downloads also use the interruptible queue, including the first
part and the short challenge track; playback begins after its Blob is ready and
browser autoplay policy allows it. A slow connection can therefore delay music
without making the board wait for a music file. Browser restrictions retry on a click/key press. Missing
warmup time never blocks joining: visible assets load normally, with their
previously fetched URLs reused from the browser cache when available.

Art and audio stay on the client HTTP origin. They can be reused across login,
lobby and matches even when the game uses another WebSocket connection. Live
player state still comes from that game's authorized connection; it is not
speculatively fetched or cached as an asset. No paid hosting service is needed.

Generated media and JS chunks use immutable hashed URLs. Original fallback
URLs use per-file hashes; changing one card does not invalidate every card.
HTML revalidates so deployments expose current code. nginx compresses text
responses, supports audio byte ranges, and returns 404 for missing assets
instead of returning the application's HTML page.

## Images

`scripts/online-art-sizes.mjs` records the largest full-canvas display size for
each supported asset family at a 1920x1080 CSS viewport. Card bounds include
hand hover, hero hover, monster hover, leader/trophy expansion, challenge and
modifier overlays, revealed cards, discard browsing and choice dialogs.

| Family | Largest-view export envelope at 1080p | Basis |
| --- | --- | --- |
| Heroes, items, magic, modifiers, challenge | 400x560 | Main hero hover reaches about 371x520; hand hover 346x484; challenge/roll height 454 |
| Monsters | 500x850 | Center monster hover reaches about 481x827, larger than trophy/roll views |
| Leaders | 400x640 | Leader hover reaches about 364x612 |
| Card backs | 400x560 | Conservative envelope for stacks/piles/overlays |
| Frames, buttons, dice, lobby and volume art | Per-file bounds | Includes CSS padding/crops, hover, dice perspective and sprite scaling |

Exports retain the original aspect ratio and transparent padding. Widths round
UP to a multiple of 64 after considering BOTH required width and height.
WebP quality is 90, with Lanczos3 resizing. Each source also has a full-resolution
WebP export; the original PNG remains available separately. No source is
overwritten, cropped or enlarged. Backgrounds already exceed their source
resolution at 1080p, and reference art without an audited display bound retains
its original resolution.

**One export per image**, for a **720-pixel-high stage**
(`STAGE_PIXEL_HEIGHTS` in `scripts/online-art-sizes.mjs`). It scales the audited
largest-view envelopes by 720/1080, retains aspect ratio, and rounds export
widths up to 64-pixel steps. Example outputs:

| Image | export |
| --- | ---: |
| Hero Bad Axe | 320x426 |
| Monster Mega Slime | 384x662 |
| Magic Call Of The Fallen | 320x427 |
| Table background | 1672x941 (the master's own size) |

An image with **no audited display bound** — the table background, the lobby
canvas, unaudited art — exports at its master's size instead. That is the
"backgrounds at full size" rule (the owner, 2026-09-08): a downscaled felt is
the one resize the eye catches.

The export does NOT depend on the viewport. `selectImage` takes the one profile
whatever the screen is, so nothing re-picks on resize or a DPI change and a 4K
screen gets the same file a laptop does — deliberate, and the reason there is
one profile rather than four. Hover and challenge views keep the same URL and
can look softer. No art is cropped; the PNG masters remain on the server as the
full-size fallback. To change the trade, edit `STAGE_PIXEL_HEIGHTS`, re-run
`npm run assets:art`, and commit what it writes.

`AssetImage` and `useBackgroundImage` register visible requests before effects
start background work. Newly drawn cards use the same path and interrupt the
queue. A failed export falls back to full-resolution WebP, then the original URL.
Future layout/zoom changes must update the audited bounds.

Each manifest entry gives source SHA-256, dimensions, byte sizes, the audited
envelope, full-size fallback and profile URLs. Output paths include source and
encoder-setting hashes. Identical dimensions share one output file. Rerunning
reuses existing image exports; old version directories may remain locally but
are not referenced by the current manifest. Clean Docker builds contain only
current versions.

## Music

All MP3s longer than 60 seconds under `music` and `sound effects` are split into
one-minute parts; the last part contains the remainder. A single FFmpeg
segment-muxer pass copies compressed audio packets without re-encoding or
changing bitrate, pitch, channels or sample rate. Originals stay at their
existing URLs. Sub-second tails remain in the preceding part. All source packet
SHA-256 hashes are compared with the concatenated segment hashes, detecting
missing, repeated, changed or reordered packets.

The manifest records segment URLs, durations, timeline boundaries, sizes and
source SHA-256. `musicSeconds: 600` selects the first ten gameplay parts, then
loops to part zero. Their combined length is about 600.0065 seconds because cuts
follow MP3 frames. Later parts stay on the server but are not scheduled. The
separate 3m23s challenge cue now has four parts. Prepared lobby music is available
but the app does not currently play it.

The first gameplay download is **1.37 MiB** (1,440,749 bytes), versus 6.87 MiB
for the previous five-minute part. The ten-minute playlist totals **13.74 MiB**
(14,406,866 bytes). Smaller segments reduce startup and refill bursts, not the
bitrate or the amount of music played over ten minutes.

The first part and at most one upcoming part use the interruptible background
queue. The next download begins halfway through a part (30 seconds remaining
for a one-minute part), capped at 90 seconds of lead time for longer fallback
playlists. Each join uses a 150 ms crossfade and releases old audio/Blob buffers.
After the last selected part, playback returns to zero. If the next part is late,
the current part repeats. Pausing or muting cancels pending first/next-part work.
A failed active segment streams the original file at the corresponding timeline
position, with playback capped at ten minutes; this exceptional fallback can
transfer more bytes than the selected segments.

FFmpeg and FFprobe must be available on PATH, or set `FFMPEG_PATH` and
`FFPROBE_PATH` to their executable paths. On Windows the script also discovers
portable executables under `.codex/tools/ffmpeg/` (local, ignored, not shipped).
The Docker build installs Debian's FFmpeg tools in its build stage only; the
runtime nginx and game server images do not acquire that tool dependency.

```powershell
npm run assets:art
npm run assets:music
npm run assets:verify
```

## Verified loading measurements

The current 480 image set is **5.54 MiB** (5,804,238 bytes), versus **15.57 MiB**
at 1080. The ten one-minute gameplay parts total **13.74 MiB** (14,406,866 bytes), versus
94.58 MiB for the full gameplay recording. These totals exclude the separate
4.66 MiB challenge cue. Originals remain unchanged.

Chrome checks for the 480 trial before the one-minute music split at 1920x1080 and **DPR 2**, using fresh
browser contexts, 10 Mbps bandwidth and 150 ms simulated latency:

| Scenario | Assignment to all visible board art ready | New foreground bytes after assignment |
| --- | ---: | ---: |
| Immediate entry | 1.81 s | 1.05 MiB |
| 30 seconds in lobby | 0.85 s | 0 |

Cold entry reached board-ready 2.83 seconds after navigation. All 80 visible
images loaded; hover kept the same URLs; DPR 2 still used the 480 profile. The
browser confirmed game card requests during the lobby and audio playback from
part zero to part one and back to zero, with no later gameplay parts requested.
A separate Chrome check interrupted the first music file after 548,269 bytes,
resumed with HTTP 206 from that offset, and verified the reconstructed
7,201,062-byte file against its original SHA-256.
These measurements use an isolated local static server and the fake game
transport; they exclude public-tunnel, authentication and live-engine latency.
The zero-byte warm result means the visible art and game code were cached during
the lobby wait, not that the complete game uses no network traffic.

The measurements below describe the earlier 1080 profile, not the current trial.

Initial Chrome production-build checks at 1920x1080, DPR 1, with fresh browser contexts,
10 Mbps download bandwidth and 150 ms simulated latency:

| Scenario | Match assignment to all visible board assets ready | New foreground bytes after assignment |
| --- | ---: | ---: |
| Immediate game entry | 3.78 s | 3.58 MiB |
| 30 seconds warming in the lobby | 1.52 s | 1.19 MiB |

The immediate scenario reached board-ready 4.59 seconds after navigation.
These are local nginx measurements using the fake game transport, not public
internet or authentication/server latency guarantees. These precede the change
that prioritizes the card library before music during lobby warmup. The browser checks also
verified all 80 board images loaded, hover kept the same image URLs, DPR 2
selected the 2160 profile, original fallback after two failed exports, muted
startup without music requests, and playback moving to the buffered next part.
Autoplay was explicitly allowed for the segment playback check.

The complete 1080 image set is 15.57 MiB versus 450.70 MiB of original PNGs.
The first gameplay music part is 6.87 MiB versus the 94.58 MiB complete original.
Those totals describe asset sizes; each screen fetches only its visible and
scheduled assets. Prior production serving also supported full-size WebP twins,
so PNG totals should not be treated as the previous browser transfer size.

Local checks: 75 client tests pass; 1,576 server tests pass with 7 existing
skips; both TypeScript checks pass. HTTP checks cover immutable media headers,
gzip, audio byte ranges, original file availability and missing-asset 404s.
The production Docker build also passes asset verification. Its existing CSS
minifier emits a warning about `cqh` arithmetic; the browser renders the board
correctly. The server suite still reports its existing open-handle warning.

A public-tunnel diagnosis found a live SSH process announcing a new
hostname while the previous hostname returned HTTP 503, `no tunnel here`.
The local server remained healthy and continued its turn timers. The free
provider documents hostname rotation and a speed limit, so local simulated
bandwidth results cannot predict cold loads through that service. The launcher
now reports failures/rotation, and the client shows loss of its game connection.

## Distinguishing a slow request from a reaction timer

The client displays a waiting-for-reply notice when a command has no reply after
one second. It clears when that request settles; it does not persist for game
reaction windows. The browser keeps the last 100 local command-send/reply/failure
and snapshot-receipt records in `window.__htsrNetwork`. Records include command
type/ID, timestamps, elapsed reply time and snapshot version, with no command
payloads or hidden game state. Existing `window.__htsr` holds the latest view.
These diagnostics are local and do not add network requests.

In one playtest match, the server
accepted Silent Shadow at t = 0 s, closed its ten-second Challenge
window at t = 10 s, then dismissed its ten-second optional RollOnPlayedHero
choice at t = 20 s, when player 1's turn ended. This proves twenty seconds
of game-window waiting after the play reached the engine. The historical logs
do not contain the browser click time, so they cannot establish the preceding
network delay. A later small unauthenticated request measured 0.794 seconds
through the live tunnel versus 0.004 seconds locally; it does not measure the
earlier command's latency. Reaction timing and End Turn rules were not changed.

The one-minute production Docker build passes asset verification (88 segments,
including 69 full-source gameplay segments, four challenge segments and 15 lobby
segments). An isolated Chrome check against that image played all ten selected
gameplay segments back to the first and all four challenge segments back to the
first, with no full-original downloads and no later gameplay parts requested.
