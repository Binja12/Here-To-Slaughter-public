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
  /** the options that are cards, as printed data — respondent only */
  optionCards?: CardView[]
  detail?: Record<string, unknown>
  deadline: number
  isYours: boolean
}

/**
 * The ACTIVE seat's turn clock — one clock for the table, watched by every
 * screen. Held rather than dropped while a reaction window is open, anyone's,
 * so the board draws a still clock instead of losing it.
 */
export type TurnClockView = {
  /** the whole turn's budget, ms — what the two below are a fraction of */
  turnTimeMs: number
  /**
   * when the turn lapses, epoch ms. An INSTANT, not a countdown: every
   * snapshot of one running turn carries the same number, so a screen ticks
   * between them on its own. Absent exactly while the clock is held.
   */
  deadline?: number
  /** what a HELD clock has left, ms. Present exactly while it is held. */
  heldMs?: number
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
  /** the active seat's clock; absent on a table played without one */
  turnClock?: TurnClockView
  busy: boolean
}

export type GameSnapshot = {
  gameId: string
  version: number
  state: PlayerView
}
