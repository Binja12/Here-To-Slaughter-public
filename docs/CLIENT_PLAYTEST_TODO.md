# HTSR-5 client — the 3-browser local playtest

Status: BUILT and verified against the real servers on 2026-09-03 (one
browser + two headless bot seats, see §3). What is left is in §4.
Branch `HTSR-5-Frontend`.
UI polish is out of scope (the owner tunes it afterwards).

## 0. Where things stand

Server side is DONE on `HTSR-4-API-And-Sockets`
(= `develop` + game server):
lobby/auth (HTTP 3000 + TCP 4000), game server (Socket.IO 3001 + TCP 4001),
CORS with credentials on both, `game-started` / `game:snapshot` /
`game-completed`, `game:command` with ack, `LeaveGame`, `winnerId` in the
view. 98 suites / 1295 tests green.

Client side (this worktree): Codex's contract-first client (built from
`docs/CLIENT_CONTRACT_PROMPT.md` on HTSR-4) plus the fixes below. `tsc`
clean, 3 suites / 6 tests green. The client imports nothing from `server/`
or `shared/`, so it runs from this worktree while the servers run from
the HTSR-4 worktree; this branch's own `server/` and `shared/` are stale
and unused. Merging `develop` in is the owner's call and not needed to play.

Layout: `client/src/contract/` (hand mirror of `shared`), `ports/`
(`LobbyPort` HTTP+SSE, `GamePort` Socket.IO, real + fake), `state/`
(`useLobbyState`, `useGameState` keeps the highest `version`,
`commands.ts` = the one send adapter), `auth/`, `lobby/`, `board/`.
`REACT_APP_FAKE_SERVER=1` runs the whole flow against in-memory fakes.

## 1. What was fixed on 2026-09-03 (all verified live)

1. **Contract drift.** `RefusalReason.GameNotOver` + its sentence,
   `PlayerView.winnerId`; the game-over overlay names the winner.
2. **Modifiers on an attack roll.** The roll's subject is read from
   `cardId ?? detail.heroId ?? detail.monsterId` (`board/liveRoll.ts`
   `subjectIdOf`) — only `ChallengeWindow` sets `cardId` on the server, a
   hero/leader roll carries `heroId`, an attack `monsterId`.
