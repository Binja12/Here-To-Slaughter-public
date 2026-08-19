# Engine architecture — core ideas

Read before touching `server/src/game/**`. This records the *why* behind the
shapes in the code. Branch: `HTSR-3-Game-engine`. Suite:
`npm test --workspace=server`.

**Reference implementations.** `hero-040` (Snowball) and `hero-028` (Wise
Shield) are the most complete cycles in the engine. Snowball exercises the full
ability pipeline — draw, condition, confirm, continuation — across three
registry entries, and plays the card it drew. Wise Shield exercises the full
effect lifecycle — install, read, expire — plus the whole action path around it
(play, challenge, granted roll, modifier window). `magic-053` (Critical Boost)
is the reference for a MAGIC card: one entry that pauses on a choice and
finishes as a later step of itself. Read `abilities/snowball-ability.ts`,
`abilities/wise-shield-ability.ts` and `abilities/critical-boost-ability.ts`
with their specs before adding a card.

## 1. Two pipelines, never confused

- **Actions** (`IAction.execute(gs)`) — built fresh per player request, driven
  by `TurnManager`, cost action points. Targets arrive as constructor args
  because the client picked them before sending.
- **Tasks** (`ITask.execute(gs, ctx, em, rm)`) — constructed **once at module
  load** inside static ability declarations, driven by `TaskManager` on
  matching events. A task can never be handed a target at construction; it must
  discover one at runtime. This single fact motivates the context and choice
  systems below.

An ability entry is pure data: `{ trigger: { on, scope, when? }, steps: ITask[] }`.
A card registers a **list** of them (§6).

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

**A mechanic both pipelines need is a BASE CLASS, not a duplicate.** Playing a
magic card is the same sequence whether a player requested it or an ability
did, so it lives once in a base class and both wrappers extend it. The base and
the task sit together in `tasks/action-tasks.ts` — steps that do what a player
action does, for an ability that does it unasked — and the matching `IAction`
stays in `actions/`, extending the base across the folder line. Hero and item
follow the same layout. The base is the more basic thing — the mechanic with no
price and no identity; each pipeline's wrapper is pure addition (the action
adds cost, `canExecute` guards and queue identity; the task adds a context slot
read at runtime). Inheriting the other way round
would force the subclass to *remove* those, and a task cannot call the action's
constructor honestly — it has no target at construction (§1).

**Playing a magic card MOVES it and announces the attempt.** `playMagic` takes
the card out of hand, opens a frame, puts the card in the owner's instance
pile, emits `MagicPlayed` and opens a `Challenge` window on it. That is the
whole mechanic. The pile is written inside the frame, so a defeated card rolls
straight back out of it — the same lever `PlayHeroAction` pulls for a hero
joining a party (§3). `MagicPlayed` is what the table is challenging, so it
goes out before the window, not after it.

It returns the frameId, so `PlayMagicTask` can suspend the declaring card's own
entry on the same window. `PlayMagicAction` drops it: `TurnManager.drain`
already stops on an open window.

**A played card's steps trigger on the SETTLED FRAME, never on `MagicPlayed`.**
`FrameResolved` carries the `cardId` its window settled on, which is what lets
`TriggerScope.SelfCard` pick the played card out — the frame itself is deleted
by the release or restore just before, so the event is the only place left to
read it.

No listener has to work out whether the play stood. A defeated card was rolled
back out of the instance pile, so it is not among the sources
`abilitySources()` gathers and its entry cannot match. Ordinary trigger
matching does the whole job, and the card's position is the only record of the
outcome (principle 3).

`TaskManager` wakes the pipelines suspended on that frame and *then* matches,
so a played card's own pipeline lands on the stack above them and resolves
before the rest of whatever played it.

**The card puts itself away: `DisposeMagicTask` is the last step of its
entry.** Instance pile → discard, silent — `MagicPlayed` already told the table
it was spent. Being a step is what makes the timing right for free: it runs
after everything before it, including a pause on a window, so the card holds
the position `abilitySources()` scans for as long as its own run needs it —
which is what lets a magic card use a continuation entry (§6). Nothing sweeps
the pile, so a card that omits the step stays in it (§8).

