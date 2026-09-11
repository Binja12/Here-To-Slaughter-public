import type { GameConfig, GameSettings, PlayerView } from 'shared'
import type { EventRecord, LogRecord } from '../game/views/game-log'

export const GAME_STORE = Symbol('IGameStore')

/** A dealt table: who sits where and what it was built from. */
export type StoredGame = {
  gameId: string
  createdAt: Date
  seats: { accountId: string; username: string; seat: number }[]
  settings: GameSettings
  config: GameConfig
}

/**
 * What one publisher flush leaves behind: the burst's records and the board
 * as every seat now sees it, keyed by account id. `winnerId` rides the flush
 * that concluded the table.
 */
export type GameFlush = {
  version: number
  at: Date
  events: EventRecord[]
  lines: LogRecord[]
  views: Record<string, PlayerView>
  winnerId?: string
}

/**
 * The game process's memory of its tables. Written by the registry (a table
 * dealt) and the publisher (every flush); a player's game history is the
 * seats table read by account. Rejections are the caller's to log — a store
 * outage never stops a table.
 */
export interface IGameStore {
  create(game: StoredGame): Promise<void>
  flush(gameId: string, flush: GameFlush): Promise<void>
}
