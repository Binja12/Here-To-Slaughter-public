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

21. **First playtest — only implemented cards (2026-09-04, retired for the
    second playtest)**. At that point the registry implemented 68 of
    the 136 printed cards: all modifiers, challenges and leaders; 8 items,
    7 magics, 5 monster passives and 3 hero effects (Wise Shield, Wiggles,
    Snowball). Sharp Fox's roll of 5 "did nothing" because hero-016 has no
    entry — same as Buttons. The owner: "only use the cards we implemented".
    The deal (`createGame`, `dealable` in the ability repository) was then
    EXACTLY the registry, every type alike — the owner's call after a
    body-only middle ground (a temporary
    registry of implemented cards only). Known consequence he
    accepted: 3 heroes in a 57-card deck, so most hands hold none and
    class-gated monsters are rarely attackable; the pool grew as entries were
    written. Every dealt hero rolled and fired its effect.
    Found by the strict pool at once: the "every class" win condition asked
    the POOL which classes exist, so Wiggles + Wise Shield was "all
    classes" and won on the second hero (`AllClassesInParty` now requires
    the game's six classes, never the pool's).
    Red aura on an equipped item: `HeroRow` `itemEnemy` — an opponent's
    cursed item landing on your hero is the open challenge's subject, and the
    item strip under the hero had no red tone before.
    Also fixed here: the item aim now mirrors the engine's equip rule (a
    plain item only on your own bare heroes, a cursed one on anybody's) —
    it used to offer every hero and let the server refuse.
22. **Second playtest — complete card set (2026-09-04).** Every printed id now
    has a registry entry. The temporary `dealable` gate is gone and a default
    game uses all 136 records from `baseGameCards`: 48 heroes, 15 items, 13
    magic cards, 25 modifiers, 14 challenges, 15 monsters and 6 leaders.
    Explicit stacked card lists used by specs are unchanged.