The base implements **neither** `IAction` nor `ITask`. Their `execute`
signatures are override-compatible in TypeScript (`execute(gs)` is a legal
override of `execute(gs, ctx, em, rm)`), so a single class satisfying both would
type-check while letting `TaskManager` run an action — silently playing its
constructor-bound card and ignoring the context.

**Behaviour is bound by card id, not carried on card data.** `abilityRegistry`
(`game/abilities/index.ts`) maps card id → `IAbility[]`; card data in `shared/`
holds display text and rule numbers only. Three reasons: `steps` are live
`ITask` instances that cannot survive `clone()` (and GS is cloned per frame);
nothing off-server may see a card's pipeline; and "which cards have behaviour"
stays one auditable file instead of a field spread over 136 records. The
registry is constructor-injected into `TaskManager`, so tests pass their
own table. A card absent from the map simply has no ability.

## 2. AbilityContext — the memory of one ability run

Identity (`sourceCardId`, `ownerId`) is immutable; the rest is a blackboard of
`CTX_*` keys, and the only channel between steps of one entry. One fresh context
per ability run — nested runs and continuations do not inherit (§6).

Rules paid for in bugs:
- **No key without a reader.** A write-only or read-only key rots silently.
- **Choice slots (`CTX_CHOSEN_CARD`, `CTX_CHOSEN_PLAYER`, `CTX_FINAL_ROLL`) are
  written only by windows**, never by tasks — that's what makes them mean "what
  the player picked".
- **Every slot is a `string[]`**, length 1 for single picks, so multi-select
  needs no migration. `CTX_FINAL_ROLL` is the one scalar: a roll resolves to
  exactly one number.
- **A task that owns a slot writes it on every path.** `StealFromPartyTask` sets
  `CTX_STOLEN_HERO_ID` to `[]` before it can fail, so a later step can tell
  "the steal produced nothing" from "the steal never ran".
- **Absent means mis-declared; empty means it ran and produced nothing.**
  Readers throw on the first and skip on the second — that split is what lets a
  timed-out choice flow through without crashing a legal position.

## 3. Frames — snapshot and continuation in one

`rm.openFrame()` clones GameState. Windows settle uniformly:

```
good outcome → releaseFrame → paused pipeline resumes
bad outcome  → restoreFrame → snapshot rollback
always       → frameResolved(frameId, results, result?)
```

**Paused pipelines live on GameState, inside the snapshot.** So rollback *is*
cancellation: a failed roll or lost challenge discards the continuation
together with the state it would have mutated. No cancel flag exists anywhere.

**Rollback means an outcome FAILED**, never a player declining an offer. A
declined confirm releases its frame like any other outcome (§4).

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

`PlayMagicAction` takes the same shape: the point and the card leave the hand
before the snapshot, the instance pile is written inside the frame. What a
rollback cannot undo is the `MagicPlayed` it emitted, which is why that event
means "this play is being attempted" and the card's own steps hang off the
settled frame instead (§1).

**A pausing step RETURNS its frameId.** `ITask.execute` returns
`string | void`, and that return value is the only channel — the processor
marks the running pipeline as paused on whatever comes back. It throws if the
returned id is not an open frame.

**A step never decides anything about the steps AFTER it.** It may skip its own
body when its input is empty — `StealFromPartyTask` leaves `CTX_STOLEN_HERO_ID`
empty and returns, `ConfirmTask` skips a prompt whose subject is empty,
`RollOnHeroTask` skips an empty target — and the steps behind it read the same
empty slot and skip in turn. Silencing siblings is not a task's call.

**An empty choice settles on a 0ms timer, never inline.** Resolving inside the
window's constructor would settle the frame before the task that opened it
returned, so the processor would not have parked the remainder yet: the
`FrameResolved` would go out with nobody listening. One tick's delay puts the
case on the ordinary suspend → resolve → resume path, and a step can just
`return frameId`.

**A step's own emissions can re-enter the processor.** A condition announces
`ConditionMet` and the entry it unlocks is matched before the condition's
`execute` has returned. So the frame count around a step says nothing about what
that step did, and cannot be used to police it.

