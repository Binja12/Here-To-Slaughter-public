# HTSR-4 API and Sockets Contract

Status: initial agreed contract. Details explicitly marked **Deferred** are not yet fixed.

This document defines the boundary between the browser, the lobby/auth server, and the game server. Engine-internal rules remain owned by HTSR-3.

## 1. System boundaries

The application has two independently running servers:

- **Lobby/Auth server**: registration, login, sessions, the global lobby, and lobby updates over HTTP and Server-Sent Events (SSE).
- **Game server**: multiple isolated games running simultaneously, with commands and snapshots carried over Socket.IO.

There is one global lobby. Its ready list holds at most four players. Starting a game removes its players from that list immediately, allowing another group to form while the first game is running. Games have no spectators.

For local development, addresses and ports are configuration values using local IPs. Docker and production routing are deferred.

The two servers communicate through NestJS microservices using its built-in TCP transport (`@nestjs/microservices`, `Transport.TCP`). We will use `ClientProxy.send()`/`@MessagePattern()` for request-response operations and `emit()` for one-way events. We will not create a custom wire protocol.

Initial internal operations:

- Lobby -> Game: create a game for the selected accounts.
- Game -> Lobby/Auth: resolve a session to its account.
- Game -> Lobby: report that a game completed.

## 2. Authentication and sessions

- An account has a unique username and a password.
- Registering also logs the account in.
- Passwords are hashed and salted in the backend using Argon2id through the conventional `argon2` library.
- Login creates a cryptographically random opaque session token, proposed as 32 random bytes.
- The browser receives the token in an `htsr_session` cookie.
- The server stores only a hash of the token.
- A session lasts one month.
- Cookie attributes: `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` in production. `Secure` is disabled only for local HTTP development.
- Multiple tabs in one browser share the session. Incognito mode and a different browser have separate sessions.
- The session is resolved server-side to the account UUID. A client never supplies its own account/player UUID in a game command.
- Logout revokes the stored session and clears the cookie.

If an authenticated account is assigned to an active game, navigating to any application page routes that browser back to the game. Its Socket.IO connection is re-established automatically.

### Storage abstraction

"Local storage" means server-side in-memory storage, not browser `localStorage`.

The first implementation uses injected interfaces with in-memory adapters:

- `IUserRepository`
- `ISessionStore`
- `ILobbyStore`
- `IGameAssignmentStore`

Database or Redis adapters should later replace these without changing controllers or application services.

**Important:** separate server processes cannot share an in-memory session map. Until a shared persistent store is introduced, the game server must resolve sessions through the Lobby/Auth server over the internal NestJS TCP connection.

## 3. Browser page routing

`GET /login` and `GET /lobby` are browser/page routes as well as navigation entry points. A valid session visiting `/login` is redirected to the lobby, or to its active game. An unauthenticated browser requesting a protected page is redirected to `/login`.

The JSON operations below use the agreed paths without an `/api` prefix.

## 4. HTTP contract

All protected operations identify the account from `htsr_session`.

### Authentication

#### `POST /register`

Request:

```ts
{
  username: string;
  password: string;
}
```

Success: `201 Created`, sets the session cookie.

```ts
{
  accountId: string;
  username: string;
}
```

#### `POST /login`

Request:

```ts
{
  username: string;
  password: string;
}
```

Success: `200 OK`, sets the session cookie.

```ts
{
  accountId: string;
  username: string;
}
```

#### `POST /logout`

Empty request. Success: `204 No Content`; revokes the session and clears the cookie.

### Lobby data

```ts
type LobbyPlayer = {
  accountId: string;
  username: string;
};

type LobbySnapshot = {
  readyPlayers: LobbyPlayer[]; // ordered, maximum four
  self: {
    accountId: string;
    username: string;
    state: "IDLE" | "READY" | "IN_GAME";
    isHost: boolean;
  };
};
```

Lobby state transitions:

```text
IDLE <-> READY -> IN_GAME -> IDLE
```

