import { ActionType, GameEventType, IGameEvent, RollResult } from 'shared'
import type { GameState } from './game-state'
import type { AbilityContext } from './ability-context'
import type { Player } from './player'

export interface IAction {
  getId(): string
  getType(): ActionType
  getPlayerId(): string
  getCost(): number
  canExecute(gs: GameState): boolean
  execute(gs: GameState): IGameEvent[]
}

export interface IChallengeable {
  isChallengeable(): boolean
}

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

export interface IWinCondition {
  check(gs: GameState): Player | null
}

export interface IRollResolver {
  resolve(finalRoll: number): RollResult
}
