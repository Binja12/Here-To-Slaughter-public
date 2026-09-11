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
  requireAllWinConditions: boolean;
  winConditions: { type: string; value: number }[];
};

/**
 * The last choice on this table that ran out of time. A lapse is otherwise
 * invisible — the window is simply gone from the next snapshot — so a pick
 * made AT RANDOM on somebody's behalf, or an offer nobody took, is reported
 * here for the screen to say out loud. Kept until the next one replaces it;
 * the client shows each `windowId` once.
 */
export type ChoiceLapseView = {
  windowId: string
  /** the seat that was asked */
  respondentId: string
  type: ReactionWindowType
  /** `random`: the engine drew one of the options. `forfeited`: nothing was chosen. */
  resolution: 'random' | 'forfeited'
  /** what the window was asking, when its task declared a question */
  question?: string
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
  /** every card on the table whose rule works with nobody playing anything — the pink aura */
  passiveCardIds: string[]
  /** cards the engine is showing you right now, for its reveal clock (5 s) */
  revealedCards: CardView[]
  /** the seat whose ability is showing them */
  revealedBy?: string
  /** the seat the cards belong to — a look at somebody's hand */
  revealedOf?: string
  /** the last choice that ran out of time — see ChoiceLapseView */
  lastLapse?: ChoiceLapseView
  pendingWindows: PendingWindowView[]
  /** absent on a table played without a clock */
  turnClock?: TurnClockView
  /** mid-resolution: a window is open or an ability still has steps, so no action will be accepted */
  busy: boolean
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
