# Engine architecture — core ideas

Read before touching `server/src/game/**`. This records the *why* behind the
shapes in the code. Branch: `HTSR-3-Game-engine`. Suite:
`npm test --workspace=server`.

**Reference implementations.** `hero-040` (Snowball) and `hero-028` (Wise
Shield) are the most complete cycles in the engine. Snowball exercises the full
ability pipeline — draw, condition, confirm, continuation — across three
registry entries, and plays the card it drew. Wise Shield exercises the full
effect lifecycle — install, read, expire — plus the whole path around it (play,
challenge, roll offer, modifier window). `magic-053` (Critical Boost)
is the reference for a MAGIC card: one entry that pauses on a choice and
finishes as a later step of itself. Read `snowball-ability.ts`,
`wise-shield-ability.ts` and `critical-boost-ability.ts` in
`repositories/ability-repository/` with their specs before adding a card.

## 0. Folder layout

Two files sit at the root of `server/src/game/`: `game-engine.ts`, which wires
the pipelines together, and `interfaces.ts`, the contract layer everything else
depends on (§9). Everything else lives in a folder:

- `pipelines/` — the drivers and the board they drive. `turn-manager.ts` and
  `task-manager.ts` are the two pipelines of §1, `reaction-manager.ts` owns
  frames and windows (§4), and `game-state.ts` is what all three read, snapshot
  and roll back.
- `abilities/` — the machinery a card's behaviour is written against:
  `ability-context.ts` (§3), `ability-lifecycle.ts` — when an event starts a
  rule and when one ends an effect, together because they are one question
  asked twice (§7) — and `expiries.ts`, the lifetimes card wordings are written
  in. Not the behaviour itself.
- `repositories/ability-repository/` — the behaviour: one file per card's
  `IAbility[]`, plus `hero-rules.ts` (the entries every hero has, keyed to no
  card at all) and `index.ts`, the `abilityRegistry` that keys the rest by card
  id (§6). A mechanic shared by both pipelines gets a file of its own in
  `tasks/` — `play-hero-task.ts`, `roll-on-hero-task.ts` — while `hero-tasks.ts`
  keeps the steps that only ever move a hero already on the table. Card *data* lives in `shared/`; this is the lookup from one to the
  other, which is why it sits beside `in-memory-card-repository.ts`.
- `state-structures/` — what `GameState` is made of: `card-pile.ts`,
  `card-stack.ts`, `player.ts`, `party.ts`.
- `actions/`, `tasks/`, `reactions/`, `cards/`, `conditions/`, `events/`,
  `config/` — one folder per kind of thing.

Specs sit beside their subject.

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

**The action queue holds player requests and nothing else.** Everything in it
arrived from the API. Work the engine starts for itself is a TASK, so there is
no way to put an action at the front of the queue and no `IActionQueue` for an
action to depend on — `TurnManager` exposes `enqueue` and `resumeDrain`, and
that is the whole surface.

That is why **playing a hero does not grant itself a roll**. The offer belongs
to the HERO: every hero in a party carries two engine entries (`hero-rules.ts`,
§6) that ask "do you want to roll?" when a challenge on it settles, and run
`RollOnHeroTask` if the answer is yes. `PlayHeroAction` and `PlayHeroTask`
therefore describe only the play, and both get the roll without either knowing
the roll exists.

What that offer leads to is a task with no price at all, rather than an action
at a second price, so `RollOnHeroAction` is one class at one cost — no `isFree`
branch and no cost constructor argument.

**The two pipelines never call each other, but the TURN belongs to both.** A
player is not finished while an ability they set off is still resolving, so
`TurnManager.drain` stops — and declines to end the turn — whenever
`GameState.abilityPipelines` is non-empty, exactly as it does for an open
frame. It READS the task stack off GameState rather than holding a
`TaskManager`, so the dependency stays out (§9) and the rule needs no
cooperation from the other side.

The stack is the right thing to ask, not the frames. `TaskManager` empties it as
it goes, so outside its own drain a non-empty stack means something is parked —
including the gap between a window releasing its frame and the `FrameResolved`
that wakes the pipeline, where no frame is open and the work is not done.

