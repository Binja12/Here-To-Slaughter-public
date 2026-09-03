# Engine integration plan — game server, commands in, views out

Status: IN PROGRESS on worktree `htsr-4-api-contract` (branch
`HTSR-4-API-And-Sockets`, which is `develop` = engine + HTSR-6 lobby/auth).
Built so far: §4.1 steps 1-2 — `game.create` over TCP, `GameRegistryService`,
`GameServerModule`, `main.game.ts` and the `start:game` scripts. Decisions
taken so far are in §9.
Companion docs: `docs/ENGINE_ARCHITECTURE.md` (engine) and
`docs/API_AND_SOCKETS_CONTRACT.md` (wire contract).

Running a built server reads `shared` through its COMPILED `shared/dist`
(the workspace link's `main`), while jest maps `shared` to source. So
`npm run build --workspace=shared` must precede `start:game` / `start:prod`
after any change under `shared/src`, or the process boots against a stale
contract and fails at the first message.

## 0. Where things stand (verified 2026-09-03)

- `develop` = `HTSR-4-API-And-Sockets` head (5aa8d4a) = latest engine
  (`HTSR-3-Game-engine` 40157d5) + the HTSR-6 lobby/auth server, merged.
- The lobby/auth server is DONE and tested: HTTP + SSE, in-memory stores behind
  interfaces, and a Nest TCP client that already calls a game server that does
  not exist yet (`CREATE_GAME_PATTERN` -> `{gameId, webSocketUrl}`), expects
  it to call back `RESOLVE_SESSION_PATTERN`, and listens for
  `GAME_COMPLETED_PATTERN`.
- The engine exposes exactly four player doors, and its own play-through
  harness (`setup/play-through-helpers.ts`) proves a whole game can be driven
  through them without touching `GameState`:
  `turnManager.enqueue(IAction)`, `reactionManager.submitReaction(IReaction)`,
  `reactionManager.submitChoice(windowId, playerId, choice)`, and
  `playerView(game, playerId)` to read.
- Nothing exists between the two. `server/src/runtime/runtime.service.ts`,
  `server/src/socket/socket.gateway.ts` and `server/src/lobby/lobby.ts` are
  0-byte placeholders on every branch. The server has no Socket.IO
  dependency at all (`@nestjs/websockets`, `@nestjs/platform-socket.io`,
  `socket.io` are absent from the lockfile). The client on `HTSR-5-Frontend`
  has `socket.io-client` and a PRE-contract `useGameState` (events
  `game:action`, `game:state`, `game:catalog`, `game:event`).
- Graphify (rebuilt from 40157d5): no import cycles; `GameState`,
  `IGameEvent`, `GameEventEmitter` are the hubs. The graph covers the engine
  checkout only, not the HTSR-6 lobby code.

## 1. Scope of this ticket

Three things, in the order the data flows:

1. **Create game** — the game server process, its TCP endpoint that turns the
   lobby's `CreateGameRequest` into a dealt table, and the Socket.IO handshake
   that seats an account at it.
2. **Commands in** — `game:command` envelope -> validated -> the right engine
   door -> a truthful acknowledgement.
3. **Output to users** — engine events -> one `PlayerView` per seat -> pushed
   to that seat's socket, plus `game-started` / `game-completed`.

Out of scope, named so they are not quietly pulled in: the React client
rewrite to the new envelope (HTSR-5 ticket), a DB/Redis adapter, Docker,
turn timers, the priority scheduler the contract defers, spectators.

## 2. Architecture — MVC, and what sockets change

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

## 3. Proposed module layout (game server process)

Same `server` workspace, second Nest root and entry point (Q2):

```
server/src/
  main.ts                      lobby/auth bootstrap (exists)
  main.game.ts                 game-server bootstrap: Socket.IO + TCP listener
  game-server/
    game-server.module.ts      Nest root for the game process
    game-registry.service.ts   Map<gameId, RunningGame>; create / get / remove
    internal-game.controller.ts  @MessagePattern(CREATE_GAME_PATTERN)
    session/
      game-session.resolver.ts   interface IGameSessionResolver
      tcp-session.resolver.ts    adapter: RESOLVE_SESSION_PATTERN over TCP
      (in-memory resolver lives in specs only)
    commands/
      command-dispatcher.service.ts  command -> IAction | IReaction | choice
                                     -> engine door -> CommandResult
    projection/
      snapshot-publisher.service.ts  emitter listener -> coalesce ->
                                     playerView per seat -> room emit
    game.gateway.ts            handshake auth, room join, `game:command`
                               with ack, resend-on-reconnect, LeaveGame
shared/src/contracts/
  game-commands.ts             GameCommand envelope + payload schemas
  game-snapshots.ts            GameSnapshot<PlayerView>, server event names
```

`RunningGame` is data: `{ game: Game, accountIds, started: boolean,
version: number, finished: boolean }`. Nothing in `game-server/` reads
`game.gameState`; the four doors and the emitter are the whole surface, same
constraint the play-through harness works under.

Delete the three 0-byte placeholders; they have no readers.

## 4. Flows

### 4.1 Create game

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
   (Q5). Then `game-started` with each seat's first snapshot. A reconnecting
   socket gets `game-started` with the CURRENT snapshot — the view is whole
   state, so reconnect is a resend, no replay.

### 4.2 Commands in

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
   | LeaveGame     | not an engine call; accepted only after `finished` |

   Emitter and reaction manager are constructor slots the dispatcher fills
   from `RunningGame`; they never appear on the wire. Note the contract's
   `ApplyModifierPayload.value` is gone: the value is a `SubmitChoice` on the
   `ValueChoice` window the card opens (engine §7, "unforgeable").
4. Ack truthfully. This needs the engine to SAY what it did (§5, E1).
   Today all three doors return `void` and drop silently.

Commands run inline, synchronously, in arrival order per socket. The
contract's priority scheduler stays deferred; nothing here precludes it
because the dispatcher is the one place a queue would go.

### 4.3 Output to users

1. `SnapshotPublisher` adds ONE listener to the game's emitter, after
   `createGame` (so after `TaskManager` and `GameEngine`, preserving §8).
2. It does NOT project inside `onEvent`. Emission is synchronous and
   re-entrant: a listener can run in the middle of a step, between "card
   left hand" and "card joined party", and a snapshot taken there is a
   transient board. It marks the game dirty and schedules one flush with
   `setImmediate`. A command that emits ten events costs one snapshot per
   seat, taken after the burst, and a window lapsing on its timer produces
   a push with no command at all.
3. Flush: `version++`, then for each seat `playerView(game, seat)` ->
   `game:snapshot { gameId, version, state }` to that seat's room.
4. `GameEnded` -> `finished = true`, `game-completed` to every seat, TCP
   `emit(GAME_COMPLETED_PATTERN, { gameId })` to the lobby (exists on the
   receiving side). Accept `LeaveGame`; when the last seat has left, remove
   the game from the registry.

Raw engine events are NOT forwarded in v1 (Q4). The engine doc (§5) is
explicit that payloads are unfiltered and would leak by that route; the view
already carries what a screen needs (`pendingWindows[].detail` has the dice,
bonuses and requirement). An audience-filtered event feed is a later ticket.

## 5. Engine touches this needs (each one is a consult)

- **E1 — doors return an outcome.** Already agreed in the contract (§7)
  but never built.
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
  `ApplyModifierPayload.value`, the value-choice note above.

Nothing else in `server/src/game/**` moves. No engine rule is duplicated in
the transport: legality is asked of the doors, visibility of the view.

## 6. Tests (the "full gameplay" milestone)

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

## 7. Open questions — answer before building

- ~~Q1 Base branch~~ — answered: the HTSR-4 worktree (§9).
- ~~Q2 Process layout~~ — answered: one workspace, two bootstraps (§9).
- **Q3 E1 shape.** OK to give the three engine doors a result type, as the
  contract already agreed? Shape as in §5.
- **Q4 Output = snapshots only in v1.** The current client draws its log and
  dice animation from raw events; the view has the numbers, the animation
  becomes a client diff. Confirm, or ask for an audience-filtered event
  feed now.
- **Q5 Start timing.** Start the engine when every seat has connected once
  (recommended; it is what the deal/start split exists for), or at creation.
  No-show timeout is deferred either way.
- **Q6 Validation.** Add `zod` for wire schemas, as the contract proposed,
  or hand-written guards. Recommended zod; one schema per command type is
  the whole file.
- **Q7 Names.** E2's `names` option + `players` in the TCP request, or ids
  only.

## 9. Decisions log

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
  `GAME_SERVER_PUBLIC_URL`, default `http://127.0.0.1:3001`). Create-game
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

## 10. Deferred (recorded so they are not reinvented)

n game servers (lobby holds a list of clients + pick; each server already
announces its own url), no-show / abandoned-game teardown, turn timers,
priority scheduling of reactions vs actions, event-log persistence, shared
session store replacing the TCP resolve, client rewrite to the envelope.
