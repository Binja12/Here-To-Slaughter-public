# Frontend Handoff — read this first in a new session

Goal: Hearthstone-style UI for the card game, single-player board first, to be
interview-portfolio quality. **Do not modify the game engine**
(`server/src/game/**`) — build UI + thin API glue around it.

**Never change a widget/object's POSITION or SIZE (dx/dy/h in layout.ts, or any
`CENTER_*`/`DECK_SLOTS`/`CENTER_SLOTS` geometry) unless the user specifically
asks for that.** The user tunes these by hand; touching them as a side effect
of an unrelated request (e.g. a hover/zoom fix) is a repeated mistake — confirm
first if a fix seems to require moving something.

## Current status — board layout & scale (session 6: 16:9 stage + centre widgets)

The board is a PLAIN felt `Table Background.png` + separate frame WIDGETS in
`client/public/board/Border Widgets/` (Heroes Frame 3:1, Leader Card Frame,
Small Card Back Frame, Big Card Frame, Center Border Frame square). Layout
lives in `client/src/board/layout.ts`, rendered by `Board.tsx` (frame → card
in each frame's inner window). The previous board attempts
(`client/src/game/GameView.*` — deleted; `client/src/tabletop/**` — on disk,
**not imported**) are dead; do not import from them.

### Four-layer architecture (Board.tsx)

The board renders as four explicit layers, bottom → top:

1. **Background** — a full-viewport `<div>` with `TABLE_BG`,
   `background-size: cover`, `pointer-events-none`. Decorative only, owns no
   layout. On ultrawide/tall viewports the extra area is just more felt
   (letterboxing), never extra spacing between board objects.
2. **Board stage** — a centred, locked **16:9 box** that IS the 1920×1080
   reference coordinate space. Sized `width: min(100vw, 100vh·16/9)` /
   `height: min(100vh, 100vw·9/16)` and translated to viewport centre, so it
   scales UNIFORMLY to fit any viewport. It declares `[container-type:size]`,
   so every `cqh`/`cqw` length inside resolves against the STAGE (not the
   viewport). Because the stage is always 16:9, `1cqh = 0.5625cqw` always, so
   widget sizes AND the gaps between players scale together — the composition
   is pixel-for-pixel identical (as a fraction of the stage) at every
   resolution. Verified at 1920×1080, 2560×1440, 3440×1440 (21:9, 440px
   letterbox each side), 1366×900 (66px letterbox top/bottom) — no scroll, no
   clipping. `overflow` is `visible` on the stage and every widget, so
   hover-zoomed cards are only ever bounded by the viewport edge, never by an
   intermediate parent.
3. **Centre wooden board** — the `center` frame, offset from stage centre by
   `CENTER_DX`/`CENTER_DY` (cqh) and sized by `CENTER_H` (cqh). Its children
   are the centre widgets (below).
4. **Player widgets** — hero rows, leader slots, hand-count slots + the hand,
   positioned in stage-relative cqh via `PLAYERS` in layout.ts.

### Positioning model (layout.ts)

Every geometry length is `cqh`/`cqw` relative to the 16:9 stage. Each widget
is a `WidgetDef {kind, h(cqh), dx, dy}` sized in `cqh` and placed by
`positionStyle(anchor, dx, dy)`:

- **bottom/top** (P1/P2): `dx` from horizontal centre (+right); `dy` from that
  edge. **left/right** (P3/P4): `dx` from that edge; `dy` from vertical centre
  (+down). **center** (centre widgets): `dx`/`dy` from the parent's centre
  (+right/+down). ('right' uses `left:calc(100%-dx)` NOT `right:` so the shared
  `-translate-x-1/2` still centres — that was a bug once.)
- `widthCqh(def) = def.h * ASPECT[def.kind]` — width is derived from height ×
  the frame's native aspect (keeps frame art undistorted). To decouple you'd
  add a `w?` to `WidgetDef`.

**Current scale constants (layout.ts):**

- `CENTER_H = 64`, `CENTER_DX = 0`, `CENTER_DY = -4` (centre board size +
  offset).
- `BIG = {leader:45, heroes:35, cardback:36}` — P1 (bottom, big).
- `SML = {leader:33, heroes:24, cardback:20}` — P2/P3/P4 (share a size).
- `PLAYERS` holds each seat's three widget dx/dy; top⇄bottom & left⇄right
  mirror. Tune density by editing `BIG`/`SML`/`CENTER_H`/dx,dy.
- `INSET` = each frame's inner card-window fraction (measured from the PNGs so
  the card doesn't bleed over the gold trim): `heroes {0.94,0.72}`,
  `leader {0.8,0.8}`, `cardback {0.76,0.82}`, `big {0.84,0.86}`,
  `center {0.82,0.82}`. Values differ because each frame's border thickness
  differs — they are NOT a cap; you can raise a value toward 1.0 and the card
  starts drawing over the border.

### Centre widgets (CENTER_SLOTS in layout.ts)

The centre-board contents are now **frame widgets too**, children of the centre
box, so moving/scaling the centre (`CENTER_DX/DY/CENTER_H`) carries them along.
Each is a `center`-anchored `<Widget>` and therefore has the SAME knobs as the
player widgets (position `dx/dy`, scale `h`, inner window `INSET[kind]`, content
stretch). `CENTER_SLOTS` defines:

- `monsters` — three `big`-frame slots (the flipped monsters), a row across the
  top band.
- `mainDeck` + `discard` — two `cardback` (small) frame slots in the lower band.
- `monsterDeck` — one `big`-frame slot in the lower band.

Placement is intentionally ROUGH (user tunes dx/dy/h exactly). `dx/dy` are the
widget-centre offset in cqh from the centre board's centre (+right/+down).

### Content sizing inside a frame (two levels)

1. **Window** — `INSET[kind]` (w×h fraction of the frame that is the card
   window). Bigger = card sits bigger inside the gold trim, affects every card
   of that kind.
2. **Fill within the window** — per component:
   - `SlotCard` (leaders, monsters, discard): `fit`% (default 80) with
     `object-contain`, OR pass `stretch` to fill both axes with `object-fill`
     (distorts aspect but lets INSET w/h stretch independently — used by the
     leader).
   - `HeroRow`/`HeroCardWidget`: `h-[92%]` scales every hero card in the strip.
   - `HandCount`: card-back box is `h-full w-full object-fill`, so both
     `INSET.cardback.w` and `.h` drive it independently.

**Tooling gotcha**: `preview_screenshot` in this environment is flaky above
~1280px wide (times out or returns a stale/cropped frame). Verify layout via
`preview_eval` `getBoundingClientRect` math against the stage/centre box; use
screenshots only as a final sanity look at ≤1280×720.

**Pending in this layout**: HUD (action points / win conditions / turn banner)
has no home yet — `ActionPointsBar.tsx` + `WinConditionsPanel.tsx` exist but
are NOT rendered; needs its own widget/spot.

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
- `HandCount` (in Board.tsx) — the `SMALL_BACK` card-back art fills the
  cardback frame's inner window on BOTH axes (`h-full w-full object-fill`), so
  both `INSET.cardback.w` and `.h` scale it independently; the count alone (no
  caption) sits above the centered logo (top ~30%) in the back's own warm gray
  `#5a4a33` and the "Alfa Slab One" webfont (Google Fonts link in
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
  in its slot (`fit` % + `object-contain` by default, OR `stretch` to fill both
  axes with `object-fill`, optional edge-aware `zoom`+`origin`): party leaders
  (BOARD design, `stretch`, zoom 2.3, seat origin), the 3 arena monsters (BOARD
  design, zoom 3.2, `origin-center`), and the discard pile (HAND design
  `/cards/magic.png`, `fit=90`, no zoom). `DeckPile` stacks 3 offset backs and
  takes a `back` prop (main deck→SMALL_BACK, monster deck→BIG_BACK). The centre
  monsters/decks are each wrapped in a `center`-anchored `<Widget>` (frame +
  inner window) placed by `CENTER_SLOTS` — see the centre-widgets section above.
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

### Targeting mode (targeting.tsx) — click-to-target for interactive actions

Generic system for any action that needs a target pick (steal, challenge,
attack, item attach…). `client/src/board/targeting.tsx`:

- **TargetKey**: every board element has a stable string identity via the
  `tkey` builders (`leader:p1`, `hero:p2:3`, `handStack:p3`, `handCard:2`,
  `monster:1`, `mainDeck`, `monsterDeck`, `discard`). The server should
  eventually speak this same vocabulary when it lists valid targets.
- **TargetingProvider** (wraps the board in Board.tsx) holds the active
  `TargetingRequest {source, targets, onPick, onCancel}`. `begin(request)`
  enters targeting mode; clicking a target calls `onPick(target, source)`;
  Escape, click-away (board-root onClick), or clicking the source cancels.
- **useTargetable(key, onActivate?)** — called by every card-ish component
  (SlotCard, HeroCardWidget, HandCount, DeckPile, DiscardPile, PlayerHand's
  FanCard). Returns `{mode, className, onClick, targeting}`; spread
  `className` + `onClick` on the element that should dim/glow. `onActivate`
  is the element's own normal-mode click (e.g. leader starting its steal) —
  never fires while a request is active. Dimmed elements don't swallow
  clicks, so they bubble to the root → cancel. Dimmed cards also suppress
  their hover zoom.
- **Visuals are pure CSS** (index.css): root carries `.targeting`; every
  visual element has `.dimmable` (decorative art — frames, felt, HUD — has
  it hardcoded); source/targets get `.dim-exempt` (+ `.target-aura` on
  targets, same green glow as card-aura). Rules: (1) all `card-aura`s go
  out except target auras, (2) `.dimmable:not(.dim-exempt)` gets
  `brightness(.35) saturate(.6) blur(.12cqw)`. RULE ORDER MATTERS — the
  aura-kill rule must precede the dim rule (equal specificity; a dimmed
  playable card must end up dimmed, not bright-aura-less). Whole-pile
  components (DeckPile/DiscardPile/HandCount, HeroCardWidget) put the
  classes on their CONTAINER so the unit dims/glows as one; then children
  must NOT also carry `dimmable` (double-dim). The hand-focus rule is
  scoped to `.board-root:not(.targeting)` so it can't fight target auras.
- **Glowing = pressable**: EVERY playable (green-aura) card is a pressable
  source — leaders (SlotCard `onActivate`), heroes (HeroRow
  `onActivateFor(i)`), hand cards (PlayerHand `onActivateCard(i)`), arena
  monsters and the main deck (CenterArena `onActivate`). Each is gated by
  its own `playable` flag, so ONLY glowing cards react (and only they get
  `cursor-pointer`, straight out of useTargetable — non-glowing cards stay
  `cursor:auto` and inert). All call Board's `activate(key)`.
- **activate(key)**: looks up `DEMO_ACTIONS[key]`. If the action has targets
  → `begin()` targeting mode to pick one. Otherwise (no entry, or an entry
  with an empty target list) it's a DIRECT play and resolves immediately
  (currently a console.log; later the `game:action` send). So a glowing card
  with no targeting action still does something when pressed.
- **Hand involvement**: when the active request's source OR targets include
  `handCard:` keys, PlayerHand FORCES the fan open (bypasses group-hover)
  so the cards are visible/pickable; it snaps back to hover-driven when the
  request ends. Dimmed fan cards lose their hover-grow.
- **Adding an action** = one `begin()` call with the source key, target
  keys, and an onPick — no component changes needed. Demos in
  `DEMO_ACTIONS` (Board.tsx), onPick console.logs until the server drives
  it (that's also where `game:action` will be sent):
  leader:p1 (Shadow Claw) → steal → 3 opponent handStacks;
  hero:p1:0 (Fuzzy Cheeks) → play-a-hero → only the HERO cards in hand
  (fan force-opens); handCard:2 (Critical Boost) → boost → own 10 heroes
  (hand card as source, fan stays open while aiming at the board).

### Dice roll (DiceRoll.tsx) — 2×3D tumbling d6, per-seat throws

`client/src/board/DiceRoll.tsx` shows a roll as TWO CSS-cube dice thrown
FROM the roller's seat onto that seat's patch of open felt beside the centre
board. Flow: hero pressed → server replies with the result → Board sets
`diceRoll {seat, values:[a,b], nonce}` → `<DiceRoll roll={...}>` plays it.
DEMO wiring (until useGameState): pressing ANY hero on p1's board throws
p1's dice via `activate()` (350ms fake latency; targeting demos like
hero:p1:0 still win); pressing an opponent's hero throws THAT seat's dice
directly — so all four directions are previewable. HeroRow's `onActivateFor`
is therefore no longer gated by `playable` (every hero is pressable).

- **Placement**: `DICE_SPOTS` in layout.ts, per seat `{dx, dy, fromDx,
  fromDy, pairDx, pairDy}` + shared `DICE_SIZE` (7.95cqh — the original 11
  shrunk 15% twice, both per user request). dx/dy = landing-spot centre from the STAGE centre;
  fromDx/fromDy = throw START relative to the spot (points back toward the
  thrower); pairDx/pairDy = half the dice separation (die A at −pair, die B
  at +pair). Seat → spot: p1(bottom)→bottom-LEFT space (user-marked red
  rect), p2(top)→top-RIGHT column, p3(left)→top-LEFT column,
  p4(right)→bottom-RIGHT space. The bottom spaces are wide → horizontal
  pairs; the side columns are narrow → near-vertical pairs. All hand-tunable.
- **Cube**: six face PNGs `client/public/board/Dice/dice_face_N.png` on a
  `preserve-3d` box, laid out like a REAL die (opposites sum to 7): 1↔6
  front/back, 2↔5 right/left, 3↔4 top/bottom — mid-tumble adjacencies are
  physically correct. `translateZ`/`perspective` use cqh (resolve fine inside
  the size container).
- **Animation** (WAAPI per die, `fill:'both'` so the 120ms stagger of the
  second die holds keyframe 0; dice remount per throw via `key={nonce}`):
  FLIGHT wrapper slides in from fromDx/fromDy decelerating; TOSS wrapper
  drops from above with landing bounce + hop; the CUBE does 2-3 random full
  X+Y turns decelerating into the EXACT orientation for the rolled face
  (`SHOW` map); a contact SHADOW (outside the flight) fades in on impact.
  The settled dice STAY on the felt (component is fully prop-controlled):
  the next throw remounts them, `roll=null` clears the table (that's the
  turn-end hook once live wiring lands). `nonce` replays identical values.
- Verified all 4 seats: dice land at spot±pair exactly, every die's shown
  face matches its value dead-on (cube matrix → normal check).

DEMO data drives everything — next: wire `useGameState`.
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
