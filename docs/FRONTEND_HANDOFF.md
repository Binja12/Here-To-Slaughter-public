# Frontend Handoff — read this first in a new session

Goal: Hearthstone-style UI for the card game, single-player board first, to be
interview-portfolio quality. **Do not modify the game engine**
(`server/src/game/**`) — build UI + thin API glue around it.

## Current status (session 3 — board rebuild restarted FROM SCRATCH)

The previous board implementations (`client/src/game/GameView.*` — deleted;
`client/src/tabletop/**` — still on disk but **no longer imported**) grew too
large to iterate on reliably. The board is now being rebuilt **modularly** from
the user's reference image (a 4-player physical table layout), skeleton-first
to keep each step small and layout-accurate.

### Design pivot (session 4): modular frame widgets over a plain table

The baked-in painted background was replaced by a PLAIN felt
`Table Background.png` + separate frame WIDGETS in
`client/public/board/Border Widgets/` (Heroes Frame 3:1, Leader Card Frame,
Small Card Back Frame, Big Card Frame, Center Border Frame square). Layout in
`client/src/board/layout.ts`, rendered by `Board.tsx` (table → frames → cards
in each frame's inner window).

**RESPONSIVE MODEL (important, per user):** widgets do NOT rescale when the
window changes WIDTH — they keep their size and only REPOSITION. Achieved by
sizing every widget in `cqh` (1% of the game container HEIGHT, via
`container-type: size` on the full-viewport root) so size depends on height
only, and ANCHORING each player to their screen edge (bottom/top/left/right)
with fixed cqh offsets. So a player's three widgets keep constant distances
from each other while the gaps BETWEEN players flex with the window. Verified:
card back is 139x194px at both 1280- and 1680-wide (same height) — no rescale,
just reposition. (Height IS the scale axis — a taller window = bigger board.)

Per the mockup: bottom (P1) frames are BIG (`BIG` sizes), the other three
share `SML`; top⇄bottom & left⇄right mirror; leader > cardback; centre square
(`CENTER_H`) exactly centred. `PLAYERS` in layout.ts holds each widget's
`{kind, h(cqh), dx, dy}`; `dx/dy` are the widget-centre offset in cqh
(bottom/top: dx from H-centre, dy from that edge; left/right: dx from that
edge, dy from V-centre). `positionStyle()` turns anchor+dx+dy into CSS
left/top (note: 'right' anchor uses `left:calc(100%-dx)` NOT `right:` so the
shared `-translate-x-1/2` still centres correctly — that was a bug). `INSET`
= each frame's inner card-window fraction. Tune density by editing sizes /
dx,dy / CENTER_H. Verified dense, no visual overlaps at 16:9 (transparent
frame corners absorb the few tight bounding-box touches).

### Density pass (session 5): bigger widgets, zero-overlap at 1920x1080, cardback fit fix

User complaint: too much dead space vs. their reference mock, and the
`cardback` (hand-count) frame's card art was oversized for its window,
bleeding past the gold trim. Fixes, in `layout.ts` / `Board.tsx`:

- **`INSET` fractions were wrong, not eyeballed close enough.** Measured the
  real dark card-window of each frame PNG by scanning pixel alpha/color in
  the browser (`isWindow = a>200 && r<85 && |r-b|<25`, widest run near the
  mid row/column) instead of guessing — `cardback`'s old inset (`0.86/0.9`)
  was BIGGER than the frame's actual window (`0.777/0.834` measured), so the
  card overflowed onto the border. Corrected all three in-use kinds:
  `heroes {0.94,0.72}`, `leader {0.8,0.86}`, `cardback {0.76,0.82}` (`big` is
  unused dead code, left alone).
- **`HandCount`'s card div was sized by `h-full`**, but the cardback window's
  real aspect (~0.666) is narrower than the card art's own aspect (0.714) —
  sizing by height forced the width past the window edge. Changed to
  `w-full` (width fills the window exactly; height auto-shrinks under the
  aspect-ratio, small letterbox top/bottom) — general rule: when a frame's
  window aspect could differ from its card's aspect, size by whichever axis
  is smaller. Verified via `getBoundingClientRect`: card box now `<=` window
  box on both axes, no overflow.
- **Bigger + denser**: `CENTER_H` 49→42 (traded a bit of centre-square size
  for headroom — it was the binding constraint stopping `BIG.heroes` from
  growing) and `BIG {leader:34→38, heroes:24→26, cardback:30→33}`,
  `SML {leader:26→27, heroes:18→20, cardback:23→24}`. Every `PLAYERS` dx/dy
  was recomputed by hand for touching (~1cqh gap) intra-player spacing.
- **No-overlap check is real, not eyeballed**: corner crowding between P2
  (top) and P3/P4 (left/right) — P2's leader sitting just left of P2's
  heroes bar collided with P3/P4's leader+cardback stack reaching for the
  top-left/right corners — isn't obvious from a screenshot at this card
  count; verified via a `getBoundingClientRect`-based pairwise overlap
  scan run through `preview_eval` (all 13 widgets × all 13, reporting any
  positive-area intersection) and a standalone Node reimplementation of the
  same anchor math for fast iteration before touching the browser. Both now
  report zero overlaps and zero edge-clipping at 16:9. Confirmed the
  no-rescale contract still holds: card-back widget is pixel-identical
  (170x238 at height 720) at both 1280- and 1600-wide viewports.
- **Tooling gotcha**: `preview_screenshot` in this environment is unreliable
  above ~1366px wide or after `document.documentElement.style.zoom` /
  `transform` hacks — it can return a stale or cropped frame that doesn't
  match the live DOM (confirmed by cross-checking against
  `getBoundingClientRect` data, which was always correct). Do layout
  verification via `preview_eval` bounding-box math; only use
  `preview_screenshot` for a final sanity look at <=1280x720.

**Pending in this layout**: HUD (action points / win conditions / turn
banner) has no home yet — `ActionPointsBar.tsx` + `WinConditionsPanel.tsx`
still exist but are NOT rendered; needs its own widget/spot. Decks (main/
discard/monster) live in the centre square's lower band. Table BG uses
`background-size: cover` (crops slightly on non-16:9 windows).

### Earlier (session 3): painted background + zone overlay

The user supplied a painted board background with every frame pre-drawn
(`client/public/board/board-bg.png`, 1672x941, recovered from the clipboard
via PowerShell `[Windows.Forms.Clipboard]::GetImage()`). The Tailwind-drawn
skeleton (`BoardSkeleton`), the circular AP tracker, and the dark GameInfoBox
were **deleted** — superseded by widgets that overlay the painted frames.

**How positioning works (the core contract):**
- `client/src/board/zones.ts` — every painted frame measured by hand as a
  `{left, top, width, height}` **percentage** rect. Tweak here if a widget
  drifts off its frame.
- `client/src/board/Board.tsx` — 16:9 `aspect-video` stage, background
  stretched `100% 100%`, one absolutely-positioned `<Zone>` per rect, and
  `[container-type:size]` on the stage so ALL text/gap/shadow lengths inside
  widgets use **cqw/cqh units** (percent-of-board). Result: stretch the board
  to any size and every widget scales + repositions in lockstep (verified).
- Seat zones per player: Party Leader frame (big), hand-count frame (big),
  and a wide hero strip. Center wooden frame: 3 monster slots on top; main
  deck / discard / monster deck / dice slots beneath. Right HUD: 8-socket
  brass AP bar, blue "your turn" scroll, 7-row win-condition ledger.

**Widgets done (demo data in `DEMO` inside Board.tsx until phase 4):**
- `HeroRow.tsx` — hero widget. Full card scans (name/rules baked into art —
  never overlay text) from `client/public/cards/heroes/*.png` (copied +
  kebab-cased from `shared/cards image/Hero *.png`); cards fit strip height
  and hover-zoom. Overflow = straight fan (user spec, from a playing-cards
  photo but WITHOUT rotation): cards never resize; below the fan threshold
  (`FAN_FROM`: main=5, side=4) they sit side by side centered; at/above it
  a CSS grid `repeat(n-1, minmax(0,1fr)) max-content` spreads the row
  across the WHOLE strip (user: "fill the whole space") — each card sits at
  an equal share of the width, last card fully visible at the right edge,
  zIndex = index (right covers left), overlap emerges only as large as the
  count requires. No geometry constants; adapts to any strip size, 10 cards
  fit. Overlapped cards cast their shadow LEFT onto the covered card. Items
  will tuck under their hero later.
- `FramedCard.tsx` — two-layer card composite: card scan behind, ornate
  class-frame PNG above, both absolutely filling the SAME box (frame's
  native aspect 1086/1448 sets the box ratio). ALL SIX class frames exist
  (`client/public/board/frame-{fighter,guardian,ranger,thief,wizard,bard}.png`,
  each 1086x1448, supplied by the user; "theif" typo renamed to thief) and
  are keyed case-insensitively off the shared `HeroClass` enum value via
  `CLASS_FRAMES`. `HeroRow` takes `HeroInPlay[]` (`{slug, heroClass}`) and
  passes the class through. All 8 current hero scans are Bards per
  `server/src/data/base-game-cards.ts`, so the demo shows only bard frames;
  other classes engage automatically once their hero scans/state arrive.
  Known nuance: the frame's gold medallion sits a touch above the scan's own
  red class icon — cosmetic, revisit if the user wants pixel-registration.

**Typography** (Google Fonts, linked in `client/public/index.html`):
Cinzel = headings (`font-heading`), Cormorant Garamond = body text
(`font-body` + the `body` default in `index.css`), Alfa Slab One = only the
hand-count numeral (matches the card back's printed logo). `font-heading` is
applied on TurnBanner, win-condition labels/progress, and zone dev labels.
- `ActionPointsBar.tsx` — lights one painted socket per available AP (no
  numeral — AP can exceed 3); `+N` chip if AP > 8 sockets.
- `WinConditionsPanel.tsx` — overlays the ledger rows: diamond socket glows
  when done, label between sockets, progress count centered on the right
  circle socket. Takes `WinCondition[]` (max 7).
- `HandCount` (in Board.tsx) — the card-back art
  (`client/public/board/card-back.png`, cream "HERE TO SLAY" back supplied by
  the user) sits INSIDE the painted hand frame (h-76% so the gold border
  stays visible); the count alone (no caption) sits in the empty cream band
  above the centered logo (top ~26%, never obstructing it) in the back's own
  warm gray `#6D6765` and the "Alfa Slab One" webfont (Google Fonts link in
  `client/public/index.html` — matches the logo's slab lettering).
- `TurnBanner` (in Board.tsx) — scroll text.
- `GameCard.tsx` (kept from earlier) — Tailwind-drawn card blueprint with
  bottom-center overlapping badge; useful if any card lacks scanned art.

- `PlayerHand.tsx` — LOCAL SEAT ONLY (P1 bottom; opponents just show
  stack+count). Wraps the hand stack; hovering opens a fan of the actual
  hand cards shaped like a held hand (user's reference photo). Geometry:
  big cards (28cqh), deep "wrist" pivot (`origin 50% 200%`, `PIVOT`=2.0),
  arc step `min(9°, 56/(n-1))`, plus a COMPUTED horizontal nudge that tops
  spacing up until ~70% of every card is uncovered (`VISIBLE`=0.75 — set
  slightly above 0.7 because the analytic rotation-spread estimate runs
  ~5% hot; measured 0.70-0.71 in-browser). The fan is clamped to the board
  right edge (`RIGHT_EDGE_CQW`, slides left via the `anchorCenterCqw` prop
  passed from Board = hand-zone center). zIndex left→right. Anchored
  `bottom-[12%] left-1/2`, overlapping the stack — one CSS `group` hover
  keeps it open while the cursor is on stack OR fan, no JS state.
  IMPORTANT structure rule: translate/rotate placement is on a wrapper
  div, hover zoom (`hover:scale-[1.6]` with `origin-bottom` — grows
  UPWARD, lower edge stays planted) is on the img — combining them on one
  element lets Tailwind's hover transform wipe the inline fan transform
  and the card jumps sideways (that bug already happened once). Quirk: the
  cursor resting on the stack hovers the top-z fan card, so opening the
  fan usually zooms a right-side card immediately. The p1Hand `<Zone>`
  gets `z-40`. Demo cards in `DEMO.p1.handCards` (urls).
- `assets.ts` — card-art manifest. TWO designs per card (user's rule):
  - **HAND design** (`/cards/heroes/<class>/<NN>_<snake>.png`, thin border)
    = cards in hand + the discard pile. `heroCardUrl(slug)`,
    `heroClassOf(slug)`, `HEROES` map. `CLASS_HEROES` arrays MUST stay in
    folder order (NN = index+1).
  - **BOARD design** (`/board/heroes/Hero <Title>.png`,
    `/board/Monsters/Monster <Name>.png`, `/board/Leaders/Leader <Name>.png`,
    ornate frame BAKED IN) = cards in play. `boardHeroCardUrl(slug)`
    (returns null when art missing → caller falls back to FramedCard),
    `boardMonsterUrl(name)`, `boardLeaderUrl(name)`. `LEADERS` maps the six
    class leaders (Bard→The Charismatic Song, Wizard→The Cloacked Sage,
    Ranger→The Divine Arrow, Fighter→The Fist Of Reason, Guardian→The
    Protecting Horn, Thief→The Shadow Claw). Filename quirks handled:
    `beary-wise`→"Breay Wise", `guiding-light` has no board art, "Warworn
    Owlbear" lacks the "Monster " prefix. Aspects: `BOARD_CARD_ASPECT`
    1060/1484, `MONSTER_CARD_ASPECT` 956/1645, `LEADER_CARD_ASPECT`
    1024/1536.
  - **BACKS**: `BIG_BACK` (`/board/Big Card Back.png`, black/red) = monster
    deck ONLY; `SMALL_BACK` (`/board/Small Card Back.png`, cream) = every
    other pile + the hand-count widgets.
  Party leaders still use the root `/cards/leader.png` template (no board
  leader art yet).
- `HeroRow.tsx` `HeroCardWidget` — renders the BOARD hero scan (frame baked
  in), FramedCard fallback when board art missing. Wrapper div owns sizing
  (`aspectRatio` + h-92%) and the edge-aware hover ZOOM (inline transform,
  `ZOOM.main`=2.3 / `.side`=2.0); the card img is `absolute inset-0` so its
  intrinsic width does NOT inflate the fan grid's `max-content` column
  (that bug made the last fan card render full-size — don't un-absolute
  it). Zoom `ZOOM.main`=2.3 / `ZOOM.side`=3.2 (sides are smaller at rest so
  need a bigger scale to read). Zoom origin per `seat`: bottom→
  `origin-bottom` (grows up), top→`origin-top` (down),
  left→`origin-bottom-left`, right→`origin-bottom-right` (up + inward) —
  keeps the enlarged card on-screen at every edge. HeroRow takes `seat`
  ('bottom'|'top'|'left'|'right'). Verified: 10 heroes fit both side strips.
- `SlotCard` + `DeckPile` (in Board.tsx) — `SlotCard` centers one card scan
  in its slot (`object-contain`, `fit` %, optional `rotate`, optional
  edge-aware `zoom`+`origin`): party leaders (BOARD design, zoom 2.4,
  seat origin), the 3 arena monsters (BOARD design, zoom 3.8,
  `origin-center` — monsters are tall + near the top, center keeps title
  AND rules on screen), and the discard pile (HAND design
  `/cards/magic.png`, rotated 7°, no zoom). `DeckPile` stacks 3 offset backs
  and takes a `back` prop (main deck→SMALL_BACK, monster deck→BIG_BACK).
- **Top-layer on zoom**: every in-play `<Zone>` (heroes, leaders, monsters)
  AND the p1Hand zone carry `has-[:hover]:z-[100]` (Tailwind 3.4 `has`
  variant) so the zone CONTAINING a hovered card jumps above ALL sibling
  zones. INSIDE the fanned hero row each cell has an inline base
  `zIndex:i` (right covers left); a `hover:z-*` CLASS can NOT beat an inline
  z-index, so the hovered cell raises its z INLINE to 999 via
  onMouseEnter/Leave — without this the hovered card was still covered by the
  cards to its right (user-reported). Leaders zoom at 2.3 (same as main
  heroes, per user) with seat-appropriate origins.
- **HUD text fits the painted frames** (positions measured from
  board-bg.png): `ActionPointsBar` has NINE sockets (not 8) with lamps
  absolutely placed on the socket centres (`SOCKET_X`, ~11%..89% even) and
  sized to sit inside the hexagons. `WinConditionsPanel` is inset to
  8%..92% vertically so its 7 rows land on the 7 painted rows; per row the
  done-diamond sits at x=11% (`DIAMOND_X`), the label in the recessed bar
  (18%..80%, truncates), and the progress count centred in the right circle
  socket at x=90% (`CIRCLE_X`).

**Still placeholder**: dice slot (faint label). DEMO data drives
everything — next: wire `useGameState`.
3. Fill zones with static placeholder cards; check proportions vs reference.
4. Wire to live state (`useGameState`) zone by zone.
5. Interactions (draw / play / roll / attack), then polish (animations, HUD).

### Skeleton layout contract (from the reference image)

- **Global container**: fixed 16:9 (`aspect-video`), dark wood tone
  (`bg-amber-950/40`), centered on a `bg-zinc-950` full-viewport stage.
- **Main grid**: CSS Grid, 3 columns `[1fr_3fr_1fr]` (~20/60/20).
  - **Left column — Player 1**: hand counter (top), Party Leader slot,
    vertical "Heroes in Party" list (fills remainder).
  - **Center column — arena**, 4 vertical sections:
    1. Top: P2 horizontal "Heroes in Party" row (~18% height).
    2. Mid-top: Monster Cards zone — 3 large card slots (flex-3, red tint).
    3. Mid-bottom: decks row — Monster Deck, Main Deck, Discard Pile,
       Slayed Monsters (flex-2).
    4. Bottom: P4 horizontal "Heroes in Party" row (~18% height).
  - **Right column**: Action Points tracker (top), P3 hand/party area
    (middle: hand counter + party leader + hero slots), GAME INFO objective
    widget (bottom).

### Styling: Tailwind CSS (NEW this session)

- `tailwindcss@3` + `postcss` + `autoprefixer` installed as devDeps of the
  `client` workspace (Tailwind v3 because CRA/react-scripts 5 auto-detects
  `client/tailwind.config.js` via its built-in PostCSS pipeline; v4 does not
  work with CRA).
- Directives added at the top of `client/src/index.css`. No postcss.config
  needed — CRA handles it.
- The old CSS files under `client/src/tabletop/*.css` are legacy; new board
  code should be Tailwind-only.

### How to run (2 terminals, from repo root)
```
npm run server        # NestJS + socket.io on :3000
npm run client        # CRA dev server on :3001 (client/.env sets PORT=3001)
```
`.claude/launch.json` also has a `client-alt` config on :3002 for when another
session already occupies :3001.

### Architecture

- **Server glue (safe to edit):**
  - `server/src/runtime/runtime.service.ts` — bootstraps ONE solo game from the
    engine: registers all base cards, builds/shuffles decks, flips 3 monsters,
    seats player `p1` (leader `leader-116`), deals 5, starts engine. Exposes
    `performAction/submitModifier/resolveOpenWindows/endTurn/getSnapshot/getCatalog`.
    Tracks the open modifier window by listening to engine events. Supports
    `game:start {players?: 2-4, autoPass?: boolean}`; opponent seats auto-pass
    after 1.5s; `game:action` accepts a dev-only `playerId` override.
  - `server/src/runtime/runtime.types.ts` — DTOs. **Mirrored by hand in
    `client/src/types.ts` — keep both in sync.**
  - `server/src/socket/socket.gateway.ts` — socket messages:
    in: `game:start | game:sync | game:action | game:reaction | game:skip | game:endTurn`;
    out: `game:catalog | game:state | game:event` (state broadcast after every
    event). `game:sync` re-sends catalog+state (client emits it on hook mount
    because the socket survives CRA hot reloads while React state does not).
- **Client (CRA, React 19, TS, Tailwind):**
  - `client/src/board/BoardSkeleton.tsx` — the NEW board (phase 1 skeleton).
    `App.tsx` renders this.
  - `client/src/state/useGameState.ts` — socket → state hook + action senders
    (still valid, reuse in phase 4).
  - `client/src/socket/socket.ts` — socket.io-client singleton (URL from
    `REACT_APP_SERVER_URL`, default `http://localhost:3000`).
  - `client/src/tabletop/**` — PREVIOUS board attempt, disconnected. Mine it
    for reference (card frames, dice tray, event log ideas) or delete it once
    the rebuild passes phase 3. Do not import from it into `board/`.
  - Card template art per type lives in `client/public/cards/*.png`. **NO text
    overlays on cards** (user spec: the card art already contains
    name/description/stats).

### Environment gotchas (Windows machine)
- Node.js installed via `winget install OpenJS.NodeJS.LTS` (v24). If a shell
  can't find npm:
  `$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine')`.
- `npm run build --workspace=server` must pass before `npm run server`
  (start:dev compiles itself, plain `start` uses dist).
- `shared` is consumed as a real workspace package: `shared/package.json` main
  points to `dist/` → after editing `shared/src`, run `npx tsc` inside
  `shared/`.

### Pre-existing issues (not caused by frontend work)
- **Engine bug**: `game-event-factory.ts` `cardRemovedFromHand()` emits
  `GameEventType.HeroAddedToParty` (copy-paste error) → hero plays fire the
  event twice and item/magic plays fire a spurious one. Worked around by
  deduping consecutive identical events in `client/src/state/useGameState.ts`
  (remove the workaround when the factory is fixed). Engine untouched per the
  user's rule.
- 3 failing tests in `server/src/game/actions/roll-on-hero-action.spec.ts`
  (user's WIP around modifier windows).
- `server/src/game/cards/monster-card.specs.ts` is stale (old API, wrong
  `.specs.ts` suffix so jest never runs it); excluded from build via
  `tsconfig.build.json`.

### Verified flows (engine/socket side — don't re-verify, spot-check only)
Socket smoke: draw (AP-1, hand+1) ✓, play hero ✓, roll→window→skip→rollback ✓,
modifier submit (+3, burned from hand, RollSuccess) ✓, attack→FightBack ✓,
turn auto-end at 0 AP + End Turn button ✓.