### The pipeline stack

Steps do not run in a `for` loop — a loop cannot pause half way through.
Ability work lives on `GameState.abilityPipelines`, a stack of
`{ steps, ctx, pausedOn? }`, and `TaskManager.drain()` works on the top
one. Same shape as `TurnManager.drain`: go until something opens a window,
stop, carry on when it resolves.

- **Matching adds pipelines; it does not execute them.** The entries matched
  for one event go on backwards, so the first one declared ends up on top and
  goes first.
- **A step's own events add pipelines above it.** Emission is synchronous, so
  those events reach `onEvent` while the step is still running. The drain they
  trigger returns at once — one drain loops at a time — and the loop already
  going reaches the new pipelines on its next turn. They therefore happen after
  the current step and before the rest of its pipeline. That delay is the whole
  mechanism, and `drain`'s flag is what TurnManager gets from splitting
  `enqueue` and `enqueueFirst`: every caller here arrives through `onEvent`
  instead, so nothing else can tell the two apart.
- **A paused pipeline stays on the stack, marked `pausedOn`.** The pipelines
  *underneath* are the ones that must wait; lifting the paused one off would
  let the next drain walk straight past them. Only that frame's `FrameResolved`
  clears the mark. Asking whether the frame is still open would NOT do: a
  window releases its frame BEFORE it announces the outcome (§4), so the stack
  would carry on before the answer arrived.
- **The stack is game state, so frames snapshot it.** A pipeline started inside
  a frame is undone by its rollback; one already going when the frame opened
  survives. A pausing pipeline is also cut out of that frame's own snapshot,
  or a rollback would bring the remainder of a failed pipeline back to life —
  undoing a frame IS cancelling what it waited for, the same two-place write
  `burnCard` makes. `FrameResolved` therefore drains even when nothing was
  paused on that frame: after a rollback the pipelines underneath came back
  with the snapshot and still have to finish.
- **Snapshots copy each pipeline**, because the live stack consumes `steps` and
  sets `pausedOn` as it goes. The `ctx` is shared, and is what identifies a
  pipeline.
- **The declaration's `steps` are copied when matched.** That list is built
  once at module load (§1); the drain consumes what it is handed.

## 4. Reaction windows

- Modifier/challenge windows accept many respondents and reset their timer per
  submission; choice windows have **one respondent, one submission**, resolve
  immediately, single timer, and **always release** — a choice has no failure
  branch.
- **A timeout resolves; it never rolls back.** A card or player choice that runs
  out defaults to NO pick, and still releases its frame. Restoring would rewind
  the step that opened the window — and since the window is not in the snapshot,
  that step would re-run, re-open it, and time out again: an AFK player would
  loop forever. `TaskChoiceWindow` defaults to DISMISS, which means "emit
  nothing" rather than "roll back".
- **Results are self-describing.** Each window declares its context slot *and*
  value shape via `resultKey()`: choices write arrays, the modifier writes a
  scalar `number`. The processor blindly does `ctx.set(result.key, result.value)`.
- `resultKey()` is **abstract** on the choice base; "deliberately no result" is
  the `NO_CONTEXT_RESULT` symbol, not `undefined` — silence can't be told apart
  from forgetting, a sentinel can be asserted in tests.
- **One lifecycle event pair for all windows** — `ReactionWindowOpened/Closed`
  with `windowType` in the payload — plus true domain events
  (`ModifierApplied`, `ChallengeStarted/Resolved`, `HeroStolen`,
  `TaskConfirmed`, `ConditionMet`).

**Modifiers are accepted by CAPABILITY, not by window class.**
`IModifiableWindow` adds one method — `acceptsModifierFor(playerId)` — and both
the roll window and the challenge window implement it, each with its own rule:
a plain roll has one roll so only the roller qualifies, a challenge has two so
either participant does (and neither before a challenge has actually started).
`PlayModifierReaction` probes for the method rather than testing `instanceof`,
so it names no concrete window (§9).

The reaction asks **before** it burns the card, because `execute` spends the
card before it submits — a target only the window would refuse has to be caught
while the card is still in hand.

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
client.

