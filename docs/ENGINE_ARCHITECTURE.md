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

An ability is pure data: `{ trigger: { on, scope }, steps: ITask[] }`.

**Behaviour is bound by card id, not carried on card data.** `abilityRegistry`
(`game/abilities/index.ts`) maps card id → `IAbility`; card data in `shared/`
holds display text and rule numbers only. Three reasons: `steps` are live
`ITask` instances that cannot survive `clone()` (and GS is cloned per frame);
nothing off-server may see a card's pipeline; and "which cards have behaviour"
stays one auditable file instead of a field spread over 136 records. The
registry is constructor-injected into `AbilityProcessor`, so tests pass their
own table. A card absent from the map simply has no ability.

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

## 6. Two sources of abilities, one match loop

Per event the processor collects every ability to check, then matches each
against the event. The two sources differ in *where eligibility comes from*:

- **Cards in play — DERIVED.** A card's ability is live because the card sits in
  a party (leader, monsters, heroes, equipped items, instance cards). The scan
  reads it fresh from the party each event and looks the behaviour up in the
  registry. Nothing is stored, so nothing can go stale: a stolen hero's ability
  belongs to its new owner with zero bookkeeping, and a destroyed hero stops
  listening the moment it leaves. This is principle 3 — derive rather than pass.
- **Ongoing effects — STORED**, on the owning `Player`. These are the exception
  and the reason `ActiveEffect` exists: "your heroes cannot be stolen until your
  next turn" has no card position to derive from. It lives on the player until an
  expiry event removes it (§7).

`abilitySources()` gathers both into one list per event — *which abilities to
check* — and nothing in it is retained afterwards.

A previous revision stored card abilities on the player too, installing them at
zone-transition choke points. That was deleted: it cached a fact the party
already answered, and every steal then needed remove-then-add plus a test to
prove the ability had re-homed. Don't reintroduce it.

**Scope answers "whose events count."** The old scan hard-coded two answers —
any player's (leaders, monsters, items) or this card's own (heroes, via a
`payload.cardId` check) — and could not describe the expansion's "-1 to a roll"
card, which reacts to *another* player's roll without being named in it.
`TriggerScope` makes it declarative and shared by both sources:

```
SelfCard    payload.cardId is this card   — a hero's own successful roll
OwnerEvent  the event is my owner's       — "each time YOU roll to CHALLENGE"
OwnerTurn   only during my owner's turn
Anyone      any player's event            — the -1 modifier card
```

Note what `SelfCard` is load-bearing for: Wiggles and Snowball both trigger on
`RollSuccess` and can sit in the same party, so rolling on one must not fire the
other. Owner alone cannot make that distinction — the roller owns both.

**Per event: sweep → resume → match.** Sweeping expiries first is what makes
"until your next turn" start the turn clean (§7).

**`Player.clone()` must copy the effects list**, or frame rollback silently stops
covering ongoing effects. Two specs pin it.

## 7. Ability lifetime is the EFFECT's, not the trigger's

`trigger` says when a pipeline *starts*. It cannot say how long what the
pipeline installed should *last* — "your heroes cannot be stolen until your next
turn" is one ability run that finishes immediately and leaves something behind.
So the lifetime belongs to an `ActiveEffect`, not to `IAbility`, which stays
`{ trigger, steps }`.

**Trigger and expiry are symmetric: both are game events.** An effect turns on
when its installing ability runs, and off when one of its expiry events fires —
optionally confirmed by `shouldExpire`, a state check that runs only then. The
event says WHEN to look; the check says WHETHER it is really over. **No expiry
at all means permanent** — monster passives are the canonical case (`Party` has
no `removeMonster`; a slain monster structurally cannot leave play).

```ts
new ApplyEffectTask({
  passive: { type: PassiveType.CantBeStolen },
  expiry: untilOwnersNextTurn,          // reusable wording from effects.ts
})

// "...while you have a Ranger" — declared in the ability's own module:
expiry: {
  on: GameEventType.HeroRemovedFromParty,
  shouldExpire: (gs, e) => !partyHasClass(gs, e.ownerId, HeroClass.Ranger),
}
```

- **Effects are plain data on GameState** (`gs.activeEffects`), so they snapshot
  and roll back with a frame for free — an effect installed inside a frame that
  is later restored disappears with the state it was protecting. Same contract
  as `abilityPipelines`: copy the array, share the immutable entries.
- **`shouldExpire` exists because an event alone cannot decide.** Losing one of
  two Rangers fires `HeroRemovedFromParty`, but "while you have a Ranger" still
  holds. Events say something changed; effects need what is now true. The check
  lives next to the ability declaration that installs the effect — never as a
  method on a card class, which would put behaviour back onto shared card data.
- **Every expiry lives in `effects.ts`** — `untilEndOfTurn`,
  `untilOwnersNextTurn`, `untilSourceLeavesParty`, `whileClassInParty(cls)` —
  so all card wordings can be read in one place rather than hunted across
  ability modules. `shouldExpire` is omitted whenever the event alone settles
  it, and present whenever the event also fires for situations that are not
  this effect's.
