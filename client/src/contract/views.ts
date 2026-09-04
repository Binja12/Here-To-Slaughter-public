import {
  GamePhase,
  PassiveType,
  ReactionWindowType,
} from './enums'
import {
  ChallengeCardData,
  HeroCardData,
  ItemCardData,
  MagicCardData,
  ModifierCardData,
  MonsterCardData,
  PartyLeaderData,
} from './types'

export type CardView =
  | HeroCardData
  | ItemCardData
  | MagicCardData
  | ModifierCardData
  | ChallengeCardData
  | MonsterCardData
  | PartyLeaderData

export type HeroInPlayView = {
  card: CardView
  equippedItem?: CardView
  canRollOn: boolean
}

export type EffectView = {
  id: string
  sourceCardId: string
  type: PassiveType
  value?: number
  cardId?: string
  rollContext?: string
  cardTypes?: string[]
}

export type PartyView = {
  playerId: string
  leader: CardView
  heroes: HeroInPlayView[]
  monsters: CardView[]
  instanceCards: CardView[]
  canRollOnLeader: boolean
}

export type SeatView = {
  playerId: string
  name: string
  seat: number
  isCurrentTurn: boolean
  actionPoints: number
  handCount: number
  effects: EffectView[]
}

export type PendingWindowView = {
  windowId: string
  type: ReactionWindowType
  respondentId: string
  cardId?: string
  options?: unknown[]
  detail?: Record<string, unknown>
  deadline: number
  isYours: boolean
}

export type PlayerView = {
  gameId: string
  playerId: string
  seats: SeatView[]
  currentPlayerId?: string
  phase: GamePhase
  /** Present once `phase` is `Concluded`: the seat that won. */
  winnerId?: string
  hand: CardView[]
  parties: PartyView[]
  mainDeck: { count: number }
  monsterDeck: { count: number }
  discardPile: CardView[]
  monsterRow: CardView[]
  attackableMonsterIds: string[]
  /** cards the engine is showing you right now, for its reveal clock (5 s) */
  revealedCards: CardView[]
  pendingWindows: PendingWindowView[]
  busy: boolean
}

export type GameSnapshot = {
  gameId: string
  version: number
  state: PlayerView
}