- The player controls `IDLE <-> READY`.
- The server performs `READY -> IN_GAME` after an accepted start command.
- The server performs `IN_GAME -> IDLE` after the game is complete and the player leaves it.
- The first ready player is the host.
- Only the host may start a game, with two to four ready players.

#### `GET /lobby`

Success: `200 OK` with the caller-specific `LobbySnapshot`.

#### `POST /lobby/ready`

Empty request. Adds the authenticated account to the ready list.

Success: `200 OK` with the updated `LobbySnapshot`.

#### `DELETE /lobby/ready`

Empty request. Removes the authenticated account from the ready list.

Success: `200 OK` with the updated `LobbySnapshot`.

#### `POST /lobby/start-game`

Empty request. The authenticated account must be the host, and the ready list must contain two to four players.

Success: `202 Accepted`.

```ts
{
  gameId: string;
  status: "STARTING";
}
```

The selected accounts become `IN_GAME`, and the ready list is freed for new players.

### Conventional HTTP failures

Use the standard status matching the failure, such as `400`, `401`, `403`, `404`, or `409`.

```ts
{
  reason: string;
}
```

The public contract does not enumerate every possible reason.

## 5. Lobby SSE contract

#### `GET /lobby/events`

Opens an authenticated SSE stream. It pushes changes so clients do not poll `GET /lobby` repeatedly.

Lobby update:

```ts
event: lobby - updated;
data: LobbySnapshot;
```

Game assignment, sent only to the accounts selected for the new game:

```ts
event: game - assigned;
data: {
  gameId: string;
  webSocketUrl: string;
}
```

The browser then connects to that game server through Socket.IO using the same session cookie. Cookies are scoped by domain/path, not by port, so local servers on different ports can receive the same cookie when configured consistently.

**Deferred:** exact SSE disconnect/grace behavior, including how closing one of several tabs affects a ready account. The agreed lobby rule is that a genuinely disconnected ready player loses readiness; implementation must distinguish that from another active tab/connection.

## 6. Game Socket.IO contract

### Connection and authorization

1. The browser receives `game-assigned` over lobby SSE.
2. It opens a Socket.IO connection to `webSocketUrl`; the session cookie accompanies the handshake.
3. The game server resolves the session to an account UUID and verifies that account's game assignment.
4. The connection joins only its assigned game room. Spectator connections are rejected.
5. The server sends `game-started` with the first player-specific snapshot.

After a network disconnect, the client reconnects automatically and receives the current snapshot. An active player cannot voluntarily leave an unfinished game.

### Client command envelope

Client -> server event: `game:command`.

```ts
type GameCommand = {
  commandId: string;
  type: GameCommandType;
  payload: object;
};
```

The client generates `commandId` with `crypto.randomUUID()`. It correlates acknowledgements and makes retries idempotent. Uniqueness is scoped with the authenticated account UUID; clients do not need synchronized counters.

Socket.IO acknowledgement:

```ts
type CommandResult =
  | { commandId: string; accepted: true }
  | { commandId: string; accepted: false; reason: string };
```

Expected rule failures return `accepted: false`; they are not thrown exceptions. Exceptions are reserved for programming errors and broken invariants.

### Commands derived from the engine

```ts
type GameCommandType =
  | "DrawCard"
  | "RollOnHero"
  | "PlayHero"
  | "PlayItem"
  | "PlayMagic"
  | "AttackMonster"
  | "ReDraw"
  | "EndTurn"
  | "ApplyModifier"
  | "Challenge"
  | "SubmitChoice"
  | "LeaveGame";
```

Payloads:

```ts
type DrawCardPayload = {};
type RollOnHeroPayload = { heroId: string };
type PlayHeroPayload = { cardId: string };
type PlayItemPayload = { cardId: string; targetHeroId: string };
type PlayMagicPayload = { cardId: string };
type AttackMonsterPayload = { monsterId: string };
type ReDrawPayload = {};
type EndTurnPayload = {};

type ApplyModifierPayload = {
  cardId: string;
  value: number;
  targetPlayerId: string;
};

type ChallengePayload = {
  cardId: string;
  targetedCardId: string;
};

type SubmitChoicePayload = {
  windowId: string;
  choice: unknown;
};

type LeaveGamePayload = {};
```

