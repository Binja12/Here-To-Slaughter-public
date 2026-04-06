import {
  CardType,
  RollResult,
  ActionType,
  GameEventType,
  ReactionWindowType,
  Audience,
} from 'shared'
import { GameState } from '../states/game-state'
import { Player } from '../../player'
import { AbilityContext } from '../../ability-context'

// ── Win / Roll ──────────────────────────────────────────────────────────────

export interface IWinCondition {
  check(gs: GameState): Player | null
}

export interface IRollResolver {
  resolve(finalRoll: number): RollResult
}

// ── Actions ─────────────────────────────────────────────────────────────────

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

// ── Events ──────────────────────────────────────────────────────────────────

export interface IGameEvent {
  getType(): GameEventType
  getPlayerId(): string
  getPayload(): unknown
  //getAudience(): Audience
}

export interface IGameEventListener {
  onEvent(event: IGameEvent): void
}

export interface IGameEventEmitter {
  emit(event: IGameEvent): void
  addListener(listener: IGameEventListener): void
  removeListener(listener: IGameEventListener): void
}

// ── Reaction windows ─────────────────────────────────────────────────────────

export interface IReactionWindow {
  getType(): ReactionWindowType
  isResolved(): boolean
  resolve(gs: GameState): void
  getTimeoutMs(): number
  getLastActivityAt(): number
  addResponse(playerId: string, cardId: string): void
}

export interface IModifierWindow extends IReactionWindow {
  applyModifier(value: number): void
  getFinalRoll(): number
  getRolls(): number[]
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

// ── Ability system ───────────────────────────────────────────────────────────

export interface ITask {
  execute(gs: GameState, ctx: AbilityContext): IAction[]
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
