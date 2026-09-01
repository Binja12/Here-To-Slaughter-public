# Here to Slaughter

A server-authoritative, event-driven state engine for a real-time multiplayer
application, in TypeScript on Node.js. The domain is a card game; the problems
are backend problems: **interruptible transactions over shared state,
atomic rollback, rules as data, and information hiding enforced by types.**

[![Engine tests](https://github.com/Binja12/Here-To-Slaughter-public/actions/workflows/engine-tests.yml/badge.svg)](https://github.com/Binja12/Here-To-Slaughter-public/actions/workflows/engine-tests.yml)

```
Test Suites: 75 passed, 75 total
Tests:       1162 passed, 1162 total
```

## What this demonstrates

- **Server authority.** All state lives on the server. Clients send intents
  and receive a projection; nothing a client sends is trusted as fact.
- **Interruptible transactions.** A request can be paused mid-resolution by
  input from *other* users, with timeouts, and those interruptions nest. A
  transaction that is invalidated rolls back atomically, including work done
  by rules that fired inside it.
- **Snapshot-based rollback, chosen over an undo log.** One serialized state
  serves as both the rollback point and the authoritative broadcast, so there
  is one definition of "the state" and it runs on every event, not only on the
  rare failure path. The trade-offs are documented, not hidden.
- **Two schedulers, one contract.** User requests and rule execution run on
  separate pipelines that share nothing but events and state, so neither can
  reach into the other.
- **Rules as data.** The domain is 136 records plus declarative
  `{ trigger, steps }` entries in one registry. No file in the engine core
  names a domain object; adding a rule is data, not an engine change.
- **Information hiding at the type level.** Each user gets a projection built
  by one function whose *type* cannot hold what that user may not see. A
  visible object is named; a hidden one is counted.
- **Dependency direction.** An interface layer sits at the top and imports no
  implementation. Type-only cycles were measured and removed. Every design
  decision, and every alternative that was tried and deleted, is written down
  in [docs/ENGINE_ARCHITECTURE.md](docs/ENGINE_ARCHITECTURE.md).
- **Testing as a design constraint.** Unit specs sit beside their subject. A
  real-clock integration test drives whole sessions through the same four
  entry points a client has and never touches internal state, so any case it
  cannot express is a case no client can reach. CI runs typecheck and suite
  on every push.

> **Unofficial, non-commercial implementation of the *Here to Slay* ruleset.**
> Not affiliated with, endorsed by, or connected to the game's publisher or
> designers. This repository contains **no original artwork and no original
> card text**; every rule description is written in the author's own words.
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
// Snowball: draw a card; if it is a magic card, you may play it and draw again.
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

**Principles the code is held to** (from section 12 of the design record):
delete anything with no readers; fail loudly at the point of the mistake;
derive rather than pass; data over closures; one mechanism, not two; a step
decides about itself, never about its siblings.

---

## Repository layout

```
server/src/game/
  game-engine.ts            wires the pipelines together
  interfaces.ts             the contract layer everything else depends on
  pipelines/                turn-manager, task-manager, reaction-manager, game-state
  abilities/                trigger matching, effect lifecycle, expiry vocabulary
  repositories/
    ability-repository/     one file per rule + the registry
  actions/  tasks/          the two pipelines' units of work
  reactions/                the window classes
  state-structures/         player, party, face-down stack, face-up pile
  views/                    the per-user projection
  setup/                    createGame, plus the real-clock integration test
  conditions/ events/ config/ cards/
server/src/data/            the domain records
shared/                     types shared with any client
docs/ENGINE_ARCHITECTURE.md the design record
client/                     placeholder on this branch; see Branches
```

## Running the tests

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
step.

## Branches

| Branch | What it holds |
|---|---|
| `main` | The engine. This README describes it. |
| `HTSR-6-Auth-And-Lobby` | Registration, sessions, and the lobby service, per `docs/API_AND_SOCKETS_CONTRACT.md` on that branch. |
| `HTSR-5-Frontend` | A React board and a thin Socket.IO gateway used to exercise the engine by hand. **The client on this branch was generated with AI tooling as a reference harness**; it is not part of the engine and is not representative of the design work above. Its image assets have been removed from the repository, so it renders without card art. |

## About this repository

This is a public mirror of a private development repository. The development
repository's frontend branch contains AI-generated card images derived from
the published game's artwork. Those images were stripped from the history
before publishing, which is why the client on `HTSR-5-Frontend` renders
without card art and why the two repositories do not share commit ids on that
branch. The engine branch and its full history are identical in both.

The card descriptions in `server/src/data/base-game-cards.ts` are the
author's own paraphrases of the rules, written so that no printed card text is
reproduced here.

## Status

Work in progress. The reaction system, both pipelines, effects, projection and
setup are complete and tested. Remaining gaps (an end-turn action, deck
reshuffle, ten of the fifteen monster abilities, the transport layer) are
listed in [docs/ENGINE_ARCHITECTURE.md](docs/ENGINE_ARCHITECTURE.md),
section 10.
