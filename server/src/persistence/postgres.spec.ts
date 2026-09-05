import { Pool } from 'pg'
import { Audience, DEFAULT_GAME_SETTINGS, GameEventType } from 'shared'
import type { PlayerView } from 'shared'
import { defaultGameConfig } from '../game/config/game-config'
import type { GameFlush, StoredGame } from '../game-server/game.store'
import { loadStores } from '../stores/spec-helpers'
import { PostgresGameStore } from './postgres-game.store'
import { PostgresUserRepository } from './postgres-user.repository'
import { ensureSchema } from './schema'

// ---------------------------------------------------------------------------
// Against a real database, so the SQL is what is tested. Runs only when
// HTSR_TEST_DATABASE_URL names one (docs/DATABASE_AND_LOGS.md has the
// one-line Docker command); the ordinary suite needs no database.
// ---------------------------------------------------------------------------

const url = process.env.HTSR_TEST_DATABASE_URL
const withDatabase = url ? describe : describe.skip

const account = (id: string, username: string) => ({
  id,
  username,
  passwordHash: 'argon2id-hash',
  createdAt: new Date('2026-09-05T10:00:00.000Z'),
})

const GAME: StoredGame = {
  gameId: 'pg-game-1',
  createdAt: new Date('2026-09-05T10:00:00.000Z'),
  seats: [
    { accountId: 'pg-alice', username: 'Alice', seat: 0 },
    { accountId: 'pg-bob', username: 'Bob', seat: 1 },
  ],
  settings: DEFAULT_GAME_SETTINGS,
  config: defaultGameConfig,
}

const view = (winnerId?: string) =>
  ({ gameId: GAME.gameId, playerId: 'pg-alice', winnerId }) as unknown as PlayerView

const flush = (version: number, overrides: Partial<GameFlush> = {}): GameFlush => ({
  version,
  at: new Date(1_757_000_000_000 + version * 1000),
  events: [
    {
      seq: version,
      at: 1_757_000_000_000 + version,
      type: GameEventType.TurnStarted,
      playerId: 'pg-alice',
      audience: Audience.All,
      payload: { playerId: 'pg-alice' },
    },
  ],
  lines: [
    {
      seq: version,
      at: 1_757_000_000_000 + version,
      playerId: 'pg-alice',
      line: { text: `line ${version}`, seen: { by: ['pg-alice'], text: `secret ${version}` } },
    },
  ],
  views: { 'pg-alice': view(), 'pg-bob': view() },
  ...overrides,
})

withDatabase('Postgres adapters', () => {
  let pool: Pool

  beforeAll(async () => {
    pool = new Pool({ connectionString: url })
    await ensureSchema(pool)
    await pool.query('TRUNCATE users, games CASCADE')
  })

  afterAll(async () => {
    await pool.end()
  })

  it('applies the schema twice without complaint', async () => {
    await expect(ensureSchema(pool)).resolves.toBeUndefined()
  })

  describe('PostgresUserRepository', () => {
    it('stores an account and finds it by id and by username', async () => {
      const users = new PostgresUserRepository(pool)
      const alice = account('pg-user-1', 'pg-alice')

      await users.create(alice)

      await expect(users.findById(alice.id)).resolves.toEqual(alice)
      await expect(users.findByUsername(alice.username)).resolves.toEqual(alice)
      await expect(users.findByUsername('nobody')).resolves.toBeUndefined()
    })

    it('refuses a duplicate id and a duplicate username by the auth errors', async () => {
      const users = new PostgresUserRepository(pool)
      const bob = account('pg-user-2', 'pg-bob')
      await users.create(bob)

      await expect(users.create(bob)).rejects.toThrow('Account id already exists')
      await expect(users.create({ ...bob, id: 'pg-user-3' })).rejects.toThrow(
        'Username already exists',
      )
    })
  })

  describe('PostgresGameStore', () => {
    it('stores a deal, appends every flush and keeps the newest board', async () => {
      const store = new PostgresGameStore(pool)
      await store.create(GAME)
      await store.flush(GAME.gameId, flush(1))
      await store.flush(GAME.gameId, flush(3, { views: { 'pg-alice': view('pg-alice') }, winnerId: 'pg-alice' }))
      // An older flush landing late, and a retry of one already stored.
      await store.flush(GAME.gameId, flush(2))
      await store.flush(GAME.gameId, flush(2))

      const game = await pool.query(
        'SELECT last_version, last_state, winner_id, ended_at, settings FROM games WHERE id = $1',
        [GAME.gameId],
      )
      expect(game.rows[0].last_version).toBe(3)
      expect(game.rows[0].last_state['pg-alice'].winnerId).toBe('pg-alice')
      expect(game.rows[0].winner_id).toBe('pg-alice')
      expect(game.rows[0].ended_at).toBeInstanceOf(Date)
      expect(game.rows[0].settings).toEqual(DEFAULT_GAME_SETTINGS)

      const events = await pool.query(
        'SELECT seq, type, player_id, audience, payload FROM game_events WHERE game_id = $1 ORDER BY seq',
        [GAME.gameId],
      )
      expect(events.rows.map((r) => r.seq)).toEqual([1, 2, 3])
      expect(events.rows[0]).toMatchObject({
        type: GameEventType.TurnStarted,
        player_id: 'pg-alice',
        audience: Audience.All,
        payload: { playerId: 'pg-alice' },
      })

      const lines = await pool.query(
        'SELECT seq, text, seen FROM game_log WHERE game_id = $1 ORDER BY seq',
        [GAME.gameId],
      )
      expect(lines.rows.map((r) => r.text)).toEqual(['line 1', 'line 2', 'line 3'])
      expect(lines.rows[0].seen).toEqual({ by: ['pg-alice'], text: 'secret 1' })
    })

    it("answers a player's game history from the seats", async () => {
      const history = await pool.query(
        'SELECT game_id, seat FROM game_players WHERE account_id = $1',
        ['pg-bob'],
      )
      expect(history.rows).toEqual([{ game_id: GAME.gameId, seat: 1 }])
    })

    it('refuses a second deal of the same id', async () => {
      const store = new PostgresGameStore(pool)
      await expect(store.create(GAME)).rejects.toThrow()
      const players = await pool.query('SELECT count(*)::int AS n FROM game_players WHERE game_id = $1', [
        GAME.gameId,
      ])
      expect(players.rows[0].n).toBe(2)
    })
  })

  it('StoresModule serves the Postgres adapters under DATABASE_URL', async () => {
    await expect(loadStores(url)).resolves.toMatchObject({
      users: 'PostgresUserRepository',
      games: 'PostgresGameStore',
      sessions: 'InMemorySessionStore',
    })
  })
})
