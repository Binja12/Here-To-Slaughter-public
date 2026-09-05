# Seamless reactions — implementation plan

Status: BUILT 2026-09-05 (Phases A–G), flag off byte-identical to before
(165 suites / 1536 tests green), flag on covered by `setup/seamless.spec.ts`
and the seamless block of `turn-manager.spec.ts`. The engine doc §3, §4
and §11 describe what IS; this file is the record of why. Not built: a
fake-server UI scenario with two windows on screen (the client renders
every pending window already and gates on `acceptsActions`).

## Progress (keep current; the next builder starts here)

- Phase A — BUILT 2026-09-04. The flag is a boolean on the wire, in
  `GameConfig` (`defaultGameConfig` false, `gameConfigFor` copies it) and
  selectable in the lobby. No engine reader yet: `GameState`,
  `ReactionManager` and `TurnManager` get the flag as a constructor
  argument in the phase that first reads it (B.4, C, D) — an unread
  argument would be a reader-less value (`CLAUDE.md`).
- Phase B — BUILT 2026-09-04 (B.1–B.3): `GameFrame.stackDepth` recorded
  by `addFrame`; `IReactionWindow.cancel()` on the three window bases;
  `GameState.revert` (private, the one rollback: cancel later frames,
  truncate the stack, restore from a CLONE of the snapshot, put spent
  cards away) with `restoreFrame` (delete) and `revertFrame` (keep) as
  its exits. Pinned in `game-state.spec.ts` 'frames'. B.4/B.5
  (`refusesActions`, `isContested`, `isOptional`) are NOT built: their
  only reader is Phase D, so they are built there.
- Phase C — STARTED 2026-09-04, first slice only: `ModifierWindow` and
  `AttackWindow` `settle` are split into the frame exit plus
  `hits(finalRoll)` / `outcome(finalRoll)` (what the number means) and
  `apply(...)` (what the outcome does to the table, frame aside). Pure
  refactor, behaviour unchanged, so the optimistic path can call `apply`
  on a standing outcome without settling. NOT built yet: the seamless
  flag reaching `ReactionManager`/the windows, the 0 ms provisional
  resolution, re-evaluation on `ModifierApplied`/`ChallengeResolved`
  with `revertFrame` + `apply`, the seamless settlement (release only),
  and `setup/seamless.spec.ts`. `ChallengeWindow.resolve` is untouched:
  its contest already applies inside `resolve`; split it the same way
  (frame exit vs. what a won/lost contest does) when building the rest.
- Phase C — BUILT 2026-09-05. `GameFrame.snapshot.pipelines` (a copy of
  the stack beside the board, marked through `GameState.parkOn`) REPLACED
  `stackDepth`: a
  continuation has to be re-runnable after a flip, and a depth cannot
  give it back. Provisional resolution on a 0 ms tick in
  `ModifiableRollWindow.open` / `ChallengeWindow`'s constructor;
  `reconcile()` on every modifier; seamless settlement = release, then
  close, no second `FrameResolved`; `GameEngine` drains on a non-cancelled
  close. Routing by subject: `getFrameContesting` (+ `CTX_CHALLENGED_CARD`
  seeded on `ChallengePlayed`), `findOpenModifiableWindow(target)` newest
  first.
- Phase D — BUILT 2026-09-05. `GameState.refusesActions` /
  `optionalQuestionsFor` / `cappedClock`; `TurnManager` gates enqueue and
  drain on it, forfeits optional questions, caps windows on a spent turn,
  re-reads the clock on Opened (held, then a 0 ms re-read: a window
  announces before it is filed), FrameResolved, and — seamless only —
  Closed / ChallengeStarted / ModifierApplied.
- Phase E — verified by `seamless.spec.ts` (a question of the player's own
  blocks; an optional one is forfeited).
- Phase F — BUILT: `PlayerView.acceptsActions`; the client gates on it
  (`playable.ts`), fixtures updated. No fake-server seamless scenario.
- Phase G — engine doc §3 (rollback, optimistic frames), §11 (blocked =
  held, the cap), API contract; this file.
- Ruling after the first play (2026-09-05): the ATTACK is not optimistic.
  Its window opens and takes modifiers as before, the outcome lands at
  settlement, and the attacker is held for it (`refusesActions` counts an
  open Attack window). A slain monster appearing before the roll settled
  felt wrong; and its fight-back question blocked the attacker's own
  modifier.

