# Game server — commands in, views out

The design record for the game-server process: how commands enter,
how views leave, the flows between lobby, engine and browser, and the
decisions taken while building it. Companion docs:
`docs/ENGINE_ARCHITECTURE.md` (engine) and
`docs/API_AND_SOCKETS_CONTRACT.md` (wire contract).

Running a built server reads `shared` through its COMPILED `shared/dist`
(the workspace link's `main`), while jest maps `shared` to source. So
`npm run build --workspace=shared` must precede `start:game` / `start:prod`
after any change under `shared/src`, or the process boots against a stale
contract and fails at the first message.

## 1. Architecture — MVC, and what sockets change

Classic MVC holds, and maps one-to-one onto what already exists:

| MVC        | Here                                                          |
|------------|---------------------------------------------------------------|
| Model      | the engine: `GameState` + pipelines + rules. Owns all truth.  |
| View       | `PlayerView` (`shared/src/views.ts`) built by `playerView()`. A projection, not a UI. |
| Controller | the socket gateway + command dispatcher: turns wire input into engine door calls. |

What a socket changes is not the roles, it is the DIRECTION of the view:

- **HTTP MVC is pull.** A request arrives, the controller pokes the model, and
  the view is rendered INTO THE RESPONSE. The view only ever changes because
  the caller asked.
- **Socket MVC is push.** The model changes on its own — another seat acted,
  a reaction window timed out — so the view must OBSERVE the model and be
  pushed to everyone it concerns. This is the original Smalltalk MVC (view
  subscribes to model), which web MVC dropped. Here the observer is a
  listener on the game's `GameEventEmitter`.
- **Two channels instead of one.** A command gets a small ack on its own
  channel (`accepted` / `refused + reason`), and the resulting view arrives
  separately, to EVERY seat, on the push channel. Ack and view are decoupled
  on purpose: the ack is about the request, the view is about the table.
  This is command/query separation at the transport.
- **One model, many views per change.** Every event produces one projection
  per seat, each filtered for that seat. Fan-out is the transport's job, and
  the type `PlayerView` is what makes hiding a hand a compile-time property
  rather than a convention.
- **The connection is stateful.** Identity is resolved once at handshake and
  bound to the socket; HTTP re-authenticates every request. In Nest terms the
  Controller becomes a Gateway.
- **Ordering is visible.** Pushes can interleave with acks and with each
  other, so snapshots carry a `version` and the client keeps the highest.
- **Locality.** The model lives in exactly one process and the gateway must
  be in that process. That is why the lobby hands the browser a
  `webSocketUrl` from the game server itself — the seam for 1+n servers.

## 2. Proposed module layout (game server process)

Same `server` workspace, second Nest root and entry point (Q2):

```
server/src/
  main.ts                      lobby/auth bootstrap (exists)
  main.game.ts                 game-server bootstrap: Socket.IO + TCP listener (BUILT)
  game-server/
    game-server.module.ts      Nest root for the game process
    game-server.config.ts      every address read from env once (BUILT)
    game-registry.service.ts   Map<gameId, RunningGame>; create / get /
                               findByAccount / arrive (BUILT) / remove
    command-ledger.ts          per-seat memory of answered commandIds (BUILT)
    seat.ts                    Seat + seatRoom, shared by gateway and publisher (BUILT)
    spec-helpers.ts            a table won in one turn, for the specs (BUILT)
    snapshot-publisher.service.ts  emitter listener -> coalesce ->
                               playerView per seat -> room emit (BUILT; the
                               `projection/` folder was not worth a level)
    internal-game.controller.ts  @MessagePattern(CREATE_GAME_PATTERN)
    session/
      game-session.resolver.ts   interface IGameSessionResolver (BUILT)
      tcp-session.resolver.ts    adapter: RESOLVE_SESSION_PATTERN over TCP (BUILT)
      (in-memory resolver lives in specs only)
    commands/
      command-dispatcher.service.ts  command -> IAction | IReaction | choice
                                     -> engine door -> CommandResult
    game.gateway.ts            handshake auth, room join, `game:command`
                               with ack, resend-on-reconnect (BUILT); LeaveGame
shared/src/contracts/
  game-commands.ts             GameCommand envelope + payload schemas
  game-snapshots.ts            GameSnapshot<PlayerView>, event names (BUILT)
```

`RunningGame` is data: `{ game: Game, arrived: Set<string>, version: number }`
as built — smaller than first planned. `accountIds` is `game.playerOrder`,
`started` is `PlayerView.phase !== Setup`, and `finished` will be the same
read of `Concluded`; none of the three is stored, so none can drift from the
board. `arrived` (which seats have connected once) is the one thing the
board cannot know.
Nothing in `game-server/` reads `game.gameState`; the four doors, the
emitter and `playerView` are the whole surface, same constraint the
play-through harness works under.

The 0-byte placeholders had no readers and are gone (E3, done).

## 3. Flows

### 3.1 Create game

1. Host `POST /lobby/start-game` -> `LobbyService.startGame` -> TCP
   `game.create { accountIds, gameConfig: 'default' }` (exists).
2. `InternalGameController` -> `GameRegistry.create(accountIds)` ->
   `createGame(accountIds, { config })`. Player ids ARE account ids. Table is
   dealt but NOT started. Reply `{ gameId, webSocketUrl }` where the url is
   this process's own configured public address (`GAME_SERVER_PUBLIC_URL`).
   Each game server announces itself, so 1+n needs nothing here later.
3. Lobby assigns accounts and pushes `game-assigned` over SSE (exists).
4. Browser opens Socket.IO to `webSocketUrl`, cookie rides the handshake.
   Gateway: cookie -> `IGameSessionResolver.resolve(token)` (TCP to the
   lobby) -> accountId -> `GameRegistry.findByAccount(accountId)`. No
   assignment -> connection refused. Joins room `${gameId}:${accountId}`.
5. `startGame(game)` runs when every assigned account has connected once
   (Q5, BUILT as `GameRegistryService.arrive`). Then `game-started` with
   each seat's first snapshot, to each seat's room. A reconnecting socket
   gets `game-started` with the CURRENT snapshot — the view is whole state,
   so reconnect is a resend, no replay. A seat still waiting for the others
   hears nothing.

### 3.2 Commands in

`game:command { commandId, type, payload }` with Socket.IO ack.

1. Validate the envelope and payload against the schema for `type` (Q6).
   Malformed -> `{ accepted: false, reason }` before the engine is touched.
2. Dedupe `commandId` per account (bounded set per connection). A repeat
   returns the stored result and does not execute.
3. Dispatch. The player id is the authenticated account, never the payload:

   | command       | engine door                                    |
   |---------------|------------------------------------------------|
   | DrawCard      | enqueue `DrawCardAction`                        |
   | RollOnHero    | enqueue `RollOnHeroAction(cardId)`              |
   | RollOnLeader  | enqueue `RollOnLeaderAction(cardId)`  (contract lacks it; engine has it) |
   | PlayHero      | enqueue `PlayHeroAction(cardId)`                |
   | PlayItem      | enqueue `PlayItemAction(cardId, targetHeroId)`  |
   | PlayMagic     | enqueue `PlayMagicAction(cardId)`               |
   | AttackMonster | enqueue `AttackMonsterAction(monsterId)`        |
   | ReDraw        | enqueue `RedrawHandAction`                      |
   | EndTurn       | enqueue `EndTurnAction`                         |
   | ApplyModifier | submitReaction `PlayModifierReaction(cardId, targetPlayerId)` |
   | Challenge     | submitReaction `PlayChallengeReaction(cardId, targetedCardId)` |
   | SubmitChoice  | submitChoice(windowId, accountId, choice)       |
   | LeaveGame     | not an engine call; `GameRegistryService.leave`, refused `GameNotOver` while live |

   Emitter and reaction manager are constructor slots the dispatcher fills
   from `RunningGame`; they never appear on the wire. Note the contract's
   `ApplyModifierPayload.value` is BACK (see §6): the value comes with the play,
   verified against the card. (Superseded note: it was briefly a `SubmitChoice` on the
   `ValueChoice` window the card opens (engine §7, "unforgeable").
4. Ack truthfully. This needs the engine to SAY what it did (§4, E1).
   Today all three doors return `void` and drop silently.

Commands run inline, synchronously, in arrival order per socket. The
contract's priority scheduler stays deferred; nothing here precludes it
because the dispatcher is the one place a queue would go.

### 3.3 Output to users

1. `SnapshotPublisher` adds ONE listener to the game's emitter, after
   `createGame` (so after `TaskManager` and `GameEngine`, preserving §8).
   BUILT: `GameRegistryService.create` calls `publisher.watch(running)`, so
   a table is observed from birth and no path can create one unwatched.
2. It does NOT project inside `onEvent`. Emission is synchronous and
   re-entrant: a listener can run in the middle of a step, between "card
   left hand" and "card joined party", and a snapshot taken there is a
   transient board. It marks the game dirty and schedules one flush with
   `setImmediate`. A command that emits ten events costs one snapshot per
   seat, taken after the burst, and a window lapsing on its timer produces
   a push with no command at all.
3. Flush: `version++`, then for each seat `playerView(game, seat)` ->
   `game:snapshot { gameId, version, state }` to that seat's room. BUILT.
4. `GameEnded` -> `game-completed` to every seat, TCP
   `emit(GAME_COMPLETED_PATTERN, { gameId })` to the lobby (exists on the
   receiving side). Accept `LeaveGame`; when the last seat has left, remove
   the game from the registry. BUILT — no `finished` flag: the ending flush
   is the one that follows the burst carrying `GameEnded`, and "may leave"
   reads `PlayerView.phase === Concluded`.

Raw engine events are NOT forwarded in v1 (Q4). The engine doc (§5) is
explicit that payloads are unfiltered and would leak by that route; the view
already carries what a screen needs (`pendingWindows[].detail` has the dice,
bonuses and requirement). An audience-filtered event feed is a later ticket.

## 4. Engine touches the integration made

- **E1 — doors return an outcome.** BUILT 2026-09-03 as `RequestResult`
  (see §6). The text below is the design as it stood.
  - `TurnManager.enqueue(action)` -> `Refused(NotYourTurn | Busy | WrongPhase)
    | Executed | Queued`. With an idle board and empty queue an action runs
    synchronously inside `enqueue`, so `canExecute` false can be reported as
    `Refused(NotAllowed)` right there; only the non-reactable-while-busy case
    (a pass during an ability) is genuinely `Queued`.
  - `ReactionManager.submitReaction` -> `Refused | Executed`.
  - `ReactionManager.submitChoice` -> `NoWindow | Refused | Accepted`; the
    `canSubmit` THROW on a stale pick stays a throw (engine contract) and the
    dispatcher maps it to `Refused(stale)`. The window's silent drops for
    wrong respondent / unknown option become `Refused` results instead of
    silence, or the dispatcher pre-checks them against the view — one
    mechanism, so prefer the result.
  Expected rule failures are results, never exceptions (CLAUDE.md, contract).
- **E2 — seat names.** `createGame` takes ids only, by design, and sets
  `Player.name = id`; `SeatView.name` is what the screen shows.
  `CreateGameRequest` carries only `accountIds`. Proposal: add `names?:
  Record<string, string>` to `CreateGameOptions` (defaults to the id, same
  shape as the existing `cards` option) and `players: LobbyPlayer[]` to the
  TCP request. Alternative: ids only and the client resolves names itself.
- **E3 — delete** the three 0-byte files.
- Contract fixes that fall out: add `RollOnLeader`, drop
  the value-choice note above (superseded: `value` stays on the payload).

Nothing else in `server/src/game/**` moves. No engine rule is duplicated in
the transport: legality is asked of the doors, visibility of the view.

## 5. Tests (the "full gameplay" milestone)

All in `server/src/game-server/**/*.spec.ts`, in-process Nest test module,
`socket.io-client` against a real listening gateway, an in-memory
`IGameSessionResolver` (no lobby process needed), and the engine's stacked
deals via `GameRegistry.create(accountIds, options)` so a spec can pin the
hands.

- **Dispatcher (unit):** every command type builds the right action with the
  authenticated id; unknown type and malformed payload refuse before the
  engine; refused / executed / queued map to the ack.
- **Publisher (unit):** one command with N events -> exactly one snapshot per
  seat, `version + 1`; a timer-lapsed window pushes without a command; each
  seat's snapshot names only its own hand.
- **Gateway:** handshake rejects missing, invalid and unassigned sessions;
  a valid one gets `game-started`; duplicate `commandId` executes once;
  reconnect resends the latest version; two games in one process stay
  isolated.
- **Internal TCP:** `game.create` deals an unstarted table and returns this
  server's url; `GameEnded` emits `game.completed`.
- **Capstone:** the whole of `setup/full-game.spec.ts` replayed through
  socket clients — same stacked deal, same scripted dice, first turn to
  `game-completed` — and the card-count invariant checked from each seat's
  snapshots. If it can be played in the harness and not over the socket,
  the transport is the bug.

Run with `npx jest --maxWorkers=4` plus `npx tsc --noEmit -p server/tsconfig.json`.

## 6. Decisions log

2026-09-03, with the owner:

- **Sessions are rooms in a process, not a process per game** — "implement
  what the industry does the most". A game session is a logical thing (one
  `Game` in the registry, a room per seat on the socket); a game server
  process is a physical thing (one TCP port for the lobby, one Socket.IO
  port for browsers). Many sessions per process. The fleet seam is the
  `webSocketUrl` each process returns for itself; the lobby's server list
  stays STATIC for this ticket, allocation rule and registration deferred.
- **Ports.** Lobby/auth: HTTP 3000 + TCP 4000 (existed). Game server: TCP
  4001 for the lobby, Socket.IO 3001 for browsers (public url
  `GAME_SERVER_PUBLIC_URL`, default `http://localhost:3001` — was
  `127.0.0.1`, changed for the cookie-host reason below). Create-game
  and player commands never share a listener: the TCP port is a trust
  boundary only the lobby speaks to.
- **Work happens on the HTSR-4 worktree**, one `server` workspace, two
  bootstraps (`main.ts`, `main.game.ts`), scripts `start:game` /
  `start:game:dev`.
- **Zod** (4.x) is in, as a dependency of `shared`, and checks shape only,
  never legality. `CreateGameRequestSchema` lives beside the pattern in
  `shared/src/contracts/internal-game.ts`, and `CreateGameRequest` /
  `GameConfigId` are INFERRED from it, so the wire check and the type are one
  declaration. The game server's config table is `Record<GameConfigId, …>`,
  so a new id in the enum is a compile error until it has a config. The
  lobby's own hand-written check of `game.completed` is left as it is; it is
  not this ticket's code.
- **`game.create` refusals** cross the wire as `RpcException` with the
  reason (`{ status: 'error', message }` on the lobby side). An engine
  refusal to seat (wrong count, duplicate account) is the lobby's mistake,
  stays a plain error and is logged as such.
- **Contract test shape.** `internal-game.controller.spec.ts` boots
  `GameServerModule` on a real TCP port and dials it with the lobby's own
  `NestTcpGameServerClient`, so both halves of the contract are the real
  code.

- **`RequestResult` on every player door** (2026-09-03). The owner's
  framing: like try/throw, but for a PLAYER'S mistake rather than a coding
  one. Shape `{ accepted: true } | { accepted: false; reason: RefusalReason }`
  in `shared/src/types.ts`; the reason is a code from a closed union, not a
  sentence and not an `Error`, so the client can branch on it and the
  transport turns it into words in one place; `accepted` carries nothing
  because the board and the events already report what happened. Name
  chosen over `DoorResult`. The wire's `CommandResult` will be this plus
  `commandId`. Reaches down into `IReactionWindow.submitReaction`, so the
  stale-pick THROW in `ChoiceWindow` became `refused('Stale')`: one
  mechanism for every refusal, and the window still stays open with its
  clock untouched. Engine-internal callers of `window.submitReaction`
  (`GameState.applyModifier`, `StartChallengeTask`) ignore the result.
- **Reasons propagate from `canExecute`** (2026-09-03, second pass). The owner
  asked for the refusal to say WHAT was wrong — "you don't have that card",
  "card is not challengeable" — so `IAction.canExecute` and
  `IReaction.canExecute` return `RequestResult` and the doors pass the answer
  up unchanged; `NotAllowed` is gone. `RefusalReason` moved from a string
  union to an enum in `shared/src/enums.ts` (his call), one member per
  guard that exists in the code today, nothing new checked. The three
  compound `GameState`/`PlayItem` questions return a result so the reason
  can name the failing half, and their boolean readers use `.accepted`
  (engine doc §4). The transport will word each code once.
- **Coding error vs refusal** (2026-09-03, third pass). The owner: "either
  we check for all fields in canExecute, or we trust zod and only check
  logic — the second is better, that's why we have layers". So
  `UnknownPlayer` is gone: an unseated player id is an engine mistake and
  `GameState.requirePlayer` throws; `canExecute` checks game logic only and
  never re-checks request shape. Card ids stay refusals — they are the
  player's to get wrong.
- **Actions depend on the board only** (2026-09-03). The owner: an action
  calling `player.decreaseActionPoints` knows `Player`'s API; it should
  ask `gs`. So `GameState` gained `getActionPoints`, `decreaseActionPoints`,
  `hasInHand`, `getHandSize` (playerId first, like its other methods), all
  through `requirePlayer`, and no action or reaction holds a `Player`.
- **`WrongPhase` was two things** (2026-09-03). The owner: the phase is not
  a player-dependent reason. True — the end-of-turn cascade is synchronous,
  so the only reachable non-turn states are "not started" (transport bug →
  THROW) and "ended" (late click → `GameOver`). The owner then set the
  shape: TWO levels. `GamePhase.Setup | Turns | Concluded` is the game's
  state for the outside (on the board, moved by `GameEngine`, shown as
  `PlayerView.phase`); `TurnPhase.Start | Action | End` is `TurnManager`'s
  own, engine logic only, never on the wire. The unused `ReactionWindow`
  member is gone.
- **Commands in, and what a client may learn** (2026-09-03). Envelope stays
  `{ commandId, type, payload }` as the contract had it, one zod schema per
  command in a discriminated union on `type`, types inferred.
  `CommandResult` is `RequestResult` + `commandId`. The owner: a malformed
  command is not a game refusal, so it gets a SEPARATE shape,
  `{ accepted: false, error: 'InternalError' }`, and the detail (zod's
  issues, or an engine stack) stays in the server log. An engine THROW
  gets the same treatment: the dispatcher catches, logs with the command,
  and answers InternalError — never a refusal, never a dropped socket.
  `commandId` doubles as the engine action id; dedupe is the gateway's.
- **A modifier's value comes with the play** (2026-09-03). The owner: make
  reactions consistent — challenge is one request, so a modifier is one
  request too; the client sends the value and the engine verifies it.
  `ApplyModifier { cardId, targetPlayerId, value }`;
  `PlayModifierReaction.canExecute` refuses `NotAModifier` / `ValueNotOnCard`
  before spending; `ModifierPlayed` seeds `CTX_CHOSEN_VALUE`; the card's entry
  is `[ApplyModifier]` alone. `ValueChoiceWindow` and `ChooseValueTask` stay
  for the Protecting Horn, which asks its own two numbers. The engine doc's
  §7/§8 updated; the "unforgeable" argument now rests on verification.
- **`Stale` was a coding error in disguise** (2026-09-03). The owner: a
  player must never be offered an illegal option, so a pick that was offered
  and is now illegal is the engine's bug. `RefusalReason.Stale` removed;
  `ChoiceWindow` THROWS on a failed `canSubmit` again. The scenario the
  re-check exists for (a hero stolen while a monster choice is open) is
  recorded in the engine doc §8 as the defect to fix at its source.
- **`ModifierTargetRefused` was too abstract** (2026-09-03). The owner
  wanted the reason to say what was wrong with the target. The window is
  where that is known, so `IModifiableWindow.acceptsModifierFor` returns a
  `RequestResult`: a roll answers `TargetNotRolling`, a challenge answers
  `ChallengeNotStarted` or `TargetNotInChallenge`. Both `submitReaction`
  guards and `GameState.acceptsModifierFor` now ask that one method, so the
  rule lives once.

- **The game process is a full Nest application, not a bare microservice**
  (2026-09-03, items 1-3 of the playtest gap list). Nest mounts a gateway on
  the HTTP server through its default IoAdapter, so `main.game.ts` became
  `NestFactory.create` + `connectMicroservice` (the shape `main.ts` already
  had), listening on `GAME_SERVER_PORT` (3001) for browsers and TCP 4001 for
  the lobby. No cookie parser on it: a socket handshake never passes through
  Express middleware, so the gateway reads the cookie header itself.
- **CORS reflects any origin by default, with credentials.** The client's
  dev-server port is not this process's business, and `*` would strip the
  cookie from the handshake. `GAME_SERVER_CORS_ORIGIN` (comma-separated)
  narrows it; production hardening is deferred with Docker/routing. One
  declaration, `gameServerCors`, for the HTTP app and the gateway alike.
- **Public url defaults to `localhost`, not `127.0.0.1`.** A browser's cookie
  is bound to the host the lobby was reached as; a socket to a different
  spelling of the same machine carries no cookie and is refused at the
  handshake. Every default now spells the machine one way.
- **Every address lives in `game-server.config.ts`**, read from `process.env`
  once at load, so bootstrap, module and gateway cannot disagree. The lobby's
  own `lobby.module.ts` keeps its inline `process.env` read; not this
  ticket's code.
- **A lobby outage THROWS out of the resolver; an unknown token returns
  `undefined`.** Same line as the engine's refusal-vs-throw rule: a revoked
  or expired session is the player's situation and becomes a refused
  connection, an unreachable lobby is an outage and must not read as a
  player being turned away. `TcpSessionResolver` is `NestTcpGameServerClient`
  pointed the other way (5 s timeout), registered lazily so the game process
  boots without the lobby up. Its spec boots the real `AppModule` over TCP
  and mints sessions with the real `AuthService`, both halves live.
- **The handshake is Socket.IO middleware, not `handleConnection`**
  (2026-09-03, items 4-5). Middleware runs BEFORE the connection exists: a
  refused browser gets `connect_error` with the reason (`Authentication
  required`, `No game assigned`, `Lobby unavailable`), and a seated socket
  can never emit a command unseated — there is no window in which a
  connected socket has no identity, so the command handler's "no seat"
  branch is a THROW (bypassed middleware is a coding bug), not a refusal.
  The cookie is read off the raw header (`session/handshake-cookie.ts`):
  a handshake is not an Express request, so `cookie-parser` never sees it.
  The cookie name is imported from `auth/session-cookie.ts` — one string,
  one owner, though it is arguably contract vocabulary for `shared`.
- **A table is found by ACCOUNT, never by game id from the wire.** The
  socket arrives knowing only who it is; `GameRegistryService.findByAccount`
  finds the one table that account was dealt into (the lobby never seats an
  account twice). A room per seat, `${gameId}:${accountId}`, so many tabs of
  one account are one audience.
- **Dedupe is per SEAT and survives a reconnect.** The retry that matters
  follows a dropped socket and arrives on a new connection, so
  `CommandLedger` keys by seat, not by connection: the last 64 answers per
  seat, insertion-ordered. A malformed envelope with a readable `commandId`
  is remembered too — the repeat gets the same `InternalError`.
- **`Setup` IS the seats arriving, and the last arrival starts the table**
  (Q5, the owner, 2026-09-03: "the game starts only after all players are
  connected"). `RunningGame.arrived` is the set of seats that have connected
  at least once — transport state the board cannot know, so it is stored —
  and `GameRegistryService.arrive` returns true exactly once, on the arrival
  that completes it, having called `startGame`. The gateway then emits
  `game-started` to EVERY seat's room with that seat's own view; the socket
  that completed the table hears it through its room like the rest. A seat
  that arrived and dropped still counts: the table does not wait for it
  twice, it reconnects to a live game. A seat still waiting hears nothing.
  A command sent to an unstarted table reaches the engine and THROWS there
  (turn phase not `Action`), which the dispatcher answers as
  `InternalError`: a correct client never sends one, since the view says
  `phase: Setup` and names no current player. A seat that never arrives
  holds the table in `Setup` for ever — the no-show timer that abandons it
  is the owner's flagged edge case, deferred (§7).
- **`RunningGame` is `{ game, arrived, version }`.** Seats, started and
  finished are all readable off `game.playerOrder` and `PlayerView.phase`,
  and a stored copy could only disagree with the board; `arrived` and
  `version` are the two things the board does not know.
- **`shared/src/contracts/game-snapshots.ts` exists**: the three server
  event names, `GAME_COMMAND`, and `GameSnapshot<TState = PlayerView>`
  with a per-game monotonic `version` that every seat's snapshot of one
  flush shares.
- **Snapshots are event-triggered, coalesced per BURST, never on a clock**
  (2026-09-03, item 7, talked through with the owner). His instinct was one
  snapshot per game event; the adjustment is that the snapshot is not
  built INSIDE the event. One command is many synchronous events, and
  emission is re-entrant, so a listener can see the board between two
  halves of one step. The publisher therefore marks dirty on every event —
  no filtering by type; which changes a seat may see is the view's
  knowledge, and a copy here could disagree — and flushes once on
  `setImmediate`, the first moment the stack that entered the engine has
  unwound. That moment is always a resting point: idle, or paused on a
  window. Snowball's mid-run confirm is the case that shows why this is
  enough: a window opening ENDS the burst, because the pipeline pauses and
  hands control back, so the flush shows the window open with its detail
  and options; the answer starts a second burst and a second flush. The
  burst is not tracked — Node runs each entry as one uninterrupted stack —
  so ONE flag, "a flush is pending", is the whole mechanism. It began as
  two (`dirty` + `scheduled`) until the owner asked why the event handler
  did not just return when already dirty: the two were always equal, since
  flushing builds views and emits nothing back into the engine, and a flag
  that always equals another is one flag written twice. Not built on
  purpose: a diff against the last snapshot to skip identical pushes (the
  board is small, and a client redraws the same screen). Minecraft's fixed
  20 TPS was the comparison: right for a world that moves on its own, wrong
  for a table that only moves on a click or a timer.
- **The publisher is bound to the Socket.IO server by the gateway** in
  `afterInit`, since only a gateway class can own the server in Nest, and
  it THROWS if asked to flush before that — a table cannot exist before
  boot, so an unbound flush is a wiring bug. Specs that never open a socket
  bind a server that pushes into the void.
- **`game-started` at start, then `game:snapshot` right behind it.** The
  start's own events (`GameStarted`, `TurnStarted`) mark the table dirty,
  so the completing arrival sends `game-started` (version as it stands)
  and the flush follows with `version + 1` of the same board. Harmless
  under "highest version wins", and it keeps one rule for every push.
- **`seatRoom` moved to `seat.ts`**: the gateway and the publisher both
  address rooms, and a value import between the two was a runtime cycle
  through Nest's decorator metadata.
- **`LeaveGame` sits beside the engine commands, not among them**
  (2026-09-03, items 8-9). `EngineCommandSchema` is the dispatcher's whole
  vocabulary (twelve doors); `LeaveGameSchema` is the one command the game
  server answers itself; `GameCommandSchema` is the union the wire accepts.
  The gateway tries the leave schema first and hands everything else to the
  dispatcher, so the dispatcher's exhaustive switch stays about doors. A
  new `RefusalReason.GameNotOver` names the one guard: an active player
  cannot walk out (contract §6). It is the first reason that is not an
  engine guard, and the enum comment says so.
- **The ending flush is `game-completed` INSTEAD of `game:snapshot`.** The
  watcher reads one event by name, `GameEnded`, and the flush that follows
  that burst pushes the final board under the other name: same envelope,
  same version rule, and the event name is what tells a screen to show the
  result. Two pushes of one board under two names would have been the
  alternative; a client keeping "highest version wins" gains nothing from
  the second. Then the lobby is told once, one-way, and an unreachable
  lobby is logged rather than thrown — the seats have their final board
  either way, and the assignment is the lobby's to clear when it is back.
  Retry belongs with the outage story (§7).
- **A table is forgotten when its last seat has left.** `RunningGame.left`
  is the second set the board cannot know (after `arrived`);
  `GameRegistryService.leave` refuses `GameNotOver` off the view's phase,
  records the seat, and deletes the table after the last. A handshake from
  any of its accounts then finds no game, which is right: the lobby cleared
  their assignments on `game.completed`. The gateway consults the command
  ledger BEFORE the registry, so a retried leave that emptied the table is
  still answered `accepted` from memory; on an accepted leave the seat's
  memory is dropped and only that answer kept.
- **Specs seat a table they can win in one turn** (`spec-helpers.ts`,
  beside the specs the way `play-through-helpers.ts` is beside the
  engine's). `GameRegistryService.create` takes an optional `Deal` — the
  printed pool and the config, which the wire never carries — as §5 planned.
  The win is the engine's own shortcut: a pool with one hero class makes
  `AllClassesInParty` mean "one hero", so the first Fighter played wins at
  the end of that turn, driven through the dispatcher on the harness's
  150 ms clock.
- **Seats are called by username** (Q7, 2026-09-03, "finish up" on the
  recommendation). `CreateGameRequest` carries `players: SeatedAccount[]`
  in place of `accountIds` — the lobby has the usernames and nothing else
  does — and the registry passes them to the engine as
  `CreateGameOptions.names`, the one-line engine touch E2 proposed, recorded
  in the engine doc §10. `SeatView.name` is what a screen shows. The
  lobby's request builder, its TCP client and three of its specs changed
  shape with the contract; that is the contract's reach, not a raid on
  HTSR-6.
- **The capstone plays the harness's full game over three sockets**
  (`full-game-over-sockets.spec.ts`): `dealStacked` puts the harness's
  stacked deal into the registry, the three seats arrive and start the
  table, and every move of `setup/full-game.spec.ts` is a `game:command`
  with its scripted dice, every fact read from the snapshots the clients
  received — a browser has no events, so every assertion is one a screen
  could make. Same card-count invariant from every seat's final snapshot,
  then every seat leaves and the table is forgotten. One thing it taught:
  `attackableMonsterIds` is the PARTY requirement, not the turn — an
  off-turn seat whose party qualifies still lists the monster, and the
  turn banner is what greys the button out.
- **The 0-byte placeholders are gone** (E3): `runtime/runtime.service.ts`,
  `socket/socket.gateway.ts`, `lobby/lobby.ts`, `common/types.ts` and the
  three at the root of `shared/`. Nothing imported them.

Findings from building the transport, and what the owner decided
(2026-09-03):

- **`PlayerView.winnerId`** — built. `GameEnded` carried `winnerId` but the
  view carried only `phase: Concluded`, so a screen drawn from the final
  snapshot could not say who won. `GameState.conclude(winnerId)` now sets
  phase and winner together (engine doc §4), the view shows it, the
  full-game spec and the capstone assert it from every seat.
- **The 5 s reaction countdown** stays: fine for the playtest.
- **Game settings replace the config id (2026-09-04).** The wire carries
  `settings: GameSettings` (`shared/src/contracts/game-settings.ts`) instead
  of `gameConfig: 'default'`: player count 2–4, win condition (both /
  monsters / heroes) with a monster count 2–5, card set, turn timer and
  reaction timer.
  The lobby holds one settings object, the host edits it over
  `PUT /lobby/settings` (a changed seat count unseats everyone but the host),
  and `game-server/game-config-for.ts` turns it into the engine's
  `GameConfig`. Presets (`default`, `fast`) are derived from the values,
  never stored. The `REACTION_COUNTDOWN_MS` process override is gone: the
  settings own both clocks. The turn clock itself is the engine's
  (`TurnManager`, engine doc §10) and pauses while any reaction window is
  open, anyone's (the owner, same day).
- **Seamless reactions: built 2026-09-05, removed 2026-09-06.** A mode in
  which plays resolved at once under their reaction windows and rolled back
  on a losing reaction, behind a `seamlessReactions` setting. Removed
  because the printed rules do not survive it: a challenge card stolen
  during the contested play could not be played into the still-open
  window, and only modifiers may wait for their target. The wire lost the
  setting, `GameConfigView.seamlessReactions` and `PlayerView.acceptsActions`
  (the client gates on `busy` again); the engine lost optimistic frames,
  the rollback of later frames and the turn-end clock cap. What that work
  left in place on purpose: per-seat passes (`canPass`), `optional` on a
  window, a window's `cancel` (used when a game concludes), and the turn
  clock re-read at `FrameResolved`.
- **CORS on the lobby** — added to `main.ts`, reflecting the asking origin
  with credentials, the same as the game server. A local client runs on
  its own dev-server port, and without this a browser would not let it
  log in. (The lobby and CRA both default to port 3000, so the client
  needs another port.)

Running it locally (verified 2026-09-03, both processes up, a register
from `http://localhost:3002` answered with CORS headers and the cookie, the
socket handshake likewise):

```
npm run build --workspace=shared        # after any change under shared/src
npm run build --workspace=server        # nest build, once
npm run start:prod --workspace=server        # lobby/auth: HTTP 3000 + TCP 4000
npm run start:game:prod --workspace=server   # game: Socket.IO 3001 + TCP 4001
```

Do NOT run `start:dev` and `start:game:dev` (or two `nest start`s) side by
side: `nest-cli.json` has `deleteOutDir: true`, so the second build wipes
`dist` from under the first and one of them dies with `EPERM ... rmdir
dist/...` — that is exactly what happened on the first try. One build, two
`node` processes. Three seats need three browser profiles (three cookie
jars), all reaching the servers as `localhost`.

## 7. Deferred (recorded so they are not reinvented)

n game servers (lobby holds a list of clients + pick; each server already
announces its own url), no-show / abandoned-game teardown, a turn-clock
countdown on the wire (the client cannot yet show one), priority scheduling of reactions vs actions, event-log persistence, shared
session store replacing the TCP resolve, client rewrite to the envelope.