**A mechanic both pipelines need is a BASE CLASS, not a duplicate.** Playing a
magic card is the same sequence whether a player requested it or an ability
did, so it lives once in a base class and both wrappers extend it. The base and
the task sit together in `tasks/magic-tasks.ts` — steps that do what a player
action does, for an ability that does it unasked — and the matching `IAction`
stays in `actions/`, extending the base across the folder line. `hero-tasks.ts`
and `item-tasks.ts` are the same shelf for their card types. The base is the more basic thing — the mechanic with no
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

**The instance pile is a ZONE, not a waiting room.** A played card sits there
precisely so it is not in the discard while it resolves: a magic card that
picks a card from the discard must not be able to pick itself, and the pile is
what makes that true of the BOARD rather than of a filter at the choice. So the
card cannot be discarded early, and it must not be left there either.

**The card leaves that pile when its RUN ends, and the engine works out when
that is.** `TaskManager` emits `AbilityDone { cardId }` as a pipeline leaves
the stack — but only when no other pipeline is still sourced to that card, so
it means "this card's rules are finished", not "a step ran". `instance-rules.ts`
is one rule hung off it: instance pile → discard, silent, since `MagicPlayed`
already told the table the card was spent.

Disposal is a property of the ZONE, so it is declared once for the zone rather
than by each card that enters it. A card wording says what the card does; where
the card goes when it has finished doing it is not a wording. Making it a step
would put two pieces of engine knowledge in the author's hands — that a card
which pauses must dispose *before* the branch it might not take, and the order
`TaskConfirmed` and `FrameResolved` are emitted in — and get either wrong and
the card either vanishes mid-run or never leaves the pile. Nothing sweeps
the pile, so a card that omits the step stays in it (§8).

**A card SPENT into a window enters the same zone by a different door, and
leaves by a different one.** `spendCard` takes it out of hand and puts it in its
owner's instance pile, where it is a card in play: the table can see what is
riding on the roll, and `abilitySources` finds its entry there, which is the
whole reason a modifier card can have one.

**Nothing records that it was spent — the POSITION is the record** (principle
3). `spendCard` moves the card and stops there. Settlement asks `spentInto`,
which compares the live instance zone with the frame's own snapshot: a card in
a pile it was not in when the frame opened went in during this frame.

One exception carries the whole distinction. A frame is ABOUT the card its
challenge window contests — `subjectCardId()`, the same id `FrameResolved`
carries — and that card is put away by whatever played it (its own run on the
way through, or `ChallengeWindow` on a defeat). Everything ELSE that entered
the zone was thrown INTO the contest, and is spent. Without that line a played
magic card would be discarded by its own challenge before its ability ran.

Both settlement paths then act on the same derivation: release takes the cards
out of the instance pile, restore takes them out of the hands the snapshot
handed them back to. `restoreFrame` must derive BEFORE `copyFrom` — restoring
is what erases the evidence — and that ordering is the one fragile thing about
deriving rather than storing. Both halves are pinned by tests.

`DisposeInstanceCardTask` asks `isSpentInOpenFrame` first — the same derivation
— and leaves such a card alone: a modifier's entry finishes the moment its
bonus lands, which is not the moment its time on the table is over. Same zone,
one disposer per door: a played card is put away by the pipeline that ran it, a
spent one by the frame it was spent into.

**A window must not lapse while a card committed to it is still resolving.**
The bonus used to arrive inside `submitReaction`, which reset the timer; it now
arrives a choice or two later, so the reaction calls `cardSpent()` at the burn.
The nested choice is given a SHORTER timeout than the roll it is about, or both
would fall due on the same tick and the roll — whose timer was reset first —
would settle without the bonus.

The base implements **neither** `IAction` nor `ITask`. Their `execute`
signatures are override-compatible in TypeScript (`execute(gs)` is a legal
override of `execute(gs, ctx, em, rm)`), so a single class satisfying both would
type-check while letting `TaskManager` run an action — silently playing its
constructor-bound card and ignoring the context.

