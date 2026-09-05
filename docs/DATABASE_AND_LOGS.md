# Database and game logs

Branch `DB_and_logs` (2026-09-05). Two things were added to the server: a
PostgreSQL database behind the store interfaces the auth and lobby modules
already injected, and two logs of a running table — one worded for the
players and shipped with every snapshot, one verbatim for developers. Both
logs are persisted per game.

## 1. What is stored where

One PostgreSQL database, shared by the lobby/auth process and the game
process. The schema is `server/src/persistence/schema.ts`, applied at boot
with `CREATE ... IF NOT EXISTS` (a restart against a populated database is a
no-op; a column change is a new `ALTER` there, never an edit of a `CREATE`).

| Table          | Written by            | Holds                                                                 |
| -------------- | --------------------- | --------------------------------------------------------------------- |
| `users`        | lobby (`AuthService`) | account id, username (unique), Argon2id password hash, created_at    |
| `games`        | game process          | one row per dealt table: settings + engine config (JSONB), `last_version`, `last_state`, `updated_at`, `ended_at`, `winner_id` |
| `game_players` | game process          | (game_id, account_id, username, seat) — a player's **game history** is `SELECT game_id FROM game_players WHERE account_id = $1` |
| `game_log`     | game process          | the player-readable story: (game_id, seq, at, player_id, text, seen) |
| `game_events`  | game process          | every engine event verbatim: (game_id, seq, at, type, player_id, audience, payload) |

