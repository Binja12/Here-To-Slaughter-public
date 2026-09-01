# Here to Slaughter

A server-authoritative multiplayer card game engine in TypeScript, built around
one hard problem: a card play that can be interrupted, contested, modified by
any player at the table, and then either confirmed or fully undone.

> **Unofficial, non-commercial implementation of the *Here to Slay* ruleset.**
> Not affiliated with, endorsed by, or connected to the game's publisher or
> designers. This repository contains **no original artwork and no original
> card text**. Card names appear only as identifiers for the rules being
> modelled; every rule description is written in the author's own words. *Here
> to Slay* is a trademark of its respective owner.

[![Engine tests](https://github.com/Binja12/Here-To-Slaughter/actions/workflows/engine-tests.yml/badge.svg)](https://github.com/Binja12/Here-To-Slaughter/actions/workflows/engine-tests.yml)

```
Test Suites: 75 passed, 75 total
Tests:       1162 passed, 1162 total
```

Stack: TypeScript, Node.js, NestJS, Jest. Transport (Socket.IO) and a React
client live on their own branches; see [Branches](#branches).

---

## Why reactions are hard

In this ruleset almost nothing resolves immediately. Playing a hero looks like
one move, but the table gets a say at every step:

1. The hero is played. **Any opponent** may play a challenge card against it.
2. A challenge is a dice roll-off. **Any player** may throw modifier cards onto
   either side of that roll, each one a choice of two values.
3. If the challenge succeeds, the play never happened. If it fails, the hero
   stands and its owner may now roll for its ability.
4. That ability might draw a card, play the card it drew, and open a *new*
   challenge window on that play, nested inside the first ability's run.

So the engine has to pause an action mid-resolution and wait on input from
players who are not the active player, with timeouts. It has to accept those
interruptions **nested**. And when a contested play is defeated, it has to
undo everything that happened downstream of it, including work done by
abilities that fired in between.

### Two ways to undo

**Per-effect inverse operations.** Every mutation records how to reverse
itself; a failed play walks its log backwards. Every effect has to be written
twice and both halves have to agree, and a nested reaction means the log is a
tree, not a list.

**Snapshot and restore.** Cloning the whole game state when a contest opens,
and either discarding the clone (play stands) or swapping it back in (play
defeated).

This engine takes the second route, and the reason is not only that it is
simpler. The engine already has to **serialize the full game state** to send
authoritative snapshots to clients. The same clone does both jobs, so there is
exactly one notion of "what the state is" in the codebase and it is exercised
on every event, not only on the rare rollback path.

Three consequences fall out of that choice, and they shape most of the engine:

- **Cancellation is rollback.** Ability pipelines that are paused waiting on a
  window live *inside* the game state, so they are inside the snapshot. When a
  contested play is rolled back, the continuation of whatever it started is
  discarded with it. There is no cancel flag anywhere in the engine.
- **Where the snapshot is taken decides what a rollback keeps.** A played card
  leaves the hand *before* the frame opens and joins the party *inside* it, so
  a defeated play is undone but the card is still spent. That is the rule of
  the game, expressed purely by snapshot timing rather than by an
  "already paid" flag.
- **A frame is a scope.** Steps that ran before a frame opened survive its
  rollback; steps that ran inside it do not. An ability that wants an earlier
  step undone opens its frame earlier.

The cost is documented rather than hidden: a run cannot continue *after* its
own rollback (so "roll; if you fail, do X instead" is expressed as a separate
rule reacting to the failure event), and card objects are shared by reference
across snapshots, which is why anything that changes during play is stored on
the board and not on a card. Both are recorded in
[docs/ENGINE_ARCHITECTURE.md](docs/ENGINE_ARCHITECTURE.md), section 8.

---

## Architecture in one screen

The whole design rationale, including approaches that were built and then
deliberately deleted, is in
[docs/ENGINE_ARCHITECTURE.md](docs/ENGINE_ARCHITECTURE.md). The short version:

**Two pipelines that never call each other.**
`TurnManager` drains *actions*: player requests that arrive over the API, cost
action points, and carry their targets. `TaskManager` drains *tasks*: the steps
of card abilities, declared once at module load, which discover their targets
at runtime. Work the engine starts for itself is always a task, so nothing can
sneak a player-priced action onto the queue.

**Frames and windows.** `ReactionManager` opens a *frame* (the snapshot) and a
*window* on it: challenge, modifier, attack, or one of several choice windows.
Every window settles the same way: release the frame or restore it, then
announce the outcome as an event. Timeouts always release. A player's answer
arrives by one of two routes, playing a card into a window or naming one of
the options the engine offered.

**Abilities are data, not code.** A card's behaviour is a list of entries,
each `{ trigger, steps }`, keyed by card id in one registry file. A step that
has to ask a question is the *last* step of its entry; what follows is a
separate entry triggered by the answer's event. "No" is the absence of an
event, so nothing has to be cancelled:

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

**Which abilities are live is derived, never stored.** On every event the
engine scans the board (leaders, party heroes, equipped items, monsters, cards
in play) and looks each one up in the registry. A stolen hero's ability belongs
to its new owner with zero bookkeeping. The only stored things are *effects*:
standing rules with a lifetime ("+3 to your rolls until your turn ends"),
expired by events rather than by polling.

**Clients hold no game state.** They send intents and receive a per-player
projection built by one function. A face-up card is *named*; a face-down card
is *counted*. There is no "table view", because a function that built one
would be the thing that leaked hidden information.

**The card set is data.** No file in the engine core names a card. The base
set is 136 records in `server/src/data/base-game-cards.ts` plus one ability
declaration per card that has behaviour. Adding a card is a record and an
entry, not an engine change.

---

## Repository layout

```
server/src/game/
  game-engine.ts            wires the pipelines together
  interfaces.ts             the contract layer everything else depends on
  pipelines/                turn-manager, task-manager, reaction-manager, game-state
  abilities/                trigger matching, effect lifecycle, expiry vocabulary
  repositories/
    ability-repository/     one file per card with behaviour + the registry
  actions/  tasks/          the two pipelines' units of work
  reactions/                the window classes
  state-structures/         player, party, face-down stack, face-up pile
  views/                    the per-player projection
  setup/                    createGame, plus a real-clock play-through test
  conditions/ events/ config/ cards/
server/src/data/            the card set, as data
shared/                     types shared with any client
docs/ENGINE_ARCHITECTURE.md the design record
client/                     placeholder on this branch; see Branches
```

Specs sit beside their subject (`*.spec.ts`). The play-through test in
`setup/` drives whole turns on a dealt table through the same four doors a real
client has (enqueue an action, submit a reaction, submit a choice, read the
view) and never touches internal state.

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
| `HTSR-5-Frontend` | A React board and a thin Socket.IO gateway used to play-test the engine by hand. **The client on this branch was generated with AI tooling as a reference harness**; it is not part of the engine and is not representative of the design work above. Its image assets have been removed from the repository, so it renders without card art. |

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
