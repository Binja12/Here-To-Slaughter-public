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
  /**
   * The frame opened since the last call, or null. Read by AbilityProcessor
   * after each step to decide whether to suspend the pipeline.
   */
  takeLastFrameId(): string | null
}

// ---------------------------------------------------------------------------
// Ability tasks
// ---------------------------------------------------------------------------

export interface ITask {
  execute(
    gs: GameState,
    ctx: AbilityContext,
    em: IGameEventEmitter,
    rm: IReactionManager,
  ): void
}

export interface IIfTask extends ITask {
  condition: (gs: GameState, ctx: AbilityContext) => boolean
  ifTrue: ITask[]
  ifFalse?: ITask[]
}

/**
 * WHEN an ability runs: an event, plus whose events count. Shared by card
 * abilities and by ongoing effects, so the processor checks both the same way.
 */
export type AbilityTrigger = {
  on: GameEventType
  scope: TriggerScope
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
