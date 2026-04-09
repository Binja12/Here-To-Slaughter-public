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
  canExecute(gs: GameState): boolean
  execute(gs: GameState): void
}

export interface IReaction {
  getId(): string
  getType(): ReactionType
  getPlayerId(): string
  canExecute(gs: GameState): boolean
  execute(gs: GameState): void
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
}