**Playing an ITEM takes the same shape as playing a magic card.** `playItem`
(`tasks/item-tasks.ts`) takes the card out of hand, opens a frame, writes the
equip and announces `ItemEquippedToHero`, then opens the challenge window. The
item's own entry triggers on the settled frame, so a defeated item never
installs anything — it is un-equipped by the rollback and is no longer a source
to match against.

**Equipment is PARTY state, and that is what makes the rollback work.**
`GameState.clone()` shares the card map by reference, so anything stored on a
`HeroCard` or `ItemCard` survives a `restoreFrame` — gear kept there would leave
a defeated item both worn and in the discard. `PartyData.equipment` maps hero id
to item id, `Party.clone()` copies it, and the snapshot covers it like any other
party state.

**Gear moves through the same choke point as membership.** `removeHero`
RETURNS what the hero was carrying and `addHero` accepts it, so every removal
site has to say where the gear goes — a steal carries it to the new party, a
destroy sends it to the discard with its owner. `unequipItem` returns it the
same way, for a hero who stays. A return value rather than a silent delete, for
the reason the emitter is a parameter (§7): it makes the decision a compile-time
obligation instead of something a new removal path can forget.

**A hero carries ONE item, and a second does not replace it.** `canEquip`
refuses an occupied hero, so the action's `canExecute` says no and the task
skips. `playItem` THROWS if it is reached anyway: both wrappers are contracted
to ask first, so arriving with gear already on the hero is an engine mistake
rather than an illegal request, and it fails where the mistake was made (§11.2).

**Who may wear an item is the CURSED flag's question.** A cursed item is played
at somebody, so any hero on the table is a legal target; a plain one only ever
goes on its owner's. `PlayItem.canEquip` holds that rule and the one-item rule
together — the action calls it from `canExecute`, the task when it discovers
its target.

**Playing a HERO is the same shape a third time.** `playHero`
(`tasks/hero-tasks.ts`) takes the card out of hand, opens a frame, adds it to
the party and opens the challenge window. `addHero` announces the arrival
itself, so there is no separate "hero played" event to emit — party membership
cannot change silently (§7), and that one canonical event is the attempt.

**Rolling on a hero is the fourth pair, and the one with no card to move.**
`rollOnHero` throws the dice, announces `DiceRolled`, marks the hero's ability
slot spent and opens the modifier window. `markAbilityUsed` runs BEFORE the
frame opens, so a failed roll still costs the slot; everything else the roll
does is inside the frame and goes back with it.

Four mechanics, four bases, two wrappers each. A wrapper is always pure
addition — the action adds a price, `canExecute` guards and a queue identity;
the task adds a context slot read at runtime.

**A leader is never PLAYED, so there is no fifth mechanic.** `PartyData.leaderId`
is set when the party is built and never changes: a party and its leader come
into existence together, out of the game's configuration, before any turn
exists. There is nothing to take out of a hand, nothing to contest, nothing to
roll back and nothing to announce — party membership has a choke point because
membership CHANGES, and this does not.

**Activating a leader is a fifth pair with only one half.**
`RollOnLeaderAction` is the ONLY way a leader's printed ability ever runs: no
system rule reaches a leader, which is the point — a leader is never played,
never rolled on by another card and never moves, so without a player asking,
nothing would. It has the same shape as `RollOnHeroAction` with the dice taken
out: price, guards, `markAbilityUsed`, announce. `RollSuccess` naming the
leader is a plain "this fired" — there is no requirement to beat and no
modifier window — and because it is the same event a hero's roll emits, the
registry needs no leader-shaped special case. No task twin, deliberately: a
second caller could only be a system rule.

**A leader needs no registration step.** `abilitySources` reads the slot fresh
on every event, exactly as it reads heroes and equipped items, so standing
there is the whole of what makes a leader's printed ability live (§6). Nothing
is stored, so nothing can go stale, and nothing ever sweeps a leader out.

