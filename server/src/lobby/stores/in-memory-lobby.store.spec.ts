import {
  DEFAULT_LOBBY_CAPACITY,
  InMemoryLobbyStore,
} from './in-memory-lobby.store'

describe('InMemoryLobbyStore', () => {
  it('preserves ready order and treats the first player as the host', async () => {
    const store = new InMemoryLobbyStore()
    await store.addReadyPlayer({ accountId: 'account-1', username: 'one' })
    await store.addReadyPlayer({ accountId: 'account-2', username: 'two' })

    const players = await store.getReadyPlayers()

    expect(players.map((player) => player.accountId)).toEqual([
      'account-1',
      'account-2',
    ])
  })

  it('is idempotent when the same account becomes ready again', async () => {
    const store = new InMemoryLobbyStore()
    const player = { accountId: 'account-1', username: 'one' }

    await store.addReadyPlayer(player)
    await store.addReadyPlayer(player)

    await expect(store.getReadyPlayers()).resolves.toHaveLength(1)
  })

  it('enforces the four-player capacity', async () => {
    const store = new InMemoryLobbyStore()
    for (let index = 1; index <= DEFAULT_LOBBY_CAPACITY; index += 1) {
      await store.addReadyPlayer({
        accountId: `account-${index}`,
        username: `player-${index}`,
      })
    }

    await expect(
      store.addReadyPlayer({ accountId: 'account-5', username: 'player-5' }),
    ).rejects.toThrow('Lobby is full')
  })

  it('removes one player or a selected game group without reordering others', async () => {
    const store = new InMemoryLobbyStore()
    for (let index = 1; index <= 4; index += 1) {
      await store.addReadyPlayer({
        accountId: `account-${index}`,
        username: `player-${index}`,
      })
    }

    await expect(store.removeReadyPlayer('account-2')).resolves.toBe(true)
    await expect(
      store.removeReadyPlayers(['account-1', 'account-4']),
    ).resolves.toBe(2)
    await expect(store.getReadyPlayers()).resolves.toEqual([
      { accountId: 'account-3', username: 'player-3' },
    ])
  })
})
