# Here-To-Slaughter
implementation of the board game here to slay

## A note on the engine's `GameState`

`server/src/game/pipelines/game-state.ts` is the engine's one big class by
design: since 2026-09-04 it is the only place that mutates the board, so every
structure's mutator has a thin one-to-one door on it. Most of the file is
those setters and getters, which is why it is long. Grouping the doors by zone
is a later pass — see `docs/ENGINE_ARCHITECTURE.md` §8.
