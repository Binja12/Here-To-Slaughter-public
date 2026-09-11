# Engine architecture — core ideas

Read before touching `server/src/game/**`. This records the _why_ behind the
shapes in the code. Branch: `HTSR-3-Game-engine`. Suite:
`npm test --workspace=server`.

Client asset delivery, lobby warmup and music buffering are documented in
[ONLINE_ASSET_PREPARATION.md](ONLINE_ASSET_PREPARATION.md). They run separately
from the engine's live game-state connection and do not change its contracts.
Visible art and commands awaiting acknowledgement pause background media.
Speculative card ordering uses only the public filename catalog, never deck state.
Client request/reply timing and the waiting-for-reply notice are separate from
engine reaction-window timers; details are in the asset delivery document.

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
  `tasks/` — `play-hero-task.ts`, `roll-on-hero-task.ts`,
  `attack-monster-task.ts`, `draw-task.ts`, `redraw-hand-task.ts` — while `hero-tasks.ts`
  keeps the steps that only ever move a hero already on the table. Card _data_ lives in `shared/`; this is the lookup from one to the
  other, which is why it sits beside `in-memory-card-repository.ts`.
- `state-structures/` — what `GameState` is made of. A **stack is face down and
  a pile is face up**, and that is the whole of why there are two: `CardStack`
  offers `draw()` off the top and nothing else, because nobody can see into it;
  `CardPile` offers `pick(cardId)` and no draw at all, because everything in it
  is visible and a player names what they take. `card-pile.ts`,
  `card-stack.ts`, `player.ts`, `party.ts`.
- `views/` — the projection in front of the API (§5). `player-view.ts` builds
  one player's screen out of the board; the SHAPE it builds lives in
  `shared/src/views.ts`, because it is the client's half of the contract.
  `game-log.ts` is the second projection: the table's story, one listener
  per game that records every event verbatim for developers and words the
  ones a player would tell of (`docs/DATABASE_AND_LOGS.md` §3).
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
would force the subclass to _remove_ those, and a task cannot call the action's
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

`TaskManager` wakes the pipelines suspended on that frame and _then_ matches,
so a played card's own pipeline lands on the stack above them and resolves
before the rest of whatever played it.

**The card an event NAMES goes before anything watching it.** Of the pipelines
one event matches, those whose `sourceCardId` is the event's own `cardId` are
pushed first; the rest keep `abilitySources`' position order behind them. A
modifier card's `ApplyModifierTask` therefore lands its bonus on the roll
before the Crowned Serpent's optional draw opens a window and parks the
stack — without it, the whole table watched an unchanged number until the
Serpent's owner answered, on every screen. The Protecting Horn is the visible
consequence: its bonus now lands second, and a sum does not care.

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
which pauses must dispose _before_ the branch it might not take, and the order
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

**Any bare hero on the table may wear an item, cursed or plain** (the owner,
2026-09-04: the rules do not say whose hero; a plain item on an opponent is a
legal, if generous, play). `PlayItem.canEquip` holds the type checks and the
one-item rule — the action calls it from `canExecute`, the task when it
discovers its target. The cursed flag still decides what the item DOES.

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

**Attacking a monster is the fifth pair, and the one whose target belongs to
nobody.** `attackMonster` (`tasks/attack-monster-task.ts`) throws the dice,
announces `DiceRolled` and opens an `AttackWindow`. No `markAbilityUsed`:
attacking is priced in action points, not in a card's once-per-turn slot, so a
player with the points may swing again. Nothing happens inside the frame — the
window decides the outcome and moves the monster on the branch that earns it,
because the two failing bands leave the monster exactly where it was and there
is no rollback to arrange.

**The monster row is a PILE fed by a DECK, and slaying moves between both.**
`GameState.slayMonster(cardId, playerId, em)` is the one way a monster leaves
the row: it picks the monster out, draws the top of the monster deck up behind
it and adds the monster to the winner's party. One function because the three
are one act — the row is what a player attacks FROM, so a caller that only
removed the monster would silently shrink the game. It THROWS on a monster that
is not in the row, since both wrappers check the pile before they roll, and it
lets the row shrink once the deck is spent: nothing to draw is "ran and produced
nothing", not a mis-declaration. It announces `MonsterSlain` itself, for the
reason `Party.addHero` announces (§7) — one choke point that emits is what
stops the next mechanic that slays a monster from forgetting to.

**Whether a party MAY attack is one question with one answer.**
`GameState.canAttackMonster(playerId, monsterId)` is asked in four places — the
action's `canExecute`, the task when it discovers its target, the choice filter
that builds the options, and `MonsterChoiceWindow.canSubmit` — so a monster
cannot be offered by one and refused by another. Two halves: the monster must be
in the face-up row, and the party must field what its printed `partyReq` asks.

`partyReq.classes` is a MULTISET, not a set. The Dark Dragon King's
`[Bard, 'Any']` wants a Bard AND a second hero, so two Bards qualify and a lone
Bard does not. `MonsterCard.canBeAttackedBy` counts down a pool rather than
asking `includes` per entry, and matches NAMED classes before `'Any'` — that
ordering is what makes one greedy pass correct, since `'Any'` can take any hero
a named entry rejects. `AllClassesInParty` in `conditions/` looks similar and is
not: it tests distinct classes with a Set, which answers a different question.

**Redrawing a hand is the sixth pair, and the one made of two doors the board
already had.** `redrawHand` (`tasks/redraw-hand-task.ts`) discards every card
in hand and then draws five, one card at a time, through
`GameState.discardFromHand` and `GameState.drawIntoHand` — the same two
functions `DiscardTask`, `DrawTask` and `DrawCardAction` go through, so a
card cannot leave a hand or enter one without being announced, and there is
one loop for "draw N" rather than one per caller. Every discard goes out
before the first draw, in printed order, which is also why a deck that empties
half way through refills from a discard already holding the old hand: the
rule says DISCARD then DRAW, and the deck runs back the moment it empties.
Nothing is contested and nothing rolls back, so no frame opens. The action
costs the whole budget; the task, like every task, costs nothing and acts on
its entry's owner.

**Drawing is the seventh pair, and the smallest.** `Draw`
(`tasks/draw-task.ts`) holds one loop over `GameState.drawIntoHand` that
stops when the board gives nothing and returns what it drew. `DrawTask` hands
the list to `CTX_DRAWN_CARD_IDS`; `DrawCardAction` asks for one and keeps the
hand limit and the empty-deck refusal as guards of the PRICE — a player is not
charged a point to draw nothing — which is why neither is in the base.

Seven mechanics, seven bases, two wrappers each. A wrapper is always pure
addition — the action adds a price, `canExecute` guards and a queue identity;
the task adds a context slot read at runtime.

**The deck runs back the moment it empties.** `GameState.drawFromMainDeck`
is the only way a card leaves the main deck, and after every draw it asks one
question: is the deck now at zero? If so the whole discard pile is shuffled in
behind the card just taken, so the deck is never left sitting empty while
there is anything to refill it with, and the next draw — from a player, a
task, or a redraw half way through — finds a full deck without asking. A
draw returns nothing only when deck and discard are BOTH empty, which is "ran
and produced nothing": the drawing step skips, it does not throw. No event
announces the refill; the deck and discard counts in `PlayerView` change
together and are the record, and nothing else needs to know.

**A PASS forfeits the budget, and that is all it does.** `EndTurnAction` costs
nothing and spends every point its player has left; `TurnManager.drain` then
ends the turn by the rule it already had — budget at zero, board idle. No
flag, no phase change, no call into the turn manager: one rule decides when a
turn is over, and a pass only satisfies it. It is not reactable, so it queues
even while an ability is resolving, and the drain runs it once the board is
idle — an ability the player set off finishes before the turn ends, exactly as
it would for any other action.

**Only the ACTIVE player spends action points; everybody else answers with
REACTIONS.** Off-turn play is the reaction system in its entirety — a challenge
card, a modifier, an answer to a window — and every one of those goes to
`ReactionManager` and never touches the action queue. So "whose turn is it" is a
property of the QUEUE, not of any action: `TurnManager.enqueue` refuses an
action whose `getPlayerId` is not the current player, and no `canExecute`
mentions the turn at all. Eight copies of one rule is eight chances to forget
it, and the next action written would have been the ninth.

**A leader is never PLAYED, so there is no sixth mechanic.** `PartyData.leaderId`
is set when the party is built and never changes: a party and its leader come
into existence together, out of the game's configuration, before any turn
exists. There is nothing to take out of a hand, nothing to contest, nothing to
roll back and nothing to announce — party membership has a choke point because
membership CHANGES, and this does not.

**Activating a leader is a sixth pair with only one half.**
`RollOnLeaderAction` is the ONLY way a leader's printed ability ever runs: no
system rule reaches a leader, which is the point — a leader is never played,
never rolled on by another card and never moves, so without a player asking,
nothing would. It has the same shape as `RollOnHeroAction` with the dice taken
out: price, guards, `markAbilityUsed`, announce. `RollSuccess` naming the
leader is a plain "this fired" — there is no requirement to beat and no
modifier window — and because it is the same event a hero's roll emits, the
registry needs no leader-shaped special case. No task twin, deliberately: a
second caller could only be a system rule.

**Only an ACTIVATED leader can be activated.** Five of the six leaders are
passives — a standing bonus or a draw on a Magic play — and have nothing to
fire on the announcement; before 2026-09-04 the action took the point anyway
(seen live: the Cloaked Sage glowed, was pressed, and the point was gone).
`canExecute` now asks the registry whether the card has an entry on its OWN
`RollSuccess` (`firesOnOwnRoll` in the ability repository — the Shadow Claw
is the one leader that does) and refuses `LeaderNotActivatable` otherwise;
`playerView.canRollOnLeader` reads the same predicate, so the guard and the
glow cannot disagree. Rejected: a flag on the card data — the registry already
IS the fact, and a second copy could drift.

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

**Rollback _is_ cancellation.** `restoreFrame` puts the board back and drops
every pipeline paused on that frame, in the same call: a failed roll or lost
challenge discards the continuation together with the state it would have
mutated. No cancel flag exists anywhere — `pausedOn` is the pause itself,
read from the other side.

