// Client-side mirrors of the server DTOs in server/src/runtime/runtime.types.ts.
// Kept as plain types (no `shared` import) because CRA cannot compile modules
// outside client/src without ejecting.

export type CardType =
  | 'Hero'
  | 'Item'
  | 'Magic'
  | 'Modifier'
  | 'Challenge'
  | 'Monster'
  | 'Leader'

export type CardData = {
  id: string
  name: string
  type: CardType
  image: string
  description: string
  set: string
  // Hero / Leader
  heroClass?: string
  rollReq?: number
  // Monster
  higherReq?: number
  lowerReq?: number
  rollCompareMode?: 'HighToWin' | 'LowToWin'
  partyReq?: { classes: string[] }
  // Modifier
  values?: number[]
  // Item
  cursed?: boolean
}

export type ActionType =
  | 'DrawCard'
  | 'RollOnHero'
  | 'PlayHero'
  | 'PlayItem'
  | 'PlayMagic'
  | 'AttackMonster'

export type ActionDto = {
  type: ActionType
  cardId?: string
  targetHeroId?: string
  /** Dev-only seat override until sockets carry identity — defaults to p1. */
  playerId?: string
}

export type ModifierReactionDto = {
  cardId: string
  value: number
}

export type GameEventDto = {
  type: string
  playerId: string
  payload?: Record<string, unknown>
}

export type ModifierWindowDto = {
  rollerId: string
  baseRoll: number
  rollReq?: number
  heroId?: string
  finalRoll: number
  openedAt: number
  timeoutMs: number
}

export type PlayerDto = {
  id: string
  name: string
  actionPoints: number
  actionPointsPerTurn: number
  hand: string[]
}

export type PartyDto = {
  playerId: string
  leaderId: string
  heroIds: string[]
  monsterIds: string[]
  equipped: Record<string, string>
}

export type GameSnapshot = {
  currentPlayerId?: string
  players: PlayerDto[]
  parties: PartyDto[]
  monsterPile: string[]
  monsterDeckSize: number
  mainDeckSize: number
  discardPile: string[]
  abilitiesUsedThisTurn: string[]
  modifierWindow: ModifierWindowDto | null
}

export const SOLO_PLAYER_ID = 'p1'
