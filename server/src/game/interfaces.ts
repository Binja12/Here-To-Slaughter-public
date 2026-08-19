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

/** Implemented by TurnManager; declared here so actions need not import it. */
export interface IActionQueue {
  /** Run `action` before anything already queued. */
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
// Reaction system, as an ability step sees it.
// Implemented by ReactionManager; declared here to avoid the import cycle.
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
   * Returns the frameId if this step suspended on a window, else nothing.
   * TaskManager reads it to decide whether to park the remaining steps.
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
  /** Matched against the payload's `label` — see TaskConfirmed, ConditionMet. */
  when?: string
}

export interface IAbility {
  trigger: AbilityTrigger
  steps: ITask[]
}

// ---------------------------------------------------------------------------
// Ongoing effects — stored on Player, swept by TaskManager.
// ---------------------------------------------------------------------------

/** One way an effect can end. Reusable expiries live in effects.ts. */
export type EffectExpiry = {
  on: GameEventType
  /** Absent = the event alone decides. */
  shouldExpire?: (gs: GameState, effect: IEffect, event: IGameEvent) => boolean
}

/**
 * A standing rule with a lifetime. An ability is the one-time run; what it
 * leaves behind is this, and this is only ever a rule somebody reads — never
 * behaviour of its own.
 */
export interface IEffect {
  id: string
  /** The card whose ability installed this. Identity for logs and self-matching. */
  sourceCardId: string
  /** Whose effect it is — the player expiry checks and queries resolve against. */
  ownerId: string
  /** Which rule this is, read via gs.hasEffect / gs.getEffects. */
  type: PassiveType
  /** Magnitude, for the rules that carry one. */
  value?: number
  /**
   * Narrows it to rolls ABOUT this card — absent means it applies to
   * everything the owner rolls. Read at the two roll sites, not here.
   */
  cardId?: string
  /** Absent = permanent. Multiple entries = first match ends it. */
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
 * A window a modifier card can be spent into. PlayModifierReaction probes for
 * this method rather than testing instanceof.
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
   * Context key this window's outcome is filed under; TaskManager writes
   * it on resume. NO_CONTEXT_RESULT when the outcome is not an ability input.
   */
  resultKey(): string | typeof NO_CONTEXT_RESULT
}