Written 2026-09-04 for the model that implements it. Read `docs/ENGINE_ARCHITECTURE.md` §3 (frames), §4 (windows), §8
(known limitations) and §11 (the turn clock) first; every mechanism below
is built on those, none replaces them. Rules of the repo (`CLAUDE.md`)
apply: build only what is here, derive rather than store, one mechanism,
specs + `tsc` after every step, doc kept current in the same pass.

## 0. What seamless means (the owner's spec, 2026-09-04)

Today a reactable play (hero, magic, item, a roll, an attack) opens a
window and the table is BUSY until it settles: the active player cannot
act, the turn clock pauses. With `seamlessReactions` ON:

1. The active player keeps playing while reaction windows stand open.
   Their turn clock keeps running.
2. The play's outcome is applied AT ONCE, provisionally (the hero is in the
   party, its effect runs, the monster is slain…). The window stays open
   for reactions on its own clock.
3. When somebody reacts, the reaction is resolved. Outcome still the
   same → nothing changes; the reaction card goes to the pile and every
   other window keeps its clock. Outcome flipped to a LOSS → the board is
   rolled back to the moment of that play, INCLUDING every action the
   player made since, the loss is applied, and play continues from there.
   The window itself STAYS OPEN for counters, its clock reset by the
   reaction exactly as today; a counter that flips the outcome back rolls
   back again and re-applies the success. Two distinct moments: a window
   OPENING (anyone may react) and a reaction RUNNING (a modifier's value
   being chosen, a challenge contest) — only the second blocks (§4).
