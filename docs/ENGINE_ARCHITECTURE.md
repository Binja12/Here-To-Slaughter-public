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

**An action may grant another action, never call one.** Playing a hero grants a
roll on that hero. The roll is *queued* — `TurnManager.enqueueFirst` — not
invoked inline, because a roll suspends on a modifier window and only the queue
knows how to pause and resume around one; an inline call would run the roll's
tail after `execute()` had already returned to a drain loop that thinks the
action finished. Front of the queue, so the grant resolves before whatever the
player stacked behind the play.

`enqueueFirst` deliberately drops all three of `enqueue`'s guards. It does not
drain (its caller is already *inside* the drain loop; re-entering would let the
turn end mid-action), skips the phase check (the engine is continuing work it
started, not accepting a fresh request), and skips the reactable/open-window
check (a window opened by the granting action's own events must *delay* the
continuation, never discard it). Actions depend on `IActionQueue`, not on
`TurnManager` — same rule as §9.

Cost is the grant's, not the class's: `RollOnHeroAction` takes its cost as a
constructor argument (`FREE` for the granted case) and `canExecute` tests
`AP < cost` rather than `AP <= 0`, so a free roll is still legal at zero AP —
exactly the state that playing a hero with your last point leaves you in. One
class at two prices, no `isFree` branch.

**Behaviour is bound by card id, not carried on card data.** `abilityRegistry`
(`game/abilities/index.ts`) maps card id → `IAbility[]`; card data in `shared/`
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

`PlayHeroAction` is the clearest use of that lever. It spends the point, takes
the card **out of hand**, and only *then* opens the frame and the challenge
window; the hero joins the party and the free roll is granted inside the frame.
So a lost challenge un-plays the hero and un-grants its roll, while the card
stays out of the hand — a challenged card is spent either way, and that fact is
expressed purely by where the snapshot was taken, with no "already paid" flag
anywhere. `PlayChallengeReaction` gets the same result for the challenger's own
card through `burnCard`, which writes the removal into live state *and* the
snapshot.

**A suspending step RETURNS its frameId.** `ITask.execute` returns
`string | void`, and that return value is the only channel — `runSteps` parks
the remainder of the pipeline under whatever comes back. The processor also
counts frames across each step and **throws, naming the task**, if one opened a
frame and returned nothing; otherwise the pipeline would run on underneath its
own open window with nothing downstream able to tell.

**Steps return through `rm.suspendOn(frameId)`, never a raw id.** A window can
be born and die inside the step that opened it — an empty choice resolves in its
own constructor rather than hanging for a full timeout, and settling deletes the
frame. `suspendOn` yields the id only while the frame is still open, so a step
can never park the remainder under a frame whose `FrameResolved` has already
passed. It sits on `IReactionManager` beside `openFrame`, which is what opened
the frame in the first place — one object owns the whole frame lifecycle, and a
step already holds the manager. The processor throws if a raw dead id reaches it
anyway.

**A step never decides anything about the steps AFTER it.** It may skip its own
body when its input is empty — `StealFromPartyTask` leaves `CTX_STOLEN_HERO_ID`
empty and returns, `ConfirmTask` skips a prompt whose subject is empty,
`RollOnHeroTask` skips an empty target — and the steps behind it read the same
empty slot and skip in turn. Silencing siblings is not a task's call; that
belongs to frame settlement, where a failed roll, a lost challenge and a
dismissed prompt all cancel the same way (§3). A `STOP_PIPELINE` return existed
briefly and was deleted: it let a task reason about what its neighbours needed.

**An empty choice settles on a 0ms timer, never inline.** Resolving inside the
constructor settled the frame before the task that opened it had returned, so
the processor had not parked the remainder yet: the `FrameResolved` went out
with nobody listening, the context never received the empty result, and the
frameId handed back was already dead. One tick's delay puts the case back on the
ordinary suspend → resolve → resume path. That is what let both `STOP_PIPELINE`
and a `suspendOn` guard be removed — a step can once again just `return frameId`.

**A confirm prompt names its question.** `ConfirmTask({ confirms, subjectKey })`
puts the follow-up and its subject in the window payload, so a client renders
"Roll on Victim?" from data. One window type carrying a described question, not
a window class per confirmable task — the same call made when the per-window
Opened/Closed events collapsed into one pair (§4). The subject is also what lets
the task skip itself when there is nothing to ask about.

**A granted action asks; a requested one never does.** Clicking a hero to roll
IS the consent, so `RollOnHeroAction` prompts only when `granted` — the free roll
`PlayHeroAction` hands over. It asks BEFORE spending or rolling, so declining is
a true abort with nothing to undo, and it re-files itself behind its own prompt:
`openFrame` (snapshot without the retry) → `enqueueFirst(confirmed copy)` →
`openWindow`. CONFIRM keeps the retry and the dice fly; DISMISS or a timeout
restores a queue that never held it. Nothing is ever deleted from the queue —
the same reason no cancellation flag exists anywhere.

