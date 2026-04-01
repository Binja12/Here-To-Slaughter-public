import {
  CardBase,
  CardType,
  HeroClass,
  RollResult,
  ActionType,
  GameEventType,
} from 'shared'
import { GameState } from './game-state'
import { Player } from '../player'

export interface IWinCondition {
  check(gs: GameState): Player | null
}

export interface IRollResolver {
  resolve(finalRoll: number): RollResult
}

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
  getTargetPlayerId(): string | undefined
}

export interface IGameEvent {
  getType(): GameEventType
  getPlayerId(): string
  getPayload(): unknown
}
