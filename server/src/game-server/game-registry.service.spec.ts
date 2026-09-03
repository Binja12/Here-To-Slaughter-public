import { TurnPhase } from 'shared'
import { playerView } from '../game/views/player-view'
import { GameRegistryService } from './game-registry.service'

// Reads the table through `playerView` only — the same door a client has.

const ACCOUNTS = ['account-1', 'account-2', 'account-3']

describe('GameRegistryService', () => {
  let registry: GameRegistryService

  beforeEach(() => {
    registry = new GameRegistryService()
  })

  it('deals a table seating exactly the requested accounts', () => {
    const game = registry.create(ACCOUNTS, 'default')

    expect([...game.playerOrder].sort()).toEqual([...ACCOUNTS].sort())
    const view = playerView(game, 'account-1')
    expect(view.seats.map((seat) => seat.playerId).sort()).toEqual(
      [...ACCOUNTS].sort(),
    )
    // The default config's starting hand.
    expect(view.hand).toHaveLength(5)
  })

  it('holds the table under its game id', () => {
    const game = registry.create(ACCOUNTS, 'default')

    expect(registry.get(game.gameId)).toBe(game)
    expect(registry.get('no-such-game')).toBeUndefined()
  })

  it('does not start the game: the first turn waits for the seats', () => {
    const view = playerView(registry.create(ACCOUNTS, 'default'), 'account-1')

    expect(view.currentPlayerId).toBeUndefined()
    expect(view.turnPhase).toBe(TurnPhase.TurnStart)
  })

  it('gives every table its own id', () => {
    const first = registry.create(ACCOUNTS, 'default')
    const second = registry.create(['account-4', 'account-5'], 'default')

    expect(first.gameId).not.toBe(second.gameId)
    expect(registry.get(second.gameId)).toBe(second)
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