**A leader is NOT a hero, and the two are not made to share a class.** Every
question about what may be stolen, destroyed, offered by a choice, geared up or
rolled on is answered by POSITION — `Party.heroIds` — and a leader stands
somewhere else, so all of them pass it by for free. Giving `PartyLeaderCard` a
`HeroCard` shape to reach the roll route would have bought one activated
ability and made a leader answer yes to `instanceof HeroCard` at five sites
that mean "a hero in a party".

**Behaviour is bound by card id, not carried on card data.** `abilityRegistry`
(`game/repositories/ability-repository/index.ts`) maps card id → `IAbility[]`; card data in `shared/`
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
window; the hero joins the party inside the frame. So a lost challenge un-plays
the hero while the card stays out of the hand — a challenged card is spent
either way, and that fact is expressed purely by where the snapshot was taken,
with no "already paid" flag anywhere. The roll offer needs no undoing: it is
matched from the hero's position in the party, and a defeated hero is not there
to be matched. `PlayChallengeReaction` gets the same result for the challenger's own
card through `spendCard`, which moves it out of the hand and into the instance
zone, where a rollback cannot hand it back.

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
  mechanism, and `drain`'s flag is the only thing that tells a fresh start from
  a re-entry: every caller arrives through `onEvent`, so nothing else can.
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
  undoing a frame IS cancelling what it waited for. `FrameResolved` therefore
  drains even when nothing was
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
- **A timeout resolves; it never rolls back.** A choice that runs out still
  releases its frame. Restoring would rewind the step that opened the window —
  and since the window is not in the snapshot, that step would re-run, re-open
  it, and time out again: an AFK player would loop forever.
