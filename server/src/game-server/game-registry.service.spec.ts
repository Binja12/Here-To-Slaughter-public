import { GamePhase } from 'shared'
import type { Server } from 'socket.io'
import { playerView } from '../game/views/player-view'
import { GameRegistryService } from './game-registry.service'
import type { RunningGame } from './game-registry.service'
import { SnapshotPublisherService } from './snapshot-publisher.service'

// Reads the table through `playerView` only — the same door a client has.
// The publisher is real but pushes into the void: what it pushes is its own
// spec's question, and a started table here would otherwise flush into an
// unbound server.

const ACCOUNTS = ['account-1', 'account-2', 'account-3']

const NOWHERE = {
  to: () => ({ emit: () => true }),
} as unknown as Server

describe('GameRegistryService', () => {
  let registry: GameRegistryService

  beforeEach(() => {
    const publisher = new SnapshotPublisherService()
    publisher.bind(NOWHERE)
    registry = new GameRegistryService(publisher)
  })

  const phaseOf = (running: RunningGame) =>
    playerView(running.game, running.game.playerOrder[0]).phase

  it('deals a table seating exactly the requested accounts', () => {
    const { game } = registry.create(ACCOUNTS, 'default')

    expect([...game.playerOrder].sort()).toEqual([...ACCOUNTS].sort())
    const view = playerView(game, 'account-1')
    expect(view.seats.map((seat) => seat.playerId).sort()).toEqual(
      [...ACCOUNTS].sort(),
    )
    // The default config's starting hand.
    expect(view.hand).toHaveLength(5)
  })

  it('holds the table under its game id', () => {
    const running = registry.create(ACCOUNTS, 'default')

    expect(registry.get(running.game.gameId)).toBe(running)
    expect(registry.get('no-such-game')).toBeUndefined()
  })

  it('finds a table by any account seated at it, and nothing for a stranger', () => {
    const running = registry.create(ACCOUNTS, 'default')

    for (const accountId of ACCOUNTS) {
      expect(registry.findByAccount(accountId)).toBe(running)
    }
    expect(registry.findByAccount('account-9')).toBeUndefined()
  })

  it('does not start the game: the first turn waits for the seats', () => {
    const { game } = registry.create(ACCOUNTS, 'default')
    const view = playerView(game, 'account-1')

    expect(view.currentPlayerId).toBeUndefined()
    expect(view.phase).toBe(GamePhase.Setup)
  })

  it('starts every table at version 0', () => {
    expect(registry.create(ACCOUNTS, 'default').version).toBe(0)
  })

  describe('arriving', () => {
    it('holds the table in Setup until every seat has arrived, then starts it once', () => {
      const running = registry.create(ACCOUNTS, 'default')

      expect(registry.arrive(running, 'account-1')).toBe(false)
      expect(registry.arrive(running, 'account-2')).toBe(false)
      expect(phaseOf(running)).toBe(GamePhase.Setup)

      expect(registry.arrive(running, 'account-3')).toBe(true)
      expect(phaseOf(running)).toBe(GamePhase.Turns)
      expect(
        playerView(running.game, 'account-1').currentPlayerId,
      ).toBeDefined()
    })

    it('counts a seat that arrived and left: the table does not wait for it twice', () => {
      const running = registry.create(ACCOUNTS, 'default')

      registry.arrive(running, 'account-1')
      registry.arrive(running, 'account-1')
      registry.arrive(running, 'account-2')
      expect(phaseOf(running)).toBe(GamePhase.Setup)

      expect(registry.arrive(running, 'account-3')).toBe(true)
    })

    it('treats an arrival at a live table as a reconnect, not a second start', () => {
      const running = registry.create(ACCOUNTS, 'default')
      for (const accountId of ACCOUNTS) registry.arrive(running, accountId)
      const active = playerView(running.game, 'account-1').currentPlayerId

      expect(registry.arrive(running, 'account-2')).toBe(false)
      expect(playerView(running.game, 'account-1').currentPlayerId).toBe(active)
    })
  })

  it('gives every table its own id, and each account finds only its own', () => {
    const first = registry.create(ACCOUNTS, 'default')
    const second = registry.create(['account-4', 'account-5'], 'default')

    expect(first.game.gameId).not.toBe(second.game.gameId)
    expect(registry.get(second.game.gameId)).toBe(second)
    expect(registry.findByAccount('account-4')).toBe(second)
    expect(registry.findByAccount('account-1')).toBe(first)
  })

  it('refuses a table the config cannot seat, as the engine refuses it', () => {
    expect(() => registry.create(['account-1'], 'default')).toThrow(
      /seats 2 to 4/,
    )
    expect(() =>
      registry.create(['account-1', 'account-1'], 'default'),
    ).toThrow(/seated twice/)
  })
})