**Rollback means an outcome FAILED**, never a player declining an offer. A
declined confirm releases its frame like any other outcome (§4).

**Snapshot timing decides scope.** A frame opened by step 4 already contains
steps 1–3, so rolling it back keeps them (Wiggles keeps the stolen hero when
the follow-up roll fails). Want an earlier step undone? Open the frame earlier.

`PlayHeroAction` is the clearest use of that lever. It spends the point, takes
the card **out of hand**, and only _then_ opens the frame and the challenge
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

**"Is the board mid-resolution" is ONE question, on the board.**
`GameState.isBusy()` is an open window or a pipeline with steps left — the
stack and not just the frames, because a window releases its frame before it
announces (§4). `TurnManager.drain` asks it to decide whether an action may
run, and the projection asks it to tell a client whether to accept input (§5).
Two copies of that could disagree, and the client's would be the one that was
wrong.

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
  _underneath_ are the ones that must wait; lifting the paused one off would
  let the next drain walk straight past them. Only that frame's `FrameResolved`
  clears the mark. Asking whether the frame is still open would NOT do: a
  window releases its frame BEFORE it announces the outcome (§4), so the stack
  would carry on before the answer arrived.
- **The stack is NOT in the snapshot.** A snapshot is the board — players,
  parties, piles, hands, effects. Pipelines are work in progress ON the board,
  and a rollback undoes what that work did without forgetting the work
  existed: the live stack survives `restoreFrame` untouched except for the
  pipelines paused on the restored frame, which it drops. That is the whole
  cancellation rule, stated once, beside the rollback it belongs to. The
  pipelines underneath could not have moved while the frame was open (only
  the top of the stack runs, and the top was paused), so there is nothing a
  copy could restore that the live record does not already hold. A copy
  would be a second record of "P is waiting on F" beside `pausedOn`, and
  the two can disagree: a confirm's `TaskConfirmed` goes out before its
  `FrameResolved`, so a continuation opens its frame while the offer is
  still marked paused on a frame already released, and a copy taken then
  carried a mark nothing would ever clear. An offered roll that FAILED left
  the board busy for ever that way. Pinned in `hero-rules.spec.ts` and in
  the rollback case of `ability-pipelines.spec.ts`.
- **`FrameResolved` drains even when nothing is paused on that frame.** After
  a rollback the pipeline that waited is gone, and the ones underneath still
  have to finish.
- **A pipeline started inside a frame outlives its rollback.** It is on the
  live stack, so it stays. The only way to be there at all is the timer race
  of §8 — a modifier's value choice still open when the roll it was for
  lapses — and `ApplyModifierTask` finds the roll settled and drops the
  bonus. Not pinned.
- **The declaration's `steps` are copied when matched.** That list is built
  once at module load (§1); the drain consumes what it is handed.

## 4. Reaction windows

- Modifier/challenge windows accept many respondents and any number of
  cards, and give the table the FULL wait again on every one — at the spend
  and at the landing — so there is always time to answer; they settle only
  on the clock or once every seat that could still act has passed (the owner,
  2026-09-06). Choice windows have **one respondent, one submission**, resolve
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
- **Results are self-describing.** Each window declares its context slot _and_
  value shape via `resultKey()`: choices write arrays, the modifier writes a
  scalar `number`. The processor blindly does `ctx.set(result.key, result.value)`.
- `resultKey()` is **abstract** on the choice base; "deliberately no result" is
  the `NO_CONTEXT_RESULT` symbol, not `undefined` — silence can't be told apart
  from forgetting, a sentinel can be asserted in tests.
- **One lifecycle event pair for all windows** — `ReactionWindowOpened/Closed`
  with `windowType` in the payload — plus true domain events
  (`ModifierApplied`, `ChallengeStarted/Resolved`, `HeroStolen`,
  `TaskConfirmed`, `ConditionMet`).

**Player input arrives by TWO routes, because they are two acts.**
`ReactionManager.submitReaction(reaction)` PLAYS a card into an open window and
is refused when the board says no; `submitChoice(windowId, playerId, choice)`
names one of the options the engine itself put in front of exactly one player,
so it only has to find the window and hand the pick over. The window owns the
rest — a wrong respondent, an option never offered and a stale pick are each
refused by name — which is why the route is three lines and holds no rules of
its own: it answers `NoSuchWindow` for a window that is not open, and otherwise
returns whatever the window said. A window that has already lapsed is not an
error either: the player is late, and there is nothing left to answer.

**`pass(windowId, playerId)` gives a table window up (2026-09-04).** The
playtest's Skip button: with a human-length countdown every roll and challenge
sat through the whole clock when nobody meant to react, so the wire got a
thirteenth door, `PassWindow { windowId }`. A pass is PER SEAT, kept on the
window (`IPassableWindow`: `pass`, `passedBy`, shown in the detail as
`passedBy` so a screen can say "waiting for the others"). The window settles
once every seat that could still act on it has passed — `resolve()`, the same
call the clock makes, so nothing downstream can tell a pass from a lapse. Who
could act is declared by `IPassableWindow.canPass(playerId)`: every seat on a
roll; on a challenge, everyone but the defender until it starts, then every
seat. The view projects this as `PendingWindowView.canPass`. A card landing
in the window clears its passes — the roll changed under them. Only the
table's windows can be passed (Modifier, Attack, Challenge); a choice is one
player's question and is answered or dismissed through `submitChoice`, so a
pass on one is `WindowNotPassable`. Rejected: "first pass settles it for
everyone" — built first as a stopgap and replaced the same day, since one
seat could then close a window another seat was about to answer.

