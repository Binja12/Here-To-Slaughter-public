import { DEFAULT_GAME_SETTINGS } from '../contract'
import { FakeLobbyPort } from './FakeLobbyPort'

test('fake lobby supports the offline auth and ready flow', async () => {
  const port = new FakeLobbyPort()
  await expect(port.getLobby()).rejects.toMatchObject({ reason: 'Unauthorized' })

  await port.login({ username: 'Ada', password: 'secret' })
  const lobby = await port.getLobby()
  expect(lobby.self).toMatchObject({ username: 'Ada', state: 'READY', isHost: true })
  expect(lobby.readyPlayers).toHaveLength(4)

  expect(await port.startGame()).toEqual({ gameId: 'fake-game', status: 'STARTING' })
})
test('closing seats unseats only the players sitting in them', async () => {
  const port = new FakeLobbyPort()
  await port.login({ username: 'Ada', password: 'secret' })
  const seated = (await port.getLobby()).readyPlayers.map((p) => p.username)
  expect(seated).toHaveLength(4)

  const two = await port.updateSettings({
    ...DEFAULT_GAME_SETTINGS,
    playerCount: 2,
  })

  // The two front seats keep their players; the closed seats lose theirs.
  expect(two.readyPlayers.map((p) => p.username)).toEqual(seated.slice(0, 2))
  expect(two.self).toMatchObject({ state: 'READY', isHost: true })

  // Widening again unseats nobody.
  const four = await port.updateSettings({
    ...DEFAULT_GAME_SETTINGS,
    playerCount: 4,
  })
  expect(four.readyPlayers.map((p) => p.username)).toEqual(seated.slice(0, 2))
})