Passing a reaction/choice window is represented through `SubmitChoice`; there is no separate pass command. Party leader selection is random and server-owned, so there is no `ChoosePartyLeader` command.

`LeaveGame` is an application/session lifecycle command, not an engine action. It is accepted only after the game is complete; it clears the active-game assignment and returns the account to the lobby.

The transport maps public names such as `heroId` and `monsterId` to current engine constructor field names where those differ. Server-only dependencies such as the authenticated player ID, emitter, or reaction manager never appear in client payloads.

### Server events and snapshots

- `game-started`: initial caller-specific snapshot after connection.
- `game:snapshot`: new caller-specific snapshot after an engine event changes game state.
- `game-completed`: indicates that the match has ended; its data is also represented in the snapshot.

Snapshot envelope:

```ts
type GameSnapshot<TState> = {
  gameId: string;
  version: number;
  state: TState;
};
```

Every recipient gets a separately projected snapshot. A player can see its own private state, such as its hand, but never another player's hidden data.

**Deferred:** the exact `state` fields depend on the finalized HTSR-3 engine model and HTSR-5 view requirements.

## 7. Engine integration requirements

HTSR-4 must adapt to the engine rather than duplicate game rules. The current engine exposes `canExecute(): boolean`; the transport needs a result that can carry a human-readable rejection reason. The integration layer therefore needs a typed validation/result path while preserving exceptions for genuine code failures.

The current turn manager also needs to return command outcomes rather than silently dropping invalid, wrong-phase, or busy commands.

Known command gaps to coordinate with HTSR-3:

- `EndTurn` needs an engine action/integration path.
- `SubmitChoice` needs a generic reaction-window integration path.

Concurrency policy is not part of the wire format. The intended scheduler uses bounded/rate-limited ingress and priority selection: open-window reactions receive priority, otherwise the active player's eligible input receives priority. Detailed scheduling and reaction-window fairness remain deferred.

## 8. Shared contract files

When implementation starts, put transport DTOs in one shared source used by both servers and the frontend:

```text
shared/src/contracts/auth.ts
shared/src/contracts/lobby.ts
shared/src/contracts/game-commands.ts
shared/src/contracts/game-snapshots.ts
```

TypeScript types alone do not validate network input. Runtime schema validation should use one conventional schema library shared with these DTOs; Zod is the proposed choice.

## 9. Required tests

### Authentication

- Registration hashes the password, logs in automatically, and sets a one-month cookie.
- Login accepts valid credentials and rejects invalid credentials.
- Session lookup maps the opaque cookie to the correct account UUID.
- Logout revokes the session.

### Lobby and SSE

- Ready/unready transitions and maximum capacity.
- Host assignment and the two-to-four-player start rule.
- Starting a game frees the ready list and sends assignments only to selected accounts.
- Lobby changes are delivered through caller-specific SSE snapshots.

### Socket.IO commands

- The handshake rejects missing, invalid, or unassigned sessions.
- A valid command is mapped to the authenticated engine player and acknowledged.
- An invalid command returns `{ accepted: false, reason }` without crashing the connection.
- Duplicate `commandId` retries do not execute twice.
- Snapshots hide opponents' private state and reconnect sends the latest version.

Recommended integration coverage: two simultaneous game rooms remain isolated.

## 10. Deferred decisions

- Exact local and production host/port values.
- Docker topology and reverse-proxy routing.
- Shared database/Redis adapters and whether internal session resolution remains necessary afterward.
- Exact SSE multi-tab disconnect policy.
- Final game snapshot fields.
- Reaction-window scheduling, deadlines, and overload limits.
- Game history/event-log persistence format.