**A player never contests their own play.** `PlayChallengeReaction.canExecute`
reads the open Challenge window's respondent — the defender, whoever played
the contested card — and refuses `CannotChallengeOwnCard` when that is the
challenger. The client mirrors it in its glow rule (the challenge card in the
defender's hand stays dark).

**A reaction's target is the last play's, and only a contest asks which
roll (2026-09-06).** A modifier on a roll lands on that roll: the board names
the roller (`GameState.aimModifier`), and anything the client says is
ignored. A started contest has two rolls, so there the player names the side
(`ApplyModifier.targetPlayerId`, the challenger or the defender); naming none
is refused `TargetRequired`, and a seat outside the contest
`TargetNotInChallenge`. A challenge card names nothing: it contests whichever
play is open to one (`Challenge { cardId }`), read off the open window. The
client aims only in a contest — pressing a modifier on a roll goes straight
to its value, pressing a challenge card contests the play.

**Every player door returns a `RequestResult`** (`shared/src/types.ts`):
`{ accepted: true }` or `{ accepted: false, reason }`, where the reason is a
member of the `RefusalReason` enum (`shared/src/enums.ts`) rather than a
sentence, so a client can branch on it and a test can assert it. Expected
refusals are RESULTS, never exceptions: a throw inside the engine is an engine
mistake, a refusal is a player's. `accepted` means the request was TAKEN, not
that the play succeeded — a challenged hero that loses its roll was still
accepted; what happened to it is on the board and in the events. `accepted()`
and `refused(reason)` in `interfaces.ts` build the two shapes.

**The reason comes from wherever the rule is, and is passed up unchanged.**
`IAction.canExecute` and `IReaction.canExecute` return a `RequestResult`, one
named refusal per guard in the order the guards run — `NoActionPoints`,
`CardNotInHand`, then whatever the action is about
(`HandFull`, `HeroNotInParty`, `AbilityAlreadyUsed`, `HeroEffectSealed`,
`NotYourLeader`, …). `TurnManager.enqueue` adds only what the action cannot
know — `GameOver`, `NotYourTurn`, `Busy` — and otherwise returns the
action's own answer. Two phases at two altitudes decide the rest.
`GamePhase` (`Setup`, `Turns`, `Concluded`) is the GAME's state: held on the
board, moved by `GameEngine` at `start` and at `GameEnded` — which comes the
MOMENT the board qualifies, whatever event lands it. `GameEngine` keeps a
DIRTY flag: every event sets it (nothing moves the board silently, so "an
event fired" and "the board may differ" are one condition), and the first
event that finds no OUTCOME pending clears it by asking the win conditions.
`GameState.hasPendingOutcome` is the gate: a frame holding an open
challenge, hero roll or attack — a window that may yet restore the board —
or a frame with nothing open yet (between `openFrame` and its first window
the hero already stands in the party; between a close and its settle the
outcome is not applied), because what stands under either is not on the
board yet. A change made under one waits and is asked about on the event
that settles it. A question a continuation OPENED holds nothing back — the
roll a played hero is offered does not delay the win its sixth class just
landed. The third monster therefore ends the game on `MonsterSlain`, inside
the attack's own settle. Concluding puts the open question down with the
board: `GameState.conclude` cancels every open window and drops the frames
and pipelines, and `TaskManager` runs nothing on a concluded board — the
`FrameResolved` that follows a winning slay starts no continuation.
Before 2026-09-04 only the turn's end asked, so the sixth class stood on the
table for the rest of that turn (seen live). The printed rulebook checks the
class win at the end of the turn; the owner's call is on the
spot, like the third monster. The last move is
A win condition is asked of ONE PARTY at a time
(`IWinCondition.isMetBy(gs, player)`), never "who has won": a table set to
`GameConfig.requireAllWinConditions` needs the same party to meet every one
of them, and an answer per condition cannot say that (two parties each
holding half is nobody's win). `GameEngine` walks the seats and takes the
first that satisfies `every` or `some` of the list; an empty list is never
met either way. The lobby's "Win by" is exactly this switch — both printed
conditions always travel to the engine, and `monstersAndClasses` vs
`monstersOrClasses` only sets the flag (`game-server/game-config-for.ts`).
The last move is
`GameState.conclude(winnerId)`, phase and winner in one call, so a concluded
board always names who won and `PlayerView.winnerId` can show it to a screen
that has no `GameEnded` to read (2026-09-03) — and shown to a
player as `PlayerView.phase`. `TurnPhase` (`Start`, `Action`, `End`) is where
`TurnManager` is inside one turn: engine logic only, never on the wire.
`enqueue` refuses `GameOver` off the game phase — a late request is a
player's — and THROWS when the turn phase is not `Action`: before the first
turn the transport routed input to a table it never started, and between one
turn's `End` and the next `Start` the cascade is synchronous, so nothing from
outside can arrive. `drain` reads `.accepted` when it re-asks a queued
action. `ReactionManager.submitReaction` returns the reaction's answer; the
choice route and the windows answer `NoSuchWindow`, `WrongRespondent`,
or `NotAnOption`, and the roll and challenge windows name their own
refusals (`TargetNotRolling`, `TargetNotInChallenge`,
`ChallengeAlreadyStarted`, `ChallengeNotStarted`).

**A refusal is a PLAYER'S mistake; anything else throws.** `canExecute`
checks game logic and nothing below it. The SHAPE of a request — every field
present and typed — is the transport's job (zod, in `shared/src/contracts`),
so no guard here re-checks it. And a player id that the table never seated is
neither: the transport bound it at the handshake, so an unseated id is an
engine mistake and `GameState.requirePlayer` THROWS on it (§11.2) — no
`RefusalReason` names it. An action never holds a `Player`: it asks the
BOARD — `getActionPoints`, `decreaseActionPoints`, `hasInHand`,
`getHandSize`, each of which goes through `requirePlayer` — so an action
depends on `GameState` alone and the identity check needs no line of its
own. Card ids ARE the player's to get wrong, which is why
`CardNotInHand`, `NotAnItem` and `NotAHero` are refusals.

Three questions are compound, and a reason has to say which half failed, so
they return a `RequestResult` too: `GameState.canAttackMonster`
(`MonsterNotInRow` | `PartyRequirementUnmet`), `GameState.acceptsModifierFor`
(`NoModifiableWindow`, else the open window's own `acceptsModifierFor`:
`TargetNotRolling`, `TargetNotInChallenge`, `ChallengeNotStarted`) and
`PlayItem.canEquip`
(`NotAnItem` | `NotAHero` | `HeroNotInParty` | `HeroAlreadyEquipped`). The projection, the choice filters, the tasks and
`MonsterChoiceWindow.canSubmit` read `.accepted` off the same call, so the
rule still lives once and the sites that ask it still cannot disagree; the
question that has ONE answer, `canUseHeroEffect`, stays a boolean and the
action names it.

Finding the window is what `IReactionWindow.getRespondentId()` and
`getOptions()` are for, together with the projection that shows a player what
they are being asked (§5). Both are plain readers of fields every window
already had.

**A pick the window never offered is refused AND settles the window
(2026-09-04).** `NotAnOption` goes back, and the window resolves on what its
silence picks — a random offered card for a `CardChoiceWindow`, the biased
number for a value, nothing for the base. The client only ever sends what it
was shown, so such a request is a client out of step, and the table is not
held for it (the owner: "return an error message and choose a random valid
target"). `WrongRespondent` stays a plain refusal: another seat's noise may
not spend somebody's window. Seen live: Destructive Spell aimed at a hero
under Terratuga — the destroy silently did nothing and the card was wasted;
the choice now never offers such a hero (`destroyable`, §5), and a pick of
one anyway lands the destroy on a random hero that CAN fall.

**An offered option must stay legal, so a stale pick THROWS.** The engine
built the window's options from the board; a pick that was offered and is not
legal now means the window went stale under the player, which is the engine's
mistake and never a `RefusalReason`. `canSubmit(choice)` is that check, run
the moment an answer arrives, after the two guards that refuse socket noise
(`WrongRespondent`, `NotAnOption`). It leaves the window open with its clock
untouched — a `ChoiceWindow` sets its timer once in the constructor and never
resets it — but nothing downstream should rely on that: the throw is a
defect report, and the defect is whatever moved the board without closing or
rebuilding the window (§8).

It is distinct from `isStillValid`, which runs at RESOLVE and quietly drops a
stale pick. Two hooks because they answer to different audiences — one tells
the player, the other tidies up after a timeout.

`MonsterChoiceWindow` is the only override: it re-asks `canAttackMonster`,
because a hero can be stolen out of the party while the window is open and take
the party's claim on that monster with it. It also overrides `defaultChoice` to
pick NOTHING — `CardChoiceWindow` defaults to a random option so a card that
asks for a card cannot be dodged by waiting, which is right for a price, and an
attack is an offer.

**A VALUE choice does not default at random.** `CardChoiceWindow` picks one of
its own options because a card has no direction; a number does. `ValueBias` is
`highest` or `lowest`, and the window BEING MODIFIED decides which — a plain
roll asks whether you were helping yourself (`highest` on your own roll,
`lowest` on somebody else's), a challenge asks which side you pushed (`lowest`
aimed at the defender, `highest` aimed at the challenger, so silence tips a
contest toward the play being defeated). `ChooseValueTask` reads it at open
time and hands it to the window, because the roll it describes may have settled
by the time the choice resolves.

**A roll's target is asked while the roll stands, and the settle carries it
(2026-09-06).** The rulebook lets a modifier wait for the target of a roll's
effect but not for the effect itself, so a hero whose effect chooses a player
or another player's card declares TWO entries: `[0]` on `RollPassing` asks
the target and hands it to the open roll window (`TargetRollTask`, the slot
the choose step wrote), `[1]` on `RollSuccess` does the effect. The window
announces `RollPassing` when the standing roll meets its requirement — at
open, or when a modifier rescues it — and at most once per target, so a roll
that flips twice does not ask twice. It keeps the target as live state
(`targetChosen`): the table sees it in the window's detail as the SEAT it
belongs to, never the card (a pick from a hand is that player's secret),
everyone gets another look (the full wait again, passes cleared), and the
settle puts it on `RollSuccess` as `ctxSeed`, so the effect's fresh context
starts with it. A roll never settles while a question stands over it
(`GameState.hasOpenFramesAfter`): the clock runs again instead, and the
answer landing restarts it anyway. A modifier landing on the roll gives the
standing question the full wait again too (`GameState.restartQuestionsAfter`,
`ChoiceWindow.restartClock`): the asked player was watching that roll change
(the owner, 2026-09-06). Only on a landing, never on the roll's own expiry —
two clocks restarting each other would never run out. A roll that fails with its question still
open takes no cancelling: the answer lands on no open window and is dropped,
like a late modifier value. Heroes that choose from their own hand, the deck
or the discard keep one entry on `RollSuccess`: nothing there is a target the
rule means. Pinned in `modifier-window.spec.ts`, the targeted heroes' specs and
`setup/play-through.spec.ts`.

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

**One roll and one requirement to beat is a BASE CLASS.** `ModifierWindow` (a
hero's effect) and `AttackWindow` (slaying a monster) are the same mechanic
pointed at different subjects, so the bonus list, the clock, `submitReaction`
and all three `IModifiableWindow` methods live once in
`ModifiableRollWindow`. Each subclass supplies only what its subject decides:
which `RollContext` the standing bonuses are scoped to, what the payloads say,
and what the final number MEANS. `ChallengeWindow` is deliberately not under
it — two rolls make its bonus list, its bias rule and its settlement a
different shape.

The subclass calls `open()` as the last statement of its own constructor, never
the base: `super()` runs before a subclass's fields are assigned, so a base that
announced would emit a payload built out of `undefined`.

**A monster answers with three outcomes, not two.** `MonsterCard.trySlay` holds
the comparison and which way round it runs. SLAY releases and moves the monster
into the roller's party, announcing `MonsterSlain` _before_ `FrameResolved`, so
the monster's own printed entries are live for the event that won it. FIGHT
BACK and MISS both restore and leave it in the pile; they differ only in what
the table is told. A fight-back names the attacker so the monster's entries can
run against them (§6); a miss is announced by nothing beyond the window
closing, exactly as a short hero roll is.

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
  new ChooseCardTask({
    zone: Zone.Hand,
    owner: Owner.Chosen,
    cardType: CardType.Magic,
  }),
];
```

Filters are **data, never closures** — readable, loggable, serializable to a
client.

`Zone.MonsterPile` is the face-up row, and is SHARED like `Discard` — it belongs
to nobody, so `SHARED_ZONES` reads it once instead of once per seated player. It
reaches only the pile: the monster deck is face down, and nothing face down is
offerable. `partyReqMet` is the one axis that is not about position — it keeps
the monsters the ability owner's party may legally attack, by asking the board
the same question the action and the window ask. Non-monsters never match it,
the way `heroClass` rejects non-heroes. `unequipped` is the same shape for
heroes: it keeps the ones carrying nothing, so Malamammoth offers only heroes
that can actually take the item it just drew. `destroyable` keeps the heroes a
DESTROY would take — `GameState.canBeDestroyed`, the same reader `DestroyTask`
consults — and every choice that feeds a DestroyTask sets it (Bad Axe,
Destructive Spell, Fluffy, Pan Chucks, Qi Bear, Serious Grey, Shurikitty,
Whiskers), so a hero under Mighty Blade or Terratuga is never offered rather
than picked and silently spared (2026-09-04). A party with no legal hero offers
NOTHING, the window settles on its 0ms empty-choice timer, and `PlayItemTask`
reads the empty slot and skips — no branch anywhere says so.

**Visibility is not the engine's concern.** Events state the full truth
(options include opponents' card ids). A projection layer in front of the API
decides what each client sees — it must filter **event payloads**, not just
state snapshots, or the same information leaks by another route.

**That layer is `views/player-view.ts`, and its shape is a TYPE in `shared`.**
`PlayerView` (`shared/src/views.ts`) is what one screen is drawn from, and
`playerView(game, playerId)` is the only thing that builds it. The type is the
enforcement: filtering written as a convention gets forgotten a field at a
time, while a field that does not exist cannot be filled with a card nobody may
see.

One rule, applied everywhere: **a face-up card is NAMED, a face-down one is
COUNTED**. Your hand is `CardView[]`, everybody else's is `SeatView.handCount`;
the two decks are `{ count }` and hold no other field. That asymmetry is the
whole of what separates two players' views of one table, which is why there is
no `gameView` — a table has no shared screen, and a function that built one
would be the thing that leaked.

**The story is projected the same way.** `views/game-log.ts` listens to the
game's emitter and words events into `GameLogEntry` lines at the moment they
fire, reading the board only to name seats and cards. A line names a card only
to the seats that saw it (`LogLine.seen`): a draw is "drew a card" to the
table and the card's name to the drawer. `GameLog.entriesFor(viewerId)` is
the per-seat reading; the transport ships it in the snapshot envelope beside
`PlayerView`, never inside it. Every event is also kept verbatim
(`EventRecord`) for developers — that list is the engine's, unfiltered.

**A card crossing the line is its printed DATA, not its object.** `ICard.getData()`
returns the record the card was built from, so the projection is plain
serialisable data with no behaviour attached (§1). It hands back a copy:
`createGame` builds every game's cards from the same module-level records, and
a shared object would let one table's screen be mutated into another's.

**Four questions the view answers so the client cannot** —
`attackableMonsterIds`, `passiveCardIds`, `HeroInPlayView.canRollOn` and
`busy`. Each is a rule the engine already owns (`canAttackMonster`;
`isActivatable` / `hasStandingRule` over the ability registry;
`canUseHeroEffect` plus the once-per-turn slot; `GameState.isBusy`), and a
screen that worked them out for itself would be that rule implemented twice, in
two languages, free to disagree.

`passiveCardIds` is the one the client could not even guess at: behaviour lives
in the registry and never in card data (§1), so "does this card have a standing
rule" is unanswerable off the wire. Three sources, unioned — the source card of
every installed effect, each party's leader when it is not the ACTIVATED one,
and each party's won monsters (whose printed rule is the passive they were won
for; a fight-back only fires from the pile). A hero's printed effect is rolled
for rather than standing, so heroes reach the list only through the effects they
installed. `busy` is the same question `TurnManager.drain` asks before it runs
an action, which is exactly why a client greying out its buttons must not ask
a different one.

**Every open window is listed for everyone; only its own respondent is told the
OPTIONS.** A window stops the game, so the table has to see what it is waiting
for — but a choice over somebody's hand lists card ids, and handing those round
would leak the same information the hand counts exist to withhold.

**A choice names the card that asks, and carries its card options as
cards.** Every card / player / monster choice puts `sourceCardId` (the ability's
card) in its detail, so the respondent's screen can show that card big while
the board is dimmed for its question (the owner, 2026-09-04: "the source card
must show big so the players have context"). `PendingWindowView.optionCards`
is the options that are cards, as printed data, for the respondent only:
Bullseye's look at the deck's top three offers cards that are in no zone the
screen draws, and ids alone drew as ids. Fight-backs of "Sacrifice one of your
heroes" are declared per monster (Mega Slime's shape, `MonsterFoughtBack` scoped
`Attacker`); Terratuga, Corrupted Sabretooth, Crowned Serpent and Bloodwing
had the text and no entry until 2026-09-04, pinned by a registry test. Mega
Slime's extra point also lands on the slaying turn (`GainActionPointsTask`):
a standing `ActionPointBonus` is only read when a turn starts.

**A window's QUESTION is in the view, not only in the event that opened it.**
`IReactionWindow.getDetail()` is what the window is asking, read live — a
roll's base, the bonuses landed so far, the running total and the
requirement; a challenge's defender, card and, once started, both rolls; a
choice's question — and `getDeadline()` is when it lapses. `PendingWindowView`
copies both, so a screen drawn from a snapshot alone, which is what a
reconnecting client has, can show the dice and the countdown; the
`ReactionWindowOpened` event carries the same fields but only once, and a
bonus that lands after it changes the number. Who sees the detail follows the
options rule with one difference: a roll or a challenge is the table's
business, because deciding whether to spend a modifier on somebody else's
roll needs the number, while a choice's question reaches its respondent only,
since a confirm's `ctxSeed` can name a card nobody else may see.

Event payloads still carry the whole truth and are still unfiltered — the other
half of this section, and it belongs with the transport on `HTSR-4`.

## 6. Abilities: entry lists, event hand-offs

### Two sources, one match loop

Per event the processor collects every ability to check, then matches each
against the event:

- **Cards in play — DERIVED.** A card's ability is live because the card sits in
  a party (leader, monsters, heroes, equipped items, instance cards). The scan
  reads it fresh each event and looks the behaviour up in the registry. Nothing
  is stored, so nothing can go stale: a stolen hero's ability belongs to its new
  owner with zero bookkeeping. This is principle 3 — derive rather than pass.
  The monster PILE is read the same way, and is the one position with no owner:
  a monster is on the table from the first turn rather than from the moment
  somebody wins it, so its printed rules are live while it still sits there —
  which is where a fight-back is written. It is pushed with an empty ownerId,
  because there is nothing true to put in one, and only `TriggerScope.Attacker`
  takes its owner from the event instead. A monster slain into a party simply
  stops being found in the pile and starts being found above, owned.
- **Ongoing effects — STORED**, on the owning `Player`. "Your heroes cannot be
  stolen until your next turn begins" has no card position to derive from, so
  it lives on the player until an expiry event removes it (§7).
- **Hero rules — UNIVERSAL.** `hero-rules.ts` holds the entries EVERY hero
  carries, sourced to each hero in a party as if printed on it. "A freshly
  played hero may roll for its ability" is a rule of the game, not one card's
  behaviour, so it cannot live in a table keyed by card id — it belongs to all 136. Sourcing it to the hero is what makes it need no new machinery: scope,
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
Attacker     payload.cardId is this card AND the event names who swung
OwnerEvent   the event is my owner's       — "add 2 to YOUR rolls when challenging"
OwnerTurn    only during my owner's turn
Anyone       any player's event            — the -1 modifier card
```

`CarrierCard` exists because an equipped item's events are about its HERO, not
about the item: `RollSuccess` names the hero, so `SelfCard` never matches an
item and `OwnerEvent` would fire on rolls the item has nothing to do with. It
derives the link from `gs.getEquippedItem`, so nothing is stored.

`SelfCard` is load-bearing: Wiggles and Snowball both trigger on `RollSuccess`
and can sit in the same party, so rolling on one must not fire the other.

`Attacker` tests exactly what `SelfCard` tests, and is a separate scope for the
OTHER half of what a scope decides: whose run it is. Every other scope resolves
that against where the card sits, which `abilitySources` already worked out — a
monster in the pile sits nowhere, so there is no owner to find and the attack
names one. `ownerFor` in `ability-lifecycle.ts` is the single place that reads
it off the event, and it sits beside `triggerMatches` because both are the
question of what an event means. Ownership is not `TaskManager`'s to decide; it
owns the stack.

`when` is one string, matched against the payload's `label`. Scope answers
_whose_ event; `when` answers _which_. Deliberately narrow — it discriminates
`TaskConfirmed` / `ConditionMet` variants and nothing else (§8).

### An ability that pauses is SPLIT, not parked

A card holds a **list** of entries: one per stretch of steps that runs without
pausing. A step that asks a question is the LAST step of its entry, and what
follows is a separate entry triggered by the answer's event.

Two hand-offs, one shape:

| step                | emits on success                       | emits on failure           |
| ------------------- | -------------------------------------- | -------------------------- |
| `ConfirmTask`       | `TaskConfirmed { label }` on CONFIRM   | nothing on DISMISS/timeout |
| `CardTypeCondition` | `ConditionMet { label }` when it holds | nothing                    |

"No" is the **absence** of an event, so nothing has to be cancelled and nothing
rolls back.

**The condition hands on the cards that MATCHED, not everything it tested.**
`ConditionMet` seeds the tested slot with the matching ids only, so the confirm
behind it names one of them and the choice behind that offers them. Quick Draw
(`hero-010`) is why: _draw two cards; if either is an item, you may play it
right away_ drew a Challenge first, the ask pointed at the Challenge, and the
board glowed a card the offer could not be taken on. Pan Chucks' _you may show
it_ reveals the Challenge for the same reason.

**Snowball (hero-040)** — the reference. _Draw a card; if it is a magic card,
you may play it right away and then draw again._

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

**Critical Boost (magic-053 / magic-054)** — the reference _magic_ card.
_Draw three cards, then discard one._

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

**A conditional second clause needs no condition when it can read the FIRST
clause's output.** Forced Exchange steals a hero from the chosen player's party
and then hands one of yours back to that player — you may only give because
you took. Both remaining steps therefore read
`CTX_STOLEN_FROM_PLAYER`, which `StealFromPartyTask` fills only when it actually
took somebody, rather than `CTX_CHOSEN_PLAYER`, which is filled either way. A
refused steal (a hero under `CantBeStolen`) leaves it empty and both steps skip
on their own missing input — no `ConditionMet`, no second entry, and no step
asking about a sibling.

`ChooseCardTask`'s `requiresKey` is the same idea applied to the PROMPT. It is
not a filter: the question is whether the choice has a point at all, not which
cards qualify. Without it the player is asked which hero to hand over and the
step behind then skips on the same empty slot, which reads as a bug from the
table.

**Every choice says what it is FOR, and only the task can.** Each
choice-opening task takes a `question` — "Choose a hero to sacrifice", "Choose
a player to take a card from" — which rides in the window's detail and which
the board puts up in large type over the choice (the owner, 2026-09-07). The
client cannot derive it: it receives a list of ids and knows neither the filter
nor the step that consumes the pick. The task cannot derive it either — a step
decides about itself, never about its siblings (§2) — so the verb comes from
the ability author, who is the one who knows the choice feeds a `SacrificeTask`
rather than a `DestroyTask`. It is DECLARED, in the same place and for the same
reason the filter is. A window whose task was given none falls back to a
generic prompt for its type, which is the screen admitting it was not told.

**A choice must not offer what cannot be carried out.** `PlayerFilter.hasHeroes`
exists because a wording's next clause can be about the chosen player's party
(Hopper's "They sacrifice one of their own heroes"), so an empty seat is a legal
pick that leads nowhere. The rule is the one `partyReqMet` follows for
monsters: an option offered is an option that can be acted on.

**A seat named by a card is a seat that need not be asked for.** Forced
Exchange is printed "Pick an opponent. Steal one of their heroes…", but
`getCardOwner` settles the seat from the hero, so pointing at the
hero chooses both and the reachable outcomes are identical. It therefore runs
the engine's one steal shape — `ChooseCardTask({ zone: Party, owner: Others })`
then `StealFromPartyTask`, the two lines Entangling Trap, Kit Napper, Whiskers
and Wiggles already declare — instead of a prompt of its own. A player choice
earns its window when the card acts on the SEAT rather than on something in it
(Heavy Bear, Hopper, Bear Claw's second pull).

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

`trigger` says when a pipeline _starts_. It cannot say how long what the
pipeline installed should _last_ — "your heroes cannot be stolen until your next
turn begins" is one ability run that finishes immediately and leaves something
behind. So the lifetime belongs to an `IEffect`, not to the entry.

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

- It has to ASK. Whether it is +1 or -1 is the player's choice, so it opens a
  `ValueChoiceWindow` and pauses. An effect has no behaviour and cannot pause.
- `RollBonus` is the wrong fact. It is seeded at window open and applies to its
  owner's roll; the Horn's number lands on _that_ roll — whichever the modifier
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

**A monster's PASSIVE installs on `MonsterSlain`; a monster's TRIGGER installs
nothing.** Mega Slime and the Warworn Owlbear leave an effect behind, so they
need the event that puts them in a party. Orthus and Malamammoth do not:
"whenever you draw a magic card" is a live trigger, and entries are re-derived
from the monster's position on every event (§7), so sitting in the party is
the whole of what keeps them running. Asking which of the two a wording is —
does something READ a value, or does something RUN steps — is the same
question §7 asks of every card.

**A monster reacting to a draw reads the event's `ctxSeed`.** `CardDrawn` carries
`{ [CTX_DRAWN_CARD_IDS]: [cardId] }` for the reason `ModifierPlayed` carries its
target: a TRIGGERED entry runs with a fresh context, so without it Orthus could
not tell which card was drawn. Snowball is the contrast — it draws for itself,
fills the slot from its own `DrawTask`, and ignores the seed entirely.

**A monster's passive installs on `MonsterSlain`, and never expires.**
`slayMonster` puts the monster in the party BEFORE it announces, so the monster
is among the sources when its own entry is matched — and a monster still in the
row has no owner to install on. Nothing removes a monster from a party
(`Party` has no `removeMonster`), so no expiry is declared: absent means
permanent. Mega Slime (monster-123) and the Warworn Owlbear (monster-135) are
the two references, and differ only in which `PassiveType` they install.

**`ModifierCounterBonus` is an effect for the third time the same argument
lands.** The Abyss Queen (monster-129) answers a modifier ANOTHER player put on
one of its owner's rolls, and that number has to arrive inside a window which is
already open — no pipeline is running at the moment a bonus is submitted, so
there is nothing to trigger.

`GameState.counterBonusesFor(targetPlayerId, byPlayerId)` is the whole rule,
and it sits on the BOARD rather than in a window because both window shapes
need it and only the pushing differs — a plain roll has one bonus list, a
challenge has two and picks the side that was aimed at. "ANOTHER player" is the
guard inside it, in one place: no trigger scope says it, because the effect has
no trigger at all. Both windows push the result before their announcement, so
the `finalRoll` the table is told already counts it.

`RollBonus` moved to `interfaces.ts` for the same reason. It is the shape
`GameState`, both window kinds and the emitted payloads all share, so it
belongs in the contract layer rather than on whichever class happened to
declare it first.

**`ActionPointBonus` is an effect for the same reason `RollBonus` is.** The
turn's budget is settled inside `TurnManager.startTurn`, right after
`resetActionPoints` and before `TurnStarted` is even emitted — there is no
pipeline around at that moment to ask, which is exactly the case effects exist
for. An entry triggered on `TurnStarted` would arrive after the budget was
already fixed. Read as ENTRIES and summed, so two monsters grant two points and
each keeps its source.

**A prohibition is an effect like any other, and can be scoped to one CARD.**
The Sealing Key (item-076) installs `CantUseHeroEffect` with `scopedToCarrier`,
so it seals the hero it rides rather than every hero its owner fields.
`GameState.canUseHeroEffect` is the reader, asked by both halves of rolling on
a hero — the action in `canExecute` before the point is spent, the task when it
discovers its target. The universal roll offer in `hero-rules.ts` needs no third
guard: it fires on `FrameResolved` naming the HERO, which only a hero's own play
produces, and a hero cannot already be wearing a key when it is played.

**A number does not care which way it points.** The Curse of the Snake's Eyes
(item-074/075) is the Really Big Ring with `value: -2`, and shares its whole
declaration shape. That is what keeps "+2 to the carrier" and "-2 to the
carrier" one mechanism instead of a bonus system and a penalty system.

**Wise Shield (hero-028)** — the reference effect. _Add 3 to every roll you
make for the rest of this turn._

```ts
[0] { on: RollSuccess, scope: SelfCard }
    [ApplyEffectTask({ passive: { type: RollBonus, value: 3 }, expiry: untilEndOfTurn })]
```

One entry, because nothing pauses. The effect installs _after_ the roll that
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
  `untilOwnersNextTurn`, `untilSourceLeavesParty`, `untilUnequipped`,
  `whileClassInParty(cls)` — so all card wordings read in one place. Each is
  named for what ENDS it, not for the state it holds under: "while equipped"
  read as a standing condition and hid the fact that a steal passes THROUGH the
  ending event on its way to re-installing.
- **An item's ABILITY ends with its position for free; an effect it installed
  does not.** The ability is derived from the item sitting on a hero, so it
  stops being scanned the moment that stops being true. Anything the item put on
  the player is stored, and needs `untilUnequipped` to go with it — Really Big
  Ring is the reference.
- **An item's effect INSTALLS and EXPIRES on the two events its POSITION changes
  on**: `ItemEquippedToHero` and `ItemUnequipped`. One door each, and the
  symmetry is the point — it is what carries a bonus across a STEAL. A steal is
  unequip → move → re-equip, each half announced, so the effect retires from the
  loser and installs on the thief with no bookkeeping. Before this an item
  installed off its own settled challenge frame while expiring on the carrier
  leaving, and a stolen hero kept the item but silently lost everything it
  granted.
- **`Party` announces both halves; nothing moves gear silently.** `removeHero`
  takes the item off and emits `ItemUnequipped` BEFORE it announces the removal;
  `addHero` re-equips and emits `ItemEquippedToHero` AFTER the hero is in, so
  the item's own entry finds its carrier standing in the new party. That is why
  `untilUnequipped` needs one event and no state check — it reads the event's
  own item id, the only reliable answer while the item is momentarily on nobody.
- **A defeated play is undone by the ROLLBACK, not by never installing.** The
  effect lands inside the challenge frame, and effects are stored on `Player`,
  which frames snapshot, so a lost challenge takes it back out. The end state is
  what it always was; what changed is that the install point now matches the
  expiry point.
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
  _require_ an emitter and a reason, so they always announce the canonical
  `HeroAddedToParty` / `HeroRemovedFromParty { cardId, playerId, reason }`
  alongside whatever specific event the caller emits. Expiries subscribe to the
  canonical pair, so a new mechanic is one new `reason`. Making the emitter a
  parameter turns this from a convention into a compile error.
- **A steal is remove-then-add**, so both halves are announced. `GiveHeroTask`
  is the same movement pointed the other way — out of the ability owner's party
  instead of into it — and is a new REASON (`Given`) rather than a new event,
  which is the extension point membership was built with. Forced Exchange
  (`magic-057`) runs both in one entry.
- **Three removals, and the ZONE and REACH are what tell them apart.**
  `SacrificeTask` takes a hero out of the ability owner's OWN party;
  `DestroyTask` takes one out of ANY party, so it finds the party from the hero
  via `getCardOwner` the way `StealFromPartyTask` does, rather than assuming the
  owner's; `DiscardTask` takes a card out of the owner's own HAND and touches no
  party at all. All three read a context slot and default to `CTX_CHOSEN_CARD`,
  because the card is always somebody's pick. `HeroDestroyed` names the party
  that LOST the hero rather than the one that caused it — Dracos (monster-126)
  reacts to a hero in its OWNER's party being destroyed, and needs the loser to
  scope against.
- **A defeated play is DISCARDED at settlement, not restored.** The card was
  taken out of hand _before_ the snapshot, so rollback alone leaves it in no zone
  at all. `ChallengeWindow` adds it to the discard on the challenger-wins branch,
  **after** the restore (which swaps in the snapshot's pile), with no
  `CardDiscarded` event — `ChallengeResolved` already reported the defeat. Cards
  _spent_ during the window need nothing here: `restoreFrame` has already put
  them away, from the list the frame kept (§1).
- **A card that SURVIVES a challenge is marked**, so it cannot be challenged
  twice in a turn; `TurnManager.startTurn` clears the list alongside the ability
  slots. Only the winning branch marks: a card whose challenge succeeded is in
  the discard anyway.
- **A REACTION is the play; the registry is the effect.** `PlayModifierReaction`
  and `PlayChallengeReaction` spend the card, keep the window alive and
  announce `ModifierPlayed` / `ChallengePlayed`. What the card DOES —
  `[ApplyModifier]`, `[StartChallenge]` — is its own entry, keyed by id like
  every other card type. A modifier's VALUE comes with the play, the way a
  target does: `PlayModifierReaction.canExecute` verifies it against the
  card's printed `values` and refuses `ValueNotOnCard` before anything is
  spent, and `ModifierPlayed` carries it as `ctxSeed` to the card's entry, so
  the entry is one step and opens no window. The value is unforgeable because
  the card decides what it may be, not because the player is asked twice. All
  25 printed copies share one declaration and all 14 challenges share
  another.
- **The Protecting Horn is why that split pays.** A leader granting a further
  +1 or -1 on each modifier you play runs the same `ApplyModifier` a card
  runs, with a `ChooseValueTask` in front of it asking its own two numbers —
  the one `ValueChoiceWindow` left in the engine. Before it, nothing
  could put a bonus into an open window except the reaction that spent a card.
- **`ApplyModifierTask` must not park on the roll's frame.** Reading "the card
  is not finished until the roll is" as a pause would deadlock: the pipelines
  underneath wait on the same frame, so a second bonus on the same roll — the
  Horn's, riding a card's — would never run. The card stays on the table by
  sitting in the instance zone instead, which settlement reads off the board.

## 8. Known limitations (deliberate, documented)

- **`GameState` is the engine's one big class, on purpose — for now.** Since
  2026-09-04 nothing outside `game-state.ts` mutates a `Player`, a `Party` or a
  pile, so every mutator has a one-to-one door on the board, and most of the
  file is those thin setters and getters rather than logic. That is why it is
  long, not why it is wrong. A later pass may group the doors by zone
  (hands, parties, piles, effects) into modules the board composes; not now.

- **No failure branches.** `restoreFrame` couples "undo state" with "cancel
  the run", so "roll; if you fail, discard instead" is currently impossible.
  What IS possible is somebody else's entry on the announcement: both failing
  paths emit AFTER the restore — `RollFailed` from `ModifierWindow`,
  `MonsterFoughtBack` from `AttackWindow` — so what answers is a fresh pipeline
  on live state, not the rolled-back one carrying on. The Particularly Rusty
  Coin (item-062) keeps the card it drew for exactly that reason. The
  limitation is that the failing run itself cannot continue, not that failure
  is invisible.
- **`when` discriminates confirm/condition labels only.** A wording like "when a
  hero enters your party BY BEING STOLEN" has no matcher, even though `reason`
  is already in that payload.
- **No else-branch on a condition.** `ConditionMet` fires only when the test
  holds; "if Magic do A, otherwise B" needs two conditions with opposite labels.
- **A card choice cannot tell a COST from an OFFER.** `CardChoiceWindow`
  defaults to a random option, which is right for a price — Critical Boost's
  "then discard one" lands whether or not the player answers — and blunt for an
  offer: an idle Wiggles steals a hero it was only ever _invited_ to steal.
  Nothing distinguishes the two, so both get the same default. Marking which
  choices are costs is the outstanding design work; the defaults themselves are
  one override each.

- **A lost challenge cancels whatever played the card.** `PlayMagicTask`
  suspends its own entry on the challenge, so a defeat rolls back the steps
  behind the play too — Snowball's second draw goes with it. That follows the
  frame rule (a lost challenge takes a hero's roll offer with it the same way,
  by removing the hero that would have been offered one), but it is
  a rule about _where the snapshot was taken_, not a judgement about the
  wording. A card that should keep its tail would need the play to be the last
  step of its entry.
- **Nothing stops two challenges nesting.** A magic card played by an ability
  opens a challenge from inside a pipeline. Every ability that plays one has
  settled its own window first, so the case does not arise; nothing enforces it.
- **The Horn's nested value choice races the roll's own timer.** The choice
  window is given a shorter timeout than the roll, and the burn resets the
  roll's, so the ordinary case is safe. A player who sits on the Horn's
  question can still let the roll lapse; `ApplyModifierTask` checks `isOpen()`
  and drops the bonus rather than submitting into a settled window. The card's
  own bonus is not exposed to this: it lands inside the play's own emission.
- **A magic card with no registry entry is stranded in the instance pile.**
  Disposal hangs off `AbilityDone`, which is emitted when a PIPELINE leaves the
  stack. A card with no entry never gets a pipeline, so nothing ever announces
  it finished. The obligation shrank — every magic card needs an _entry_, not a
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
- **`CantBeChallenged` is wired; `CantChallenge` was never declared.** The
  Warworn Owlbear (monster-135) is the reader's only user: `IEffect.cardTypes`
  narrows it to Items, `GameState.canBeChallenged` answers, and
  `ChallengeWindow` asks at construction and runs a **0ms clock** when the
  answer is no. The frame still opens and still settles — a played card's own
  steps trigger on the settled frame (§1), so skipping it would silently kill
  the item's ability. What the protection removes is the time anyone had to
  answer, not the frame.
- **`CantBeStolen` guards the steal but does not filter choices** — a protected
  hero can still be _offered_ by a `ChooseCardTask`; the steal then no-ops.
- **`MonsterChoiceWindow.canSubmit` re-asks `canAttackMonster` because a hero
  can leave the party while the window is open.** Under the rule that an
  offered option stays legal (§4), the board moving under an open choice
  window is the defect — the window should be closed or rebuilt when the
  party changes — and the re-check is where that defect is reported, not a
  tolerance for it. `isStillValid`, the same re-check at RESOLVE, still drops
  a stale default quietly; it belongs in the same fix.
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

- **`CONFIRM` / `DISMISS` live in `reactions/task-choice-window.ts`.** They are
  wire vocabulary — the options a `TaskChoice` window offers and the value a
  client sends back — so they belong in `shared` beside the rest of it. Left
  where they are because moving them touches 95 call sites.
- **No `TriggerScope` matches "the event TARGETS my owner".** `ModifierPlayed`
  names the player who spent the card, and `targetPlayerId` — whose roll it was
  aimed at — is readable only from the payload. The Abyss Queen wanted it and
  no longer needs it, since the bonus became an effect the windows read; a
  future steal or challenge wording may bring it back.
- **Ten of the fifteen monsters are unwritten.** The five that are done
  (`monster-123`, `129`, `131`, `134`, `135`) are the pattern for the rest.
- **68 card ids declare an ability** — 3 heroes, 8 items, 7 magic, 5 monsters,
  all 6 leaders, all 25 modifiers (one declaration between them) and all 14
  challenges (another). Every printed leader is written; every printed
  modifier and challenge shares one declaration with its copies.
- **The thirteen one-off declarations** — `hero-028` (Wise Shield), `hero-036`
  (Wiggles), `hero-040` (Snowball), Critical Boost (`magic-053`, `magic-054` —
  two printed copies sharing one declaration), Really Big Ring (`item-064`,
  `item-065`), Suspiciously Shiny Coin (`item-073`) and all six leaders
  (`leader-116` … `leader-121`). The Shadow Claw (`leader-117`) is the
  reference ACTIVATED card: it declares none of "once per turn, you may spend
  an action point", because every clause of that is a guard in
  `RollOnLeaderAction`.
  Critical Boost is the reference MAGIC card: one entry that pauses on a choice
  and finishes as a later step of the same run. The Destructive Spell
  (`magic-049`/`050`) is the same shape stretched over TWO choices — price then
  payoff, in printed order, with each acting step directly behind its own
  choice because the second pick overwrites `CTX_CHOSEN_CARD`. Forced Exchange
  (`magic-057`) takes a hero out of ANY other party and hands one back to
  whichever party that was: two windows, one entry, the seat derived from the
  stolen hero (`CTX_STOLEN_FROM_PLAYER`) rather than asked for, and the gear
  travels both ways for free. `Owner.Chosen` is the late binding §5 exists for
  and Heavy Bear (`hero-004`) is its reference — a card that acts on the SEAT,
  so the seat is worth a window of its own. The
  Enchanted Spell (`magic-055`/`056`) is Wise Shield's wording on a magic card
  and shares its declaration exactly — what a card IS has no bearing on the
  shape of what it does. Really Big Ring is the
  reference ITEM — an on-equip effect that ends with its carrier — and
  Suspiciously Shiny Coin the reference CURSED item, riding an opponent's hero
  and taxing that opponent on `CarrierCard` scope. The Cloaked Sage
  (`leader-120`) is the reference for a leader reacting to a card its owner
  plays: `MagicPlayed` scoped `OwnerEvent`, because `FrameResolved` carries no
  playerId and names the played card rather than the leader.
  `abilityRegistry` is sectioned by card type and sorted by id inside each
  section, so a card has one obvious home.
- **No monster carries a fight-back wording yet.** The path is whole —
  `MonsterFoughtBack` goes out naming the attacker, the pile is scanned for
  sources, and `TriggerScope.Attacker` runs the monster's entry as that player
  — but `abilityRegistry` holds no monster, so nothing answers it in a real
  game. Pinned by tests with a stand-in registry.
- **A monster's face-up penalty has no reader.** The ruleset gives every
  monster a table-wide roll penalty while it sits face up in the row, and
  `GameEventType.MonsterFlipped` is declared with no emitter.
  Nothing turns a monster face up, there is no face-up state to turn, and a
  table-wide roll penalty has no home: `IEffect` names an `ownerId` and lives on
  a `Player`.
- **`DecisionType.PickMonster` still has no reader.** `ChooseMonsterTask` and
  `ReactionWindowType.MonsterChoice` cover the mechanic; the `DecisionType`
  enum is a parallel vocabulary nothing consults.
- ~~`views/player-view.spec.ts` "shows the whole table a roll as it stands" is
  nondeterministic~~ — FIXED 2026-09-04: the case deals from quiet leaders
  (`dealtQuiet`), so `bonuses: []` is true by construction.
- **`IRollResolver` has no implementers.** Declared in `interfaces.ts`, shaped
  like `MonsterCard.trySlay`, and read by nothing.
- **Add `tsc --noEmit` to CI** — ts-jest runs diagnostics off; type breakage
  passes the suite silently.
- **`npm ci` is incomplete in some checkouts** — `@nestjs/testing` and eslint's
  deps are declared but unresolvable. Unrelated to engine code.

## 11. Setup

`setup/create-game.ts` turns `GameConfig` plus a list of player ids into a
dealt, wired game. It is the only thing that builds a `GameState` — everything
else receives one — and it sits below the transport deliberately: how the
request arrived is not the engine's business, so it takes player IDS and
nothing else. The one concession is `CreateGameOptions.names`, what each
seat is CALLED (2026-09-03, for the socket transport): display only,
nothing in the engine reads it, defaulting to the id exactly as before, and
shaped like the `cards` option — a thing the caller may fix rather than a
thing the engine needs.

**Card DATA becomes card OBJECTS in one place.** `cards/card-factory.ts` holds
the only switch from `CardType` to a card class, and it is exhaustive, so a new
card type is a compile error rather than a card that never reaches the table.
That is two of a card's three tables meeting (§1); the third — its BEHAVIOUR —
is joined at runtime through `ctx.sourceCardId`, which is how one modifier
declaration reads whichever printed copy's `values` it is running for.

**Every card in the pool is registered, wherever it starts.** A card the engine
cannot resolve by id is a card no rule can act on. Leaders beyond the seat count
stay registered and sit in no zone: `abilitySources` scans positions, so nothing
scans them.

**Dealing and starting are separate.** `createGame` deals; `startGame()` emits
`GameStarted` and opens the first turn. The split exists because the first
`TurnStarted` is a point of no return, and a caller may want to hold a dealt
table while the last player connects.

**Three ordering rules the setup encodes, every one of which fails SILENTLY:**

- `TaskManager` joins the emitter BEFORE `GameEngine` (§8).
- Leaders are seated BEFORE `GameStarted`, or the three leaders carrying a
  passive install nothing.
- `GameStarted` goes out before the first `TurnStarted`.

**An optional question is the window's own declaration.** Every window
implements `isOptional` — true for a `TaskChoice` offering DISMISS (the
"roll on the played hero?" offer, a leader's offer to draw) — and the view
projects it as `PendingWindowView.optional`. The client dismisses such a
question before it sends any other action, so the table never waits on an
offer the player has already walked away from.

**A turn's clock is CONFIG too, it PAUSES under any window, and a lapse is
a pass.** `TimeControl.turnTimeMs` is the whole of it: `TurnManager` gives
each turn that much at `startTurn`, forgets it at `endTurn` and when
`GameEngine` concludes the game mid-turn, and does nothing at all when the
config names no clock — which is what every engine spec plays on. The
clock runs only while no reaction window is open, whoever's it is:
`TurnManager` listens for `ReactionWindowOpened` (pause, the elapsed part
taken off what is left) and `FrameResolved` (run again once `hasOpenFrames`
is false — the settle, not `ReactionWindowClosed`, because a roll or a
challenge announces its close before it settles its frame, so at its Closed
the frame still stands), which is why it is on the emitter at all — it reads
nothing else there, so the §8 ordering of TaskManager and GameEngine is
untouched. When it lapses the board is idle by construction (a pipeline
can only be parked on a window; a busy board at a lapse throws), the budget
is forfeited and the drain ends the turn through the one rule that ends
every turn. A lapse carries the number of the turn it belongs to, so one
that outlives its turn does nothing. The lobby's turn timer becomes this
one number (`game-server/game-config-for.ts`); `setup/turn-clock.spec.ts`
proves it on a dealt table.

The screens read it as `PlayerView.turnClock` — one clock for the table.
It carries the budget plus exactly one of two readings: `deadline` (epoch
ms) while it runs, `heldMs` while a window holds it. A deadline rather than
a countdown, so every snapshot of one running turn carries the same number
and two views taken a moment apart compare equal. The screen counts the
seconds between snapshots itself (`client/src/board/TurnTimer.tsx`) and
draws a held clock still and dimmed rather than dropping it.

**A window's countdown is CONFIG, and each window takes a share of it.**
`TimeControl.reactionCountdownMs` is the base — the CHALLENGE window's wait,
the lobby's fast / moderate / slow (5, 10, 20 s; `REACTION_SPEEDS` in
`shared/src/contracts/game-settings.ts`) — and `WINDOW_SHARE` in
`reaction-manager.ts` gives each kind its slice: a hero roll and every
question the same as a challenge, an attack TWICE it. A share rather than a
number, so one value moves them all together and the RELATIONSHIP survives — a
`ValueChoice` is 0.6 of a roll's because it opens over a roll already running
and must settle first, and at equal countdowns both fall due on the same tick
and the roll wins without the bonus. The two ZERO cases are not shares: an
empty `ChoiceWindow` and an unchallengeable `ChallengeWindow` settle at 0ms
whatever the countdown.

`setup/play-through.spec.ts` drives real turns on a real dealt table for exactly
that reason, and `setup/full-game.spec.ts` drives one whole game through the
same harness — three seats, a stacked deal, scripted dice — from the first
turn to `GameEnded`, and then checks that every card the deal put on the
table is still in exactly one place. The harness itself is
`setup/play-through-helpers.ts`. Wiring order, cross-pipeline event ordering,
frames that never settle and turns that never end are all invisible to a unit
test. It runs on a
**150ms countdown and a real clock**, not on fake timers. Advancing fake timers
means guessing how many windows a move opens, and guessing low reads as a
passing test — which is how a fight-back's choice window went unnoticed there.
Polling until the board reports itself idle, with a deadline that throws, cannot
make that mistake — and it asks `PlayerView.busy`, so it cannot disagree with
the drain about whether anything is still running.

**It reaches the engine only where a PLAYER does.** Four doors: `enqueue` an
action, `submitReaction` a card, `submitChoice` an answer — each returning a
`RequestResult` (§4) — and read `playerView`. `GameState` is never touched — not to stack a board, not to
decide a move, not to check a result. That is the constraint doing the work
rather than a style rule: every position it reaches is one the API can reach,
so a case that cannot be written here is a case a real client cannot play, and
a field missing from `PlayerView` shows up as a test nobody can express.

**A case that needs particular cards STACKS THE DEAL, it does not write to the
board.** `Math.random` is pinned across `createGame` only, which makes
Fisher-Yates the identity: the seat order, the leaders and the main deck all
come out in the order the test wrote them, and the deal becomes a fact rather
than a coincidence. Two details ride with it — the three leaders carrying a
`RollBonus` are kept out of stacked tables so the dice mean what they say, and
the win conditions are pushed out of reach because `AllClassesInParty` asks the
POOL which classes exist, so a stacked deck of two Fighters makes "every class"
mean "one Fighter" and the first hero played wins the game.

**Its `endTurn` helper is a pass.** It enqueues `EndTurnAction` and waits for
the active seat to change, so a case that only wants the next turn does not
have to find a legal way to spend the budget.

`Game` is data — the pieces a caller drives — so `startGame(game)` is a
function OVER it rather than a method on it. A closure in the bag would be the
one thing in it that could not be inspected or handed across a boundary.

**The default deal is the complete printed set (second playtest,
2026-09-04).** `createGame` draws from all 136 records in `baseGameCards`, then
applies `config.cardSets`. That gives the table all 48 heroes, 15 items, 13
magic cards, 25 modifiers, 14 challenges, 15 monsters and 6 leaders. A
caller's own `cards` list is still dealt as given, which is how specs stack a
particular table. The first playtest temporarily filtered the pool through the
ability registry; that gate was removed once every printed id had a registry
entry. `AllClassesInParty` continues to require `HeroClass`'s six members,
whatever custom pool was supplied.

## 11b. HTSR-8 — the mechanics the remaining cards needed (2026-09-04)

Six additions, each named by the card wordings it unlocks. Every one is a
task, a filter field or an effect type — no new pipeline construct — and the
declarations in the registry read like the ones before them.

**A choice asked of ANOTHER player.** `CardFilter.executor: 'chosen'` opens
the CardChoice window for the seat in `CTX_CHOSEN_PLAYER` instead of the
ability owner, over that seat's own zone (`Owner.Chosen`): "they discard a
card" is the victim's pick over a hand only they can see. The
step that acts then runs as the same seat: `DiscardTask` and `SacrificeTask` take
`executor: 'chosen'` (`executorOf` in tasks.ts, the mirror of the choice's
`respondent`), so the card leaves the victim's hand and the hero the
victim's party, and the announcement names the victim as the loser. Heavy Bear, Hopper. Rejected: a second task class per victim
variant — the only thing that changes is who answers and who pays.

**"Every opponent …".** An entry's steps run once, in one line. A
per-seat wording runs the same steps once PER seat, each waiting for that
seat's answer: `ForEachPlayerTask(filter, label)` announces one
`PlayerTargeted` per matching seat with the seat riding in `ctxSeed` as
`CTX_CHOSEN_PLAYER`, and the card's continuation (`on: PlayerTargeted,
when: label`) runs once per announcement with a fresh context — the hand-off
CardTypeCondition and ConfirmTask already use. The runs an event starts go on
top of the stack and finish last-in first-out, so the seats are announced in
reverse and resolve in seat order; a step after the loop in its own entry
runs once every per-seat run has finished. `PlayerFilter.hasClass` keeps
"who has a Fighter in their party". Spooky, Greedy Cheeks, Tough Teddy, Smooth
Mimimeow. Rejected: a repeater task holding sub-steps — a step that
suspends inside a loop has nowhere to resume from in this pipeline; the
event hand-off is the pipeline's own way of continuing.

**A card back from the table into a hand.** `RetrieveCardTask(fromKey, to)`
finds where the chosen card is and moves it: out of the discard pile
(Lookie Rookie, Guiding Light, Radiant Horn, Bun Bun, Call to the Fallen —
one declaration, `discard-search-abilities.ts`), off a hero's gear through
`Party.unequipItem` with `ItemUnequipped` announced so the item's effects
expire (Holy Curselifter; Winds of Change with `to: 'cardOwner'`, the item
goes HOME), or out of another player's hand as a CHOSEN card, announced as
CardPulled (Silent Shadow — the look IS the CardChoice over that hand).
`ReturnAllItemsTask` is the whole table's gear going home (Forceful Winds).
`CardFilter.cursed` keeps a cursed or a plain item. New event
`CardRetrieved { cardId, from }`.

**CantBeDestroyed.** A `PassiveType` read by `GameState.canBeDestroyed`
against the hero's OWNER at the moment of the attempt, so a hero that joined
after the rule was rolled is covered; `DestroyTask` leaves the hero where
it stands, silently. Sacrifice is another reason and is not shielded — a
fight-back still costs a hero. Mighty Blade (until the owner's next turn),
Terratuga (no clock, Owlbear's shape).

**A class the board reads.** A mask's class is data
(`ItemCardData.heroClass`) and `GameState.getHeroClass` DERIVES a hero's
class from what it wears: nothing is set on equip, nothing reverted on
unequip — the moment the mask comes off, by any route, the default class from the data is what every reader sees. Every reader goes through that one method: party
requirements, the "every class" win, the class choice filter,
`whileClassInParty`, `hasClass`. A party answers with TWO lists, and which one a
reader wants is the whole distinction. `GameState.getHeroClasses` is one
class per hero and nothing else: it is what a monster's `partyReq` is
matched against, because a leader is not one of the heroes a monster asks
for, so a party with no heroes fields nothing and cannot attack even an
'Any' monster. `GameState.getPartyClasses` is the leader's class first,
then the heroes': it is what the six-class WIN and the `hasClass` choice
filter read, because the rulebook counts the Party Leader there (a class
can come from a hero or from the leader). The six masks are registered with an
EMPTY rule list, because the deal is the registry. Rejected: setting the
hero's class on equip and restoring it on unequip — two mutations to keep
in step, and a steal carries the gear across parties without either running.

**Round two of the small gaps (2026-09-04).** `DrawTask(count, executor)`:
a NEGATIVE count draws "until you hold that many" (`-7` is Wily Red, `-5` is
the redraw, which now shares the mechanic), one CardDrawn each, and
`executor: 'chosen'` draws for the chosen seat (Plundering Puma's "that
opponent may then draw"). The chosen seat now RIDES across a condition and a
confirm (`carriedSeat` in conditions.ts, added to their `ctxSeed`), so a
continuation keeps acting on "that player" — Fury Knuckle and Bear Claw pull
one more card from the same hand, and `ConfirmTask` takes `executor:
'chosen'` so the victim answers their own "may". `CTX_SOURCE_CARD` is the
context's own card as a slot, set at birth, so a step that reads "the hero
to move" from a slot can be pointed at the card itself (Tipsy Tootie joins
the party it stole from). `TriggerScope.TargetsOwner` is ANOTHER player's
event aimed at one of my owner's cards (`payload.targetedCardId` is ours,
the event's player is not); the matched run gets that player as its chosen
seat, so "they discard a card" reads them (Bloodwing).

**A leader's own event, and two replacement effects (2026-09-04).**
`RollOnLeaderAction` announces `LeaderActivated`, not a RollSuccess: a rule on
"whenever you succeed on a hero ability roll" (Arctic Aries) must not fire on
an activation. The Shadow Claw's entry and the activatable-leader predicate
(`isActivatable`, was `firesOnOwnRoll`) read the new event. Two effects
change what a step of the owner's DOES rather than running steps of their
own: `StealsInsteadOfDestroy` (Corrupted Sabretooth, on its slayer) makes
`DestroyTask` run `StealFromPartyTask` for another party's hero instead of
destroying it — the theft announces itself and honours CantBeStolen; a hero
of your own is destroyed as printed. `TakesTheHit` (Decoy Doll, scoped to its
carrier, until unequipped) makes `DestroyTask` and `SacrificeTask` take the
doll off the hero (ItemUnequipped, which also ends the effect) and put IT on
the pile; the hero stays (`decoyTakesTheHit` in hero-tasks.ts). Order of
the reads in a destroy: CantBeDestroyed, then the doll, then the steal.
Approximation, in the backlog: the Sabretooth's printed "may" is not asked —
the steal always happens; a yes/no inside a destroy would need the step to
suspend.

**Reveals, and choices fed from a slot (2026-09-04).** A look is not a
decision, so it is not a window: `RevealTask({ fromKey | filter, to })` puts
cards on a seat's `revealedCards` (`GameState.revealTo`, `to: 'all'` for
every seat), announces `CardsRevealed`, and a clock (`REVEAL_MS`, 5 s)
takes them off again with `RevealEnded` so the table sees the change. The
client decides how to show them; nothing is asked and the table is not held.
Sharp Fox is a look; Pan Chucks and Rex Major reveal the drawn card to the
table on their yes and stop being approximations. Bullseye is two steps
(the owner's shape): a choice over `Zone.MainDeckTop` with `top: 3` — the
options are the look, nothing moves — and `DrawTask(CTX_CHOSEN_CARD)`, which
draws the NAMED card out of wherever it lies (`GameState.drawNamedIntoHand`,
announced as a draw); the queue closes over the gap by itself, so "put the
other two back on top" is what the deck already does. Rejected the same hour:
a peek task writing the top three onto the context and a move-to-top task
for the leftovers — stored what the deck derives, and put back what never
left. Half reversed 2026-09-06: "in the order you choose" is the player's call
(the owner), so two steps follow the draw — a `CardChoice` over the deck's top
two (`CTX_DECK_TOP_CARD`, its `question` in the detail so the picker says
what is asked) and `ReturnToDeckTopTask`, which moves the chosen one to the
top (`GameState.moveToMainDeckTop`); the other is second by itself. Still no
peek onto the context. Rejected: a reveal window with a
timer the engine enforces on the player — a window gates actions, and a
look gates nothing.

**Round five (2026-09-04) — the last six.** Two picks in one entry get
two slots: `ChooseCardTask(filter, { resultKey })` files the pick where
it is told (the window carries the slot), so Hook keeps its item in
`CTX_CHOSEN_ITEM` while the hero pick takes the default. A choice skipped
on its precondition now WRITES an empty pick rather than leaving the
previous one in the slot. `DiscardTask` says what it discarded
(`CTX_DISCARDED_CARDS`, written on every run), which is all Qi Bear's "for
each card you discarded" needs: each round's choices hang on the round
before, and "up to" is picking nothing. "Every opponent discards one card"
(Beary Wise) became the PARALLEL CHOICE FRAME, the owner's shape: a frame
may hold one question per seat. `ChooseCardEachTask` opens one frame with
one CardChoice window per asked seat, each over that seat's own cards and
each filed under its own slot (`chosenCardOf(seat)`, via `resultKey`);
`ChoiceWindow.resolve` releases the frame only when the last window in it
has settled, and the one `FrameResolved` carries every window's write
(`result` may be a list; TaskManager files them all). The table answers
together, the pipeline wakes once, and everything stays in one context —
no `PlayerTargeted` run per seat, nothing to carry back. `DiscardEachTask`
then discards each seat's pick from its own hand and writes the lot to
`CTX_DISCARDED_CARDS`; the owner's choice is the pile LIMITED to that
(`CardFilter.among` — a limit, not a source, so the zone still has to hold
the cards). Rejected the same hour: a mark-and-count on the discard pile
around a per-seat loop (it worked, but it read the board to recover what
the per-seat contexts could not hand back — and the seats had to answer
one at a time). The four other per-seat cards (Tough Teddy, Spooky, Greedy
Cheeks, Smooth Mimimeow) still go seat by seat on `ForEachPlayerTask`;
the same two tasks would let them answer together. `DestroyTask` names the gear that fell (`CTX_DESTROYED_HERO_ITEM`);
it still drops on the pile silently, and Shurikitty's "goes to your hand
instead" is a retrieve straight after — two moves, no discard announced
between them, which is the owner's reading of how fallen gear should
behave. `TradeHandsTask` swaps two whole hands through the hand doors and
announces one `HandsTraded`, not a pull per card. Crowned Serpent is a
declaration: `ModifierPlayed` on `Anyone`, a confirm, a draw. Rejected: a
per-seat discard writing a counter for its parent (contexts do not share),
and a destroy variant that hands the gear over itself (the retrieve
already exists).

**Round six (2026-09-04) — a choice of action; the per-seat loop
retires.** `TaskChoiceWindow` now takes N action LABELS as its options:
picking one announces `TaskConfirmed` with that label, the one `silent`
label (the last) announces nothing and is what a timeout picks; a confirm
is the two-label case, CONFIRM standing for its `confirms` label, DISMISS
silent, so nothing on the wire changed for it. `ChooseActionTask({
actions, question?, subjectKey?, executor?, asCard? })` opens it; `asCard`
announces the question as another card's, so THAT card's entries continue
it. That is how Corrupted Sabretooth's "may" is asked from inside a
destroy: `DestroyTask`, finding the effect on the destroyer, parks the
hero in `CTX_WOULD_DESTROY` and returns the question's frame as the
Sabretooth's; the Sabretooth's own entries continue with the steal or
with `DestroyTask({ replaceable: false })`, which is the same destroy told
not to ask again. The client draws a label window as buttons. The four
per-seat cards moved onto the parallel frame (Tough Teddy and Greedy
Cheeks: `ChooseCardEachTask` + `DiscardEachTask` / `RetrieveEachTask`;
Spooky: + `SacrificeEachTask`; a shared `forEachAskedSeat` walk), and
Smooth Mimimeow, which asks nobody anything, is one `PullCardTask({ from:
<seat filter> })`. `ForEachPlayerTask` and `PlayerTargeted` had no readers
left and are gone (§12.1). `PullCardTask` also takes `count`, which with
`among` over the pulled cards is Slippery Paws — the registry is now the
whole set. Rejected: a per-card "destroy or steal" flag on DestroyTask
(the choice belongs to the card that grants it, not to every destroyer).

**Only GameState mutates the board (2026-09-04).** Nothing outside
`game-state.ts` calls a mutator on a `Player`, a `Party` or a pile: a task,
an action, a window or the deal asks the board through a door —
`addToHand` / `removeFromHand`, `addToDiscardPile` / `pickFromDiscardPile`,
`addHero` / `removeHero`, `equipItem` / `unequipItem`, `addInstanceCard` /
`removeInstanceCard`, `addEffect` / `removeEffect`, `increaseActionPoints` /
`decreaseActionPoints` — each the structure's own method, one to one. No
composite moves on the board: a pull is a `removeFromHand` then an
`addToHand`, spelled out where it happens. The doors are silent, announcing
stays with the caller (the reason is the caller's), except where the
structure underneath announces on its own (`Party.addHero` / `removeHero`). The owner's SOLID call; before it the
tasks reached into parties and players directly, which is what let a
retrieve task hold a `Party` it had no business holding.

## 12. Working principles

1. Delete anything with no readers — unreferenced scaffolding gets designed
   around later.
2. Fail loudly at the point of the mistake.
3. Derive rather than pass — don't thread values the receiver can compute.
4. "Deliberately none" is a value (`NO_CONTEXT_RESULT`), not an absence.
5. Data over closures.
6. One mechanism, not two — cancellation _is_ rollback; all windows settle the
   same way; confirms and conditions hand off the same way.
7. A step decides about itself, never about its siblings.

## Connection information and dice

The gateway sends `GAME_CONNECTED` (`game:connected`) once per socket connection,
including reconnects. It contains the public game config for the settings menu;
recurring snapshots contain only the current player view. The client keeps
connection information separately from snapshots.

Hero, leader, attack and challenge rolls use `utils/roll-utils.roll2Dice`: two
independent uniform d6. The exhaustive distribution test covers all 36 face
pairs. UI dice totals come from these server rolls.
