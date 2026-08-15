import {
  ActionType,
  GameEventType,
  IGameEvent,
  IGameEventEmitter,
  ReactionType,
  ReactionWindowType,
  RollResult,
} from 'shared'
import type { GameState } from './game-state'
import type { AbilityContext } from './ability-context'
import type { NO_CONTEXT_RESULT } from './ability-context'
import type { Player } from './player'
import type { ReactionManager } from './reactions/reaction-manager'

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
// Ability tasks
// ---------------------------------------------------------------------------

export interface ITask {
  execute(
    gs: GameState,
    ctx: AbilityContext,
    em: IGameEventEmitter,
    rm: ReactionManager,
  ): void
}

export interface IIfTask extends ITask {
  condition: (gs: GameState, ctx: AbilityContext) => boolean
  ifTrue: ITask[]
  ifFalse?: ITask[]
}

export interface IAbility {
  trigger: GameEventType
  steps: ITask[]
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