`last_state` is `{ [accountId]: PlayerView }` — the board exactly as every
seat was last shown it (the wire's own shape, `shared/src/views.ts`), so it
serialises with no second definition. A game's history is derived from the
seats table, never stored on the user row.

Still in memory, deliberately: sessions, the ready list and the seat
assignments. A restart logs everyone out and empties the lobby; the game
process keeps resolving sessions over the lobby's TCP door
(`API_AND_SOCKETS_CONTRACT.md` §2), so nothing else changes.

## 2. Switching it on

`DATABASE_URL` decides, once, when `StoresModule`
(`server/src/stores/stores.module.ts`) loads:

- set → `PostgresUserRepository` and `PostgresGameStore`
  (`server/src/persistence/`), with `DatabaseModule` owning one `pg` pool per
  process and applying the schema before anything can query it. An
  unreachable database at boot fails the process — misconfiguration is loud.
- unset → the in-memory stores, as before. Every spec runs this way; a
  developer without Docker loses nothing.

`compose.yaml` and `compose.internet.yaml` add a `db` service
(`postgres:16-alpine`, volume `htsr-db`, health-checked) and hand both Nest
containers `DATABASE_URL=postgres://htsr:htsr@db:5432/htsr`. The credentials
are for a local table; change them with the URL when the stack faces the
internet.

A store that rejects at runtime — the database gone mid-game — is logged by
the caller (`GameRegistryService.create`, `SnapshotPublisherService.push`)
and the table plays on. There is no retry; the outage story is deferred with
the rest of it (`ENGINE_INTEGRATION_PLAN.md` §10).

### Running the Postgres spec

`server/src/persistence/postgres.spec.ts` runs against a real database and is
skipped without one:

```bash
docker run -d --name htsr-pg-dev -e POSTGRES_USER=htsr -e POSTGRES_PASSWORD=htsr -e POSTGRES_DB=htsr -p 5433:5432 postgres:16-alpine
```

```bash
cd server && HTSR_TEST_DATABASE_URL=postgres://htsr:htsr@localhost:5433/htsr npx jest -i src/persistence/postgres.spec.ts
```

It truncates `users` and `games` first — point it at a throwaway database.
Setting `DATABASE_URL` instead makes ANY Nest-booting spec run through the
real adapters; `game.gateway.spec.ts` and `full-game-over-sockets.spec.ts`
pass that way (a whole game leaves a `games` row at version 4 with its
winner, 113 `game_events`, and lines such as "carol slew Terratuga"), which
is how the wiring was proven end to end. `auth.controller.spec.ts` does NOT:
it registers `player-one` in every test and assumes a store that is fresh per
test, which the in-memory adapter is and a database is not (the second
registration is a 409). Run it in memory.

## 3. The two logs

Both are produced by one listener per table, `GameLog`
(`server/src/game/views/game-log.ts`), added to the game's emitter at the
table's birth in `GameRegistryService.create`, beside the publisher's own
listener. It is the second projection of the engine doc's §5: it reads the
board only to name seats and cards.

**Developer log** — `EventRecord`: every event as it fired (`seq`, `at`,
`type`, `playerId`, `audience`, `payload`). Nothing filtered, nothing
worded. Stored in `game_events`; never sent to a browser.

**Player log** — `LogRecord`: for the events a player would tell of,
`logLine()` writes one line at the moment of the event (so a card later
shuffled away keeps its name). A line names a card only to the seats that
saw it: `{ text, seen?: { by, text } }` — a draw is "alice drew a card" to
the table and "alice drew Bad Axe" to alice; a pull names the card to both
hands. `entriesFor(viewerId)` is the per-seat reading, `GameLogEntry[]`
(`shared/src/contracts/game-log.ts`), and it travels in the snapshot
envelope: `GameSnapshot.log`, whole on every push like `state`, so a
reconnect gets the story with the board. Stored in `game_log` with the
table's wording in `text` and the private wording in `seen`.

Not worded (developer log only): `CardRemovedFromHand`, `FrameResolved`,
`AbilityDone`, `TaskConfirmed`, `ConditionMet`, `EffectExpired`,
`HeroRemovedFromParty`, `RevealEnded`, the window-opened lifecycle, and a
window closing other than a roll settling. Wording lives in one `switch` in
`logLine`; a new event that players should read about is one more case.

### Flush = one store write

The publisher already flushes once per burst (`setImmediate`). Each flush
now also calls `IGameStore.flush(gameId, { version, at, events, lines,
views, winnerId? })` with `GameLog.drain()` — the records since the last
flush — and the per-seat views it just pushed. In Postgres that is one
transaction: append events, append lines, replace the board `WHERE
last_version < $version`, so an older flush landing late appends its records
and leaves the newer board alone, and a retried flush adds nothing twice
(`ON CONFLICT DO NOTHING` on `(game_id, seq)`).

## 4. Client

`GameSnapshot.log` reaches `Board` through `GameProvider`'s `log` prop
(`useGameLog()`). `board/GameLogMenu.tsx` is a `<details>` dropdown titled
"Game log", stacked directly under the "Game settings" one in the top-left
column (`Board.tsx`), newest line first, each with a clock. The fake server
(`ports/FakeGamePort.ts`) writes a few lines of its own so the menu can be
looked at with `REACT_APP_FAKE_SERVER=1`.

## 5. Decisions taken without the owner (flag if he disagrees)

- **PostgreSQL over MongoDB**, plain SQL through `pg`, no ORM. The data is
  relational (users, games, seats, two per-game logs) and the repo's store
  style is hand-written adapters behind interfaces; JSONB carries what the
  wire already serialises. The old "MongoDB" note predates the stores.
- **Line text is rendered on the server**, not the client: the server has
  every card's printed name at hand, and a client would have to be sent
  hidden card data to word a line about it.
- **The log rides the snapshot envelope**, not `PlayerView`: `PlayerView`
  is the engine's projection of the board; the story is the transport's.
- **Whole log on every push**, like the view. A long table is a few hundred
  short lines; a diff protocol was not worth a second mechanism.
- **Sessions stay in memory.** Not asked for, and the game process resolves
  them through the lobby anyway.
- **No HTTP endpoint for a player's history yet.** The data is there
  (`game_players`); a reader is a small follow-up once a screen wants it.