**Visibility is not the engine's concern.** Events state the full truth
(options include opponents' card ids). A projection layer in front of the API
decides what each client sees — it must filter **event payloads**, not just
state snapshots, or the same information leaks by another route.

## 6. Abilities: entry lists, event hand-offs

### Two sources, one match loop

Per event the processor collects every ability to check, then matches each
against the event:

- **Cards in play — DERIVED.** A card's ability is live because the card sits in
  a party (leader, monsters, heroes, equipped items, instance cards). The scan
  reads it fresh each event and looks the behaviour up in the registry. Nothing
  is stored, so nothing can go stale: a stolen hero's ability belongs to its new
  owner with zero bookkeeping. This is principle 3 — derive rather than pass.
- **Ongoing effects — STORED**, on the owning `Player`. "Your heroes cannot be
  stolen until your next turn" has no card position to derive from, so it lives
  on the player until an expiry event removes it (§7).

`abilitySources()` gathers both into one list per event, retained afterwards by
nothing. **Per event: sweep → resume → match.**

### Trigger: whose event, and which

```
SelfCard    payload.cardId is this card   — a hero's own successful roll
OwnerEvent  the event is my owner's       — "each time YOU roll to CHALLENGE"
OwnerTurn   only during my owner's turn
Anyone      any player's event            — the -1 modifier card
```

`SelfCard` is load-bearing: Wiggles and Snowball both trigger on `RollSuccess`
and can sit in the same party, so rolling on one must not fire the other.

`when` is one string, matched against the payload's `label`. Scope answers
*whose* event; `when` answers *which*. Deliberately narrow — it discriminates
`TaskConfirmed` / `ConditionMet` variants and nothing else (§8).

### An ability that pauses is SPLIT, not parked

A card holds a **list** of entries: one per stretch of steps that runs without
pausing. A step that asks a question is the LAST step of its entry, and what
follows is a separate entry triggered by the answer's event.

Two hand-offs, one shape:

| step | emits on success | emits on failure |
|---|---|---|
| `ConfirmTask` | `TaskConfirmed { label }` on CONFIRM | nothing on DISMISS/timeout |
| `CardTypeCondition` | `ConditionMet { label }` when it holds | nothing |

"No" is the **absence** of an event, so nothing has to be cancelled and nothing
rolls back.

**Snowball (hero-040)** — the reference. *"DRAW a card. If it is a Magic card,
you may play it immediately and DRAW a second card."*

```ts
[0] { on: RollSuccess,   scope: SelfCard }
      [Draw(1), CardTypeCondition(Magic, CTX_DRAWN_CARD_IDS, DREW_A_MAGIC)]
[1] { on: ConditionMet,  scope: SelfCard, when: DREW_A_MAGIC }
      [Confirm({ confirms: PLAY_AND_DRAW, subjectKey: CTX_DRAWN_CARD_IDS })]
[2] { on: TaskConfirmed, scope: SelfCard, when: PLAY_AND_DRAW }
      [PlayMagic(CTX_DRAWN_CARD_IDS), Draw(1)]
```

One question gates BOTH halves of the reward, because the card offers them
together — that is the entry layout doing the work, not a mechanism (see "the
declaration draws the scope of 'no'" below). The play runs inline as a step, so
it happens before the second draw, in printed order.

**Wiggles (hero-036)** — split at the question only:

```ts
[0] { on: RollSuccess,   scope: SelfCard }                     [ChooseCard, StealFromParty, Confirm({ confirms: CONFIRMS_ROLL, subjectKey: CTX_STOLEN_HERO_ID })]
[1] { on: TaskConfirmed, scope: SelfCard, when: CONFIRMS_ROLL } [RollOnHero(CTX_STOLEN_HERO_ID)]
```

**Critical Boost (magic-053 / magic-054)** — the reference *magic* card.
*"DRAW 3 cards and DISCARD a card."*

```ts
[0] { on: MagicPlayed, scope: SelfCard }
      [Draw(3), ChooseCard({ zone: Hand, owner: Self }), Discard()]
```

ONE entry, though it pauses in the middle. A choice window suspends the
pipeline **in place** and `FrameResolved` wakes it with `CTX_CHOSEN_CARD`
filled, so the discard is a later STEP of the same pipeline. A continuation
entry would match too — the card holds its instance-pile position until
`DisposeMagicTask` runs (§1) — this wording just does not need one. Two printed
copies are two ids sharing one declaration.

It also shows the two things every magic card declares: the trigger is
`FrameResolved` scoped to `SelfCard`, and the last step is `DisposeMagicTask`.

Three things fall out of this shape:

- **The declaration draws the scope of "no".** The answer gates exactly what the
  entry contains, so "skip just this" and "cancel the rest" become a registry
  layout, not a mechanism the engine has to grow.
- **Repetition unrolls.** "You may do this up to three times" is three entries
  with three labels. No loop construct, no counter to keep in sync, nothing on
  GameState to snapshot — the sequence is static data, the label rides the event.
- **A continuation runs with a FRESH context**, so what it needs travels on the
  event as `ctxSeed`. A confirm carries the slot its `subjectKey` names; a
  condition carries the slot it tested. Snowball's drawn card reaches entry [2]
  across two hops that way. Carry exactly what is named, never the whole
  blackboard: the gap between entries is unbounded (a player may sit on a prompt
  for the full timeout) and the event is the record.

**A confirm must be the last step of its entry — by discipline, not by check.**
Anything after it would run on "no" as well as "yes", because the window
releases either way.

**A task names WHAT it needs, never where to find it.** `CardTypeCondition`,
`StealFromPartyTask` and `RollOnHeroTask` all take their context slot as a
constructor argument. The declaring card decides which slot; the task decides
what to do with it.

**`Player.clone()` must copy the effects list and the spent action points**, or
frame rollback silently stops covering them — a clone that skipped AP handed the
player back a full turn's budget on every rollback. Specs pin both.

## 7. Ability lifetime is the EFFECT's, not the trigger's

`trigger` says when a pipeline *starts*. It cannot say how long what the
pipeline installed should *last* — "your heroes cannot be stolen until your next
turn" is one ability run that finishes immediately and leaves something behind.
So the lifetime belongs to an `ActiveEffect`, not to the entry.

**Trigger and expiry are symmetric: both are game events.** An effect turns on
when its installing ability runs, and off when one of its expiry events fires —
optionally confirmed by `shouldExpire`, a state check that runs only then. The
event says WHEN to look; the check says WHETHER it is really over. **No expiry
at all means permanent** — monster passives are the canonical case (`Party` has
no `removeMonster`).

**Wise Shield (hero-028)** — the reference effect. *"+3 to all of your rolls
until the end of your turn."*

```ts
[0] { on: RollSuccess, scope: SelfCard }
    [ApplyEffectTask({ passive: { type: RollBonus, value: 3 }, expiry: untilEndOfTurn })]
```

One entry, because nothing pauses. The effect installs *after* the roll that
earned it, so it never boosts its own activation; `ModifierWindow` and
`ChallengeWindow` read it on every later roll; `TurnEnded` sweeps it.

- **Effects are plain data**, stored on the owning `Player`, so they snapshot and
  roll back with a frame for free.
- **`shouldExpire` exists because an event alone cannot decide.** Losing one of
  two Rangers fires `HeroRemovedFromParty`, but "while you have a Ranger" still
  holds. The check lives next to the declaration that installs the effect —
  never as a method on a card class.
- **Every expiry lives in `effects.ts`** — `untilEndOfTurn`,
  `untilOwnersNextTurn`, `untilSourceLeavesParty`, `whileClassInParty(cls)` — so
  all card wordings read in one place.
- **The sweep runs before trigger matching**, so an effect ending at the start of
  your turn is already gone for anything that same `TurnStarted` fires.
- **TaskManager owns expiry, not TurnManager** — expiry events are
  arbitrary (a steal, a removal, a turn boundary); the processor is the one
  place that already sees every event.
- **Multi-entry expiry = first match wins.** The once-per-turn shape: a charge
  expires on use OR at the owner's next `TurnStarted`.
- **A live effect with `trigger` + `steps` IS a temporary passive ability** — the
  processor lists it among its sources for exactly as long as it lives.
- **A passive flag is only real if a rule reads it.** `CantBeStolen` is checked
  in `StealFromPartyTask` at the mutation, not merely when a choice window built
  its options — the protection may have been installed in between.
- **A passive with a magnitude is read as ENTRIES, not a total.**
  `getEffectsWithPassive(type, playerId)` returns the effects; callers sum them.
  A number would be the smaller API and the wrong one: the roll UI has to show
  "+3 Wise Shield, +5 Fireball", and a sum cannot be taken apart again.
- **Numeric passives STACK, each keeping its own source.** Two RollBonus effects
  are +3 and +5, not "the highest wins". `ModifierWindow` keeps ONE `bonuses`
  list of `{ cardSource, amount }` — standing effects seeded when the window
  opens, played modifier cards appended as they arrive.
- **Standing bonuses are seeded at window OPEN, not at settlement.** A player
  deciding whether to spend a modifier card must already see the +3 counted, so
  it rides in the `ReactionWindowOpened` payload — as a **copy** of the list, or
  an emitted event would change when a later modifier is played.
- **Card ids are PER COPY, not per design.** `base-game-cards.ts` holds 136
  records for 136 physical cards — 25 distinct ids all named "Modifier". A card
  id already identifies one physical card, which is why `GameState.cards` can be
  a `Map<string, ICard>`, why `removeFromHand` can filter by id, and why
  `cardSource` alone tells two contributions apart. No instance-id layer needed.

### Party membership and challenged plays

- **Party membership cannot change silently.** `Party.addHero` / `removeHero`
  *require* an emitter and a reason, so they always announce the canonical
  `HeroAddedToParty` / `HeroRemovedFromParty { cardId, playerId, reason }`
  alongside whatever specific event the caller emits. Expiries subscribe to the
  canonical pair, so a new mechanic is one new `reason`. Making the emitter a
  parameter turns this from a convention into a compile error.
- **A steal is remove-then-add**, so both halves are announced.
- **A defeated play is DISCARDED at settlement, not restored.** The card was
  taken out of hand *before* the snapshot, so rollback alone leaves it in no zone
  at all. `ChallengeWindow` adds it to the discard on the challenger-wins branch,
  **after** the restore (which swaps in the snapshot's pile), with no
  `CardDiscarded` event — `ChallengeResolved` already reported the defeat. Cards
  *spent* during the window need nothing: `burnCard` already wrote them into the
  snapshot's pile.
- **A card that SURVIVES a challenge is marked**, so it cannot be challenged
  twice in a turn; `TurnManager.startTurn` clears the list alongside the ability
  slots. Only the winning branch marks: a card whose challenge succeeded is in
  the discard anyway.

## 8. Known limitations (deliberate, documented)

- **No failure branches.** `restoreFrame` couples "undo state" with "cancel
  the run", so "roll; if you fail, discard instead" is currently impossible.
- **`when` discriminates confirm/condition labels only.** A wording like "when a
  hero enters your party BY BEING STOLEN" has no matcher, even though `reason`
  is already in that payload.
- **No else-branch on a condition.** `ConditionMet` fires only when the test
  holds; "if Magic do A, otherwise B" needs two conditions with opposite labels.
- **A COST can be dodged by not answering.** A timeout defaults to NO pick
  (§4), which is right for an offer and wrong for a price: Critical Boost's
  "DISCARD a card" simply does not happen if the player sits on the prompt, and
  a sacrifice would go the same way. Nothing distinguishes a choice the player
  is being *offered* from one they *owe*, so the engine cannot tell which
  default is correct.

  Likely fix, when a card needs it: `ChoiceWindow.defaultChoice()` is already
  the seam — `TaskChoiceWindow` overrides it to DISMISS — so a window opened
  for a cost overrides it to pick a random option instead, and the filtered
  option list it already holds is the pool to draw from. Marking WHICH choices
  are costs is the actual design work; the default itself is one override. No
  new mechanism, and no change to the timeout rule.

- **A lost challenge cancels whatever played the card.** `PlayMagicTask`
  suspends its own entry on the challenge, so a defeat rolls back the steps
  behind the play too — Snowball's second draw goes with it. That follows the
  frame rule (a lost challenge un-grants a hero's roll the same way), but it is
  a rule about *where the snapshot was taken*, not a judgement about the
  wording. A card that should keep its tail would need the play to be the last
  step of its entry.
- **Nothing stops two challenges nesting.** A magic card played by an ability
  opens a challenge from inside a pipeline. Every ability that plays one has
  settled its own window first, so the case does not arise; nothing enforces it.
- **A magic card with no registry entry is stranded in the instance pile.**
  `DisposeMagicTask` is the only thing that moves a played card on, and it is a
  declared step, so a card with no entry — or one whose author forgot the step —
  never reaches the discard. Nothing catches it: the engine cannot tell a card
  that is mid-run from one that will never run. Every magic card therefore needs
  an entry, even if its only step is the disposal. Pinned by a test in
  `tasks/action-tasks.spec.ts`.
- **A magic card that pauses must dispose on every branch.** `DisposeMagicTask`
  goes after the `ConfirmTask` rather than in the continuation entry, so the
  DISMISS branch puts the card away too. That works because `TaskConfirmed` is
  emitted before `FrameResolved`, so the continuation still matches from the
  instance pile — the one exception to "a confirm must be the last step of its
  entry" (§6).
- **`CantChallenge` / `CantBeChallenged` have no readers.** Declared, installable
  and inert until a card needs them.
- **No unequip event.** An equipped item's ability is derived from its carrier
  sitting in the party, so it ends when the hero leaves; an *effect* an item
  granted would need its own expiry.
- **`CantBeStolen` guards the steal but does not filter choices** — a protected
  hero can still be *offered* by a `ChooseCardTask`; the steal then no-ops.
- **`interfaces.ts` ↔ `game-state.ts` remains a type-only cycle.** Genuinely
  mutual; both edges are `import type`, so nothing exists at runtime.

## 9. Dependency direction

`interfaces.ts` is the abstraction layer, so **it must not import an
implementation**. It declares `IReactionManager` (`openFrame`, `openWindow`) and
`IActionQueue` (`enqueueFirst`); `ReactionManager` and `TurnManager` implement
them. Tasks, actions and the processor take the interface.

One `import type { ReactionManager }` in `interfaces.ts` used to be the edge
every reported import cycle ran through — 53 traversals collapsed to zero when it
was removed. They were all type-only, so nothing was broken at runtime, which is
exactly the hazard: the protection was accidental, and one `instanceof GameState`
inside a window would have turned a harmless type edge into a real bug.

Worth adding as a guard: eslint `@typescript-eslint/consistent-type-imports`.

## 10. Repo gaps blocking play

- **No bootstrap**: nothing turns `GameConfig` + `base-game-cards.ts` (136
  cards) into a playable GameState — no deck build/shuffle/deal.
  `defaultGameConfig` has zero consumers.
- **Four cards declare an ability** — `hero-028` (Wise Shield), `hero-036`
  (Wiggles), `hero-040` (Snowball) and Critical Boost, whose two printed
  copies are two ids (`magic-053`, `magic-054`) sharing one declaration.
  Critical Boost is the reference MAGIC card: one entry that pauses on a choice
  and finishes as a later step of the same run.
- **Add `tsc --noEmit` to CI** — ts-jest runs diagnostics off; type breakage
  passes the suite silently.
- **`npm ci` is incomplete in some checkouts** — `@nestjs/testing` and eslint's
  deps are declared but unresolvable. Unrelated to engine code.

## 11. Working principles

1. Delete anything with no readers — unreferenced scaffolding gets designed
   around later.
2. Fail loudly at the point of the mistake.
3. Derive rather than pass — don't thread values the receiver can compute.
4. "Deliberately none" is a value (`NO_CONTEXT_RESULT`), not an absence.
5. Data over closures.
6. One mechanism, not two — cancellation *is* rollback; all windows settle the
   same way; confirms and conditions hand off the same way.
7. A step decides about itself, never about its siblings.