- **What a silent player picked is the subclass's call.** `defaultChoice()` is
  the seam. The base answers NOTHING; `TaskChoiceWindow` answers DISMISS ("emit
  nothing", not "roll back"); `CardChoiceWindow` answers a RANDOM one of its
  own options, so a card that asks for a card cannot be dodged by waiting (§8).
  With no options there is no pick on any of them — that is "ran and produced
  nothing", and the steps behind it skip.
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

**A VALUE choice does not default at random.** `CardChoiceWindow` picks one of
its own options because a card has no direction; a number does. `ValueBias` is
`highest` or `lowest`, and the window BEING MODIFIED decides which — a plain
roll asks whether you were helping yourself (`highest` on your own roll,
`lowest` on somebody else's), a challenge asks which side you pushed (`lowest`
aimed at the defender, `highest` aimed at the challenger, so silence tips a
contest toward the play being defeated). `ChooseValueTask` reads it at open
time and hands it to the window, because the roll it describes may have settled
by the time the choice resolves.

**Modifiers are accepted by CAPABILITY, not by window class.**
`IModifiableWindow` adds three methods, each with its own rule per window:
`cardSpent()` keeps the window alive while a card committed to it works out
what it is worth, `valueBiasFor(playerId, targetPlayerId)` says which way an
unanswered value choice falls, and `acceptsModifierFor(playerId)` says whether
a bonus belongs here at all. Both the roll window and the challenge window
implement all three:
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
- **Hero rules — UNIVERSAL.** `hero-rules.ts` holds the entries EVERY hero
  carries, sourced to each hero in a party as if printed on it. "A hero you just
  played may roll to use its effect" is a rule of the game, not one card's
  behaviour, so it cannot live in a table keyed by card id — it belongs to all
  136. Sourcing it to the hero is what makes it need no new machinery: scope,
  context identity and rollback all resolve exactly as a printed ability's do.

`abilitySources()` gathers all three into one list per event, retained
afterwards by nothing. **Per event: sweep → resume → match.**

It also records which table each one came from, because `AbilityDone` reports
what a CARD did and must ignore the engine's housekeeping on both sides: a
system rule neither announces a card finished nor delays the announcement. Suppress
only one of the two and it breaks in opposite directions — a duplicate in the
player's log, or a card whose last live pipeline is a system rule and is never
reported finished at all.

**The roll offer** is the reference for that third kind, and reads like any
split ability:

```ts
[0] { on: FrameResolved, scope: SelfCard }
      [Confirm({ confirms: OFFERS_ROLL })]
[1] { on: TaskConfirmed, scope: SelfCard, when: OFFERS_ROLL }
      [RollOnHero()]
```

`FrameResolved` names a `cardId` only when a CHALLENGE settled on that card, and
the only challenges opened on a hero are the two halves of `PlayHero` — so
entry [0] fires on exactly the plays it should and on nothing else. A hero that
LOST its challenge was rolled back out of the party before the event went out,
so it is not among the sources and is never offered anything: the card's
position is the whole record of the outcome, as in §1.

Both tasks take their target from `ctx.sourceCardId` rather than a slot, which
is what "a task names WHAT it needs" looks like when the answer is "the card
whose entry I am".

Its label must not collide with a card's. Wiggles asks its own "may I roll?"
question about a hero it stole, under `RollOnHero`; the universal offer uses
`RollOnPlayedHero`. Sharing the string would make Wiggles roll on itself the
moment it confirmed a roll on its steal — pinned by a test.

### Trigger: whose event, and which

```
SelfCard     payload.cardId is this card   — a hero's own successful roll
CarrierCard  payload.cardId is the hero I am equipped to — a cursed item
OwnerEvent   the event is my owner's       — "each time YOU roll to CHALLENGE"
OwnerTurn    only during my owner's turn
Anyone       any player's event            — the -1 modifier card
```

`CarrierCard` exists because an equipped item's events are about its HERO, not
about the item: `RollSuccess` names the hero, so `SelfCard` never matches an
item and `OwnerEvent` would fire on rolls the item has nothing to do with. It
derives the link from `gs.getEquippedItem`, so nothing is stored.

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
entry would match too — the card holds its instance-pile position until its
whole run ends (§1) — this wording just does not need one. Two printed copies
are two ids sharing one declaration.

It also shows the one thing every magic card declares, and the one it does not:
the trigger is `FrameResolved` scoped to `SelfCard`, and **nothing says where
the card goes afterwards**.

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
So the lifetime belongs to an `IEffect`, not to the entry.

**An ability is the one-time run; an `IEffect` is a standing RULE with a
lifetime.** That split is the whole of it — an effect carries no behaviour of
its own, so there is nothing to run and nothing to trigger. `TaskManager` scans
cards for abilities and sweeps effects for expiry, and the two never meet.

**ALWAYS-ON is not the same as INERT, and only the second is an effect.** The
question is not whether a card is passive; it is whether something READS a
value or something RUNS steps.

An effect is a fact and a reader. Every effect in the engine is a `RollBonus`
or a `CantBeStolen`, consulted at exactly four places — the three roll sites
and `StealFromPartyTask`. It exists so a value can be found at a moment when no
ability is running: `ModifierWindow` seeds bonuses as it opens, and there is no
pipeline around to ask.

A permanently live TRIGGER is not that, and needs no effect to stay live: entries
are re-derived from the card's position on every event (§6), so a card that sits
in a party has its rules for the whole game. Suspiciously Shiny Coin
(`item-073`) is the reference — always on, never activated, and no effect at
all, because what it does is choose a card and discard it.

**The Protecting Horn (`leader-121`) is the same shape, and is deliberately NOT
an effect** even though it reads as a passive:

- It has to ASK. "+1 or -1" is the player's choice, so it opens a
  `ValueChoiceWindow` and pauses. An effect has no behaviour and cannot pause.
- `RollBonus` is the wrong fact. It is seeded at window open and applies to its
  owner's roll; the Horn's number lands on *that* roll — whichever the modifier
  was played on, which may be an opponent's.
- Making it one would mean a new `PassiveType`, a new reader inside
  `applyModifier`, and a FIXED value — which the printed card does not have.

It never needs to exist between runs, either: the modifier being played is what
wakes it, so an ability is running at the exact moment the number matters. The
three roll-bonus leaders are the opposite case and are effects for exactly that
reason — their number must already be there before a window opens.

**Trigger and expiry are symmetric: both are game events**, so they sit in one
file. `abilities/ability-lifecycle.ts` holds `triggerMatches` — when an event
STARTS a rule — beside `isEffectExpired` and the `sweepExpired` that applies
it. `TaskManager` calls the second before the first (§7 sweep order); it owns
the STACK, not the question of what an event means. An effect turns on
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
- **Every expiry lives in `abilities/expiries.ts`**, which holds only the
  vocabulary a declaration imports — `untilEndOfTurn`,
  `untilOwnersNextTurn`, `untilSourceLeavesParty`, `whileEquipped`,
  `whileClassInParty(cls)` — so all card wordings read in one place.
- **An item's ABILITY ends with its position for free; an effect it installed
  does not.** The ability is derived from the item sitting on a hero, so it
  stops being scanned the moment that stops being true. Anything the item put on
  the player is stored, and needs `whileEquipped` to go with it — Really Big
  Ring is the reference.
- **One wording, every way it can end.** `whileEquipped` is TWO entries —
  `HeroRemovedFromParty` and `ItemUnequipped` — sharing one check: is the source
  item still on anybody? Asked of the item rather than of the event's subject,
  because both callers drop the gear before they announce, so the departing
  hero's own equipment is already gone by the time the sweep runs.
- **The sweep runs before trigger matching**, so an effect ending at the start of
  your turn is already gone for anything that same `TurnStarted` fires. It is a
  function `TaskManager` calls rather than a listener of its own, precisely so
  that ordering is written down in `onEvent` instead of resting on the order
  listeners happened to be registered in.
- **TaskManager drives expiry, not TurnManager** — expiry events are
  arbitrary (a steal, a removal, a turn boundary); the processor is the one
  place that already sees every event.
- **Multi-entry expiry = first match wins.** The once-per-turn shape: a charge
  expires on use OR at the owner's next `TurnStarted`.
- **A passive flag is only real if a rule reads it.** `CantBeStolen` is checked
  in `StealFromPartyTask` at the mutation, not merely when a choice window built
  its options — the protection may have been installed in between.
- **An effect can be SCOPED to one card.** `cardId` narrows it to rolls
  about that card; absent, it applies to everything its owner rolls.
  `getEffects(type, playerId, cardId?, rollContext?)` does the filtering, so
  asking about no card — a challenge roll is not a roll on a hero — leaves the
  scoped ones out rather than letting them in. `ApplyEffectTask`'s
  `scopedToCarrier` fills it at install time, because a declaration built at
  module load has no carrier yet. Really Big Ring is the reference.
- **`rollContext` is the second narrowing, and it is INDEPENDENT of the first.**
  `cardId` says which card the roll is about; `RollContext` says what the roll
  is FOR. Same rule as `cardId`: naming nothing means every kind, naming one
  means only that kind, and asking about no kind leaves the scoped ones out.
  Three sites ask, each with the only context it can ever have — `ModifierWindow`
  with `HeroEffect` (`rollOnHero` is the only thing that opens it),
  `AttackMonsterAction` with `Attack`, `ChallengeWindow` with `Challenge` for
  the CHALLENGER and with nothing for the defender, because defending is not
  challenging. `RollContext.Any` has no reader: "every kind" is the absent
  field, and a second way to say it would be two mechanisms.
- **A leader's passive installs on `GameStarted`.** A leader is never played,
  never moves and never leaves, so a printed passive has no card movement to
  hang off, and it has to be standing before the first roll. `GameEngine.start`
  emits it before the first `TurnStarted`; the entries scope it `Anyone`,
  because the event belongs to the table and carries no playerId — each
  matching leader installs on its own owner, which the pipeline knows and the
  event does not. The Divine Arrow (`leader-116`), the Fist of Reason
  (`leader-118`) and the Charismatic Song (`leader-119`) are the references:
  one `ApplyEffectTask` each, differing only in `rollContext`.
- **An effect with a magnitude is read as ENTRIES, not a total.**
  `getEffects(type, playerId)` returns the effects; callers sum them.
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
  *spent* during the window need nothing here: `restoreFrame` has already put
  them away, from the list the frame kept (§1).
- **A card that SURVIVES a challenge is marked**, so it cannot be challenged
  twice in a turn; `TurnManager.startTurn` clears the list alongside the ability
  slots. Only the winning branch marks: a card whose challenge succeeded is in
  the discard anyway.
- **A REACTION is the play; the registry is the effect.** `PlayModifierReaction`
  and `PlayChallengeReaction` spend the card, keep the window alive and
  announce `ModifierPlayed` / `ChallengePlayed`. What the card DOES —
  `[ChooseValue, ApplyModifier]`, `[StartChallenge]` — is its own entry, keyed
  by id like every other card type. That is what makes a modifier's value
  unforgeable: it used to arrive as a constructor argument off a socket,
  compared with nothing, and is now a pick from the card's own printed
  `values`. `ChooseValueTask` with no argument reads them off its own card, so
  all 25 printed copies share one declaration and all 14 challenges share
  another.
- **The Protecting Horn is why that split pays.** A leader granting "+1 or -1
  on each Modifier you play" runs the *same two steps* a modifier card runs,
  with the numbers passed in instead of read off a card. Before it, nothing
  could put a bonus into an open window except the reaction that spent a card.
- **`ApplyModifierTask` must not park on the roll's frame.** Reading "the card
  is not finished until the roll is" as a pause would deadlock: the pipelines
  underneath wait on the same frame, so a second bonus on the same roll — the
  Horn's, riding a card's — would never run. The card stays on the table by
  sitting in the instance zone instead, which settlement reads off the board.

## 8. Known limitations (deliberate, documented)

- **No failure branches.** `restoreFrame` couples "undo state" with "cancel
  the run", so "roll; if you fail, discard instead" is currently impossible.
- **`when` discriminates confirm/condition labels only.** A wording like "when a
  hero enters your party BY BEING STOLEN" has no matcher, even though `reason`
  is already in that payload.
- **No else-branch on a condition.** `ConditionMet` fires only when the test
  holds; "if Magic do A, otherwise B" needs two conditions with opposite labels.
- **A card choice cannot tell a COST from an OFFER.** `CardChoiceWindow`
  defaults to a random option, which is right for a price — Critical Boost's
  "DISCARD a card" lands whether or not the player answers — and blunt for an
  offer: an idle Wiggles steals a hero it was only ever *invited* to steal.
  Nothing distinguishes the two, so both get the same default. Marking which
  choices are costs is the outstanding design work; the defaults themselves are
  one override each.

- **A lost challenge cancels whatever played the card.** `PlayMagicTask`
  suspends its own entry on the challenge, so a defeat rolls back the steps
  behind the play too — Snowball's second draw goes with it. That follows the
  frame rule (a lost challenge takes a hero's roll offer with it the same way,
  by removing the hero that would have been offered one), but it is
  a rule about *where the snapshot was taken*, not a judgement about the
  wording. A card that should keep its tail would need the play to be the last
  step of its entry.
- **Nothing stops two challenges nesting.** A magic card played by an ability
  opens a challenge from inside a pipeline. Every ability that plays one has
  settled its own window first, so the case does not arise; nothing enforces it.
- **A nested value choice races the roll's own timer.** The choice window is
  given a shorter timeout than the roll, and the burn resets the roll's, so the
  ordinary case is safe. Two bonuses on one roll (the Horn's, then the card's)
  are two choices in sequence, and a player who sits on both can still let the
  roll lapse in between; `ApplyModifierTask` checks `isOpen()` and drops the
  bonus rather than submitting into a settled window. The card is spent either
  way.
- **A magic card with no registry entry is stranded in the instance pile.**
  Disposal hangs off `AbilityDone`, which is emitted when a PIPELINE leaves the
  stack. A card with no entry never gets a pipeline, so nothing ever announces
  it finished. The obligation shrank — every magic card needs an *entry*, not a
  disposal step — but it did not go away. Pinned by a test in
  `tasks/magic-tasks.spec.ts`.
- **`system` on `AbilityPipeline` is the one thing the two rule names buy at
  runtime.** `IAbilityRule` and `ISystemRule` are aliases of `IGameRule`, so
  nothing can tell them apart once the declaration is a pipeline; the match
  loop records which table it came from instead. Only `AbilityDone` reads it.
  A third distinction would need the same treatment rather than a type test.
- **Card objects are still shared across snapshots.** `clone()` copies players,
  parties, piles and queues, but `cards` is assigned by reference, so any
  mutation of a `HeroCard` or `ItemCard` outlives a rollback. Equipment moved to
  `Party` for that reason; anything else that ever needs to change on a card has
  the same problem waiting.
- **`CantChallenge` / `CantBeChallenged` have no readers.** Declared, installable
  and inert until a card needs them.
- **`CantBeStolen` guards the steal but does not filter choices** — a protected
  hero can still be *offered* by a `ChooseCardTask`; the steal then no-ops.
- **`TaskManager` must be added to the emitter before `GameEngine`.** Nothing
  enforces it. The last drain of a turn is whichever `FrameResolved` leaves the
  board idle, and only `GameEngine.resumeDrain` runs it; with `GameEngine`
  first, `TaskManager` is still holding the stack when that drain arrives and a
  turn ending on an ability's final step never ends at all. The same order is
  required for any ability that opens a window on `FrameResolved`.
- **`interfaces.ts` ↔ `pipelines/game-state.ts` remains a type-only cycle.** Genuinely
  mutual; both edges are `import type`, so nothing exists at runtime.

## 9. Dependency direction

`interfaces.ts` is the abstraction layer, so **it must not import an
implementation**. It declares `IReactionManager` (`openFrame`, `openWindow`),
which `ReactionManager` implements. Tasks, actions and the processor take the
interface.

`HeroCard.getEquippedItem(gs)` and `ItemCard.getEquippedTo(gs)` are the same
rule read the other way. Equipment is party state, so a card cannot answer from
its own data — it takes the board. The `GameState` import in both is
`import type`, and `pipelines/game-state.ts` imports neither card class, so the edge is
one-way and erased: no cycle in either direction, not even a type-only one.

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
- **53 card ids declare an ability** — 3 heroes, 3 items, 2 magic, all 6
  leaders, all 25 modifiers (one declaration between them) and all 14
  challenges (another). Every printed leader is written.
- **The thirteen one-off declarations** — `hero-028` (Wise Shield), `hero-036`
  (Wiggles), `hero-040` (Snowball), Critical Boost (`magic-053`, `magic-054` —
  two printed copies sharing one declaration), Really Big Ring (`item-064`,
  `item-065`), Suspiciously Shiny Coin (`item-073`) and all six leaders
  (`leader-116` … `leader-121`). The Shadow Claw (`leader-117`) is the
  reference ACTIVATED card: it declares none of "once per turn on your turn,
  you may spend an action point", because every clause of that is a guard in
  `RollOnLeaderAction`.
  Critical Boost is the reference MAGIC card: one entry that pauses on a choice
  and finishes as a later step of the same run. Really Big Ring is the
  reference ITEM — an on-equip effect that ends with its carrier — and
  Suspiciously Shiny Coin the reference CURSED item, riding an opponent's hero
  and taxing that opponent on `CarrierCard` scope. The Cloaked Sage
  (`leader-120`) is the reference for a leader reacting to a card its owner
  plays: `MagicPlayed` scoped `OwnerEvent`, because `FrameResolved` carries no
  playerId and names the played card rather than the leader.
  `abilityRegistry` is sectioned by card type and sorted by id inside each
  section, so a card has one obvious home.
- **Attack rolls open no modifier window.** `AttackMonsterAction` throws the
  dice inline, adds the standing `Attack` bonuses and resolves against the
  monster, so no modifier card can be spent on one and the roll is announced by
  no event. `RollResult.FightBack` is unimplemented on that path too.
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
