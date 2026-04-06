import {
  ActionType,
  GameEventType,
  IGameEvent,
  ReactionWindowType,
  RollResult,
} from 'shared'
import type { GameState } from './game-state'
import type { AbilityContext } from './ability-context'
import type { Player } from './player'

// ---------------------------------------------------------------------------
// Turn actions
// ---------------------------------------------------------------------------

export interface IAction {
  getId(): string
  getType(): ActionType
  getPlayerId(): string
  getCost(): number
  canExecute(gs: GameState): boolean
  execute(gs: GameState): IGameEvent[]
  isChallengeable(): boolean
}

export interface IReactionAction {
  getId(): string
  getType(): ActionType
  getPlayerId(): string
  canExecute(gs: GameState): boolean
  execute(gs: GameState): IGameEvent[]
}

// ---------------------------------------------------------------------------
// Ability tasks
// ---------------------------------------------------------------------------

export interface ITask {
  execute(gs: GameState, ctx: AbilityContext): IGameEvent[]
}

export interface IIfTask extends ITask {
  condition: (gs: GameState, ctx: AbilityContext) => boolean
  ifTrue: ITask[]
  ifFalse?: ITask[]
}

export interface IAbility {
  steps: ITask[]
}

export interface IPassive {
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
  /** True until the timer fires or resolve() is called explicitly. */
  isOpen(): boolean
  /** Route a player's reaction payload into the window. */
  submitReaction(playerId: string, payload: unknown): void
  /** Force immediate resolution (e.g. timeout, test helpers). */
  resolve(): void
}