3. **Roll numbers and dice are back.** `board/liveRoll.ts` reads the open
   Modifier/Attack window: the two 3D dice are thrown at the roller's seat
   (`useLiveDice`; the engine rolls ONE number, `facesOf` splits it into
   two faces deterministically per window — decoration, the total is the
   server's) and the turn banner reads e.g. `alice rolled 2 +2 = 4 · slay
   8+ · hit back ≤5` (`rollLabel`). `board/useChallengeSync.ts` drives the
   existing challenge overlay from a Challenge window whose
   `detail.challenged` is true: opens it with both rolls and standing
   bonuses, lands a modifier card on a side when its bonus total grows,
   closes it when the window goes. While it is open a modifier targets the
   two roll panels (`tkey.challengeRoll`), mapped to `defenderId` /
   `challengerId` for `ApplyModifier.targetPlayerId`. The strip at the top
   (`PendingWindows`) now lists EVERY window with its countdown.
4. **Reactions are not gated on `busy`** (`board/playable.ts`). The table
   is busy exactly while a window is open, which is the only time a
   reaction is legal; with the gate no modifier or challenge card could
   ever be played on anybody's roll. Also: a Challenge window takes a
   challenge card only while `detail.challenged` is false and modifiers
   only once it is true (the server's ChallengeNotStarted /
   ChallengeAlreadyStarted).
5. **Lobby last-write-wins race** (`state/useLobbyState.ts`). The server
   pushes `lobby-updated` to everyone before it answers `POST /lobby/ready`,
   the other seats react to the push, and the answer then overwrote the
   fresher SSE snapshot (Start stayed disabled on a table of three). A
   request's answer is now applied only if no push arrived meanwhile.
6. **Port.** `client/.env` sets `PORT=3002` (un-ignored in the root
   `.gitignore`; the lobby owns 3000).
7. **Reaction flow, as the owner wants it** (later on 2026-09-03): a roll or
   challenge window shows NO card in the top strip (only choice windows do);
   the cue is the modifier / challenge card glowing in the hand. Pressing it
   dims the board (client-side) and lights the valid targets — the rolling
   hero / leader / monster for a modifier, the contested card for a
   challenge (a contested card in the discard pile opens the pile as a
   dialog and the pick happens there); in a started challenge the overlay's
   two centre cards are targets too (challenged card = defender's roll,
   challenge card = challenger's roll), besides the roll panels. Only the
   pick submits. A modifier then offers one copy per printed value with
   that value's own art (`Modifier -2.png` left, `+2.png` right).
8. **Hover zoom**: one card zoomed at a time board-wide (`useHoverZoom`
   closes the previous one on activate); a hero and its item stay zoomed
   together until the cursor leaves their enlarged box; a monster-row card
   shrinks back as soon as the cursor leaves its RESTING footprint
   (`stickyBounds: 'rest'`). Slain-monster trophies fan one card step
   apart with a 10% overlap and are never compressed (`TROPHY_STEP`).
9. **the owner's second UI round (2026-09-03, later)**:
   - Seats (`board/seats.ts`): 2 players = bottom + top; 3 = bottom + left +
     right; 4 = bottom + left + top + right, clockwise from the viewer.
   - An equipped item stays tucked under its hero; when it is playable or a
     pick target only its peeking strip glows. It slides out (whole card
     glowing, clickable) only while the hero is zoomed, and hovering it
     keeps the hero zoomed — that is how an item is picked.
   - Choice windows over board cards / players / monsters (`BOARD_CHOICES`
     in Board.tsx) are answered by pressing a GOLD-glowing target (tone
     `choice`, the AP gems' amber in index.css); no strip card, the banner
     says `choose: <question>`. TaskChoice / ValueChoice keep buttons.
     Backing out re-arms the pick — a question stays asked.
   - Leaders zoom like heroes (capped so the card stays inside the stage);
     trophies fan beside the zoomed leader, 10% overlap, never compressed.
   - Every zoom is a 120 ms transform transition; hover delay 60 ms.
   - One zoom at a time; the zoomed hero's cell is raised by zoom state
     (not hover), so a neighbour can no longer paint over it while the
     cursor is on the slid-out item (the Lucky Bucky / Wildshot screenshot).
10. **Third UI round (2026-09-03, later still)**:
   - Zoom animation: `index.css` had `transition: filter …` on every
     `.dimmable`, a shorthand that discarded Tailwind's transform
     transition — zooms snapped. Now `filter` and `transform` together.
   - A zoomed leader is exactly as tall as a zoomed monster
     (`MONSTER_ZOOMED_H` in Board.tsx) and grows from its edge nearest the
     stage border (`LEADER_ZOOM_ORIGIN`), so it never leaves the stage.
   - HUD: the owner's `End Turn Button.png` / `Redraw Button.png` (2172×724)
     are `HUD.endTurn` / `HUD.redraw`; End Turn sits beside the action
     points (`HUD_WIDGETS.endTurn`, where Redraw was), Redraw under the main
     deck (`HUD_WIDGETS.redraw`, stage-centre anchored). The turn scroll is
     text only now.
   - An empty discard pile no longer opens the (empty) browser dialog.
   - Item PNG margins are INCONSISTENT and that is the "gap" and the faint
     outline: `Item Really Big Ring.png` has ~10 px transparent margins with
     semi-transparent edge pixels, `Item Thief Mask.png` is opaque to its top
     edge and transparent at the bottom; the hero scans have ~10 px margins
     all round. The code draws no border. Fix is in the art (re-export items
     with the heroes' margins) or an alpha-bbox trim like `lobbyAssets.ts`.
   - A trial "readable" Fuzzy Cheeks copy (badge moved, description re-set
     in Georgia) was made and REJECTED — the owner scrapped it; the original
     scan is back and the copy is deleted. Re-setting card text needs the
     card's own condensed typeface, which is not available.
11. **Fourth UI round (2026-09-03)**:
   - Glow rule of thumb: the FIRST thing you may do is green (playable
     card, reaction card in hand); every follow-up pick is GOLD — all
     targeting targets (`.targeting .target-aura`), the challenge roll
     panels, the engine's questions. No board pre-highlight for reactions.
   - "Roll on the hero you just played" (TaskChoice with `detail.cardId`,
     options confirm/dismiss) is a gold glow on that hero: press = confirm,
     Escape / click-away = dismiss. Other yes/no windows keep buttons.
   - HUD: End Turn under the action-point gems, the turn scroll down-left
     of them (`HUD_WIDGETS`), Redraw under the main deck.
   - Card PNGs trimmed IN PLACE to their opaque bounding box (alpha ≥ 200)
     by `trim-cards.ps1` (scratch; re-runnable) — 104 files under
     `client/public/board/{heroes,Items,Magics,Modifiers,Monsters,Leaders,
     challenge}` + both card backs. Items now sit flush and alike. Git holds
     the originals (`git checkout -- client/public/board` restores).
   - Piles (main deck, monster deck, discard) show up to 4 cards, each
     layer a little off and tilted (`pileJitter`), the top card straight.
   - Fake table: the viewer always leads with The Shadow Claw; a played
     hero asks the roll-on-it question; a started challenge stays open 12 s.
     The REAL deal is the engine's shuffle — a "give seat X leader Y" dev
     hook would be an HTSR-4 change.
12. **Fifth UI round (2026-09-03)**: the turn scroll is gone — the gems
    and, right under them, End Turn fill the top-right strip
    (`HUD_WIDGETS.actionPoints/endTurn`); the words it carried (roll as it
    stands, the question, whose turn) are the gems' tooltip. Top-left dev
    row: **Challenge** re-opens a put-away challenge window (a click on the
    overlay's backdrop puts it away; grey when no challenge is started) and
    **Restart test** (fake builds only) reloads with `?autostart=1`, which
    logs in, readies and starts by itself (`App.tsx` AUTOSTART). Decks are
    squared up again (`deckOffset`); only the discard pile is scattered,
    three times as much (`pileJitter`). Fake: RollOnLeader asks the Shadow
    Claw's PlayerChoice (gold on the other hand stacks — verified).
13. **Optional questions (2026-09-03)**. The server's "roll on the hero
    you just played?" is a TaskChoice whose detail is `{ confirms:
    'RollOnPlayedHero', sourceCardId }` — NO `cardId` — which is why the
    gold ask never matched before (`askedCardOf` reads either). Such a
    window is OPTIONAL (its options include `dismiss`; there is no explicit
    flag on the wire — an `optional: boolean` on `PendingWindowView` would
    be the honest HTSR-4 change, `isOptionalWindow` in `playable.ts` is the
    stand-in). An optional question of the viewer's own does not dim or
    freeze the table: the hero wears a gold `ask-aura`, pressing it says
    yes, and pressing ANY other action forfeits it — Board's `run` sends
    `dismiss` first, then the action (the engine is busy until the window
    is answered, so the order matters). Non-optional yes/no windows about a
    board card keep the dimmed gold targeting.
14. **Reading the table (2026-09-03)**: RED `enemy-aura` on what an
    opponent is doing — the card they just played (the Challenge window's
    subject, until it closes) and the hero / leader / monster they roll on
    (Modifier / Attack window subject, until it closes), plus a red glow
    disc under the dice (`DiceRoll tone="enemy"`; a filter would flatten
    the 3D cubes). GOLD `ask-aura` on every card whose standing effect
    feeds an open roll — the roll's / challenge's `bonuses[].cardSource`
    (heroes, items, leaders). Playable stays green. Hand fan: the CELL is
    hovered (resting footprint), the image scales inside it, the hovered
    cell's z is inline 999 — so the zoom ends when the cursor leaves where
    the card sits, and the next card can no longer paint over it.
15. **Cost-aware glows (2026-09-03)**: `AP_COST` / `MAX_HAND_SIZE` in
    `playable.ts` MIRROR the engine's `COST` constants (attack 2, draw /
    play / roll 1, redraw 3, hand 10) so nothing glows for a play the
    server would refuse `NoActionPoints` / `HandFull` (a monster glowed at
    1 AP, the attack was refused, so no roll window — and no modifier glow
    — ever came; that was "my deck didn't glow when I attacked"). If the
    engine's costs change, this table must follow. Aura tweaks: the big
    cards' glow nudged up 0.1cqw (`--aura-dy`), the red enemy glow is
    four denser layers, and an enemy roll puts one glow disc under EACH die.
16. **Dice glow + template art (2026-09-03)**: an opponent's dice get a
    die-sized square red box-shadow glow (`.dice-glow`) under each die,
    shown only once the throw has settled (`DICE_SETTLE_MS`). The fake
    fixtures use edited scans only — `Call to the Fallen` is the ONE server
    card with no edited board art (it falls back to `/cards/magic.png`, the
    basic template); it needs a scan in `client/public/board/Magics/`.
17. **Stale aims (2026-09-03)**: a reaction being aimed (dim + gold
    targets) or a modifier value pick is cancelled the moment none of its
    targets is valid any more — the window it was for lapsed mid-resolution
    — judged by the TARGETS (`validReactionTargets`), not by "some reaction
    window is still open" (an unstarted challenge can outlive the roll).
18. **Game over (2026-09-03)**: pressing the result overlay's backdrop
    puts it away to look at the final table (nothing is sent); the End
    Turn slot becomes **Exit** (same art until the owner's Exit art lands)
    and sends `LeaveGame`. The fake's `?autostart=1` fires once per page
    load, so Exit lands in the lobby instead of a fresh table.
19. **Lobby (2026-09-03)**: the art still matches the manifest's measured
    bounds exactly; the scaling the owner disliked was the session-8 numbers.
    `SETTINGS_WIDGET.w` 450 → 360 (breathing room in the window),
    `SEAT_WIDGETS` w 290 → 256 (inside the panels' trim). The +/− medallions
    Codex dropped are back, IN the avatar ring (`SEAT_BTN.fill`): "+" on an
    empty seat while the viewer is IDLE (= Ready), "−" on the viewer's own
    ready seat (= unready), an initial on other players' seats.
20. **Fakes follow the server's detail shapes** (`ports/FakeGamePort.ts`,
   `fixtures/views.ts`): `bonuses` are `{ cardSource, amount }[]`, a
   challenge carries `defenderId / challengerId / challenged /
   challengerRoll / challengedRoll / *Bonuses`, LeaveGame on a live table
   refuses `GameNotOver`, completion sets `winnerId`.

Verified live in this order: register → lobby → three ready → Start →
"Waiting for the table…" until the last seat's socket arrived → board
from the real view (art for every card) → PlayHero with its challenge
window → RollOnHero with dice + banner (`you rolled 5 · need 7+`) →
RollOnLeader (the Shadow Claw's PlayerChoice with the seats as buttons)
→ turn passing → a modifier on a bot's attack roll (banner `2 +2 = 4`,
the server's bonus list echoed) → a challenge on a bot's hero play (the
overlay with both rolls, closed on resolution) → bots killed and
restarted mid-game rejoin the live table at the current version → the
game played out (alice won on slain monsters) → `game-completed` shows
"alice wins" → Leave → lobby, IDLE → Ready again shows both bots ready
and Start enabled at once (the race fix) → the bots left and re-readied
by themselves.

Debug aid: the latest snapshot is on `window.__htsr` in the browser
console (`state/useGameState.ts`), so a confused screen can be compared
with what the server actually sent.

**Known nuisance:** the CRA dev server (`npm start`) hung mid-"Compiling…"
twice on 2026-09-03 (both the 3002 and the 3003 instance), after the
public/board PNGs were rewritten under it; the port stops answering and
edits look ignored. Nothing is wrong with the edit — kill the node process
holding the port and run `npm start` again (a fresh server picks the file
up and hot-updates normally).

## 2. Run book

From the HTSR-4 checkout (one build, two node
processes — never two `nest start --watch` side by side, `deleteOutDir`
wipes `dist` under the other one):

```
npm run build --workspace=shared
npm run build --workspace=server
npm run start:prod --workspace=server        # lobby/auth: HTTP 3000 + TCP 4000
npm run start:game:prod --workspace=server   # game: Socket.IO 3001 + TCP 4001
```

From the HTSR-5 checkout's `client/`:

```
npm start                                    # http://localhost:3002
```

Three cookie jars (three browser profiles, or a window + incognito +
another browser), all at `http://localhost:3002` — `localhost`, never
`127.0.0.1`, or the cookie does not reach the game server. Register three
usernames, Ready in each; the first to ready is the host and presses
Start at 2–4 ready. The table starts when the LAST seat's socket arrives.
Reaction windows lapse after 5 s. After `game-completed` every seat
presses Leave to return to the lobby.

Restarting the lobby process forgets every account and session (in-memory
stores): re-register. Restarting the game process while a game runs
strands the seats' assignments until the lobby is restarted too.

## 3. Bot seats (solo testing)

`client/scripts/bot-seat.mjs` is a headless seat that talks the same
contract as the real ports: registers (or logs in), readies once somebody
else is ready (so the browser stays host), joins the game it is assigned,
and plays a dumb legal game — attack a monster it qualifies for, else play
a hero, else draw, else end turn; answers every choice it owns with its
first option (`confirm` on a hero's optional effect); leaves after
`game-completed` and waits in the lobby for the next game.

```
node scripts/bot-seat.mjs alice
node scripts/bot-seat.mjs bob
node scripts/bot-seat.mjs host --host 3      # readies first, starts at 3 ready
```

One browser plus two of these is a three-seat table on one machine.

Only the HOST (whoever readied first) sees Start. A bot therefore readies
only once a NON-bot is ready (`--peers alice,bob,carol` names its fellow
bots; default as shown) and stands up again if it ever finds itself host —
so a human is always host and bots never fill a table by themselves.

## 4. Left open / findings for the owner

- **Engine: the attack roll came up 2 three times in a row** for the same
  bot on the same monster (Abyss Queen, no bonuses), while hero and
  challenge rolls varied. `attack-monster-task.ts` rolls
  `Math.ceil(Math.random() * 11) + 1`; nothing in the client can cause
  this. Worth a look on HTSR-4 (also: that formula is a flat 2–12, not 2d6,
  and `challenge-window.ts` rolls 1–11).
- **Engine: TaskChoice options are the lowercase strings `confirm` /
  `dismiss`**, not `CONFIRM` / `DISMISS` as the Codex prompt said. The
  client renders whatever it is sent, so nothing breaks.
- **Unexplained once: "1 AP" shown, yet DrawCard / PlayHero / Attack all
  refused `NoActionPoints`** for several seconds after an attack, until
  the turn passed. Not reproduced after `window.__htsr` was added; if it
  recurs, compare `__htsr.state.seats` with the refusal.
- **Lobby SSE streams were closed by the server when the game completed**
  (the bots logged `terminated` right after `leave ok` and reconnected two
  seconds later; the browser's `EventSource` reconnects on its own). A
  browser that leaves at that exact moment may miss one `lobby-updated`.
- **Reaction windows are 5 s.** Enough for a bot, tight for a human who has
  to find the card, click it, click the target and pick a value. Worth
  raising in `time-control-config.ts` for the playtest.
- `client/build/` is a stale gitignored production build; delete or leave.
- Everything Codex wrote plus the fixes above is uncommitted, by design.