This replaced a one-slot mailbox on `ReactionManager` (`openFrame` wrote
`_lastFrameId`, `takeLastFrameId` read and cleared it). The slot was global to
the manager while only tasks were meant to use it, so every *action* opening a
frame had to remember to wipe it, and forgetting let an ability triggered later
in the same `execute()` suspend itself on the action's window. A return value
cannot be left behind for someone else to pick up, so both actions lost their
clear and the failure mode is gone rather than guarded.

## 4. Reaction windows

- Modifier/challenge windows accept many respondents and reset their timer per
  submission; choice windows have **one respondent, one submission**, resolve
  immediately, single timer, and **always release** — a choice has no failure
  branch. Rollback means an outcome FAILED (a roll under its requirement, a lost
  challenge), never a player declining an offer.
- **A timeout resolves; it never rolls back.** A card or player choice that runs
  out defaults to NO pick (it used to pick at random, committing an idle player
  to a target they never named) and still *releases* its frame. Restoring would
  rewind the step that opened the window — and since the window is not in the
  snapshot, that step would re-run, re-open it, and time out again: an AFK
  player would loop forever. `TaskChoiceWindow` is the exception that proves it:
  a confirm prompt has a meaningful silent answer (DISMISS), and its rollback
  ends the pipeline rather than re-running anything.
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

**Modifiers are accepted by CAPABILITY, not by window class.**
`IModifiableWindow` adds one method — `acceptsModifierFor(playerId)` — and both
the roll window and the challenge window implement it, each with its own rule:
a plain roll has one roll so only the roller qualifies, a challenge has two so
either participant does (and neither before a challenge has actually started).
`PlayModifierReaction` probes for the method rather than testing `instanceof`,
so it names no concrete window (§9) and a third modifiable window would need no
change there.

The reaction asks **before** it burns the card, because `execute` spends the
card before it submits — a target only the window would refuse has to be caught
while the card is still in hand. Previously the reaction looked for a plain roll
window only, which left `ChallengeWindow`'s modifier branch unreachable: a
modifier could never be spent on a challenge, despite two-sided rolls being the
entire reason modifiers carry a target.

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

**An ability that pauses for a yes/no is SPLIT, not parked.** A card holds a
LIST of entries: one per stretch of steps that runs without asking. `ConfirmTask`
is terminal — its window releases either way, emitting `TaskConfirmed` on CONFIRM
and nothing on DISMISS — and the follow-up is a separate entry triggered by that
event. "No" is the ABSENCE of an event, so nothing has to be cancelled.

```ts
[0] { trigger: { on: RollSuccess, scope: SelfCard },
      steps: [ChooseCard, StealFromParty, Confirm({ confirms: 'RollOnHero', subjectKey: CTX_STOLEN_HERO_ID })] }
[1] { trigger: { on: TaskConfirmed, scope: SelfCard, when: { confirms: 'RollOnHero' } },
      steps: [RollOnHero(CTX_STOLEN_HERO_ID)] }
```

Three things fall out of this shape:

- **The declaration draws the scope of "no".** Wholesale rollback could only
  cancel *everything* after the question. Now the answer gates exactly what the
  entry contains, so "skip just this" and "cancel the rest" become a registry
  layout, not a mechanism the engine has to grow.
- **Repetition unrolls.** "You may do this up to three times" is three entries
  with three labels — `'QiBearDiscard2'`, `'QiBearDiscard3'`. No loop construct,
  no counter to keep in sync, nothing on GameState to snapshot: the sequence is
  static data and the label rides the event.
- **`when` is one string, matched against the payload's `confirms` label.**
  Scope answers *whose* event; this answers *which*. Deliberately narrow — it
  discriminates confirm variants and nothing else, so a future wording like
  "when a hero enters your party BY BEING STOLEN" (`reason` is already in that
  payload) still has no matcher. §8's payload-discrimination gap is narrowed,
  not closed.

**A continuation runs with a FRESH context** (§2 — nested runs do not inherit),
so whatever it needs travels on the event as `ctxSeed`. `subjectKey` names it:
one slot, carried deliberately, never the whole blackboard. The same key is what
lets a confirm skip itself when its subject is empty.

**A CONDITION hands off the same way a confirm does.** `CardTypeCondition`
holds no steps: it tests a slot and, when the test passes, emits `ConditionMet`
with its label. Whatever it guards is a separate registry entry triggered by
that event. A failing test emits nothing, so "false" is the absence of an event
— there is no branch to skip past.

```ts
[0] { on: RollSuccess,  scope: SelfCard }                        [Draw, CardTypeCondition(Magic, CTX_DRAWN_CARD_IDS, 'DrewMagic')]
[1] { on: ConditionMet, scope: SelfCard, when: 'DrewMagic'    }  [Confirm({ confirms: 'DrawAgain' })]
[2] { on: TaskConfirmed,scope: SelfCard, when: 'DrawAgain'    }  [Draw]
```