- **Party membership cannot change silently.** `Party.addHero` / `removeHero`
  *require* an emitter and a reason, so they always announce the canonical
  `HeroAddedToParty` / `HeroRemovedFromParty { cardId, playerId, reason }`
  alongside whatever specific event the caller emits (`HeroStolen`,
  `HeroDestroyed`). Expiries subscribe to the canonical pair, so a new mechanic
  is one new `reason`, not an update to every effect. Making the emitter a
  parameter is what turns this from a convention into a compile error — a
  earlier version put the helpers in a separate `party-ops.ts` module, which
  could be bypassed by calling the raw mutator.
- **A steal is remove-then-add**, so both halves of the move are announced.
- **Multi-entry expiry = first match wins.** The once-per-turn shape: a charge
  expires on use OR at the owner's next `TurnStarted` — where the sweep removes
  the stale charge just before the installing trigger re-arms a fresh one.
- **AbilityProcessor owns expiry, not TurnManager** — expiry events are
  arbitrary (a steal, a removal, a turn boundary); the processor is the one
  place that already sees every event.
- **The sweep runs before trigger matching.** So an effect ending at the start of
  your turn is already gone for anything that same `TurnStarted` triggers:
  "until your next turn" means the turn starts clean.
- **A live effect with `trigger` + `steps` IS a temporary passive ability** — the
  processor lists it among its passive sources for exactly as long as it lives.
- **A passive flag is only real if a rule reads it.** `CantBeStolen` is checked
  in `StealFromPartyTask` at the mutation, not merely when a choice window built
  its options — the protection may have been installed in between.
- **Scope of "data over closures" (principle 5):** it bans closures where the
  value is client-visible or serialized (choice filters, event payloads —
  `EffectApplied` carries `expiresOn` event types only). A `shouldExpire` check
  is server-only rule code gated behind a named event, the same standing as a
  task's `execute`.

## 8. Known limitations (deliberate, documented)

- **No failure branches.** `restoreFrame` couples "undo state" with "cancel
  pipeline", so "roll; if you fail, discard instead" is currently impossible.
- **`IIfTask` can't contain suspending steps** — branches run inline, so a
  frame opened inside a branch loses the branch's remainder. Fix: queue-expand
  branches in `runSteps` instead of executing them nested.
- **`trigger` matches on event type + scope only** — it cannot discriminate on
  the rest of the payload, e.g. "a *card* choice opened" vs any window. (Scope
  fixed the whose-event half of this; payload predicates are still absent.)
- **`ConfirmTask` aborts everything after it**, fine only as a trailing
  optional effect.
- **No unequip event.** An equipped item's ability is derived from its carrier
  sitting in the party, so it ends when the hero leaves; an *effect* an item
  granted would need its own expiry once an unequip mechanic exists.
- **`CantBeStolen` guards the steal but does not filter choices** — a protected
  hero can still be *offered* by a `ChooseCardTask`; the steal then no-ops.
  Teaching `choice-filters` about passives would close the gap.
- **`interfaces.ts` ↔ `game-state.ts` remains a type-only cycle.** Genuinely
  mutual: the abstractions name `GameState`, and `GameState` stores
  interface-typed values. Both edges are `import type`, so nothing exists at
  runtime; breaking it would mean a third module for no behavioural gain.

## 9. Dependency direction

`interfaces.ts` is the abstraction layer, so **it must not import an
implementation**. It declares `IReactionManager` (`openFrame`, `openWindow`,
`takeLastFrameId`) and `ReactionManager` implements it; tasks and the processor
take the interface.

That one `import type { ReactionManager }` in `interfaces.ts` used to be the
edge every reported import cycle ran through — 53 traversals across the reaction
windows collapsed to zero when it was removed. They were all type-only, so
nothing was broken at runtime, which is exactly the hazard: the protection was
accidental, and one `instanceof GameState` inside a window would have turned a
harmless type edge into a real "class is undefined at import time" bug.

Worth adding as a guard: eslint `@typescript-eslint/consistent-type-imports`, so
a type-only import can never silently become a runtime one.

## 10. Repo gaps blocking play

- **No bootstrap**: nothing turns `GameConfig` + `base-game-cards.ts` (136
  cards) into a playable GameState — no deck build/shuffle/deal.
  `defaultGameConfig` has zero consumers.
- **Only two cards declare an ability** — `hero-036` (Wiggles) and `hero-040`
  (Snowball) are in `abilityRegistry`; the other 134 have no behaviour yet.
- **Add `tsc --noEmit` to CI** — ts-jest runs diagnostics off; type breakage
  passes the suite silently (bit us three times in one session).
- **`npm ci` is incomplete in some checkouts** — `@nestjs/testing` and eslint's
  deps are declared but unresolvable, so `app.controller.spec.ts` fails to run
  and lint cannot start. Unrelated to engine code.

## 11. Working principles

1. Delete anything with no readers — unreferenced scaffolding gets designed
   around later.
2. Fail loudly at the point of the mistake (throw on missing wiring; make
   exhaustiveness a compile error, not a runtime stall).
3. Derive rather than pass — don't thread values the receiver can compute.
4. "Deliberately none" is a value (`NO_CONTEXT_RESULT`), not an absence.
5. Data over closures.
6. One mechanism, not two — cancellation *is* rollback; all windows settle the
   same way.
