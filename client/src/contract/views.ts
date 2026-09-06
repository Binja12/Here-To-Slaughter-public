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
  /** Window-owned policies projected for this viewer. */
  optional?: boolean;
  canPass?: boolean;
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

/** the active seat's turn clock, one for the table; exactly one of deadline / heldMs is present */
export type TurnClockView = {
  turnTimeMs: number
  /** epoch ms of the lapse while the clock runs; fixed per running stretch, so the screen ticks between snapshots */
  deadline?: number
  /** ms left while a reaction window holds the clock */
  heldMs?: number
}

export type GameConfigView = {
  actionPointsPerTurn: number;
  cardSets: string[];
  turnTimeMs?: number;
  reactionTimeMs: number;
  seamlessReactions: boolean;
  requireAllWinConditions: boolean;
  winConditions: { type: string; value: number }[];
};

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
  /** absent on a table played without a clock */
  turnClock?: TurnClockView
  busy: boolean
  /** Whether an action from the viewer would be taken now, turn permitting. */
  acceptsActions: boolean
}

/** One line of the table's story, worded for this seat by the server. */
export type GameLogEntry = {
  sound?: 'heroPlayed' | 'modifierPlayed' | 'monsterSlain'
  soundWindowId?: string
  seq: number
  at: number
  playerId: string
  text: string
}

export type GameSnapshot = {
  gameId: string
  version: number
  state: PlayerView
  /** Whole, like `state`; newest last. */
  log: GameLogEntry[]
}

export type GameConnectionInfo = {
  gameId: string;
  config: GameConfigView;
};
