# Here to Slaughter

A server-authoritative, event-driven state engine for a real-time multiplayer
application, in TypeScript on Node.js, with the services around it: a
lobby/auth server, a Socket.IO game server running many tables at once,
PostgreSQL persistence and a React client. The domain is a card game; the
problems are backend problems: **interruptible transactions over shared state,
atomic rollback, rules as data, and information hiding enforced by types.**

[![Engine tests](https://github.com/Binja12/Here-To-Slaughter-public/actions/workflows/engine-tests.yml/badge.svg)](https://github.com/Binja12/Here-To-Slaughter-public/actions/workflows/engine-tests.yml)

```
Test Suites: 1 skipped, 168 passed, 168 of 169 total
Tests:       7 skipped, 1588 passed, 1595 total
```

## In play

https://github.com/user-attachments/assets/36ccf3fb-0a81-4677-b7c1-6db60f99ce17

Recorded from the seat of the player being challenged. A hero play is
interrupted by another seat's Challenge; both roll, and each side answers
with modifiers until the window settles, so the play stands. On the same
turn the hero's own effect pauses on a target choice, rolls, and takes a card
from the chosen hand. One request, suspended twice by other users' input,
committed at the end.

## Core ideas

- **Server authority.** All state lives on the server. Clients send intents
  and receive a projection; nothing a client sends is trusted as fact.
- **Interruptible transactions.** A request can be paused mid-resolution by
  input from *other* users, with timeouts, and those interruptions nest. A
  transaction that is invalidated rolls back atomically, including work done
  by rules that fired inside it.
- **Snapshot-based rollback, chosen over an undo log.** One serialized state
  serves as both the rollback point and the authoritative broadcast, so there
  is one definition of "the state" and it runs on every event, not only on the
  rare failure path.
- **Two schedulers, one contract.** User requests and rule execution run on
  separate pipelines that share nothing but events and state, so neither can
  reach into the other.
- **Rules as data.** The 136 cards are plain records; each ability is a
  declarative `{ trigger, steps }` entry in one registry, composed from a
  small set of reusable tasks. The engine core names no card, so adding one
  adds data, not engine code: the open/closed principle, with the registry
  as the extension point.
- **Information hiding at the type level.** Each user gets a distinct
  projection built by one function whose *type* cannot hold what that user
  may not see. A visible object is named; a hidden one is counted.
- **A typed service boundary.** Two NestJS processes: the lobby/auth server
  (HTTP plus Server-Sent Events) and the game server (Socket.IO), talking to
  each other over Nest's TCP microservice transport. The wire contract lives
  in `shared/src/contracts`; commands are zod schemas parsed where they enter,
  so a request that reaches the engine is already well formed.
- **Sessions without trusting the client.** Passwords are Argon2id hashes;
  a session is an opaque random token in an `HttpOnly` cookie, stored only as
  a hash. The game server resolves the cookie to an account itself, so no
  command carries a player id.
- **Persistence behind interfaces.** PostgreSQL when `DATABASE_URL` is set,
  in-memory stores otherwise, chosen once at boot; every spec runs in memory.
  Each game keeps two logs: every engine event verbatim, and a player-facing
  story projected per seat, so a line names a card only to the seats that saw
  it.
- **Testing as a design constraint.** Unit specs sit beside their subject. A
  real-clock integration test drives whole sessions through the same four
  entry points a client has and never touches internal state, so any case it
  cannot express is a case no client can reach. A socket spec plays a whole
  game through real Socket.IO clients. CI runs typecheck and suite on every
  push.

> **Unofficial, non-commercial implementation of the *Here to Slay* ruleset.**
> Not affiliated with, endorsed by, or connected to the game's publisher or
> designers. This repository contains **no original artwork**, and the card
> text in the current tree is written in the author's own words.
> *Here to Slay* is a trademark of its respective owner.

---

## The core problem: a transaction that other users can interrupt

In most backends a request either commits or fails inside one handler. Here a
request opens, waits on other users, may be interrupted again while waiting,
and only then commits or rolls back. In the game's terms:

1. A user plays a card. **Any other user** may contest it within a time limit.
2. A contest is resolved by a dice roll. **Any user** may modify that roll
   while it is open, each modification itself a choice.
3. If the contest succeeds, the original request never happened. If it fails,
   the request stands and triggers the card's own rule.
4. That rule may draw a card, play it, and open a *new* contest on that play,
   nested inside the first rule's execution.

So the engine has to suspend a request, accept nested suspensions, time out
silent users without deadlocking, and, on failure, undo everything downstream
of the request including side effects of rules that ran in between.

### Two ways to undo

**Undo log (per-effect inverse operations).** Every mutation records how to
reverse itself; a failed request walks its log backwards. Every effect has to
be written twice and both halves have to agree, and nested interruptions turn
the log into a tree.

**Snapshot and restore.** Clone the state when a contest opens; discard the
clone on success, swap it back in on failure.

This engine takes the second route, and the reason is not only simplicity.
The engine already has to serialize the full state to broadcast it. The same
clone does both jobs, so "what the state is" has one definition that is
exercised constantly rather than a second one that runs only on rollback.

### Seamless play, the original driver

The first design let play continue while a contest was open: a card resolved
at once, later actions stacked on top, and a losing reaction rolled the whole
sequence back. Each modifier could flip the outcome again, so "undo" meant
undoing and re-running everything downstream, possibly several times. An undo
log cannot express that; swapping a snapshot in and re-running the parked
continuation can. That requirement is what settled the engine on snapshots.

Seamless play itself was built, tested and then removed. The printed rules do
not survive it: a card stolen during the contested play could not be played
into the still-open window, and only modifiers are allowed to wait for their
target. The table now pauses while a window is open. The snapshot design
stayed, because it is still the simplest answer to nested interruptions.

Three consequences shape most of the engine:

- **Cancellation is rollback.** Suspended rule pipelines live *inside* the
  state, so they are inside the snapshot. Rolling back a contested request
  discards the continuation of whatever it started. There is no cancel flag
  anywhere.
- **Where the snapshot is taken decides what a rollback keeps.** A played card
  leaves the hand *before* the frame opens and joins the table *inside* it, so
  a defeated play is undone but the card is still spent. That business rule is
  expressed purely by snapshot timing, with no "already paid" flag.
- **A frame is a scope.** Steps that ran before a frame opened survive its
  rollback; steps that ran inside it do not. A rule that wants an earlier step
  undone opens its frame earlier.

The costs are recorded rather than hidden: a run cannot continue *after* its
own rollback (so "try; on failure do X" is a separate rule reacting to the
failure event), and domain objects are shared by reference across snapshots,
which is why everything that changes during play is stored on the board and
not on the object. Both are in
[docs/ENGINE_ARCHITECTURE.md](docs/ENGINE_ARCHITECTURE.md), section 8.

---

## Architecture in one screen

**Two pipelines that never call each other.**
`TurnManager` drains *actions*: user requests that arrive over the API, are
priced, and carry their targets. `TaskManager` drains *tasks*: the steps of
rules, declared once at module load, which discover their targets at runtime.
Work the engine starts for itself is always a task, so nothing can put a
user-priced request on the queue from the inside.

**Frames and windows.** `ReactionManager` opens a *frame* (the snapshot) and a
*window* on it: a contest, a modification, or one of several choice windows.
Every window settles the same way: release the frame or restore it, then
announce the outcome as an event. Timeouts always release. A user's answer
arrives by one of two routes, committing a card into a window or naming one of
the options the engine offered.

**Rules are data, not code.** A card's behaviour is a list of entries, each
`{ trigger, steps }`, keyed by id in one registry. A step that has to ask a
question is the *last* step of its entry; what follows is a separate entry
triggered by the answer's event. "No" is the absence of an event, so nothing
has to be cancelled:

```ts
// Snowball: draw a card. If it is a magic card, you may play it right away
// and then draw again.
[
  { trigger: { on: RollSuccess,   scope: SelfCard },
    steps: [Draw(1), CardTypeCondition(Magic, CTX_DRAWN_CARD_IDS, DREW_A_MAGIC)] },
  { trigger: { on: ConditionMet,  scope: SelfCard, when: DREW_A_MAGIC },
    steps: [Confirm({ confirms: PLAY_AND_DRAW, subjectKey: CTX_DRAWN_CARD_IDS })] },
  { trigger: { on: TaskConfirmed, scope: SelfCard, when: PLAY_AND_DRAW },
    steps: [PlayMagic(CTX_DRAWN_CARD_IDS), Draw(1)] },
]
```

**Which rules are live is derived, never stored.** On every event the engine
scans the board and looks each object up in the registry. An object that
changes owner takes its rules with it with zero bookkeeping. The only stored
things are *effects*: standing rules with a lifetime, expired by events rather
than by polling.

**Clients hold no state.** They send intents and receive a per-user projection
built by one function. A visible object is *named*; a hidden one is *counted*.
There is no shared "table view", because a function that built one would be
the thing that leaked.

**From the engine to the network.** The engine takes player ids and nothing
else; how a request arrived is not its business. The game server owns the
rest: a registry of running tables, a dispatcher that turns a socket command
into an action, a reaction or a choice, and a publisher that listens to each
table's events and, once per burst, pushes every seat its own view with a
version number. Commands carry a `commandId`, so a resend after a reconnect
is answered from a ledger instead of being played twice, and a reconnecting
browser is sent the live table. The lobby hands the seated accounts to the
game server over TCP and hears back when the game ends.

**Principles the code is held to** (from section 12 of the design record):
delete anything with no readers; fail loudly at the point of the mistake;
derive rather than pass; data over closures; one mechanism, not two; a step
decides about itself, never about its siblings.

---

## Repository layout

```
.github/workflows/          CI: typecheck and the server suite on every push
server/src/
  main.ts  main.game.ts     the two bootstraps: lobby/auth process, game-server process
  game/                     the engine (expanded below)
  game-server/              Socket.IO gateway, table registry, command dispatch, snapshot publisher
  lobby/  auth/             the lobby (HTTP + SSE); registration, login, sessions
  persistence/  stores/     PostgreSQL stores and their in-memory counterparts, chosen at boot
  data/                     the 136 card records
  utils/                    dice
server/src/game/
  game-engine.ts            wires the pipelines together
  interfaces.ts             the contract layer everything else depends on
  pipelines/                turn-manager, task-manager, reaction-manager, game-state
  abilities/                trigger matching, effect lifecycle, expiry vocabulary
  repositories/ability-repository/   one file per rule + the registry
  actions/  tasks/          the two pipelines' units of work
  reactions/                the window classes
  state-structures/         player, party, face-down stack, face-up pile
  views/                    the per-user projection and the per-seat game log
  setup/                    createGame, plus the real-clock integration tests
  cards/                    one class per card type, built from the records by a factory
  events/                   the event types and the emitter both pipelines speak
  conditions/  config/      win conditions; game and time-control settings
shared/src/
  contracts/                zod schemas: commands, snapshots, settings, log, lobby-to-game RPC
  enums.ts  types.ts  views.ts   the types every server process shares
client/
  src/ports/                the only door to the servers, with fake ports for offline work
  src/state/                command queue and snapshot hooks
  src/lobby/  auth/  board/ the screens
  src/loading/  audio/      asset readiness; music and sound effects
  src/contract/             the client's own typed copy of the wire contract
  scripts/bot-seat.mjs      a headless seat that plays a legal game, for solo playtests
  public/                   static assets; card art is absent in this mirror
docs/                       design records: engine, wire contract, database and logs, playtests; schema diagrams
Dockerfile  compose.yaml    the whole stack in containers, for a local playtest
compose.internet.yaml  docker/   the same stack behind a Caddy edge and a tunnel, for remote playtests
scripts/                    asset pipeline for the removed art and music; the remote-playtest launcher
```

## Running it

```bash
npm install
```

```bash
npm test --workspace=server
```

```bash
npx tsc --noEmit -p server/tsconfig.json
```

The Jest config runs with type diagnostics off, so the typecheck is a separate
step. The PostgreSQL store spec is skipped unless `HTSR_TEST_DATABASE_URL`
points at a database.

To play a table locally, start the stack and open http://localhost:3002 in two
to four separate browser profiles (each one is a player):

```bash
docker compose up --build
```

## About this repository

This is a public mirror of a private development repository, and its history
was rewritten before publishing. The development history contains
AI-generated card images derived from the published game's artwork, and a
copy of the publisher's rules reference; both were removed from every commit
here, so the client renders without card art. The music tracks were removed
too, so the client plays only its sound effects. Commit messages were
rewritten for clarity as well, so commit ids differ from the private
repository.

The card descriptions in `server/src/data/base-game-cards.ts` are the
author's own paraphrases of the rules. Commits older than the one that
introduced them still carry the printed wording.

The React client was run as an exercise in working with a separate team. It
was produced from prompts alone, against the written contract in
[docs/API_AND_SOCKETS_CONTRACT.md](docs/API_AND_SOCKETS_CONTRACT.md) and the
client brief beside it, with no access to the engine or the servers. That is
why it carries its own typed copy of the wire contract under
`client/src/contract` and reaches the servers only through it. The design
work this README describes is in the engine and the servers. Claude Code and
Astra were the tools; the card images removed from this mirror were
generated with OpenAI tools.

The project was built with [Claude Code](https://claude.com/claude-code) as a
pair programmer. The design records in `docs/`, the engine architecture above
all, were written alongside the work rather than generated from it afterwards.
Each section records a decision that was weighed against its alternatives at
the time it was made; the tool's part was to write the reasoning down so that
later sessions, tools and readers start from the same understanding instead
of rediscovering it from the code.

## A note on the engine's `GameState`

`server/src/game/pipelines/game-state.ts` is the engine's one big class by
design: since 2026-09-04 it is the only place that mutates the board, so every
structure's mutator has a thin one-to-one door on it. Most of the file is
those setters and getters, which is why it is long. Grouping the doors by zone
is a later pass — see `docs/ENGINE_ARCHITECTURE.md` §8.

## License

Copyright © 2026 Benjamin Namdar. All rights reserved. The code is published
for reading and evaluation; using it, in whole or in part, in any other way
requires written permission. See [LICENSE](LICENSE). The game it implements
belongs to its publisher, and nothing here grants rights in it.

## Status

Every card in the base set has its behaviour in the registry, and whole games
have been played through the lobby, the game server and the client in
playtests. Known limitations are listed in
[docs/ENGINE_ARCHITECTURE.md](docs/ENGINE_ARCHITECTURE.md), section 8.
