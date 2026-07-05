# Frontend Handoff — read this first in a new session

Goal: Hearthstone-style UI for the card game, single-player board first, to be
interview-portfolio quality. **Do not modify the game engine**
(`server/src/game/**`) — build UI + thin API glue around it.

## Current status (session 1 — board + 2-4 player layout DONE and verified)

Working end-to-end: board renders with up to 4 seats, draw / play hero / equip
item / play magic / roll on hero / attack monster all function over Socket.io,
modifier window opens with countdown + modifier card buttons + "Resolve now",
state rolls back on failed rolls (engine snapshot/restore), event log shows
plays. Opponents (p2=TOP, p3=LEFT, p4=RIGHT) render card-back hand fans
anchored off their screen edge (top = reversed arc, sides = rotated toward the
board), a leader oval portrait (biggest piece, active-turn glow), small hero
portraits, and slain-monster fans oriented toward the bottom. Opponent seats
AUTO-PASS their turn after 1.5s (RuntimeService) until real per-socket
identity exists; `game:start` accepts `{players?: 2-4, autoPass?: boolean}`
and `game:action` accepts a dev-only `playerId` override for driving opponent
seats from test scripts.

### How to run (2 terminals, from repo root)
```
npm run server        # NestJS + socket.io on :3000
npm run client        # CRA dev server on :3001 (client/.env sets PORT=3001)
```

### Architecture
- **Server glue (new, safe to edit):**
  - `server/src/runtime/runtime.service.ts` — bootstraps ONE solo game from the
    engine: registers all base cards, builds/shuffles decks, flips 3 monsters,
    seats player `p1` (leader `leader-116`), deals 5, starts engine. Exposes
    `performAction/submitModifier/resolveOpenWindows/endTurn/getSnapshot/getCatalog`.
    Tracks the open modifier window by listening to engine events.
  - `server/src/runtime/runtime.types.ts` — DTOs. **Mirrored by hand in
    `client/src/types.ts` — keep both in sync.**
  - `server/src/socket/socket.gateway.ts` — socket messages:
    in: `game:start | game:sync | game:action | game:reaction | game:skip | game:endTurn`;
    out: `game:catalog | game:state | game:event` (state broadcast after every
    event). `game:sync` re-sends catalog+state (client emits it on hook mount
    because the socket survives CRA hot reloads while React state does not).
- **Client (CRA, React 19, TS):**
  - `client/src/game/GameView.tsx` + `GameView.css` — Hearthstone-style board
    (user-specified layout, keep it): monster row + monster deck center;
    the monster ROW is the exact horizontal center of the board (middle
    monster on the screen's center axis; the monster deck hangs off its right
    and must NOT shift the centering); heroes are OVAL portrait frames
    (`.portrait-hero`, wide crop); leaders use a GATE/ARCH frame (HS-style,
    arched top + flat bottom, `.portrait-leader`/`.portrait-opp`) and sit on
    the layer BEHIND all cards (slain cards + hand paint over them); the local
    leader sits between heroes and hand, bottom ~10% behind the hand; slain
    monsters flank the leader ALTERNATING left, right, left… (newest closest),
    card-shaped, fanned like the OWNER's hand fan (top player's fan is
    mirrored/reversed to match his hand); hand is a fanned ARC bottom
    center dipping exactly 15% of card height off-screen (`dipPct = 0.15`);
    hover/select inspect straightens + enlarges 1.6x IN PLACE (lift = dip +
    10px only, no big jump — user matched this to HS); playable glow is a
    crisp green outline + drop shadow (`.card-glowing`), NOT a fuzzy halo;
    main deck + AP orbs bottom-RIGHT; discard bottom-LEFT; End Turn on right
    edge. Interactions: hand cards enlarge on hover anchored to their
    slot (`.hand-slot` keeps the original footprint = hover region, inner card
    is pointer-events:none, so it shrinks when the cursor exits the original
    size — user explicitly wants this); tap-to-play (click hand card to select
    → valid zones glow → click zone/hero) AND drag & drop both work; hover on
    any IN-PLAY card shows an enlarged side-preview panel next to it; click
    hero=roll, click monster=attack, click main deck=draw.
  - `client/src/components/Card.tsx` + `Card.css` — template card by type
    (`client/public/cards/{hero,item,magic,modifier,challenge,monster,leader}.png`
    copied from `shared/cards image/`), face-down back. **NO text overlays on
    cards** (user spec: the card art already contains name/description/stats);
    the hover side-preview is likewise a pure enlarged card image.
  - `client/src/state/useGameState.ts` — socket → state hook + action senders.
  - `client/src/socket/socket.ts` — socket.io-client singleton (URL from
    `REACT_APP_SERVER_URL`, default `http://localhost:3000`).

