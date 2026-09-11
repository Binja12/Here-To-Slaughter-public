import { Inject, Injectable } from '@nestjs/common'
import type { Pool } from 'pg'
import type { GameFlush, IGameStore, StoredGame } from '../game-server/game.store'
import { PG_POOL } from './database.module'

// ---------------------------------------------------------------------------
// The game tables of schema.ts. A flush is one transaction: the burst's
// events and lines appended, the board replaced. Flushes are fired without
// waiting for one another, so the board update is guarded by version — an
// older flush that lands late appends its records and leaves the newer
// board alone — and the appends ignore a seq already there, which is what
// a retried flush would produce.
// ---------------------------------------------------------------------------

@Injectable()
export class PostgresGameStore implements IGameStore {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async create(game: StoredGame): Promise<void> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        `INSERT INTO games (id, created_at, settings, config)
         VALUES ($1, $2, $3, $4)`,
        [
          game.gameId,
          game.createdAt,
          JSON.stringify(game.settings),
          JSON.stringify(game.config),
        ],
      )
      await client.query(
        `INSERT INTO game_players (game_id, account_id, username, seat)
         SELECT $1, s->>'accountId', s->>'username', (s->>'seat')::int
         FROM jsonb_array_elements($2::jsonb) AS s`,
        [game.gameId, JSON.stringify(game.seats)],
      )
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async flush(gameId: string, flush: GameFlush): Promise<void> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        `INSERT INTO game_events (game_id, seq, at, type, player_id, audience, payload)
         SELECT $1, (e->>'seq')::int, to_timestamp((e->>'at')::double precision / 1000),
                e->>'type', e->>'playerId', e->>'audience', e->'payload'
         FROM jsonb_array_elements($2::jsonb) AS e
         ON CONFLICT DO NOTHING`,
        [gameId, JSON.stringify(flush.events)],
      )
      await client.query(
        `INSERT INTO game_log (game_id, seq, at, player_id, text, seen)
         SELECT $1, (l->>'seq')::int, to_timestamp((l->>'at')::double precision / 1000),
                l->>'playerId', l->'line'->>'text', l->'line'->'seen'
         FROM jsonb_array_elements($2::jsonb) AS l
         ON CONFLICT DO NOTHING`,
        [gameId, JSON.stringify(flush.lines)],
      )
      await client.query(
        `UPDATE games
         SET last_version = $2, last_state = $3, updated_at = $4,
             ended_at = COALESCE(ended_at, $5), winner_id = COALESCE(winner_id, $6)
         WHERE id = $1 AND last_version < $2`,
        [
          gameId,
          flush.version,
          JSON.stringify(flush.views),
          flush.at,
          flush.winnerId === undefined ? null : flush.at,
          flush.winnerId ?? null,
        ],
      )
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
}
