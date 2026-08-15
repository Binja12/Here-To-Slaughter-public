# Engine architecture — core ideas

Read before touching `server/src/game/**`. This records the *why* behind the
shapes in the code. Branch: `HTSR-3-Game-engine`. Suite:
`npm test --workspace=server`.

## 1. Two pipelines, never confused

- **Actions** (`IAction.execute(gs)`) — built fresh per player request, driven
  by `TurnManager`, cost action points. Targets arrive as constructor args
  because the client picked them before sending.
- **Tasks** (`ITask.execute(gs, ctx, em, rm)`) — constructed **once at module
  load** inside static ability declarations, driven by `AbilityProcessor` on
  matching events. A task can never be handed a target at construction; it must
  discover one at runtime. This single fact motivates the context and choice
  systems below.

An ability is pure data: `{ trigger: GameEventType, steps: ITask[] }`.

## 2. AbilityContext — the memory of one ability run

Tasks return `void`, so the context is the only channel between steps.
Identity (`sourceCardId`, `ownerId`) is immutable; the rest is a blackboard of
`CTX_*` keys. One fresh context per ability run — nested abilities do not
inherit.

Rules paid for in bugs:
- **No key without a reader.** A write-only or read-only key rots silently
  (`CTX_LAST_AFFECTED_CARD_ID` had readers and no writer for months — the
  ability was a no-op).
- **Choice slots (`CTX_CHOSEN_CARD`, `CTX_CHOSEN_PLAYER`, `CTX_FINAL_ROLL`) are
  written only by windows**, never by tasks — that's what makes them mean "what
  the player picked".
- **Missing required input throws.** Silent `return` is how the no-op bug hid.

## 3. Frames — snapshot and continuation in one

`rm.openFrame()` clones GameState. Windows settle uniformly:

```
good outcome → releaseFrame → suspended pipeline resumes
bad outcome  → restoreFrame → snapshot rollback
always       → frameResolved(frameId, results, result?)
```

**Suspended pipelines live on GameState, inside the snapshot.** So rollback
*is* cancellation: a failed roll, lost challenge or dismissed prompt discards
the continuation together with the state it would have mutated. No cancel flag
exists anywhere.

**Snapshot timing decides scope.** A frame opened by step 4 already contains
steps 1–3, so rolling it back keeps them (Wiggles keeps the stolen hero when
the follow-up roll fails). Want an earlier step undone? Open the frame earlier.

## 4. Reaction windows

- Modifier/challenge windows accept many respondents and reset their timer per
  submission; choice windows have **one respondent, one submission**, resolve
  immediately, single timer. `TaskChoiceWindow` (confirm/dismiss) defaults to
  DISMISS on timeout — never commit an idle player; other choices pick random.
- **Results are self-describing.** Each window declares its context slot *and*
  value shape via `resultKey()`: choices write arrays (`string[]`, multi-select
  ready), the modifier writes a scalar `number`. The processor blindly does
  `ctx.set(result.key, result.value)`.
- `resultKey()` is **abstract** on the choice base; "deliberately no result" is
  the `NO_CONTEXT_RESULT` symbol, not `undefined` — silence can't be told apart
  from forgetting, a sentinel can be asserted in tests. Challenge returns the
  sentinel because any step that still runs necessarily won (the value could
  only be `true`).
- **One lifecycle event pair for all windows** — `ReactionWindowOpened/Closed`
  with `windowType` in the payload — plus true domain events
  (`ModifierApplied`, `ChallengeStarted/Resolved`, `HeroStolen`). Per-window
  Opened/Closed enums were deleted.

## 5. Choice filters — declarative relevance

Two independent axes (in `shared/src/enums.ts`):

```
Zone  { Hand, Party, Discard, EquippedItem }   // which pile
Owner { Self, Others, All, Chosen }            // whose
```

Never fuse them ("OpponentHand") — that needs a member per combination and
still can't say "the chosen player's hand". `Owner.Chosen` is the late-binding
trick: it reads `CTX_CHOSEN_PLAYER`, so a prior `ChoosePlayerTask` decides whose
zone a later `ChooseCardTask` reads.

```ts
steps: [
  new ChoosePlayerTask({ owner: Owner.Others }),
  new ChooseCardTask({ zone: Zone.Hand, owner: Owner.Chosen, cardType: CardType.Magic }),
]
```

Filters are **data, never closures** — readable, loggable, serializable to a
client. A function escape hatch existed and was deleted once `Owner` covered it.

**Visibility is not the engine's concern.** Events state the full truth
(options include opponents' card ids). A projection layer in front of the API
decides what each client sees — it must filter **event payloads**, not just
state snapshots, or the same information leaks by another route. Per-event
audiences/recipient lists were built and deliberately removed.

## 6. Known limitations (deliberate, documented)

- **No failure branches.** `restoreFrame` couples "undo state" with "cancel
  pipeline", so "roll; if you fail, discard instead" is currently impossible.
- **`IIfTask` can't contain suspending steps** — branches run inline, so a
  frame opened inside a branch loses the branch's remainder. Fix: queue-expand
  branches in `runSteps` instead of executing them nested.
- **`ability.trigger` is a raw enum compare** — can't discriminate on payload,
  e.g. "a *card* choice opened" vs any window.
- **`ConfirmTask` aborts everything after it**, fine only as a trailing
  optional effect.

## 7. Repo gaps blocking play

- **No bootstrap**: nothing turns `GameConfig` + `base-game-cards.ts` (136
  cards) into a playable GameState — no deck build/shuffle/deal.
  `defaultGameConfig` has zero consumers.
- **No card declares an ability** — the whole task pipeline is unreachable
  outside tests.
- `ability` is required on `CardBase` but omitted everywhere (~136 pre-existing
  tsc errors). Make it optional.
- **Add `tsc --noEmit` to CI** — ts-jest runs diagnostics off; type breakage
  passes the suite silently (bit us three times in one session).

## 8. Working principles

1. Delete anything with no readers — unreferenced scaffolding gets designed
   around later.
2. Fail loudly at the point of the mistake (throw on missing wiring; make
   exhaustiveness a compile error, not a runtime stall).
3. Derive rather than pass — don't thread values the receiver can compute.
4. "Deliberately none" is a value (`NO_CONTEXT_RESULT`), not an absence.
5. Data over closures.
6. One mechanism, not two — cancellation *is* rollback; all windows settle the
   same way.