This replaced `IIfTask`, which carried `ifTrue`/`ifFalse` lists and ran them
**inline, outside `AbilityProcessor`**. That predates frames entirely: a branch
step that opened a window had no remainder tracked behind it, so the steps after
it ran underneath that open window. §8's "IIfTask can't contain suspending
steps" is now **gone, not narrowed** — guarded steps are ordinary pipeline steps
with no position rules, and there is one way for a step to run instead of two.
`ifFalse` went with it, unused by any card.

**A step's own emissions can start other entries synchronously.** A condition
announces, and the entry it unlocks may open a window before the condition's
`execute` has even returned. So the frame count around a step says nothing about
what that step did — a guard that counted frames to catch "opened one but did
not return it" was removed once conditions made it fire on a correct flow. The
lesson generalises: any step that emits may re-enter the processor.

**A task names WHAT it needs, never where to find it.** `CardTypeCondition`
takes the context slot as a constructor argument
(`CardTypeCondition(CardType.Magic, CTX_DRAWN_CARD_IDS, [...])`) rather than
reading a fixed key. It used to read `CTX_DRAWN_CARD_IDS` itself and test the
LAST entry, which silently made it "the condition about the most recent draw" —
usable by one wording, and wrong for any card asking about a chosen or stolen
card. Same rule as `StealFromPartyTask(fromKey)` and `RollOnHeroTask(fromKey)`:
the declaring card decides which slot, the task decides what to do with it.

**Both hand-offs seed the continuation.** It runs with a fresh context (§2), so
what it needs travels on the event as `ctxSeed`: a confirm carries the slot its
`subjectKey` names, a condition carries the slot it tested. Snowball's drawn
card reaches entry [2] across two hops that way.

**A confirm must be the last step of its entry — by discipline, not by check.**
Anything after it would run on "no" as well as "yes", because the window
releases either way. There is deliberately no guard: a startup validator existed
briefly and was deleted for being a second, partial mechanism (it walked only
top-level steps) policing something the card declarations already get right.

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
- **A defeated play is DISCARDED at settlement, not restored.** `restoreFrame`
  undoes the play, but the card was taken out of hand *before* the snapshot, so
  rollback alone leaves it in no zone at all — it silently leaves the game.
  `ChallengeWindow` adds it to the discard pile on the challenger-wins branch,
  **after** the restore (which swaps the whole pile for the snapshot's) and with
  no `CardDiscarded` event: `ChallengeResolved` already said the play was
  defeated, and a second event would read as a separate discard. Cards *spent*
  during the window need nothing — `burnCard` writes them into the snapshot's
  discard pile, so they survive the rollback themselves.
- **A card that SURVIVES a challenge is marked**, so it cannot be challenged
  twice in a turn; `TurnManager.startTurn` clears the list alongside the ability
  slots. Only the winning branch marks: a card whose challenge succeeded is in
  the discard and can never be targeted again anyway.
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
- **A passive with a magnitude is read as ENTRIES, not a total.**
  `getEffectsWithPassive(type, playerId)` returns the effects; callers sum them.
  A number would be the smaller API and the wrong one: the roll UI has to show
  "+3 Wise Shield, +5 Fireball", and a sum cannot be taken apart again. So
  `ModifierWindow` keeps ONE `bonuses` list of `{ cardSource, amount }` —
  standing effects seeded when the window opens, played modifier cards appended
  as they arrive. They are all just bonuses; what differs is which card is
  answerable, and that belongs on the entry rather than in a second field.
- **Card ids are PER COPY, not per design.** `base-game-cards.ts` holds 136
  records for 136 physical cards — 25 distinct ids all named "Modifier", 14
  named "Challenge", and pairs like "Critical Boost". A card id therefore
  already identifies one physical card, which is why `GameState.cards` can be a
  `Map<string, ICard>`, why `removeFromHand` can filter by id without taking a
  second copy with it, and why `cardSource` alone tells two contributions apart.
  No instance-id layer is needed; it would duplicate identity the ids carry.
- **Numeric passives STACK, and each keeps its own source.** Two RollBonus
  effects are +3 and +5, not "the highest wins" — `getEffectsWithPassive`
  returns both and the window turns each into its own `{ cardSource, amount }`
  entry, so the UI names both instead of showing an unexplained +8. Wise Shield
  (hero-028) and Vibrant Glow (hero-029) carry exactly this wording in the base
  set, and "+2, +2, then roll" from two magic cards is the same shape.
- **Standing bonuses are seeded at window OPEN, not folded in at settlement.**
  A player deciding whether to spend a modifier card must already see the +3
  counted, so it rides in the `ReactionWindowOpened` payload. That payload
  carries a **copy** of the list — an event already emitted must not change when
  a later modifier is played into the same window.
- **Scope of "data over closures" (principle 5):** it bans closures where the
  value is client-visible or serialized (choice filters, event payloads —
  `EffectApplied` carries `expiresOn` event types only). A `shouldExpire` check
  is server-only rule code gated behind a named event, the same standing as a
  task's `execute`.

## 8. Known limitations (deliberate, documented)

- **No failure branches.** `restoreFrame` couples "undo state" with "cancel
  pipeline", so "roll; if you fail, discard instead" is currently impossible.
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
