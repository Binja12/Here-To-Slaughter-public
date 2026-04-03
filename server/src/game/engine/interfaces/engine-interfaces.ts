import {
  CardBase,
  CardType,
  HeroClass,
  RollResult,
  ActionType,
  GameEventType,
  ReactionWindowType,
} from 'shared'
import { GameState } from '../states/game-state'
import { Player } from '../../player'

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
  isChallengeable(): string | null // returns cardId if flag=true, null if flag=false
  setChallengeable(value: boolean): void // sets the flag
  canExecute(gs: GameState): boolean
  execute(gs: GameState): IGameEvent[]
}

// export interface IChallengeable {
//   isChallengeable(): boolean
//   getTargetPlayerId(): string | undefined
// }

export interface IGameEvent {
  getType(): GameEventType
  getPlayerId(): string
  getPayload(): unknown
}

export interface IReactionWindow {
  getType(): ReactionWindowType
  isResolved(): boolean
  resolve(newerGs: GameState): void
  getTimeoutMs(): number
  getLastActivityAt(): number
  addResponse(playerId: string, cardId: string): void // ← no response type
}

export interface IModifierWindow {
  applyModifier(value: number): void
  getFinalRoll(): number
  getRolls(): number[] // [challengerRoll, challengedRoll]
  getUsedCardIds(): string[]
  addUsedCard(cardId: string): void
}

export interface IChallengeWindow extends IReactionWindow {
  getChallengerId(): string
  getChallengedId(): string
  getModifierWindow(): IModifierWindow
  didChallengerWin(): boolean
  applyModifier(value: number, cardId: string): void
}

export enum ChallengeResult {
  NoChallengeOrWon = 'NoChallengeOrWon',
  ChallengerWon = 'ChallengerWon',
}
