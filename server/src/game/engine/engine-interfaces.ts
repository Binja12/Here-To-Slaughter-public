import {
  CardBase,
  CardType,
  HeroClass,
  RollResult,
  ActionType,
  GameEventType,
  ReactionWindowType,
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
  isChallengeable(): string | null // returns cardId if challengeable, null if not
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
  resolve(): void
  getTimeoutMs(): number
  getLastActivityAt(): number
  addResponse(playerId: string, cardId: string): void // ← no response type
}

export interface IModifierWindow extends IReactionWindow {
  getPlayerId(): string
  getRoll(): number
  applyModifier(value: number): void
  getFinalRoll(): number
}

export interface IChallengeWindow extends IReactionWindow {
  getChallengerId(): string
  getChallengedId(): string
  getChallengerWindow(): IModifierWindow
  getChallengedWindow(): IModifierWindow
  didChallengerWin(): boolean
  startResolution(): void // rolls dice, creates modifier windows
}

export enum ChallengeResult {
  NoChallengeOrWon = 'NoChallengeOrWon',
  ChallengerWon = 'ChallengerWon',
}
