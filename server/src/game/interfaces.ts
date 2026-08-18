import {
  ActionType,
  GameEventType,
  IGameEvent,
  IGameEventEmitter,
  PassiveType,
  ReactionType,
  ReactionWindowType,
  RollResult,
  TriggerScope,
} from 'shared'
import type { GameState } from './game-state'
import type { AbilityContext } from './ability-context'
import type { NO_CONTEXT_RESULT } from './ability-context'
import type { Player } from './player'

// ---------------------------------------------------------------------------
// Turn actions
// ---------------------------------------------------------------------------

export interface IAction {
  getId(): string
  getType(): ActionType
  getPlayerId(): string
  getCost(): number
  isReactable(): boolean
  canExecute(gs: GameState): boolean
  execute(gs: GameState): void
}

/**
 * The turn's action queue, as an *executing* action sees it.
 *
 * Declared here rather than importing TurnManager for the same reason as
 * IReactionManager below: this module is the abstraction layer and must not
 * point back at an implementation. Only the member an action in mid-execute
 * actually calls belongs here — an action never starts a turn or drains.
 */
export interface IActionQueue {
  /**
   * Put `action` at the FRONT of the queue, so it runs before anything the
   * player had already queued. This is how one action spawns its own
   * continuation — playing a hero grants the free roll on that hero.
   */
  enqueueFirst(action: IAction): void
}

export interface IReaction {
  getId(): string
  getType(): ReactionType
  getPlayerId(): string
  canExecute(gs: GameState): boolean
  execute(gs: GameState, em: IGameEventEmitter): void
}

// ---------------------------------------------------------------------------
// Reaction system, as an ability step sees it
//
// Declared here instead of imported: this module is the engine's abstraction
// layer, so it must not depend on a concrete implementation. The lone
// `import type { ReactionManager }` that used to sit above was the edge every
// one of the five reported import cycles ran through — the abstraction pointing
// back at its own implementation. Only the members a step (or the processor
// draining one) actually calls belong here.
// ---------------------------------------------------------------------------

export interface IReactionManager {
  /** Snapshots GameState and inserts an empty frame. Returns the frameId. */
  openFrame(): string
  /** Builds a reaction window and inserts it into the given frame. */
  openWindow(
    frameId: string,
    type: ReactionWindowType,
    respondent: string,
    config?: Record<string, unknown>,
  ): void
}

// ---------------------------------------------------------------------------
// Ability tasks
// ---------------------------------------------------------------------------

export interface ITask {
  /**
   * Returns the frameId when this step suspended on a window, otherwise
   * nothing. That return value is the ONLY channel: `AbilityProcessor` reads it
   * to decide whether to park the rest of the pipeline.
   *
   * A step never decides anything about the steps AFTER it. It may skip its own
   * body when its input is empty, but silencing its siblings is not its call —
   * that belongs to frame settlement, where a lost roll, a lost challenge and a
   * dismissed prompt all cancel the same way (§3).
   *
   * It used to come back through a one-slot mailbox on `ReactionManager`
   * (`openFrame` wrote it, `takeLastFrameId` read it). That slot was global to
   * the manager while only tasks were meant to use it, so every action opening
   * a frame had to remember to wipe it — and forgetting let an unrelated
   * ability suspend itself on the action's window. A return value cannot be
   * left behind for someone else to pick up.
   */
  execute(
    gs: GameState,
    ctx: AbilityContext,
    em: IGameEventEmitter,
    rm: IReactionManager,
  ): string | void
}

/**
 * WHEN an ability runs: an event, plus whose events count. Shared by card
 * abilities and by ongoing effects, so the processor checks both the same way.
 */
export type AbilityTrigger = {
  on: GameEventType
  scope: TriggerScope
  /**
   * Which variant of the event this entry answers to, matched against the
   * payload's `label`. Scope answers "whose event"; this answers
   * "which one".
   *
   * A card that asks the same question more than once distinguishes its
   * continuations by labelling them apart — 'QiBearDiscard2', 'QiBearDiscard3'
   * — rather than carrying a separate counter.
   */
  when?: string
}

export interface IAbility {
  trigger: AbilityTrigger
  steps: ITask[]
}