4. The active player is BLOCKED (actions refused, turn clock frozen —
   one predicate) exactly while: a modifier or challenge reaction is being
   resolved (a contest running, a modifier's value being chosen), OR a
   question addressed to the active player stands open (their own discard
   choice, the value pick of their own modifier). Never for another
   player's question. The owner's example of what must NOT happen: "I need
   to choose what to discard, I play End Turn or draw, and only then
   discard."
5. Only Challenge and Modifier/Attack roll windows get the optimistic
   treatment. Every other window (a choice, a confirm) just stands open
   while the table plays on; its options may go stale (a card stolen while
   its owner was choosing whether to discard it). Accepted: the chooser
   picks from what is left. Not a human resolution, flagged, not fixed.
5b. The next turn starts only once every window of the previous turn has
   settled (today's drain rule already: a turn ends on `AP ≤ 0` AND an
   idle board). At End Turn — a pass, a spent budget, a lapsed clock —
   every open window's clock is shortened to `min(remaining, 10 s)`.
   A rollback after End Turn refunds the points the undone plays cost
   (they are in the snapshot) and the turn simply continues: the player
   may act again, the next turn still waits for the board to go idle.
6. Windows may collide: a modifier window over a hero roll is open while
   the roll's effect has already opened "choose a card to sacrifice" for
   its victim. The client shows both. If the modifier flips the roll to a
   failure, the sacrifice window is CANCELLED and disappears.
7. All of it behind the config flag. OFF keeps today's behaviour exactly.

## 1. The one idea: optimistic frames

The engine already has snapshot + rollback: `rm.openFrame()` clones the
board, `releaseFrame` keeps what happened inside, `restoreFrame` puts the
snapshot back and drops the pipelines paused on the frame (§3). Seamless
is that lever pulled earlier:

- A table window (Challenge / Modifier / Attack) still opens its frame
  with a snapshot taken BEFORE the play's effect.
- In seamless mode the window emits a PROVISIONAL `FrameResolved` on a
  0 ms timer right after opening (the §3 empty-choice pattern: never
  inline, the opener has to park first). The paused pipeline resumes, the
  effect runs, the board moves on — with the frame still open and its
  window still ticking.
- Everything that happens after the snapshot — the effect, further plays
  by the active player, windows THEY open — is "later work". A rollback of
  this frame undoes all of it: the snapshot already contains none of it.
- A reaction that FLIPS the standing outcome rolls the frame back
  (`revertFrame`, §B.3) and applies the new standing outcome's
  continuation, provisionally again; the window stays open, clock reset.
- Settlement (lapse, or every eligible seat passed) never rolls back: the
  board already shows the standing outcome. It closes the frame
  (`releaseFrame`: spent cards put away, frame deleted) and emits the
  final `FrameResolved`, which wakes nothing and lets `GameEngine` run its
  win check.

Nothing here needs the client to replay events. A rollback is just the
next snapshot; `version` goes up, the view is whole state. ("Revert to
event #233" is the mental model; the engine holds board snapshots, not an
event log, and that is enough.)

## 2. Engine changes, in build order

Each step: code + spec + the engine doc paragraph, then `npx jest -i
<files>` and `npx tsc --noEmit -p server/tsconfig.json`. Full suite
(`npx jest --maxWorkers=4` from `server/`) at the end of every phase.

### Phase A — the flag reaches the engine

- `shared/src/contracts/game-settings.ts`: `seamlessReactions:
  z.boolean()` (drop the `z.literal(false)`); presets keep `false`.
- `shared/src/types.ts` `GameConfig`: add `seamlessReactions: boolean`.
  `defaultGameConfig` false. `game-server/game-config-for.ts` copies it.
- `createGame` hands the flag to the three things that read it (a task
  names WHAT it needs, constructor arguments): `GameState` (§B:
  `refusesActions`), `ReactionManager` (§C: builds optimistic windows),
  `TurnManager` (§D: enqueue/drain/clock rules). No global.
- Client: `client/src/lobby/gameSettings.ts` `SEAMLESS_OPTIONS` — "On"
  becomes selectable; contract type `seamlessReactions: boolean`.
- Specs: `game-config-for.spec` (flag copied), lobby controller spec
  (`true` accepted), client `gameSettings.test`.

### Phase B — GameState: rollback that cancels later work

Today's invariant "the stack cannot move while a frame is open" is gone
in seamless mode, so a rollback must cancel what moved. Three additions,
all mode-independent (they are no-ops when nothing later exists):

1. **Frame records the stack depth at open.** `GameFrame.stackDepth =
   gs.abilityPipelines.length` in `ReactionManager.openFrame`. On
   rollback: truncate `abilityPipelines` to that depth (everything pushed
   after the snapshot is later work), THEN the existing
   `pausedOn === frameId` filter for the one that waited on this frame.
2. **Later frames are cancelled.** `frames` is a `Map`, insertion order =
   open order. On rollback of F, every frame AFTER F in the map: each of
   its still-open windows gets `window.cancel()` — clears its clock, marks
   it resolved, emits `ReactionWindowClosed` with `{ cancelled: true }`
   and NO `FrameResolved` (there is nothing to wake: its pipelines are
   gone by rule 1) — then the frame is deleted. `cancel` is NOT `resolve`:
   it never runs `defaultChoice()` — a cancelled discard choice discards
   nothing, a cancelled confirm confirms nothing (the owner, 2026-09-04). Add `cancel(): void` to
   `IReactionWindow`; implement in `ChoiceWindow`, `ModifiableRollWindow`,
   `ChallengeWindow` (each already owns its `timer` and `_resolved`).
   Nested frames of today (a ValueChoice over a roll) are "later" too,
   which is the same semantics they had (they always settled first).
3. **`revertFrame(frameId)` = rollback, frame KEPT.** Puts the snapshot
   back, cancels later frames, truncates the stack, keeps F and its window
   alive (the snapshot stays valid: it predates everything). Needed
   because one roll's TOTAL moves with every modifier that lands — a 6
   against a 7 is a failure, +2 makes it a success, a later −3 a failure
   again (no re-roll ever happens) — and the frame must outlive the first
   flip (§C). `restoreFrame` becomes `revertFrame` + delete + the
   spent-cards put-away it does today. One rollback, two exits.
   NOTE `copyFrom` assigns `this.frames = src.frames`; after `revertFrame`
   F must be re-inserted into the (restored) map in its original position
   — simplest: cancel the later frames first, then `copyFrom`, then
   `frames.set(F.id, F)` is a no-op because the snapshot map already holds
   F only if F was open at snapshot time, which it was NOT (F opens after
   its own snapshot). So: `copyFrom`, then `this.frames.set(frameId,
   frame)`. Pin this in a spec: after `revertFrame`, `frames.has(F)` and
   `openWindows()` still lists F's window, and nothing later.
4. **`refusesActions(playerId): boolean`** — the one question
   `TurnManager.enqueue` (§D), the turn clock (§D) and the view (§F) ask,
   for the active player. Non-seamless: `isBusy()`. Seamless, either of:
   - `contested()` — a modifier/challenge reaction is being resolved: an
     open `ChallengeWindow` with `challenged === true`, or a
     `ModifiableRollWindow` with a spent card whose value is still being
     chosen (`cardSpent` counter > 0). Add `isContested()` to
     `IReactionWindow`, false for choices.
   - `hasQuestionFor(playerId)` — an open NON-table window (any
     `ChoiceWindow`) whose respondent is the active player. Table windows
     (Challenge/Modifier/Attack, the `TABLE_WINDOWS` set of
     `player-view.ts`) never count, or a player's own hero roll would
     block them.
   Read off the windows. Derived, never stored.
5. **An OPTIONAL question is forfeited by the next action, not a block.**
   A `TaskChoiceWindow` whose options include `dismiss` (the "roll on the
   played hero?" offer, a leader's "draw a card?" after a magic play) is
   the active player's to skip: when they enqueue an action while one
   stands, `TurnManager.enqueue` answers it `dismiss` through
   `submitChoice` FIRST, then runs the action (and the action's own offer
   opens after it, as it does today). The owner, 2026-09-04: "if it's an
   optional reaction → forfeit it." So `hasQuestionFor` counts only
   windows that are NOT optional; `IReactionWindow.isOptional()` (true
   for a TaskChoice offering `dismiss`) is the one place that says which.
   The client does the same today (`isOptionalWindow` in `playable.ts`
   sends dismiss before another action); once the engine does it the
   client's copy goes (one mechanism).

Spent cards on rollback: keep "spent is spent" (§3, `spentInto` compares
the zone with the snapshot, so a modifier thrown into a LATER, now
cancelled window is put away too). Alternative — hand back cards spent
into cancelled windows — is a rules call for the owner; default is the
simpler one.

Specs (`game-state.spec.ts`, `ability-pipelines.spec.ts`): revert keeps
the frame; restore after later frames cancels their windows (clock never
fires, `cancelled` closed event out, no FrameResolved); stack truncated to
depth; a pipeline paused on an OUTER frame survives.

### Phase C — optimistic table windows

Only when `ReactionManager` was built seamless. Three windows, one shape:

- **Open**: snapshot, announce, start the clock (as today), then a 0 ms
  timer → `provisionalResolve()`: run the STANDING outcome's continuation.
  - `ChallengeWindow`: standing outcome = uncontested → emit
    `FrameResolved(frameId, [true], …, cardId)` provisionally. (The board
    already holds the play — §3 puts the hero in the party inside the
    frame — only the paused pipeline needed waking.) Unchallengeable
    windows already settle at 0 ms; leave them.
  - `ModifierWindow` / `AttackWindow`: standing outcome = `getFinalRoll()`
    vs requirement. Success standing → emit `RollSuccess` (the hero's
    entries trigger on it) + provisional `FrameResolved` with the roll.
    Failure standing on a HERO roll → nothing runs (a failed hero roll
    does nothing today). Failure standing on an ATTACK → the fight-back
    runs provisionally (it is the failure's continuation today).
  Provisional emissions must be the same events the final settlement
  emits today, so the ability registry is untouched. Pull the "what
  happens on success / on failure" of each window's `settle` into two
  methods (`applySuccess`, `applyFailure`) called from both paths.
- **On a reaction landing** (`ModifierApplied` reaches the window through
  `cardSpent`/bonus arrival; `ChallengeResolved` inside `ChallengeWindow`):
  re-evaluate the standing outcome. The window's clock resets as today
  and the window stays open for counters in every case.
  - Unchanged → nothing (the card is spent).
  - Flipped either way → `revertFrame` (undoes the provisional
    continuation and everything played since), then the NEW standing
    outcome's continuation, provisionally: `applyFailure` after a loss
    (a hero roll: nothing; an attack: the fight-back), `applySuccess`
    after a rescue.
  - A challenge: `ChallengeResolved` with the challenger winning flips
    the play to a loss (revert; the card is put away as today); the
    defender winning marks the card challenged. Either way the window
    settles right there, as today — a card is challenged at most once a
    turn, so there is nothing left to wait for.
- **Lapse / all passed**: `releaseFrame` + final `FrameResolved`,
  whatever is standing — the board already holds it (§1). The one
  seamless-specific put-away: a failure standing on a hero roll leaves
  nothing to keep, which is what today's `restoreFrame` did; here the
  provisional `applyFailure` already left the board there, so releasing
  is correct. Pin it: after a lapsed failing hero roll the board equals
  the snapshot plus the spent cards in the pile.
- `GameEngine.onEvent(FrameResolved)`: already skips the win check while
  `isBusy()`; a provisional resolution cannot conclude the game. Pin it.
- Multiple reactions in flight: a second modifier while the first's value
  is still being chosen is refused today? Check `acceptsModifierFor` /
  `cardSpent`; in seamless the same rule stands (contested → the roll is
  being resolved; a second card waits or is refused `Busy`). Decide
  while building, record in §9 of `ENGINE_INTEGRATION_PLAN.md`.

Specs (`setup/seamless.spec.ts`, stacked deals, real 150 ms clock):
- hero play → second hero play while the first's challenge stands →
  first challenge LOST → both heroes back in hand? NO: the first card is
  spent (§3), the second play is undone (card back in hand, AP refunded),
  board equals the first snapshot, second window cancelled.
- same, challenge WON → both stand, both windows lapse, turn continues.
- hero roll (success standing) → effect's choice window open for the
  victim → a −2 modifier flips it → effect undone, choice window gone
  (`cancelled` closed event, not in `pendingWindows`), roll window still
  open with its clock reset → a +3 counter flips it back → effect runs
  again, a fresh choice window opens → lapse keeps it.
- attack (failure standing) → fight-back provisionally ran → +2 flips to
  success → fight-back undone, monster slain provisionally, lapse keeps it.
- win check never fires on a provisional board.

### Phase D — TurnManager under seamless

- `enqueue`: replace `isReactable() && gs.isBusy()` with
  `gs.refusesActions(activePlayer)`; the `Busy` reason stays.
- `drain`: runs the queue while the board is busy in seamless mode (an
  action may execute with frames open); it still ends the turn only on
  `AP ≤ 0 && !isBusy()` — the next turn waits for every window of this
  one (spec 0 §5b).
- **Turn-end cap.** The moment the budget is gone (pass, last point
  spent, clock lapsed) with the board still busy: every open window gets
  `capClock(TURN_END_WINDOW_CAP_MS)` = 10 s — a clock with more left is
  reset to 10 s, one with less is untouched. Add `capClock(ms)` to
  `IReactionWindow`, implemented beside each window's `resetTimer`.
  Windows opened AFTER the cap (a fight-back's choice) are capped when
  they open — `ReactionManager` reads "the turn is ending" off the
  board (`AP ≤ 0` for the active player) and builds them capped. One
  constant, no config.
- Turn clock: one predicate for blocked and frozen: the clock runs while
  `!gs.refusesActions(activePlayer)`; non-seamless keeps
  `!hasOpenFrames()`. Sync the clock on every window/challenge/modifier
  event (add `ChallengeStarted`, `ModifierApplied`, `ChallengeResolved`
  to the listened set). Elapsed time is still taken off on pause.
- `lapse` on a busy board: today throws. Seamless: forfeit the budget,
  cap the windows, return — the turn ends on the `FrameResolved` that
  leaves the board idle. Keep the throw for non-seamless. A rollback
  that refunds points afterwards reopens play (spec 0 §5b); the clock
  does not restart — it lapsed — so those points are the player's until
  the windows settle and the board goes idle.

Specs in `turn-manager.spec.ts` (mocks) + a case in `seamless.spec.ts`:
plays accepted under an open window; refused while contested; clock
freezes on `ChallengeStarted`, resumes on settlement; lapse under windows
ends the turn once they settle.

### Phase E — every other window just stands

Nothing to build; verify and pin: a choice window addressed to ANOTHER
player does not block the active player (`refusesActions` false); one
addressed to the active player does (§B.4). A window's options may vanish — `isStillValid` at resolve already drops a stale
pick, `NotAnOption` already answers a pick the window never offered.
Consider filtering `PendingWindowView.options` through `isStillValid` in
the projection so a screen never offers a vanished card; the owner
accepted the stale case, so this is optional and stays out unless cheap.

### Phase F — wire and client

- `PlayerView`: add `acceptsActions: boolean = !gs.refusesActions()`.
  `busy` stays what it is (mid-resolution; the harness's `settle()` waits
  on it). The client gates on `acceptsActions` instead of `busy`
  (`client/src/board/playable.ts`, `idle` calculation). Also add
  `seamless: boolean` to the view? NOT needed if `acceptsActions` carries
  the rule — one mechanism.
- Windows: `pendingWindows` already is an array; verify
  `client/src/board/PendingWindows.tsx` renders every entry, not the first,
  and that a cancelled window vanishes on the next snapshot (it is simply
  absent). No new socket events; `ReactionWindowClosed{cancelled}` is
  engine-internal.
- Optional windows: today the client sends `dismiss` before any other
  action (`isOptionalWindow`); under seamless keep the offer open instead
  — the player may still take it later. Gate that on `acceptsActions`
  being true while the window stands.
- Fake server (`FakeGamePort`): a scripted scenario with two windows open
  at once, for the UI check.

### Phase G — docs

`ENGINE_ARCHITECTURE.md`: §3 gains "optimistic frames" (the stack CAN
move under an open frame in seamless mode; cancellation is depth
truncation + later-frame cancel; `revertFrame` vs `restoreFrame`), §4
gains the reaction re-evaluation rule, §11 the clock predicate. §8 gains
the accepted limitations (§5 below). `API_AND_SOCKETS_CONTRACT.md`:
`seamlessReactions: boolean`, `PlayerView.acceptsActions`.
`ENGINE_INTEGRATION_PLAN.md` §9: decisions taken while building.

## 3. Reading list for the implementer (exact places)

- `server/src/game/pipelines/game-state.ts`: `frames`, `addFrame`,
  `releaseFrame`, `restoreFrame`, `spentInto`, `clone`, `copyFrom`,
  `isBusy`, `abilityPipelines`.
- `server/src/game/pipelines/task-manager.ts`: `onEvent(FrameResolved)`
  wake-up, `pauseOn`, the drain re-entry flag.
- `server/src/game/pipelines/reaction-manager.ts`: `openFrame`,
  `buildWindow`, `submitReaction`, `pass`, `eligiblePassers`.
- `server/src/game/reactions/modifiable-roll-window.ts` (+ `modifier-
  window.ts`, `attack-window.ts` `settle`), `challenge-window.ts`
  (`challenged`, the contest rolls, `resolve`), `choice-window.ts`.
- `server/src/game/pipelines/turn-manager.ts`: `enqueue`, `drain`,
  clock (`pauseClock`/`resumeClock`/`lapse`, listener).
- `server/src/game/game-engine.ts`: `onEvent(FrameResolved)` win check.
- `server/src/game/views/player-view.ts`, `shared/src/views.ts`.
- `server/src/game/setup/play-through-helpers.ts`: `stacked`, `until`,
  `settle`, `windowFor`, `answer`, `react`, `pass` — write the seamless
  spec on this harness only (player doors + `playerView`, never
  `GameState`).
- Client: `board/playable.ts`, `board/PendingWindows.tsx`,
  `ports/FakeGamePort.ts`, `lobby/gameSettings.ts`.

## 4. Decisions

Confirmed by the owner (2026-09-04):

1. Blocked = contested OR a question addressed to the active player
   (spec 0 §4). Other players' questions never block.
3. Spent is spent for cards thrown into a cancelled window (same as
   today's resolution).
4. A failing roll runs its continuation provisionally (fight-back); a
   modifier that flips it reverses that and runs the success side.
5. The next turn waits for every window of the previous one; at End Turn
   open windows are capped to 10 s.

2. A losing reaction does NOT settle the window: it stays open for
   counters until its clock runs out, reset by every reaction as today.
   Rollback and re-apply happen per flip (Phase C).
6. A rollback after End Turn refunds the undone plays' points from the
   snapshot and the turn continues; nothing is forfeited twice.

Nothing is open. Ask only if a case below turns out impossible to build
as written.

Considered and set aside — **a pipeline stack per player** (the owner's
idea while answering 1). The race case: a card's chain "each player
discards one, THEN you draw that many" — with one stack the "then" step
waits beneath the other players' choice windows, which is right; with a
stack per player the owner's chain would run its "then" step before the
others chose, so every such card would need an explicit join. The single
stack gives the join for free; its cost under seamless is only that a
player who answers a question after the active player's own question was
opened sees their continuation run once the active player answers.
Revisit only if that delay shows up at a table.

## 5. Accepted limitations (write into engine doc §8 when built)

- Choice options can go stale under simultaneous play; the chooser picks
  from what is left. Not a human resolution. (the owner, 2026-09-04.)
- No event-log rollback on the wire: a client sees the rolled-back board
  as the next snapshot, with no animation of what was undone. A
  `RolledBack` event for the UI is a later addition if wanted.

## 6. Definition of done

- Flag OFF: full suite green, behaviour byte-for-byte today's (the
  existing 164 suites are the regression net; no existing spec changes
  except constructor arguments).
- Flag ON: `setup/seamless.spec.ts` covers the six scenarios of Phase C
  and the clock cases of Phase D on real clocks; `full-game.spec.ts`
  variant runs a whole game seamless to `GameEnded` with every card in
  exactly one place at the end (the harness's audit).
- `tsc` clean server (but the pre-existing `player-view.spec.ts:241`
  error) and client; client tests green; a fake-server UI check with two
  windows on screen and an action taken under them.
- Docs current (Phase G). Staged: client, specs, md. Unstaged: server and
  shared source. No commits.
