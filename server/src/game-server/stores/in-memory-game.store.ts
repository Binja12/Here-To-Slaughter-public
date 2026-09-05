import { Injectable } from '@nestjs/common'
import type { PlayerView } from 'shared'
import type { EventRecord, LogRecord } from '../../game/views/game-log'
import type { GameFlush, IGameStore, StoredGame } from '../game.store'

export type RememberedGame = {
  game: StoredGame
  version: number
  views: Record<string, PlayerView>
  events: EventRecord[]
  lines: LogRecord[]
  winnerId?: string
}

@Injectable()
export class InMemoryGameStore implements IGameStore {
  private readonly games = new Map<string, RememberedGame>()

  async create(game: StoredGame): Promise<void> {
    if (this.games.has(game.gameId)) {
      throw new Error(`Game already stored: ${game.gameId}`)
    }
    this.games.set(game.gameId, {
      game: structuredClone(game),
      version: 0,
      views: {},
      events: [],
      lines: [],
    })
  }

  async flush(gameId: string, flush: GameFlush): Promise<void> {
    const remembered = this.games.get(gameId)
    if (!remembered) throw new Error(`Flush for a game never stored: ${gameId}`)

    remembered.events.push(...structuredClone(flush.events))
    remembered.lines.push(...structuredClone(flush.lines))
    // Flushes may land out of order; the board keeps its newest.
    if (flush.version > remembered.version) {
      remembered.version = flush.version
      remembered.views = structuredClone(flush.views)
    }
    if (flush.winnerId !== undefined) remembered.winnerId = flush.winnerId
  }

  get(gameId: string): RememberedGame | undefined {
    const remembered = this.games.get(gameId)
    return remembered ? structuredClone(remembered) : undefined
  }
}