### Environment gotchas (Windows machine)
- Node.js was MISSING on this machine; installed via
  `winget install OpenJS.NodeJS.LTS` (v24). If a shell can't find npm:
  `$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine')`.
- `npm run build --workspace=server` must pass before `npm run server`
  (start:dev compiles itself, plain `start` uses dist).
- `shared` is consumed as a real workspace package now: `shared/package.json`
  main points to `dist/` → after editing `shared/src`, run `npx tsc` inside
  `shared/`. (The old tsconfig `paths` alias broke `nest build` output and was
  removed from `server/tsconfig.json`.)

### Pre-existing issues found (not caused by frontend work)
- **Engine bug**: `game-event-factory.ts` `cardRemovedFromHand()` emits
  `GameEventType.HeroAddedToParty` (copy-paste error) → hero plays fire the
  event twice and item/magic plays fire a spurious one. Worked around by
  deduping consecutive identical events in `client/src/state/useGameState.ts`
  (remove the workaround when the factory is fixed). Engine untouched per the
  user's rule.
- 3 failing tests in `server/src/game/actions/roll-on-hero-action.spec.ts`
  (user's WIP around modifier windows, present before this session).
- `server/src/game/cards/monster-card.specs.ts` is stale (old API, wrong
  `.specs.ts` suffix so jest never runs it); excluded from build via
  `tsconfig.build.json`. Consider deleting/rewriting it.
- Fixes applied to make the repo build (types only, no engine logic):
  `shared/src/types.ts` (CardBase: `ability` optional, added `effect?`/`skill?`),
  `server/src/game/actions/index.ts` (stale barrel exports),
  `shared/tsconfig.json` (removed server file from include).

## Where to continue (in order)

1. **Polish solo board** — animations: card draw flight, dice roll (show
   `DiceRolled` as a rolling d10 in center), monster slain celebration, hand
   card raise on hover (currently slides left), drag ghost/drop-zone highlight.
2. **Real multiplayer seats** — per-socket identity (map socket.id → playerId
   on connect/claim), remove the `playerId` action override and auto-pass,
   audience-filter opponent hands out of the snapshot (currently their card
   ids are sent and just rendered as backs).
3. **Challenge window UI** — engine already has `ChallengeWindow`
   (`game:reaction` needs a challenge variant + `PlayChallengeReaction` wiring
   in runtime service); UI: prompt + dueling rolls + both-side modifiers.
4. **Win conditions + end screen** — pass real win conditions to `GameEngine`
   in `RuntimeService.createGame()` (currently `[]` = endless sandbox).
5. **Lobby/multiplayer** — `client/src/lobby/LobbyView.tsx` and
   `client/src/state/useLobbyState.ts` are placeholders; `server/src/lobby/`
   has types only.
6. **Per-card art** — catalog `image` paths (e.g. `heroes/bad-axe.png`) have no
   real files yet; Card.tsx uses one template per type. Swap when art exists.

## Verified flows (don't re-verify, spot-check only)
Socket smoke: draw (AP-1, hand+1) ✓, play hero ✓, roll→window→skip→rollback ✓,
modifier submit (+3, burned from hand, RollSuccess) ✓, attack→FightBack ✓,
turn auto-end at 0 AP + End Turn button ✓.