// ---------------------------------------------------------------------------
// Ongoing effects
//
// An ability's `trigger` says WHEN its pipeline starts; it says nothing about
// how long anything the pipeline installed should last. "Your heroes cannot be
// stolen until your next turn" is one ability run that installs an ActiveEffect
// — the ability is over immediately, the EFFECT is what has a lifetime.
//
// Effects are plain data held on GameState, so they snapshot and roll back with
// a frame for free: an effect installed inside a frame that is later restored
// disappears along with the state it was protecting.
// ---------------------------------------------------------------------------

/**
 * One way an effect can end: a game event, optionally confirmed by a state
 * check. The event names WHEN to look; `shouldExpire` says WHETHER it is
 * really over — "while you have a Ranger" expires on HeroRemovedFromParty
 * only if no Ranger remains, so losing one of two Rangers changes nothing.
 *
 * `shouldExpire` belongs in the ability's own module, next to the declaration
 * that installs the effect — never as a method on a card class, which would
 * put behaviour back onto shared card data.
 */
export type EffectExpiry = {
  on: GameEventType
  /** Absent = the event alone decides. */
  shouldExpire?: (
    gs: GameState,
    effect: ActiveEffect,
    event: IGameEvent,
  ) => boolean
}

export interface ActiveEffect {
  id: string
  /** The card whose ability installed this. Identity for logs and self-matching. */
  sourceCardId: string
  /** Whose effect it is — the player expiry checks and queries resolve against. */
  ownerId: string
  /**
   * A standing rule flag: consulted at the point the rule applies (via
   * gs.hasEffect), never triggered.
   */
  passive?: { type: PassiveType; value?: number }
  /**
   * Optional triggered behaviour, making this effect an ability source in its
   * own right: the processor checks it alongside the cards in play, for as long
   * as the effect lives. Present together with `steps` or not at all.
   */
  trigger?: AbilityTrigger
  steps?: ITask[]
  /**
   * ABSENT = permanent. Monster passives are the canonical case: a slain
   * monster never leaves the party (Party has no removeMonster), so its
   * effect simply has no expiry. Multiple entries = first match ends it —
   * "on use OR at my next turn start" for a once-per-turn charge.
   */
  expiry?: EffectExpiry[]
}

// ---------------------------------------------------------------------------
// Win / roll resolution
// ---------------------------------------------------------------------------

export interface IWinCondition {
  check(gs: GameState): Player | null
}

export interface IRollResolver {
  resolve(finalRoll: number): RollResult
}

// ---------------------------------------------------------------------------
// Reaction windows
// ---------------------------------------------------------------------------

/**
 * A window a modifier card can be spent into.
 *
 * Both a plain roll and a challenge accept modifiers, but for different
 * reasons — one roll versus two — so each answers the target question its own
 * way. Declared as a capability rather than checked with `instanceof` so
 * PlayModifierReaction stays clear of concrete window classes (§9), and so a
 * test double can stand in for one.
 */
export interface IModifiableWindow extends IReactionWindow {
  /** True when a modifier aimed at `playerId` belongs in this window. */
  acceptsModifierFor(playerId: string): boolean
}

/** Base interface for any timed reaction window. */
export interface IReactionWindow {
  getId(): string
  getType(): ReactionWindowType
  /** True while the window is waiting for responses; false after it resolves. */
  isOpen(): boolean
  /** Route a player's reaction payload into the window. */
  submitReaction(playerId: string, payload: unknown): void
  /** Force immediate resolution (e.g. timeout, test helpers). */
  resolve(): void
  /**
   * Context key this window's outcome belongs to. The window type owns it — a
   * CardChoiceWindow always yields a chosen card — and also owns the value's
   * SHAPE at the emit site: choices write arrays because they may be
   * multi-select, a modifier writes a plain number because there is only ever
   * one final roll.
   *
   * Return NO_CONTEXT_RESULT when the outcome is not an ability input: a
   * confirm prompt says everything through release-vs-restore, and a challenge
   * that resumes at all was necessarily won. Those still reach the event log
   * via the window lifecycle events; they simply give ability steps nothing to
   * branch on. Every window must state which case it is — there is no default.
   */
  resultKey(): string | typeof NO_CONTEXT_RESULT
}
