import { ActionType, CardBase, GameEventType } from 'shared'

// ---------------------------------------------------------------------------
// DTOs exchanged with the client. Mirrored in client/src/types.ts — keep in sync.
// ---------------------------------------------------------------------------

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
  type: GameEventType
  playerId: string
  payload: unknown
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
  /** heroId -> equipped itemId */
  equipped: Record<string, string>
}

export type GameSnapshotDto = {
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

export type CatalogDto = CardBase[]