23. **First human table (HTSR-7, 2026-09-04)** — three engine findings, all
    fixed on the server with the client following:
    - **Passive leaders were activatable.** `RollOnLeaderAction` never asked
      whether the leader had anything to fire; the Cloaked Sage glowed, was
      pressed, and the point was spent for nothing. Now `LeaderNotActivatable`
      from the engine and `canRollOnLeader` false in the view for the five
      passives (only the Shadow Claw activates).
    - **Skip.** No door existed to give a window up, so with 30 s windows
      every roll and challenge waited the whole clock. New `PassWindow
{ windowId }` command: a pass is PER SEAT and the window settles once
      every seat that could act on it has passed (a card landing clears the
      passes). The End Turn slot shows the owner's **Skip Reaction** button
      (`HUD.skipReaction`, 2172×724 like End Turn) whenever a Modifier /
      Attack / Challenge window this seat could act on is open — for every
      seat, the active player included, since a turn cannot end under an
      open window. One window per press, oldest first; once this seat has
      passed them all the button greys to "Waiting for the other players".
      The challenge overlay has its own **Forfeit challenge** button.
      `flags.passable` / `waitingOnPass` in `playable.ts`, mirroring the
      server's eligibility rule. Skip is sent DIRECTLY, not through Board's
      `run`, which declines the viewer's open optional question first — the
      first cut did go through it, so Skip dismissed "roll on the hero you
      just played?" and Buttons never pulled a card.
    - **Tones, the owner's rule (2026-09-04): gold = can pick, green = can
      play, pink = effect working.** Pink (`.passive-aura`) is every card
      whose effect is working right now, at every seat: a live standing
      effect (the seats' effect lists name their source) or a bonus source
      of the open roll (the Charismatic Song on a hero roll, the Divine
      Arrow on an attack, a Really Big Ring, a monster's counter) — heroes,
      items, leaders and the monster row. Those bonus sources used to be
      gold; gold is now only questions and picks. Red still wins over all,
      then gold, then green, then pink. Enchanted Spell's +2 still shows
      nothing: the instance pile is not drawn.
    - **Own-card challenges.** The engine refuses `CannotChallengeOwnCard`
      (the window's respondent is the defender) and the glow rule skips the
      challenge card while the open window's respondent is the viewer.
24. **Lobby, first human playtest (HTSR-7)**: the seat list is the server's
    ready list and nothing else. `LobbyView` used to append the IDLE viewer
    as an unready occupant, so every window showed its own account on a
    bench and never the other idle accounts ("who is Player One?"). Now an
    idle viewer sees four plus medallions and appears only after pressing
    one, as item 19 says. The login form's "Player One" / "slaughter"
    prefill (`AuthView`) is gone too — three windows registered under the
    same default name by accident. The fake's `?autostart=1` still logs in
    as Player One (fake only).

25. **Second human table (HTSR-7, 2026-09-04) — the owner's eight findings.**
    - **Pink only while it matters.** `board/passiveRelevance.ts` decides
      which standing effects glow: a RollBonus while a roll of its kind is
      open for its owner (the Fist of Reason only while its owner could
      challenge or is the challenger; a scoped ring / curse only on its
      hero's roll), a ModifierCounterBonus while a modifier could land on the
      owner's roll, an ActionPointBonus (Mega Slime) while its owner holds
      more than the per-turn budget (`AP_PER_TURN`, a mirror of the engine's
      config like `AP_COST`), a shield (CantBeStolen / CantBeDestroyed /
      Decoy Doll) while an opponent is picking a card, the Sabretooth while
      its owner is, CantBeChallenged while the owner's play is on the table,
      a Sealing Key during its victim's turn. Trigger-only leaders have no
      effect entry, so the Protecting Horn is a named rule: pink while a
      modifier could be played. The open roll's own bonus sources still
      always glow. `passiveRelevance.test.ts` pins each rule.
    - **Winds of Change and the curse** (picture 1): the ENGINE returns the
      curse to the hand of the player whose hero wore it — proven through
      the real doors in `server/src/game/setup/winds-of-change.spec.ts`
      (curse played by bob onto alice's hero, alice casts, alice's hand). If
      it did not on the table, the CardChoice lapsed (30 s) and the window's
      silence picked a random worn item, or the pick never reached the
      server; the item strip under the hero is the gold target. Not
      reproduced without the screenshot — watch `window.__htsr` next time.
    - **The Protecting Horn's pick** (item 3) is no longer a strip window:
      its ValueChoice now carries `detail.sourceCardId` (server) and the
      board draws it like a modifier's value pick — the `Modifier +1.png` /
      `-1.png` cards to press (`ValueArt`) with the Horn itself beside them
      in the pink effect-working aura (the owner's shape).
    - **Card movement animations** (item 4): noted, not built.
    - **Choosing from the hand** (item 5): the closed hand stack wears the
      gold ask (`HandCount asked`) while a CardChoice over the viewer's hand
      is open, since the fan only opens on hover.
    - **CantBeDestroyed picks** (item 6): the server never offers a
      shielded hero (`CardFilter.destroyable`), and a pick the window never
      offered is refused with `NotAnOption` AND settles the window on a
      random offered card. Nothing to change on the client: it only sends
      what it was shown.
    - **Six classes, game not over** (item 7, pictures 2-3): the engine
      checked the win conditions at the END of the turn only. It now checks
      every time a frame settles on an idle board, so the sixth class (or
      the third monster) ends the game on the spot. The rulebook grants the
      class win only when a turn ends with all six classes in the party, and
      counts the party LEADER's class among the six; the engine counts heroes
      only — both are the owner's calls, flagged in the report.
    - **Mellow Dee "no window"** (2026-09-04, after the rebuild): the
      engine's "play the hero you just drew?" is a TaskChoice whose subject
      (`detail.cardId`) is a card in the HAND, and the board only knew how to
      glow a PARTY hero for a yes/no — so nothing glowed, the strip card was
      hidden (a subject on the board hides it), and pressing the drawn hero
      ran PlayHero through `run`, which dismisses the offer first and pays a
      point. Now a hand card the question is about wears the gold ask
      (`PlayerHand asked`), pressing it sends `confirm` (the free play), and
      the closed stack shows the ask too. Pinned on the wire by
      `server/src/game/setup/mellow-dee.spec.ts`.
    - **Plundering Puma "no draw window"** (2026-09-04): the victim's optional
      draw is a ConfirmTask asked of the CHOSEN seat and its subject is
      the Puma itself, in the thief's party — so the victim's board hid the
      strip window (a subject on the board hides it) and glowed nothing (only
      the viewer's own cards take the ask). Now a yes/no keeps its strip
      window with Confirm / Dismiss unless the asked card is the viewer's own
      hand card or party hero (`askOnBoard`).
    - **Challenging an item** (2026-09-04): a targeted item tucked under its
      hero is raised above the hero (`zIndex` 40, as when the hero is
      zoomed) so the whole glowing card is on top and pressable, instead of
      a 10% strip the hero's dimmed click swallowed.
    - **Winds of Change "old card model"** (item 8, solved with the
      screenshot): the served file, the checkout and git are byte-identical
      (the new scan); the old look was the BROWSER's cached copy — art is
      replaced in place under the same url, and nginx sent `expires 7d`.
      `docker/nginx.conf` now sends `Cache-Control: no-cache` for art (nginx
      ETags make the revalidation a 304). The old template folder
      `client/public/cards/` (hand-design hero scans + blank templates) and
      its one reader `FramedCard.tsx` are deleted, as asked; `Call to the
      Fallen` now points at `/board/Magics/Magic Call To The Fallen.png`,
      which 404s until the scan lands.
    - **Third round, same day (the owner's next eight):** Bullseye's pick
      drew ids — a choice over the deck's top is over cards in no zone the
      screen has, so the view now carries `optionCards` and the board draws
      a card picker (`cardPick`) for any card choice that is not on the
      board. Items go on ANY bare hero (engine + aim). Every card / player /
      monster choice names its `sourceCardId`, and the asking card is drawn
      big in the pink aura above the dimmed table (and inside the picker).
      Mega Slime grants its point on the slaying turn too. Terratuga,
      Corrupted Sabretooth, Crowned Serpent and Bloodwing had "Sacrifice one
      of your heroes" as text only — now entries, pinned by a registry test
      and `setup/terratuga.spec.ts`. The Party Leader's class counts for the
      six-class win and for monster requirements (`getPartyClasses`).

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
Reaction windows and turns lapse on the clocks the host set in the lobby
settings (defaults 15 s and 1:00; the `fast` preset 7.5 s and 0:30). After `game-completed` every seat
presses Leave to return to the lobby.

Restarting the lobby process forgets every account and session (in-memory
stores): re-register. Restarting the game process while a game runs
strands the seats' assignments until the lobby is restarted too.

### 2b. The same table in Docker (HTSR-7)

One `docker compose up --build` from the repo root replaces the four
commands above: the lobby (3000), the game server (3001) and the client
(nginx on 3002) each run in a container, browsers still go to
`http://localhost:3002`. Internal TCP (4000/4001) stays inside the compose
network; the lobby dials `game`, the game dials `lobby` — the same env
names the processes already read, set per container in `compose.yaml`.

```
docker compose up --build -d      # build once, start the three containers
docker compose logs -f lobby game # watch the two processes
docker compose down               # stop; in-memory accounts are gone
```

The client build bakes `REACT_APP_LOBBY_URL` (build arg, default
`http://localhost:3000`); the game server announces
`GAME_SERVER_PUBLIC_URL=http://localhost:3001`. `NODE_ENV` is left off
`production` on purpose: the session cookie turns `secure` there and this
table is plain http. Restarting a container is the same as restarting the
process: accounts and sessions are forgotten.

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
