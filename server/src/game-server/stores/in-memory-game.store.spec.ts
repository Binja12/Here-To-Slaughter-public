import { DEFAULT_GAME_SETTINGS, GameEventType, Audience } from 'shared'
import type { PlayerView } from 'shared'
import { defaultGameConfig } from '../../game/config/game-config'
import { InMemoryGameStore } from './in-memory-game.store'
import type { GameFlush, StoredGame } from '../game.store'

const GAME: StoredGame = {
  gameId: 'game-1',
  createdAt: new Date('2026-09-05T00:00:00.000Z'),
  seats: [
    { accountId: 'alice', username: 'Alice', seat: 0 },
    { accountId: 'bob', username: 'Bob', seat: 1 },
  ],
  settings: DEFAULT_GAME_SETTINGS,
  config: defaultGameConfig,
}

const view = (winnerId?: string) =>
  ({ gameId: 'game-1', playerId: 'alice', winnerId }) as unknown as PlayerView

const flush = (version: number, overrides: Partial<GameFlush> = {}): GameFlush => ({
  version,
  at: new Date(),
  events: [
    {
      seq: version,
      at: 1,
      type: GameEventType.TurnStarted,
      playerId: 'alice',
      audience: Audience.All,
      payload: { playerId: 'alice' },
    },
  ],
  lines: [{ seq: version, at: 1, playerId: 'alice', line: { text: `line ${version}` } }],
  views: { alice: view(), bob: view() },
  ...overrides,
})

describe('InMemoryGameStore', () => {
  it('remembers a dealt table and appends what every flush brings', async () => {
    const store = new InMemoryGameStore()
    await store.create(GAME)
    await store.flush('game-1', flush(1))
    await store.flush('game-1', flush(2))

    const remembered = store.get('game-1')!
    expect(remembered.game).toEqual(GAME)
    expect(remembered.version).toBe(2)
    expect(remembered.events.map((e) => e.seq)).toEqual([1, 2])
    expect(remembered.lines.map((l) => l.line.text)).toEqual(['line 1', 'line 2'])
    expect(remembered.winnerId).toBeUndefined()
  })

  it('keeps the newest board when an older flush lands late, and the winner once told', async () => {
    const store = new InMemoryGameStore()
    await store.create(GAME)
    await store.flush('game-1', flush(2, { views: { alice: view('alice') }, winnerId: 'alice' }))
    await store.flush('game-1', flush(1))

    const remembered = store.get('game-1')!
    expect(remembered.version).toBe(2)
    expect(remembered.views.alice.winnerId).toBe('alice')
    expect(remembered.winnerId).toBe('alice')
    expect(remembered.events).toHaveLength(2)
  })

  it('refuses a second deal of the same id and a flush for a table never dealt', async () => {
    const store = new InMemoryGameStore()
    await store.create(GAME)

    await expect(store.create(GAME)).rejects.toThrow('Game already stored: game-1')
    await expect(store.flush('game-2', flush(1))).rejects.toThrow(
      'Flush for a game never stored: game-2',
    )
  })
})
